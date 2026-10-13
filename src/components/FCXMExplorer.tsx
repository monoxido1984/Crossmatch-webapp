import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FCSFile, Gate } from '../types/cytometry';
import { STEPS, axisForStep, computeWorkflow, makeGate, suggestWorkflow, type Step } from '../services/fcxmWorkflow';

interface Props { file: FCSFile; gates: Gate[]; onGates: (next: Gate[]) => void; }
type Point={x:number;y:number};
const W=750,H=510,L=60,T=30,PW=650,PH=425;
const fmt=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('es-AR',{maximumFractionDigits:1});
const gateKeys:Record<string,string>={singlets:'cx_singlets',lymph:'cx_lymph',cd45:'cx_cd45',phenotype:'cx_t',iggT:'cx_t',iggB:'cx_b'};

export const FCXMExplorer:React.FC<Props>=({file,gates,onGates})=>{
  const [step,setStep]=useState<Step>('singlets');
  const [mode,setMode]=useState<'rectangle'|'polygon'>('rectangle');
  const [vertices,setVertices]=useState<Point[]>([]);
  const [pointerStart,setPointerStart]=useState<Point|null>(null);
  const [pointerEnd,setPointerEnd]=useState<Point|null>(null);
  const [histSelection,setHistSelection]=useState<[number,number]|null>(null);
  const [message,setMessage]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null);
  const overlay=useRef<HTMLCanvasElement>(null);
  const computed=useMemo(()=>computeWorkflow(file,gates),[file,gates]);
  const position=STEPS.findIndex(x=>x.id===step);
  const histogram=step==='iggT'||step==='iggB';
  const [x,y]=axisForStep(file,step);
  const parentId=position===0?'root':position===1?'cx_singlets':position===2?'cx_lymph':position===3?'cx_cd45':step==='iggT'?'cx_t':'cx_b';
  const subset=computed.indices.get(parentId)||new Uint32Array(0);
  const data=file.isCompensated&&file.compensatedEvents?file.compensatedEvents:file.events;
  const transform=(v:number,name:string)=>/FSC|SSC/i.test(name)?v:Math.asinh(v/150);
  const inverse=(v:number,name:string)=>/FSC|SSC/i.test(name)?v:150*Math.sinh(v);
  const dots=useMemo(()=>{
    if(!x)return [] as Point[];
    const result:Point[]=[];const stride=Math.max(1,Math.ceil(subset.length/8000));
    for(let i=0;i<subset.length;i+=stride){const off=subset[i]*file.parameters.length;
      const vx=data[off+x.index],vy=y?data[off+y.index]:0;
      if(Number.isFinite(vx)&&Number.isFinite(vy))result.push({x:vx,y:vy});
    }
    return result;
  },[file,subset,x,y]);
  const extent=useMemo(()=>{
    if(!dots.length||!x)return[0,1,0,1];
    const quant=(a:number[],p:number)=>{a.sort((v,w)=>v-w);return a[Math.floor((a.length-1)*p)]};
    const xs=dots.map(v=>transform(v.x,x.name));
    const lo=quant([...xs],.002),hi=quant(xs,.998),dx=Math.max(0.01,hi-lo);
    if(histogram)return[lo-.06*dx,hi+.06*dx,0,1];
    const ys=dots.map(v=>transform(v.y,y!.name));
    const yl=quant([...ys],.002),yh=quant(ys,.998),dy=Math.max(.01,yh-yl);
    return[lo-.06*dx,hi+.06*dx,yl-.06*dy,yh+.06*dy];
  },[dots,x,y,histogram]);
  const sx=(v:number)=>L+(transform(v,x?.name||'')-extent[0])/(extent[1]-extent[0])*PW;
  const sy=(v:number)=>T+PH-(transform(v,y?.name||'')-extent[2])/(extent[3]-extent[2])*PH;
  const rawX=(v:number)=>inverse(extent[0]+(v-L)/PW*(extent[1]-extent[0]),x?.name||'');
  const rawY=(v:number)=>inverse(extent[2]+(T+PH-v)/PH*(extent[3]-extent[2]),y?.name||'');
  const coord=(e:React.PointerEvent<HTMLCanvasElement>):Point=>{
    const rect=e.currentTarget.getBoundingClientRect();
    return{x:(e.clientX-rect.left)*W/rect.width,y:(e.clientY-rect.top)*H/rect.height};
  };
  const active=gates.filter(g=>step==='phenotype'?(g.id==='cx_t'||g.id==='cx_b'):g.id===gateKeys[step]);
  const update=(newGates:Gate[])=>{
    if(!newGates.length)return;const ids=new Set(newGates.map(g=>g.id));
    onGates([...gates.filter(g=>!ids.has(g.id)),...newGates]);
    setVertices([]);setPointerStart(null);setPointerEnd(null);
    if(position<3)setStep(STEPS[position+1].id);
    else if(step==='phenotype')setStep('iggT');
  };
  const clear=()=>{
    const ids=new Set(active.map(g=>g.id));
    let more=true;while(more){more=false;for(const gate of gates){
      if(gate.parentId&&ids.has(gate.parentId)&&!ids.has(gate.id)){ids.add(gate.id);more=true;}
    }}
    onGates(gates.filter(g=>!ids.has(g.id)));setHistSelection(null);setVertices([]);
  };
  useEffect(()=>{setVertices([]);setPointerStart(null);setPointerEnd(null);setHistSelection(null);},[file.id,step]);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#e2e8f0';ctx.lineWidth=1;
    for(let i=0;i<=5;i++){let a=L+i*PW/5,b=T+i*PH/5;
      ctx.beginPath();ctx.moveTo(a,T);ctx.lineTo(a,T+PH);ctx.stroke();
      ctx.beginPath();ctx.moveTo(L,b);ctx.lineTo(L+PW,b);ctx.stroke();}
    ctx.save();ctx.beginPath();ctx.rect(L,T,PW,PH);ctx.clip();
    if(histogram){
      const bins=new Uint32Array(120);let max=1;
      for(const p of dots){const i=Math.floor((transform(p.x,x?.name||'')-extent[0])/(extent[1]-extent[0])*120);
        if(i>=0&&i<120){bins[i]++;max=Math.max(max,bins[i]);}}
      ctx.fillStyle='#2563eb';bins.forEach((v,i)=>{const h=v/max*(PH-6);ctx.fillRect(L+i*PW/120,T+PH-h,PW/120,h);});
      if(histSelection){const a=sx(histSelection[0]),b=sx(histSelection[1]);
        ctx.fillStyle='rgba(5,150,105,.18)';ctx.fillRect(a,T,b-a,PH);
        ctx.strokeStyle='#059669';ctx.lineWidth=2;for(const v of [a,b]){ctx.beginPath();ctx.moveTo(v,T);ctx.lineTo(v,T+PH);ctx.stroke();}}
    }else{
      ctx.fillStyle='rgba(37,99,235,.44)';
      for(const p of dots){const a=sx(p.x),b=sy(p.y);if(Number.isFinite(a)&&Number.isFinite(b))ctx.fillRect(a,b,2,2);}
      for(const gate of active){
        ctx.strokeStyle=gate.color;ctx.fillStyle=gate.color+'22';ctx.lineWidth=2;
        const box=gate.rectangleBounds;
        const points=gate.polygonPoints||(box?[{x:box.minX,y:box.minY},{x:box.maxX,y:box.minY},{x:box.maxX,y:box.maxY},{x:box.minX,y:box.maxY}]:[]);
        if(points.length){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(sx(p.x),sy(p.y)):ctx.moveTo(sx(p.x),sy(p.y)));ctx.closePath();ctx.fill();ctx.stroke();}
        if(gate.quadrantCenter){const a=sx(gate.quadrantCenter.x),b=sy(gate.quadrantCenter.y);
          ctx.beginPath();ctx.moveTo(a,T);ctx.lineTo(a,T+PH);ctx.moveTo(L,b);ctx.lineTo(L+PW,b);ctx.stroke();}
      }
    }
    ctx.restore();ctx.strokeStyle='#94a3b8';ctx.strokeRect(L,T,PW,PH);
    ctx.fillStyle='#334155';ctx.font='13px sans-serif';ctx.textAlign='center';
    ctx.fillText(x?.stain||x?.name||'',L+PW/2,H-15);
    if(!histogram){ctx.save();ctx.translate(19,T+PH/2);ctx.rotate(-Math.PI/2);ctx.fillText(y?.stain||y?.name||'',0,0);ctx.restore();}
    if(dots.length===0){ctx.font='17px sans-serif';ctx.fillText('Sin eventos en la población seleccionada',L+PW/2,T+PH/2);}
  },[dots,extent,active,histogram,histSelection,x,y]);
  useEffect(()=>{
    const ctx=overlay.current?.getContext('2d');if(!ctx)return;
    ctx.clearRect(0,0,W,H);ctx.strokeStyle='#059669';ctx.fillStyle='rgba(5,150,105,.16)';ctx.lineWidth=2;ctx.setLineDash([5,4]);
    if(pointerStart&&pointerEnd){if(histogram)ctx.fillRect(pointerStart.x,T,pointerEnd.x-pointerStart.x,PH);
      else ctx.strokeRect(pointerStart.x,pointerStart.y,pointerEnd.x-pointerStart.x,pointerEnd.y-pointerStart.y);}
    if(vertices.length){ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
    ctx.setLineDash([]);
  },[pointerStart,pointerEnd,vertices,histogram]);
  const down=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    const p=coord(e);if(p.x<L||p.x>L+PW||p.y<T||p.y>T+PH)return;
    if(step==='phenotype'){update(makeGate(file,step,{type:'quadrants',center:{x:rawX(p.x),y:rawY(p.y)}}));return;}
    if(mode==='polygon'&&!histogram){
      if(vertices.length>=3&&Math.hypot(p.x-vertices[0].x,p.y-vertices[0].y)<14){
        update(makeGate(file,step,{type:'polygon',points:vertices.map(v=>({x:rawX(v.x),y:rawY(v.y)}))}));return;}
      setVertices(prev=>[...prev,p]);return;
    }
    setPointerStart(p);setPointerEnd(p);e.currentTarget.setPointerCapture(e.pointerId);
  };
  const up=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(!pointerStart)return;const p=coord(e);const a=Math.min(pointerStart.x,p.x),b=Math.max(pointerStart.x,p.x);
    if(histogram){if(b-a>6)setHistSelection([rawX(a),rawX(b)]);}
    else if(Math.abs(p.x-pointerStart.x)>8&&Math.abs(p.y-pointerStart.y)>8)
      update(makeGate(file,step,{type:'rectangle',bounds:{
        minX:rawX(a),maxX:rawX(b),minY:Math.min(rawY(pointerStart.y),rawY(p.y)),maxY:Math.max(rawY(pointerStart.y),rawY(p.y))}}));
    setPointerStart(null);setPointerEnd(null);
  };
  const exportResults=()=>{
    const csv='archivo,poblacion,eventos,media_IgG,mediana_IgG\n'+(['T','B'] as const).map(key=>{
      const r=computed.intensities[key];return[file.name,key,r.count,r.mean??'',r.median??''].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',');
    }).join('\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download='fcxm_igg_resultados.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const exportWorkflow=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(gates,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='fcxm_workflow.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const selected=step==='iggB'?'B':'T';
  const metric=computed.intensities[selected];
  return <div className="flex flex-1 overflow-hidden bg-slate-50">
    <aside className="w-60 shrink-0 bg-white border-r overflow-y-auto">
      <div className="p-4 font-bold text-sm border-b">Gating FCXM</div>
      {STEPS.map(s=><button key={s.id} onClick={()=>setStep(s.id)}
        className={'w-full text-left p-3 border-b text-sm '+(s.id===step?'bg-blue-50 text-blue-800':'hover:bg-slate-50')}>
        <span className="mr-2">{gates.some(g=>g.id===gateKeys[s.id])?'✓':'○'}</span>{s.label}
        <div className="text-xs text-slate-500 mt-1">{s.hint}</div>
      </button>)}
      <div className="p-3 space-y-2">
        <button className="w-full border rounded p-2 text-xs" onClick={()=>{
          const suggested=suggestWorkflow(file);
          if(suggested.length)onGates(suggested);
          else setMessage('No están disponibles todos los canales necesarios.');
        }}>Sugerir gates (revisar)</button>
        <button className="w-full border rounded p-2 text-xs" disabled={!gates.length} onClick={exportWorkflow}>Guardar workflow JSON</button>
      </div>
    </aside>
    <main className="flex-1 min-w-0 overflow-y-auto p-4">
      <div className="flex justify-between items-center gap-2 mb-3 flex-wrap">
        <div><h2 className="font-semibold">{STEPS[position].label}</h2>
          <p className="text-xs text-slate-500">{subset.length.toLocaleString('es-AR')} eventos · {STEPS[position].hint}</p></div>
        <div className="flex items-center gap-2 text-xs">
          {!histogram&&step!=='phenotype'&&<>
            <button onClick={()=>setMode('rectangle')} className={'p-2 border rounded '+(mode==='rectangle'?'bg-blue-100':'bg-white')}>Rectángulo</button>
            <button onClick={()=>setMode('polygon')} className={'p-2 border rounded '+(mode==='polygon'?'bg-blue-100':'bg-white')}>Polígono</button></>}
          {step==='phenotype'&&<span>Clic para situar cuadrantes</span>}
          {histogram&&<span>Arrastrá para seleccionar un rango</span>}
          <button className="border rounded p-2 bg-white" onClick={clear}>Borrar selección</button>
        </div>
      </div>
      {(!x||(!histogram&&!y))?<div className="p-6 rounded bg-amber-50 text-amber-700">No se encontraron los canales de este paso. Revisá los nombres de parámetros.</div>:
        <div className="relative max-w-[950px] w-full mx-auto border rounded-lg bg-white" style={{aspectRatio:'750 / 510'}}>
          <canvas ref={canvas} width={W} height={H} className="absolute inset-0 w-full h-full"/>
          <canvas ref={overlay} width={W} height={H} className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            onPointerDown={down} onPointerMove={e=>{if(pointerStart)setPointerEnd(coord(e));}}
            onPointerUp={up} onDoubleClick={()=>{
              if(mode==='polygon'&&vertices.length>=3)update(makeGate(file,step,{type:'polygon',points:vertices.map(v=>({x:rawX(v.x),y:rawY(v.y)}))}));
            }}/>
        </div>}
      {histogram&&<div className="mt-4 p-4 bg-white border rounded">
        <div className="font-semibold text-sm">IgG FITC · linfocitos {selected}</div>
        <div className="grid grid-cols-3 gap-3 mt-3 text-sm"><div>Eventos: <b>{fmt(metric.count)}</b></div>
          <div>MFI (media): <b>{fmt(metric.mean)}</b></div><div>Mediana: <b>{fmt(metric.median)}</b></div></div>
        {histSelection&&<div className="text-xs text-teal-700 mt-2">Rango seleccionado: {fmt(histSelection[0])} – {fmt(histSelection[1])} (MFI de la población completa arriba)</div>}
      </div>}
      <p className="text-xs text-slate-500 mt-3">Los gates se guardan en unidades originales del FCS, independientemente de la transformación visual.</p>
      {message&&<p className="text-xs text-amber-800 mt-2">{message}</p>}
    </main>
    <aside className="w-64 shrink-0 bg-white border-l p-4 overflow-y-auto">
      <div className="font-bold text-sm">Reporte IgG FITC</div>
      <p className="text-xs text-slate-500 mt-1 break-all">{file.name}</p>
      {(['T','B'] as const).map(key=><div key={key} className="border rounded p-3 mt-3 text-sm">
        <div className="font-semibold">Linfocitos {key}</div>
        <div className="mt-1 text-xs">Eventos: {fmt(computed.intensities[key].count)}</div>
        <div className="mt-1 text-xs">MFI (media): <b>{fmt(computed.intensities[key].mean)}</b></div>
        <div className="mt-1 text-xs">Mediana: <b>{fmt(computed.intensities[key].median)}</b></div>
        <button className="text-blue-700 text-xs underline mt-2" onClick={()=>setStep(key==='T'?'iggT':'iggB')}>Ver histograma</button>
      </div>)}
      <button className="w-full bg-blue-600 text-white rounded p-2.5 mt-4 text-xs font-semibold" onClick={exportResults}>Exportar MFI CSV</button>
      <p className="bg-amber-50 rounded border border-amber-200 text-amber-900 text-xs p-3 mt-4">Resultados exploratorios. MFI no es ΔMCF; se requiere control negativo pareado y puntos de corte validados para interpretar FCXM.</p>
      {computed.warnings.map(w=><p key={w} className="mt-2 text-xs text-amber-700">{w}</p>)}
    </aside>
  </div>;
};
