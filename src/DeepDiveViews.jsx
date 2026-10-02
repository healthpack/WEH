import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DAY, comparableEvent, dailySummary, rollingAverage, utcDate } from './deepDiveAnalysis.js';

const C = { bg: '#070b18', elev: '#121b35', line: '#2e3f6a', tx: '#eaf0ff', sub: '#9fb0d4', muted: '#5d6e96', link: '#4fc3e8', amber: '#ffab3d' };
const COLORS = ['#4fc3e8', '#ff5d6c', '#3fd0a3', '#ffab3d', '#a98bff', '#ffd84d', '#ff7ab8', '#7ee787', '#f78166', '#79c0ff'];
const TYPE_COLORS = { itemMarket: '#4fc3e8', wage: '#3fd0a3', donation: '#ff5d6c', articleTip: '#a98bff', openCase: '#ffab3d', craftItem: '#ffd84d', dismantleItem: '#ff7ab8', trading: '#79c0ff', battleLoot: '#f78166' };
const color = s => COLORS[s.ci % COLORS.length] || C.link;
const control = { background: C.elev, border: `1px solid ${C.line}`, borderRadius: 5, padding: '5px 8px', color: C.tx, font: 'inherit' };
const rowStyle = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: C.sub };
const noteStyle = { fontSize: 12, color: C.sub, lineHeight: 1.5, marginBottom: 12 };
const timeText = t => new Date(t).toISOString().slice(11, 19);
const duration = ms => ms == null ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : ms < 3600000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 3600000).toFixed(1)}h`;

function useWidth() {
  const ref = useRef(null), [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => setWidth(Math.max(220, Math.round(el.getBoundingClientRect().width)));
    resize(); const observer = new ResizeObserver(resize); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function Chart({ width, height, label, children }) {
  return <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', background: C.bg, borderRadius: 6, touchAction: 'pan-y' }}>
    <title>{label}</title>{children}
  </svg>;
}
function Hatch({ id }) {
  return <defs><pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M-1 1L1 -1M0 7L7 0M6 8L8 6" stroke={C.amber} opacity="0.32" strokeWidth="1" /></pattern></defs>;
}
function Frame({ width, height, left = 56 }) { return <rect x={left} y={12} width={width - left - 12} height={height - 56} fill="none" stroke={C.line} />; }
function DateAxis({ rows, width, height, x }) {
  const n = rows.length, steps = Math.min(n, width < 480 ? 3 : 5);
  const indexes = [...new Set(Array.from({ length: steps }, (_, i) => Math.round(i * (n - 1) / Math.max(1, steps - 1))))];
  return <g fill={C.sub} fontSize="11">
    {indexes.map((i, k) => <text key={i} x={x(i)} y={height - 26} textAnchor={k === 0 ? 'start' : k === indexes.length - 1 ? 'end' : 'middle'}>{utcDate(rows[i].day).slice(5)}</text>)}
    <text x={56} y={height - 7}>Date · UTC</text>
  </g>;
}
function CoverageLegend() { return <div style={{ ...noteStyle, color: C.amber }}>Hatching = incomplete or unverified acquisition. Blank = no observed events, not proof of inactivity. Unverified resource offer times and received transfers are excluded from density, clusters, gaps and lag comparisons. Battle loot includes cases only.</div>; }
function AccountLabel({ s, detail }) { return <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontSize: 12, margin: '12px 0 6px', color: C.tx }}><span style={{ width: 9, height: 9, background: color(s), borderRadius: 2 }} />{s.name}<span style={{ color: C.sub, marginLeft: 'auto' }}>{detail}</span></div>; }

export function IntervalControls({ span, interval, onSelect }) {
  const from = interval?.lo ?? span?.lo, to = interval?.hi ?? span?.hi;
  const [start, setStart] = useState(from == null ? '' : utcDate(from)), [end, setEnd] = useState(to == null ? '' : utcDate(to));
  useEffect(() => { setStart(from == null ? '' : utcDate(from)); setEnd(to == null ? '' : utcDate(to)); }, [from, to]);
  if (!span) return null;
  const lo = Date.parse(start + 'T00:00:00Z'), hi = Date.parse(end + 'T00:00:00Z') + DAY - 1;
  const valid = Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi && hi >= span.lo && lo <= span.hi;
  return <div style={{ ...rowStyle, margin: '10px 16px 0', flexShrink: 0 }}>
    <strong style={{ fontWeight: 500 }}>Date interval · UTC</strong>
    <label>From <input aria-label="Date interval from" type="date" value={start} min={utcDate(span.lo)} max={utcDate(span.hi)} onChange={e => setStart(e.target.value)} style={control} /></label>
    <label>To <input aria-label="Date interval to" type="date" value={end} min={utcDate(span.lo)} max={utcDate(span.hi)} onChange={e => setEnd(e.target.value)} style={control} /></label>
    <button disabled={!valid} onClick={() => onSelect({ lo: Math.max(lo, span.lo), hi: Math.min(hi, span.hi) })} style={{ ...control, cursor: valid ? 'pointer' : 'default' }}>Apply interval</button>
    {interval && <button onClick={() => onSelect(null)} style={{ ...control, cursor: 'pointer', color: C.link }}>Full interval</button>}
    <span aria-live="polite">{interval ? `${new Date(interval.lo).toISOString().slice(0, 19).replace('T', ' ')} → ${new Date(interval.hi).toISOString().slice(0, 19).replace('T', ' ')}` : 'Full fetched interval'} · filters the fingerprint; overview charts show the selection</span>
    {!valid && <span role="alert" style={{ color: C.amber }}>Choose an ordered date interval within the fetched window.</span>}
  </div>;
}

// The overview stays on the full acquisition window; its brush filters all other views.
function DateBrush({ rows, width, height, x, onSelect, interval }) {
  const drag = useRef(null), [preview, setPreview] = useState(null), [hover, setHover] = useState(null);
  const indexAt = e => {
    const svg = e.currentTarget.ownerSVGElement, box = svg.getBoundingClientRect();
    const px = (e.clientX - box.left) * width / box.width;
    return Math.max(0, Math.min(rows.length - 1, Math.floor((px - 56) / ((width - 68) / rows.length))));
  };
  const indices = preview || (interval ? [rows.findIndex(r => r.day + (r.days || 1) * DAY > interval.lo), rows.findLastIndex(r => r.day <= interval.hi)] : null);
  const hovered = rows[hover];
  return <g>
    {indices && indices[0] >= 0 && indices[1] >= indices[0] && <rect x={x(indices[0])} y={12} width={x(indices[1] + 1) - x(indices[0])} height={height - 56} fill={C.link} fillOpacity="0.08" stroke={C.tx} strokeOpacity="0.7" pointerEvents="none" />}
    <rect data-date-brush="true" x={56} y={12} width={width - 68} height={height - 56} fill="transparent" style={{ cursor: 'crosshair', touchAction: 'none' }}
      onPointerDown={e => { drag.current = indexAt(e); setPreview([drag.current, drag.current]); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const i = indexAt(e); setHover(i); if (drag.current != null) { const anchor = Math.min(rows.length - 1, drag.current); setPreview([Math.min(i, anchor), Math.max(i, anchor)]); } }}
      onPointerCancel={() => { drag.current = null; setPreview(null); }}
      onPointerUp={e => { if (drag.current == null) return; const i = indexAt(e), anchor = Math.min(rows.length - 1, drag.current), a = Math.min(i, anchor), b = Math.max(i, anchor); drag.current = null; setPreview(null); onSelect({ lo: rows[a].day, hi: rows[b].day + (rows[b].days || 1) * DAY - 1 }); }}>
      <title>{!hovered ? 'Click or drag a date interval; keyboard users can use the shared date inputs.' : `${utcDate(hovered.day)} · ${hovered.count ?? hovered.hours.reduce((a, b) => a + b, 0)} observed events${hovered.complete ? '' : ' · incomplete sample'}`}</title>
    </rect>
  </g>;
}

export function DensityView({ series, span, types, interval, onSelect }) {
  const [ref, width] = useWidth(), [normalize, setNormalize] = useState(true), hatch = useId().replace(/:/g, '');
  const actionTypes = types.filter(t => t !== 'trading');
  const summaries = useMemo(() => series.map(s => dailySummary(s, span, actionTypes, true)), [series, span, types]);
  const daysPerCell = Math.max(1, Math.ceil((summaries[0]?.length || 0) / Math.max(1, Math.floor((width - 68) / 6))));
  const rows = summaries.map(days => {
    const bins = [];
    for (let i = 0; i < days.length; i += daysPerCell) {
      const group = days.slice(i, i + daysPerCell);
      bins.push({ day: group[0].day, days: group.length, complete: group.every(r => r.complete), hours: Array.from({ length: 24 }, (_, h) => group.reduce((sum, r) => sum + r.hours[h], 0)) });
    }
    return bins;
  });
  const maximum = Math.max(1, ...rows.flatMap(days => days.flatMap(r => r.hours))), H = 350;
  return <div ref={ref} data-deep-view="density">
    <div style={rowStyle}><label><input type="checkbox" checked={normalize} onChange={e => setNormalize(e.target.checked)} /> Normalize each account</label><span>{daysPerCell} UTC day(s) per column · click or drag dates to filter every view</span></div>
    <CoverageLegend />
    {series.map((s, i) => {
      const days = rows[i]; if (!days.length) return <div key={s.id}>No acquisition interval available.</div>;
      const max = normalize ? Math.max(1, ...days.flatMap(r => r.hours)) : maximum, x = j => 56 + j * (width - 68) / days.length, y = h => H - 44 - h * (H - 56) / 24;
      return <div key={s.id}><AccountLabel s={s} detail={`${s.evts.filter(comparableEvent).length.toLocaleString()} known-time events · peak cell ${max}`} />
        <Chart width={width} height={H} label={`${s.name}: observed event density by UTC date and hour`}>
          <Hatch id={`${hatch}-${i}`} /><Frame width={width} height={H} />
          {days.map((d, j) => <g key={d.day}>
            {!d.complete && <rect x={x(j)} y={12} width={x(j + 1) - x(j)} height={H - 56} fill={`url(#${hatch}-${i})`} />}
            {d.hours.map((n, h) => n > 0 && <rect key={h} x={x(j)} y={y(h + 1)} width={Math.max(0.5, x(j + 1) - x(j) - 0.5)} height={(H - 56) / 24} fill={color(s)} fillOpacity={0.15 + 0.85 * n / max}><title>{`${utcDate(d.day)} · ${h}:00 UTC · ${n} observed events${d.complete ? '' : ' · incomplete sample'}`}</title></rect>)}
          </g>)}
          {[0, 6, 12, 18, 24].map(h => <text key={h} x={48} y={y(h) + 4} fill={C.sub} fontSize="11" textAnchor="end">{h}</text>)}
          <text transform={`translate(13 ${H / 2}) rotate(-90)`} textAnchor="middle" fill={C.sub} fontSize="11">Hour · UTC</text>
          <DateAxis rows={days} width={width} height={H} x={j => x(j + 0.5)} />
          <DateBrush rows={days} width={width} height={H} x={x} interval={interval} onSelect={onSelect} />
        </Chart>
      </div>;
    })}
  </div>;
}

export function TrendsView({ series, span, types, interval, onSelect }) {
  const [ref, width] = useWidth(), [relative, setRelative] = useState(false), [split, setSplit] = useState(false), hatch = useId().replace(/:/g, '');
  const summaries = useMemo(() => series.map(s => dailySummary(s, span, types)), [series, span, types]);
  const globalMax = Math.max(1, ...summaries.flatMap(rows => rows.map(r => r.count))), H = 350;
  return <div ref={ref} data-deep-view="trends">
    <div style={rowStyle}><label><input type="checkbox" checked={relative} onChange={e => setRelative(e.target.checked)} /> Relative to each account’s peak</label><label><input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} /> Split by action type</label><span>Click or drag dates to filter every view</span></div>
    <div style={noteStyle}>Daily observed totals and trailing 7-day mean. Hatching marks uncertain acquisition; the mean is withheld across incomplete days. Resource observations use sell-side offer time, whose owner is unverified.</div>
    {split && <div style={rowStyle}>{types.map(t => <span key={t}><span style={{ color: TYPE_COLORS[t] || C.muted }}>● </span>{t}</span>)}</div>}
    {series.map((s, i) => {
      const rows = summaries[i]; if (!rows.length) return null;
      const max = relative ? Math.max(1, ...rows.map(r => r.count)) : globalMax, x = j => 56 + (j + 0.5) * (width - 68) / rows.length, y = n => H - 44 - n / max * (H - 64);
      const line = values => values.map((v, j) => v == null ? '' : `${j === 0 || values[j - 1] == null ? 'M' : 'L'}${x(j)},${y(v)}`).join(' ');
      return <div key={s.id}><AccountLabel s={s} detail={`${s.evts.length.toLocaleString()} observed events · ${relative ? 'relative scale' : 'shared count scale'}`} />
        <Chart width={width} height={H} label={`${s.name}: daily observed totals and seven-day rolling mean`}>
          <Hatch id={`${hatch}-${i}`} /><Frame width={width} height={H} />
          {rows.map((r, j) => !r.complete && <rect key={j} x={56 + j * (width - 68) / rows.length} y={12} width={(width - 68) / rows.length} height={H - 56} fill={`url(#${hatch}-${i})`} />)}
          {(split ? types : ['count']).map(type => {
            const values = rows.map(r => type === 'count' ? r.count : r.byType[type] || 0), col = type === 'count' ? color(s) : TYPE_COLORS[type] || C.muted;
            return <g key={type}><path d={line(values)} fill="none" stroke={col} strokeWidth="1" opacity="0.55" />{rows.length === 1 && <circle cx={x(0)} cy={y(values[0])} r={3} fill={col} />}<path d={line(rollingAverage(rows, type))} fill="none" stroke={col} strokeWidth="2.5" /></g>;
          })}
          {[0, 0.5, 1].map(f => <text key={f} x={48} y={y(f * max) + 4} fill={C.sub} fontSize="11" textAnchor="end">{relative ? `${Math.round(f * 100)}%` : Math.round(f * max)}</text>)}
          <text transform={`translate(13 ${H / 2}) rotate(-90)`} textAnchor="middle" fill={C.sub} fontSize="11">{relative ? 'Relative count' : 'Events / day'}</text>
          <DateAxis rows={rows} width={width} height={H} x={x} />
          <DateBrush rows={rows} width={width} height={H} x={j => 56 + j * (width - 68) / rows.length} interval={interval} onSelect={onSelect} />
        </Chart>
      </div>;
    })}
  </div>;
}
