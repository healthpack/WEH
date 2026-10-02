import { eventCalendarTime, utcDayBoundary } from './timezone.js';

// Descriptive summaries of fetched observations. No helper infers inactivity or intent.
export const DAY = 86400000;
export const comparableEvent = e => Number.isFinite(e.t) && e.type !== 'trading' && e.timingKnown !== false;
export const dayStart = t => Math.floor(t / DAY) * DAY;
export const utcDate = t => new Date(t).toISOString().slice(0, 10);

export function covered(s, types, from, to) {
  return types.length > 0 && types.every(type => {
    const c = s.coverage?.[type];
    return c?.complete === true && Number.isFinite(c.requestedFrom) && Number.isFinite(c.requestedTo) && c.requestedFrom <= from && c.requestedTo >= to;
  });
}

export function dailySummary(s, span, types, timingOnly = false, timeZone = 'UTC') {
  if (!span) return [];
  const from = dayStart(span.lo), n = Math.floor((dayStart(span.hi) - from) / DAY) + 1;
  const rows = Array.from({ length: n }, (_, i) => {
    const day = from + i * DAY;
    return { day, count: 0, hours: Array(24).fill(0), hoursByType:Array.from({length:24},()=>({})), byType: {},
      complete:covered(s,types,utcDayBoundary(day,timeZone),utcDayBoundary(day+DAY,timeZone)-1) };
  });
  for (const e of s.evts || []) {
    if (!Number.isFinite(e.t) || (timingOnly && !comparableEvent(e))) continue;
    const t = eventCalendarTime(e,timeZone);
    if (t < span.lo || t > span.hi) continue;
    const row = rows[Math.floor((t - from) / DAY)], hour = new Date(t).getUTCHours();
    row.count++; row.hours[hour]++; row.byType[e.type] = (row.byType[e.type] || 0) + 1;
    row.hoursByType[hour][e.type] = (row.hoursByType[hour][e.type] || 0) + 1;
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
