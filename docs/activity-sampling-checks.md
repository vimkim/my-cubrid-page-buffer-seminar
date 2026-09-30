# Lecture 12b activity sampling expansion

The paired Lecture 12b pages now explain eligible-event collection separately
from accepted quota adjustment. The visible sequence covers BCB epoch fields,
the epoch 42 to 43 example, migration attribution, excluded unfix paths,
admission counters and timing guards, rate normalization, activity smoothing,
and a constructed quota calculation. Existing URLs and the `activity` anchor
remain stable; four new sections have matching navigation in both languages.

Claims were checked against the pinned CUBRID source at
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, particularly
`page_buffer.c:6713–7038,14285–14474,16595–16610`. The existing canonical
Markdown and sampling evidence retain technical authority. The numerical
example is explanatory arithmetic, not runtime evidence. It assumes an already
calculated private target; it does not purport to derive the entire pool-wide
private ratio from one list's samples.

## Verification

The task checkout was served read-only with:

```sh
copyparty -i 127.0.0.1 -p 8934 -v .::r --ih -q
export PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs
node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:8934
node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:8934
node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:8934
```

- Maintainer aggregate: PASS, including 43 Markdown pages, 71 displayed SVGs,
  zero orphaned SVGs, 114 HTTP resources and 43 live-DOM pages.
- Bilingual aggregate: exit 1 with 134 translation-review diagnostics only
  (missing human receipts or stale fingerprints elsewhere). No technical,
  language/accessibility, navigation, source-link or served/browser diagnostics.
- Bilingual served gate: PASS, 289 HTTP resources and 113 live-DOM pages.
- Focused headless Chromium checks: both languages at widths 1440 and 390,
  with JavaScript enabled and disabled; activity tables and formulas visible,
  no document-wide horizontal overflow, native source disclosure operable by
  keyboard, and `?present=1#activity-dedup` visible with presentation enabled.
  The Korean presentation capture was visually inspected for table/code layout.
- `git diff --check`: PASS. Validator code was unchanged.

## Review boundary

Editorial review checked causal order, qualifications, source accuracy,
section density, EN/KO parity and navigation. The current fingerprints for
this pair are recorded in `teaching-pages.json`; its human review remains
`pending`. Agent review and successful browser checks do not manufacture the
Korean-capable human receipt required by ADR 0004. No runtime sampling accuracy
or performance measurement was added.
