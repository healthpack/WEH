import {checkSignal,isAbort} from './asyncRun.js';

// Each attempt is admitted independently. Fallbacks and retries return through
// the same scheduler that admitted the original request.
export function createTransport({scheduler,apiFetch,getKey,log=()=>{}}) {
  const failures=new Map();
  const normalize=data=>{if(Array.isArray(data)&&typeof data[0]==='string'){try{return JSON.parse(data[0]);}catch{}}return data;};
  return async (endpoint,payload,{signal,lane='user',forceOfficial=false}={})=>{
    const key=getKey().trim();let route=forceOfficial||((failures.get(endpoint)?.until||0)>Date.now()&&key)?'official':'gateway';
    while(true) {
      checkSignal(signal);
      try {
        const result=await scheduler.run(async()=>{
          checkSignal(signal);
          return {data:await apiFetch(endpoint,payload,key,route,signal),cached:false};
        },{lane,route,signal});
        if(route==='gateway')failures.delete(endpoint);
        return normalize(result.data);
      } catch(error) {
        checkSignal(signal);if(isAbort(error))throw error;
        if(/rate.?limit|status.?429/i.test(error.message)) {
          scheduler.cooldown(route,10000);log(route+' capacity cooldown; work remains queued.');continue;
        }
        if(route==='gateway'&&key&&!/invalid_type|unrecognized key|too_big/i.test(error.message)) {
          const count=(failures.get(endpoint)?.count||0)+1;
          failures.set(endpoint,{count,until:count>=2?Date.now()+120000:0});route='official';continue;
        }
        throw error;
      }
    }
  };
}
