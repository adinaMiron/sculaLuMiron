// The "^@" place marker in index.html, and the Hartă page it opens.
//
// Two pages, one run, the way a person uses it: write "^@Castelul Peleș" in a
// chapter, watch the 🗺 button appear, press it, and land on map.html with the
// places laid out in layers. Everything is driven off disk over file://; the
// geocoder is a stub route, so no request ever leaves the machine, and the
// tiles are switched off for the same reason — what is asserted is the real
// DOM, the real pin geometry and the real exported GeoJSON.
//
//   node map.js        # from tests/
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.PW_CHROME_PATH || undefined;
const DIR = path.join(__dirname, '..');
const MD_URL = 'file://' + path.join(DIR, 'index.html');
const MAP_URL = 'file://' + path.join(DIR, 'map.html');

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

const write = (page, md) =>
  page.evaluate(md => { editor.value = md; updatePreview(); updateStatus(); }, md);

// Every place the geocoder is allowed to know about. The stub answers in
// Nominatim's own shape, so what the page parses is what it parses in life.
const KNOWN = {
  'castelul peleș': { lat: 45.3600, lon: 25.5425, display_name: 'Castelul Peleș, Sinaia' },
  'strada lipscani 12, bucurești': { lat: 44.4318, lon: 26.1015, display_name: 'Strada Lipscani 12, București' },
  'mănăstirea voroneț': { lat: 47.5169, lon: 25.8639, display_name: 'Mănăstirea Voroneț' }
};

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });

  let calls = 0;
  await ctx.route('**/nominatim-stub**', route => {
    calls++;
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || '')
      .toLowerCase().trim();
    const hit = KNOWN[q];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(hit ? [hit] : [])
    });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('CONSOLE ' + m.text());
  });

  await page.goto(MD_URL);
  await page.waitForTimeout(300);
  // No tiles (nothing to fetch), and a geocoder only the stub route answers.
  await page.evaluate(() => {
    localStorage.setItem('scula:map:settings', JSON.stringify({
      tiles: '', geocoder: 'https://localhost/nominatim-stub?q={q}'
    }));
    localStorage.removeItem('scula:map:geocache');
    localStorage.removeItem('scula:map:payload');
  });

  // ---- 1. the marker in the preview --------------------------------------
  await write(page, 'Plecăm marți. ^@Castelul Peleș #vacanta');
  let pill = await page.evaluate(() => {
    const el = preview.querySelector('.md-geo');
    return el && { text: el.textContent, q: el.dataset.q, tag: !!preview.querySelector('.md-tag') };
  });
  check('a "^@" line becomes one .md-geo pill', !!pill && /Castelul Peleș/.test(pill.text), pill);
  check('the pill carries the address it was written with', !!pill && pill.q === 'Castelul Peleș', pill);
  check('a "#tag" after the marker is still a tag', !!pill && pill.tag, pill);
  check('and the tag is not swallowed into the address',
    !!pill && !/vacanta/.test(pill.q), pill);

  await write(page, '^@44.4268, 26.1025 | prânz');
  pill = await page.evaluate(() => {
    const el = preview.querySelector('.md-geo');
    return el && { lat: el.dataset.lat, lon: el.dataset.lon, note: (el.querySelector('.geo-note') || {}).textContent };
  });
  check('coordinates are read straight off the marker',
    !!pill && pill.lat === '44.4268' && pill.lon === '26.1025', pill);
  check('what follows "|" is kept as a note', !!pill && pill.note === 'prânz', pill);

  await write(page, '`^@nu asta` rămâne text');
  check('a marker inside inline code is left alone',
    await page.evaluate(() => preview.querySelectorAll('.md-geo').length) === 0);
  await write(page, 'un ^@ singur, fără nimic după el\n^@');
  check('and a bare "^@" with nothing after it is not a place',
    await page.evaluate(() => preview.querySelectorAll('.md-geo').length) === 1);

  // ---- 2. the button exists only while a "^@" does ------------------------
  await write(page, 'Nimic de pus pe hartă aici.');
  check('no "^@", no 🗺 button', await page.isHidden('#btn-map'));
  await write(page, 'O oprire: ^@Castelul Peleș');
  check('the first marker brings the button', await page.isVisible('#btn-map'));
  const labels = await page.evaluate(() => {
    const b = document.getElementById('btn-map'), out = {};
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' })); out.ro = b.textContent;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' })); out.en = b.textContent;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' }));
    return out;
  });
  check('the button is Hartă in Romanian and Map in English',
    /Hartă/.test(labels.ro) && /Map/.test(labels.en), labels);
  await write(page, 'Nimic de pus pe hartă aici.');
  check('and it leaves with the last marker', await page.isHidden('#btn-map'));

  // ---- 3. pressing it hands the chapter over ------------------------------
  const CHAPTER = [
    '# Vacanță 2026',
    '',
    'Prima oprire: ^@Castelul Peleș #vacanta',
    '',
    '## Ziua 2',
    '',
    '- ^@Strada Lipscani 12, București | prânz',
    '- ^@44.4268, 26.1025',
    '- nimic aici',
    '',
    '```',
    '^@în cod, deci nu',
    '```'
  ].join('\n');
  await write(page, CHAPTER);
  await Promise.all([
    page.waitForURL(u => /map\.html$/.test(u.toString())),
    page.click('#btn-map')
  ]);
  check('🗺 lands on the map page', /map\.html$/.test(page.url()));
  await page.waitForTimeout(250);

  const read = () => page.evaluate(() => ({
    source: document.getElementById('map-source').textContent,
    layers: Array.from(document.querySelectorAll('#layers .layer')).map(L => ({
      name: L.querySelector('.nm').textContent,
      count: L.querySelector('.ct').textContent,
      places: Array.from(L.querySelectorAll('.place .q')).map(q => q.textContent)
    })),
    pins: Array.from(document.querySelectorAll('.pin')).filter(p => p.style.display !== 'none').length
  }));

  let m = await read();
  // Nothing was saved into a workbook, so the header still reads untitled.md —
  // and that is exactly the name the map page is told, one source of truth for
  // "which chapter is this".
  check('the chapter name says where the list came from', /untitled\.md/.test(m.source), m.source);
  check('one layer per heading, in the order they appear',
    m.layers.map(l => l.name).join('|') === 'Vacanță 2026|Ziua 2', m.layers);
  check('the place under the first heading is in the first layer',
    m.layers[0].places.join('|') === 'Castelul Peleș', m.layers[0]);
  check('the two under the second are in the second',
    m.layers[1].places.join('|') === 'Strada Lipscani 12, București|44.4268, 26.1025', m.layers[1]);
  check('a marker inside a fenced code block never travelled',
    m.layers.length === 2 && m.layers[1].places.length === 2, m.layers);

  // ---- 4. the geocoder, and the pins it produces --------------------------
  await page.waitForFunction(() => document.querySelectorAll('.pin').length === 3, null, { timeout: 15000 });
  m = await read();
  check('every place ends up with a pin on the map', m.pins === 3, m.pins);
  check('the layer counts say all three were placed',
    m.layers[0].count === '1/1' && m.layers[1].count === '2/2', m.layers.map(l => l.count));
  check('coordinates cost no request — two names, two calls', calls === 2, calls);

  const geo = await page.evaluate(() => PLACES.map(p => ({ q: p.q, st: p.status, lat: p.lat, lon: p.lon })));
  check('the coordinates place is marked as such and never looked up',
    geo[2].st === 'coord' && geo[2].lat === 44.4268, geo[2]);
  check('the stub\'s answer is what the named place got',
    Math.abs(geo[0].lat - 45.36) < 0.001 && geo[0].st === 'found', geo[0]);

  // ---- 5. the answers are remembered --------------------------------------
  const before = calls;
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.pin').length === 3, null, { timeout: 15000 });
  check('a second visit asks the geocoder nothing', calls === before, { before, now: calls });

  // ---- 6. a layer can be switched off -------------------------------------
  await page.click('#layers .layer:nth-child(2) .layer-head');
  await page.waitForTimeout(120);
  check('turning a layer off takes its pins off the map',
    (await read()).pins === 1, await read());
  await page.click('#layers .layer:nth-child(2) .layer-head');
  await page.waitForTimeout(120);
  check('and turning it back on brings them back', (await read()).pins === 3);

  // ---- 7. clicking a place takes the map there ----------------------------
  const flew = await page.evaluate(async () => {
    const before = { lat: view.lat, lon: view.lon, z: view.z };
    document.querySelectorAll('#layers .place')[0].click();
    await new Promise(r => setTimeout(r, 150));
    const pop = document.getElementById('pop');
    return { before, after: { lat: view.lat, lon: view.lon, z: view.z },
             open: pop.classList.contains('open'), title: document.getElementById('pop-title').textContent };
  });
  check('a click in the list flies the map to that place',
    Math.abs(flew.after.lat - 45.36) < 0.001 && flew.after.z >= 13, flew);
  check('and opens its popup', flew.open && flew.title === 'Castelul Peleș', flew);

  // ---- 8. the pin really sits where its coordinates say -------------------
  const pinPos = await page.evaluate(() => {
    // Frame everything, then compare the pin's own box against the point the
    // projection puts its coordinates at.
    fitAll();
    const p = PLACES.find(x => x.status === 'coord');
    const r = p.el.getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect();
    const o = origin();
    return {
      drawn: Math.round(r.x - s.x + r.height / 2),
      want: Math.round(lon2x(p.lon, view.z) - o.x)
    };
  });
  check('the pin is drawn at the projected point, not near it',
    Math.abs(pinPos.drawn - pinPos.want) <= 8, pinPos);

  // ---- 9. zooming keeps the point under the cursor ------------------------
  const zoomed = await page.evaluate(() => {
    const at = { x: 400, y: 300 };
    const was = pointToLatLon(at.x, at.y);
    zoomBy(2, at.x, at.y);
    const now = pointToLatLon(at.x, at.y);
    return { dz: view.z, dLat: Math.abs(was.lat - now.lat), dLon: Math.abs(was.lon - now.lon) };
  });
  check('a zoom holds the place under the cursor still',
    zoomed.dLat < 0.02 && zoomed.dLon < 0.02, zoomed);

  // ---- 10. the export -----------------------------------------------------
  const saved = await page.evaluate(async () => {
    let got = null;
    const real = ScuLaFolder.save;
    ScuLaFolder.save = (name, blob) => { got = { name, text: null, blob }; return blob.text().then(t => { got.text = t; }); };
    await exportGeoJSON();
    ScuLaFolder.save = real;
    await new Promise(r => setTimeout(r, 60));
    return { name: got.name, json: JSON.parse(got.text) };
  });
  check('the export is a .geojson named after the chapter',
    /^untitled\.geojson$/.test(saved.name), saved.name);
  check('with one Point feature per placed location',
    saved.json.type === 'FeatureCollection' && saved.json.features.length === 3
    && saved.json.features.every(f => f.geometry.type === 'Point'), saved.json.features.length);
  check('GeoJSON order is [lon, lat], not the other way round',
    Math.abs(saved.json.features[0].geometry.coordinates[0] - 25.5425) < 0.001
    && Math.abs(saved.json.features[0].geometry.coordinates[1] - 45.36) < 0.001,
    saved.json.features[0].geometry.coordinates);
  check('each feature keeps its layer, its note and its tags',
    saved.json.features[0].properties.layer === 'Vacanță 2026'
    && saved.json.features[0].properties.tags.join() === 'vacanta'
    && saved.json.features[1].properties.note === 'prânz', saved.json.features.map(f => f.properties));

  // ---- 11. typing a place in, on the map page itself ----------------------
  await page.fill('#add', 'Mănăstirea Voroneț');
  await page.press('#add', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.pin').length === 4, null, { timeout: 15000 });
  const typed = await page.evaluate(() => {
    const p = PLACES[PLACES.length - 1];
    return { q: p.q, layer: p.layer, lat: p.lat, st: p.status };
  });
  check('a place typed into the map page gets its own layer and its pin',
    typed.q === 'Mănăstirea Voroneț' && typed.st === 'found'
    && Math.abs(typed.lat - 47.5169) < 0.001, typed);

  // ---- 12. the filter ------------------------------------------------------
  await page.fill('#q', 'lipscani');
  await page.waitForTimeout(150);
  check('the filter narrows both the list and the pins',
    (await read()).pins === 1
    && (await page.evaluate(() => document.querySelectorAll('#layers .place').length)) === 1);
  await page.fill('#q', '');
  await page.waitForTimeout(150);

  // ---- 13. both languages on the map page ----------------------------------
  const mapLang = await page.evaluate(() => {
    const b = document.getElementById('btn-locate'), out = {};
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' })); out.ro = b.textContent;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'en' })); out.en = b.textContent;
    window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: 'ro' }));
    return out;
  });
  check('the map page speaks both languages',
    /Caută adresele/.test(mapLang.ro) && /Look up addresses/.test(mapLang.en), mapLang);

  // ---- 14. opening a .md straight on the map page --------------------------
  await page.setInputFiles('#md-file', {
    name: 'drum.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('## Drumul\n\n^@44.1, 26.2\n^@45.9, 24.1\n', 'utf8')
  });
  await page.waitForTimeout(400);
  m = await read();
  check('a .md opened here replaces the list with its own places',
    m.layers.length === 1 && m.layers[0].name === 'Drumul' && m.layers[0].places.length === 2, m.layers);
  check('and says the file it read them from', /drum\.md/.test(m.source), m.source);

  // ---- 15. the map page stands on its own ----------------------------------
  const fresh = await ctx.newPage();
  await fresh.goto(MAP_URL);
  await fresh.waitForTimeout(250);
  check('the map page opened on its own still holds the last list it was given',
    (await fresh.evaluate(() => PLACES.length)) > 0);
  await fresh.evaluate(() => localStorage.removeItem('scula:map:payload'));
  await fresh.reload();
  await fresh.waitForTimeout(250);
  check('and with nothing handed over it is an empty map, not an error',
    await fresh.isVisible('#layers .empty'));
  await fresh.close();

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
