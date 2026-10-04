/* Project sections link to arrangement versions. Each version owns its tempo/key. */
(function(root){
'use strict';
const A=root.ScuLaArrangement,S=root.ScuLaSynthesis,PARTS=A.PARTS,TPQ=480,TAIL_SECONDS=1.8;
function partsFor(item){
 const {arrangement:a,section}=item;
 if(!section.mix)return a.parts;
 return Object.fromEntries(PARTS.map(id=>[id,{...a.parts[id],...section.mix[id]}]));
}
function resolve(project){
 const sections=project.timeline||[],byId=new Map((project.arrangements||[]).map(a=>[a.id,a]));
 if(!Array.isArray(sections))throw new Error('timelineInvalid');
 const ids=new Set(),items=[];let seconds=0,ticks=0;
 for(const section of sections){
  if(!section || typeof section.id!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(section.id) || ids.has(section.id) || typeof section.name!=='string' || !section.name.trim() || section.name.length>120 || typeof section.arrangementId!=='string' || !Number.isInteger(section.repeats) || section.repeats<1 || section.repeats>16)throw new Error('timelineInvalid');
  ids.add(section.id);const a=byId.get(section.arrangementId);if(!a)throw new Error('timelineInvalid');A.validate(a);
  if(section.mix!==undefined){
   if(!section.mix || typeof section.mix!=='object' || Array.isArray(section.mix) || Object.keys(section.mix).length!==PARTS.length)throw new Error('timelineInvalid');
   for(const id of PARTS){const p=section.mix[id];if(!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).length!==2 || typeof p.enabled!=='boolean' || !Number.isFinite(p.volume) || p.volume<0 || p.volume>1)throw new Error('timelineInvalid');}
  }
  if(!Number.isFinite(a.duration)||a.duration<=0)throw new Error('timelineInvalid');
  for(let i=0;i<section.repeats;i++){
   items.push({section,arrangement:a,seconds,ticks,repeat:i+1});
   seconds+=a.duration;ticks+=Math.round(a.duration*a.tempoBpm/60*TPQ);
   if(seconds>1200)throw new Error('timelineInvalid');
  }
 }
 return {items,seconds,ticks};
}
async function render(project,opts){return root.ScuLaSongRenderer.song(project,opts).collect();}

function midi(project,range=null){
 const plan=resolve(project);if(!plan.items.length)throw new Error('timelineEmpty');
 if(range && (!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.start<0||range.end<=range.start||range.end>plan.seconds+TAIL_SECONDS+.001))throw new Error('timelineInvalid');
 // MIDI time is piecewise musical time: a second on either side of a tempo
 // change has a different number of ticks. The audio tail uses the last tempo.
 const atTick=seconds=>{let item=plan.items[0];for(const next of plan.items){if(next.seconds>seconds)break;item=next;}return Math.round(item.ticks+(seconds-item.seconds)*item.arrangement.tempoBpm/60*TPQ);};
 const startTick=range?atTick(range.start):0,endTick=range?atTick(range.end):Infinity;
 const active=range?plan.items.reduce((current,item)=>item.seconds<=range.start?item:current,plan.items[0]):null;
 const tempo=[],tracks=PARTS.map(()=>[]),program=(id,p)=>id==='drums'?A.KITS[p.instrument].gm:S.INSTR[p.instrument].gm;
 for(const item of plan.items){
  const initial=range&&item===active,inside=!range || item.seconds>=range.start && item.seconds<range.end;
  const emit=initial||inside;
  const a=item.arrangement,parts=partsFor(item),t=range?(initial?0:item.ticks-startTick):item.ticks,us=Math.round(60000000/a.tempoBpm),key=a.key.tonic,minor=a.key.mode==='minor';
  if(emit){
  tempo.push({t,o:0,d:[255,81,3,us>>16&255,us>>8&255,us&255]},{t,o:1,d:[255,88,4,4,2,24,8]});
  // Text at every section start preserves user names for DAWs that show markers.
  const label=item.section.name+(item.section.repeats>1?' '+item.repeat+'/'+item.section.repeats:'');
  const chars=Array.from(new TextEncoder().encode(label));tempo.push({t,o:2,d:[255,6,...vlq(chars.length),...chars]});
  // The rendered notes already have this key; MIDI marks the local key too.
  const circle=[0,7,2,9,4,11,6,1,8,3,10,5],sf=circle.indexOf((key+(minor?3:0))%12),signed=sf<=6?sf:sf-12;
  tempo.push({t,o:1,d:[255,89,2,signed&255,minor?1:0]});
  }
  PARTS.forEach((id,i)=>{
   const p=parts[id],ch=id==='drums'?9:i,ev=tracks[i];
   if(emit)ev.push({t,o:0,d:[192|ch,program(id,p)]},{t,o:0,d:[176|ch,7,Math.round(p.volume*127)]});
   if(!p.enabled||!p.volume)return;
   for(const n of p.notes){const on=item.ticks+Math.round(n.start*a.tempoBpm/60*TPQ),off=Math.max(on+1,item.ticks+Math.round((n.start+n.dur)*a.tempoBpm/60*TPQ));
    if(on>=endTick||off<=startTick)continue;
    ev.push({t:Math.max(on,startTick)-startTick,o:2,d:[144|ch,n.midi,n.velocity||Math.max(1,Math.round(n.vel*127))]},{t:Math.min(off,endTick)-startTick,o:1,d:[128|ch,n.midi,0]});}
  });
 }
 const bytes=[77,84,104,100,0,0,0,6,0,1,0,5,1,224];
 for(const b of S.midiTrack(tempo,'Song Creation'))bytes.push(b);
 tracks.forEach((events,i)=>{for(const b of S.midiTrack(events,PARTS[i][0].toUpperCase()+PARTS[i].slice(1)))bytes.push(b);});
 return new Blob([new Uint8Array(bytes)],{type:'audio/midi'});
}
function vlq(value){const out=[value&127];while(value>>=7)out.unshift((value&127)|128);return out;}
function edgeFade(mix,milliseconds){
 if(!Number.isFinite(milliseconds)||milliseconds<0||milliseconds>100)throw new Error('timelineInvalid');
 if(!milliseconds)return mix;
 const L=Float32Array.from(mix.L),R=Float32Array.from(mix.R),frames=Math.min(Math.round(milliseconds*mix.sr/1000),Math.floor(L.length/2));
 for(let i=0;i<frames;i++){const gain=i/frames,j=L.length-1-i;L[i]*=gain;R[i]*=gain;L[j]*=gain;R[j]*=gain;}
 return {L,R,sr:mix.sr};
}
root.ScuLaSongTimeline=Object.freeze({resolve,render,midi,edgeFade,wav:A.wav,tailSeconds:TAIL_SECONDS});
})(typeof window==='undefined'?globalThis:window);
