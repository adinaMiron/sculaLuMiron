/* Project sections link to arrangement versions. Each version owns its tempo/key. */
(function(root){
'use strict';
const A=root.ScuLaArrangement,S=root.ScuLaSynthesis,PARTS=A.PARTS,TPQ=480,TAIL_SECONDS=1.8;
function resolve(project){
 const sections=project.timeline||[],byId=new Map((project.arrangements||[]).map(a=>[a.id,a]));
 if(!Array.isArray(sections))throw new Error('timelineInvalid');
 const ids=new Set(),items=[];let seconds=0,ticks=0;
 for(const section of sections){
  if(!section || typeof section.id!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(section.id) || ids.has(section.id) || typeof section.name!=='string' || !section.name.trim() || section.name.length>120 || typeof section.arrangementId!=='string' || !Number.isInteger(section.repeats) || section.repeats<1 || section.repeats>16)throw new Error('timelineInvalid');
  ids.add(section.id);const a=byId.get(section.arrangementId);if(!a)throw new Error('timelineInvalid');A.validate(a);
  if(!Number.isFinite(a.duration)||a.duration<=0)throw new Error('timelineInvalid');
  for(let i=0;i<section.repeats;i++){
   items.push({section,arrangement:a,seconds,ticks,repeat:i+1});
   seconds+=a.duration;ticks+=Math.round(a.duration*a.tempoBpm/60*TPQ);
   if(seconds>1200)throw new Error('timelineInvalid');
  }
 }
 return {items,seconds,ticks};
}
async function render(project,{sampleRate=44100,samplesFor=async()=>({}),cancelled=()=>false,yieldUI=()=>new Promise(r=>setTimeout(r,0))}={}){
 const plan=resolve(project);if(!plan.items.length)throw new Error('timelineEmpty');
 const length=Math.ceil((plan.seconds+TAIL_SECONDS)*sampleRate),L=new Float32Array(length),R=new Float32Array(length),cache=new Map();
 for(const item of plan.items){
  if(cancelled())throw new Error('cancelled');
  let mix=cache.get(item.arrangement.id);
  if(!mix){const samples=await samplesFor(item.arrangement);if(cancelled())throw new Error('cancelled');mix=await A.render(item.arrangement,{sampleRate,samples,cancelled,yieldUI});cache.set(item.arrangement.id,mix);}
  const start=Math.round(item.seconds*sampleRate);
  for(let i=0;i<mix.L.length && start+i<length;i++){L[start+i]+=mix.L[i];R[start+i]+=mix.R[i];}
  await yieldUI();
 }
 if(cancelled())throw new Error('cancelled');
 let peak=0;for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));
 if(peak>.95){const gain=.95/peak;for(let i=0;i<length;i++){L[i]*=gain;R[i]*=gain;}}
 return {L,R,sr:sampleRate};
}
function midi(project){
 const plan=resolve(project);if(!plan.items.length)throw new Error('timelineEmpty');
 const tempo=[],tracks=PARTS.map(()=>[]),program=(id,p)=>id==='drums'?A.KITS[p.instrument].gm:S.INSTR[p.instrument].gm;
 for(const item of plan.items){
  const a=item.arrangement,t=item.ticks,us=Math.round(60000000/a.tempoBpm),key=a.key.tonic,minor=a.key.mode==='minor';
  tempo.push({t,o:0,d:[255,81,3,us>>16&255,us>>8&255,us&255]},{t,o:1,d:[255,88,4,4,2,24,8]});
  // Text at every section start preserves user names for DAWs that show markers.
  const label=item.section.name+(item.section.repeats>1?' '+item.repeat+'/'+item.section.repeats:'');
  const chars=Array.from(new TextEncoder().encode(label));tempo.push({t,o:2,d:[255,6,...vlq(chars.length),...chars]});
  // The rendered notes already have this key; MIDI marks the local key too.
  const circle=[0,7,2,9,4,11,6,1,8,3,10,5],sf=circle.indexOf((key+(minor?3:0))%12),signed=sf<=6?sf:sf-12;
  tempo.push({t,o:1,d:[255,89,2,signed&255,minor?1:0]});
  PARTS.forEach((id,i)=>{
   const p=a.parts[id],ch=id==='drums'?9:i,ev=tracks[i];
   ev.push({t,o:0,d:[192|ch,program(id,p)]},{t,o:0,d:[176|ch,7,Math.round(p.volume*127)]});
   if(!p.enabled||!p.volume)return;
   for(const n of p.notes){const on=t+Math.round(n.start*a.tempoBpm/60*TPQ),off=Math.max(on+1,t+Math.round((n.start+n.dur)*a.tempoBpm/60*TPQ));
    ev.push({t:on,o:2,d:[144|ch,n.midi,n.velocity||Math.max(1,Math.round(n.vel*127))]},{t:off,o:1,d:[128|ch,n.midi,0]});}
  });
 }
 const bytes=[77,84,104,100,0,0,0,6,0,1,0,5,1,224];
 for(const b of S.midiTrack(tempo,'Song Creation'))bytes.push(b);
 tracks.forEach((events,i)=>{for(const b of S.midiTrack(events,PARTS[i][0].toUpperCase()+PARTS[i].slice(1)))bytes.push(b);});
 return new Blob([new Uint8Array(bytes)],{type:'audio/midi'});
}
function vlq(value){const out=[value&127];while(value>>=7)out.unshift((value&127)|128);return out;}
root.ScuLaSongTimeline=Object.freeze({resolve,render,midi,wav:A.wav,tailSeconds:TAIL_SECONDS});
})(typeof window==='undefined'?globalThis:window);
