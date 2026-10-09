---
name: header-layout
description: Change or verify index.html header, save/sync row and toolbar geometry using existing breakpoint and long-label fixtures.
---

1. Locate `.header-actions`, `#wb-save-sync-row`, `#toolbar-groups` and their
   media rules with `rg -n` in `index.html`; inspect current DOM before editing.
   Keep save/sync accessible independently of the collapsed toolbar.
2. Read the assigned layout requirement. Established desktop behavior wraps
   labels above 1024px; the phone save row scrolls horizontally. When touching a
   boundary, check both sides: 1024/1025, 1600/1601 and a wide desktop.
3. Reuse `tests/02-adapt-the-menu-for-small-screens/` fixtures. Exercise long RO
   labels first, then EN, connected Drive, long status/crumb and visible map.
   Preserve specificity of `.wb-save-sync-row .btn` against phone flex rules.
4. Assert real geometry: tolerate tiny top differences when counting rows;
   hit-test inside ellipsized boxes; empty cloud status can be zero-width.
   Language toggles can reset synthetic crumbs, so restore fixtures afterward.
   Wait for the toolbar transition to settle and close modals before next clicks.
5. Run the affected fixture first. Broader guards:
   `python3 scripts/run-tests.py --preset header`; `node tests/verify.js`.
   Old adjacency assertions may be stale: derive changes from required behavior,
   never waive a failure merely because an old retrospective lists it.

Expected output: changed layout, widths/languages tested, results and remaining
constraints. Use symbols rather than maintaining line-number copies here.
