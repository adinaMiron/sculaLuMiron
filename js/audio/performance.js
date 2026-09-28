/* MusicalPerformance v1: detection evidence and editable notes are separate.
   All times are seconds from the beginning of the untouched source WAV. */
(function(root){
'use strict';
const A=root.ScuLaAnalysis, MAX_SECONDS=180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{const s=a.slice().sort((a,b)=>a-b),i=s.length>>1;return s.length?(s.length%2?s[i]:(s[i-1]+s[i])/2):0;};
const copy=v=>JSON.parse(JSON.stringify(v));
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
function checkCancel(cancelled){if(cancelled()){const e=new Error('analysisCancelled');e.code='analysisCancelled';throw e;}}
function editable(notes){return notes.map(n=>({id:n.id,sourceNoteId:n.id,midi:n.midi,onset:n.onset,offset:n.offset,cents:n.cents,velocity:n.velocity,quantizedTiming:null}));}
function onsetPeaks(env,fps){
  const peaks=[];
  for(let i=1;i<env.length-1;i++){
    if(env[i]<.18 || env[i]<env[i-1] || env[i]<=env[i+1])continue;
    const p=peaks[peaks.length-1];
    if(p && (i-p.frame)/fps<.1){if(env[i]>p.strength)peaks[peaks.length-1]={frame:i,time:i/fps,strength:env[i]};}
    else peaks.push({frame:i,time:i/fps,strength:env[i]});
  }
  if(env[0]>.18)peaks.unshift({frame:0,time:0,strength:env[0]});
  return peaks;
}
function vibrato(frames){
  if(frames.length<16)return {rateHz:null,depthCents:0,confidence:0};
  const dt=frames[1].time-frames[0].time;
  const cents=frames.map(f=>f.midi*100);
  const residual=cents.map((v,i)=>v-median(cents.slice(Math.max(0,i-4),i+5)));
  let energy=0;for(const v of residual)energy+=v*v;
  let best=0,bestLag=0;
  for(let lag=Math.ceil(1/(9*dt));lag<=Math.floor(1/(4*dt));lag++){
    let xy=0,xx=0,yy=0;
    for(let i=0;i+lag<residual.length;i++){const x=residual[i],y=residual[i+lag];xy+=x*y;xx+=x*x;yy+=y*y;}
    const correlation=xx*yy>0?xy/Math.sqrt(xx*yy):0;
    if(correlation>best){best=correlation;bestLag=lag;}
  }
  const depth=Math.sqrt(2*energy/residual.length);
  return {rateHz:best>.35 && depth>3?1/(bestLag*dt):null,depthCents:depth,confidence:best};
}
async function analyzeBuffer(mono,sourceAssetId,onStep=()=>{},{cancelled=()=>false}={}){
  if(mono.length>A.AN_SR*MAX_SECONDS)throw new Error('tooLong');
  checkCancel(cancelled);
  const duration=mono.length/A.AN_SR;
  // Keep measured amplitude before normalising only the analysis copy.
  const raw=A.decimate2(mono), normalized=A.normalise(mono.slice());
  onStep(.38,'analysis');await yieldUI();checkCancel(cancelled);
  const env=await A.onsetEnvelopeCooperative(normalized,()=>{checkCancel(cancelled);},f=>onStep(.38+f*.17,'analysis')),
    fps=A.AN_SR/A.HOP;
  checkCancel(cancelled);
  const peaks=onsetPeaks(env,fps),lag=A.detectTempo(env,fps);
  onStep(.55,'analysis');await yieldUI();checkCancel(cancelled);
  const pt=await A.trackPitch(A.decimate2(normalized),A.AN_SR/2,f=>onStep(.55+f*.4,'analysis'),cancelled);
  checkCancel(cancelled);
  const dt=1/pt.fps;
  const frames=Array.from(pt.f0,(hz,i)=>{
    let energy=0;for(let j=0;j<512;j++)energy+=(raw[i*A.HOP+j]||0)**2;
    const midi=hz>0?69+12*Math.log2(hz/440):null;
    return {time:i*dt,hz:hz||null,midi,cents:midi===null?null:100*(midi-Math.round(midi)),confidence:pt.clar[i],rms:Math.sqrt(energy/512)};
  });
  // Spectral attacks may split repeated pitches, but only when the measured
  // amplitude rises appreciably: pitch wobble alone is not a new attack.
  const segments=[];
  for(const n of A.segmentNotes(pt)){
    const boundaries=[n.start];
    for(const p of peaks){
      if(p.time-n.start<.12 || n.start+n.dur-p.time<.12 || p.time-boundaries[boundaries.length-1]<.12)continue;
      const i=Math.round(p.time/dt),before=frames[Math.max(0,i-2)]?.rms||0,after=frames[Math.min(frames.length-1,i+2)]?.rms||0;
      if(after>before*1.4)boundaries.push(p.time);
    }
    boundaries.push(n.start+n.dur);
    for(let i=0;i<boundaries.length-1;i++)segments.push({...n,start:boundaries[i],dur:boundaries[i+1]-boundaries[i]});
  }
  const detectedNotes=segments.map((n,i)=>{
    if((i&31)===0)checkCancel(cancelled);
    const fs=frames.filter(f=>f.time>=n.start && f.time<n.start+n.dur && f.hz && f.confidence>.62);
    const rmsPeak=Math.max(0,...fs.map(f=>f.rms));
    const mean=fs.reduce((s,f)=>s+f.rms,0)/(fs.length||1);
    const attack=fs.find(f=>f.rms>=rmsPeak*.8),release=fs.slice().reverse().find(f=>f.rms>=rmsPeak*.8);
    return {id:'n'+i,midi:n.midi,onset:n.start,offset:Math.min(duration,n.start+n.dur),confidence:fs.reduce((s,f)=>s+f.confidence,0)/(fs.length||1),cents:median(fs.map(f=>100*(f.midi-n.midi))),velocity:clamp(Math.round(n.vel*127),1,127),dynamics:{rms:mean,peak:rmsPeak},vibrato:vibrato(fs),legato:false,attackSeconds:attack?attack.time-n.start:0,releaseSeconds:release?Math.max(0,n.start+n.dur-release.time):0};
  });
  detectedNotes.forEach((n,i)=>{const next=detectedNotes[i+1];n.legato=!!next && next.onset-n.offset<=dt*2;});
  const notes=editable(detectedNotes),bpm=60*fps/lag;
  checkCancel(cancelled);onStep(1,'analysis');
  return {schemaVersion:1,type:'MusicalPerformance',analyzerVersion:A.version,sourceAssetId,duration,analysis:{sampleRate:A.AN_SR,pitchHopSeconds:dt,pitchWindowSeconds:512/(A.AN_SR/2),rawPitchFrames:frames,onsetEnvelope:Array.from(env),onsetHopSeconds:1/fps,onsets:peaks,detectedNotes,tempo:{bpm,phaseSeconds:A.beatPhase(env,lag)/fps},key:A.detectKey(segments)},notes,tempoBpm:Math.round(bpm),timingMode:'original',quantizationDivision:4};
}
async function analyze(blob,sourceAssetId,onStep=()=>{},{cancelled=()=>false}={}){
  const mono=await decodeWavMono(blob,{cancelled,progress:f=>onStep(f*.35,'decoding')});
  checkCancel(cancelled);return analyzeBuffer(mono,sourceAssetId,onStep,{cancelled});
}
function quantize(performance){
  const step=60/performance.tempoBpm/performance.quantizationDivision,phase=performance.analysis.tempo.phaseSeconds;
  performance.notes.forEach(n=>{const onset=Math.max(0,Math.round((n.onset-phase)/step)*step+phase);const offset=Math.max(onset+step,Math.round((n.offset-phase)/step)*step+phase);n.quantizedTiming={onset,offset};});
}
function timing(performance,n){return performance.timingMode==='quantized' && n.quantizedTiming?n.quantizedTiming:n;}
function midi(performance){
  const bpm=performance.tempoBpm,us=Math.round(60000000/bpm),events=[{tick:0,order:0,bytes:[255,81,3,(us>>16)&255,(us>>8)&255,us&255]}];
  for(const n of performance.notes){const t=timing(performance,n),on=Math.round(t.onset*bpm*8),off=Math.max(on+1,Math.round(t.offset*bpm*8));events.push({tick:on,order:2,bytes:[144,n.midi,n.velocity]},{tick:off,order:1,bytes:[128,n.midi,0]});}
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
  const vlq=v=>{const b=[v&127];while(v>>>=7)b.unshift((v&127)|128);return b;};
  const data=[];let previous=0;for(const e of events){data.push(...vlq(e.tick-previous),...e.bytes);previous=e.tick;}data.push(0,255,47,0);
  const n=data.length,head=[77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
  return new Blob([new Uint8Array(head),new Uint8Array(data)],{type:'audio/midi'});
}
async function inspectWav(blob,{cancelled=()=>false,progress=()=>{}}={}){
  const bad=()=>{throw new Error('badWav');};
  const cancel=()=>{if(cancelled()){const e=new Error('backupCancelled');e.code='backupCancelled';throw e;}};
  const tag=(bytes,o)=>String.fromCharCode(bytes[o],bytes[o+1],bytes[o+2],bytes[o+3]);
  async function read(offset,length){
    cancel();
    if(offset<0 || length<0 || offset+length>blob.size)bad();
    const bytes=new Uint8Array(await blob.slice(offset,offset+length).arrayBuffer());
    cancel();if(bytes.length!==length)bad();return bytes;
  }
  cancel();progress(0,blob.size);
  if(blob.size<44 || blob.size>0xffffffff+8)bad();
  const header=await read(0,12),riff=new DataView(header.buffer,header.byteOffset,header.byteLength);
  if(tag(header,0)!=='RIFF' || tag(header,8)!=='WAVE' || riff.getUint32(4,true)+8!==blob.size)bad();
  let format=null,dataBytes=null,dataOffset=null,chunks=0;
  for(let offset=12;offset<blob.size;){
    if(blob.size-offset<8)bad();
    const bytes=await read(offset,8),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const size=v.getUint32(4,true),end=offset+8+size,next=end+(size&1);
    if(next>blob.size)bad();
    const kind=tag(bytes,0);
    if(kind==='fmt '){
      if(format || size<16)bad();
      const fields=await read(offset+8,16),f=new DataView(fields.buffer,fields.byteOffset,fields.byteLength);
      format={encoding:f.getUint16(0,true),channelCount:f.getUint16(2,true),sampleRate:f.getUint32(4,true),byteRate:f.getUint32(8,true),alignment:f.getUint16(12,true),bitDepth:f.getUint16(14,true)};
    }
    if(kind==='data'){if(dataBytes!==null)bad();dataBytes=size;dataOffset=offset+8;}
    offset=next;
    // Large payloads need no reads. A timer yield keeps tiny-chunk files
    // cancelable even when their Blob reads resolve without yielding to UI.
    if(++chunks%32===0){progress(offset,blob.size);await new Promise(resolve=>setTimeout(resolve,0));cancel();}
  }
  cancel();progress(blob.size,blob.size);
  if(!format || !dataBytes)bad();
  const f=format;
  if(![1,2].includes(f.channelCount) || f.sampleRate<8000 || f.sampleRate>192000 || !(f.encoding===1 && [16,24,32].includes(f.bitDepth) || f.encoding===3 && f.bitDepth===32) || f.alignment!==f.channelCount*f.bitDepth/8 || f.byteRate!==f.sampleRate*f.alignment || dataBytes%f.alignment)bad();
  return {...f,duration:dataBytes/f.byteRate,dataBytes,dataOffset};
}
/* Song's decoder reads only the validated data chunk. The small overlapping
   source window feeds a band-limited sinc directly into the 22.05 kHz mono
   result; neither source channels nor a full-rate intermediate are retained. */
async function decodeWavMono(blob,{cancelled=()=>false,progress=()=>{}}={}){
  const meta=await inspectWav(blob,{cancelled,progress:(done,total)=>progress(.05*done/total)});
  if(meta.duration>MAX_SECONDS)throw new Error('tooLong');
  const {sampleRate:from,channelCount:channels,bitDepth,encoding,alignment,dataOffset,dataBytes}=meta;
  const frames=dataBytes/alignment,to=A.AN_SR,out=new Float32Array(Math.max(1,Math.round(frames*to/from)));
  const radius=from===to?0:Math.ceil(16*Math.max(1,from/to));
  const cutoff=Math.min(1,to/from),maxFrames=Math.max(1,Math.floor(65536/alignment));
  const kernels=new Map();let first=0,count=0,monoChunk=null;
  function kernel(fraction){
    const phase=Math.round(fraction*2048);
    if(kernels.has(phase))return kernels.get(phase);
    const weights=new Float32Array(radius*2),f=phase/2048;
    for(let i=0;i<weights.length;i++){
      const d=f+radius-1-i,z=Math.PI*d*cutoff;
      weights[i]=cutoff*(z===0?1:Math.sin(z)/z)*(.5+.5*Math.cos(Math.PI*d/radius));
    }
    kernels.set(phase,weights);return weights;
  }
  async function load(frame){
    checkCancel(cancelled);
    first=Math.max(0,Math.min(frame,frames-1));count=Math.min(maxFrames,frames-first);
    const bytes=await blob.slice(dataOffset+first*alignment,dataOffset+(first+count)*alignment).arrayBuffer();
    checkCancel(cancelled);if(bytes.byteLength!==count*alignment)throw new Error('badWav');
    const view=new DataView(bytes),step=bitDepth/8;monoChunk=new Float32Array(count);
    for(let i=0;i<count;i++){
      let sum=0;
      for(let c=0;c<channels;c++){
        const p=i*alignment+c*step;
        if(encoding===3)sum+=view.getFloat32(p,true);
        else if(bitDepth===16)sum+=view.getInt16(p,true)/32768;
        else if(bitDepth===32)sum+=view.getInt32(p,true)/2147483648;
        else {let v=view.getUint8(p)|(view.getUint8(p+1)<<8)|(view.getUint8(p+2)<<16);if(v&0x800000)v-=0x1000000;sum+=v/8388608;}
      }
      monoChunk[i]=Number.isFinite(sum)?sum/channels:0;
    }
  }
  for(let i=0;i<out.length;i++){
    const pos=i*from/to,center=Math.floor(pos),left=Math.max(0,radius?center-radius+1:center),right=Math.min(frames-1,center+radius);
    if(!monoChunk || left<first || right>=first+count)await load(left);
    if(!radius){out[i]=monoChunk[Math.min(center,frames-1)-first];}
    else {
      const weights=kernel(pos-center),origin=center-radius+1;
      let sum=0,weight=0;
      for(let j=left;j<=right;j++){
        const w=weights[j-origin];
        sum+=monoChunk[j-first]*w;weight+=w;
      }
      out[i]=weight?sum/weight:0;
    }
    if((i&2047)===2047){progress(.05+.95*(i+1)/out.length);await yieldUI();checkCancel(cancelled);}
  }
  checkCancel(cancelled);progress(1);return out;
}
root.ScuLaPerformance=Object.freeze({version:1,MAX_SECONDS,analyze,analyzeBuffer,decodeWavMono,editable,copy,quantize,timing,midi,inspectWav});
})(typeof window==='undefined'?globalThis:window);
