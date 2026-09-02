# Diagnose Page-buffer Symptoms

**Level:** Playbook
**Prerequisites:** None for routing; linked canonical pages supply interpretation
**Capability gained:** Route a symptom to its state owner, wait class, source region, evidence boundary, and next probe.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Inference, and Runtime observation from the [Source and Caller Map](../reference/source-map.md), canonical lessons, and the [uncertainty registry](../unresolved-or-version-sensitive-findings.md).

## First classify the wait or owner

Do not begin with “page buffer is hanging.” Determine whether the observed delay belongs to:

| Class | Owner/evidence to identify first |
|---|---|
| **Transaction lock** | logical object, lock mode, transaction holder/waiter, deadlock/timeout result |
| **Page latch** | VPID/BCB, requested mode/condition, current holders, latch waiter state |
| **Cold-load serialization** | VPID-keyed buffer-lock/load owner, provisional BCB, publication/retry |
| **Victim pressure** | allocation waiter, actual pool pressure, hard eligibility failures, search/progress policy |
| **Flush wait** | copied generation, `DIRTY`/`FLUSHING`, WAL/DWB/write boundary, waiter wakeup |

Each class has different owners and proof. A transaction-lock trace cannot establish a page-latch queue fault; an I/O counter cannot identify cold-load ownership.

## Fix or holder leak

**Inspect:** global `fcnt`, the current thread’s holder and nested debt, watcher ownership, promotion/ordered transfer, and every post-grant failure. Include request-end diagnostics such as remaining hold counts; do not treat them as the root cause by themselves.

**Route:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md), acquisition regions in the [source map](../reference/source-map.md), and open post-grant case `VS-11` in the [registry](../unresolved-or-version-sensitive-findings.md).

**Next evidence:** reproduce with one VPID and annotated success/error/restart exits. For post-grant allocation, inject the failure and assert both ownership ledgers.

## Residency or identity corruption

**Inspect:** hash-chain lookup, VPID-keyed load ownership, provisional setup and provisional cleanup, publication order, all identity rechecks, victim removal/rebind, and any bypass I/O path that reads/writes outside ordinary residency.

**Route:** [Contract and Objects](../learning/01-contract-and-objects.md), [Acquisition Concurrency](../advanced/acquisition-concurrency.md), [Replacement Progress](../advanced/replacement-progress.md), plus `VS-10` and `VS-14` in the [registry](../unresolved-or-version-sensitive-findings.md).

**Next evidence:** a controlled duplicate-loader or victim/fix schedule with VPID, BCB identity, hash membership, load owner, `fcnt`, and publication/retry events. A crash alone does not locate the stale window.

## No victim under pressure

**Inspect eligibility first:** identity/zone, fix ownership, waiters/transient claims, `DIRTY`, `FLUSHING`, direct-victim state, and final protected recheck. Only then inspect LRU/private/shared placement, quota, candidate queues, daemons, and direct assignment.

**Route:** [Replace One Frame](../learning/05-replace-one-frame.md), replacement regions in the [source map](../reference/source-map.md), then [Replacement Progress](../advanced/replacement-progress.md).

**Next evidence:** require actual pressure evidence—an allocator unable to obtain a frame plus observed candidate rejection/search—not merely a warm-cache counter or a large configured pool.

## Persistent dirty or flush failure

**Inspect:** whether a concurrent re-dirty created a newer generation; which completion cleared `FLUSHING`; page LSA and lower-bound restoration; WAL force; TDE/DWB/write errors; waiter wakeup; and retry ownership.

**Route:** [Flush One Generation](../learning/04-flush-one-generation.md), [Verify at the Risk Boundary](./verify-a-change.md), and `VS-12`/`VS-13` in the [registry](../unresolved-or-version-sensitive-findings.md).

**Boundary warning:** distinguish log durability, copied-generation completion, and home-page/fsync persistence. A page-buffer completion event may mean DWB acceptance or direct-write return; it does not universally prove later home-volume persistence.

**Next evidence:** inject the named TDE, DWB, or write failure and record both generation ledgers before/after wakeup and retry.

## Ordered-access stale pointer

**Inspect:** watcher ownership, ordered rank/group, release-sort-refix transitions, partial refix cleanup, and `page_was_unfixed`. When that marker is set, page-local observations made before release may be stale and must be reconstructed after refix.

**Route:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md) and ordered regions in the [source map](../reference/source-map.md).

**Next evidence:** trace every watcher through release, order, refix, transfer, and failure; assert that callers reread page-local offsets/records when required.

## Misleading metric or SHOW value

**Inspect:** the exact increment site, read/snapshot site, reset behavior, field-name mapping, configuration, interval, and observer effects. Treat SHOW/waiter/stat values as an approximate snapshot unless their interface proves a stronger guard.

**Route:** [Specialized Interfaces and Approximate Observability](../advanced/specialized-interfaces.md), diagnostics in the [source map](../reference/source-map.md), and `VS-04`/`VS-05` in the [registry](../unresolved-or-version-sensitive-findings.md).

**Next evidence:** correlate one counter with its increment branch and one independently observed operation. Never use an approximate statistic as mutation, deallocation, or victim authorization.

## Status and verification rule

The uncertainty registry is the sole status owner for every `VS-*` item. IDs here are routes, not copied conclusions. Use [Verify at the Risk Boundary](./verify-a-change.md) to select concurrency, fault, pressure, or crash evidence and record the untested boundary.

## Related routes

- [Practice wait-owner diagnosis](../questions/maintenance-scenarios.md#pgbuf-qb-062-is-the-symptom-fix-debt-a-latch-wait-or-a-transaction-lock)
- [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- [Source and Caller Map](../reference/source-map.md)
- [Verify at the Risk Boundary](./verify-a-change.md)
- [Evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md)
