# Source and Caller Map

**Level:** Reference
**Prerequisites:** [Target-reader baseline](../page-buffer-teaching-material.md); individual routes name any additional prerequisite
**Capability gained:** Locate the owning source region, representative caller, canonical explanation, and evidence owner for a maintenance question.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism from pinned source and the [source inventory](../source-inventory.md).

This is a routing map. Follow a link for the bounded trace; do not infer a mechanism from a broad range alone.

## Broad source regions

| Region at the pinned revision | Look here for | Canonical route |
|---|---|---|
| `src/storage/page_buffer.h:52-170` | release helpers and public supporting declarations | [Fix, Hold, and Release](../learning/02-fix-hold-release.md) |
| `src/storage/page_buffer.h:172-258` | fetch/latch/promotion enums and ordered watcher types | [Contract and Objects](../learning/01-contract-and-objects.md) |
| `src/storage/page_buffer.h:262-465` | exported interface families | [Specialized Interfaces](../advanced/specialized-interfaces.md) |
| `src/storage/page_buffer.c:1641-1945` | pool initialization/finalization | [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md) |
| `src/storage/page_buffer.c:2125-3354` | public fix/unfix/invalidate entry region | [Fix, Hold, and Release](../learning/02-fix-hold-release.md) |
| `src/storage/page_buffer.c:460-488,5911-6085` | BCB/holder ownership structures and holder allocation | [Contract and Objects](../learning/01-contract-and-objects.md) |
| `src/storage/page_buffer.c:5922-6275,6298-6634,7807-7835` | holder initialization, growth, lookup/removal, grant reuse, and lock-free READ unfix | [Holder Entry Structure, Lifetime, and Unfix Cost](../advanced/holder-entry-lifecycle.md) |
| `src/storage/page_buffer.c:295-300,1567-1602,5672-5699` | resident `VPID` hash formula and fixed hash-anchor initialization | [Fix, Hold, and Release](../learning/02-fix-hold-release.md#how-resident-hashing-narrows-the-lookup) |
| `src/storage/page_buffer.c:1641-1888,5559-5667` | fixed BCB/frame pool sizing, pairing, and supporting queues | [Contract and Objects](../learning/01-contract-and-objects.md#the-pool-is-fixed-at-startup-a-miss-reuses-a-slot) |
| `src/storage/page_buffer.c:7041-7590` | latch wait queue, timed sleep, timeout cleanup, zero-crossing wakeup | [Acquisition Concurrency](../advanced/acquisition-concurrency.md#latch-queue-classify-the-outcome) |
| `src/storage/page_buffer.c:7594-8634` | resident lookup, lock-free READ hit, miss/load convergence | [Acquisition Concurrency](../advanced/acquisition-concurrency.md) |
| `src/storage/page_buffer.c:8181-8403,9067-9265` | BCB allocation progress loop and victim search order | [Replacement Progress](../advanced/replacement-progress.md#no-free-bcb-the-allocation-progress-loop) |
| `src/storage/page_buffer.c:9293-9538` | ordinary victim eligibility and the at-most-1,000 BCB-node walk in one selected LRU3 | [Replace One Frame](../learning/05-replace-one-frame.md), then [scan-cap evidence](./victim-scan-cap-and-aout-evidence.md#1-what-the-1000-node-scan-actually-does) |
| `src/storage/page_buffer.c:5744-5903,6636-6994,9695-10353,13942-14624` | LRU domain counts, placement, zone movement, and quota assignment | [Replacement Progress](../advanced/replacement-progress.md#counts-quotas-and-zone-boundaries-at-the-pinned-revision) |
| `src/storage/page_buffer.c:635-666,5802-5903,6885-6994,10468-10721`; `src/base/system_parameter.c:3463-3474,9975-9987` | AOUT ghost structure, dormant admission branches, and the forced-zero disablement | [AOUT admission filter](../advanced/replacement-progress.md#aout-a-dormant-ghost-history-admission-filter), then [AOUT evidence](./victim-scan-cap-and-aout-evidence.md#3-what-aout-is) |
| `src/storage/page_buffer.c:15674-15728,16370-16506` | lock-free advertisement and consumption of private/shared LRU indices with victims | [Replacement Progress](../advanced/replacement-progress.md#how-a-caller-finds-another-private-list) |
| `src/storage/page_buffer.c:10723-10962` | one snapshot/WAL/write generation | [Flush One Generation](../learning/04-flush-one-generation.md) |
| `src/storage/page_buffer.c:12186-13531` | ordered comparison, fix input/output, reordering, callback, and ordered unfix | [Acquisition Concurrency](../advanced/acquisition-concurrency.md#ordered-fix-input-and-output-contract) |
| `src/storage/page_buffer.c:15420-15627` | direct-victim assignment and revocation | [Replacement Progress](../advanced/replacement-progress.md) |
| `src/storage/page_buffer.c:16972-17255` | maintenance, page-flush, post-flush, and flush-control daemons | [Flush-actor control loops](./dirty-page-flush-actors.md#four-independent-control-loops), then [Replacement Progress](../advanced/replacement-progress.md#daemons-ownership-is-source-visible-cadence-is-version-sensitive) |

## Representative callers

| Caller family | Representative pinned anchor | Why enter here | Bounded trace |
|---|---|---|---|
| Heap mutation | `src/storage/heap_file.c:23120-23324` | Full lock/acquire/mutate/log/dirty/release path | [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) |
| B-tree traversal/update | `src/storage/btree.c:28365-28393,28638-28696` | Promotion failure and caller restart policy | [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) |
| File allocation/materialization | `src/storage/file_manager.c:5420-5590` | Allocation before `NEW_PAGE`, initializer ownership | [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) |
| Log append/page LSA | `src/transaction/log_manager.c:2194-2226` | Recovery meaning crosses into page LSA update | [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) |
| WAL forcing | `src/transaction/log_page_buffer.c:4150-4189` | Log durability gate before copied page submission | [Flush One Generation](../learning/04-flush-one-generation.md) |
| Redo | `src/transaction/log_recovery_redo.hpp:587-668`; `src/base/scope_exit.hpp:28-80` | Recovery fix/gate, lexical scope cleanup, redo application, and page-LSA update | [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md#what-release-through-scope-cleanup-means) |
| Boot/client lifecycle | `src/transaction/boot_cl.c:1102-1449` | Outer restart/shutdown coordination; follow server/log initialization seams | [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md) |
| Page-buffer lifetime seam | `src/transaction/log_tran_table.c:460-610` | Calls `pgbuf_initialize()`/`pgbuf_finalize()` | [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md) |

## Interface-family routing

| If the symbol concerns… | Start at | Then use |
|---|---|---|
| `pgbuf_fix*`, latch mode, fetch mode, unfix | `page_buffer.h:172-203,262-355` | [Core acquisition](../learning/02-fix-hold-release.md) |
| ordered watcher or promotion | `page_buffer.h:205-258,282-352` | [Advanced acquisition](../advanced/acquisition-concurrency.md) |
| page LSA, dirty, flush, checkpoint | `page_buffer.h:357-415` | [Core generation](../learning/04-flush-one-generation.md), then [lifecycle](../advanced/recovery-and-lifecycle.md) |
| copy/scan/simple access or diagnostics | `page_buffer.h:376-465` | [Specialized interfaces](../advanced/specialized-interfaces.md) |
| invalidate/deallocate | `page_buffer.h:312-355` plus file/disk caller | [Recovery and lifecycle](../advanced/recovery-and-lifecycle.md) |
| victim selection/progress | internal `page_buffer.c` regions above | [Core eligibility and scan cap](../learning/05-replace-one-frame.md), then [policy and AOUT](../advanced/replacement-progress.md) |

## Symptom-to-source lookup

| Symptom | First state/source check | Route |
|---|---|---|
| Fix or holder count grows | holder list, `fcnt`, all success/failure exits around `6000-6085,6277-6883` | [Diagnosis](../playbooks/debug-by-symptom.md) and [ownership lesson](../learning/02-fix-hold-release.md) |
| Latch wait or apparent hang | atomic latch tuple, waiter state, buffer-lock/load owner | [Advanced acquisition](../advanced/acquisition-concurrency.md) |
| Persistent dirty/flush state | `DIRTY`, `FLUSHING`, both LSAs, `10723-10962` | [Flush generation](../learning/04-flush-one-generation.md) |
| No victim under pressure | hard predicates and bounded selected-LRU3 walk at `9293-9538` before quota/daemon policy; then the allocation loop exits at `8181-8403` | [Replacement lesson](../learning/05-replace-one-frame.md), then [allocation progress](../advanced/replacement-progress.md#no-free-bcb-the-allocation-progress-loop) |
| Wrong resident identity/corruption | hash/VPID publication and final identity rechecks | [Contract](../learning/01-contract-and-objects.md) |
| Misleading SHOW/counter result | exact counter increment/snapshot site | [Specialized interfaces](../advanced/specialized-interfaces.md) |

## Evidence ownership

Provenance, reconciliation, experiment receipts, and coverage remain owned by the [source inventory](../source-inventory.md). Candidate, historical, and version-sensitive status remain owned by the [uncertainty registry](../unresolved-or-version-sensitive-findings.md). This map must link to those owners, never copy mutable status.

## Related routes

- [Contract and Objects](../learning/01-contract-and-objects.md)
- [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- [Source inventory](../source-inventory.md)
- [Evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md)
