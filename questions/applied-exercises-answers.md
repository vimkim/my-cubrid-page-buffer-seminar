# Applied Exercise Answers

**Level:** Question bank — Applied-exercise answers
**Prerequisites:** Attempt the matching item in [Applied exercises](./applied-exercises.md)
**Capability gained:** Evaluate a source/runtime evidence card using its recorded revision, build, configuration, workload, receipt, and unsupported boundaries.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism and Runtime observation from pinned source, executed quiz artifacts, and accepted receipts

Use IDs to pair these answers with [Applied exercises](./applied-exercises.md). Existing runtime observations are bounded cases, not performance or correctness oracles for another build or workload.

## Cold miss and warm reuse

### PGBUF-QB-071 — What does the cold/warm evidence establish?

- **Evidence:** Verified mechanism and Runtime observation
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:7981-8178,8392-8634,8497`; [quiz](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-1/quiz.md), [answer](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-1/answer.md), [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-1/quiz.sql), [manifest](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-1/quiz.json), and [accepted receipt metadata](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/evidence/runs/rebind-quiz1/meta.json)
- **Confidence/limit:** The receipt establishes one successful same-revision run; miss coordination remains source-derived because the workload did not schedule concurrent loaders.

**Model answer:** Record the exact pinned revision, captured build/configuration from the manifest and receipt, two-scan workload, identical-result control, first-positive/second-zero page-buffer ioread observation, and receipt identifier. The supported conclusion is a cold-load signature followed by immediate resident reuse in this run. Source tracing adds that one VPID-keyed owner prepares and publishes while waiters retry lookup. Unsupported conclusions include exact VPID/frame, DWB versus volume source, physical-device miss, latch wait, duplicate-loader execution, permanent residency, and a universal second-run zero.

**Why:** The retained artifacts reproduce the workload and observation but do not expand the instrumentation boundary.

## Holder and global fix accounting

### PGBUF-QB-072 — Can counters reconstruct holder debt?

- **Evidence:** Verified mechanism and Runtime observation
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:6000-6055,6724-7040`; [quiz](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-2/quiz.md), [answer](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-2/answer.md), [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-2/quiz.sql), [manifest](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-2/quiz.json), and [accepted receipt metadata](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/evidence/runs/rebind-quiz2/meta.json)
- **Confidence/limit:** Captured call-class signatures do not identify one BCB, holder list, or waiter queue.

**Model answer:** Predict non-dirty READ activity for the read phase and WRITE/MIXED plus holder-dirty activity for mutation, treating counts as events rather than rows or unique pages. The source-derived ledger is holder/global `2/3 → 1/2 → 0/1`; only the other holder’s last global release can reach `fcnt=0`. Conditional failure creates no caller debt. The evidence card must separate the successful runtime mutation signature from the unexecuted exact holder, contention, timeout, interrupt, promotion-failure, and transaction-lock cases.

**Why:** Histogram categories summarize paths; ownership correctness is defined by the paired holder and BCB ledgers.

## Caller paths and cleanup

### PGBUF-QB-073 — Which caller obligations survive different access paths?

- **Evidence:** Verified mechanism and Runtime observation
- **Canonical guide:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Source anchors:** `src/storage/heap_file.c:20493-20664`; `src/transaction/log_recovery_redo.hpp:587-668`; [quiz](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-3/quiz.md), [answer](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-3/answer.md), [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-3/quiz.sql), [manifest](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-3/quiz.json), and [accepted receipt metadata](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/evidence/runs/rebind-quiz3/meta.json)
- **Confidence/limit:** Query-shape observations support the captured covered/non-covered case, not every caller exit, ordered interleaving, or redo execution.

**Model answer:** A covered scan can form values from the index tuple while a non-covered scan follows OIDs to heap records. For each successfully fixed parent, child, or heap page, the exit table names exactly one release owner; only modified pages take logging/dirty debt, and failed acquisitions add none. If ordered access temporarily released a page, discard page-local pointers, slots, offsets, and derived traversal decisions and reread them. Generic redo uses recovery acquisition and a page-LSA comparison to skip already represented records. Label the latter cleanup and recovery statements Verified mechanism, not Runtime observation from the SQL run.

**Why:** One workload can select representative callers while source tracing still owns their negative paths and recovery semantics.

## Dirty generation and persistence boundaries

### PGBUF-QB-074 — Where does dirty-to-reuse runtime evidence stop?

- **Evidence:** Verified mechanism and Runtime observation
- **Canonical guide:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Source anchors:** `src/storage/page_buffer.c:9293-9538,10795-10952`; [quiz](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-4/quiz.md), [answer](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-4/answer.md), [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-4/quiz.sql), [manifest](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-4/quiz.json), and [accepted receipt metadata](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/evidence/runs/rebind-quiz4/meta.json)
- **Confidence/limit:** The successful mutation/commit observation does not directly observe WAL force, DWB/data-volume ordering, crash redo, or victim reuse.

**Model answer:** Separate resident `DIRTY`, page LSA, and oldest-unflushed lower bound. The verified mechanism is stable copy and `FLUSHING`, WAL force through the copied page LSA, DWB/direct submission, completion, and preservation of a concurrent G+1 re-dirty. A candidate still requires hard protected checks: no fix/latch/wait/transient ownership, clean, not flushing, valid zone/identity, and no invalid direct reservation. The receipt supports the recorded mutation and counter/result observations only; it does not prove per-page physical order, unique writes, checkpoint completion, torn-page defense, crash recovery, or an actual eviction.

**Why:** The source chain spans boundaries that the successful SQL run and aggregate counters did not instrument.

## Route navigation

- Return to [Applied exercises](./applied-exercises.md)
- Review evidence selection in [Maintenance scenarios](./maintenance-scenarios.md#verify-at-the-risk-boundary)
- Return to the [Question-bank entry](./README.md)
