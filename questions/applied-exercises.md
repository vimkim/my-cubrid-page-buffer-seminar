# Applied Exercise Prompts

**Level:** Question bank — Applied exercises
**Prerequisites:** The Core page named by each exercise
**Capability gained:** Predict and interpret source plus captured same-revision evidence while stating exactly what the observation cannot prove.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism and Runtime observation from pinned source, executed quiz artifacts, and accepted receipts

These are documentation cards, not executable runners. Attempt each prompt before opening the [Applied answers](./applied-exercises-answers.md); the linked evidence tree retains setup, SQL, runner ownership checks, and raw receipts.

## Cold miss and warm reuse

Prerequisite: [Fix, Hold, and Release](../learning/02-fix-hold-release.md).

### PGBUF-QB-071 — What does the cold/warm evidence establish?

- **Route:** Applied exercise
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Predict a cold/warm signature, trace the miss protocol, and write a bounded evidence card.
- **Inspect:** [Quiz 1](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-1/quiz.md), its [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-1/quiz.sql), and `src/storage/page_buffer.c:7981-8178,8392-8634,8497`

**Question:** Before reading the answer, predict both scans, explain same-VPID miss serialization, and submit revision/build/configuration/workload/observation/supported/unsupported/receipt fields. Do not infer a physical-device miss or executed concurrency schedule.

## Holder and global fix accounting

Prerequisite: [Fix, Hold, and Release](../learning/02-fix-hold-release.md).

### PGBUF-QB-072 — Can counters reconstruct holder debt?

- **Route:** Applied exercise
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Combine captured signatures with a source-derived two-ledger state transition.
- **Inspect:** [Quiz 2](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-2/quiz.md), its [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-2/quiz.sql), and `src/storage/page_buffer.c:6000-6055,6724-7040`

**Question:** Predict read and insert signatures, calculate two unfix transitions from holder `fix_count=2` and BCB `fcnt=3`, and state why the runtime histogram does not expose one exact holder chain, waiter schedule, or transaction lock.

## Caller paths and cleanup

Prerequisite: [Caller Completes Correctness](../learning/03-caller-completes-correctness.md).

### PGBUF-QB-073 — Which caller obligations survive different access paths?

- **Route:** Applied exercise
- **Retrieval mode:** Trace
- **Prerequisite:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Capability tested:** Correlate a query-shape observation with source-owned cleanup, ordered refix, and recovery duties.
- **Inspect:** [Quiz 3](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-3/quiz.md), its [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-3/quiz.sql), `src/storage/heap_file.c:20493-20664`, and `src/transaction/log_recovery_redo.hpp:587-668`

**Question:** Predict covered versus non-covered behavior, build an all-exit ownership table for parent/child/heap pages, list observations invalidated by ordered refix, and explain the redo page-LSA gate without claiming those source paths were executed by the quiz.

## Dirty generation and persistence boundaries

Prerequisite: [Flush One Generation](../learning/04-flush-one-generation.md) and [Replace One Frame](../learning/05-replace-one-frame.md).

### PGBUF-QB-074 — Where does dirty-to-reuse runtime evidence stop?

- **Route:** Applied exercise
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Capability tested:** Reconstruct dirty/WAL/copy/write/re-dirty/victim state while bounding a mutation-and-commit observation.
- **Inspect:** [Quiz 4](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-4/quiz.md), its [SQL](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/quiz-4/quiz.sql), and `src/storage/page_buffer.c:9293-9538,10795-10952`

**Question:** Predict dirty and write-related observations, complete the WAL-before-page sequence, draw a G/G+1 re-dirty interleaving and victim rejection table, then state why clean completion does not prove physical ordering, crash recovery, or actual eviction.

## Route navigation

- Compare only after attempting: [Applied answers](./applied-exercises-answers.md)
- Choose verification proportional to the claim: [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- Return to the [Question-bank entry](./README.md)
