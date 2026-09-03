# Private LRU domain, hit-age epochs, and unfix placement

**Level:** Evidence reference
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Question sources:** `my-questions-11.md` and `my-questions-12.md`
**Evidence used:** Verified mechanism and Implementation policy from pinned CUBRID primary source; concurrency concerns and consequences explicitly marked as Inference. No runtime benchmark was performed.

This is the primary-source derivation, exhaustive branch/cost catalog, and
uncertainty record behind the canonical [private-domain and final-unfix
explanation](../advanced/replacement-progress.md#lru-object-assignment-and-membership-lifetimes).
Read that Advanced page for the learning sequence; use this note to audit a
claim or change against the pinned source.

## 1. “Private” means policy association, not page ownership

### Physical representation

The pool owns one array of LRU descriptors. Shared lists occupy indexes
`[0, S)`, and private lists occupy `[S, S + P)`. Every LRU is a mutex-protected
doubly linked list of BCBs with `top`, `bottom`, `bottom_1`, and `bottom_2`
boundary pointers. A resident BCB's `flags` encode its 16-bit LRU index and its
LRU1/LRU2/LRU3 zone; the BCB supplies the intrusive `prev_BCB` and `next_BCB`
links. There is no owner ID in either structure.
[BCB and LRU structures](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L510-L623),
[zone and index encoding](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L174-L216),
[shared/private index macros](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1079-L1114)

There are two related index forms:

```text
session/thread private_lru_index = private id p, in [0, P)
BCB/list LRU index             = S + p
```

`PGBUF_LRU_INDEX_FROM_PRIVATE()` performs the conversion. Thus a page “is in
session A's private domain” only when its encoded list index equals the actual
LRU index derived from A's current private id. That equality is an association
test, not a proof that A is or was the sole accessor.

### Association lifetime

Session creation calls `pgbuf_assign_private_lru()` and stores the returned
private id on `SESSION_STATE`. Each server request copies that id to the worker
thread entry and `pgbuf_thread_variables_init()` enables private-LRU behavior
only when page quota is enabled and the id is not `-1`. Session destruction
decrements that list's session count. Vacuum workers are a separate special
case: each worker receives a private id at vacuum initialization and its task
context copies that id.
[session creation and assignment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L729-L744),
[request-to-thread copy](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/server_support.c#L2069-L2087),
[thread enable test](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1545-L1560),
[thread-context reset](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry_task.cpp#L61-L102),
[session release](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L332-L407),
[vacuum assignment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L1258-L1277)

Assignment scans all private descriptors, preferring a zero-session list with
the fewest BCBs; if none exists, it chooses the least-active list. It then
increments `private_lru_session_cnt`. Consequently private-list assignment is
not guaranteed unique: multiple sessions can share one private domain.
[exact assignment algorithm](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14514-L14602)

Releasing an association does **not** empty the LRU and does not walk or move
its BCBs. `pgbuf_release_private_lru()` decrements the session count, clears
the activity when the count reaches zero, and attempts quota adjustment. The
list descriptor remains pool-global, and its BCBs remain linked until later
unfix movement, victimization, or invalidation.
[release implementation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14604-L14625)

The resulting lifetimes are independent:

```text
private LRU descriptor: page-buffer initialization --------> finalization
session association:             assign --------------------> release
thread association:                  request/task execution --------> reset
BCB membership:                         admission --> move/victim/invalidate
latch/fix ownership:                         fix --> unfix
```

The last line is the only ownership relation. Holder entries and BCB latch
state describe which callers currently fix a BCB; private-list membership does
not.

## 2. Who advances `adjust_age`

### Exact producer and call paths

The only source statement that increments `quota.adjust_age` is inside
`pgbuf_adjust_quotas()`:

```text
pgbuf-maintain daemon (attempt every 100 ms, if flush daemon is available)
    -> pgbuf_page_maintenance_execute()
       -> pgbuf_adjust_quotas()

session/vacuum private-id assignment
    -> pgbuf_assign_private_lru()
       -> pgbuf_adjust_quotas()

last association released from a private id
    -> pgbuf_release_private_lru()
       -> pgbuf_adjust_quotas()

successful pass only
    -> last_adjust_time = now
    -> ATOMIC_INC_32(&quota.adjust_age, 1)
```

[all direct calls and increment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14252-L14340),
[maintenance execution](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16994-L17009),
[100 ms looper](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17146-L17161),
[assignment/release calls](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14582-L14622)

The function can return before the increment when private quota is disabled,
another adjustment is marked in progress, less than 1 ms elapsed, or both
fewer than `B/4` counted final-unfix events occurred and less than 500 ms
elapsed. Here `B = pgbuf_Pool.num_buffers`. Therefore “age increases every
100 ms” is false. Under activity below `B/4`, a successful daemon-driven pass
is normally no more frequent than about 500 ms; high activity may pass sooner,
but never before the explicit 1 ms guard.
[threshold constants](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L271-L277),
[exact guards](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14288-L14330)

The unfix activity counter itself is incremented only in the zero-fix-count,
no-blocked-reader/writer branch. The aggregator walks all managed thread
entries (plus the main entry); a successful adjustment first reads the total,
then reads-and-resets it. The pinned source explicitly accepts that increments
can be lost while these plain per-thread integers are read and reset because
the result is a coarse heuristic.
[unfix increment site](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6713-L6740),
[aggregation and stated approximation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2204-L2244)

### `hit_age` and `lru_hits`

At an eligible final unfix, `pgbuf_bcb_register_hit_for_lru()` performs:

```text
if bcb.hit_age < quota.adjust_age:
    monitor.lru_hits[current_bcb_lru_index]++
    bcb.hit_age = quota.adjust_age
```

This is a **per-BCB epoch gate**. Ten eligible unfixes of the same BCB during
one age value contribute one hit, not ten. Ten different BCBs can each
contribute one. If a BCB is first counted while private and later moves to
shared in the same epoch, it does not contribute a second shared hit; if the
move is its first eligible event in that epoch, migration registers the hit
after insertion and therefore charges the shared destination.
[registration function](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16580-L16610),
[move then register](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10331-L10353)

On the next successful adjustment, the code atomically exchanges each
`monitor.lru_hits[i]` with zero, normalizes it to hits per second, smooths each
private `lru_activity[i]` over a ten-second window, and derives the overall
private-page ratio from private versus shared hit rates. It then divides the
private quota among private lists in proportion to their smoothed activity.
[hit consumption and smoothing](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14332-L14399),
[quota split](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14400-L14474)

It is not a raw page-access counter. Overlapping-reader lock-free unfix can
return before final-unfix policy, vacuum/temporary-page paths may deliberately
ignore hits, and an unfix with queued reader/writer waiters defers policy.
[lock-free unfix early return](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3070-L3201),
[ignore and waiter branches](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6713-L6844)

## 3. Fix does not normally reposition an existing BCB

For a resident page, the normal fix path finds the BCB in its hash chain,
registers one fix toward the hot threshold, and obtains the latch. It does not
unlink the BCB from its current LRU, so the private/shared index and LRU zone
remain unchanged while fixed. `pgbuf_bcb_register_fix()` saturates at 64; the
counter is later used by the hot-and-old private-to-shared rule. The
overlapping-reader lock-free fast path bypasses this fix registration.
[normal fix and registration](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2342-L2489),
[hot counter and threshold](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16335-L16367),
[overlapping-reader fast path](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7724-L7787)

A miss is different. `pgbuf_allocate_bcb()` first pops the invalid-list head
or obtains a victim; both yield a BCB in `VOID`. `OLD_PAGE` then reads through
DWB or the volume, whereas `NEW_PAGE` initializes the frame without a disk
read. The BCB remains `VOID` while latched and is admitted to an LRU only on
the final unfix.
[allocation choices](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8180-L8390),
[invalid to VOID](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8904-L8952),
[old-page read versus new-page initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8480-L8634)

## 4. Pinned zero-crossing branch catalog

`pgbuf_unlatch_bcb_upon_unfix()` first decrements the global BCB fix count. If
it remains above zero, no placement/movement occurs. If it reaches zero, the
function sets `NO_LATCH`; a move-to-bottom flag takes precedence. Otherwise,
replacement policy runs only when no reader/writer was already blocked. It
then wakes eligible waiters after the policy decision.
[zero-crossing control flow](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6855)

For ordinary, non-vacuum, non-temporary pages, the decision table is:

| Current membership at final unfix | Context/result |
|---|---|
| `VOID`, thread has private id `p` | Add to top of private `S+p`, which is LRU1; register hit. This is the actual pinned path because AOUT is off. |
| `VOID`, no private id | Select shared list; add at its middle, which is LRU2; register hit. |
| shared LRU1 | Keep position; register hit. |
| shared LRU2 | If old enough, boost to same list's top/LRU1; otherwise keep; register hit. |
| shared LRU3 | Boost to same list's top/LRU1; register hit. |
| private LRU1/LRU2/LRU3, final context's actual LRU index differs | Remove from private list, select a shared list, add at shared LRU2 middle, then register the hit against shared. |
| private LRU1/LRU2/LRU3, same domain, BCB is hot and old enough | Same move to shared LRU2 middle. |
| private LRU1, same domain, not hot-and-old | Keep position; register hit. |
| private LRU2, same domain, not hot-and-old | Boost to private LRU1 only if old enough; otherwise keep; register hit. |
| private LRU3, same domain, not hot-and-old | Boost to private LRU1; register hit. |

[VOID admission](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6994),
[LRU-zone decisions](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6742-L6844),
[migration predicate](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6996-L7038),
[boost implementation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10123-L10197)

“Hot” means the current BCB residency has reached 64 registered general fixes.
“Old enough” is not wall-clock time: it is
`AGE_DIFF(bcb.tick_lru_list, list.tick_list) >= list.count_lru2 / 2`.
`tick_list` advances on top/middle admission or top boost. Thus the test asks
whether enough other list-position events have occurred since the BCB's saved
tick, relative to current LRU2 size.
[age predicate](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1052-L1058),
[top/middle tick updates](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9694-L9830)

The migration helper removes the BCB under the source private-LRU mutex,
releases that mutex, chooses a shared index, and then inserts under the
destination mutex. It does not hold two LRU mutexes simultaneously. The outer
unfix still holds the BCB mutex during the transient `VOID` interval, and the
BCB latch has become `NO_LATCH`, preventing the ordinary/lock-free fix paths
from taking it mid-transfer.
[remove/add migration](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10303-L10353),
[intrusive unlink and VOID transition](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10355-L10417)

### Why “different transaction” is imprecise

The source comment describes the first migration condition as “fixed by more
than one transaction,” but the executable predicate compares only
`thread_private_lru_index != bcb_lru_idx`. It has no transaction ID and no
owner set. Therefore:

- a sequential access from a different private domain is enough; simultaneous
  multi-transaction ownership is not required;
- two distinct sessions assigned the same private LRU do not satisfy this
  condition;
- a context with no private LRU does satisfy it for any private BCB.

The exact maintainable wording is **cross-private-domain access observed at an
eligible final unfix**. “Multiple transactions” is policy intent, not what the
predicate proves.

### AOUT-disabled consequence

System-parameter tuning forcibly writes `data_aout_ratio = 0` with the comment
“disable AOUT list until we fix CBRD-20741.” Initialization then sets
`max_count = 0` and returns without allocating AOUT. Thus the active private
`VOID` branch always takes `!aout_enabled` and admits at private LRU1 top. The
dormant code would admit an AOUT miss at private LRU2 middle, a same-private
history hit at private top, and an other-private history hit at shared LRU2;
none of those history distinctions are operational at the pinned baseline.
[forced zero](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L9975-L9987),
[zero-capacity initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5802-L5834),
[dormant admission branches](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6896-L6993)

### Special branches that should not be generalized

- Vacuum workers, and temporary pages already in an LRU, deliberately avoid
  ordinary promotion/migration and hit registration. A vacuum `VOID` page is
  put at its private top when a private id exists, but is not counted as a hit.
- A `PGBUF_BCB_MOVE_TO_LRU_BOTTOM_FLAG` request overrides normal placement: an
  existing BCB moves to the bottom/LRU3 of its current list; a `VOID` BCB uses
  the current private list or a selected shared list.
- When reader/writer waiters existed at zero crossing, movement/hit sampling is
  skipped before the waiter group is woken. A later zero crossing can perform
  policy.
- `pgbuf_simple_fix()` is a specialized temporary-page API with different,
  latchless semantics and is not the ordinary `pgbuf_fix()` state machine.

[ignore macros](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L281-L293),
[move-to-bottom implementation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10419-L10466),
[specialized simple fix](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2687-L2804)

## 5. Structural cost model

Let `R` be the number of distinct BCB holders on the current thread, `H` the
selected hash-bucket chain length, `S` shared-list count, `P` private-list
count, `L = S + P`, `T` managed thread-entry count, and `D` the number of zone
boundary demotions caused by one operation.

| Operation | Structural work, excluding waits | What can dominate elapsed time |
|---|---:|---|
| `pgbuf_bcb_register_hit_for_lru()` | `O(1)` | Concurrent access to the same hit bucket/age fields |
| `pgbuf_should_move_private_to_shared()` | `O(1)` | None; field tests only |
| Intrusive LRU remove or raw top/middle/bottom insertion | `O(1)` | LRU mutex acquisition |
| Add-new-to-top/middle or boost | `O(1 + D)` | LRU mutex contention; zone demotions to thresholds |
| Private-to-shared move | `O(1 + D)` normally | Two sequential LRU mutex waits; destination insertion demotions |
| Choose a shared destination | amortized `O(1)`, periodic `O(S)` | Atomic counter contention; every `PAGE_ADD_REFRESH_STAT` call scans shared descriptors to identify an oversized list |
| `pgbuf_unfix()` holder bookkeeping | `O(R)` lookup, and up to another `O(R)` unlink pass | BCB mutex; waking queued waiters can add `O(W)` queue work |
| `pgbuf_assign_private_lru()` | `O(P)` per scan, bounded retries | It also attempts quota adjustment |
| successful `pgbuf_adjust_quotas()` | `O(T + L + D_total)` | Sequential LRU mutex waits and all zone demotions; no page I/O |
| resident normal fix | `O(H + R)` structural lookup | Hash/BCB/latch contention and waiter sleep |
| miss/new BCB acquisition | invalid pop `O(1)` or victim search; old-page miss adds storage I/O | Victim wait and `dwb_read_page`/`fileio_read`; `NEW_PAGE` avoids the read |

[`O(1)` intrusive edits](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9694-L9879),
[zone-demotion loops](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9881-L10048),
[periodic shared scan](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8987-L9063),
[holder scans](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6089-L6275),
[quota loops](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14252-L14511)

`O(1 + D)` matters: the list splice is constant-time because all boundaries
are explicit pointers, but restoring zone thresholds can walk and relabel
multiple boundary BCBs. None of normal admission, boost, migration, or quota
demotion itself performs disk I/O. Disk read belongs to an old-page miss;
flush I/O may occur later because of a separate asynchronous flush request.

## 6. Evidence boundaries and source-level anomalies

1. **Verified:** the private-to-shared predicate is index mismatch or
   hot-and-old. **Inference:** the intended benefit is to stop cross-domain or
   broadly hot pages from consuming a locality-specific quota. No runtime
   experiment here measures that benefit.
2. The quota comment says “more than 5 min,” but the executable guard contains
   only 1 ms and 500 ms constants; there is no five-minute comparison in the
   function. Documentation should describe the code and flag the comment as
   stale, not invent a five-minute cadence.
3. `monitor.lru_hits[i]` is a plain `int`. Registration uses plain `++`, while
   adjustment uses `ATOMIC_TAS_32(..., 0)`. Different BCBs in the same LRU can
   reach registration under different BCB mutexes, not one common LRU mutex.
   This is a source-level synchronization concern; this note does not claim a
   reproduced lost-hit defect or quantify error.
4. `bcb->hit_age` is initialized to zero, but the pinned source has no reset on
   ordinary victim reuse (the only other assignment copies it during BCB
   state copy). Therefore a replacement page first unfixed in the same epoch
   as the old BCB's last counted hit may not add a hit. This is consistent with
   a coarse per-BCB sampler, but the source does not document the intent.
5. The signed `INT32 adjust_age` increment has no explicit wrap handling,
   whereas list ticks do. Because registration tests `<` rather than `!=`,
   wrap behavior deserves an audit before relying on indefinite monotonicity;
   no runtime wrap test was performed.
6. The lock-free overlapping-reader fix path does not call
   `pgbuf_bcb_register_fix()`. Thus “hot = 64 fixes” means 64 fixes observed by
   the general path, not necessarily 64 API-level fixes.

[stale cadence comment and actual guards](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14304-L14331),
[hit fields and types](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L510-L540),
[hit initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5605-L5643),
[BCB-state copy including `hit_age`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1420-L1440),
[all active hit-age update logic](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16594-L16610)
