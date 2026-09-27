// Accuracy contract captured from Voice BEFORE sharing its synthesis/harmony code.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),fixture=path.join(__dirname,'fixtures/voice-synthesis-v1.json');
const names=['INSTR','LEAD_ORDER','CHORD_ORDER','snapMidi','chordsFor','fitRange','chordVoicing','renderInstrument','renderKick','renderSnare','renderHat','place','finishMix','wavBlob','midiBlob'];
function load(){
 let seed=123456789;const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const context=vm.createContext({Math:math,Blob,Float32Array,Float64Array,Uint8Array,ArrayBuffer,DataView});
 const shared=path.join(root,'js/audio/synthesis.js');
 if(fs.existsSync(shared)){vm.runInContext(fs.readFileSync(shared,'utf8'),context);return context.ScuLaSynthesis;}
 const source=fs.readFileSync(path.join(root,'voice.html'),'utf8');
 const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
 vm.runInContext('const TAU2=Math.PI*2,clampN=(v,a,b)=>Math.max(a,Math.min(b,v));'+slice('const INSTR =','/* Analysis v1')+slice('function snapMidi(','/* --- arrangement')+slice('function fitRange(','function keyName(')+';globalThis.api={'+names.join(',')+'};',context);
 return context.api;
}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const S=load(),out={};
 for(const id of Object.keys(S.INSTR)){
  const x=S.renderInstrument(id,69,.3,22050);
  assert.ok(x.every(Number.isFinite));assert.ok(x.some(v=>Math.abs(v)>.01));
  out[id]=hash(Buffer.from(x.buffer));
 }
 for(const [id,x] of [['kick',S.renderKick(22050)],['snare',S.renderSnare(22050)],['hat',S.renderHat(22050,false)],['openHat',S.renderHat(22050,true)]])out[id]=hash(Buffer.from(x.buffer));
 const L=new Float32Array(22050),R=new Float32Array(22050);S.place(L,R,S.renderInstrument('piano',60,.5,22050),.1,.3,.16,.7,-.22,22050);S.finishMix(L,R,22050,.16);
 const wav=Buffer.from(await S.wavBlob(L,R,22050).arrayBuffer());assert.equal(wav.readUInt16LE(22),2);assert.equal(wav.readUInt16LE(34),16);assert.equal(wav.length,44+22050*4);out.mix=hash(wav);
 // Sustain-weighted C, F, G, final C; minor final cadence and silent bars.
 const notes=[{start:0,dur:2,midi:60},{start:2,dur:2,midi:64},{start:4,dur:4,midi:65},{start:8,dur:4,midi:71}];
 const chords=JSON.parse(JSON.stringify(S.chordsFor(notes,0,4,4,0,'major')));assert.deepEqual(chords.map(c=>[c.root,c.q]),[[0,'maj'],[5,'maj'],[7,'maj'],[0,'maj']]);out.chords=chords;
 assert.equal(S.chordsFor([],0,4,1,9,'minor')[0].q,'min');assert.equal(S.snapMidi(61,0,[0,2,4,5,7,9,11]),60);
 assert.deepEqual(Array.from(S.chordVoicing({root:0,q:'maj'})),[60,64,67]);assert.equal(S.fitRange(12,S.INSTR.piano),36);
 out.midi=hash(Buffer.from(await S.midiBlob([{ch:0,gm:0,name:'Lead',notes:[{start:.1,dur:.4,midi:60,vel:.7}]},{ch:9,gm:0,name:'Drums',notes:[{start:0,dur:.12,midi:36,vel:1}]}],100).arrayBuffer()));
 if(process.argv.includes('--record')){assert.ok(!fs.existsSync(path.join(root,'js/audio/synthesis.js')),'Record baseline before extraction');fs.writeFileSync(fixture,JSON.stringify(out,null,2)+'\n');}
 else assert.deepEqual(out,JSON.parse(fs.readFileSync(fixture,'utf8')));
 console.log('PASS  Voice v1: fourteen instrument/drum kernels, stereo mix/WAV, MIDI, weighted harmony and range fixtures');
})().catch(e=>{console.error(e);process.exitCode=1;});
