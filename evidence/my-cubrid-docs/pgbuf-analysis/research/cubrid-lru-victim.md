# CUBRID Page Buffer — Replacement Policy Fact Sheet (LRU zones, private/shared lists, quota, victim selection, AOUT)

- **Repo**: `/home/vimkim/gh/cb/pgbuf-analysis` (CUBRID 11.5.x)
- **Commit**: `5cd4f860e`
- **Date**: 2026-08-06
- **Primary sources**: `src/storage/page_buffer.c` (17513 lines), `src/storage/page_buffer.h` (521 lines), `src/base/system_parameter.c`, `src/base/perf_monitor.c`
- **Note**: All internal structures (`PGBUF_BCB`, `PGBUF_LRU_LIST`, `PGBUF_AOUT_LIST`, `PGBUF_PAGE_QUOTA`, …) are **private to `page_buffer.c`**; `page_buffer.h` exposes only the API. Every line number below comes from reads performed in this session against commit `5cd4f860e`.

---

## 0. Executive summary of the algorithm

CUBRID's replacement policy is **"LRU + Aout of 2Q"** (`page_buffer.c:635-639`), sharded into many LRU lists, each split into 3 zones, with a per-list *quota* system that partitions the pool between per-session **private** lists and round-robin **shared** lists. Victims are taken from zone 3 (bottom) of a list; threads that cannot find a victim park on one of two priority queues and are **handed** a BCB by whoever frees one (the "direct victim" mechanism).

Three parts of this design are **effectively inert in this build** and are called out in §12: the AOUT ghost list (force-disabled at startup), the "big private lists with victims" queue (never seeded), and `pgbuf_direct_victims_maintenance()` (loop condition false at entry).

---

## 1. `PGBUF_LRU_LIST` — every field

Definition: `page_buffer.c:585-623`. Allocated as one flat array `pgbuf_Pool.buf_LRU_list` (`page_buffer.c:769-772`), sized `PGBUF_TOTAL_LRU_COUNT * PGBUF_LRU_LIST_SIZEOF` (`page_buffer.c:126`, `5715`).

| Field | Line | Meaning |
|---|---|---|
| `pthread_mutex_t mutex` | 588 | Protects list integrity. `SERVER_MODE` only; in SA_MODE `pthread_mutex_lock` is `#define`d away (`page_buffer.c:100-101`). |
| `PGBUF_BCB *top` | 590 | Hottest end. |
| `PGBUF_BCB *bottom` | 591 | Coldest end = victim end. |
| `PGBUF_BCB *bottom_1` | 592 | Last BCB of zone 1. `NULL` iff `count_lru1 == 0`. |
| `PGBUF_BCB *bottom_2` | 593 | Last BCB of zone 2. `NULL` iff `count_lru2 == 0`. |
| `PGBUF_BCB *volatile victim_hint` | 594-596 | Where a victim search starts. Doc comment admits it "is not always the first bcb that can be victimized". |
| `int count_lru1/2/3` | 602-604 | Per-zone BCB counts. Mutated only under list mutex (non-atomic; `page_buffer.c:15820-15822`). |
| `int count_vict_cand` | 607 | Number of zone-3 BCBs with no victim-invalidating flag. Mutated with `ATOMIC_INC_32` (`15646`, `15667`). |
| `int threshold_lru1/2` | 610-611 | Desired zone sizes. Set by `pgbuf_adjust_quotas` only. |
| `int quota` | 614 | Target size — **private lists only**; shared lists keep `quota == 0`. |
| `int tick_list` | 617 | Incremented on add-to-top (`9680-9683`) and add-to-middle (`9768-9771`). Used for "is BCB old enough" ageing. |
| `int tick_lru3` | 618 | Incremented whenever a BCB falls into zone 3 (`10058-10061`). Used to compare victim-hint candidates by zone-3 age. |
| `volatile int flags` | 620 | Only one flag exists: `PGBUF_LRU_VICTIM_LFCQ_FLAG = 0x80000000` (`page_buffer.c:1074`) — "this list is already in a victim queue". |
| `int index` | 622 | Self index; also the value pushed into the lock-free queues. |

Init (all zeroes / NULLs, `index = i`): `page_buffer.c:5724-5746`.

**Per-BCB fields that belong to the replacement policy** (`page_buffer.c:511-543`):

```c
  PGBUF_BCB *prev_BCB;          /* prev LRU chain */
  PGBUF_BCB *next_BCB;          /* next LRU or Invalid(Free) chain */
  int tick_lru_list;            /* age of lru list when this BCB was inserted into. ... */
  int tick_lru3;                /* position in lru zone 3. small numbers are at the bottom. ... */
  volatile int count_fix_and_avoid_dealloc;  /* 1. count fixes up to a threshold (to detect hot pages).
                                              * 2. avoid deallocation count. */
  int hit_age;                  /* age of last hit (used to compute activities and quotas) */
```
(`page_buffer.c:527-539`)

`volatile int flags` (`page_buffer.c:519`) packs **flags + zone + LRU index into one 32-bit word** (see §2, §9).

Sanity checker for zone/bottom_1/bottom_2/count coherency: `pgbuf_lru_sanity_check` `page_buffer.c:16806-16877` (debug builds only).

---

## 2. The three zones

### 2.1 Intent (verbatim design comment, `page_buffer.c:188-196`)

```c
  /* LRU zones explained:
   * 1. This is hottest zone and this is where most fixed/unfixed bcb's are found. We'd like to keep the page unfix
   *    complexity to a minimum, therefore no boost to top are done here. This zone's bcb's cannot be victimized.
   * 2. This is a buffer between the hot lru 1 zone and the victimization lru 3 zone. The buffer zone gives bcb's that
   *    fall from first zone a chance to be boosted back to top (if they are still hot). Victimization is still not
   *    allowed.
   * 3. Third zone is the victimization zone. BCB's can still be boosted if fixed/unfixed, but in aggressive victimizing
   *    systems, non-dirty bcb's rarely survive here.
   */
```

### 2.2 Bit encoding of zone + list id inside `bcb->flags`

`page_buffer.c:178-216`:

- `PGBUF_LRU_NBITS 16` → low 16 bits of `flags` are the **LRU list index**; `PGBUF_LRU_LIST_MAX_COUNT = 65536`, `PGBUF_LRU_INDEX_MASK = 0x0000FFFF` (`180-182`).
- `PGBUF_LRU_1_ZONE = 1<<16 = 0x00010000`, `PGBUF_LRU_2_ZONE = 0x00020000`, `PGBUF_LRU_3_ZONE = 0x00030000`, `PGBUF_LRU_ZONE_MASK = 0x00030000` (`197-201`).
- `PGBUF_INVALID_ZONE = 1<<18 = 0x00040000`, `PGBUF_VOID_ZONE = 2<<18 = 0x00080000`, `PGBUF_ZONE_MASK = 0x000F0000` (`205-211`).
- Accessors: `PGBUF_MAKE_ZONE(list_id, zone)`, `PGBUF_GET_ZONE(flags)`, `PGBUF_GET_LRU_INDEX(flags)` (`214-216`); wrappers `pgbuf_bcb_get_zone` (`15930-15934`), `pgbuf_bcb_get_lru_index` (`15942-15947`).
- A BCB starts life in `PGBUF_INVALID_ZONE`: `#define PGBUF_BCB_INIT_FLAGS PGBUF_INVALID_ZONE` (`265`).
- Non-overlap of the three masks is asserted at startup and **aborts the server** if violated: `pgbuf_flags_mask_sanity_check` `page_buffer.c:16778-16797`, called from `pgbuf_initialize` at `1602`.

Zone transitions are done by `pgbuf_bcb_change_zone (thread_p, bcb, new_lru_idx, new_zone)` (`page_buffer.c:15824-15922`). It CAS-loops so concurrent `pgbuf_bcb_update_flags` cannot be lost:

```c
  do
    {
      old_flags = bcb->flags;
      new_flags = (old_flags & PGBUF_BCB_FLAGS_MASK) | new_zone_idx;
    }
  while (!ATOMIC_CAS_32 (&bcb->flags, old_flags, new_flags));
```
(`page_buffer.c:15841-15851`)

It then decrements the old zone counter (`15872-15891`), increments the new one (`15902-15920`), maintains `monitor.lru_shared_pgs_cnt` (`15867-15870`, `15897-15900`), and adds/removes the BCB as a victim candidate when crossing into/out of zone 3 (`15882-15886`, `15912-15915`).

### 2.3 Zone accounting macros (`page_buffer.c:1000-1018`)

```c
#define PGBUF_IS_BCB_IN_LRU_VICTIM_ZONE(bcb) (pgbuf_bcb_get_zone (bcb) == PGBUF_LRU_3_ZONE)
#define PGBUF_IS_BCB_IN_LRU(bcb) ((pgbuf_bcb_get_zone (bcb) & PGBUF_LRU_ZONE_MASK) != 0)
#define PGBUF_LRU_ZONE_ONE_TWO_COUNT(list) ((list)->count_lru1 + (list)->count_lru2)
#define PGBUF_LRU_LIST_COUNT(list) (PGBUF_LRU_ZONE_ONE_TWO_COUNT(list) + (list)->count_lru3)
```

### 2.4 Zone threshold computation

- `pgbuf_lru_adjust_zone1` (`9833-9876`): while `count_lru1 > threshold_lru1`, walk up from `bottom_1` re-labelling BCBs 1→2, then move `bottom_1`.
- `pgbuf_lru_adjust_zone2` (`9886-9926`): while `count_lru2 > threshold_lru2`, call `pgbuf_lru_fall_bcb_to_zone_3` from `bottom_2` upward.
- `pgbuf_lru_adjust_zones` (`9936-9992`): first drops the combined 1+2 overflow into zone 3 (threshold = `threshold_lru1 + threshold_lru2`, `9944`), then calls `adjust_zone1`. `min_one == true` forces `threshold = MAX(1, threshold)` so zones 1/2 never fully empty (`9945-9948`).
- `pgbuf_lru_fall_bcb_to_zone_3` (`10002-10063`): first *tries to donate the BCB as a direct victim* (see §8), otherwise stamps `bcb->tick_lru3 = lru_list->tick_lru3++` and changes zone.

**Who sets the thresholds** — only `pgbuf_adjust_quotas`:

- **Shared lists** (`page_buffer.c:14414-14422`):
  ```c
  avg_shared_lru_size = (pgbuf_Pool.num_buffers - all_private_quota) / pgbuf_Pool.num_LRU_list;
  avg_shared_lru_size = MAX (avg_shared_lru_size, PGBUF_MIN_SHARED_LIST_ADJUST_SIZE);
  shared_threshold_lru1 = (int) (avg_shared_lru_size * pgbuf_Pool.ratio_lru1);
  shared_threshold_lru2 = (int) (avg_shared_lru_size * pgbuf_Pool.ratio_lru2);
  ```
- **Private lists** (`page_buffer.c:14390-14391`):
  ```c
  lru_list->threshold_lru1 = (int) (new_quota * PGBUF_LRU_ZONE_MIN_RATIO);
  lru_list->threshold_lru2 = (int) (new_quota * PGBUF_LRU_ZONE_MIN_RATIO);
  ```
  `PGBUF_LRU_ZONE_MIN_RATIO = 0.05f` (`page_buffer.c:342`). **`lru_hot_ratio` / `lru_buffer_ratio` do not apply to private lists at all** — private lists are hard-wired to 5 % / 5 % / ~90 % victim zone.

Pool-wide ratios, computed once in `pgbuf_initialize` (`page_buffer.c:1682-1691`):

```c
  pgbuf_Pool.ratio_lru1 = prm_get_float_value (PRM_ID_PB_LRU_HOT_RATIO);
  pgbuf_Pool.ratio_lru2 = prm_get_float_value (PRM_ID_PB_LRU_BUFFER_RATIO);
  pgbuf_Pool.ratio_lru1 = MAX (pgbuf_Pool.ratio_lru1, PGBUF_LRU_ZONE_MIN_RATIO);
  pgbuf_Pool.ratio_lru1 = MIN (pgbuf_Pool.ratio_lru1, PGBUF_LRU_ZONE_MAX_RATIO);
  pgbuf_Pool.ratio_lru2 = MAX (pgbuf_Pool.ratio_lru2, PGBUF_LRU_ZONE_MIN_RATIO);
  pgbuf_Pool.ratio_lru2 = MIN (pgbuf_Pool.ratio_lru2, 1.0f - PGBUF_LRU_ZONE_MIN_RATIO - pgbuf_Pool.ratio_lru1);
```

Defaults ⇒ shared list is 40 % zone 1, 5 % zone 2, 55 % zone 3 (see §10).

---

## 3. Shared vs private lists

### 3.1 Counts

- **Shared** — `pgbuf_initialize_lru_list` (`page_buffer.c:5693-5749`):
  1. `num_LRU_list = prm_get_integer_value (PRM_ID_PB_NUM_LRU_CHAINS)` (`5698`).
  2. If 0 (the default) ⇒ `num_LRU_list = MAX_NTRANS` (`5702`), i.e. `css_get_max_conn() + 1` (`src/transaction/log_common_impl.h:51-52`).
  3. Then capped so each shared list has ≥ `PGBUF_MIN_PAGES_IN_SHARED_LIST` (1000) pages: `num_LRU_list = num_buffers / 1000` (`5705-5708`, constant at `1027`).
  4. Floored at 4 (`5711`).
- **Private** — `pgbuf_initialize_page_quota_parameters` (`page_buffer.c:13884-13922`):
  - `num_private_LRU_list = prm_get_integer_value (PRM_ID_PB_NUM_PRIVATE_CHAINS)` (`13897`).
  - `-1` (default) ⇒ `MAX_NTRANS + VACUUM_MAX_WORKER_COUNT` (`13901`); `VACUUM_MAX_WORKER_COUNT = 50` (`src/query/vacuum.h:132`).
  - `0` ⇒ quota system disabled (`13903-13906`).
  - otherwise floored at `PGBUF_PRIVATE_LRU_MIN_COUNT` = 4 (`13910-13914`, constant `1023`).
  - **SA_MODE: always 0** (`13918`) ⇒ standalone utilities never use private lists.
- Layout & index arithmetic (`page_buffer.c:1048-1056`): shared occupy `[0, num_LRU_list)`, private occupy `[num_LRU_list, total)`. `PGBUF_PAGE_QUOTA_IS_ENABLED ≡ num_private_LRU_list > 0` (`1030`).

### 3.2 Thread → private list mapping (**not** the thread index)

The private list index lives on the **session**, and is copied into the thread entry:

- `pgbuf_assign_private_lru` (`page_buffer.c:14454-14538`) picks a list by: (1) among lists with **zero sessions**, the one with the fewest BCBs; else (2) the least-activity list (`14475-14505`); then bumps `private_lru_session_cnt` with a 5-retry race loop (`14518-14529`).
- Called at session creation: `src/session/session.c:740`. Released at session teardown: `src/session/session.c:406-407` → `pgbuf_release_private_lru` (`page_buffer.c:14547-14561`), which zeroes that list's activity.
- Copied to the worker: `src/session/session.c:2800` (`thread_p->private_lru_index = session_p->private_lru_index`), and per-request in `src/connection/server_support.c:2081`, `2117`.
- **Vacuum workers get their own private lists** at boot: `src/query/vacuum.c:1270` (`vacuum_Workers[i].private_lru_index = pgbuf_assign_private_lru (thread_p)`), propagated at `src/query/vacuum.c:881`. Vacuum **master** has none (`src/query/vacuum.c:1250`).
- Threads with no session: `-1` (`src/thread/thread_entry.cpp:90`, `src/thread/thread_entry_task.cpp:75`, `95`).
- Enable flag: `pgbuf_thread_variables_init` (`page_buffer.c:1496-1515`) sets `thread_p->m_is_private_lru_enabled = (num_private_LRU_list > 0 && private_lru_index != -1)`; queried through `PGBUF_THREAD_HAS_PRIVATE_LRU` (`1038-1042`).

### 3.3 Which list/zone does a newly-read page enter?

A freshly claimed BCB is in `PGBUF_VOID_ZONE`, not in any list — set either when taken from the invalid list (`page_buffer.c:8891`) or when removed from an LRU list for victimization (`10356`). It only joins a list **at its first unfix**, in `pgbuf_unlatch_void_zone_bcb` (`page_buffer.c:6844-6939`):

1. If AOUT is enabled, look the VPID up in AOUT and *remove* it, obtaining `aout_list_id` (`6852-6856`).
2. If the unfixer is a vacuum worker (`PGBUF_VACUUM_SHOULD_IGNORE_UNFIX`, `283`): try to donate the BCB straight to a waiting thread as a direct victim (`6871-6885`); if that succeeds, the BCB never enters any list. Otherwise force `aout_list_id = PGBUF_AOUT_NOT_FOUND` (`6888`).
3. If the thread has a private list (`6902`):
   - vacuum worker ⇒ private **TOP** (`6907`);
   - `!aout_enabled` **or** AOUT hit in *my own* private list ⇒ private **TOP** (`6912-6919`);
   - AOUT miss ⇒ private **MIDDLE** (`6921-6928`);
   - AOUT hit belonging to *another* list ⇒ fall through to shared.
4. Otherwise ⇒ shared **MIDDLE**, list chosen by `pgbuf_get_shared_lru_index_for_add()` (`6933`).

Because AOUT is disabled in this build (§12.1), branch 3 always resolves to **private TOP**.

The temp-file fast path inserts immediately at fix time instead: `pgbuf_simple_fix` (`page_buffer.c:2689-2698`) → private **TOP**, or shared **MIDDLE** if no private list.

`pgbuf_get_shared_lru_index_for_add` (`page_buffer.c:8937-9008`) is round-robin over an atomically incremented counter (`8946`), but every `MAX(2*num_buffers/num_LRU_list, 10000)` calls it re-scans all shared lists and records the biggest as `avoid_shared_lru_idx` when `max > 1.3*avg` or `max > 2*min` (`8940-8994`); the round-robin then skips that list once (`9000-9004`).

### 3.4 The three insertion primitives

| Function | Line | Behaviour |
|---|---|---|
| `pgbuf_lru_add_bcb_to_top` | 9646-9686 | Link before `top`; if zone 1 empty set `bottom_1 = bcb`; `tick_list++`; zone := 1. |
| `pgbuf_lru_add_bcb_to_middle` | 9696-9774 | Insert **after `bottom_1`** (i.e. head of zone 2); if zone 1 empty, insert at top instead; if zone 2 empty set `bottom_2 = bcb`; `tick_list++`; zone := 2. |
| `pgbuf_lru_add_bcb_to_bottom` | 9784-9823 | Append after `bottom`; **`tick_lru3` is set one *lower* than the current bottom's** (`9800`, `9810-9811`) so the new BCB looks oldest; wraps negatives by `+DB_INT32_MAX` (`9817-9820`); zone := 3. |

Public wrappers add locking + zone re-adjustment and stamp `bcb->tick_lru_list = lru_list->tick_list`: `pgbuf_lru_add_new_bcb_to_top` (`10147-10173`, then `adjust_zones`), `..._to_middle` (`10183-10205`, then `adjust_zone2`), `..._to_bottom` (`10215-10241`). The bottom variant first tries `pgbuf_assign_direct_victim` and skips list insertion entirely if a waiter takes it (`10223-10228`).

Removal: `pgbuf_remove_from_lru_list` (`10303-10357`, caller must hold list mutex) fixes up `top/bottom/bottom_1/bottom_2`, advances the victim hint **after** unlinking (`10350-10353`), and sets zone to `PGBUF_VOID_ZONE` (`10356`). `pgbuf_lru_remove_bcb` (`10250-10269`) is the locking wrapper.

---

## 4. Promotion / boost

All boost decisions live in the unfix path `pgbuf_unlatch_bcb_upon_unfix` (`page_buffer.c:6605-6832`), inside `if (is_zero_fcnt)` and only when there were no blocked readers/writers (`6662`, `6674`). Order of checks:

1. `pgbuf_bcb_should_be_moved_to_bottom_lru(bufptr)` (deallocated page) ⇒ `pgbuf_move_bcb_to_bottom_lru` (`6670-6673`).
2. Switch on zone (`6691-6799`):

| Zone | Action | Line |
|---|---|---|
| `VOID` | `pgbuf_unlatch_void_zone_bcb` (§3.3) | 6694-6699 |
| `LRU_1` | **never moved.** Vacuum/temp: nothing. Else: maybe private→shared, else just `pgbuf_bcb_register_hit_for_lru` | 6701-6727 |
| `LRU_2` | Vacuum/temp: nothing. Else: maybe private→shared; boost **only if `PGBUF_IS_BCB_OLD_ENOUGH`**; register hit | 6729-6764 |
| `LRU_3` | Vacuum/temp: **donate as direct victim** if possible, else nothing. Else: maybe private→shared; **always boost**; register hit | 6766-6793 |

Ageing test (`page_buffer.c:1004-1009`):

```c
#define PGBUF_AGE_DIFF(bcb_age,list_age) \
  (((list_age) >= (bcb_age)) ? ((list_age) - (bcb_age)) : (DB_INT32_MAX - ((bcb_age) - (list_age))))
#define PGBUF_IS_BCB_OLD_ENOUGH(bcb, lru_list) \
  (PGBUF_AGE_DIFF ((bcb)->tick_lru_list, (lru_list)->tick_list) >= ((lru_list)->count_lru2 / 2))
```

`pgbuf_lru_boost_bcb` (`page_buffer.c:10072-10137`) carries the authoritative rule list (`10084-10097`) — no boost in zone 1 (lock avoidance + no victimization risk), no boost for new/cold BCBs (a page fixed twice in quick succession must not be promoted), always boost from zone 3. It asserts `zone != PGBUF_LRU_1_ZONE` (`10099`), increments the appropriate `PSTAT_PB_UNFIX_LRU_{TWO,THREE}_{PRV,SHR}_TO_TOP` counter (`10102-10111`), then under list mutex: remove → add to top → `adjust_zone1` (if it came from zone 2) or full `adjust_zones` (if from zone 3) (`10114-10136`).

Vacuum / temporary-volume suppression (`page_buffer.c:282-293`):

```c
#define PGBUF_VACUUM_SHOULD_IGNORE_UNFIX(th) VACUUM_IS_THREAD_VACUUM_WORKER (th)
#define PGBUF_SHOULD_IGNORE_UNFIX(th, buf) VACUUM_IS_THREAD_VACUUM_WORKER (th) || pgbuf_is_temporary_volume (buf->vpid.volid)
```

**Private → shared migration** — `pgbuf_should_move_private_to_shared` (`page_buffer.c:6950-6983`), two conditions:
1. the BCB sits in a private list that is **not the unfixer's** (`6966-6969`) — i.e. it is shared by >1 session;
2. the BCB is **hot** (`pgbuf_bcb_is_hot`) **and** old enough (`6971-6980`).

`pgbuf_bcb_is_hot` (`16296-16301`) tests `count_fix_and_avoid_dealloc >= (PGBUF_FIX_COUNT_THRESHOLD << 16)`, i.e. ≥ 64 fixes (`page_buffer.c:106`, `268`); the counter saturates at that threshold (`pgbuf_bcb_register_fix`, `16275-16288`).

`pgbuf_lru_move_from_private_to_shared` (`10278-10293`) removes the BCB and re-inserts it into the **middle** of a round-robin shared list, then registers a hit. Source comment: *"from statistics analysis, moves from private to shared are very rare, so we don't inline the function"* (`10284`). There is **no shared → private migration path.**

---

## 5. Quota system

### 5.1 Structures

`PGBUF_PAGE_MONITOR` (`page_buffer.c:693-713`): `dirties_cnt`, `int *lru_hits` (per list, since last adjust), `int *lru_activity` (per list, smoothed), `lru_shared_pgs_cnt`, `lru_victim_req_cnt`, `bool victim_rich`.

`PGBUF_PAGE_QUOTA` (`page_buffer.c:716-736`): `num_private_LRU_list`, `float *lru_victim_flush_priority_per_lru`, `int *private_lru_session_cnt`, `float private_pages_ratio`, `add_shared_lru_idx`, `avoid_shared_lru_idx`, `last_adjust_time`, `adjust_age`, `is_adjusting`.

Allocation/init: `pgbuf_initialize_page_quota` (`13928-13982`), `pgbuf_initialize_page_monitor` (`13988-14054`).

Activity bounds (`page_buffer.c:271-277`):
```c
#define PGBUF_TRAN_THRESHOLD_ACTIVITY (pgbuf_Pool.num_buffers / 4)
#define PGBUF_TRAN_MAX_ACTIVITY (10 * PGBUF_TRAN_THRESHOLD_ACTIVITY)
```

### 5.2 How activity is tracked

`pgbuf_bcb_register_hit_for_lru` (`page_buffer.c:16534-16544`):

```c
  if (bcb->hit_age < pgbuf_Pool.quota.adjust_age)
    {
      pgbuf_Pool.monitor.lru_hits[pgbuf_bcb_get_lru_index (bcb)]++;
      bcb->hit_age = pgbuf_Pool.quota.adjust_age;
    }
```

⇒ **a given BCB contributes at most one hit per quota-adjust epoch**, and the increment is a plain non-atomic `++`. Called from the zone-1/2/3 unfix arms (`6726`, `6763`, `6792`), from `pgbuf_unlatch_void_zone_bcb` (`6917`, `6926`, `6937`), and from private→shared migration (`10292`).

### 5.3 `pgbuf_adjust_quotas` (`page_buffer.c:14195-14447`) step by step

1. Bail out if quota disabled or another thread is adjusting (`14233-14236`); set `is_adjusting = 1` (`14238`).
2. Bail out if < 1 ms since `last_adjust_time` (`14242-14247`).
3. Bail out unless total unfixes ≥ `PGBUF_TRAN_THRESHOLD_ACTIVITY` (= `num_buffers/4`) **or** ≥ 500 ms elapsed (`14254-14258`). Comment at `14249-14253` also mentions a 5-minute/1 % rule.
4. `low_overall_activity` if unfixes < threshold/100 (`14259-14262`).
5. `adjust_age++` (`14266`) — this is what re-arms per-BCB hit counting.
6. For every list: `lru_hits = ATOMIC_TAS_32(&monitor->lru_hits[i], 0)`, converted to hits/second (`14276-14278`). For private lists, `lru_activity[i]` is an EMA with a 10-second window (`14285-14295`); sums are accumulated into `sum_private_lru_activity_total`, `lru_private_hits`, `lru_shared_hits` (`14297-14306`); `total_victims += count_vict_cand` (`14309`).
7. `private_ratio = private_hits / (private_hits + shared_hits)`, clamped to `[MIN_PRIVATE_RATIO 0.01, MAX_PRIVATE_RATIO 0.998]` (`14198-14199`, `14320-14323`), or forced to 0.01 when `low_overall_activity` (`14315`). `quota->private_pages_ratio` is itself EMA-smoothed over 10 s (`14325-14334`).
8. If **no** private activity: every private list gets `quota = threshold_lru1 = threshold_lru2 = 0`, zones are re-adjusted under mutex, and lists with candidates are pushed to the victim queue (`14336-14364`).
9. Else `all_private_quota = (num_buffers - invalid_cnt) * private_pages_ratio` (`14369-14370`), and each private list gets
   ```c
   new_quota = (int) (new_lru_ratio * all_private_quota);           /* activity share */
   new_quota = MIN (new_quota, PGBUF_PRIVATE_LRU_MAX_HARD_QUOTA);   /* 5000 */
   new_quota = MIN (new_quota, pgbuf_Pool.num_buffers / 2);
   ```
   (`14384-14386`; constant `PGBUF_PRIVATE_LRU_MAX_HARD_QUOTA 5000` at `1024`), plus the 5 %/5 % zone thresholds (`14390-14391`).
10. If zones 1+2 exceed quota ⇒ `pgbuf_lru_adjust_zones` under list mutex — **this is the shrink mechanism**: excess BCBs are relabelled into zone 3 and thereby become victim candidates (`14393-14400`).
11. If the list has candidates **and** is over quota ⇒ `pgbuf_lfcq_add_lru_with_victims` (`14401-14409`).
12. Shared thresholds are recomputed and shared lists likewise pushed to the victim queue if they have candidates (`14413-14440`).
13. `monitor.victim_rich = total_victims >= 0.1 * num_buffers` (`14442-14444`).

### 5.4 Who calls it and how often

- **`pgbuf-maintain` daemon**, every **100 ms**: `pgbuf_page_maintenance_execute` (`16930-16943`) calls `pgbuf_adjust_quotas` then `pgbuf_direct_victims_maintenance`; looper period at `pgbuf_page_maintenance_daemon_init` (`17091`).
- `pgbuf_assign_private_lru` (`14536`) and `pgbuf_release_private_lru` (`14557`) — both marked `/* TODO: is this necessary? */`.

### 5.5 Consequences of being over quota

- **Own list first**: a thread may only victimize from its own private list if `PGBUF_LRU_LIST_IS_ONE_TWO_OVER_QUOTA` **or** (`IS_OVER_QUOTA` and it has candidates) (`page_buffer.c:9067-9068`).
- **Punishment**: after failing in its own over-quota list, a non-vacuum thread sets `restrict_other = PGBUF_LRU_LIST_IS_OVER_QUOTA_WITH_BUFFER(lru_list)` (`9098`), where the buffer is `MAX(10, 1 % of quota)` (`1067-1069`). That restricts step 2 to "big" private lists (§7.4).
- **Flush targeting**: `pgbuf_compute_lru_vict_target` (`14062-14185`) targets *everything beyond 90 % of quota*, clipped to `count_lru3`:
  ```c
  this_prv_target = PGBUF_LRU_LIST_COUNT (lru_list) - (int) (lru_list->quota * 0.9);
  this_prv_target = MIN (this_prv_target, lru_list->count_lru3);
  ```
  (`14102-14103`, repeated `14165-14166`). Private/shared flush split is derived from `private_pages_ratio` vs the *real* private share (`14084-14092`, `14140`). There is an `assert(false)` backup branch for the case where neither privates nor shared can be victimized (`14122-14137`).
- **Victim-queue eligibility**: a private list only enters the lock-free victim queues when it is over quota (`15647`, `16417`); shared lists always qualify.

---

## 6. AOUT ghost list

### 6.1 Structures

`page_buffer.c:635-666`. `PGBUF_AOUT_BUF` = `{ VPID vpid; int lru_idx; next; prev; }` (`641-647`). `PGBUF_AOUT_LIST` (`650-666`) = mutex + `Aout_top`/`Aout_bottom` (FIFO) + `Aout_free` + preallocated `bufarray` + `num_hashes` + `MHT_TABLE **aout_buf_ht` + `max_count`.

### 6.2 Capacity

`pgbuf_initialize_aout_list` (`page_buffer.c:5756-5853`):
- `max_count = num_buffers * prm_get_float_value (PRM_ID_PB_AOUT_RATIO)` (`5765-5767`);
- `aout_ratio <= 0` ⇒ `max_count = 0`, feature off (`5775-5780`);
- capped by `PGBUF_LIMIT_AOUT_BUFFERS = 32768` ("limit Aout size to equivalent of 512M") (`5759`, `5782`);
- `num_hashes = MAX(max_count / AOUT_HASH_DIVIDE_RATIO, 1)` with `AOUT_HASH_DIVIDE_RATIO 1000` (`5809`, `934`); bucket selection `AOUT_HASH_IDX(vpid, list) = vpid->pageid % list->num_hashes` (`935`) — **volid is ignored in bucket choice**.
- `PGBUF_AOUT_NOT_FOUND = -2` (`279`).

### 6.3 What is recorded, and when

`pgbuf_add_vpid_to_aout_list (thread_p, vpid, lru_idx)` (`page_buffer.c:10415-10486`) stores the **VPID plus the LRU index the page was evicted from**. If the free list is exhausted it recycles the AOUT **bottom** (oldest), also removing it from the hash (`10436-10451`); new entries go to `Aout_top` (`10467-10483`).

Call sites (all are "this BCB left the pool"):
- successful victim search: `page_buffer.c:9417`
- BCB donated as direct victim while falling to zone 3: `10040`
- direct victim consumed by its waiter: `15582`
- vacuum donating a void-zone BCB: `6882`

### 6.4 Lookup on re-read

`pgbuf_remove_vpid_from_aout_list` (`page_buffer.c:10496-10574`): hash lookup, unlink, return the stored `lru_idx` (or `PGBUF_AOUT_NOT_FOUND`), and recycle the node to the free list. It is called **exactly once**, at `6855`, and its result drives the insertion decision in §3.3: same-private-list hit ⇒ TOP, miss ⇒ MIDDLE, other-list hit ⇒ shared MIDDLE.

`pgbuf_remove_private_from_aout_list` (`10582-10659`) purges all AOUT entries of one LRU index — **declared at `1160`, defined at `10583`, never called** (dead code).

### 6.5 AOUT is disabled in this build

`src/base/system_parameter.c:9985-9986`, inside `prm_tune_parameters()` (`9941-9943`, guarded by `#if defined (SA_MODE) || defined (SERVER_MODE)`):

```c
  /* disable AOUT list until we fix CBRD-20741 */
  prm_set (pb_aout_ratio_prm, "0", false);
```

`prm_tune_parameters()` is called from `sysprm_load_and_init_internal` at `src/base/system_parameter.c:6260`, i.e. **after** the config file has been parsed and defaults applied (`6240-6250`). Therefore setting `data_aout_ratio` in `cubrid.conf` has no effect on a server or SA process: `buf_AOUT_list.max_count` is always 0, `aout_enabled` is always false at `page_buffer.c:6852`, and every AOUT function short-circuits (`10425-10428`, `10506-10510`, `10590-10594`).

---

## 7. Victim selection end-to-end

### 7.1 Entry point: `pgbuf_allocate_bcb` (`page_buffer.c:8134-8335`)

Design comment `8149-8168`. Steps:
1. `pgbuf_get_bcb_from_invalid_list` (`8172`; impl `8858-8896`, bumps `PSTAT_PB_VICTIM_USE_INVALID_BCB` and sets zone VOID).
2. `pgbuf_get_victim` (`8185`).
3. On failure, `SERVER_MODE` with a flush daemon ⇒ park on a waiter queue (§8); otherwise (SA_MODE / recovery) ⇒ `pgbuf_wakeup_page_flush_daemon` then retry `pgbuf_get_victim`, with `assert (bufptr != NULL)` (`8302-8312`).
4. `pgbuf_victimize_bcb` (`8318`; impl `8586-8631`) re-verifies victimizability, clears `TO_VACUUM`, deletes from the hash chain, and marks the latch `PGBUF_LATCH_INVALID`.
5. If still NULL ⇒ `ER_PB_ALL_BUFFERS_DIRTY` (`8326-8330`).

### 7.2 `pgbuf_get_victim` (`page_buffer.c:9019-9197`)

Design comment `9037-9057`. It first bumps `monitor.lru_victim_req_cnt` (`9035`) — this is the "miss" side of the hit-ratio used by the flush daemon.

1. **Own private list**, only if over quota (`9060-9101`) → `pgbuf_get_victim_from_lru_list`. On failure, sets `restrict_other` for non-vacuum threads (`9093-9099`) and `searched_own = true`.
2. **Another private list** — `pgbuf_lfcq_get_victim_from_private_lru (thread_p, restrict_other)` (`9109-9128`), only if quota enabled **and a flush daemon exists**.
3. **A shared list** — loop over `pgbuf_lfcq_get_victim_from_shared_lru` (`9146-9162`). In multi-threaded mode the loop runs exactly once; in single-threaded mode it retries while the shared queue is non-empty, bounded by both a consumer-cursor delta and `nloops <= num_LRU_list` (`9160-9162`).
4. **Fallback**: if the thread has a private list and step 1 was skipped, search it *even under quota* (`9174-9191`). Comment (`9054-9056`): added because a case was found where all private lists sat just below quota and shared lists had no zone 3 at all.

Note the asymmetry: `victim_rich` is discussed in the comment as a loop condition (`9050`) but the implemented loop at `9146-9162` keys off `has_flush_thread` and queue state, not `victim_rich`.

### 7.3 `pgbuf_get_victim_from_lru_list` (`page_buffer.c:9267-9482`)

`MAX_DEPTH 1000` (`9271`).

1. Lock-free early out if `count_vict_cand == 0` (`9289-9293`).
2. Take list mutex; bail if `bottom == NULL` or bottom is not in zone 3 (`9296-9302`).
3. If this is a private list with zones 1+2 over quota ⇒ `pgbuf_lru_adjust_zones(..., false)` first, manufacturing candidates (`9304-9308`).
4. Re-read `count_vict_cand`; bail if ≤ 0 (`9311-9319`).
5. If the bottom is clean but the hint points elsewhere, snap the hint to the bottom (`9321-9333`).
6. Scan **upward** from `victim_hint` (or `bottom` if NULL) via `prev_BCB`, stopping at zone-3 boundary or `MAX_DEPTH` (`9340-9351`).
7. Per BCB:
   - `pgbuf_bcb_avoid_victim(bufptr)` (dirty / flushing / already-a-direct-victim) ⇒ `continue` (`9354-9358`).
   - fixed by someone (`pgbuf_is_bcb_fixed_by_any`) ⇒ still counts as a candidate; the *first* such BCB becomes the new hint via CAS (`9361-9385`), and an early-out triggers once `found_victim_cnt >= lru_victim_cnt`.
   - else `PGBUF_BCB_TRYLOCK` (conditional because the list mutex is already held, `9387-9389`); if `pgbuf_is_bcb_victimizable(bufptr, true)`:
     - advance the hint to `bufptr->prev_BCB` (`9393-9397`),
     - `pgbuf_remove_from_lru_list` (`9398`),
     - **hack** (`9401-9407`): if the low-priority waiter queue holds ≥ `5 + thread_num_total_threads()/20` threads, run `pgbuf_panic_assign_direct_victims_from_lru` from `bufptr->prev_BCB`,
     - if the new bottom is dirty, wake the flush daemon (`9409-9414`),
     - unlock list, `pgbuf_add_vpid_to_aout_list` (`9417`), return the BCB **locked**.
   - trylock failure ⇒ treat like "fixed": record as candidate/hint and keep scanning (`9426-9449`).
8. On overall failure: bump `PSTAT_PB_VICTIM_GET_FROM_LRU_FAIL`; if there was a hint but nothing was found, bump `..._BAD_HINT` and reset the hint to `bottom` (or NULL) (`9452-9468`); unlock; **wake the flush daemon** (`9473`).

Victimizability predicates: `pgbuf_is_bcb_victimizable` (`9237-9256`) = `!pgbuf_bcb_avoid_victim` **and** `!pgbuf_is_bcb_fixed_by_any`; `pgbuf_is_bcb_fixed_by_any` (`9209-9228`) also rejects BCBs with a non-empty `next_wait_thrd` list (comment `9218-9220` accepts occasionally losing a good BCB rather than scanning the waiter list).

### 7.4 The lock-free circular queues

Three `lockfree::circular_queue<int>` of LRU indexes (`page_buffer.c:821-823`), each sized 2× the corresponding list count (`1818`, `1827`, `1837`); the private pair only exists when quota is enabled (`1815-1834`).

**Producer** — `pgbuf_lfcq_add_lru_with_victims` (`16311-16348`): CAS-sets `PGBUF_LRU_VICTIM_LFCQ_FLAG` on the list first so two threads cannot double-insert, then pushes to `private_lrus_with_victims` or `shared_lrus_with_victims`; on push failure it clears the flag again (`16343`). Called from `pgbuf_lru_add_victim_candidate` (`15649`, only for shared lists or over-quota private lists — `15647`) and from `pgbuf_adjust_quotas` (`14358`, `14404`, `14434`).

**Private consumer** — `pgbuf_lfcq_get_victim_from_private_lru` (`16357-16440`):
1. try `big_private_lrus_with_victims` (`16374`);
2. else if `restricted` ⇒ return NULL (`16382-16385`);
3. else `private_lrus_with_victims` (`16387-16392`);
4. re-queue to *big* immediately if `count > PBGUF_BIG_PRIVATE_MIN_SIZE (100)` **and** `count > 2*quota` **and** `count_vict_cand > 1` (`16397-16405`, constant at `1071`);
5. search the list (`16408`);
6. otherwise re-queue to the private queue if it still has candidates and is over quota (`16417-16423`);
7. else clear `PGBUF_LRU_VICTIM_LFCQ_FLAG` with a plain non-atomic `&=` (`16431-16435`), accepting a documented race that `pgbuf_adjust_quotas` will repair.

**Shared consumer** — `pgbuf_lfcq_get_victim_from_shared_lru` (`16449-16512`): consume, search, retry once if single-threaded and candidates remain (`16475-16479`), re-queue if `multi_threaded || victim != NULL` and candidates remain (`16481-16495`), else clear the flag (`16503-16507`).

**Victim-candidate bookkeeping**: `pgbuf_lru_add_victim_candidate` (`15609-15655`) also updates the hint under a CAS loop, replacing the current hint only when the new BCB is *younger in zone 3* (`15625-15642`). `pgbuf_lru_remove_victim_candidate` (`15663-15672`) only decrements the counter — *it cannot remove the list from the queue* ("we just hope that this does not happen too often"). `pgbuf_lru_advance_victim_hint` (`15686-15713`) forces the hint to be NULL or a zone-3 BCB, and restarts from `bottom` when candidates still exist.

---

## 8. Direct victim mechanism

### 8.1 Structures

`page_buffer.c:738-752`:
```c
struct pgbuf_direct_victim
{
  PGBUF_BCB **bcb_victims;
  lockfree::circular_queue<THREAD_ENTRY *> *waiter_threads_high_priority;
  lockfree::circular_queue<THREAD_ENTRY *> *waiter_threads_low_priority;
};
#define PGBUF_FLUSHED_BCBS_BUFFER_SIZE (8 * 1024)   /* 8k */
```
`bcb_victims` is indexed by `thread_p->index`. `pgbuf_Pool.flushed_bcbs` is a separate queue of flushed BCBs (`819`, allocated `1806`).

### 8.2 The waiting thread's story (`pgbuf_allocate_bcb`, `8192-8300`)

1. `high_priority = high_priority || VACUUM_IS_THREAD_VACUUM (thread_p) || pgbuf_is_thread_high_priority (thread_p)` (`8196`; the latter, `11677`, covers threads holding very hot pages — b-tree roots, heap/file/volume headers per the comment at `8156-8157`).
2. Build a timeout from `pgbuf_latch_timeout_msecs = 300 * 1000` ms (`107`, `8199`).
3. `thread_lock_entry`, assert its victim slot is empty (`8201-8203`).
4. Push to the high- or low-priority queue (`8206-8246`). If the low-priority queue push fails — a real observed case where a consumer was preempted ~93 ms (`8224-8233`) — the thread is pushed onto the **high**-priority queue instead.
5. `pgbuf_wakeup_page_flush_daemon` (`8250`) — "make sure at least flush will feed us with bcb's".
6. `thread_suspend_timeout_wakeup_and_unlock_entry (..., THREAD_ALLOC_BCB_SUSPENDED)` (`8254`).
7. On `THREAD_ALLOC_BCB_RESUMED`, `pgbuf_get_direct_victim` (`8264`). If it returns NULL (the page was re-fixed in the meantime) the thread **retries as high priority** (`8265-8270`).
8. On interrupt/shutdown, any already-assigned BCB is "unassigned" by clearing both direct-victim flags (`8278-8284`).

There is an explicit acknowledged vulnerability in the header comment (`8160-8164`): nothing guarantees a waiter is fed; the "victim rich hack" is cited as the current mitigation.

### 8.3 The donor's story: `pgbuf_assign_direct_victim` (`page_buffer.c:15364-15421`)

Preconditions (asserted): caller holds the BCB mutex, BCB is not already a direct victim, not dirty, not fixed (`15376-15379`). `PGBUF_BCB_FLUSHING_TO_DISK_FLAG` **is** allowed because flush calls this too (`15374-15375`, `15383-15384`).

```c
  while (pgbuf_get_thread_waiting_for_direct_victim (waiter_thread))
    { ...
      thread_wakeup_already_had_mutex (waiter_thread, THREAD_ALLOC_BCB_RESUMED);
      pgbuf_bcb_update_flags (thread_p, bcb, PGBUF_BCB_VICTIM_DIRECT_FLAG, PGBUF_BCB_FLUSHING_TO_DISK_FLAG);
      pgbuf_Pool.direct_victims.bcb_victims[waiter_thread->index] = bcb;
      ...
      return true;
    }
```
(`page_buffer.c:15388-15415`; waiters whose `resume_status != THREAD_ALLOC_BCB_SUSPENDED` are skipped, `15394-15399`.)

Waiter selection — `pgbuf_get_thread_waiting_for_direct_victim` (`15501-15525`): **every 4th call serves the low-priority queue first** (`15508-15514`) to prevent starvation; otherwise high then low.

Consumption — `pgbuf_get_direct_victim` (`15533-15588`): `ATOMIC_TAS_ADDR` the slot; if `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG` is set, clear it and return NULL (`15544-15550`); clear `PGBUF_BCB_VICTIM_DIRECT_FLAG` (`15555`); if still in an LRU zone, remove from the list and add the VPID to AOUT (`15565-15584`); assert zone is now VOID.

**The re-fix race** (comment `page_buffer.c:228-233`): a worker may fix a page that is already an assigned direct victim. Fix paths therefore swap `VICTIM_DIRECT → INVALIDATE_DIRECT_VICTIM`, e.g. `pgbuf_simple_fix` `2706-2710`; the waiter then discovers NULL and re-queues.

### 8.4 All donors of direct victims

| Donor | Line | Stat |
|---|---|---|
| Post-flush daemon: `pgbuf_assign_flushed_pages` | 15431-15493 | `PSTAT_PB_VICTIM_ASSIGN_DIRECT_FLUSH` (`15470`) |
| Flush collector: `pgbuf_get_victim_candidates_from_lru` (one per iteration) | 3782-3793 | `PSTAT_PB_VICTIM_ASSIGN_DIRECT_SEARCH_FOR_FLUSH` (`3790`) |
| Zone fall: `pgbuf_lru_fall_bcb_to_zone_3` | 10007-10052 | `PSTAT_PB_VICTIM_ASSIGN_DIRECT_ADJUST` (`10032`) |
| Vacuum unfix in zone 3 | 6769-6776 | `PSTAT_PB_VICTIM_ASSIGN_DIRECT_VACUUM_LRU` (`6774`) |
| Vacuum unfix in void zone | 6871-6885 | `PSTAT_PB_VICTIM_ASSIGN_DIRECT_VACUUM_VOID` (`6876`) |
| `pgbuf_lru_add_new_bcb_to_bottom` | 10223-10228 | none ("TODO: add stat. this is actually not used for now") |
| Panic: `pgbuf_panic_assign_direct_victims_from_lru` | 9493-9549 | `PSTAT_PB_VICTIM_ASSIGN_DIRECT_PANIC` (`9541`) |

`pgbuf_assign_flushed_pages` deliberately declines a flushed BCB when it is hot (not zone 3) or belongs to a **private list under quota** (`15456-15464`), giving the owning session a second chance; it always clears `FLUSHING_TO_DISK` afterwards (`15481`).

`pgbuf_panic_assign_direct_victims_from_lru` (`9493-9549`) walks up to `MAX_DEPTH 1000` BCBs from a start point, trylocking each, and stops as soon as there are no more waiters (`9531-9536`). Its own comment says "statistics shows not useful" (`9501`). Called from `pgbuf_get_victim_from_lru_list` (`9405`) and `pgbuf_lfcq_assign_direct_victims` (`9614`, `9629`).

`pgbuf_lfcq_assign_direct_victims` (`9602-9635`) takes one list, panics-assigns from the hint, and if that yields nothing while candidates exist, resets the hint to `bottom` and retries (`9615-9630`).

### 8.5 Flush-daemon interaction

- `pgbuf_wakeup_page_flush_daemon` (`11619-11638`): in `SERVER_MODE` just `pgbuf_Page_flush_daemon->wakeup()`; in SA_MODE it performs the flush inline.
- The flush daemon keeps looping while `pgbuf_keep_victim_flush_thread_running()` (`15349-15353`) = *any thread waiting for a direct victim* **or** *hit ratio low*. `pgbuf_is_hit_ratio_low` (`16567-16579`) targets 99.9 %: `lru_victim_req_cnt > 10 && lru_victim_req_cnt * 1000 > total fix requests`.
- Daemon periods: page-flush uses `page_flush_interval_in_msecs` (`16908-16926`, `17109`); post-flush uses a `{1, 10, 100} ms` escalating looper (`17127-17133`); maintenance is fixed at 100 ms (`17091`).
- `pgbuf_is_io_stressful()` (`16551-16560`) = low-priority waiter queue non-empty.

---

## 9. BCB flags relevant to replacement (`page_buffer.c:222-262`)

| Flag | Value | Line | Meaning |
|---|---|---|---|
| `PGBUF_BCB_DIRTY_FLAG` | `0x80000000` | 224 | Page modified; cleared on flush. |
| `PGBUF_BCB_FLUSHING_TO_DISK_FLAG` | `0x40000000` | 227 | Flush in progress; dirty may already be false but the BCB must not be victimized until the flush succeeds. |
| `PGBUF_BCB_VICTIM_DIRECT_FLAG` | `0x20000000` | 234 | Already handed to a specific waiting thread. |
| `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG` | `0x10000000` | 235 | Set when someone re-fixes an assigned direct victim; the waiter must ask again. |
| `PGBUF_BCB_MOVE_TO_LRU_BOTTOM_FLAG` | `0x08000000` | 237 | On the next zero-fix unfix, move to the bottom of an LRU. Set by `pgbuf_dealloc_page` (`15162`). |
| `PGBUF_BCB_TO_VACUUM_FLAG` | `0x04000000` | 239 | Page will likely be read by vacuum. Set by `pgbuf_notify_vacuum_follows` (`16129-16136`), cleared in `pgbuf_victimize_bcb` (`8608-8611`). |
| `PGBUF_BCB_ASYNC_FLUSH_REQ` | `0x02000000` | 241 | Asynchronous flush requested; handled at the end of unfix (`6809-6825`). |

`PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK` = DIRTY | FLUSHING_TO_DISK | VICTIM_DIRECT | INVALIDATE_DIRECT_VICTIM (`258-262`), tested by `pgbuf_bcb_avoid_victim` (`16158-16162`). Note `TO_VACUUM` and `MOVE_TO_LRU_BOTTOM` do **not** block victimization; `TO_VACUUM` only blocks *direct* assignment during a zone fall (`10012-10019`).

Other accessors: `pgbuf_bcb_is_dirty` `15955-15959`, `is_flushing` `16069`, `is_direct_victim` `16081`, `is_invalid_direct_victim` `16093`, `is_async_flush_request` `16104-16108`, `should_be_moved_to_bottom_lru` `16116-16120`, `is_to_vacuum` `16144-16148`.

All flag changes go through `pgbuf_bcb_update_flags` (`15726-15794`), which CAS-loops (`15739-15751`), then — **if the BCB is in zone 3** — adds or removes it as a victim candidate depending on whether the invalid-candidate mask changed (`15753-15777`), and maintains the global `monitor.dirties_cnt` (`15779-15791`).

`pgbuf_move_bcb_to_bottom_lru` (`10366-10406`): from VOID zone, insert at the bottom of the thread's private list (or a shared list); from an LRU zone, early-out if already the bottom, else remove and re-add at the bottom.

`count_fix_and_avoid_dealloc` (`533-538`) packs two counters into one int: `PGBUF_BCB_COUNT_FIX_SHIFT_BITS 16` for the fix counter, `PGBUF_BCB_AVOID_DEALLOC_MASK 0x0000FFFF` for the avoid-dealloc counter (`267-269`).

---

## 10. Tunables

All entries from `src/base/system_parameter.c`. The tuple order in each record is `{default, current, upper, lower}`.

| Parameter (name string) | PRM id | Name @line | Entry @lines | Default | Range | Flags |
|---|---|---|---|---|---|---|
| `lru_hot_ratio` | `PRM_ID_PB_LRU_HOT_RATIO` | 611 | 3754-3764 | `0.4` | 0.05 – 0.90 | `PRM_FOR_SERVER \| PRM_RELOADABLE` |
| `lru_buffer_ratio` | `PRM_ID_PB_LRU_BUFFER_RATIO` | 612 | 3766-3776 | `0.05` | 0.05 – 0.90 | `PRM_FOR_SERVER \| PRM_RELOADABLE` |
| `num_LRU_chains` | `PRM_ID_PB_NUM_LRU_CHAINS` | 259 | 1794-1804 | `0` (= auto) | 0 – 1000 | `PRM_FOR_SERVER \| PRM_HIDDEN` |
| `num_private_chains` | `PRM_ID_PB_NUM_PRIVATE_CHAINS` | 673 | 4171-4181 | `-1` (= auto) | -1 – `CSS_MAX_CLIENT_COUNT + VACUUM_MAX_WORKER_COUNT` | `PRM_FOR_SERVER \| PRM_RELOADABLE` |
| `data_aout_ratio` | `PRM_ID_PB_AOUT_RATIO` | 581 | 3463-3473 | `0.0` | 0 – 3.0 | `PRM_FOR_SERVER \| PRM_RELOADABLE` — **force-set to 0 at 9986** |
| `data_buffer_flush_ratio` | `PRM_ID_PB_BUFFER_FLUSH_RATIO` | 144 | 1158-1168 | `0.01` | 0.01 – 0.95 | `PRM_FOR_SERVER \| PRM_HIDDEN \| PRM_USER_CHANGE` |
| `data_buffer_pages` / `data_buffer_size` | `PRM_ID_PB_NBUFFERS` / `PRM_ID_PAGE_BUFFER_SIZE` | 140 | 1169-1188 | `32768` pages | ≥1024 pages | `PB_NBUFFERS` is `PRM_DEPRECATED` |
| `page_flush_interval_in_msecs` | `PRM_ID_PAGE_BG_FLUSH_INTERVAL_MSECS` | 261 | 1806-1816 | `1000` ms | ≥0 (0 = infinite wait) | `PRM_USER_CHANGE \| PRM_DEPRECATED` |
| `page_flush_interval` | `PRM_ID_PAGE_BG_FLUSH_INTERVAL` | 263 | 1818-1828 | `1000` ms | ≥0 | `PRM_TIME_UNIT` |
| `data_buffer_neighbor_flush_nondirty` | `PRM_ID_PB_NEIGHBOR_FLUSH_NONDIRTY` | 639 | 3942-3952 | see entry | — | — |
| `data_buffer_neighbor_flush_pages` | `PRM_ID_PB_NEIGHBOR_FLUSH_PAGES` | 640 | 3953-3963 | see entry | — | max 32 enforced in code (`page_buffer.c:310`) |

Not tunable — compile-time constants in `page_buffer.c`:

| Constant | Value | Line |
|---|---|---|
| `PGBUF_LRU_ZONE_MIN_RATIO` / `MAX_RATIO` | `0.05f` / `0.90f` | 342-343 |
| `PGBUF_PRIVATE_LRU_MIN_COUNT` | 4 | 1023 |
| `PGBUF_PRIVATE_LRU_MAX_HARD_QUOTA` | 5000 | 1024 |
| `PGBUF_MIN_PAGES_IN_SHARED_LIST` | 1000 | 1027 |
| `PGBUF_MIN_SHARED_LIST_ADJUST_SIZE` | 50 | 1028 |
| `PGBUF_OVER_QUOTA_BUFFER(q)` | `MAX(10, q*0.01)` | 1067 |
| `PBGUF_BIG_PRIVATE_MIN_SIZE` | 100 | 1071 |
| `PGBUF_FIX_COUNT_THRESHOLD` | 64 | 106 |
| `pgbuf_latch_timeout_msecs` | 300 000 | 107 |
| `PGBUF_TRAN_THRESHOLD_ACTIVITY` | `num_buffers/4` | 276 |
| `PGBUF_FLUSH_VICTIM_BOOST_MULT` | 10 | 305 |
| `MAX_DEPTH` in victim scans | 1000 | 9271, 9496 |
| maintenance daemon period | 100 ms | 17091 |
| AOUT hard cap | 32768 entries | 5759 |

---

## 11. Observability

### 11.1 Peeked gauges — `pgbuf_peek_stats` (`page_buffer.c:14684-14780`)

Walks the whole BCB table without locks (comment `14713`) and fills: fixed, dirty, lru1/lru2/lru3 counts, victim candidates (summed from `count_vict_cand`, `14752-14755`), avoid-dealloc, avoid-victim (= `FLUSHING_TO_DISK` count, `14739-14742`), private page count, `private_quota = private_pages_ratio * num_buffers` (`14757`), the two waiter-queue sizes, the flushed-BCB queue size, and the three victim-queue sizes (`14759-14779`).

Display names (`src/base/perf_monitor.c`):

| Stat | Display name | Line |
|---|---|---|
| `PSTAT_PB_LRU1_CNT` / `LRU2` / `LRU3` | `Num_data_page_lru1` / `_lru2` / `_lru3` | 219-221 |
| `PSTAT_PB_VICT_CAND` | `Num_data_page_victim_candidate` | 222 |
| `PSTAT_PB_PRIVATE_QUOTA` / `PRIVATE_COUNT` | `Num_data_page_private_quota` / `_private_count` | 215-216 |
| `PSTAT_PB_AVOID_DEALLOC_CNT` / `AVOID_VICTIM_CNT` | `Num_data_page_avoid_dealloc` / `_avoid_victim` | 557-558 |
| `PSTAT_PB_WAIT_THREADS_HIGH_PRIO` / `LOW_PRIO` | `Num_alloc_bcb_wait_threads_high_priority` / `_low_priority` | 551-552 |
| `PSTAT_PB_FLUSHED_BCBS_WAIT_FOR_ASSIGN` | `Num_flushed_bcbs_wait_for_direct_victim` | 553 |
| `PSTAT_PB_LFCQ_BIG_PRV_NUM` / `PRV_NUM` / `SHR_NUM` | `Num_lfcq_big_private_lists` / `Num_lfcq_private_lists` / `Num_lfcq_shared_lists` | 554-556 |

### 11.2 Unfix-decision counters (`src/base/perf_monitor.c:452-475`)

`Num_unfix_void_to_private_top`, `_to_private_mid`, `_to_shared_mid` (452-454); `Num_unfix_lru{1,2,3}_private_to_shared_mid` (455-457); `Num_unfix_lru2_{private,shared}_keep` (458-459); `Num_unfix_lru{2,3}_{private,shared}_to_top` (460-463); `Num_unfix_lru1_{private,shared}_keep` (464-465); vacuum variants `Num_unfix_void_to_private_mid_vacuum`, `Num_unfix_lru{1,2,3}_any_keep_vacuum` (467-470); AOUT variants `Num_unfix_void_aout_{found,not_found}[_vacuum]` (472-475).

Reading these side by side reconstructs the whole insertion/boost decision tree at runtime.

### 11.3 Victimization counters (`src/base/perf_monitor.c:492-535`)

- Timers: `alloc_bcb` (495), `alloc_bcb_search_victim` (496), `alloc_bcb_cond_wait_high_prio` / `_low_prio` (497-498), `assign_direct_bcb` (492), `alloc_bcb_get_victim_search_own_private_list` (502-503), `..._others_private_list` (504-505), `..._shared_list` (506).
- Direct assignment: `Num_victim_assign_direct_vacuum_void` (507), `_vacuum_lru` (508), `_flush` (509), `_panic` (510), `_adjust_lru` (511), `_adjust_lru_to_vacuum` (512-513), `_search_for_flush` (514-515).
- Outcomes: `Num_victim_{shared,own_private,other_private}_lru_success` (517-519) / `_fail` (521-523), `Num_victim_all_lru_fail` (524).
- Scan internals: `Num_victim_get_from_lru` (526), `_was_empty` (527), `_fail` (528), `_bad_hint` (529).
- Queues: `Num_lfcq_prv_get_total_calls` (531), `_empty` (532), `_big` (533), `Num_lfcq_shr_get_total_calls` (534), `_empty` (535).
- Invalid list: `Num_victim_use_invalid_bcb` (500); vacuum prioritization: `Num_alloc_bcb_prioritize_vacuum` (499).

Most of these are gated on `PERFMON_ACTIVATION_FLAG_PB_VICTIMIZATION` (e.g. `page_buffer.c:9025`, `9282`), so they only appear when detailed page-buffer statistics are enabled.

### 11.4 `SHOW` / dump helpers

- `pgbuf_zone_str` maps zones to `LRU_1_Zone` / `LRU_2_Zone` / `LRU_3_Zone` / `INVALID_Zone` / `VOID_Zone` (`page_buffer.c:14918-14943`), used by `pgbuf_dump` (`11301`).
- `pgbuf_scan_bcb_table` (`17256-17332`) fills the `SHOW` snapshot: free/clean/dirty pages, index/data/system/temp page counts, and `victim_candidate_pages`.

---

## 12. Surprising / little-known facts

**12.1 AOUT is dead code in this build.** `src/base/system_parameter.c:9985-9986` unconditionally does `prm_set (pb_aout_ratio_prm, "0", false)` — "disable AOUT list until we fix CBRD-20741" — inside `prm_tune_parameters()` (`9941-9943`), which runs *after* config parsing (`6260`). So the "LRU + Aout of 2Q" claim at `page_buffer.c:635-639` does not describe the running system: `max_count` is 0 (`5775-5780`) and all AOUT calls short-circuit. `pgbuf_remove_private_from_aout_list` (`10583`) is additionally never called by anyone.

**12.2 With AOUT off, every newly-read page lands at the TOP of a private list.** In `pgbuf_unlatch_void_zone_bcb`, the guard is `if (!aout_enabled || thread_private_lru_index == aout_list_id)` → private TOP (`page_buffer.c:6912-6919`). The "middle" insertion for scan resistance (`6924`) is unreachable when AOUT is off. Shared-middle insertion (`6933`) then only happens for threads with **no** private list (system daemons, checkpoint, non-session workers) — plus `pgbuf_lru_move_from_private_to_shared` (`10290`).

**12.3 `big_private_lrus_with_victims` is never seeded.** Grep of the whole file shows exactly one `produce` call, at `page_buffer.c:16401`, and it sits *inside* `pgbuf_lfcq_get_victim_from_private_lru` after a successful `consume` from the same queue at `16374`. `pgbuf_lfcq_add_lru_with_victims` only feeds `private_lrus_with_victims` (`16329`) or `shared_lrus_with_victims` (`16337`). Consequence: the big-private queue is permanently empty, `PSTAT_PB_LFCQ_LRU_PRV_GET_BIG` never fires, and a thread with `restricted == true` (an over-quota thread, `9098`) always gets NULL from step 2 and jumps straight to the shared lists.

**12.4 `pgbuf_direct_victims_maintenance()` never executes its loop bodies.** Both loops (`page_buffer.c:9574-9579` and `9583-9588`) are written as
`for (index = prv_index, restarted = false; ... && index != prv_index && !restarted; ...)`.
Since `index` is initialised to `prv_index`, the condition `index != prv_index` is false on entry. The "backup plan" for feeding waiters when the system is idle (documented at `9551-9556`) therefore does nothing, and neither does the maintenance daemon's second half (`16942`). *UNVERIFIED whether this is intentional; the enclosing comment says it is meant to run.*

**12.5 `lru_hot_ratio` and `lru_buffer_ratio` only affect shared lists.** Private lists are hard-wired to `quota * PGBUF_LRU_ZONE_MIN_RATIO` for **both** zones (`page_buffer.c:14390-14391`), i.e. 5 % / 5 % / ~90 % — so a private list is almost entirely victim zone. Shared lists use the parameters (`14416-14417`). `pgbuf_compute_lru_vict_target` even relies on this: *"for privates, zones 1 & 2 are both set to minimum ratio"* (`14134`).

**12.6 The private list is per *session*, not per thread or per transaction.** `src/session/session.c:740` assigns it at session creation, `session.c:2800` copies it into whichever worker thread serves the session. Two concurrent workers of the same session share one private list. Vacuum workers hold their own for their whole lifetime (`src/query/vacuum.c:1270`), which is why `num_private_chains` auto-sizes to `MAX_NTRANS + 50` (`page_buffer.c:13901`).

**12.7 Vacuum workers never make a page hot, and actively give pages away.** `PGBUF_SHOULD_IGNORE_UNFIX` (`290`) also covers **temporary-volume pages**, so temp pages are never boosted either. A vacuum worker unfixing a zone-3 page immediately tries to hand it to a waiting thread (`6769-6776`), and the same for a void-zone page (`6871-6885`). Conversely, `pgbuf_lru_fall_bcb_to_zone_3` refuses to donate a BCB flagged `TO_VACUUM` (`10012-10019`) — vacuum's future working set is protected from being poached.

**12.8 Quota "hits" are epoch-deduplicated per BCB.** `pgbuf_bcb_register_hit_for_lru` (`16539-16543`) records at most one hit per BCB per `adjust_age`. A list that hammers one page a million times inside a 100 ms window scores **1**, while a list touching a thousand distinct pages scores 1000. Quota therefore tracks *working-set breadth*, not access frequency.

**12.9 Zone-1 BCBs are deliberately never repositioned on unfix.** No mutex, no list surgery, at the cost of losing true LRU order in the hottest 40 % of each shared list (`page_buffer.c:6701-6727`, rationale at `189-190` and `10085-10087`).

**12.10 The victim hint is known to be wrong sometimes, and the source says so.** `page_buffer.c:597-599`:
> `/* TODO: I have noticed while investigating core files from TPCC that hint is sometimes before first bcb that can be victimized. this means there is a logic error somewhere. I don't know where, but there must be. */`

The code compensates in three places: hint snap-to-bottom before scanning (`9321-9333`), bad-hint reset after a failed scan (`9453-9468`), and hint reset inside `pgbuf_lfcq_assign_direct_victims` (`9615-9630`).

**12.11 Bottom insertion fakes the age.** `pgbuf_lru_add_bcb_to_bottom` sets `bcb->tick_lru3` *below* the current bottom's (`9800`, `9810-9811`) so a BCB pushed to the bottom immediately looks like the oldest zone-3 entry and wins the victim-hint comparison in `pgbuf_lru_add_victim_candidate` (`15631-15636`).

**12.12 The `SHOW` "victim candidate" counter counts the opposite of an internal victim candidate.** `pgbuf_scan_bcb_table` (`page_buffer.c:17290-17293`) does:
```c
      if ((PGBUF_GET_ZONE (flags) == PGBUF_LRU_3_ZONE) && (flags & PGBUF_BCB_DIRTY_FLAG) != 0)
	{
	  show_status_snapshot->victim_candidate_pages++;
	}
```
i.e. **dirty** zone-3 pages, whereas `count_vict_cand` / `PSTAT_PB_VICT_CAND` count zone-3 pages with **no** dirty (or other invalidating) flag (`15855`, `15882-15886`, `15912-15915`). *UNVERIFIED whether the SHOW column is intended to mean "pages that must be flushed before they can be victimized"; as written the two metrics are not comparable.*

**12.13 Deallocating a page does not invalidate its BCB.** `pgbuf_dealloc_page` (`15118-15171`) sets `DIRTY | MOVE_TO_LRU_BOTTOM` (`15162`) and unfixes, with the rationale that invalidating would require a synchronous write (`15127-15131`). The BCB is therefore parked at the bottom of an LRU list for the flush thread to pick up.

**12.14 An over-quota thread is barred from other private lists but not from shared lists.** `restrict_other` only gates step 2 (`page_buffer.c:9098` → `16382-16385`); step 3 always runs (`9146-9162`). Combined with 12.3, over-quota threads always end up competing on the shared lists.

**12.15 The last-resort self-victimization exists because of a real observed stall.** `page_buffer.c:9054-9056`:
> `note: if all above failed to produce a victim, we'll try to victimize from own private even if it is under quota. we found a strange particular case when all private lists were on par with their quota's (but just below), shared lists had no lru 3 zone and nothing could be victimized or flushed.`
Implementation at `9174-9191`.

**12.16 `num_LRU_chains = 0` (the default) does not mean "one list".** It means `MAX_NTRANS` = `css_get_max_conn() + 1` shared lists (`5702`), then reduced so each list holds ≥ 1000 pages (`5705-5708`), then floored at 4 (`5711`). With the default 32768-page pool that ceiling is 32 shared lists regardless of `max_clients`.

**12.17 Low-priority waiter-queue overflow promotes you.** If the low-priority queue rejects a push (an observed ~93 ms consumer preemption, `8224-8233`), the thread is pushed onto the **high**-priority queue instead — the "hack" is documented in place.

**12.18 `pgbuf_lru_remove_victim_candidate` cannot un-queue a list.** It only decrements `count_vict_cand` (`15663-15672`); a list with zero candidates stays in the lock-free queue until a consumer pops it and clears the flag (`16435`, `16507`). Victim searches therefore routinely pop empty lists — which is exactly what `Num_victim_get_from_lru_was_empty` measures (`perf_monitor.c:527`).

---

## Appendix — key call graph

```
pgbuf_fix → pgbuf_claim_bcb_for_fix (8348) → pgbuf_allocate_bcb (8134)
                                                ├─ pgbuf_get_bcb_from_invalid_list (8858)
                                                ├─ pgbuf_get_victim (9019)
                                                │    ├─ own private        → pgbuf_get_victim_from_lru_list (9267)
                                                │    ├─ pgbuf_lfcq_get_victim_from_private_lru (16357) → same
                                                │    └─ pgbuf_lfcq_get_victim_from_shared_lru  (16449) → same
                                                ├─ [SERVER] park on waiter queue → pgbuf_get_direct_victim (15533)
                                                └─ pgbuf_victimize_bcb (8586)

pgbuf_unfix → pgbuf_unlatch_bcb_upon_unfix (6605)
                ├─ MOVE_TO_LRU_BOTTOM     → pgbuf_move_bcb_to_bottom_lru (10366)
                ├─ VOID                   → pgbuf_unlatch_void_zone_bcb (6844)
                │                              → add_new_bcb_to_top/middle (10147/10183)
                ├─ LRU_1                  → (nothing) + register hit
                ├─ LRU_2 (old enough)     → pgbuf_lru_boost_bcb (10072)
                ├─ LRU_3                  → pgbuf_lru_boost_bcb (10072)
                └─ private→shared         → pgbuf_lru_move_from_private_to_shared (10278)

pgbuf-maintain daemon (100 ms, 17091) → pgbuf_adjust_quotas (14195)
                                       → pgbuf_direct_victims_maintenance (9560)   [loop is a no-op, 12.4]

pgbuf-page-flush daemon (16952) → pgbuf_flush_victim_candidates (3819)
                                    → pgbuf_compute_lru_vict_target (14062)
                                    → pgbuf_get_victim_candidates_from_lru (3737)
pgbuf-page-post-flush daemon ({1,10,100} ms, 17127) → pgbuf_assign_flushed_pages (15431)
```
