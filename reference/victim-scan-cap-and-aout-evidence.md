# Victim scan cap and AOUT status

**Level:** Evidence reference
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Question source:** `my-questions-10.md`
**Evidence used:** Verified mechanism, Historical evidence, and Inference; version-sensitive status is routed explicitly below.

This note resolves two numbers and one disabled mechanism that are easy to
conflate while reading the replacement lesson. It is a source audit, not a
runtime benchmark.

## Short answers

- “The per-list scanner stops at 1,000 links” means that one call to
  `pgbuf_get_victim_from_lru_list()` examines at most 1,000 BCB nodes in zone 3
  of **one already selected LRU list**. It follows the intrusive
  `bcb->prev_BCB` linked-list pointer from `victim_hint` or `bottom`. It does not
  inspect 1,000 LRU lists.
- The number of private LRUs is not capped at 1,000. At this baseline an
  explicitly configured positive `num_private_chains` may be as high as
  `CSS_MAX_CLIENT_COUNT + VACUUM_MAX_WORKER_COUNT = 4,050`. The default `-1`
  is expanded at runtime to `MAX_NTRANS + 50`; that formula includes reserved
  connections through `css_get_max_conn()` and is not clamped to 1,000 in the
  initialization routine.
- AOUT is a bounded, global ghost-history queue: it retains a victimized
  page's `VPID` and former LRU index, but not the page frame or contents. The
  source retains the implementation but forcibly sets `data_aout_ratio` to
  zero because of CBRD-20741. Therefore AOUT is structurally present and
  operationally disabled at the pinned baseline.

## 1. What the 1,000-node scan actually does

### Verified mechanism

`pgbuf_get_victim_from_lru_list(thread_p, lru_idx)` receives exactly one LRU
index. It first returns in constant work when the list advertises zero victim
candidates, then locks that list's mutex. For an over-quota private list it may
first move zone-1/zone-2 nodes into zone 3. It then chooses `victim_hint`, or
the list's `bottom` when there is no hint, and executes this bounded walk:

```text
one selected LRU list

hotter direction                                      cold end
      ... <- prev_BCB <- [zone-3 BCB] <- [zone-3 BCB] <- bottom
                              ^
                    victim_hint, if non-NULL

for each visited node:
  1. stop if NULL, outside zone 3, or search_cnt == 1000
  2. skip FLUSHING/dirty/direct-victim-ineligible nodes
  3. skip currently fixed nodes, while advancing the hint when useful
  4. try-lock the BCB mutex; never block on it while holding the LRU mutex
  5. recheck victimizability; unlink and return on success
```

The bound is the function-local `#define MAX_DEPTH 1000`. The loop condition
is `search_cnt < MAX_DEPTH`, and its increment expression follows
`bufptr = bufptr->prev_BCB`. A successful candidate is removed and returned
immediately. The walk can stop before 1,000 visits because it reaches the end
of the chain or leaves zone 3, finds a victim, or accounts for as many
temporarily unavailable candidates as the captured `count_vict_cand` value.
[bounded scan and exact exits](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9314-L9538)

“1,000 links” is therefore better stated as **at most 1,000 zone-3 BCB node
visits, and at most 1,000 `prev_BCB` advances, in one selected-list call**. A
visited BCB is not necessarily an eligible victim. For example, if the first
700 nodes are dirty and the 701st passes the final check, the loop performs
701 visits and returns that BCB. If all 1,000 visited nodes fail, this call
returns `NULL` and wakes the page-flush daemon; it does not continue to node
1,001 in the same call.

### Exact structural cost

Let:

- `Z` be the number of zone-3 nodes reachable from the chosen starting point;
- `k = min(Z, 1000)` when no earlier exit occurs;
- `M` be the number of zone-1/zone-2 nodes demoted by the optional pre-scan
  zone adjustment.

The linked-list scan is `Theta(k)` node checks, or
`O(min(Z, MAX_DEPTH))`. Because `MAX_DEPTH` is a compile-time constant this is
strictly `O(1)` in asymptotic notation, but “bounded linear scan of up to 1,000
nodes” communicates the real cost better. It is not an array scan. Each visit
does constant-field checks and at most one nonblocking BCB-mutex try-lock.
Wall-clock time also includes waiting to acquire the selected LRU mutex.

The entire helper call is more precisely `O(M + min(Z, 1000))`, because
`pgbuf_lru_adjust_zones()` can precede the bounded loop and demotes as many
nodes as required to restore the zone threshold. That demotion loop is not
covered by `MAX_DEPTH`.
[pre-scan adjustment call](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9351-L9367),
[zone-adjustment loop](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9984-L10048)

The phrase is also **per-list-call**, not a bound for the entire miss. The
ordinary cross-private path consumes an advertised integer LRU index from a
lock-free circular queue and calls this helper for that one list. It does not
linearly visit every private LRU to find one with candidates.
[list advertisement](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16369-L16414),
[one advertised private-list consume and scan](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16416-L16506)

### Three unrelated uses of 1,000

| `1,000` in source | Meaning | Does it cap private LRU count? |
|---|---|---|
| `MAX_DEPTH` in `pgbuf_get_victim_from_lru_list()` | Maximum BCB visits in one zone-3 scan | No |
| `PGBUF_MIN_PAGES_IN_SHARED_LIST` | Target minimum pages per automatically derived **shared** LRU | No |
| upper bound of hidden `num_LRU_chains` | Maximum explicitly configured **shared** LRU count | No |

The shared-list derivation constant and private-list constants are separate.
[private/shared constants](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1069-L1079),
[automatic shared-list derivation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5740-L5766),
[`num_LRU_chains` parameter bound](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1794-L1805)

## 2. Private LRU count: the exact limits

### Verified mechanism

In server mode, `pgbuf_initialize_page_quota_parameters()` interprets
`num_private_chains` as follows:

```text
-1       P = MAX_NTRANS + VACUUM_MAX_WORKER_COUNT
 0       private LRUs disabled
 1..3    P = 4, because the implementation floors positive values to 4
 >=4     P = configured value, after system-parameter validation
```

[private-list initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13941-L13985)

The parameter table sets the default to `-1` and the positive upper bound to
`CSS_MAX_CLIENT_COUNT + VACUUM_MAX_WORKER_COUNT`. At this commit those
compile-time constants are 4,000 and 50, so the explicit positive maximum is
4,050.
[`num_private_chains` definition](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L4171-L4182),
[`CSS_MAX_CLIENT_COUNT`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.h#L31-L40),
[`VACUUM_MAX_WORKER_COUNT`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.h#L128-L136)

The automatic formula is not exactly “number of user transactions.”
`MAX_NTRANS = css_get_max_conn() + 1`, and `css_get_max_conn()` sums normal,
admin-reserved, and HA-reserved connection categories. The initialization
routine does not clamp the result to 1,000 or 4,050 after expanding `-1`.
[`MAX_NTRANS` formula](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_common_impl.h#L48-L52),
[`css_get_max_conn()`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L222-L241)

Derived example: if `css_get_max_conn()` is 2,000, then `MAX_NTRANS` is 2,001
and the default private-list count is `2,001 + 50 = 2,051`. That alone disproves
a 1,000-list cap. LRU indices use 16 bits and therefore the representation has
a separate 65,536-index ceiling for total shared plus private lists; this is
not a user-facing private-list setting and should not be presented as the
normal configured maximum.
[16-bit LRU-index encoding](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L174-L216)

## 3. What AOUT is

### Verified structure

The source calls the replacement design “LRU + Aout of 2Q.” AOUT is one global
doubly linked FIFO of preallocated `PGBUF_AOUT_BUF` nodes. Each node contains:

- the evicted page identity, `VPID`;
- the LRU index from which it was evicted;
- `next` and `prev` links.

The global `PGBUF_AOUT_LIST` adds a mutex, top and bottom pointers, a free-node
list, the preallocated node array, hash tables for VPID lookup, and
`max_count`. There is no page frame, BCB, latch state, dirty data, or page
contents in an AOUT node. It is therefore a **ghost queue**, not another
buffer pool.
[AOUT design and structures](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L635-L666)

If enabled, capacity is:

```text
A = min(floor(buffer_count * data_aout_ratio), 32768)
```

Initialization preallocates all `A` nodes and constructs
`max(A / 1000, 1)` hash tables. On eviction, the code obtains a free node or
recycles the FIFO bottom, inserts the new `(VPID, lru_idx)` at the top, and
updates the selected hash table. On re-entry from the `VOID` zone, it looks up
the VPID, unlinks a hit in constant linked-list work, returns the saved LRU
index, and puts the node back on the free list.
[AOUT capacity and initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5802-L5882),
[eviction insertion](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10468-L10548),
[lookup, removal, and free-list return](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10550-L10636)

The linked-list portion of add/remove is `O(1)`. Hash lookup/update is expected
constant time under ordinary distribution, not a source-guaranteed worst-case
bound. Every add and lookup/remove is serialized by the single `Aout_mutex`.
An additional `pgbuf_remove_private_from_aout_list()` implementation would
scan the whole ghost FIFO in `O(A)`, but a pinned-tree symbol search finds only
its declaration and definition, no caller.
[whole-AOUT cleanup implementation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10638-L10721)

### Verified admission semantics if the existing branch were enabled

The decisive branch runs when a newly loaded BCB is finally unfixed from
`VOID`:

| Context and ghost result | Placement |
|---|---|
| Thread has a private LRU; AOUT disabled | current private LRU, top |
| Thread has a private LRU; AOUT hit records the same LRU index | current private LRU, top |
| Thread has a private LRU; AOUT miss | current private LRU, middle |
| Thread has a private LRU; AOUT hit records a different LRU index | shared LRU, middle |
| Thread has no private LRU | shared LRU, middle |

[VOID-zone admission branches](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6994)

The saved `lru_idx` identifies an LRU list, not a transaction or enduring page
owner. “Same-private hit” therefore means that the current request's private
list index equals the historical list index stored at eviction time.

## 4. Evidence that AOUT is disabled because of a bug

### Verified mechanism at the pinned baseline

The parameter table gives `data_aout_ratio` a default of `0.0`. More
decisively, `prm_tune_parameters()` unconditionally executes
`prm_set(pb_aout_ratio_prm, "0", false)` with the comment “disable AOUT list
until we fix CBRD-20741.” AOUT initialization then sees a nonpositive ratio,
sets `max_count = 0`, and returns without allocating nodes or hashes. Both add
and remove have `max_count <= 0` early returns.
[`data_aout_ratio` parameter](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3463-L3474),
[forced zero in parameter tuning](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L9931-L9987),
[disabled initialization exit](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5816-L5833)

This means setting a nonzero configuration value is not enough to revive AOUT
at this revision: the tuning step overwrites it.

### Historical evidence

- [CBRD-20741](http://jira.cubrid.org/browse/CBRD-20741), created in December
  2016, records a debug-build assertion/core dump in
  `pgbuf_add_vpid_to_aout_list()` during an RQG workload. Its current issue
  metadata says **Confirmed**, **Unresolved**. The stack is from an older 10.1
  implementation that still had an `Ain` victim path, so it proves the
  historical failure report, not that the pinned implementation has the same
  root cause.
- [CBRD-21135](http://jira.cubrid.org/browse/CBRD-21135) says the cause of
  CBRD-20741 was unknown and the team decided to disable
  `data_aout_ratio` until it could be fixed. It was resolved by commit
  [`d3554deee3a5e2e6d2030113db550eaea42a5fa4`](https://github.com/CUBRID/cubrid/commit/d3554deee3a5e2e6d2030113db550eaea42a5fa4),
  which added the forced-zero tuning block.

The strongest current claim is therefore: **the pinned source deliberately
forces AOUT off, and the disabling commit and linked JIRA issues attribute that
decision to an unresolved historical crash whose cause was not known.** It
would be too strong to claim that the present dormant implementation is known
to reproduce that exact crash.

## 5. What could improve if AOUT were safely revived

### Inference from the dormant admission branches

The benefits below are design consequences of the pinned code, not measured
runtime results:

1. **One-pass scan resistance.** A page with no ghost history would enter the
   middle of its private LRU instead of the current AOUT-disabled private top.
   Such a first-seen page has less power to displace established hot pages.
2. **Reward for reuse after eviction.** A page evicted from and then reloaded
   into the same private LRU would enter at the top. The ghost hit distinguishes
   this demonstrated reuse from a first visit.
3. **Recognition of cross-private reuse.** A page whose ghost record came from
   a different private LRU would enter a shared LRU at the middle, making the
   cross-domain reuse visible to shared replacement policy.
4. **Bounded history without retaining data pages.** At most 32,768 small
   identity nodes are retained; page frames and contents are not.

### Costs and risks that revival must address

- Every victim insertion and every cold-page admission lookup would contend
  on one global `Aout_mutex`. High eviction/refault rates could make it a
  bottleneck, but that is a performance hypothesis until benchmarked.
- Revival adds hash/list CPU work and preallocated metadata. The maximum ghost
  history is fixed at 32,768 entries, so a larger or faster-churning pool can
  overwrite useful history quickly.
- First-seen pages would enter at the middle instead of the private top. That
  protects against scan pollution, but can evict genuinely useful new pages
  sooner when they have not yet demonstrated post-eviction reuse.
- The old assertion/core must be reproduced or shown obsolete, and the AOUT
  list/hash/free-list invariants need concurrent stress tests. The existing
  full-list cleanup function has no caller at the pinned tree, so private-list
  lifecycle and historical `lru_idx` behavior also deserve explicit review.
- Removing the forced-zero line alone is not a complete fix. A safe revival
  needs correctness tests for add/recycle/remove, private-list reassignment,
  concurrent eviction/refault, startup/shutdown, and ratio boundaries, followed
  by workloads that compare hit rate, victim-search work, mutex contention,
  and tail latency.

## Version-sensitive boundary

All verified behavior above is scoped to
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. CBRD-20741's stack refers to a
2016 10.1 build and older replacement topology; it must not be used as direct
proof of a defect in later dormant code. Before changing another CUBRID
revision, recheck the parameter-tuning override, AOUT call sites, private-list
count formula, local `MAX_DEPTH`, and issue status.
