// Optional bounded live check. Keys and raw transactions are never logged or saved.
import assert from 'node:assert/strict';
import {createClient,profileId,EXAMPLE_PROFILE,transactionRows} from '../src/warera.js';
import {deepDiveEventFor,userIdOf} from '../src/analysisCore.js';
const key=process.env.WARERA_API_KEY;
if(!key)throw Error('Set WARERA_API_KEY for the optional attribution check.');
const userId=profileId(EXAMPLE_PROFILE),client=createClient(()=>key),signal=AbortSignal.timeout(45000);
await client.validateKey(signal);
for(const type of ['articleTip','itemMarket']) {
  for(const forceOfficial of [false,true]) {
    const page=await client.request('transaction.getPaginatedTransactions',{userId,transactionType:type,limit:20},{signal,forceOfficial});
    const rows=transactionRows(page),events=rows.map(row=>deepDiveEventFor(row,userId,type)).filter(Boolean);
    const expected=type==='articleTip'?rows.filter(row=>userIdOf(row.buyerId)===userId):type==='itemMarket'?rows.filter(row=>userIdOf(row.sellerId)===userId&&Number.isFinite(Date.parse(row.offerCreatedAt))):[];
    assert.equal(events.length,expected.length);
    for(const row of rows) {
      const event=deepDiveEventFor(row,userId,type);
      if(type==='articleTip'&&event){assert.equal(userIdOf(row.buyerId),userId);assert.equal(event.t,Date.parse(row.createdAt));}
      if(type==='itemMarket'&&event){assert.equal(userIdOf(row.sellerId),userId);assert.equal(event.t,Date.parse(row.offerCreatedAt));}
    }
    console.log(`${forceOfficial?'Official':'Gateway-first'} ${type}: ${rows.length} rows, ${events.length} own actions, ${rows.length-events.length} excluded.`);
  }
}
console.log('Live attribution passed: outgoing tips only, seller equipment at listing time only.');
