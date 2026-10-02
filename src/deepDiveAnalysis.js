// Descriptive summaries of fetched observations. No helper infers inactivity or intent.
export const DAY = 86400000;
export const comparableEvent = e => Number.isFinite(e.t) && e.type !== 'trading' && e.timingKnown !== false;
export const dayStart = t => Math.floor(t / DAY) * DAY;
export const utcDate = t => new Date(t).toISOString().slice(0, 10);

export function acquisitionSpan(series) {
  let lo = Infinity, hi = -Infinity;
  for (const s of series) {
    for (const c of Object.values(s.coverage || {})) {
      if (Number.isFinite(c?.requestedFrom)) lo = Math.min(lo, c.requestedFrom);
      if (Number.isFinite(c?.requestedTo)) hi = Math.max(hi, c.requestedTo);
    }
    for (const e of s.evts || s.times || []) if (Number.isFinite(e.t)) { lo = Math.min(lo, e.t); hi = Math.max(hi, e.t); }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo ? { lo, hi } : null;
}

export function covered(s, types, from, to) {
  return types.length > 0 && types.every(type => {
    const c = s.coverage?.[type];
    return c?.complete === true && Number.isFinite(c.requestedFrom) && Number.isFinite(c.requestedTo) && c.requestedFrom <= from && c.requestedTo >= to;
  });
}

export function clipSeries(series, interval) {
  if (!interval) return series;
  return series.map(s => {
    const evts = s.evts.filter(e => e.t >= interval.lo && e.t <= interval.hi);
    const ts = evts.map(e => e.t).sort((a, b) => a - b);
    const metricTs = evts.filter(comparableEvent).map(e => e.t).sort((a, b) => a - b);
    const lo = Math.max(interval.lo, s.metricRange?.[0] ?? Infinity), hi = Math.min(interval.hi, s.metricRange?.[1] ?? -Infinity);
    return { ...s, evts, ts, metricTs, metricRange: hi >= lo ? [lo, hi] : null };
  });
}

export function dailySummary(s, span, types, timingOnly = false) {
  if (!span) return [];
  const from = dayStart(span.lo), n = Math.floor((dayStart(span.hi) - from) / DAY) + 1;
  const rows = Array.from({ length: n }, (_, i) => {
    const day = from + i * DAY;
    return { day, count: 0, hours: Array(24).fill(0), byType: {}, complete: covered(s, types, Math.max(day, span.lo), Math.min(day + DAY - 1, span.hi)) };
  });
  for (const e of s.evts || []) {
    if (!Number.isFinite(e.t) || e.t < span.lo || e.t > span.hi || (timingOnly && !comparableEvent(e))) continue;
    const row = rows[Math.floor((e.t - from) / DAY)];
    row.count++; row.hours[new Date(e.t).getUTCHours()]++; row.byType[e.type] = (row.byType[e.type] || 0) + 1;
  }
  return rows;
}

// A trailing average exists only when every contributing day's acquisition is verified.
export function rollingAverage(rows, key = 'count', window = 7) {
  return rows.map((row, i) => {
    const start = i - window + 1;
    if (start < 0 || rows.slice(start, i + 1).some(r => !r.complete)) return null;
    return rows.slice(start, i + 1).reduce((sum, r) => sum + (key === 'count' ? r.count : r.byType[key] || 0), 0) / window;
  });
}
