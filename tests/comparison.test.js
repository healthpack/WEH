import test from 'node:test';
import assert from 'node:assert/strict';
import {overlapTimes,OVERLAP_WINDOW} from '../src/comparison.js';

const minute=60000,day=Date.UTC(2025,0,1);
const series=(id,offsets)=>({id,evts:offsets.map(n=>({t:day+n*minute,type:'wage',timingKnown:true}))});
const offsets=hits=>[...hits].map(t=>(t-day)/minute).sort((a,b)=>a-b);

test('X-ray requires another account within the exact ten-minute window, including its boundary',()=>{
  const a=series('a',[120,0,60,60]),b=series('b',[131,69,10]);
  const hits=overlapTimes([a,b]);
  assert.equal(OVERLAP_WINDOW,10*minute);
  assert.deepEqual(offsets(hits.get('a')),[0,60]);
  assert.deepEqual(offsets(hits.get('b')),[10,69]);
  assert.deepEqual(offsets(overlapTimes([series('a',[0]),series('b',[10.001])]).get('a')),[]);
});

test('hidden accounts, filtered actions, unknown timing and same-account bursts cannot create overlaps',()=>{
  const a=series('a',[0,1,2]);
  assert.deepEqual(offsets(overlapTimes([a]).get('a')),[]);
  assert.deepEqual(offsets(overlapTimes([a,series('a',[1])]).get('a')),[]);
  const b={id:'b',evts:[{t:day,type:'craftItem',timingKnown:false},{t:NaN,type:'wage'}]};
  assert.deepEqual(offsets(overlapTimes([a,b]).get('a')),[]);
  b.evts.push({t:day,type:'articleTip'});
  assert.deepEqual(offsets(overlapTimes([a,b]).get('a')),[0,1,2]);
  assert.deepEqual(offsets(overlapTimes([a,{...b,evts:b.evts.filter(e=>e.type==='wage')}]).get('a')),[]);
  assert.equal(overlapTimes([]).size,0);
});

test('overlap matching handles dense histories and epoch boundaries symmetrically',()=>{
  const a=series('a',Array.from({length:20000},(_,i)=>i)),b=series('b',Array.from({length:20000},(_,i)=>i+.5));
  const hits=overlapTimes([a,b]);
  assert.equal(hits.get('a').size,20000);assert.equal(hits.get('b').size,20000);
  const edge=overlapTimes([{id:'a',evts:[{t:0}]},{id:'b',evts:[{t:OVERLAP_WINDOW}]}]);
  assert.deepEqual([...edge.get('a')],[0]);assert.deepEqual([...edge.get('b')],[OVERLAP_WINDOW]);
});
