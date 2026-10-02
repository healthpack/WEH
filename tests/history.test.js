import test from 'node:test';
import assert from 'node:assert/strict';
import {readHistory} from '../src/transactionHistory.js';
import {RequestScheduler} from '../src/requestScheduler.js';
import {createTransport} from '../src/apiTransport.js';
import {profileId,findProfiles,collectDive,EXAMPLE_PROFILE,createClient} from '../src/warera.js';
import {deepDiveEventFor} from '../src/analysisCore.js';

const id='69a46f7413e0dcf990d09340';
const user={id,name:'Test user'};
const row=i=>({_id:String(i),sellerId:id,createdAt:new Date(Date.UTC(2025,0,1)+i*1000).toISOString()});

test('profile URL, username, and ID inputs are distinguished',()=>{
  assert.equal(profileId(EXAMPLE_PROFILE+'?source=share'),id);
  assert.equal(profileId(id.toUpperCase()),id);
  assert.equal(profileId('Rille_bin_Lagom'),null);
  assert.throws(()=>profileId('https://example.com/user/'+id),/app.warera/);
});

test('history exceeds both 5,000 rows and 1,200 pages, with an update per page',async()=>{
  let requests=0,updates=0,total=0;
  const result=await readHistory({from:0,to:Date.now(),fetchPage:async cursor=>{
    const page=cursor?Number(cursor):0;requests++;
    return {items:Array.from({length:5},(_,j)=>row(page*5+j)),nextCursor:page<1201?String(page+1):null};
  },onPage:p=>{updates++;total+=p.rows.length;if(updates===1)assert.equal(p.coverage.complete,false);}});
  assert.equal(requests,1202);assert.equal(updates,requests);assert.equal(total,6010);
  assert.equal(result.rows.length,6010);assert.equal(result.coverage.complete,true);
});

test('pagination walks past old and duplicate rows and rejects repeated cursors',async()=>{
  let call=0;
  const result=await readHistory({from:Date.UTC(2025,0,1),to:Date.now(),fetchPage:async()=>{
    call++;return call===1?{items:[{...row(0),createdAt:'2024-01-01'}],nextCursor:'next'}:{items:[row(1),row(1)]};
  }});
  assert.equal(call,2);assert.equal(result.rows.length,1);assert.equal(result.coverage.complete,true);
  await assert.rejects(readHistory({from:0,fetchPage:async()=>({items:[row(1)],nextCursor:'loop'})}),/repeated a cursor/);
});

test('a solo dive publishes events before history completion and labels failed types',async()=>{
  const updates=[];let wagePages=0;
  const client={request:async(_,payload)=>{
    if(payload.transactionType==='openCase')throw Error('Unsupported route');
    wagePages++;return {items:[row(wagePages)],nextCursor:wagePages===1?'older':null};
  }};
  const final=await collectDive(client,user,new AbortController().signal,s=>updates.push(s),{types:['wage','openCase']});
  assert.ok(updates.some(s=>s.times.length===1&&!s.coverage.wage.complete));
  assert.equal(final.times.length,2);assert.equal(final.coverage.wage.complete,true);
  assert.equal(final.coverage.openCase.reason,'error');assert.equal(final.coverage.openCase.complete,false);
});

test('stop cancels all pages and suppresses later chart updates',async()=>{
  const controller=new AbortController();let pages=0,updates=0;
  const client={request:async()=>({items:[row(++pages)],nextCursor:'more'})};
  await assert.rejects(collectDive(client,user,controller.signal,s=>{
    updates++;if(s.times.length)controller.abort();
  },{types:['wage']}),{name:'AbortError'});
  assert.equal(pages,1);assert.equal(updates,2);
});

test('queued work can be aborted while capacity is exhausted',async()=>{
  const queue=new RequestScheduler({limits:{gateway:1,official:1},windowMs:60000});
  await queue.run(async()=>({data:'first'}));
  const controller=new AbortController();let called=false;
  const promise=queue.run(async()=>{called=true;},{signal:controller.signal});
  controller.abort();await assert.rejects(promise,{name:'AbortError'});
  assert.equal(called,false);assert.equal(queue.status().queued,0);queue.pump();
});

test('gateway fallback is admitted through the same live queue',async()=>{
  const scheduler=new RequestScheduler(),routes=[];
  const request=createTransport({scheduler,getKey:()=> 'fixture-key',proxy:false,apiFetch:async(_,__,___,route)=>{
    routes.push(route);if(route==='gateway')throw Error('HTTP 502');return 'ok';
  }});
  assert.equal(await request('test',{}),'ok');assert.deepEqual(routes,['gateway','official']);
  assert.equal(scheduler.status().liveRequests,2);
});

test('key validation uses the protected official API and rejects a bad key',async()=>{
  const saved=globalThis.fetch;let url;
  globalThis.fetch=async value=>{url=String(value);return new Response(JSON.stringify([{error:{message:'Unauthorized',data:{code:'UNAUTHORIZED'}}}]),{status:401});};
  try{await assert.rejects(createClient(()=> 'bad').validateKey(),/rejected this key/);assert.match(url,/api2\.warera\.io.*transaction\.getPaginatedTransactions/);}finally{globalThis.fetch=saved;}
});

test('ambiguous usernames return choices instead of silently selecting a user',async()=>{
  const ids=[id,'69a46f7413e0dcf990d09341'];
  const client={request:async(endpoint,payload)=>endpoint==='search.searchAnything'?{userIds:ids}:{username:payload.userId===id?'Alpha A':'Alpha B'}};
  assert.equal((await findProfiles(client,'Alpha',new AbortController().signal)).length,2);
});

test('timing excludes other workers, received transfers and resource orders of unknown ownership',()=>{
  assert.equal(deepDiveEventFor({...row(1),sellerId:'someone-else'},id,'wage'),null);
  assert.equal(deepDiveEventFor({...row(1),buyerId:'someone-else'},id,'donation'),null);
  assert.equal(deepDiveEventFor({...row(1),buyerId:'another',offerCreatedAt:row(1).createdAt,itemCode:'iron'},id,'trading'),null);
});
