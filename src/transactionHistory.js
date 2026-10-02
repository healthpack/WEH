import {checkSignal, isAbort} from './asyncRun.js';
import {txTime} from './analysisCore.js';

export function windowRows(rows, from, to, limit=Infinity) {
  const seen=new Set();
  return (rows || []).filter(r=>{
    const t=txTime(r); if (!t || t<from || t>to) return false;
    const id=r._id || JSON.stringify(r);
    if(seen.has(id)) return false; seen.add(id); return true;
  }).sort((a,b)=>txTime(b)-txTime(a)).slice(0,limit);
}

// All acquisition modes use the same interval and limit contract. Metadata is explicit;
// a stored legacy array or a failed page never establishes an empty/complete interval.
export async function readHistory({fetchPage, stored=[], metadata, mode='live', from, to=Date.now(), limit=Infinity, maxPages=Infinity, signal, matchRow=()=>true, allowPartial=false, onPage=()=>{}}) {
  checkSignal(signal);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from>to || !(limit>0) || !(maxPages>0)) throw new Error('Invalid transaction interval or fetch limit');
  const base={historyVersion:2,requestedFrom:from,requestedTo:to,fetchedAt:Date.now(),complete:false};
  if(mode==='local') {
    const all=windowRows(stored,from,to).filter(matchRow);
    const certified=metadata?.historyVersion===2 && metadata.complete && metadata.requestedFrom<=from && metadata.requestedTo>=to;
    return {rows:all.slice(0,limit),coverage:{...base,fetchedAt:metadata?.fetchedAt || null,
      complete:!!certified && all.length<=limit,reason:all.length>limit?'limit':certified?'stored-complete':'stored-unverified',pages:0}};
  }
  let cursor=null, reason='page-limit', pages=0, fetchedRows=0, error=null;
  const seenCursors=new Set(), seenRows=new Set(), fetched=[];
  for(;pages<maxPages;) {
    checkSignal(signal);
    try {
      const page=await fetchPage(cursor); checkSignal(signal);
      const rows=Array.isArray(page)?page:page?.items || page?.data || page?.transactions;
      if(!Array.isArray(rows)) throw new Error('Transaction response is missing its rows');
      if(rows.some(row=>!row || !txTime(row))) throw new Error('Transaction has an invalid timestamp; coverage cannot be established');
      pages++; fetchedRows+=rows.length;
      // Cursor order is not a createdAt ordering guarantee. Older rows or known IDs
      // cannot end the walk: newer, unseen shifts may occur on a later page.
      const added=[];
      for(const row of rows) {
        const t=txTime(row);
        if(t<from || t>to || !matchRow(row)) continue;
        const id=row._id || JSON.stringify(row);
        if(!seenRows.has(id)) {seenRows.add(id);fetched.push(row);added.push(row);}
      }
      const next=page?.nextCursor || page?.meta?.nextCursor;
      onPage({rows:added,coverage:{...base,reason:next?'collecting':'exhausted',complete:!next,pages,fetchedRows}});
      if(!next) {reason='exhausted';break;}
      if(!rows.length) throw new Error('Empty transaction page with a continuation cursor');
      if(fetched.length>=limit) {reason='limit';break;}
      if(seenCursors.has(next)) throw new Error('Transaction pagination repeated a cursor');
      seenCursors.add(next); cursor=next;
    } catch(e) {
      checkSignal(signal);
      if(isAbort(e) || !allowPartial || !fetchedRows) throw e;
      reason='error'; error=e.message || String(e); break;
    }
  }
  const all=windowRows(mode==='hybrid' ? fetched.concat(stored) : fetched,from,to).filter(matchRow);
  if(all.length>limit && reason!=='error') reason='limit';
  const rows=all.slice(0,limit);
  return {rows,coverage:{...base,reason,pages,fetchedRows,error,complete:reason==='exhausted'}};
}
