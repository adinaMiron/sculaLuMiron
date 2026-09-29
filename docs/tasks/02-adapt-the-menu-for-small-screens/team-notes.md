## lead

- `index.html` header above 1024px is `height: 52px`, no wrap, `.wb-save-sync-row { display: contents }`, and `body` has `overflow: hidden` — anything that spills off the right edge can't be reached at all, and there's no scrollbar to show it.
- Google "connected" state can be faked without OAuth: in `page.evaluate`, `gsFolder = {id:'x', name:'ScuLa'}; gsLastAt = Date.now(); paintCloud();` (top-level `let`s in `js/markdown/drive.js` are reachable by name). Language: dispatch `new CustomEvent('scula-ui-lang', {detail:'ro'|'en'})`.
- In this session Bash (perl/sed in-place) was refused for editing docs and there was no Edit tool, so a planning doc can only be changed by a full `Write`. Get the wording right the first time.
