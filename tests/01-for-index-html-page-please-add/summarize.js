// Prints failed tests from test-results/report.json (JSON reporter) in a short form:
//   node tests/01-for-index-html-page-please-add/summarize.js
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('test-results/report.json', 'utf8'));
let pass = 0, fail = 0;
(function walk(s, trail) {
  (s.specs || []).forEach(sp => sp.tests.forEach(t => {
    const res = t.results[t.results.length - 1];
    if (res.status === 'passed') pass++;
    else {
      fail++;
      const msg = ((res.error && res.error.message) || res.status).replace(/\x1b\[[0-9;]*m/g, '').replace(/data:image[^\s)'"]{40,}/g, 'data:…');
      console.log('FAIL ' + trail.concat(sp.title).join(' › ') + '\n   ' + msg.split('\n').slice(0, 6).join('\n   ').slice(0, 700));
    }
  }));
  (s.suites || []).forEach(c => walk(c, s.title && !/\.js$/.test(s.title) ? trail.concat(s.title) : trail));
})({ suites: r.suites }, []);
console.log(`\n${pass} passed, ${fail} failed`);
