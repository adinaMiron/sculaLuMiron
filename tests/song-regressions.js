// Shared local/CI entry point. The human-corpus evaluator needs a manifest and
// is deliberately not a regression suite; song-evaluation uses generated data.
const {spawnSync}=require('child_process');
const path=require('path');
const suites=[
  'verify','song-analysis','song-evaluation','song-bounded-analysis',
  'song-analysis-lifecycle','song-synthesis','song-instruments',
  'song-arrangement-generation','song-composition','song-composition-browser','song-bounded-render','song-render-browser','song-samples','song-integrity',
  'song-incremental-inspection','song-archive','song-archive-browser','song','song-recovery','song-performance',
  'song-arrangement','song-packs','song-sample-browser','song-timeline','song-backup-import',
  'voice','melody'
];
if(process.argv.includes('--list'))console.log(suites.join('\n'));
else{
  const failed=[];
  for(const suite of suites){
    console.log('\nRunning '+suite);
    const result=spawnSync(process.execPath,[path.join(__dirname,suite+'.js')],{stdio:'inherit',timeout:900000});
    if(result.error)console.error(result.error.message);
    console.log('RESULT '+suite+': '+(result.status===0?'PASS':'FAIL'));
    if(result.status!==0)failed.push(suite);
  }
  console.log(failed.length?'FAILED: '+failed.join(', '):'All '+suites.length+' Song/shared Voice suites passed');
  process.exitCode=failed.length?1:0;
}
