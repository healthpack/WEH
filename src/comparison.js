import { comparableEvent } from './deepDiveAnalysis.js';

export const ACCOUNT_COLORS=['#4fc3e8','#ff5d6c'];
export const OVERLAP_WINDOW=10*60000;

export function overlapTimes(series, window=OVERLAP_WINDOW) {
  const rows=series.map(s=>({id:s.id,times:s.evts.filter(comparableEvent).map(e=>e.t).sort((a,b)=>a-b)}));
  const hits=new Map(rows.map(s=>[s.id,new Set()]));
  const mark=(a,b)=>{
    let j=0;
    for(const t of a.times) {
      while(j<b.times.length && b.times[j]<t-window)j++;
      if(j<b.times.length && b.times[j]<=t+window)hits.get(a.id).add(t);
    }
  };
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++) {
    if(rows[i].id===rows[j].id)continue;
    mark(rows[i],rows[j]);mark(rows[j],rows[i]);
  }
  return hits;
}
