# Private/shared rationale revision verification

Reviewed against seminar base `813dfd7` and CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912` on 2026-09-30.

## Scope and evidence

The paired Lecture 0007 pages now compare shared-list sharding with private-domain
accounting, explain design assumptions and removal consequences, and trace
assignment, admission and migration. The glossary and accepted design record are
updated. Existing anchors remain; `design-assumptions` is added to both contents
menus. No engine changes or new native experiments were made.

Pinned source was inspected for assignment (14514–14602), final-unfix gating
(6675–6844), VOID admission (6885–6994), migration predicate (6996–7038),
shared destination selection (8987–9063), victim preference (9093–9230),
transfer (10303–10353) and quota allocation (14400–14501) in
`src/storage/page_buffer.c`. Source comments express transaction-oriented intent;
the executable migration condition compares LRU indices. The existing
[focused evidence reference](../reference/private-lru-domain-hit-age-and-unfix-placement.md)
retains detailed provenance ownership. Assumptions and counterfactual outcomes
are labeled inference or constructed alternatives rather than measured benefits.

## Checks

The task worktree was served at the Copyparty URL root on loopback port 3936.
Headless Playwright used the installed Chromium 1223 executable explicitly,
because that Playwright installation's default headless-shell path was absent.

| Check | Result |
| --- | --- |
| `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3936` | Markdown, links, SVG and English source PASS; HTTP PASS for 106 resources; DOM scanned 43 pages but FAIL due to `/favicon.ico` 404 on the entry page. |
| Bilingual aggregate with the same `--copyparty-url` | Full acceptance FAIL: pending human review receipts/fingerprints and `/favicon.ico` 404 on the root index. |
| Bilingual gates `inventory`, `navigation`, `links`, `technical`, `language`, `static`, `audience` | Each PASS across 54 pairs. |
| `node --test scripts/seminar-browser.test.mjs scripts/seminar-regressions.test.mjs` against the task server | 24 PASS, 1 FAIL: unchanged foundations navigation expects `#opt`, receives `#lru`. |
| Same failing test against main at port 3935 | Reproduced the same assertion at `scripts/seminar-browser.test.mjs:306`. |
| Focused Lecture 0007 browser inspection | EN/KO at 390 and 1440 pixels, JavaScript enabled/disabled: native disclosures open; no horizontal document overflow or page exceptions. New assumptions section reachable in presentation mode. |
| Visual inspection | EN/KO expanded assumptions/removal tables inspected in headless screenshots. |
| `git diff --check` | PASS. |

Chrome DevTools network events identified the aggregate DOM error as
`/favicon.ico`; main's server also returns 404 for that resource. No additional
aggregate DOM failures were reported. These failures are disclosed, not counted
as passes. No validation code was changed.

Human Korean-naturalness and semantic-parity review remains pending in
`teaching-pages.json`; automated checks and agent reading do not create a human
review receipt. Existing work item 55 owns that acceptance gate.
