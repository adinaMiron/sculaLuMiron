/* InstrumentalArrangement schema 1, generators 1/2. A saved snapshot references
   its immutable source and MusicalPerformance IDs; generation never edits either. */
(function(root){
'use strict';
const S=root.ScuLaSynthesis,P=root.ScuLaPerformance,I=root.ScuLaSongInstruments;
const copy=v=>JSON.parse(JSON.stringify(v));
const PARTS=['lead','chords','bass','drums'];
const DEFAULTS={lead:{instrument:'piano',enabled:true,volume:.85},chords:{instrument:'strings',enabled:true,volume:.65},bass:{instrument:'bass',enabled:true,volume:.8},drums:{instrument:'standard',enabled:true,volume:.65}};
const KITS={standard:{gm:0},soft:{gm:8},electronic:{gm:24}};
// A sample set is the instrument name on sample takes. Empty means synthesis.
const MAX_SHIFT=5;
const DEFAULT_PLAYBACK=Object.freeze({startSeconds:0,loopStartSeconds:null,loopEndSeconds:null,crossfadeSeconds:.02,releaseSeconds:.12});
function samplePlayback(value,duration){
 const p=value===undefined?DEFAULT_PLAYBACK:value;
 if(!p || typeof p!=='object' || Array.isArray(p) || !Number.isFinite(duration) || duration<=0)return null;
 const {startSeconds:start,loopStartSeconds:a,loopEndSeconds:b,crossfadeSeconds:fade,releaseSeconds:release}=p;
 if(!Number.isFinite(start)||start<0||start>=duration-.03||!Number.isFinite(fade)||fade<.001||fade>.1||!Number.isFinite(release)||release<.01||release>2)return null;
 if(a===null && b===null)return p;
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<start||b>duration||b-a<.03||fade>(b-a)/2)return null;
 return p;
}
const SAMPLE_VELOCITIES={ppp:20,pp:32,p:45,soft:45,mp:60,mf:80,medium:80,f:99,loud:99,ff:114,fff:124};
function sampleVelocity(dynamic){
 const value=String(dynamic||'').trim().toLowerCase();
 if(/^\d{1,3}$/.test(value))return Math.max(1,Math.min(127,Number(value)));
 return Object.hasOwn(SAMPLE_VELOCITIES,value)?SAMPLE_VELOCITIES[value]:80;
}
function mapSample(samples,pitch,velocity){
 let best=null,score=Infinity;
 for(const s of samples){
  if(!s||!Number.isInteger(s.midiNote)||s.midiNote<0||s.midiNote>127||!Array.isArray(s.channels)||![1,2].includes(s.channels.length)||!s.channels[0]||s.channels.length===2&&s.channels[1]?.length!==s.channels[0].length||!Number.isFinite(s.sampleRate)||s.sampleRate<=0||s.channels[0].length<s.sampleRate*.03||!samplePlayback(s.playback,s.channels[0].length/s.sampleRate))continue;
  const distance=Math.abs(pitch-s.midiNote);if(distance>(s.maxShift??MAX_SHIFT)||pitch<(s.minMidi??0)||pitch>(s.maxMidi??127))continue;
  const rank=distance*128+Math.abs(sampleVelocity(s.dynamic)-velocity);
  if(rank<score){best=s;score=rank;}
 }
 return best;
}
function placeSample(L,R,s,n,volume,pan,sr,offset=0){
 const pitch=n.midi+(n.cents||0)/100,rate=2**((pitch-s.midiNote)/12)*s.sampleRate/sr;
 const settings=samplePlayback(s.playback,s.channels[0].length/s.sampleRate),start=Math.round(n.start*sr),hold=Math.max(1,Math.round(n.dur*sr)),release=Math.max(1,Math.round(settings.releaseSeconds*sr)),attack=Math.max(1,Math.round(.003*sr));
 const source=s.channels,stereo=source.length===2,gain=volume*Math.pow(Math.max(0,n.vel),.8);
 const gl=gain*Math.cos((pan+1)*Math.PI/4),gr=gain*Math.sin((pan+1)*Math.PI/4);
 const sourceStart=settings.startSeconds*s.sampleRate,loop=settings.loopStartSeconds!==null;
 const loopA=settings.loopStartSeconds*s.sampleRate,loopB=settings.loopEndSeconds*s.sampleRate,fade=settings.crossfadeSeconds*s.sampleRate;
 const count=Math.max(0,Math.min(L.length+offset-start,hold+release,loop?Infinity:Math.floor((source[0].length-1-sourceStart)/rate)));
 const read=(channel,at)=>{const j=Math.floor(at),f=at-j;return source[channel][j]*(1-f)+source[channel][Math.min(j+1,source[channel].length-1)]*f;};
 for(let i=Math.max(0,offset-start);i<count;i++){
  let at=sourceStart+i*rate;
  if(loop && at>=loopB)at=loopA+fade+(at-loopB)%(loopB-loopA-fade);
  const blend=loop&&at>=loopB-fade?Math.min(1,(at-(loopB-fade))/fade):0;
  const envelope=Math.min(1,i/attack)*(loop||s.piano?(i<hold?1:(1+Math.cos(Math.PI*Math.min(1,(i-hold)/release)))/2):Math.min(1,(hold+release-i)/release));
  const en=envelope*(loop?1:Math.min(1,(source[0].length-1-at)/(sr*.01*rate)));
  const left=(read(0,at)*(1-blend)+(blend?read(0,loopA+at-(loopB-fade))*blend:0))*en;
  const right=stereo?(read(1,at)*(1-blend)+(blend?read(1,loopA+at-(loopB-fade))*blend:0))*en:left;
  L[start+i-offset]+=left*gl;R[start+i-offset]+=right*gr;
 }
}
// Piano interpretation v1: fixed keyboard pitch, natural decay, optional
// bar pedal. Bake held durations into MIDI as well as audio; never edit evidence.
function performanceNotes(p,a){
 if(p.performanceVersion!==1)return p.notes;
 const bar=meter(a).quarters*60/a.tempoBpm;
 return p.notes.map(n=>{
  let end=n.start+n.dur;
  if(p.pianoPedal==='bar')end=Math.min(a.duration,Math.ceil((end-1e-9)/bar)*bar);
  return {...n,cents:0,dur:end-n.start};
 });
}
function create(recording,meta){
 const p=recording.performance;
 if(!p || !p.notes.length)throw new Error('noPitch');
 const a={schemaVersion:1,type:'InstrumentalArrangement',generatorVersion:1,...meta,revision:1,sourceRecordingId:recording.id,sourceAssetId:recording.source.assetId,sourcePerformanceId:p.id,sourcePerformanceUpdatedAt:p.updatedAt,
  performanceSnapshot:copy({notes:p.notes,tempoBpm:p.tempoBpm,timingMode:p.timingMode,key:p.analysis.key,quantizationDivision:p.quantizationDivision,analysis:{tempo:copy(p.analysis.tempo)}}),tempoBpm:p.tempoBpm,timingMode:p.timingMode,key:copy(p.analysis.key),parts:copy(DEFAULTS)};
 generate(a);return a;
}
function validate(a){
 if(a.generatorVersion!==undefined&&![1,2].includes(a.generatorVersion))throw Error('invalidEdit');
 if(a.generatorVersion===2)validateComposition(a.composition);
 else if(a.composition!==undefined)throw Error('invalidEdit');
 if(a.rendererVersion!==undefined&&a.rendererVersion!==1&&a.rendererVersion!==2)throw Error('invalidEdit');
 for(const id of PARTS){const p=a.parts?.[id];if(!p)throw Error('invalidEdit');
  if(p.samplePack!==undefined){const r=p.samplePack;if(id==='drums'||p.instrument!=='piano'||p.sampleSet||a.rendererVersion!==2||p.performanceVersion!==1||!r||r.id!=='salamander-compact'||r.version!==1||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)||Object.keys(r).length!==3)throw Error('invalidEdit');}
  if(p.performanceVersion!==undefined&&(p.performanceVersion!==1||p.instrument!=='piano'||a.rendererVersion!==2||!['off','bar'].includes(p.pianoPedal)))throw Error('invalidEdit');
  if(p.pianoPedal!==undefined&&p.performanceVersion!==1)throw Error('invalidEdit');
 }
 if(!Number.isInteger(a.tempoBpm)||a.tempoBpm<40||a.tempoBpm>220||!Number.isInteger(a.key.tonic)||a.key.tonic<0||a.key.tonic>11||!['major','minor'].includes(a.key.mode)||!['original','quantized'].includes(a.timingMode))throw new Error('invalidEdit');
 for(const id of PARTS){const p=a.parts[id];if(!p||typeof p.enabled!=='boolean'||!Number.isFinite(p.volume)||p.volume<0||p.volume>1||!(id==='drums'?Object.hasOwn(KITS,p.instrument):Object.hasOwn(S.INSTR,p.instrument))||p.sampleSet!==undefined&&(id==='drums'||typeof p.sampleSet!=='string'||p.sampleSet.length>120))throw new Error('invalidEdit');}
}
function generate(a){
 validate(a);
 const src=copy(a.performanceSnapshot);if(a.timingMode==='quantized'&&src.notes.some(n=>!n.quantizedTiming))P.quantize(src);
 const beat=60/a.tempoBpm,sourceBeat=60/src.tempoBpm;
 // Keep leading silence and every edited interval; tempo scales the timeline.
 const shift=a.key.tonic-src.key.tonic+(a.generatorVersion===2?a.composition.leadOctave*12:0);
 if(a.generatorVersion===2&&src.notes.some(n=>n.midi+shift<0||n.midi+shift>127))throw Error('invalidEdit');
 const notes=src.notes.map(n=>{const t=P.timing({timingMode:a.timingMode},n);return {id:n.id,sourceNoteId:n.sourceNoteId,start:t.onset/sourceBeat*beat,dur:(t.offset-t.onset)/sourceBeat*beat,midi:Math.max(0,Math.min(127,n.midi+shift)),cents:n.cents||0,velocity:n.velocity,vel:n.velocity/127};}).sort((x,y)=>x.start-y.start);
 if(!notes.length)throw new Error('noPitch');
 if(notes.some(n=>!Number.isFinite(n.start)||!Number.isFinite(n.dur)||n.start<0||n.dur<=0||n.start+n.dur>1100))throw new Error('invalidEdit');
 if(a.generatorVersion===2)return generateComposition(a,notes);
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
// Generator 2 is opt-in on a new copy. Generator 1 remains byte-for-byte musical
// compatibility; composition settings never overwrite the performance snapshot.
const METERS=Object.freeze(['2/4','3/4','4/4','6/8']);
const STYLES=Object.freeze({
 ballad:{voicing:'open',density:1,bassPattern:'roots',drumPattern:'sparse',fills:'ending',instruments:['piano','strings','bass','soft']},
 folk:{voicing:'close',density:2,bassPattern:'fifths',drumPattern:'backbeat',fills:'every4',instruments:['flute','guitar','bass','soft']},
 pulse:{voicing:'open',density:3,bassPattern:'walk',drumPattern:'drive',fills:'every4',instruments:['synth','piano','bass','electronic']}
});
function meter(a){const [numerator,denominator]=(a.generatorVersion===2?a.composition.meter:'4/4').split('/').map(Number);return {numerator,denominator,quarters:numerator*4/denominator};}
function meterEvent(a){const m=meter(a);return [255,88,4,m.numerator,Math.log2(m.denominator),m.denominator===8?36:24,8];}
function enableComposition(a){
 if(a.generatorVersion===2)return a;
 const choices=chordAlternatives(a,0,1),chordDegrees=(a.chords||[]).map(chord=>choices.find(c=>c.root===chord.root&&c.q===chord.q)?.degree||0);
 a.generatorVersion=2;a.composition={version:1,meter:'4/4',style:'custom',harmonicRhythm:1,chordDegrees,voicing:'close',density:S.INSTR[a.parts.chords.instrument].damp||S.INSTR[a.parts.chords.instrument].ks?3:1,bassPattern:'roots',drumPattern:'backbeat',fills:'none',leadOctave:0};
 return generate(a);
}
function validateComposition(c){
 if(!c||c.version!==1||!METERS.includes(c.meter)||!['custom',...Object.keys(STYLES)].includes(c.style)||![1,2].includes(c.harmonicRhythm)||!['close','open'].includes(c.voicing)||![1,2,3].includes(c.density)||!['roots','fifths','walk'].includes(c.bassPattern)||!['sparse','backbeat','drive'].includes(c.drumPattern)||!['none','ending','every4'].includes(c.fills)||![-1,0,1].includes(c.leadOctave)||!Array.isArray(c.chordDegrees)||c.chordDegrees.length>8192||c.chordDegrees.some(d=>!Number.isInteger(d)||d<0||d>7))throw Error('invalidEdit');
}
function applyStyle(a,name){
 const style=STYLES[name];if(!style)throw Error('invalidEdit');
 enableComposition(a);
 for(const key of ['voicing','density','bassPattern','drumPattern','fills'])a.composition[key]=style[key];
 a.composition.style=name;
 PARTS.forEach((id,i)=>{const p=a.parts[id];p.instrument=style.instruments[i];delete p.sampleSet;delete p.samplePack;delete p.performanceVersion;delete p.pianoPedal;});
 return generate(a);
}
function chordAlternatives(a,start,duration,notes=a.parts.lead.notes){
 const scale=S.SCALES[a.key.mode],weights=new Float64Array(12);let total=0;
 for(const n of notes){const overlap=Math.max(0,Math.min(start+duration,n.start+n.dur)-Math.max(start,n.start));weights[n.midi%12]+=overlap;total+=overlap;}
 return scale.map((offset,i)=>{
  const root=(a.key.tonic+offset)%12,intervals=[0,2,4].map(k=>(scale[(i+k)%7]-offset+12)%12),q=intervals[1]===4?'maj':intervals[2]===6?'dim':'min',tones=intervals.map(n=>(root+n)%12);
  const compatible=tones.reduce((v,n)=>v+weights[n],0);
  return {degree:i+1,root,q,tones,compatibility:total?Math.min(1,compatible/total):null};
 });
}
function generateComposition(a,notes){
 const c=a.composition,m=meter(a),unit=60/a.tempoBpm*4/m.denominator,bar=unit*m.numerator;
 const bars=Math.max(1,Math.ceil((Math.max(...notes.map(n=>n.start+n.dur))-1e-9)/bar)),slot=bar/c.harmonicRhythm;
 const cn=[],bn=[],dn=[],chords=[],ci=S.INSTR[a.parts.chords.instrument],bi=S.INSTR[a.parts.bass.instrument];
 a.parts.lead.notes=notes;a.duration=bars*bar;
 // Retain off-end choices: a shorter alternate melody never erases decisions.
 for(let i=0;i<bars*c.harmonicRhythm;i++){
  const start=i*slot,options=chordAlternatives(a,start,slot,notes),chosen=c.chordDegrees[i]||0;
  const best=chosen?options[chosen-1]:options.reduce((best,next)=>(next.compatibility??0)>(best.compatibility??0)?next:best,options[0]);
  const chord={...best,bar:Math.floor(i/c.harmonicRhythm),slot:i,start,dur:slot};chords.push(chord);
  let voice=S.chordVoicing(chord);if(c.voicing==='open')voice=[voice[0]-12,voice[2],voice[1]+12];
  const add=(target,t,d,midi,vel,instrument)=>target.push({start:t,dur:Math.min(d,a.duration-t),midi:S.fitRange(midi,instrument),vel});
  if(c.density===1){for(const pitch of voice)add(cn,start,slot*.94,pitch,.4,ci);}
  else {
   const step=unit/(c.density===3?2:1),count=Math.ceil(slot/step-1e-9);
   for(let k=0;k<count;k++)add(cn,start+k*step,Math.min(step*.85,slot-k*step),voice[k%3],k%3?.34:.46,ci);
  }
  const count=c.bassPattern==='roots'?1:c.bassPattern==='fifths'?2:Math.ceil(slot/unit-1e-9),step=slot/count;
  for(let k=0;k<count;k++){
   const tone=c.bassPattern==='walk'?chord.tones[k%3]:k%2?chord.tones[2]:chord.root;
   add(bn,start+k*step,step*.85,36+tone,k? .6:.78,bi);
  }
 }
 for(let b=0;b<bars;b++){
  const start=b*bar,hit=(at,midi,vel)=>dn.push({start:start+at*unit,dur:Math.min(.12,bar-at*unit),midi,vel});
  const pulse=m.denominator===8?3:1,back=m.denominator===8?3:m.numerator===3?2:1;
  hit(0,36,1);
  if(c.drumPattern!=='sparse'){
   for(let k=back;k<m.numerator;k+=m.denominator===8?6:2)hit(k,38,.82);
   if(m.numerator===4)hit(2,36,.8);
  }
  const step=c.drumPattern==='sparse'?pulse:c.drumPattern==='drive'?.5:1;
  for(let k=0;k<m.numerator;k+=step)hit(k,42,k%pulse===0?.65:.4);
  if(c.fills==='ending'&&b===bars-1||c.fills==='every4'&&((b+1)%4===0||b===bars-1)){
   // Replace the final pulse's hats/snare, leaving its kick intact.
   const from=m.numerator-pulse;
   for(let i=dn.length-1;i>=0&&dn[i].start>=start;i--)if(dn[i].start>=start+from*unit&&dn[i].midi!==36)dn.splice(i,1);
   for(let k=0;k<4;k++)hit(from+k*pulse/4,38,.45+k*.12);
  }
 }
 a.parts.chords.notes=cn;a.parts.bass.notes=bn;a.parts.drums.notes=dn.sort((x,y)=>x.start-y.start||x.midi-y.midi);a.chords=chords;
 return a;
}
function midi(a){
 validate(a);
 // Keep four named part tracks even when muted; silence/CC7 describes controls.
 const tracks=PARTS.map((id,i)=>{const p=a.parts[id];return {ch:id==='drums'?9:i,name:id[0].toUpperCase()+id.slice(1),gm:id==='drums'?KITS[p.instrument].gm:S.INSTR[p.instrument].gm,notes:p.enabled&&p.volume>0?performanceNotes(p,a):[]};});
 // Use Voice's MIDI container, with exact edited velocity and track volume.
 const TPQ=480,us=Math.round(60000000/a.tempoBpm),tempo=[{t:0,o:0,d:[255,81,3,us>>16&255,us>>8&255,us&255]},{t:0,o:1,d:meterEvent(a)}];
 const endTick=a.generatorVersion===2?Math.round(a.duration*a.tempoBpm/60*TPQ):0;
 const bytes=[77,84,104,100,0,0,0,6,0,1,0,5,1,224];
 bytes.push(...S.midiTrack(tempo,'Song Creation',endTick));
 tracks.forEach((track,i)=>{const p=a.parts[PARTS[i]],ch=track.ch,ev=[{t:0,o:0,d:[192|ch,track.gm]},{t:0,o:0,d:[176|ch,7,Math.round(p.volume*127)]}];
  for(const n of track.notes){const on=Math.round(n.start/ (60/a.tempoBpm)*TPQ),off=Math.max(on+1,Math.round((n.start+n.dur)/(60/a.tempoBpm)*TPQ)),velocity=n.velocity||Math.max(1,Math.round(n.vel*127));ev.push({t:on,o:2,d:[144|ch,n.midi,velocity]},{t:off,o:1,d:[128|ch,n.midi,0]});}
  // Concatenate iteratively: long arrangements exceed Function argument limits.
  for(const b of S.midiTrack(ev,track.name,endTick))bytes.push(b);
 });
 return new Blob([new Uint8Array(bytes)],{type:'audio/midi'});
}
// Compatibility collector is limited to short clips; exports use the stream API.
async function render(a,opts){return root.ScuLaSongRenderer.arrangement(a,opts).collect();}

root.ScuLaArrangement=Object.freeze({version:2,METERS,STYLES,meter,meterEvent,enableComposition,applyStyle,chordAlternatives,PARTS:Object.freeze(PARTS),KITS:Object.freeze(KITS),MAX_SHIFT,DEFAULT_PLAYBACK,samplePlayback,sampleVelocity,mapSample,placeSample,performanceNotes,create,generate,validate,midi,render,wav:mix=>S.wavBlob(mix.L,mix.R,mix.sr)});
})(typeof window==='undefined'?globalThis:window);
