// Optional bounded source check. Keys and raw responses are never saved or logged.
import assert from 'node:assert/strict';
import {createClient,EXAMPLE_PROFILE,profileId,transactionRows} from '../src/warera.js';
import {caseLoot,deepDiveEventFor,userIdOf} from '../src/analysisCore.js';
const key=process.env.WARERA_API_KEY;
if(!key)throw Error('Set WARERA_API_KEY for the optional source check.');
const userId=profileId(EXAMPLE_PROFILE),client=createClient(()=>key),signal=AbortSignal.timeout(45000);
await client.validateKey(signal);
const config=await client.request('gameConfig.getGameConfig',{},{signal,forceOfficial:true});
const codes=Object.entries(config.items).filter(([,item])=>item.type==='case').map(([code])=>code);
for(const code of codes)assert.equal(caseLoot({itemCode:code}),true,`Unknown case code: ${code}`);
for(const forceOfficial of [false,true]) {
  const page=await client.request('transaction.getPaginatedTransactions',{userId,transactionType:'battleLoot',limit:30},{signal,forceOfficial});
  const rows=transactionRows(page),events=rows.map(row=>deepDiveEventFor(row,userId,'battleLoot')).filter(Boolean);
  assert.equal(events.length,rows.filter(row=>caseLoot(row)&&userIdOf(row.buyerId)===userId&&Number.isFinite(Date.parse(row.createdAt))).length);
  console.log(`${forceOfficial?'Official':'Gateway-first'} battle loot: ${rows.length} sampled rows, ${events.length} timestamped case drops.`);
}
for(const itemCode of codes) {
  const page=await client.request('transaction.getPaginatedTransactions',{userId,transactionType:'battleLoot',itemCode,limit:1},{signal,forceOfficial:true});
  const rows=transactionRows(page);
  assert.ok(rows.every(row=>row.itemCode===itemCode));
  console.log(`Official battle loot filtered to ${itemCode}: ${rows.length?'timestamped history exists':'no rows returned'}.`);
}
const book=await client.request('tradingOrder.getTopOrders',{itemCode:'iron',limit:1},{signal,forceOfficial:true});
for(const order of [...book.buyOrders,...book.sellOrders]) {
  assert.ok(userIdOf(order.user));assert.ok(Number.isFinite(Date.parse(order.offerAt)));
  assert.ok(['buy','sell'].includes(order.type));
}
console.log('Current resource book provides owner, side and offer time; historical trade transactions do not establish listing ownership.');
