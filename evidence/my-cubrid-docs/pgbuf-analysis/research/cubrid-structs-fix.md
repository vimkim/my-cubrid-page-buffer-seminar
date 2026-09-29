# CUBRID Page Buffer — Data Structures & Fix/Unfix Lifecycle

**Repo:** `/home/vimkim/gh/cb/pgbuf-analysis` (branch `pgbuf-analysis`) · **HEAD:** `5cd4f860e` · **Date:** 2026-08-06
**Primary sources:** `src/storage/page_buffer.c` (17,513 lines), `src/storage/page_buffer.h` (521 lines)

All `file:line` refs are relative to the repo root, taken from reads of the working tree at that commit.
`DERIVED` marks arithmetic done from struct definitions rather than measured. LRU zone/quota/victim-selection
internals are another agent's scope; this sheet names the boundary functions only.

---

## 0. Read this first: the tree is NOT stock CUBRID 11.5

Local page-buffer commits (`git log -- src/storage/page_buffer.c`) change the latching design vs. upstream:
`e8b961468` CBRD-27084 (uncleared `waiter_exists` spin), `b334446d6` CBRD-27041 (copy-then-peek scan),
`2c85653a6` CBRD-26941 (fix/unfix counters into `THREAD_ENTRY`), `10c300aee` CBRD-26898 (per-thread
`SHOW PAGE BUFFER STATUS` shards), `77c1f2572` CBRD-26975 (latch timeout in msec).

The biggest departure: **BCB latch state (`latch_mode`, `waiter_exists`, `fcnt`) is packed into one 64-bit
`std::atomic`** instead of three plain fields mutated under `bcb->mutex`. Nearly every transition is now a
compare-exchange loop, which is what enables the mutex-free read fix/unfix fast paths (§5.2, §7) that
upstream lacks.

---

## 1. `pgbuf_Pool` global anatomy

`static PGBUF_BUFFER_POOL pgbuf_Pool;` at `page_buffer.c:845`, alongside
`static PGBUF_BATCH_FLUSH_HELPER pgbuf_Flush_helper;` (`:846`) — note the batch-flush scratch struct
(`:451-458`) is a **single global**, so neighbor-flush batching is single-threaded by construction.

`struct pgbuf_buffer_pool`, `page_buffer.c:755-832`:

| Member | Line | Role |
|---|---|---|
| `int num_buffers` | 758 | Frame/BCB count. Comment says "10 * num_trans" but the real source is `PRM_ID_PB_NBUFFERS` (§10). |
| `PGBUF_BCB *BCB_table` | 762 | Flat array of `num_buffers` BCBs; indexed by `PGBUF_FIND_BCB_PTR(i)` (`:135`). |
| `PGBUF_BUFFER_HASH *buf_hash_table` | 763 | VPID→BCB hash, **fixed** `1<<20` buckets (§4.1). |
| `PGBUF_BUFFER_LOCK *buf_lock_table` | 764 | One record **per thread**, not per page (§4.2). |
| `PGBUF_IOPAGE_BUFFER *iopage_table` | 765 | Frame array, stride `PGBUF_IOPAGE_BUFFER_SIZE` (§3). |
| `int num_LRU_list` | 766 | Count of **shared** LRU lists only. |
| `float ratio_lru1`, `ratio_lru2` | 767-768 | Zone-1/zone-2 size ratios, clamped at `:1683-1691`. |
| `PGBUF_LRU_LIST *buf_LRU_list` | 769 | One array: shared lists first, then private. |
| `PGBUF_AOUT_LIST buf_AOUT_list` | 773 | 2Q victim history of VPIDs (not BCBs). |
| `PGBUF_INVALID_LIST buf_invalid_list` | 774 | Free list of never-used/invalidated BCBs (§1.2). |
| `PGBUF_VICTIM_CANDIDATE_LIST *victim_cand_list` | 776 | `num_buffers`-sized flush candidate array (`:1747`). |
| `PGBUF_SEQ_FLUSHER seq_chkpt_flusher` | 777 | Rate-controlled checkpoint flusher, `min(0.25*num_buffers, 65536)` (`:1761-1770`). |
| `PGBUF_PAGE_MONITOR monitor` | 779 | `dirties_cnt`, per-LRU hits/activity, bcb-mutex tracker, `victim_rich` (`:693-713`). |
| `PGBUF_PAGE_QUOTA quota` | 780 | Private-LRU count, quotas, adjust ticks (`:716-736`). |
| `PGBUF_HOLDER_ANCHOR *thrd_holder_info` | 789 | Per-thread free + held holder lists (§9.1). |
| `PGBUF_HOLDER *thrd_reserved_holder` | 790 | Backing store for the initial 7 holders/thread. |
| `pthread_mutex_t free_holder_set_mutex` | 802 | Guards the global holder-set overflow allocator. |
| `PGBUF_HOLDER_SET *free_holder_set`, `int free_index` | 804-805 | Grow-only global pool of 10-holder blocks; entries are **never returned** to it (`:792-800`). |
| `bool check_for_interrupts` | 809 | Set/cleared by log manager under `TR_TABLE_CS`; read in the fix retry loop (`:2298`). |
| `bool is_flushing_victims`, `is_checkpoint` | 812-813 | Flush-daemon / checkpoint state. |
| `PGBUF_DIRECT_VICTIM direct_victims` | 818 | `bcb_victims[]` per thread + high/low-priority waiter queues (`:743-750`). |
| `circular_queue<PGBUF_BCB*> *flushed_bcbs` | 819 | Post-flush queue, 8192 entries (`:751`). |
| `circular_queue<int> *private_lrus_with_victims` | 821 | LFCQ of private LRU indexes holding victims. |
| `circular_queue<int> *big_private_lrus_with_victims` | 822 | Same, for lists ≥ `PBGUF_BIG_PRIVATE_MIN_SIZE` 100 (`:1071`). |
| `circular_queue<int> *shared_lrus_with_victims` | 823 | Same, shared lists. |
| `PGBUF_STATUS *show_status` | 826 | Per-thread `SHOW PAGE BUFFER STATUS` shard, 64-B aligned (§11.3). |
| `PGBUF_STATUS_OLD show_status_old` | 827 | Previous snapshot + `print_out_time` for deltas. |
| `PGBUF_STATUS_SNAPSHOT show_status_snapshot` | 828 | Instantaneous page-class counts (`:404-414`). |
| `pthread_mutex_t show_status_mutex` | 830 | Serializes snapshot computation. |

### 1.1 Latent bug: wrong `sizeof` in the `direct_victims` memset

```c
#if defined (SERVER_MODE)
  memset (&pgbuf_Pool.direct_victims, 0, sizeof (PGBUF_VICTIM_CANDIDATE_LIST));
#endif
```
— `page_buffer.c:1623-1625`. Target is `PGBUF_DIRECT_VICTIM` (3 pointers = 24 B, `:743-750`); size comes
from `PGBUF_VICTIM_CANDIDATE_LIST` (16 B, `:839-843`). The last 8 bytes —
`waiter_threads_low_priority` — are not zeroed, yet `pgbuf_finalize` `delete`s it when non-NULL
(`:2026-2030`) and `pgbuf_initialize` only assigns it at `:1796`. Any `goto error` between `:1625` and
`:1796` reaches `pgbuf_finalize()` (`:1867`) with a garbage pointer. Mitigation: `pgbuf_Pool` has static
storage duration (`:845`), so this is only reachable on a **second** `pgbuf_initialize` in one process.
The `sizeof` is unambiguously the wrong type regardless.

### 1.2 Invalid list

```c
struct pgbuf_invalid_list
{
  pthread_mutex_t invalid_mutex;	/* invalid mutex for the integrity of invalid BCB list. */
  PGBUF_BCB *invalid_top;	/* top of the invalid BCB list */
  int invalid_cnt;		/* # of entries in invalid BCB list */
};
```
— `:626-633`. Singly linked through `PGBUF_BCB::next_BCB` — **the same field the LRU lists use**, so a BCB
is in exactly one of them. At init the whole array is one chain: `invalid_top = PGBUF_FIND_BCB_PTR(0)`,
`invalid_cnt = num_buffers` (`:5864-5865`), chained at `:5576-5583`.

Pop, `pgbuf_get_bcb_from_invalid_list` (`:8858-8896`): unsynchronized emptiness read at `:8867` before
taking `invalid_mutex` (`:8872`) and re-checking (`:8875`); unlinks, drops the list mutex, **then** takes
`PGBUF_BCB_LOCK` (`:8889`), moves zone to `PGBUF_VOID_ZONE`, bumps `PSTAT_PB_VICTIM_USE_INVALID_BCB`.
Returns with the BCB mutex **held**.

Push, `pgbuf_put_bcb_into_invalid_list` (`:8907-8929`): caller holds the BCB mutex. Nulls the VPID, sets
latch `PGBUF_LATCH_INVALID`, asserts **all** BCB flags are clear (`:8917`), zone → `PGBUF_INVALID_ZONE`,
resets the fix/avoid-dealloc word, links at top, releases the BCB mutex *before* the list mutex (`:8925-8926`).

---

## 2. `PGBUF_BCB`

```c
struct pgbuf_bcb
{
  pthread_mutex_t mutex;	/* BCB mutex */
  int owner_mutex;		/* mutex owner */
  VPID vpid;			/* Volume and page identifier of resident page */
  PGBUF_ATOMIC_LATCH atomic_latch;	/* atomic latch */
  volatile int flags;
  THREAD_ENTRY *next_wait_thrd;	/* BCB waiting queue */
  THREAD_ENTRY *latch_last_thread;	/* last thread that acquired latch */
  PGBUF_BCB *hash_next;		/* next hash chain */
  PGBUF_BCB *prev_BCB;		/* prev LRU chain */
  PGBUF_BCB *next_BCB;		/* next LRU or Invalid(Free) chain */
```
— `:511-528`, SERVER_MODE guards elided. Rest at `:529-543`.

| Field | Line | Protected by | Notes |
|---|---|---|---|
| `mutex` | 514 | — | Via `PGBUF_BCB_LOCK/TRYLOCK/UNLOCK` (`:950-957`), routed through `pgbuf_bcbmon_*` when `pgbuf_Monitor_locks` is on — **always true in debug** (`:1678`). |
| `owner_mutex` | 515 | `mutex` | Debug owner tracking. |
| `vpid` | 517 | `mutex` for writes; read racily during hash scan | Nulled on hash removal (`:7918`) and invalid-list push (`:8915`). |
| `atomic_latch` | 518 | lock-free CAS | Packed 64-bit latch, §2.1. |
| `flags` | 519 | `ATOMIC_CAS_32` | Flags **+ zone + LRU index**, §2.2. |
| `next_wait_thrd` | 521 | `mutex` | Latch wait queue head, linked via `THREAD_ENTRY::next_wait_thrd`. |
| `latch_last_thread` | 524 | `mutex` (advisory) | Diagnostic; written on every grant (`:6437`, `:6483`, `:6579`, `:7111`). |
| `hash_next` | 526 | bucket `hash_mutex` | Hash chain. |
| `prev_BCB`, `next_BCB` | 527-528 | LRU list `mutex` or `invalid_mutex` | Dual-purpose: LRU doubly-linked **or** invalid singly-linked. |
| `tick_lru_list` | 529 | LRU mutex | List tick at insertion; feeds `PGBUF_IS_BCB_OLD_ENOUGH` (`:1008`). |
| `tick_lru3` | 531 | LRU mutex | Position in zone 3, for victim-hint ordering. |
| `count_fix_and_avoid_dealloc` | 533 | `ATOMIC_INC_32`/`CAS_32` | Two counters in one int, §2.3. |
| `hit_age` | 539 | racy by design | LRU activity/quota math. |
| `oldest_unflush_lsa` | 541 | `mutex` | Invariant "non-NULL ⇒ dirty" asserted at `:2351`, `:6665`. |
| `iopage_buffer` | 542 | immutable after init | `bcb->iopage_buffer->bcb == bcb` asserted in cast macros (`:152`, `:167`). |

### 2.1 `atomic_latch` — packed 64-bit latch word

```c
union pgbuf_atomic_latch_impl
{
  uint64_t raw;
  struct
  {
    PGBUF_LATCH_MODE latch_mode;
    uint16_t waiter_exists;
    int32_t fcnt;
  } impl;
};
```
— `:499-508`, with `typedef std::atomic<uint64_t> PGBUF_ATOMIC_LATCH` (`:365`). `PGBUF_LATCH_MODE` is
declared `enum:uint16_t` **specifically** so the packing is 16+16+32 (`page_buffer.h:190-197`).
Accessors, all CAS loops with `memory_order_acq_rel`/`acquire`, at `page_buffer.c:1392-1494`:
`set_latch`, `add_fcnt`, `set_latch_and_fcnt`, `set_latch_and_add_fcnt`, `set_waiter_exists`, `get_fcnt`,
`get_waiter_exists`, `get_latch`, `get_impl`.

Key point: **`fcnt` is not a holder count** — it is the sum of all holders' `fix_count`s, and
`holder->fix_count` lives in per-thread memory (§9).

### 2.2 `flags` — flags + zone + LRU index in one int

```c
#define PGBUF_BCB_DIRTY_FLAG                ((int) 0x80000000)
#define PGBUF_BCB_FLUSHING_TO_DISK_FLAG     ((int) 0x40000000)
#define PGBUF_BCB_VICTIM_DIRECT_FLAG        ((int) 0x20000000)
#define PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG    ((int) 0x10000000)
#define PGBUF_BCB_MOVE_TO_LRU_BOTTOM_FLAG   ((int) 0x08000000)
#define PGBUF_BCB_TO_VACUUM_FLAG            ((int) 0x04000000)
#define PGBUF_BCB_ASYNC_FLUSH_REQ           ((int) 0x02000000)
```
— `:224-241` (comments elided). Word layout: bits 0–15 LRU index (`PGBUF_LRU_INDEX_MASK 0x0000FFFF`,
`:182` — hence 65,536 max LRU lists, `:181`); bits 16–17 LRU zone 1/2/3 (`:197-199`); bits 18–19
`PGBUF_INVALID_ZONE`/`PGBUF_VOID_ZONE` (`:205-206`); bits 25–31 the seven flags.
Non-overlap of `PGBUF_BCB_FLAGS_MASK` (`:244-251`) / `PGBUF_ZONE_MASK` (`:211`) / index mask is verified at
boot by `pgbuf_flags_mask_sanity_check` (`:16777-16798`, called first in `pgbuf_initialize` at `:1602`);
failure calls `PGBUF_ABORT_RELEASE()` — `abort()` in release, `assert(false)` in debug (`:1082-1086`).

Victim-eligibility mask (`:258-262`) is `DIRTY | FLUSHING_TO_DISK | VICTIM_DIRECT | INVALIDATE_DIRECT_VICTIM`.
It does **not** include `fcnt > 0`; being fixed is checked separately (`pgbuf_is_bcb_fixed_by_any`, `:9210`;
`pgbuf_bcb_avoid_victim`, `:16158-16162`). Initial value `PGBUF_BCB_INIT_FLAGS = PGBUF_INVALID_ZONE`
(`:265`, applied `:5585`).

All flag mutation normally goes through `pgbuf_bcb_update_flags` (`:15726-15794`): CAS loop, then — if in
zone 3 — add/remove as LRU victim candidate on an invalid-mask transition, and maintain
`monitor.dirties_cnt` (`:15779-15793`). `pgbuf_bcb_set_dirty` deliberately **bypasses** it as a hot-path
optimization and duplicates that maintenance inline (`:15967-15995`, comment `:15971-15972`). Zone changes
use `pgbuf_bcb_change_zone` (`:15824+`), preserving flag bits while replacing zone+index (`:15847`).

### 2.3 `count_fix_and_avoid_dealloc` — two counters in one int

```c
/* fix & avoid dealloc counter... we have one integer and each uses two bytes. fix counter is offset by two bytes. */
#define PGBUF_BCB_COUNT_FIX_SHIFT_BITS          16
#define PGBUF_BCB_AVOID_DEALLOC_MASK            ((int) 0x0000FFFF)
```
— `:267-269`. Why they share a word: "avoid deallocation needs to be changed atomically... 2-byte sized
atomic operations are not common" (`:533-538`).

- **Low 16 bits** = avoid-dealloc refcount. `pgbuf_bcb_register_avoid_deallocation` = `ATOMIC_INC_32(...,1)`
  (`:16182-16187`); the unregister side CAS-loops and **tolerates a zero count**, logging instead of
  asserting (`:16195-16231`), because `pgbuf_ordered_fix` can unfix a marked page, have it victimized, and
  re-read it with the counter lost.
- **High 16 bits** = fix counter, saturating at `PGBUF_FIX_COUNT_THRESHOLD` 64 (`:106`).
  `pgbuf_bcb_register_fix` stops incrementing at the threshold (`:16275-16288`); `pgbuf_bcb_is_hot` is
  `count >= (64 << 16)` (`:16296-16301`).
- Asserts check bit `0x00008000` stays clear (`:16185`, `:16203`, `:16243`), i.e. avoid-dealloc must stay
  under 32,768 so it never bleeds into the fix counter's sign handling.

---

## 3. Frames: `PGBUF_IOPAGE_BUFFER` and `FILEIO_PAGE`

```c
struct pgbuf_iopage_buffer
{
  PGBUF_BCB *bcb;		/* pointer to BCB structure */
#if (__WORDSIZE == 32)
  int dummy;			/* for 8byte align of iopage */
#elif !defined(LINUX) && !defined(WINDOWS) && !defined(AIX)
#error "you must check that iopage is aligned by 8byte !!"
#endif
  FILEIO_PAGE iopage;		/* The actual buffered io page */
};
```
— `page_buffer.c:546-555`.

```c
struct fileio_page_reserved
{
  LOG_LSA lsa;			/* Log Sequence number of page, Page recovery stuff */
  INT32 pageid;			/* Page identifier */
  INT16 volid;			/* Volume identifier where the page reside */
  unsigned char ptype;		/* Page type */
  unsigned char pflag;
  INT32 p_reserve_1;
  INT32 p_reserve_2;		/* unused - Reserved field */
  INT64 tde_nonce;		/* tde nonce. atomic counter for temp pages, lsa for perm pages */
};
```
— `src/storage/file_io.h:165-176`. `pflag` carries only TDE bits today (`FILEIO_PAGE_FLAG_ENCRYPTED_AES/ARIA`,
mask `0x3`, `file_io.h:62-66`).

```c
struct fileio_page
{
  FILEIO_PAGE_RESERVED prv;	/* System page area. Reserved */
  char page[1];			/* The user page area */

  // You cannot directly access prv2 like page_ptr.prv2, since it does not point to the real location */
  FILEIO_PAGE_WATERMARK prv2;	/* system page area. It should be located at the end of page. */
};
```
— `file_io.h:186-193`. `prv2` is a **duplicate of `prv.lsa`** (`file_io.h:178-182`) physically at the page
*tail*, reachable only via `fileio_get_page_watermark_pos()` (`file_io.h:195-199`). **There is no page
checksum**: torn-write detection is this head/tail LSA watermark pair, and full-page atomicity comes from
the double write buffer (`dwb_read_page` in the fix path, `page_buffer.c:8454`).

**Sizes.** `IO_PAGESIZE = db_Io_page_size`, `DB_PAGESIZE = db_User_page_size`
(`src/storage/storage_common.h:100-101`); default and max both 16 KiB, min 4 KiB (`storage_common.h:91-93`).
`db_User_page_size = db_Io_page_size - RESERVED_SIZE_IN_PAGE` (`storage_common.c:74`) where
`RESERVED_SIZE_IN_PAGE = sizeof(FILEIO_PAGE_RESERVED) + sizeof(FILEIO_PAGE_WATERMARK)` (`storage_common.c:44`).
Callers get `DB_PAGESIZE` usable bytes starting at `iopage.page`.

Frame stride (`page_buffer.c:118-120`) is
`offsetof(PGBUF_IOPAGE_BUFFER, iopage) + SIZEOF_IOPAGE_PAGESIZE_AND_GUARD()`, the latter being
`IO_PAGESIZE`, or `IO_PAGESIZE + 8` under `CUBRID_DEBUG` (`:110-114`, guard bytes `:852-856`).

**BCB index ↔ frame index are the same index into two arrays** (`:135-139`), paired at init (`:5594-5609`);
reverse lookup `pgbuf_bcb_get_pool_index` is pointer subtraction on `BCB_table` (`:16170-16174`).
`PAGE_PTR`↔BCB conversion is pure pointer arithmetic with no lookup (`:148-169`):

```c
#define CAST_PGPTR_TO_BFPTR(bufptr, pgptr) \
  do { \
    (bufptr) = ((PGBUF_BCB *) ((PGBUF_IOPAGE_BUFFER *) \
      ((char *) pgptr - offsetof (PGBUF_IOPAGE_BUFFER, iopage.page)))->bcb); \
    assert ((bufptr) == (bufptr)->iopage_buffer->bcb); \
  } while (0)
```
This is why the CBRD-27041 copy buffer must be a *real* `<dummy BCB, iopage>` pair (`:860-875`), sized with
`offsetof` because `sizeof` under-allocates given `FILEIO_PAGE::page` is `char[1]` (`:872-875`), and
constructed with `placement_new` rather than `memset` since `PGBUF_BCB` now contains a `std::atomic`
(`:886-888`).

---

## 4. Buffer hash table and the buffer-lock chain

### 4.1 `PGBUF_BUFFER_HASH`

```c
struct pgbuf_buffer_hash
{
  pthread_mutex_t hash_mutex;	/* hash mutex for the integrity of buffer hash chain and buffer lock chain. */
  PGBUF_BCB *hash_next;		/* the anchor of buffer hash chain */
  PGBUF_BUFFER_LOCK *lock_next;	/* the anchor of buffer lock chain */
};
```
— `:575-582`. One mutex **per bucket**, guarding two chains: resident BCBs and in-flight
"I am reading this VPID" lock records.

Sizing: `HASH_SIZE_BITS 20`, `PGBUF_HASH_SIZE (1 << HASH_SIZE_BITS)` (`:295-296`).
`pgbuf_initialize_hash_table` allocates exactly that many entries **regardless of `num_buffers`**
(`:5631-5637`) and `pthread_mutex_init`s every one (`:5642`). **There is no hash-size-to-pool-size
ratio** — it is a hard 1,048,576 buckets always. DERIVED: 56 B/bucket on x86-64 glibc (40 B mutex +
2 pointers) ⇒ ≈56 MiB always allocated, and 1 Mi `pthread_mutex_destroy` calls at shutdown (`:1894-1897`).

Hash function `pgbuf_hash_func_mirror` (`:1522-1553`): reverses the low 8 bits of `volid` into the **high**
bits of the 20-bit hash, XORs with `pageid`, masks to 20 bits (`:1548-1549`) — sequential pageids in one
volume land in consecutive buckets while volumes are spread apart. Sole entry point `PGBUF_HASH_VALUE`
(`:300`). The separately exported `pgbuf_hash_vpid` (`:1561-1567`) is a **different**, simpler function used
only for the Aout `MHT_TABLE`s (`:5823`).

Lookup, `pgbuf_search_hash_chain` (`:7544-7667`), two-phase:
1. **`one_phase`** (`:7555-7599`): walk `hash_anchor->hash_next` with **no bucket mutex**. On VPID match,
   `PGBUF_BCB_TRYLOCK`; `EBUSY` ⇒ unconditional lock; other error ⇒ `goto two_phase`. After locking,
   re-verify the VPID and restart if it changed (`:7584-7590`).
2. **`two_phase`** (`:7603-7666`): take `hash_mutex` (timed into `PSTAT_PB_NUM_HASH_ANCHOR_WAITS` /
   `PSTAT_PB_TIME_HASH_ANCHOR_WAIT`, `:7608-7621`), walk again, trylock/lock the BCB *after* dropping
   `hash_mutex` (`:7630-7648`).

Documented exit contract (`:7664-7665`): **"if `bufptr != NULL` caller holds `bufptr->mutex` but not
`hash_anchor->hash_mutex`; if `bufptr == NULL` caller holds `hash_anchor->hash_mutex`."** That asymmetry is
what lets `pgbuf_fix` fall straight into `pgbuf_lock_page` on a miss.

Insert, `pgbuf_insert_into_hash_chain` (`:7786-7825`): takes `hash_mutex`, pushes at head, and
**deliberately does not release it** — release is deferred to `pgbuf_unlock_page` (`:7817-7823`).
Delete, `pgbuf_delete_from_hash_chain` (`:7832-7923`): caller holds the BCB mutex; refuses if the BCB is
flushing (`:7867-7876`); unlinks, drops `hash_mutex`, then nulls the VPID and resets
`count_fix_and_avoid_dealloc` (`:7917-7919`).

### 4.2 `PGBUF_BUFFER_LOCK` — serializing concurrent reads of the same missing page

```c
/* buffer lock record (or entry) structure
 *
 * buffer lock table is the array of buffer lock records
 * # of buffer lock records is fixed as the total # of threads.
 */
struct pgbuf_buffer_lock
{
  VPID vpid;			/* buffer-locked page id */
  PGBUF_BUFFER_LOCK *lock_next;	/* next buffer lock record */
  THREAD_ENTRY *next_wait_thrd;	/* buffer-lock waiting queue */
};
```
— `:557-569`. `thread_num_total_threads()` entries (`:5654-5686`); a thread always uses **its own slot**,
`&pgbuf_Pool.buf_lock_table[cur_thrd_entry->index]` (`:8023`). A thread can be reading at most one missing
page at a time, so per-thread indexing suffices and needs no allocator.

`pgbuf_lock_page` (`:7935-8033`), entered holding `hash_mutex`, always exits without it:
1. Walk `hash_anchor->lock_next` for this VPID (`:7957`).
2. **Found** (someone else is already reading it): push self onto that record's `next_wait_thrd` LIFO
   (`:7962-7963`), then `pgbuf_sleep(cur_thrd_entry, &hash_anchor->hash_mutex)` — locks the thread entry,
   releases `hash_mutex`, suspends as `THREAD_PGBUF_SUSPENDED` (`:11533-11540`). On an abnormal wake it
   self-removes from the queue (`:7966-8012`). Either way bumps `PSTAT_LK_NUM_WAITED_ON_PAGES` and returns
   **`PGBUF_LOCK_WAITER`** (`:8013-8014`).
3. **Not found** (I am the reader): claim own slot, set VPID, push at bucket head, release `hash_mutex`
   (`:8023-8028`), bump `PSTAT_LK_NUM_ACQUIRED_ON_PAGES`, return **`PGBUF_LOCK_HOLDER`**.

`PGBUF_LOCK_WAITER = 0, PGBUF_LOCK_HOLDER` (`:346-349`). A waiter **does not receive the page** — it is
told to retry, and `pgbuf_fix` loops back to `try_again` (`:2368-2372`) where the page is now resident.

`pgbuf_unlock_page` (`:8048-8123`): optionally re-takes `hash_mutex` (`need_hash_mutex`), unlinks the
record, releases `hash_mutex`, **then** drains the queue with `pgbuf_wakeup_uncond` — waking *all* waiters,
not one (`:8109-8114`).

---

## 5. `pgbuf_fix` — full walkthrough

### 5.0 Macro indirection and fetch modes

`page_buffer.h:277-278` (debug) vs `:327-330` (release) both define `pgbuf_fix`, dispatching to
`pgbuf_fix_debug` (with `ARG_FILE_LINE_FUNC`) or `pgbuf_fix_release`. One body, one
`#if !defined(NDEBUG)`/`#else` pair at `page_buffer.c:2205-2213`. Debug additionally records `file:line` into
`holder->fixed_at` and drives `thread_p->get_pgbuf_tracker()`. Note `pgbuf_fix_without_validation` is
declared **only in the NDEBUG branch** of the header (`:320-326`), which reads backwards.

Fetch modes (`page_buffer.h:172-187`) and what each skips:

| Mode | Skips |
|---|---|
| `OLD_PAGE` | nothing (baseline) |
| `NEW_PAGE` | **the disk read entirely** (`:8543-8576`): LSA initialized in memory, `prv.pageid/volid = -1`; also skips the `PAGE_UNKNOWN` rejection (`:2526`); bumps `show_status->num_hit` anyway (`:8574-8575`) |
| `OLD_PAGE_IF_IN_BUFFER` | the whole miss path — releases `hash_mutex`, returns NULL (`:2357-2362`); also suppresses `pgbuf_is_valid_page` errors (`:2259`) |
| `OLD_PAGE_PREVENT_DEALLOC` | nothing; *adds* `register_avoid_deallocation` before latching (`:2423-2426`), unregistered once latched (`:2511-2515`) |
| `OLD_PAGE_MAYBE_DEALLOCATED` | strict VPID check (`maybe_deallocated=true`, `:2399-2400`); downgrades `PAGE_UNKNOWN` to warning + unfix + NULL (`:2543-2551`) |
| `OLD_PAGE_DEALLOCATED` | the `PAGE_UNKNOWN` rejection (`:2527`) |
| `RECOVERY_PAGE` | `pgbuf_is_valid_page` (`:2255`) and the `PAGE_UNKNOWN` rejection (`:2529`) |

### 5.1 Prologue (`:2214-2291`)

1. `perf.perf_page_found = PERF_PAGE_MODE_OLD_IN_BUFFER` optimistically (`:2234`).
2. Reject non-READ/WRITE `request_mode` and bad `condition` with `assert_release` (`:2237-2246`).
3. `thread_p->pgbuf_fix_req_cnt++` — CBRD-26941's per-thread shard, a plain non-atomic int in
   `THREAD_ENTRY`, summed later by `pgbuf_monitor_sum_fix_req` (`:2250-2253`, `:2117-2153`).
4. Optional disk validation via `pgbuf_get_check_page_validation_level` — always false in NDEBUG
   (`:2255-2263`, `:10991-10999`).
5. `vpid->pageid < 0` ⇒ `ER_PB_BAD_PAGEID` at **fatal** severity (`:2266-2271`).
6. **An unconditional latch silently becomes conditional** when the transaction's `wait_msecs` is
   `LK_ZERO_WAIT`/`LK_FORCE_ZERO_WAIT` (`:2273-2283`).
7. `perf.is_perf_tracking` + start tick (`:2286-2291`).

### 5.2 `try_again:` and the mutex-free read fast path (`:2293-2328`)

Interrupt check first (`:2296-2304`), then:
```c
  if (request_mode == PGBUF_LATCH_READ
      && (fetch_mode == OLD_PAGE || fetch_mode == OLD_PAGE_PREVENT_DEALLOC || fetch_mode == OLD_PAGE_MAYBE_DEALLOCATED)
      && condition == PGBUF_UNCONDITIONAL_LATCH)
    {
      pgptr = pgbuf_lockfree_fix_ro (thread_p, vpid, fetch_mode);
```
— `:2309-2313`. `pgbuf_lockfree_fix_ro` (`:7669-7732`) does a **mutex-free** hash walk
(`pgbuf_search_hash_chain_no_bcb_lock`, `:7734-7749`) then CAS-increments `fcnt`, bailing out unless
`latch_mode == PGBUF_LATCH_READ && !waiter_exists && fcnt != 0` and the VPID still matches (`:7687-7691`).
On success it bumps `show_status->num_hit`, allocates/updates the holder, and jumps to `fast_path`
(`:2325-2326`) — skipping the BCB mutex, the bucket mutex, `pgbuf_latch_bcb_upon_fix`, and every check up
to `fast_path`. The `fcnt != 0` guard is the safety anchor: a BCB with a live READ latch cannot be
victimized or repurposed underneath us.

### 5.3 Hit path (`:2330-2356`)

- **Step 1** `hash_anchor = &pgbuf_Pool.buf_hash_table[PGBUF_HASH_VALUE (vpid)]` (`:2330`).
- **Step 2** `pgbuf_search_hash_chain(...)` (`:2333`) → returns holding either the BCB mutex or the bucket
  mutex (§4.1).
- **Step 3** If the found BCB carries `PGBUF_BCB_VICTIM_DIRECT_FLAG`, swap it for
  `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG` so the thread waiting to receive it as a victim knows to ask
  again (`:2334-2338`); asserted afterwards at `:2389`.
- **Step 4** `show_status->num_hit++` (`:2346`), `CUBRID_PGBUF_HIT()` under systemtap (`:2342`).

### 5.4 Miss path (`:2363-2388` → `pgbuf_claim_bcb_for_fix`, `:8348-8579`)

- **Step 5a** `pgbuf_lock_page` (§4.2) at `:8376`. If we became a **waiter**: record
  `PERF_PAGE_MODE_{NEW,OLD}_LOCK_WAIT`, set `*try_again`, return NULL (`:8376-8398`) → `pgbuf_fix` does
  `goto try_again` (`:2368-2372`). Else `PERF_PAGE_MODE_{NEW,OLD}_NO_WAIT` (`:8400-8414`).
- **Step 5b** `pgbuf_allocate_bcb` (`:8416`, defined `:8133-8335`): invalid list first (`:8172`), then
  `pgbuf_get_victim` (`:8185`) — **victim selection boundary; out of scope here**. If both fail and the
  flush daemon is available, the thread enqueues on `direct_victims.waiter_threads_{high,low}_priority`,
  wakes the flush daemon, and suspends with a `pgbuf_latch_timeout_msecs` timeout (`:8192-8300`); the
  result is run through `pgbuf_victimize_bcb` (`:8318`). Total failure ⇒ `ER_PB_ALL_BUFFERS_DIRTY`
  (`:8326-8330`). Timing: `PSTAT_PB_ALLOC_BCB` (`:8332`), `..._SEARCH_VICTIM` (`:8186`),
  `..._COND_WAIT_{HIGH,LOW}_PRIO` (`:8218`/`:8244`).
- **Step 5c** BCB init under its mutex (`:8428-8437`):
  ```c
  bufptr->vpid = *vpid;
  impl = get_impl (&bufptr->atomic_latch);
  impl.impl.latch_mode = PGBUF_NO_LATCH;
  impl.impl.waiter_exists = false;
  impl.impl.fcnt = 0;
  bufptr->atomic_latch.store (impl.raw);
  pgbuf_bcb_update_flags (thread_p, bufptr, 0, PGBUF_BCB_ASYNC_FLUSH_REQ);	/* todo: why this?? */
  pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc (bufptr, ARG_FILE_LINE);
  LSA_SET_NULL (&bufptr->oldest_unflush_lsa);
  ```
- **Step 5d** Read (non-`NEW_PAGE`, `:8439-8542`): bump `PSTAT_PB_NUM_IOREADS` and
  `show_status->num_pages_read`; try `dwb_read_page` first (`:8454`), fall back to `fileio_read`
  (`:8464-8465`). On failure: `pgbuf_put_bcb_into_invalid_list` + `pgbuf_unlock_page(..., true)` + NULL
  (`:8471-8488`). Then TDE decrypt if the page carries an algorithm (`:8492-8505`). Temporary volumes get
  their LSA re-stamped and are marked dirty when the temp-LSA marker is absent (`:8513-8521`).
- **Step 5e** `NEW_PAGE`: no read; LSA initialized in place, `prv.pageid/volid = -1` for permanent volumes
  (`:8552-8567`).
- **Step 6** back in `pgbuf_fix`, `buf_lock_acquired = true` (`:2376`).

### 5.5 Common tail (`:2389-2496`)

- **Step 7** `pgbuf_bcb_register_fix` — hot-page counter (`:2393`).
- **Step 8** `pgbuf_set_bcb_page_vpid` (`:2397`, `:5388`) — writes `prv.pageid/volid` for immature pages
  found during redo recovery.
- **Step 9** `pgbuf_check_bcb_page_vpid` (`:2400`). On mismatch: if we claimed the BCB, push it back to the
  invalid list and `pgbuf_unlock_page(..., true)`; else just unlock the BCB (`:2402-2420`). NULL.
- **Step 10** `OLD_PAGE_PREVENT_DEALLOC` ⇒ `register_avoid_deallocation` (`:2423-2426`).
- **Step 11** **`pgbuf_latch_bcb_upon_fix`** (`:2438`, §6). On error, and only if `buf_lock_acquired`,
  re-lock the BCB, invalidate it, unlock the page (`:2443-2457`).
- **Step 12** `pgbuf_add_fixed_at` in debug (`:2464`); holder wait time if `is_latch_wait` (`:2467-2472`).
- **Step 13** **Hash insertion happens only on the miss path, and only after the latch is granted**
  (`:2483-2493`):
  ```c
  if (buf_lock_acquired)
    {
      pgbuf_insert_into_hash_chain (thread_p, hash_anchor, bufptr);
      (void) pgbuf_unlock_page (thread_p, hash_anchor, vpid, false);
    }
  ```
  `insert_into_hash_chain` leaves `hash_mutex` held; `unlock_page(..., false)` consumes it. This one handoff
  both publishes the page and wakes everyone queued on the buffer lock.
- **Step 14** `CAST_BFPTR_TO_PGPTR` (`:2495`).

### 5.6 `fast_path:` (`:2496-2633`)

- **Step 15** debug watcher magic-number sweep (`:2497-2509`).
- **Step 16** `OLD_PAGE_PREVENT_DEALLOC` ⇒ unregister avoid-dealloc (`:2511-2515`); tracker increment (`:2518`).
- **Step 17** `prv.ptype == PAGE_UNKNOWN` dispatch by fetch mode (`:2521-2559`), per the §5.0 table.
- **Step 18** `show_status->num_page_request++` (`:2567`).
- **Step 19** perfmon, only when tracking (`:2570-2624`): `PSTAT_PB_NUM_FETCHES` (`:2574`);
  `perf_latch_mode` READ/WRITE (`:2575-2583`); `perf_cond_type` ∈
  {`PERF_UNCONDITIONAL_FIX_WITH_WAIT`, `PERF_UNCONDITIONAL_FIX_NO_WAIT`, `PERF_CONDITIONAL_FIX`}
  (`:2585-2604`); `perfmon_pbx_fix` (`:2606`); `perfmon_pbx_lock_acquire_time` (`:2609`),
  `..._hold_acquire_time` (`:2592`), `..._fix_acquire_time` (`:2619`), plus a direct add into
  `pstat_Metadata[PSTAT_PB_PAGE_FIX_ACQUIRE_TIME_10USEC].start_offset` (`:2621-2622`).
- **Step 20** vacuum workers clear `PGBUF_BCB_TO_VACUUM_FLAG` on fix (`:2626-2629`).

**Hit/miss counting caveat.** `show_status->num_hit` is bumped in three places — lock-free fast path
(`:2325`), hash hit (`:2346`), and inside `pgbuf_claim_bcb_for_fix` for `NEW_PAGE` (`:8575`) — while
`num_page_request` is bumped once (`:2567`). So a `NEW_PAGE` fix counts as a hit. The perfmon-side ratio
`(NUM_FETCHES - NUM_IOREADS)/NUM_FETCHES` (`perf_monitor.c:1913-1915`) does not have this problem.

---

## 6. Latching

### 6.1 Modes and conditions

```c
typedef enum:uint16_t
{
  PGBUF_NO_LATCH = 0,
  PGBUF_LATCH_READ = 1,
  PGBUF_LATCH_WRITE = 2,
  PGBUF_LATCH_FLUSH = 3,	/* this is only used as block mode. page can never be fixed with flush latch mode. */
  PGBUF_LATCH_INVALID = 4
} PGBUF_LATCH_MODE;
```
— `page_buffer.h:190-197`. `PGBUF_LATCH_FLUSH` is a **wait-queue-only** mode: a thread parks requesting
FLUSH and is deliberately not woken by the normal reader/writer wakeup (`page_buffer.c:7449-7457`).
`PGBUF_LATCH_INVALID` marks a BCB in the invalid list (`:8916`) and is the init value (`:5515`).
`PGBUF_UNCONDITIONAL_LATCH`/`PGBUF_CONDITIONAL_LATCH` at `page_buffer.h:199-203`.

### 6.2 `pgbuf_latch_bcb_upon_fix` grant rules (`:6246-6583`)

Entered holding the BCB mutex; a `scope_exit unlock_BCB` guarantees release on every early exit
(`:6257-6260`). CBRD-27084 added a self-heal for a stranded `waiter_exists == true` on an idle BCB with an
empty queue, because the idle-grant CAS below *force-expects* `waiter_exists == false` and would otherwise
spin forever while holding the mutex (`:6269-6283`).

One CAS loop (`:6285-6402`) decides:
- **Idle** (`buf_lock_acquired || latch_mode == PGBUF_NO_LATCH`, `:6293-6296`): expected value forced to
  `{NO_LATCH, waiter_exists=false, fcnt=0}`, new value `{request_mode, fcnt=1}` (`:6310-6318`). A
  fresh BCB from the miss path always lands here.
- **Case 1 — reader joining a READ latch** (`:6326-6349`): granted (`fcnt++`) if `!waiter_exists`. With
  waiters present, granted **only if this thread is already a holder**; otherwise it blocks. That is the
  writer-starvation guard *and* the self-deadlock escape: new readers queue behind a waiting writer, but
  existing holders may re-latch.
- **Case 2-1 — holder on a WRITE-latched page** (`:6356-6360`): always granted, `fcnt++` (recursive fix).
- **Case 2-2 — holder upgrading READ→WRITE** (`:6362-6388`): if `fcnt == holder->fix_count` (sole reader),
  in-place upgrade with `fcnt = 1`. Otherwise conditional ⇒ fail; unconditional ⇒ `promote_needed`,
  subtract the holder's own fixes from `fcnt`, set `waiter_exists`.
- **Case 3 — not a holder, incompatible** (`:6390-6395`): block, set `waiter_exists`.

Post-CAS: idle grant allocates a fresh holder with `fix_count = 1` and seeds
`perf_stat.{hold_has_read_latch,hold_has_write_latch,dirty_before_hold}` (`:6406-6441`); normal grant does
`holder->fix_count++` or allocates one (`:6443-6487`); `promote_needed` folds the holder's whole fix count
into `request_fcnt` and **removes the holder entry** — the page is genuinely unfixed by this thread — before
blocking (`:6488-6503`); conditional rejection raises `ER_LK_PAGE_TIMEOUT` with client name/host/pid under
`LK_ZERO_WAIT`, else fails silently (`:6509-6543`); the blocking path calls `pgbuf_block_bcb`, then
allocates a holder with `fix_count = request_fcnt` and sets `*is_latch_wait = true` (`:6544-6582`).
`SA_MODE` has `assert (0)` on the blocking path (`:6505-6507`).

### 6.3 Wait queue and blocking (`pgbuf_block_bcb`, `:6995-7114`)

A singly linked list of `THREAD_ENTRY` through `next_wait_thrd`, rooted at `bufptr->next_wait_thrd`,
protected by the BCB mutex. The waiter publishes intent in its own thread entry:
```c
  cur_thrd_entry->request_latch_mode = request_mode;
  cur_thrd_entry->request_fix_count = request_fcnt;	/* SPECIAL_NOTE */
```
— `:7014-7015`. Promoters go at the **head** with `assert` that only one exists (`:7017-7026`); everyone
else appends at the tail (`:7027-7044`). `PGBUF_LATCH_FLUSH` waiters use an **untimed** suspend (`:7051`),
carrying the honest comment "is it safe to use infinite wait instead of timed sleep?" (`:7048`). Everyone
else goes through `pgbuf_timed_sleep` (`:7101`), prefaced by the design admission:

```c
      /*
       * We do not guarantee that there is no deadlock between page latches.
       * So, we made a decision that when read/write buffer fix request is
       * not granted immediately, block the request with timed sleep method.
       * That is, unless the request is not waken up by other threads within
       * some time interval, the request will be waken up by timeout.
       * When the request is waken up, the request is treated as a victim.
       */
```
— `:7093-7100`. **There is no page-latch deadlock detector**; page-latch deadlock is resolved purely by
timeout and the timed-out thread is the designated victim. (Row/object locks *do* have a wait-for graph, in
`src/transaction/wait_for_graph.c`.)

### 6.4 Timeout (`pgbuf_timed_sleep`, `:7232-7394`)

Locks the thread entry, releases the BCB mutex (`:7247-7248`). **The timeout is not the transaction's
`wait_msecs`**: unless the transaction is zero-wait, the value is overwritten with the global
`pgbuf_latch_timeout_msecs` (`:7250-7262`), default 300,000 ms (`:107`), set from
`PRM_ID_PAGE_LATCH_TIMEOUT_IN_MSECS` at init (`:1673`). Then
`thread_suspend_timeout_wakeup_and_unlock_entry(..., THREAD_PGBUF_SUSPENDED)` (`:7273`).

- Normal wake (`resume_status == THREAD_PGBUF_RESUMED`) ⇒ `NO_ERROR` (`:7284-7288`).
- Interrupted ⇒ clear `request_latch_mode`, run `pgbuf_timed_sleep_error_handling`, raise `ER_INTERRUPTED`
  (`:7290-7300`).
- `ER_CSS_PTHREAD_COND_TIMEDOUT` ⇒ if the transaction is inactive, loop to `try_again` (`:7311-7314`);
  otherwise this thread becomes the "buffer page deadlock victim by timeout" (`:7316-7329`). It sets
  `request_latch_mode = PGBUF_NO_LATCH` **before** releasing the entry mutex; the comment stresses that
  ordering (`:7317-7321`) because `PGBUF_NO_LATCH` in the queue is the signal that this waiter gave up
  (`:7433-7434`, `:7468`).
- `er_set_return` (`:7339-7393`): `LK_INFINITE_WAIT` ⇒ `ER_PAGE_LATCH_TIMEDOUT` then
  `ER_LK_UNILATERALLY_ABORTED`; finite wait ⇒ `ER_PAGE_LATCH_TIMEDOUT` then `ER_LK_PAGE_TIMEOUT`. Note the
  live `/* FIXME: remove it. temporarily added for debugging */ assert (0);` at `:7345-7346` — in a debug
  build an infinite-wait page-latch timeout **aborts the server**.

`pgbuf_timed_sleep_error_handling` (`:7143-7224`) removes the thread from the queue and, if it was the
head, opportunistically grants the latch to following compatible readers (`:7180-7221`). It returns with
the BCB mutex **held** in all three cases including the "empty queue" early return at `:7157`; the caller
unlocks (`:7296`, `:7348`).

### 6.5 Wakeup on unlatch (`pgbuf_wakeup_reader_writer`, `:7403-7535`)

Called from `pgbuf_unlatch_bcb_upon_unfix` only when the fix count reached 0 (`:6802-6804`), BCB mutex held,
asserted `{NO_LATCH, fcnt == 0}` (`:7415`). In-code policy (`:7419-7427`):

```c
  /* how it works:
   *
   * we can have here multiple types of waiters:
   * 1. PGBUF_NO_LATCH - thread gave up waiting for bcb (interrupted or timed out). just remove it from list.
   * 2. PGBUF_LATCH_FLUSH - thread is waiting for bcb to be flushed. this is not actually a latch and thread is not
   *    awaken here. bcb must be either marked to be flushed asynchronously or is currently in process of being flushed.
   * 3. PGBUF_LATCH_READ - multiple threads can be waked at once (all readers at the head of the list).
   * 4. PGBUF_LATCH_WRITE - only first waiter is waked.
   */
```

Walk the queue: drop `PGBUF_NO_LATCH` entries; skip FLUSH entries in place; for each grantable waiter CAS
`fcnt += request_fix_count` and `latch_mode = request_latch_mode` (`:7484-7485`), unlink, `pgbuf_wakeup`
(`:7527`); stop at the first WRITE waiter once a latch exists (`:7496-7501`). Then the CBRD-27084
reconciliation:
```c
  if (!pgbuf_is_exist_blocked_reader_writer (bufptr))
    {
      set_waiter_exists (&bufptr->atomic_latch, false);
    }
```
— `:7531-7534`, mirrored in the FLUSH-interrupt path (`:7077-7080`).
`pgbuf_is_exist_blocked_reader_writer` (`:10964-10984`) ignores FLUSH waiters, so a BCB with only flush
waiters reports `waiter_exists = false` — which is exactly what re-enables the lock-free read fast path.

### 6.6 Read→write promotion (`pgbuf_promote_read_latch`, `:2796-3009`)

CAS loop at `:2857-2917`:
- `holder->fix_count == fcnt` (sole reader) ⇒ in-place `latch_mode = PGBUF_LATCH_WRITE`, no wait
  (`:2877-2881`); aborts with `ER_PAGE_LATCH_PROMOTE_FAIL` if the queue head is another promoter
  (`:2865-2874`).
- Otherwise: immediate failure under `PGBUF_PROMOTE_ONLY_READER` or if another promoter is queued
  (`:2885-2901`); under `PGBUF_PROMOTE_SHARED_READER` it drops its fixes, removes its holder, sets
  `thread_p->wait_for_latch_promote = true`, and re-enters via `pgbuf_block_bcb(..., as_promote=true)` to
  become the queue **head** (`:2919-2948`). Explicit comment "at this point the page is unfixed" (`:2937`)
  — the caller's `PAGE_PTR` may point at different content afterwards.
- `SA_MODE`: unconditional `set_latch (WRITE)` (`:3006`).

---

## 7. `pgbuf_unfix` — walkthrough (`:3018-3223`)

1. `CAST_PGPTR_TO_BFPTR`, assert non-NULL VPID (`:3041-3042`).
2. Debug: locate holder, sweep watcher magic numbers (`:3055-3064`). Release: NULL check only (`:3066-3069`).
3. `perf_page_type` if tracking (`:3110-3114`).
4. **`pgbuf_unlatch_thrd_holder`** (`:3116`, defined `:6083-6133`): copy out `holder->perf_stat`,
   `holder->fix_count--`, and at zero call `pgbuf_remove_thrd_holder` (`:6111-6126`) which returns the
   entry to the thread's free list and unlinks it (`:6144-6224`). This happens **before** the BCB-side
   `fcnt` is touched.
5. `perfmon_pbx_unfix` with `PERF_HOLDER_LATCH_{READ,WRITE,MIXED}` derived from holder stats (`:3120-3137`).
6. **Lock-free unfix attempt**: `pgbuf_lockfree_unfix_ro` (`:3139-3142`, defined `:7751-7774`)
   CAS-decrements `fcnt` and returns, **skipping the BCB mutex and all LRU bookkeeping**, provided
   `latch_mode == PGBUF_LATCH_READ && !waiter_exists && fcnt != 1`. The `fcnt != 1` guard is what forces the
   last unfixer down the slow path so the zero-fix-count work actually runs.
7. Otherwise `PGBUF_BCB_LOCK` (`:3144`), tracker decrement (`:3147`), then
   **`pgbuf_unlatch_bcb_upon_unfix`** (`:3149`), which releases the BCB mutex itself.

### 7.1 `pgbuf_unlatch_bcb_upon_unfix` (`:6605-6832`)

CAS loop (`:6625-6652`) decrements `fcnt`, captures
`blocked_reader_writer = impl_orig.impl.waiter_exists`, and at zero sets `latch_mode = PGBUF_NO_LATCH` and
`is_zero_fcnt`. A negative result is treated as corruption: `assert(false)`, `ER_PB_UNFIXED_PAGEPTR`, and
the latch is force-reset to `{NO_LATCH, fcnt=0, waiter_exists=false}` (`:6638-6649`).

**At fix count zero** (`:6662-6805`):
- Assert `oldest_unflush_lsa` null-or-dirty (`:6665`).
- `pgbuf_bcb_should_be_moved_to_bottom_lru` (the `MOVE_TO_LRU_BOTTOM` flag set by `pgbuf_dealloc_page`) ⇒
  `pgbuf_move_bcb_to_bottom_lru` (`:6670-6673`).
- **Else, only if `blocked_reader_writer == false`** (`:6674`), do the LRU bookkeeping — a deliberate
  short-circuit: with a waiter present the unfixer skips *all* LRU work, including the
  `pgbuf_pg_unfix_cnt` shard bump (`:6677-6680`), to hand the page over faster. Zone dispatch (hook
  functions only; zone logic is out of scope): `PGBUF_VOID_ZONE` → `pgbuf_unlatch_void_zone_bcb`
  (`:6698`); `LRU_1` → nothing or `pgbuf_lru_move_from_private_to_shared` (`:6713`) plus
  `pgbuf_bcb_register_hit_for_lru` (`:6726`); `LRU_2` → `pgbuf_lru_boost_bcb` if `PGBUF_IS_BCB_OLD_ENOUGH`
  (`:6749`); `LRU_3` → for vacuum threads try `pgbuf_assign_direct_victim` (`:6769`), otherwise always
  `pgbuf_lru_boost_bcb` (`:6791`). Vacuum workers and temporary-volume pages are excluded from all boosting
  by `PGBUF_SHOULD_IGNORE_UNFIX` (`:288-293`) and only bump `*_KEEP_VAC` counters.
- `pgbuf_wakeup_reader_writer` (`:6803`, §6.5).

**Async flush tail** (`:6809-6829`): with `PGBUF_BCB_ASYNC_FLUSH_REQ` set, call
`pgbuf_bcb_safe_flush_force_unlock(..., synchronous=false)` and **swallow any error** (`er_clear()`,
`:6822-6823`). Otherwise just `PGBUF_BCB_UNLOCK`. Either way the mutex is released exactly once.

### 7.2 Dirtying is a separate act from unfixing

`pgbuf_set_dirty` (`:4868-4905`) → `pgbuf_set_dirty_buffer_ptr` (`:11592-11611`): calls
`pgbuf_bcb_set_dirty`, asserts the page is WRITE-latched (`:11602`), sets
`holder->perf_stat.dirtied_by_holder`, bumps `PSTAT_PB_NUM_DIRTIES`. With `free_page == FREE` it then calls
`pgbuf_unfix` (`:4901-4904`) — the `pgbuf_set_dirty_and_free` idiom (`page_buffer.h:388`).

---

## 8. `pgbuf_ordered_fix`

### 8.1 Why it exists

Page latches have no deadlock detection (§6.3), so multi-page latching must be *ordered*.
`pgbuf_ordered_fix` enforces a total order over the pages a transaction holds (`:12185-12200`):

```c
 * pgbuf_ordered_fix () - Fix page in VPID order; other previously fixed pages may be unfixed and re-fixed again.
 ...
 *  Note: If fails to re-fix previously fixed pages (unfixed with this request), the requested page is unfixed
 *        (if fixed) and error is returned. In such case, older some pages may be re-fixed, other not : the caller
 *	  should check page pointer of watchers before using them in case of error.
```

It applies only to heap and overflow pages — `PGBUF_IS_ORDERED_PAGETYPE(ptype)` is
`PAGE_HEAP || PAGE_OVERFLOW` (`page_buffer.h:166-167`) — i.e. the classic heap-home vs. heap-overflow
ordering hazard.

The sort key is **not plain VPID**: `pgbuf_compare_hold_vpid_for_sort` (`:12128-12183`) orders by
`(group_id, rank, vpid)` with NULL groups last (`:12142-12150`). `group_id` is the heap header VPID
(`PGBUF_WATCHER_SET_GROUP`, `page_buffer.h:97-109`) and `rank` is
`PGBUF_ORDERED_HEAP_HDR < ..._HEAP_NORMAL < ..._HEAP_OVERFLOW` (`page_buffer.h:222-229`). So header before
normal before overflow, VPID order only as a tiebreak — "this allows us to keep pages with more priority
fixed even when VPID order would require to make unfix, reorder and fix in VPID order"
(`page_buffer.h:219-221`).

### 8.2 `PGBUF_WATCHER`

```c
struct pgbuf_watcher
{
  PAGE_PTR pgptr;
  PGBUF_WATCHER *next;
  PGBUF_WATCHER *prev;
  PGBUF_ORDERED_GROUP group_id;	/* VPID of group (HEAP header) */
  unsigned latch_mode:7;
  unsigned page_was_unfixed:1;	/* set true if any refix occurs in this page */
  unsigned initial_rank:4;	/* rank of page at init (before fix) */
  unsigned curr_rank:4;		/* current rank of page (after fix) */
#if !defined (NDEBUG)
  unsigned int magic;
  char watched_at[128];
  char init_at[256];
#endif
};
```
— `page_buffer.h:234-249`. Watchers are **caller-owned** (usually stack), initialized by
`PGBUF_INIT_WATCHER(w, rank, hfid)` (`page_buffer.h:133-160`), and chained onto the holder
(`first_watcher`/`last_watcher`/`watch_count`, `page_buffer.c:473-475`) by
`pgbuf_add_watch_instance_internal` (`:13480-13558`). `page_was_unfixed` is the caller's "your page pointer
may be stale, re-validate your state" signal. `pgbuf_attach_watcher` (`:13559-13607`) retrofits one onto an
already-fixed page; `pgbuf_ordered_unfix` (`:13413-13469`) removes the watcher then delegates to plain
`pgbuf_unfix`; `pgbuf_ordered_unfix_and_init` (`page_buffer.h:79-92`) falls back to `pgbuf_unfix_and_init`
when the watcher is NULL.

### 8.3 Walkthrough (`:12202-13014`)

1. Assert the watcher is clean (`pgptr == NULL`, `:12247-12252`); set `curr_rank` = `HEAP_HDR` if the
   requested VPID *is* the group id, else `initial_rank` (`:12254-12262`).
2. Latch condition: **`PGBUF_UNCONDITIONAL_LATCH` only if the thread holds no other page** (or only this
   one); otherwise `PGBUF_CONDITIONAL_LATCH` (`:12277-12286`).
3. Try the fix (`:12288-12294`). **Success** ⇒ find the holder, derive `group_id` from an existing watcher
   or from the heap header via `pgbuf_get_groupid_and_unfix`, attach the watcher, done (`:12296-12339`).
   This is the common, zero-cost path.
4. **Failure** ⇒ `ER_PB_BAD_PAGEID`/`ER_INTERRUPTED` propagate (`:12347-12357`); zero-wait transactions give
   up with `ER_LK_PAGE_TIMEOUT` (`:12359-12373`); a failed *unconditional* attempt cannot be retried
   (`:12375-12384`). Otherwise the error is cleared and reordering begins (`:12386-12387`).
5. Collect one `PGBUF_HOLDER_INFO` per watched page (`:12396-12600`). Validation is aggressive:
   `holder->fix_count != holder->watch_count` ⇒ `ER_FAILED_ASSERTION` (`:12452-12460`); watchers on one page
   must agree on rank and group id or `ER_PB_ORDERED_INCONSISTENCY` at **fatal** severity (`:12484-12512`).
   Only pages sorting *after* the requested page (`diff < 0`) are saved (`:12557-12575`).
6. **Unfix** those (`:12602-12669`): `pgbuf_bcb_register_avoid_deallocation` each (`:12637` — exactly the
   case §2.3's tolerant unregister exists for), unfix `holder->fix_count` times in a loop (`:12639-12642`),
   and per watcher `PGBUF_CLEAR_WATCHER` + `page_was_unfixed = true` (`:12661-12662`).
7. If the group id was unknown, re-fix the requested page unconditionally just to read its HFID, then unfix
   again (`:12679-12722`). The comment at `:12671-12678` documents the residual hazard: if the class is
   dropped and its HFID page reused between reading the page and reading the schema, a page deadlock is
   still possible in the worst case.
8. `qsort (ordered_holders_info, saved_pages_cnt, ..., pgbuf_compare_hold_vpid_for_sort)` (`:12767`).
9. **Re-fix in order**, all `PGBUF_UNCONDITIONAL_LATCH` (`:12771-12792`); non-requested pages as `OLD_PAGE`
   with their aggregated latch mode (`:12780-12781`). A re-fix failure on a non-requested page becomes
   `ER_PB_ORDERED_REFIX_FAILED` (`:12820-12826`). Each success gets
   `pgbuf_bcb_unregister_avoid_deallocation` (`:12881`) and, in debug, a page-type re-check against the
   pre-unfix type (`:12885`).

**Stack cost, DERIVED:** `PGBUF_HOLDER_INFO` embeds `PGBUF_WATCHER *watcher[PGBUF_MAX_PAGE_WATCHERS]` = 64
pointers (`:426-436`, `:317`), and `ordered_holders_info[PGBUF_MAX_PAGE_FIXED_BY_TRAN]` is 64 of them on
the stack (`:12220`, `:319`) ⇒ roughly 64 × ~544 B ≈ **35 KiB of stack per `pgbuf_ordered_fix` frame**.

---

## 9. Fix vs. latch vs. pin semantics

**A "fix" is three things at once**, living in three places:

| Aspect | Where | Meaning |
|---|---|---|
| Latch | `bcb->atomic_latch.impl.latch_mode` | READ (shared) or WRITE (exclusive) access to content. |
| Reference count | `bcb->atomic_latch.impl.fcnt` | Global; **> 0 means unvictimizable** (`pgbuf_is_bcb_fixed_by_any`, `:9210`). |
| Per-thread claim | `holder->fix_count` | This thread's share. Sum over holders == `fcnt`. |

There is **no separate pin count**. Victimization protection = `fcnt > 0` plus the flag mask of §2.2.
`pgbuf_get_fix_count` reads `fcnt` (`:14978-14988`); `pgbuf_get_hold_count` reads the thread's
`num_hold_cnt` (`:14996-15001`); `pgbuf_get_latch_mode` reads the latch field with the comment "Does not
need to hold mutex since the page is fixed" (`:5213-5230`).

**`avoid_dealloc` is a different guarantee.** It protects a page from being *logically deallocated* by
vacuum while temporarily unfixed, and explicitly does **not** prevent victimization:

```c
		   * note: avoid deallocation count is supposed to prevent vacuum workers from deallocating these pages.
		   *       so, victimizing a bcb marked to avoid deallocation is not perfectly safe. however, the likelihood of
		   *       page really getting deallocated is ... almost zero. the alternative of avoiding victimization when
		   *       bcb's are marked for deallocation is much more complicated and poses serious risks (what if we leak
		   *       the counter and prevent bcb from being victimized indefinitely?). so, we prefer the existing risks.
```
— `:16218-16222`. Exposed as `pgbuf_has_prevent_dealloc` (`:14668-14681`).

Deallocation, `pgbuf_dealloc_page` (`:15117-15171`): asserts `fcnt == 1`, resets `prv.ptype = PAGE_UNKNOWN`
and `prv.pflag = 0`, sets `DIRTY | MOVE_TO_LRU_BOTTOM`, unfixes (`:15134-15169`). The BCB is deliberately
**not** invalidated — invalidation would force a synchronous flush, so instead the page sinks to the LRU
bottom for asynchronous flush and victimization (`:15127-15131`).

### 9.1 Holder bookkeeping

`PGBUF_HOLDER_ANCHOR` is padded to exactly one cache line, enforced:
```c
  /* Pad to a full cache line: num_hold_cnt/thrd_hold_list are written on every fix/unfix, so an
   * unpadded entry false-shares with adjacent threads'. alignof stays 8 -> plain malloc still valid. */
  char m_pad[64 - 2 * sizeof (int) - 2 * sizeof (PGBUF_HOLDER *)];
};

static_assert (sizeof (PGBUF_HOLDER_ANCHOR) == 64, "pgbuf_holder_anchor must be exactly one 64B cache line; fix m_pad");
```
— `:485-490`. `THREAD_ENTRY::m_holder_anchor` caches the pointer so the fix path skips re-indexing
(`:1511-1514`, `:5973-5977`, `:6056-6059`).

Each thread starts with `PGBUF_DEFAULT_FIX_COUNT` 7 holders (`:90`, `:5914-5916`); overflow comes from the
global `free_holder_set` in blocks of `PGBUF_NUM_ALLOC_HOLDER` 10 (`:94`, `:5991-6018`) and is **never
returned to that global pool** — only to the owning thread's free list.

**Debug memory cost, DERIVED:** `PGBUF_HOLDER` embeds `char fixed_at[64 * 1024]` in non-NDEBUG builds
(`:468-471`), written by `pgbuf_add_fixed_at` which asserts the accumulated string stays under 64 KiB
(`:11489-11529`, `:11524`). So `thrd_reserved_holder` = `threads × 7 × sizeof(PGBUF_HOLDER)` (`:5895-5896`)
is roughly **450 KiB per thread** in a debug build vs. a few hundred bytes in release.

---

## 10. Sizing and initialization

`pgbuf_initialize` (`:1599-1869`):
1. `pgbuf_flags_mask_sanity_check()` (`:1602`) — before anything else.
2. Zero every member individually (`:1604-1662`), including the buggy memset at `:1624` (§1.1).
3. `num_buffers = prm_get_integer_value (PRM_ID_PB_NBUFFERS)`, floored at
   `PGBUF_MINIMUM_BUFFERS = MAX_NTRANS * 10` (`:1664-1672`, `:84`), where
   `MAX_NTRANS = css_get_max_conn() + 1` (`src/transaction/log_common_impl.h:51-52`). The parameter is
   `data_buffer_pages` (`src/base/system_parameter.c:140`), default 32,768
   (`system_parameter.c:1171-1173`), flagged `PRM_DEPRECATED` — the user-facing knob is `data_buffer_size`
   (`PRM_ID_PAGE_BUFFER_SIZE`), a duplicate parameter of it (`system_parameter.c:5453`).
   32,768 × 16 KiB = 512 MiB default.
4. `pgbuf_latch_timeout_msecs` from `PRM_ID_PAGE_LATCH_TIMEOUT_IN_MSECS` (`:1673`); `pgbuf_Monitor_locks`
   forced **true** in debug builds (`:1674-1680`).
5. LRU zone ratios from `PRM_ID_PB_LRU_HOT_RATIO`/`PRM_ID_PB_LRU_BUFFER_RATIO`, clamped to `[0.05, 0.90]`
   and to `ratio1 + ratio2 <= 0.95` (`:1683-1691`, constants `:342-343`).
6. Sub-initializers in order (`:1694-1743`): quota params → BCB table → hash table → lock table → LRU lists
   → invalid list → Aout list → thread holders → page quota → page monitor.

| Structure | Count | Line |
|---|---|---|
| `BCB_table` | `num_buffers × sizeof(PGBUF_BCB)` | 5519-5525 |
| `iopage_table` | `num_buffers × PGBUF_IOPAGE_BUFFER_SIZE` | 5533-5543 |
| `buf_hash_table` | **fixed `1<<20`** | 5631-5632 |
| `buf_lock_table` | `thread_num_total_threads()` | 5662-5668 |
| `buf_LRU_list` | `PGBUF_TOTAL_LRU_COUNT` (shared + private) | 5715 |
| shared LRU count | `PRM_ID_PB_NUM_LRU_CHAINS`, else `MAX_NTRANS` capped so each list has ≥ 1000 pages (`PGBUF_MIN_PAGES_IN_SHARED_LIST`), floor 4 | 5698-5712, 1027 |
| Aout | `num_buffers × PRM_ID_PB_AOUT_RATIO`, capped 32,768 | 5767-5782 |
| Aout hash tables | `max(max_count / 1000, 1)` `MHT_TABLE`s | 5809-5829, 934 |
| `thrd_reserved_holder` | `threads × 7 × sizeof(PGBUF_HOLDER)` | 5895-5896 |
| `victim_cand_list` | `num_buffers` | 1747-1748 |
| `seq_chkpt_flusher` | `min(0.25 × num_buffers, 65536)` | 1761-1770 |
| `direct_victims.bcb_victims` | `thread_num_total_threads()` | 1776-1783 |
| high-prio waiter queue | `thread_num_total_threads()` | 1786-1787 |
| low-prio waiter queue | `2 × thread_num_total_threads()` | 1796-1797 |
| `flushed_bcbs` | 8,192 | 1806, 751 |
| `*_lrus_with_victims` | `2 ×` respective list count | 1818-1837 |
| `show_status` | `cub_aligned_alloc(64, (threads + 1) × sizeof(PGBUF_STATUS))` | 1846-1855 |

`MEM_SIZE_IS_VALID` guards both large allocations and reports `ER_PRM_BAD_VALUE` naming
`"data_buffer_pages"` on overflow (`:5520-5523`, `:5534-5541`). Per-BCB init (`:5555-5616`): mutex init,
`owner_mutex = -1`, NULL VPID, `placement_new (&bufptr->atomic_latch, 0)` then store
`{PGBUF_LATCH_INVALID, false, 0}` (`:5512-5517`, `:5563-5564`), chain into the invalid list,
`flags = PGBUF_BCB_INIT_FLAGS`, `prv.pageid = prv.volid = -1`, `prv.ptype = PAGE_UNKNOWN`.

---

## 11. Observability

### 11.1 Counters on the fix/unfix/latch paths

| `PSTAT_*` | Bumped at | `pstat_Metadata` / statdump name |
|---|---|---|
| `PSTAT_PB_NUM_FETCHES` | `:2574` | `Num_data_page_fetches` (`perf_monitor.c:209`) |
| `PSTAT_PB_NUM_DIRTIES` | `:11610` | `Num_data_page_dirties` (`perf_monitor.c:210`) |
| `PSTAT_PB_NUM_IOREADS` | `:8442` | `Num_data_page_ioreads` (`perf_monitor.c:211`) |
| `PSTAT_PB_NUM_IOWRITES` | flush paths | `Num_data_page_iowrites` (`perf_monitor.c:212`) |
| `PSTAT_PB_PAGE_FIX_ACQUIRE_TIME_10USEC` | `:2619-2622` | `Data_page_fix_acquire_time_msec` (`perf_monitor.c:444`) |
| `PSTAT_PB_PAGE_HOLD_ACQUIRE_TIME_10USEC` | `:2592` | `Data_page_fix_hold_acquire_time_msec` (`perf_monitor.c:443`) |
| `PSTAT_PB_PAGE_LOCK_ACQUIRE_TIME_10USEC` | `:2609` | `Data_page_fix_lock_acquire_time_msec` (`perf_monitor.c:442`) |
| `PSTAT_PB_NUM_HASH_ANCHOR_WAITS` | `:7619`, `:7810`, `:7863`, `:7983`, `:8075` | `Num_data_page_hash_anchor_waits` (`perf_monitor.c:477`) |
| `PSTAT_PB_TIME_HASH_ANCHOR_WAIT` | same sites | `Time_data_page_hash_anchor_wait` (`perf_monitor.c:478`) |
| `PSTAT_LK_NUM_ACQUIRED_ON_PAGES` | `:8031` | `Num_page_locks_acquired` (`perf_monitor.c:237`) |
| `PSTAT_LK_NUM_WAITED_ON_PAGES` | `:8005`, `:8013` | `Num_page_locks_waits` (`perf_monitor.c:244`) |
| `PSTAT_PB_ALLOC_BCB` | `:8332` | `alloc_bcb`, counter+timer (`perf_monitor.c:495`) |
| `PSTAT_PB_ALLOC_BCB_SEARCH_VICTIM` | `:8186`, `:8309` | `alloc_bcb_search_victim` (`perf_monitor.c:496`) |
| `PSTAT_PB_ALLOC_BCB_COND_WAIT_HIGH_PRIO` | `:8218`, `:8240` | `alloc_bcb_cond_wait_high_prio` (`perf_monitor.c:497`) |
| `PSTAT_PB_ALLOC_BCB_COND_WAIT_LOW_PRIO` | `:8244` | `alloc_bcb_cond_wait_low_prio` (`perf_monitor.c:498`) |
| `PSTAT_PB_ALLOC_BCB_PRIORITIZE_VACUUM` | `:8210` | `Num_alloc_bcb_prioritize_vacuum` (`perf_monitor.c:499`) |
| `PSTAT_PB_VICTIM_USE_INVALID_BCB` | `:8893` | `Num_victim_use_invalid_bcb` (`perf_monitor.c:500`) |
| `PSTAT_PB_UNFIX_LRU_{ONE,TWO,THREE}_*` | `:6707`–`:6792` | LRU-unfix breakdown (other agent's scope) |

Enum declarations: `PSTAT_PB_NUM_FETCHES` `perf_monitor.h:286`, `..._NUM_DIRTIES` `:287`,
`..._NUM_IOREADS/IOWRITES` `:288-289`, `PSTAT_LK_NUM_ACQUIRED_ON_PAGES` `:314`,
`PSTAT_LK_NUM_WAITED_ON_PAGES` `:320`, the three `*_ACQUIRE_TIME_10USEC` `:510`/`:512`/`:514`,
hash-anchor pair `:552-553`, `PSTAT_PB_ALLOC_BCB*` `:570-574`,
`PSTAT_PB_VICTIM_USE_INVALID_BCB` `:575`. Hit ratio is computed, not stored:
`(NUM_FETCHES - NUM_IOREADS)/NUM_FETCHES` at `perf_monitor.c:1913-1915`.

### 11.2 Multi-dimensional page-fix statistics

`perfmon_pbx_fix(thread_p, page_type, page_found_mode, latch_mode, cond_type)` (`page_buffer.c:2606`) crosses
four dimensions, carried by `PGBUF_FIX_PERF` (`:968-983`). `page_found_mode` values assigned in the fix
path: `PERF_PAGE_MODE_OLD_IN_BUFFER` (default, `:2234`), `..._{NEW,OLD}_LOCK_WAIT` (`:8389`, `:8393`),
`..._{NEW,OLD}_NO_WAIT` (`:8407`, `:8411`). `pgbuf_get_page_type_for_stat` maps `prv.ptype` to
`PERF_PAGE_TYPE`, with extra B-tree sub-classification when
`PERFMON_ACTIVATION_FLAG_DETAILED_BTREE_PAGE` is on (`:15009-15019`). Detailed sub-counters are gated by
`perfmon_is_perf_tracking_and_active (PERFMON_ACTIVATION_FLAG_PB_HASH_ANCHOR)` (`:7608`) and
`..._PB_VICTIMIZATION` (`:8139`).

### 11.3 `SHOW PAGE BUFFER STATUS`

```c
struct alignas (64) pgbuf_status
{
  unsigned long long num_hit;
  unsigned long long num_page_request;
  unsigned long long num_pages_created;
  unsigned long long num_pages_written;
  unsigned long long num_pages_read;
  unsigned int num_flusher_waiting_threads;
  unsigned int dummy;
};
```
— `:393-402`. One `alignas(64)` slot per thread, indexed `thread_get_entry_index(thread_p)` (`:2232`,
`:8140`, `:8356`), backed by `cub_aligned_alloc(64, ...)` (`:1846-1848`). CBRD-26898: deliberately
non-atomic and unshared so the per-fix bump never contends. Snapshot via `pgbuf_peek_stats`
(`:14683-14688`), which scans the whole BCB table; `SHOW` entry point `pgbuf_start_scan`
(`page_buffer.h:510`).

Minor doc drift: `page_buffer.h:452-453` declares the 13th parameter as `alloc_bcb_waiter_low` while the
definition at `page_buffer.c:14687` names it `flushed_bcbs_waiting_direct_assign`. Arity and types match so
it compiles; the header name is stale.

---

## 12. Surprising / little-known facts

1. The buffer hash table is a hard-coded 1 Mi buckets with 1 Mi mutexes, independent of pool size
   (`:295-296`, `:5631-5642`); ≈56 MiB always (DERIVED) and 1 Mi `pthread_mutex_destroy` at shutdown (`:1894-1897`).
2. `pgbuf_search_hash_chain` walks the bucket **with no bucket mutex on its first attempt** (`:7555-7599`),
   relying on a post-lock VPID re-check (`:7584-7590`).
3. The hot read path takes **no mutex at all** — `pgbuf_lockfree_fix_ro` (`:7669-7732`) and
   `pgbuf_lockfree_unfix_ro` (`:7751-7774`) CAS the packed latch word directly.
4. The `fcnt != 1` guard in the lock-free unfix (`:7759`) is the only thing forcing the last unfixer onto
   the slow path where LRU bookkeeping happens.
5. `waiter_exists` is a single bit gating that whole fast path — hence CBRD-27084's spin bug. Three
   reconciliation points now exist: `:6269-6283`, `:7077-7080`, `:7531-7534`.
6. New readers queue behind a waiting writer, but an **existing holder does not** (`:6326-6348`) — required
   to avoid self-deadlock on re-fix.
7. There is **no page-latch deadlock detector, only a timeout** (`:7093-7100`); and in debug builds an
   infinite-wait page-latch timeout hits a live `assert (0)` with a `FIXME` comment (`:7345-7346`).
8. The page-latch timeout **ignores the transaction's `wait_msecs`**, overwriting it with the global
   default of 5 minutes (`:7250-7262`, `:107`).
9. An **unconditional fix silently becomes conditional** for zero-wait transactions (`:2273-2283`).
10. `NEW_PAGE` fixes are counted as buffer **hits** (`:8574-8575`), inflating the `SHOW PAGE BUFFER STATUS`
    ratio on insert-heavy workloads; the perfmon ratio is unaffected (`perf_monitor.c:1913-1915`).
11. An unfix that has waiters **skips all LRU bookkeeping** including the unfix-count shard (`:6674-6680`),
    so the quota heuristic under-counts precisely under contention.
12. `avoid_dealloc` does **not** stop victimization, and the code says the resulting unsafety is accepted on
    purpose (`:16218-16222`); the unregister path therefore tolerates a zero counter (`:16204-16228`).
13. Deallocating a page does **not** invalidate its BCB — it marks `DIRTY | MOVE_TO_LRU_BOTTOM` to avoid a
    synchronous write (`:15127-15131`).
14. `pgbuf_bcb_set_dirty` intentionally bypasses `pgbuf_bcb_update_flags` and duplicates its
    victim-candidate/`dirties_cnt` maintenance inline (`:15967-15995`).
15. `bcb->flags` is one int holding flags + zone + LRU index, with non-overlap verified at startup and
    `abort()` on failure (`:16777-16798`, `:1602`); the 16-bit index field is why max LRU lists is 65,536 (`:181`).
16. `count_fix_and_avoid_dealloc` packs two counters because 2-byte atomics were deemed unportable
    (`:533-538`), and the fix half saturates at 64 so the hot-page test is a plain compare (`:16296-16301`).
17. `pgbuf_ordered_fix` burns ≈35 KiB of stack on `ordered_holders_info[64]` (DERIVED: `:12220`, `:426-436`, `:317-319`).
18. `pgbuf_ordered_fix` sorts by `(group_id, rank, vpid)`, **not** VPID, so a heap header always latches
    before its normal and overflow pages (`:12128-12183`, `page_buffer.h:219-229`).
19. Debug builds allocate ≈450 KiB of holder memory **per thread** because `PGBUF_HOLDER` embeds
    `char fixed_at[64 * 1024]` (`:468-471`, `:5895-5896`) — DERIVED.
20. `PGBUF_HOLDER_ANCHOR` is `static_assert`ed to be exactly 64 bytes with a hand-computed pad, to stop
    false sharing between threads' fix/unfix counters (`:485-490`).
21. The `memset` at `:1624` uses the **wrong `sizeof`**, leaving `waiter_threads_low_priority` unzeroed
    (§1.1); static zero-init hides it on first init only.
22. `pgbuf_insert_into_hash_chain` deliberately returns **holding** `hash_mutex`, relying on
    `pgbuf_unlock_page` to release it (`:7817-7823`) — one critical section split across two call sites.
23. `pgbuf_unlock_page` wakes **all** buffer-lock waiters and none of them receive the page; they simply
    retry from `try_again` (`:8109-8114`, `:2368-2372`).
24. The BCB-init line clearing `PGBUF_BCB_ASYNC_FLUSH_REQ` carries `/* todo: why this?? */` (`:8435`) — on
    a freshly claimed BCB that flag should already be clear, so it is dead code or papering over a leak.
25. `pgbuf_simple_fix`/`pgbuf_simple_unfix` (`:2648`, `:2743`) are a latch-free, LRU-mutex-free back door
    for temporary files, warned to be unmixable with normal fixes (`:2641-2646`).
26. The CBRD-27041 copy buffer is a **fake BCB** so the returned `PAGE_PTR` satisfies
    `CAST_PGPTR_TO_BFPTR`, sized with `offsetof` because `sizeof` under-allocates, and constructed with
    `placement_new` because `PGBUF_BCB` now holds a `std::atomic` (`:866-888`).
27. Pages have **no checksum** — torn-write detection is a head/tail LSA watermark pair, and the tail copy
    `prv2` is unreachable by normal member access (`file_io.h:178-192`).
28. `pgbuf_Monitor_locks` is unconditionally true in debug builds (`:1674-1680`), so every `PGBUF_BCB_LOCK`
    in a debug server goes through the `pgbuf_bcbmon_*` tracker rather than `pthread_mutex_lock` (`:950-957`).
