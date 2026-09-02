# Alternating Reader/Writer Wakeup Cost

**Level:** Reference
**Prerequisites:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md#latch-queue-classify-the-outcome)
**Capability gained:** Distinguish ordinary queue-build cost from reader-group wakeup cost and predict the exact queue shape after each zero-crossing.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism from the pinned CUBRID source; arithmetic below is explicitly marked as a derivation from that mechanism.

## Scope and assumptions

This note models **new non-holder threads** making effective-unconditional page-latch requests against one BCB that is already held WRITE. The original owner stays fixed until every modeled request has queued. No request times out or is interrupted, no FLUSH waiter is present, and no dedicated promoter is inserted at the head. Each ordinary request carries `request_fix_count=1`.

Those assumptions matter. Existing-holder re-entry, zero-wait conversion to conditional behavior, timeout removal, and the promotion head-insertion rule produce different queue histories. The ordinary wait queue is anchored by `PGBUF_BCB.next_wait_thrd`; each queued node is the waiting `THREAD_ENTRY` itself, whose `request_latch_mode`, `request_fix_count`, and `next_wait_thrd` fields describe the request. The BCB has a head pointer and no tail pointer. [Pinned BCB definition](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L499-L528), [pinned thread-entry fields](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.hpp#L228-L256).

## Two different scans

Do not attribute both costs to a READ request:

| Phase | Who performs it | What is scanned | Cost at queue length `W` |
|---|---|---|---:|
| Ordinary enqueue | Each incompatible requesting thread | From the BCB queue head to its current tail | `O(W)` |
| Reader-group wakeup | The owner whose unfix makes global `fcnt` zero | From the queue head through candidates to the end, unless a granted WRITE makes the scan stop | `O(S)`, where `S <= W` |

`pgbuf_block_bcb()` appends an ordinary request by starting at the head and following `next_wait_thrd` until the last node. A promoter is the exceptional `O(1)` head insertion; it is outside this scenario. [Pinned enqueue loop](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7041-L7099).

`pgbuf_wakeup_reader_writer()` is called after unfix changes the BCB to `NO_LATCH, fcnt=0`. The waker scans the linked list, updates the atomic latch tuple, removes granted nodes, and signals those threads. A resumed thread records its holder after `pgbuf_block_bcb()` returns; the waiter is not a holder merely because it was linked into the queue. [Pinned zero-crossing call](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6688), [pinned call and unlock path](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6853-L6880), [pinned post-wakeup holder recording](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6595-L6633).

## Why readers separated by writers are granted in one scan

Suppose the queue begins:

```text
BCB.next_wait_thrd
  -> R1 -> W1 -> R2 -> W2 -> R3 -> W3 -> null
```

At zero-crossing, the loop grants R1 and changes the tuple to READ. When it sees W1, WRITE is incompatible with the current READ latch. It leaves W1 linked, remembers it as the predecessor, and exits only the inner compare/exchange loop. The outer `for` loop continues to R2. R2 is compatible, so it is removed and granted; the same thing happens to R3. The resulting state is:

```text
atomic latch: READ, fcnt=3
granted:      R1, R2, R3       (signaled individually in this one wake call)
queue:        W1 -> W2 -> W3 -> null
```

Building this six-node queue performs `0+1+2+3+4+5=15` existing-node link tests and `0+0+1+2+3+4=10` pointer advances. The first wake visits all six nodes. The three later writer handoffs visit `2+2+1=5` nodes, so the main wake loop makes 11 node visits over the complete drain. There are four grant epochs: one three-reader group, then W1, W2, and W3 serially.

Thus “group grant” means that one serialized wakeup call makes one forward traversal and grants and signals the whole eligible reader set. It does **not** restart from the queue head for each reader, and it does not mean that all signaled threads execute simultaneously.

This cross-writer result follows the executable control flow. The nearby comment says readers at the head can be woken together, but the implementation does not stop on a WRITE encountered after READ has already been granted: it records that WRITE as `prev_thrd_entry` and continues the outer scan. Only a WRITE that is itself granted changes the tuple to WRITE and sets the stop condition for the next candidate. [Pinned wakeup loop](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7452-L7590), especially the incompatible-WRITE branch at lines 7545-7550 and the WRITE-held stop at lines 7551-7564.

Only after **all** granted readers release their combined fix count back to zero does another wakeup run. The remaining writer-only queue is then handed off one writer per zero-crossing. With at least two writers remaining, the main wake loop visits the granted head writer and then the next writer, observes that the latch is now WRITE, and stops; with one writer remaining it visits just that node. Writer handoff is therefore constant work per zero-crossing in this no-timeout case, not another full-queue removal scan.

## Resolve “100 alternating” versus “100 of each”

The two phrasings imply different reader counts:

| Request population | READ-first result at the original owner's zero-crossing | WRITE-first result |
|---|---|---|
| 100 requests total, alternating: 50 READ + 50 WRITE | One 100-node main scan grants all 50 READ requests and leaves 50 WRITE requests. | The first scan grants W1 and stops; at W1's release, one 99-node main scan grants all 50 readers and leaves 49 writers. |
| 200 requests total: 100 READ + 100 WRITE | One 200-node main scan grants all 100 READ requests and leaves 100 WRITE requests. | The first scan grants W1 and stops; at W1's release, one 199-node main scan grants all 100 readers and leaves 99 writers. |

So “50 readers at once” is correct only for **100 total alternating requests**. If there are 100 READ plus 100 WRITE requests, the corresponding group contains 100 readers.

For a READ-first queue with `Q=2R`, the first main wake loop visits exactly `Q` nodes and grants `R` readers under these assumptions. Draining the remaining `R` writers later costs `2R-1` main-loop node visits in total: two visits for each handoff while another writer follows, then one for the last writer. This is linear cumulative wake-loop work. If the queue starts WRITE, the first main loop visits two nodes (grant W1, then stop at the next R), the next scan visits the remaining `Q-1` nodes to group the readers, and the remaining writers are again handed off one at a time.

| Population and first request | Main wake-loop visits through complete drain | Grant epochs |
|---|---:|---:|
| 6 total, READ first | `6 + 5 = 11` | 4 |
| 6 total, WRITE first | `2 + 5 + 3 = 10` | 4 |
| 100 total, READ first | `100 + 99 = 199` | 51 |
| 100 total, WRITE first | `2 + 99 + 97 = 198` | 51 |
| 200 total, READ first | `200 + 199 = 399` | 101 |
| 200 total, WRITE first | `2 + 199 + 197 = 398` | 101 |

These visit counts exclude compare/exchange retries, condition-variable signaling and scheduling cost, the ordinary enqueue phase, and the final call on an empty queue. They count iterations of the main linked-list wake loop only.

After its main loop, the waker calls `pgbuf_is_exist_blocked_reader_writer()` to decide whether `waiter_exists` can be cleared. In these alternating cases, a retained writer is at the head after reader grouping, so that helper returns after inspecting the first remaining node; it does not add another full scan. [Pinned blocked-reader/writer check](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L11024-L11048).

## Exact ordinary enqueue arithmetic

At an ordinary arrival with `W>0` existing waiters, the append loop tests the `next_wait_thrd` link of all `W` existing nodes and advances through `W-1` links. At `W=0`, it installs the head directly. Therefore `N` non-draining ordinary arrivals from an empty queue perform:

```text
existing-node link tests = 1 + 2 + ... + (N - 1)
                         = N(N - 1) / 2

next-pointer advances    = 0 + 1 + ... + (N - 2)
                         = (N - 1)(N - 2) / 2
```

| Queue built before the owner releases | All-arrival node-link tests | All-arrival pointer advances |
|---|---:|---:|
| 100 total requests | 4,950 | 4,851 |
| 200 total requests | 19,900 | 19,701 |

Every ordinary READ and WRITE arrival participates in this quadratic cumulative build cost. For equal alternating populations of `R` readers and `R` writers, the READ arrivals alone account for:

| Alternation begins with | Existing-node link tests by READ arrivals | Pointer advances by READ arrivals |
|---|---:|---:|
| READ | `R(R-1)` | `(R-1)^2` |
| WRITE | `R^2` | `R(R-1)` |

For `R=50`, that is 2,450 READ-arrival node tests if READ is first or 2,500 if WRITE is first. For `R=100`, it is 9,900 or 10,000. These values are the sum of ordinary tail-append walks while the original owner prevents drainage. They are **not** the cost of repeatedly granting a reader group. Concurrent releases, timeout removals, or promoter insertion change the queue length seen by later arrivals and invalidate these exact sums, while leaving the `O(W)` per-append structural bound intact.

## Mutex scope and contention implication

Both expensive operations are serialized by the BCB mutex:

- `pgbuf_latch_bcb_upon_fix()` reaches `pgbuf_block_bcb()` while holding `bufptr->mutex`; the ordinary tail walk and link mutation happen before `pgbuf_timed_sleep()` locks the thread entry and releases the BCB mutex. [Pinned latch/block path](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6277-L6312), [pinned sleep handoff](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7281-L7304).
- `pgbuf_wakeup_reader_writer()` requires its caller to hold the BCB mutex for the complete grant/removal scan. It locks each selected waiter's thread entry, commits that request's fix count to the BCB tuple, unlinks the node, signals its condition variable, and unlocks the thread entry. The enclosing unfix path releases the BCB mutex after wakeup returns. [Pinned wakeup mutex contract and grant](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7458-L7584), [pinned signal/unlock](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L11606-L11631).

The structural conclusion is bounded: a long non-draining queue causes quadratic cumulative append traversal, and a READ-first group wake may hold the BCB mutex for a full linear scan plus per-reader signaling. Whether this is a material runtime bottleneck requires queue-depth and profile evidence; Big-O and source structure alone do not establish observed latency.

## Maintainer summary

1. An arriving READ does not run the reader-group algorithm. It performs the same ordinary tail append as an arriving WRITE, costing `O(W)` because the BCB has no tail pointer.
2. The later zero-crossing waker performs one `O(W)` scan. If READ is granted first, the pinned loop grants every READ it encounters, even across retained WRITE nodes.
3. If WRITE is granted first, the scan stops; after that writer releases, the following READ-first queue is group-granted.
4. The readers become runnable through individual signals and later create their own holder entries. “One group” is a grant batch, not simultaneous execution.
5. Under the fixed no-drain assumptions, queue construction is cumulatively `O(N^2)`, while reader grouping and subsequent writer handoffs are cumulatively `O(N)` main-loop work.
