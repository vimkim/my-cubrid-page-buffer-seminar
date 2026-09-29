# PostgreSQL Shared Buffer Manager — Contrast Fact Sheet

**Repo:** `/home/vimkim/gh/pg/postgres`
**HEAD:** `fd2b89854d9` (`git rev-parse --short HEAD`), committed 2026-08-05 11:40:39 +0200, branch `master`
**`git describe --tags`:** `REL_19_BETA1-555-gfd2b89854d9`
**Actual version string:** `20devel` — `configure.ac:20` (`AC_INIT([PostgreSQL], [20devel], ...)`) and `meson.build:11` (`version: '20devel'`), stamped by commit `a281a3e6dbb "Stamp HEAD as 20devel."`
**Date of analysis:** 2026-08-06

> **Provenance caveat.** The task brief called this "19devel". `git describe` finds `REL_19_BETA1` as the nearest tag because v19 branched off after beta1, but master has since been stamped **20devel**. So this is **PostgreSQL 20devel master**, one full development cycle *past* the v19 beta. Everything below describes this commit. Nothing here should be assumed true of PG 18 or of any released version — the divergence is unusually large, because the two dev cycles captured here contain the AIO read path, the freelist removal, the 64-bit buffer state, and a from-scratch reimplementation of buffer content locks.

> **How to read the anchors.** Every `file:line` was verified against file contents at this commit during this session. Sections 9–13 were gathered by delegated readers; a representative sample of their anchors was independently re-verified (`bufmgr.c:4051`, `checkpointer.c:865`/`:875`, `aio.h:42`, `guc_parameters.dat:2716`/`:1400`/`:1416`, `system_views.sql:1240`/`:1247`/`:1261`, `xloginsert.c:678-700`, `xlog.c:878-896`, `read_stream.c:1228-1252`, `read_stream.h:21-64`, `xlog.h:123`). Items I could not confirm are marked **UNVERIFIED**.

---

## 0. Executive delta: what an experienced PG engineer would get wrong here

| Widely-known behavior | Reality at `fd2b89854d9` | Evidence |
|---|---|---|
| Buffers live on a **freelist**; `StrategyGetBuffer` pops from it and falls back to clock-sweep | **Freelist is deleted.** No `freeNext`, no `firstFreeBuffer`, no `StrategyFreeBuffer`. Clock-sweep is the *only* replacement path | `freelist.c:32-56`, `freelist.c:239-246`; commit `2c789405275 "bufmgr: Remove freelist, always use clock-sweep"` |
| `BufferDesc.state` is a **32-bit** atomic: 18b refcount + 4b usage + 10b flags | **64-bit** atomic: 18b refcount + 4b usage + 12b flags + **20b content-lock state** | `buf_internals.h:33-52`, `:344`; commit `dac328c8a68` |
| The buffer **content lock is an LWLock** (`BufferDescriptorGetContentLock`) | Content lock is a **bespoke implementation living inside `state`**, with its own wait queue (`proclist_head lock_waiters`) in the descriptor | `buf_internals.h:303-310`, `:358`; `bufmgr.c:5921-6180`; commit `fcb9c977aa5` |
| Content lock has **two** modes (SHARE / EXCLUSIVE) | **Three**: `BUFFER_LOCK_SHARE`, `BUFFER_LOCK_SHARE_EXCLUSIVE`, `BUFFER_LOCK_EXCLUSIVE` | `bufmgr.h:205-223`; commit `82467f627bd` |
| `FlushBuffer` does the **`BM_JUST_DIRTIED` dance** and/or copies the page to avoid a torn checksum | `BM_JUST_DIRTIED` **no longer exists**; no page copy. Writeback requires share-exclusive, so the page provably cannot change mid-write | `buf_internals.h:117` ("flag bit 6 is not used anymore"); commits `b0f4ff3c926`, `41d3d64e87a` |
| Reads are **synchronous `smgrread()`** per block, with `posix_fadvise` prefetch | Reads default to **AIO** (`io_method=worker`), vectored, up to `io_combine_limit` blocks per I/O, driven by read streams | `aio.h:42`, `bufmgr.c:1539-1560`, `bufmgr.c:2114-2155` |
| A backend waiting on someone else's in-progress read sleeps on the buffer's **condition variable** | It normally **joins the other backend's AIO handle** via `PgAioWaitRef` and waits on *that*; the CV is the fallback | `bufmgr.c:7304-7310`, `bufmgr.c:7228-7245` |
| `io_workers` tunes the AIO worker pool | `io_workers` **is gone**; replaced by `io_min_workers`/`io_max_workers`/`io_worker_idle_timeout`/`io_worker_launch_interval`, auto-scaling | `guc_parameters.dat:1400-1440`; commit `d1c01b79d4a` |
| GUC defaults are C initializers in `guc_tables.c` | GUCs are declared in **`guc_parameters.dat`** and `guc_tables.c` is generated. Grepping `guc_tables.c` for `bgwriter_lru_maxpages` returns nothing | `guc_parameters.dat` (152KB); commit `63599896545` |
| `CHECKPOINT_IMMEDIATE` | Renamed **`CHECKPOINT_FAST`** | commit `bb938e2c3c7`; `bufmgr.c:3568` |
| Writes are being moved to AIO too | **Writes are still fully synchronous.** `FlushBuffer` → `smgrwrite()`. Write-side AIO primitives exist but have no callers | `bufmgr.c:4600-4604` |

Two stale comments worth noting because they mislead readers: `buf_init.c:42` still says *"buffers live in a freelist and a lookup data structure"* (they do not), and `localbuf.c:234-235` says the local pool uses *"a clock-sweep algorithm (essentially the same as what freelist.c does **now**...)"* — that "now" is the tell that it was touched when the shared freelist died.

---

## 1. `BufferDesc` and the packed 64-bit `state`

### 1.1 Descriptor layout — `buf_internals.h:326-359`

```c
typedef struct BufferDesc
{
    BufferTag   tag;                    /* :332  header spinlock to modify */
    int         buf_id;                 /* :338  immutable after init */
    pg_atomic_uint64 state;             /* :344  flags + refcount + usagecount + lockstate */
    int         wait_backend_pgprocno;  /* :350  pin-count waiter */
    PgAioWaitRef io_wref;               /* :352  set iff AIO is in progress */
    proclist_head lock_waiters;         /* :358  content-lock wait queue */
} BufferDesc;
```

- **No `freeNext`** — the field that threaded the freelist is gone.
- **No `content_lock`** — the LWLock field is gone; the lock is in `state` plus `lock_waiters`.
- Target size is **≤ 64 bytes**, one cache line (`buf_internals.h:318-320`); the array is padded/aligned to `BUFFERDESC_PAD_TO_SIZE` = 64 on 64-bit (`:381-387`), and the shmem allocation requests `PG_CACHE_LINE_SIZE` alignment (`buf_init.c:79-84`).
- Per-buffer I/O condition variables are deliberately kept **outside** the struct, in a parallel `BufferIOCVArray` (`buf_internals.h:322-324`, `:414`, accessor `:441-445`), precisely to keep the descriptor inside one line.

### 1.2 The `state` bit budget — `buf_internals.h:33-86`

```c
/* State of the buffer itself (in order):
 * - 18 bits refcount
 * - 4 bits usage count
 * - 12 bits of flags
 * - 18 bits share-lock count
 * - 1 bit share-exclusive locked
 * - 1 bit exclusive locked                     :36-42 */
#define BUF_REFCOUNT_BITS 18                 /* :49 */
#define BUF_USAGECOUNT_BITS 4                /* :50 */
#define BUF_FLAG_BITS 12                     /* :51 */
#define BUF_LOCK_BITS (18+2)                 /* :52 */
StaticAssertDecl(BUF_REFCOUNT_BITS + BUF_USAGECOUNT_BITS
                 + BUF_FLAG_BITS + BUF_LOCK_BITS <= 64, ...);  /* :54-55 */
```

- Total 54 of 64 bits used; 10 spare.
- `BUF_REFCOUNT_MASK` = low 18 bits (`:59-60`); `BUF_STATE_GET_REFCOUNT` (`:90-91`).
- Usage count shifted by 18 (`BUF_USAGECOUNT_SHIFT`, `:63-64`), `BUF_USAGECOUNT_ONE` = `1<<18` (`:67-68`), `BUF_STATE_GET_USAGECOUNT` (`:92-93`).
- Flags shifted by 22 (`BUF_FLAG_SHIFT`, `:71-72`), defined via `BUF_DEFINE_FLAG(flagno)` (`:102-103`).
- Lock state shifted by 34 (`BM_LOCK_SHIFT`, `:77-78`): a **share-lock counter** of `MAX_BACKENDS_BITS`=18 bits (`BM_LOCK_VAL_SHARED`, `:79-80`), then one share-exclusive bit (`:81-82`), then one exclusive bit (`:83-84`); `BM_LOCK_MASK` covers all three (`:85-86`).
- `MAX_BACKENDS_BITS` = 18, `MAX_BACKENDS` = 2^18−1 = 262143 — `procnumber.h:38-39`. Static asserts tie the refcount and lock-count widths to it (`buf_internals.h:130-133`).

### 1.3 Flag bits — `buf_internals.h:106-127`

| Flag | `flagno` | Meaning |
|---|---|---|
| `BM_LOCKED` | 0 | buffer **header** spinlock (a bit in `state`, not a real spinlock) |
| `BM_DIRTY` | 1 | needs writing |
| `BM_VALID` | 2 | contents valid |
| `BM_TAG_VALID` | 3 | a hashtable entry exists for the tag |
| `BM_IO_IN_PROGRESS` | 4 | read or write in progress |
| `BM_IO_ERROR` | 5 | previous I/O failed |
| *(unused)* | 6 | **was `BM_JUST_DIRTIED`** — `:117` "flag bit 6 is not used anymore" |
| `BM_PIN_COUNT_WAITER` | 7 | someone waits for sole pin (cleanup lock) |
| `BM_CHECKPOINT_NEEDED` | 8 | must be written by the running checkpoint |
| `BM_PERMANENT` | 9 | permanent (not unlogged, or is an init fork) |
| `BM_LOCK_HAS_WAITERS` | 10 | content lock has waiters |
| `BM_LOCK_WAKE_IN_PROGRESS` | 11 | a content-lock waiter was signalled but hasn't run |

Flags 10 and 11 are new, and exist only because the content lock moved into `state`.

`BM_MAX_USAGE_COUNT = 5` — `buf_internals.h:144`, with the rationale at `:136-143`: a larger value approximates LRU better but the sweep hand may need up to `BM_MAX_USAGE_COUNT+1` full passes to find a victim.

### 1.4 Buffer tag — `buf_internals.h:161-168`

```c
typedef struct buftag {
    Oid           spcOid;      /* tablespace */
    Oid           dbOid;       /* database */
    RelFileNumber relNumber;   /* relation file number */
    ForkNumber    forkNum;
    BlockNumber   blockNum;
} BufferTag;
```
20 bytes, no padding (`:158-159` warns that pad bytes would break its use as a hash key). Crucially self-describing: the comment at `:151-156` notes the tag must suffice to locate the block on disk **without consulting `pg_class`/`pg_tablespace`**, because a backend flushing a buffer may not even believe the relation is visible yet.

### 1.5 Header lock mechanics — `bufmgr.c:7566-7633`

`LockBufHdr` sets `BM_LOCKED` with one `pg_atomic_fetch_or_u64`, and on contention drops to a non-atomic spin loop reading `state` until the bit clears, then retries (`bufmgr.c:7580-7602`). It returns the observed state **with `BM_LOCKED` OR'ed in** (`:7604`). `WaitBufHdrUnlocked` (`:7614-7633`) is the CAS-loop companion: spin until `BM_LOCKED` is clear and return the state, used by every lock-free path that must not touch a locked header.

Two release helpers:
- `UnlockBufHdr` — plain `pg_atomic_fetch_sub_u64(&state, BM_LOCKED)`, valid only if the caller changed nothing (`buf_internals.h:459-465`).
- `UnlockBufHdrExt(desc, old_state, set_bits, unset_bits, refcount_change)` — CAS loop that clears, then sets flags, clears `BM_LOCKED`, and adjusts refcount **in one atomic step** (`buf_internals.h:476-504`). Clear-before-set ordering is deliberate so a flag both cleared and re-added survives (`:487-489`). Its doc note at `:472-474` explains why usagecount is *not* supported here: it would need capping at `BM_MAX_USAGE_COUNT`.

Concurrency contract (`buf_internals.h:281-295`): the tag may only change while holding the header lock; while the header lock is held by another backend you may **not** add pins or change flags — but you **may release** an existing pin via atomic subtraction (`:288-289`). That asymmetry is what lets `UnpinBuffer` be a single unconditional `fetch_sub` (§3.4).

---

## 2. Buffer lookup: the partitioned mapping table

- The table is a shmem `HTAB` keyed by `BufferTag`, value `int id` — `buf_table.c:28-34`.
- Sized `NBuffers + NUM_BUFFER_PARTITIONS` (`buf_table.c:62`), with the reason spelled out at `:52-61`: `BufferAlloc` inserts the new entry **before** deleting the old one, and that can be happening concurrently in every partition at once. `HASH_FIXED_SIZE` means it can never grow, so the slack is mandatory.
- **`NUM_BUFFER_PARTITIONS = 128`** — `lwlock.h:83`. Partition locks are a contiguous block of the main LWLock array starting at `BUFFER_MAPPING_LWLOCK_OFFSET = NUM_INDIVIDUAL_LWLOCKS` (`lwlock.h:94`).
- Tag → partition is `hashcode % NUM_BUFFER_PARTITIONS` (`buf_internals.h:247-251`), and `BufMappingPartitionLock(hashcode)` indexes the array (`:253-258`). Note the header comment at `:245`: *"NB: NUM_BUFFER_PARTITIONS must be a power of 2!"* — yet the mapping uses `%`, not `&`. Both are correct for a power of two; the comment is about other assumptions in the LWLock layout.
- API is deliberately lock-free itself — `buf_table.c:6-10`: callers hold the partition lock because they need to mutate the buffer header before releasing it. `BufTableHashCode` is separated out (`:83-87`) so the hash is computed once and reused to pick the partition.
- `BufTableInsert` returns the **existing** buffer id on collision rather than failing (`buf_table.c:123-145`) — that return value is what drives the "someone beat me to it" path in `BufferAlloc`.
- Shmem registration now goes through the new declarative subsystem API: `const ShmemCallbacks BufTableShmemCallbacks = {.request_fn = ...}` (`buf_table.c:38-41`) and `ShmemRequestHash(.name = ..., .nelems = ..., ...)` (`:64-71`). Same pattern in `buf_init.c:34-38` and `freelist.c:64-67`.

**Why partitioned:** a single `BufMgrLock` was the historical scalability wall; 128 partitions mean the exclusive lock taken to insert/delete a mapping only serializes 1/128th of lookups. Contention is observable as the `BufferMapping` wait event (`wait_event_names.txt:391`).

### Lookup walkthrough — `BufferAlloc`, `bufmgr.c:2196-2351`

1. Reserve a private refcount slot and a resource-owner slot **before** touching anything, so no allocation can fail later (`:2211-2213`).
2. Build the tag, hash it, derive the partition lock (`:2216-2220`).
3. Take the partition lock **shared**; `BufTableLookup` (`:2223-2224`).
4. **Hit:** `PinBuffer(buf, strategy, false)`, then release the partition lock *immediately* — the pin is what protects the buffer from here on (`:2237-2240`). If the pin reports not-`BM_VALID`, set `*foundPtr = false`: someone is mid-read, a prior read failed, or `StartReadBuffers` ran without `WaitReadBuffers` (`:2244-2252`).
5. **Miss:** release the partition lock, then `GetVictimBuffer(strategy, io_context)` — deliberately *without* holding any mapping lock (`:2261-2269`).
6. Retake the partition lock **exclusive** and `BufTableInsert`. On collision, unpin the victim and treat it as a hit (`:2276-2317`). The comment at `:2289-2292` explains why the unpin happens under the lock: doing it after would force the reserve calls onto the common path for a rare race.
7. Lock the victim's header to change its tag (`:2322`), assert refcount==1 and none of `BM_TAG_VALID|BM_VALID|BM_DIRTY|BM_IO_IN_PROGRESS` (`:2325-2326`), store the tag (`:2328`).
8. One `UnlockBufHdrExt` sets `BM_TAG_VALID | BUF_USAGECOUNT_ONE`, plus `BM_PERMANENT` iff `relpersistence == RELPERSISTENCE_PERMANENT || forkNum == INIT_FORKNUM` (`:2336-2341`).
9. Release the partition lock; return with `*foundPtr = false` (`:2343-2350`).

The buffer is now findable by other backends **before** its contents are read in — that is intentional and is exactly what `BM_IO_IN_PROGRESS` exists to police (`buf_init.c:45-63`).

---

## 3. Pin / unpin

### 3.1 Backend-private refcounts — `bufmgr.c:230-269`

The design rationale is at `bufmgr.c:230-261`. Each backend keeps its own count of how many times *it* has pinned a buffer, so the shared atomic is touched only on the 0→1 and 1→0 transitions. Structure:

- `PrivateRefCountData { int32 refcount; BufferLockMode lockmode; }` — `bufmgr.c:101-113`. **The lock mode this backend holds is tracked here**, which is new and is what makes `BufferIsLockedByMe()` cheap.
- `PrivateRefCountEntry { Buffer buffer; char status; PrivateRefCountData data; }` — `:115-131`.
- A **split key array** `PrivateRefCountArrayKeys[8]` plus `PrivateRefCountArray[8]` (`:263-264`, `REFCOUNT_ARRAY_ENTRIES = 8` at `:145`, sized to one cache line). Keys are separate so scanning many entries touches one dense array (`:117-124`).
- Overflow goes to `PrivateRefCountHash`, a **`simplehash`** instantiation (`:133-142`, created at `:4253`) — this replaced the old dynahash (commit `a367c433ad0 "Use simplehash for backend-private buffer pin refcounts."`).
- A one-entry cache `PrivateRefCountEntryLast` (`:269`, commit `30df61990c6`) short-circuits repeated access to the same buffer.
- `PrivateRefCountClock` (`:267`) is the round-robin victim chooser for displacing an array entry into the hash — so a hot entry can't get stranded in the hash while cold ones squat in the array (`:248-251`).

`ReservePrivateRefCountEntry()` (`:308-...`) must be called **before** `NewPrivateRefCountEntry()`, because the latter is sometimes called with the buffer header spinlock held and therefore must not allocate (`:256-261`).

Per-backend pin fairness: `MaxProportionalPins = NBuffers / (MaxBackends + NUM_AUXILIARY_PROCS)` — `bufmgr.c:4248`, described as "very pessimistic" at `:4241-4246`. `GetPinLimit()` returns it (`:2694-2698`); `GetAdditionalPinLimit()` subtracts an *estimate* of pins held, `PrivateRefCountOverflowed + REFCOUNT_ARRAY_ENTRIES`, assuming the array is full rather than paying to count it (`:2706-2723`); `LimitAdditionalPins()` clamps a batch request but always permits at least 1 so progress is guaranteed (`:2732-2744`).

### 3.2 `PinBuffer` fast path — `bufmgr.c:3294-3386`

```c
old_buf_state = pg_atomic_read_u64(&buf->state);
for (;;)
{
    if (unlikely(skip_if_not_valid && !(old_buf_state & BM_VALID)))   /* :3315 */
        return false;
    if (unlikely(old_buf_state & BM_LOCKED))                          /* :3322 */
    {
        old_buf_state = WaitBufHdrUnlocked(buf);
        continue;                                                     /* :3327 */
    }
    buf_state = old_buf_state;
    buf_state += BUF_REFCOUNT_ONE;                                    /* :3333 */
    if (strategy == NULL)
    {
        if (BUF_STATE_GET_USAGECOUNT(buf_state) < BM_MAX_USAGE_COUNT)  /* :3338 */
            buf_state += BUF_USAGECOUNT_ONE;
    }
    else if (BUF_STATE_GET_USAGECOUNT(buf_state) == 0)                /* :3347 */
        buf_state += BUF_USAGECOUNT_ONE;
    if (pg_atomic_compare_exchange_u64(&buf->state, &old_buf_state, buf_state))
    { result = (buf_state & BM_VALID) != 0; TrackNewBufferPin(b); break; }  /* :3351-3357 */
}
```

- If a private entry already exists, no atomic at all: bump the private count, remember it in the resource owner, and read `BM_VALID` with a relaxed load (`:3361-3383`). The relaxed read is explicitly allowed to be spuriously false (`:3363-3369`).
- **Usage-count bump rule** is the scan-resistance lever: default strategy increments up to `BM_MAX_USAGE_COUNT`(5); a strategy (ring) only lifts 0→1, never higher. The reason is at `:3272-3278`: a ring must keep its buffers at usagecount 1 so the global sweep won't steal them, without letting a big scan inflate counts and evict the working set. `:3344-3346` restates it: "Ring buffers shouldn't evict others from pool."
- Checking `BM_LOCKED` *before* CAS-ing is required, not an optimization (`:3318-3321`): you may not increase a refcount while the header lock is held. Commit `c0af4eb4e71 "bufmgr: Fix ordering of checks in PinBuffer()"` is about exactly this ordering.

`PinBuffer_Locked` (`:3410-3431`) is the header-lock-already-held variant: a single `UnlockBufHdrExt(buf, old_buf_state, 0, 0, 1)` pins and unlocks in one atomic op. It asserts no pre-existing private pin (`:3419`) so it can skip the array/hash search while the spinlock is held. `:3406-3408` notes its use is often *mandatory*, not an optimization — you must pin before state can change under you.

`TrackNewBufferPin` (`:3534-3555`) is the shared tail: create the private entry, bump to 1, register with the resource owner, mark the page defined to Valgrind. `freelist.c` calls it too, so victim buffers arrive already owned.

### 3.3 `IncrBufferRefCount` — `bufmgr.c:5693`
Adds a pin known to already be held by this backend; it's a private-count-only operation.

### 3.4 `UnpinBuffer` — `bufmgr.c:3478-3528`

`UnpinBuffer` forgets the resource-owner entry then calls `UnpinBufferNoOwner`, which decrements the private count and, only at 0:

1. `VALGRIND_MAKE_MEM_NOACCESS` the page (`:3511`).
2. Assert no content lock still held — `Assert(!BufferLockHeldByMe(buf))` (`:3517`).
3. **`pg_atomic_fetch_sub_u64(&buf->state, BUF_REFCOUNT_ONE)`** — one unconditional atomic subtract, no CAS loop, no header-lock check (`:3520`). Legal precisely because of the release-while-locked exemption in §1.5. Commit `5310fac6e0f "bufmgr: Use atomic sub for unpinning buffers"`.
4. If the *old* state had `BM_PIN_COUNT_WAITER`, call `WakePinCountWaiter` (`:3523-3524`), which re-locks the header, re-checks that refcount is now 1, clears the flag, and `ProcSendSignal`s the waiter (`:3442-3470`).
5. Forget the private entry (`:3526`).

There is also `UnlockReleaseBuffer` (`:5626`), which commit `f39cb8c0110` made able to unlock and unpin in a **single atomic operation** — one of the optimizations `buf_internals.h:308-310` cites as the payoff for moving the content lock into `state`.

---

## 4. Content locks: no longer LWLocks

This is the single largest structural change in this tree and has no analogue in released PG.

- Three modes — `bufmgr.h:205-223`: `BUFFER_LOCK_SHARE` (conflicts with EXCLUSIVE), `BUFFER_LOCK_SHARE_EXCLUSIVE` (conflicts with itself and EXCLUSIVE), `BUFFER_LOCK_EXCLUSIVE` (conflicts with everything). Commit `156680055dc` turned the old `#define`s into an enum; `82467f627bd` added the middle mode.
- Rationale — `buf_internals.h:303-310`: a dedicated implementation "allows us to implement some otherwise hard things (e.g. race-freely checking if AIO is in progress before locking a buffer exclusively) and enables otherwise impossible optimizations (e.g. unlocking and unpinning a buffer in one atomic operation)."
- `BufferLockAttempt` — `bufmgr.c:6118-6180` — is the whole conflict matrix in 18 lines:

```c
if (mode == BUFFER_LOCK_EXCLUSIVE) {
    lock_free = (old_state & BM_LOCK_MASK) == 0;                       /* :6139 */
    if (lock_free) desired_state += BM_LOCK_VAL_EXCLUSIVE;
} else if (mode == BUFFER_LOCK_SHARE_EXCLUSIVE) {
    lock_free = (old_state & (BM_LOCK_VAL_EXCLUSIVE
                              | BM_LOCK_VAL_SHARE_EXCLUSIVE)) == 0;    /* :6145 */
    if (lock_free) desired_state += BM_LOCK_VAL_SHARE_EXCLUSIVE;
} else {
    lock_free = (old_state & BM_LOCK_VAL_EXCLUSIVE) == 0;              /* :6151 */
    if (lock_free) desired_state += BM_LOCK_VAL_SHARED;
}
```
  Note share acquisition is an **increment of an 18-bit counter**, so `MAX_BACKENDS` share-holders fit. The CAS is issued unconditionally even when the lock is busy, because it doubles as a memory barrier (`:6156-6163`).
- `BufferLockAcquire` (`:5920-6031`) mirrors `LWLockAcquire`'s structure (`:5909-5911`): try; on failure queue self (`BufferLockQueueSelf`, `:6186`); retry; if still blocked, sleep on `MyProc->sem` counting `extraWaits`, then clear `BM_LOCK_WAKE_IN_PROGRESS` and loop (`:6009-6020`). It takes `HOLD_INTERRUPTS()` for the duration (`:5942`) and records the mode in the private refcount entry (`:6024`).
- Wait events per mode: `WAIT_EVENT_BUFFER_EXCLUSIVE`, `WAIT_EVENT_BUFFER_SHARE_EXCLUSIVE`, `WAIT_EVENT_BUFFER_SHARED` (`:5986-5994`); names at `wait_event_names.txt:295-298`, class renamed from BUFFERPIN to BUFFER by commit `6c5c393b740`.
- `BufferLockConditional` (`:6072-6107`) has a sharp edge worth knowing: attempting to conditionally lock a buffer **this backend already locked always fails**, even for two share locks, because there is only one `lockmode` slot per private entry (`:6064-6070`). Commit `333f586372a`.
- Release path: `BufferLockUnlock` (`:6036-6059`) → `BufferLockDisownInternal` → `BufferLockReleaseSub(mode)` → one `pg_atomic_sub_fetch_u64` → `BufferLockProcessRelease` for wakeups → `RESUME_INTERRUPTS()`.

**Why `SHARE_EXCLUSIVE` exists.** Setting hint bits and flushing a buffer both now require it (commit `82467f627bd "Require share-exclusive lock to set hint bits and to flush"`). Hint-bit setters no longer collide with writeback, so `FlushBuffer` neither needs `BM_JUST_DIRTIED` nor a private copy of the page — which in turn is the prerequisite for direct I/O and future AIO writes, where the kernel may read the buffer memory after the syscall returns.

---

## 5. Read path

### 5.1 Entry points

`ReadBuffer` (`bufmgr.c:879`) → `ReadBufferExtended` (`:926`) → `ReadBuffer_common` (`:1276`). Modes: `RBM_NORMAL`, `RBM_ZERO_AND_LOCK`, `RBM_ZERO_AND_CLEANUP_LOCK`, `RBM_ZERO_ON_ERROR`, `RBM_NORMAL_NO_LOG` (`bufmgr.h:46-53`).

`ReadBuffer_common` walkthrough:
1. Reject another session's temp relation (`:1293-1296`) — commits `ce146621f78`/`c40819ebf95` hardened this.
2. `blockNum == P_NEW` is a back-compat shim that redirects to `ExtendBufferedRel` (`:1303-1316`).
3. Zeroing modes take a short path: `PinBufferForBlock` + `ZeroAndLockBuffer`, no I/O (`:1323-1346`).
4. Otherwise: set **`READ_BUFFERS_SYNCHRONOUSLY`** because the caller will block immediately anyway — "there is no benefit in actually executing the IO asynchronously, it would just add dispatch overhead" (`:1348-1353`) — then `StartReadBuffer(...)` and, if it returns true, `WaitReadBuffers()` (`:1361-1365`).

So a plain `ReadBuffer()` still behaves synchronously; it is *read streams* that exploit asynchrony.

Read flags — `bufmgr.h:122-128`: `READ_BUFFERS_ZERO_ON_ERROR`, `READ_BUFFERS_ISSUE_ADVICE`, `READ_BUFFERS_IGNORE_CHECKSUM_FAILURES`, `READ_BUFFERS_SYNCHRONOUSLY`.

### 5.2 `StartReadBuffersImpl` — `bufmgr.c:1370-1592`

1. Assert `*nblocks <= MAX_IO_COMBINE_LIMIT` (`:1386`; `MAX_IO_COMBINE_LIMIT = PG_IOV_MAX`, `bufmgr.h:175`).
2. For each block: either accept a **forwarded** buffer already pinned by a previous split call (`:1409-1444` — checks `BM_VALID` with a relaxed load, safe because it was freshly seen when pinned), or `PinBufferForBlock` it (`:1447-1454`).
3. Populate the `ReadBuffersOperation` and clear its wait ref (`:1520-1525`).
4. **If `io_method != IOMETHOD_SYNC`: call `AsyncReadBuffers()` right here** and shorten `operation->nblocks` to what was accepted (`:1539-1560`).
5. If `io_method == IOMETHOD_SYNC`: force the synchronous flag, optionally `smgrprefetch()` for `READ_BUFFERS_ISSUE_ADVICE`, and return true so `WaitReadBuffers` does the actual read (`:1561-1587`). The comment at `:1531-1537` is explicit that this branch exists only "to de-risk the introduction of AIO" and "should eventually go away."

### 5.3 `AsyncReadBuffers` — `bufmgr.c:1938-2175`

1. Derive `io_object`/`io_context`; set `PGAIO_HF_SYNCHRONOUS` if the caller will block, `PGAIO_HF_REFERENCES_LOCAL` for temp (`:1957-1977`).
2. Fold session-local GUCs into the flags — `zero_damaged_pages` and `ignore_checksum_failure` — because the completion callback may run **in another process** with different GUC values (`:1979-1998`). This is a genuinely subtle consequence of AIO.
3. `pgstat_prepare_report_checksum_failure(...)` up front so a checksum failure can be reported from a critical section later (`:2001-2006`).
4. Acquire an AIO handle **before** `StartBufferIO`, because acquiring can block and you must not block while holding `BM_IO_IN_PROGRESS`; if the non-blocking acquire fails, submit staged I/O first, then block (`:2008-2030`).
5. `StartBufferIO(buffers[nblocks_done], /*forInput*/ true, /*wait*/ true, &operation->io_wref)` (`:2058-2059`) — three outcomes:
   - `BUFFER_IO_ALREADY_DONE`: someone finished it; release the handle, count it as a **hit** for this backend even though it began as a miss, return false (`:2064-2087`).
   - `BUFFER_IO_IN_PROGRESS`: someone else's I/O is running; set `operation->foreign_io = true` and return — we will wait on **their** `PgAioWaitRef` (`:2090-2095`).
   - `BUFFER_IO_READY_FOR_IO`: we own the I/O.
6. Combine forward: for each subsequent block, `StartBufferIO(..., wait=false, NULL)` and stop at the first that isn't ready (`:2114-2127`). The comment at `:2102-2107` warns that as little code as possible may sit between these calls and the submit, since buffers are already marked `BM_IO_IN_PROGRESS` and other backends are now waiting.
7. `pgaio_io_get_wref`, `pgaio_io_set_handle_data_32` (the buffer list for the callbacks), `pgaio_io_register_callbacks(PGAIO_HCB_SHARED_BUFFER_READV | PGAIO_HCB_LOCAL_BUFFER_READV, flags)` (`:2130-2139`).
8. `smgrstartreadv(ioh, ...)` — the vectored, possibly-async read (`:2153-2155`), bracketed by `pgstat_count_io_op_time(..., IOOP_READ, io_start, 1, io_buffers_len * BLCKSZ)` (`:2156-2157`).
9. `pgBufferUsage.shared_blks_read += io_buffers_len` (or `local_blks_read`) at `:2159-2162`.
10. Vacuum cost is charged **at issue time, not completion**, so a burst of async I/O can't outrun the cost limit (`:2164-2170`).

### 5.4 `WaitReadBuffers` — `bufmgr.c:1758-1918`

Returns **`bool needed_wait`** — new in this cycle (commit `513374a47a7`), and the signal that drives read-stream distance growth (§5.6).

1. Error out if there's no wait ref and `io_method != IOMETHOD_SYNC` (`:1788-1789`).
2. Loop until `nblocks_done == nblocks`:
   - If a wait ref is valid: check `pgaio_wref_check_done()` first to avoid paying for timestamps when the I/O is already complete (`:1823-1824`, rationale `:1810-1821`), else `pgaio_wref_wait()` and set `needed_wait = true` (`:1826-1837`). The wait time is booked as `IOOP_READ` with **count 0 and bytes 0** — the operation itself was already counted in `AsyncReadBuffers`, possibly by another backend (`:1831-1837`). Commit `c9a66949271 "Allow IO time to be counted without a matching IO operation in pg_stat_io"` exists for exactly this.
   - `foreign_io`: after waiting, check `BM_VALID`; if set, advance and count a **hit** for us while the issuer counts a **read** (`:1844-1867`). If the foreign I/O failed and left the buffer invalid, don't advance — the retry below will do the I/O ourselves (`:1869-1873`).
   - Otherwise `ProcessReadBuffersResult(operation)` (`:1881`), which raises any deferred error in the issuing backend.
3. On a partial read, set `needed_wait = true` and call `AsyncReadBuffers` again (`:1895-1911`). Unlike in `StartReadBuffers`, `nblocks` is **not** shortened here — the caller expects the whole operation done (`:1905-1909`).

### 5.5 How concurrent readers of the same missing page wait

Two mechanisms, in priority order — this is the mechanic most changed from PG lore:

**Preferred: join the AIO handle.** `StartSharedBufferIO` (`bufmgr.c:7289-7362`), documented at `:7255-7288`:
```c
buf_state = LockBufHdr(buf);
if (!(buf_state & BM_IO_IN_PROGRESS)) break;
if (io_wref != NULL && pgaio_wref_valid(&buf->io_wref))   /* :7304 */
{   *io_wref = buf->io_wref; UnlockBufHdr(buf);
    return BUFFER_IO_IN_PROGRESS; }                       /* :7306-7309 */
else if (!wait) { UnlockBufHdr(buf); return BUFFER_IO_IN_PROGRESS; }
else { UnlockBufHdr(buf); pgaio_submit_staged(); WaitIO(buf); }  /* :7327-7336 */
```
The caller gets a copy of the *other backend's* wait reference and defers the wait to `WaitReadBuffers`. This is what keeps enough I/O in flight when several backends scan the same relation, or when a read stream revisits a block inside its lookahead window (`bufmgr.c:2039-2049`). Note `pgaio_submit_staged()` before any blocking wait, to avoid deadlock and needless delay (`:7329-7334`).

Once past the loop, if the work is already done (`forInput ? BM_VALID : !BM_DIRTY`) return `BUFFER_IO_ALREADY_DONE` (`:7343-7347`); otherwise set `BM_IO_IN_PROGRESS` via `UnlockBufHdrExt` and register with the resource owner (`:7354-7359`).

**Fallback: the condition variable.** `WaitIO` (`bufmgr.c:7187-7248`) loops: lock the header, **copy `io_wref` while holding the spinlock** (to race safely against a concurrent `TerminateBufferIO` clearing it — `:7212-7217`), unlock; break if `BM_IO_IN_PROGRESS` is clear; if the wref is valid `pgaio_wref_wait()` it and re-prepare the CV sleep (`:7228-7241`); else `ConditionVariableSleep(cv, WAIT_EVENT_BUFFER_IO)` (`:7245`). It asserts `!pgaio_have_staged()` on entry (`:7197`).

**Termination.** `TerminateBufferIO` (`bufmgr.c:7406-7453`) locks the header, always clears `BM_IO_IN_PROGRESS` and `BM_IO_ERROR`, clears `BM_DIRTY|BM_CHECKPOINT_NEEDED` if `clear_dirty`, and if `release_aio` drops the AIO subsystem's pin (`refcount_change = -1`) and clears `io_wref` — all in one `UnlockBufHdrExt` (`:7414-7435`). Then `ConditionVariableBroadcast` (`:7441`), and possibly `WakePinCountWaiter` because completing another backend's I/O may have released the last non-waiter pin (`:7443-7452`).

`io_combine_limit` = min of `io_combine_limit_guc` and `io_max_combine_limit` (`bufmgr.c:209-217`), default `Min(PG_IOV_MAX, 128KB/BLCKSZ)` = 16 blocks at 8KB (`bufmgr.h:175-176`).

### 5.6 Read streams (`read_stream.c`) — the actual AIO driver

- Flags — `read_stream.h:21-64`: `READ_STREAM_DEFAULT 0x00`, `READ_STREAM_MAINTENANCE 0x01` (use `maintenance_io_concurrency`), `READ_STREAM_SEQUENTIAL 0x02` (skip self-issued advice; kernel readahead is better), `READ_STREAM_FULL 0x04` (skip ramp-up), `READ_STREAM_USE_BATCHING 0x08` (opt into AIO batch mode).
- **Distance heuristic is asymmetric**: growth is geometric, decay is linear. On `WaitReadBuffers()` reporting `needed_wait`, `readahead_distance *= 2` capped at `max_pinned_buffers` (`read_stream.c:1229-1237`), and a **decay holdoff** of `max_pinned_buffers` is armed (`:1251`) with the reasoning at `:1239-1250`: avoid collapsing the distance in mostly-cached workloads where the few remaining misses would otherwise be executed synchronously. Decay is one step at a time and only when no I/O is in flight and the holdoff has drained (`:462-486` — reported by delegated reader, **spot-verified only for the growth block at `:1228-1252`**).
- `max_pinned_buffers = (max_ios + 1) * io_combine_limit`, then clamped by `GetAccessStrategyPinLimit()` and `GetPinLimit()` (`read_stream.c:839-852`, delegated).
- A **fast path** exists for fully-cached single-block-lookahead streams that forces `READ_BUFFERS_SYNCHRONOUSLY` even under AIO, because dispatch overhead isn't worth it (`read_stream.c:1074-1087`, delegated). Commit `cceb1bf45e3`.
- Notable users (delegated, sampled): heap seq scan and bitmap heap scan (`heapam.c:1297`, `:1308`), vacuum (`vacuumlazy.c:1313`, `:2671`), analyze (`analyze.c:1304`), btree (`nbtree.c:1324`), and `bufmgr.c:5425` itself for relation copy.

### 5.7 AIO model (delegated; key anchors spot-verified)

- `io_method` enum — `aio.h:32-42`: `IOMETHOD_SYNC = 0`, `IOMETHOD_WORKER`, `IOMETHOD_IO_URING` (gated by `IOMETHOD_IO_URING_ENABLED`). **`#define DEFAULT_IO_METHOD IOMETHOD_WORKER`** at `aio.h:42` — verified. So a stock server reads via worker processes, not synchronously.
- Handle lifecycle: `PGAIO_HS_IDLE → HANDED_OUT → DEFINED → STAGED → SUBMITTED → COMPLETED_IO → COMPLETED_SHARED → COMPLETED_LOCAL` (`aio_internal.h:45-92`, delegated).
- `PgAioWaitRef` = `aio_index` + split 64-bit generation, so it is passable **across processes** (`aio_types.h:32-47`, delegated) — the enabler for §5.5.
- `pgaio_wref_wait` resolves the wref then `pgaio_io_wait(ioh, generation)`, callable by any process (`aio.c:990-999`, delegated).
- **Shared vs local callbacks:** `complete_shared` runs wherever the I/O completes — possibly an io_worker or an unrelated backend — so it may only touch shared state; `complete_local` runs only in the owning backend, which is why checksum-failure stats live there (`bufmgr.c:8942-8971`, delegated). Errors are deferred and raised by the issuer in `ProcessReadBuffersResult` (`bufmgr.c:1713-1750`).
- **Writes are not AIO.** `FlushBuffer` → `smgrwrite()` (`bufmgr.c:4600-4604`, verified). `md.c` has `mdstartreadv` but no `mdstartwritev`; `pgaio_io_start_writev` exists with no callers and no registered write callback ID (delegated). Bgwriter/checkpointer call `pgaio_error_cleanup()` only in error recovery (`bgwriter.c:172`, `checkpointer.c:306`), which is defensive, not evidence of AIO writes.
- `PrefetchBuffer`/`posix_fadvise` still exist (`bufmgr.c:696-802`, `fd.c:2075-2086`) but only as a legacy path for callers not converted to read streams — `vacuumlazy.c:3351` (backward truncation scan), `heapam.c:8254`, `xlogprefetcher.c:772` (delegated).

---

## 6. Victim selection: the freelist is gone

### 6.1 What replaced it

`BufferStrategyControl` — `freelist.c:32-56` — now holds only:

```c
slock_t          buffer_strategy_lock;   /* :35 */
pg_atomic_uint32 nextVictimBuffer;       /* :42  clock hand; only ever increases */
uint32           completePasses;         /* :48 */
pg_atomic_uint32 numBufferAllocs;        /* :49 */
int              bgwprocno;              /* :55 */
```

No `firstFreeBuffer`, no `lastFreeBuffer`. Confirmed negatively: `grep -rn 'freeNext|StrategyFreeBuffer|firstFreeBuffer|FREENEXT' src/ contrib/` returns **zero hits**. Confirmed positively by commit `2c789405275 "bufmgr: Remove freelist, always use clock-sweep"`.

Consequence for the CUBRID contrast: a freshly started PG has all `NBuffers` descriptors with `state == 0` (`buf_init.c:131`) — usagecount 0, refcount 0 — so the sweep finds them immediately on its first pass. Cold-start "allocate from free list" and steady-state "evict a victim" are the *same code path*. There is no free-list-empty transition, no free-list refill daemon, and no lock protecting a free list.

### 6.2 `ClockSweepTick` — `freelist.c:109-166`

```c
victim = pg_atomic_fetch_add_u32(&StrategyControl->nextVictimBuffer, 1);  /* :119-120 */
if (victim >= NBuffers)
{
    uint32 originalVictim = victim;
    victim = victim % NBuffers;                                          /* :127 */
    if (victim == 0)     /* we caused the wraparound */
    {
        expected = originalVictim + 1;
        while (!success)
        {
            SpinLockAcquire(&StrategyControl->buffer_strategy_lock);      /* :153 */
            wrapped = expected % NBuffers;
            success = pg_atomic_compare_exchange_u32(
                          &StrategyControl->nextVictimBuffer, &expected, wrapped);
            if (success) StrategyControl->completePasses++;               /* :160 */
            SpinLockRelease(&StrategyControl->buffer_strategy_lock);
        }
    }
}
```
The hand is a **monotonically increasing counter taken modulo NBuffers**, so multiple sweepers proceed without a lock and may return buffers slightly out of order (`:114-118`). The spinlock is taken *only* by the backend that caused a wraparound, and only so `StrategySyncStart` can read `nextVictimBuffer` and `completePasses` consistently (`:143-151`).

### 6.3 `StrategyGetBuffer` — `freelist.c:183-317`

1. If a strategy object exists, try `GetBufferFromRing` first; on success set `*from_ring = true` and return (`:196-204`).
2. Wake the bgwriter if it armed `bgwprocno`, reading it once via `INT_ACCESS_ONCE` and resetting it before `SetLatch` (`:206-230`). The comment concedes it may set the wrong process's latch if bgwriter dies at the wrong moment, which is harmless because `procLatch` is never freed (`:213-216`, `:224-228`).
3. `pg_atomic_fetch_add_u32(&numBufferAllocs, 1)` — note buffers recycled from a ring are **intentionally not counted** (`:232-237`).
4. `trycounter = NBuffers`, then loop: `buf = GetBufferDescriptor(ClockSweepTick())` and run a **CAS loop, without ever taking the header lock**:
   - refcount != 0 → skip; `--trycounter == 0` ⇒ `elog(ERROR, "no unpinned buffers available")` (`:263-277`). Note the counter is only decremented on the *pinned* branch.
   - `BM_LOCKED` → `WaitBufHdrUnlocked` and retry (`:280-284`).
   - usagecount != 0 → CAS `state -= BUF_USAGECOUNT_ONE`, reset `trycounter = NBuffers`, next buffer (`:286-296`).
   - usagecount == 0 → CAS `state += BUF_REFCOUNT_ONE`; on success, `AddBufferToRing` if using a strategy, publish `*buf_state`, `TrackNewBufferPin`, return (`:297-314`).

Two changes from lore here: the header lock is never taken (commit `5e899859287 "bufmgr: Don't lock buffer header in StrategyGetBuffer()"`), and the function returns the buffer **already pinned and owned by this backend** (`:180-181`), which is why `freelist.c` calls into `TrackNewBufferPin`.

### 6.4 `GetVictimBuffer` — `bufmgr.c:2547-2686`

1. Reserve refcount + resource-owner slots (`:2559-2560`).
2. `again:` → `StrategyGetBuffer(strategy, &buf_state, &from_ring)`; `CheckBufferIsPinnedOnce` (`:2569-2575`).
3. If `BM_DIRTY`:
   - `BufferLockConditional(buf, buf_hdr, BUFFER_LOCK_SHARE_EXCLUSIVE)`; if it fails, unpin and `goto again` (`:2603-2611`). The comment at `:2589-2601` documents the real deadlock this avoids: two backends splitting btree pages, the second having picked the page the first got from `StrategyGetBuffer`.
   - **Ring rejection:** if `strategy && from_ring && (buf_state & BM_PERMANENT) && XLogNeedsFlush(BufferGetLSN(buf_hdr)) && StrategyRejectBuffer(...)` → `UnlockReleaseBuffer`, `goto again` (`:2624-2631`). The `BM_PERMANENT` guard is new (commit `11e0824bd97`): unlogged pages carry fake LSNs, so `XLogNeedsFlush` is meaningless for them. The comment at `:2620-2622` explains why this can't live inside `StrategyGetBuffer`: inspecting the page LSN needs at least a share-exclusive content lock.
   - `FlushBuffer(...)`, unlock, `ScheduleBufferTagForWriteback(&BackendWritebackContext, ...)` (`:2634-2638`).
4. If `BM_VALID`: `pgstat_count_io_op(IOOBJECT_RELATION, io_context, from_ring ? IOOP_REUSE : IOOP_EVICT, 1, 0)` (`:2660-2661`). The 15-line comment at `:2644-2659` is the definitive statement of what "reuse" vs "evict" mean in `pg_stat_io`.
5. If `BM_TAG_VALID`, `InvalidateVictimBuffer(buf_hdr)`; if it returns false, unpin and `goto again` (`:2669-2673`).

`InvalidateVictimBuffer` (`:2470-2545`): take the partition lock exclusive, lock the header, and **bail out if refcount != 1 or `BM_DIRTY`** — someone pinned or re-dirtied it since selection (`:2503-2511`). Otherwise clear the tag, clear all flags and usagecount in one `UnlockBufHdrExt`, `BufTableDelete`, release (`:2526-2537`). Clearing the tag isn't strictly required but speeds up the cheap pre-checks in linear scans like `FlushDatabaseBuffers` (`:2519-2524`).

`InvalidateBuffer` (`:2369-2459`) is the drop-relation counterpart, with a `retry:` loop that calls `WaitIO` when the buffer is pinned by an in-flight I/O (`:2410-2429`).

---

## 7. Ring buffers (access strategies) and scan resistance

`BufferAccessStrategyData` — `freelist.c:74-94` — is **backend-private** (palloc'd, not shmem): `btype`, `nbuffers`, `current` (last slot handed out), and a flexible `Buffer buffers[]` array where `InvalidBuffer` means "slot not yet filled".

### Ring sizes — `GetAccessStrategy`, `freelist.c:425-501`

| Type | Size | Anchor |
|---|---|---|
| `BAS_NORMAL` | returns **NULL** (no strategy object) | `:438-440` |
| `BAS_BULKREAD` | base **256 KB**, plus `BLCKSZ/1024 * io_combine_limit * effective_io_concurrency`, capped at `GetPinLimit() * BLCKSZ/1024` (but never below 256 KB) | `:442-486` |
| `BAS_BULKWRITE` | **16 MB** | `:487-489` |
| `BAS_VACUUM` | **2048 KB** (2 MB) | `:490-492` |

The `BAS_BULKREAD` sizing is new-cycle logic and worth reading in full (`:446-482`): the ring must be big enough that a buffer handed to the caller isn't immediately reused (the caller's own pin would block reuse), big enough for `SYNC_SCAN_REPORT_INTERVAL` in `syncscan.c`, **and** big enough to hold `effective_io_concurrency` concurrent I/Os of `io_combine_limit` blocks each, since in-flight buffers can't be reused. That last term did not exist before AIO.

`GetAccessStrategyWithSize` (`:510-541`): `ring_buffers = ring_size_kb / (BLCKSZ/1024)`; 0 means unlimited ⇒ return NULL; then **capped at `NBuffers / 8`** (`:526`).

`GetAccessStrategyPinLimit` (`:573-599`): `BAS_BULKREAD` may pin the whole ring (it has `StrategyRejectBuffer` to escape dirty buffers); everything else may pin only **half** the ring, a trade-off between lookahead distance and deferring writeback/WAL traffic (`:590-598`).

### How a ring reuses its own buffers — `GetBufferFromRing`, `freelist.c:622-693`

1. Advance `strategy->current` circularly (`:632-633`).
2. If the slot is `InvalidBuffer`, return NULL so the caller falls into the global sweep and then `AddBufferToRing` fills the slot (`:640-642`, `:688-692`).
3. CAS-pin loop with the key test at `:664-666`:
   ```c
   if (BUF_STATE_GET_REFCOUNT(local_buf_state) != 0
       || BUF_STATE_GET_USAGECOUNT(local_buf_state) > 1)
       break;   /* give up on this slot */
   ```
   Rationale at `:655-662`: usagecount 0 or 1 is fair game (we expect 1 from our own prior use, possibly decremented by the sweep); **anything higher means another backend touched it, so we must not steal it back**. That is the mechanism by which a ring buffer is *abandoned* when the page turns out to be hot — it silently graduates into the normal pool and the ring takes a fresh buffer.

`AddBufferToRing` is one assignment (`:701-705`) because it runs with the header spinlock held.

`StrategyRejectBuffer` (`:751-770`): only for `BAS_BULKREAD`, only if the buffer actually is the current ring slot; it sets that slot to `InvalidBuffer` and returns true. The comment at `:763-765` gives the reason: without removal you could loop forever when every ring member is dirty.

**Net scan-resistance story.** A `BAS_BULKREAD` sequential scan of a 1 TB table cycles ~32 buffers (256 KB) plus its I/O concurrency allowance, never lifting usagecount above 1, so the global clock hand reclaims them on its next pass and the working set survives. Combined with the `PinBuffer` rule at `bufmgr.c:3341-3349`, this is PG's entire answer to cache pollution — there is no separate "old/young sublist" as in InnoDB, and no per-zone quota as in CUBRID.

`IOContextForStrategy` maps strategy → `IOCONTEXT_BULKREAD|BULKWRITE|VACUUM`, else `IOCONTEXT_NORMAL` (`freelist.c:711-738`), which is how `pg_stat_io` separates ring traffic from normal traffic.

---

## 8. Dirty write-out and the WAL rule

### 8.1 `MarkBufferDirty` — `bufmgr.c:3169-3219`

Requires pin **and** `BUFFER_LOCK_EXCLUSIVE` (`Assert` at `:3188`; rationale `:3165-3167`). CAS loop that waits out `BM_LOCKED` — explicitly "we have to wait for the buffer header spinlock to be not held, as `TerminateBufferIO()` relies on the spinlock" (`:3190-3198`) — and ORs in `BM_DIRTY` (`:3203`). Only on a clean→dirty transition does it bump `pgBufferUsage.shared_blks_dirtied++` and `VacuumCostBalance += VacuumCostPageDirty` (`:3210-3218`).

### 8.2 `FlushBuffer` — `bufmgr.c:4526-4642`

```c
Assert(BufferLockHeldByMeInMode(buf, BUFFER_LOCK_EXCLUSIVE) ||
       BufferLockHeldByMeInMode(buf, BUFFER_LOCK_SHARE_EXCLUSIVE));      /* :4534-4535 */
if (StartSharedBufferIO(buf, false, true, NULL) == BUFFER_IO_ALREADY_DONE)
    return;                                                             /* :4542-4543 */
...
/* As we hold at least a share-exclusive lock on the buffer, the LSN
 * cannot change during the flush (and thus can't be torn). */
recptr = BufferGetLSN(buf);                                             /* :4562-4565 */
if (pg_atomic_read_u64(&buf->state) & BM_PERMANENT)                     /* :4584 */
    XLogFlush(recptr);                                                  /* :4585 */
bufBlock = BufHdrGetBlock(buf);
PageSetChecksum((Page) bufBlock, buf->tag.blockNum);                    /* :4596 */
io_start = pgstat_prepare_io_time(track_io_timing);
smgrwrite(reln, BufTagGetForkNum(&buf->tag), buf->tag.blockNum, bufBlock, false);  /* :4600-4604 */
pgstat_count_io_op_time(io_object, io_context, IOOP_WRITE, io_start, 1, BLCKSZ);   /* :4624-4625 */
pgBufferUsage.shared_blks_written++;                                    /* :4627 */
TerminateBufferIO(buf, /*clear_dirty*/ true, 0, true, false);           /* :4632 */
```

Step order: **exclusive right to write** (`BM_IO_IN_PROGRESS`) → read LSN → **`XLogFlush` (WAL before data)** → compute checksum → `smgrwrite` → count → clear `BM_DIRTY` and `BM_CHECKPOINT_NEEDED`.

- The `BM_PERMANENT` gate on `XLogFlush` has a 13-line justification at `:4567-4583`: unlogged index pages bear **fake LSNs** from `XLogGetFakeLSN`, which could exceed the real WAL insert pointer, and flushing to that location would fail "with disastrous system-wide consequences."
- **No `BM_JUST_DIRTIED` re-check and no page copy.** Both were made unnecessary by the share-exclusive requirement, and both were removed (`b0f4ff3c926`, `41d3d64e87a`). In released PG, `FlushBuffer` had to cope with a concurrent hint-bit setter dirtying the page mid-write; here the lock mode forbids it, which is why the comment at `:4562-4564` can flatly assert the LSN can't be torn.
- `FlushUnlockedBuffer` (`:4648-4657`) is the lock/flush/unlock wrapper, and it acquires exactly `BUFFER_LOCK_SHARE_EXCLUSIVE` (`:4654`). Commit `3c2b97b29ee`.

**Who may write a dirty buffer:** any backend (via `GetVictimBuffer` → `FlushBuffer`, `bufmgr.c:2634`), the **bgwriter** (`BgBufferSync` → `SyncOneBuffer` → `FlushUnlockedBuffer`), and the **checkpointer** (`BufferSync` → `SyncOneBuffer`). All three funnel through the same `FlushBuffer`, hence the same WAL rule. Backend writes are the ones counted in `pg_stat_io` rather than `pg_stat_bgwriter` (§13).

### 8.3 Kernel writeback coalescing

`WritebackContext` holds up to `WRITEBACK_MAX_PENDING_FLUSHES` (=256) `PendingWriteback{BufferTag}` entries (`buf_internals.h:393-410`). `ScheduleBufferTagForWriteback` (`bufmgr.c:7739-7772`) is a no-op under `io_direct` or `!enableFsync` and flushes when `nr_pending >= *max_pending`; `IssuePendingWritebacks` (`:7789-7867`) sorts the pending tags, coalesces runs of contiguous blocks in the same relfile/fork into single `smgrwriteback` calls, and counts `IOOP_WRITEBACK` (delegated; `bufmgr.c:7863`). Per-context limits are the `*_flush_after` GUCs (§13).

---

## 9. Background writer (delegated; pacing math re-verified)

`bgwriter.c` main loop `:223-343`, one iteration per `BgWriterDelay` (default 200 ms, `bgwriter.c:59`):
`BgBufferSync(&wb_context)` (`:236`) → `pgstat_report_bgwriter()` (`:239`) → `pgstat_report_wal(true)` (`:240`) → wait on latch.

**Hibernation.** `HIBERNATE_FACTOR 50` (`bgwriter.c:65`); there is **no `BGWRITER_HIBERNATE_MS`** constant in this tree. Hibernation needs two consecutive idle cycles (`if (rc == WL_TIMEOUT && can_hibernate && prev_hibernate)`, `:329`): arm `StrategyNotifyBgWriter(MyProcNumber)` (`:332`), sleep `BgWriterDelay * HIBERNATE_FACTOR` = 10 s (`:334-337`), then `StrategyNotifyBgWriter(-1)` (`:339`). The arming is what makes `StrategyGetBuffer`'s latch-set at `freelist.c:218-230` meaningful.

`BgBufferSync` — `bufmgr.c:3854-4135`:
1. `strategy_buf_id = StrategySyncStart(&strategy_passes, &recent_alloc)` (`:3901`) — the current clock-hand position, complete passes, and a *drained* alloc counter (`freelist.c:330-357`).
2. `PendingBgWriterStats.buf_alloc += recent_alloc` (`:3904`).
3. `if (bgwriter_lru_maxpages <= 0) { saved_info_valid = false; return true; }` — disabled ⇒ always hibernate-OK (`:3911-3915`).
4. Compare its own `next_to_clean`/`next_passes` against the strategy point in three cases (ahead one pass `:3934-3944`, same pass ahead `:3945-3956`, behind ⇒ jump to the hand `:3957-3972`) to derive `bufs_to_lap`.
5. Smoothing over `smoothing_samples = 16` (`:3876`) — `bufmgr.c:4001-4028`:
   ```c
   scans_per_alloc = (float) strategy_delta / (float) recent_alloc;
   smoothed_density += (scans_per_alloc - smoothed_density) / smoothing_samples;
   bufs_ahead = NBuffers - bufs_to_lap;
   reusable_buffers_est = (float) bufs_ahead / smoothed_density;
   if (smoothed_alloc <= (float) recent_alloc) smoothed_alloc = recent_alloc;
   else smoothed_alloc += ((float) recent_alloc - smoothed_alloc) / smoothing_samples;
   upcoming_alloc_est = (int) (smoothed_alloc * bgwriter_lru_multiplier);
   ```
   Note the asymmetry: `smoothed_alloc` jumps instantly upward but decays slowly.
6. **Whole-pool pacing:** `scan_whole_pool_milliseconds = 120000.0` (`:3877`), `min_scan_buffers = (int)(NBuffers / (scan_whole_pool_milliseconds / BgWriterDelay))` (`:4051` — verified), and `upcoming_alloc_est` is raised to `min_scan_buffers + reusable_buffers_est` if smaller (`:4053-4060`). Effect: the pool is swept roughly every **120 seconds** even on an idle system, so idle periods end with a mostly-clean pool.
7. Write loop (`:4074-4097`): `while (num_to_scan > 0 && reusable_buffers < upcoming_alloc_est)` calling `SyncOneBuffer(next_to_clean, /*skip_recently_used*/ true, wb_context)`, stopping at `bgwriter_lru_maxpages` writes and counting `PendingBgWriterStats.maxwritten_clean++`.
8. Returns `(bufs_to_lap == 0 && recent_alloc == 0)` (`:4134`) — consumed as `can_hibernate`.

`SyncOneBuffer` — `bufmgr.c:4152-4212`. Return bits `BUF_WRITTEN 0x01`, `BUF_REUSABLE 0x02` (`bufmgr.c:84-85`). Locks the header; refcount==0 && usagecount==0 ⇒ `BUF_REUSABLE` (`:4174-4178`); otherwise, if `skip_recently_used`, return immediately **even if dirty** (`:4179-4184`) — this is the "bgwriter doesn't write hot buffers" rule. Clean or invalid ⇒ 0 (`:4186-4191`). Else pin, share-exclusive-lock, `FlushUnlockedBuffer(bufHdr, NULL, IOOBJECT_RELATION, IOCONTEXT_NORMAL)` (`:4199`), unpin, `ScheduleBufferTagForWriteback` (`:4209`), return `BUF_WRITTEN`. Checkpointer passes `skip_recently_used = false` (`:3788`); bgwriter passes `true` (`:4076`).

`buffers_clean` still reaches `pg_stat_bgwriter`: `PendingBgWriterStats.buf_written_clean` (`bufmgr.c:4099`) → `pgstat_report_bgwriter()` (`pgstat_bgwriter.c:30-65`) → `pg_stat_get_bgwriter_buf_written_clean()` (`system_views.sql:1242`).

Side duties (not buffer-related but explain why bgwriter can be busy): `LogStandbySnapshot()` (`bgwriter.c:274-295`) and `smgrdestroyall()` after each checkpoint (`:242-251`).

---

## 10. Checkpointer (delegated; `IsCheckpointOnSchedule` re-verified)

### `BufferSync` — `bufmgr.c:3575-3840`

1. Mask = `BM_DIRTY`, plus `BM_PERMANENT` unless shutdown / end-of-recovery / flush-unlogged (`:3587`, `:3595-3597`). Flag semantics documented at `:3564-3572`, using the new name **`CHECKPOINT_FAST`** (`:3568`).
2. **Pass 1:** scan all `NBuffers`; for each matching buffer, `UnlockBufHdrExt(..., set_bits = BM_CHECKPOINT_NEEDED, ...)` and append a `CkptSortItem` to `CkptBufferIds` (`:3616-3648`, tagging at `:3631`/`:3641`, recording at `:3633-3638`). Return early if nothing to do (`:3650-3651`).
3. **Sort:** `sort_checkpoint_bufferids(CkptBufferIds, num_to_scan)` (`:3664`), a `sort_template.h` instantiation declared at `bufmgr.c:3557-3562`. `CkptSortItem{tsId, relNumber, forkNum, blockNum, buf_id}` lives in **shared memory** so a checkpoint never has to allocate (`buf_internals.h:516-523`; allocation and reasoning at `buf_init.c:100-110`).
4. `ckpt_buforder_comparator` — `bufmgr.c:7673-7697` — orders by **tablespace → relfilenumber → fork → block**, turning random writes into per-file sequential runs. The header comment at `:7667-7671` stresses tablespace-first ordering is load-bearing for step 5.
5. **Tablespace balancing:** group the sorted array into `CkptTsStatus` entries (`bufmgr.c:151-173`) with `progress_slice = num_to_scan / ts_stat->num_to_scan` (`:3746`), and drive a **min-heap** keyed on `progress` (`binaryheap_allocate(num_spaces, ts_ckpt_progress_comparator, NULL)`, `:3738-3751`; comparator at `:7704-7716`). Each iteration pops the least-progressed tablespace, writes its next buffer, adds `progress_slice`, and re-sifts (`:3759-3821`). Because `progress_slice` is inversely proportional to a tablespace's share of the work, tablespaces finish at roughly the same time instead of one at a time — so a multi-spindle/multi-volume layout gets parallel I/O from a single-threaded checkpointer.
6. Per buffer: only write if `BM_CHECKPOINT_NEEDED` is *still* set (someone may have flushed it meanwhile), via `SyncOneBuffer(buf_id, false, &wb_context)`; on `BUF_WRITTEN` bump `PendingCheckpointerStats.buffers_written` (`:3788-3793`).
7. **Throttle every iteration:** `CheckpointWriteDelay(flags, (double) num_processed / num_to_scan)` (`:3820`).
8. Finish with `IssuePendingWritebacks(&wb_context, IOCONTEXT_NORMAL)` (`:3827`) and `CheckpointStats.ckpt_bufs_written += num_written` (`:3837`).

`CheckPointBuffers(flags)` is a one-line wrapper (`bufmgr.c:4454-4458`).

### Throttling — `checkpointer.c`

`CheckpointWriteDelay(flags, progress)` (`:794-854`): no-op for non-checkpointer callers (`:799-801`); if not `CHECKPOINT_FAST`, not shutting down, and `IsCheckpointOnSchedule(progress)`, then reload config, `AbsorbSyncRequests()`, `CheckArchiveTimeout()`, `pgstat_report_checkpointer()`, and `WaitLatch(..., 100, WAIT_EVENT_CHECKPOINT_WRITE_DELAY)` — a flat **100 ms** nap (`:835-838`). The comment at `:829-834` notes this used to be tied to `bgwriter_delay` and no longer is. If *behind* schedule it doesn't sleep at all, just absorbs sync requests every `WRITES_PER_ABSORB = 1000` writes (`:157`, `:840-848`).

`IsCheckpointOnSchedule(progress)` — `checkpointer.c:865-934`, `progress *= CheckPointCompletionTarget` at `:875` (verified):
```c
progress *= CheckPointCompletionTarget;
if (progress < ckpt_cached_elapsed) return false;
recptr = RecoveryInProgress() ? GetXLogReplayRecPtr(NULL) : GetInsertRecPtr();
elapsed_xlogs = (((double) (recptr - ckpt_start_recptr)) / wal_segment_size)
                / CheckPointSegments;
if (progress < elapsed_xlogs) { ckpt_cached_elapsed = elapsed_xlogs; return false; }
elapsed_time = ((double) ((pg_time_t) now.tv_sec - ckpt_start_time)
                + now.tv_usec / 1000000.0) / CheckPointTimeout;
if (progress < elapsed_time) { ckpt_cached_elapsed = elapsed_time; return false; }
return true;
```
On schedule only if scaled progress is ≥ **both** the WAL-consumption fraction and the wall-clock fraction. `ckpt_cached_elapsed` memoizes the max seen to short-circuit repeat calls (`:883-884`). Note: `CheckPointDistanceEstimate` is **not** in `checkpointer.c` — it lives in `xlog.c` and serves `max_wal_size` smoothing, unrelated to this function.

### fsync request queue — `checkpointer.c`

A **ring buffer** (`head`/`tail`/`num_requests`/`max_requests`), not a flat array (`:113-144`), sized `Min(NBuffers, MAX_CHECKPOINT_REQUESTS=10000000)` (`:163`, `:970-973`). `ForwardSyncRequest` (`:1213-1265`) appends at `tail`, nudges the checkpointer at half-full (`:1249-1261`), and returns **false** — meaning "caller must fsync it itself" — if the checkpointer isn't running or the queue is full and `CompactCheckpointerRequestQueue()` (`:1284-1412`) couldn't dedupe enough. `AbsorbSyncRequests` (`:1424-1489`) drains in batches of `CKPT_REQ_BATCH_SIZE = 10000` (`:160`, `:1458`), copying each batch out before releasing `CheckpointerCommLock` so the lock isn't held across `RememberSyncRequest` (`sync.c:487-572`). Incremental batching is new this cycle (commit `258bf0a2ea8`). `ProcessSyncRequests` (`sync.c:286-476`) does the actual fsyncs at checkpoint time, using `sync_cycle_ctr` to separate requests queued before vs during the fsync phase (`:356-467`).

`RequestCheckpoint` (`:1064-1190`): standalone backends just call `CreateCheckPoint(flags | CHECKPOINT_FAST)` inline (`:1073-1085`); otherwise OR flags into `ckpt_flags`, signal the checkpointer with up to `MAX_SIGNAL_TRIES = 600` retries (`:1114-1137`), and for `CHECKPOINT_WAIT` block on the `start_cv`/`done_cv` counter protocol (`:1143-1189`).

`CHECKPOINT` SQL now takes an option list (`mode` = `spread`/`fast`, `flush_unlogged`) parsed in `ExecCheckpoint` (`:1001-1043`) — commits `8d33fbacbac`, `2f698d7f4b7`, `a4f126516e6`.

`PgStat_CheckpointerStats` fields: `num_timed, num_requested, num_performed, restartpoints_*, write_time, sync_time, buffers_written, slru_written, stat_reset_timestamp` (`pgstat.h:260-273`).

---

## 11. Torn-page protection: full_page_writes, not doublewrite

### 11.1 The FPI decision — `xloginsert.c:678-700` (verified verbatim)

```c
if (regbuf->flags & REGBUF_FORCE_IMAGE)      needs_backup = true;
else if (regbuf->flags & REGBUF_NO_IMAGE)    needs_backup = false;
else if (!doPageWrites)                      needs_backup = false;
else {
    XLogRecPtr page_lsn = PageGetLSN(regbuf->page);
    needs_backup = (page_lsn <= RedoRecPtr);
    if (!needs_backup) {
        if (!XLogRecPtrIsValid(*fpw_lsn) || page_lsn < *fpw_lsn)
            *fpw_lsn = page_lsn;
    }
}
```

`page_lsn <= RedoRecPtr` **is** the torn-page test: if the page's last-WAL LSN predates the current checkpoint's redo point, this may be its first modification since that checkpoint, so recovery has no complete image to start from and one must be attached. Otherwise the page's own LSN is folded into `*fpw_lsn` — the minimum LSN among pages that got *no* image — which becomes the race-detection token.

Also in `XLogRecordAssemble`: `include_image = needs_backup || (info & XLR_CHECK_CONSISTENCY)` (`:721`); hole compression via `pd_lower`/`pd_upper` setting `BKPIMAGE_HAS_HOLE` (`:732-757`, `:786`); `wal_compression` → `BKPIMAGE_COMPRESS_PGLZ/LZ4/ZSTD` (`:762-769`, `:806`/`:811`/`:819`; codes at `xlogrecord.h:157-167`).

`REGBUF_*` semantics — `xloginsert.h:31-41`: `FORCE_IMAGE 0x01`, `NO_IMAGE 0x02`, `WILL_INIT (0x04|0x02)` (replay re-initializes the page, so an image is pointless; sets `BKPBLOCK_WILL_INIT`), `STANDARD 0x08` (enables hole compression), `KEEP_DATA 0x10`, `NO_CHANGE 0x20`.

### 11.2 The race and the retry — `xlog.c:878-896` (verified verbatim)

```c
if (RedoRecPtr != Insert->RedoRecPtr) { Assert(RedoRecPtr < Insert->RedoRecPtr);
                                        RedoRecPtr = Insert->RedoRecPtr; }
doPageWrites = (Insert->fullPageWrites || Insert->runningBackups > 0);
if (doPageWrites &&
    (!prevDoPageWrites ||
     (XLogRecPtrIsValid(fpw_lsn) && fpw_lsn <= RedoRecPtr)))
{
    /* Oops, some buffer now needs to be backed up that the caller didn't back up. */
    WALInsertLockRelease();
    END_CRIT_SECTION();
    return InvalidXLogRecPtr;
}
```
The caller loops: `XLogInsert` runs `do { GetFullPageWriteInfo(&RedoRecPtr, &doPageWrites); XLogRecordAssemble(...); EndPos = XLogInsertRecord(rdt, fpw_lsn, ...); } while (!XLogRecPtrIsValid(EndPos))` (`xloginsert.c:482-540`). So the *authoritative* check happens under the WAL insertion lock, and a checkpoint that advanced `RedoRecPtr` between assemble and insert simply forces a full re-assemble with images attached.

Backends cache `RedoRecPtr`/`doPageWrites` locally (`xlog.c:265-293`); `GetFullPageWriteInfo` hands back the possibly-stale values cheaply and lock-free (`:6967-6972`); `GetRedoRecPtr` refreshes under `info_lck` and only ever moves forward (`:6937-6956`). On checkpoint completion `RedoRecPtr` is republished (`:7561`), invalidating every backend's cached comparison — which is precisely the race above. **UNVERIFIED:** the exact line numbers `xlog.c:265-293`, `:6937-6972`, `:7561` come from the delegated reader; the `:878-896` excerpt I verified myself.

### 11.3 Hint bits can force an FPI — `bufmgr.c:5718-5826`

`XLogHintBitIsNeeded()` is `(wal_log_hints || DataChecksumsNeedWrite())` — `xlog.h:123` (verified). In `MarkSharedBufferDirtyHint`, if that holds and the buffer is `BM_PERMANENT`, the buffer is marked `BM_DIRTY` **first**, then `XLogSaveBufferForHint(buffer, buffer_std)` may emit an `XLOG_FPI_FOR_HINT` record, and the returned LSN is stamped onto the page (`:5754`, `:5772-5779`, `:5800`, `:5802-5820`; delegated). Dirty-before-log ordering matters so a concurrent checkpoint cannot skip the buffer.

The reason a hint bit needs WAL at all: the setter emits no WAL of its own, yet the page's checksum will be recomputed at write time, so a torn write of the hint bit would produce an unverifiable page with no recovery source. Commit `41d3d64e87a` removed the `memcpy` into a scratch page that this path used to need.

### 11.4 No doublewrite

`grep -rin "doublewrite" src/` returns **zero matches** (delegated, and consistent with everything above). PostgreSQL's entire torn-page defense is: the first WAL record touching a page after a checkpoint carries a full image, so redo can always rebuild the page from WAL alone. Contrast with InnoDB's doublewrite buffer (write every page twice, once to a sequential staging area) and with CUBRID's DWB — PG pays the cost in **WAL volume** (measurable: `wal_fpi_bytes` in `pg_stat_wal`, added by commit `f9a09aa2952`) rather than in **double data-file writes**. Consequences worth naming in the comparison: PG's cost is concentrated right after each checkpoint and scales with the number of distinct pages touched per checkpoint interval, which is why `checkpoint_timeout`/`max_wal_size` tuning has such an outsized effect on WAL volume; and PG needs no crash-time scan of a staging area.

`full_page_writes` default **true** (`guc_parameters.dat:1125-1130`), `PGC_SIGHUP`. `UpdateFullPageWrites` (`xlog.c:8761-8819`) turns it **on** before logging the change and **off** after, because extra images are always safe and missing ones never are (`:8787-8791`). Online base backups force images by incrementing `XLogCtl->Insert.runningBackups` under the WAL insert lock (`xlog.c:9492-9514`) — there is no field literally named `forcePageWrites` in this tree. (Delegated line numbers in this paragraph are **UNVERIFIED** beyond the GUC entry.)

---

## 12. Local buffers (temp tables) — `localbuf.c`

- Separate pool of `NLocBuffer` descriptors, `LocalBufferDescriptors` (`buf_internals.h:418`), sized by `temp_buffers` (default 1024 blocks = 8 MB).
- **Same `BufferDesc` struct, but locks unused and state manipulated non-atomically.** `buf_internals.h:312-316`: "we use this same struct for local buffer headers, but the locks are not used ... manipulations of the state field should be done without actual atomic operations (i.e. only `pg_atomic_read_u64()` and `pg_atomic_unlocked_write_u64()`)." Visible in `PinLocalBuffer` (`localbuf.c:835-847`) and `GetLocalVictimBuffer` (`:249-254`). Descriptors are not cache-line padded, since there's no concurrency (`buf_internals.h:373-375`).
- Pin counts live in a plain array `LocalRefCount[]` (`bufmgr.h:194`), not in the packed state; `PinLocalBuffer(buf_hdr, adjust_usagecount)` bumps usagecount to at most `BM_MAX_USAGE_COUNT` when asked (`localbuf.c:829-861`).
- **Victim selection is a clock sweep too** — `GetLocalVictimBuffer`, `localbuf.c:225-304`, with the giveaway comment at `:233-236`: "We use a clock-sweep algorithm (essentially the same as what freelist.c does now...)". Hand is `nextFreeLocalBufId` (`:51`, `:240-243`); `trycounter = NLocBuffer`; usagecount>0 ⇒ decrement and reset the counter (`:251-256`); refcount>0 with refcount 0 in `LocalRefCount` is tolerated because a failed AIO can leave that state (`:257-263`); exhaustion ⇒ `ERROR "no empty local buffer available"` (`:271-274`).
- **Lazy allocation:** the 8 KB block is allocated on first use of a slot (`:277-284`).
- Dirty victims are written by `FlushLocalBuffer` (`:183`) with no WAL flush; eviction counts `IOOP_EVICT` in `IOOBJECT_TEMP_RELATION`/`IOCONTEXT_NORMAL` (`:296-301`).
- Local buffers participate in AIO: `StartLocalBufferIO` / `TerminateLocalBufferIO` (`:532`, `:586`) and the `PGAIO_HCB_LOCAL_BUFFER_READV` callback (`bufmgr.c:2136-2138`).
- Pin-limit analogues: `GetLocalPinLimit` (`:308`), `GetAdditionalLocalPinLimit` (`:319`), `LimitAdditionalLocalPins` (`:332`).

Cross-session access to another backend's temp relation is rejected in `ReadBuffer_common` (`bufmgr.c:1293-1296`) and `StartReadBuffersImpl` (`:1389-1392`); commits `ce146621f78`, `c40819ebf95`.

---

## 13. Tunables and observability (delegated; sampled anchors verified)

> **Read GUCs from `src/backend/utils/misc/guc_parameters.dat`, not `guc_tables.c`.** The latter is generated by `gen_guc_tables.pl` (commit `63599896545`). `grep bgwriter_lru_maxpages guc_tables.c` returns nothing.

| GUC | Default | Bounds | Anchor (`guc_parameters.dat`) |
|---|---|---|---|
| `shared_buffers` | 16384 blocks (128 MB) | 16 … `INT_MAX/2` | `:2716-2724` (verified) |
| `temp_buffers` | 1024 blocks | 100 … `INT_MAX/2` | `:3054-3062` |
| `bgwriter_delay` | 200 ms | 10 … 10000 | `:337-344` |
| `bgwriter_lru_maxpages` | 100 | 0 … `INT_MAX/2` | `:357-364` |
| `bgwriter_lru_multiplier` | 2.0 | 0.0 … 10.0 | `:366-372` |
| `bgwriter_flush_after` | 64 blocks (Linux) / 0 | 0 … 256 | `:346-354`; `pg_config_manual.h:162,166` |
| `checkpoint_timeout` | 300 s | 30 … 86400 | `:429-437` |
| `checkpoint_completion_target` | 0.9 | 0.0 … 1.0 | `:410-417`; var `checkpointer.c:170` (verified) |
| `checkpoint_flush_after` | 32 blocks | 0 … 256 | `:419-427` |
| `backend_flush_after` | 0 (disabled) | 0 … 256 | `:311-319` |
| `max_wal_size` | 1024 MB | 2 … `MAX_KILOBYTES` | `:2202-2210` |
| `min_wal_size` | 80 MB | 2 … `MAX_KILOBYTES` | `:2264-2271` |
| `full_page_writes` | on | — | `:1125-1130` |
| `wal_log_hints` | off (`PGC_POSTMASTER`) | — | `:3517-3521` |
| `io_method` | **worker** | sync/worker/io_uring | `:1408-1414`; `aio.h:42` (verified) |
| `io_min_workers` | 2 (`PGC_SIGHUP`) | 1 … 32 | `:1416-1422` (verified) |
| `io_max_workers` | 8 (`PGC_SIGHUP`) | 1 … 32 | `:1400-1406` (verified) |
| `io_worker_idle_timeout` | 60000 ms | 0 … `INT_MAX` | `:1424-1431` |
| `io_worker_launch_interval` | 100 ms | 0 … `INT_MAX` | `:1433-1440` |
| `io_max_concurrency` | −1 (auto) | −1 … 1024 | `:1391-1398` |
| `io_combine_limit` | 16 blocks (128 KB) | 1 … `PG_IOV_MAX` | `:1371-1379`; `bufmgr.h:175-176` |
| `io_max_combine_limit` | same (`PGC_POSTMASTER`) | 1 … `PG_IOV_MAX` | `:1381-1389` |
| `effective_io_concurrency` | **16** | 0 … 1000 | `bufmgr.h:170`, `:197` (verified) |
| `maintenance_io_concurrency` | **16** | 0 … 1000 | `bufmgr.h:171` (verified) |
| `vacuum_buffer_usage_limit` | 2048 KB | 0 … `MAX_BAS_VAC_RING_SIZE_KB` | `:3326-3335` |
| `track_io_timing` | off (`PGC_SUSET`) | — | `:3229-3232` |
| `debug_io_direct` | "" | — | `:676-684` |

`io_workers` (the old single knob, default 3) **no longer exists** — replaced by the four-GUC auto-scaling pool in commit `d1c01b79d4a`. There is **no `io_direct` GUC**, only `debug_io_direct`.

**`shared_buffers` is still `PGC_POSTMASTER`** and *not* runtime-resizable in this tree: no `GUC_RUNTIME_COMPUTED` flag, and `grep -rn "NBuffersPending\|shared_buffers_full\|ResizeBuffer" src/backend` returns zero hits (delegated). Worth stating explicitly, since online buffer-pool resizing has been under discussion upstream.

### Where counters are bumped

`BufferUsage` struct — `instrument.h:24-42`. Bump sites in `bufmgr.c`/`localbuf.c` (delegated; several cross-checked against my own reads):

| Field | Site(s) |
|---|---|
| `shared_blks_hit` | `bufmgr.c:864`, `:1698` (in `TrackBufferHit`) |
| `local_blks_hit` | `bufmgr.c:843`, `:1696` |
| `shared_blks_read` / `local_blks_read` | `bufmgr.c:2162` / `:2160` (`+= io_buffers_len`, verified) |
| `shared_blks_dirtied` | `bufmgr.c:3215` (verified), `:5822` (hint-bit path) |
| `shared_blks_written` | `bufmgr.c:4627` (verified, `FlushBuffer`), `:3069` (`+= extend_by`) |
| `local_blks_written` | `localbuf.c:221`, `:490` |
| `local_blks_dirtied` | `localbuf.c:521` |

`temp_blk_*_time` fields exist in the struct but the delegated reader found **no bump sites** for them — flagged as a possible gap, **UNVERIFIED**.

`EXPLAIN`: `show_buffer_usage` at `explain.c:4292`. The option defaulting moved to a new file — `explain_state.c:185`: `es->buffers = (buffers_set) ? es->buffers : es->analyze;` — i.e. **`EXPLAIN ANALYZE` shows Buffers by default** unless `BUFFERS off` is given.

`pgstat` I/O enums — `pgstat.h`: `IOObject {RELATION, TEMP_RELATION, WAL}` (`:279-286`); `IOContext {BULKREAD, BULKWRITE, INIT, NORMAL, VACUUM}` (`:289-294`); `IOOp {EVICT, FSYNC, HIT, REUSE, WRITEBACK | EXTEND, READ, WRITE}` (`:310-323`) — only the last three are byte-tracked. Call sites: `IOOP_HIT` `bufmgr.c:1700`; `IOOP_READ` `:1836` (wait time only, count 0) and `:2156` (verified); `IOOP_REUSE`/`IOOP_EVICT` `:2660` (verified); `IOOP_EXTEND` `:3044`; `IOOP_WRITE` `:4624` (verified); `IOOP_WRITEBACK` `:7863`; temp equivalents `localbuf.c:215`, `:300`, `:472`; `IOOP_FSYNC` in `md.c`.

Views (`system_views.sql`, line numbers verified): `pg_stat_bgwriter` at `:1240` — now only **four** columns (`buffers_clean`, `maxwritten_clean`, `buffers_alloc`, `stats_reset`); `pg_stat_checkpointer` at `:1247`; `pg_stat_io` at `:1261`, exposing `reads/read_bytes/read_time`, `writes/write_bytes/write_time`, `writebacks/writeback_time`, `extends/extend_bytes/extend_time`, `hits`, `evictions`, `reuses`, `fsyncs`, `fsync_time` (`:1261-1283`). **`*_bytes` are `numeric` byte counts, not block counts** — a real trap for monitoring queries. `buffers_backend`/`buffers_backend_fsync` are gone from `pg_stat_bgwriter`; backend writes now appear in `pg_stat_io`.

`pg_stat_get_backend_io(pid)` exists as a **function with no wrapping view** (`pgstatfuncs.c:1609`, `pg_proc.dat:6070-6076`) — you must call it directly.

`contrib/pg_buffercache` is at version **1.7**, and this cycle added `pg_buffercache_os_pages` (replacing `pg_buffercache_numa`'s definition) and `pg_buffercache_mark_dirty{,_relation,_all}` alongside the existing `pg_buffercache_evict{,_relation,_all}`, `pg_buffercache_summary`, `pg_buffercache_usage_counts` (`pg_buffercache_pages.c:69-79`; commits `4b203d499c6`, `9ccc049dfe6`, `257c8231bf9`). The engine side of the new dirty-marking functions is `MarkDirtyUnpinnedBuffer*` in `bufmgr.c:8132-8330` (commit `9660906dbd6`).

Wait events (`wait_event_names.txt`): `BUFFER_IO` (`:114`); content-lock class `BUFFER_CLEANUP` `:295`, `BUFFER_SHARED` `:296`, `BUFFER_SHARE_EXCLUSIVE` `:297`, `BUFFER_EXCLUSIVE` `:298`; AIO `AIO_IO_COMPLETION` `:203`, `AIO_IO_URING_SUBMIT` `:204`, `AIO_IO_URING_EXECUTION` `:205`; `AioWorkerSubmissionQueue` `:369`, `AioWorkerControl` `:373`; `BufferMapping` `:391`.

---

## 14. Surprising / little-known facts, anchored

1. **`buf_init.c:42` still documents a freelist that no longer exists** — "buffers live in a freelist and a lookup data structure." A reader trusting comments over code will get this wrong.
2. **The buffer header "spinlock" is a bit in the same word as the content lock and the refcount.** `BM_LOCKED` is `BUF_DEFINE_FLAG(0)` (`buf_internals.h:106`), so `LockBufHdr` is a `fetch_or` on the very word other backends are CAS-ing (`bufmgr.c:7580`).
3. **You may release a pin while another backend holds the header lock, but never acquire one.** `buf_internals.h:286-289`; that asymmetry is why `UnpinBuffer` is a single `fetch_sub` (`bufmgr.c:3520`) while `PinBuffer` must check `BM_LOCKED` first (`:3322`).
4. **The clock hand is a free-running counter, not an index.** `nextVictimBuffer` only ever increases and is taken mod `NBuffers` (`freelist.c:38-42`, `:119-127`), so concurrent sweepers need no lock and buffers can come back slightly out of order. `completePasses` is bumped by whichever backend caused the wraparound, in a spinlock retry loop (`:135-163`), and `StrategySyncStart` adds `nextVictimBuffer / NBuffers` to compensate for increments not yet applied (`:344-348`).
5. **`trycounter` in `StrategyGetBuffer` only counts *pinned* buffers.** Decrementing a usagecount resets it to `NBuffers` (`freelist.c:293`), so "no unpinned buffers available" fires only when a whole pass saw nothing but pinned buffers.
6. **A ring buffer is abandoned by a `usagecount > 1` test, not by bookkeeping.** `freelist.c:664-666` — if another backend touched the page, the ring silently gives it up and takes a new buffer.
7. **`BAS_BULKREAD` ring size now depends on `effective_io_concurrency` and `io_combine_limit`**, because in-flight buffers can't be reused (`freelist.c:469-482`). Raising `effective_io_concurrency` therefore enlarges every bulkread ring.
8. **`GetVictimBuffer` skips the WAL-flush check for unlogged buffers** because fake LSNs make `XLogNeedsFlush` meaningless (`bufmgr.c:2624-2626`, commit `11e0824bd97`).
9. **A backend that finds someone else's read in progress does not sleep on the buffer's CV — it copies their AIO wait reference and defers** (`bufmgr.c:7304-7310`), explicitly to keep enough I/O in flight for index scans revisiting blocks and for concurrent scans (`:2039-2049`). `WaitIO` copies `io_wref` under the header spinlock to race safely against a concurrent `TerminateBufferIO` clearing it (`:7212-7217`).
10. **Session GUCs are baked into AIO flags at issue time** — `zero_damaged_pages` and `ignore_checksum_failure` — because the completion callback may run in an io_worker with different values (`bufmgr.c:1979-1998`).
11. **The AIO subsystem holds its own pin**, dropped in `TerminateBufferIO` via `refcount_change = -1` (`bufmgr.c:7425-7431`), and completing another backend's I/O may therefore be what wakes a cleanup-lock waiter (`:7443-7452`).
12. **Vacuum cost is charged when I/O is issued, not when it completes** (`bufmgr.c:2164-2170`) — otherwise async I/O would let a burst escape the cost limit.
13. **`pg_stat_io` can record read *time* with a read *count* of zero.** `WaitReadBuffers` books wait time as `IOOP_READ` with count 0 and bytes 0 because the operation was already counted, possibly by a different backend (`bufmgr.c:1831-1837`; commit `c9a66949271`).
14. **`ReadBuffer()` deliberately opts out of asynchrony** by setting `READ_BUFFERS_SYNCHRONOUSLY` (`bufmgr.c:1348-1353`) — AIO only pays off through read streams, and even read streams force synchronous I/O on their all-cached fast path (`read_stream.c:1074-1087`). Lookahead then grows geometrically but decays linearly, with a hold-off window (`read_stream.c:1229-1251`).
15. **`BufferLockConditional` on a buffer you already locked always fails**, even share-on-share, because there is one `lockmode` slot per private refcount entry (`bufmgr.c:6064-6070`).
16. **Checkpoint sorting is tablespace-first for an algorithmic reason**, not tidiness: the per-tablespace min-heap balancing at `bufmgr.c:3738-3813` depends on it (`:7667-7671`), and it's what lets one checkpointer thread keep several volumes busy. The `CkptSortItem` array lives in shared memory so a checkpoint never allocates (`buf_init.c:100-110`).
17. **`checkpoint_completion_target` scales the *progress* value, not the deadline** (`checkpointer.c:875`), and the throttle nap is a flat 100 ms no longer tied to `bgwriter_delay` (`:829-838`).
18. **The bgwriter sweeps the whole pool every ~120 s even when idle**, via `min_scan_buffers` (`bufmgr.c:4051`). Its return value *is* the hibernation decision, `(bufs_to_lap == 0 && recent_alloc == 0)` (`:4134`), and hibernation requires two consecutive idle cycles (`bgwriter.c:329`).
19. **`ForwardSyncRequest` returning false means the caller must fsync the file itself** (`checkpointer.c:1213-1265`) — a silent fallback that turns checkpointer backpressure into backend-visible latency.
20. **PG has no doublewrite buffer at all** (`grep -rin doublewrite src/` → nothing); torn pages are handled entirely by FPIs, trading double *data* writes for extra *WAL*.
21. **A hint-bit-only change can emit a WAL record** whenever `wal_log_hints` or checksums are on (`xlog.h:123`, `bufmgr.c:5754-5800`) — the usual explanation for "why does a read-only-looking query generate WAL".
22. **`MaxProportionalPins = NBuffers / (MaxBackends + NUM_AUXILIARY_PROCS)`** (`bufmgr.c:4248`) and `GetAdditionalPinLimit` *over*-estimates pins held by assuming the 8-entry array is full (`:2712-2716`) — on small `shared_buffers` this can legitimately be zero (`:2691-2692`).
23. **Local (temp) buffers reuse `BufferDesc` but must not use atomics on it** (`buf_internals.h:312-316`), and they run the same clock sweep (`localbuf.c:233-236`) with lazy per-slot 8 KB allocation (`:277-284`).

---

## 15. Gaps and unverified items

- Delegated line numbers I did **not** personally re-verify: most of `read_stream.c` beyond `:1228-1252`, the AIO internals (`aio.c`, `aio_internal.h`, `method_worker.c`), `pgstatfuncs.c`, `explain_state.c`, `pg_buffercache_pages.c`, `wait_event_names.txt`, `sync.c`, and the `xlog.c` RedoRecPtr-cache anchors in §11.2's closing paragraph. The mechanisms they describe are consistent with code I did read; treat the specific line numbers as high-confidence-but-secondhand.
- `temp_blk_read_time`/`temp_blk_write_time` in `BufferUsage` appear to have no bump sites. Not chased down. **UNVERIFIED.**
- I did not read `ExtendBufferedRelShared` (`bufmgr.c:2809`) in detail; relation extension is a distinct path from both read and eviction and would matter for a bulk-load comparison.
- I did not examine `LockBufferForCleanup` (`bufmgr.c:6693`) beyond its interaction with `BM_PIN_COUNT_WAITER`; note commit `8d85cb889a3 "bufmgr: Fix race in LockBufferForCleanup()"` landed this cycle.
- `f19c0eccae9 "Online enabling and disabling of data checksums"` landed in this window and touches `DataChecksumsNeedWrite()`; its interaction with FPW/hint bits is only partially covered here.
