export class ScanAborted extends Error {
  constructor(what='operation') { super(`Aborted during ${what}`); this.name='AbortError'; this.aborted=true; }
}
export const isAbort = e => !!e && (e.aborted || e.name==='AbortError');
export function checkSignal(signal) { if (signal?.aborted) throw new ScanAborted(); }
export function delay(ms, signal) {
  checkSignal(signal);
  return new Promise((resolve,reject)=>{
    const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
    const timer=setTimeout(done,ms);
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new ScanAborted());};
    signal?.addEventListener('abort',abort,{once:true});
  });
}
export function beginRun(ref) {
  ref.current?.abort();
  const controller=new AbortController();
  ref.current=controller;
  return controller;
}
export const ownsRun = (ref,run) => ref.current===run && !run.signal.aborted;
export function endRun(ref,run) { if(ref.current===run) ref.current=null; }

// Timeout and user cancellation have different meanings; retain the distinction.
export async function fetchText(url, options={}, signal, timeoutMs=15000) {
  checkSignal(signal);
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeoutMs);
  try {
    const response=await fetch(url,{...options,signal:controller.signal});
    const text=await response.text();
    checkSignal(signal);
    return {response,text};
  } catch(e) {
    checkSignal(signal);
    if (e.name==='AbortError') throw new Error('Request timed out');
    throw e;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
