const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test: base, expect } = require('@playwright/test');
const URL = pathToFileURL(path.resolve(__dirname, '../../index.html')).href;

const test = base.extend({
  page: async ({ page, context }, use) => {
    await context.route(/^https?:/, route => route.abort());
    await page.goto(URL);
    await page.waitForFunction(() => wbDraftReady);
    // Let the documented delayed browser-restoration reconciliation finish.
    await page.waitForTimeout(1350);
    await use(page);
  },
});

async function seed(page) {
  await page.evaluate(async () => {
    wbBooks = [{ id: 'review-book', name: 'Review', folder: 'Review', order: 0, updated: 1 }];
    wbChapters = ['a', 'b'].map((id, order) => ({ id, workbookId: 'review-book',
      title: id.toUpperCase(), file: id + '.md', content: 'ORIGINAL ' + id,
      created: 1, updated: 1, order }));
    await wbPut(WB_BOOKS, wbBooks[0]);
    for (const ch of wbChapters) await wbPut(WB_CHAPTERS, ch);
    wbOpenBooks.add('review-book');
    loadChapterIntoEditor(wbChapter('a'));
  });
}

async function edit(page, text) {
  await page.locator('#editor').fill(text);
}

// A local File System Access adapter. Only commit at writable.close(), as the
// existing mirror tests do. No real folders or user files are touched.
async function mountDisk(page, initial = { Review: { 'a.md': 'ORIGINAL a', 'b.md': 'ORIGINAL b' } }) {
  await page.evaluate(initial => {
    window.reviewDisk = structuredClone(initial);
    window.reviewDiskEvents = [];
    function dir(folder) {
      return {
        kind: 'directory', name: folder,
        async *values() {
          for (const [name, body] of Object.entries(reviewDisk[folder])) yield {
            kind: 'file', name, getFile: async () => new File([body], name, { lastModified: 1000 })
          };
        },
        async getFileHandle(file) {
          return { async createWritable() {
            let body;
            return {
              async write(blob) { body = await blob.text(); },
              async close() { reviewDisk[folder][file] = body; reviewDiskEvents.push(['write', folder, file]); }
            };
          } };
        },
        async removeEntry(file) { delete reviewDisk[folder][file]; reviewDiskEvents.push(['delete', folder, file]); }
      };
    }
    ScuLaFolder.mode = () => 'folder';
    ScuLaFolder.name = () => 'Test';
    ScuLaFolder.subdir = () => 'markdown';
    ScuLaFolder.dir = async () => ({
      async *values() { for (const name of Object.keys(reviewDisk)) yield dir(name); },
      async getDirectoryHandle(name, options) {
        if (!reviewDisk[name]) {
          if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
          reviewDisk[name] = {};
        }
        return dir(name);
      },
      async removeEntry(name) {
        if (Object.keys(reviewDisk[name] || {}).length) throw new DOMException('Not empty', 'InvalidModificationError');
        delete reviewDisk[name];
      }
    });
  }, initial);
}

async function capture(page, testInfo, name) {
  const file = testInfo.outputPath(name + '.png');
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

module.exports = { test, expect, seed, edit, mountDisk, capture, URL };
