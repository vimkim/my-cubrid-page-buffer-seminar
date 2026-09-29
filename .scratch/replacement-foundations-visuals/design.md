# Replacement-foundations visuals

Confirmed 2026-09-29: the user selected all four proposed visuals and manual Clock stepping (work item 224).

Add paired English/Korean diagrams to Lecture F1: page/frame reuse, the ten-request workload timeline, FIFO versus LRU metadata on request 3, and the Clock ring through request 7. Use the existing authored model; these are not CUBRID runtime observations. Preserve stable frame identities, backing-store copies, and the distinction between request boundaries and intermediate Clock inspections.

Use responsive semantic HTML/CSS for localized labels and selectable text. Clock has manual Next step and Reset controls, no autoplay, and all five states remain available without JavaScript. Keep policy answers inside their existing native disclosures. Preserve reading, presentation, mobile, and print access. Retain the existing complete trace tables.

No glossary change is needed: these visuals use existing page, frame, and metadata meanings. No ADR is warranted for this reversible presentation choice. Human language-review receipts remain pending; implementation validation does not supply them.

## Implementation and verification

Implemented with page-local `assets/replacement-foundations.css` and `assets/replacement-foundations.js`; paired HTML contains all localized content and static Clock states. The English/Korean review entry already remains pending.

- Maintainer aggregate: 43 Markdown pages, relative links, 60 displayed SVGs, English prose, 103 served resources, and 43 live DOM pages pass.
- Bilingual aggregate: the only reported failures are the existing missing human review receipts and review fingerprints across the collection. No receipts were fabricated.
- Seminar source contract: 6 tests pass.
- Focused browser checks: 4 tests pass across EN/KO, including keyboard Clock stepping, bit-clearing and replacement states, reset, presentation mode, 390px overflow, and complete no-JavaScript reading.
- Rendered KO desktop/mobile diagrams visually inspected; adjusted Clock direction-marker placement to avoid overlapping the hand label.

Browser reproduction uses `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs` and `SEMINAR_URL=http://192.168.4.2:3935` with `node --test scripts/replacement-foundations-browser.test.mjs`. Both aggregate validators use the same Playwright module and `--copyparty-url http://192.168.4.2:3935`.
- Explicit bilingual served gate: HTTP passes for 255 resources; live DOM passes for 103 pages.
