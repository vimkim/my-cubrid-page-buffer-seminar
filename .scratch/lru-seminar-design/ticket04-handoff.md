# Ticket 04: immediate-promotion policy defense handoff

Status: scoped implementation, independent Standards/Spec content reviews and final automated checks complete. Human Korean-naturalness and semantic review remains pending; this is not final curriculum acceptance.

Base: `ebdb2dd436f85ae9a04882d9601c66b42773715f`. Isolated branch: `codex/lru-ticket04` in `/tmp/lru-parallel-6iS1Ah/ticket04`. Implementation commit: `4d6daf802eb3f459720f4c2b861bc8bc0d2dc54f`. A following handoff commit records this file and the paired wording refinement that distinguishes ordinary reserved-candidate exclusion from protected direct-assignment validation/revocation. Work item 216 stays with the main coordinator. No engine edits, pushes, simulator work or native experiments occurred.

## Acceptance and routes

| Requirement | Delivered evidence |
| --- | --- |
| Exact bounded hypothesis | `#policy-proposal` defines successful ordinary resident OLD_PAGE READ/WRITE grants, nested/fast-path inclusion, post-grant/pre-return timing, BCB then current-list protection, current-list destination, unchanged final-unfix migration, tick and sampling rules, excluded fetches and proof obligations. |
| Same-start comparison | `#policy-compare` independently resets to checkpoint 3 and S49. Six rows compare held-fix and final-unfix states. Existing ordinary history and terminal selection baseline remain unchanged. |
| Cost, safety and counterexample | `#policy-defense` derives a fresh 20-hit counterexample, names workload-dependent advantages/disadvantages, preserves hard safety and progress obligations, and distinguishes structural work from performance results. |
| Verification and human review | Model disclosure includes controlled race/failure tests and paired workload measurements; five-row human rubric evaluates reasoning without stored responses or scores. |
| Final defense integration | Paired Lecture 17 `#policy-review` and technical-defense card `#policy-review` link to proposal/model review; trace links back. |
| Accessible bilingual delivery | Existing native disclosures and shared presentation controls. Browser tests cover direct projection entry, keyboard prediction/reveal, step next/back, actual language/lecture routes, and mobile no-JavaScript access from the defense card. |
| Evidence and author guidance | Source-linked baseline predicates, author-only runbook and coverage additions. Existing manifest keeps all three edited pairs pending; no inventory change or fabricated receipt. |

New trace anchors: `policy-proposal`, `policy-compare`, `policy-defense`. New route anchor `policy-review` occurs in each Lecture 17 and defense-card counterpart. No `reuse-*` anchor is used. No shared JavaScript/CSS or canonical Markdown explanation was changed. Existing safety/progress explanations supply the canonical routes; ticket 03 is not a prerequisite.

## Precise hypothesis and state boundaries

The added operation is a hypothetical policy specification, not a claim that existing boost can safely be called from fix. It retains successful ownership, acquires/retains the BCB mutex, rechecks identity/current membership, then locks the current list for one unlink/reinsert at LRU1 top before returning. It executes even for an already-top member, adding one list tick with the existing wrap rule. Same-list saved ticks stay unchanged. LRU1 counts stay equal; LRU2 promotion adjusts zone 1; LRU3 promotion adjusts combined zones then zone 1. Boundary/index/zone/candidate/hint/queue consistency and every grant/error/lock path are proof obligations. Fast-path successes must join this protected path. Failed or pending acquisitions do not trigger it; misses, NEW_PAGE/recovery/specialized fetches and same-debt latch promotion are outside scope.

Own-private and other-context private hits remain in their current private list during the fix. Shared hits remain in their shared list. Existing final-unfix policy, including ignore hints and mismatch/hot-and-old migration to shared LRU2, is retained. Fix adds no new quota-epoch sample. Quota and hot-history mechanisms remain, while extra ticks can change future age decisions. AOUT stays dormant. The displayed schedules have no intervening operations or concurrent quota pass; concurrent correctness is proposed verification work, not proven by serial arithmetic.

| Reset / end | Baseline | Hypothesis | Conserved state |
| --- | --- | --- | --- |
| A: checkpoint 3 → A fixes/unfixes P | R→P→H1→H2; private tick 1002 | P→R→H1→H2; private tick 1003 | 4/48/50; P saved tick 1000; epoch 10, hit_age 10, lru_hits[32]=2; INVALID 30766, resident 2002 |
| B: fresh S49 → A fixes/unfixes P | Fix leaves P LRU2; final unfix age 51≥25 boosts P, tick 1052 | Fix boosts P immediately; final unfix keeps it, tick 1052 | Both P→G49…G1 LRU1, R at LRU2 head; 50/50/51; P saved tick 1000; samples 51 |
| B continued: B fixes/unfixes P | P stays top during fix; migration leaves private tick 1052 | Already-top P still relinks once; migration leaves private tick 1053 | Private 49/50/51; shared 1 = 0/1/0, shared tick 1, P saved tick 0; list 33 empty; INVALID 30717, resident 2051 |
| Counterexample: fresh checkpoint 3 → ten P,R pairs | 20 hits/0 misses; tick 1002, unchanged order | 20 hits/0 misses; 20 relinks; tick 1022, same final order | 4/48/50; saved P/R ticks 1000/1001; epoch/hit_age 10, samples 2; neither hot; INVALID 30766, resident 2002 |

At Reset B's end private top=G49, bottom_1=G1, bottom_2=Z47; shared top=bottom_2=bottom=F42/P and bottom_1=NULL. Private 150 + shared 1900 + shared P 1 = 2051. No remaining fix or identity change. The hypothetical private tick must never be copied into ticket 02's terminal baseline. Its original terminal INVALID 0 / resident 32768, private 50/50/30767, tick 31769 and epoch 11 remain untouched.

## Source and independent review

Author source checks used `git show f799e05d77d5300c6ea5753b4a6cc7caee6d8912:src/storage/page_buffer.c` in `/home/vimkim/gh/cb/develop`, not the current worktree source. Relevant routes: keep and age-gated unfix 6752–6818; migration predicate 7005–7038; top insertion/tick 9695–9740; boost restriction and zone adjustment 10122–10199; sequential migration/unlink 10303–10417; epoch sampling 16594–16610. Existing checkpoint source and ticket 02 handoff supply the shared starting state. The new `assert (zone != PGBUF_LRU_1_ZONE);` and keep-branch snippets match pinned source.

Standards reviewer: no hard documented-standard violations or applicable Fowler smells. Optional density observation: projection uses ordinary vertical scrolling, especially the expanded model review. Existing styles/native disclosures are retained; screen inspection found legible text and no horizontal page overflow. This agent review supplies no human language receipt.

Spec review: no content/source/arithmetic/scope findings. The independent reviewer checked the bounded OLD_PAGE trigger, current-list protection/destination, final-unfix migration and both reset/20-hit calculations against pinned source. Follow-up review cleared this handoff's states, source routes, final results and evidence limits. Final review: Standards 0 hard findings; Spec 0 remaining findings. Main reused existing independent reviewer threads after new-thread creation hit capacity.

## Verification

- Served-page TDD slice 1 failed for missing policy comparison, then passed in both languages: direct projection entry, keyboard answer, previous/next proposal/comparison, actual Lecture 17 return and language navigation.
- Slice 2 failed for missing model disclosure, then passed: defense-card entry to mobile no-JavaScript counterexample/rubric, keyboard answer and proposal return. Keyboard entry avoids a Playwright click-stability wait on the existing styled card.
- Broad suite: **183 tests, 180 passed, 3 failed, 0 skipped**. The same known baseline failures remain: NEW_PAGE/B-tree source-range assertion, exact approved Markdown inventory, stale private-LRU lecture title. It includes both aggregate validator tests and browser regressions.
- Final focused suite: **71/71 passed, 0 skipped**, including both validators, seminar contract/regressions and browsers, rerun after the paired clarification that direct-assignment validation is distinct from ordinary reserved-candidate exclusion.
- All seven bilingual source gates pass individually for **51 pairs**: inventory, navigation, links/assets, technical parity, language/accessibility, static interaction, audience contract.
- Full bilingual aggregate remains unsuccessful on missing actual human review receipts/current fingerprints across the site. All three edited pairs already have pending records; none was forged.
- Final isolated static HTTP served validation: **PASS 253 resources; live DOM PASS 103 pages**, rerun after the final paired wording clarification. The URL serves the isolated ticket tree, not the original worktree. It is not the actual Copyparty endpoint.
- Maintainer-guide source: **PASS 43 pages**, SVG **PASS 60 displayed/0 orphaned**, English prose **PASS**. Relative links **FAIL** because four ignored `rebind-quiz1…4/meta.json` evidence files are absent from this isolated Git checkout. No guide page was edited. The static-server aggregate reports HTTP **PASS 103 resources** and live DOM **FAIL 43 pages** because raw Markdown served by this simple server is not a rendered Copyparty page. That executed static DOM failure is not a pass or unavailable-browser skip. The actual Copyparty HTTP/DOM gate is **UNAVAILABLE for this isolated tree** and must be rerun by main after integration; these static-server results are not Copyparty rendering evidence.
- EN/KO comparison projections at 1440×1000 and proposal reading sections at 390×844 were visually inspected. No horizontal page overflow; expanded comparisons/model explanations continue by normal vertical scrolling.
- Scoped `git diff --check` passed. Static HTML and existing JavaScript have no separate TypeScript typechecking/build step.

Reproduce with `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs`, `SEMINAR_URL=http://127.0.0.1:37511/code-analysis/page-buffer-presentation` and the isolated tree's server. Broad: `node --test scripts/*.test.mjs`. Focused: `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/seminar-browser.test.mjs`. Served bilingual: `node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url <isolated-base>`. Guide: `node scripts/check-maintainer-guide.mjs` and its `--copyparty-url <isolated-base>` invocation.

Diagnostics: `/tmp/lru-ticket04-{full,focused,focused-final,served,served-final,guide}.log`; screenshots `/tmp/lru-ticket04-{en,ko}-{projection,policy-mobile}.png`. These are local validation artifacts, not native runtime or human-language receipts.

## Integration instructions

Main cherry-picks scoped commits serially after both independent reviews close. Shared paths with ticket 03 are the worked-example pair, browser tests, coverage and runbook. Preserve both appended section groups and all existing anchors; retain both rail-link sets and both independently named tests. Ticket 04 owns policy-* and its Lecture 17/defense-card routes. Ticket 03 owns any opt-in shared reset/runtime changes. After integration, rerun source, browser and actual Copyparty gates; a clean textual merge is insufficient. Do not change original ticket 02 checkpoints or combine independent alternative histories.

Scoped paths: EN/KO `reference/lru-worked-example.html`, EN/KO `lessons/0017-defend-the-module-live.html`, EN/KO `reference/presentation-rehearsal-card.html`, `scripts/seminar-browser.test.mjs`, `docs/curriculum-coverage.md`, `presenter-runbook.md`, and this handoff. Stop at ticket 04; ticket 05 integration work remains main-owned.
