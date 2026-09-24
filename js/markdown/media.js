/* ============================================================
   Photos and films — a folder read through its own metadata
   (docs/FEATURES.md § T)

   Pick a folder, walk it and everything under it, and ask each
   picture and each film the two questions only the file itself can
   answer: when was this taken, and where. The file name is asked
   third, and only for what it alone knows — the name a person gave
   the picture, which is whatever is left of the name once the date
   and the clock are taken out of it.

   Everything is parsed here, by hand: EXIF out of JPEG, PNG, WebP,
   TIFF and HEIC, and the ISO-BMFF boxes out of MP4/MOV. Rule 3 —
   there is no metadata library in this repo and there will not be.

   What comes out is written in this page's own markers: "@date"
   (§ L), "^@place" (§ S) and, if asked, the timeline (§ R). Nothing
   here invents a syntax of its own.
   ============================================================ */

var mbReady = false;             // var: applyUILang() reads it before this runs
let mbOpen = false;
let mbRows = [];                 // every file found, in the order it was read
let mbFolderName = '';
let mbBusy = false;

// The explorer's IMAGE_EXTS is the picture half; a camera adds two more
// containers that no browser can show but every phone writes.
const MB_IMG_EXTRA = new Set(['.heic', '.heif', '.jxl']);
const MB_VID_EXTS = new Set(['.mp4', '.m4v', '.mov', '.qt', '.3gp', '.3g2',
                             '.avi', '.mkv', '.webm', '.mts', '.m2ts', '.mpg', '.mpeg', '.wmv']);
const MB_MAX_FILES = 4000;       // a folder tree, not a disk

function mbExt(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}
function mbKindOf(name) {
  const ext = mbExt(name);
  if (IMAGE_EXTS.has(ext) || MB_IMG_EXTRA.has(ext)) return 'img';
  if (MB_VID_EXTS.has(ext)) return 'vid';
  return null;
}

/* ── Bytes ──────────────────────────────────────────────────
   Nothing is ever read whole: a photo is answered by its first
   pages and a film by the one box that holds its header. */
async function mbBytes(file, start, len) {
  if (start >= file.size) return new Uint8Array(0);
  const end = Math.min(file.size, start + len);
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}
function mbU16(b, p) { return (b[p] << 8) | b[p + 1]; }
function mbU32(b, p) { return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0; }
function mbAscii(b, p, n) {
  let s = '';
  for (let i = 0; i < n && p + i < b.length; i++) s += String.fromCharCode(b[p + i]);
  return s;
}
function mbUtf8(b, s, e) {
  try { return new TextDecoder('utf-8').decode(b.subarray(s, Math.max(s, e))).replace(/\0+$/, '').trim(); }
  catch (err) { return ''; }
}

/* ── A moment, normalised ───────────────────────────────────
   Every reader below ends here, so "2024:07:12 15:30:00" out of
   EXIF and "2024-07-12T15:30:00+0300" out of an MP4 become the
   same three fields — and an impossible date becomes none. */
function mbStamp(y, mo, d, h, mi) {
  if (!(y >= 1826 && y <= 2400)) return null;          // older than photography
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return null;
  const dt = new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  const p2 = n => String(n).padStart(2, '0');
  const clock = (h != null && mi != null);      // midnight is a time too
  return { iso: y + '-' + p2(mo) + '-' + p2(d), time: clock ? p2(h) + ':' + p2(mi) : '', ts: dt.getTime() };
}
function mbStampFromDate(dt) {
  return mbStamp(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), dt.getMinutes());
}
// "2024:07:12 15:30:00", "2024-07-12T15:30:00+03:00", "2024-07-12"
function mbTextStamp(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/(\d{4})[:\-.](\d{1,2})[:\-.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return mbStamp(+m[1], +m[2], +m[3], m[4] == null ? null : +m[4], m[5] == null ? null : +m[5]);
}

/* ── EXIF, which is a TIFF header wherever it is found ────── */
const MB_TIFF_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

function mbReadTiff(b, base) {
  if (base < 0 || base + 8 > b.length) return null;
  let le;
  if (b[base] === 0x49 && b[base + 1] === 0x49) le = true;
  else if (b[base] === 0x4D && b[base + 1] === 0x4D) le = false;
  else return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint16(base + 2, le) !== 42) return null;

  const out = { stamp: null, lat: null, lon: null };
  const gps = {};
  const seen = new Set();

  // One entry's value: a string for ASCII, an array of numbers otherwise.
  function value(entry) {
    const type = dv.getUint16(entry + 2, le);
    const count = dv.getUint32(entry + 4, le);
    const unit = MB_TIFF_SIZE[type] || 0;
    const size = unit * count;
    if (!size || size > 4096) return null;
    let at = entry + 8;
    if (size > 4) at = base + dv.getUint32(entry + 8, le);
    if (at < 0 || at + size > b.length) return null;
    if (type === 2) {
      let s = '';
      for (let i = 0; i < count; i++) { const c = b[at + i]; if (!c) break; s += String.fromCharCode(c); }
      return s;
    }
    const nums = [];
    for (let i = 0; i < count; i++) {
      const p = at + i * unit;
      if (type === 1 || type === 6 || type === 7) nums.push(b[p]);
      else if (type === 3) nums.push(dv.getUint16(p, le));
      else if (type === 4) nums.push(dv.getUint32(p, le));
      else if (type === 8) nums.push(dv.getInt16(p, le));
      else if (type === 9) nums.push(dv.getInt32(p, le));
      else if (type === 5) { const den = dv.getUint32(p + 4, le); nums.push(den ? dv.getUint32(p, le) / den : 0); }
      else if (type === 10) { const den = dv.getInt32(p + 4, le); nums.push(den ? dv.getInt32(p, le) / den : 0); }
      else return null;
    }
    return nums;
  }

  // An IFD is a count and then that many 12-byte entries. Two of the tags
  // in IFD0 are pointers to further IFDs — that is all the recursion there is.
  function ifd(at, kind) {
    if (at <= base || at + 2 > b.length || seen.has(at) || seen.size > 8) return;
    seen.add(at);
    const n = dv.getUint16(at, le);
    if (n > 512) return;
    for (let i = 0; i < n; i++) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > b.length) return;
      const tag = dv.getUint16(entry, le);
      if (kind === 'gps') { const v = value(entry); if (v != null) gps[tag] = v; continue; }
      if (tag === 0x8769 || tag === 0x8825) {
        const p = value(entry);
        if (p && p.length) ifd(base + p[0], tag === 0x8825 ? 'gps' : 'exif');
      } else if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
        // DateTimeOriginal is when the shutter fired; the other two are
        // when the file was written, so they only fill a gap.
        const st = mbTextStamp(value(entry));
        if (st && (tag === 0x9003 || !out.stamp)) out.stamp = st;
      }
    }
  }
  ifd(base + dv.getUint32(base + 4, le), 'ifd0');

  const lat = mbDms(gps[2], gps[1]), lon = mbDms(gps[4], gps[3]);
  if (lat != null && lon != null && mbGeoOk(lat, lon)) { out.lat = lat; out.lon = lon; }
  // GPSDateStamp is UTC, so it is the last resort for "when", never the first.
  if (!out.stamp && typeof gps[29] === 'string') out.stamp = mbTextStamp(gps[29]);
  return out;
}

// Degrees, minutes, seconds and a letter → one signed number.
function mbDms(parts, ref) {
  if (!Array.isArray(parts) || !parts.length) return null;
  const deg = (parts[0] || 0) + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
  if (!isFinite(deg)) return null;
  const south = typeof ref === 'string' && /^\s*[SWV]/i.test(ref);
  return south ? -deg : deg;
}
function mbGeoOk(lat, lon) {
  return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
         !(Math.abs(lat) < 1e-7 && Math.abs(lon) < 1e-7);   // 0,0 is "no fix"
}

/* ── Where the EXIF sits, per container ─────────────────────
   Four shapes and one odd one out: JPEG keeps it in an APP1
   segment, PNG in an eXIf chunk, WebP in a RIFF chunk, TIFF is
   one already — and HEIC hides it as an item in a box tree. */
const MB_HEAD = 384 * 1024;

async function mbExifOf(file, ext) {
  if (ext === '.jpg' || ext === '.jpeg') {
    const b = await mbBytes(file, 0, MB_HEAD);
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xFF) break;
      const marker = b[p + 1];
      if (marker === 0xFF) { p++; continue; }                     // fill bytes
      if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { p += 2; continue; }
      if (marker === 0xDA) break;                                  // the pixels start
      const len = mbU16(b, p + 2);
      if (len < 2) break;
      if (marker === 0xE1 && mbAscii(b, p + 4, 4) === 'Exif') return mbReadTiff(b, p + 10);
      p += 2 + len;
    }
    return null;
  }
  if (ext === '.png') {
    const b = await mbBytes(file, 0, MB_HEAD);
    let p = 8;
    while (p + 12 <= b.length) {
      const len = mbU32(b, p);
      const type = mbAscii(b, p + 4, 4);
      if (type === 'eXIf') return mbReadTiff(b, p + 8);
      if (type === 'IDAT' || type === 'IEND') break;
      if (len > b.length) break;
      p += 12 + len;
    }
    return null;
  }
  if (ext === '.webp') {
    const b = await mbBytes(file, 0, MB_HEAD);
    if (mbAscii(b, 0, 4) !== 'RIFF' || mbAscii(b, 8, 4) !== 'WEBP') return null;
    let p = 12;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    while (p + 8 <= b.length) {
      const type = mbAscii(b, p, 4);
      const len = dv.getUint32(p + 4, true);              // RIFF counts little-endian
      if (type === 'EXIF') {
        const skip = mbAscii(b, p + 8, 4) === 'Exif' ? 6 : 0;
        return mbReadTiff(b, p + 8 + skip);
      }
      p += 8 + len + (len & 1);
    }
    return null;
  }
  if (ext === '.tif' || ext === '.tiff') return mbReadTiff(await mbBytes(file, 0, MB_HEAD), 0);
  if (ext === '.heic' || ext === '.heif' || ext === '.avif') return mbHeifExif(file);
  return null;
}

/* ── ISO-BMFF, which both HEIC and MP4 are made of ──────────
   A box is a length, four letters and either bytes or more
   boxes. Everything below walks that, and nothing else. */
function mbBoxes(b, start, end, cb) {
  let p = start;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let guard = 0;
  while (p + 8 <= end && guard++ < 4096) {
    let size = mbU32(b, p);
    const type = mbAscii(b, p + 4, 4);
    let head = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = Number(dv.getBigUint64(p + 8));
      head = 16;
    } else if (size === 0) size = end - p;
    if (size < head || p + size > end) break;
    if (cb(type, p + head, p + size) === false) return;
    p += size;
  }
}

// The top level, read box header by box header — an "mdat" may be
// gigabytes and is never touched, only stepped over.
async function mbTopBox(file, want) {
  let p = 0;
  for (let i = 0; i < 64 && p + 8 <= file.size; i++) {
    const h = await mbBytes(file, p, 16);
    if (h.length < 8) return null;
    let size = mbU32(h, 0);
    const type = mbAscii(h, 4, 4);
    if (size === 1) {
      if (h.length < 16) return null;
      size = Number(new DataView(h.buffer, h.byteOffset, h.byteLength).getBigUint64(8));
    } else if (size === 0) size = file.size - p;
    if (size < 8) return null;
    if (type === want) return { start: p, size: Math.min(size, file.size - p) };
    p += size;
  }
  return null;
}

/* HEIC/AVIF: the EXIF is an item in "meta". "iinf" says which item id
   is the Exif one, "iloc" says where in the file it lies. */
async function mbHeifExif(file) {
  const meta = await mbTopBox(file, 'meta');
  if (!meta) return null;
  const b = await mbBytes(file, meta.start, Math.min(meta.size, 1024 * 1024));
  let exifId = -1, loc = null;
  // "meta" is a full box: four bytes of version and flags before its children.
  mbBoxes(b, 12, b.length, (type, s, e) => {
    if (type === 'iinf') {
      const ver = b[s];
      let p = s + 4 + (ver === 0 ? 2 : 4);
      mbBoxes(b, p, e, (t2, s2, e2) => {
        if (t2 !== 'infe') return;
        const v2 = b[s2];
        if (v2 < 2) return;
        const idLen = v2 === 2 ? 2 : 4;
        const idAt = s2 + 4;
        const typeAt = idAt + idLen + 2;
        if (mbAscii(b, typeAt, 4) === 'Exif') {
          exifId = idLen === 2 ? mbU16(b, idAt) : mbU32(b, idAt);
        }
      });
    } else if (type === 'iloc') {
      loc = { s: s, e: e };
    }
  });
  if (exifId < 0 || !loc) return null;

  const ver = b[loc.s];
  let p = loc.s + 4;
  const offSize = b[p] >> 4, lenSize = b[p] & 15;
  const baseSize = b[p + 1] >> 4, idxSize = b[p + 1] & 15;
  p += 2;
  const count = ver < 2 ? mbU16(b, p) : mbU32(b, p);
  p += ver < 2 ? 2 : 4;
  const num = (at, n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 256 + b[at + i];
    return v;
  };
  for (let i = 0; i < count && p < loc.e; i++) {
    const idLen = ver < 2 ? 2 : 4;
    const id = num(p, idLen);
    p += idLen;
    if (ver === 1 || ver === 2) p += 2;                 // construction_method
    p += 2;                                             // data_reference_index
    const baseOff = num(p, baseSize); p += baseSize;
    const extents = mbU16(b, p); p += 2;
    for (let k = 0; k < extents; k++) {
      p += idxSize * ((ver === 1 || ver === 2) ? 1 : 0);
      const off = num(p, offSize); p += offSize;
      const len = num(p, lenSize); p += lenSize;
      if (id === exifId && len > 8 && len < 1024 * 1024) {
        const item = await mbBytes(file, baseOff + off, Math.min(len, MB_HEAD));
        // The item opens with a 4-byte offset to its own TIFF header, past
        // an "Exif\0\0" of that length. A writer that left it out is read
        // by looking for the same marker instead.
        const n = mbU32(item, 0);
        const at = n < 64 && n + 12 <= item.length ? 4 + n
                 : (mbAscii(item, 0, 4) === 'Exif' ? 6 : 0);
        return mbReadTiff(item, at);
      }
    }
  }
  return null;
}

/* MP4/MOV: "moov" carries the header. "©day" is the one field that was
   written with a time zone in it, so it wins; "mvhd" counts seconds from
   1904 in UTC and is the fallback. The place is "©xyz" (ISO 6709) or
   the older "loci". */
const MB_QT_EPOCH = 2082844800;      // 1904-01-01 → 1970-01-01, in seconds
const MB_BMFF_BOXES = new Set(['moov', 'trak', 'udta', 'ilst', 'mdia', 'minf']);

async function mbVideoMeta(file) {
  const moov = await mbTopBox(file, 'moov');
  if (!moov) return null;
  const b = await mbBytes(file, moov.start, Math.min(moov.size, 6 * 1024 * 1024));
  const out = { stamp: null, lat: null, lon: null };
  let mvhd = null;

  function walk(s, e, depth) {
    if (depth > 6) return;
    mbBoxes(b, s, e, (type, cs, ce) => {
      if (MB_BMFF_BOXES.has(type)) walk(cs, ce, depth + 1);
      else if (type === 'meta') walk(cs + 4, ce, depth + 1);      // a full box
      else if (type === 'mvhd' && mvhd == null) {
        const ver = b[cs];
        const at = cs + 4;
        const secs = ver === 1
          ? Number(new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(at))
          : mbU32(b, at);
        if (secs > MB_QT_EPOCH) mvhd = mbStampFromDate(new Date((secs - MB_QT_EPOCH) * 1000));
      } else if (type === '\u00a9day' || type === 'date') {
        const st = mbTextStamp(mbQtText(b, cs, ce));
        if (st) out.stamp = st;
      } else if (type === '\u00a9xyz' || type === 'xyz ') {
        const g = mbIso6709(mbQtText(b, cs, ce));
        if (g) { out.lat = g.lat; out.lon = g.lon; }
      } else if (type === 'loci' && out.lat == null) {
        // version/flags, language, a name, then longitude and latitude as 16.16
        let p = cs + 4 + 2;
        while (p < ce && b[p]) p++;
        p++;
        if (p + 8 <= ce) {
          const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
          const lon = dv.getInt32(p, false) / 65536, lat = dv.getInt32(p + 4, false) / 65536;
          if (mbGeoOk(lat, lon)) { out.lat = lat; out.lon = lon; }
        }
      }
    });
  }
  walk(mbU32(b, 0) === 1 ? 16 : 8, b.length, 0);
  if (!out.stamp) out.stamp = mvhd;
  return out;
}

// A QuickTime text atom, in either of the two shapes it comes in: the
// iTunes one (a "data" child) and the plain one (a length and a language).
function mbQtText(b, s, e) {
  if (e - s >= 16 && mbAscii(b, s + 4, 4) === 'data') return mbUtf8(b, s + 16, e);
  if (e - s >= 4) {
    const n = mbU16(b, s);
    if (n > 0 && s + 4 + n <= e) return mbUtf8(b, s + 4, s + 4 + n);
  }
  return mbUtf8(b, s, e);
}
// "+44.4268+026.1025/" — ISO 6709, which is how a phone writes a place
// into a film.
function mbIso6709(s) {
  const m = typeof s === 'string' && s.match(/([+-]\d{1,3}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  return mbGeoOk(lat, lon) ? { lat: lat, lon: lon } : null;
}

/* ── The file name, read for the two things it may hold ─────
   A date, when the metadata has none, and the name — which is
   the rule the whole option rests on: whatever is left once
   every run that reads as a date or a clock is taken out. */
const MB_NOISE = /^(img|image|imagine|imagini|poza|poze|photo|photos|foto|pic|pics|picture|vid|video|film|filmare|mov|movie|clip|dsc|dscn|dscf|dji|gopr|gp|pxl|mvimg|pano|burst|screenshot|screen|scr|capture|cap|wa|whatsapp|signal|telegram|fb|snapchat|copy|copie|final|edit|edited|new|nou|untitled|fara-titlu)$/i;

// Every span in the name that is a date or a clock, and the stamp the
// first of them reads as. The spans are what the name loses.
function mbNameRead(base) {
  const spans = [];
  let stamp = null;
  // The lead character is only there to keep the match off the middle of a
  // longer run of digits — it is not part of the date, so it is not cut out.
  const push = m => {
    const lead = m[0].match(/^\D*/)[0].length;
    spans.push([m.index + lead, m.index + m[0].length]);
  };
  // 2024-07-12, 20240712, either of them followed by a clock
  let m = base.match(/(?:^|\D)((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[ _tT.-]{0,2}([01]\d|2[0-3])[-_.:]?([0-5]\d)(?:[-_.:]?[0-5]\d)?)?/);
  if (m) {
    stamp = mbStamp(+m[1], +m[2], +m[3], m[4] == null ? null : +m[4], m[5] == null ? null : +m[5]);
    push(m);
  }
  // 12.07.2024 — how a date gets typed by hand here
  if (!stamp) {
    m = base.match(/(?:^|\D)(0?[1-9]|[12]\d|3[01])[.\-_](0?[1-9]|1[0-2])[.\-_]((?:19|20)\d{2})/);
    if (m) { stamp = mbStamp(+m[3], +m[2], +m[1], null, null); push(m); }
  }
  // A three-part clock standing on its own is a clock and nothing else.
  const re = /(?:^|\D)([01]\d|2[0-3])[-_.]([0-5]\d)[-_.]([0-5]\d)(?!\d)/g;
  let c;
  while ((c = re.exec(base))) push(c);
  return { stamp: stamp, spans: spans };
}

// The name a person gave the picture: the file name minus its extension,
// minus every date and clock run, minus the words a camera puts there
// itself, and minus a counter at either end. What is left is the name;
// when nothing is left, there was never a name to find.
function mbNameOf(fileName, spans) {
  let s = fileName.replace(/\.[^.]*$/, '');
  spans.slice().sort((a, b) => b[0] - a[0]).forEach(sp => { s = s.slice(0, sp[0]) + ' ' + s.slice(sp[1]); });
  s = s.replace(/\((\d{1,4})\)/g, ' ');                  // "(1)", a copy
  let toks = s.split(/[\s_.+\-–—~()\[\]{}]+/).filter(Boolean);
  toks = toks.filter(tk => !MB_NOISE.test(tk) && !/^wa\d+$/i.test(tk) && !/^\d{4,}$/.test(tk));
  // A run of digits at either end counts things, it does not name them —
  // but "Casa 12" keeps its 12, which is why three digits is the floor.
  while (toks.length && /^\d{3,}$/.test(toks[0])) toks.shift();
  while (toks.length && /^\d{3,}$/.test(toks[toks.length - 1])) toks.pop();
  const name = toks.join(' ').trim();
  return /[^\d\s]/.test(name) ? name : '';
}

/* ── Reading one file ───────────────────────────────────────
   Three sources, in this order: what the camera wrote into the
   file, what the file name says, and — last, and marked as such
   — the date the file system carries. */
async function mbRead(entry) {
  const kind = mbKindOf(entry.name);
  const rec = {
    path: entry.path, name: entry.name, kind: kind, on: true,
    stamp: null, stampSrc: '', lat: null, lon: null, title: '', size: 0, error: ''
  };
  const fromName = mbNameRead(entry.name.replace(/\.[^.]*$/, ''));
  rec.title = mbNameOf(entry.name, fromName.spans);
  let file = null;
  try { file = await entry.getFile(); } catch (e) { rec.error = 'open'; return rec; }
  rec.size = file.size;
  try {
    const meta = kind === 'vid' ? await mbVideoMeta(file) : await mbExifOf(file, mbExt(entry.name));
    if (meta) {
      if (meta.stamp) { rec.stamp = meta.stamp; rec.stampSrc = 'meta'; }
      if (meta.lat != null) { rec.lat = meta.lat; rec.lon = meta.lon; }
    }
  } catch (e) { rec.error = 'meta'; }
  if (!rec.stamp && fromName.stamp) { rec.stamp = fromName.stamp; rec.stampSrc = 'name'; }
  if (!rec.stamp && file.lastModified) {
    rec.stamp = mbStampFromDate(new Date(file.lastModified));
    rec.stampSrc = 'file';
  }
  return rec;
}

/* ── The folder ─────────────────────────────────────────────
   A desktop browser opens one through showDirectoryPicker; a
   phone has none, so there the same job is done by an
   <input webkitdirectory>, which hands over the tree in one go. */
async function mbWalk(dir, prefix, out) {
  const kids = [];
  for await (const pair of dir.entries()) kids.push(pair);
  kids.sort((a, b) => a[0].localeCompare(b[0]));
  for (const pair of kids) {
    const name = pair[0], handle = pair[1];
    if (name.startsWith('.')) continue;
    const path = prefix ? prefix + '/' + name : name;
    if (handle.kind === 'directory') await mbWalk(handle, path, out);
    else if (mbKindOf(name) && out.length < MB_MAX_FILES) {
      out.push({ name: name, path: path, getFile: () => handle.getFile() });
    }
  }
  return out;
}

async function mbPickFolder() {
  if (mbBusy) return;
  if (!window.showDirectoryPicker) { document.getElementById('mb-file-input').click(); return; }
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'scula-media', mode: 'read' }); }
  catch (e) { if (e.name !== 'AbortError') console.error(e); return; }
  mbFolderName = dir.name;
  let entries = [];
  try { entries = await mbWalk(dir, '', []); }
  catch (e) { console.error(e); }
  await mbScan(entries);
}

// The phone route: one <input webkitdirectory>, whose files already carry
// the path they had in the folder.
function mbFromInput(fileList) {
  const files = Array.from(fileList || []).filter(f => mbKindOf(f.name));
  const first = files[0] && (files[0].webkitRelativePath || '');
  mbFolderName = first ? first.split('/')[0] : '';
  const entries = files.slice(0, MB_MAX_FILES).map(f => ({
    name: f.name,
    path: (f.webkitRelativePath || f.name).replace(/^[^/]*\//, ''),
    getFile: () => Promise.resolve(f)
  }));
  entries.sort((a, b) => a.path.localeCompare(b.path));
  mbScan(entries);
}

async function mbScan(entries) {
  mbBusy = true;
  mbRows = [];
  mbPaintWhere();
  const note = document.getElementById('mb-note');
  for (let i = 0; i < entries.length; i++) {
    let rec;
    try { rec = await mbRead(entries[i]); }
    catch (e) { rec = { path: entries[i].path, name: entries[i].name, kind: mbKindOf(entries[i].name), on: true, stamp: null, stampSrc: '', lat: null, lon: null, title: '', size: 0, error: 'read' }; }
    mbRows.push(rec);
    if (i % 12 === 0) {
      if (note) note.textContent = t('mbScanning', [i + 1, entries.length]);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  // Oldest first is how a folder of holiday photos wants to be read;
  // anything the three sources could not date goes to the end.
  mbRows.sort((a, b) => (a.stamp ? a.stamp.ts : Infinity) - (b.stamp ? b.stamp.ts : Infinity));
  mbBusy = false;
  mbRender();
}

/* ── What is on screen ──────────────────────────────────── */
function mbOpts() {
  const on = id => { const el = document.getElementById(id); return !!el && el.checked; };
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  return {
    format: val('mb-format') || 'list',
    kind: val('mb-kind') || 'all',
    q: (val('mb-q') || '').trim().toLowerCase(),
    name: on('mb-opt-name'), geo: on('mb-opt-geo'), link: on('mb-opt-link'),
    day: on('mb-opt-day'), onlyMeta: on('mb-opt-meta')
  };
}
function mbVisible() {
  const o = mbOpts();
  return mbRows.filter(r => {
    if (o.kind !== 'all' && r.kind !== o.kind) return false;
    if (o.onlyMeta && r.stampSrc !== 'meta' && r.lat == null) return false;
    if (o.q && (r.path + ' ' + r.title).toLowerCase().indexOf(o.q) < 0) return false;
    return true;
  });
}
function mbCoords(r) {
  return r.lat.toFixed(5).replace(/0+$/, '').replace(/\.$/, '') + ', ' +
         r.lon.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
}
function mbWhen(r) {
  if (!r.stamp) return '';
  return r.stamp.iso + (r.stamp.time ? ' ' + r.stamp.time : '');
}

function mbPaintWhere() {
  const el = document.getElementById('mb-where');
  if (el) el.textContent = mbFolderName ? '📂 ' + mbFolderName : '';
}

function mbRender() {
  const table = document.getElementById('mb-table');
  const empty = document.getElementById('mb-empty');
  if (!table) return;
  mbPaintWhere();
  const rows = mbVisible();
  const cols = ['', 'mbColFile', 'mbColWhen', 'mbColSrc', 'mbColWhere', 'mbColName'];
  let html = '<thead><tr>';
  cols.forEach(k => {
    const cls = k === 'mbColSrc' ? ' class="mb-col-src"' : '';
    html += '<th' + cls + '>' + (k ? mbEsc(t(k)) : '<span aria-hidden="true">☑</span>') + '</th>';
  });
  html += '</tr></thead><tbody>';
  rows.forEach(r => {
    const i = mbRows.indexOf(r);
    html += '<tr class="mb-row' + (r.on ? '' : ' mb-off') + '" data-row="' + i + '">' +
      '<td><input type="checkbox" class="mb-pick"' + (r.on ? ' checked' : '') + ' aria-label="' + mbEsc(r.name) + '"></td>' +
      '<td><span aria-hidden="true">' + (r.kind === 'vid' ? '🎬' : '📷') + '</span> ' + mbEsc(r.name) +
        '<div class="mb-path">' + mbEsc(r.path) + '</div></td>' +
      '<td class="mb-num">' + (mbWhen(r) || '<span class="mb-miss">' + mbEsc(t('mbNoDate')) + '</span>') + '</td>' +
      '<td class="mb-src mb-col-src' + (r.stampSrc === 'meta' ? ' mb-src-meta' : '') + '">' +
        mbEsc(r.stampSrc ? t('mbSrc_' + r.stampSrc) : '') + '</td>' +
      '<td class="mb-num">' + (r.lat != null ? mbEsc(mbCoords(r)) : '<span class="mb-miss">' + mbEsc(t('mbNoGeo')) + '</span>') + '</td>' +
      '<td>' + (r.title ? mbEsc(r.title) : '<span class="mb-miss">—</span>') + '</td>' +
      '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
  const withGeo = rows.filter(r => r.lat != null).length;
  const withMeta = rows.filter(r => r.stampSrc === 'meta').length;
  document.getElementById('mb-count').textContent = mbRows.length ? t('mbCount', [rows.length, mbRows.length]) : '';
  document.getElementById('mb-note').textContent = mbRows.length ? t('mbBreak', [withMeta, withGeo]) : '';
  empty.classList.toggle('on', !rows.length);
  empty.textContent = mbRows.length ? t('mbNoMatch') : t('mbNoFolder');
}

function mbEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ── Out into the chapter ───────────────────────────────────
   Three shapes, all of them written in markers this page
   already reads: "@date" (§ L), "^@place" (§ S), the timeline
   (§ R). The place always ends the line — its address runs to
   the end of the line, so nothing may follow it. */
function mbLines() {
  const o = mbOpts();
  const rows = mbVisible().filter(r => r.on);
  if (!rows.length) return '';
  const label = r => (o.name && r.title) ? r.title : r.name;
  const link = r => o.link ? '[' + label(r) + '](' + encodeURI(r.path) + ')' : '';
  const place = r => (o.geo && r.lat != null) ? ' ^@' + mbCoords(r) : '';

  if (o.format === 'table') {
    const head = ['mbColWhen', 'mbColName', 'mbColWhere', 'mbColFile'].map(k => t(k));
    const out = ['| ' + head.join(' | ') + ' |', '|---|---|---|---|'];
    rows.forEach(r => {
      // No "^@" in a table: a place runs to the end of its line and would
      // swallow the rest of the row.
      out.push('| ' + [mbWhen(r) || '—',
        (o.name && r.title) ? r.title : '—',
        (o.geo && r.lat != null) ? mbCoords(r) : '—',
        o.link ? link(r) : r.path].join(' | ') + ' |');
    });
    return out.join('\n') + '\n';
  }

  if (o.format === 'timeline') {
    const dated = rows.filter(r => r.stamp), undated = rows.filter(r => !r.stamp);
    const out = [];
    dated.forEach(r => {
      // The timeline's own "!" is the "!" of an image: "- ![name](file.jpg)"
      // is the picture, the same shape over a film is a link, and the
      // extension is what decides (§ R). A row carrying a place ends in it,
      // so that row is read as a link whatever it points at.
      out.push('#' + r.stamp.iso + ' - !' + (o.link ? link(r) : label(r)) + place(r));
    });
    undated.forEach(r => out.push('- ' + (o.link ? link(r) : label(r)) + place(r)));
    return out.join('\n') + '\n';
  }

  const out = [];
  let day = '';
  rows.forEach(r => {
    if (o.day) {
      const d = r.stamp ? r.stamp.iso : '';
      if (d !== day) { day = d; out.push('', '### ' + (d || t('mbNoDate')), ''); }
    }
    const bits = [];
    if (r.stamp) bits.push('@' + r.stamp.iso + (r.stamp.time ? ' ' + r.stamp.time : ''));
    if (o.name && r.title) bits.push('**' + r.title + '**');
    if (o.link) bits.push(link(r)); else if (!o.name || !r.title) bits.push(r.name);
    out.push('- ' + bits.join(' — ') + place(r));
  });
  return out.join('\n').replace(/^\n+/, '') + '\n';
}

function mbInsert() {
  const md = mbLines();
  if (!md) { ScuLaFolder.toast(t('mbNothing')); return; }
  closeMedia();
  const at = editor.selectionStart;
  const before = editor.value.slice(0, at);
  insertAtCursor((before && !/\n$/.test(before) ? '\n' : '') + md);
  scheduleAutosave();
  ScuLaFolder.toast(t('mbInserted', mbVisible().filter(r => r.on).length));
}

function mbCsv() {
  const rows = mbVisible();
  if (!rows.length) { ScuLaFolder.toast(t('mbNothing')); return; }
  const cell = v => /[";\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const head = [t('mbColFile'), 'kind', t('mbColWhen'), t('mbColSrc'), 'lat', 'lon', t('mbColName')];
  const lines = [head.map(cell).join(';')];
  rows.forEach(r => lines.push([
    r.path, r.kind, mbWhen(r), r.stampSrc ? t('mbSrc_' + r.stampSrc) : '',
    r.lat == null ? '' : String(r.lat).replace('.', ','),
    r.lon == null ? '' : String(r.lon).replace('.', ','),
    r.title
  ].map(cell).join(';')));
  saveOut('poze-' + (mbFolderName || 'folder').replace(/[^\w-]+/g, '-') + '.csv',
    new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
}

/* ── Opening, closing, wiring ───────────────────────────── */
function mbPaintSelects() {
  const fill = (id, keys) => {
    const el = document.getElementById(id);
    if (!el) return;
    const had = el.value;
    el.innerHTML = keys.map(k => '<option value="' + k[0] + '">' + mbEsc(t(k[1])) + '</option>').join('');
    if (had) el.value = had;
  };
  fill('mb-format', [['list', 'mbFmtList'], ['timeline', 'mbFmtTimeline'], ['table', 'mbFmtTable']]);
  fill('mb-kind', [['all', 'mbKindAll'], ['img', 'mbKindImg'], ['vid', 'mbKindVid']]);
}

function mbBind() {
  ['mb-format', 'mb-kind', 'mb-opt-name', 'mb-opt-geo', 'mb-opt-link', 'mb-opt-day', 'mb-opt-meta']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', mbRender);
    });
  let qTimer = 0;
  const q = document.getElementById('mb-q');
  if (q) q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(mbRender, 200); });
  const input = document.getElementById('mb-file-input');
  if (input) input.addEventListener('change', e => { mbFromInput(e.target.files); e.target.value = ''; });
  const table = document.getElementById('mb-table');
  if (table) table.addEventListener('change', e => {
    const box = e.target.closest('.mb-pick');
    if (!box) return;
    const tr = box.closest('tr');
    const rec = mbRows[+tr.dataset.row];
    if (rec) { rec.on = box.checked; tr.classList.toggle('mb-off', !rec.on); }
  });
}

function openMedia() {
  const view = document.getElementById('media-view');
  if (!view) return;
  mbOpen = true;
  view.classList.add('open');
  if (!view.dataset.bound) { mbPaintSelects(); mbBind(); view.dataset.bound = '1'; }
  mbRender();
}
function closeMedia() {
  const view = document.getElementById('media-view');
  if (view) view.classList.remove('open');
  mbOpen = false;
}
function toggleMedia() { if (mbOpen) closeMedia(); else openMedia(); }
// Every label in the table is generated, so data-i cannot reach it.
function mbRepaintLang() { if (!mbReady) return; mbPaintSelects(); if (mbOpen) mbRender(); }
mbReady = true;

