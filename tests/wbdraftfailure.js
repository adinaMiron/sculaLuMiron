// Loose drafts must recover through the tab journal or offer a visible export.
// Run with bundled Chromium: node tests/wbdraftfailure.js
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const image = '![embedded](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=)';

// Inject only journal failures, leaving language settings and IndexedDB usable.
function injectStorageFailure({ failure, stores, active = true }) {
  const local = window.localStorage, session = window.sessionStorage;
  const set = Storage.prototype.setItem, get = Storage.prototype.getItem;
  window.draftFailureActive = active;
  window.draftWriteAttempts = 0;
  const blocked = storage => window.draftFailureActive &&
    ((storage === local && stores.includes('local')) ||
     (storage === session && stores.includes('session')));
  Storage.prototype.setItem = function (key, value) {
    if (key === 'scula:md:draft') {
      window.draftWriteAttempts++;
      if (blocked(this)) throw new DOMException('Injected journal failure', failure);
    }
    return set.call(this, key, value);
  };
  Storage.prototype.getItem = function (key) {
    if (key === 'scula:md:draft' && failure === 'SecurityError' && blocked(this)) {
      throw new DOMException('Injected blocked journal', failure);
    }
    return get.call(this, key);
  };
}

async function type(page, text) {
  await page.evaluate(text => {
    window.draftWriteAttempts = 0;
    editor.value = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForFunction(() => window.draftWriteAttempts >= 2);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    for (const failure of ['QuotaExceededError', 'SecurityError']) {
      for (const withImage of [false, true]) {
        const text = 'Loose text with diacritics: șțăîâ\n' + (withImage ? image + '\n' : '');
        // A failed shared journal must not hide a healthy tab journal on reload.
        const context = await browser.newContext();
        try {
          await context.route(/^https?:/, route => route.abort());
          await context.addInitScript(injectStorageFailure, { failure, stores: ['local'] });
          const page = await context.newPage();
          page.on('pageerror', error => errors.push(error.message));
          await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
          await page.waitForFunction(() => wbDraftReady);
          await type(page, text);
          assert.equal(await page.locator('#wb-draft-warning').isVisible(), false);
          assert.equal(await page.evaluate(() => wbDraftRead().text), text);
          await page.reload();
          await page.waitForFunction(text => wbDraftReady && editor.value === text, text);
          assert.equal(await page.evaluate(() => wbCurrentId), null);
          assert.equal(await page.locator('#wb-draft-warning').isVisible(), false);
          console.log('PASS ' + failure + ' in local journal recovers ' + (withImage ? 'text and image' : 'text'));
        } finally { await context.close(); }

        for (const stores of [['session'], ['session', 'local']]) {
          const context = await browser.newContext();
          try {
            await context.route(/^https?:/, route => route.abort());
            await context.addInitScript(injectStorageFailure, { failure, stores, active: false });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
            await page.waitForFunction(() => wbDraftReady);
            await page.waitForTimeout(1300); // boot's form-restoration check
            await type(page, 'OLDER JOURNAL');
            await page.evaluate(() => { window.draftFailureActive = true; });
            await type(page, text);
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), true);
            assert.equal(await page.locator('#editor').inputValue(), text);
            assert.equal(await page.evaluate(() => wbCurrentId), null);
            assert.equal(await page.evaluate(() => document.querySelector('#wb-draft-warning span').textContent),
              await page.evaluate(() => t('wbDraftFailed')));

            // Routine status messages and more edits cannot erase the warning.
            await page.evaluate(() => wbSay('Some other operation succeeded'));
            const latest = text + 'LATEST EDIT\n';
            await type(page, latest);
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), true);
            await page.setViewportSize({ width: 800, height: 400 });
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), true,
              'landscape phones retain the warning even with the status bar hidden');
            await page.evaluate(() => { UI = 'en'; applyUILang(); });
            assert.match(await page.locator('#wb-draft-warning').innerText(), /Reload recovery is unavailable/);

            // Export the latest bytes, including data URLs, through the actual UI.
            const downloadPromise = page.waitForEvent('download');
            await page.locator('#wb-draft-warning button').click();
            const download = await downloadPromise;
            assert.equal(download.suggestedFilename(), 'untitled.md');
            assert.equal(await fs.readFile(await download.path(), 'utf8'), latest);
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), true,
              'an export does not falsely claim that reload recovery is available');

            // Cancel a real reload, preserving the loose text on this page.
            await page.locator('#editor').click();
            const dialogPromise = page.waitForEvent('dialog');
            const reloadPromise = page.reload({ timeout: 3000 }).catch(error => error);
            const dialog = await dialogPromise;
            assert.equal(dialog.type(), 'beforeunload');
            await dialog.dismiss();
            await reloadPromise;
            assert.equal(await page.locator('#editor').inputValue(), latest);

            // A successful retry clears the warning and makes reload safe.
            await page.evaluate(() => { window.draftFailureActive = false; wbDraftWrite(); });
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), false);
            await page.reload();
            await page.waitForFunction(text => wbDraftReady && editor.value === text, latest);
            assert.equal(await page.evaluate(() => wbCurrentId), null);

            // Saving to a workbook is also a recovery route with journals blocked.
            await page.evaluate(async () => {
              window.draftFailureActive = true;
              wbDraftWrite();
              await saveToWorkbook();
              document.getElementById('wb-new-name').value = 'Recovery';
              document.getElementById('wb-chapter-title').value = 'Saved draft';
              await confirmSaveToWorkbook();
            });
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), false);
            assert.equal(await page.evaluate(async () =>
              (await wbAll(WB_CHAPTERS)).find(ch => ch.id === wbCurrentId).content), latest);
            await page.reload();
            await page.waitForFunction(text => wbDraftReady && editor.value === text, latest);
            assert.equal(await page.evaluate(async text =>
              (await wbAll(WB_CHAPTERS)).some(ch => ch.content === text), latest), true);
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), false);

            // A deliberate discard of loose text clears the warning/close guard.
            await page.evaluate(() => {
              window.draftFailureActive = true;
              detachChapter(); wbDraftWrite();
            });
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), true);
            page.once('dialog', dialog => dialog.accept());
            await page.evaluate(() => newFile());
            assert.equal(await page.locator('#wb-draft-warning').isVisible(), false);
            assert.equal(await page.evaluate(() => {
              const event = new Event('beforeunload', { cancelable: true });
              window.dispatchEvent(event);
              return event.defaultPrevented;
            }), false);
            console.log('PASS ' + failure + ' in ' + stores.join('+') + ' offers warning, export, retry and workbook recovery (' +
              (withImage ? 'text and image' : 'text') + ')');
          } finally { await context.close(); }
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
