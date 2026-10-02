import React, { useEffect, useMemo, useRef, useState } from 'react';
import Fingerprint from './Fingerprint.jsx';
import { DensityView, TrendsView } from './DeepDiveViews.jsx';
import { createClient, findProfiles, collectDive, EXAMPLE_PROFILE, TYPES, LABELS, TYPE_COLORS, TYPE_HINTS } from './warera.js';
import { eventCalendarTime, observedSpan, timeZoneOptions } from './timezone.js';
import { isAbort } from './asyncRun.js';

function Icon({name, ...props}) {
  const paths = {search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,key:<><circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-4-4 3-3m-7-1 3-3"/></>,arrow:<><path d="M5 12h14m-6-6 6 6-6 6"/></>,check:<path d="m5 12 4 4L19 6"/>,link:<><path d="M14 4h6v6m0-6L10 14"/><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></>};
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

class ChartBoundary extends React.Component {
  state = {error:false};
  static getDerivedStateFromError() { return {error:true}; }
  render() { return this.state.error ? <div role="alert" className="empty-chart">This chart could not render. Choose another tab to continue exploring.</div> : this.props.children; }
}

function EmptyChart({loading=false, account=false}) {
  return <div className="empty-chart-grid" aria-label="No account loaded">
    <div className="empty-hours">24:00<br/>18:00<br/>12:00<br/>06:00<br/>00:00</div>
    <div className="empty-chart">{loading?<span className="graph-spinner"/>:<span className="mini-mark">▥</span>}<strong>{loading?'Loading account history…':account?'No observed events yet.':'Your account’s story, in time.'}</strong><span>{loading?'Waiting for the first pages. The graph will populate as data arrives.':account?'No events were returned for this account.':'Choose a user to start exploring their activity.'}</span></div>
  </div>;
}

export default function App() {
  const [gate, setGate] = useState('key'), [keyInput, setKeyInput] = useState('');
  const [query, setQuery] = useState(EXAMPLE_PROFILE), [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [account, setAccount] = useState(null), [phase, setPhase] = useState('idle');
  const [tab, setTab] = useState('fingerprint'), [types, setTypes] = useState(TYPES);
  const [colorMode, setColorMode] = useState('monochrome'), [timeZone, setTimeZone] = useState('UTC');
  const zones = useMemo(timeZoneOptions, []);
  const [queue, setQueue] = useState({active:0,queued:0,liveRequests:0});
  const [notice, setNotice] = useState('');
  const keyRef = useRef(''), validatedKeyRef = useRef(''), runRef = useRef(null), pending = useRef(null), timer = useRef(null), firstInput = useRef(null);
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = createClient(()=>keyRef.current, message=>setNotice(message.replace(/^\[API\] /,'')));
  const client = clientRef.current;

  const flush = () => {
    clearTimeout(timer.current); timer.current=null;
    if (pending.current) {setAccount(pending.current);pending.current=null;}
  };
  const abort = () => {runRef.current?.abort();runRef.current=null;flush();setBusy(false);};
  const begin = () => {abort();const run=new AbortController();runRef.current=run;return run;};
  useEffect(()=> {
    const tick = window.setInterval(()=>setQueue(client.scheduler.status()), 500);
    return ()=>{clearInterval(tick);runRef.current?.abort();clearTimeout(timer.current);};
  },[client]);
  useEffect(()=>{if(gate){firstInput.current?.focus();if(gate==='key'&&validatedKeyRef.current)firstInput.current?.select();}},[gate]);

  const verify = async event => {
    event.preventDefault(); if (busy) return;
    const run = begin(); setBusy(true);setError('');keyRef.current=keyInput.trim();
    try {
      await client.validateKey(run.signal);
      if (runRef.current !== run) return;
      validatedKeyRef.current=keyRef.current;
      setKeyInput('');setGate(account?null:'user');
    } catch (e) {if(!isAbort(e)&&runRef.current===run){keyRef.current=validatedKeyRef.current;setError(e.message);}}
    finally {if(runRef.current===run){runRef.current=null;setBusy(false);}}
  };

  const startDive = async user => {
    const run = begin();setGate(null);setCandidates([]);setError('');setNotice('');setPhase('collecting');
    setAccount({...user,times:[],coverage:{},counts:{}});setTypes(TYPES);setTab('fingerprint');
    const publish = value => {
      if(runRef.current!==run||run.signal.aborted)return;
      pending.current=value;
      // Render throughout acquisition without repainting a large canvas per response.
      if(!timer.current)timer.current=setTimeout(flush,120);
    };
    try {
      const final = await collectDive(client, user, run.signal, publish);
      if(runRef.current!==run)return;
      pending.current=final;flush();
      setPhase(TYPES.every(type=>final.coverage[type]?.complete)?'complete':'partial');
    } catch (e) {if(!isAbort(e)&&runRef.current===run){flush();setPhase('partial');setNotice(e.message);}}
    finally {if(runRef.current===run)runRef.current=null;}
  };

  const search = async event => {
    event.preventDefault();if(busy)return;
    const run=begin();setBusy(true);setError('');setCandidates([]);
    try {
      const users=await findProfiles(client,query,run.signal);
      if(runRef.current!==run)return;
      if(users.length===1){runRef.current=null;setBusy(false);void startDive(users[0]);}
      else setCandidates(users);
    } catch (e) {if(!isAbort(e)&&runRef.current===run)setError(e.message);}
    finally {if(runRef.current===run){runRef.current=null;setBusy(false);}}
  };

  const stop = () => {abort();setPhase('stopped');setNotice('Collection stopped. Fetched observations are still available.');};
  const newUser = () => {if(phase==='collecting')stop();else abort();setError('');setCandidates([]);setGate('user');};
  const changeKey = () => {if(phase==='collecting')stop();else abort();setKeyInput(validatedKeyRef.current);setError('');setGate('key');};
  const closeKey = () => {abort();keyRef.current=validatedKeyRef.current;setGate(account?null:'user');setError('');};

  const allSeries = useMemo(()=> {
    if(!account)return [];
    const evts=account.times.filter(e=>types.includes(e.type));
    return [{...account,ci:0,evts}];
  },[account,types]);
  // Coverage starts at the epoch to exhaust all history. Display the observed span,
  // rather than drawing decades before WarEra existed.
  const span = useMemo(()=>observedSpan(account?.times||[],timeZone),[account,timeZone]);
  const finished=TYPES.filter(t=>account?.coverage[t]?.complete).length;
  const failed=TYPES.filter(t=>account?.coverage[t]?.reason==='error');
  const pages=Object.values(account?.counts||{}).reduce((n,c)=>n+c.pages,0);
  const fetched=Object.values(account?.counts||{}).reduce((n,c)=>n+c.rows,0);
  const count=account?.times.length||0;
  const activeDays=useMemo(()=>new Set((account?.times||[]).map(e=>Math.floor(eventCalendarTime(e,timeZone)/86400000))).size,[account,timeZone]);
  const status={idle:'Ready to explore',collecting:'Collecting history',complete:'History complete',partial:'Partial history',stopped:'Collection stopped'}[phase];
  const toggleType = (type, event) => setTypes(prev=>event.shiftKey?[type]:prev.includes(type)?prev.filter(t=>t!==type):TYPES.filter(t=>prev.includes(t)||t===type));
  const closeSearch = () => {abort();setGate(null);setError('');};

  return <div className="app">
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL}><img src={`${import.meta.env.BASE_URL}mark.svg`} alt=""/><strong>WAR ERA HISTORY</strong></a>{gate!=='key'&&<button className="quiet" onClick={changeKey}><Icon name="key"/>Change API key</button>}</header>
    <main aria-hidden={gate?true:undefined} inert={gate?'':undefined}>
      <div className="page-heading"><div><div className="eyebrow">WARERA ACCOUNT EXPLORER</div><h1>See the history of a War Era account over time.</h1></div><span className="history-badge"><span/>Full available history</span></div>
      <section className="account-card" aria-label="Account summary"><div className="avatar">{account?account.name.slice(0,2).toUpperCase():<Icon name="search" width="24" height="24"/>}</div><div className="account-identity"><div className="account-name">{account?<a href={`https://app.warera.io/user/${account.id}`} target="_blank" rel="noreferrer">{account.name}<Icon name="link" width="14" height="14"/></a>:'No account selected'}</div><span className="account-id">{account?account.id:'Start with a username or profile link'}</span></div><div className={`status ${phase}`} role="status"><span className={phase==='collecting'?'pulse':''}/>{status}</div><div className="account-actions"><button className="button secondary" onClick={stop} disabled={phase!=='collecting'}><Icon name="stop"/>Stop</button><button className="button primary" onClick={newUser} disabled={gate==='key'}><Icon name="search"/>Search new user</button></div></section>
      <section className="stats" aria-label="Collected data"><div><span>OBSERVED EVENTS</span><strong data-stat="events">{count.toLocaleString()}</strong><small>Own actions &amp; labeled observations</small></div><div><span>ACTIVE DATES</span><strong>{activeDays.toLocaleString()}</strong><small>Dates in {timeZone}</small></div><div><span>HISTORY REACHED</span><strong className="date-stat">{span?new Date(span.lo).toISOString().slice(0,10):'—'}</strong><small>Earliest observed date</small></div><div><span>ACQUISITION</span><strong>{finished}<em>/ {TYPES.length}</em></strong><small>{pages.toLocaleString()} pages · {fetched.toLocaleString()} rows fetched</small></div></section>
      <section className="workspace"><div className="workspace-head"><nav role="tablist" aria-label="Deep dive views">{[['fingerprint','Fingerprint'],['heatmap','Heatmap'],['trends','Daily trends']].map(([value,label])=><button key={value} id={`tab-${value}`} role="tab" aria-selected={tab===value} aria-controls={`panel-${value}`} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{label}</button>)}</nav><label className="timezone-picker">Timezone <select aria-label="Timezone" value={timeZone} onChange={e=>setTimeZone(e.target.value)}>{zones.map(zone=><option key={zone} value={zone}>{zone.replaceAll('_',' ')}</option>)}</select></label></div>
        <div className="chart-tools"><div className="type-filters" aria-label="Action filters"><button aria-pressed={types.length===TYPES.length} onClick={()=>setTypes(TYPES)}>All actions</button>{TYPES.map(type=><button key={type} aria-pressed={types.includes(type)} title={`${TYPE_HINTS[type]} Shift-click to show only ${LABELS[type]}.`} onClick={e=>toggleType(type,e)}><span className="type-dot" style={{background:colorMode==='color'?TYPE_COLORS[type]:'#4fc3e8'}}/>{LABELS[type]}</button>)}</div></div>
        <div className="display-options"><div className="color-mode" role="group" aria-label="Graph colors"><button aria-pressed={colorMode==='monochrome'} onClick={()=>setColorMode('monochrome')}>Monochrome</button><button aria-pressed={colorMode==='color'} onClick={()=>setColorMode('color')}><span className="color-symbol"/>Color by type</button></div><span>Shift-click an action to show only that type</span></div>
        <div className="chart-content" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={phase==='collecting'}>
          {phase==='collecting'&&<div className="graph-loading" role="status" data-testid="graph-loading"><span className="graph-spinner"/><div><strong>Loading history…</strong><span>{pages?`${pages.toLocaleString()} pages received · ${count.toLocaleString()} events plotted`:'Waiting for the first transaction pages…'}</span></div><progress max={TYPES.length} value={finished} aria-label="Completed action types"/></div>}
          <ChartBoundary key={`${account?.id||'empty'}/${tab}/${timeZone}`}>{!account||!span?<EmptyChart loading={phase==='collecting'} account={!!account}/>:tab==='fingerprint'?<Fingerprint series={allSeries} span={span} timeZone={timeZone} colorMode={colorMode}/>:tab==='heatmap'?<DensityView series={allSeries} span={span} types={types} timeZone={timeZone} colorMode={colorMode}/>:<TrendsView series={allSeries} span={span} types={types} timeZone={timeZone} colorMode={colorMode}/>}</ChartBoundary>
        </div>
        <div className="collection-bar"><span className={`collection-dot ${phase==='collecting'?'pulse':''}`}/><span>{phase==='collecting'?`${finished} of ${TYPES.length} action types complete · charts update as pages arrive`:status}</span><span className="queue-info">{queue.active} active · {queue.queued} queued</span></div>
        {account&&<details className="acquisition"><summary>Acquisition details{failed.length>0?` · ${failed.length} failed type(s)`:''}</summary><div className="receipts">{TYPES.map(type=><div key={type}><span>{LABELS[type]}</span><span>{(account.counts[type]?.actions||0).toLocaleString()} events · {account.counts[type]?.pages||0} pages</span><span className={account.coverage[type]?.complete?'verified':'unverified'}>{account.coverage[type]?.complete?'Complete':account.coverage[type]?.error||(['stopped','partial'].includes(phase)?'Incomplete':account.coverage[type]?.reason||'Queued')}</span></div>)}</div></details>}
        {notice&&<p className="notice" role="status">{notice}</p>}
      </section>
      <footer><span>Observed activity describes timing; it does not establish intent.</span><a href="https://warerastats.io" target="_blank" rel="noreferrer">Supported by warerastats.io <Icon name="link" width="12" height="12"/></a></footer>
    </main>
    {gate&&<div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={e=>{if(e.key==='Escape'){if(gate==='user'&&account)closeSearch();else if(gate==='key'&&validatedKeyRef.current)closeKey();}if(e.key==='Tab'){const focusable=[...e.currentTarget.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
      <div className="dialog-icon"><Icon name={gate==='key'?'key':'search'} width="25" height="25"/></div><div className="eyebrow">{gate==='key'?'01 / CONNECT':'02 / CHOOSE AN ACCOUNT'}</div><h2 id="dialog-title">{gate==='key'?'Your key to a deeper view.':'Who are we exploring?'}</h2><p>{gate==='key'?'Enter your WarEra API key to unlock the explorer. We’ll verify it before you begin.':'Paste a WarEra profile link, enter a user ID, or search by username.'}</p>
      {gate==='key'&&<div className="key-explainer">Go to your settings, at the bottom of the page press the blue <strong>CREATE TOKEN</strong> button and copy the key.</div>}
      <form onSubmit={gate==='key'?verify:search}><label htmlFor="entry">{gate==='key'?'WARERA API KEY':'USERNAME OR PROFILE LINK'}</label><input ref={firstInput} id="entry" aria-label={gate==='key'?'WarEra API key':'Username or profile link'} type={gate==='key'?'password':'text'} placeholder={gate==='key'?'wae_768abc...':undefined} autoComplete="off" spellCheck="false" required value={gate==='key'?keyInput:query} className={gate==='user'&&query===EXAMPLE_PROFILE?'example':''} onChange={e=>{gate==='key'?setKeyInput(e.target.value):setQuery(e.target.value);setError('');setCandidates([]);}} disabled={busy}/>{error&&<p role="alert" className="form-error">{error}</p>}<button className="button primary submit" disabled={busy||(gate==='key'?!keyInput.trim():!query.trim())}>{busy?<><span className="spinner"/>{gate==='key'?'Validating API key…':'Finding account…'}</>:<>{gate==='key'?'Validate & continue':'Start deep dive'}<Icon name="arrow"/></>}</button></form>
      {gate==='key'?<div className="dialog-footnote"><Icon name="check"/><span>Your key stays in memory for this page session. It is sent only to WarEra and the WarEraStats gateway.</span></div>:<div className="dialog-footnote"><Icon name="check"/><span>Full available history. No date, transaction, or page cap.</span></div>}
      {candidates.length>0&&<div className="candidates"><p>Choose a matching account</p>{candidates.map(user=><button key={user.id} onClick={()=>void startDive(user)}><strong>{user.name}</strong><small>{user.id}</small><Icon name="arrow"/></button>)}</div>}
      {gate==='user'&&account&&<button className="back-button" onClick={closeSearch}>Back to this deep dive</button>}
      {gate==='key'&&validatedKeyRef.current&&<button className="back-button" onClick={closeKey}>Keep previous key &amp; go back</button>}
    </section></div>}
  </div>;
}
