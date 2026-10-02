const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const c=vm.createContext({Math,Float32Array});
for(const name of ['synthesis','song-instruments'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/audio',name+'.js'),'utf8'),c);
const I=c.ScuLaSongInstruments;
const energy=x=>x.reduce((sum,v)=>sum+v*v,0);
const section=(x,start,end)=>energy(x.subarray(Math.floor(start*x.length),Math.floor(end*x.length)));
for(const id of ['piano','guitar','bass']){
 const a=I.instrument(id,60,.8,22050,.8),b=I.instrument(id,60,.8,22050,.8);
 assert.ok(a.length>22050*.8&&a.every(Number.isFinite)&&energy(a)>1,id+' must produce a finite note');
 assert.deepEqual(a,b,id+' must render reproducibly for export');
 assert.ok(section(a,0,.15)>section(a,.75,1),id+' must decay after its attack');
 const soft=I.instrument(id,60,.8,22050,.2);
 assert.notDeepEqual(a,soft,id+' must respond to note velocity');
}
for(const type of ['kick','snare','hat','hato']){
 const sounds=['standard','soft','electronic'].map(kit=>I.drum(type,kit,22050));
 assert.ok(sounds.every(x=>x.every(Number.isFinite)&&energy(x)>.01),type+' kits must produce finite hits');
 assert.notDeepEqual(sounds[0],sounds[1],type+' soft kit must have its own sound');
 assert.notDeepEqual(sounds[0],sounds[2],type+' electronic kit must have its own sound');
 assert.ok(section(sounds[0],0,.25)>section(sounds[0],.75,1),type+' must decay');
}
assert.ok(I.drum('hato','standard',22050).length>I.drum('hat','standard',22050).length);
console.log('PASS  deterministic acoustic-style piano, strings and three distinct drum kits with attacks, decays and velocity response');
