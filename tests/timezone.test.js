import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarTime,observedSpan,utcDayBoundary} from '../src/timezone.js';
import {dailySummary,DAY} from '../src/deepDiveAnalysis.js';

const time=s=>Date.parse(s);
const event=(date,type='wage')=>({t:time(date),type,timingKnown:true});
const complete={requestedFrom:0,requestedTo:Date.UTC(2026,0,1),complete:true};

test('timezone conversion changes calendar dates and supports fractional offsets',()=>{
  const t=time('2025-01-01T23:30:00Z');
  assert.equal(calendarTime(t,'UTC'),t);
  assert.equal(calendarTime(t,'Europe/Stockholm'),time('2025-01-02T00:30:00Z'));
  assert.equal(calendarTime(t,'Asia/Kolkata'),time('2025-01-02T05:00:00Z'));
  assert.equal(calendarTime(t,'America/New_York'),time('2025-01-01T18:30:00Z'));
});

test('all observations survive timezone rebucketing, with per-type hour counts',()=>{
  const evts=[event('2025-01-01T23:30:00Z'),event('2025-01-02T00:30:00Z','craftItem')];
  const s={evts,coverage:{wage:complete,craftItem:complete}},types=['wage','craftItem'];
  const utc=dailySummary(s,observedSpan(evts),types);
  const local=dailySummary(s,observedSpan(evts,'Europe/Stockholm'),types,false,'Europe/Stockholm');
  assert.deepEqual(utc.map(r=>r.count),[1,1]);assert.deepEqual(local.map(r=>r.count),[2]);
  assert.equal(local[0].hours[0],1);assert.equal(local[0].hours[1],1);
  assert.equal(local[0].hoursByType[0].wage,1);assert.equal(local[0].hoursByType[1].craftItem,1);
  assert.equal(local[0].complete,true);
});

test('DST days have correct real coverage boundaries (23 and 25 hours)',()=>{
  const spring=Date.UTC(2025,2,30),fall=Date.UTC(2025,9,26),zone='Europe/Stockholm';
  assert.equal(utcDayBoundary(spring+DAY,zone)-utcDayBoundary(spring,zone),23*3600000);
  assert.equal(utcDayBoundary(fall+DAY,zone)-utcDayBoundary(fall,zone),25*3600000);
  const evts=[event('2025-03-30T00:30:00Z'),event('2025-03-30T01:30:00Z')];
  const rows=dailySummary({evts,coverage:{wage:complete}},observedSpan(evts,zone),['wage'],false,zone);
  assert.equal(rows[0].hours[1],1);assert.equal(rows[0].hours[3],1);assert.equal(rows[0].hours[2],0);
});

test('coverage stays incomplete when a local day extends past the acquired UTC end',()=>{
  const zone='America/New_York',evts=[event('2025-01-02T04:30:00Z')];
  const rows=dailySummary({evts,coverage:{wage:{...complete,requestedTo:time('2025-01-02T03:00:00Z')}}},observedSpan(evts,zone),['wage'],false,zone);
  assert.equal(rows[0].complete,false);assert.equal(rows[0].hours[23],1);
});
