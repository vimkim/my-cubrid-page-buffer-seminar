# Ticket 05 integrated delivery and acceptance

Status: technical implementation and available verification complete; final acceptance remains open for actual human language review and the disclosed inherited failures. No actual Korean-naturalness or semantic-review receipts were supplied. Automated and agent reviews cannot supply those receipts.

Base: `e716618` (combined implementation `b87c7d5`). Implementation commit: `af2fe44`; the following evidence commit completes this handoff. Work item 216 remains main-owned; work item 55 tracks the required human language review. This ticket owns final routes, presenter itinerary, coverage, acceptance evidence, one served-page integration regression, and a narrow pinned InnoDB source-link correction. No engine changes, pushes, simulator dependency, native experiment, stored participant response, or automated mastery claim was introduced.

## Acceptance mapping

| Requirement | Delivered artifact or open gate |
| --- | --- |
| Complete bilingual entry/resume routes | Both Topic libraries expose the worked example; both syllabi add `replacement-route` with admission, cooling, selection/progress, policy proposal, and final-defense links. Existing lecture URLs and 27-lecture dependency order remain. |
| Presenter guidance | The author-only runbook adds an integrated itinerary with prediction pauses, source tasks, branch starts, return rules and human discussion. |
| Complete trace and source audit | See state/evidence audit below and prerequisite handoffs. Authored histories remain independent where explicitly reset. |
| Canonical explanation ownership | Existing evidence links remain; the only canonical correction narrows the actual InnoDB insertion/caller route and short-list exception. |
| Pairing and parity | 51 pairs remain declared. Four edited pairs (landing, syllabus, worked example, Lecture 18A) retain pending reviews. Agent comparison is technical editorial inspection, not human naturalness acceptance. |
| Aggregate and browser validation | Executed results below: 74/74 focused tests, 51-pair technical gates and 253-resource/103-page bilingual served checks pass. Inherited broad-test and guide DOM failures remain explicit. |
| Acceptance summary and participant rubric | This record separates technical delivery from human acceptance; the rubric below describes human evidence without grading or storing responses. |
| Scope boundaries | No simulator, engine policy change, runtime result, answer store or mastery score. |

## State and evidence audit

The abstract F1 policies each begin empty with frames F0/F1/F2 and sequence P R P S P R T U P R. FIFO and Clock finish R/U/P; LRU U/P/R; OPT P/R/U. Hits/misses are 3/7 for FIFO/LRU/Clock and 5/5 for OPT. Clock finishes with bits 100 and next hand F1. The independent unseen sequence P R S R T P R gives FIFO/Clock 1/6, LRU 2/5, OPT 3/4. DB-A/B/C reset to P/R/S and add their own pin/dirty assumptions; none inherits a policy terminal state. The CUBRID model carries the workload shape into a separate 32,768-frame snapshot.

The ordinary CUBRID path starts with 30,768 INVALID plus 2,000 resident frames. Admission ends with 30,766 INVALID plus 2,002 resident, private counts 4/48/50 and tick 1002. At S49 combined-zone demotion moves Z48 before zone1 demotion moves P. P's final-unfix age 51 exceeds 25; saved tick 1000 remains. B's domain mismatch moves F42/P sequentially through protected VOID into shared 1 LRU2. It does not duplicate P or add another epoch-10 sample.

After all 30,766 scan admissions, private 30,867 + shared 0's 1,900 + shared 1's P = 32,768; INVALID is zero. Quota adjustment changes thresholds to 250/250 without promoting existing nodes, leaving private counts 50/50/30,767. List tick is 31,769, quota epoch 11, P/R hit_age 10. The first selected helper is private list 32, with C50/Q at the bottom; the checkpoint stops before allocation. Restricted fallback is conditional, not another executed event.

Reuse S resets there: linked/hash counts progress 32,767/32,768 after detach, 32,767/32,767 after Q removal, then 32,767/32,768 after T publication. C50/T is READ, fcnt 1, VOID; stop before final unfix. F42/P remains shared LRU2. R rejection schedules never detach Q. F adds a logged vacuum-worker schedule: clean completion leaves Q linked and clean; re-dirty preserves G+1 DIRTY and oldest LSA (100,30). D restarts F's dirty pre-copy state, collects before A waits, then post-flush reserves Q. Consumption detaches under protection; B's intervening refix revokes the offer and A retries while Q stays linked and B retains its READ fix. No bound on fairness/completion is inferred.

Policy Reset A starts at checkpoint 3: baseline tick 1002 versus hypothetical 1003. Reset B starts at S49: both reach 1052 after A's unfix; B's hypothetical hit adds one extra private tick before both migrate P to shared 1 at shared tick 1/saved tick 0. The fresh ten P,R-pair counterexample yields 20 hits/0 misses in both, ticks 1002 versus 1022. These policy histories never overwrite the ordinary selection baseline. The proposal remains hypothetical and requires its stated lock/identity/zone/progress proof obligations.

Pinned authority is CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; detailed state/source routes remain owned by [ticket 01](ticket01-handoff.md), [F01](F01-handoff.md), [F02](F02-handoff.md), [ticket 02](ticket02-handoff.md), [ticket 03](ticket03-handoff.md), and [ticket 04](ticket04-handoff.md). Dormant AOUT, VS-19/20/21, G/G+1 notation, DWB boundary and constructed-versus-runtime limitations remain visible. Comparator correction was checked against MySQL `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8`: `buf0lru.cc:855–927` implements insertion, `buf0buf.cc:4960–4975` calls it with old=true; short lists use the head. The old 642–733 route described boundary setup.

## Participant rubric

Human reviewers can accept a defended rejection, narrowed proposal, or conditional adoption. Ask participants to produce:

| Evidence | What the reviewer checks |
| --- | --- |
| Independent hand trace | Correct page/frame distinction, victims, policy metadata and hit/miss totals, including an unseen sequence. |
| Source-backed state prediction | Explicit initial state and event; controlling predicate, owner/guard, conserved counts, and correct after state. |
| Concurrent scenario explanation | Preference versus safe reuse, generation versus current dirty state, reservation versus ownership, explicit reset and a permitted next event. |
| Policy defense | Precisely bounded change, baseline/alternative comparison, preserved invariants, counterexample, synchronization costs and workload limits. |
| Verification plan | Concrete race/failure checks and controlled measurements, with supported and unsupported conclusions stated separately. |

Use the [participant policy-defense model](../../en/reference/lru-worked-example.html#policy-defense) and [Korean counterpart](../../ko/reference/lru-worked-example.html#policy-defense). Individual Completion records stay outside the published site. Page visits and automated checks establish neither participant mastery nor language acceptance.

## Verification and remaining gates

All runs below used the original worktree and actual Copyparty endpoint on 2026-09-29. No plain-file HTTP server is substituted for Copyparty. The content was unchanged between the final broad, served, and focused runs; subsequent edits only record evidence and issue status.

- **Focused: 74/74 passed, zero skipped.** Both validator suites, seminar contract/regressions and 16 browser tests cover foundations, database constraints, admission, cooling, selection, reuse/progress, and policy defense in both languages. Controls include keyboard reveal, direct presentation entry, previous/next, history/branch reset, language and lecture navigation, 390px no-JavaScript reading, all authored traces and native answers.
- **Broad final: 186 tests, 183 passed, 3 failed, zero skipped.** The inherited failures remain NEW_PAGE/B-tree source-range assertion, exact approved Markdown inventory, and stale private-LRU lecture title. The first run was 182/186: it also exposed an existing same-document `goBack()` assertion race. Waiting for the returned hash and visible branch fixed that test; final broad and focused runs passed it. Neither failed run is reported as wholly passing.
- **Bilingual source: all seven technical gates passed for 51 pairs.** Inventory, navigation, links/assets, technical invariant parity, language/accessibility, static interactions and audience contract pass. The full aggregate ran and fails on missing human receipts/current fingerprints; it does not certify natural Korean or semantic acceptance. Fingerprints were printed for review preparation, with no manifest approval written.
- **Actual bilingual served: HTTP PASS 253 resources; live DOM PASS 103 pages.** This includes rendered image natural dimensions and relevant render errors, as well as the existing responsive/presentation/no-JavaScript checks. The separately run served gate exposes these results independently from human-review failure.
- **Maintainer Guide: source PASS 43 pages; relative links PASS; SVG PASS 60 displayed/0 orphaned; English prose PASS; HTTP PASS 103 resources. Live DOM FAIL 43 pages.** Existing Copyparty `/.cpr/w/` script/style URLs return 404 or incorrect MIME, so rendered Markdown checks fail. Browser automation was available: this is a failed gate, not an unavailable skip. No server repair was authorized or attempted. A separate source-only invocation passed; its omitted HTTP/DOM gates were explicitly UNAVAILABLE and are superseded by the executed served result here.
- **Visual inspection:** English and Korean policy-comparison projections at 1440×1000, syllabus reading at 390×844, and the newly added resume section were inspected. Text and controls are legible, no horizontal page overflow was observed, and dense expanded tables continue with normal vertical scrolling. Screenshots supplement browser behavior; they are not language-review receipts.
- **Source/trace audit:** read exact pinned unfix/migration 6752–6848/7005–7038, zone/boost 9985–10199, quota 14263–14511, victim scan 9265–9538, retirement 8644–8690, generation flush 10760–10960, refix invalidation 2384–2388 and direct assignment/consumption 15420–15654. Independently recalculated the main toy trace and checked preserved numerical/identity/branch boundaries against the page and prerequisite handoffs. No new CUBRID content contradiction was found; the comparator citation/short-list qualification was the narrow correction. This source audit is not a runtime experiment.
- `node --check` passed for shared seminar JavaScript and the changed browser test. Copyparty Markdown source checks passed for all five changed/added author/reference/issue Markdown documents. Scoped `git diff --check` passed. There is no TypeScript/build step for this static HTML/JavaScript change, and no validator implementation changed.

Reproduction: set `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs` and `SEMINAR_URL=http://127.0.0.1:3923/code-analysis/page-buffer-presentation`. Focused command: `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/seminar-browser.test.mjs`. Broad: `node --test scripts/*.test.mjs`. Run both aggregate scripts with `--copyparty-url` set to that base; bilingual `--gate served` isolates HTTP/DOM. The seven source gates are `inventory`, `navigation`, `links`, `technical`, `language`, `static`, `audience`.

Supplemental local diagnostics: `/tmp/lru-ticket05-{full,full-final,focused,bilingual,served,guide}.log`; screenshots `/tmp/lru-ticket05-{en,ko}-{projection,mobile,mobile-route}.png`. These temporary files are diagnostics, not runtime or human-review receipts; the durable actual results and limitations are stated above.

## Independent reviews

### Standards

No actionable documented-standard violations or Fowler smells in `e716618...af2fe44`. Paired route/title/qualification wording preserves technical meaning; presenter instructions remain outside audience navigation; canonical InnoDB correction stays narrow; browser regression follows existing structure. Final follow-up checked the handoff and issue against actual logs and closed with zero findings; failed gates and missing human acceptance remain accurately distinguished.

### Spec

No implementation/content findings in `e716618...af2fe44`. Independent review confirmed routes, reset boundaries, full-route wording, presenter itinerary, coverage and no-JavaScript keyboard regression; independently checked the MySQL insertion/caller and short-list exception. Final follow-up checked state/scope and the handoff/issue against actual logs, closing with zero remaining findings. Agent review supplies no human receipt.

Final review summary: Standards 0 findings; Spec 0 findings. Final acceptance remains open: obtain actual Korean-naturalness and EN/KO semantic-review receipts against current fingerprints (work item 55), and resolve or explicitly disposition the three inherited broad assertions and the Copyparty Markdown DOM failure through their owners. This ticket does not repair the server or assert participant mastery.

## Files and downstream contract

Changed pairs: `en/` and `ko/` landing, `reference/course-learning-path.html`, `reference/lru-worked-example.html`, and `lessons/0018a-compare-replacement-policies.html`. Other paths: `presenter-runbook.md`, `docs/curriculum-coverage.md`, `reference/cross-database-replacement-policy-comparison.md`, `scripts/seminar-browser.test.mjs`, this handoff, and ticket 05 status. Pair inventory stays 51; all four affected pairs were already pending. No source histories, shared UI implementation, assets or participant records were changed. Main-owned orchestration/prerequisite ticket status and unrelated dirty files are excluded from this ticket's commits.

Stable existing anchors and branch boundaries remain the interfaces for future edits. Use the syllabus `replacement-route` for resuming; keep hypothesis ticks separate from the ordinary `selection-baseline`. Source/version changes require another evidence audit, and any wording edit invalidates a corresponding human fingerprint receipt. Technical delivery can be handed off now; human acceptance cannot be inferred from these checks.
