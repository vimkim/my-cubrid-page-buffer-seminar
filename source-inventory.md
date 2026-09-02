# CUBRID page-buffer teaching corpus: source inventory and reconciliation

This inventory consolidates the two requested local trees without treating every
file as equally authoritative:

- **`FIELD/`** = [`../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/`](../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/)
- **`PGBUF/`** = [`../../pgbuf-analysis/`](../../pgbuf-analysis/)

It was prepared for a teaching document aimed at senior engineers who know
systems and database concepts but do not yet know CUBRID. It inventories the
available explanations, evidence, diagrams, experiments, and exercises; resolves
the important overlaps; and identifies claims that must remain revision-bound or
explicitly uncertain.

## Evidence labels used here

| Label | Meaning |
|---|---|
| **Verified** | Checked against pinned first-party CUBRID source, an accepted raw runtime receipt, or both. |
| **Inferred** | A defensible explanation derived from source structure, but not an explicit guarantee and not runtime-proven for every interleaving. |
| **Historical observation** | Observed in one pinned build/workload; useful as a case study, not a universal count or performance claim. |
| **Historical/design note** | A proposal, defect candidate, reimplementation plan, learning record, or document tied to a different revision. |

## Executive recommendation

Use the material in this order:

1. **Teaching spine:** `PGBUF/f799e05_claude/CUBRID_PAGE_BUFFER_PRESENTATION_KO.md`.
   It already has the strongest senior-onboarding progression: independent state
   axes, vocabulary and scale, caller acquisition choices, complete fix/unfix,
   ordered fixing, durability, replacement, callers, runtime evidence, comparison,
   contract cards, 55 source-grounded questions, and a source map.
2. **Evidence authority:** `FIELD/evidence/claims.jsonl`,
   `FIELD/chapters/11-contract-evidence.html`, and the pinned CUBRID source at
   `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. The claim ledger contains 30
   source-traceable claims and 114 pinned references; the report audit reviewed
   the complete old report scope.
3. **Presentation-sized lifecycle explanations:** `FIELD/notion/page-buffer-guide.md`
   and `FIELD/chapters/01-orientation.html` through
   `07-dirty-wal-flush-replace.html`.
4. **Deep appendices:** `PGBUF/e6ed61e_claude/01-structures.md` through
   `06-misc-observability.md`, plus the three CUBRID fact sheets in
   `PGBUF/research/`. These are excellent for source Q&A, but they mix revisions
   and contain design/defect interpretation that should not interrupt the main
   lesson.
5. **Exercises:** use the compact retrieval questions in
   `PGBUF/teach-course/reference/pgbuf-question-bank.md`, the four reproducible
   `FIELD/quiz/quiz-*` exercises, and selected prediction questions from the two
   presentation documents. Keep answers visible or immediately adjacent, as the
   course notes require.

The central teaching model should be:

> A successful fix creates a temporary ownership contract over the bytes for one
> logical page. Residency, ownership, content concurrency, durability, and
> replacement are interacting but independent state axes. The caller completes
> correctness by choosing the right fetch/latch protocol, logging and dirtying in
> the right order, revalidating after temporary release, and repaying every fix.

This model is supported by the pinned `pgbuf_fix_release`, latch/holder,
`pgbuf_unfix`, caller, flush, and victim paths at CUBRID `f799e05`:
`src/storage/page_buffer.c:2260-2685`, `3062-3201`, `6277-6883`,
`8392-8634`, `9314-9538`, `10723-10962`; representative callers are
`src/storage/heap_file.c:25543-25625`, `src/storage/btree.c:16867-17013,
23734-24089`, and `src/transaction/log_recovery.c:6399-6431`.

## Revision and provenance map

| Corpus | Revision / state | What it may prove | Important boundary |
|---|---|---|---|
| `FIELD/` | CUBRID **`f799e05d77d…`**, clean detached source at capture time; PostgreSQL `fd2b8985…`; MySQL `06a5c1c…` | Audited source claims and four narrow CUBRID runtime signatures | Report audit is **APPROVED for its declared scope**, but the mastery grill is unfinished (`WAIT_FOR_USER`), so do not call the whole learning run complete. |
| `PGBUF/f799e05_claude/` | Claims use unmodified CUBRID **`f799e05d77d…`**; monitoring used the same revision plus logging-only probe commit **`75d64f959…`** | Expanded interface/caller coverage and an instrumented whole-pool trace | Probe runs are lab observations, not stock-binary timing evidence. |
| `PGBUF/research/cubrid-*.md` | A non-stock analysis tree incorporating `f799e05`, `77c1f2572`, and `f876fdc93` is declared in `cubrid-structs-fix.md` | Very detailed data-structure/replacement/flush fact sheets | Recheck line numbers and changed interfaces before using as present-source authority. |
| `PGBUF/e6ed61e_claude/` | CUBRID **`e6ed61e87d…`** (2026-08-15) | Deep implementation notes, formulas, reimplementation plan, and issue candidates | Later than `f799e05`; includes mechanisms and issue analysis not in the frozen audited report. Treat all exact layout, line, and interface claims as revision-bound. |
| `PGBUF/cubrid-page-buffer-report_5cd4f860e_claude.html` and `pgbuf-defects-report_5cd4f860e_claude.md` | CUBRID **`5cd4f860ec…`** (2026-08-03) | An approachable broad overview and historical defect/observability survey | Oldest material. Useful for analogies and issue history, not current source lines or unconditional defect status. |
| `PGBUF/teach-course/` | Pinned teaching authority is **`f799e05d77d…`**; notes and learning state updated through 2026-09-01 | Short lessons, printable references, progressive questions, and demonstrated learner gaps | Stateful personal learning record, not a general correctness audit. Several files are currently user-modified; consume them as live course material. |
| Local CUBRID checkout inspected during research | HEAD observed as **`b92a5c8b062…`**, dirty and on a different development line | Read-only comparison of what has changed | Not suitable as the authority for `f799e05` citations. Historical validation must use `git show f799e05:<path>` or a clean worktree. |
| Local first-party CUBRID manual inspected during research | HEAD **`3b6ae97bfbd…`**, clean | Public parameter and `SHOW` documentation | The manual documents public behavior, not undocumented internal state machines. Relevant anchors: `en/admin/config.rst:713-719` and `en/sql/query/show.rst:1881-1921`. |

The current CUBRID checkout differs materially from `f799e05` in
`page_buffer.c/.h`; for example, later branches add/remove interfaces and
instrumentation. Therefore this inventory uses `f799e05` symbol-plus-line anchors
for the teaching baseline and labels later observations rather than silently
normalizing their line numbers.

## Detailed document inventory

### 1. `FIELD/`: audited lifecycle-centered field guide

#### Front matter, scope, and portable views

| Document | Purpose and scope | Unique value | Reuse decision |
|---|---|---|---|
| `index.html` | Entry page for the 11-chapter offline book and evidence labels | Fast navigation through the sealed report | Link from teaching material as the deep field guide, not as a slide itself. |
| `report.json` | Machine-readable central behaviors, coverage obligations, experiments, quizzes, and report state | Proves the intended structure: four behavior families and 18 coverage obligations | Reuse to audit topic coverage; it is metadata rather than prose. |
| `provenance.json` | Frozen repository identities, heads, cleanliness, remotes, and baseline hashes | Strongest revision provenance in the corpus | Cite when explaining why claims are revision-specific. Its keys are repository-oriented rather than a single `source_commit` field. |
| `research/scope.md` | Frozen question, audience, included dependencies, four central behaviors, exclusions, and evidence policy | Explicitly separates source truth, runtime observation, and analogy | Reuse its exclusions in the new document's evidence policy. |
| `notion/page-buffer-guide.md` | Portable Korean 50–60 minute companion covering object graph, complete fix, latch/holder/unfix, callers, durability, comparisons, Q&A, and source-closed checklist | Best concise Markdown from the audited report; contains Mermaid plus presenter runbook | Mine its flow and compact explanations, but prefer the larger `PGBUF/f799e05_claude` deck where the two overlap. |

#### The 11 HTML chapters

| Document | Purpose | Unique evidence or pedagogical contribution | Duplication / boundary |
|---|---|---|---|
| `chapters/01-orientation.html` | Audience, five questions, four independent state axes, reading paths | Cleanest opening mental model and the “buffer hit can still block” prediction | Duplicated and expanded by the later Korean deck §1–4. Keep the state-axis framing. |
| `02-boundary-ownership.html` | Module seams and VPID→BCB→frame→`PAGE_PTR` ownership | Small ownership ledger with lifetime and reclamation guards | Merge with the later deck's six-noun vocabulary and contract SVG. |
| `03-state-machines.html` | Orthogonal residency/latch/durability/replacement state machines | Explicit warning against one scalar “page state” and a failure transition table | Useful as an early whiteboard diagram; do not expand into full startup/shutdown here. |
| `04-fix-lookup-load.html` | Fast hit, normal hit, miss owner/waiter, load, publish, retry, and failure paths | Concise complete call flow plus cold/warm runtime card and duplicate-residency explanation | Authoritative within `CUBRID-C001/C005` limits. The phrase “one loader” means one resident-identity load protocol, not a universal claim about physical device reads. |
| `05-latch-holder-unfix.html` | Latch modes, conditions, holder/global counts, waits, promotion, and release | The two-ledger exercise (`fcnt=3`, holder `fix_count=2`) and holder-allocation failure boundary | Merge with later deck §5; preserve that page latch, transaction lock, and fix ownership are different. |
| `06-caller-contracts.html` | Heap watcher, B-tree latch coupling/restart, recovery fix/LSA gate | Best compact evidence that the page buffer cannot complete caller correctness alone | Representative callers only; not a call-site census. |
| `07-dirty-wal-flush-replace.html` | Dirty generation, WAL-before-data, DWB/direct write, re-dirty, victim eligibility/policy | Separates memory/log/data moments and eligibility from selection policy | Keep in main lesson. Early TDE/DWB failure behavior remains a source-confirmed candidate needing fault injection. |
| `08-experiments.html` | Four controlled experiments and counter semantics | Strong “`ioreads` is not physical disk I/O” teaching moment and evidence limitations | Use as an evidence-literacy appendix or a short case-study segment. |
| `09-comparison.html` | Same-responsibility comparison with PostgreSQL and InnoDB on 13 axes | Prevents API-name equivalence and classifies partial analogy/no equivalent | Retain only selected comparisons after CUBRID is understood. Comparator sources are pinned separately. |
| `10-blueprint.html` | Reimplementation contract, invariants/tests, glossary, teaching map, pressure questions | Converts understanding into proof obligations and includes model answers | Best source for exercises and “how to modify safely”; reimplementation details belong in an appendix. |
| `11-contract-evidence.html` | Complete interface/state/failure/lifecycle/recovery/observability evidence appendix | Highest-density source map and explicit current-revision hazards | Treat as the canonical lookup appendix, not presentation prose. |

#### Research packets

| Document | Purpose | Unique value | Reuse decision |
|---|---|---|---|
| `research/packets/cubrid.md` | Broad source reconstruction of CUBRID ownership, callers, flush, lifecycle, and error paths | Source anchors behind the Korean chapters; includes startup/shutdown and uncommon failure branches | Use to verify claims, not to teach linearly. |
| `postgresql.md` | Pinned PostgreSQL buffer-manager reconstruction | Primary-source basis for pin/content-lock, publication, clock sweep, FPI, checkpoint analogies | Reuse only responsibility-level contrasts. |
| `mysql.md` | Pinned MySQL/InnoDB reconstruction | Primary-source basis for MTR memo, midpoint LRU, redo/doublewrite, clustered-leaf contrasts | Reuse only responsibility-level contrasts. |
| `pedagogy.md` | Teaching research and proposed ordering | Evidence for progressive disclosure, prediction, teach-back, and difficult questions | Mine structure and presenter technique; implementation claims still come from code packets. |
| `experiments-and-quizzes.md` | Experimental design, counter caveats, reproducibility, and quiz plans | Explains why controls, raw receipts, and “not proven” statements matter | Reuse for instructor notes and experiment limitations. |

#### Evidence ledger and audit

| Artifact group | Contents and purpose | Reuse decision |
|---|---|---|
| `evidence/claims.jsonl` | 30 claims: 12 CUBRID, 4 PostgreSQL, 4 InnoDB, 10 comparisons; each includes revision, confidence, source ranges, hashes, limitations, and report locations | Canonical machine-readable evidence source for the new material. |
| `evidence/report-audit.{md,json}` | Independent round-4 audit, exact reviewed-file set/hashes, verdict `APPROVED` | Cite approval only as “ready within the old declared scope.” The audit could not perform live browser DOM/console validation. |
| `evidence/runtime-tools-*.json` | Exact tool/build/runtime identity snapshots | Retain for reproducibility; do not teach directly. |
| `evidence/baseline/*` | Repository status/diff captures for CUBRID, PostgreSQL, and MySQL | Provenance support; empty diffs establish clean cited files at capture time. |
| `evidence/runs/*/{meta.json,stdout.txt,stderr.txt}` | Raw build, setup, experiment, quiz, cleanup, and rebind receipts | The accepted `rebind-*` receipts are authoritative for final reported experiment numbers. Earlier `exp*-observation-*` and failed attempts are history, not alternative final results. |
| `grill/mastery.json`, `grill/session.jsonl` | Stateful mastery interview record | Shows the grill is unfinished; useful only to avoid claiming learner mastery. It is not implementation evidence. |

The audit says 258 exact report materials were reviewed. The directory now
contains more run/build history than should appear in teaching prose. Do not turn
raw run directories into a reading assignment; link the accepted receipt only
from the relevant experiment card.

#### Experiments

| Experiment | What was actually observed | What it supports | What it does **not** prove |
|---|---|---|---|
| `experiments/experiment-1/` — cold miss / warm reuse | **Historical observation:** identical 10,000-row checksums; accepted rebind run had `Num_data_page_ioreads` **38 → 0** | A cold page-buffer load signature followed by resident reuse, consistent with `CUBRID-C001/C005` | Exact VPID/frame, DWB versus volume source, OS device miss, duplicate-loader schedule, or universal second-run zero. |
| `experiment-2/` — holder/promotion/dirty | Empty read promotion 0; insert detailed promotion **689**; dirty-setting calls **102125**; dirty WRITE/MIXED unfix activity | Mutation and read-only phases have distinct holder/latch/dirty signatures | One promotion/dirty per row, actual latch contention, waiter fairness, or immediate durability. Ignore derived `69589.00` as an oracle. |
| `experiment-3/` — B-tree covered/non-covered and heap | Covered projection `100/0`; payload projection `0/100`; update 100 rows and **300** dirty calls | Caller-family signatures and B-tree→heap handoff | Exact C stack, all-exit cleanup, ordered-refix schedule, or recovery fetch path execution. |
| `experiment-4/` — dirty generation / backup boundary | Generation min/max `1/1`, 10,000 rows, zero length violations, **58430** dirty calls, accepted backup success | Expected mutation/commit state and a synchronous operational boundary | Per-page WAL-before-data order, DWB completion, physical victimization, crash recovery, or data-page write count. |

Each experiment directory contains `experiment.md`, SQL input, expected oracle,
manifest, and stderr. Root scripts and setup files manage the owned database.
Keep the explicit cleanup/ownership restrictions if an exercise runner is reused.
The first backup attempt failed because the target directory was absent; only the
accepted rebind backup receipt is evidence of success.

#### Quizzes and visual assets

| Artifact | Purpose | Reuse decision |
|---|---|---|
| `quiz/quiz-1/` | Predict cold versus warm signatures and distinguish OS cache from page-buffer residency | Good first evidence-literacy exercise after the fix path. |
| `quiz/quiz-2/` | Holder/global count, conditional failure, latch versus transaction lock | Best exercise immediately after ownership/latch lesson. |
| `quiz/quiz-3/` | Covered/non-covered caller path, cleanup, ordered refix, recovery LSA | Use after caller contracts; keep source answer beside runtime limits. |
| `quiz/quiz-4/` | Dirty/LSAs/WAL/re-dirty/victim predicate and database analogies | Use near the end; it integrates most lifecycle axes. |
| `quiz/{start-suite,stop-suite,run-one}.sh` | Controlled quiz runner | Operational support, not presentation content; preserve exact owned-DB checks. |
| `assets/fix-lifecycle.svg` | VPID→lookup→hit/miss→latch/holder→borrow→unfix | Reusable compact lifecycle visual, though the later contract SVG is clearer about converged postconditions. |
| `assets/latch-state.svg` | NO_LATCH/READ/WRITE/wait-or-reject state sketch | Reuse after explaining mode versus condition; it deliberately omits queue details. |
| `assets/wal-flush.svg` | Mutation→dirty/LSA→snapshot→WAL→DWB/data→completion/re-dirty | Reuse or redraw in Mermaid; preserve the red re-dirty arc. |
| `assets/three-db.svg` | Three-engine responsibility comparison | Use only after CUBRID semantics; it is a summary of partial analogies, not equivalent APIs. |
| `assets/report.css` | Offline book styling | No conceptual content. |

### 2. `PGBUF/`: broad analyses, expanded presentation, and course

#### Historical broad report at `5cd4f860e`

| Document | Purpose and unique value | Reconciliation |
|---|---|---|
| `cubrid-page-buffer-report_5cd4f860e_claude.html` | Friendly end-to-end introduction using a library/desk analogy; covers structures, fix/unfix, replacement, direct victims, durability, DWB, PostgreSQL, InnoDB, comparison, code map, and observability | Best source for approachable metaphors, but older than both primary teaching baselines. Extract metaphors, not source lines/defaults/defect status. |
| `pgbuf-defects-report_5cd4f860e_claude.md` | Eight defect/observability/documentation findings from seminar preparation | Historical issue input. Several entries are explicitly latent, usability, observability, or documentation findings. Verify against the chosen revision and issue history before calling any one a current defect. |

#### Deep `e6ed61e` technical set

| Document | Purpose | Unique material | Main teaching disposition |
|---|---|---|---|
| `e6ed61e_claude/00-overview.md` | Index, big picture, ten concepts, five scenarios, concurrency rules, invariants, roadmap, defect table | Excellent source-navigation map and condensed pressure/replacement/checkpoint stories | Mine for instructor preparation. Its “five contracts” and “one I/O” language should be softened to the precise contract/evidence terms in the `f799e05` corpus. |
| `01-structures.md` | Constants, packed bits, 16+ structures, measured layout, allocation, initialization/finalization, invariants, parameters | Deepest structure/layout source; includes cardinality and memory map | Appendix/reference only. ABI sizes, lines, flags, and discovered defects are revision-specific. |
| `02-fix-unfix-latch.md` | Full fix/unfix pseudocode, buffer locks, lock-free fast path, latch CAS table, waits/wakeup, promotion, fetch modes, edge cases | Deepest concurrency explanation and lock-ranking map | Source Q&A appendix. Do not teach the fast path before the normal ownership contract. |
| `03-lru-victim-quota.md` | Three-zone LRU, private/shared lists, quota math, candidate search, direct victims, AOUT, invalid list, monitor | Most complete replacement-policy reconstruction | Main source for a replacement appendix; teach eligibility before its policy details. |
| `04-flush-wal-daemons.md` | Dirty states, snapshot flush, WAL, victim/checkpoint flush, four daemons, DWB, statistics | Most complete durability/background-progress reconstruction | Use to prepare difficult questions; preserve the generation split and WAL gate, but keep daemon formulas out of the core hour. |
| `05-ordered-fix-dealloc.md` | Ordered watchers, deadlock scenario, callback, deallocation/invalidation, VPID buffer lock | Best explanation of why multi-page acquisition must release/revalidate and how deallocation differs from eviction | Use a single scenario in the core lesson; keep callback/deallocation internals in appendix. |
| `06-misc-observability.md` | TDE, scan-copy, area-copy, metadata helpers, temp-page rules, metrics, SHOW, debug checks, external seams | Covers specialized APIs missing from the lifecycle-only book | Appendix and source navigation. Scan-copy and exported interfaces changed across branches, so verify against the selected revision. |
| `07-qa-workbook.md` | 24 questions at concept, mechanism, and design levels with model answers | Ready-made rehearsal and review bank | Select questions; avoid duplicating the newer 38- and 55-question banks wholesale. |
| `08-page-buffer-new-plan.md` | `page_buffer_new.cpp` milestones M0–M8 and test strategy | Converts the mechanism into an implementation order | Historical/design note. Useful for “how to change safely,” not evidence of current behavior. |
| `09-issue-proposals.md` | P1–P9 JIRA proposals | Consolidates defect candidates and priorities | Historical/design note. Do not present as a confirmed current defect list. |
| `10-CBRD-27263-repro-proof-and-solutions.md` | Dynamic proof and options for lock-free avoid-deallocation accounting asymmetry | Strong case study in tracing a fast-path accounting bug and comparing fixes | Optional advanced exercise; tied to `e6ed61e` and issue history. |
| `research/lockfree-fix-origin.md` | Git archaeology for the lock-free path and its motivation | Distinguishes intended optimization from accidental accounting asymmetry | Historical design context; excellent for review training. |
| `research/prevent-dealloc-necessity.md` | Necessity and semantics of avoid-deallocation | Clarifies that this protects vacuum deallocation, not ordinary victimization | Reuse the semantic distinction, checked against `f799e05` `pgbuf_bcb_unregister_avoid_deallocation` (`page_buffer.c:16262-16296`). |

#### Standalone detailed fact sheets under `PGBUF/research/`

| Document | Purpose and unique evidence | Revision boundary / disposition |
|---|---|---|
| `cubrid-structs-fix.md` | Complete pool/BCB/frame/hash/buffer-lock/fix/latch/unfix/watcher/sizing fact sheet; explicitly declares that its tree is not stock 11.5 | High-value appendix, but use its declared composite revision and not its raw line numbers as the `f799e05` authority. |
| `cubrid-lru-victim.md` | Replacement fact sheet with zone/list/quota/AOUT/direct-victim call graph and parameters | Best compact replacement source. Its important verified correction is that AOUT is forced off in the analyzed build; do not teach “CUBRID uses 2Q” unconditionally. |
| `cubrid-flush-wal-dwb.md` | Dirty/LSA/flush/checkpoint/daemon/DWB/torn-page/observability fact sheet | Best compact durability source. Counter semantics and DWB branches must remain revision/configuration specific. |
| `postgres-bufmgr.md` | PostgreSQL 20-development shared-buffer fact sheet: pins, content locks, AIO, clock sweep, rings, WAL, bgwriter/checkpointer, FPI | Comparison appendix only; its own §15 lists gaps. |
| `innodb-bufpool.md` | MySQL 26.7 InnoDB fact sheet: blocks/pages, buffer-fix, miss/read-ahead, midpoint LRU, flush lists, redo, cleaners, doublewrite, checkpoint | Comparison appendix only; version labels are non-CUBRID product revisions and should stay explicit. |

These fact sheets overlap heavily with `e6ed61e_claude/01`–`06`. Prefer the
fact sheets when a concise evidence lookup is needed; prefer the numbered
technical set when reconstructing the whole module or preparing a deep Q&A.
Neither should be pasted into the teaching spine.

#### Expanded `f799e05` presentation set

| Document | Purpose | Unique value | Reuse decision |
|---|---|---|---|
| `f799e05_claude/README.md` | Package index and source/probe revisions | Clean provenance summary | Reuse in source notes. |
| `CUBRID_PAGE_BUFFER_PRESENTATION_KO.md` | 52-minute Korean deck/handout with reference appendix, contract cards, 55 Q&A, and source index | Most complete audience-facing source in the corpus; includes scale/cardinality, ordered watchers, two-LSA timeline, public-interface families, failure matrix, live monitoring, and evidence boundaries | Use as the primary source for the new teaching material's organization. It is currently user-modified; preserve its additions and treat it as live material. |
| `analysis/README.md` | Index of the English research set | Fast routing by need | Link from instructor notes. |
| `analysis/research/scope.md` | Expanded interface-oriented scope and exclusions | Shows why the old audit cannot establish completeness for the broader deck | Reuse the evidence boundary. |
| `api-inventory.md` | Full `page_buffer.h` inventory: 106 declarations / 95 logical interfaces, classifications, contracts, hazards | Unique complete public/specialized/maintenance interface catalog | Canonical appendix for source navigation; only a small family-selection table belongs in the main lesson. |
| `caller-use-cases.md` | Heap, B-tree, file allocation/deallocation, disk format, checkpoint, recovery, boot/daemon call paths | Broadest same-revision caller coverage | Use to source worked scenarios and “where do I debug?” paths. |
| `internal-mechanisms.md` | Hash/BCB/latch/holder/fix/flush/replacement internals and invariants | Same-revision internals bridge behind the deck | Instructor/source appendix. |
| `evidence-reuse.md` | Maps old audited claims and runtime observations into the wider deck; states limitations | Best reconciliation document between the two requested trees | Reuse its evidence hierarchy, but prefer final accepted receipts when numeric summaries disagree. |
| `pedagogy-plan.md` | Minute-by-minute 50–60 minute progression, visual inventory, terminology traps, presenter questions | Most directly applicable instructional design | Use to build instructor notes and pacing. |
| `qa-questions.md` / `qa-answers.md` | 55 questions and independently sourced answers | Broadest hard-question bank, including rare failures and cross-DB analogies | Select a progressive subset; keep full bank as appendix/search reference. |
| `analysis/monitoring/runtime-path-monitoring.md` | Whole-pool logging-only trace of boot, DDL, insert, cold/hot read, update, checkpoint, shutdown | Unique page-by-page sequence evidence: fix ledger closure, promotion, WAL gate ordering, observer traffic, no-eviction limit | Strong worked-example source. Label probe commit `75d64f959`, debug build, 64M pool, and run-specific page IDs/counts. |
| `analysis/monitoring/run-monitor.sh` / `trace-all.log` | Reproducer and raw event stream | Primary receipt for the monitoring report | Keep out of main document; link from experiment appendix. |
| `presentation-assets/page-buffer-state-axes.svg` | Four independent axes | Best opening visual | Reuse. |
| `presentation-assets/pgbuf-contract.svg` | Hit/miss converge on ownership grant | Best fix-contract visual | Reuse; byte-identical to `teach-course/assets/pgbuf-contract.svg`. |

The monitoring report is especially valuable because it is complementary to the
aggregate experiments. It observed, under its lab conditions, exact event
pairing and statement paths: a successful fix/release ledger, a heap WRITE fix
versus B-tree READ-then-promote pattern, cold scan misses dropping to zero on an
immediate repeat, WAL-gate events preceding each traced flush, and an idle
checkpoint. It also observed **no eviction** because the 64M pool never came
under pressure. Therefore it must not be cited as runtime proof of victim/direct-
victim behavior.

#### Stateful teaching course

| Document / group | Purpose and current state | Reuse decision |
|---|---|---|
| `teach-course/MISSION.md` | Defines outcome: defend the design in a teammate presentation; fixes source at `f799e05` | Reuse its success criteria as learning objectives. |
| `RESOURCES.md` | Routes learners to source, field guide, evidence appendix, experiments, question bank, and community review | Reuse as a “continue learning” appendix. |
| `NOTES.md` | Teaching policy and learner progress through 2026-09-01 | Valuable instructor guidance: begin at contract, use prediction/retrieval, show model answers, and record gaps. It is not general audience content. |
| `lessons/0001-pgbuf-fix-is-an-ownership-protocol.html` | Short contract-first lesson | Reuse its Locate→Materialize→Grant framing. |
| `lessons/0002-write-latch-is-not-durability.html` | Separates concurrency, recoverability, and page propagation | Reuse in durability section. |
| `lessons/0003-one-bcb-many-lists.html` | BCB/frame/hash/LRU/holder structure map | Reuse after vocabulary; soften its AOUT/2Q wording because AOUT is off by default in the analyzed build. |
| `reference/pgbuf-fix-contract.html` | Printable fix inputs/postcondition/boundary card | Good one-page recap. |
| `reference/pgbuf-durability-contract.html` | Three clocks, crash matrix, writer/flusher contracts | Good one-page durability handout. |
| `reference/pgbuf-structure-map.html` | Structures, purpose, protection, cardinality/sizing | Best quick source-navigation/glossary card. |
| `reference/pgbuf-question-bank.md` | 38 progressive source-backed Q&A from identity through design defense | Best-sized general learner question bank. |
| `reference/pgbuf-question-bank.html` | Rendered form of the Markdown bank | Generated presentation view; do not maintain as independent content. |
| `learning-records/0001-fix-ownership-lifetime.md` | Evidence that ownership/use-after-unfix understanding was demonstrated | Personal learning history; mine likely misconceptions only. |
| `0002-pool-structures-and-load-serialization.md` | Demonstrated understanding of structure map and per-VPID load serialization | Personal learning history; useful source of retrieval prompts. |
| `0003-durability-chain-and-redo-gates.md` | Demonstrated durability reasoning plus caveats requiring later retest | Personal learning history; it records mastery boundaries, not engine behavior. |
| `assets/pgbuf-contract.svg` | Contract visual | Exact duplicate of `f799e05_claude/presentation-assets/pgbuf-contract.svg`; use one canonical copy. |
| `assets/durability-chain.svg` | Three-lane concurrency/recoverability/propagation visual | Best durability teaching visual. |
| `assets/pgbuf-pool-map.svg` | Hash/LRU/holder/frame structure map | Best structure visual, but annotate that AOUT is a disabled-by-default history mechanism in the analyzed configuration. |
| `assets/course.css`, `retrieval.js`, `question-bank-template.html` | Rendering and retrieval-practice support | No independent implementation claims. |

## Reconciled implementation facts for the teaching author

The following are the strongest common facts across the corpus. Lines refer to
the pinned CUBRID `f799e05` source unless stated otherwise.

| Topic | Reconciled fact | Primary source and confidence |
|---|---|---|
| Identity and success contract | `pgbuf_fix` is not merely a read: on success the requested VPID is connected to resident bytes, replacement is prevented by fix accounting, the requested page latch has been granted, and a thread holder records the debt until unfix. Hit and miss have different preparation but converge on this postcondition. | **Verified:** `src/storage/page_buffer.c:2260-2685` (`pgbuf_fix_release`), `8392-8634` (`pgbuf_claim_bcb_for_fix`); `FIELD` claims `CUBRID-C001/C002`. |
| Objects | VPID is logical identity; BCB is volatile per-frame control state; frame holds the page bytes; `PAGE_PTR` is a borrowed address valid only while the caller's fix remains. | **Verified:** `src/storage/page_buffer.c:513-545`; `FIELD/chapters/02-boundary-ownership.html`. |
| Miss convergence | A VPID-keyed buffer-lock protocol serializes an in-flight miss and causes waiters to retry lookup; a new BCB is published after load/latch work. | **Verified:** `page_buffer.c:7991-8179,8392-8634`. “Exactly one disk I/O” is too strong: the protocol is about one resident identity/load owner, while DWB/main-volume/OS behavior is a separate layer. |
| Ownership versus concurrency | BCB atomic latch tracks mode/waiter/global `fcnt`; per-thread holder tracks nested ownership. Fix count is replacement protection; latch mode protects page bytes; transaction lock is outside this module and protects logical conflicts/visibility. | **Verified:** `page_buffer.c:460-488,6277-6634`; `page_buffer.h:189-203`. |
| Waiting | Conditional incompatible acquisition fails immediately; unconditional acquisition can enter a watchdog-bounded wait, timeout, or be interrupted. `waiter_exists` discourages barging but does not prove strict FIFO or starvation freedom. | **Verified with limits:** `page_buffer.c:6277-6634,7281-7590`; `CUBRID-C002`. |
| Release | Each successful fix creates one release debt. `pgbuf_unfix` lowers the holder/global accounting; the last release can transition to no latch, place/adjust the BCB in replacement lists, wake waiters, and trigger deferred flush handling. | **Verified:** `page_buffer.c:3062-3201,6636-6990`. Unfix is not commit, flush, or eviction. |
| Multi-page access | Heap ordered watchers may release and refix pages to respect an order; `page_was_unfixed` means page-local pointers/content observations must be recomputed. B-tree paths may release and restart rather than wait while holding an unsafe latch set. | **Verified for representative paths:** `page_buffer.c:12249-13063`; `heap_file.c:25543-25625`; `btree.c:16867-17013,23734-24089`. Not a proof that every caller is correct. |
| Dirty generation | Dirty is a volatile “resident generation needs propagation” marker. Flush snapshots bytes/LSAs while protected, sets FLUSHING and clears the old DIRTY so a concurrent new DIRTY survives completion. | **Verified:** `page_buffer.c:10723-10962`. |
| WAL and data | Before the copied non-temporary data-page image is written, the log manager is asked to force WAL through the copied page LSA; the image then goes through DWB or a direct data-volume write path. | **Verified:** `page_buffer.c:10723-10962`; `src/transaction/log_page_buffer.c:4150-4189`. DWB protects page-image integrity and does not replace WAL/recovery. |
| Victim eligibility | Selection policy is applied only after safety predicates: ordinary victims come from the appropriate replacement zone and must be unfixed, clean/not flushing, waiter-free, and revalidated under protection. | **Verified:** `page_buffer.c:9314-9538`. Avoid-deallocation is for vacuum deallocation and is not itself an ordinary victim blocker (`16262-16296`). |
| Replacement policy | CUBRID uses multiple LRU lists and zones with private/shared policy, quota and direct-victim progress machinery in the analyzed revisions. AOUT data structures exist but AOUT is forced off in the analyzed default configuration. | **Verified/revision-sensitive:** `PGBUF/research/cubrid-lru-victim.md`; `page_buffer.c` replacement functions; `src/base/system_parameter.c` tuning. Teach AOUT as a dormant/configuration-bound ghost-history mechanism, not “CUBRID is 2Q.” |
| Recovery | Generic redo fixes with `RECOVERY_PAGE`/WRITE, uses page LSA as an idempotence gate, updates the page/LSA, dirties, and releases. | **Verified for representative recovery:** `src/transaction/log_recovery.c:6399-6431` and the caller chain identified in `PGBUF/f799e05_claude/analysis/research/caller-use-cases.md`. |
| Capacity | Public `data_buffer_size` configures cached data-buffer size; metadata (BCBs, a large fixed hash table in the analyzed build, holders, lists, DWB, etc.) adds memory beyond that value. | **Verified but revision/configuration-sensitive:** CUBRID manual `en/admin/config.rst:713-719`; `page_buffer.c` initialization; `PGBUF` structure map. Do not generalize the approximate 56MB hash cost to an unverified future revision. |
| Observability | Counter names must be tied to their increment sites. Dirty counts are calls, not unique pages; `ioreads` increments before DWB/main-volume source is resolved; SHOW interval columns can have destructive/approximate semantics. | **Verified/revision-sensitive:** `FIELD/chapters/08-experiments.html`; `page_buffer.c:8497,11656-11675`; `PGBUF/e6ed61e_claude/06-misc-observability.md`; public SHOW syntax in manual `en/sql/query/show.rst:1881-1921`. |

## Duplicates, conflicts, and their resolution

### Exact or near-exact duplicates

- `PGBUF/f799e05_claude/presentation-assets/pgbuf-contract.svg` and
  `PGBUF/teach-course/assets/pgbuf-contract.svg` are byte-identical
  (SHA-256 `345988c79e4c…`). Choose one canonical copy.
- `teach-course/reference/pgbuf-question-bank.html` is a rendered form of
  `pgbuf-question-bank.md`; maintain the Markdown as content and regenerate the
  HTML.
- `FIELD/notion/page-buffer-guide.md` condenses the same lifecycle/evidence story
  as `FIELD/chapters/01`–`11`; it is the portable view, not an independent claim
  source.
- `PGBUF/f799e05_claude/CUBRID_PAGE_BUFFER_PRESENTATION_KO.md` incorporates and
  expands most of the `FIELD` narrative. Use the later deck for pedagogy and the
  old claim ledger for evidence.
- `PGBUF/research/cubrid-{structs-fix,lru-victim,flush-wal-dwb}.md` and
  `PGBUF/e6ed61e_claude/01`–`06` cover the same mechanism families at different
  depth/revision. Do not combine their line numbers.

### Conflicting runtime numbers

Several historical runs exist. The final audited/rebound report uses:

- E1 `ioreads` **38 → 0**;
- E2 detailed promotions **689**, dirties **102125**;
- E3 covered/non-covered **100/0** versus **0/100**, update dirties **300**;
- E4 dirties **58430**, generation **1/1**, accepted backup success.

Other summaries in the corpus mention 46 ioreads, 102114 dirties, 51774 dirties,
or earlier failed/accepted runs. These are not semantic contradictions; they are
different historical receipts and, in one case, stale reuse prose. The accepted
`rebind-*` receipt and final audit win for the `FIELD` experiment cards. The
whole-pool probe report has still other counts (for example cold/hot 9→0) because
it used a different table/workload/build and answers different questions.

### “One miss means one disk read”

Older overviews sometimes say that two concurrent misses cause “exactly one disk
read.” The source-backed teaching statement should be narrower:

- the VPID buffer-lock protocol prevents duplicate resident identities and
  serializes the load owner;
- the waiter retries lookup rather than inheriting the loader's BCB;
- `Num_data_page_ioreads` is incremented before DWB versus volume is known;
- neither this counter nor the source protocol establishes one physical device
  operation in the presence of DWB, OS cache, errors, or other lower-level I/O.

This is verified by `CUBRID-C001/C005` and `page_buffer.c:8392-8634`.

### AOUT and “CUBRID is 2Q”

The structures and comments describe an AOUT ghost history, and several early
documents summarize replacement as “LRU + AOUT of 2Q.” The detailed source fact
sheet shows the analyzed build forces `pb_aout_ratio` to zero, so AOUT calls
short-circuit. Resolution: teach the implemented data structure and intended
role in an appendix, but state that it is disabled by default in the analyzed
configuration/revision. Do not use “CUBRID uses 2Q” as the current core model.

### Private LRU ownership

Some prose says “per thread” while the later teaching notes correct this to
“per transaction/session allocation” in the relevant source design. Resolution:
use “private LRU assigned to a transaction/session context” unless quoting an
exact field/cardinality from a pinned revision. Avoid turning a storage-policy
association into correctness ownership.

### Fix, latch, pin, and lock terminology

The corpus sometimes uses “pin” informally to explain fix count. For CUBRID code
teaching, keep canonical terms:

- **fix / holder / `fcnt`**: borrowed lifetime and replacement protection;
- **page latch**: short physical-content concurrency;
- **transaction lock**: logical visibility/conflict outside the page buffer;
- PostgreSQL **pin/content lock** and InnoDB **buffer-fix/page latch/MTR memo**:
  nearest responsibility analogies, not interchangeable APIs.

### Flush completion and durability

Some runtime labels say `FLUSHED_TO_DISK`, but the monitoring report explicitly
states the event can mean direct-write completion **or DWB slot acceptance** and
does not probe DWB internals. Resolution: in prose use “the page-buffer flush
path completed at its configured DWB/direct-write boundary,” unless the source
and experiment prove a stronger fsync/home-page boundary.

### Defect candidates versus guarantees

The old audit and later defect reports identify DWB-read cleanup, TDE/DWB-slot
early returns, holder-allocation rollback, lock-free identity proof, direct-
victim paths, statistics, and initialization candidates. These belong in an
“implementation hazards and proof obligations” appendix. Their control flow may
be source-confirmed at a revision, while reachability, consequence, fix status,
and current-branch status remain separate questions. Do not teach a candidate as
a timeless property of CUBRID.

### Interface/version drift

The expanded `f799e05` interface inventory includes scan-copy and ordered-callback
families. The observed current checkout differs and can remove or reshape such
interfaces. Resolution: the main lesson should use stable conceptual families
(normal fix, ordered watcher, dirty/flush, maintenance) and cite exact public
names in a revision-labeled source appendix.

## Useful diagrams and how to use them

| Teaching need | Best existing visual | Caveat |
|---|---|---|
| Opening mental model | `PGBUF/f799e05_claude/presentation-assets/page-buffer-state-axes.svg` | Calls the four axes identity/residency, ownership, concurrency, durability; replacement can be introduced as a fifth decision axis in prose. |
| Complete fix contract | `PGBUF/f799e05_claude/presentation-assets/pgbuf-contract.svg` | Shows convergence, not every retry/error branch. |
| Pool structures | `PGBUF/teach-course/assets/pgbuf-pool-map.svg` | Annotate AOUT disabled-by-default and do not imply one BCB can be on invalid and LRU lists simultaneously. |
| Latch modes | `FIELD/assets/latch-state.svg` | Pair with the holder/global-count ledger and transaction-lock contrast. |
| Durability separation | `PGBUF/teach-course/assets/durability-chain.svg` | Best three-lane visual; distinguish transaction durability from page propagation. |
| Flush/re-dirty sequence | `FIELD/assets/wal-flush.svg` | Pair with source pseudocode/error branch; DWB/direct completion boundary is configuration-dependent. |
| Full page journey | `FIELD/assets/fix-lifecycle.svg` | Compact but slightly less explicit than the contract visual about postcondition. |
| Cross-database comparison | `FIELD/assets/three-db.svg` | Use late and label every row partial analogy/no equivalent. |

The numbered `e6ed61e` documents contain many ASCII/Mermaid flowcharts for
private/shared LRU, direct victims, ordered fix, daemons, and deallocation. These
are useful sources for new Mermaid redraws, but should be re-authored with a
single visual vocabulary rather than embedded with mixed style and revision line
numbers.

## Best call paths for worked scenarios and source navigation

| Scenario | Call path / anchors | Teaching use |
|---|---|---|
| Normal read hit/miss | caller → `pgbuf_fix_release` (`page_buffer.c:2260-2685`) → lock-free/hash hit or `pgbuf_lock_page` → `pgbuf_allocate_bcb` → `pgbuf_claim_bcb_for_fix` (`8392-8634`) → latch/holder → return → `pgbuf_unfix` | Core lifecycle. Ask where identity, ownership, and latch are established. |
| Concurrent cold miss | two callers → hash miss → VPID buffer-lock owner/waiter → owner load/publish → waiter wakes and retries | Explain load serialization versus content latch. |
| Heap ordered access | `heap_prepare_object_page` (`heap_file.c:25543-25625`) → `pgbuf_ordered_fix_release` (`page_buffer.c:12249-13063`) → possible release/sort/refix → caller checks `page_was_unfixed` | Show why raw pointers/slot observations become stale. |
| B-tree descent/update | `btree_search_key_and_apply_functions` (`btree.c:23734-24089`) and sibling/restart helper (`16867-17013`) | Contrast latch coupling, conditional failure, release-and-restart, and caller-owned dirtying. |
| Logged mutation | representative heap/B-tree caller constructs/appends log, associates page LSA, marks dirty, unfixes | Separate WRITE permission, recoverability, and later propagation. Use caller details from `PGBUF/f799e05_claude/analysis/research/caller-use-cases.md`. |
| Flush with concurrent re-dirty | `pgbuf_bcb_flush_with_wal` (`page_buffer.c:10723-10962`) → `logpb_flush_log_for_wal` (`log_page_buffer.c:4150-4189`) → DWB/direct I/O → completion | Core durability exercise: which flags/LSAs belong to snapshot G versus resident G+1? |
| Victim under pressure | `pgbuf_allocate_bcb` → `pgbuf_get_victim` → `pgbuf_get_victim_from_lru_list` (`page_buffer.c:9314-9538`) → optional flush/direct-victim progress | Teach hard safety predicate before LRU policy. Runtime corpus did not exercise actual eviction. |
| Checkpoint | `logpb_checkpoint` (`log_page_buffer.c:6901-7406`, from same-revision caller note) → selective `pgbuf_flush_checkpoint` → filesystem sync → checkpoint records/volume metadata | Explain why checkpoint is not simply “flush every dirty page.” |
| Redo | `log_rv_redo_fix_page` (`log_recovery.c:6399-6431`) → `pgbuf_fix(RECOVERY_PAGE, WRITE)` → page-LSA gate → apply/set LSA/dirty/unfix | Show recovery-specific fetch mode and idempotence. |
| Boot/shutdown | transaction table → `pgbuf_initialize`; DWB recovery/daemon gating/log recovery; shutdown stops daemons then `log_final` before `pgbuf_finalize` | Use only in appendix/source navigation unless presentation time allows. |

## Gaps requiring further verification or new experiments

1. **Chosen current production revision.** The corpus is intentionally pinned to
   `f799e05`/`e6ed61e`; the current local checkout is different and dirty. A
   publication intended to describe present `develop` must first choose a clean
   commit and regenerate line anchors/API availability.
2. **Actual contention schedule.** Aggregate Experiment 2 did not run competing
   readers/writers, conditional rejection, promotion contention, timeout, or
   waiter-order scenarios. A focused synchronization test is needed before making
   fairness/progress claims.
3. **Actual replacement/direct-victim schedule.** Neither accepted aggregate
   experiments nor whole-pool monitoring forced eviction. A small-pool,
   controlled-pressure trace is required to observe candidate aging, dirty flush,
   victimization, direct assignment, invalidation, and reuse.
4. **Fault-injected cleanup.** DWB-read error, TDE encryption error, DWB-slot
   acquisition error, holder exhaustion, and async-unfix flush errors are mostly
   source-path findings. Inject failures and inspect BCB identity, VPID lock,
   `fcnt`, holder, DIRTY/FLUSHING, oldest LSA, waiter, and retry/restart state.
5. **Crash boundaries.** Existing backup/checkpoint-like runs do not prove
   per-page WAL ordering, DWB recovery, torn-page handling, or redo. Controlled
   crash/fault experiments are needed for those claims.
6. **AOUT/defaults across release branches.** Verify `pb_aout_ratio` tuning and
   public availability on the target release before teaching it as anything more
   than dormant historical design.
7. **Memory-size examples.** The hash≈56MB and measured structure sizes are useful
   at analyzed revisions/ABI. Recompute with the target build, page size, mode,
   and compiler before presenting them as exact.
8. **Full caller cleanup audit.** The broad caller note samples all major families
   but does not prove every transitive call site pairs successful fixes on every
   exit or revalidates after ordered refix.
9. **Counter semantics and concurrent monitors.** Source anchors show surprising
   meanings and destructive/approximate reads. Recheck on the target revision and
   document DWB configuration, snapshot interval, reset behavior, and observer
   traffic.
10. **First-party manual alignment.** The public manual explains capacity and SHOW
    syntax but not most internal contracts. Any public-facing claim about knobs,
    defaults, or output columns should be checked against the manual version that
    matches the source release.
11. **Teammate validation.** `teach-course/RESOURCES.md` explicitly records that no
    heap/B-tree/logging owner rehearsal feedback has been captured. A rehearsal
    should challenge terminology, ordered-fix invariants, recovery assumptions,
    and unusual fetch modes.

## Suggested teaching narrative derived from the corpus

For a 50–60 minute session, the documents collectively support this order:

1. **Problem and contract:** one logical page journey; what a successful fix
   guarantees and what it does not.
2. **Vocabulary and independent axes:** VPID, BCB, frame, `PAGE_PTR`, holder,
   latch; residency, ownership, concurrency, durability, replacement.
3. **Complete fix/unfix:** hit, miss owner, miss waiter, load, publish, grant,
   borrow, release. Introduce fast path only after the normal path is clear.
4. **Caller completes correctness:** heap ordered watcher, B-tree restart, recovery
   fetch/LSA gate, all-exit release.
5. **Modification is not durability:** WRITE latch, log/page LSA, DIRTY, unfix,
   commit WAL, later snapshot/WAL gate/DWB or data write, concurrent re-dirty.
6. **Replacement:** hard eligibility predicate, then zones/lists/quota/direct-
   victim policy. State that AOUT is disabled in the analyzed default and runtime
   evidence did not force eviction.
7. **Worked evidence:** one cold/hot aggregate card and one instrumented INSERT or
   checkpoint sequence, each with a “not proven” box.
8. **Developer workflow:** find the interface family, follow ownership debt,
   identify state owner and guard, verify logging/dirtying and release on every
   exit, then inspect counters at increment sites.
9. **Selected comparison:** CUBRID fix+holder+latch versus PostgreSQL pin+separate
   content lock and InnoDB MTR memo; CUBRID DWB versus PostgreSQL FPI versus
   InnoDB doublewrite as partial analogies.
10. **Retrieval:** two-ledger unfix calculation, concurrent-miss ownership,
    re-dirty generation, victim predicate, and one source-navigation task.

Everything else—packed bit layouts, quota formulas, four daemon loops, specialized
copy/temp APIs, issue candidates, reimplementation milestones, complete 55 Q&A,
and comparator internals—belongs in reference appendices.

## Final authoring cautions

- Do not explain `page_buffer.c` in file order. Teach problem → contract → state
  owner/guard → source call path.
- Do not introduce every exported interface. Teach interface **families**, then
  provide the 95-interface inventory as a searchable appendix.
- Do not use `dirty`, `unfixed`, `committed`, `flushed`, and `evicted`
  interchangeably.
- Do not imply a buffer hit is latch-free or non-blocking; residency lookup and
  content acquisition are separate.
- Do not imply `fcnt == 0` is sufficient for victimization.
- Do not call a counter a physical I/O fact without tracing its increment site and
  DWB/OS-cache boundary.
- Do not convert a source-confirmed exceptional branch into a production defect
  claim without revision, reachability, and impact evidence.
- Do not present PostgreSQL or InnoDB APIs as direct equivalents. Compare
  responsibilities and state explicitly whether the relationship is partial or
  absent.
- Preserve the distinction between the approved old report scope and the broader
  later interface deck. Approval does not automatically transfer across scope.
- Preserve the user's existing live course modifications. The source inventory
  is read-only with respect to both input trees.

## Canonical Question-bank routing

The complete disposition of the progressive, adversarial, historical, planned,
executed, live-grill, and Reader-intake populations is owned by the
[Question-bank migration audit](./questions/migration-audit.md). The reader-facing
[Question-bank entry](./questions/README.md) routes to paired Core, Advanced,
Maintenance-scenario, and Applied-exercise prompt/answer pages. Legacy banks and
executed evidence trees remain unchanged at their original paths; Canonical items
link them instead of copying provenance, runners, or receipts.
