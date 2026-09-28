const { chromium } = require('@playwright/test');
const { load, setText, fence } = require('./helpers');
(async () => {
  const b = await chromium.launch(process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {});
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await load(page);
  await setText(page, fence('sequence', 'participant A\nparticipant B\nA -> B | x'));
  await page.evaluate(() => openDiagram({ line: 0 }));
  await page.locator('#dg-stage').focus();
  for (const k of ['Delete', 'Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'r', 'c', 'v', 'F2', 'Control+z', 'Control+y', 'Control+Shift+z', '+', '-', '0']) {
    await page.keyboard.press(k);
    console.log(k.padEnd(16), JSON.stringify(await page.evaluate(() => dgCanon())), 'open', await page.evaluate(() => dg.open), 'label', await page.evaluate(() => !document.getElementById('dg-label-input').hidden));
  }
  await b.close();
})();
