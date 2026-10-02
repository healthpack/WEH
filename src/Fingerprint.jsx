import React, { useEffect, useRef, useState } from 'react';
import { TYPE_COLORS } from './warera.js';
import { eventCalendarTime } from './timezone.js';
const C={bg:'#070b18',elev:'#121b35',line:'#1f2b4e',line2:'#2e3f6a',tx2:'#9fb0d4',tx3:'#5d6e96',link:'#4fc3e8',purple:'#a98bff'};
const MONO='ui-monospace, monospace';
const DAY_MS=86400000;
const SEL={background:C.elev,border:'1px solid '+C.line,color:C.tx2,fontSize:11,borderRadius:6,padding:'5px 9px',fontFamily:'inherit'};
const Empty=()=> <div className="empty-chart">Waiting for observed events…</div>;
const zoomStep=span=>span/DAY_MS>30?4:span/DAY_MS>7?3:span/DAY_MS>2?2:1.4;
export default function Fingerprint({ series, span, timeZone='UTC', colorMode='monochrome' }) {
  const ref = useRef(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setCanvasWidth(canvas.clientWidth));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const [zoom, setZoom] = useState(null);
  const [yRange, setYRange] = useState([0, 24]);   // visible hour band, for vertical scaling
  const [yLo, yHi] = yRange;
  const panRef = useRef(null);
  const view = zoom || (span ? [span.lo, span.hi] : null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !view) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 380, L = 34, B = 26;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const [lo, hi] = view, sp = Math.max(1, hi - lo);
    // Day separators, as long as they aren't so dense they turn into a solid block.
    const dayCount = sp / DAY_MS;
    const colW = (w - L - 4) / Math.max(1, dayCount);          // px per day column
    const dotW = Math.max(2, Math.min(10, colW * 0.7));        // widen dots as days get wider
    if (dayCount <= 90) {
      g.strokeStyle = '#131c33'; g.lineWidth = 1;
      for (let d = Math.ceil(lo / DAY_MS); d <= Math.floor(hi / DAY_MS); d++) {
        const x = L + ((d * DAY_MS - lo) / sp) * (w - L - 4);
        g.beginPath(); g.moveTo(x, B); g.lineTo(x, h - 14); g.stroke();
      }
    }
    // Hour gridlines follow the visible band, with a step that keeps ~4-6 labels whatever
    // the zoom — a fixed 6h step degenerates to one line once you scale into a shift.
    const yr = Math.max(0.05, yHi - yLo);
    const yPix = (hr) => B + (1 - (hr - yLo) / yr) * (h - B - 12);
    const step = yr > 12 ? 6 : yr > 6 ? 3 : yr > 2 ? 1 : yr > 0.75 ? 0.5 : 0.25;
    g.strokeStyle = '#1f2b4e'; g.lineWidth = 1;
    for (let hh = Math.ceil(yLo / step) * step; hh <= yHi + 1e-9; hh += step) {
      const y = yPix(hh);
      g.beginPath(); g.moveTo(L, y); g.lineTo(w, y); g.stroke();
      g.fillStyle = '#5d6e96'; g.font = '9px IBM Plex Mono, monospace';
      const hInt = Math.floor(hh), mn = Math.round((hh - hInt) * 60);
      g.fillText(step < 1 ? `${String(hInt).padStart(2, '0')}:${String(mn).padStart(2, '0')}` : String(hInt).padStart(2, '0'), 2, y + 3);
    }
    series.forEach(s => {
      for (const event of s.evts) {
        const t = eventCalendarTime(event,timeZone);
        if (t < lo || t > hi) continue;
        g.fillStyle = colorMode==='color' ? TYPE_COLORS[event.type] || C.link : C.link;
        g.globalAlpha = 0.7;
        // x is the DAY, y is the time within it. These have to stay independent: plotting
        // the exact timestamp on x makes y a function of x inside each day, so every day
        // renders as a 00→24 diagonal ramp and the horizontal sleep bands — the whole point
        // of the chart — disappear. Wide spans hid it (a day is a few px), but zoomed in it
        // turned into pure diagonal stripes carrying no more information than the timeline.
        const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
        const x = L + ((dayStart - lo) / sp) * (w - L - 4) + colW / 2;
        const d = new Date(t);
        const hr = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
        if (hr < yLo || hr > yHi) continue;
        g.fillRect(x - dotW / 2, yPix(hr) - 1, dotW, 2);
      }
      g.globalAlpha = 1;
    });
    g.fillStyle = '#5d6e96'; g.font = '9px IBM Plex Mono, monospace';
    for (let k = 0; k <= 3; k++) {
      const t = lo + (sp * k) / 3;
      const lbl = dayCount <= 4 ? new Date(t).toISOString().slice(5, 16).replace('T', ' ') : new Date(t).toISOString().slice(5, 10);
      g.fillText(lbl, Math.min(w - 70, L + (k / 3) * (w - L - 60)), h - 8);
    }
  }, [series, view, yLo, yHi, canvasWidth, timeZone, colorMode]);
  // Wheel zoom has to be a manual listener: React's onWheel is passive, so preventDefault
  // is ignored and the page scrolls instead of the chart zooming.
  useEffect(() => {
    const cv = ref.current; if (!cv || !view) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), L = 34, B = 26, PADB = 12;
      const k = e.deltaY < 0 ? 1 / 1.25 : 1.25;               // in / out, cursor-anchored
      // Shift, or the cursor over the hour axis strip, scales the VERTICAL band. Plain
      // wheel over the plot keeps scaling time, which is the common case.
      if (e.shiftKey || e.clientX - r.left < L) {
        const plotH = r.height - B - PADB;
        const fy = Math.max(0, Math.min(1, (e.clientY - r.top - B) / plotH));
        const hrAt = yHi - fy * (yHi - yLo);                   // hour under the cursor
        let nLo = hrAt - (hrAt - yLo) * k, nHi = hrAt + (yHi - hrAt) * k;
        if (nHi - nLo >= 24) { setYRange([0, 24]); return; }
        if (nHi - nLo < 0.25) { const c = (nLo + nHi) / 2; nLo = c - 0.125; nHi = c + 0.125; }
        setYRange([Math.max(0, nLo), Math.min(24, nHi)]);
        return;
      }
      const f = Math.max(0, Math.min(1, (e.clientX - r.left - L) / (r.width - L)));
      const [lo, hi] = view, sp = hi - lo, c = lo + f * sp;
      const nw = sp * k;
      if (span && nw >= (span.hi - span.lo)) { setZoom(null); return; }
      setZoom([c - (c - lo) * k, c + (hi - c) * k]);
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [view, span, yLo, yHi]);
  if (!span) return <Empty />;
  const dayCount = (view[1] - view[0]) / DAY_MS;
  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.tx2, marginBottom: 9, lineHeight: 1.5 }}>
        One dot per observed event — date across, hour of day up, in {timeZone}. Scroll to zoom; drag to pan.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, fontSize: 10, color: C.tx3, fontFamily: MONO }}>
        <span>span {dayCount >= 2 ? `${dayCount.toFixed(1)} days` : `${(dayCount * 24).toFixed(1)} h`}</span>
        {(zoom || yLo > 0 || yHi < 24) && <button onClick={() => { setZoom(null); setYRange([0, 24]); }} style={{ ...SEL, cursor: 'pointer', color: C.link }}>Reset zoom</button>}
        <span style={{ color: C.line2 }}>scroll = time · shift-scroll (or scroll the hour axis) = hours · drag = pan both</span>
        {(yLo > 0 || yHi < 24) && <span style={{ color: C.purple }}>hours {yLo.toFixed(1)}–{yHi.toFixed(1)}</span>}
      </div>
      <canvas role="img" aria-label={`Activity fingerprint by date and hour in ${timeZone}`} data-color-mode={colorMode} data-timezone={timeZone} ref={ref} style={{ width: '100%', background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, cursor: panRef.current?.moved ? 'grabbing' : 'crosshair', touchAction: 'none' }}
        onPointerDown={(e) => { panRef.current = { x: e.clientX, y: e.clientY, view, yRange, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerCancel={() => { panRef.current = null; }}
        onPointerMove={(e) => {
          const p = panRef.current; if (!p) return;
          const dx = e.clientX - p.x, dy = e.clientY - p.y;
          if (!p.moved && Math.hypot(dx, dy) < 4) return;      // small wobble is still a click
          p.moved = true;
          const r = e.currentTarget.getBoundingClientRect();
          const [lo, hi] = p.view, sp = hi - lo;
          const shift = -(dx / Math.max(1, r.width - 34)) * sp;
          setZoom([lo + shift, hi + shift]);
          // Vertical pan too, clamped to the 24h clock so you cannot drag off the dial.
          const [ylo, yhi] = p.yRange, yr = yhi - ylo;
          if (yr < 24) {
            const dh = (dy / Math.max(1, r.height - 38)) * yr;
            let nLo = ylo + dh, nHi = yhi + dh;
            if (nLo < 0) { nHi -= nLo; nLo = 0; }
            if (nHi > 24) { nLo -= (nHi - 24); nHi = 24; }
            setYRange([Math.max(0, nLo), Math.min(24, nHi)]);
          }
        }}
        onPointerUp={(e) => {
          const p = panRef.current; panRef.current = null;
          if (p?.moved) return;                                 // that was a pan, not a click
          const r = e.currentTarget.getBoundingClientRect();
          const L = 34, f = Math.max(0, (e.clientX - r.left - L) / (r.width - L));
          const [lo, hi] = view, sp = hi - lo, c = lo + f * sp;
          const out = e.ctrlKey || e.metaKey || e.shiftKey;
          const k = zoomStep(sp);
          const nw = out ? sp * k : sp / k;
          if (out && span && nw >= (span.hi - span.lo)) { setZoom(null); return; }
          setZoom([c - nw / 2, c + nw / 2]);
        }} />
    </div>
  );
}
