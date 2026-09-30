# First-time participant revision: integration checks

Status: integrated implementation and available technical checks complete; required human acceptance remains open. Formal human Korean-naturalness and EN/KO semantic acceptance remains **pending**. No participant mastery is claimed.

Ticket07 reconciles the delivered01–06 artifacts on `b444c1309e7574390233b080b1c1c583e0629892`, then incorporates newer local main `5e1c02f281954fbacdd29498ceed51ad3b4a3645` through merge `293a5a6`. New main's exact-LRU implementation, pointer and alternative sections and SVGs are retained and included in the Korean speech. Source pin remains CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.

## Route-to-script coverage

Participant itineraries use localized section titles; this author table retains exact fragments. Each row ends at its last named fragment and continues at the next row's entry. The last row ends the session. Both residency branches reset at `#session-branch-checkpoint`; these are alternative histories. Reading the second branch does not inherit the first result. Full curriculum navigation remains separate.

| Stop | Participant page / entry | Included sections through exit | Complete spoken segment |
| --- | --- | --- | --- |
| 1. Request and caller boundary | [lessons/0001-present-the-page-journey.html](../ko/lessons/0001-present-the-page-journey.html#session-request) | `#session-request` → `#session-opening-end` | [script-opening](../my-presentation-script.html#script-opening) |
| 2. Page identity, frame and BCB | [lessons/0002-separate-objects-from-state.html](../ko/lessons/0002-separate-objects-from-state.html#session-objects) | `#session-objects` → `#session-objects-end` | [script-objects](../my-presentation-script.html#script-objects) |
| 3. Textbook replacement, fresh-model prediction | [lessons/0000-replacement-foundations.html](../ko/lessons/0000-replacement-foundations.html#first-principles) | `#first-principles` → `#memory` → `#setup` → `#capacity` → `#fifo` → `#lru` → `#exact-lru-implementation` → `#exact-lru-pointers` → `#exact-lru-alternatives` → `#policy-comparison` → `#clock-rules` → `#clock` → `#opt` → `#future-knowledge` → `#limits` → `#exercise` | [script-textbook](../my-presentation-script.html#script-textbook) |
| 4. Compatible access and matching release | [lessons/0004-repay-fix-debt.html](../ko/lessons/0004-repay-fix-debt.html#session-concurrency) | `#session-concurrency` → `#session-readers` → `#session-writer` → `#rule` → `#ledgers` → `#predict` → `#simulate` → `#pointers` → `#release` → `#session-release-boundary` | [script-concurrent-use](../my-presentation-script.html#script-concurrent-use) |
| 5. Admission, domains, age, zones and quota | [lessons/0007-replace-one-frame.html](../ko/lessons/0007-replace-one-frame.html#first-principles) | `#first-principles` → `#story` → `#one-list` → `#pool-map` → `#admission` → `#private-shared` → `#design-assumptions` → `#session-age` → `#zones` → `#aging` → `#reuse` → `#migration` → `#quota` | [script-admission-policy](../my-presentation-script.html#script-admission-policy) |
| 6. Two outcomes from one checkpoint | [lessons/0007-replace-one-frame.html](../ko/lessons/0007-replace-one-frame.html#list-choice) | `#list-choice` → `#session-outcomes` | [script-replacement-outcomes](../my-presentation-script.html#script-replacement-outcomes) |
| 7. Read each branch from the same initial state | [reference/lru-worked-example.html](../ko/reference/lru-worked-example.html#session-branch-checkpoint) | `#session-branch-checkpoint` → `#session-retention` → `#session-branch-checkpoint` → `#session-displacement` | [script-replacement-outcomes](../my-presentation-script.html#script-replacement-outcomes) |
| 8. Protected recheck, identity replacement and progress | [lessons/0007-replace-one-frame.html](../ko/lessons/0007-replace-one-frame.html#gate) | `#gate` → `#handoff-details` → `#slot` → `#no-victim` | [script-replacement-outcomes](../my-presentation-script.html#script-replacement-outcomes) |
| 9. Four background roles | [lessons/0006a-understand-page-buffer-daemons.html](../ko/lessons/0006a-understand-page-buffer-daemons.html#first-principles) | `#first-principles` → `#why-background` → `#page-flush-purpose` → `#post-flush-purpose` → `#maintenance-purpose` → `#flush-control-purpose` → `#cadence` → `#background-session-exit` | [script-background](../my-presentation-script.html#script-background) |
| 10. Queued BCB and current-state checks | [lessons/0006b-follow-page-flush-handoff.html](../ko/lessons/0006b-follow-page-flush-handoff.html#first-principles) | `#first-principles` → `#session-handoff-check` → `#handoff-session-exit` | [script-background-handoff](../my-presentation-script.html#script-background-handoff) |
| 11. Policy updates and post-write pacing | [lessons/0006c-follow-maintenance-and-pacing.html](../ko/lessons/0006c-follow-maintenance-and-pacing.html#first-principles) | `#first-principles` → `#session-pacing-check` → `#pacing-session-exit` | [script-background-pacing](../my-presentation-script.html#script-background-pacing) |
| 12. Engine comparison and page-journey recap | [lessons/0018a-compare-replacement-policies.html](../ko/lessons/0018a-compare-replacement-policies.html#first-principles) | `#first-principles` → `#cubrid` → `#postgres-model` → `#postgres-credit` → `#postgres-ring` → `#postgres-first-trace` → `#postgresql` → `#innodb-model` → `#innodb-promotion` → `#innodb-first-trace` → `#innodb` → `#dirty` → `#postgres-tradeoffs` → `#innodb-tradeoffs` → `#map` → `#misreadings` → `#retrieval` → `#session-capacity` → `#conclusion` → `#session-page-journey` | [script-comparison-entry](../my-presentation-script.html#script-comparison-entry) |

The comparison speech continues through `script-postgres`, `script-innodb`, `script-tradeoffs` and `script-closing`. These are full explanations, not outlines. All exact cue links are independently exercised by ticket07 browser coverage; every top-level script section must have a semantic h2. The script is deliberately absent from participant navigation. The old companion is superseded and preserved in Git history.

## Scope and review corrections

The session preserves all deep lectures and established fragments. F1's exercise gains an explicit exit to concurrent use because section-next otherwise continues into the deferred database bridge. Lecture7's no-victim stop similarly exits to6A before its later deep sections. Zone-prediction age/same-list/ordinary-final-unfix assumptions and the retained READ/no-intervening-unfix race premise are visible before outcomes. These conditional changes close actual session-boundary and prediction defects.

The current fingerprints are retained in [07-current-fingerprints.json](../.scratch/first-time-participant-revision/contributions/07-current-fingerprints.json). They record computed content identity, not human approval. Manifest review remains pending. Contributor artifacts and their original/rebased commits are recorded in the [orchestration record](first-time-participant-orchestration.md). Branch source/arithmetic is in the [constructed transition ledger](first-time-participant-revision-trace.md), independently reviewed by root; it is not a runtime capture.

## Acceptance evidence

Tested content commit: `98b76bf5e00ed6d2cf1f35610d0f2696c5b27ed3` on `docs/seminar-ticket-07`. The subsequent receipt commit changes only this report and verification evidence. Worktree: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-ticket-07`. Exact served root: `http://127.0.0.1:8917`; read-only Copyparty launched from that checkout with `copyparty -i 127.0.0.1 -p 8917 -v .::r --ih -q`. The integrated browser test compares served script, both itineraries and every cue-target page byte-for-byte with local files before checking fragments. Tests ran headlessly.

All browser commands set `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs`. Browser suites also set `SEMINAR_URL=http://127.0.0.1:8917`.

| Command | Actual result at the tested commit |
| --- | --- |
| `node scripts/check-maintainer-guide.mjs` | Exit0;43 discovered pages, links,66 displayed SVGs,0 orphaned, English prose PASS. HTTP/DOM unavailable only in this source-only invocation. |
| `node scripts/check-bilingual-teaching-site.mjs` | Exit1;152 review-only diagnostics:54 missing human receipts and98 stale/missing manifest fingerprint records. No other diagnostic. |
| `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:8917` | Exit0; source gates plus109 HTTP resources and43 live-DOM pages PASS. |
| `node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:8917` | Exit1 solely for the same152 review diagnostics; the gate was run and not suppressed. |
| `node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:8917` | Exit0;277 HTTP resources and109 live-DOM pages PASS. This separate positive served receipt does not waive human review. |
| `node --test scripts/seminar-browser.test.mjs scripts/seminar-admission-browser.test.mjs scripts/replacement-foundations-browser.test.mjs` |36 tests PASS,0 failed,0 skipped. Includes every contributor's focused behavior and integrated script/route/assumption checks. |
| `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs` |59 tests PASS,0 failed,0 skipped. Includes newer-main validator changes. |
| Copyparty Markdown source checker | PASS for this report, NOTES, runbook, curriculum design and coverage. Relative author links separately resolved. |
| Before/after ID and audience-navigation audit | All IDs preserved in108 participant pages against both the original inventory and newer main5e1c02f. No participant page links the standalone script. |
| `git diff --check` | PASS. |

Raw logs, anchor audit and representative screenshots are retained under [07-verification](../.scratch/first-time-participant-revision/contributions/07-verification/browser.log). See the [guide served log](../.scratch/first-time-participant-revision/contributions/07-verification/guide-served.log), [bilingual served log](../.scratch/first-time-participant-revision/contributions/07-verification/bilingual-served.log), [unwaived all-gates log](../.scratch/first-time-participant-revision/contributions/07-verification/bilingual-all.log), [validator tests](../.scratch/first-time-participant-revision/contributions/07-verification/validator-tests.log) and [anchor audit](../.scratch/first-time-participant-revision/contributions/07-verification/anchor-audit.json).

The earlier FIFO-next expectation mismatch was corrected by01; all final browser tests pass. Some contributor worktrees reported favicon errors with a temporary Playwright wrapper. The final exact-commit runs use the installed module above and show no such served failure. The original baseline had162 review diagnostics; the final152 differ only because current computed fingerprints were recorded for edited pairs. No human reviewer was invented. Review currency still blocks overall product acceptance.

| AC | Evidence and disposition |
| --- | --- |
| AC01 | PASS technical/editorial: the paired12-stop itinerary and coverage table give dependency order, exact entry/included/exit/next; integrated browser compares language order and follows targets. |
| AC02 | PASS scoped agent review: opening and closing name the deferred topics. Selected concurrency, policy, reuse and background explanations use dirty preservation without a detailed durability prerequisite. F1/0007 and6A/B/C exits prevent accidental continuation. Formal human semantic review remains open. |
| AC03 | PASS:108-page ID inventories retain every previous anchor including newer-main F1 sections. Aggregate navigation/links and existing deep-route browser tests pass; full phases and lecture navigation are preserved. |
| AC04 | PASS agent review:0001 and script distinguish record request, containing page, potentially multiple visited pages, VPID lookup and caller-owned interpretation without claiming a complete SQL call chain. |
| AC05 | PASS:02 source receipt and browser schedules establish compatible readers, a conflicting nonholder writer, per-context/global debt and1/2/3/2/1/0 nested counts before policy. |
| AC06 | PASS:03 policy source checks and focused browser establish admission/final unfix before age/zones; membership is accounting rather than exclusive access. Script follows the same order and defines distinct age quantities. |
| AC07 | PASS source/constructed evidence: the transition ledger accounts for32768 frames, INVALID0, shared assignment to private32,quota5000 and250/250/32268; the sole changed input is resumed A reads before the fixed S1/S2 scan. |
| AC08 | PASS source arithmetic: root independently checked the pinned policy and both full branches; retained H1/H2 versus S1 replacing H1 and H2 remaining are explicit. This is not a runtime observation. |
| AC09 | PASS: contributor and integrated browser checks cover concealed outcomes, visible starting assumptions, native Enter disclosure and semantic headings. Zone eligibility and retained READ through recheck are visible before opening answers. Agent leakage review is distinct from human acceptance. |
| AC10 | PASS: existing branch-return and next/back tests cover reset behavior in both languages, including session branches and race questions using existing data-reset-answers. No stored answer model is added. |
| AC11 | PASS source/agent review:05 separates candidate submission, BCB completion, policy changes and post-write credit pacing. Inline completion differs from a stopped queued consumer; current-state checks and VS-20 limitations remain. |
| AC12 | PASS:06 retains common workload, policy versus reuse safety and the finite LRU12/MRU6/OPT6 versus LRU4/MRU12 examples with original limits. No universal all-miss or performance winner claim. |
| AC13 | PASS:03 removed participant volmap conversation/private path; qualified historical text remains in author-only contribution fragments. Selected explanations are self-contained. |
| AC14 | PARTIAL / OPEN: paired agent semantic review, technical parity and computed fingerprints are available. Genuine Korean-capable naturalness and EN/KO semantic review receipts are pending; no automatic pass substitutes for them. |
| AC15 | PASS implementation/technical:14 complete spoken sections cover12 stops, diagrams, transitions and applicable prediction/reveal pauses. Every cue fragment is rendered and checked; cue order is asserted. Newer-main exact-LRU implementation/pointer/alternative teaching is included. Human spoken-language acceptance remains open. |
| AC16 | PASS: runbook identifies one current companion, old script is superseded in history, no participant navigation links it, and no current instruction assumes prior lock-manager attendance. |
| AC17 | PASS available technical gates: desktop1440×1000 and mobile390×844, reading/presentation, keyboard/native disclosure, no-JavaScript access, image natural dimensions, no viewport content loss and page-error checks. Representative screenshots inspected headlessly. |
| AC18 | PASS scoped diff: static HTML/script/doc/test work only; no new simulator, score, answer store, final diagnostic workshop, engine change, runtime experiment or publication. Existing full-curriculum demonstrations remain. |
| AC19 | PASS reporting: this record identifies exact tested content, served root, commands, raw results and every AC. Human-review failures are explicitly open; unavailable source-only HTTP/DOM checks are superseded by actual served evidence rather than relabeled passes. |

## Visual and editorial observations

The [projection screenshot](../.scratch/first-time-participant-revision/contributions/07-verification/recheck-projection.png) shows the three-step race, retained READ/no-unfix premise and closed result together. The [mobile script screenshot](../.scratch/first-time-participant-revision/contributions/07-verification/script-mobile.png) shows legible wrapped Korean prose and a horizontally scrollable cue table contained within the viewport. Both were inspected by agents; this is visual evidence, not a human language-review receipt.

Root's independent Standards and Spec reviewers reported no unresolved content findings for98b76bf; their final integration record belongs in the orchestration record. Final product acceptance remains pending genuine human language/semantic review and does not follow merely from technical passes, local integration, or attendance.


## Independent root verification

Root repeated checks at the same content98b76bf in `/home/vimkim/gh/my-cubrid-page-buffer-seminar-revision-integration`, served read-only at `http://127.0.0.1:8910`: guide43pages/66SVG/109HTTP/43DOM PASS; all three browser files36/36 PASS with0 skips; bilingual all-gates exit1 exactly152 review-only diagnostics and0 nonreview failures; guide-validator unit23/23 PASS. Root separately checked16 changed author Markdown files with the Copyparty source checker and existing relative-link validation logic, with0 failures.

Served identity hashes recorded by root: Korean itinerary SHA256 `e1c79e01a4a017e9a0bbe3aa95064362ed47c1ec353228a5f7226856df040194`; current script SHA256 `7696d7b54251ed45d6a36adbc4441c1d2fecea49da404c40f55b7953531a2544`. These corroborate the ticket07 exact-worktree byte comparisons, not human language acceptance.
