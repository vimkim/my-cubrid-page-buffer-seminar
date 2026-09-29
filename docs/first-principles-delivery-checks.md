# Foundations-first delivery verification

This record covers the three-hour route and focused lecture additions accepted on 2026-09-30. It does not certify the entire curriculum's human language review or presenter mastery.

## Source verification

Read-only source checks used CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` at `/home/vimkim/gh/cb/pgbuf-grill`, PostgreSQL `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc` at `/home/vimkim/gh/pg/postgres`, and MySQL `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8` at `/home/vimkim/gh/mysql/mysql-server`.

Verified graph edges include the miss claim helper, sibling BCB/LRU initialization helpers, branch-dependent final-unfix admission, four daemon execution paths, PostgreSQL allocation-to-Clock selection, and InnoDB common-LRU clean eviction. Source links in the bilingual lectures carry the exact line anchors. Asynchronous enqueue/wake is explicitly separate from direct calls. Source review checked VS-20 and does not claim runtime starvation. No new DB runs or debugger captures were performed.

## Validation

The following checks completed on the working tree. The existing Copyparty endpoint served the seminar repository at `http://127.0.0.1:3935`. Browser checks used `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs` and Chromium.

| Check | Result |
| --- | --- |
| Bilingual inventory, navigation, links, technical parity, language/accessibility, static behavior, audience contract | PASS, 52 pairs in every source gate |
| Bilingual served HTTP and live DOM | PASS, 258 resources and 105 pages |
| Maintainer-guide aggregate, including Copyparty and live DOM | PASS, 43 Markdown pages, 60 displayed SVGs, 0 orphaned SVGs, 103 served resources |
| Existing seminar and replacement-foundations browser suites | PASS, 22 tests, 0 failures, 0 skips |
| Focused new-section projection and no-JavaScript mobile checks | PASS, 60 section/page checks across English and Korean; route entry links work in both languages; no page errors |
| Korean speaker notes, cue card, and preserved deep-dive Markdown preview | PASS, rendered through a temporary read-only Copyparty endpoint; headings and tables inspected |
| Local presenter-document links, HTML anchors, fences, and schedules | PASS; both schedules are contiguous 13:00–16:00 with the agreed topic durations |
| Working-tree whitespace | PASS, `git diff --check` |
| Human translation-review currency | OPEN: 52 missing human review receipts and 104 absent/stale review fingerprints; this is not an automated pass |

The full bilingual aggregate therefore remains unsuccessful on human review currency. No other failures were reported. The first projection check exposed two diagrams sharing a dense section; page-flush/post-flush and maintenance/flush-control were split into separately navigable sections and the affected checks were rerun. The route remains a continuous overview, as required by the existing site behavior, while lecture sections support presentation mode.

Reproduce the source gates with `node scripts/check-bilingual-teaching-site.mjs --gate <gate>`, where `<gate>` is `inventory`, `navigation`, `links`, `technical`, `language`, `static`, or `audience`. Reproduce served checks with `node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:3935`. Run the guide aggregate with `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3935`. Browser regression command: `SEMINAR_URL=http://127.0.0.1:3935 node --test scripts/seminar-browser.test.mjs scripts/replacement-foundations-browser.test.mjs`. Set the Playwright module variable above when it is not locally resolvable.

Focused visual inspection used 1440×1000 projection/reading and 390×844 no-JavaScript mobile viewports. It covered every new concept/code section, all four daemon graphs, both engine examples, the route, and the misconception recap. Screenshots are transient local artifacts under `/tmp/seminar-*`; the source files and this verification record are the durable deliverables.

Human review remains tracked separately in work item 55. This implementation does not certify final human acceptance or presenter mastery.
