/* ============================================================
   The garden toolbox — docs/FEATURES.md § N.

   A garden log is written as prose, one "@date" per day and a
   line per thing done: "udat rand 5 in sm 06:02 - 06:30, 250 l
   apa", "cules din s1: 340 g vinete, 800 g ardei", "cosit 4
   ture ... din gg". This reads those lines back as records so
   they can be filtered and totalled.

   Three tables over one scan:
     • Activities — anything with a category, a place, an
       interval (hence a duration) and the water it used.
     • Harvest    — one row per plant per line, in grams.
     • Mowing     — the activities whose category is "cosit",
       counted as sessions and as rounds ("ture").

   Nothing here writes: the markdown stays the source of truth,
   exactly as the search panel treats it.
   ============================================================ */

const GD_KEY = 'scula:garden';

/* The garden codes. Extend this table (not the regexes) to teach the
   toolbox a new plot; the longest alias always wins, so "gp nord" is
   found before "gp". A place nobody listed here is still kept when the
   text names it after "din" — it just has no short code. */
const GD_PLACES = [
  { key: 'sm',       label: 'Solar mare',    alias: ['sm', 'solar mare', 'solarul mare', 'solaru mare'] },
  { key: 's1',       label: 'Solar 1',       alias: ['s1', 'solar 1', 'solarul 1'] },
  { key: 's2',       label: 'Solar 2',       alias: ['s2', 'solar 2', 'solarul 2'] },
  { key: 's3',       label: 'Solar 3',       alias: ['s3', 'solar 3', 'solarul 3'] },
  { key: 'gg',       label: 'GG',            alias: ['gg'] },
  { key: 'gp-nord',  label: 'GP nord',       alias: ['gp nord', 'gp-nord'] },
  { key: 'gp-sud',   label: 'GP sud',        alias: ['gp sud', 'gp-sud'] },
  { key: 'gp',       label: 'GP',            alias: ['gp'] },
  { key: 'gn',       label: 'GN',            alias: ['gn'] },
  { key: 'sant-iaz', label: 'Șanț iaz',      alias: ['sant iaz', 'santul iaz', 'santului iaz'] },
  { key: 'iaz',      label: 'Iaz',           alias: ['iaz'] },
  { key: 'socru',    label: 'Grădina socru', alias: ['gradina socru', 'gradina socrului'] },
];

/* Plants, so a total can be taken. Matching is on the *whole* name, which
   is what keeps "rosii cherry" out of the "rosii" total. Anything not
   listed keeps the words the writer used. */
const GD_PLANTS = [
  { key: 'rosii',        label: 'Roșii',        alias: ['rosii', 'rosie', 'tomate', 'tomata'] },
  { key: 'rosii-cherry', label: 'Roșii cherry', alias: ['rosii cherry', 'cherry', 'rosii chery'] },
  { key: 'castraveti',   label: 'Castraveți',   alias: ['castraveti', 'castravete'] },
  { key: 'dovlecel',     label: 'Dovlecel',     alias: ['dovlecel', 'dovlecei', 'zucchini', 'zuchini'] },
  { key: 'ardei',        label: 'Ardei',        alias: ['ardei'] },
  { key: 'vinete',       label: 'Vinete',       alias: ['vinete', 'vanata', 'vinata'] },
  { key: 'ceapa',        label: 'Ceapă',        alias: ['ceapa'] },
  { key: 'usturoi',      label: 'Usturoi',      alias: ['usturoi'] },
  { key: 'cartofi',      label: 'Cartofi',      alias: ['cartofi', 'cartof'] },
  { key: 'fasole',       label: 'Fasole',       alias: ['fasole'] },
  { key: 'salata',       label: 'Salată',       alias: ['salata'] },
  { key: 'spanac',       label: 'Spanac',       alias: ['spanac'] },
  { key: 'ridichi',      label: 'Ridichi',      alias: ['ridiche', 'ridichi'] },
  { key: 'varza',        label: 'Varză',        alias: ['varza'] },
  { key: 'morcovi',      label: 'Morcovi',      alias: ['morcovi', 'morcov'] },
  { key: 'alune',        label: 'Alune',        alias: ['alune'] },
  { key: 'nuci',         label: 'Nuci',         alias: ['nuci'] },
  { key: 'mere',         label: 'Mere',         alias: ['mere', 'mar'] },
  { key: 'prune',        label: 'Prune',        alias: ['prune'] },
];

/* The categories, in priority order — the first that matches names the
   line. "cosit" needs its \b at both ends: "iarba cosita" is a noun in a
   sentence about a wheelbarrow, not a mowing session. */
const GD_CATS = [
  { key: 'harvest', icon: '🧺', re: /\b(cules|culese|culeg|culegem|recoltat|harvest|harvested|picked)\b/ },
  { key: 'mow',     icon: '🌿', re: /\b(cosit|cosire|cosesc|cosim|mow|mowed|mowing|trimmed)\b/ },
  { key: 'water',   icon: '💧', re: /\b(udat|udare|udam|uda|ud|irigat|irigare|irigatie|stropit|water|watered|watering|irrigated)\b/ },
  { key: 'sow',     icon: '🌱', re: /\b(semanat|samanat|semanam|semanare|plantat|plantare|rasad|rasaduri|sow|sowed|sown|planted)\b/ },
  { key: 'care',    icon: '✂️', re: /\b(sapat|prasit|plivit|copilit|legat|taiat|tuns|mulcit|weeded|pruned|hoed)\b/ },
  { key: 'build',   icon: '🔧', re: /\b(montat|construit|reparat|instalat|montare|built|installed|repaired)\b/ },
];
const GD_CAT_ICON = GD_CATS.reduce((m, c) => (m[c.key] = c.icon, m), { other: '·' });

const GD_TIME_SRC = '(?:[01]?\\d|2[0-3]):[0-5]\\d';
/* An interval needs a dash between two clock times. Without that rule
   "am plecat la 4:33 ... am ajuns la 4:55" would read as one. */
const GD_INTERVAL_RE = new RegExp('\\b(' + GD_TIME_SRC + ')\\s*[-–—]\\s*(' + GD_TIME_SRC + ')\\b');
/* Litres only count when the line says they are water: "150 l de apa" is
   used, "am ramas cu 60 l" is what was left in the tank. */
const GD_LITRE_RE = /(\d+(?:[.,]\d+)?)\s*(?:l|litri|litre|liters?)\b[\s.]*(?:de\s+)?ap[aă]\b/gi;
const GD_QTY_RE = /(\d+(?:[.,]\d+)?)\s*(kg|kilograme|kilogram|g|gr|grame|gram|buc|bucati|bucăți|bucata)\b/i;
const GD_ROUNDS_RE = /(\d+)\s*(?:ture|tura|turi|rounds?)\b/i;
const GD_MOW_N_RE = /\bcosit\s+(\d+)\b/i;
const GD_HARVEST_RE = /\b(cules|culese|culeg|culegem|recoltat|harvested|picked|harvest)\b/i;
const GD_FROM_RE = /^\s*(?:din|de\s+la|de\s+pe|in|în|la|from)\b\s*/i;
/* The same "@date" the calendar reads (docs/FEATURES.md § L) — one syntax
   per page, so a day header already written for the calendar works here. */
const GD_DATE_RE = /(^|[\s(\[{])@(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})/;

// Diacritics folded the way the search panel folds them, plus the two
// comma-below letters NFD does not decompose on every engine.
function gdFold(s) {
  return fdFold(String(s)).replace(/ș/g, 's').replace(/ț/g, 't').toLowerCase();
}
function gdNum(s) { return parseFloat(String(s).replace(',', '.')); }
function gdEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const GD_PLACE_ALIASES = (() => {
  const out = [];
  GD_PLACES.forEach(p => p.alias.forEach(a => out.push({ key: p.key, label: p.label, a: gdFold(a) })));
  return out.sort((x, y) => y.a.length - x.a.length);
})();

/* Every place a line names. Longest alias first, and each hit is blanked
   out of the haystack so "gp nord" does not also report a bare "gp". */
function gdPlacesIn(line) {
  let hay = ' ' + gdFold(line) + ' ';
  const found = [];
  for (const al of GD_PLACE_ALIASES) {
    const re = new RegExp('(^|[^a-z0-9])' + gdEsc(al.a) + '(?![a-z0-9])', 'g');
    let m, hit = false;
    while ((m = re.exec(hay))) {
      hit = true;
      const at = m.index + m[1].length;
      hay = hay.slice(0, at) + ' '.repeat(al.a.length) + hay.slice(at + al.a.length);
      re.lastIndex = at + al.a.length;
    }
    if (hit && !found.some(f => f.key === al.key)) found.push({ key: al.key, label: al.label });
  }
  return found;
}

/* The place a harvest line came "din". A known code wins; otherwise the
   words themselves become the place, so "gradina socru" is not lost. */
function gdPlaceOf(text) {
  const known = gdPlacesIn(text);
  if (known.length) return known;
  const raw = String(text).trim().replace(/^[\s\-–—.,;:]+|[\s.,;:]+$/g, '');
  if (!raw || raw.length > 40) return [];
  return [{ key: 'x:' + gdFold(raw), label: raw.charAt(0).toUpperCase() + raw.slice(1) }];
}

function gdPlantOf(raw) {
  const clean = String(raw).replace(/^[\s\-–—.,;:*]+|[\s.,;:]+$/g, '').replace(/\s+/g, ' ');
  if (!clean) return null;
  const f = gdFold(clean);
  for (const p of GD_PLANTS) if (p.alias.indexOf(f) !== -1) return { key: p.key, label: p.label };
  return { key: 'x:' + f, label: clean.charAt(0).toUpperCase() + clean.slice(1) };
}

/* "6 kg rosii" and "zucchini 450 g" are one item written two ways, so the
   name is whatever is left once the quantity is taken out. The split is on
   a comma NOT followed by a digit: "7,7 kg rosii, 400 g castraveti" is one
   decimal comma and one list comma. */
function gdItems(text) {
  const out = [];
  String(text).split(/,(?!\d)|;|\s+(?:si|și|and)\s+/i).forEach(chunk => {
    const m = GD_QTY_RE.exec(chunk);
    if (!m) return;
    const unit = gdFold(m[2]);
    const piece = /^buc/.test(unit);
    const n = gdNum(m[1]);
    if (!isFinite(n)) return;
    const name = (chunk.slice(0, m.index) + ' ' + chunk.slice(m.index + m[0].length)).trim();
    const plant = gdPlantOf(name);
    out.push({
      plant: plant ? plant.key : '',
      plantLabel: plant ? plant.label : '',
      grams: piece ? 0 : n * (/^k/.test(unit) ? 1000 : 1),
      pieces: piece ? n : 0
    });
  });
  return out;
}

/* A harvest line: the verb, then where it was picked from, then the list.
   The place ends at the first ":" or at the first quantity, whichever
   comes first — "cules din sm: 6 kg rosii" and "cules din sm 5,3 kg rosii"
   are both written here. A line with no verb still counts when it opens
   with a known garden code, which is how "s1: 1 kg ardei" is read. */
function gdParseHarvest(line) {
  let place = '', rest = '';
  const m = GD_HARVEST_RE.exec(line);
  if (m) {
    const after = line.slice(m.index + m[0].length);
    const colon = after.indexOf(':');
    const q = GD_QTY_RE.exec(after);
    const cut = colon !== -1 && (!q || colon < q.index) ? colon : (q ? q.index : -1);
    if (cut === -1) return null;
    place = after.slice(0, cut).replace(GD_FROM_RE, '');
    rest = after.slice(cut === colon ? cut + 1 : cut);
  } else {
    const head = /^\s*([^:]{1,30}):\s*(.+)$/.exec(line);
    if (!head || !gdPlacesIn(head[1]).length) return null;
    place = head[1]; rest = head[2];
  }
  const items = gdItems(rest);
  if (!items.length) return null;
  return { places: gdPlaceOf(place), items };
}

function gdCatsOf(folded) {
  const out = [];
  GD_CATS.forEach(c => { if (c.re.test(folded)) out.push(c.key); });
  return out;
}

/* One note in, records out. Every line yields at most one activity; a
   harvest line yields its per-plant rows on top of that. A line becomes a
   record only when it carries an interval, water, or a verb this knows —
   which is what keeps "fitbit 13457 pasi" and a list of seed-tray codes
   out of the tables. */
function gdScan(text) {
  const recs = [];
  let day = null;
  String(text).split('\n').forEach((line, i) => {
    const dm = GD_DATE_RE.exec(line);
    if (dm) {
      const s = dm[2];
      if (s.indexOf('-') === 4) day = s;
      else { const p = s.split(/[./]/); day = p[2] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[0]).slice(-2); }
    }
    const body = line.replace(GD_DATE_RE, '$1').replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s*)?/, '').trim();
    if (!body || /^[#>|\-=*_\s]*$/.test(body)) return;
    const folded = gdFold(body);
    const cats = gdCatsOf(folded);
    const isHarvest = cats.indexOf('harvest') !== -1;

    let harvest = null;
    if (isHarvest || /^\s*[^:]{1,30}:/.test(body)) harvest = gdParseHarvest(body);

    const iv = GD_INTERVAL_RE.exec(body);
    GD_LITRE_RE.lastIndex = 0;
    let lm, litres = 0;
    while ((lm = GD_LITRE_RE.exec(body))) litres += gdNum(lm[1]);
    const isMow = cats.indexOf('mow') !== -1;
    let rounds = 0;
    if (isMow) {
      const r = GD_ROUNDS_RE.exec(body) || GD_MOW_N_RE.exec(body);
      rounds = r ? +r[1] : 0;
    }
    const places = gdPlacesIn(body);
    // A mowing line with neither a count, a place nor a clock is prose
    // about mown grass, not a session.
    if (isMow && !rounds && !places.length && !iv) return;
    if (!harvest && !iv && !litres && !cats.length) return;

    let mins = null, from = null, to = null;
    if (iv) {
      const a = iv[1].split(':'), b = iv[2].split(':');
      const s1 = +a[0] * 60 + +a[1], s2 = +b[0] * 60 + +b[1];
      from = ('0' + a[0]).slice(-2) + ':' + a[1];
      to = ('0' + b[0]).slice(-2) + ':' + b[1];
      mins = s2 - s1;
      if (mins < 0) mins += 24 * 60;                 // past midnight
    }
    const cat = cats.length ? cats[0] : (litres || /\bap[aă]\b/.test(folded) ? 'water' : 'other');
    const actPlaces = harvest && !places.length ? harvest.places : places;
    const grams = harvest ? harvest.items.reduce((s, it) => s + it.grams, 0) : 0;
    const pieces = harvest ? harvest.items.reduce((s, it) => s + it.pieces, 0) : 0;

    recs.push({
      kind: 'act', cat, date: day, line: i, text: body,
      places: actPlaces, from, to, mins, litres, rounds, grams, pieces
    });
    if (harvest) harvest.items.forEach(it => recs.push({
      kind: 'harvest', cat: 'harvest', date: day, line: i, text: body,
      places: harvest.places, plant: it.plant, plantLabel: it.plantLabel,
      grams: it.grams, pieces: it.pieces
    }));
  });
  return recs;
}

/* ── The records the toolbox is looking at ─────────────────────────────
   Same three scopes the graph and the search panel have, plus the one
   this feature exists for: the garden workbook, found by name. */
const GD_BOOK_RE = /gr[aă]din|garden/i;
const gdScanCache = new Map();

function gdIsGardenBook(book) { return !!book && GD_BOOK_RE.test(book.name || ''); }

function gdScopeNotes() {
  const all = wikiNotes();
  if (gdState.scope === 'note') {
    const home = wikiHome(wbCurrentId);
    return home ? [home] : [];
  }
  if (gdState.scope === 'vault') return all;
  if (gdState.scope === 'workbook') {
    const bookId = gvCurrentBookId();
    return all.filter(n => (bookId ? n.bookId === bookId : n.loose));
  }
  const ids = new Set(wbBooks.filter(gdIsGardenBook).map(b => b.id));
  return all.filter(n => ids.has(n.bookId));
}

function gdRecords() {
  const out = [];
  gdScopeNotes().forEach(n => {
    const text = noteText(n);
    let hit = gdScanCache.get(n.id);
    if (!hit || hit.text !== text) { hit = { text, recs: gdScan(text) }; gdScanCache.set(n.id, hit); }
    hit.recs.forEach(r => out.push(Object.assign({ note: n }, r)));
  });
  return out;
}

/* ── Filtering ───────────────────────────────────────────────────────── */
const GD_TABS = ['act', 'harvest', 'mow'];
var gdReady = false;           // var: applyUILang() reads it before this runs
let gdOpen = false;
const gdState = {
  tab: 'act', scope: 'garden', from: '', to: '',
  place: '', plant: '', cat: '', q: '', group: 'none'
};
let gdLast = { rows: [], groups: [], places: [], plants: [], cats: [], totals: null };

function gdToday() {
  const d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
// A record with no "@date" above it cannot be placed in time, so a date
// filter drops it rather than guessing which side of the bound it is on.
function gdInRange(r) {
  if (!gdState.from && !gdState.to) return true;
  if (!r.date) return false;
  if (gdState.from && r.date < gdState.from) return false;
  if (gdState.to && r.date > gdState.to) return false;
  return true;
}
function gdHasPlace(r, key) { return (r.places || []).some(p => p.key === key); }
function gdPlaceText(r) {
  const p = r.places || [];
  return p.length ? p.map(x => x.label).join(', ') : '—';
}

/* Each chip's list is counted one step before the chip itself filters, the
   way the search panel counts its kinds — otherwise choosing a place would
   empty the place list down to that one place. */
function gdCompute() {
  const all = gdRecords();
  const base = all.filter(r => (gdState.tab === 'harvest' ? r.kind === 'harvest'
    : gdState.tab === 'mow' ? (r.kind === 'act' && r.cat === 'mow')
      : r.kind === 'act'));
  const q = gdState.q.trim() ? gdFold(gdState.q.trim()) : '';
  const dated = base.filter(r => gdInRange(r) && (!q || gdFold(r.text).indexOf(q) !== -1));

  const places = new Map();
  dated.forEach(r => (r.places || []).forEach(p => places.set(p.key, { key: p.key, label: p.label, n: (places.get(p.key) || { n: 0 }).n + 1 })));
  const byPlace = dated.filter(r => !gdState.place || gdHasPlace(r, gdState.place));

  const plants = new Map();
  const cats = new Map();
  byPlace.forEach(r => {
    if (r.kind === 'harvest') {
      const k = r.plant || 'x:';
      plants.set(k, { key: k, label: r.plantLabel || '—', n: (plants.get(k) || { n: 0 }).n + 1 });
    } else {
      cats.set(r.cat, { key: r.cat, label: t('gdCat_' + r.cat), n: (cats.get(r.cat) || { n: 0 }).n + 1 });
    }
  });
  const rows = byPlace.filter(r => (gdState.tab === 'harvest'
    ? (!gdState.plant || (r.plant || 'x:') === gdState.plant)
    : (!gdState.cat || r.cat === gdState.cat)));

  rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.line - b.line);

  const totals = rows.reduce((s, r) => {
    s.n++; s.grams += r.grams || 0; s.pieces += r.pieces || 0;
    s.litres += r.litres || 0; s.rounds += r.rounds || 0;
    if (r.mins != null) { s.mins += r.mins; s.timed++; }
    return s;
  }, { n: 0, grams: 0, pieces: 0, litres: 0, rounds: 0, mins: 0, timed: 0 });

  gdLast = {
    rows, groups: gdGroups(rows), totals,
    places: Array.from(places.values()).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    plants: Array.from(plants.values()).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    cats: Array.from(cats.values()).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
  };
  return gdLast;
}

/* A grouped row is the same numbers, summed. "Place" counts a line that
   names two plots once under each — which is what the writer meant by
   "s1 si s2". */
function gdGroups(rows) {
  if (gdState.group === 'none') return [];
  const map = new Map();
  const bump = (key, label, r) => {
    let g = map.get(key);
    if (!g) { g = { key, label, n: 0, grams: 0, pieces: 0, litres: 0, rounds: 0, mins: 0, timed: 0 }; map.set(key, g); }
    g.n++; g.grams += r.grams || 0; g.pieces += r.pieces || 0;
    g.litres += r.litres || 0; g.rounds += r.rounds || 0;
    if (r.mins != null) { g.mins += r.mins; g.timed++; }
  };
  rows.forEach(r => {
    if (gdState.group === 'place') {
      const ps = (r.places || []);
      if (!ps.length) bump('—', '—', r);
      else ps.forEach(p => bump(p.key, p.label, r));
    } else if (gdState.group === 'day') bump(r.date || '—', r.date ? gdDate(r.date) : '—', r);
    else if (gdState.group === 'plant') bump(r.plant || 'x:', r.plantLabel || '—', r);
    else if (gdState.group === 'cat') bump(r.cat, t('gdCat_' + r.cat), r);
    else if (gdState.group === 'month') bump((r.date || '—').slice(0, 7), (r.date || '—').slice(0, 7), r);
  });
  const out = Array.from(map.values());
  return gdState.group === 'day' || gdState.group === 'month'
    ? out.sort((a, b) => a.key.localeCompare(b.key))
    : out.sort((a, b) => (b.grams || b.rounds || b.litres || b.n) - (a.grams || a.rounds || a.litres || a.n));
}

/* ── Formatting ──────────────────────────────────────────────────────── */
function gdDate(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}
function gdMass(grams, pieces) {
  const out = [];
  if (grams) out.push(grams >= 1000 ? (grams / 1000).toFixed(grams % 1000 ? 2 : 0).replace('.', ',') + ' kg' : Math.round(grams) + ' g');
  if (pieces) out.push(pieces + ' ' + t('gdPieces'));
  return out.length ? out.join(' + ') : '—';
}
function gdDur(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? h + ' h ' + ('0' + m).slice(-2) + ' m' : m + ' m';
}
function gdLitres(l) { return l ? Math.round(l * 100) / 100 + ' l' : '—'; }

/* ── Rendering ───────────────────────────────────────────────────────── */
const GD_COLS = {
  act: ['gdColDate', 'gdColCat', 'gdColPlace', 'gdColInterval', 'gdColDuration', 'gdColWater', 'gdColDetail'],
  harvest: ['gdColDate', 'gdColPlace', 'gdColPlant', 'gdColQty', 'gdColDetail'],
  mow: ['gdColDate', 'gdColPlace', 'gdColRounds', 'gdColDetail']
};
const GD_GROUP_COLS = {
  act: ['gdColGroup', 'gdColCount', 'gdColDuration', 'gdColWater'],
  harvest: ['gdColGroup', 'gdColCount', 'gdColQty'],
  mow: ['gdColGroup', 'gdColSessions', 'gdColRounds']
};

function gdCell(text, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

function gdRender() {
  const { rows, groups, totals } = gdCompute();
  gdPaintFilters();

  const table = document.getElementById('gd-table');
  if (!table) return;
  table.innerHTML = '';
  const grouped = gdState.group !== 'none';
  table.classList.toggle('gd-grouped', grouped);
  const head = document.createElement('thead');
  const hr = document.createElement('tr');
  (grouped ? GD_GROUP_COLS : GD_COLS)[gdState.tab].forEach(k => {
    const th = document.createElement('th');
    // The two columns a phone drops; the CSS matches these, not a position.
    if (k === 'gdColDetail') th.className = 'gd-col-detail';
    if (k === 'gdColInterval') th.className = 'gd-col-iv';
    th.textContent = t(k);
    hr.appendChild(th);
  });
  head.appendChild(hr);
  table.appendChild(head);

  const body = document.createElement('tbody');
  if (grouped) {
    groups.forEach(g => {
      const tr = document.createElement('tr');
      tr.appendChild(gdCell(g.label, 'gd-strong'));
      if (gdState.tab === 'act') {
        tr.appendChild(gdCell(String(g.n), 'gd-num'));
        tr.appendChild(gdCell(g.timed ? gdDur(g.mins) : '—', 'gd-num'));
        tr.appendChild(gdCell(gdLitres(g.litres), 'gd-num'));
      } else if (gdState.tab === 'harvest') {
        tr.appendChild(gdCell(String(g.n), 'gd-num'));
        tr.appendChild(gdCell(gdMass(g.grams, g.pieces), 'gd-num gd-strong'));
      } else {
        tr.appendChild(gdCell(String(g.n), 'gd-num'));
        tr.appendChild(gdCell(g.rounds ? String(g.rounds) : '—', 'gd-num'));
      }
      body.appendChild(tr);
    });
  } else {
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'gd-row';
      tr.tabIndex = 0;
      tr.dataset.note = r.note.id;
      tr.dataset.line = r.line;
      tr.appendChild(gdCell(gdDate(r.date)));
      if (gdState.tab === 'act') {
        tr.appendChild(gdCell(GD_CAT_ICON[r.cat] + ' ' + t('gdCat_' + r.cat)));
        tr.appendChild(gdCell(gdPlaceText(r)));
        tr.appendChild(gdCell(r.from ? r.from + ' – ' + r.to : '—', 'gd-num gd-col-iv'));
        tr.appendChild(gdCell(gdDur(r.mins), 'gd-num'));
        tr.appendChild(gdCell(gdLitres(r.litres), 'gd-num'));
      } else if (gdState.tab === 'harvest') {
        tr.appendChild(gdCell(gdPlaceText(r)));
        tr.appendChild(gdCell(r.plantLabel || '—'));
        tr.appendChild(gdCell(gdMass(r.grams, r.pieces), 'gd-num gd-strong'));
      } else {
        tr.appendChild(gdCell(gdPlaceText(r)));
        tr.appendChild(gdCell(r.rounds ? String(r.rounds) : '—', 'gd-num'));
      }
      tr.appendChild(gdCell(r.text, 'gd-detail'));
      body.appendChild(tr);
    });
  }
  table.appendChild(body);

  document.getElementById('gd-empty').classList.toggle('on', !rows.length);
  document.getElementById('gd-empty').textContent = t('gdEmpty');
  document.getElementById('gd-foot').textContent = gdFootText(totals);
  document.getElementById('gd-upto').textContent = gdState.to
    ? t('gdUpTo', gdDate(gdState.to)) : t('gdAllTime');
}

function gdFootText(s) {
  if (gdState.tab === 'harvest') return t('gdFootHarvest', { n: s.n, qty: gdMass(s.grams, s.pieces) });
  if (gdState.tab === 'mow') return t('gdFootMow', { n: s.n, rounds: s.rounds });
  return t('gdFootAct', { n: s.n, dur: gdDur(s.mins), litres: gdLitres(s.litres) });
}

function gdOption(sel, value, label, count) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = count == null ? label : label + ' (' + count + ')';
  sel.appendChild(o);
}

function gdPaintFilters() {
  document.querySelectorAll('#gd-tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === gdState.tab));
  document.querySelectorAll('#gd-scope button').forEach(b =>
    b.classList.toggle('active', b.dataset.scope === gdState.scope));
  const view = document.getElementById('garden-view');
  GD_TABS.forEach(k => view.classList.toggle('gd-' + k, gdState.tab === k));

  const from = document.getElementById('gd-from');
  const to = document.getElementById('gd-to');
  if (from.value !== gdState.from) from.value = gdState.from;
  if (to.value !== gdState.to) to.value = gdState.to;
  const q = document.getElementById('gd-q');
  if (q.value !== gdState.q) q.value = gdState.q;

  const place = document.getElementById('gd-place');
  place.innerHTML = '';
  gdOption(place, '', t('gdAllPlaces'));
  gdLast.places.forEach(p => gdOption(place, p.key, p.label, p.n));
  if (gdState.place && !gdLast.places.some(p => p.key === gdState.place)) gdOption(place, gdState.place, gdState.place);
  place.value = gdState.place;

  const plant = document.getElementById('gd-plant');
  plant.innerHTML = '';
  gdOption(plant, '', t('gdAllPlants'));
  gdLast.plants.forEach(p => gdOption(plant, p.key, p.label, p.n));
  if (gdState.plant && !gdLast.plants.some(p => p.key === gdState.plant)) gdOption(plant, gdState.plant, gdState.plant);
  plant.value = gdState.plant;

  const cat = document.getElementById('gd-cat');
  cat.innerHTML = '';
  gdOption(cat, '', t('gdAllCats'));
  gdLast.cats.forEach(c => gdOption(cat, c.key, c.label, c.n));
  if (gdState.cat && !gdLast.cats.some(c => c.key === gdState.cat)) gdOption(cat, gdState.cat, gdState.cat);
  cat.value = gdState.cat;

  // "Group by plant" only means something where there are plants.
  const group = document.getElementById('gd-group');
  const opts = ['none', 'day', 'month', 'place'].concat(gdState.tab === 'harvest' ? ['plant'] : gdState.tab === 'act' ? ['cat'] : []);
  group.innerHTML = '';
  opts.forEach(k => gdOption(group, k, t('gdGroup_' + k)));
  if (opts.indexOf(gdState.group) === -1) gdState.group = 'none';
  group.value = gdState.group;
}

/* ── Wiring ──────────────────────────────────────────────────────────── */
function gdSet(key, value) {
  gdState[key] = value;
  if (key === 'tab') { gdState.plant = ''; gdState.cat = ''; }
  gdSaveSettings();
  gdRender();
}
function gdResetFilters() {
  gdState.from = ''; gdState.to = gdToday();
  gdState.place = ''; gdState.plant = ''; gdState.cat = ''; gdState.q = '';
  gdState.group = 'none';
  gdSaveSettings();
  gdRender();
}

/* A row points at the line it was read from; going there is the same jump
   a search hit makes. */
async function gdGoto(noteId, line) {
  const note = wikiNotes().find(n => n.id === noteId);
  if (!note) return;
  closeGarden();
  await fdGoto(note, { line, ranges: [[0, 0]], section: null });
}

/* Exactly what is on screen, as a spreadsheet. Semicolons and a decimal
   comma, not commas and a decimal point: that is the European convention
   Excel and LibreOffice open natively on a Romanian machine, where a
   comma-separated file lands every row in a single column. */
function gdCsv() {
  const grouped = gdState.group !== 'none';
  const cols = (grouped ? GD_GROUP_COLS : GD_COLS)[gdState.tab].map(k => t(k));
  const cell = v => /[";\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const num = v => (v === '' || v == null) ? '' : String(v).replace('.', ',');
  const lines = [cols.map(cell).join(';')];
  if (grouped) {
    gdLast.groups.forEach(g => {
      const row = [g.label, g.n];
      if (gdState.tab === 'act') row.push(g.timed ? gdDur(g.mins) : '', num(g.litres || ''));
      else if (gdState.tab === 'harvest') row.push(num(g.grams / 1000));
      else row.push(g.rounds || '');
      lines.push(row.map(cell).join(';'));
    });
  } else {
    gdLast.rows.forEach(r => {
      const row = [gdDate(r.date)];
      if (gdState.tab === 'act') row.push(t('gdCat_' + r.cat), gdPlaceText(r), r.from ? r.from + '-' + r.to : '', r.mins == null ? '' : r.mins, num(r.litres || ''));
      else if (gdState.tab === 'harvest') row.push(gdPlaceText(r), r.plantLabel || '', num(r.grams ? r.grams / 1000 : r.pieces));
      else row.push(gdPlaceText(r), r.rounds || '');
      row.push(r.text);
      lines.push(row.map(cell).join(';'));
    });
  }
  lines.push('');
  lines.push(cell(gdFootText(gdLast.totals)));
  const name = 'gradina-' + gdState.tab + '-' + gdToday() + '.csv';
  saveOut(name, new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
}

function gdBind() {
  document.getElementById('gd-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) gdSet('tab', b.dataset.tab);
  });
  document.getElementById('gd-scope').addEventListener('click', e => {
    const b = e.target.closest('button[data-scope]');
    if (b) { gdScanCache.clear(); gdSet('scope', b.dataset.scope); }
  });
  [['gd-from', 'from'], ['gd-to', 'to'], ['gd-place', 'place'], ['gd-plant', 'plant'],
   ['gd-cat', 'cat'], ['gd-group', 'group']].forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', e => gdSet(key, e.target.value));
  });
  let qTimer = 0;
  document.getElementById('gd-q').addEventListener('input', e => {
    clearTimeout(qTimer);
    const v = e.target.value;
    qTimer = setTimeout(() => { gdState.q = v; gdRender(); }, 200);
  });
  const table = document.getElementById('gd-table');
  const go = el => { if (el && el.dataset.note) gdGoto(el.dataset.note, +el.dataset.line); };
  table.addEventListener('click', e => go(e.target.closest('tr.gd-row')));
  table.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest('tr.gd-row');
    if (!tr) return;
    e.preventDefault();
    go(tr);
  });
}

function openGarden() {
  const view = document.getElementById('garden-view');
  if (!view) return;
  // The toolbox exists for the garden workbook; if there is none, showing
  // an empty table would be a worse answer than showing everything.
  if (gdState.scope === 'garden' && !wbBooks.some(gdIsGardenBook)) gdState.scope = 'vault';
  gdOpen = true;
  view.classList.add('open');
  if (!view.dataset.bound) { gdBind(); view.dataset.bound = '1'; }
  gdScanCache.clear();
  gdRender();
}
function closeGarden() {
  const view = document.getElementById('garden-view');
  if (view) view.classList.remove('open');
  gdOpen = false;
}
function toggleGarden() { if (gdOpen) closeGarden(); else openGarden(); }

// The button exists only while the open chapter belongs to a garden
// workbook — it follows the editor the same way btn-map does.
function gdBtnRefresh() {
  const btn = document.getElementById('btn-garden');
  if (!btn) return;
  const bookId = gvCurrentBookId();
  btn.hidden = !gdIsGardenBook(bookId ? wbBook(bookId) : null);
}

/* The tables read the open chapter, so they follow the editor — debounced
   for the same reason the graph is. */
let gdRefreshTimer = 0;
function gdRefresh() {
  if (!gdOpen) return;
  clearTimeout(gdRefreshTimer);
  gdRefreshTimer = setTimeout(() => { gdScanCache.clear(); gdRender(); }, 450);
}
// Every label in here is generated, so data-i cannot reach it.
function gdRepaintLang() { if (gdOpen) gdRender(); }

function gdSaveSettings() {
  store.set(GD_KEY, JSON.stringify({
    tab: gdState.tab, scope: gdState.scope, from: gdState.from,
    to: gdState.to, group: gdState.group
  }));
}
async function gdLoadSettings() {
  let saved = null;
  try { saved = JSON.parse(await store.get(GD_KEY) || 'null'); } catch (e) { saved = null; }
  // "Up to today" is the default a running total wants; a saved bound is
  // only kept when it is still in the future of what was written.
  gdState.to = gdToday();
  if (saved) {
    if (GD_TABS.indexOf(saved.tab) !== -1) gdState.tab = saved.tab;
    if (['garden', 'note', 'workbook', 'vault'].indexOf(saved.scope) !== -1) gdState.scope = saved.scope;
    if (typeof saved.from === 'string') gdState.from = saved.from;
    if (typeof saved.group === 'string') gdState.group = saved.group;
  }
  gdReady = true;
}
gdLoadSettings().then(() => { if (gdOpen) gdRender(); });

