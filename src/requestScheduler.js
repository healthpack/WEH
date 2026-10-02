import {checkSignal, ScanAborted} from './asyncRun.js';

const TURNS = ['breadth','breadth','breadth','breadth','breadth','depth','depth','depth','user','user'];

// One dispatcher for every live attempt, including proxy requests and route fallbacks.
// Waiting for capacity holds no network slot and is not a transport failure.
export class RequestScheduler {
  constructor({concurrency=8, now=()=>Date.now(), limits={gateway:3500,official:400}, windowMs=60000}={}) {
    Object.assign(this,{concurrency,now,limits,windowMs});
    this.queues={breadth:[],depth:[],user:[]};this.tokens={gateway:[],official:[]};
    this.cooldowns={gateway:0,official:0};this.active=0;this.turn=0;this.sequence=0;
    this.metrics={liveRequests:0,cacheHits:0,byLane:{breadth:0,depth:0,user:0},duplicatesAvoided:0};
  }
  run(task,{lane='user',route='gateway',signal}={}) {
    checkSignal(signal);
    return new Promise((resolve,reject)=>{
      const item={task,lane,route,signal,resolve,reject};
      item.abort=()=>{const q=this.queues[lane],i=q.indexOf(item);if(i>=0){q.splice(i,1);reject(new ScanAborted('request queue'));}};
      signal?.addEventListener('abort',item.abort,{once:true});
      this.queues[lane].push(item);this.pump();
    });
  }
  available(route) {
    const now=this.now();this.tokens[route]=this.tokens[route].filter(t=>now-t.time<this.windowMs);
    return this.cooldowns[route]<=now&&this.tokens[route].length<this.limits[route];
  }
  cooldown(route,ms=10000) {this.cooldowns[route]=Math.max(this.cooldowns[route],this.now()+ms);this.pump();}
  pump() {
    clearTimeout(this.timer);this.timer=null;
    while(this.active<this.concurrency) {
      let item;
      for(let i=0;i<TURNS.length;i++) {
        const lane=TURNS[this.turn++%TURNS.length],q=this.queues[lane];
        const at=q.findIndex(e=>this.available(e.route));
        if(at>=0){item=q.splice(at,1)[0];break;}
      }
      if(!item)break;
      item.signal?.removeEventListener('abort',item.abort);
      if(item.signal?.aborted){item.reject(new ScanAborted());continue;}
      const token={id:++this.sequence,time:this.now()};this.tokens[item.route].push(token);this.active++;
      this.metrics.liveRequests++;this.metrics.byLane[item.lane]++;
      Promise.resolve().then(()=>{checkSignal(item.signal);return item.task();}).then(result=>{
        if(result?.cached===true) {
          this.tokens[item.route]=this.tokens[item.route].filter(t=>t.id!==token.id);
          this.metrics.liveRequests--;this.metrics.byLane[item.lane]--;this.metrics.cacheHits++;
        }
        item.resolve(result);
      },item.reject).finally(()=>{this.active--;this.pump();});
    }
    if(Object.values(this.queues).some(q=>q.length))this.timer=setTimeout(()=>this.pump(),100);
  }
  status(){return {...this.metrics,byLane:{...this.metrics.byLane},queued:Object.values(this.queues).reduce((n,q)=>n+q.length,0),active:this.active};}
}
