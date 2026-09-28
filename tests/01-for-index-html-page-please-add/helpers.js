// Shared helpers for the task-01 suite (diagrams: ports, free mind maps,
// sequence, SVG/PNG download; freehand sketches). Drives index.html off disk.
const path = require('path');
const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', '..', 'index.html');

async function load(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof editor !== 'undefined' && typeof dgParseFlow === 'function' && typeof skImageTokens === 'function');
  return errors;
}

async function setText(page, text, caret) {
  await page.evaluate(([t, c]) => {
    editor.value = t;
    const p = c == null ? t.length : c;
    editor.setSelectionRange(p, p);
    updatePreview();
  }, [text, caret == null ? null : caret]);
}

const fence = (kind, body) => '```' + kind + '\n' + body + '\n```';

// world (diagram) → client coordinates of the modal's stage
const w2s = (page, x, y) => page.evaluate(([x, y]) => {
  const r = dgStageRect();
  return { x: r.left + dg.panX + x * dg.zoom, y: r.top + dg.panY + y * dg.zoom };
}, [x, y]);

async function center(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error('no box for ' + sel);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function drag(page, a, b, steps = 8, { release = true } = {}) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
  if (release) await page.mouse.up();
}

// Open the diagram modal on the block that starts at editor line `line` (0-based).
async function openBlock(page, kind, body, line = 0) {
  await setText(page, fence(kind, body));
  await page.evaluate(l => openDiagram({ line: l }), line);
  await page.waitForSelector('#diagram-modal:not([hidden])');
  // the preview holds a copy of the same diagram (same classes/ids); clear it so
  // selectors like `.dg-node[data-id=a]` only ever mean the modal's drawing
  await page.evaluate(() => { document.getElementById('preview').innerHTML = ''; });
}

// click a sequence message/note row: a flat SVG path has an empty box, so aim by coordinates
async function clickSeq(page, i) {
  const p = await page.evaluate(i => {
    const g = document.querySelector(`#dg-world [data-i="${i}"]`);
    const r = (g.querySelector('.dg-edge-hit') || g.querySelector('rect')).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, i);
  await page.mouse.click(p.x, p.y);
}

const FLOW2 = 'a: rect 0,0 100x50 | A\nb: rect 300,0 100x50 | B';
const MM3 = 'Root\n  Left\n  Right\n    Child';

// capture what ScuLaFolder.save is asked to write
async function captureSaves(page) {
  await page.evaluate(() => {
    window.__saves = [];
    ScuLaFolder.save = async (name, blob) => { window.__saves.push({ name, type: blob.type, size: blob.size }); return { how: 'test' }; };
    window.__saveBlobs = [];
  });
}
const saves = page => page.evaluate(() => window.__saves);

module.exports = { clickSeq, URL, load, setText, fence, w2s, center, drag, openBlock, FLOW2, MM3, captureSaves, saves };
