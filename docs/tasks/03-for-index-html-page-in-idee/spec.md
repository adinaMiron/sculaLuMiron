# task-03 — Chapter picker in the 💡 Quick idea box (`index.html`)

## 0. What we build (read first)

The Quick idea box (💡 button / **Ctrl+Alt+I**, `#idea-modal`) gains a
**chapter picker**: a search input above the textarea that lists chapters
whose **titles** match what is typed. The box opens pre-filled with the
chapter currently open in the editor; an **×** button clears it. The idea is
appended at the end of the target chapter, on the line right after its last
non-blank text.

Existing behaviour (read `docs/FEATURES.md` § J before starting):
`ideaSplit()` reads a leading `Name:` on the first line; `ideaFindChapter()`
resolves it; nothing found → the `Idei` workbook, chapter named
`ideaToday()`; `ideaAppendTo()` does the two writes and moves `editor.value`
when the target is the open chapter. **All of that stays.** The picker adds
one more input to the routing decision.

### Product decisions (agreed with the product owner, binding)

1. **Search matches chapter titles only.** It does not match workbook names,
   file names or chapter contents.
2. **No match → a "No chapter found" row.** No "create chapter" option anywhere.
3. **Opens pre-filled with the open chapter** (`wbCurrentId`). If no chapter
   is open (a loose file, `wbCurrentId === null`), the picker opens empty.
   It never remembers the chapter picked last time.
4. **× button** clears the picker to an empty search input and focuses it.
5. **Routing precedence** (highest first):
   - **A. Actively chosen chapter** (clicked in the list, or picked with
     Enter from the list) → **always wins**. The text is written **verbatim**:
     a leading `Name:` is **not** stripped or reinterpreted.
   - **B. Typed search words, no click**. If they match **exactly one**
     chapter, that chapter is used exactly as in A (wins, verbatim). *(Lead's
     decision: typing words that point at a single chapter is an explicit
     choice, so it gets A's treatment.)* If they match **none or several**,
     the words are **ignored** and routing continues with D.
   - **C. Pre-filled open chapter (soft default)**, still unchanged by the
     user. If the text starts with a `Name:` prefix that **resolves to a
     chapter** (`ideaFindChapter(name)` non-null), the **named chapter wins**
     and the prefix is stripped (today's behaviour). Otherwise the idea goes
     to the open chapter and the text is kept **whole**, including an
     unmatched `Foo:`.
   - **D. Nothing picked** (empty picker, or B ignored) → **today's routing,
     unchanged**: matching `Name:` → that chapter, prefix stripped; else
     `Idei` / today's chapter (created if missing), text kept whole.
6. **The hint (`#idea-hint`) always says where the idea will go**, including
   in cases B-ignored (it says the search words are ignored and why).
7. **Append format:** trim trailing whitespace (blank lines and spaces) off
   the end of the chapter, then add **exactly one** `\n`, then the idea, then a
   final `\n`. This is what `ideaAppendTo()` already does
   (`before.replace(/\s+$/, '') + '\n' + line + '\n'`). **Do not change
   `ideaAppendTo()`'s text logic.** An empty chapter becomes `line + '\n'`.
8. **Both languages**: every new string is an i18n key in both `en` and `ro`
   in `js/markdown/i18n.js`. Romanian diacritics must be preserved.

"Verbatim" means the `text` field `ideaSplit()` already returns: CRLF → LF,
outer whitespace trimmed, nothing else touched.

### State of the branch at planning time (re-plan, 2026-09-28)

HEAD (`61cf6fc`, "index: chapter picker in the Quick idea box") already
contains a first implementation of this spec, described in
`implementation-report.md` beside this file. The lead read that diff: it
follows §§ 2–6 closely (`ideaPick`, `ideaChapterMatches`,
`ideaSearchResolve`, `ideaResolve`, the `#idea-chapter` key handler, the six
i18n keys). **The implementer's job is therefore to verify, not rewrite**:

1. Walk every "Done means" item (§ 8) and every manual step (§ 9) against the
   code in HEAD, in a real browser (`/apptest idea` plus a hand-driven pass).
2. Fix any deviation from this spec in place with narrow edits. Do not
   restructure working code for taste.
3. Run `node tests/idea.js` (the first implementer never ran it) and
   `node tests/verify.js`; put both outputs in the implementation report.
4. Overwrite `implementation-report.md` with what was checked, what was
   fixed, and the test output.

Out of scope (decided): switching the UI language while the box is open does
not repaint an already-open result list or the hint until the next keystroke.
The hint already behaved this way before this task; leave it.

---

## 1. Files

| File | Change |
|---|---|
| `index.html` | Markup inside `#idea-modal` (~L3895) and CSS next to `#idea-text` (~L649). Update the comment above `#idea-modal`. |
| `js/markdown/idea.js` | Picker state, search, rendering, the single routing resolver, hint and save rewired to it, `openIdeaModal()` pre-fill. |
| `js/markdown/events.js` | Keydown handler for `#idea-chapter` (next to the `#idea-text` one, ~L30). |
| `js/markdown/i18n.js` | New keys in `ro` and `en`; update both help paragraphs ("Idee rapidă", "Quick idea capture"). |
| `tests/idea.js` | Existing suite: adapt the cases broken by the new soft default (see § 7). |
| `docs/FEATURES.md` § J, `docs/MAP.md` (Quick idea capture row) | Document the picker and the routing order; list the new functions. |

No other product file changes. **The shared nav block must not be touched.**
No new dependencies, no build step (Rule 3). The Tester's Playwright suite
under `tests/03-for-index-html-page-in-idee/` and the tooling it needs
(`package.json` with a `test` script, `playwright.config.*`, `.gitignore`
entries) are standing team policy and explicitly allowed.

---

## 2. Markup (`index.html`, inside `#idea-modal .modal-box`)

Insert a new `.field` **between** `.modal-title` and the existing
`.field` that holds `#idea-text`:

```html
<div class="field">
  <label for="idea-chapter" data-i="lblIdeaChapter">Chapter</label>
  <div class="idea-chapter-row">
    <input type="text" id="idea-chapter" autocomplete="off" spellcheck="false"
           oninput="ideaChapterInput()"
           data-i-placeholder="ideaChapterPlaceholder" placeholder="Search chapters…">
    <button type="button" class="btn" id="idea-chapter-clear" onclick="ideaChapterClear()"
            data-i-title="ideaChapterClearTip" title="Clear the chapter and search again">×</button>
  </div>
  <div id="idea-chapter-list" role="listbox"></div>
</div>
```

Keep everything else in the modal as it is (textarea, `#idea-hint`, the three
buttons). Update the HTML comment above `#idea-modal` to mention the picker.

## 3. CSS (`index.html`, directly after the `#idea-text` rule)

Theme tokens only, no new hex:

- `.idea-chapter-row { display:flex; gap:6px; align-items:stretch; }`
  `.idea-chapter-row input { flex:1; min-width:0; }`
  `#idea-chapter-clear { flex-shrink:0; padding:0 10px; font-size:15px; line-height:1; }`
- `#idea-chapter.picked { border-color: var(--accent); }` — visual cue that a
  chapter (not a search) is in the input.
- `#idea-chapter-list` copies `#wiki-picker`'s look (`background: var(--bg)`,
  `1px solid var(--border)`, radius 8px, padding 4px, `overflow-y:auto`),
  with `max-height:180px; margin-top:6px; display:none;` and
  `#idea-chapter-list.open { display:block; }`.
- Rows reuse the existing `.ws-item` / `.ws-name` / `.ws-where` / `.ws-empty`
  classes. Do not add new row classes.
- Inside the existing `(pointer:coarse)` / small-screen rules nothing is
  required; the `.btn` touch rules already apply to the × button.

## 4. Behaviour (`js/markdown/idea.js`)

### 4.1 State

```js
// { id, how } — how is 'open' (pre-filled soft default) or 'picked'
// (clicked / Enter). null = the input holds a search, or nothing.
let ideaPick = null;
```

### 4.2 Search — `ideaChapterMatches(q)`

- `q` folded with the existing `ideaFold()` (case + diacritics) and trimmed.
  Empty → `[]`.
- Candidates: `wbChapters` whose **`ideaFold(title)` contains** the folded
  query. Title only (decision 1).
- Order: exact folded title match first, then titles that start with the
  query, then the rest; inside a group keep workbook order (`wbBooks` order)
  then chapter order (the order `wbChaptersOf(bookId)` returns).
- Return the full array (cap only the *rendering* at 50 rows).

**"Matches exactly one chapter"** (decision 5B), `ideaSearchResolve(q)`:
- if exactly one chapter's folded title **equals** the folded query → it;
- else if the match list has length 1 → that one;
- else → null, and report `n = list.length` (0 or ≥2) for the hint.

Example: chapters "Editor" and "Editor vechi"; `editor` → Editor (exact);
`edit` → none (2 matches); `vechi` → Editor vechi. Two chapters both titled
"Notes" in different workbooks; `notes` → none (2 exact matches → ambiguous).

### 4.3 Rendering — `ideaRenderChapterList()`

- The list `#idea-chapter-list` has class `open` **only when** `ideaPick` is
  null **and** the trimmed input is non-empty. Otherwise it is closed and empty.
- Each match → `div.ws-item` with `span.ws-name` = chapter title and
  `span.ws-where` = its workbook name, `data-id` = chapter id,
  `role="option"`. Build with `textContent` (never `innerHTML` with titles).
- The keyboard-highlighted row carries `.sel`. Highlight index resets to 0 on
  every input change (so the first row is highlighted).
- No matches → one `div.ws-empty` with `t('ideaNoChapter')`
  ("No chapter found" / "Niciun capitol găsit"). Nothing else, no create row.
- Row `click` → `ideaChapterPick(id)`. Use `mousedown` + `preventDefault()`
  to avoid a blur flicker, or plain `click`; either is fine as long as one click picks.

### 4.4 Actions

- `ideaChapterPick(id)`: `ideaPick = { id, how:'picked' }`; input value =
  chapter title; input gets class `picked`; close the list; focus
  `#idea-text`; `ideaPaintHint()`.
- `ideaChapterInput()` (the input's `oninput`): `ideaPick = null`; remove
  class `picked`; reset highlight; `ideaRenderChapterList()`;
  `ideaPaintHint()`. **Any edit of the input text drops the pre-fill or pick**,
  so what remains is a search (rule B).
- `ideaChapterClear()` (×): `ideaPick = null`; input value `''`; remove
  `picked`; close the list; focus `#idea-chapter`; `ideaPaintHint()`.
- `openIdeaModal()`: before opening, reset the picker: if `wbCurrentId` and
  `wbChapter(wbCurrentId)` exist → `ideaPick = { id: wbCurrentId, how:'open' }`,
  input value = its title, class `picked`; else `ideaPick = null`, input `''`,
  no class. List closed. Then `ideaPaintHint()`. Focus stays on
  `#idea-text` as today (the existing test checks this). The textarea
  content is **not** cleared on open (unchanged).

### 4.5 One resolver for hint and save — `ideaResolve()`

Both `ideaPaintHint()` and `saveIdea()` must call the same function, so the
hint can never disagree with where the idea lands. It returns:

```js
{ chapter,   // target chapter object, or null → Idei/today fallback
  line,      // the text to append
  via,       // 'picked' | 'search' | 'prefix' | 'open' | 'fallback'
  name,      // the ideaSplit name ('' if none)
  q, n,      // search words and match count when they were ignored (else '' / 0)
  body }     // ideaSplit body (empty → nothing to save)
```

Algorithm (`{ name, body, text } = ideaSplit(textarea.value)`):

1. `ideaPick?.how === 'picked'` and `wbChapter(ideaPick.id)` exists →
   `{ chapter, line: text, via:'picked' }`.
2. `ideaPick` null and input trimmed non-empty → `ideaSearchResolve(q)`.
   Found → `{ chapter, line: text, via:'search' }`. Not found → remember
   `q` and `n`, continue at 4.
3. `ideaPick?.how === 'open'` and the chapter exists:
   `named = ideaFindChapter(name)`; if `named` → `{ chapter: named, line: body,
   via:'prefix' }`; else `{ chapter: open, line: text, via:'open' }`.
4. Today's routing: `named = ideaFindChapter(name)`; if `named` →
   `{ chapter: named, line: body, via:'prefix' }`; else
   `{ chapter: null, line: text, via:'fallback' }`.

(A pick whose chapter no longer exists is treated as `ideaPick = null` with an
empty input — go to step 4.)

### 4.6 `ideaPaintHint()`

- Body empty **and** the result has a chapter from `picked`/`search`/`open`
  → `t('ideaHintTo', {book, chapter})` (the hint always names the target once one is known).
- Body empty otherwise → if `q` was ignored, the matching search hint below
  with the Idei/today target; else `t('ideaHintIdle')` (unchanged).
- Body non-empty:
  - chapter present, `q` empty → `t('ideaHintTo', …)`.
  - chapter present via `prefix` but `q` was ignored → search hint (below)
    naming that chapter.
  - chapter null → exactly the current fallback logic (`ideaHintFallback` if
    `name`, else `ideaHintTo`/`ideaHintNew` for Idei/today) **unless** `q`
    was ignored, in which case the search hint, naming `Idei / <today>`.
- Search hints (new): `n === 0` → `ideaHintSearchNone`, `n >= 2` →
  `ideaHintSearchMany`, both with `{ q, n, book, chapter }` of the real target.

### 4.7 `saveIdea()`

Use `ideaResolve()`. Empty body → unchanged (`ideaEmpty`, box stays open,
nothing written). `chapter` null → `ideaEnsureBook()` + `ideaEnsureChapter(book,
ideaToday())` as now. Then `ideaAppendTo(target, line)` (unchanged). On
success: clear the textarea, reset the picker (`ideaPick = null`, input `''`,
list closed), close the modal, toast as now.

## 5. Keyboard (`js/markdown/events.js`)

Add a `keydown` listener on `#idea-chapter`, mirroring the `#idea-text` one:

- `Escape` → `stopPropagation()`, `closeIdeaModal()`.
- `Ctrl/Cmd+Enter` → `preventDefault()`, `stopPropagation()`, `saveIdea()`.
- `ArrowDown` / `ArrowUp` (list open with rows) → `preventDefault()`, move
  `.sel` (clamped, no wrap), scroll it into view (`block:'nearest'`).
- `Enter` (no modifiers) with the list open and ≥1 row →
  `preventDefault()`, `ideaChapterPick(id of the .sel row)`. Enter with the list
  closed or showing "No chapter found" → `preventDefault()` only (no save, no pick).
- Any other Ctrl/Cmd/Alt combination → `stopPropagation()` (so Ctrl+S,
  Ctrl+I etc. don't hit the chapter behind the modal).

The existing `#idea-text` handler is unchanged.

## 6. i18n keys (`js/markdown/i18n.js`, both `ro` and `en`)

| key | en | ro |
|---|---|---|
| `lblIdeaChapter` | `Chapter` | `Capitol` |
| `ideaChapterPlaceholder` | `Search chapters…` | `Caută un capitol…` |
| `ideaChapterClearTip` | `Clear the chapter and search again` | `Golește capitolul și caută din nou` |
| `ideaNoChapter` | `No chapter found` | `Niciun capitol găsit` |
| `ideaHintSearchNone` | ``o=>`No chapter matches “${o.q}” — the idea goes to ${o.book} / ${o.chapter}` `` | ``o=>`Niciun capitol nu se potrivește cu „${o.q}” — ideea ajunge în ${o.book} / ${o.chapter}` `` |
| `ideaHintSearchMany` | ``o=>`“${o.q}” matches ${o.n} chapters — pick one; otherwise the idea goes to ${o.book} / ${o.chapter}` `` | ``o=>`„${o.q}” se potrivește cu ${o.n} capitole — alege unul; altfel ideea ajunge în ${o.book} / ${o.chapter}` `` |

Keep the existing `idea*` keys. Update the two help paragraphs:
- en: add a sentence — "The Chapter field starts on the chapter you are
  editing; type to search chapter titles and pick one, or press × to clear it.
  A chapter you pick always wins and the text goes in as written."
- ro: "Câmpul Capitol pornește cu capitolul deschis; scrie ca să cauți
  după titlu și alege unul, sau apasă × ca să-l golești. Capitolul ales are
  întotdeauna prioritate, iar textul intră exact cum l-ai scris."

The workbook name `Idei` stays untranslated (§ J).

## 7. The existing `tests/idea.js`

After `loadChapterIntoEditor(wbChapter('ch_fiz'))`, the soft default makes
the later "nothing matched → Idei" cases land in Fizică. Adapt the suite
**without weakening what it checks**: before each of those cases (the
`Grădinărit:` fallback, "a second unmatched idea", the empty idea, the
Ctrl+I case), click `#idea-chapter-clear` after opening the box. Keep every
existing check. Known issue #3 ("💡 button is right of New") stays failing:
do not "fix" it in this task. `node tests/idea.js` must otherwise pass.

## 8. Done means

- [ ] Box opens with `#idea-chapter` = open chapter's title (class `picked`),
      or empty when no chapter is open; caret in `#idea-text`.
- [ ] Typing in `#idea-chapter` lists title-only, case/diacritic-insensitive
      matches with the workbook name; `No chapter found` / `Niciun capitol găsit`
      when none; never a create option.
- [ ] Click or ArrowDown+Enter picks; × clears to an empty focused search.
- [ ] Routing follows § 4.5 exactly, and the hint follows § 4.6 for every case.
- [ ] Appending: `"# A\n\ntext\n\n\n  "` + idea `x` → `"# A\n\ntext\nx\n"`.
- [ ] Open chapter as target: `#editor` shows the new text, `wbDirty === false`.
- [ ] `ro` and `en` both render every new string; diacritics intact.
- [ ] `node tests/verify.js` passes (parse, nav sync, diacritics).
- [ ] `node tests/idea.js` passes apart from known issue #3.
- [ ] `docs/FEATURES.md` § J documents the picker and the routing order;
      `docs/MAP.md` row lists `ideaResolve` and `ideaChapterPick`.

## 9. Manual verification

Set up two workbooks: **Proiecte** (chapters `Editor`, `Editor vechi`,
`Rețete`) and **Școală** (`Fizică`, `Notes`), plus `Notes` in Proiecte too.

1. Open `Fizică`, press Ctrl+Alt+I → Chapter shows "Fizică", hint "Goes to
   Școală / Fizică". Type `ceva nou`, Ctrl+Enter → Fizică ends with
   `ceva nou` on the line right after its last text; the editor shows it.
2. Open again, type `Rețete: sare` → hint says Proiecte / Rețete; save →
   Rețete gets `sare` (prefix stripped). (Soft default overridden.)
3. Open again, type `Grădinărit: busuioc` → hint says Fizică; save → Fizică
   gets `Grădinărit: busuioc` whole.
4. Open, press × → empty focused search. Type `retete` → one row "Rețete ·
   Proiecte". Click it. Type `Editor: x` in the text → hint names Rețete;
   save → Rețete gets `Editor: x` verbatim.
5. Open, ×, type `edit` → two rows; don't click; text `hello` → hint says
   "“edit” matches 2 chapters — … Idei / <today>"; save → Idei/today.
6. ×, type `vechi`, text `y` (no click) → hint names Editor vechi; save →
   Editor vechi gets `y`.
7. ×, type `zzz` → "No chapter found"; hint "No chapter matches “zzz” …".
8. ×, type `notes` → two rows (one per workbook); ArrowDown, Enter picks the
   second; save goes to that workbook's Notes.
9. Put a chapter's text ending in three blank lines and trailing spaces;
   file an idea into it → exactly one line break before the idea.
10. Switch the UI to Română and repeat 1 and 7: label "Capitol", placeholder
    "Caută un capitol…", "Niciun capitol găsit".
11. Inside `#idea-chapter`, Ctrl+S and Ctrl+I do nothing to the chapter
    behind; Escape closes the box.
