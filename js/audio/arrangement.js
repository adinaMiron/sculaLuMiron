/* InstrumentalArrangement v1. A saved snapshot references its immutable source
   and MusicalPerformance IDs; generation never edits either input. */
(function(root){
'use strict';
const S=root.ScuLaSynthesis,P=root.ScuLaPerformance,I=root.ScuLaSongInstruments;
const copy=v=>JSON.parse(JSON.stringify(v));
const PARTS=['lead','chords','bass','drums'];
const DEFAULTS={lead:{instrument:'piano',enabled:true,volume:.85},chords:{instrument:'strings',enabled:true,volume:.65},bass:{instrument:'bass',enabled:true,volume:.8},drums:{instrument:'standard',enabled:true,volume:.65}};
const KITS={standard:{gm:0},soft:{gm:8},electronic:{gm:24}};
function create(recording,meta){
 const p=recording.performance;
 if(!p || !p.notes.length)throw new Error('noPitch');
 const a={schemaVersion:1,type:'InstrumentalArrangement',generatorVersion:1,...meta,revision:1,sourceRecordingId:recording.id,sourceAssetId:recording.source.assetId,sourcePerformanceId:p.id,sourcePerformanceUpdatedAt:p.updatedAt,
  performanceSnapshot:copy({notes:p.notes,tempoBpm:p.tempoBpm,timingMode:p.timingMode,key:p.analysis.key,quantizationDivision:p.quantizationDivision,analysis:{tempo:copy(p.analysis.tempo)}}),tempoBpm:p.tempoBpm,timingMode:p.timingMode,key:copy(p.analysis.key),parts:copy(DEFAULTS)};
 generate(a);return a;
}
function validate(a){
 if(!Number.isInteger(a.tempoBpm)||a.tempoBpm<40||a.tempoBpm>220||!Number.isInteger(a.key.tonic)||a.key.tonic<0||a.key.tonic>11||!['major','minor'].includes(a.key.mode)||!['original','quantized'].includes(a.timingMode))throw new Error('invalidEdit');
 for(const id of PARTS){const p=a.parts[id];if(!p||typeof p.enabled!=='boolean'||!Number.isFinite(p.volume)||p.volume<0||p.volume>1||!(id==='drums'?Object.hasOwn(KITS,p.instrument):Object.hasOwn(S.INSTR,p.instrument)))throw new Error('invalidEdit');}
}
function generate(a){
 validate(a);
 const src=copy(a.performanceSnapshot);if(a.timingMode==='quantized'&&src.notes.some(n=>!n.quantizedTiming))P.quantize(src);
 const beat=60/a.tempoBpm,sourceBeat=60/src.tempoBpm;
 // Keep leading silence and every edited interval; tempo scales the timeline.
 const shift=a.key.tonic-src.key.tonic;
 const notes=src.notes.map(n=>{const t=P.timing({timingMode:a.timingMode},n);return {id:n.id,sourceNoteId:n.sourceNoteId,start:t.onset/sourceBeat*beat,dur:(t.offset-t.onset)/sourceBeat*beat,midi:Math.max(0,Math.min(127,n.midi+shift)),cents:n.cents||0,velocity:n.velocity,vel:n.velocity/127};}).sort((x,y)=>x.start-y.start);
 if(!notes.length)throw new Error('noPitch');
 if(notes.some(n=>!Number.isFinite(n.start)||!Number.isFinite(n.dur)||n.start<0||n.dur<=0||n.start+n.dur>1100))throw new Error('invalidEdit');
 const barLen=beat*4,end=Math.max(...notes.map(n=>n.start+n.dur)),bars=Math.max(1,Math.ceil(end/barLen));
 const chords=S.chordsFor(notes,0,barLen,bars,a.key.tonic,a.key.mode);
 a.parts.lead.notes=notes;
 const cn=[],bn=[],dn=[],ci=S.INSTR[a.parts.chords.instrument],bi=S.INSTR[a.parts.bass.instrument];
 for(const c of chords){
  const t=c.bar*barLen,voicing=S.chordVoicing(c);
  if(ci.damp||ci.ks){const arp=[...voicing,voicing[0]+12],pattern=[0,1,2,3,2,1,0,1];for(let k=0;k<8;k++)cn.push({start:t+k*beat/2,dur:beat*.48,midi:S.fitRange(arp[pattern[k]],ci),vel:k%2?.34:.46});}
  else for(const m of voicing)cn.push({start:t,dur:barLen*.96,midi:S.fitRange(m,ci),vel:.4});
  const bass=S.fitRange(36+c.root,bi);bn.push({start:t,dur:beat*1.8,midi:bass,vel:.78},{start:t+2*beat,dur:beat*1.8,midi:bass,vel:.6});
  dn.push({start:t,dur:.12,midi:36,vel:1},{start:t+beat*2,dur:.12,midi:36,vel:.82},{start:t+beat,dur:.12,midi:38,vel:.9},{start:t+beat*3,dur:.12,midi:38,vel:.9});
  for(let k=0;k<8;k++)dn.push({start:t+k*beat/2,dur:.12,midi:c.bar%2===1&&k===7?46:42,vel:k%2?.55:.8});
 }
 a.parts.chords.notes=cn;a.parts.bass.notes=bn;a.parts.drums.notes=dn;
 a.chords=chords;a.duration=bars*barLen;
 return a;
}
function midi(a){
 validate(a);
 // Keep four named part tracks even when muted; silence/CC7 describes controls.
 const tracks=PARTS.map((id,i)=>{const p=a.parts[id];return {ch:id==='drums'?9:i,name:id[0].toUpperCase()+id.slice(1),gm:id==='drums'?KITS[p.instrument].gm:S.INSTR[p.instrument].gm,notes:p.enabled&&p.volume>0?p.notes:[]};});
 // Use Voice's MIDI container, with exact edited velocity and track volume.
 const TPQ=480,us=Math.round(60000000/a.tempoBpm),tempo=[{t:0,o:0,d:[255,81,3,us>>16&255,us>>8&255,us&255]},{t:0,o:1,d:[255,88,4,4,2,24,8]}];
 const bytes=[77,84,104,100,0,0,0,6,0,1,0,5,1,224];
 bytes.push(...S.midiTrack(tempo,'Song Creation'));
 tracks.forEach((track,i)=>{const p=a.parts[PARTS[i]],ch=track.ch,ev=[{t:0,o:0,d:[192|ch,track.gm]},{t:0,o:0,d:[176|ch,7,Math.round(p.volume*127)]}];
  for(const n of track.notes){const on=Math.round(n.start/ (60/a.tempoBpm)*TPQ),off=Math.max(on+1,Math.round((n.start+n.dur)/(60/a.tempoBpm)*TPQ)),velocity=n.velocity||Math.max(1,Math.round(n.vel*127));ev.push({t:on,o:2,d:[144|ch,n.midi,velocity]},{t:off,o:1,d:[128|ch,n.midi,0]});}
  // Concatenate iteratively: long arrangements exceed Function argument limits.
  for(const b of S.midiTrack(ev,track.name))bytes.push(b);
 });
 return new Blob([new Uint8Array(bytes)],{type:'audio/midi'});
}
async function render(a,{sampleRate=44100,cancelled=()=>false,yieldUI=()=>new Promise(r=>setTimeout(r,0))}={}){
 validate(a);
 const check=()=>{if(cancelled())throw new Error('cancelled');};check();
 const sr=sampleRate,L=new Float32Array(Math.ceil((a.duration+1.8)*sr)),R=new Float32Array(L.length),cache=new Map();
 const drumTypes={36:'kick',38:'snare',42:'hat',46:'hato'},pan={lead:0,chords:-.22,bass:.05,drums:.1};
 let count=0;
 for(const id of PARTS){const p=a.parts[id];if(!p.enabled||!p.volume)continue;
  const kit=id==='drums'?{kick:I.drum('kick',p.instrument,sr),snare:I.drum('snare',p.instrument,sr),hat:I.drum('hat',p.instrument,sr),hato:I.drum('hato',p.instrument,sr)}:null;
  for(const n of p.notes){
   check();let buf,hold=n.dur,rel=.005,gain=.28;
   if(kit){buf=kit[drumTypes[n.midi]];hold=buf.length/sr;gain=({36:.4,38:.25,42:.13,46:.12})[n.midi];
   }else {
    const pitch=n.midi+(n.cents||0)/100,key=p.instrument+'|'+pitch+'|'+hold+'|'+Math.round(n.vel*8);
    if(!cache.has(key))cache.set(key,I.instrument(p.instrument,pitch,hold+S.INSTR[p.instrument].rel,sr,Math.round(n.vel*8)/8));
    buf=cache.get(key);rel=S.INSTR[p.instrument].rel;gain=id==='chords'?.2:.28;
   }
   S.place(L,R,buf,n.start,hold,rel,gain*p.volume*n.vel,pan[id],sr);
   if((++count&7)===0){await yieldUI();check();}
  }
  await yieldUI();check();
 }
 cache.clear();await yieldUI();check();
 // Fixed headroom, no upward normalization: lowering a part stays quieter.
 const wl=S.reverbTail(L,sr,0);await yieldUI();check();
 const wr=S.reverbTail(R,sr,23);await yieldUI();check();let peak=0;
 for(let i=0;i<L.length;i++){L[i]+=wl[i]*.16;R[i]+=wr[i]*.16;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));}
 if(peak>.95)for(let i=0;i<L.length;i++){L[i]*=.95/peak;R[i]*=.95/peak;}
 check();return {L,R,sr};
}
root.ScuLaArrangement=Object.freeze({version:1,PARTS:Object.freeze(PARTS),KITS:Object.freeze(KITS),create,generate,validate,midi,render,wav:mix=>S.wavBlob(mix.L,mix.R,mix.sr)});
})(typeof window==='undefined'?globalThis:window);
