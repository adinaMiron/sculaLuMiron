/* Song's acoustic-style renderers. The Voice synthesis API and its saved
   reference sound stay versioned separately. No downloaded samples are used. */
(function(root){
'use strict';
const TAU=Math.PI*2;
const rng=seed=>{let state=seed>>>0;return ()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296)*2-1;};
const seedFor=(midi,velocity,salt)=>Math.round(midi*100)*2654435761^Math.round(velocity*127)*2246822519^salt;
const limit=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/* Three slightly mistuned strings, with stiff-string inharmonicity, a soft
   hammer at low velocity, a short felt/key transient and per-partial damping.
   High notes decay sooner than low notes, as on a piano. */
function* pianoBlocks(midi,hold,sr,velocity,blockSize){
 const f=440*2**((midi-69)/12),v=limit(velocity,0,1),seconds=Math.min(hold+.25,Math.max(1.6,7.5-(midi-45)*.065));
 const total=Math.ceil(seconds*sr),out=new Float32Array(Math.min(total,blockSize)),random=rng(seedFor(midi,v,1));
 const strings=midi<48?2:3,partials=[];
 const stiffness=.00008+Math.max(0,midi-45)*.000008;
 const brightness=limit(.38+v*.78-(midi-72)*.004,.3,1.2);
 for(let s=0;s<strings;s++)for(let h=1;h<=10;h++){
  const hz=f*h*Math.sqrt(1+stiffness*h*h)*(1+(s-(strings-1)/2)*.00075);
  if(hz>sr*.45)break;
  const hammer=Math.abs(Math.sin(Math.PI*h*(.12+.07*(1-v))));
  const amp=Math.pow(brightness,h-1)*hammer/Math.pow(h,1.18);
  partials.push({phase:random()*Math.PI,step:TAU*hz/sr,amp:amp/strings,
   decay:Math.exp(-1/(sr*(Math.max(.11,seconds*(.95-.055*h)))))});
 }
 let noise=0,transient=0;
 for(let i=0;i<total;i++){
  let sum=0;
  for(const p of partials){sum+=Math.sin(p.phase)*p.amp;p.phase+=p.step;if(p.phase>TAU)p.phase-=TAU;p.amp*=p.decay;}
  noise=noise*.7+random()*.3;
  transient=transient*.94+noise*.06;
  const t=i/sr,attack=1-Math.exp(-t/.0025),damper=t>hold?Math.exp(-(t-hold)/.075):1;
  out[i%blockSize]=(sum*.42+transient*Math.exp(-t/.025)*(.015+.04*v))*attack*damper;
  if((i+1)%blockSize===0 || i===total-1)yield out.subarray(0,i%blockSize+1);
 }

}

/* A pluck excites a damped delay line. A comb in the initial burst models
   the pick position; the body/pickup filters give guitar and bass different
   spectra. Fractional delay interpolation keeps tuning accurate across notes. */
function* stringBlocks(midi,hold,sr,velocity,bass,blockSize){
 const f=440*2**((midi-69)/12),v=limit(velocity,0,1);
 const seconds=Math.min(hold+.3,bass?5:4.5),total=Math.ceil(seconds*sr),out=new Float32Array(Math.min(total,blockSize));
 const length=Math.max(3,Math.floor(sr/f)),frac=sr/f-length,line=new Float32Array(length),random=rng(seedFor(midi,v,bass?3:2));
 const pick=Math.max(2,Math.round(length*(bass?.21:.16)));
 let smooth=0;
 for(let i=0;i<length;i++){smooth=.62*smooth+.38*random();line[i]=smooth-(i>=pick?line[i-pick]*.65:0);}
 let index=0,previous=0,body=0,pickup=0;
 const loss=Math.exp(-1/(sr*(bass?1.9:1.35))*length),tone=bass?.63:.48;
 for(let i=0;i<total;i++){
  const older=(index+length-1)%length,current=line[index],sample=current*(1-frac)+line[older]*frac;
  const filtered=(sample+previous)*.5;previous=sample;
  line[index]=loss*(tone*filtered+(1-tone)*current);index=(index+1)%length;
  body+=.025*(sample-body);pickup+=.11*(body-pickup);
  const t=i/sr,release=t>hold?Math.exp(-(t-hold)/(bass?.13:.085)):1;
  const pickNoise=random()*Math.exp(-t/.004)*(bass?.014:.026)*v;
  out[i%blockSize]=((bass?.65:.78)*sample+(bass?.45:.22)*pickup+pickNoise)*(.55+.45*v)*release;
  if((i+1)%blockSize===0 || i===total-1)yield out.subarray(0,i%blockSize+1);
 }

}

function* instrumentBlocks(id,midi,hold,sr,velocity=1,blockSize=4096){
 if(id==='piano'){yield* pianoBlocks(midi,hold,sr,velocity,blockSize);return;}
 if(id==='guitar'||id==='bass'){yield* stringBlocks(midi,hold,sr,velocity,id==='bass',blockSize);return;}
 const next=rng(seedFor(midi,Math.round(hold*1000)+sr+id.length,17));
 yield* root.ScuLaSynthesis.instrumentBlocks(id,midi,hold,sr,()=>(next()+1)/2,blockSize);
}
function instrument(id,midi,hold,sr,velocity=1){
 const chunks=[];let size=0;
 for(const block of instrumentBlocks(id,midi,hold,sr,velocity)){chunks.push(block.slice());size+=block.length;}
 const out=new Float32Array(size);let at=0;for(const block of chunks){out.set(block,at);at+=block.length;}return out;
}

/* Drum kits share the MIDI mapping, but have their own resonances, noise
   balance and decay. The standard kit is acoustic-style, soft uses lighter
   strikes, and electronic has more stable pitched bodies. */
function drum(type,kit,sr){
 const electronic=kit==='electronic',soft=kit==='soft';
 const duration=type==='kick'?.52:type==='snare'?.34:type==='hato'?.58:.17;
 const out=new Float32Array(Math.ceil(duration*sr)),random=rng(seedFor(sr,0,type==='kick'?4:type==='snare'?5:type==='hat'?6:7)+(electronic?19:soft?11:0));
 let phase=0,noiseLow=0,noisePrev=0,metal=0;
 for(let i=0;i<out.length;i++){
  const t=i/sr;
  const white=random();noiseLow+=.18*(white-noiseLow);
  const high=white-noiseLow,crisp=high-noisePrev*.25;noisePrev=high;
  let value;
  if(type==='kick'){
   const base=electronic?49:soft?52:48,sweep=electronic?135:soft?65:105;
   phase+=TAU*(base+sweep*Math.exp(-t/(electronic?.046:.027)))/sr;
   const body=Math.sin(phase)*Math.exp(-t/(electronic?.24:soft?.13:.17));
   value=body*(electronic?.88:soft?.68:.86)+crisp*Math.exp(-t/.003)*(electronic?.13:soft?.08:.2);
  }else if(type==='snare'){
   phase+=TAU*(electronic?210:soft?166:185)/sr;
   const shell=Math.sin(phase)*Math.exp(-t/.052)*(electronic?.52:.33);
   const wires=crisp*Math.exp(-t/(electronic?.12:soft?.085:.105))*(electronic?.53:soft?.38:.58);
   value=shell+wires;
  }else{
   const open=type==='hato',decay=open?(soft?.22:.31):(soft?.036:.052);
   const freqs=electronic?[3220,4810,7190]:[2780,3970,5360];
   metal=(Math.sin(TAU*freqs[0]*t)+.65*Math.sin(TAU*freqs[1]*t)+.45*Math.sin(TAU*freqs[2]*t))*.2;
   value=(crisp*(electronic?.35:.45)+metal*(electronic?.65:.42))*Math.exp(-t/decay)*(soft?.65:1);
  }
  out[i]=value;
 }
 return out;
}
root.ScuLaSongInstruments=Object.freeze({instrument,instrumentBlocks,drum});
})(typeof window==='undefined'?globalThis:window);
