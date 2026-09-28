# Task 02 — Dictation button reads "⏹ Oprește înregistrarea" while recording

## Goal

In `index.html` (the markdown editor), the dictation buttons currently say
"🎤 Dictare" / "🎤 Dictate" all the time, including while the microphone is on.
Only the red `.active` background changes. While the mic is on, the button must
say what pressing it will do: stop recording.

## Agreed product decisions (binding)

1. **Wording while recording**
   - Romanian label: `⏹ Oprește înregistrarea`. Keep the diacritic ș in "Oprește".
   - English label: `⏹ Stop recording`
   - Romanian tooltip (`title`): `Oprește dictarea`
   - English tooltip (`title`): `Stop dictation`
   - The ⏹ (U+23F9) replaces the 🎤.
2. **Both buttons.** The rule applies to the toolbar button `#btn-dictate` and to the
   💡 idea box's `#btn-idea-dictate` (Ctrl+Alt+I). Only the button that is actually
   recording changes. The other one stays as it is.
3. **Both engines.** The label is the same for the API engine (MediaRecorder,
   `S.engine !== "live"`) and for the browser live recognition engine
   (`S.engine === "live"`). For the user, both mean "the microphone is on".
4. **When the label reverts.** The label goes back to normal (`🎤 Dictare` /
   `🎤 Dictate`, tooltip `dictateTip`) **as soon as recording stops**. Recording
   can stop by:
   - a manual click on the button;
   - any `fail()` path, such as mic denied or a recorder error;
   - live-engine `onend` or `onerror`;
   - closing the idea box, where `closeIdeaModal` in `js/markdown/idea.js:143` calls
     `toggleIdeaDictation()`.

   This happens **even if API segments are still being transcribed** afterwards.
   The "Transcriu…" pill may stay up, but the button no longer says "stop".
5. **Built from i18n keys**, never hardcoded strings. The swap is driven from
   `setBtn(on)` in `js/markdown/dictation.js`.
6. **Language switch while recording.** If the UI language is toggled (the nav
   EN/RO button → `applyUILang()`) while recording, the button must show the
   recording label **in the new language**. It must not fall back to "Dictare".
7. **Keep the existing red `.active` styling** (`#btn-dictate.active` at
   `index.html:882`). Do not remove or restyle it.
8. **Narrow screens: icon only.** At viewport width **≤ 700px** (the toolbar's
   existing phone breakpoint, `@media (max-width: 700px)` at `index.html:1213`,
   where `.tb-btn` becomes a bigger tap target), the recording `#btn-dictate`
   shows **only "⏹"**. Its `title` and `aria-label` keep the full meaning.
   Above 700px, the full text is visible.
   - `#btn-idea-dictate` sits in the modal's action row, which has room at every
     width. It always shows the full text. **Decision:** icon-only applies only to
     `#btn-dictate`.

## Where the code is

| What | Where |
|---|---|
| `setBtn(on)` (the only place that toggles `.active`) | `js/markdown/dictation.js:106-110` |
| Callers of `setBtn` | `dictation.js` lines 112 (`fail`), 128 (`startApi`), 165 (`stopApi`), 248 / 265 / 268 / 273 (live engine) |
| i18n keys `dictateTip`, `dictateBtn` | `js/markdown/i18n.js:54` (ro), `:479` (en) |
| `applyUILang()`: rewrites every `[data-i]` textContent and every `[data-i-title]` / `[data-i-aria]` attribute | `js/markdown/i18n.js:886-893` |
| Toolbar button markup | `index.html:3645` |
| Idea box button markup | `index.html:3886` |
| `.active` CSS | `index.html:882` |
| Phone breakpoint | `index.html:1213` |

The line numbers may drift, so grep for the anchors.

**The trap:** `applyUILang()` sets `el.textContent = t(el.getAttribute("data-i"))`.
If `setBtn` only wrote `textContent`, a language switch during recording would
reset the label to "🎤 Dictare". The fix is to **swap the `data-i*` attributes**
and then paint from them. That way `applyUILang()` repaints the right key by itself,
with no extra hook.

## Implementation

### 1. New i18n keys (`js/markdown/i18n.js`)

Add these next to `dictateBtn` in **both** the `ro` and the `en` tables:

| Key | ro | en |
|---|---|---|
| `dictateStopBtn` | `⏹ Oprește înregistrarea` | `⏹ Stop recording` |
| `dictateStopTip` | `Oprește dictarea` | `Stop dictation` |
| `dictateStopAria` | `Oprește înregistrarea` | `Stop recording` |

`dictateStopAria` is the label without the icon, so screen readers do not read
"stop button" twice.

### 2. `setBtn(on)` in `js/markdown/dictation.js`

Replace the body with this logic. The exact code is up to you, but it must do
all of the following:

```js
function setBtn(on){
  const id = target === editor ? "btn-dictate" : "btn-idea-dictate";
  const b = document.getElementById(id);
  if(!b) return;
  b.classList.toggle("active", on);
  b.setAttribute("data-i", on ? "dictateStopBtn" : "dictateBtn");
  b.setAttribute("data-i-title", on ? "dictateStopTip" : "dictateTip");
  if(on) b.setAttribute("data-i-aria", "dictateStopAria");
  else { b.removeAttribute("data-i-aria"); b.removeAttribute("aria-label"); }
  b.textContent = t(b.getAttribute("data-i"));
  b.title = t(b.getAttribute("data-i-title"));
  if(on) b.setAttribute("aria-label", t("dictateStopAria"));
}
```

Requirements:
- When not recording, the button must end up **exactly as the markup had it**: the
  same `data-i`, the same `data-i-title`, and no `aria-label` or `data-i-aria`.
  That way nothing else (existing tests, `applyUILang`) sees a difference.
- `setBtn(false)` is called on paths where the button was never active (for
  example `fail()` before start). It must be idempotent and harmless there.
- `target` does not change between `setBtn(true)` and `setBtn(false)` for a
  session. `toggleDictation` only reassigns `target` when nothing is active.
  Do not change that.
- Do not touch the queue, pill or engine logic. `stopApi()` already calls
  `setBtn(false)` before the transcription queue drains. That is the behaviour we
  want, so keep it.

### 3. Narrow-screen icon-only (`index.html`, CSS only)

Add these rules inside the existing `@media (max-width: 700px)` block at
`index.html:1213`, not in a new breakpoint:

```css
#btn-dictate.active { font-size: 0; }
#btn-dictate.active::before { content: "⏹"; font-size: 13px; }
```

- Use 13px because it matches `.tb-btn` in that block, and `px` is fine in
  `index.html`. The `rem` rule applies only to `editor.html`.
- The `aria-label` from step 2 overrides the text content, including the
  `::before` content, for the accessible name. `title` gives the tooltip.
- The button must keep a real tap size, so do not zero its padding. The visible
  glyph is the one "⏹".
- Do not apply this to `#btn-idea-dictate` (decision 8).

### 4. Docs (same change)

- `docs/FEATURES.md`, around line 1388 (the idea-box dictation paragraph): add one
  sentence. While the mic is on, both dictation buttons read "⏹ Oprește
  înregistrarea" / "⏹ Stop recording" (tooltip "Oprește dictarea"). On
  phones (≤700px) the toolbar one shows just ⏹. `setBtn()` does this by
  swapping the button's `data-i*` keys, so a language switch mid-recording
  repaints correctly.
- No `docs/MAP.md` change is needed unless an anchor you use is off by more than
  a few lines. If it is, fix it.

## Scope limits (product code)

- Change only `js/markdown/dictation.js`, `js/markdown/i18n.js`, `index.html`
  (the CSS rules above only; no markup change is required) and `docs/FEATURES.md`.
- Do not touch the shared nav block (Rule 2), `voice.html`, or any other app.
- No new dependencies and no build step.
- **Tests are not restricted:** the Tester adds a Playwright suite under
  `tests/02-for-index-html-page-dicteaza-menu/` plus whatever tooling it needs
  (`package.json` with a `test` script, `playwright.config.*`, `.gitignore`
  entries). That is standing team policy.
- The existing `tests/dictate.js` must still pass.

## Done means

1. Idle: `#btn-dictate` text is `🎤 Dictare` (ro) or `🎤 Dictate` (en), its `title` is
   `dictateTip`, and it has no `aria-label`.
2. Click with the API engine (fake mic): `.active` appears, the text is exactly
   `⏹ Oprește înregistrarea`, `title` is `Oprește dictarea`, and `aria-label` is
   `Oprește înregistrarea`.
3. Click again: the text reverts to `🎤 Dictare` **immediately**, before the
   stubbed transcription resolves. Test this with a delayed route so the
   "Transcriu…" pill is still visible while the button already reads Dictare.
   `aria-label` is gone.
4. The same for the live engine (`S.engine: "live"`, with `SpeechRecognition`
   stubbed through `addInitScript`), including revert on a stubbed `onend` with
   `wantOn` false, and on an `onerror` of `not-allowed`.
5. Fail path: an unconfigured API engine (no key and no endpoint) never shows the
   stop label, and the label stays `🎤 Dictare`.
6. English UI: `⏹ Stop recording` / `Stop dictation` / `Stop recording`.
7. Toggle the language **while recording**: the label becomes the other language's
   stop label, not "Dictare". Stop, and it becomes that language's normal label.
8. Idea box (Ctrl+Alt+I): `#btn-idea-dictate` shows the stop label while recording
   and `#btn-dictate` stays `🎤 Dictare`. Closing the modal while recording
   reverts `#btn-idea-dictate`.
9. Viewport 390px wide, recording: `#btn-dictate` renders only ⏹. Check this with
   the computed `font-size` of the button being `0px`, the `::before` content being
   `"⏹"`, and the button's bounding box being noticeably narrower than at
   1280px. Its `aria-label` and `title` are still the full text.
   `#btn-idea-dictate` at 390px still shows the full text.
10. The red background (`.active` → `var(--danger)`) is still applied while
    recording.
11. `node tests/verify.js` passes, and so do `tests/dictate.js` and `tests/idea.js`
    (except for the known pre-existing idea.js failure listed in CLAUDE.md).

## Manual verification (human)

1. Serve the repo over `http://localhost` (dictation needs a secure context).
   On the Caiet vocal page, set up dictation, or pick the browser live engine.
2. Open `index.html`. Click **🎤 Dictare**. Allow the mic. The button turns red and
   reads **⏹ Oprește înregistrarea**, and hovering it shows "Oprește dictarea".
3. Click the EN toggle in the nav. The button reads **⏹ Stop recording**. Toggle
   back.
4. Click the button. It reads **🎤 Dictare** again right away, even while the
   "Transcriu…" pill is still showing.
5. Press Ctrl+Alt+I. Click 🎤 in the idea box. Only that button changes. Close the
   box with Cancel, reopen it, and it reads 🎤 Dictare.
6. Narrow the window below 700px, or use a phone. Start dictation from the
   toolbar. The button shows only a red **⏹**, and a screen reader or the
   accessibility inspector names it "Oprește înregistrarea".
