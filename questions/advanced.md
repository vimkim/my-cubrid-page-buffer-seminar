# Advanced Retrieval Prompts

**Level:** Question bank — Advanced
**Prerequisites:** Core completion plus the Advanced page named by each group
**Capability gained:** Extend Core invariants through concurrency, replacement progress, recovery, specialized owner protocols, and open proof obligations.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Implementation policy, Inference, and Historical evidence from pinned source and linked Evidence references

Attempt these optional prompts before opening the [Advanced answers](./advanced-answers.md). Policy and historical mechanisms are never upgraded into Interface guarantees by their presence here.

## Acquisition concurrency

Prerequisite: [Acquisition Concurrency and Multi-page Ownership](../advanced/acquisition-concurrency.md).

### PGBUF-QB-031 — What closes the lock-free READ-hit proof?

- **Route:** Advanced
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** State the identity, lifetime, and memory-order argument required for lock-free success.
- **Inspect:** `src/storage/page_buffer.c:7725-7786`; [VS-14](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)

**Question:** Explain why positive `fcnt` is central to reuse exclusion, what the missing post-CAS VPID recheck leaves to prove, and what controlled interleaving would challenge the argument.

### PGBUF-QB-032 — When does a cold miss become the resident mapping?

- **Route:** Advanced
- **Retrieval mode:** Trace
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Mark provisional ownership, publication, wakeup, and waiter retry transitions.
- **Inspect:** `src/storage/page_buffer.c:7981-8178,8392-8634`

**Question:** Trace the VPID-keyed owner/waiter protocol and identify the exact conceptual boundary between an owner-prepared provisional BCB and a mapping another thread may find.

### PGBUF-QB-033 — How are many unconditional WRITE waiters handled?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Draw queue, wakeup, retry, timeout, and interrupt states for one hundred writers.
- **Inspect:** `src/storage/page_buffer.c:6277-7582`

**Question:** One hundred threads request an incompatible WRITE latch unconditionally. Describe what is serialized, what may wake or retry, and which fairness or completion claims the source does not justify.

### PGBUF-QB-034 — When should promotion failure trigger restart?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Produce a B-tree release-and-restart decision path.
- **Inspect:** `src/storage/page_buffer.c:2842-3050`; `src/storage/btree.c:28365-28393,28638-28696`

**Question:** Contrast waiting for READ-to-WRITE promotion with a caller that releases pages, changes traversal policy, and restarts after promotion failure.

### PGBUF-QB-035 — Why can ordered fixing release pages first?

- **Route:** Advanced
- **Retrieval mode:** Trace
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Reconstruct release, sort, refix, callback, and stale-observation obligations.
- **Inspect:** `src/storage/page_buffer.c:12268-13531`; `src/storage/heap_file.c:20493-20664`

**Question:** Explain how ordered watchers avoid an unsafe multi-page acquisition order and why successful refix still requires caller revalidation.

### PGBUF-QB-036 — What is avoid-deallocation ownership for?

- **Route:** Advanced
- **Retrieval mode:** Explain
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Distinguish vacuum deallocation protection from ordinary victim eligibility.
- **Inspect:** `src/storage/page_buffer.c:16262-16296`

**Question:** Define the narrow owner protocol protected by avoid-deallocation bookkeeping and explain why it is not a general pin, latch, or ordinary victim blocker.

## Replacement progress

Prerequisite: [Replacement Policy and Background Progress](../advanced/replacement-progress.md).

### PGBUF-QB-037 — What do LRU domains and zones decide?

- **Route:** Advanced
- **Retrieval mode:** Explain
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Separate candidate-search policy from hard reuse authorization.
- **Inspect:** `src/storage/page_buffer.c:560-773,5744-5903,9293-9538`

**Question:** Explain private/shared LRU domains, LRU1/LRU2/LRU3 zones, and victim hints without treating any of them as proof that a BCB is safe to reuse.

### PGBUF-QB-038 — What correctness claim can quota policy make?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Classify quota/list decisions as policy and preserve final eligibility checks.
- **Inspect:** `src/storage/page_buffer.c:13942-14440`

**Question:** A private list is over quota while a shared list has candidates. Explain what quota may influence and which safety properties it cannot override.

### PGBUF-QB-039 — Why is a direct victim only a reservation?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Draw assignment, intervening fix, revocation, and allocator retry.
- **Inspect:** `src/storage/page_buffer.c:15420-15627`

**Question:** Trace a direct-victim handoff that is revoked because another worker fixes the page before consumption.

### PGBUF-QB-040 — What happens when no free BCB is immediately available?

- **Route:** Advanced
- **Retrieval mode:** Trace
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Trace invalid/free search, victim search, flush/progress wakeup, wait, retry, and terminal outcomes.
- **Inspect:** `src/storage/page_buffer.c:8290-8389`

**Question:** Explain why “the free BCB list is empty” does not imply one infinite wait, and identify timeout, interrupt, retry, direct-victim, and all-dirty outcomes.

### PGBUF-QB-041 — Can post-flush assign an old generation as a victim?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Apply G/G+1 generation reasoning to post-flush victim assignment.
- **Inspect:** `src/storage/page_buffer.c:10925-10952,15489-15556`

**Question:** A victim flush submits G and the resident page becomes dirty as G+1. State why post-flush must reject assignment even if G completed successfully.

### PGBUF-QB-042 — What do the four page-buffer daemons own?

- **Route:** Advanced
- **Retrieval mode:** Explain
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Map background owners without turning cadence or thresholds into contracts.
- **Inspect:** `src/storage/page_buffer.c:16972-17298`

**Question:** Assign maintenance, page-flush, post-flush, and flush-control responsibilities, then list the timing and policy facts that require target-revision revalidation.

### PGBUF-QB-043 — Is AOUT active replacement policy?

- **Route:** Advanced
- **Retrieval mode:** Explain
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Distinguish present data structures from participation in the analyzed default.
- **Inspect:** `src/storage/page_buffer.c:5807-5903,10475-10720`; `src/base/system_parameter.c:9976-9986`

**Question:** Explain the intended ghost-history role of AOUT and why the pinned/default evidence does not justify describing it as active policy unconditionally.

## Recovery and lifecycle

Prerequisite: [Recovery, Allocation State, and Module Lifecycle](../advanced/recovery-and-lifecycle.md).

### PGBUF-QB-044 — Who owns special fetch and metadata-mutation protocols?

- **Route:** Advanced
- **Retrieval mode:** Explain
- **Prerequisite:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Capability tested:** Assign allocation, temporary-page, recovery, and metadata-mutation knowledge to the correct owner.
- **Inspect:** `src/storage/file_manager.c:5420-5590`; `src/storage/page_buffer.c:4959-5537,14896-15405,17305-17319`

**Question:** Contrast `NEW_PAGE`, `RECOVERY_PAGE`, deallocated/maybe-deallocated, and temporary-page protocols. Then classify LSA, temporary-LSA, page-type, and TDE getters/setters by borrowed lifetime, latch/context requirement, dirty/logging side effect, and why none is a general validation or recovery bypass.

### PGBUF-QB-045 — Why is checkpoint not “flush every page”?

- **Route:** Advanced
- **Retrieval mode:** Trace
- **Prerequisite:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Capability tested:** Draw selective page-buffer, WAL, filesystem, checkpoint-record, and volume-metadata boundaries.
- **Inspect:** `src/transaction/log_page_buffer.c:6901-7406`

**Question:** Trace checkpoint ownership and explain what the selective page-buffer step returns to the surrounding log/filesystem protocol.

### PGBUF-QB-046 — How does redo use page LSA for idempotence?

- **Route:** Advanced
- **Retrieval mode:** Trace
- **Prerequisite:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Capability tested:** Mark recovery fix, page-LSA gate, apply, LSA update, dirtying, skip, and cleanup.
- **Inspect:** `src/transaction/log_recovery.c:497-536,6407-6431`; `src/transaction/log_recovery_redo.hpp:587-668`

**Question:** Explain why the generic redo path can skip an already represented record and what the page-LSA argument does not prove about arbitrary callback side effects.

### PGBUF-QB-047 — How do deallocation, invalidation, and raw overwrite interact?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Capability tested:** Assign logical allocation decisions and resident-cache coherence to their owners.
- **Inspect:** `src/storage/disk_manager.c:721-811`; `src/storage/page_buffer.c:14896-14921,15133-15303`

**Question:** A file/disk path logically deallocates or bypass-writes an identity. Explain why page-buffer invalidation is a coherence consequence rather than the logical deallocation decision itself.

### PGBUF-QB-048 — What dependency order constrains lifecycle changes?

- **Route:** Advanced
- **Retrieval mode:** Trace
- **Prerequisite:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Capability tested:** Produce an initialize/recover/gate/shutdown/finalize dependency chain.
- **Inspect:** `src/transaction/log_tran_table.c:468-512,580-594`; `src/transaction/boot_sr.c:1974-2801,3055-3113`; `src/storage/page_buffer.c:16996-17255`

**Question:** Explain why daemon gating follows recovery and why logging finalization that propagates pages must precede page-buffer finalization.

## Specialized interfaces and observability

Prerequisite: [Specialized Interfaces and Approximate Observability](../advanced/specialized-interfaces.md).

### PGBUF-QB-049 — Why is simple fix not a faster ordinary fix?

- **Route:** Advanced
- **Retrieval mode:** Explain
- **Prerequisite:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Capability tested:** State the narrow owner protocol and missing ordinary guarantees.
- **Inspect:** `src/storage/page_buffer.h:270-273`; `src/storage/page_buffer.c:2688-2811`; `src/query/query_manager.c:2733`

**Question:** Identify the temporary/read-only assumptions, omitted page-content latch/holder diagnostics, and owner-specific cleanup that prevent general substitution.

### PGBUF-QB-050 — What does a scan-copy handle own?

- **Route:** Advanced
- **Retrieval mode:** Trace
- **Prerequisite:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Capability tested:** Trace copied-state lifetime separately from an ordinary fixed PAGE_PTR.
- **Inspect:** `src/storage/page_buffer.c:910-981`; `src/storage/heap_file.c:6439-6465,6787-6829,7556-7645,7923-7984`

**Question:** Explain why scan-copy state is an opaque owner protocol and which lifetime assumptions would be wrong if it were treated as an ordinary fixed page.

### PGBUF-QB-051 — Why are area-copy helpers hazardous conveniences?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Capability tested:** Compare documented flags with executable branches and owner-specific logging behavior.
- **Inspect:** `src/storage/page_buffer.c:4701-4912`; [VS-02 and VS-03](../unresolved-or-version-sensitive-findings.md#a-current-pinned-revision-interface-hazards)

**Question:** Explain why neither copy helper should become a general page reader/writer abstraction without resolving its fetch and logging contract.

### PGBUF-QB-052 — What can approximate diagnostics authorize?

- **Route:** Advanced
- **Retrieval mode:** Scenario
- **Prerequisite:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Capability tested:** Separate diagnostic hypothesis from correctness authorization.
- **Inspect:** `src/storage/page_buffer.c:14748-14847,17323-17530`; [VS-04 and VS-05](../unresolved-or-version-sensitive-findings.md#a-current-pinned-revision-interface-hazards)

**Question:** A SHOW/statistics snapshot reports a suspicious count. State what it may guide and why it cannot authorize mutation, deallocation, invalidation, or victim selection.

## Failure and proof obligations

Prerequisite: [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md).

### PGBUF-QB-053 — When is an exported name not an available Interface?

- **Route:** Advanced
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Failure and Proof Obligations](../advanced/failure-and-proof-obligations.md)
- **Capability tested:** Produce declaration definition caller and link-seam evidence for one dead Interface.
- **Inspect:** `src/storage/page_buffer.h:320-326`; [VS-01](../unresolved-or-version-sensitive-findings.md#a-current-pinned-revision-interface-hazards)

**Question:** Explain why a declaration/macro mapping without a located definition or caller must not be taught as an optimization choice.

### PGBUF-QB-054 — How do you audit a failure after ownership changes?

- **Route:** Advanced
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Failure and Proof Obligations](../advanced/failure-and-proof-obligations.md)
- **Capability tested:** Produce a post-grant failure ledger for identity latch fcnt holder waiters and retry.
- **Inspect:** `src/storage/page_buffer.c:6000-6055,6457-6522,6595-6617,7738-7773`; [VS-11](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)

**Question:** Holder allocation returns `NULL` after a latch/fix grant. Separate visible control flow, reachability, surviving state, impact, and the fault injection needed to promote the claim.

### PGBUF-QB-055 — What evidence promotes an exceptional-path candidate?

- **Route:** Advanced
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Failure and Proof Obligations](../advanced/failure-and-proof-obligations.md)
- **Capability tested:** Build the five-level evidence ladder and select the owned fault or schedule seam.
- **Inspect:** `src/storage/page_buffer.c:8510-8515,10795-10923`; [current proof obligations](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)

**Question:** For a cold-load or flush early return, state what source inspection establishes, what state must be measured, and why current-branch or production-defect status requires additional evidence.

## Route navigation

- Compare only after attempting: [Advanced answers](./advanced-answers.md)
- Practice task-shaped decisions: [Maintenance scenarios](./maintenance-scenarios.md)
- Return to the [Question-bank entry](./README.md)
