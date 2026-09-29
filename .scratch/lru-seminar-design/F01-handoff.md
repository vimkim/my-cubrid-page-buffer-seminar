# F01 replacement foundations handoff

Status: implementation, independent reviews, and scoped automated verification complete. Final curriculum acceptance still requires actual human language review and resolution of the disclosed site-wide gates. F02 is the next implementation slice; F01 does not claim that the database bridge is delivered.

Work item: 216 (main coordinator). Base commit: `6e88f91328499533ba0f769842709af549dc930a`. Implementation commit: `74bec21bed32f40e706f8025e48c0180462fabb7`. Ticket 01 and its handoff are unchanged. No engine changes or pushes were made.

## Acceptance mapping

| F01 requirement | Delivered evidence |
| --- | --- |
| Beginner prerequisites before policy | `#memory` defines hierarchy, page/frame, hit/miss, locality, working set, and an invented miss-cost example. |
| Fixed-capacity fourth-page problem | `#capacity` states full three-frame premise and conditional eviction, bypass, waiting/refusal, or growth outcomes; no universal crash/data-loss claim. |
| Four independently checked traces | `#setup`, `#fifo`, `#opt`, `#lru`, `#clock` contain 40 original main rows per language, with physical frames and explicit policy metadata. |
| Costs, approximation, alternatives | Exact-order maintenance and synchronization costs, offline OPT limitation, Clock bit semantics, Random/LFU contrasts, and a separate FIFO/LRU counterexample. |
| Predict/reveal and unseen transfer | Five native answer disclosures; `#exercise` supplies a new seven-request sequence and 28-row answer ledger. Separate instructor explanations are in the author-only runbook. No scores, stored answers, or navigation locks. |
| Source attribution and boundaries | Original examples cite OSTEP chapter 22 and CMU Spring 2026 buffer-pool material; both primary PDFs were opened during implementation. Constructed model is visibly distinct from runtime and CUBRID behavior. |
| Paired routes and accessible delivery | EN/KO required entry, root compatibility redirect, both landings/syllabi, Lecture 1 return navigation, manifest, dependency order, coverage. Shared presentation controls and no-JavaScript reading retained. |
| Verification and F02 interface | Results and named terminal states below. Human review is pending, not manufactured. |

## Authored state and independent arithmetic

Main sequence: `P R P S P R T U P R`. P/R are repeatedly used; S/T/U are scan pages. Each policy independently starts empty with three stable frames F0/F1/F2. Fill the lowest empty frame; replacement reuses the victim's frame. Rows are post-request states. Initial fills count as misses.

FIFO tracks oldest-to-newest admission and never reorders on hits. LRU tracks least-to-most-recent access, including every hit and load. Serial requests eliminate recency ties. OPT metadata is the next request index after the row, with infinity for no future use; on equal farthest use, choose lowest frame index. Clock starts at F0 with bits 000, sets on every hit/load, leaves hand unchanged on hit, advances after load, and clears/advances over 1 bits until a 0-bit victim is found.

| Policy | Main hits / misses | Main final F0 / F1 / F2 | Terminal metadata |
| --- | --- | --- | --- |
| FIFO | 3 / 7 | R / U / P | admission U → P → R |
| OPT | 5 / 5 | P / R / U | next use ∞ / ∞ / ∞ |
| LRU | 3 / 7 | U / P / R | recency U → P → R |
| Clock | 3 / 7 | R / U / P | bits 100; next hand F1 |

At request 7 FIFO/Clock evict P while OPT/LRU evict S. At 8 LRU evicts P while OPT evicts T. Identical totals therefore do not imply identical histories. OPT reaches the lower bound of five first references to distinct pages under the stated model.

Separate counterexample, fresh empty state: `P R S P T R`. FIFO 2 hits/4 misses; LRU 1 hit/5 misses. Separate unseen exercise, fresh empty state: `P R S R T P R`. FIFO/Clock 1 hit/6 misses; LRU 2 hits/5 misses; OPT 3 hits/4 misses. Exercise terminal frames are FIFO/Clock T/P/R, LRU T/R/P, OPT P/R/T. They are not the main trace's terminal state.

Author arithmetic was checked with a separate small calculation. An independent Spec reviewer then recomputed and compared all 40 main rows and 28 exercise rows in each language, including victims, physical frames, OPT positions, queue order, bits/hand, totals, and the counterexample. No engine runtime observation is claimed.

## Verification record

- TDD served-page regression failed with HTTP 404 before the pair existed, then passed for both languages. It exercises direct presentation entry at `#fifo`, keyboard disclosure, deliberate next/back, and counterpart navigation.
- Dependency-order regression failed when Lecture 1 was still first, then passed with the required foundations entry. The contract now requires 26 lectures in nine phases.
- Focused suite: **65/65 passed**, zero skips. Includes both aggregate validator test files, seminar contract/regressions, browser prediction, mobile overflow, no-JavaScript access to all traces/exercise ledgers, and next/previous lecture routes.
- Broad suite: **177 tests; 174 passed, 3 failed**. Failures match ticket 01's previously baseline-reproduced failures: NEW_PAGE/B-tree source-range assertion; exact approved Markdown page inventory; stale private-LRU lecture title assertion. F01 does not edit those three tests or their affected technical content.
- Bilingual source gates individually pass for **50 pairs**: inventory, navigation, links/assets, technical parity, language/accessibility, static interaction, and audience contract. The full aggregate remains unsuccessful on missing human receipts/current review fingerprints across the site, including new/edited pairs.
- Bilingual served HTTP: **PASS, 250 resources**. Live DOM: **PASS, 101 pages**. Browser availability was established through the installed Playwright package, not skipped.
- Maintainer-guide source: **PASS, 43 pages**; links, English prose, and **60 displayed SVGs with zero orphans** pass. Served HTTP: **PASS, 103 resources**. Markdown live DOM: **FAIL, 43 pages**, because the existing Copyparty endpoint serves its `/.cpr/w/` scripts/styles with 404 or incorrect MIME; expected images consequently fail to render. This is a failed gate, not unavailable and not a pass.
- EN/KO Clock projection renders at 1440×1000 and entry reading renders at 390×844 were inspected. No horizontal page overflow was observed. Expanded ten-row tables require ordinary vertical scrolling in projection; shared controls remain available and reading mode exposes all sections.
- Scoped `git diff --check` passed. No TypeScript/build/typechecking configuration was added; this is static HTML and existing JavaScript test/validator work.

Reproduce with `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs` and base URL `http://127.0.0.1:3923/code-analysis/page-buffer-presentation`. Focused command: `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/seminar-browser.test.mjs`. Broad command: `node --test scripts/*.test.mjs`. Both aggregate scripts were run with `--copyparty-url <base-url>`; use the bilingual `--gate served` to isolate served checks from review currency.

Temporary diagnostic receipts: `/tmp/lru-F01-focused.log`, `/tmp/lru-F01-full.log`, `/tmp/lru-F01-bilingual.log`, `/tmp/lru-F01-served.log`, `/tmp/lru-F01-guide.log`, and `/tmp/lru-F01-{en,ko}-{projection,mobile}.png`. These are validation diagnostics, not retained runtime evidence or human review receipts.

## Independent review

### Standards

No blocking documented-standard breaches or actionable smell findings. The reviewer suggested defining “working set”; both languages now define P/R as the repeatedly needed set. Follow-up review cleared that change, the runbook, coverage, and no-JavaScript browser test.

### Spec

No findings or scope creep. Independent row-by-row arithmetic and final instructor/coverage review passed. This review does not replace browser execution or Korean-capable human review.

Summary: Standards 0 remaining findings; Spec 0 findings. Human Korean-naturalness and EN/KO semantic review against current fingerprints remains an explicit acceptance gate.

## Changed files

- `en/lessons/0000-replacement-foundations.html`, `ko/lessons/0000-replacement-foundations.html`, and `lessons/0000-replacement-foundations.html`.
- `en/index.html`, `ko/index.html`.
- `en/reference/course-learning-path.html`, `ko/reference/course-learning-path.html`.
- `en/lessons/0001-present-the-page-journey.html`, `ko/lessons/0001-present-the-page-journey.html`.
- `teaching-pages.json`.
- `scripts/seminar-contract.mjs`, `scripts/seminar-contract.test.mjs`, `scripts/seminar-browser.test.mjs`.
- `docs/curriculum-coverage.md`, `presenter-runbook.md`.
- This handoff.

Existing dirty design/planning files, ticket 01 content, and unrelated repository edits are excluded from the F01 commit.

## F02 interface

Use `#handoff` as the conceptual boundary. Continue P/R reuse interrupted by S/T/U scan traffic, explicitly choosing a named main-policy state or a fresh database checkpoint. Do not combine alternative terminal histories. Add in-use/dirty-page restrictions, writeback versus eviction, safety versus progress, durability/WAL prerequisites, concise cross-system comparisons, and conceptual PostgreSQL/InnoDB orientation.

Insert the database bridge between this entry and existing Lecture 1; update the dependency list, paired syllabus/landing routes, previous/next links, and browser route expectation together. The current F01-to-Lecture-1 route remains usable but does not claim the future bridge is already present.

Map the workload shape into ticket 01's independent 32768-frame CUBRID snapshot. Preserve that snapshot, source pin, counters, stable F42/F43 identities, and pending human-review gates. Do not reuse the three-frame arithmetic or equate exact LRU with CUBRID. F01 implementation is complete; no F02 implementation is included here.
