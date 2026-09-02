# Change the Module Safely

**Level:** Playbook
**Prerequisites:** [Contract and Objects](../learning/01-contract-and-objects.md) and [Fix, Hold, and Release](../learning/02-fix-hold-release.md) for meaningful use
**Capability gained:** Turn a proposed change into a caller-visible contract, ownership ledger, negative-path audit, caller review, and risk-matched evidence plan.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract, Verified mechanism, Implementation policy, and Inference from canonical learning pages, the [source map](../reference/source-map.md), and [invariant index](../reference/invariant-index.md).

## 1. State the behavior before the diff

Write one caller-visible behavior statement: given these preconditions, this interface returns this result, creates/transfers this ownership, and exposes these failure/retry outcomes. Name the interface family—normal fix, ordered access, dirty/flush, invalidation, copy helper, diagnostics, or lifecycle—and its callers.

Then list owners: current thread, holder, BCB, waiter/load owner, caller subsystem, log manager, DWB/file I/O, or lifecycle coordinator. If ownership cannot be named, the change is not ready.

## 2. Build the transition ledger

| Field | Record |
|---|---|
| **State** | Fields, counters, flags, identity, list/queue membership, page bytes, LSAs, pointers. |
| **Guards** | Mutex/latch/atomic order, transaction lock, caller precondition, lifecycle phase. |
| **Dropped protection** | What becomes stale while protection is temporarily dropped, and what is revalidated after reacquisition? |
| **Dependency seam** | Allocation, loader, validation, logging, TDE, DWB, file I/O, daemon, recovery, caller callback. |
| **Success debt** | Fix/unfix, waiter/grant, watcher transfer, dirty generation, system operation, allocation, lock. |
| **Retry behavior** | Retry owner, state retained, stale inputs discarded, wait/timeout contract. |
| **Failure unwind** | State restored, debt consumed, wakeup emitted, error propagated, remaining uncertainty. |

Audit every early return and `goto` against resources and state already acquired—not merely the resources acquired in the same function. Expand helpers at ownership-transfer seams.

## 3. Separate contract change from policy change

A **contract change** alters caller-visible success/failure, ownership debt, identity, durability ordering, or invariant. Audit all interface-family callers and add representative caller, negative-path, and concurrency/failure evidence.

A **policy change** alters selection, placement, batching, quota, cadence, or preference while preserving the contract. Test the hard invariant first, then pressure/progress/performance behavior. If policy leaks into a new return or ownership state, it has become a contract change.

Use the [Source and Caller Map](../reference/source-map.md) to select callers and the [Maintainer Invariant Index](../reference/invariant-index.md) to name the preserved guarantees.

### Replacement-policy change gate

For a replacement-algorithm change, make the following preservation ledger explicit before editing:

- Keep the hard eligibility gate independent of preference: stable identity, zero fix ownership and waiters, no blocking transient flag, clean/not-flushing state, and a final BCB-protected recheck.
- Preserve one-list membership, zone counts and hints, and the established lock discipline. In particular, a victim scan holding an LRU mutex only tries the BCB mutex; it must not introduce an unbounded wait that reverses the normal order.
- Trace both initial placement and later zero-crossing unfix. A new selection policy is incomplete if insertion, promotion, demotion, and private-to-shared movement still encode incompatible assumptions.
- Preserve no-free-BCB progress: invalid-list preference, direct-victim assignment and revocation, timeout/interrupt cleanup, dirty-generation handoff, and synchronous progress when daemons are unavailable.
- Exercise private quotas enabled and disabled, server and stand-alone/recovery operation, and the analyzed default with AOUT disabled. Recheck all of these assumptions on the target revision.
- Prove an actual eligible frame was evicted under controlled pressure, then test progress, fairness, and performance separately. A changed counter or a cold/warm read difference does not prove the new victim order.

Use [Replacement Policy and Background Progress](../advanced/replacement-progress.md) for the pinned search order, quotas, and daemon coordination, and [Replace One Frame](../learning/05-replace-one-frame.md) for the invariant the policy must not weaken.

## 4. Audit the applicable negative paths

- Expected absence such as `OLD_PAGE_IF_IN_BUFFER` returning `NULL` without debt.
- Conditional rejection without blocking.
- Timeout and interrupt while waiting.
- Loader retry after another thread publishes the resident identity.
- Allocation failure, including internal holder/queue/bookkeeping growth.
- Read/decrypt/validation failure during materialization.
- WAL/DWB/write failure during propagation.
- Partial refix or ordered-watcher reordering failure.
- Lifecycle context: boot, recovery, temporary volume, shutdown, or module finalization.

For each applicable path, record return value, ownership, flags/counters, wakeups, retry owner, and observable caller consequence. Route unresolved source-visible candidates to [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md); do not copy status here.

## 5. Preserve CUBRID source form

Inside the CUBRID source repository, preserve existing indentation exactly and avoid indentation-only churn. Legacy `.c`/`.h` files are GNU-indent formatted even though most compile as C++. Wrap C++-specific syntax in those files exactly:

```c
/* *INDENT-OFF* */
C++ syntax code
/* *INDENT-ON* */
```

If indentation changes without semantic reason, stop and inspect the formatter result.

## 6. Choose evidence before implementation

Write the risk and select the narrowest evidence that crosses it using [Verify at the Risk Boundary](./verify-a-change.md). A success-only unit test cannot close a waiter race; a stress run cannot prove an injected allocation unwind; a counter cannot prove home-page persistence.

## 7. Close out the plan

Before review, answer:

1. What caller-visible behavior changes, and what remains compatible?
2. Which invariants and owners are touched?
3. Which early exit has the most accumulated debt?
4. Which protection is dropped, and what final recheck closes the stale window?
5. Which representative caller and failure seam prove the risk?
6. What remains untested or version-sensitive?

## Related routes

- [Practice contract-versus-policy review](../questions/maintenance-scenarios.md#pgbuf-qb-056-is-the-proposed-change-a-contract-change-or-a-policy-change)
- [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- [Flush One Generation](../learning/04-flush-one-generation.md)
- [Maintainer Invariant Index](../reference/invariant-index.md)
- [Source and Caller Map](../reference/source-map.md)
- [Verify at the Risk Boundary](./verify-a-change.md)
- [Source inventory](../source-inventory.md)
