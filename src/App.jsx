import React, { useEffect, useMemo, useRef, useState } from 'react';
import Fingerprint from './Fingerprint.jsx';
import { DensityView, TrendsView } from './DeepDiveViews.jsx';
import { createClient, findProfiles, collectDive, EXAMPLE_PROFILE, TYPES, LABELS, TYPE_COLORS, TYPE_HINTS } from './warera.js';
import { eventCalendarTime, observedSpan, timeZoneOptions } from './timezone.js';
import { isAbort } from './asyncRun.js';
import { accountIdsFromPath, accountPath, readSavedKey, saveValidatedKey } from './browserSession.js';
import { ACCOUNT_COLORS } from './comparison.js';

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
  const initial = useRef(null);
  if (!initial.current) initial.current = {key:readSavedKey(),ids:accountIdsFromPath(window.location.pathname,import.meta.env.BASE_URL)};
  const [gate, setGate] = useState('key'), [keyInput, setKeyInput] = useState(initial.current.key);
  const [query, setQuery] = useState(initial.current.ids[0] || EXAMPLE_PROFILE), [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [accounts, setAccounts] = useState([]), [phase, setPhase] = useState('idle');
  const account=accounts[0]||null,comparison=accounts.length===2;
  const [visibleAccounts,setVisibleAccounts]=useState([]),[xray,setXray]=useState(false);
  const [tab, setTab] = useState('fingerprint'), [types, setTypes] = useState(TYPES);
  const [colorMode, setColorMode] = useState('monochrome'), [timeZone, setTimeZone] = useState('UTC');
  const zones = useMemo(timeZoneOptions, []);
  const [queue, setQueue] = useState({active:0,queued:0,liveRequests:0});
  const [notice, setNotice] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const queuedUsers = useRef(initial.current.ids), routeHandler = useRef(null);
  const keyRef = useRef(''), validatedKeyRef = useRef(''), runRef = useRef(null), pending = useRef(null), timer = useRef(null), firstInput = useRef(null);
  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = createClient(()=>keyRef.current, message=>setNotice(message.replace(/^\[API\] /,'')));
  const client = clientRef.current;

  const flush = () => {
    clearTimeout(timer.current); timer.current=null;
    if (pending.current) {setAccounts(pending.current);pending.current=null;}
  };
  const abort = () => {runRef.current?.abort();runRef.current=null;flush();setBusy(false);};
  const begin = () => {abort();const run=new AbortController();runRef.current=run;return run;};
  useEffect(()=> {
    const tick = window.setInterval(()=>setQueue(client.scheduler.status()), 500);
    return ()=>{clearInterval(tick);runRef.current?.abort();clearTimeout(timer.current);};
  },[client]);
  useEffect(()=>{if(gate){firstInput.current?.focus();if(gate==='key'&&validatedKeyRef.current)firstInput.current?.select();}},[gate]);

  const verifyKey = async (value, restoring=false) => {
    const run = begin(); setBusy(true);setError('');keyRef.current=value.trim();
    try {
      await client.validateKey(run.signal);
      if (runRef.current !== run) return;
      validatedKeyRef.current=keyRef.current;
      setStorageNotice(saveValidatedKey(keyRef.current)?'':'This browser could not save your key. It will work for this visit.');
      setKeyInput('');setGate(account?null:'user');
      const target=queuedUsers.current;queuedUsers.current=[];
      if(target.length){runRef.current=null;setBusy(false);void lookup(target);}
    } catch (e) {if(!isAbort(e)&&runRef.current===run){keyRef.current=validatedKeyRef.current;setError((restoring?'Your saved key could not be verified. ':'')+e.message);}}
    finally {if(runRef.current===run){runRef.current=null;setBusy(false);}}
  };
  const verify = event => {event.preventDefault();if(!busy)void verifyKey(keyInput);};

  const startDive = async selection => {
    const users=Array.isArray(selection)?selection:[selection];
    const run = begin();setGate(null);setCandidates([]);setError('');setNotice('');setPhase('collecting');
    const path=accountPath(users.map(user=>user.id),import.meta.env.BASE_URL);
    if(window.location.pathname!==path)window.history.pushState(null,'',path);
    const latest=users.map(user=>({...user,times:[],coverage:{},counts:{}}));
    setAccounts(latest.slice());setVisibleAccounts(users.map(user=>user.id));setXray(false);setTypes(TYPES);setTab('fingerprint');
    const publish = (value,index) => {
      if(runRef.current!==run||run.signal.aborted)return;
      latest[index]=value;pending.current=latest.slice();
      // Render throughout acquisition without repainting a large canvas per response.
      if(!timer.current)timer.current=setTimeout(flush,120);
    };
    try {
      const final = await Promise.all(users.map((user,index)=>collectDive(client,user,run.signal,value=>publish(value,index))));
      if(runRef.current!==run)return;
      pending.current=final;flush();
      setPhase(final.every(user=>TYPES.every(type=>user.coverage[type]?.complete))?'complete':'partial');
    } catch (e) {if(!isAbort(e)&&runRef.current===run){flush();setPhase('partial');setNotice(e.message);}}
    finally {if(runRef.current===run)runRef.current=null;}
  };

  const lookup = async input => {
    const run=begin();setGate('user');setQuery(Array.isArray(input)?input[0]:input);setBusy(true);setError('');setCandidates([]);
    try {
      const groups=await Promise.all((Array.isArray(input)?input:[input]).map(value=>findProfiles(client,value,run.signal)));
      if(runRef.current!==run)return;
      if(groups.every(users=>users.length===1)){runRef.current=null;setBusy(false);void startDive(groups.map(users=>users[0]));}
      else setCandidates(groups.flat());
    } catch (e) {if(!isAbort(e)&&runRef.current===run)setError(e.message);}
    finally {if(runRef.current===run){runRef.current=null;setBusy(false);}}
  };
  const search = event => {event.preventDefault();if(!busy)void lookup(query);};

  const stop = () => {abort();setPhase('stopped');setNotice('Collection stopped. Fetched observations are still available.');};
  const newUser = () => {if(phase==='collecting')stop();else abort();setError('');setCandidates([]);setGate('user');};
  const changeKey = () => {if(phase==='collecting')stop();else abort();setKeyInput(validatedKeyRef.current);setError('');setGate('key');};
  const closeKey = () => {abort();keyRef.current=validatedKeyRef.current;setGate(account?null:'user');setError('');};

  routeHandler.current = () => {
    if(phase==='collecting')stop();else abort();
    const ids=accountIdsFromPath(window.location.pathname,import.meta.env.BASE_URL);
    setQuery(ids[0]||EXAMPLE_PROFILE);setError('');setCandidates([]);
    if(validatedKeyRef.current){queuedUsers.current=[];if(ids.length)void lookup(ids);else setGate('user');}
    else {queuedUsers.current=ids;setGate('key');}
  };
  useEffect(()=>{
    // Revalidate a remembered key before any linked account history is requested.
    if(initial.current.key)void verifyKey(initial.current.key,true);
    const navigate=()=>routeHandler.current();
    window.addEventListener('popstate',navigate);
    return ()=>window.removeEventListener('popstate',navigate);
  },[]);

  const allSeries = useMemo(()=> {
    return accounts.flatMap((user,ci)=>visibleAccounts.includes(user.id)?[{...user,ci,color:comparison?ACCOUNT_COLORS[ci]:undefined,evts:user.times.filter(e=>types.includes(e.type))}]:[]);
  },[accounts,types,visibleAccounts,comparison]);
  const allTimes=useMemo(()=>accounts.flatMap(user=>user.times),[accounts]);
  // Coverage starts at the epoch to exhaust all history. Display the observed span,
  // rather than drawing decades before WarEra existed.
  const span = useMemo(()=>observedSpan(allTimes,timeZone),[allTimes,timeZone]);
  const finished=accounts.reduce((n,user)=>n+TYPES.filter(t=>user.coverage[t]?.complete).length,0),total=Math.max(1,accounts.length)*TYPES.length;
  const failed=accounts.flatMap(user=>TYPES.filter(t=>user.coverage[t]?.reason==='error'));
  const counts=accounts.flatMap(user=>Object.values(user.counts));
  const pages=counts.reduce((n,c)=>n+c.pages,0);
  const fetched=counts.reduce((n,c)=>n+c.rows,0);
  const count=allTimes.length;
  const activeDays=useMemo(()=>new Set(allTimes.map(e=>Math.floor(eventCalendarTime(e,timeZone)/86400000))).size,[allTimes,timeZone]);
  const status={idle:'Ready to explore',collecting:'Collecting history',complete:'History complete',partial:'Partial history',stopped:'Collection stopped'}[phase];
  const toggleType = (type, event) => setTypes(prev=>event.shiftKey?[type]:prev.includes(type)?prev.filter(t=>t!==type):TYPES.filter(t=>prev.includes(t)||t===type));
  const toggleAccount = id => setVisibleAccounts(prev=>prev.includes(id)?prev.filter(value=>value!==id):[...prev,id]);
  const closeSearch = () => {abort();setGate(null);setError('');};

  return <div className="app">
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL}><img src={`${import.meta.env.BASE_URL}mark.svg`} alt=""/><strong>WAR ERA HISTORY</strong></a>{gate!=='key'&&<button className="quiet" onClick={changeKey}><Icon name="key"/>Change API key</button>}</header>
    <main aria-hidden={gate?true:undefined} inert={gate?'':undefined}>
      <div className="page-heading"><div><div className="eyebrow">WARERA ACCOUNT EXPLORER</div><h1>View the actions of a War Era account over time.</h1></div><span className="history-badge"><span/>Full available history</span></div>
      <section className="account-card" aria-label="Account summary"><div className="account-identities">{(account?accounts:[null]).map((user,ci)=><div className="account-entry" key={user?.id||'empty'}><div className="avatar" style={comparison?{color:ACCOUNT_COLORS[ci]}:undefined}>{user?user.name.slice(0,2).toUpperCase():<Icon name="search" width="24" height="24"/>}</div><div className="account-identity"><div className="account-name">{user?<a href={`https://app.warera.io/user/${user.id}`} target="_blank" rel="noreferrer">{user.name}<Icon name="link" width="14" height="14"/></a>:'No account selected'}</div><span className="account-id">{user?user.id:'Start with a username or profile link'}</span></div></div>)}</div><div className={`status ${phase}`} role="status"><span className={phase==='collecting'?'pulse':''}/>{status}</div><div className="account-actions"><button className="button secondary" onClick={stop} disabled={phase!=='collecting'}><Icon name="stop"/>Stop</button><button className="button primary" onClick={newUser} disabled={gate==='key'}><Icon name="search"/>Search new user</button></div></section>
      <section className="stats" aria-label="Collected data"><div><span>OBSERVED EVENTS</span><strong data-stat="events">{count.toLocaleString()}</strong><small>Own actions &amp; labeled observations</small></div><div><span>ACTIVE DATES</span><strong>{activeDays.toLocaleString()}</strong><small>Dates in {timeZone}</small></div><div><span>HISTORY REACHED</span><strong className="date-stat">{span?new Date(span.lo).toISOString().slice(0,10):'—'}</strong><small>Earliest observed date</small></div><div><span>ACQUISITION</span><strong>{finished}<em>/ {total}</em></strong><small>{pages.toLocaleString()} pages · {fetched.toLocaleString()} rows fetched</small></div></section>
      <section className="workspace"><div className="workspace-head"><nav role="tablist" aria-label="Deep dive views">{[['fingerprint','Fingerprint'],['heatmap','Heatmap'],['trends','Daily trends']].map(([value,label])=><button key={value} id={`tab-${value}`} role="tab" aria-selected={tab===value} aria-controls={`panel-${value}`} className={tab===value?'selected':''} onClick={()=>setTab(value)}>{label}</button>)}</nav><label className="timezone-picker">Timezone <select aria-label="Timezone" value={timeZone} onChange={e=>setTimeZone(e.target.value)}>{zones.map(zone=><option key={zone} value={zone}>{zone.replaceAll('_',' ')}</option>)}</select></label></div>
        <div className="chart-tools"><div className="type-filters" aria-label="Action filters"><button aria-pressed={types.length===TYPES.length} onClick={()=>setTypes(TYPES)}>All actions</button>{TYPES.map(type=><button key={type} aria-pressed={types.includes(type)} title={`${TYPE_HINTS[type]} Shift-click to show only ${LABELS[type]}.`} onClick={e=>toggleType(type,e)}><span className="type-dot" style={{background:colorMode==='color'?TYPE_COLORS[type]:'#4fc3e8'}}/>{LABELS[type]}</button>)}</div></div>
        {comparison&&<div className="account-filters" role="group" aria-label="Visible accounts"><button aria-pressed={visibleAccounts.length===accounts.length} onClick={()=>setVisibleAccounts(accounts.map(user=>user.id))}>All accounts</button>{accounts.map((user,ci)=><button key={user.id} aria-label={`Toggle ${user.name}`} aria-pressed={visibleAccounts.includes(user.id)} onClick={()=>toggleAccount(user.id)} style={{'--account-color':ACCOUNT_COLORS[ci]}}><span/>{user.name}</button>)}{tab==='fingerprint'&&<button className="xray-toggle" aria-pressed={xray} onClick={()=>setXray(value=>!value)} title="Grey out actions with no action by another visible account within 10 minutes.">X-ray overlaps</button>}</div>}
        <div className="display-options"><div className="color-mode" role="group" aria-label="Graph colors"><button aria-pressed={colorMode==='monochrome'} onClick={()=>setColorMode('monochrome')}>{comparison?'Color by account':'Monochrome'}</button><button aria-pressed={colorMode==='color'} onClick={()=>setColorMode('color')}><span className="color-symbol"/>Color by type</button></div><span>Shift-click an action to show only that type</span></div>
        <div className="chart-content" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={phase==='collecting'}>
          {phase==='collecting'&&<div className="graph-loading" role="status" data-testid="graph-loading"><span className="graph-spinner"/><div><strong>Loading history…</strong><span>{pages?`${pages.toLocaleString()} pages received · ${count.toLocaleString()} events plotted`:'Waiting for the first transaction pages…'}</span></div><progress max={total} value={finished} aria-label="Completed action types"/></div>}
          <ChartBoundary key={`${accounts.map(user=>user.id).join('/')||'empty'}/${tab}/${timeZone}`}>{comparison&&!allSeries.length?<div className="empty-chart">No accounts selected.</div>:!account||!span?<EmptyChart loading={phase==='collecting'} account={!!account}/>:tab==='fingerprint'?<Fingerprint series={allSeries} span={span} timeZone={timeZone} colorMode={colorMode} xray={comparison&&xray}/>:tab==='heatmap'?<DensityView series={allSeries} span={span} types={types} timeZone={timeZone} colorMode={colorMode}/>:<TrendsView series={allSeries} span={span} types={types} timeZone={timeZone} colorMode={colorMode}/>}</ChartBoundary>
        </div>
        <div className="collection-bar"><span className={`collection-dot ${phase==='collecting'?'pulse':''}`}/><span>{phase==='collecting'?`${finished} of ${total} action types complete · charts update as pages arrive`:status}</span><span className="queue-info">{queue.active} active · {queue.queued} queued</span></div>
        {account&&<details className="acquisition"><summary>Acquisition details{failed.length>0?` · ${failed.length} failed type(s)`:''}</summary>{accounts.map(user=><React.Fragment key={user.id}>{comparison&&<p>{user.name}</p>}<div className="receipts">{TYPES.map(type=><div key={type}><span>{LABELS[type]}</span><span>{(user.counts[type]?.actions||0).toLocaleString()} events · {(user.counts[type]?.rows||0).toLocaleString()} rows · {user.counts[type]?.pages||0} pages</span><span className={user.coverage[type]?.complete?'verified':'unverified'}>{user.coverage[type]?.complete?'Complete':user.coverage[type]?.error||(['stopped','partial'].includes(phase)?'Incomplete':user.coverage[type]?.reason||'Queued')}</span></div>)}</div></React.Fragment>)}</details>}
        {notice&&<p className="notice" role="status">{notice}</p>}
        {storageNotice&&<p className="notice" role="status">{storageNotice}</p>}
      </section>
      <footer><span>Observed activity describes timing; it does not establish intent.</span><a href="https://warerastats.io" target="_blank" rel="noreferrer">Supported by warerastats.io <Icon name="link" width="12" height="12"/></a></footer>
    </main>
    {gate&&<div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={e=>{if(e.key==='Escape'){if(gate==='user'&&account)closeSearch();else if(gate==='key'&&validatedKeyRef.current)closeKey();}if(e.key==='Tab'){const focusable=[...e.currentTarget.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
      <div className="dialog-icon"><Icon name={gate==='key'?'key':'search'} width="25" height="25"/></div><div className="eyebrow">{gate==='key'?'01 / CONNECT':'02 / CHOOSE AN ACCOUNT'}</div><h2 id="dialog-title">{gate==='key'?'War Era account explorer':'Who are we exploring?'}</h2><p>{gate==='key'?'Enter your WarEra API key to unlock the explorer. We’ll verify it before you begin.':'Paste a WarEra profile link, enter a user ID, or search by username.'}</p>
      {gate==='key'&&<div className="key-explainer">Go to your WAR ERA settings, at the bottom of the page press the blue <strong>CREATE TOKEN</strong> button and copy the key.</div>}
      <form onSubmit={gate==='key'?verify:search}><label htmlFor="entry">{gate==='key'?'WARERA API KEY':'USERNAME OR PROFILE LINK'}</label><input ref={firstInput} id="entry" aria-label={gate==='key'?'WarEra API key':'Username or profile link'} type={gate==='key'?'password':'text'} placeholder={gate==='key'?'wae_768abc...':undefined} autoComplete="off" spellCheck="false" required value={gate==='key'?keyInput:query} className={gate==='user'&&query===EXAMPLE_PROFILE?'example':''} onChange={e=>{gate==='key'?setKeyInput(e.target.value):setQuery(e.target.value);setError('');setCandidates([]);}} disabled={busy}/>{error&&<p role="alert" className="form-error">{error}</p>}<button className="button primary submit" disabled={busy||(gate==='key'?!keyInput.trim():!query.trim())}>{busy?<><span className="spinner"/>{gate==='key'?'Validating API key…':'Finding account…'}</>:<>{gate==='key'?'Validate & continue':'Start deep dive'}<Icon name="arrow"/></>}</button></form>
      {gate==='key'?<div className="dialog-footnote"><Icon name="check"/><span>Your validated key is saved in this browser. It is sent only to WarEra and the WarEraStats gateway.</span></div>:<div className="dialog-footnote"><Icon name="check"/><span>Full available history. No date, transaction, or page cap.</span></div>}
      {candidates.length>0&&<div className="candidates"><p>Choose a matching account</p>{candidates.map(user=><button key={user.id} onClick={()=>void startDive(user)}><strong>{user.name}</strong><small>{user.id}</small><Icon name="arrow"/></button>)}</div>}
      {gate==='user'&&account&&<button className="back-button" onClick={closeSearch}>Back to this deep dive</button>}
      {gate==='key'&&validatedKeyRef.current&&<button className="back-button" onClick={closeKey}>Keep previous key &amp; go back</button>}
    </section></div>}
  </div>;
}
