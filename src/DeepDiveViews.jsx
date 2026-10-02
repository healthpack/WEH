import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DAY, comparableEvent, dailySummary, rollingAverage, utcDate } from './deepDiveAnalysis.js';
import { TYPE_COLORS, LABELS } from './warera.js';

const C = { bg:'#070b18', line:'#2e3f6a', sub:'#9fb0d4', muted:'#5d6e96', link:'#4fc3e8', amber:'#ffab3d' };
const rowStyle = {display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:12,fontSize:12,color:C.sub};
const noteStyle = {fontSize:11,color:C.sub,lineHeight:1.6,marginBottom:12};

function useWidth() {
  const ref=useRef(null), [width,setWidth]=useState(720);
  useEffect(()=>{
    const el=ref.current;if(!el)return;
    const resize=()=>setWidth(Math.max(220,Math.round(el.getBoundingClientRect().width)));
    resize();const observer=new ResizeObserver(resize);observer.observe(el);
    return ()=>observer.disconnect();
  },[]);
  return [ref,width];
}
function Chart({width,height,label,children}) {
  return <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} style={{display:'block',width:'100%',background:C.bg,borderRadius:6}}><title>{label}</title>{children}</svg>;
}
function Hatch({id}) {
  return <defs><pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M-1 1L1 -1M0 7L7 0M6 8L8 6" stroke={C.amber} opacity="0.32" strokeWidth="1"/></pattern></defs>;
}
function Frame({width,height}) {return <rect x={56} y={12} width={width-68} height={height-56} fill="none" stroke={C.line}/>;}
function DateAxis({rows,width,height,x,timeZone}) {
  const steps=Math.min(rows.length,width<480?3:5);
  const indexes=[...new Set(Array.from({length:steps},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,steps-1))))];
  return <g fill={C.sub} fontSize="11">
    {indexes.map((i,k)=><text key={i} x={x(i)} y={height-26} textAnchor={k===0?'start':k===indexes.length-1?'end':'middle'}>{utcDate(rows[i].day).slice(5)}</text>)}
    <text x={56} y={height-7}>Date · {timeZone}</text>
  </g>;
}
function AccountLabel({s,detail}) {
  return <div style={{...rowStyle,margin:'12px 0 6px'}}><span style={{width:9,height:9,background:C.link,borderRadius:2}}/>{s.name}<span style={{marginLeft:'auto'}}>{detail}</span></div>;
}

export function DensityView({series,span,types,timeZone='UTC',colorMode='monochrome'}) {
  const [ref,width]=useWidth(),hatch=useId().replace(/:/g,'');
  const summaries=useMemo(()=>series.map(s=>dailySummary(s,span,types.filter(t=>t!=='trading'),true,timeZone)),[series,span,types,timeZone]);
  const daysPerCell=Math.max(1,Math.ceil((summaries[0]?.length||0)/Math.max(1,Math.floor((width-68)/6))));
  const rows=summaries.map(days=>{
    const bins=[];
    for(let i=0;i<days.length;i+=daysPerCell) {
      const group=days.slice(i,i+daysPerCell),hours=Array(24).fill(0),hoursByType=Array.from({length:24},()=>({}));
      for(const day of group)for(let h=0;h<24;h++){
        hours[h]+=day.hours[h];
        for(const [type,count] of Object.entries(day.hoursByType[h]))hoursByType[h][type]=(hoursByType[h][type]||0)+count;
      }
      bins.push({day:group[0].day,days:group.length,complete:group.every(r=>r.complete),hours,hoursByType});
    }
    return bins;
  });
  const maximum=Math.max(1,...rows.flatMap(days=>days.flatMap(r=>r.hours))),H=350;
  return <div ref={ref} data-deep-view="density" data-timezone={timeZone}>
    <div style={noteStyle}>{daysPerCell} calendar day(s) per column. Hatching marks incomplete acquisition.{colorMode==='color'?' Color segments show the action mix within each cell.':''}</div>
    {series.map((s,i)=>{
      const days=rows[i];if(!days.length)return null;
      const x=j=>56+j*(width-68)/days.length,y=h=>H-44-h*(H-56)/24;
      return <div key={s.id}><AccountLabel s={s} detail={`${s.evts.filter(comparableEvent).length.toLocaleString()} known-time events · peak cell ${maximum}`}/>
        <Chart width={width} height={H} label={`${s.name}: observed event heatmap by date and hour in ${timeZone}`}>
          <Hatch id={`${hatch}-${i}`}/><Frame width={width} height={H}/>
          {days.map((day,j)=><g key={day.day}>
            {!day.complete&&<rect x={x(j)} y={12} width={x(j+1)-x(j)} height={H-56} fill={`url(#${hatch}-${i})`}/>}
            {day.hours.map((count,h)=>{
              if(!count)return null;
              const cellWidth=Math.max(.5,x(j+1)-x(j)-.5),segments=colorMode==='color'?types.filter(type=>day.hoursByType[h][type]).map(type=>({type,count:day.hoursByType[h][type]})):[{type:'count',count}];
              let offset=0;
              const date=`${utcDate(day.day)}${day.days>1?' – '+utcDate(day.day+(day.days-1)*DAY):''}`;
              return <g key={h}>{segments.map(segment=>{
                const start=offset;offset+=segment.count/count;
                return <rect key={segment.type} data-event-type={segment.type} x={x(j)+start*cellWidth} y={y(h+1)} width={segment.count/count*cellWidth} height={(H-56)/24} fill={TYPE_COLORS[segment.type]||C.link} fillOpacity={.15+.85*count/maximum}><title>{`${date} · ${h}:00 ${timeZone} · ${segment.count} ${LABELS[segment.type]||'observed'} events${day.complete?'':' · incomplete sample'}`}</title></rect>;
              })}</g>;
            })}
          </g>)}
          {[0,6,12,18,24].map(h=><text key={h} x={48} y={y(h)+4} fill={C.sub} fontSize="11" textAnchor="end">{h}</text>)}
          <text transform={`translate(13 ${H/2}) rotate(-90)`} textAnchor="middle" fill={C.sub} fontSize="11">Hour · {timeZone}</text>
          <DateAxis rows={days} width={width} height={H} x={j=>x(j+.5)} timeZone={timeZone}/>
        </Chart>
      </div>;
    })}
  </div>;
}

export function TrendsView({series,span,types,timeZone='UTC',colorMode='monochrome'}) {
  const [ref,width]=useWidth(),hatch=useId().replace(/:/g,'');
  const summaries=useMemo(()=>series.map(s=>dailySummary(s,span,types,false,timeZone)),[series,span,types,timeZone]);
  const maximum=Math.max(1,...summaries.flatMap(rows=>rows.map(r=>r.count))),H=350;
  return <div ref={ref} data-deep-view="trends" data-timezone={timeZone}>
    <div style={noteStyle}>Daily observed totals and trailing 7-day mean. Hatching marks incomplete acquisition; the mean is withheld across incomplete days.</div>
    {series.map((s,i)=>{
      const rows=summaries[i];if(!rows.length)return null;
      const x=j=>56+(j+.5)*(width-68)/rows.length,y=n=>H-44-n/maximum*(H-64);
      const line=values=>values.map((v,j)=>v==null?'':`${j===0||values[j-1]==null?'M':'L'}${x(j)},${y(v)}`).join(' ');
      return <div key={s.id}><AccountLabel s={s} detail={`${s.evts.length.toLocaleString()} observed events`}/>
        <Chart width={width} height={H} label={`${s.name}: daily observed totals and seven-day rolling mean in ${timeZone}`}>
          <Hatch id={`${hatch}-${i}`}/><Frame width={width} height={H}/>
          {rows.map((r,j)=>!r.complete&&<rect key={j} x={56+j*(width-68)/rows.length} y={12} width={(width-68)/rows.length} height={H-56} fill={`url(#${hatch}-${i})`}/>)}
          {(colorMode==='color'?types:['count']).map(type=>{
            const values=rows.map(r=>type==='count'?r.count:r.byType[type]||0),col=TYPE_COLORS[type]||C.link;
            return <g key={type} data-event-type={type}><path d={line(values)} fill="none" stroke={col} strokeWidth="1" opacity=".55"/>{rows.length===1&&<circle cx={x(0)} cy={y(values[0])} r={3} fill={col}/>}<path d={line(rollingAverage(rows,type))} fill="none" stroke={col} strokeWidth="2.5"/></g>;
          })}
          {[0,.5,1].map(f=><text key={f} x={48} y={y(f*maximum)+4} fill={C.sub} fontSize="11" textAnchor="end">{Math.round(f*maximum)}</text>)}
          <text transform={`translate(13 ${H/2}) rotate(-90)`} textAnchor="middle" fill={C.sub} fontSize="11">Events / day</text>
          <DateAxis rows={rows} width={width} height={H} x={x} timeZone={timeZone}/>
          {rows.map((row,j)=><rect key={row.day} x={56+j*(width-68)/rows.length} y={12} width={(width-68)/rows.length} height={H-56} fill="transparent"><title>{`${utcDate(row.day)} · ${timeZone} · ${row.count} observed events${row.complete?'':' · incomplete sample'}`}</title></rect>)}
        </Chart>
      </div>;
    })}
  </div>;
}
