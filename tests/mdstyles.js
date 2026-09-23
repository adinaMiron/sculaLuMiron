// Combined font size, text color and highlight in the Markdown editor.
// Run with NODE_PATH=/usr/lib/node_modules PW_CHROME_PATH=/usr/bin/google-chrome-stable node tests/mdstyles.js.
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROME_PATH || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));

  const orders = [
    ['size', 'color', 'highlight'], ['size', 'highlight', 'color'],
    ['color', 'size', 'highlight'], ['color', 'highlight', 'size'],
    ['highlight', 'size', 'color'], ['highlight', 'color', 'size']
  ];
  for (const order of orders) {
    const result = await page.evaluate(order => {
      editor.value = 'sample';
      editor.setSelectionRange(0, 6);
      for (const action of order) {
        if (action === 'size') insertFontSize('20');
        if (action === 'color') applyTextColor('#123456');
        if (action === 'highlight') applyHighlightColor('#fedcba');
      }
      const span = preview.querySelector('p span');
      const exported = new DOMParser().parseFromString(parseMarkdown(editor.value, { forExport: true }), 'text/html').querySelector('p span');
      return {
        source: editor.value,
        selection: editor.value.slice(editor.selectionStart, editor.selectionEnd),
        style: span && [span.style.fontSize, span.style.color, span.style.backgroundColor],
        exportStyle: exported && [exported.style.fontSize, exported.style.color, exported.style.backgroundColor]
      };
    }, order);
    const expected = ['20px', 'rgb(18, 52, 86)', 'rgb(254, 220, 186)'];
    if (result.selection !== 'sample' || JSON.stringify(result.style) !== JSON.stringify(expected) ||
        JSON.stringify(result.exportStyle) !== JSON.stringify(expected) ||
        (result.source.match(/<span/g) || []).length !== 1) {
      throw new Error(`${order.join(' → ')}: ${JSON.stringify(result)}`);
    }
  }

  const nested = await page.evaluate(() => {
    editor.value = 'first second';
    editor.setSelectionRange(0, editor.value.length);
    insertFontSize('20');
    const start = editor.value.indexOf('second');
    editor.setSelectionRange(start, start + 6);
    applyTextColor('#123456');
    const span = [...preview.querySelectorAll('p span')].find(el => el.textContent === 'second');
    const style = span && getComputedStyle(span);
    return {
      source: editor.value,
      preview: preview.textContent.trim(),
      size: style && style.fontSize,
      color: style && style.color,
      escaped: preview.innerHTML.includes('&lt;/span&gt;')
    };
  });
  if (nested.preview !== 'first second' || nested.size !== '20px' ||
      nested.color !== 'rgb(18, 52, 86)' || nested.escaped) {
    throw new Error('Partial selection: ' + JSON.stringify(nested));
  }

  const changed = await page.evaluate(() => {
    editor.value = 'sample';
    editor.setSelectionRange(0, 6);
    insertFontSize('20');
    insertFontSize('24');
    applyTextColor('#123456');
    applyTextColor('#654321');
    return {
      source: editor.value,
      size: preview.querySelector('p span').style.fontSize,
      color: preview.querySelector('p span').style.color,
      selection: editor.value.slice(editor.selectionStart, editor.selectionEnd)
    };
  });
  if (changed.size !== '24px' || changed.color !== 'rgb(101, 67, 33)' ||
      changed.selection !== 'sample' || /20px|#123456/.test(changed.source)) {
    throw new Error('Replacing a style: ' + JSON.stringify(changed));
  }

  if (errors.length) throw new Error('Page errors: ' + errors.join('; '));
  await browser.close();
  console.log('PASS combined styles in all orders, export, partial selection, and replacement');
})().catch(e => { console.error(e); process.exit(1); });
