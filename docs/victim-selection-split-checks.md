# Victim-selection lecture split verification

The split starts from `5ccf1ec` and retains all 21 original English/Korean
Lecture 7A sections exactly once across 7A (8), 7B (6), and 7C (7). Comparison
against that commit found only removed heading numbers, relocated links, and
an updated `session-outcomes` continuation inside the existing sections.
New page introductions restate the constructed scenario and pinned baseline.
No source mechanism, image, runtime receipt, or engine behavior changed.

The full route is 7 → 7A → 7B → 7C → 12. Both syllabi, landing pages, the
manifest, lecture-order contract, session itineraries, and Korean presenter
script agree. Old 7 and 7A fragments retain native destination links, including
`session-recheck`. The original twelve session stops retain their selected
content and the explicit `no-victim` exit before deferred detail.

## Environment and commands

Task branch: `docs/split-victim-selection`.
Worktree: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-split-victim-selection`.
Read-only Copyparty was started from this worktree:

```sh
copyparty -i 127.0.0.1 -p 8941 -v .::r --ih -q
export PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs
export SEMINAR_URL=http://127.0.0.1:8941
```

All browser work was headless.

| Check | Result |
| --- | --- |
| `node scripts/check-maintainer-guide.mjs --copyparty-url "$SEMINAR_URL"` | PASS: 43 Markdown pages, relative links, 71 displayed SVGs with no orphans, English prose, 114 HTTP resources, 43 live-DOM pages. |
| Bilingual source gates: `inventory`, `navigation`, `links`, `technical`, `language`, `static`, `audience` | All PASS for 58 pairs. Run `node scripts/check-bilingual-teaching-site.mjs --gate <gate>`. |
| `node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url "$SEMINAR_URL"` | PASS: 295 HTTP resources and 117 live-DOM pages. |
| `node scripts/check-bilingual-teaching-site.mjs --copyparty-url "$SEMINAR_URL"` | Exit 1 solely for 138 missing human-review receipts or unrelated stale fingerprints. No other diagnostics. |
| `node --test scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/check-maintainer-guide.test.mjs` | 59/59 PASS. |
| Existing seminar, admission, and victim-queue browser suites | 40/40 PASS, including exact session/script destinations, presentation, keyboard disclosures, mobile and no-JavaScript routes. |
| Two additional split-navigation browser checks | PASS: presentation continuity through 7A/7B/7C, session boundary, language switch, and old 7A bookmarks to both new pages on mobile without JavaScript. |
| `git diff --check` | PASS. |

Reproduce all browser checks with:

```sh
node --test scripts/seminar-browser.test.mjs scripts/seminar-admission-browser.test.mjs scripts/victim-queue-browser.test.mjs
```

The new bookmark test initially raced native fragment-driven disclosure opening.
It now waits for page loading to settle and uses keyboard focus/activation;
reduced motion avoids smooth-scroll timing in the mobile check.

Korean presentation screenshots of all three pages and the mobile 7B opening
were inspected. They retain the shared typography, diagrams and controls with
no horizontal overflow. Changed pairs have current fingerprints and pending
review state. Automated parity and visual checks do not constitute a human
Korean-language or semantic review; that existing acceptance gate remains open.
