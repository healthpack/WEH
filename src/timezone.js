const DAY = 86400000;
const formatters = new Map(), boundaries = new Map(), eventTimes = new WeakMap();

// Display coordinates use calendar dates and clock hours in the selected zone.
// Original timestamps remain intact for acquisition and coverage checks.
export function calendarTime(timestamp, timeZone = 'UTC') {
  if (timeZone === 'UTC') return timestamp;
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone, calendar:'gregory', numberingSystem:'latn', hourCycle:'h23',
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(timestamp).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const milliseconds = ((timestamp % 1000) + 1000) % 1000;
  return Date.UTC(parts.year, parts.month-1, parts.day, parts.hour, parts.minute, parts.second, milliseconds);
}

export function eventCalendarTime(event, timeZone = 'UTC') {
  if (timeZone === 'UTC') return event.t;
  const previous = eventTimes.get(event);
  if (previous?.timeZone === timeZone && previous.t === event.t) return previous.value;
  const value = calendarTime(event.t, timeZone);
  eventTimes.set(event, {timeZone,t:event.t,value});
  return value;
}

// The first real instant of a local calendar day. Searching the date boundary
// handles 23/25-hour days and zones where clocks jump over midnight.
export function utcDayBoundary(day, timeZone = 'UTC') {
  if (timeZone === 'UTC') return day;
  const key = `${timeZone}/${day}`;
  if (boundaries.has(key)) return boundaries.get(key);
  let lo = day - 36*3600000, hi = day + 36*3600000;
  while (lo < hi) {
    const mid = Math.floor((lo+hi)/2);
    const localDay = Math.floor(calendarTime(mid,timeZone)/DAY)*DAY;
    if (localDay < day) lo = mid+1; else hi = mid;
  }
  boundaries.set(key,lo);
  return lo;
}

export function observedSpan(events, timeZone = 'UTC') {
  let lo=Infinity, hi=-Infinity;
  for (const event of events) {
    const t=eventCalendarTime(event,timeZone);
    if (!Number.isFinite(t)) continue;
    lo=Math.min(lo,t);hi=Math.max(hi,t);
  }
  return Number.isFinite(lo)?{lo:Math.floor(lo/DAY)*DAY,hi:Math.floor(hi/DAY)*DAY+DAY-1}:null;
}

export function timeZoneOptions() {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const supported = Intl.supportedValuesOf?.('timeZone') || ['Europe/Stockholm','America/New_York','Asia/Kolkata','Asia/Tokyo','Pacific/Auckland'];
  return ['UTC',...[...new Set([local,...supported])].filter(z=>z&&z!=='UTC').sort()];
}
