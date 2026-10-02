import { fetchText, checkSignal, delay, isAbort } from './asyncRun.js';
import { RequestScheduler } from './requestScheduler.js';
import { createTransport } from './apiTransport.js';
import { readHistory } from './transactionHistory.js';
import { deepDiveEventFor } from './analysisCore.js';

export const EXAMPLE_PROFILE = 'https://app.warera.io/user/69a46f7413e0dcf990d09340';
export const TYPES = ['itemMarket', 'trading', 'donation', 'articleTip', 'wage', 'openCase', 'craftItem', 'dismantleItem', 'battleLoot'];
export const LABELS = { itemMarket:'Equipment market', trading:'Resource offers', donation:'Donations', articleTip:'Article tips', wage:'Work', openCase:'Open cases', craftItem:'Crafting', dismantleItem:'Dismantling', battleLoot:'Battle cases' };
export const TYPE_COLORS = { itemMarket:'#4fc3e8', wage:'#3fd0a3', donation:'#ff5d6c', articleTip:'#a98bff', openCase:'#ffab3d', craftItem:'#ffd84d', dismantleItem:'#ff7ab8', trading:'#79c0ff', battleLoot:'#f78166' };
export const TYPE_HINTS = {
  itemMarket:'Only this account’s equipment listings, using listing time. Purchases and sale completion times are excluded. Transaction history reveals listings that resulted in a recorded sale.',
  trading:'Resource transactions do not identify who placed the offer. Excluded from all charts. Owners are available only for currently open orders, not historical filled offers.',
  donation:'Only donations sent by this account, using transaction time. Received transfers are excluded from all charts.',
  articleTip:'Only article tips sent by this account, using payment time. Received tips are excluded from all charts.',
  wage:'Own work only; payments made to other workers are excluded.',
  openCase:'Cases opened by the account, using the recorded transaction time.',
  craftItem:'Crafting events, using the recorded transaction time.',
  dismantleItem:'Dismantling events, using the recorded transaction time.',
  battleLoot:'Only timestamped case drops belonging to this account. Equipment awards are excluded. Battle summaries provide case totals, not individual drop times.',
};

export function profileId(input) {
  const value = input.trim();
  if (/^[a-f\d]{24}$/i.test(value)) return value.toLowerCase();
  if (/^https?:\/\//i.test(value)) {
    let url;
    try { url = new URL(value); } catch { throw Error('Enter a valid WarEra profile link.'); }
    const match = url.pathname.match(/^\/user\/([a-f\d]{24})\/?$/i);
    if (url.hostname !== 'app.warera.io' || !match) throw Error('Use a profile link from app.warera.io/user/…');
    return match[1].toLowerCase();
  }
  return null;
}

export function transactionRows(data) {
  const rows = Array.isArray(data) ? data : data?.items ?? data?.data ?? data?.transactions;
  if (!Array.isArray(rows)) throw Error('The API did not return transaction rows.');
  return rows;
}

export async function upstreamFetch(endpoint, payload, key, route, signal) {
  const gateway = route === 'gateway';
  const base = gateway ? 'https://gateway.warerastats.io/trpc/' : 'https://api2.warera.io/trpc/';
  const input = encodeURIComponent(JSON.stringify({0:payload}));
  const headers = {'Content-Type':'application/json', 'X-API-Key':key};
  const {response, text} = await fetchText(base + endpoint + (gateway ? '' : '?batch=1&input=' + input),
    gateway ? {method:'POST',headers,body:JSON.stringify(payload)} : {headers}, signal, 20000);
  if (response.status === 429) throw Error('RATE LIMIT');
  let body;
  try { body = JSON.parse(text); } catch { throw Error(`The ${route} API returned an unreadable response (HTTP ${response.status}).`); }
  const envelope = Array.isArray(body) ? body[0] : body;
  const error = envelope?.error;
  if (response.status === 429 || error?.data?.httpStatus === 429 || /rate.?limit/i.test(error?.message || '')) throw Error('RATE LIMIT');
  if (response.status === 401 || response.status === 403 || ['UNAUTHORIZED','FORBIDDEN'].includes(error?.data?.code)) {
    throw Error('The API rejected this key. Check that it is an active WarEra API key.');
  }
  if (!response.ok || error) throw Error(error?.message || `The ${route} API returned HTTP ${response.status}.`);
  const result = envelope?.result?.data?.json ?? envelope?.result?.data ?? envelope;
  if (result == null) throw Error('The API returned no data.');
  return result;
}

export function createClient(getKey, log=()=>{}) {
  // Preserve Oracle's shared queue and route accounting. Static hosting calls the
  // two upstreams directly: there is no /api/cache server or shared key storage.
  const scheduler = new RequestScheduler();
  const request = createTransport({scheduler, getKey, apiFetch:upstreamFetch, log});
  return {
    scheduler, request,
    async validateKey(signal) {
      // Public profiles and gateway cache hits do not prove a key is valid.
      const page = await request('transaction.getPaginatedTransactions', {userId:profileId(EXAMPLE_PROFILE),transactionType:'wage',limit:1}, {signal,forceOfficial:true});
      transactionRows(page);
    },
  };
}

export async function findProfiles(client, input, signal) {
  checkSignal(signal);
  const id = profileId(input), query = input.trim();
  if (!query) throw Error('Enter a username or WarEra profile link.');
  const read = async userId => {
    const profile = await client.request('user.getUserLite', {userId}, {signal});
    if (!profile?.username && !profile?.name) throw Error('This WarEra profile could not be found.');
    return {id:userId, name:profile.username || profile.name, profile};
  };
  if (id) return [await read(id)];
  const search = await client.request('search.searchAnything', {searchText:query}, {signal});
  const ids = [...new Set(search?.userIds || [])];
  if (!ids.length) throw Error('No matching user found. Try their profile link.');
  const results = await Promise.allSettled(ids.map(read));
  checkSignal(signal);
  const users = results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const exact = users.filter(u=>u.name.toLowerCase()===query.toLowerCase());
  if (exact.length) return exact;
  if (!users.length) throw Error('The matching profiles could not be loaded. Try a profile link.');
  return users;
}

export async function collectDive(client, user, signal, onUpdate, {types=TYPES, now=Date.now()}={}) {
  const times = [], seen = new Set(), coverage = {}, counts = {};
  for (const type of types) {
    coverage[type] = {complete:false, reason:'queued', requestedFrom:0, requestedTo:now};
    counts[type] = {rows:0,actions:0,pages:0};
  }
  const snapshot = () => ({...user, times:times.slice(), coverage:{...coverage}, counts:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,{...v}]))});
  const publish = () => { checkSignal(signal); onUpdate(snapshot()); };
  publish();
  await Promise.all(types.map(async type => {
    try {
      const result = await readHistory({from:0, to:now, limit:Infinity, maxPages:Infinity, signal,
        fetchPage:async cursor => {
          const payload = {userId:user.id, transactionType:type, limit:100};
          if (cursor) payload.cursor = cursor;
          // Retry transient failures once; rate-limit waits remain in the queue.
          for (let attempt=0; ; attempt++) {
            try { return await client.request('transaction.getPaginatedTransactions', payload, {signal,lane:'depth'}); }
            catch (error) {
              checkSignal(signal);
              if (isAbort(error) || attempt>0 || /key|invalid|not found|unsupported/i.test(error.message)) throw error;
              await delay(1500, signal);
            }
          }
        },
        onPage:page => {
          checkSignal(signal);
          coverage[type] = page.coverage;
          counts[type].rows += page.rows.length;
          counts[type].pages = page.coverage.pages;
          for (const row of page.rows) {
            const event = deepDiveEventFor(row, user.id, type);
            if (!event || event.t<0 || event.t>now) continue;
            const key = `${type}/${event.dedupKey || row._id || JSON.stringify(row)}`;
            if (seen.has(key)) continue;
            seen.add(key); times.push(event); counts[type].actions++;
          }
          publish();
        },
      });
      coverage[type] = result.coverage;
    } catch (error) {
      checkSignal(signal);
      coverage[type] = {...coverage[type],complete:false,reason:'error',error:error.message};
    }
    publish();
  }));
  checkSignal(signal);
  return snapshot();
}
