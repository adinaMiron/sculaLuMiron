// Delayed dictation stays with its recording's chapter/draft and session.
// Run: node tests/dictatedestination.js (bundled Chromium, no network).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function setup(browser, engine = 'api') {
  const context = await browser.newContext();
  await context.route(/^https?:/, route => route.abort());
  await context.addInitScript(engine => {
    localStorage.setItem('caiet-vocal:settings', JSON.stringify({
      engine, provider: 'custom', endpoint: 'https://dictation.test/transcriptions',
      model: 'whisper-large-v3', segMin: 0, tidy: false
    }));
    window.requests = [];
    window.streams = [];
    window.recorders = [];
    window.recognizers = [];
    const originalFetch = window.fetch;
    window.fetch = (url, options) => url === 'https://dictation.test/transcriptions'
      ? new Promise(resolve => window.requests.push(text => resolve({
        ok: true, json: async () => ({ text, language: 'english' })
      }))) : originalFetch(url, options);
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.holdMic) await new Promise(resolve => { window.releaseMic = resolve; });
      const track = { stopped: false, stop() { this.stopped = true; } };
      window.streams.push(track);
      return { getTracks: () => [track] };
    };
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; window.recorders.push(this); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        const finish = () => {
          this.ondataavailable({ data: new Blob(['x'.repeat(2000)], { type: 'audio/webm' }) });
          this.onstop();
        };
        if (window.holdStop) window.releaseStop = finish;
        else setTimeout(finish, 0);
      }
    };
    window.SpeechRecognition = class {
      constructor() { window.recognizers.push(this); }
      start() {}
      stop() { setTimeout(() => this.onend(), 0); }
      result(text) {
        const result = [{ transcript: text }]; result.isFinal = true;
        this.onresult({ resultIndex: 0, results: [result] });
      }
    };
  }, engine);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => wbDraftReady);
  await page.waitForTimeout(1300); // startup restoration has settled
  await page.evaluate(async () => {
    const book = { id: 'dictation-book', name: 'Dictation', folder: 'Dictation', order: 0 };
    wbBooks = [book];
    wbChapters = ['a', 'b'].map((id, order) => ({
      id, workbookId: book.id, title: id.toUpperCase(), file: id + '.md',
      content: id.toUpperCase() + ' body', created: 1, updated: 1, order
    }));
    await wbPut(WB_BOOKS, book);
    for (const ch of wbChapters) await wbPut(WB_CHAPTERS, ch);
    loadChapterIntoEditor(wbChapter('a'));
    editor.blur();
  });
  return { context, page, errors };
}

async function record(page, idea = false) {
  await page.evaluate(idea => idea ? toggleIdeaDictation() : toggleDictation(), idea);
  assert.equal(await page.$eval(idea ? '#btn-idea-dictate' : '#btn-dictate',
    button => button.classList.contains('active')), true);
}
async function stop(page, idea = false, requestCount = 1) {
  await page.evaluate(idea => idea ? toggleIdeaDictation() : toggleDictation(), idea);
  await page.waitForFunction(count => window.requests.length === count, requestCount);
}
async function reply(page, index, text) {
  await page.evaluate(({ index, text }) => window.requests[index](text), { index, text });
}
async function contents(page) {
  return page.evaluate(async () => ({
    editor: editor.value,
    stored: Object.fromEntries((await wbAll(WB_CHAPTERS)).map(ch => [ch.id, ch.content])),
    pending: [...wbPendingIds]
  }));
}

(async () => {
  const browser = await chromium.launch();
  try {
    async function run(name, test, engine) {
      const { context, page, errors } = await setup(browser, engine);
      try {
        await test(page);
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
      } finally { await context.close(); }
    }
    await run('delayed response updates A, preserves edits in B and survives reload', async page => {
      await record(page);
      await stop(page);
      await page.evaluate(() => openChapter('b'));
      await page.fill('#editor', 'B newest edits');
      await reply(page, 0, 'SPOKEN FOR A');
      await page.waitForFunction(() => wbChapter('a').content.includes('SPOKEN FOR A'));
      await page.evaluate(() => flushChapter());
      const state = await contents(page);
      assert.equal(state.editor, 'B newest edits');
      assert.equal(state.stored.a, 'A body\n\nSPOKEN FOR A');
      assert.equal(state.stored.b, 'B newest edits');
      assert.ok(state.pending.includes('a'));
      await page.reload();
      await page.waitForFunction(() => wbDraftReady);
      assert.equal((await contents(page)).stored.a, state.stored.a);
    });
    await run('opening A waits for its delayed transcription store write', async page => {
      await record(page);
      await stop(page);
      await page.evaluate(async () => {
        await openChapter('b');
        const original = wbPersist;
        wbPersist = async (...args) => {
          await new Promise(resolve => { window.releaseChapterWrite = resolve; });
          return original(...args);
        };
      });
      await reply(page, 0, 'STORE DELAY');
      await page.waitForFunction(() => !!window.releaseChapterWrite);
      await page.evaluate(() => { window.openingA = openChapter('a'); });
      assert.equal(await page.inputValue('#editor'), 'B body');
      await page.evaluate(async () => { window.releaseChapterWrite(); await window.openingA; });
      assert.equal(await page.inputValue('#editor'), 'A body\n\nSTORE DELAY');
      assert.equal((await contents(page)).stored.a, 'A body\n\nSTORE DELAY');
    });
    await run('recorder stop callback and stream cleanup retain the old session', async page => {
      await page.evaluate(() => { window.holdStop = true; });
      await record(page);
      await page.evaluate(() => toggleDictation());
      await page.evaluate(() => openChapter('b'));
      await record(page);
      await page.evaluate(() => { window.holdStop = false; window.releaseStop(); });
      await page.waitForFunction(() => window.requests.length === 1);
      await page.waitForTimeout(450);
      assert.deepEqual(await page.evaluate(() => window.streams.map(track => track.stopped)), [true, false]);
      await reply(page, 0, 'OLD SESSION');
      await page.waitForFunction(() => wbChapter('a').content.includes('OLD SESSION'));
      assert.equal(await page.inputValue('#editor'), 'B body');
      await stop(page, false, 2);
      await reply(page, 1, 'NEW SESSION');
      await page.waitForFunction(() => editor.value.includes('NEW SESSION'));
      await page.evaluate(() => flushChapter());
      assert.deepEqual((await contents(page)).stored, {
        a: 'A body\n\nOLD SESSION', b: 'B body\n\nNEW SESSION'
      });
    });
    await run('new recording cannot change the earlier session insertion position', async page => {
      await page.evaluate(() => { editor.focus(); editor.setSelectionRange(1, 1); });
      await record(page);
      await stop(page);
      await page.evaluate(() => { editor.focus(); editor.setSelectionRange(6, 6); });
      await record(page);
      await page.evaluate(() => editor.blur());
      await reply(page, 0, 'FIRST');
      await page.waitForFunction(() => editor.value.includes('FIRST'));
      assert.equal(await page.inputValue('#editor'), 'A FIRST body');
      await stop(page, false, 2);
      await reply(page, 1, '');
      await page.waitForFunction(() => document.getElementById('dictate-pill').hidden);
      assert.equal(await page.inputValue('#editor'), 'A FIRST body');
    });
    await run('idea response stays in its box after an editor recording starts', async page => {
      await page.evaluate(() => openIdeaModal());
      await page.waitForTimeout(60);
      await record(page, true);
      await stop(page, true);
      await record(page);
      await reply(page, 0, 'FOR THE IDEA');
      await page.waitForFunction(() => document.getElementById('idea-text').value.includes('FOR THE IDEA'));
      assert.equal(await page.inputValue('#editor'), 'A body');
      await stop(page, false, 2);
      await reply(page, 1, 'FOR THE EDITOR');
      await page.waitForFunction(() => editor.value.includes('FOR THE EDITOR'));
      assert.equal(await page.inputValue('#idea-text'), 'FOR THE IDEA');
    });
    for (const action of ['close', 'file', 'filing', 'deleted', 'loose', 'store-failure']) {
      await run('recover delayed text after ' + action, async page => {
        const idea = ['close', 'file', 'filing'].includes(action);
        if (idea) {
          await page.evaluate(() => openIdeaModal());
          await page.waitForTimeout(60);
          await page.fill('#idea-text', 'typed idea');
        } else if (action === 'loose') {
          await page.evaluate(() => { detachChapter(); editor.value = 'old loose draft'; });
        }
        await record(page, idea);
        await stop(page, idea);
        if (action === 'close') await page.evaluate(() => { closeIdeaModal(); openIdeaModal(); });
        if (action === 'file') {
          await page.evaluate(() => saveIdea());
          await page.evaluate(() => openIdeaModal());
          await page.fill('#idea-text', 'a new idea');
        }
        if (action === 'filing') {
          await page.evaluate(() => {
            const original = wbPersist;
            wbPersist = async (...args) => {
              await new Promise(resolve => { window.releaseSave = resolve; });
              return original(...args);
            };
            window.savingIdea = saveIdea();
          });
          await page.waitForFunction(() => !!window.releaseSave);
        }
        if (action === 'deleted') await page.evaluate(() => {
          wbChapters = wbChapters.filter(ch => ch.id !== 'a'); detachChapter();
        });
        if (action === 'loose') {
          page.once('dialog', dialog => dialog.accept());
          await page.evaluate(() => newFile());
          await page.fill('#editor', 'new loose draft');
        }
        if (action === 'store-failure') await page.evaluate(async () => {
          await openChapter('b'); wbPersist = async () => false;
        });
        const before = await page.inputValue('#editor');
        const ideaBefore = await page.inputValue('#idea-text');
        await reply(page, 0, 'RECOVER THIS TRANSCRIPT');
        await page.waitForFunction(() => !document.getElementById('dictate-recovery').hidden);
        assert.ok((await page.inputValue('#dictate-recovery-text')).includes('RECOVER THIS TRANSCRIPT'));
        assert.equal(await page.inputValue('#editor'), before);
        assert.equal(await page.inputValue('#idea-text'), ideaBefore);
        if (action === 'filing') await page.evaluate(async () => {
          window.releaseSave(); await window.savingIdea;
        });
        assert.ok(!(await contents(page)).stored.b.includes('RECOVER THIS TRANSCRIPT'));
      });
    }
    await run('closing the idea while microphone permission is pending prevents recording', async page => {
      await page.evaluate(() => { openIdeaModal(); window.holdMic = true; window.starting = toggleIdeaDictation(); });
      await page.waitForFunction(() => !!window.releaseMic);
      await page.evaluate(async () => { closeIdeaModal(); window.releaseMic(); await window.starting; });
      assert.equal(await page.evaluate(() => window.recorders.length), 0);
      assert.deepEqual(await page.evaluate(() => window.streams.map(track => track.stopped)), [true]);
    });
    await run('late live recognition callbacks retain their chapter and session', async page => {
      await record(page);
      await page.evaluate(() => toggleDictation());
      await page.evaluate(() => openChapter('b'));
      await record(page);
      await page.evaluate(() => window.recognizers[0].result('LIVE FOR A'));
      await page.waitForFunction(() => wbChapter('a').content.includes('LIVE FOR A'));
      assert.equal(await page.inputValue('#editor'), 'B body');
      await page.evaluate(() => window.recognizers[1].result('LIVE FOR B'));
      await page.waitForFunction(() => editor.value.includes('LIVE FOR B'));
      await page.evaluate(() => flushChapter());
      assert.deepEqual((await contents(page)).stored, {
        a: 'A body\n\nLIVE FOR A', b: 'B body\n\nLIVE FOR B'
      });
    }, 'live');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
