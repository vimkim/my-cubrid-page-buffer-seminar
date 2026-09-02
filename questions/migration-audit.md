# Question-bank Migration Audit

**Level:** Question bank — Migration reference
**Prerequisites:** None; this page is for documentation maintainers
**Capability gained:** Trace every source prompt to a Canonical question or a deliberate, evidence-aware exclusion.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, with older material explicitly revision-bound
**Evidence used:** Verified mechanism, Runtime observation, and Historical evidence from the [source inventory](../source-inventory.md) and linked source banks

**Migration status:** Complete

This audit owns migration provenance; reader-facing prompts and answers do not repeat it. A Retained, Merged, or Rewritten item maps to a Canonical question. Superseded identifies a stronger descendant. Excluded requires a scope, duplication, or evidence rationale.

## Source populations

| Source set | Input | Expected items |
|---|---|---:|
| `TEACH` | [Progressive teaching bank](../../../pgbuf-analysis/teach-course/reference/pgbuf-question-bank.md) | 38 |
| `ADV` | [Adversarial questions](../../../pgbuf-analysis/f799e05_claude/analysis/research/qa-questions.md) and [paired answers](../../../pgbuf-analysis/f799e05_claude/analysis/research/qa-answers.md) | 55 |
| `HIST` | [Historical workbook](../../../pgbuf-analysis/e6ed61e_claude/07-qa-workbook.md) | 24 |
| `PLAN` | [Experiment and quiz design packet](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/research/packets/experiments-and-quizzes.md) | 27 |
| `EXEC` | [Executed quiz tree](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/) | 17 |
| `GRILL` | [Live-grill seeds](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/research/packets/experiments-and-quizzes.md) | 12 |
| `READER` | [Unedited Reader question intake](../questions-b4179ee/questions.md) | 16 |

## Disposition ledger

| Source set | Legacy item | Short topic | Disposition | Canonical destination | Rationale/evidence action |
|---|---|---|---|---|---|
| `TEACH` | `TEACH-01` | Module purpose | Rewritten | PGBUF-QB-001 | Reframed as a maintainer boundary artifact. |
| `TEACH` | `TEACH-02` | VPID definition | Retained | PGBUF-QB-002 | Preserved with logical-versus-physical boundary. |
| `TEACH` | `TEACH-03` | VPID BCB frame PAGE_PTR | Rewritten | PGBUF-QB-003 | Corrected PAGE_PTR evidence and added holder ownership. |
| `TEACH` | `TEACH-04` | Fix beyond lookup | Merged | PGBUF-QB-005 | Merged into the complete shared success postcondition. |
| `TEACH` | `TEACH-05` | Fix arguments | Retained | PGBUF-QB-006 | Uses caller-knowledge and policy vocabulary. |
| `TEACH` | `TEACH-06` | Successful fix conditions | Merged | PGBUF-QB-005 | Same capability as the canonical success contract. |
| `TEACH` | `TEACH-07` | Hit and miss convergence | Rewritten | PGBUF-QB-007 | Corrected the range through publication and return. |
| `TEACH` | `TEACH-08` | Lock-free READ path | Rewritten | PGBUF-QB-031 | Deferred to Advanced after the normal contract. |
| `TEACH` | `TEACH-09` | Resident-only miss | Merged | PGBUF-QB-006 | Treated as fetch-knowledge and absence semantics. |
| `TEACH` | `TEACH-10` | Concurrent miss serialization | Rewritten | PGBUF-QB-008 | Narrows one-loader language to serialized resident publication. |
| `TEACH` | `TEACH-11` | Protected VPID recheck | Rewritten | PGBUF-QB-009 | Separates observation and protected-transition checks. |
| `TEACH` | `TEACH-12` | Fix returns NULL | Merged | PGBUF-QB-017 | Combines rejection timeout interrupt and expected absence boundaries. |
| `TEACH` | `TEACH-13` | Page latch versus transaction lock | Retained | PGBUF-QB-013 | Preserves the two-owner distinction. |
| `TEACH` | `TEACH-14` | Mode versus condition | Retained | PGBUF-QB-014 | Uses a concrete incompatible-access scenario. |
| `TEACH` | `TEACH-15` | Global count versus holder | Rewritten | PGBUF-QB-015 | Adds multi-thread back-reference reasoning from Reader intake. |
| `TEACH` | `TEACH-16` | Nested fixing | Retained | PGBUF-QB-016 | Converted to an explicit two-ledger calculation. |
| `TEACH` | `TEACH-17` | waiter_exists | Rewritten | PGBUF-QB-017 | Keeps fairness and timing as unproved boundaries. |
| `TEACH` | `TEACH-18` | unfix behavior | Rewritten | PGBUF-QB-018 | Names release debt and separates commit/logging. |
| `TEACH` | `TEACH-19` | use after unfix | Retained | PGBUF-QB-019 | Preserves pointer-lifetime counterexample. |
| `TEACH` | `TEACH-20` | Caller responsibility after fix | Rewritten | PGBUF-QB-020 | Uses the canonical Module-versus-caller ledger. |
| `TEACH` | `TEACH-21` | Ordered watchers | Rewritten | PGBUF-QB-022 | Corrected source anchors and stale-observation artifact. |
| `TEACH` | `TEACH-22` | B-tree latch pattern | Rewritten | PGBUF-QB-034 | Deferred to Advanced restart/promotion reasoning. |
| `TEACH` | `TEACH-23` | Recovery fix | Rewritten | PGBUF-QB-046 | Requires the page-LSA gate and cleanup ranges. |
| `TEACH` | `TEACH-24` | Cleanup on every exit | Merged | PGBUF-QB-020, PGBUF-QB-023, PGBUF-QB-024 | Split among obligation ledger success trace and exceptional exit. |
| `TEACH` | `TEACH-25` | WRITE fix versus durability | Retained | PGBUF-QB-025 | Uses the four-clock durability separation. |
| `TEACH` | `TEACH-26` | DIRTY and oldest-unflushed LSA | Rewritten | PGBUF-QB-026 | Adds initial lower-bound and generation semantics. |
| `TEACH` | `TEACH-27` | WAL-before-data | Rewritten | PGBUF-QB-027 | Corrects TDE DWB and WAL ordering. |
| `TEACH` | `TEACH-28` | Flush with concurrent re-dirty | Retained | PGBUF-QB-028 | Uses an explicit G and G+1 timeline. |
| `TEACH` | `TEACH-29` | Eligibility versus replacement policy | Retained | PGBUF-QB-029 | Preserves hard-predicate-first reasoning. |
| `TEACH` | `TEACH-30` | Unfix flush commit and eviction | Merged | PGBUF-QB-004, PGBUF-QB-018, PGBUF-QB-025, PGBUF-QB-029 | State distinctions are owned by focused questions. |
| `TEACH` | `TEACH-31` | Progress under pressure | Rewritten | PGBUF-QB-040 | Deferred to Advanced allocation and victim progress. |
| `TEACH` | `TEACH-32` | Hit-rate evidence limits | Rewritten | PGBUF-QB-064 | Converted to a diagnostic evidence scenario. |
| `TEACH` | `TEACH-33` | Counter increment sites | Rewritten | PGBUF-QB-065 | Converted to a metric-definition scenario. |
| `TEACH` | `TEACH-34` | Cross-database ownership comparison | Excluded | — | Cross-database Canonical questions are outside the confirmed CUBRID-only scope; retain the separately pinned [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison). |
| `TEACH` | `TEACH-35` | Cross-database fix comparison | Excluded | — | Existing [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison) remains outside the Canonical bank. |
| `TEACH` | `TEACH-36` | Cross-database durability comparison | Excluded | — | Would introduce separately pinned comparator baselines; retain the existing [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison). |
| `TEACH` | `TEACH-37` | Reimplementation invariants | Rewritten | PGBUF-QB-030 | Reframed as a change-impact and proof packet. |
| `TEACH` | `TEACH-38` | Complete page lifecycle explanation | Merged | PGBUF-QB-001, PGBUF-QB-005, PGBUF-QB-023, PGBUF-QB-028, PGBUF-QB-029 | Split across Canonical owners instead of recreating a monolithic answer. |
| `READER` | `READER-01` | Why recheck VPID | Merged | PGBUF-QB-009 | Answered at the protected identity-transition boundary. |
| `READER` | `READER-02` | BCB and page-header agreement | Rewritten | PGBUF-QB-010 | Separates mapping coherence from caller page-type validation. |
| `READER` | `READER-03` | VPID load owner and prepared BCB | Merged | PGBUF-QB-008 | Answered through the owner waiter and provisional-BCB trace. |
| `READER` | `READER-04` | DWB or data volume for OLD_PAGE | Merged | PGBUF-QB-011, PGBUF-QB-027 | Separates cold read source from later flush destinations. |
| `READER` | `READER-05` | Shared success postcondition in SVG | Merged | PGBUF-QB-005 | Uses the canonical fix-contract boundary. |
| `READER` | `READER-06` | Searcher versus load owner | Merged | PGBUF-QB-008 | Search observation does not grant VPID-keyed load ownership. |
| `READER` | `READER-07` | Provisional BCB | Merged | PGBUF-QB-008 | Defines unpublished owner-prepared state. |
| `READER` | `READER-08` | Resident-hit stale-observation boundary | Merged | PGBUF-QB-012, PGBUF-QB-022 | Covers both acquisition gaps and ordered temporary release. |
| `READER` | `READER-09` | Commit debt wording | Rewritten | PGBUF-QB-018 | Corrects the term to fix or release debt. |
| `READER` | `READER-10` | Two identity checks | Merged | PGBUF-QB-009 | Explains distinct time and protection boundaries. |
| `READER` | `READER-11` | Holder thread back-references | Rewritten | PGBUF-QB-015 | Answers multi-thread attribution through per-thread holder lists. |
| `READER` | `READER-12` | Conflict and unconditional WRITE wait | Rewritten | PGBUF-QB-033 | Deferred to Advanced queue and wakeup reasoning. |
| `READER` | `READER-13` | One hundred unconditional writers | Rewritten | PGBUF-QB-033 | Uses the same bounded queue protocol without a fairness promise. |
| `READER` | `READER-14` | Miss steps and performance issues | Merged | PGBUF-QB-008, PGBUF-QB-011, PGBUF-QB-063 | Splits mechanism from diagnostic performance evidence. |
| `READER` | `READER-15` | No free BCB and infinite wait claim | Rewritten | PGBUF-QB-040 | Tests allocation progress timeout interrupt and all-dirty outcomes. |
| `READER` | `READER-16` | Victim conditions | Merged | PGBUF-QB-029 | Answered by the hard eligibility gate. |
| `ADV` | `PGBUF-Q001` | Successful fix promise | Merged | PGBUF-QB-005 | The Core postcondition is the prerequisite for deeper acquisition proofs. |
| `ADV` | `PGBUF-Q002` | Page object identity | Merged | PGBUF-QB-003 | The Canonical object map owns this distinction. |
| `ADV` | `PGBUF-Q003` | Choosing acquisition families | Rewritten | PGBUF-QB-006, PGBUF-QB-044, PGBUF-QB-049 | Split ordinary policy choice from recovery and specialized interfaces. |
| `ADV` | `PGBUF-Q004` | Expected NULL | Merged | PGBUF-QB-017 | Core owns expected absence versus failure. |
| `ADV` | `PGBUF-Q005` | NEW_PAGE allocation boundary | Rewritten | PGBUF-QB-021, PGBUF-QB-044 | Core rejects implied allocation; Advanced assigns special-fetch caller ownership. |
| `ADV` | `PGBUF-Q006` | Resident versus disk validity | Merged | PGBUF-QB-006, PGBUF-QB-047 | Separated acquisition knowledge from deallocation state. |
| `ADV` | `PGBUF-Q007` | Raw volume I/O bypass | Rewritten | PGBUF-QB-047 | Scoped to the verified deallocation and raw-overwrite call paths. |
| `ADV` | `PGBUF-Q008` | Multiple release debts | Merged | PGBUF-QB-016 | The Core two-ledger exercise owns nested fixes. |
| `ADV` | `PGBUF-Q009` | Pointer lifetime after unfix | Merged | PGBUF-QB-019 | Core owns the pointer-lifetime counterexample. |
| `ADV` | `PGBUF-Q010` | Watcher ownership transfer | Merged | PGBUF-QB-022, PGBUF-QB-035 | Covered by ordered-watcher ownership and temporary release. |
| `ADV` | `PGBUF-Q011` | Release macros | Merged | PGBUF-QB-018, PGBUF-QB-020 | Reduced to release debt and caller cleanup obligations. |
| `ADV` | `PGBUF-Q012` | Global and per-thread counts | Merged | PGBUF-QB-015 | Core owns the two ledgers. |
| `ADV` | `PGBUF-Q013` | Hit can block | Merged | PGBUF-QB-014, PGBUF-QB-017 | Mode and wait outcome are taught before queue internals. |
| `ADV` | `PGBUF-Q014` | Conditional acquisition promise | Merged | PGBUF-QB-014 | Core states the bounded conditional contract. |
| `ADV` | `PGBUF-Q015` | waiter_exists limits | Rewritten | PGBUF-QB-017, PGBUF-QB-033 | Split public outcome boundaries from queue behavior. |
| `ADV` | `PGBUF-Q016` | Promotion invalidates observations | Rewritten | PGBUF-QB-034 | Advanced restart reasoning owns the stale-observation consequence. |
| `ADV` | `PGBUF-Q017` | Single leading promoter | Merged | PGBUF-QB-034 | Kept within the promotion protocol rather than as an isolated fact. |
| `ADV` | `PGBUF-Q018` | Fix-with-retry semantics | Merged | PGBUF-QB-034 | Retry and restart are one maintainer decision. |
| `ADV` | `PGBUF-Q019` | Lock ownership and rechecks | Rewritten | PGBUF-QB-009, PGBUF-QB-031, PGBUF-QB-054, PGBUF-QB-066 | Split identity, lock-free proof, exceptional ownership audit, and identity diagnosis. |
| `ADV` | `PGBUF-Q020` | Ordered total order | Merged | PGBUF-QB-022, PGBUF-QB-035 | Core introduces the order; Advanced explains release-before-refix. |
| `ADV` | `PGBUF-Q021` | page_was_unfixed staleness | Merged | PGBUF-QB-022, PGBUF-QB-035 | The same temporary-release contract owns the stale state. |
| `ADV` | `PGBUF-Q022` | Ordered-fix partial failure | Rewritten | PGBUF-QB-035, PGBUF-QB-054 | Reframed as an ownership audit across a non-atomic protocol. |
| `ADV` | `PGBUF-Q023` | Ordered callback invariants | Merged | PGBUF-QB-035 | Kept with the protocol that invokes the callback. |
| `ADV` | `PGBUF-Q024` | Avoid-deallocation | Rewritten | PGBUF-QB-036 | Given a dedicated ownership question. |
| `ADV` | `PGBUF-Q025` | Logged mutation stages | Merged | PGBUF-QB-025 | Core owns the separated logging dirty release and commit clocks. |
| `ADV` | `PGBUF-Q026` | Oldest-unflushed LSA | Merged | PGBUF-QB-026 | Core owns the generation lower bound. |
| `ADV` | `PGBUF-Q027` | Successful flush remains dirty | Merged | PGBUF-QB-028, PGBUF-QB-041 | Core teaches G/G+1; Advanced probes post-flush victim assignment. |
| `ADV` | `PGBUF-Q028` | WAL and DWB | Merged | PGBUF-QB-027 | Core owns their distinct failure boundaries. |
| `ADV` | `PGBUF-Q029` | Safe-flush outcomes | Merged | PGBUF-QB-027, PGBUF-QB-028, PGBUF-QB-055 | Normal ordering and generation behavior stay separate from failure proof. |
| `ADV` | `PGBUF-Q030` | Checkpoint selection | Rewritten | PGBUF-QB-045 | Dedicated Advanced recovery question owns the selection boundary. |
| `ADV` | `PGBUF-Q031` | Flush failure restoration | Rewritten | PGBUF-QB-055, PGBUF-QB-059 | Kept as an exceptional-path candidate and a status-safe review packet. |
| `ADV` | `PGBUF-Q032` | Victim eligibility | Merged | PGBUF-QB-029 | Core owns the hard predicate. |
| `ADV` | `PGBUF-Q033` | LRU zones and AOUT | Rewritten | PGBUF-QB-037, PGBUF-QB-043 | Split active zone policy from disabled-by-default AOUT support. |
| `ADV` | `PGBUF-Q034` | Private and shared LRU correctness | Rewritten | PGBUF-QB-038, PGBUF-QB-056 | Quota policy is bounded away from correctness state and feeds contract-versus-policy review. |
| `ADV` | `PGBUF-Q035` | Progress after victim-search failure | Rewritten | PGBUF-QB-039, PGBUF-QB-040 | Split direct reservation from broader allocation progress. |
| `ADV` | `PGBUF-Q036` | Daemon and synchronous progress | Rewritten | PGBUF-QB-042, PGBUF-QB-048 | Daemon ownership feeds both progress and lifecycle dependency reasoning. |
| `ADV` | `PGBUF-Q037` | Release flush invalidate deallocate victimize | Merged | PGBUF-QB-004, PGBUF-QB-047 | Core state distinctions and Advanced storage transitions share ownership. |
| `ADV` | `PGBUF-Q038` | Invalidate-all residency | Merged | PGBUF-QB-047 | Covered by the invalidation and deallocation boundary. |
| `ADV` | `PGBUF-Q039` | Deferred permanent deallocation | Merged | PGBUF-QB-047 | Covered without treating invalidation as file allocation. |
| `ADV` | `PGBUF-Q040` | Deallocated versus reused | Merged | PGBUF-QB-047 | Identity reuse is part of the same cross-module state transition. |
| `ADV` | `PGBUF-Q041` | Recovery fetch and idempotence | Rewritten | PGBUF-QB-046 | Dedicated redo question owns the page-LSA gate. |
| `ADV` | `PGBUF-Q042` | Simple fix | Rewritten | PGBUF-QB-049 | Dedicated specialized-interface question. |
| `ADV` | `PGBUF-Q043` | Scan-copy handle | Rewritten | PGBUF-QB-050 | Dedicated lifetime question. |
| `ADV` | `PGBUF-Q044` | Area-copy do_fetch | Rewritten | PGBUF-QB-051 | Dedicated hazardous-convenience question. |
| `ADV` | `PGBUF-Q045` | Metadata mutation | Rewritten | PGBUF-QB-044 | Special fetch and metadata setters share explicit owner, latch, lifetime, dirty, and logging boundaries. |
| `ADV` | `PGBUF-Q046` | Metric definitions | Rewritten | PGBUF-QB-052, PGBUF-QB-065 | Split approximate authorization from counter-definition tracing. |
| `ADV` | `PGBUF-Q047` | Cold-miss DWB read failure | Merged | PGBUF-QB-054, PGBUF-QB-055, PGBUF-QB-058 | Treated as ownership audit, evidence-promotion case, and fault packet. |
| `ADV` | `PGBUF-Q048` | Holder allocation after grant | Rewritten | PGBUF-QB-054, PGBUF-QB-057, PGBUF-QB-058 | Feeds the post-grant audit, generic exit table, and targeted fault packet. |
| `ADV` | `PGBUF-Q049` | Lock-free reuse race | Rewritten | PGBUF-QB-031, PGBUF-QB-060 | Split mechanism proof from the maintenance verification packet. |
| `ADV` | `PGBUF-Q050` | Dead exported interface | Rewritten | PGBUF-QB-053 | Dedicated availability question. |
| `ADV` | `PGBUF-Q051` | Deallocation diagnostic identity | Merged | PGBUF-QB-055, PGBUF-QB-061 | Kept revision-bound and routed to anomaly-promotion review. |
| `ADV` | `PGBUF-Q052` | Cross-database ownership analogue | Excluded | — | Cross-database Canonical questions are outside the confirmed scope; retain the separately pinned [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison). |
| `ADV` | `PGBUF-Q053` | In-progress miss publication | Rewritten | PGBUF-QB-032 | Retained as a CUBRID-only publication-boundary trace. |
| `ADV` | `PGBUF-Q054` | Cross-database replacement analogy | Excluded | — | Analogy requires separately pinned comparator baselines retained in the [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison). |
| `ADV` | `PGBUF-Q055` | Cross-database durability comparison | Excluded | — | Local durability questions remain CUBRID-only; retain the separately pinned [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison). |
| `HIST` | `HIST-01` | Module contract | Merged | PGBUF-QB-001 | Current Core boundary supersedes the older summary. |
| `HIST` | `HIST-02` | PAGE_PTR reverse mapping | Merged | PGBUF-QB-003 | The Canonical object map owns reverse mapping and hash identity. |
| `HIST` | `HIST-03` | Latch versus transaction lock | Merged | PGBUF-QB-013, PGBUF-QB-014 | Split ownership domain from compatibility choice. |
| `HIST` | `HIST-04` | Dirty victim eligibility | Merged | PGBUF-QB-029 | The hard-predicate question owns eligibility. |
| `HIST` | `HIST-05` | WAL enforcement | Merged | PGBUF-QB-027 | Current pinned-source ordering supersedes the older explanation. |
| `HIST` | `HIST-06` | Three LRU zones | Rewritten | PGBUF-QB-037 | Retained as current replacement policy. |
| `HIST` | `HIST-07` | Fetch modes | Merged | PGBUF-QB-006, PGBUF-QB-044 | Split ordinary choice from special modes. |
| `HIST` | `HIST-08` | Temporary-volume page | Merged | PGBUF-QB-026 | Retained only where temporary-page state affects dirty-generation reasoning. |
| `HIST` | `HIST-09` | Hit and miss fix flow | Merged | PGBUF-QB-007, PGBUF-QB-008 | Current Core traces supersede the monolithic flow. |
| `HIST` | `HIST-10` | Concurrent same-page miss | Merged | PGBUF-QB-008, PGBUF-QB-032 | Split serialization mechanics from publication boundary. |
| `HIST` | `HIST-11` | Packed atomic latch state | Rewritten | PGBUF-QB-031 | Kept only as evidence needed for the lock-free proof. |
| `HIST` | `HIST-12` | Unfix LRU placement | Merged | PGBUF-QB-018, PGBUF-QB-037 | Release debt and replacement policy remain distinct. |
| `HIST` | `HIST-13` | Victim search order | Rewritten | PGBUF-QB-037, PGBUF-QB-040 | Split policy order from pressure progress. |
| `HIST` | `HIST-14` | Direct victim sequence | Rewritten | PGBUF-QB-039 | Dedicated reservation-boundary question. |
| `HIST` | `HIST-15` | Flush phases and failure restoration | Rewritten | PGBUF-QB-028, PGBUF-QB-055 | Normal generation behavior is separated from exceptional proof. |
| `HIST` | `HIST-16` | Checkpoint and recovery | Rewritten | PGBUF-QB-045, PGBUF-QB-046 | Split checkpoint selection from redo idempotence. |
| `HIST` | `HIST-17` | Four daemons | Rewritten | PGBUF-QB-042 | Current lifecycle anchors replace the older inventory. |
| `HIST` | `HIST-18` | Private LRU quota | Rewritten | PGBUF-QB-038 | Policy is explicitly bounded away from correctness. |
| `HIST` | `HIST-19` | Hash and BCB lock order | Merged | PGBUF-QB-009, PGBUF-QB-031, PGBUF-QB-054 | Rechecks and failure ownership are tested at their relevant boundaries. |
| `HIST` | `HIST-20` | FLUSHING victim counts | Merged | PGBUF-QB-029, PGBUF-QB-039 | Eligibility and direct reservation own the observable state. |
| `HIST` | `HIST-21` | Ordered-fix deadlock | Rewritten | PGBUF-QB-035 | Advanced protocol trace owns release and stale observations. |
| `HIST` | `HIST-22` | Deallocation without immediate invalidation | Rewritten | PGBUF-QB-047 | Current cross-module source anchors replace the historical claim. |
| `HIST` | `HIST-23` | AOUT behavior | Rewritten | PGBUF-QB-043 | Explicitly distinguishes compiled support from default policy. |
| `HIST` | `HIST-24` | Historical defect candidates | Rewritten | PGBUF-QB-055 | Preserved only as Historical evidence requiring current-source and runtime promotion. |
| `GRILL` | `GRILL-01` | Successful fix guarantees and limits | Merged | PGBUF-QB-005, PGBUF-QB-020 | Split module postcondition from caller-owned correctness. |
| `GRILL` | `GRILL-02` | Same-VPID cold-miss coordination | Merged | PGBUF-QB-008, PGBUF-QB-032 | Core owns serialization; Advanced owns publication timing. |
| `GRILL` | `GRILL-03` | Zero-fcnt non-victim counterexamples | Merged | PGBUF-QB-029, PGBUF-QB-068 | Eligibility recall becomes a pressure diagnosis artifact. |
| `GRILL` | `GRILL-04` | Hit-ratio semantic loss | Rewritten | PGBUF-QB-064, PGBUF-QB-065 | Split observation limits from increment-site definition. |
| `GRILL` | `GRILL-05` | Dirty BCB with clean holder | Merged | PGBUF-QB-018, PGBUF-QB-028 | Covered by release debt and independent dirty generations. |
| `GRILL` | `GRILL-06` | Page latch versus transaction lock failure | Merged | PGBUF-QB-013, PGBUF-QB-062 | The concept feeds the wait-owner diagnostic. |
| `GRILL` | `GRILL-07` | Conditional child retry revalidation | Rewritten | PGBUF-QB-034, PGBUF-QB-069 | Split promotion/restart from stale-observation audit. |
| `GRILL` | `GRILL-08` | Zero WAL-force count | Merged | PGBUF-QB-027 | Core explains when no additional force is required. |
| `GRILL` | `GRILL-09` | Iowrite multiplicity under DWB | Rewritten | PGBUF-QB-065 | Increment-site card owns multiplicity limits. |
| `GRILL` | `GRILL-10` | Successful copy with dirty resident | Merged | PGBUF-QB-028, PGBUF-QB-041 | G/G+1 reasoning owns the interleaving and victim consequence. |
| `GRILL` | `GRILL-11` | Covered/non-covered plan drift | Rewritten | PGBUF-QB-070 | Becomes an evidence-validity and representative-caller decision. |
| `GRILL` | `GRILL-12` | Safe replacement observation | Rewritten | PGBUF-QB-068, PGBUF-QB-070 | Split pressure diagnosis from risk-matched verification. |
| `PLAN` | `PLAN-01` | Predict cold/warm counters and checksum | Superseded | PGBUF-QB-071 | Executed Quiz 1 is the stronger descendant. |
| `PLAN` | `PLAN-02` | Interpret miss hit and successful-fix counters | Superseded | PGBUF-QB-071 | Recast as a bounded evidence card over executed artifacts. |
| `PLAN` | `PLAN-03` | Explain page versus row read counts | Superseded | PGBUF-QB-071 | Preserved in the cold/warm evidence limits. |
| `PLAN` | `PLAN-04` | Distinguish DWB and volume reads | Superseded | PGBUF-QB-071 | The executed observation explicitly leaves this source open. |
| `PLAN` | `PLAN-05` | Design same-VPID miss protocol | Merged | PGBUF-QB-008, PGBUF-QB-032, PGBUF-QB-071 | Mechanism is Canonical; the exercise labels it unexecuted. |
| `PLAN` | `PLAN-06` | OS cache versus page-buffer miss | Superseded | PGBUF-QB-071 | Preserved as an unsupported physical-device conclusion. |
| `PLAN` | `PLAN-07` | Predict read and insert unfix tuples | Superseded | PGBUF-QB-072 | Executed Quiz 2 is the stronger descendant. |
| `PLAN` | `PLAN-08` | Promotion counts versus contention | Superseded | PGBUF-QB-072 | Preserved as a histogram limitation. |
| `PLAN` | `PLAN-09` | Nested holder/global unfix calculation | Superseded | PGBUF-QB-016, PGBUF-QB-072 | Core owns the invariant; Applied uses the executed family. |
| `PLAN` | `PLAN-10` | Conditional failure cleanup | Merged | PGBUF-QB-014, PGBUF-QB-072 | No-debt failure remains source-derived. |
| `PLAN` | `PLAN-11` | Competing promotion risk | Merged | PGBUF-QB-034 | Advanced promotion/restart owns the scenario. |
| `PLAN` | `PLAN-12` | Transaction lock versus latch | Merged | PGBUF-QB-013, PGBUF-QB-072 | Concept and executed-family limits stay distinct. |
| `PLAN` | `PLAN-13` | Covered versus non-covered prediction | Superseded | PGBUF-QB-073 | Executed Quiz 3 is the stronger descendant. |
| `PLAN` | `PLAN-14` | Caller-chain trace from plan and counters | Superseded | PGBUF-QB-073 | Reframed to forbid runtime-only call-stack claims. |
| `PLAN` | `PLAN-15` | Update all-exit cleanup table | Superseded | PGBUF-QB-073 | Retained as the exercise’s source-tracing artifact. |
| `PLAN` | `PLAN-16` | Parent-child conditional retry | Merged | PGBUF-QB-034, PGBUF-QB-069 | Promotion and stale-observation routes own the risk. |
| `PLAN` | `PLAN-17` | Watcher ordering state | Merged | PGBUF-QB-022, PGBUF-QB-073 | Core owns the watcher model; exercise applies it. |
| `PLAN` | `PLAN-18` | Redesign raw page handles | Excluded | — | Interface redesign speculation is outside the evidence-bound migration. |
| `PLAN` | `PLAN-19` | Counter cannot prove exact call stack | Superseded | PGBUF-QB-073 | Preserved as an explicit receipt boundary. |
| `PLAN` | `PLAN-20` | Predict dirty log and write counters | Superseded | PGBUF-QB-074 | Executed Quiz 4 is the stronger descendant. |
| `PLAN` | `PLAN-21` | Iowrites with zero flushed counter | Superseded | PGBUF-QB-065, PGBUF-QB-074 | Counter semantics and exercise limits share ownership. |
| `PLAN` | `PLAN-22` | Complete dirty-to-write ordering | Superseded | PGBUF-QB-074 | Preserved as a source-derived chain. |
| `PLAN` | `PLAN-23` | Concurrent re-dirty interleaving | Superseded | PGBUF-QB-028, PGBUF-QB-074 | Core owns G/G+1; exercise applies it. |
| `PLAN` | `PLAN-24` | Victim restrictions diagram | Superseded | PGBUF-QB-029, PGBUF-QB-074 | Eligibility remains source-derived and unexecuted. |
| `PLAN` | `PLAN-25` | Flush-failure dirty restoration | Merged | PGBUF-QB-055, PGBUF-QB-067 | Candidate status belongs to the registry and scenario route. |
| `PLAN` | `PLAN-26` | Cross-database durability comparison | Excluded | — | Cross-database Canonical questions are outside the confirmed scope; retain the separately pinned [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison). |
| `PLAN` | `PLAN-27` | Clean restart proof limit | Superseded | PGBUF-QB-070, PGBUF-QB-074 | Preserved as a boundary and risk-matched verification decision. |
| `EXEC` | `EXEC-01` | Predict cold/warm direction | Retained | PGBUF-QB-071 | Executed Quiz 1 prompt is consolidated into one evidence card. |
| `EXEC` | `EXEC-02` | Explain row versus ioread count | Merged | PGBUF-QB-071 | Same executed family and evidence boundary. |
| `EXEC` | `EXEC-03` | Same-VPID publication protocol | Merged | PGBUF-QB-032, PGBUF-QB-071 | Publication is source-derived, not executed by the quiz. |
| `EXEC` | `EXEC-04` | OS cache versus CUBRID miss | Merged | PGBUF-QB-071 | Kept as an unsupported-conclusion check. |
| `EXEC` | `EXEC-05` | Read versus insert signature | Retained | PGBUF-QB-072 | Executed Quiz 2 prompt is consolidated into one evidence card. |
| `EXEC` | `EXEC-06` | Holder/global unfix ledger | Merged | PGBUF-QB-016, PGBUF-QB-072 | Runtime category and source-derived ledger are distinguished. |
| `EXEC` | `EXEC-07` | Conditional-failure debt | Merged | PGBUF-QB-014, PGBUF-QB-072 | Remains an Interface contract, not a runtime observation. |
| `EXEC` | `EXEC-08` | Transaction lock versus latch | Merged | PGBUF-QB-013, PGBUF-QB-072 | Applied card preserves the instrumentation limit. |
| `EXEC` | `EXEC-09` | Covered versus non-covered | Retained | PGBUF-QB-073 | Executed Quiz 3 prompt is consolidated into one evidence card. |
| `EXEC` | `EXEC-10` | Parent child heap cleanup | Merged | PGBUF-QB-073 | Retained as source-tracing work not executed proof. |
| `EXEC` | `EXEC-11` | Ordered-refix revalidation | Merged | PGBUF-QB-069, PGBUF-QB-073 | Scenario owns diagnosis; exercise owns application. |
| `EXEC` | `EXEC-12` | Recovery page-LSA gate | Merged | PGBUF-QB-046, PGBUF-QB-073 | Advanced owns mechanism; exercise labels it unexecuted. |
| `EXEC` | `EXEC-13` | Dirty and LSA roles | Retained | PGBUF-QB-074 | Executed Quiz 4 prompt is consolidated into one evidence card. |
| `EXEC` | `EXEC-14` | WAL and DWB/direct sequence | Merged | PGBUF-QB-027, PGBUF-QB-074 | Core owns ordering; exercise bounds the receipt. |
| `EXEC` | `EXEC-15` | Re-dirty after successful copy | Merged | PGBUF-QB-028, PGBUF-QB-074 | G/G+1 remains source-derived. |
| `EXEC` | `EXEC-16` | Zero-fcnt victim counterexamples | Merged | PGBUF-QB-029, PGBUF-QB-074 | Actual eviction was not executed. |
| `EXEC` | `EXEC-17` | Cross-database mechanism comparison | Excluded | — | Cross-database Canonical questions are outside the confirmed scope; retain the separately pinned [comparison evidence](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison). |

## Authoring navigation

- Review the [Question-bank entry](./README.md).
- Apply the evidence vocabulary from [CONTEXT.md](../CONTEXT.md#evidence-language).
- Resolve mutable status only through the [evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md).
