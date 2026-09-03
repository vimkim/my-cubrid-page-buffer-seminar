# Page-buffer maintainer-guide completion report

**Completed:** 2026-09-02
**Pinned CUBRID baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Original guide-redesign review fixed point:** `be16718`
**Question-bank implementation review fixed point:** `b4179ee`
**Scope:** `code-analysis/page-buffer-presentation/`

This report records the final validation of the English page-buffer maintainer-guide redesign. It is implementation evidence for documentation maintainers, not another reader route or a source of page-buffer behavior claims.

## Completion summary

- The prior stable entry, six Core pages, three playbooks, five Advanced pages, and two compact references remain complete. The ten approved Question-bank pages bring the aggregate discovery seam to 27 pages.
- The Question bank contains 74 immutable paired Canonical IDs: 30 Core, 25 Advanced, 15 Maintenance-scenario, and 4 Applied-exercise items.
- The complete disposition ledger contains 189 verified source items: 38 TEACH, 55 ADV, 24 HIST, 27 PLAN, 17 EXEC, 12 GRILL, and 16 Reader-intake questions, plus the 7 second-pass Reader questions recorded below.
- Every Reader-intake item maps to a Canonical answer; the unedited intake is SHA-256 pinned. Cross-database questions, runners, scoring, Korean prose, and unsupported defect/runtime claims remain outside Canonical routes.
- Every Core page has one Predict–Locate–Explain Understanding check and an adjacent evidence-aware model answer.
- The final visual set contains 9 displayed English SVGs and no orphaned asset: six from the guide cutover plus three added by the Reader-intake follow-up below.
- The [Migration audit](../maintainer-guide-notes.md#monolith-migration-audit) records a final destination or deliberate removal for every former monolith section and the retired visuals.
- Mutable `VS-*` status remains in the [evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md); guide pages route by ID.
- Organization-facing verification uses CMake, `ctest`, and project-provided test concepts.

## Commands and results

Run from `code-analysis/page-buffer-presentation/` unless stated otherwise.

| Command | Result |
|---|---|
| `node --test scripts/*.test.mjs` | PASS — 106/106 focused, aggregate-behavior, reader-contract, migration, Question-bank, and completion tests passed |
| `node scripts/check-maintainer-guide.mjs` | PASS — Markdown source 27 pages; relative links; 9 displayed SVGs, 0 orphaned; English prose; Question-bank topology, pairing, migration, and navigation |
| `node scripts/check-maintainer-guide-assets.mjs page-buffer-teaching-material.md` | PASS — compatibility entry delegated to the complete aggregate document-set validator |
| `python /home/vimkim/.agents/skills/markdown-write/scripts/check_copyparty_markdown.py page-buffer-teaching-material.md` | PASS — stable entry source is Copyparty-compatible |
| `copyparty -i 127.0.0.1 -p 39497 -v .::r --http-only --no-crt` | PASS — read-only local server exposed the guide root |
| `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:39497/` | PASS — deterministic gates plus Copyparty HTTP for 36 resources |
| `git diff --check` from the repository root | PASS — no whitespace errors in the implementation diff |
| `git diff --name-only b4179ee..HEAD -- code-analysis/page-buffer-presentation/` plus working-tree scope inspection | PASS — Question-bank work remained inside the page-buffer maintainer-guide tree; pre-existing unrelated work was not staged |

## Live-rendering gate

Copyparty HTTP requested every discovered page with `?v` and every displayed SVG: 36 resources returned successfully. At the original completion, Live DOM was explicitly unavailable because Playwright is not installed in this repository, so browser-evaluated image `naturalWidth`/`naturalHeight` and render-console checks were reported as unexecuted rather than passing. The second reader pass below ran that gate by linking a scratch Playwright install into the guide directory for the duration of one validator run: Live DOM PASS for all 27 pages, every displayed image with nonzero natural dimensions and no relevant render error. The link was removed afterwards; Playwright is still not a project dependency.

## Question-bank review verdicts

Independent Standards and Spec reviews compared the scoped guide diff against `b4179ee`; neither axis replaced the other.

- **Standards: PASS — 0 hard and 0 judgment findings unresolved.** Review findings were resolved by using the aggregate page map as the lower-level discovery source, replacing placeholder answer anchors with exact ranges, and sharing one Markdown heading-slug normalizer.
- **Spec: PASS — 0 substantive and 0 scope-creep findings unresolved.** Review findings were resolved by preserving and validating stable `PGBUF-Q001`–`PGBUF-Q055` source identities, enforcing each answer’s exact paired prompt anchor, linking comparison evidence for all eight excluded cross-database items, and adding temporary-page/metadata-setter ownership to `PGBUF-QB-044`.

## Reader-intake follow-up

The sixteen Reader-intake questions recorded against draft `b4179ee` were rechecked after the Question bank closed. Every one already had a Question disposition mapping to a Canonical answer (`READER-01` to `READER-16` in the migration audit), so the bank needed no new items. The questions did show that the Canonical explanation on Core page 2 used terms it never defined, so the follow-up changed the guide rather than the bank:

- **Core page 2** now defines the trace vocabulary readers asked about (hash candidate, VPID load lock and load owner, provisional BCB, DWB, page header identity, fix debt, stale-observation boundary), explains why the searcher and the load owner are decided by different mechanisms, explains why each of the three identity checks closes a different protection gap and notes that the release-time check is a debug assertion, walks the cold miss in order with its stall points, summarizes what happens when a latch cannot be granted now, and explains that holder attribution lives in per-thread holder lists rather than on the BCB. "Commit debt" wording was replaced by "fix debt". Related routes now link the Canonical questions that rehearse each point.
- **Visuals:** `fix-contract.svg` labels were reworded (identity recheck markers, page-header wording, "Fix debt recorded", "One success postcondition" with its four facts). Three visuals were added: `identity-check-timeline.svg` on Core page 2, `latch-wait-queue.svg` in the Advanced acquisition page's new hundred-writer worked case, and `allocation-progress.svg` in the Advanced replacement page's new no-free-BCB section.
- **Advanced pages** gained the two sections above with pinned anchors for the wait queue, timed sleep, zero-crossing wakeup, allocation loop, victim search order, and direct-victim consumption; the source map and source inventory route to them.
- **Validation** was extended: page tests assert the new vocabulary, sections, anchors, and visuals; the two asset-seam tests share one visual roster in `scripts/canonical-visuals.mjs`; the Reader-intake file remains unedited and digest-pinned.
- **Review:** a two-axis Standards and Spec review of the working tree against `1a0b679` found one hard wording contradiction ("ownership debt is committed" next to the rule against "commit debt"), one canonical-ownership duplication (the Core page restating the Advanced queue-walk rule), missing anchors on the cold-miss sequence, a non-canonical counter name, an anchor gap for `latch_last_thread`, a 7582/7590 range drift, an over-broad zero-wait statement, and a narrowed header-setter statement. All were fixed before commit; the roster duplication smell was resolved by the shared module.

Results after the follow-up: `node --test scripts/*.test.mjs` 106/106; `node scripts/check-maintainer-guide.mjs` PASS with 27 pages and 9 displayed SVGs; Copyparty HTTP PASS for 36 resources.

### Second reader pass

After the first intake was folded in, a second pass over the revised Core page 2 and the two new Advanced sections was recorded by an agent standing in for the reader, at the reader's request, as `questions-4fe4e7e/questions.md` (7 questions, digest-pinned, source population `READER2` in the migration audit and the question-bank contract). Every question maps to a Canonical answer, and each was removed from the pages:

- Core page 2 defines hash anchor and invalid list, names the source symbols behind "VPID load lock", and explains why a stale BCB pointer stays safe to lock (BCB storage is allocated once and freed only at finalization).
- The "Who holds this BCB?" paragraph was corrected: `pgbuf_dump()` prints per-BCB counts without thread identity, so no pinned routine attributes holders for an arbitrary BCB; the holder anchor is now defined.
- The Advanced pages define zero-crossing at first use and state that LRU3 is the victimization zone.

Results after the second pass: `node --test scripts/*.test.mjs` 106/106; `node scripts/check-maintainer-guide.mjs` PASS with 27 pages and 9 displayed SVGs; Copyparty HTTP PASS for 36 resources; Live DOM PASS for 27 pages with a temporarily linked Playwright.

## Boundaries not exercised

- No CUBRID engine build or runtime workload was run because this implementation changes documentation and its validation only; it does not change engine code or strengthen a runtime claim.
- The browser live-DOM gate was not run at the original completion because Playwright is not installed in this repository; it was run once during the second reader pass with a temporary scratch install. Repeating it requires providing Playwright again.
- The guide remains pinned to `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. Applying implementation claims to another revision still requires the update procedure in the authoring notes.
- Core source exercises are self-checkable, but an applied change-impact plan still requires a controlled caller regression or narrow runtime probe on the target revision and another maintainer's review.

## Learning-path visual pass

After the second reader pass, a pass over the six Core pages looked for relationships and state transitions that prose alone made hard to follow, and added five visuals. Each is owned by exactly one page, lives in the root asset seam, carries a `viewBox`, `role="img"`, a title, and a description, and states its meaning in text rather than color:

- `load-owner-waiter.svg` on Core page 2, between the trace vocabulary and the six steps: the VPID load owner and a load waiter on one time axis, with the hash anchor's two chains showing when the lock record exists and when the BCB is published. Its `t1`–`t7` markers are labelled as ordering the visual only, so they do not collide with the page's six steps.
- `latch-versus-lock.svg` on Core page 3, inside the contract ledger: the page latch and the transaction lock as protections over different objects with different lifetimes, both held by one heap insert.
- `mutation-ownership-spine.svg` on Core page 3, opening the caller trace: the six steps of `heap_insert_logical()`, the layer that owns each condition, and what each exit leaves, as the shape of the exit ledger the Understanding check asks for.
- `two-lsa-timeline.svg` on Core page 4, inside the two-LSA section: page LSA and `oldest_unflush_lsa` across two mutations, one flush, and a concurrent re-dirty, extending the worked example into generation G+1.
- `dirty-page-flush-actors.svg` on Core page 4, immediately after the flush purpose: the four independent server-mode page-buffer daemon roles, non-daemon selection/execution actors, common generation-flush convergence, and the separate DWB/direct-write routes. It explicitly rejects a master-plus-slaves model and marks the three page-buffer daemon roles that do not initiate page-image writes.
- `exceptional-return-gaps.svg` on Core page 6, in a new "The shape both packets share" section before Packet A: the common shape of the `VS-11` and `VS-12` packets, labelled as a map of where to look and not a defect claim, with status routed to the uncertainty registry. Packet A's prose now notes that the visible failure path asserts in a debug build before returning.

Every label was checked against the pinned source before drawing: `src/storage/page_buffer.c:2442-2546` (convergence, grant, publication, load-lock release), `7981-8178` (load owner and waiter), `4983-5055` (`oldest_unflush_lsa` initialization), `6440-6525` (grant before holder allocation), `10780-10930` (flush setup, early returns, rollback), and `src/storage/heap_file.c:23205-23324` (the insert spine and its exits). Each SVG was rasterized locally to confirm that no label overflows its box.

Validation was extended rather than relaxed: the shared roster in `scripts/canonical-visuals.mjs` and the roster count moved from 9 to 14; page tests for Core pages 2, 3, 4, and 6 assert each visual's placement between its neighbouring headings, its alt text, and its key labels; the authoring notes' asset contract and migration audit record the new visual kinds and the count.

Results after the pass: `node --test scripts/*.test.mjs` 111/111; `node scripts/check-maintainer-guide.mjs` PASS with 27 pages and 14 displayed SVGs, 0 orphaned; Copyparty HTTP PASS for 41 resources; Live DOM UNAVAILABLE because Playwright is not installed in this repository; `git diff --check` clean.

## Advanced visual pass

The five Advanced pages carried two visuals between them and three pages had none. This pass added seven, each owned by one page, kept in the root asset seam, and checked against the pinned source before drawing:

- `promotion-outcomes.svg` on the acquisition page, inside "Blocking promotion uses queue priority to preserve page state": the four outcomes of `pgbuf_promote_read_latch()`, with the internal holder gap, successful queue-head continuity, and hard-failure pointer boundary marked (`src/storage/page_buffer.c:2842-3050`).
- `ordered-watcher-refix.svg` on the acquisition page, inside "Ordered watchers": the conditional attempt, the canonical order of group, rank, and `VPID`, the release of held pages that sort after the request, and the refix with `page_was_unfixed` (`src/storage/page_buffer.c:12193-12240,12268-13531`, `src/storage/page_buffer.h:224-243`).
- `lru-domains-zones.svg` on the replacement page, inside the pinned-policy section: private and shared domains, the three zones of every list, and the search order of `pgbuf_get_victim()` (`src/storage/page_buffer.c:185-200,9067-9265`).
- `redo-lsa-gate.svg` on the recovery page, inside the redo section: the page-LSA comparison with a worked example from page LSA 140 (`src/transaction/log_recovery.c:497-536`, `src/transaction/log_recovery_redo.hpp:587-668`).
- `lifecycle-order.svg` on the recovery page, inside "Lifecycle dependency order": startup and shutdown chains mirrored around the pool (`src/transaction/log_tran_table.c:468-512,580-594`, `src/transaction/boot_sr.c:3055-3113`).
- `access-forms-compared.svg` on the specialized-interfaces page, after the scan-copy section: normal fix, simple fix, and scan-copy against the objects each touches (`src/storage/page_buffer.c:910-981,2688-2811`).
- `claim-levels-ladder.svg` on the failure page, inside "Five claim levels": the staircase of claim levels with the evidence that closes each; it avoids the word "defect" and routes status to the registry.

The authoring notes' asset contract no longer gates Advanced visuals on a prior reader question; a visual is added when state transitions or ownership relationships are materially harder in prose, whichever pass exposes that. The migration audit records the count. Each SVG was rasterized locally to check for overflow; one label collision and one wording slip were fixed before validation.

Validation was extended: the shared roster and its count moved from 14 to 21, and each Advanced page test asserts the visual's placement between its neighbouring headings, its alt text, its lead-in prose, and its key labels.

Results after the pass: `node --test scripts/*.test.mjs` 118/118; `node scripts/check-maintainer-guide.mjs` PASS with 27 pages and 21 displayed SVGs, 0 orphaned; Copyparty HTTP PASS for 48 resources; Live DOM UNAVAILABLE because Playwright is not installed in this repository; `git diff --check` clean.

## Quantitative replacement follow-up

The replacement lesson was expanded after a reader could not turn its policy
terms into concrete quantities or costs. Two source-verified visuals now show
the empty initial pool, first placement, sustained pressure, and the
zone-dependent result of reading the same BCB again. The canonical Advanced
page and paired English/Korean Lesson 0012 now distinguish LRU-object,
context-assignment, and BCB-membership lifetimes; give the exact shared/private
count and quota formulas; work a `Q = 1,000` example; separate the O(P)
private-LRU assignment scan from queue-directed cross-private victimization;
and provide a structural time/space ledger. The primary-source derivation is
kept in `reference/replacement-policy-quantities-and-costs.md`.

The crucial performance boundary is explicit: an ordinary cross-private victim
request does not enumerate open transactions or all private lists. It consumes
one advertised list index and scans at most 1,000 BCB nodes in that selected
LRU3. The new material labels contention and wall-clock behavior as unmeasured,
and explains that repeated reads combine current fix protection, a saturating
but approximate 64-fix migration heuristic, zone/age movement, and one
containing-LRU activity sample per adjustment epoch—there is no exact
per-page read-frequency victim score.

## Cross-engine replacement follow-up

Lesson 0018 was shortened to a responsibility-first comparison: all three
engines separately protect frame identity from reuse and page bytes from
incompatible access, but place those duties at different seams. Detailed
replacement material moved to paired Lesson 0018A pages. The new lesson asks
the same three questions of CUBRID, PostgreSQL, and InnoDB—admission, reuse
memory, and victim choice—then compares dirty-page progress and scan resistance.
It states exact pinned quantities only where primary source supports them and
does not infer a performance winner from source shape.

The detailed evidence lives in
`reference/cross-database-replacement-policy-comparison.md`, pinned separately
to CUBRID `f799e05`, PostgreSQL `fd2b898`, and MySQL/InnoDB `06a5c1c`. Two
English-only visuals distinguish the responsibility seams and the three
replacement paths. The bilingual inventory now contains 43 paired pages.

## Page-buffer daemon follow-up

Reader question 9 promoted the four page-buffer daemon roles from a compact
Lesson 0006 table into paired Lesson 0006A pages. The new lesson traces each
single-thread daemon by trigger, shared input, work loop, output, lock shape,
structural cost, and persistence boundary. It also visualizes that page-flush
and post-flush form a conditional producer/consumer pair, while maintenance and
flush-control operate independent policy and post-write pacing loops. The
bilingual inventory now contains 44 paired pages.

The primary-source re-audit corrected two tempting summaries. Flush-control
tokens are consumed after the OS write and act as a soft throttle on subsequent
progress, not pre-write permission. More importantly, the pinned
`pgbuf_direct_victims_maintenance()` private/shared loops fail their first
condition and do not enter as written; `nassigns = 5` is an outer continuation
budget, not a strict assignment cap. The uncertainty registry owns this
source-visible, runtime-unproven condition as `VS-20`. Existing Core, Advanced,
source-inventory, and expected-team-question routes were corrected so intended
maintenance behavior is not presented as verified execution.

## Victim-scan cap and AOUT follow-up

Reader question 10 separates three source values that previously looked like
one limit. One `pgbuf_get_victim_from_lru_list()` call follows intrusive
`prev_BCB` links through LRU3 of one already selected LRU and stops after at
most 1,000 BCB visits; this does not cap the number of private LRUs. At the
pinned baseline, a positive explicit `num_private_chains` is floored to four
and capped at 4,050 by parameter validation, while the default `-1` expands to
`MAX_NTRANS + 50` without a 1,000 clamp in the initializer. A new Core visual
keeps selected-list depth, list count, and whole-helper zone-demotion work
separate.

The Advanced replacement page and paired English/Korean Lesson 0007 now give
AOUT one canonical explanation. AOUT is a bounded global FIFO/hash of ghost
records `{VPID, former lru_idx}` rather than a second resident cache. The
dormant admission branches distinguish first-seen, same-private refault, and
cross-private refault pages. The disablement evidence is explicit: historical
CBRD-20741 records an assertion/core, CBRD-21135 says its cause was unknown,
commit `d3554deee3a5` added the override, and pinned parameter tuning still
forces the ratio to zero. The guide therefore describes possible scan-
resistance benefits as inference, not measured improvement, and states that
removing the override alone is not a safe revival plan. Exact derivations and
version boundaries live in
`reference/victim-scan-cap-and-aout-evidence.md`.

## Private-domain, hit-age, and unfix-placement follow-up

Reader questions 11 and 12 exposed that Lesson 0012 used “private domain” and
`adjust_age` before establishing their concrete owners. The lesson now starts
with a four-step model: a session or vacuum worker borrows a private-list-local
number, an executing thread carries it in `private_lru_index`, a BCB records only
one current full LRU index/zone, and ordinary placement or movement happens at
the final global-`fcnt` zero crossing. Paired English/Korean pages and the quick
reference now state that multiple sessions can share one private LRU and that
releasing an assignment neither drains the list nor moves its BCBs.

Two new English-only SVGs visualize the distinct lifetimes and the final-unfix
state machine. The migration drawing makes the lock protocol explicit: unlink
from private, publish transient VOID, then insert at shared LRU2 middle, while
the BCB mutex remains held and the two LRU mutexes are acquired sequentially.
The structural cost ledger now distinguishes O(1) intrusive edits, O(D) zone
repair, O(P) private assignment, and O(T + L + D) accepted quota work.

The `adjust_age` explanation now identifies its sole producer: only an accepted
`pgbuf_adjust_quotas()` pass increments the epoch. The 100-ms maintenance loop
only attempts the function, and several time/activity gates can return first.
`hit_age` therefore de-duplicates a BCB to at most one current-LRU hit per
accepted epoch; it is not elapsed time or a per-page victim score. Exact pinned
derivation and unresolved sampling/wrap boundaries live in
`reference/private-lru-domain-hit-age-and-unfix-placement.md` and `VS-21`.
