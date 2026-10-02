import test from 'node:test';
import assert from 'node:assert/strict';
import {actionTimeFor,deepDiveEventFor} from '../src/analysisCore.js';
import {collectDive} from '../src/warera.js';
import {dailySummary,DAY} from '../src/deepDiveAnalysis.js';

const id='69a46f7413e0dcf990d09340',other='69a46f7413e0dcf990d09341';
const listing=Date.UTC(2025,0,1,9),payment=Date.UTC(2025,0,7,20);
const base={sellerId:id,buyerId:other,offerCreatedAt:new Date(listing).toISOString(),createdAt:new Date(payment).toISOString()};

test('tips and donations represent the selected sender only, including nested identities',()=>{
  for(const type of ['articleTip','donation']) {
    assert.equal(deepDiveEventFor(base,id,type),null); // selected user receives
    assert.equal(deepDiveEventFor({...base,buyerId:id,sellerId:other},id,type).t,payment);
    assert.equal(deepDiveEventFor({...base,sender:{_id:id},buyerId:undefined},id,type).t,payment);
    assert.equal(deepDiveEventFor({...base,senderId:other,buyerId:id},id,type),null);
    assert.equal(deepDiveEventFor({createdAt:base.createdAt},id,type),null); // unknown sender
    assert.equal(deepDiveEventFor({createdAt:base.createdAt,userId:id},id,type),null); // feed subject is not a sender
    assert.equal(deepDiveEventFor({...base,buyerId:{_id:id},sellerId:{_id:other}},id,type).t,payment);
  }
});

test('equipment represents only the selected seller at listing time, without a sale-time fallback',()=>{
  assert.equal(actionTimeFor(base,id,'itemMarket'),listing);
  const event=deepDiveEventFor({...base,item:{_id:'equipment-1'}},id,'itemMarket');
  assert.equal(event.t,listing);assert.equal(event.side,'sell');assert.equal(event.timeMeaning,'Listing');
  assert.equal(deepDiveEventFor({...base,buyerId:id,sellerId:other},id,'itemMarket'),null);
  assert.equal(deepDiveEventFor({...base,offerCreatedAt:null},id,'itemMarket'),null);
  assert.equal(deepDiveEventFor({...base,offerCreatedAt:'invalid'},id,'itemMarket'),null);
  assert.equal(deepDiveEventFor({...base,sellerId:undefined},id,'itemMarket'),null);
  assert.notEqual(deepDiveEventFor({...base,_id:'one',item:'helmet'},id,'itemMarket').dedupKey,deepDiveEventFor({...base,_id:'two',item:'helmet'},id,'itemMarket').dedupKey);
});

test('unsupported resource offers and battle awards cannot become account events',()=>{
  for(const row of [base,{...base,buyerId:id,sellerId:other},{...base,sellerId:{_id:id},buyerId:{_id:other}}]) {
    assert.equal(deepDiveEventFor({...row,itemCode:'iron'},id,'trading'),null);
    assert.equal(actionTimeFor(row,id,'trading'),null);
  }
  for(const itemCode of ['case1','case2','woodenCase','chest3']) {
    const row={buyerId:id,itemCode,createdAt:base.createdAt};
    assert.equal(deepDiveEventFor(row,id,'battleLoot'),null);
    assert.equal(actionTimeFor(row,id,'battleLoot'),null);
  }
});

test('mixed history counts and all chart summaries contain outgoing tips and own listings only',async()=>{
  const histories={
    articleTip:[{...base,_id:'received-tip'}, {...base,_id:'sent-tip',buyerId:id,sellerId:other}],
    itemMarket:[
      {...base,_id:'sale-1',item:{_id:'equipment-1'}},
      {...base,_id:'sale-2',item:{_id:'equipment-1'}}, // same listing, another row
      {...base,_id:'sale-3',item:{_id:'equipment-2'}}, // distinct item in same listing batch
      {...base,_id:'purchase',buyerId:id,sellerId:other},
      {...base,_id:'missing-time',offerCreatedAt:null},
    ],
    trading:[{...base,_id:'resource-sell'}, {...base,_id:'resource-buy',buyerId:id,sellerId:other}],
    battleLoot:[{_id:'award',buyerId:id,itemCode:'case1',createdAt:base.createdAt}],
  };
  const types=Object.keys(histories);
  const requested=[];
  const client={request:async(_endpoint,input)=>{requested.push(input.transactionType);return {items:histories[input.transactionType]};}};
  const result=await collectDive(client,{id,name:'Selected user'},new AbortController().signal,()=>{},{types});
  assert.deepEqual(requested.sort(),['articleTip','itemMarket']);
  assert.equal(result.times.length,3);
  assert.deepEqual(Object.fromEntries(Object.entries(result.counts).map(([t,c])=>[t,c.actions])),{articleTip:1,itemMarket:2});
  assert.equal(result.counts.itemMarket.rows,5);
  assert.deepEqual(Object.keys(result.coverage),['articleTip','itemMarket']);
  assert.ok(Object.values(result.coverage).every(c=>c.complete));
  const series={...result,evts:result.times},span={lo:listing-9*3600000,hi:payment+4*3600000-1};
  for(const timingOnly of [false,true]) {
    const days=dailySummary(series,span,types,timingOnly);
    assert.equal(days.reduce((n,d)=>n+d.count,0),3);
    assert.equal(days[0].hours[9],2);
    assert.equal(days.at(-1).hours[20],1);
    assert.equal(days.slice(1,-1).reduce((n,d)=>n+d.count,0),0);
  }
  assert.equal(payment-listing,6*DAY+11*3600000);
});
