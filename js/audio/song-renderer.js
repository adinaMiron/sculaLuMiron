/* Bounded Song PCM renderer. No full-length tone, reverb or song buffers.
   Export scans peaks, then deterministically replays. Preview may read a range
   without scanning the rest of the song. See docs/SONG-RENDERING.md for budgets. */
(function(root){
'use strict';
const A=root.ScuLaArrangement,S=root.ScuLaSynthesis,I=root.ScuLaSongInstruments,T=root.ScuLaSongTimeline;
const LIMITS=Object.freeze({blockFrames:4096,workingBytes:24*1048576,sampleBytes:16*1048576,downloadBytes:32*1048576,previewSeconds:30,maxVoices:96,maxArrangements:16});
const pans={lead:0,chords:-.22,bass:.05,drums:.1},drums={36:'kick',38:'snare',42:'hat',46:'hato'};
const sleep=()=>new Promise(r=>setTimeout(r,0));
function budget(){let used=0,peak=0,voices=0,arrangements=0;return {
 reserve(bytes,kind){if(used+bytes>LIMITS.workingBytes || kind==='voice'&&voices>=LIMITS.maxVoices || kind==='arrangement'&&arrangements>=LIMITS.maxArrangements)throw Error('renderLimit');used+=bytes;peak=Math.max(peak,used);if(kind==='voice')voices++;if(kind==='arrangement')arrangements++;let active=true;return ()=>{if(!active)return;active=false;used-=bytes;if(kind==='voice')voices--;if(kind==='arrangement')arrangements--;};},
 get stats(){return {usedBytes:used,peakBytes:peak,voices,arrangements,limitBytes:LIMITS.workingBytes};}
};}
// Float32 rounding and comb/allpass order match synthesis.reverbTail exactly.
function room(sr,offset){
 const combs=[1116,1188,1277,1356].map(d=>({b:new Float32Array(Math.round((d+offset)*sr/44100)),i:0,store:0}));
 const aps=[556,441].map(d=>({b:new Float32Array(Math.round((d+offset)*sr/44100)),i:0}));
 return x=>{const wet=new Float32Array(x.length);
  for(const c of combs)for(let s=0;s<x.length;s++){const y=c.b[c.i];wet[s]+=y;c.store=y*.72+c.store*.28;c.b[c.i]=x[s]+c.store*.79;if(++c.i===c.b.length)c.i=0;}
  for(let s=0;s<x.length;s++)wet[s]*=.25;
  for(const a of aps)for(let s=0;s<x.length;s++){const y=a.b[a.i],o=-wet[s]+y;a.b[a.i]=wet[s]+y*.5;if(++a.i===a.b.length)a.i=0;wet[s]=o;}
  for(let s=0;s<x.length;s++)x[s]+=wet[s]*.16;
 };
}
function options(opts={}){
 const sr=opts.sampleRate||44100,block=opts.blockFrames||LIMITS.blockFrames;
 if(!Number.isInteger(sr)||sr<8000||sr>48000||!Number.isInteger(block)||block<128||block>LIMITS.blockFrames)throw Error('renderLimit');
 const o={...opts,sr,block,budget:opts.budget||budget(),cancelled:opts.cancelled||(()=>false),yieldUI:opts.yieldUI||sleep,progress:opts.progress||(()=>{})};
 o.check=()=>{if(o.cancelled())throw Error('cancelled');};o.check();return o;
}
function voice(p,id,n,samples,o){
 const pitch=n.midi+(n.cents||0)/100;
 if(pitch< -12||pitch>139)throw Error('renderLimit');
 const sr=o.sr,start=Math.round(n.start*sr),hold=Math.max(1,Math.round(n.dur*sr)),pan=pans[id];
 const sampleKey=p.samplePack?'pack:'+p.samplePack.sha256:p.sampleSet;
 const groups=p.samplePack?(samples[Symbol.for('ScuLaSongPacks')]||{}):samples;
 const group=sampleKey&&Object.hasOwn(groups,sampleKey)?groups[sampleKey]:[];
 const selected=sampleKey?A.mapSample(Array.isArray(group)?group:[],n.midi+(n.cents||0)/100,n.velocity||Math.round(n.vel*127)):null;
 if(sampleKey&&!selected)o.fallback?.(p);
 const release=o.budget.reserve(192*1024,'voice');
 try{
 if(selected){const settings=A.samplePlayback(selected.playback,selected.channels[0].length/selected.sampleRate),rel=Math.round(settings.releaseSeconds*sr),rate=2**((n.midi+(n.cents||0)/100-selected.midiNote)/12)*selected.sampleRate/sr;const frames=Math.max(0,Math.min(hold+rel,settings.loopStartSeconds!==null?Infinity:Math.floor((selected.channels[0].length-1-settings.startSeconds*selected.sampleRate)/rate)));return {start,end:start+frames,release,place:(L,R,offset)=>A.placeSample(L,R,selected,n,(id==='chords'?.2:.28)*p.volume,pan,sr,offset)};}
 const drum=id==='drums',rel=drum?.005:S.INSTR[p.instrument].rel;
 const buf=drum?I.drum(drums[n.midi],p.instrument,sr):null;
 const held=drum?buf.length:hold,fade=Math.max(1,Math.round(rel*sr)),gain=(drum?({36:.4,38:.25,42:.13,46:.12})[n.midi]:id==='chords'?.2:.28)*p.volume*n.vel;
 const gl=gain*Math.cos((pan+1)*Math.PI/4),gr=gain*Math.sin((pan+1)*Math.PI/4);
 const iterator=drum?[buf][Symbol.iterator]():I.instrumentBlocks(p.instrument,n.midi+(n.cents||0)/100,n.dur+rel,sr,Math.round(n.vel*8)/8,o.block);
 let data=null,at=0,consumed=0,done=false;
 return {start,end:start+held+fade,release,place(L,R,offset){
  const first=Math.max(start,offset),end=Math.min(start+held+fade,offset+L.length);
  for(let f=first;f<end;f++){
   if(!data||at===data.length){const next=iterator.next();if(next.done){done=true;break;}data=next.value;at=0;}
   const v=data[at++]*(consumed>held?1-(consumed-held)/fade:1);consumed++;
   L[f-offset]+=v*gl;R[f-offset]+=v*gr;
  }
  if(done)this.end=offset;
 }};
 }catch(e){release();throw e;}
}
function eventsFor(a,o){
 const events=[];
 let order=0;
 for(const id of A.PARTS){const p=a.parts[id];if(!p.enabled||!p.volume)continue;for(const n of A.performanceNotes(p,a)){
  if(!Number.isFinite(n.start)||n.start<0||!Number.isFinite(n.dur)||n.dur<=0||!Number.isFinite(n.midi)||n.midi<0||n.midi>127||!Number.isFinite(n.vel)||n.vel<0||n.vel>1||n.cents!==undefined&&!Number.isFinite(n.cents))throw Error('invalidEdit');
  events.push({p,id,n,start:Math.round(n.start*o.sr),order:order++});if(events.length>20000)throw Error('renderLimit');
 }}
 events.sort((a,b)=>a.start-b.start||a.order-b.order);return events;
}
async function* raw(a,samples,o,events){
 A.validate(a);if(!Number.isFinite(a.duration)||a.duration<=0||a.duration>1200)throw Error('renderLimit');
 let sampleBytes=0;const arrays=new Set();for(const group of [...Object.values(samples),...Object.values(samples[Symbol.for('ScuLaSongPacks')]||{})]){if(!Array.isArray(group))continue;for(const sample of group){if(!Array.isArray(sample?.channels))continue;for(const channel of sample.channels){if(!arrays.has(channel)&&Number.isFinite(channel?.byteLength)){arrays.add(channel);sampleBytes+=channel.byteLength;}}}}
 if(sampleBytes>LIMITS.sampleBytes)throw Error('sampleBudget');
 const release=o.budget.reserve(128*1024,'arrangement'),active=[];
 try{
 const length=Math.ceil((a.duration+1.8)*o.sr),left=room(o.sr,0),right=room(o.sr,23);
 let next=0;
 for(let offset=0;offset<length;offset+=o.block){
  o.check();const count=Math.min(o.block,length-offset),L=new Float32Array(count),R=new Float32Array(count);
  while(next<events.length&&events[next].start<offset+count){const event=events[next++],v=voice(event.p,event.id,event.n,samples,o);v.order=event.order;active.push(v);}
  active.sort((a,b)=>a.order-b.order);
  let work=0;for(const v of active){v.place(L,R,offset);if(++work%8===0)await o.yieldUI();o.check();}
  for(let i=active.length-1;i>=0;i--)if(active[i].end<=offset+count){active[i].release();active.splice(i,1);}
  left(L);right(R);await o.yieldUI();o.check();yield {L,R,offset};
 }
 }finally{for(const v of active)v.release();release();}
}
function peakOf(block){let peak=0;for(let i=0;i<block.L.length;i++)peak=Math.max(peak,Math.abs(block.L[i]),Math.abs(block.R[i]));return peak;}
function scale(block,gain){if(gain!==1)for(let i=0;i<block.L.length;i++){block.L[i]*=gain;block.R[i]*=gain;}return block;}
function session(items,seconds,opts){
 const o=options(opts),length=Math.ceil((seconds+1.8)*o.sr),variants=new Map();
 if(items.length>5000)throw Error('renderLimit');
 for(const item of items){const key=item.a.id+'|'+JSON.stringify(item.a.parts&&A.PARTS.map(id=>{const p=item.a.parts[id];return [p.enabled,p.volume];}));
  if(!variants.has(key))variants.set(key,{a:item.a,gain:1});item.variant=variants.get(key);item.start=Math.round(item.seconds*o.sr);
 }
 let noteCount=0;for(const v of variants.values()){
  A.validate(v.a);v.events=eventsFor(v.a,o);noteCount+=v.events.length;if(noteCount>20000)throw Error('renderLimit');
 }
 let prepared=false,globalGain=1;
 const samplesFor=opts.samplesFor|| (async()=>opts.samples||{});
 async function* blocks({start=0,end=length,normalized=true,cancelled=()=>false}={}){
  const bo={...o,check:()=>{o.check();if(cancelled())throw Error('cancelled');}};
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>length||end<=start)throw Error('renderLimit');
  const live=[];let index=0;
  try{
  while(index<items.length && items[index].start+Math.ceil((items[index].a.duration+1.8)*o.sr)<=start)index++;
  for(let offset=start;offset<end;offset+=o.block){
   bo.check();const count=Math.min(o.block,end-offset),L=new Float32Array(count),R=new Float32Array(count);
   while(index<items.length&&items[index].start<offset+count){
    const item=items[index++];if(item.start+Math.ceil((item.a.duration+1.8)*o.sr)<=offset)continue;
    const samples=await samplesFor(item.a);o.check();
    const iterator=raw(item.a,samples,bo,item.variant.events),state={item,iterator,block:null,done:false};live.push(state);
   }
   for(const state of live){
    const {item,iterator}=state;
    while(!state.done){
     if(!state.block){const result=await iterator.next();if(result.done){state.done=true;break;}state.block=result.value;scale(state.block,normalized?item.variant.gain:1);}
     const b=state.block,at=item.start+b.offset,stop=at+b.L.length;
     if(at>=offset+count)break;
     if(stop>offset)for(let f=Math.max(offset,at);f<Math.min(offset+count,stop);f++){L[f-offset]+=b.L[f-at];R[f-offset]+=b.R[f-at];}
     if(stop>offset+count)break;state.block=null;
    }
   }
   for(let i=live.length-1;i>=0;i--)if(live[i].done)live.splice(i,1);
   await o.yieldUI();o.check();yield scale({L,R,offset},normalized?globalGain:1);
  }
  }finally{for(const state of live)await state.iterator.return();}
 }
 async function prepare(){
  if(prepared)return;let done=0;
  for(const v of variants.values()){
   let peak=0;const samples=await samplesFor(v.a);o.check();
   for await(const b of raw(v.a,samples,o,v.events)){peak=Math.max(peak,peakOf(b));o.progress('peaks',(done+(b.offset+b.L.length)/Math.ceil((v.a.duration+1.8)*o.sr))/variants.size*.5);}
   v.gain=peak>.95?.95/peak:1;done++;
  }
  // Per-arrangement attenuation precedes tail overlap, as in renderer v1.
  let peak=0;for await(const b of blocks()){peak=Math.max(peak,peakOf(b));o.progress('peaks',.5+.5*(b.offset+b.L.length)/length);}
  globalGain=peak>.95?.95/peak:1;prepared=true;
 }
 async function collect(){
  if(length>LIMITS.previewSeconds*o.sr)throw Error('renderLimit');
  await prepare();const L=new Float32Array(length),R=new Float32Array(length);
  for await(const b of blocks()){L.set(b.L,b.offset);R.set(b.R,b.offset);o.progress('render', (b.offset+b.L.length)/length);}return {L,R,sr:o.sr};
 }
 function wav({start=0,end=length,fadeMs=0}={}){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>length||end<=start||!Number.isFinite(fadeMs)||fadeMs<0||fadeMs>100)throw Error('renderLimit');
  const frames=end-start,size=44+frames*4,fade=Math.min(Math.round(fadeMs*o.sr/1000),Math.floor(frames/2));
  return {size,type:'audio/wav',check:o.check,stream:async function*(){
   await prepare();o.check();const header=new Uint8Array(await S.wavBlob(new Float32Array(0),new Float32Array(0),o.sr).arrayBuffer()),dv=new DataView(header.buffer);dv.setUint32(4,size-8,true);dv.setUint32(40,frames*4,true);yield header;
   for await(const b of blocks({start,end})){
    const bytes=new Uint8Array(b.L.length*4),view=new DataView(bytes.buffer);
    for(let i=0;i<b.L.length;i++){const at=b.offset-start+i,gain=fade?Math.min(1,at/fade,(frames-1-at)/fade):1;
     // Apply fades with Float32 rounding, identical to Timeline.edgeFade.
     const l=Math.fround(b.L[i]*gain),r=Math.fround(b.R[i]*gain);
     view.setInt16(i*4,Math.max(-1,Math.min(1,l))*32767|0,true);view.setInt16(i*4+2,Math.max(-1,Math.min(1,r))*32767|0,true);
    }
    o.progress('render',(b.offset+b.L.length-start)/frames);o.check();yield bytes;
   }
  }};
 }
 return {length,sampleRate:o.sr,prepare,blocks,collect,wav,check:o.check,get stats(){return o.budget.stats;}};
}
function arrangement(a,opts={}){return session([{a,seconds:0}],a.duration,opts);}
function song(project,opts={}){const plan=T.resolve(project);if(!plan.items.length)throw Error('timelineEmpty');return session(plan.items.map(item=>({seconds:item.seconds,a:item.section.mix?{...item.arrangement,parts:Object.fromEntries(A.PARTS.map(id=>[id,{...item.arrangement.parts[id],...item.section.mix[id]}]))}:item.arrangement})),plan.seconds,opts);}
root.ScuLaSongRenderer=Object.freeze({version:2,limits:LIMITS,arrangement,song});
})(typeof window==='undefined'?globalThis:window);
