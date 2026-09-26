// /verify: syntax, byte-identical navigation and Romanian diacritics.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),pages=['voice','editor','index','recipes','calendar','transfer','map','kanban','song'];
let nav=null,failed=0;
function parse(file,code){try{new vm.Script(code,{filename:file});}catch(e){failed++;console.error(e.message);}}
for(const p of pages){
 const file=p+'.html',source=fs.readFileSync(path.join(root,file),'utf8');
 const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>\s*([\s\S]*?)<\/script>/g)];scripts.forEach((s,i)=>parse(file+' script '+i,s[1]));
 const block=source.match(/<nav id="site-nav"[\s\S]*?<!-- ===== end toolbar nav ===== -->/);
 if(!block || (nav && block[0]!==nav)){failed++;console.error('Nav drift: '+file);}else nav=block[0];
 source.split('\n').forEach((line,i)=>{if(/[şţ]/.test(line) && !/cedilla/.test(line)){failed++;console.error('Cedilla: '+file+':'+(i+1));}});
 console.log('Checked '+file);
}
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())scan(f);else if(f.endsWith('.js')){parse(path.relative(root,f),fs.readFileSync(f,'utf8'));console.log('Checked '+path.relative(root,f));}}}
scan(path.join(root,'js'));
console.log(failed?`${failed} verification failures`:'JS parses; all nine nav blocks synchronized; diacritics OK');process.exitCode=failed?1:0;
