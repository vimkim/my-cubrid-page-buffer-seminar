# Question-bank Migration Audit

**Level:** Question bank — Migration reference
**Prerequisites:** None; this page is for documentation maintainers
**Capability gained:** Trace every source prompt to a Canonical question or a deliberate, evidence-aware exclusion.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, with older material explicitly revision-bound
**Evidence used:** Verified mechanism, Runtime observation, and Historical evidence from the [source inventory](../source-inventory.md) and linked source banks

**Migration status:** In progress

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
| `TEACH` | `TEACH-34` | Cross-database ownership comparison | Excluded | — | Cross-database Canonical questions are outside the confirmed CUBRID-only scope. |
| `TEACH` | `TEACH-35` | Cross-database fix comparison | Excluded | — | Existing comparison evidence remains linked outside the Canonical bank. |
| `TEACH` | `TEACH-36` | Cross-database durability comparison | Excluded | — | Would introduce separately pinned comparator baselines. |
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

## Authoring navigation

- Review the [Question-bank entry](./README.md).
- Apply the evidence vocabulary from [CONTEXT.md](../CONTEXT.md#evidence-language).
- Resolve mutable status only through the [evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md).
