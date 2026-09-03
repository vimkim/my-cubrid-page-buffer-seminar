# CUBRID replacement policy from first principles

**Level:** Evidence reference
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Purpose:** Primary-source audit for rewriting Lesson 0012 and separating AOUT into its own lesson
**Evidence used:** Verified mechanism and Implementation policy from pinned CUBRID source only. No runtime benchmark was performed.

This note reconstructs the replacement algorithm from the BCB state changes in
the pinned source. It deliberately starts below the policy names. A maintainer
first needs to know what object is reused, which states are real list
memberships, and which checks can veto reuse.

The shortest accurate model is:

```text
need a frame for page Q
        |
        v
pop INVALID BCB if one exists ------------------------------+
        | none                                               |
        v                                                    |
choose one advertised LRU list                              |
        |                                                    |
walk only its LRU3 chain, at most 1,000 BCB visits           |
        |                                                    |
try-lock and recheck one clean, idle BCB                     |
        |                                                    |
detach from LRU -> VOID                                      |
        |                                                    |
remove old VPID from resident hash                           |
        |                                                    |
bind the same BCB/frame to Q, load or initialize Q <---------+
        |
        v
publish Q in resident hash; BCB remains VOID while fixed
        |
        v
last unfix, when no reader/writer handoff is pending
        |
        +--> private LRU1 top, or shared LRU2 middle
```

There are two important corrections to casual descriptions:

1. A clean LRU3 BCB is only a *possible* victim. The scan still checks fix
   count, latch/waiters, flags, mutex availability, and the same conditions
   again under protection.
2. The active algorithm at this baseline is the three-zone private/shared LRU
   policy. AOUT's code remains, but startup forces it off. Calling the active
   algorithm simply “2Q” is therefore misleading.

## 1. The reusable object

At startup the pool allocates exactly `B = pgbuf_Pool.num_buffers` BCB objects
and exactly `B` page frames. BCB `i` is permanently paired with
`iopage_table[i]`; replacement changes the `VPID` and frame contents, not the
BCB/frame pairing. The default `data_buffer_pages` value is 32,768 and startup
applies a minimum of `10 * MAX_NTRANS`.
[pool size and minimum](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L81-L107),
[fixed BCB/frame allocation and pairing](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5554-L5667),
[`data_buffer_pages` default](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1169-L1189)

One BCB simultaneously carries several independent facts:

| Axis | Representative fields | Replacement meaning |
|---|---|---|
| Resident identity | `vpid`, `hash_next` | Which logical page, if any, this frame represents and where it is found |
| Fix/latch | atomic `latch_mode`, `waiter_exists`, `fcnt`; `next_wait_thrd` | Whether a caller is using or waiting for the bytes |
| Replacement membership | encoded zone/list index, `prev_BCB`, `next_BCB` | INVALID, VOID, or one position in one private/shared LRU |
| Durability/progress flags | DIRTY, FLUSHING, direct-victim flags | Whether reuse would lose data or conflict with an in-flight handoff |
| Frame | permanent `iopage_buffer` pointer | The bytes that are overwritten for the next `VPID` |

[BCB and latch fields](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L499-L543)

Replacement is consequently **not** “free a page object and allocate another.”
It is “prove that one fixed-capacity BCB/frame pair is reusable, detach its old
identity, and rebind it to another VPID.”

### Three distinct replacement verbs

| Term in this note | Exact moment | Old VPID still searchable? |
|---|---|---|
| Candidate | An LRU3 BCB is counted or observed as possibly reusable | Yes |
| Selected / detached | The scan owns the BCB mutex and removes the BCB from its LRU, changing the zone to VOID | Yes, until the hash step |
| Victimized | `pgbuf_victimize_bcb()` rechecks and `pgbuf_delete_from_hash_chain()` removes the old VPID, nulls it, and marks the latch invalid | No |

[LRU selection and detach](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9391-L9475),
[victimization and hash removal](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8637-L8687),
[hash-chain deletion](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7882-L7977)

An INVALID BCB can be allocated for a miss, but it is not “victimized”: it has
no resident page identity to evict.

## 2. The five replacement states

The BCB `flags` word contains both ordinary flags and an encoded replacement
zone. LRU indexes occupy 16 bits; shared and private LRU descriptors are stored
in one array. `prev_BCB` and `next_BCB` are intrusive links, so an LRU BCB is a
node of exactly one doubly linked list without a separately allocated list
node.
[zone/index encoding](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L174-L216),
[LRU representation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L584-L623),
[shared/private index ranges](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1079-L1105)

### INVALID

`PGBUF_INVALID_ZONE` means that the BCB is on the global invalid/free list.
That list is a mutex-protected **singly linked stack** using `next_BCB` and
`invalid_top`. An INVALID BCB has null VPID, invalid latch, zero fix count, no
LRU membership, and no resident hash membership. Startup links all `B` BCBs
into this list, so `invalid_cnt == B` before pages are loaded.
[initial BCB chain](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5605-L5667),
[invalid-list initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5906-L5919)

This is the cheapest source of capacity. `pgbuf_get_bcb_from_invalid_list()`
pops the head, locks that BCB, clears its link, and changes INVALID to VOID.
There is no array scan and no victim search.
[invalid pop](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8904-L8952)

### VOID

`PGBUF_VOID_ZONE` means **not linked to the invalid list and not linked to any
LRU list**. It is an intermediate membership state, not a synonym for empty,
unused, or uninitialized. The BCB mutex or another protocol owns the transition.

A VOID BCB can be in several very different situations:

- just popped from INVALID, before a new VPID is loaded;
- just detached from LRU, while its old VPID is still in the resident hash;
- already victimized, with old VPID removed, before rebinding;
- bound to a newly loaded VPID, published in the resident hash, and currently
  fixed by one or more callers;
- between the source and destination LRU during a boost or private-to-shared
  move;
- assigned directly to an allocator and awaiting final detach/consumption.

The key invariant is only about **list membership**. A VOID BCB is in neither
replacement list family. Its identity, hash, latch, and fix state must be read
separately.
[source's VOID definition](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L203-L211),
[all encoded zone transitions](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15860-L15986)

### LRU1

`PGBUF_LRU_1_ZONE` is the hot, protected prefix of one LRU list. It cannot be
chosen by `pgbuf_get_victim_from_lru_list()`. Final unfix deliberately leaves an
existing LRU1 BCB in place in the common case instead of moving it to the
physical top; this avoids an LRU mutex and pointer edits on the hottest path.
[zone intent](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L184-L208),
[LRU1 final-unfix branch](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6752-L6778)

### LRU2

`PGBUF_LRU_2_ZONE` is the protected buffer between hot LRU1 and victimizable
LRU3. It is not searched for victims. On an eligible final unfix, an old-enough
LRU2 BCB is boosted to LRU1 top; a too-new BCB stays where it is. “Old enough”
means its saved `tick_lru_list` trails the list tick by at least half the current
LRU2 count, with wrap-aware arithmetic. It is a logical insertion-age test,
not elapsed milliseconds.
[old-enough formula](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1052-L1058),
[LRU2 unfix decision](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6780-L6815)

### LRU3

`PGBUF_LRU_3_ZONE` is the only ordinary victim-search zone. An eligible final
unfix of an existing LRU3 BCB normally boosts it to LRU1 top, giving a page that
was reused near eviction a new chance. A BCB that is not fixed again stays in
LRU3 and can be scanned from the cold end.
[LRU3 unfix branch](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6817-L6844),
[boost implementation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10123-L10197)

`count_vict_cand` is not the number of BCBs guaranteed reusable at this instant.
The count is maintained from LRU3 membership and the DIRTY/FLUSHING/direct flag
mask. It does not incorporate `fcnt`, latch waiters, or BCB-mutex availability;
the scanner filters those later.
[zone/flag candidate accounting](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15779-L15986)

## 3. Every active membership transition

The source contains the following complete set of calls that change an encoded
BCB zone. Composite operations use VOID as a protected seam.

| From | To | Why | Functions |
|---|---|---|---|
| INVALID | VOID | Pop free capacity for a miss | `pgbuf_get_bcb_from_invalid_list()` |
| VOID | INVALID | Load/decrypt/latch failure, explicit invalidation, or cleanup | `pgbuf_put_bcb_into_invalid_list()` |
| VOID | LRU1 | First final unfix into a private list with active AOUT disabled; vacuum special path | `pgbuf_unlatch_void_zone_bcb()` → `pgbuf_lru_add_new_bcb_to_top()` |
| VOID | LRU2 | First final unfix without a private list; private-to-shared move; dormant AOUT cold/different-domain branches | `pgbuf_lru_add_new_bcb_to_middle()` |
| VOID | LRU3 | Explicit move-to-bottom/deallocation path | `pgbuf_lru_add_new_bcb_to_bottom()` |
| LRU1 | LRU2 | LRU1 count exceeds its threshold | `pgbuf_lru_adjust_zone1()` |
| LRU1 or LRU2 | LRU3 | Combined protected-zone count or LRU2 count exceeds threshold | `pgbuf_lru_adjust_zones()`, `pgbuf_lru_adjust_zone2()`, `pgbuf_lru_fall_bcb_to_zone_3()` |
| LRU2 or LRU3 | VOID → LRU1 | Eligible final-unfix boost | `pgbuf_lru_boost_bcb()` |
| Private LRU1/2/3 | VOID → shared LRU2 | Domain mismatch or hot-and-old migration | `pgbuf_lru_move_from_private_to_shared()` |
| LRU1/2/3 | VOID → same LRU3 | `MOVE_TO_LRU_BOTTOM` policy | `pgbuf_move_bcb_to_bottom_lru()` |
| LRU3 | VOID | Ordinary victim selection or direct-victim consumption | `pgbuf_get_victim_from_lru_list()`, `pgbuf_get_direct_victim()` |

[raw add/top/middle/bottom operations](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9694-L9879),
[zone adjustment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9881-L10121),
[removal through VOID](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10303-L10417),
[move-to-bottom](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10419-L10466)

No active transition changes one linked membership into another without first
passing through VOID. A same-list boost or move-to-bottom holds that LRU mutex
across the unlink and reinsert. The private-to-shared helper instead unlinks the
known BCB, clears both intrusive links, changes its zone to VOID, unlocks the
private source, and then separately locks and inserts into a shared destination.
The outer BCB mutex remains held during ordinary final-unfix movement, so a
concurrent replacement path cannot claim the in-between BCB.

### Threshold numbers

For shared LRUs, the default hot ratio is `0.40` and buffer ratio is `0.05`.
Each accepted quota adjustment estimates an average shared-list target and sets:

```text
shared LRU1 threshold = floor(avg_shared_size * 0.40)
shared LRU2 threshold = floor(avg_shared_size * 0.05)
```

Thus the default target protects about 45% of a shared list in LRU1+LRU2 and
allows about 55% into LRU3. These are target thresholds, not a promise that the
instantaneous list has exact percentages.

For each private LRU, both thresholds are fixed at 5% of that private list's
current quota:

```text
private LRU1 threshold = floor(private_quota * 0.05)
private LRU2 threshold = floor(private_quota * 0.05)
```

An adjusted private list can therefore have roughly 90% of quota in LRU3.
Private quota itself is activity-derived and capped at `min(5,000, B / 2)` per
list. A zero-activity private list receives quota and thresholds zero, causing
its protected zones to be demoted on adjustment.
[ratio bounds/defaults](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3754-L3777),
[quota and threshold calculation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14400-L14510)

## 4. Invalid-list-first allocation

`pgbuf_allocate_bcb()` is invoked only after the requested VPID missed the
resident hash and the miss owner protocol has prevented two threads from
loading the same page independently. Its order is exact:

1. Call `pgbuf_get_bcb_from_invalid_list()`.
2. If the invalid list is empty, call `pgbuf_get_victim()`.
3. If no victim is found and the page-flush daemon exists, enqueue the allocator
   in a high- or low-priority direct-victim waiter queue, wake the flush daemon,
   and suspend.
4. On wake, validate the directly assigned BCB. If another caller fixed it in
   the interim, retry as high priority.
5. In stand-alone/recovery circumstances without the daemon, request flush work
   and search again.
6. For a selected old resident, call `pgbuf_victimize_bcb()` before returning
   the reusable, mutex-locked BCB.

[allocator flow](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8180-L8390),
[miss-owner/load lock](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7980-L8177)

This explains early server life precisely. If only 100 of 32,768 initial BCBs
have been used, the next cold miss pops the invalid-list head. It does not need
an LRU victim and it does not choose a BCB based on the requested VPID. The
selection criterion is simply “current invalid stack head.”

## 5. Which LRU list is searched

The victimizer does not enumerate every transaction and normally does not scan
the LRU descriptor array. LRUs with usable flag-level LRU3 candidates advertise
their integer indexes through lock-free circular queues. Shared and private
indexes have separate queues, each sized to twice its list count.
[advertisement queues](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1864-L1892),
[advertisement producer](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16369-L16414)

In server mode the policy order in `pgbuf_get_victim()` is:

```text
1. own private LRU, but initially only when:
     LRU1+LRU2 > quota
     OR (total list size > quota AND count_vict_cand > 0)

2. one advertised other-private LRU
     if own list is materially over quota, restrict this to the "big private" queue

3. one advertised shared LRU

4. if own private was skipped for being under quota, try it now as a last fallback
```

[complete cross-list policy](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9066-L9253),
[private queue consumption](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16416-L16506),
[shared queue consumption](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16508-L16578)

“Private under quota” is therefore a **preference**, not immunity. It delays use
of that domain, but the final own-private fallback can still search it when
other sources fail. The post-flush direct-assignment path also refuses an
under-quota private BCB, giving it another policy-specific chance.
[post-flush under-quota guard](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15489-L15556)

If page quota is disabled, there are no private lists and only shared lists are
searched. In the no-flush-daemon branch, shared queue consumption can loop up to
the number of shared LRUs; with the daemon available, the ordinary call makes
one shared-list attempt before it falls into the direct-victim wait protocol.

## 6. What one selected-list scan does

`pgbuf_get_victim_from_lru_list(thread_p, lru_idx)` receives one already chosen
LRU index. It never scans an array of LRUs. Its steps are:

1. Return immediately if `count_vict_cand == 0`.
2. Lock this LRU's mutex.
3. Return if the bottom is absent or not in LRU3.
4. If this is a private list whose LRU1+LRU2 exceeds quota, demote enough nodes
   to restore thresholds. This demotion is outside the later 1,000-node bound.
5. Start at `victim_hint`, or at `bottom` if the hint is null.
6. Follow `bufptr->prev_BCB` toward hotter nodes while still in LRU3, stopping
   after at most `MAX_DEPTH = 1000` visited BCBs.
7. Skip a BCB if an invalid-victim flag is visible or if it appears fixed,
   latched, or to have any BCB waiter.
8. Try-lock the BCB mutex. It must not block while holding the LRU mutex.
9. Under the BCB mutex, call `pgbuf_is_bcb_victimizable()` again.
10. If the protected recheck succeeds, unlink the known node, change it to VOID,
    unlock the LRU, and return it while retaining the BCB mutex.

[bounded selected-list scan](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9314-L9538)

The scan is from the cold end, but it is not “take the bottom unconditionally.”
Dirty, in-flight, fixed, contended, or newly active BCBs may cause the scanner
to walk past the first node. `victim_hint` is only an optimization hint and the
source itself notes that it can be imperfect.
[hint fields and caution](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L584-L607)

## 7. Exact yes/no victim scenarios for one BCB

The table distinguishes ordinary LRU victim search from other operations.

| BCB situation | Ordinary victim now? | Exact reason / next possibility |
|---|---:|---|
| INVALID-list head | Not a victim; immediately allocatable | `pgbuf_allocate_bcb()` uses it before any victim search |
| VOID | No ordinary LRU scan | It is not in any LRU; its current owner/protocol must place, invalidate, or consume it |
| LRU1, even clean and idle | No | LRU1 is protected and the loop only visits LRU3 |
| LRU2, even clean and idle | No | LRU2 is protected; threshold adjustment may later demote it |
| LRU3, clean, `fcnt == 0`, `NO_LATCH`, no waiters, no invalid flags, mutex obtainable | Yes, if policy selects this list and reaches it | Try-lock plus protected recheck, detach to VOID, then victimization |
| LRU3 with `fcnt > 0` | No now | `pgbuf_is_bcb_fixed_by_any()` rejects it; final unfix may boost it to LRU1 |
| LRU3 with `fcnt == 0` but a BCB waiter | No now | `next_wait_thrd != NULL` rejects even a flush-only waiter; source chooses conservative false negatives |
| LRU3 with non-`NO_LATCH` observed outside BCB mutex | No now | It is treated as fixed/in transition |
| LRU3 and DIRTY | No | Dirty is in the invalid-candidate mask; flush, not eviction, must preserve it first |
| LRU3 and FLUSHING, even though DIRTY was cleared | No | Home-page completion has not succeeded; reuse could race the in-flight write |
| LRU3 with `VICTIM_DIRECT` | No ordinary scan | It is reserved for a sleeping allocator |
| LRU3 with `INVALIDATE_DIRECT_VICTIM` | No ordinary scan | A new fix stole the reserved page; the allocator must retry |
| LRU3 with `MOVE_TO_LRU_BOTTOM`, `TO_VACUUM`, or `ASYNC_FLUSH_REQ` alone | Not vetoed by this mask | Other state normally supplies the necessary safety; `TO_VACUUM` is cleared by victimization |
| LRU3 whose BCB mutex try-lock fails | No in this visit | Scanner skips instead of blocking under LRU mutex; a later scan may succeed |
| Clean private LRU3 under quota | Usually delayed, not immune | Other/shared sources precede it; own-private final fallback may still scan it |
| Clean private LRU3 over quota | Preferred source | Own over-quota list is tried first; advertised other-private lists precede shared |
| Candidate changed after the initial observation | Only if protected recheck still passes | BCB mutex and second eligibility test close the observation-to-action gap |
| Avoid-deallocation count is nonzero | **Still victimizable** if other checks pass | `OLD_PAGE_PREVENT_DEALLOC` protects logical deallocation, not BCB replacement; reuse resets and warns about the counter |

[invalid-candidate flags](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L222-L265),
[fixed/waiter and final eligibility checks](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9255-L9312),
[avoid-deallocation replacement boundary](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16242-L16333)

The last row is intentionally surprising. `pgbuf_bcb_avoid_victim()` checks only
DIRTY, FLUSHING, and the two direct-victim flags. It does **not** check the
separate avoid-deallocation counter.

### Worked scenario A: clean page eventually becomes a victim

```text
miss P
  INVALID -> VOID, bind/read P
  first final unfix -> private LRU1 top

many later insertions / quota adjustment
  P crosses LRU1 threshold -> LRU2
  P crosses protected-zone threshold -> LRU3

no caller fixes P again
  P remains clean, fcnt=0, no waiter

allocator misses Q
  invalid list empty
  selects P's advertised LRU
  reaches P within 1,000 visits
  BCB try-lock succeeds
  protected eligibility succeeds
  LRU3 -> VOID
  old P hash identity removed
  same BCB/frame bound to Q
```

This is the straightforward victim case. Being old supplies search position;
being clean and idle supplies eligibility.

### Worked scenario B: LRU3 page is fixed just in time

```text
P is clean in LRU3
thread R fixes P -> fcnt > 0
victim scan reaches P -> rejects it as fixed
thread R final-unfixes P
  no queued reader/writer
  P is boosted LRU3 -> VOID -> LRU1 top
```

P is not merely skipped for one scan; the qualifying reuse moves it out of the
victim zone. It must age through thresholds again before ordinary victimization.

If a queued reader/writer exists, the current final unfix skips replacement
movement and wakes the waiter. The BCB may remain in LRU3 while ownership is
handed off, but the waiter/fix state continues to make it ineligible. A later
final unfix with no pending handoff can boost it.
[final-unfix movement and handoff](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6883)

### Worked scenario C: dirty LRU3 page needs two kinds of progress

```text
P in LRU3 becomes DIRTY
  candidate count is decremented
  normal victim scan skips P

page-flush daemon scans LRU3
  records (BCB pointer, expected VPID=P) as a flush candidate
  re-locks and rechecks identity, DIRTY, !FLUSHING, LRU3, and !fixed/waiting
  if WAL is behind page LSA: skip P and wake/force log flush
  otherwise begin page flush:
      DIRTY clears, FLUSHING sets
      P is still not victimizable

flush completion
  FLUSHING clears
  if P was not dirtied again: clean candidate becomes visible
  if P was dirtied again during the write: DIRTY remains and P still cannot be a victim

later
  normal scan may detach P, or post-flush processing may assign it directly
```

[dirty candidate removal](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16026-L16060),
[flush collection and protected rechecks](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3780-L3858),
[WAL and flush loop](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3860-L4168),
[DIRTY/FLUSHING generation transition](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16076-L16125)

DIRTY answers “does memory contain an unwritten generation?” FLUSHING answers
“is a write generation in flight?” Both are needed: the flush path clears DIRTY
at write start so that a concurrent new modification can set it for the next
generation, while FLUSHING prevents replacement until completion.

### Worked scenario D: direct victim is revoked by a new fix

```text
allocator A cannot find a victim -> sleeps in direct-victim queue
provider chooses clean idle P -> sets VICTIM_DIRECT, wakes A

before A consumes P:
  thread R fixes old page P through resident hash
  fix changes VICTIM_DIRECT -> INVALIDATE_DIRECT_VICTIM

A wakes:
  pgbuf_get_direct_victim() sees invalidation
  clears it, returns NULL
  allocator retries at high priority
```

If no intervening fix occurs, A clears `VICTIM_DIRECT`, rechecks eligibility,
detaches P to VOID if still in LRU, and proceeds through
`pgbuf_victimize_bcb()`. Direct assignment is a revocable reservation, not an
early identity change.
[fix revokes direct victim](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2380-L2388),
[direct-victim consumption](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15591-L15652)

## 8. Exact detach and rebind sequence

For a cold miss whose capacity comes from an LRU victim, the complete identity
transition is:

| Stage | Zone | `vpid` / hash | Latch and mutex | Function |
|---|---|---|---|---|
| 1. Miss ownership | old LRU state | Old page still resident | Miss owner holds per-VPID buffer lock protocol | `pgbuf_lock_page()` |
| 2. Candidate selection | LRU3 → VOID | Old VPID still in hash | LRU mutex + BCB mutex during detach; returns with BCB mutex | `pgbuf_get_victim_from_lru_list()` |
| 3. Final old-page proof | VOID | Old VPID still in hash | BCB mutex; eligibility rechecked | `pgbuf_victimize_bcb()` |
| 4. Old identity removal | VOID | Old hash link removed; VPID nulled | BCB mutex retained; latch set INVALID, `fcnt=0` | `pgbuf_delete_from_hash_chain()` |
| 5. New identity preparation | VOID | `vpid = requested VPID`, not yet in hash | BCB mutex; latch reset to NO_LATCH, `fcnt=0` | `pgbuf_claim_bcb_for_fix()` |
| 6. Load or initialize | VOID | New identity private to miss owner | Old page reads DWB/home; new page initializes frame | `pgbuf_claim_bcb_for_fix()` |
| 7. Validate and latch | VOID | Still not published | Register hot sample, verify page-header identity, acquire requested latch and holder | `pgbuf_fix_release()` |
| 8. Publish | VOID | Insert new VPID at hash-bucket head | Latch/fix now protects bytes; miss lock released | `pgbuf_insert_into_hash_chain()`, `pgbuf_unlock_page()` |
| 9. First stable replacement placement | VOID → LRU1 or LRU2 | New page remains resident | Last unfix with no reader/writer handoff pending | `pgbuf_unlatch_void_zone_bcb()` |

[miss claim and load](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8392-L8635),
[validation, latch, and publish](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2414-L2544),
[hash insertion](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7831-L7880),
[VOID admission](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6994)

The BCB can remain VOID for the entire first fix lifetime. That is correct: the
positive `fcnt` and latch protect it from reuse even though it is not yet an LRU
node. If waiters have queued by the first owner's unfix, admission is postponed
across the ownership handoff; the final owner that reaches zero without a
reader/writer waiter performs the placement.

Failure before publication generally returns the BCB to INVALID. Read failure,
decrypt failure, page-header identity failure, or initial latch failure follows
this cleanup. INVALID is therefore both startup capacity and recycled capacity
from failed/explicit invalidation paths.

## 9. Private and shared list counts

Let `S` be shared-list count and `P` private-list count. The pool allocates one
array of `S + P` persistent LRU descriptors:

```text
index 0 ... S-1       shared LRUs
index S ... S+P-1     private policy domains
```

The private label is a quota/locality association, not BCB ownership. Holder
entries and the latch/fix tuple own pages; a private LRU can be associated with
multiple sessions.

At the pinned baseline:

- `num_LRU_chains = 0` derives `S` from `MAX_NTRANS`, reduces it when that would
  leave fewer than about 1,000 buffers per shared list, and floors this automatic
  result at four. An explicit shared count is parameter-validated up to 1,000;
  the initializer does not floor an explicit positive value to four.
- `num_private_chains = -1` derives `P = MAX_NTRANS + 50`, because
  `VACUUM_MAX_WORKER_COUNT` is 50. Zero disables private LRUs. Explicit 1..3 is
  floored to four; the parameter's explicit upper bound is 4,050.
- Stand-alone mode forces `P = 0`.
- The 16-bit LRU index representation has a separate 65,536 total-index space;
  the inspected initializer does not visibly enforce a combined `S + P` guard.

[shared-list derivation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5740-L5800),
[shared parameter bound](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1794-L1805),
[private-list derivation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13941-L13985),
[private parameter bound](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L4171-L4182),
[`MAX_NTRANS`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_common_impl.h#L48-L52),
[50 vacuum workers](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.h#L128-L136)

### Fully derived pinned-default example

Assume the ordinary server defaults `data_buffer_size = 512M`, 16 KiB I/O
pages, `max_clients = 100`, and `ha_mode = off`:

```text
B = 512 × 1,024 × 1,024 / 16,384 = 32,768 BCB/frame pairs

css_get_max_conn = normal 100 + admin 1 + HA-reserved 0 = 101
MAX_NTRANS        = css_get_max_conn + system 1 = 102
minimum B         = 10 × MAX_NTRANS = 1,020  (does not raise 32,768)

S = max(4, min(102, floor(32,768 / 1,000))) = 32 shared LRUs
P = MAX_NTRANS + VACUUM_MAX_WORKER_COUNT = 102 + 50 = 152 private LRUs
L = S + P = 184 LRU descriptors
```

The 512 MiB figure covers the 32,768 page frames; BCB/control/list/hash memory
is additional overhead. The user-visible maximum normal clients remains 100.
The number 102 is the internal transaction-table quantity used by these page-
buffer formulas. HA-reserved connections, a different database page size, or
explicit LRU parameters change the derived numbers. The private count is
derived separately and is not capped at 32 or 1,000.

[16 KiB page-size default](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/storage_common.h#L91-L99),
[`max_clients = 100`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1569-L1582),
[HA-off default](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L2329-L2342),
[admin and HA connection additions](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L84-L112),
[connection total](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L158-L245)

## 10. Direct-victim and flush progress

Direct-victim handoff exists because repeatedly rescanning while all old pages
are DIRTY, fixed, or contended burns CPU without creating capacity. An allocator
that fails normal search enters one of two lock-free waiter queues:

- high priority for vacuum or a thread already holding important/hot pages;
- low priority for ordinary allocation pressure.

The low-priority queue has twice total-thread capacity and the high-priority
queue has total-thread capacity. Providers select low priority every fourth
attempt before the normal high-then-low order, preventing the priority order
from being absolute starvation by construction, but the source does not prove a
wall-clock fairness bound.
[queue allocation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1824-L1852),
[waiter selection](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15559-L15589)

Verified provider paths include:

1. LRU zone adjustment can directly assign a newly demoted clean LRU3 BCB.
2. A vacuum final unfix in VOID or LRU3 can directly assign the BCB.
3. Flush candidate collection can assign one already-clean BCB while scanning.
4. Post-flush processing can assign a successfully cleaned, still-idle LRU3
   BCB, except from a private list under quota.
5. An ordinary victim scan can enter a panic helper when the low-priority waiter
   queue reaches `5 + total_threads / 20`, assigning additional candidates from
   the already locked LRU.
6. The uncommon move-to-bottom path can offer a mutex-owned, still-VOID BCB
   directly before it links that BCB at LRU3 bottom.

[zone-demotion assignment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10050-L10110),
[vacuum final-unfix assignments](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6817-L6832),
[flush-scan assignment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3789-L3847),
[post-flush assignment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15489-L15556),
[panic threshold](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9443-L9463),
[VOID-to-bottom offer](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10267-L10301)

Flush creates candidates but does not itself decache pages. The page-flush path
uses dynamically weighted list priorities, scans only LRU3, stores both BCB
pointer and expected VPID, and rechecks before writing. Its configured scan
count is `B * flush_ratio`, dynamically multiplied by up to 10 according to
victim-request/fix-request rate, then capped at the number of pages equivalent
to 200 MiB. Optional sequential mode sorts collected candidates by VPID before
I/O.
[flush scan sizing and sort](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3930-L4008)

When every selected dirty page is blocked only by WAL and direct-victim waiters
exist, the server path synchronously flushes the log through the largest needed
LSA and retries the candidate loop once. An 8,192-entry `flushed_bcbs` queue is
used only when the page-flush thread has completed its write, post-flush exists,
and an allocator is waiting. In that pressure path, post-flush clears FLUSHING,
wakes flush waiters, and may hand clean capacity directly to an allocator.
Otherwise the flushing thread reacquires the BCB itself and completes those
state changes directly.
[WAL retry](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L4129-L4151),
[post-flush queue size](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L738-L752),
[pressure-only routing condition](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10927-L10952)

This is a progress protocol, not a strict guarantee that a particular sleeping
thread receives a particular BCB. Assignment is revocable if the old page is
fixed again, eligibility is always rechecked, I/O can fail, and latch timeout or
interrupt can terminate a waiter.

## 11. Time complexity and actual traversal shape

Let:

- `B` = pool BCB count;
- `S`, `P`, `L = S + P` = shared, private, and total LRU counts;
- `H` = nodes in the affected resident hash bucket;
- `D` = nodes demoted to restore one LRU's zone thresholds;
- `Z` = LRU3 nodes reachable from a selected scan start;
- `Q` = stale direct-victim waiter entries skipped before a live waiter;
- `C` = BCBs inspected by one flush collection pass;
- `F` = dirty candidates collected for that pass.

| Operation | Data structure traversed | CPU work excluding lock/I/O wait |
|---|---|---|
| Pop/push INVALID | Singly linked stack head | `O(1)` |
| Add known BCB to LRU top/middle/bottom | Doubly linked intrusive list plus boundary pointers | Pointer edit `O(1)`; wrapper may also demote `D`, so `O(1 + D)` |
| Remove known BCB from LRU | Doubly linked intrusive list | `O(1)`; no position search |
| One selected-list victim walk | `prev_BCB` links in one LRU3 | `O(min(Z, 1000))` visits, plus optional `O(D)` pre-adjustment |
| Advertised other-private/shared list choice | Lock-free queue of integer LRU indexes | Expected bounded queue work; no `P`/`S` array traversal |
| `pgbuf_get_victim()` with flush daemon | At most own, one other-private, one shared, and possible own fallback scans | Sum of those bounded selected-list calls; mutex waits excluded |
| `pgbuf_get_victim()` without flush daemon | Shared queue can loop | Up to `S` shared-list attempts, each with the selected-list bound |
| Delete old resident identity | Singly linked hash bucket | `O(H)` |
| Insert new resident identity | Hash-bucket head | `O(1)` after bucket mutex acquisition |
| Consume direct victim | Array slot, flags, and known LRU node | `O(1)` list work; later old-hash deletion is `O(H)` |
| Find a live direct-victim waiter | Lock-free queues | `O(Q + 1)` when stale waiter records must be skipped |
| Flush candidate collection | All `L` descriptors and LRU3 link prefixes | `O(L + C)` |
| Optional sequential flush ordering | Candidate array | `O(F log F)` through `qsort`, followed by I/O |
| Quota/threshold adjustment | Thread counters, all LRUs, and threshold demotions | `O(T + L + D_total)` for managed threads `T` and total demotions |
| Dormant AOUT add/remove | Global FIFO plus hash | `O(1)` linked-list work and expected hash `O(1)`; single mutex |

[invalid-list constant pointer edits](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8904-L8985),
[LRU pointer edits](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9694-L9879),
[hash deletion/insertion](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7831-L7977),
[flush collection](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3780-L4008)

Because `MAX_DEPTH` is a compile-time constant, the per-list walk is formally
bounded `O(1)` with respect to an unbounded input model. For maintainers,
“linear walk of up to 1,000 LRU3 nodes, plus unbounded threshold demotions” is
more informative. None of these CPU bounds includes mutex contention, a
suspended allocator's wait, WAL flush latency, or page I/O.

## 12. AOUT audit for a separate lesson

### Structure

The dormant AOUT is one global bounded ghost FIFO. Its node stores only:

```text
VPID of an evicted page
former LRU index
prev / next ghost links
```

It does not retain a BCB, frame, page contents, latch, or dirty generation. The
global structure has a mutex, top/bottom pointers, a free-node list, a
preallocated node array, and hash tables for VPID lookup.
[AOUT structures](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L635-L666)

If enabled by the existing code, its capacity would be:

```text
A = min(floor(B * data_aout_ratio), 32,768)
number of AOUT hash tables = max(floor(A / 1000), 1)
```

All `A` nodes are preallocated. Eviction inserts the ghost at FIFO top; a full
queue recycles the bottom ghost. A reload looks up and removes the VPID through
the hash and returns its former LRU index.
[AOUT initialization and capacity](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5802-L5903),
[ghost insertion](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10468-L10548),
[ghost lookup/removal](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10550-L10636)

### Dormant admission effect

AOUT does not select a victim. It would change the placement of a newly loaded
VOID BCB at first final unfix:

| Current context and AOUT lookup | Existing branch's placement |
|---|---|
| Thread has private LRU; AOUT hit says same private LRU | Current private LRU1 top |
| Thread has private LRU; AOUT miss | Current private LRU2 middle |
| Thread has private LRU; AOUT hit says a different former LRU | Shared LRU2 middle |
| Thread has no private LRU | Shared LRU2 middle |
| Vacuum special path | Private LRU1 top or direct-victim feed, independent of ordinary admission ranking |

[AOUT-sensitive VOID admission](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6994)

This is a recency/history admission heuristic: a page remembered from the same
private domain receives hot placement, a history miss starts colder, and a
cross-domain history hit becomes shared. The former LRU index is not a
transaction ID and does not prove exclusive ownership.

### Disabled state at this baseline

`data_aout_ratio` has default `0.0`, and `prm_tune_parameters()` unconditionally
sets it to zero with the source comment “disable AOUT list until we fix
CBRD-20741.” Initialization then sets `max_count = 0` and returns before node or
hash allocation. Add and lookup helpers immediately return when `max_count <=
0`.
[AOUT parameter](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3463-L3474),
[forced-zero tuning](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L9931-L9987),
[disabled initialization exit](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5816-L5833)

Therefore the active first-final-unfix placement is simpler:

```text
thread has private domain  -> private LRU1 top
thread has no private      -> shared LRU2 middle
```

The source comment describing “LRU + Aout of 2Q” documents retained design
structure, not executable startup behavior at this revision. The code comment
is primary evidence that CBRD-20741 motivated the override; this source-only
audit does not independently establish the historical defect's root cause or
whether merely removing the override would be safe.

## 13. Evidence boundaries and source anomalies

The following limits must survive into the teaching rewrite:

- **Implementation policy, not public contract.** List order, ratios, quota
  formulas, the 1,000-node cap, and direct-victim priorities may change without
  changing the caller-facing fix/unfix contract.
- **No timing claim from source shape.** The complexity table excludes lock,
  scheduler, log, DWB, and storage waits. There is no source-proven maximum time
  until one particular BCB is victimized.
- **Candidate counters and hints are approximate routing data.** Protected BCB
  state, not `count_vict_cand` or `victim_hint` alone, authorizes detach.
- **“Private = one transaction” is imprecise.** Source comments use this
  shorthand, but list association may be shared and the BCB stores no owner ID.
- **Avoid deallocation is not avoid victimization.** The similarly named facts
  solve different problems.
- **The big-private queue has an open source-shape question.** The visible
  producer in `pgbuf_lfcq_get_victim_from_private_lru()` re-enqueues an index it
  has already consumed; this audit did not find a clear initial producer.
  Restricted other-private discovery should not be taught as a proven fairness
  mechanism.
- **The maintenance direct-victim backup is not verified progress.** In the
  pinned `pgbuf_direct_victims_maintenance()` loops, `index` is initialized to
  `start_index` and the loop immediately requires `index != start_index`, so the
  bodies appear skipped. Other provider paths above remain real.
- **AOUT is dormant.** Its retained branches are suitable for a separate
  historical/design lesson, never as the main active path.

[big-private queue source shape](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16416-L16506),
[maintenance backup loops](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9540-L9692)

## 14. Source-review checklist for a replacement change

A replacement-policy patch is safe only if the new preference remains below
these authorization facts:

1. Does INVALID remain the first allocation source?
2. Can only LRU3 be offered to ordinary victim search?
3. Are DIRTY, FLUSHING, direct reservation, positive `fcnt`, any waiter, and
   incompatible latch state rejected?
4. Does the scan avoid blocking on a BCB mutex while holding an LRU mutex?
5. Is eligibility rechecked after the BCB mutex is acquired and again before
   old identity removal?
6. Does every known-node unlink repair top, bottom, zone boundaries, hint,
   counters, and both intrusive links before declaring VOID?
7. Is old VPID hash removal complete before the BCB is rebound?
8. Does the miss-owner protocol still prevent duplicate loads?
9. Is page-header identity checked before the new mapping is published?
10. Can a refix revoke a direct-victim reservation without losing the old page?
11. Does a dirty page become eligible only after WAL-safe successful write
    completion, with re-dirty tracked as a later generation?
12. Are under-quota/private preferences kept separate from hard correctness
    eligibility?
13. Are AOUT claims labeled dormant unless the forced-zero startup path changes
    and the re-enabled code is independently validated?

The hard invariant is not “always choose the oldest page.” It is:

> Reuse a fixed BCB/frame pair only after protected state proves that no caller
> owns or waits for the bytes, no unwritten or in-flight generation would be
> lost, the old identity is detached exactly once, and the new identity is
> published only after its contents and latch ownership are valid.
