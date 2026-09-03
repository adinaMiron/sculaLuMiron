// The calendar — calendar.html, plus the "@date" markdown syntax in
// index.html that feeds it.
//
// Two halves, both driven off disk against the real pages:
//
//   1. calendar.html — an event added through the real modal, the month /
//      week / day / agenda views, drag-on-the-hour-grid to block out a time,
//      search and the four filter facets, and the two exports (the .ics and
//      the Google-API JSON) captured off ScuLaFolder.save.
//   2. index.html — "@2026-09-03 14:00-15:30" rendering as a pill in the
//      preview, and the 📅 button pushing every marker in the vault into the
//      shared store as Google-shaped events. Then the two pages together:
//      re-running the sync after an edit moves the event instead of
//      duplicating it, and deleting the marker takes the event with it.
//
// IndexedDB is shared per origin and file:// pages all count as one, so each
// half clears the store first rather than trusting a fresh profile.
//
//   node calendar.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const CAL_URL = 'file://' + path.join(__dirname, '..', 'calendar.html');
const MD_URL = 'file://' + path.join(__dirname, '..', 'index.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

// Emptied through the store's own API rather than deleteDatabase: the page
// has already opened a connection by the time this runs, which blocks a
// delete, and a blocked delete that reported success would leave the next
// run racing against the rows still there. The saved view/filters go too, so
// the page always starts in the same state.
const wipe = () => ScuLaCal.all()
  .then(l => Promise.all(l.map(e => ScuLaCal.remove(e.id))))
  .then(() => ScuLaCal.setMeta('view', null))
  .then(() => ScuLaCal.all())
  .then(l => l.length);

async function openPage(browser, url, { width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto(url);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

  /* ==========================================================
     1. calendar.html on its own
     ========================================================== */
  let { ctx, page, errors } = await openPage(browser, CAL_URL);
  await page.waitForFunction(() => window.ScuLaCal);
  check('store starts empty', await page.evaluate(wipe) === 0);
  await page.reload();
  await page.waitForFunction(() => window.ScuLaCal && document.querySelector('.m-grid'));

  check('month view is the default', await page.evaluate(() => !!document.querySelector('.m-grid')));
  check('nav marks the calendar as current',
    await page.evaluate(() => !!document.querySelector('#site-nav a.current[data-page="calendar.html"]')));

  // --- add an event through the real modal ---
  await page.click('#newBtn');
  await page.waitForSelector('#ev-modal.open');
  await page.fill('#ev-title', 'Ședință de proiect');
  await page.uncheck('#ev-allday');
  await page.fill('#ev-date', '2026-09-03');
  await page.fill('#ev-time', '14:00');
  await page.fill('#ev-edate', '2026-09-03');
  await page.fill('#ev-etime', '15:30');
  await page.fill('#ev-loc', 'Birou');
  await page.fill('#ev-cal', 'Muncă');
  await page.fill('#ev-tags', 'proiect, echipă');
  await page.click('#ev-colors .sw[data-color="5"]');
  await page.click('#ev-save');
  await page.waitForSelector('#ev-modal.open', { state: 'hidden' });

  const stored = await page.evaluate(() => ScuLaCal.all());
  check('one event stored', stored.length === 1, stored.length);
  const ev = stored[0];
  // The whole point of the storage format: it is already Google's shape.
  check('stored in Google API shape',
    ev.summary === 'Ședință de proiect' &&
    /^2026-09-03T14:00:00[+-]\d\d:\d\d$/.test(ev.start.dateTime) &&
    /^2026-09-03T15:30:00[+-]\d\d:\d\d$/.test(ev.end.dateTime) &&
    typeof ev.start.timeZone === 'string' && ev.start.timeZone.length > 0 &&
    ev.status === 'confirmed' && ev.colorId === '5' &&
    ev.location === 'Birou',
    { start: ev.start, end: ev.end, colorId: ev.colorId });
  check('id is a legal Google event id', /^[0-9a-v]{5,1024}$/.test(ev.id), ev.id);
  check('our fields ride in extendedProperties.private, as strings',
    ev.extendedProperties.private.sculaCal === 'Muncă' &&
    ev.extendedProperties.private.sculaTags === 'proiect,echipă',
    ev.extendedProperties);
  check('diacritics survived', /\u0218/.test(ev.summary) && /\u021B/.test(ev.summary) && /\u0103/.test(ev.summary), ev.summary);

  // --- it shows up, in every view ---
  await page.evaluate(() => { anchor = new Date(2026, 8, 3); render(); });
  check('month shows the event',
    await page.evaluate(() => [...document.querySelectorAll('.m-cell .ev .s')].some(n => n.textContent.includes('Ședință'))));

  await page.click('.views .btn[data-view="week"]');
  await page.waitForSelector('.tg-col');
  const geom = await page.evaluate(() => {
    const b = document.querySelector('.tev');
    if (!b) return null;
    return { top: parseFloat(b.style.top), height: parseFloat(b.style.height), text: b.textContent };
  });
  // 14:00 of 1440 minutes = 58.33%; 90 minutes = 6.25%.
  check('week places the block at the right hour',
    geom && Math.abs(geom.top - 58.333) < 0.1 && Math.abs(geom.height - 6.25) < 0.1, geom);

  await page.click('.views .btn[data-view="day"]');
  await page.waitForSelector('.tg-col');
  check('day view shows one column',
    await page.evaluate(() => document.querySelectorAll('.tg-col').length === 1));

  // Scrolling to the afternoon must not take "what is happening all day"
  // off screen, so the day header and the all-day strip are pinned as one.
  await page.click('.views .btn[data-view="week"]');
  await page.waitForSelector('.tg-col');
  check('the all-day strip is pinned with the header, not left to scroll away',
    await page.evaluate(() => {
      const top = document.querySelector('.tg-top');
      return !!top && getComputedStyle(top).position === 'sticky'
        && top.contains(document.querySelector('.tg-allday'))
        && top.contains(document.querySelector('.tg-head'));
    }));

  // Google's palette runs from Banana to Tomato; a fixed dark ink would be
  // unreadable on half of it.
  check('event ink follows the colour it sits on',
    await page.evaluate(() => {
      const light = ScuLaCal.colorHex('5'), dark = ScuLaCal.colorHex('11');
      return inkOn(light) !== inkOn(dark) && inkOn(light) === '#1A2117' && inkOn(dark) === '#F7F4EC';
    }),
    await page.evaluate(() => [inkOn(ScuLaCal.colorHex('5')), inkOn(ScuLaCal.colorHex('11'))]));

  await page.click('.views .btn[data-view="agenda"]');
  await page.waitForSelector('.ag-ev');
  check('agenda shows the interval',
    await page.evaluate(() => document.querySelector('.ag-ev .t').textContent.trim() === '14:00 – 15:30'),
    await page.evaluate(() => document.querySelector('.ag-ev .t').textContent));

  // --- drag on the hour grid to block out a time ---
  await page.click('.views .btn[data-view="day"]');
  await page.waitForSelector('.tg-col');
  const box = await page.evaluate(() => {
    const r = document.querySelector('.tg-col').getBoundingClientRect();
    return { x: r.left + r.width / 2, top: r.top, h: r.height };
  });
  // 09:00 -> 11:00 as a fraction of the column
  await page.mouse.move(box.x, box.top + box.h * (9 / 24));
  await page.mouse.down();
  await page.mouse.move(box.x, box.top + box.h * (11 / 24), { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('#ev-modal.open');
  const dragged = await page.evaluate(() => ({
    allDay: document.getElementById('ev-allday').checked,
    date: document.getElementById('ev-date').value,
    t1: document.getElementById('ev-time').value,
    t2: document.getElementById('ev-etime').value
  }));
  check('dragging the grid prefills that interval',
    dragged.allDay === false && dragged.t1 === '09:00' && dragged.t2 === '11:00', dragged);
  await page.fill('#ev-title', 'Atelier');
  await page.click('#ev-save');
  await page.waitForSelector('#ev-modal.open', { state: 'hidden' });
  check('the dragged event was stored', (await page.evaluate(() => ScuLaCal.all())).length === 2);

  // --- an end set behind the start must not reach the store ---
  await page.click('#newBtn');
  await page.waitForSelector('#ev-modal.open');
  await page.fill('#ev-title', 'Invers');
  await page.fill('#ev-date', '2026-09-20');
  await page.fill('#ev-edate', '2026-09-15');
  await page.click('#ev-save');
  await page.waitForSelector('#ev-modal.open', { state: 'hidden' });
  const clamped = await page.evaluate(() => ScuLaCal.all().then(l =>
    l.filter(e => e.summary === 'Invers')[0]));
  check('an end behind the start is clamped, not stored backwards',
    clamped && clamped.start.date === '2026-09-20' && clamped.end.date === '2026-09-21',
    clamped && { start: clamped.start, end: clamped.end });
  await page.evaluate(() => ScuLaCal.all().then(l =>
    Promise.all(l.filter(e => e.summary === 'Invers').map(e => ScuLaCal.remove(e.id)))));
  await page.waitForFunction(() => EVENTS.length === 2);

  // --- an all-day span, and the exclusive end date ---
  await page.evaluate(() => ScuLaCal.put(ScuLaCal.make({
    title: 'Concediu', allDay: true, date: '2026-09-10', endDate: '2026-09-12',
    colorId: '3', ext: { sculaCal: 'Personal', sculaTags: 'liber' }
  })).then(() => load()));
  await page.waitForFunction(() => EVENTS.length === 3);
  const span = await page.evaluate(() => {
    const e = EVENTS.filter(x => x.summary === 'Concediu')[0];
    return { end: e.end.date, days: ScuLaCal.daysOf(e) };
  });
  check('all-day end.date is exclusive, as Google wants',
    span.end === '2026-09-13' && span.days.length === 3 &&
    span.days[0] === '2026-09-10' && span.days[2] === '2026-09-12', span);

  // --- search ---
  await page.click('.views .btn[data-view="agenda"]');
  await page.fill('#q', 'atelier');
  await page.waitForFunction(() => SHOWN.length === 1);
  check('search matches, ignoring case', await page.evaluate(() => SHOWN[0].summary === 'Atelier'));
  await page.fill('#q', 'sedinta');
  await page.waitForFunction(() => SHOWN.length === 1);
  check('search ignores diacritics too ("sedinta" finds "Ședință")',
    await page.evaluate(() => SHOWN[0].summary === 'Ședință de proiect'));
  await page.fill('#q', '');
  await page.waitForFunction(() => SHOWN.length === 3);

  // --- filters ---
  const facets = await page.evaluate(() => ({
    cals: [...document.querySelectorAll('#fCals .chip')].map(c => c.dataset.val).sort(),
    tags: [...document.querySelectorAll('#fTags .chip')].map(c => c.dataset.val).sort(),
    colors: [...document.querySelectorAll('#fColors .chip')].map(c => c.dataset.val).sort()
  }));
  check('facets are built from the events themselves',
    facets.cals.includes('Muncă') && facets.cals.includes('Personal') &&
    facets.tags.includes('proiect') && facets.tags.includes('liber') &&
    facets.colors.includes('5') && facets.colors.includes('3'), facets);
  await page.click('#fCals .chip[data-val="Muncă"]');
  await page.waitForFunction(() => SHOWN.length < 3);
  check('turning a calendar off hides its events',
    await page.evaluate(() => SHOWN.every(e => ScuLaCal.priv(e, 'sculaCal') !== 'Muncă')));
  await page.click('#clearF');
  await page.waitForFunction(() => SHOWN.length === 3);
  check('clear brings them back', true);

  // --- exports: catch the bytes on the way to ScuLaFolder.save ---
  await page.evaluate(() => {
    window.__saved = [];
    ScuLaFolder.save = (name, blob) =>
      blob.text().then(text => { window.__saved.push({ name, text }); return { saved: true, message: null }; });
  });
  await page.click('#expIcs');
  await page.waitForFunction(() => window.__saved.length === 1);
  const ics = await page.evaluate(() => window.__saved[0]);
  check('.ics is named for today', /^calendar-\d{4}-\d{2}-\d{2}\.ics$/.test(ics.name), ics.name);
  check('.ics is a well-formed VCALENDAR',
    ics.text.startsWith('BEGIN:VCALENDAR\r\n') && ics.text.trimEnd().endsWith('END:VCALENDAR') &&
    (ics.text.match(/BEGIN:VEVENT/g) || []).length === 3, ics.text.slice(0, 60));
  check('.ics writes a timed event in UTC and an all-day one as a DATE',
    /DTSTART:\d{8}T\d{6}Z/.test(ics.text) &&
    ics.text.includes('DTSTART;VALUE=DATE:20260910') &&
    ics.text.includes('DTEND;VALUE=DATE:20260913'), ics.text.match(/DT(START|END)[^\r]*/g));
  check('.ics folds every line under 75 octets',
    ics.text.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75));

  await page.click('#expJson');
  await page.waitForFunction(() => window.__saved.length === 2);
  const json = await page.evaluate(() => window.__saved[1]);
  const body = JSON.parse(json.text);
  check('JSON export is an array of API-ready bodies',
    Array.isArray(body) && body.length === 3 &&
    body.every(b => b.summary !== undefined && b.start && b.end && b.status) &&
    body.every(b => !('created' in b) && !('updated' in b)), body[0]);

  // --- import round-trips ---
  await page.evaluate(t => {
    return ScuLaCal.all()
      .then(l => Promise.all(l.map(e => ScuLaCal.remove(e.id))))
      .then(() => ScuLaCal.putMany(ScuLaCal.fromICS(t)))
      .then(() => load());
  }, ics.text);
  await page.waitForFunction(() => EVENTS.length === 3);
  const back = await page.evaluate(() => EVENTS.map(e => e.summary).sort());
  check('the .ics reads back into the same three events',
    back.join('|') === ['Atelier', 'Concediu', 'Ședință de proiect'].sort().join('|'), back);

  check('no page errors in calendar.html', errors.length === 0, errors);
  await ctx.close();

  /* --- a phone opens on the agenda, since month gives a day ~55px --- */
  {
    const c2 = await browser.newContext({ viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p2 = await c2.newPage();
    await p2.goto(CAL_URL);
    await p2.waitForFunction(() => document.querySelector('.ag, .m-grid'));
    await p2.evaluate(() => ScuLaCal.setMeta('view', null));
    await p2.reload();
    await p2.waitForFunction(() => document.querySelector('.ag, .m-grid'));
    check('a phone with no saved view opens on the agenda',
      await p2.evaluate(() => view === 'agenda'), await p2.evaluate(() => view));
    check('and the filter sidebar starts out of the way',
      await p2.evaluate(() => document.getElementById('side').classList.contains('hidden')));
    // but a saved choice still wins
    await p2.evaluate(() => { setView('month'); });
    await p2.reload();
    await p2.waitForFunction(() => document.querySelector('.ag, .m-grid'));
    check('a view the person picked survives the reload',
      await p2.evaluate(() => view === 'month'), await p2.evaluate(() => view));
    await p2.evaluate(() => ScuLaCal.setMeta('view', null));
    await c2.close();
  }

  /* ==========================================================
     2. index.html — the "@date" markdown syntax
     ========================================================== */
  ({ ctx, page, errors } = await openPage(browser, MD_URL));
  await page.waitForFunction(() => window.ScuLaCal && typeof calSyncAll === 'function');
  check('store starts empty for the markdown half', await page.evaluate(wipe) === 0);

  await page.evaluate(() => {
    editor.value = [
      '# Plan',
      '',
      '- [ ] Sună dentistul @2026-09-03 14:00-15:30 #sănătate',
      '- Zi liberă @2026-10-01',
      '- Concediu @2026-12-20..2026-12-27',
      '- Ana>> !vital trimite raportul @2026-09-04 09:00',
      '',
      'Nu e o dată: scrie la ana@2026.com sau vezi versiunea @1.2.3.',
      'Nici asta: `@2026-11-11` stă în cod.'
    ].join('\n');
    updatePreview();
  });

  const pills = await page.evaluate(() =>
    [...document.querySelectorAll('#preview .md-date')].map(n => ({
      text: n.textContent, d: n.dataset.d, d2: n.dataset.d2 || null,
      t: n.dataset.t || null, t2: n.dataset.t2 || null, all: n.dataset.all || null
    })));
  check('four markers became pills, and only those four', pills.length === 4, pills.map(p => p.text));
  check('a timed interval keeps both ends',
    pills[0].d === '2026-09-03' && pills[0].t === '14:00' && pills[0].t2 === '15:30', pills[0]);
  check('a bare date is all-day',
    pills[1].d === '2026-10-01' && pills[1].all === '1' && !pills[1].t, pills[1]);
  check('".." spans days', pills[2].d === '2026-12-20' && pills[2].d2 === '2026-12-27', pills[2]);
  check('the pill label is written out in Romanian',
    /3 sept\.? 2026, 14:00–15:30/.test(pills[0].text), pills[0].text);
  const html = await page.evaluate(() => document.getElementById('preview').innerHTML);
  check('an e-mail address is not a date', !/ana@2026\.com<\/?span/.test(html) && html.includes('ana@2026.com'));
  check('a version number is not a date', html.includes('@1.2.3'));
  check('a marker inside inline code is left alone',
    /<code>@2026-11-11<\/code>/.test(html), html.match(/<code>[^<]*<\/code>/g));

  // --- the 📅 button pushes them into the shared store ---
  // calSyncAll returns its promise: the writes are a chain of IndexedDB
  // transactions, so "the button was clicked" is not yet "the events are
  // there", and a count can pass through its target on the way.
  await page.evaluate(() => calSyncAll());
  const made = await page.evaluate(() => ScuLaCal.all().then(l =>
    l.map(e => ({
      summary: e.summary,
      start: e.start, end: e.end,
      src: ScuLaCal.priv(e, 'sculaSource'),
      key: ScuLaCal.priv(e, 'sculaKey'),
      tags: ScuLaCal.priv(e, 'sculaTags')
    })).sort((a, b) => (a.start.date || a.start.dateTime).localeCompare(b.start.date || b.start.dateTime))));
  check('every marker became an event', made.length === 4, made.map(m => m.summary));
  const dentist = made.filter(m => m.summary.includes('dentistul'))[0];
  check('the title is the line, with the marker and the markdown stripped',
    dentist && dentist.summary === 'Sună dentistul', dentist && dentist.summary);
  check('the timed marker became a timed event',
    /^2026-09-03T14:00:00/.test(dentist.start.dateTime) && /^2026-09-03T15:30:00/.test(dentist.end.dateTime),
    dentist.start);
  check('the #tag on the line rode along', dentist.tags === 'sănătate', dentist.tags);
  const raport = made.filter(m => m.summary.includes('raportul'))[0];
  check('the assignee and the importance marker are stripped from the title',
    raport && raport.summary === 'trimite raportul', raport && raport.summary);
  check('everything is stamped with its source page',
    made.every(m => m.src === 'index.html'));

  // --- re-syncing moves an event instead of duplicating it ---
  const idsBefore = await page.evaluate(() => ScuLaCal.all().then(l =>
    l.filter(e => e.summary === 'Sună dentistul').map(e => e.id)));
  await page.evaluate(() => calSyncAll());
  const after = await page.evaluate(() => ScuLaCal.all());
  check('a second sync does not duplicate', after.length === 4, after.length);
  check('and it keeps the same id',
    after.filter(e => e.summary === 'Sună dentistul')[0].id === idsBefore[0]);

  // --- editing the time moves the event; deleting the marker removes it ---
  await page.evaluate(() => {
    editor.value = editor.value
      .replace('@2026-09-03 14:00-15:30', '@2026-09-03 16:00-17:00')
      .replace('- Zi liberă @2026-10-01\n', '');
    updatePreview();
  });
  await page.evaluate(() => calSyncAll());
  const moved = await page.evaluate(() => ScuLaCal.all().then(l =>
    l.filter(e => e.summary === 'Sună dentistul')[0]));
  check('editing the marker moves the event',
    /^2026-09-03T16:00:00/.test(moved.start.dateTime), moved.start);
  check('deleting a marker deletes its event',
    await page.evaluate(() => ScuLaCal.all().then(l => !l.some(e => e.summary === 'Zi liberă'))));

  // The button itself, not just the function behind it.
  await page.click('#btn-cal-sync');
  await page.waitForSelector('#scula-toast.show');
  check('the toolbar button reports what it pushed',
    /\d/.test(await page.textContent('#scula-toast')),
    await page.textContent('#scula-toast'));

  check('no page errors in index.html', errors.length === 0, errors);
  await ctx.close();

  await browser.close();
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
