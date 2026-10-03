// Read-only workbook import, speech alignment and reader lifecycle.
const assert = require('assert/strict');
const path = require('path');
const {chromium} = require('playwright');
require('../js/voice/teleprompter.js');
const {tokens, follow, plainText} = globalThis.ScuLaTeleprompter;
function check(name, fn){ fn(); console.log('PASS  ' + name); }
check('Romanian normalization, punctuation and case', () => assert.deepEqual(tokens('Știință, ȚARĂ!'), ['stiinta', 'tara']));
check('Markdown prose without markup, code or image URLs', () => assert.equal(plainText('# Salut\n\n**Lume** [bună](https://example.com)\n\n```js\nsecret()\n```\n![image](x.png)'), 'Salut\n\nLume bună'));
check('Partial speech advances immediately', () => assert.equal(follow(tokens('Bună ziua tuturor astăzi vorbim'), tokens('buna ziua'), 0), 2));
check('Repeated phrase stays at its original anchor', () => assert.equal(follow(tokens('one two one two three'), tokens('one two'), 0), 2));
check('Filler words and skipped script words tolerated', () => {
  assert.equal(follow(tokens('one two three four five'), tokens('one um two three'), 0), 3);
  assert.equal(follow(tokens('one two three four five'), tokens('one three four'), 0), 4);
});
check('Unrelated speech and isolated distant words do not move', () => {
  assert.equal(follow(tokens('one two three four five'), tokens('unrelated one stuff stuff'), 0), 0);
  assert.equal(follow(tokens('one two three four five'), tokens('five'), 0), 0);
});
check('Long uninterrupted results remain bounded and progress', () => {
  const script = Array.from({length:200}, (_, i) => 'word' + i);
  assert.equal(follow(script, script.slice(0, 140), 0), 140);
});

(async () => {
  const browser = await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
  try{
    const context = await browser.newContext({viewport:{width:1000,height:800}});
    await context.addInitScript(() => {
      window.__recognizers = [];
      class SR {
        constructor(){ window.__recognizers.push(this); }
        start(){ this.started = true; this.onstart?.(); }
        abort(){ this.aborted = true; this.onend?.(); }
      }
      window.SpeechRecognition = window.webkitSpeechRecognition = SR;
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.resolve(__dirname, '../voice.html'));
    await page.click('#tpToggle');
    await page.waitForFunction(() => document.querySelector('#tpSourceStatus').textContent.includes('Nu există'));
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === 'scula-md')), false);
    console.log('PASS  Empty workbook guidance');
    await page.evaluate(async () => {
      await new Promise((resolve,reject) => {
        const r = indexedDB.open('scula-md', 2);
        r.onupgradeneeded = () => {
          const db = r.result;
          db.createObjectStore('workbooks', {keyPath:'id'});
          db.createObjectStore('chapters', {keyPath:'id'}).createIndex('byWorkbook','workbookId');
          db.createObjectStore('meta'); db.createObjectStore('pending',{keyPath:'chapterId'});
        };
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result, tx = db.transaction(['workbooks','chapters'], 'readwrite');
          tx.objectStore('workbooks').put({id:'subs',name:' SUBTITRARE '});
          tx.objectStore('workbooks').put({id:'other',name:'Other'});
          tx.objectStore('chapters').put({id:'script',workbookId:'subs',title:'Discurs',content:'# Original\n\n**Bună ziua** tuturor.',updated:100});
          tx.objectStore('chapters').put({id:'other',workbookId:'other',title:'Hidden',content:'Private'});
          tx.oncomplete = () => { db.close(); resolve(); };
        };
      });
      localStorage.setItem('scula:md:draft', JSON.stringify({id:'script',text:'Bună ziua tuturor. Astăzi vorbim despre grădină și despre flori.',at:200}));
    });
    await page.click('#tpRefresh');
    await page.waitForFunction(() => document.querySelector('#tpChapter').options.length === 2);
    await page.selectOption('#tpChapter', 'script');
    assert.match(await page.inputValue('#tpScript'), /Astăzi/);
    console.log('PASS  Only Subtitrare chapters loaded, with newer Markdown draft');
    await page.click('#tpOpen');
    assert.equal(await page.evaluate(() => document.querySelector('#tpDialog').open), true);
    assert.equal(await page.evaluate(() => __recognizers.length), 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#tpReader')).fontSize), '48px');
    await page.click('#tpListen');
    assert.equal(await page.evaluate(() => __recognizers.at(-1).lang), 'ro-RO');
    assert.equal(await page.evaluate(() => __recognizers.at(-1).interimResults), true);
    const emit = (text, final = false, index = 0) => page.evaluate(({text,final,index}) => {
      const result = [{transcript:text}]; result.isFinal = final;
      const results = Array.from({length:index}, () => { const r = [{transcript:''}]; r.isFinal=true; return r; });
      results.push(result);
      __recognizers.at(-1).onresult({resultIndex:index,results});
    }, {text,final,index});
    const progress = () => page.textContent('#tpProgress');
    await emit('buna ziua'); assert.match(await progress(), /^2 \/ 10/);
    await emit('buna ziua'); assert.match(await progress(), /^2 \/ 10/);
    await emit('buna'); assert.match(await progress(), /^2 \/ 10/);
    await emit('buna ziua tuturor', true); assert.match(await progress(), /^3 \/ 10/);
    await emit('astazi vorbim despre gradina', false, 1); assert.match(await progress(), /^7 \/ 10/);
    await emit('unrelated background conversation', false, 1); assert.match(await progress(), /^7 \/ 10/);
    const beforeSilence = await progress(); await page.waitForTimeout(500); assert.equal(await progress(), beforeSilence);
    console.log('PASS  Interim revisions, final results, diacritics, unrelated speech and silence');
    await page.evaluate(() => { window.__late = __recognizers.at(-1).onresult; });
    await page.click('#tpListen');
    await page.evaluate(() => __late({resultIndex:0,results:[[{transcript:'și despre flori'}]]}));
    assert.equal(await progress(), beforeSilence);
    assert.equal(await page.evaluate(() => __recognizers.at(-1).aborted), true);
    console.log('PASS  Pause aborts microphone and ignores late results');
    await page.click('#tpReset');
    await page.click('#tpListen');
    await emit('buna ziua tuturor astazi vorbim despre gradina si despre flori', true);
    assert.match(await page.textContent('#tpStatus'), /sfârșitul/);
    assert.equal(await page.evaluate(() => __recognizers.at(-1).aborted), true);
    console.log('PASS  Completion releases microphone');
    await page.click('#tpListen');
    await page.evaluate(() => __recognizers.at(-1).onerror({error:'not-allowed'}));
    assert.match(await page.textContent('#tpStatus'), /refuzat/);
    await page.waitForTimeout(300);
    assert.match(await page.textContent('#tpStatus'), /refuzat/);
    console.log('PASS  Permission failure stays visible');
    await page.click('#tpListen');
    await page.evaluate(() => __recognizers.at(-1).onerror({error:'network'}));
    assert.match(await page.textContent('#tpStatus'), /conexiunea/);
    assert.equal(await page.evaluate(() => __recognizers.at(-1).aborted), true);
    await page.click('#tpListen');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
    });
    assert.equal(await page.evaluate(() => __recognizers.at(-1).aborted), true);
    console.log('PASS  Network error and background tab stop listening');
    await page.click('#tpListen');
    const count = await page.evaluate(() => { __recognizers.at(-1).onend(); return __recognizers.length; });
    await page.waitForFunction(n => __recognizers.length > n, count);
    const restart = await page.evaluate(() => { __recognizers.at(-1).onend(); return __recognizers.length; });
    await page.click('#tpExit'); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => __recognizers.length), restart);
    assert.equal(await page.evaluate(() => document.querySelector('#tpDialog').open), false);
    console.log('PASS  Recognition restarts, exit cancels pending restart');
    await page.click('#navLangBtn');
    assert.equal(await page.textContent('#tpOpen'), 'Open teleprompter');
    await page.selectOption('#tpLanguage', 'en-US');
    await page.fill('#tpScript', 'one two one two three four');
    await page.click('#tpOpen'); await page.click('#tpListen');
    assert.equal(await page.evaluate(() => __recognizers.at(-1).lang), 'en-US');
    await emit('one two'); await emit('one two', true); assert.match(await progress(), /^2 \/ 6/);
    await emit('one two', true, 1); assert.match(await progress(), /^4 \/ 6/);
    await page.click('#tpListen');
    await page.locator('#tpReader span').nth(1).click(); assert.match(await progress(), /^1 \/ 6/);
    await page.focus('#tpReader'); await page.keyboard.press('ArrowRight'); assert.match(await progress(), /^2 \/ 6/);
    await page.keyboard.press('Escape');
    console.log('PASS  English, repeated phrases and manual repositioning');
    await page.setViewportSize({width:390,height:844});
    await page.fill('#tpScript', Array.from({length:100}, (_,i) => 'paragraph' + i).join(' '));
    await page.click('#tpOpen');
    const layout = await page.evaluate(() => {
      const r = document.querySelector('#tpReader').getBoundingClientRect();
      const d = document.querySelector('#tpDialog');
      const exit = document.querySelector('#tpExit').getBoundingClientRect();
      return {height:r.height, width:r.width, overflow:d.scrollWidth > d.clientWidth,
        verticalOverflow:d.scrollHeight > d.clientHeight, exitVisible:exit.top >= 0 && exit.bottom <= innerHeight};
    });
    assert.ok(layout.height > 200); assert.ok(layout.width <= 390); assert.equal(layout.overflow, false);
    assert.equal(layout.verticalOverflow, false); assert.equal(layout.exitVisible, true);
    await page.click('#tpNext'); await page.click('#tpNext'); await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => document.querySelector('#tpReader').scrollTop > 0));
    console.log('PASS  Phone controls fit and reading line scrolls into view');
    await page.locator('#tpSize').fill('4.5');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#tpReader')).fontSize), '72px');
    await page.click('#tpExit');
    await page.evaluate(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
    await page.click('#tpOpen');
    assert.equal(await page.isDisabled('#tpListen'), true);
    assert.match(await page.textContent('#tpStatus'), /does not offer/);
    await page.click('#tpNext'); assert.match(await progress(), /^8 \/ 100/);
    await page.click('#tpExit');
    console.log('PASS  Unsupported browser retains manual reader');
    await page.evaluate(() => { window.__openDb = indexedDB.open; indexedDB.open = () => { throw new Error('unavailable'); }; });
    await page.click('#tpRefresh');
    assert.match(await page.textContent('#tpSourceStatus'), /Cannot read/);
    await page.evaluate(() => { indexedDB.open = window.__openDb; });
    assert.ok((await page.inputValue('#tpScript')).length > 0);
    console.log('PASS  Storage failure preserves the reading copy');
    const original = await page.evaluate(() => new Promise(resolve => {
      const r = indexedDB.open('scula-md');
      r.onsuccess = () => { const db = r.result; const tx = db.transaction('chapters'); const q = tx.objectStore('chapters').get('script'); tx.oncomplete = () => { db.close(); resolve(q.result.content); }; };
    }));
    assert.equal(original, '# Original\n\n**Bună ziua** tuturor.');
    assert.equal(await page.inputValue('#transcript'), '');
    assert.deepEqual(errors, []);
    console.log('PASS  Source chapter and dictation untouched; no page errors');
  }finally{ await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
