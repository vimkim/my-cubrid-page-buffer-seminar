# Specialized Interfaces and Approximate Observability

**Level:** Advanced
**Prerequisites:** [Contract and Objects](../learning/01-contract-and-objects.md) and [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
**Capability gained:** Route narrow owner protocols and approximate diagnostics without treating them as general caller conveniences or correctness authority.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract, Verified mechanism, and Implementation policy from the [complete pinned API inventory](../../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md), [uncertainty registry](../unresolved-or-version-sensitive-findings.md), and exact ranges below.

This page groups hazardous/narrow interfaces by owner. It is not an API catalog; use the [complete API inventory](../../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md) for signatures and exhaustive coverage.

## Simple fix: a temporary-file owner protocol

Simple fix is restricted to read-only access in its temporary-file protocol. It has no page-content latch and no holder record. On a resident hit it increments `fcnt`; simple unfix decrements that count. The owner must guarantee no conflicting writer and balance the specialized pair.

It is not a faster interchangeable `pgbuf_fix()`. It lacks the normal page-content latch, holder diagnostics, and last-unfix processing. Source: declaration warning at `src/storage/page_buffer.h:270-273`; implementation at `src/storage/page_buffer.c:2688-2811`; representative owner `src/query/query_manager.c:2733`.

## Scan-copy: caller-owned snapshot, not residency

The heap scan-copy handle caches a caller-owned snapshot of page bytes for repeated scan use. It may fix a live page long enough to copy it, but the returned scan-copy pointer is not a resident fixed page and cannot be passed to `pgbuf_unfix()` or page mutation interfaces. Its lifetime and invalidation belong to heap scan state.

Source: opaque scan-copy state at `src/storage/page_buffer.c:910-981`; heap ownership paths at `src/storage/heap_file.c:6439-6465,6787-6829,7556-7645,7923-7984`.

## Area-copy helpers: existing owner only

`VS-02` routes the `pgbuf_copy_to_area()` documentation/executable drift. In the normal build, a miss with `do_fetch=false` can return the caller area without filling it because the direct-I/O branch is dormant; the executable fetch path uses the opposite condition from prose. Source: `src/storage/page_buffer.c:4701-4817`.

`VS-03` routes `pgbuf_copy_from_area()` behavior. Outside the dormant branch, `do_fetch` is effectively ignored and the helper follows a `NEW_PAGE`/`PAGE_AREA`/skip-logging/dirty-and-free protocol. It is not a WAL-aware general page writer. Source: `src/storage/page_buffer.c:4819-4912`.

Both helpers remain restricted to their existing owner protocols. The [uncertainty registry](../unresolved-or-version-sensitive-findings.md) owns current status and exact warnings.

## Group specialized hooks by responsible owner

| Responsible owner | Interface families | Review question |
|---|---|---|
| **Recovery owner** | page-buffer recovery callbacks, recovery fetch modes, page LSA/TDE/type restoration | Does redo/undo own the allocation knowledge and idempotence gate? |
| **Invalidation/deallocation owner** | invalidate one/all, deallocation callbacks, avoid-deallocation bookkeeping, raw-I/O coherence | Is residency removal distinct from logical allocation state? |
| **Daemon owner** | maintenance, flush, post-flush, flush-control init/destroy/stats | Is lifecycle gating intact, and is timing treated as policy? |
| **Diagnostic owner** | SHOW, statistics, dumps, waiter queries, validation helpers, debug checks | Is the value diagnostic only, with its exact synchronization/increment semantics? |

For recovery/lifecycle details use [Recovery, Allocation State, and Module Lifecycle](./recovery-and-lifecycle.md). For daemon progress use [Replacement Policy and Background Progress](./replacement-progress.md).

## Approximate observability is not authorization

SHOW, statistics, validation, and lock-free snapshot helpers have path-specific meanings. A counter must be tied to its increment site; dirty counts may count calls rather than unique pages, and I/O-read accounting may precede DWB-versus-volume resolution. Some waiter, prevent-deallocation, SHOW, and statistics reads are an approximate snapshot without the BCB mutex.

Use these signals to form a diagnostic hypothesis or schedule work. Do not use an approximate value as authorization to mutate, deallocate, invalidate, or victim-select a page. `VS-04` and `VS-05` in the [uncertainty registry](../unresolved-or-version-sensitive-findings.md) route field drift and approximate snapshot semantics. Pinned anchors: `src/storage/page_buffer.c:14748-14847,17323-17530`.

## Dead or incomplete means unavailable

`VS-01` identifies `pgbuf_fix_without_validation_release` as a dead/incomplete release interface: declared/macro-mapped, but with no located definition or caller in the pinned repository analysis. It is never an optimization choice. Do not call or teach it as an alternative until the target revision supplies and tests a complete owner protocol.

Source: `src/storage/page_buffer.h:320-326`; status and evidence remain in the [uncertainty registry](../unresolved-or-version-sensitive-findings.md).

## Related routes

- Practice: [simple-fix ownership](../questions/advanced.md#pgbuf-qb-049-why-is-simple-fix-not-a-faster-ordinary-fix)
- Core prerequisite: [Contract and Objects](../learning/01-contract-and-objects.md)
- Core prerequisite: [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- Investigate a symptom: [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- Locate symbols and callers: [Source and Caller Map](../reference/source-map.md)
- Complete inventory: [Pinned API inventory](../../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md)
