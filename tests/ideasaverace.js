// Quick idea saves must not clear a draft edited while a store/mirror write awaits.
// Run: node tests/ideasaverace.js (bundled headless Chromium, no network).
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const { stage, failure } of [
      { stage: 'store', failure: false }, { stage: 'store', failure: true },
      { stage: 'mirror', failure: false }, { stage: 'mirror', failure: true }
    ]) {
      const context = await browser.newContext();
      try {
        await context.route(/^https?:/, route => route.abort());
        await context.addInitScript(() => {
          localStorage.setItem('caiet-vocal:settings', JSON.stringify({ engine: 'live', lang: 'en' }));
          window.recognizers = [];
          window.SpeechRecognition = class {
            constructor() { window.recognizers.push(this); }
            start() {}
            stop() { setTimeout(() => this.onend(), 0); }
            result(text) {
              const result = [{ transcript: text }]; result.isFinal = true;
              this.onresult({ resultIndex: 0, results: [result] });
            }
          };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
        await page.waitForFunction(() => wbDraftReady);
        await page.waitForTimeout(1300); // settle startup restoration
        await page.evaluate(async () => {
          const book = { id: 'idea-book', name: 'Ideas', folder: 'Ideas', order: 0 };
          const chapter = { id: 'idea-chapter', workbookId: book.id, title: 'Target', file: 'target.md',
            content: 'ORIGINAL\n', created: 1, updated: 1, order: 0 };
          wbBooks = [book]; wbChapters = [chapter];
          await wbPut(WB_BOOKS, book);
          await wbPut(WB_CHAPTERS, chapter);
          openIdeaModal();
          ideaChapterPick(chapter.id);
        });
        await page.fill('#idea-text', '  FIRST IDEA  ');
        await page.evaluate(({ stage, failure }) => {
          const original = wbTx;
          wbTx = async (store, mode, run) => {
            if (stage === 'store' && store === WB_CHAPTERS && mode === 'readwrite') {
              await new Promise(resolve => { window.releaseIdeaWrite = resolve; });
              wbTx = original;
              if (failure) throw new DOMException('Injected idea write failure', 'QuotaExceededError');
            }
            return original(store, mode, run);
          };
          if (stage === 'mirror') {
            const mirror = wbSaveMirror;
            wbSaveMirror = async (...args) => {
              await new Promise(resolve => { window.releaseIdeaWrite = resolve; });
              wbSaveMirror = mirror;
              return failure ? { failed: true, path: '' } : mirror(...args);
            };
          }
          window.ideaWrite = saveIdea();
        }, { stage, failure });
        await page.waitForFunction(() => !!window.releaseIdeaWrite);
        await page.fill('#idea-text', 'SECOND IDEA');
        // Duplicate submission must neither file newer text nor clear it.
        await page.evaluate(() => saveIdea());
        assert.equal(await page.evaluate(() => ideaSaving), true);
        // Dictation during a submission is recovered by the existing destination guard.
        await page.evaluate(() => toggleIdeaDictation());
        await page.evaluate(() => window.recognizers[0].result('DURING SAVE'));
        await page.waitForFunction(() => !document.getElementById('dictate-recovery').hidden);
        assert.ok((await page.inputValue('#dictate-recovery-text')).includes('DURING SAVE'));
        await page.evaluate(async () => { window.releaseIdeaWrite(); await window.ideaWrite; });
        assert.equal(await page.inputValue('#idea-text'), 'SECOND IDEA');
        assert.equal(await page.$eval('#idea-modal', el => el.classList.contains('open')), true);
        assert.equal(await page.inputValue('#idea-chapter'), 'Target');
        assert.equal(await page.evaluate(() => ideaPick.id), 'idea-chapter');
        assert.equal(await page.evaluate(() => ideaSaving), false);
        const stored = await page.evaluate(async () =>
          (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'idea-chapter').content);
        assert.equal(stored, failure && stage === 'store' ? 'ORIGINAL\n' : 'ORIGINAL\nFIRST IDEA\n');
        if (failure) assert.equal(await page.$eval('#stat-wb', el => el.textContent),
          await page.evaluate(stage => t(stage === 'store' ? 'ideaFailed' : 'wbMirrorFailed'), stage));
        // The retained draft also accepts dictation after completion and can be saved.
        await page.evaluate(() => window.recognizers[0].result('AFTER SAVE'));
        await page.waitForFunction(() => document.getElementById('idea-text').value.includes('AFTER SAVE'));
        const draft = await page.inputValue('#idea-text');
        assert.ok(draft.startsWith('SECOND IDEA'));
        assert.ok(!draft.includes('DURING SAVE'));
        await page.evaluate(() => toggleIdeaDictation());
        await page.waitForFunction(() => !document.getElementById('btn-idea-dictate').classList.contains('active'));
        await page.evaluate(() => saveIdea());
        assert.equal(await page.evaluate(async () =>
          (await wbAll(WB_CHAPTERS)).find(ch => ch.id === 'idea-chapter').content), stored.trimEnd() + '\n' + draft + '\n');
        assert.equal(await page.inputValue('#idea-text'), '');
        assert.equal(await page.$eval('#idea-modal', el => el.classList.contains('open')), false);
        assert.deepEqual(errors, []);
        console.log('PASS delayed ' + (failure ? 'failed' : 'successful')
          + ' ' + stage + ' save preserves typing, recovers in-flight dictation and allows dictation/resubmission');
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
