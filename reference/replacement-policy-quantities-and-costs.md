# Replacement policy: quantities, costs, and evidence boundaries

**Level:** Evidence reference
**Prerequisites:** [Replacement Policy and Background Progress](../advanced/replacement-progress.md)
**Capability gained:** Audit replacement quantities, structural complexity, and repeated-read behavior against pinned primary source.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Implementation policy, and Inference from pinned CUBRID primary source; no runtime performance observation.

This note answers the quantitative questions in `my-questions-7.md` against
CUBRID commit `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. It is an evidence note,
not a benchmark report. `B` below means `pgbuf_Pool.num_buffers`, `T` the number
of managed thread entries inspected for activity, `S` the number of shared LRU
lists, `P` the number of private LRU lists, and `L = S + P`.

## Short answers

- An LRU is one mutex-protected doubly linked list of BCBs, split in place into
  zones 1, 2, and 3. `top` is hot, `bottom` is cold, and only zone 3 is a
  replacement zone. Boundary pointers `bottom_1` and `bottom_2` avoid searching
  for zone boundaries. The BCB itself supplies `prev_BCB` and `next_BCB`.
  [BCB and list fields](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L510-L623)
- At server start all `B` BCBs form one singly linked invalid/free list; all LRU
  lists are empty with zero thresholds and quotas. The first cold read pops one
  BCB from the invalid-list head in `O(1)`, leaves it temporarily in `VOID`, and
  inserts it into an LRU only on the final unfix.
  [BCB initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5554-L5667),
  [empty LRU initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5740-L5799),
  [invalid-list initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5906-L5919),
  [invalid-list pop](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8904-L8952)
- Normal cross-private victim discovery does **not** walk 2,000 sessions or all
  `P` private lists. Lists advertise themselves once in a lock-free circular
  queue by storing an integer LRU index. A victimizer consumes one advertised
  index and scans that list from its victim hint. One list scan is capped at
  1,000 BCBs.
  [advertising a list](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16369-L16414),
  [cross-private consume](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16416-L16506),
  [bounded BCB scan](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9314-L9538)
- Reading/fixing a resident page twice does not simply move it to the top twice.
  The general fix path increments a BCB-lifetime counter, saturating at 64, but
  the overlapping-reader lock-free fast path bypasses that registration. A
  final unfix in zone 1 deliberately does not move the BCB; zone 2 boosts only
  after an age test; zone 3 always boosts. Thus a quick second access in zone 2
  is explicitly prevented from buying a top position. The count of 64 is used
  only in the private-to-shared migration rule, not as a direct victim score.
  [fix registration](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2408-L2448),
  [overlapping-reader fast path](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7724-L7787),
  [64-fix saturation and hot test](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16335-L16367),
  [unfix-zone decisions](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6713-L6844)

## Exact topology and initial state

One list has this physical shape:

```text
top
 │
 ▼
[ zone 1: hottest, not victimizable ] -- bottom_1
[ zone 2: probation/buffer, not victimizable ] -- bottom_2
[ zone 3: replacement zone ]
 │
 ▼
bottom / oldest end, victim_hint usually starts here or later
```

This is one linked chain, not three arrays and not three separate lists. Zone
membership and the 16-bit LRU index are encoded in `bcb->flags`. The source
allows at most 65,536 encoded LRU indexes. Zone 1 avoids top-of-list movement on
ordinary hits; zone 2 gives an aged page a chance to return to the top; zone 3
is where safety-qualified victims are searched.
[zone encoding and design comment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L174-L216)

Startup performs these material steps:

1. Allocate `B` BCBs and `B` page frames. Each BCB starts with null VPID,
   invalid latch, zero fix/history fields, and `next_BCB` pointing to the next
   BCB.
2. Allocate `L` empty LRU descriptors. Every pointer, count, threshold, quota,
   tick, and flag starts as zero/NULL except `index = i`.
3. Make BCB 0 the invalid-list head and set `invalid_cnt = B`.
4. Allocate victim-list queues with requested capacities `2P`, `2P`, and `2S`
   for ordinary private, "big" private, and shared lists. The circular-queue
   constructor rounds each requested capacity to a power of two.

[initialization order](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1729-L1792),
[queue allocation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1864-L1892),
[queue capacity rounding](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/lockfree_circular_queue.hpp#L210-L217)

The LRU metadata space is `O(L)` and the intrusive links/ticks/counters add
`O(B)` fields already inside the BCB array. The three list-index queues add
`O(P + S)` slots. Page frames themselves remain the dominant `O(B * page_size)`
allocation.

## How many lists exist

### Shared LRU count

`num_LRU_chains` defaults to zero, meaning "derive it". At the pinned revision:

```text
T = MAX_NTRANS = css_get_max_conn() + 1
S = max(4, min(T, floor(B / 1000)))       when num_LRU_chains == 0
S = configured num_LRU_chains             otherwise
```

The hidden parameter accepts up to 1,000. `css_get_max_conn()` includes normal
clients plus reserved connections, so `T` is not merely the count of active user
transactions.
[shared-list derivation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5740-L5766),
[`MAX_NTRANS`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_common_impl.h#L48-L52),
[`css_get_max_conn`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L222-L241),
[`num_LRU_chains` bounds](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1794-L1805)

Derived examples, assuming the automatic setting:

| `B` | `T` | `S` |
|---:|---:|---:|
| 100,000 | 2,001 | 100 |
| 2,000,000 | 2,001 | 2,000 |
| 10,000 | 2,001 | 10 |

### Private LRU count and assignment

In server mode, `num_private_chains = -1` means:

```text
P = MAX_NTRANS + VACUUM_MAX_WORKER_COUNT = T + 50
```

Zero disables private lists/page quota. A positive configured value is floored
to 4. Standalone mode forces `P = 0`.
[private-list derivation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13941-L13985),
[`VACUUM_MAX_WORKER_COUNT`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.h#L122-L133),
[`num_private_chains` bounds/default](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L4171-L4182)

A private list is a locality/quota domain assigned to a session, not an
exclusive transaction-owned list. Session creation calls
`pgbuf_assign_private_lru`; the chosen index is stored on the session and copied
to worker thread entries. Vacuum workers also get assigned indexes. Assignment
scans all `P` private list descriptors, preferring an unused list with the
fewest BCBs and otherwise the least-active list. Therefore one assignment is
`O(P)`, and multiple sessions can share a private list after all lists are in
use.
[assignment algorithm](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14514-L14602),
[session create/release](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L729-L744),
[session-to-thread copy](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L2793-L2803),
[vacuum assignment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L1258-L1273)

For the question's 2,000-session example, automatic configuration gives about
2,050 private list descriptors (`T + 50`), not necessarily 2,000 populated,
exclusive lists. Session creation does inspect those descriptors once, but an
ordinary cross-private victim request does not.

## What a quota is—and is not

A private `quota` is an adaptive target that controls zone thresholds and
where a victimizer may take pages. It is not a hard allocation ceiling: the
list can exceed it. Every adjustment computes:

```text
private_ratio = private_hits / (private_hits + max(1, shared_hits))
private_ratio clamped to [0.01, 0.998]
private_pages_ratio = 10-second interpolation toward private_ratio

all_private_quota = (B - invalid_cnt) * private_pages_ratio
quota[i] = activity[i] / sum_private_activity * all_private_quota
quota[i] = min(quota[i], 5000, B/2)

private zone-1 threshold = 0.05 * quota[i]
private zone-2 threshold = 0.05 * quota[i]
```

When all private activity is zero, every private quota and both thresholds are
set to zero. The initial `private_pages_ratio` is 1.0 when private lists are
enabled, but every per-list quota begins at zero; it becomes meaningful only
after adjustment.
[quota initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13988-L14045),
[ratio and activity computation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14252-L14399),
[quota split and caps](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14400-L14474)

Shared lists have no per-list `quota`. Their zone target uses the pool space
left after the nominal private allocation:

```text
average shared target = max((B - all_private_quota) / S, 50)
shared zone 1 = target * lru_hot_ratio       default 40%
shared zone 2 = target * lru_buffer_ratio    default 5%
```

The remaining target space is zone 3 (about 55% with defaults). By contrast,
private lists use 5% zone 1 + 5% zone 2, leaving approximately 90% in zone 3
once the list reaches its target. The ratios are thresholds, not promises that
the list instantaneously has exactly those percentages.
[shared thresholds](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14477-L14503),
[ratio defaults](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3754-L3777)

The exact `adjust_age` producer and its early-return gates are owned by the
[focused evidence audit](private-lru-domain-hit-age-and-unfix-placement.md#2-who-advances-adjustage).
The quantitative consequence is that one accepted pass scans `T` managed thread
entries while summing activity, all `L` descriptors, and may relabel overflow
BCBs from zones 1/2 into zone 3. Its work is `O(T + L + M)`, where `M` is the
number of BCB zone transitions made during that pass (bounded by `B` pool-wide).
[adjustment gate and full-list pass](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14288-L14374),
[zone adjustment loops](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9881-L10048),
[100-ms daemon](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17146-L17161)

## Beginning versus sustained pressure

With AOUT disabled at this revision, a newly loaded page whose final unfix is
performed by a thread with a private LRU is inserted at that private list's
top, in zone 1. A thread without a private LRU inserts it at the middle of a
round-robin shared list, in zone 2. The add operation immediately adjusts zone
boundaries; overflow pages fall toward zone 3.
[first-unfix placement](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6994),
[top/middle insertion and adjustment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10199-L10265)

Under sustained pressure, the structural picture is:

```text
invalid list: approaches empty

private i:  [~5% quota hot][~5% quota buffer][overflow/cold zone 3]
shared j:   [~40% target hot][~5% target buffer][cold zone 3]
                                                     ^ clean, unfixed,
                                                       waiter-free pages
                                                       are candidates

candidate-bearing list indexes -> private/shared circular queues
victimizer -> pop one list index -> scan at most 1000 zone-3 BCBs
```

Dirty, flushing, direct-victim-marked, fixed, or waiter-bearing BCBs may remain
in zone 3 but fail the final safety predicate. Heavy load therefore does not
mean every zone-3 BCB is immediately reusable. Zone adjustment advertises a
candidate-bearing shared list, or an over-quota private list, in the index
queue. A flag prevents concurrent duplicate advertisement.
[candidate rules](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L253-L265),
[fixed/waiter safety test](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9255-L9312),
[candidate advertisement](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15670-L15719)

## Operation costs

These are structural source-code bounds, excluding time waiting for a mutex,
CAS retry, I/O, and thread sleep/wakeup.

| Operation | Structural time | Extra space | Important bound |
|---|---:|---:|---|
| Pop/push invalid BCB | `O(1)` | `O(1)` | One head pointer under one mutex. |
| Add top/middle/bottom | `O(1) + O(M)` | `O(1)` | Link edit is constant; `M` overflow BCBs may be relabelled during zone adjustment. |
| Remove known BCB | `O(1)` | `O(1)` | Intrusive doubly linked links and boundary pointers. |
| Zone-1/2 adjustment | `O(M)` | `O(1)` | One pointer hop per BCB relabelled. |
| Zone-1 hit | `O(1)` | `O(1)` | Deliberately no list mutex/move in ordinary path. |
| Zone-2 hit | `O(1)` if too young; otherwise `O(1)+O(M)` | `O(1)` | Boost is remove + add top + boundary adjustment. |
| Zone-3 hit | `O(1)+O(M)` | `O(1)` | Always boosts on final ordinary unfix. |
| Assign private LRU to session | `O(P)` | `O(1)` | Scans private descriptors, not BCB chains. |
| Recompute quotas | `O(T+L+M)` | `O(1)` per pass | `T` thread shards; `M <= B` zone transitions; arrays are persistent `O(L)`. |
| Advertise/consume list index | no `P`/`S` traversal | `O(1)` per queued index | Lock-free CAS loops are retry-dependent under contention, so strict wall-clock `O(1)` is not promised. |
| Search selected LRU for victim | `O(min(Z3,1000))` | `O(1)` | Holds that LRU mutex and tries each BCB mutex conditionally. |
| Ordinary cross-private selection | queue retry + one selected-list search | `O(1)` | No all-private-list scan. |
| Shared search with flush daemon | one queue consume + one selected-list search | `O(1)` | Without a flush daemon it may loop up to `S` lists. |

The constant-time link operations are visible in the add/remove primitives.
The queue's `produce`/`consume` algorithms use CAS retry loops, which explains
the contention qualification in the table.
[list primitives](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9694-L9879),
[remove primitive](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10355-L10417),
[queue implementation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/lockfree_circular_queue.hpp#L228-L370),
[shared-loop bound](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9186-L9219)

## Does victimization scan 2,000 private lists?

Not in the ordinary `pgbuf_get_victim` path. It tries:

1. the caller's own known private index, if policy permits;
2. one index consumed from the private candidate-list queue;
3. one index consumed from the shared candidate-list queue;
4. as a final fallback, the caller's own known private list even if under
   quota.

[victim-search order](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9066-L9253)

The candidate queue is precisely the indirection that avoids `O(P)` discovery.
The list flag suppresses duplicate enqueue, and the consumer re-enqueues the
list if it still has candidates. Stale queue entries are possible because a
zero candidate count is not removed from the lock-free queue; consuming such an
entry yields a cheap failed list check rather than an all-list scan.
[candidate decrement limitation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15721-L15736),
[private-list requeue](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16473-L16503)

There **are** all-list passes elsewhere:

- `pgbuf_assign_private_lru` is `O(P)` on session/vacuum-worker assignment.
- `pgbuf_adjust_quotas` is `O(T+L+M)` and is attempted by a 100-ms maintenance
  daemon.
- victim-flush target calculation and collection walk LRU descriptors/candidate
  regions as background progress work.

Those should not be conflated with every allocation request scanning 2,000
transactions.

## Plausible bottlenecks: what the source proves and what it does not

The pinned source supports these **static risk candidates**:

1. A selected-list victim scan holds the LRU mutex for as many as 1,000 BCB
   pointer steps and conditionally tries BCB mutexes. Long dirty/fixed runs or a
   poor `victim_hint` can therefore lengthen mutex hold time. The source itself
   records a TODO that the hint has sometimes appeared before the first actual
   victim candidate.
   [hint caveat](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L584-L600),
   [scan body](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9391-L9506)
2. Private-list assignment is `O(P)` per session creation, and an accepted quota
   adjustment is an `O(T+L)` base pass. With thousands of configured lists, these are more
   plausible list-count scaling costs than ordinary cross-private victim
   discovery.
3. The uncertainty registry records `VS-19`: the separate
   `big_private_lrus_with_victims` queue is allocated and consumed, but
   repository-wide pinned-source search finds no initial producer; its only
   `produce` call re-enqueues an index that was already consumed from that same
   queue. This makes the `restricted=true` escape path statically appear unable
   to discover a first big list. Treat this as an implementation candidate, not
   a demonstrated runtime defect.
   [allocation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1864-L1883),
   [only consume/re-produce site](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16434-L16471)
   and [mutable status](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)
4. The lock-free queue source documents a preemption hazard: a producer
   preempted while holding a slot can temporarily block that queue generation.
   This is not a linear list scan, but it is a latency risk under stress.
   [queue caveat](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/lockfree_circular_queue.hpp#L236-L267)

No runtime profile or controlled workload was run for this note. Therefore the
source does **not** establish that any candidate above is a material bottleneck
for a real 2,000-session workload. A defensible performance claim would require
at least victim-search time/call counters, LRU mutex wait/hold measurements,
queue empty/stale-hit rates, quota-adjust duration, list sizes, dirty/fixed
composition, and workload/configuration capture.

## What exactly happens when a page is read twice

There are three independent signals; none is simply “read count = eviction
priority.”

### 1. Current fix protection

While either read remains fixed, the BCB's atomic fix count prevents
victimization. If the two fixes overlap, only the transition to global fix count
zero performs the LRU action. This is correctness protection, not historical
popularity.
[final-unfix gate](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6680-L6726)

### 2. Saturating 64-fix “hot” history

The general fix path calls `pgbuf_bcb_register_fix` before page-identity
validation and latch acquisition. It increments the high 16 bits of
`count_fix_and_avoid_dealloc` until 64 and then stops. The overlapping READ fast
path increments the live latch fix count but bypasses `pgbuf_bcb_register_fix`.
Consequently this field is a saturating hotness heuristic, not an exact count of
successful reads: two separate fix/unfix cycles normally add two, while a
nested/overlapping second reader may add none, and a later failed general-path
acquisition may already have registered. The counter belongs to the current BCB
residency and is reset when the BCB is returned to the invalid list for reuse.
Reaching 64 matters only to the rule that moves an old page from its private
list to shared; access by a different private domain can move it to shared
without waiting for 64.
[general-path registration position](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2408-L2489),
[overlapping-reader fast path](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7724-L7787),
[counter registration/reset](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16313-L16367),
[private-to-shared conditions](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6996-L7038)

### 3. Recency/age movement and quota activity

At final ordinary unfix:

| Current zone | Second-read consequence |
|---|---|
| Zone 1 | No movement. The page is already protected from ordinary victimization; this avoids an LRU mutex hot path. |
| Zone 2 | Boost to top only if `list.tick_list - bcb.tick_lru_list >= count_lru2 / 2` (with wrap handling). A quick second read normally fails this test. |
| Zone 3 | Always boost to top, subject first to possible private-to-shared migration. |

`tick_list` advances when pages enter at top/middle or are boosted. The age is
therefore measured in intervening LRU structural activity, not wall-clock time.
The source comment explicitly says many operations read then write a page and
that a quick second unfix must not automatically promote a still-cold page.
[age formula](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1052-L1058),
[boost rationale](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10123-L10197)

Separately, `hit_age` de-duplicates a BCB's contribution to LRU activity. The
exact epoch semantics and destination-list attribution are cataloged in [Private
LRU domain, hit-age epochs, and unfix
placement](private-lru-domain-hit-age-and-unfix-placement.md#hitage-and-lruhits).
[one-hit-per-epoch registration](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16594-L16610),
[`adjust_age` advance and hit reset](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14328-L14361)

## AOUT status

The code still contains a 2Q-style AOUT FIFO/hash history. If enabled, its
capacity would be `min(B * data_aout_ratio, 32768)`; a VPID found on re-read can
change top/middle/private/shared placement. At the pinned revision,
`prm_tune_parameters` forcibly sets the ratio to zero “until we fix
CBRD-20741,” so initialization returns with `max_count = 0`. AOUT must not be
credited for the observed replacement policy of this build.
[AOUT initialization and cap](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5802-L5882),
[forced disable](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L9975-L9987)

## Evidence boundary

All behavioral statements above are verified mechanisms or explicit derived
arithmetic from the pinned source. Complexity excludes contention retry and I/O
unless stated. “Heavy load” diagrams describe reachable structure and policy,
not measured occupancy. The bottleneck section labels static candidates rather
than runtime findings.
