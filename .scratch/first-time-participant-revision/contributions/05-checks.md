# Ticket 05 verification receipt

Content under test: `96032f4af893b37de2992022adccc5edd6f4b8c2`, based on common integration base `c9c6183626469c18640497c9755066120e246c88`. This receipt is a subsequent documentation commit. Worktree: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-ticket-05`; branch: `docs/seminar-ticket-05`. Date: 2026-09-30.

Served root: `http://127.0.0.1:8915`, Copyparty volume `/home/vimkim/gh/my-cubrid-page-buffer-seminar-ticket-05::r`, bound to localhost. Browser responses for all six edited participant pages were compared byte-for-byte with this checkout. Browsers ran headless; no external publication occurred.

## Commands and results

For the final standard browser runs, `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs` and `SEMINAR_URL=http://127.0.0.1:8915`.

| Command/check | Result |
| --- | --- |
| `node scripts/check-maintainer-guide.mjs` | Exit 0; Markdown source 43 pages, relative links, 64 displayed SVGs / zero orphans and English prose PASS. Served gates initially UNAVAILABLE in this source-only invocation. |
| `node scripts/check-bilingual-teaching-site.mjs` | Exit 1; exactly 162 diagnostics, all missing Korean receipts or stale/missing review fingerprints. No other source/link/parity diagnostic. |
| `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:8915` | Exit 0; source gates PASS, Copyparty HTTP 107 resources PASS, live DOM 43 pages PASS. |
| `node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:8915` | Exit 0; HTTP 274 resources PASS, live DOM 109 pages PASS. |
| `node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:8915` | Exit 1; final all-gates invocation retains the 162 human-review diagnostics. Human acceptance is still pending. |
| `node --test scripts/seminar-browser.test.mjs` | 19 tests: 18 PASS / 1 FAIL / zero skips. Existing foundations test expects `#opt` but actual navigation reaches `#lru` (line 306 at this slice). Ticket 01 owns that previously identified assertion repair; this slice does not edit it. |
| `node --test --test-name-pattern='selected background' scripts/seminar-browser.test.mjs` | Exit 0; new focused test PASS, zero skips. Both languages; 1440×1000 presentation and 390×844 no-JavaScript reading; initially concealed answers, keyboard Enter reveal, answer reset on next/back, selected exit links and horizontal viewport fit. |
| Additional exact-root probe | Six edited responses equal source bytes; every loaded image has nonzero natural dimensions; all 14 spoken-script cues resolve to exactly one fragment; no page exception. |
| Before/after ID inventory | Every existing ID retained: 14 per 6A page, 12 per 6B/6C page. Two new IDs per page. [Inventory](05-anchor-inventory.json). |
| `git diff --check` | PASS. |
| Copyparty Markdown source checker | [Route/evidence contribution](05-route-and-evidence.md) and this receipt PASS. All local Markdown links resolved, including HTML fragments. |

An exploratory served run used `/tmp/playwright-lru.mjs`, which launches full Chromium 1223. It reported a root `index.html` console error for the unchanged `/favicon.ico` returning 404. A targeted console probe identified that exact URL. The standard installed Playwright headless shell run above passed all served gates. This browser difference is recorded; the earlier failing run is not presented as a pass.

## Scoped acceptance evidence

| AC | Evidence and limit |
| --- | --- |
| AC02 / AC11 | Selected stops separate candidate submission, delegated BCB completion, quota policy and post-write pacing. Their questions require no WAL/LSA/DWB/copied-generation knowledge. Explicit exit boundaries retain detailed later-session content. No daemon is described as guaranteeing immediate reuse or fairness. |
| AC03 | Existing IDs, bilingual URL pairing and full-curriculum previous/next navigation retained. Exact [entry/exit map](05-route-and-evidence.md#selected-stops) supplied to ticket 01/07. |
| AC09 / AC10 | New native disclosures keep premises visible and outcome paragraphs hidden initially. `data-reset-answers` uses the existing presentation behavior to close an answer before revisiting the prediction. Keyboard and route transitions pass. |
| AC14 | Assumptions and outcomes reviewed pairwise: B is the requester, S3 the requested page, S4 the candidate; the pending fix rejects assignment while flush-state completion still runs. Three manifest entries were already pending with empty fingerprints and remain so. This is agent review, not a human Korean-naturalness receipt. |
| AC15 | Three full spoken chapters cover all selected 6A/6B/6C stops, diagrams, questions, pauses, reveals and transitions. Fourteen root-relative cue links were requested and resolved. Ticket 07 must still validate them after assembling the root script. |
| AC17 | Focused headless behaviors pass. Representative Korean handoff desktop and pacing mobile screenshots were inspected: premises/disclosure readable and no horizontal clipping. Aggregate image/DOM checks pass with the standard headless shell. |
| AC18 / AC19 | No engine change, runtime experiment, simulator, scoring or publication. Constructed examples remain distinct from runtime evidence. This receipt identifies the tested content SHA, root, commands and limitations. |

The actual ticket 04 trace was read at `1eced45` / `baf6c72`; its active-versus-paused endpoint and independent protected-recheck schedule are reconciled in the [dependency record](05-route-and-evidence.md#dependency-reconciliation). The background and maintenance examples visibly reset their state instead of altering the verified branch arithmetic. Remaining integration verification belongs to the root and ticket 07; this slice does not claim whole-session acceptance or participant mastery.
