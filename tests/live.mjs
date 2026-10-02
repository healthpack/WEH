// Bounded read-only check. No key or raw upstream response is logged or saved.
import assert from 'node:assert/strict';
import {createClient,EXAMPLE_PROFILE,profileId,transactionRows} from '../src/warera.js';
const key=process.env.WARERA_API_KEY;
if(!key)throw Error('Set WARERA_API_KEY to run the optional live check.');
const signal=AbortSignal.timeout(30000);
await assert.rejects(createClient(()=> 'weh-invalid-key-check').validateKey(signal),/rejected this key/);
const client=createClient(()=>key);
await client.validateKey(signal);
const userId=profileId(EXAMPLE_PROFILE);
const profile=await client.request('user.getUserLite',{userId},{signal});
assert.ok(profile?.username||profile?.name);
for(const transactionType of ['wage','itemMarket']){
  const page=await client.request('transaction.getPaginatedTransactions',{userId,transactionType,limit:1},{signal});
  assert.ok(Array.isArray(transactionRows(page)));
}
console.log('Live check passed: official API rejects an invalid key, validates the configured key, and the shared gateway/live transport reads the example profile and two bounded transaction samples.');
