# InnoDB Buffer Pool — Contrast Fact Sheet (mysql-26.7.0)

| | |
|---|---|
| **Repo** | `/home/vimkim/gh/mysql/mysql-server` |
| **`git rev-parse --short HEAD`** | `06a5c1c99c3` |
| **`git describe --tags`** | `mysql-26.7.0` |
| **Version file** | `MYSQL_VERSION`: MAJOR=26, MINOR=7, PATCH=0, MATURITY=`INNOVATION`, PREVIOUS_LTS=9.7.0 |
| **Date compiled** | 2026-08-06 |
| **Purpose** | Contrast reference for CUBRID `src/storage/page_buffer.c` analysis |

**Reading conventions.** Every factual claim below carries a `file:line` anchor from a read performed in this session. Line numbers are for this exact commit. Where I state something I could not confirm by reading code, it is tagged **UNVERIFIED**. Where 26.7 differs from what is commonly written about MySQL 5.7/8.0, the paragraph is marked **[Δ vs 8.0 lore]**.

**Primary files read.** `storage/innobase/buf/{buf0buf.cc, buf0lru.cc, buf0flu.cc, buf0rea.cc, buf0dblwr.cc}`; `storage/innobase/include/{buf0buf.h, buf0buf.ic, buf0lru.h, buf0flu.h, buf0dblwr.h, buf0types.h, hash0hash.h, srv0srv.h, log0chkp.h, log0constants.h, fil0pages_persistence_interface.h}`; `storage/innobase/log/log0chkp.cc`; `storage/innobase/fil/fil0innodb_pages_persistence.cc`; `storage/innobase/srv/srv0srv.cc`; `storage/innobase/handler/{ha_innodb.cc, i_s.cc}`.

---

## 1. `buf_pool_t` anatomy

### 1.1 Instances and `page_id → instance` mapping

`buf_pool_ptr` is a flat array of `buf_pool_t` (`buf0buf.h:117`, allocated at `buf0buf.cc:1519-1521`). Max instances is 64:

```cpp
// storage/innobase/include/buf0buf.h:104-114
constexpr ulint MAX_BUFFER_POOLS_BITS = 6;
constexpr ulint MAX_BUFFER_POOLS = (1 << MAX_BUFFER_POOLS_BITS);
#define BUF_POOL_WATCH_SIZE (srv_n_purge_threads + 1)
constexpr ulint MAX_PAGE_HASH_LOCKS = 1024;
```

The mapping deliberately **strips the low 6 bits of the page number** so that a 64-page extent lands entirely in one instance — which is what makes read-ahead and neighbour-flush single-instance operations:

```cpp
// storage/innobase/include/buf0buf.ic:823-832
static inline buf_pool_t *buf_pool_get(const page_id_t &page_id) {
  /* 2log of BUF_READ_AHEAD_AREA (64) */
  page_no_t ignored_page_no = page_id.page_no() >> 6;
  page_id_t id(page_id.space(), ignored_page_no);
  ulint i = id.hash() % srv_buf_pool_instances;
  return (&buf_pool_ptr[i]);
}
```

`page_id_t::hash()` is a hand-rolled mix, not a general hash function (`buf0buf.h:225-229`): `(((uint64_t)space << 20) + space + page_no) ^ 1653893711`.

**[Δ vs 8.0 lore] `innodb_buffer_pool_instances` default is now `0` = auto**, and the auto-computation is new. `srv_buf_pool_instances_default = 0` (`srv0srv.cc:434`), sysvar min is 0 (`ha_innodb.cc:22593-22598`). The resolution logic:

```cpp
// storage/innobase/handler/ha_innodb.cc:4650-4669
if (srv_buf_pool_size < BUF_POOL_SIZE_THRESHOLD) {          // 1 GiB
  ...
  srv_buf_pool_instances = 1;
} else if (!innodb_buffer_pool_instances_is_set()) {
  const auto bp_hint_ull = srv_buf_pool_size / (srv_buf_pool_chunk_unit * 2);
  ulong bp_hint = ...;
  ulong cpu_hint = ulong{my_num_vcpus() / 4};
  srv_buf_pool_instances = std::clamp(std::min(bp_hint, cpu_hint), 1UL, 64UL);
}
```

`BUF_POOL_SIZE_THRESHOLD = 1 GiB` (`srv0start.h:68`). So on a small VM you silently get 1 instance; on a 64-vCPU box with a 32 GiB pool you get `min(128, 16) = 16`. Under 8.0 the documented default was a fixed 8 (or 1 below 1 GiB) — the vCPU term is new.

Instances are created **in parallel** with up to 8 worker threads, and each creating thread pins itself to `instance_no % n_cores` and sets `nice -20` (`buf0buf.cc:1256-1274`, `1532-1546`). The comment explains why: 128 G / 16 instances went from ~10 s to ~4 s (`buf0buf.cc:1533-1537`).

### 1.2 Chunks, resizing, withdraw

Each instance is `n_chunks` chunks of `srv_buf_pool_chunk_unit` bytes (`buf0buf.cc:1288-1291`). Chunk struct is tiny:

```cpp
// storage/innobase/include/buf0buf.ic:53-58
struct buf_chunk_t {
  ulint size;          /*!< size of frames[] and blocks[] */
  unsigned char *mem;  /*!< pointer to the memory area which
                       was allocated for the frames */
  buf_block_t *blocks; /*!< array of buffer control blocks */
```

Chunk size default 128 MiB, min 1 MiB, must be a 1 MiB multiple (`ha_innodb.cc:22532-22540`, `srv0srv.cc:425-427`). Online resize granularity = one chunk.

Shrinking uses a **withdraw list**: `buf_pool->withdraw` + `withdraw_target` (`buf0buf.h:2443-2449`). Blocks pulled off the free list that belong to a to-be-removed chunk are diverted onto `withdraw` instead of being handed out:

```cpp
// storage/innobase/buf/buf0lru.cc:427-447  (inside buf_LRU_get_free_only)
    if (!buf_get_withdraw_depth(buf_pool) ||
        !buf_block_will_withdrawn(buf_pool, block)) {
      /* found valid free block */
      block->ahi.assert_empty();
      buf_block_set_state(block, BUF_BLOCK_READY_FOR_USE);
      ...
      return (block);
    }
    /* This should be withdrawn */
    mutex_enter(&buf_pool->free_list_mutex);
    UT_LIST_ADD_LAST(buf_pool->withdraw, &block->page);
```

Resize progress is exposed through two atomics and an 8-value status enum (`buf0types.h:120-147`): START → DISABLE_AHI → WITHDRAW_BLOCKS → GLOBAL_LOCK → IN_PROGRESS → HASH → COMPLETE/FAILED. Resize begins by disabling the adaptive hash index outright (`buf0buf.cc:2230-2236`).

### 1.3 Key lists

All in `buf_pool_t`:

| List | Field | Node | Protected by |
|---|---|---|---|
| free | `free` | `buf_page_t::list` | `free_list_mutex` (`buf0buf.h:2440-2441`) |
| withdraw | `withdraw` | `buf_page_t::list` | `free_list_mutex` (`buf0buf.h:2443-2446`) |
| LRU | `LRU` | `buf_page_t::LRU` | `LRU_list_mutex` (`buf0buf.h:2463-2464`) |
| flush_list | `flush_list` | `buf_page_t::list` | `flush_list_mutex` (`buf0buf.h:2397-2398`) |
| unzip_LRU | `unzip_LRU` | `buf_block_t::unzip_LRU` | `LRU_list_mutex` (`buf0buf.h:2477-2479`) |
| zip_clean | `zip_clean` | `buf_page_t::list` | debug-only build (`buf0buf.h:2487-2490`) |
| zip_free[] | `zip_free[]` | buddy free lists | `zip_free_mutex` (`buf0buf.h:2492-2493`) |

Note the **`list` node is overloaded**: free, withdraw, flush_list and zip_clean all reuse it, disambiguated by `state` (`buf0buf.h:1613-1629`). Only `LRU` has a dedicated node. This is a memory-saving trick with an obvious hazard, and the header documents the invariants explicitly.

### 1.4 page_hash and its locking — sharded rw-locks, yes

`page_hash` is a `hash_table_t *` (`buf0buf.h:2351-2354`) created with `srv_n_page_hash_locks` rw-locks:

```cpp
// storage/innobase/buf/buf0buf.cc:1359-1368
    /* Number of locks protecting page_hash must be a power of two */
    srv_n_page_hash_locks =
        static_cast<ulong>(ut_2_power_up(srv_n_page_hash_locks));
    ut_a(srv_n_page_hash_locks != 0);
    ut_a(srv_n_page_hash_locks <= MAX_PAGE_HASH_LOCKS);

    buf_pool->page_hash =
        ib_create(2 * buf_pool->curr_size, LATCH_ID_HASH_TABLE_RW_LOCK,
                  srv_n_page_hash_locks, MEM_HEAP_FOR_PAGE_HASH);
```

Default `srv_n_page_hash_locks = 16` (`srv0srv.cc:436`); tunable only in debug/perf-debug builds (`ha_innodb.cc:22542-22548`), max 1024. Bucket count = `2 × curr_size` pages.

The hash table declares its own sync discipline:

```cpp
// storage/innobase/include/hash0hash.h:420-462 (abridged)
  a) HASH_TABLE_SYNC_NONE in which case n_sync_obj is 0 and rw_locks is nullptr
  b) HASH_TABLE_SYNC_RW_LOCK in which case n_sync_obj > 0 is the number of
     rw_locks elements, each of which protects a disjoint fraction of cells.
  ...
  size_t n_sync_obj = 0;
  rw_lock_t *rw_locks = nullptr;
```

Shard selection: `buf_page_hash_lock_get()` = `hash_get_lock(page_hash, page_id.hash())` (`buf0buf.h:2608-2611`). Because the table can be *rehashed* during resize, the code must re-confirm which shard it holds after taking the lock — `hash_lock_s_confirm` / `hash_lock_x_confirm` (`buf0buf.h:2613-2624`, `hash0hash.h:334-346`). This "acquire then confirm then possibly re-acquire" idiom appears at every lookup site (e.g. `buf0buf.cc:3827-3831`). Modifying the table's cell array requires X on **all** shards (`hash0hash.h:406-412`, `hash_lock_x_all`).

`zip_hash` (block-frame → block, for buddy-allocated frames) is a *plain* `hash_table_t` with no internal locks, protected externally by `zip_hash_mutex` (`buf0buf.h:2305-2306`, `2356-2358`, created `buf0buf.cc:1370`).

### 1.5 The mutex split — verified names

```cpp
// storage/innobase/include/buf0buf.h:2288-2313  (verbatim, abridged comments)
  BufListMutex chunks_mutex;      // protects (de)allocation of chunks
  BufListMutex LRU_list_mutex;    // LRU list mutex
  BufListMutex free_list_mutex;   // free and withdraw list mutex
  BufListMutex zip_free_mutex;    // buddy allocator mutex
  BufListMutex zip_hash_mutex;    // zip_hash mutex
  ib_mutex_t flush_state_mutex;   // Flush state protection mutex
  BufPoolZipMutex zip_mutex;      // protects compressed-only pages
```

Plus, per instance, `flush_list_mutex` (`buf0buf.h:2385-2388`), and per block `buf_block_t::mutex` (created at `buf0buf.cc:1331`; type `BPageMutex = ib_bpmutex_t`, `buf0types.h:182`).

Creation site with latch IDs: `buf0buf.cc:1280-1286` and `1377`.

`buf_page_get_mutex(bpage)` dispatches to `zip_mutex` for compressed-only descriptors and to `block->mutex` for real blocks — code asserts on this distinction repeatedly (e.g. `buf0buf.cc:4068`, `buf0flu.cc:1076`).

`flush_state_mutex` guards a small triple — `init_flush[]`, `n_flush[]`, `no_flush[]` events — and the *only* sanctioned way to touch them is a closure passed to `change_flush_state()`, which keeps the event in sync with the predicate:

```cpp
// storage/innobase/include/buf0buf.h:2549-2563
  template <typename F>
  void change_flush_state(buf_flush_t flush_type, F &&change) {
    mutex_enter(&flush_state_mutex);
    const bool was_set = !is_flushing(flush_type);
    ut_ad(was_set == os_event_is_set(no_flush[flush_type]));
    std::forward<F>(change)();
    const bool should_be_set = !is_flushing(flush_type);
    if (was_set && !should_be_set)      os_event_reset(no_flush[flush_type]);
    else if (!was_set && should_be_set) os_event_set(no_flush[flush_type]);
    ut_ad(should_be_set == os_event_is_set(no_flush[flush_type]));
    mutex_exit(&flush_state_mutex);
  }
```

### 1.6 Zip lists (brief)

Compressed-page support keeps: `unzip_LRU` (blocks that have *both* a compressed and a decompressed frame), `zip_clean` (debug builds only), and `zip_free[BUF_BUDDY_SIZES_MAX]` buddy lists managed by `buf0buddy.cc`. Eviction picks between `unzip_LRU` and the main LRU by an I/O-vs-decompress cost heuristic averaged over 50 one-second intervals (`buf0lru.cc:95-117`, `178-215`); `unzip_LRU` is skipped entirely if it is ≤ 10 % of LRU length (`buf0lru.cc:186-192`). From `unzip_LRU` only the uncompressed frame is dropped, so even dirty blocks qualify (`buf0lru.cc:85-91`).

### 1.7 Hazard pointers — worth noting for CUBRID contrast

Because list mutexes are dropped mid-scan, InnoDB uses explicit hazard pointers so a concurrent remover can advance a scanner's cursor rather than leaving it dangling: `flush_hp`, `oldest_hp` (flush list), `lru_hp`, `lru_scan_itr`, `single_scan_itr` (LRU) — `buf0buf.h:2390-2395`, `2451-2461`; classes at `buf0buf.h:2039-2156`; adjust helpers at `buf0buf.cc:2896-2972` and `buf0lru.cc:757-761`. Every removal path calls `adjust()` *before* unlinking (`buf0lru.cc:774-776`, `buf0flu.cc:587-590`).

---

## 2. `buf_page_t` vs `buf_block_t`

### 2.1 Layout relationship

`buf_block_t::page` is the **first member**, so a `buf_page_t*` from the hash can be cast to `buf_block_t*` when the state says it is a real block:

```cpp
// storage/innobase/include/buf0buf.h:1756-1783 (abridged)
struct buf_block_t {
  /** page information; this must be the first field, so
  that buf_pool->page_hash can point to buf_page_t or buf_block_t */
  buf_page_t page;
  BPageLock lock;              // rw-lock of the buffer frame
  byte *frame;                 // UNIV_PAGE_SIZE-aligned data frame
  UT_LIST_NODE_T(buf_block_t) unzip_LRU;
```

`BPageLock = rw_lock_t` (`buf0types.h:187`; the mutex typedefs are at `buf0types.h:182-185`). `buf_block_t` additionally carries the AHI state (`ahi_t` with atomic `recommended_prefix_info`, `prefix_info`, `index`) at `buf0buf.h:1793-1834`, a `modify_clock`, `made_dirty_with_no_latch`, and a debug-only `debug_latch`.

### 2.2 Page states — 8 values, unchanged names

```cpp
// storage/innobase/include/buf0buf.h:126-153 (abridged)
enum buf_page_state : uint8_t {
  BUF_BLOCK_POOL_WATCH,    // sentinel in buf_pool->watch[]
  BUF_BLOCK_ZIP_PAGE,      // clean compressed page
  BUF_BLOCK_ZIP_DIRTY,     // compressed page on flush_list
  BUF_BLOCK_NOT_USED,      // on free list
  BUF_BLOCK_READY_FOR_USE, // just returned by buf_LRU_get_free_block
  BUF_BLOCK_FILE_PAGE,     // a buffered file page
  BUF_BLOCK_MEMORY,        // some main-memory object
  BUF_BLOCK_REMOVE_HASH    // AHI must be removed before freeing
};
```

`BUF_PAGE_STATE_BITS = 3` (`buf0buf.h:1146`), and the enum comment insists the values must stay 0..7 (`buf0buf.h:129`). 26.7 adds a `buf_page_state_str` map used by I_S output (`buf0buf.h:155-165`); the three zip states map to empty strings there.

The header carries a full state-machine contract worth reading verbatim for the CUBRID comparison — it is the closest InnoDB gets to CUBRID's `pgbuf_bcb` invariant comments:

```
// storage/innobase/include/buf0buf.h:2705-2714
State transitions:
NOT_USED => READY_FOR_USE
READY_FOR_USE => MEMORY
READY_FOR_USE => FILE_PAGE
MEMORY => NOT_USED
FILE_PAGE => NOT_USED   NOTE: This transition is allowed if and only if
                                (1) buf_fix_count == 0,
                                (2) oldest_modification == 0, and
                                (3) io_fix == 0.
```

and the per-state consistency conditions at `buf0buf.h:2676-2703`, including the key latch coupling: `io_fix == BUF_IO_READ` ⟺ x-locked; `io_fix == BUF_IO_WRITE` ⟺ s-locked.

### 2.3 `buf_fix_count` — atomic, latch-free

```cpp
// storage/innobase/include/buf0buf.h:1155, 1384-1385
using buf_fix_count_atomic_t = copyable_atomic_t<uint32_t>;
  /** Count of how many fold this block is currently bufferfixed. */
  buf_fix_count_atomic_t buf_fix_count;
```

Fix/unfix are plain atomic RMW with **no mutex**:

```cpp
// storage/innobase/include/buf0buf.ic:758-762, 789-795
static inline ulint buf_block_fix(buf_page_t *bpage) {
  auto count = bpage->buf_fix_count.fetch_add(1) + 1;
  ut_ad(count > 0);
  return (count);
}
static inline ulint buf_block_unfix(buf_page_t *bpage) {
  ut_ad(!mutex_own(buf_page_get_mutex(bpage)));
  const auto count = bpage->buf_fix_count.fetch_sub(1) - 1;
  static_assert(std::is_unsigned<decltype(count)>::value, "Must be unsigned");
  ut_ad(count != std::numeric_limits<decltype(count)>::max());
  return (count);
}
```

In debug builds a `debug_latch` rw-lock is S-acquired per fix to catch unbalanced fixes (`buf0buf.ic:771-784`, `805-814`).

Note that in the fast path the fix is taken **while holding only the page-hash S-lock**, and the hash lock is released immediately after (`buf0buf.cc:3733-3737`). The buffer fix, not the hash lock, is what keeps the block alive.

### 2.4 `io_fix` semantics and the latching-rules machinery

`io_fix` is `copyable_atomic_t<buf_io_fix>`, **private**, with an elaborate accessor family (`buf0buf.h:1387-1588`). Values: `BUF_IO_NONE`, `BUF_IO_READ`, `BUF_IO_WRITE`, `BUF_IO_PIN` (the last meaning "disallow relocation and flush_list removal", `buf0types.h:82-94`).

The design point that has no CUBRID equivalent: InnoDB formalises *which latch lets you read `io_fix` accurately* via a debug-only `Stateful_latching_rules` proof helper plus an `io_responsibility_t` that tracks which single thread currently owns the I/O:

```cpp
// storage/innobase/include/buf0buf.h:1422-1431 (abridged)
  /* Helper debug-only class used to track which thread is currently responsible
  for performing I/O operation on this page. There's at most one such thread and
  the responsibility might be passed from one to another during async I/O. This
  is used to prove correctness of io_fix state transitions and checking it
  without a latch in the io_completion threads. */
  class io_responsibility_t {
    std::thread::id responsible_thread{std::thread().get_id()};
```

Accessors are named for their guarantee: `get_io_fix()` asserts you hold the block mutex (`buf0buf.h:1539-1542`); `is_io_fix_write()`/`is_io_fix_read()` accept weaker latches per the rules (`1544-1556`); `was_io_fix_read()`, `was_io_fixed()`, `was_io_fix_none()` are explicitly *snapshot* reads whose names warn the caller (`1566-1588`).

### 2.5 LSN fields and dirtiness

```cpp
// storage/innobase/include/buf0buf.h:1350-1369
  lsn_t get_newest_lsn() const noexcept { return newest_modification; }
  lsn_t get_oldest_lsn() const noexcept { return oldest_modification; }
  bool is_dirty()       const noexcept { return get_oldest_lsn() > 0; }
  void set_newest_lsn(lsn_t lsn) noexcept { newest_modification = lsn; }
  void set_oldest_lsn(lsn_t lsn) noexcept;
  void set_clean()      noexcept { set_oldest_lsn(0); }
```

`oldest_modification` writes require **both** block mutex and `flush_list_mutex`; reads need either (`buf0buf.h:1641-1645`). `newest_modification` is "the flush LSN, LSN when this page was written to the redo log" (`buf0buf.h:1632-1633`).

### 2.6 Other notable `buf_page_t` fields

- `m_space` (`fil_space_t*`) + `m_version` — a **reference-counted tablespace handle with a truncation number**, enabling `is_stale()` / `was_stale()` (`buf0buf.h:1230-1274`, `1665-1676`). This drives a whole "free stale page" family (`buf_page_free_stale`, `buf0buf.cc:5401`, `5492`, `5542`) that has no PostgreSQL or CUBRID counterpart: on DROP/TRUNCATE, pages are discarded lazily on next touch rather than eagerly scanned out.
- `access_time` is a `std::chrono::steady_clock::time_point`, protected by block mutex (`buf0buf.h:1678-1680`). Semantics: **time of *first* access**, 0 if never accessed. This is what `old_blocks_time` compares against.
- `freed_page_clock` (`uint32_t`) — snapshot of the pool's eviction clock at last MRU insertion; readable with no latch for heuristics (`buf0buf.h:1668-1671`).
- `m_dblwr_id` (`uint16_t`) — which doublewrite batch segment is carrying this page (`buf0buf.h:1683-1685`).
- `old` (bool) — is this page in the old sublist (`buf0buf.h:1688-1689`).
- `flush_type` — which of the three flush kinds is in flight (`buf0buf.h:1593-1595`).

---

## 3. Page lookup and fix — `buf_page_get_gen` in 26.7

26.7 keeps the CRTP `Buf_fetch<T>` template with two concrete strategies. The dispatch is a single branch:

```cpp
// storage/innobase/buf/buf0buf.cc:4484-4509 (abridged)
  if (mode == Page_fetch::NORMAL && !fsp_is_system_temporary(page_id.space())) {
    Buf_fetch_normal fetch(page_id, page_size);
    ... return (fetch.single_page());
  } else {
    Buf_fetch_other fetch(page_id, page_size);
    ... return (fetch.single_page());
  }
```

`Page_fetch` has **8 modes** (`buf0buf.h:52-87`): `NORMAL`, `SCAN`, `IF_IN_POOL`, `PEEK_IF_IN_POOL`, `NO_LATCH`, `IF_IN_POOL_OR_WATCH`, `POSSIBLY_FREED`, `POSSIBLY_FREED_NO_READ_AHEAD`. `SCAN` is the interesting one — see §5.5.

### 3.1 Step-numbered walkthrough: `Buf_fetch_normal::get()` → `single_page()`

**Step 1 — count the get.** `Counter::inc(m_buf_pool->stat.m_n_page_gets, page_no)` — a 64-shard sharded counter, not an atomic (`buf0buf.cc:4298`, `buf0buf.h:2178-2183`).

**Step 2 — `lookup()` under the page-hash S-lock.**

```cpp
// storage/innobase/buf/buf0buf.cc:3822-3860 (abridged)
  m_hash_lock = buf_page_hash_lock_get(m_buf_pool, m_page_id);
  auto block = m_guess;
  rw_lock_s_lock(m_hash_lock, UT_LOCATION_HERE);
  /* If not own LRU_list_mutex, page_hash can be changed. */
  m_hash_lock = buf_page_hash_lock_s_confirm(m_hash_lock, m_buf_pool, m_page_id);
  if (block != nullptr) {   // caller-supplied guess
    if (!buf_is_block_in_instance(m_buf_pool, block) ||
        m_page_id != block->page.id ||
        buf_block_get_state(block) != BUF_BLOCK_FILE_PAGE) {
      block = m_guess = nullptr;   // stale guess
    }
  }
  if (block == nullptr) {
    block = reinterpret_cast<buf_block_t *>(buf_page_hash_get_low(m_buf_pool, m_page_id));
  }
```

The guess validation is stricter than 8.0's: it now checks `buf_is_block_in_instance()` first, because online resize can free the chunk the guess pointed into (comment at `buf0buf.cc:3834-3838`). A watch sentinel found here is treated as "not present" (`buf0buf.cc:3864-3868`).

**Step 3 — stale check, then fix, then drop the hash lock.**

```cpp
// storage/innobase/buf/buf0buf.cc:3718-3742 (verbatim, abridged)
    block = lookup();
    if (block != nullptr) {
      if (block->page.was_stale()) {
        if (!buf_page_free_stale(m_buf_pool, &block->page, m_hash_lock)) {
          std::this_thread::sleep_for(std::chrono::microseconds(100));
        }
        continue;   // hash lock released; retry lookup
      }
      buf_block_fix(block);
      /* Now safe to release page_hash S lock. */
      rw_lock_s_unlock(m_hash_lock);
      break;
    }
    /* Page not in buf_pool: needs to be read from file */
    read_page();
```

Note: **no block mutex is taken on the hit path.** The fix is an atomic increment under the hash S-lock only. `Buf_fetch_other` differs solely in adding the temp-tablespace handling (`temp_space_page_handler()` takes the block mutex, `buf0buf.cc:4194-4206`), the watch branch, and the "optimistic modes return DB_NOT_FOUND" branch (`buf0buf.cc:3784-3812`).

**Step 4 — optimistic-mode io_fix screen.** For `IF_IN_POOL`/`PEEK_IF_IN_POOL`, take block mutex, read `io_fix`, release; if `BUF_IO_READ`, unfix and return nullptr — do not wait (`buf0buf.cc:4306-4324`).

**Step 5 — `check_state()`.** Dispatch on state: `FILE_PAGE` → ok (plus a temp-space io-fix retry that unfixes, sleeps `WAIT_FOR_WRITE` and returns `DB_FAIL`); `ZIP_PAGE`/`ZIP_DIRTY` → `zip_page_handler()`; anything else → `ut_error` (`buf0buf.cc:4064-4110`).

**Step 6 — first-access stamp.** If `access_time == {}`, take block mutex and `buf_page_set_accessed()` (`buf0buf.cc:4384-4394`). This is a heuristic; the comment says ordering does not matter.

**Step 7 — conditional young-making.**

```cpp
// storage/innobase/buf/buf0buf.cc:4396-4400
  /* Don't move the page to the head of the LRU list so that the
  page can be discarded quickly if it is not accessed again. */
  if (m_mode != Page_fetch::PEEK_IF_IN_POOL && m_mode != Page_fetch::SCAN) {
    buf_page_make_young_if_needed(&block->page);
  }
```

**Step 8 — wait for a concurrent read to finish.** Crucially this is done *after* the buffer fix and *before* returning:

```cpp
// storage/innobase/buf/buf0buf.cc:3590-3605 (verbatim)
static void buf_wait_for_read(buf_block_t *block) {
  /* Note:
  This unlocked read of IO fix is safe as we have the block buf-fixed. The page
  can only transition away from the IO_READ state, and once this is done, it
  will not be IO_READ again as long as we have it buf-fixed.
  ... */
  while (block->page.was_io_fix_read()) {
    /* Page is X-latched on block->lock until the read is completed.
    Let's just wait for S-lock on block->lock, it will be granted as soon as the
    read completes. */
    rw_lock_s_lock(&block->lock, UT_LOCATION_HERE);
    rw_lock_s_unlock(&block->lock);
  }
}
```

**This is the answer to "how do concurrent requesters of the same page wait?"** They spin on acquire-and-immediately-release of the block's rw-lock in S mode. The reader that initiated the I/O holds X (pass-mode) on `block->lock`; the I/O completion thread releases it. No condition variable, no wait queue of the CUBRID kind.

**Step 9 — latch acquisition and mtr registration.**

```cpp
// storage/innobase/buf/buf0buf.cc:4149-4180 (abridged)
  switch (m_rw_latch) {
    case RW_NO_LATCH:  fix_type = MTR_MEMO_BUF_FIX; break;
    case RW_S_LATCH:   rw_lock_s_lock_gen(&block->lock, 0, loc);
                       fix_type = MTR_MEMO_PAGE_S_FIX;  break;
    case RW_SX_LATCH:  rw_lock_sx_lock_gen(&block->lock, 0, loc);
                       fix_type = MTR_MEMO_PAGE_SX_FIX; break;
    default:           ut_ad(m_rw_latch == RW_X_LATCH);
                       rw_lock_x_lock_gen(&block->lock, 0, loc);
                       fix_type = MTR_MEMO_PAGE_X_FIX;  break;
  }
  mtr_memo_push(m_mtr, block, fix_type);
```

Three real latch modes plus `RW_NO_LATCH`. **SX** is InnoDB's "shared-exclusive": compatible with S, exclusive against X and other SX; used for B-tree structural intent. CUBRID's `pgbuf_fix` latch modes are `PGBUF_LATCH_READ`/`WRITE`/`FLUSH`/`VICTIM` — a different taxonomy with no SX tier.

**Step 10 — linear read-ahead on first access.**

```cpp
// storage/innobase/buf/buf0buf.cc:4425-4431
  if (m_mode != Page_fetch::PEEK_IF_IN_POOL &&
      m_mode != Page_fetch::POSSIBLY_FREED_NO_READ_AHEAD &&
      access_time == std::chrono::steady_clock::time_point{}) {
    /* In the case of a first access, try to apply linear read-ahead */
    buf_read_ahead_linear(m_page_id, m_page_size, ibuf_inside(m_mtr));
  }
```

### 3.2 The watch mechanism (purge)

`IF_IN_POOL_OR_WATCH` is used by purge to detect whether a page it wants to skip gets read in later. `buf_pool->watch` is an array of `BUF_POOL_WATCH_SIZE = srv_n_purge_threads + 1` sentinel `buf_page_t`s (`buf0buf.h:111`, allocated `buf0buf.cc:1385-1389`).

Setting a watch is deliberately heavyweight and documented as purge-only:

```cpp
// storage/innobase/buf/buf0buf.cc:3026-3036 (verbatim)
  /* From this point this function becomes fairly heavy in terms
  of latching. We acquire all the hash_locks. They are needed
  because we don't want to read any stale information in
  buf_pool->watch[]. However, it is not in the critical code path
  as this function will be called only by the purge thread. */

  /* To obey latching order first release the hash_lock. */
  rw_lock_x_unlock(*hash_lock);
  mutex_enter(&buf_pool->LRU_list_mutex);
  hash_lock_x_all(buf_pool->page_hash);
```

A free sentinel is flipped `BUF_BLOCK_POOL_WATCH → BUF_BLOCK_ZIP_PAGE`, given the page id, `buf_fix_count = 1`, and inserted into `page_hash` (`buf0buf.cc:3066-3087`). It is distinguishable purely by pointer range:

```cpp
// storage/innobase/buf/buf0buf.cc:2980-2992 (abridged)
  if (bpage < &buf_pool->watch[0] ||
      bpage >= &buf_pool->watch[BUF_POOL_WATCH_SIZE]) { ... return false; }
  ut_ad(buf_page_get_state(bpage) == BUF_BLOCK_ZIP_PAGE);
  ut_ad(bpage->zip.data == nullptr);
  return true;
```

When the real page is later read in, `buf_page_init()` (`buf0buf.cc:4838-4848`) or `buf_page_init_for_read()` (`buf0buf.cc:5038-5050`) **transfers the sentinel's fix count** onto the real block and removes the sentinel. That is how `buf_pool_watch_occurred()` reports "the page came in while you were away."

---

## 4. Miss path, reads, and read-ahead

### 4.1 Miss path

`Buf_fetch<T>::read_page()`:

```cpp
// storage/innobase/buf/buf0buf.cc:4112-4140 (abridged)
  if (buf_read_page(m_page_id, m_page_size)) {
    /* Avoid doing read-ahead for parallel scans ... */
    if (m_mode != Page_fetch::SCAN) {
      buf_read_ahead_random(m_page_id, m_page_size, ibuf_inside(m_mtr));
    }
    m_retries = 0;
  } else if (m_retries < BUF_PAGE_READ_MAX_RETRIES) {   // 100
    ++m_retries;
  } else {
    ib::fatal(...) << "Unable to read page " << m_page_id << " ... after "
                   << BUF_PAGE_READ_MAX_RETRIES << " attempts. ...";
  }
```

`BUF_PAGE_READ_MAX_RETRIES = 100` (`buf0buf.cc:299`). After 100 failures InnoDB **aborts the server** — no soft failure path.

### 4.2 `buf_read_page` → `buf_read_page_low` → `fil_io`

```cpp
// storage/innobase/buf/buf0rea.cc:275-293 (abridged)
bool buf_read_page(const page_id_t &page_id, const page_size_t &page_size) {
  count = buf_read_page_low(&err, /*sync=*/true, IORequest::Type::UNSET,
                            BUF_READ_ANY_PAGE, page_id, page_size, false);
  srv_stats.buf_pool_reads.add(count);
  ...
  buf_LRU_stat_inc_io();
  return (count > 0);
}
```

Demand reads are **synchronous** (`sync = true`). Read-ahead reads are asynchronous with `IORequest::Type::DO_NOT_WAKE` (`buf0rea.cc:241-242`, `544-545`), batched, then the simulated-AIO handlers are woken once at the end (`buf0rea.cc:258`, `560`).

Inside `buf_read_page_low`:

1. Reject legacy dblwr pages in the system tablespace (`buf0rea.cc:73-79`).
2. **Force sync** for ibuf bitmap pages and the trx-sys header, with a latching-order rationale (`buf0rea.cc:81-89`).
3. `buf_page_init_for_read()` allocates a block and registers the read (see next).
4. `fil_io(type | READ, sync, page_id, page_size, page_size.physical(), dst, bpage, false)` (`buf0rea.cc:121-122`).
5. Errors: on `IGNORE_MISSING` or `DB_TABLESPACE_DELETED`, call `buf_read_page_handle_error(bpage)` and return 0; otherwise `ut_error` (`buf0rea.cc:126-137`).

### 4.3 `buf_page_init_for_read` — where BUF_IO_READ is set

Ordered walkthrough (`buf0buf.cc:4876-5080`):

1. If mode is `BUF_READ_IBUF_PAGES_ONLY`, start an ibuf mtr and bail unless this really is an ibuf page (`4886-4898`).
2. Get a block: `buf_LRU_get_free_block(buf_pool)` — unless this is a compressed page being read *without* unzip, in which case only a descriptor + buddy-allocated frame is taken (`4903-4919`).
3. Take `LRU_list_mutex`, then X the page-hash shard (`4921-4925`).
4. Re-check the hash. If a real (non-sentinel) page appeared, release everything, free the block/descriptor/buddy frame, return nullptr (`4929-4955`). **This is the "someone else won the race to read" path.**
5. `buf_page_init()` inserts into `page_hash` under the X hash lock (`4965`).
6. `block->mark_for_read_io(); buf_page_set_io_fix(bpage, BUF_IO_READ);` — with an explicit note that the *hash lock* is what makes this safe, since nobody can find the block yet (`4967-4972`).
7. **`buf_LRU_add_block(bpage, true /* to old blocks */)`** — midpoint insertion (`4975`).
8. Acquire a **pass-mode X latch** on `block->lock` with pass value `BUF_IO_READ`:

```cpp
// storage/innobase/buf/buf0buf.cc:4991-5000 (verbatim comment)
    /* We set a pass-type x-lock on the frame because then
    the same thread which called for the read operation
    (and is running now at this point of code) can wait
    for the read to complete by waiting for the x-lock on
    the frame; if the x-lock were recursive, the same
    thread would illegally get the x-lock before the page
    read is completed.  The x-lock is cleared by the
    io-handler thread. */
    rw_lock_x_lock_gen(&block->lock, BUF_IO_READ, UT_LOCATION_HERE);
```

9. `buf_pool->n_pend_reads.fetch_add(1)` (`5068`).

### 4.4 Who completes the I/O — `buf_page_io_complete`

`buf_page_io_complete(bpage, evict)` (`buf0buf.cc:5731-5998`) runs on the I/O-completion thread (or inline for sync I/O). The function opens with an explicit statement of why it needs no latch to read `io_fix`:

```cpp
// storage/innobase/buf/buf0buf.cc:5739-5748 (verbatim, abridged)
  /* We do not need protect io_fix here by mutex to read it because this is the
  only function where we can change the value from BUF_IO_READ or BUF_IO_WRITE
  to some other value, and our code ensures that this is the only thread that
  handles the i/o for this block. ... */
  ut_ad(bpage->current_thread_has_io_responsibility());
  const auto io_type =
      bpage->is_io_fix_read_as_opposed_to_write() ? BUF_IO_READ : BUF_IO_WRITE;
```

**Read completion sequence:**

1. Decompress if needed, bumping `n_pend_unzip` (`5757-5766`).
2. Verify `(space_id, page_no)` stamped in the frame matches; mismatch is `ib::fatal` (`5775-5793`).
3. Detect transparently-compressed pages this build cannot handle (`5795-5809`).
4. **Checksum validation** via `BlockReporter::is_corrupted()` (`5813-5818`).
5. Linux-only: during recovery, a corrupt-looking *brand-new* page is zero-filled rather than failed (`5820-5830`) — mitigating torn file-extension.
6. On corruption with `srv_force_recovery < SRV_FORCE_IGNORE_CORRUPT`: `buf_read_page_handle_error(bpage)` and return `DB_INDEX_CORRUPT` (`5861-5870`).
7. `recv_recover_page()` if in recovery, else merge change-buffer entries for leaf index pages (`5876-5886`).
8. Under block mutex: `buf_page_set_io_fix(bpage, BUF_IO_NONE)`, then `rw_lock_x_unlock_gen(&block->lock, BUF_IO_READ)` — **releasing the pass-mode X latch, which is what unblocks all the waiters spinning in `buf_wait_for_read`** (`5943-5957`).
9. `n_pend_reads--`, `stat.n_pages_read++` (`5959-5961`).

**Write completion sequence** (`5893-5987`):

1. Decide eviction: `BUF_FLUSH_LIST` → never evict; `BUF_FLUSH_LRU` → **always** evict; `BUF_FLUSH_SINGLE_PAGE` → caller decides (`5894-5903`).
2. If evicting, take `LRU_list_mutex` before the block mutex (`5904-5920`).
3. `buf_flush_write_complete(bpage)` — removes from flush_list, clears io_fix, decrements `n_flush[type]`, and notifies dblwr (`buf0flu.cc:687-707`).
4. `rw_lock_sx_unlock_gen(&block->lock, BUF_IO_WRITE)` (`5971-5973`).
5. If evicting, `buf_LRU_free_page(bpage, true)` (`5978`).

### 4.5 Read-ahead area

```cpp
// storage/innobase/buf/buf0buf.cc:298-304
static const ulint BUF_PAGE_READ_MAX_RETRIES = 100;
/** Number of pages to read ahead */
static const ulint BUF_READ_AHEAD_PAGES = 64;
/** The maximum portion of the buffer pool that can be used for the
read-ahead buffer.  (Divide buf_pool size by this amount) */
static const ulint BUF_READ_AHEAD_PORTION = 32;
```

```cpp
// storage/innobase/buf/buf0buf.cc:1351-1353
    buf_pool->read_ahead_area = static_cast<page_no_t>(
        std::min(BUF_READ_AHEAD_PAGES,
                 ut_2_power_up(buf_pool->curr_size / BUF_READ_AHEAD_PORTION)));
```

So the "extent" for read-ahead purposes is `min(64, 2^ceil(log2(instance_pages/32)))`. For any instance ≥ 2048 pages (32 MiB at 16 K), it is exactly **64 pages** — matching the 6-bit shift in `buf_pool_get()`. Recomputed after resize at `buf0buf.cc:2583-2585`.

Both read-ahead flavours share a throttle: skip if pending reads exceed half the instance size —

```cpp
// storage/innobase/buf/buf0rea.cc:61-64
/** If there are buf_pool->curr_size per the number below pending reads, then
read-ahead is not done: this is to prevent flooding the buffer pool with
i/o-fixed buffer blocks */
static constexpr uint32_t BUF_READ_AHEAD_PEND_LIMIT = 2;
```

applied at `buf0rea.cc:188-191` (random) and `386-389` (linear).

### 4.6 Random read-ahead

Trigger: called from `Buf_fetch::read_page()` after a successful demand read, only when `m_mode != SCAN` (`buf0buf.cc:4119-4121`).

Mechanics (`buf0rea.cc:142-273`):

1. **Off by default**: `if (!srv_random_read_ahead) return 0;` (`153-156`). `innodb_random_read_ahead` default `false` (`ha_innodb.cc:23329-23331`).
2. Compute the aligned extent `[low, high)` of `read_ahead_area` pages around the target (`171-175`), clipped to `space->m_size_in_pages` (`180-185`).
3. Count pages in that extent that are **both accessed and young**:

```cpp
// storage/innobase/buf/buf0rea.cc:196-213 (abridged)
  for (i = low; i < high; i++) {
    bpage = buf_page_hash_get_s_locked(buf_pool, page_id_t(page_id.space(), i), &hash_lock);
    if (bpage != nullptr &&
        buf_page_is_accessed(bpage) != std::chrono::steady_clock::time_point{} &&
        buf_page_peek_if_young(bpage)) {
      recent_blocks++;
      if (recent_blocks >= BUF_READ_AHEAD_RANDOM_THRESHOLD(buf_pool)) {
        rw_lock_s_unlock(hash_lock);
        goto read_ahead;
      }
    }
```

4. Threshold: `5 + read_ahead_area / 8` = **13** for a 64-page area (`buf0rea.cc:57-59`).
5. If tripped, async-read every non-ibuf-bitmap page in the extent (`234-253`), wake AIO handlers, `stat.n_ra_pages_read_rnd += count` (`258-270`).

### 4.7 Linear read-ahead

Trigger: `single_page()` step 10, on **first access only** (`buf0buf.cc:4425-4431`).

Mechanics (`buf0rea.cc:317-574`):

1. Disabled if `srv_read_ahead_threshold == 0` (`336-338`). Default is **56**, range 0–64 (`ha_innodb.cc:23333-23337`).
2. **Only fires on a border page of the extent**: `if ((page_no != low) && (page_no != high - 1)) return 0;` (`350-354`). Direction is inferred from which border: `asc_or_desc = (page_no == low) ? -1 : 1` (`395-399`).
3. Require the whole extent to be inside the file (`374-377`).
4. Tolerance for out-of-order first-access times:

```cpp
// storage/innobase/buf/buf0rea.cc:401-404
  /* How many out of order accessed pages can we ignore
  when working out the access pattern for linear readahead */
  threshold = std::min(static_cast<page_no_t>(64 - srv_read_ahead_threshold),
                       buf_pool->read_ahead_area);
```

With the default 56 this is a tolerance of **8** failures out of 64. Failures counted are (a) page absent, (b) page never accessed, (c) first-access time ordering contradicts `asc_or_desc` (`410-459`). Bail as soon as `fail_count > threshold`.

The comment is candid about the weakness of using *first*-access time here (`buf0rea.cc:420-427`): a genuinely linear scan over pages already resident can look non-monotonic; the threshold is the only defence.

5. Read `FIL_PAGE_PREV`/`FIL_PAGE_NEXT` from the frame **without an S-latch** to avoid deadlock, accepting garbage (`buf0rea.cc:482-489`): "Even if we read values which are nonsense, the algorithm will work."
6. Require the sibling pointer to be the physically adjacent page, then jump to the *next* extent (`493-521`).
7. Async-read the whole next extent, `stat.n_ra_pages_read += count` (`537-572`).

**Summary of the difference between the two:** random read-ahead looks at *how many* pages of the current extent are hot; linear read-ahead looks at *whether the access pattern within the current extent is monotonic* and then prefetches the *next* extent. Only linear is on by default.

---

## 5. LRU with midpoint insertion — the scan-resistance story, precisely

### 5.1 Constants (verified)

```cpp
// storage/innobase/include/buf0lru.h:59
constexpr uint32_t BUF_LRU_OLD_MIN_LEN = 8 * 1024 / 16;   // 512 pages
// storage/innobase/include/buf0lru.h:206-216
constexpr uint32_t BUF_LRU_OLD_RATIO_DIV = 1024;
constexpr uint32_t BUF_LRU_OLD_RATIO_MAX = BUF_LRU_OLD_RATIO_DIV;   // 1024
constexpr uint32_t BUF_LRU_OLD_RATIO_MIN = 51;
// storage/innobase/buf/buf0lru.cc:68-79
constexpr uint32_t BUF_LRU_OLD_TOLERANCE = 20;
constexpr uint32_t BUF_LRU_NON_OLD_MIN_LEN = 5;
static const ulint BUF_LRU_SEARCH_SCAN_THRESHOLD = 100;
```

**The "3/8" in the lore is a *default sysvar value*, not a constant.** The real denominator is 1024:

```cpp
// storage/innobase/handler/ha_innodb.cc:23091-23093
    old_blocks_pct, innobase_old_blocks_pct, PLUGIN_VAR_RQCMDARG,
    "Percentage of the buffer pool to reserve for 'old' blocks.", nullptr,
    innodb_old_blocks_pct_update, 100 * 3 / 8, 5, 95, 0);
```

`100 * 3 / 8 = 37`, range 5–95. Conversion (`buf0lru.cc:1562-1590`):

```cpp
  ratio = old_pct * BUF_LRU_OLD_RATIO_DIV / 100;         // 37 → 378
  if (ratio < BUF_LRU_OLD_RATIO_MIN) ratio = BUF_LRU_OLD_RATIO_MIN;
  else if (ratio > BUF_LRU_OLD_RATIO_MAX) ratio = BUF_LRU_OLD_RATIO_MAX;
```

So the default `LRU_old_ratio` is **378/1024 ≈ 36.9 %**, not exactly 3/8 (= 384/1024). The reverse conversion for reporting rounds: `ratio * 100 / 1024 + 0.5` (`buf0lru.cc:1588-1590`).

The `BUF_LRU_OLD_RATIO_MIN = 51` floor exists so the `LRU_old` pointer can never land on either end of even a minimum-length list — enforced by a `static_assert` (`buf0lru.cc:663-666`).

### 5.2 `LRU_old` pointer maintenance

Target old-sublist length:

```cpp
// storage/innobase/buf/buf0lru.cc:644-650 (verbatim)
static size_t calculate_desired_LRU_old_size(const buf_pool_t *buf_pool) {
  return std::min(UT_LIST_GET_LEN(buf_pool->LRU) *
                      static_cast<size_t>(buf_pool->LRU_old_ratio) /
                      BUF_LRU_OLD_RATIO_DIV,
                  UT_LIST_GET_LEN(buf_pool->LRU) -
                      (BUF_LRU_OLD_TOLERANCE + BUF_LRU_NON_OLD_MIN_LEN));
}
```

The second term guarantees at least `20 + 5 = 25` non-old pages exist.

`buf_LRU_old_adjust_len()` walks the pointer one step at a time until inside the ±20 tolerance band, flipping the `old` flag of the block it steps over:

```cpp
// storage/innobase/buf/buf0lru.cc:680-706 (abridged)
  for (;;) {
    buf_page_t *LRU_old = buf_pool->LRU_old;
    if (old_len + BUF_LRU_OLD_TOLERANCE < new_len) {
      buf_pool->LRU_old = LRU_old = UT_LIST_GET_PREV(LRU, LRU_old);
      old_len = ++buf_pool->LRU_old_len;
      buf_page_set_old(LRU_old, true);
    } else if (old_len > new_len + BUF_LRU_OLD_TOLERANCE) {
      buf_pool->LRU_old = UT_LIST_GET_NEXT(LRU, LRU_old);
      old_len = --buf_pool->LRU_old_len;
      buf_page_set_old(LRU_old, false);
    } else { return; }
  }
```

The pointer is *created* only when the LRU list first reaches exactly `BUF_LRU_OLD_MIN_LEN` (512): all pages are marked old, `LRU_old` set to the list head, then adjusted (`buf0lru.cc:712-734`). It is *destroyed* (set nullptr, all `old` flags cleared) if the list drops below 512 (`buf0lru.cc:807-820`). **Below 512 pages there is no midpoint insertion at all** — see the `!old ||` clause below.

### 5.3 Where a newly read page goes

`buf_page_init_for_read()` calls `buf_LRU_add_block(bpage, true /* to old blocks */)` (`buf0buf.cc:4975`, and `5058` for the zip-only path). Then:

```cpp
// storage/innobase/buf/buf0lru.cc:862-908 (abridged)
static inline void buf_LRU_add_block_low(buf_page_t *bpage, bool old) {
  ...
  if (!old || (UT_LIST_GET_LEN(buf_pool->LRU) < BUF_LRU_OLD_MIN_LEN)) {
    UT_LIST_ADD_FIRST(buf_pool->LRU, bpage);
    bpage->freed_page_clock = buf_pool->freed_page_clock;
  } else {
    UT_LIST_INSERT_AFTER(buf_pool->LRU, buf_pool->LRU_old, bpage);
    buf_pool->LRU_old_len++;
  }
  ut_d(bpage->in_LRU_list = true);
  incr_LRU_size_in_bytes(bpage, buf_pool);
  if (UT_LIST_GET_LEN(buf_pool->LRU) > BUF_LRU_OLD_MIN_LEN) {
    buf_page_set_old(bpage, old);
    buf_LRU_old_adjust_len(buf_pool);
  } else if (UT_LIST_GET_LEN(buf_pool->LRU) == BUF_LRU_OLD_MIN_LEN) {
    buf_LRU_old_init(buf_pool);
  } else {
    buf_page_set_old(bpage, buf_pool->LRU_old != nullptr);
  }
```

Note the insertion point is **immediately after `LRU_old`**, i.e. at the *head of the old sublist*, not the tail of the whole list. A scan-in page therefore has the whole old sublist (~37 % of the pool) to traverse before eviction, and it only crosses into the young sublist if it is touched again under the rules below. Also note `freed_page_clock` is **only stamped on MRU insertion**, not on midpoint insertion — so a page inserted as old carries whatever it had (0 after `buf_page_init_low`, `buf0buf.cc:4789`).

### 5.4 Promotion to young — two independent gates

`buf_page_make_young_if_needed()` (`buf0buf.cc:3208-3216`) → `buf_page_peek_if_too_old()` → maybe `buf_page_make_young()` (takes `LRU_list_mutex`, calls `buf_LRU_make_block_young`, `buf0buf.cc:3180-3190`).

```cpp
// storage/innobase/include/buf0buf.ic:180-203 (verbatim)
static inline bool buf_page_peek_if_too_old(const buf_page_t *bpage) {
  buf_pool_t *buf_pool = buf_pool_from_bpage(bpage);

  if (buf_pool->freed_page_clock == 0) {
    /* If eviction has not started yet, do not update the
    statistics or move blocks in the LRU list.  This is
    either the warm-up phase or an in-memory workload. */
    return false;
  } else if (get_buf_LRU_old_threshold() != std::chrono::seconds::zero() &&
             bpage->old) {
    const auto access_time = buf_page_is_accessed(bpage);

    if (access_time != std::chrono::steady_clock::time_point{} &&
        (std::chrono::steady_clock::now() - access_time) >=
            get_buf_LRU_old_threshold()) {
      return true;
    }

    buf_pool->stat.n_pages_not_made_young++;
    return false;
  } else {
    return (!buf_page_peek_if_young(bpage));
  }
}
```

Three distinct behaviours, in order:

- **Gate 0 — warm-up bypass.** If nothing has ever been evicted (`freed_page_clock == 0`), *never* make young. This is why a fresh server shows zero young/non-young activity: the whole pool is effectively MRU-ordered by arrival and the promotion machinery is dormant.
- **Gate 1 — `innodb_old_blocks_time` (the scan filter).** If the timer is enabled and the page is `old`, promote **only if the page's first access was ≥ that many milliseconds ago**. Otherwise count a `n_pages_not_made_young` and refuse. Because `access_time` is *first*-access time, a table scan that touches every page of an extent within a few milliseconds promotes **none** of them — that is the entire point. Default `innodb_old_blocks_time = 1000` ms (`ha_innodb.cc:23095-23100`; storage `uint buf_LRU_old_threshold`, `buf0lru.cc:125-128`, accessor returns `std::chrono::milliseconds`).
- **Gate 2 — `freed_page_clock` distance throttle.** For young pages (or when the timer is disabled), promote only if the page is *not* already "young enough":

```cpp
// storage/innobase/include/buf0buf.ic:161-173 (verbatim)
static inline bool buf_page_peek_if_young(const buf_page_t *bpage) {
  buf_pool_t *buf_pool = buf_pool_from_bpage(bpage);
  ut_ad(bpage->buf_fix_count > 0 ||
        buf_page_hash_lock_held_s_or_x(buf_pool, bpage));

  /* FIXME: bpage->freed_page_clock is 31 bits */
  return ((buf_pool->freed_page_clock & ((1UL << 31) - 1)) <
          ((ulint)bpage->freed_page_clock +
           (buf_pool->curr_size *
            (BUF_LRU_OLD_RATIO_DIV - buf_pool->LRU_old_ratio) /
            (BUF_LRU_OLD_RATIO_DIV * 4))));
}
```

Read this as: the page counts as young if fewer than `curr_size × (1 − old_ratio) / 4` evictions have occurred since it was last put at the MRU end. With the default ratio, that is `curr_size × (1024−378)/4096 ≈ 0.158 × curr_size` evictions. **This is the "young-making throttle": a hot page is re-promoted at most once per ~16 % of a pool-turnover of evictions**, which keeps `LRU_list_mutex` acquisitions off the hot read path. Note it deliberately reads `freed_page_clock` with no latch and acknowledges wraparound at 2³¹ in a `FIXME`.

`freed_page_clock` is incremented in exactly one place — when a block is unhashed on the way out:

```cpp
// storage/innobase/buf/buf0lru.cc:1313-1315  (in buf_LRU_block_remove_hashed)
  buf_LRU_remove_block(bpage);
  buf_pool->freed_page_clock += 1;
```

and reset to 0 by `buf_pool_invalidate_instance` (`buf0buf.cc:6056`). `n_pages_made_young` is bumped inside `buf_LRU_make_block_young` **only if the page was old** (`buf0lru.cc:937-939`).

### 5.5 `Page_fetch::SCAN` — an explicit scan-resistance escape hatch

```cpp
// storage/innobase/include/buf0buf.h:61-64 (verbatim)
  /** Same as NORMAL, but hint that the fetch is part of a large scan.
  Try not to flood the buffer pool with pages that may not be accessed again
  any time soon. */
  SCAN,
```

`SCAN` suppresses (a) young-making in `single_page()` (`buf0buf.cc:4398`), (b) young-making in `buf_page_optimistic_get()` (`buf0buf.cc:4535-4537`), and (c) random read-ahead (`buf0buf.cc:4119-4121`). It is used by parallel read (`row0pread.cc:348`, `496`, `502`, `756`) and settable on a persistent cursor (`btr0pcur.h:420-423`). This is a *caller-declared* hint, complementary to the time-based filter — CUBRID has no equivalent API-level flag.

### 5.6 Making a page old on purpose

`buf_page_make_old()` → `buf_LRU_make_block_old()` = remove + `add_block_low(bpage, true)` (`buf0buf.cc:3192-3202`, `buf0lru.cc:947-954`). Note this inserts at the *head of the old sublist*, not the LRU tail — so "make old" is not "evict next."

---

## 6. Getting a free block — `buf_LRU_get_free_block`

The algorithm is documented in the header comment, which is the clearest statement of it:

```cpp
// storage/innobase/buf/buf0lru.cc:493-516 (verbatim)
/** Returns a free block from the buf_pool. The block is taken off the
free list. If free list is empty, blocks are moved from the end of the
LRU list to the free list.
This function is called from a user thread when it needs a clean
block to read in a page. Note that we only ever get a block from
the free list. Even when we flush a page or find a page in LRU scan
we put it to free list to be used.
* iteration 0:
  * get a block from free list, success:done
  * if buf_pool->try_LRU_scan is set
    * scan LRU up to srv_LRU_scan_depth to find a clean block
    * the above will put the block on free list
    * success:retry the free list
  * flush one dirty page from tail of LRU to disk
    * the above will put the block on free list
    * success: retry the free list
* iteration 1:
  * same as iteration 0 except:
    * scan whole LRU list
    * scan LRU list even if buf_pool->try_LRU_scan is not set
* iteration > 1:
  * same as iteration 1 but sleep 10ms
```

### 6.1 Step-numbered walkthrough (`buf0lru.cc:517-640`)

1. `buf_LRU_check_size_of_non_data_objects()` — a guard against non-page allocations eating the pool. If free+LRU < `curr_size/20`, **assert-crash** with `ER_IB_BUFFER_POOL_FULL`; if < `curr_size/3`, warn once and turn on the InnoDB monitor (`buf0lru.cc:460-491`).
2. `buf_LRU_get_free_only()` — pop the free list head under `free_list_mutex`, diverting withdraw-target blocks (§1.2). On success: zero `page.zip`, reset the flush observer, return in state `BUF_BLOCK_READY_FOR_USE` (`buf0lru.cc:531-544`).
3. **Wake simulated-AIO handlers** before scanning, with an explicit deadlock rationale:

```cpp
// storage/innobase/buf/buf0lru.cc:546-553 (verbatim)
  /* No free blocks found on the free list, we need to run a LRU scan to find a
  block. In meantime, we wake up simulated AIO threads that may have requests
  queued with IOREquest::DO_NOT_WAKE waiting for them to wake up. If one of
  threads that are requesting the new IOs waits for a new block to place the
  read IO for that block, this would deadlock. ... */
  os_aio_simulated_wake_handler_threads();
```

4. LRU scan, gated by the `try_LRU_scan` flag:

```cpp
// storage/innobase/buf/buf0lru.cc:557-579 (abridged)
  os_rmb;
  if (buf_pool->try_LRU_scan || n_iterations > 0) {
    freed = buf_LRU_scan_and_free_block(buf_pool, n_iterations > 0);
    if (!freed && n_iterations == 0) {
      /* Tell other threads that there is no point
      in scanning the LRU list. ... */
      buf_pool->try_LRU_scan = false;
      os_wmb;
    }
  }
  if (freed) goto loop;
```

`try_LRU_scan` is a **memory-barrier-protected bool, not an atomic** (`buf0buf.h:2419-2423`) — a deliberate "sloppy but cheap" flag. It is set back to true by `buf_flush_end()` on every batch (`buf0flu.cc:1783-1786`).

5. After 20 iterations (and only if not resizing), emit `ER_IB_MSG_134` "Difficult to find free blocks in the buffer pool" with fsync counters and start the monitor (`buf0lru.cc:581-604`).
6. Kick the page cleaner: `os_event_set(buf_flush_event)` (`610-612`).
7. From iteration 2 onward, **sleep 10 ms** and count `MONITOR_LRU_GET_FREE_WAITS` (`614-617`).
8. **Single-page LRU flush — still present in 26.7:**

```cpp
// storage/innobase/buf/buf0lru.cc:619-639 (abridged)
  /* No free block was found: try to flush the LRU list.
  This call will flush one page from the LRU and put it on the
  free list. ...
  TODO: A more elegant way would have been to return the freed
  up block to the caller here but the code that deals with
  removing the block from page_hash and LRU_list is fairly
  involved ... */
  if (!buf_flush_single_page_from_LRU(buf_pool)) {
    MONITOR_INC(MONITOR_LRU_SINGLE_FLUSH_FAILURE_COUNT);
    ++flush_failures;
  }
  srv_stats.buf_pool_wait_free.add(n_iterations, 1);
  n_iterations++;
  goto loop;
```

**Confirmed: `buf_flush_single_page_from_LRU` exists and is on the user-thread starvation path** (`buf0flu.cc:1896-1971`). It walks `single_scan_itr` from the LRU tail, and for each page either evicts it (if `ready_for_replace`) or flushes it synchronously with `BUF_FLUSH_SINGLE_PAGE` (`buf0flu.cc:1921-1950`). `buf_flush_page()` for this type is the **only** case that requires `LRU_list_mutex` held on entry (`buf0flu.cc:1056-1064`) — the comment says holding it is acceptable because single-page flush is "already non-performant."

**There is no bound on the retry loop.** A user thread will loop, sleep, and flush single pages indefinitely.

### 6.2 The LRU scan itself

`buf_LRU_scan_and_free_block(buf_pool, scan_all)` (`buf0lru.cc:362-383`): try `unzip_LRU` first if non-empty, then the common LRU. Returns having *released* `LRU_list_mutex` iff it freed something.

`buf_LRU_free_from_common_LRU_list()` (`buf0lru.cc:300-360`):

- Iterates from `lru_scan_itr.start()` (a hazard-pointer-protected cursor that survives concurrent removals, `buf0buf.h:2455-2457`).
- Scan bound: `scan_all || scanned < BUF_LRU_SEARCH_SCAN_THRESHOLD` = **100** — note this is *not* `innodb_lru_scan_depth`. `srv_LRU_scan_depth` bounds the *page-cleaner* batches (`buf0flu.cc:1543`, `1995`) and the unzip_LRU search (`buf0lru.cc:264`), but a user thread's first-pass LRU search is capped at 100 blocks.
- Per page: stale → `buf_page_free_stale`; else block mutex + `buf_flush_ready_for_replace()` + `buf_LRU_free_page(bpage, true)`.
- Tracks read-ahead effectiveness: a freed page that was never accessed bumps `stat.n_ra_pages_evicted` (`336-341`).

Replaceability:

```cpp
// storage/innobase/buf/buf0flu.cc:476-497 (abridged)
bool buf_flush_ready_for_replace(const buf_page_t *bpage) {
  ut_ad(mutex_own(&buf_pool->LRU_list_mutex));
  ut_ad(mutex_own(buf_page_get_mutex(bpage)));
  ut_ad(bpage->in_LRU_list);
  ...
  if (!buf_page_can_relocate(bpage)) return false;
  if (bpage->was_stale()) return true;
  return !bpage->is_dirty();
}
```

```cpp
// storage/innobase/include/buf0buf.ic:503-512 (abridged)
static inline bool buf_page_can_relocate(const buf_page_t *bpage) {
  return (buf_page_get_io_fix(bpage) == BUF_IO_NONE &&
          bpage->buf_fix_count == 0);
}
```

So a victim must be unfixed, not under I/O, and either clean or stale.

### 6.3 The "running out" heuristic

```cpp
// storage/innobase/buf/buf0lru.cc:389-405 (abridged)
bool buf_LRU_buf_pool_running_out(void) {
  for (ulint i = 0; i < srv_buf_pool_instances && !ret; i++) {
    ...
    if (!recv_recovery_is_on() &&
        UT_LIST_GET_LEN(buf_pool->free) + UT_LIST_GET_LEN(buf_pool->LRU) <
            std::min(buf_pool->curr_size, buf_pool->old_size) / 4) {
      ret = true;
```

Used to stop huge transactions from eating the pool with lock heaps.

---

## 7. Flush list and dirty tracking

### 7.1 Making a page dirty

At mtr commit, the dirtying flow in 26.7 goes through the `Pages_persistence` layer, not directly into `buf0flu`:

```cpp
// storage/innobase/fil/fil0innodb_pages_persistence.cc:91-116 (verbatim, abridged)
void Pages_persistence::mtr_has_dirtied_pages(
    Lsn start_lsn, Lsn end_lsn, ::Flush_observer *observer,
    ut::Function_reference<void(ut::Function_reference<void(buf_block_t *)>)>
        iterate_over_dirty_pages) {
  const auto note_modification = [=](buf_block_t *block) {
    if (buf_page_get_state(&block->page) != BUF_BLOCK_MEMORY) {
      buf_flush_note_modification(block, start_lsn, end_lsn, observer);
    }
  };
  if (start_lsn != 0) {
    ut_a(observer == nullptr);
    ut_a(start_lsn < end_lsn);
    buf_flush_list_added->wait_to_add(start_lsn);
    DEBUG_SYNC_C("mtr_redo_before_add_dirty_blocks");
    iterate_over_dirty_pages(&note_modification);
    buf_flush_list_added->report_added(start_lsn, end_lsn);
  } else { ... }
}
```

**[Δ vs 8.0 lore]** The `wait_to_add(start_lsn)` / `report_added(start_lsn, end_lsn)` bracket is the disorder-bounding mechanism. `Pages_persistence::page_became_dirty()` is what actually links the block:

```cpp
// storage/innobase/fil/fil0innodb_pages_persistence.cc:47-49 (verbatim)
void Pages_persistence::page_became_dirty(struct buf_block_t *buf_block) {
  buf_flush_insert_into_flush_list(buf_pool_from_block(buf_block), buf_block);
}
```

`buf_flush_note_modification()` (`buf0flu.ic:57-103`) under the **block mutex**: set `newest_modification = end_lsn`, set/reset the flush observer, and if the page was clean call `buf_flush_note_oldest_modification()`.

```cpp
// storage/innobase/buf/buf0flu.cc:410-473 (abridged)
void buf_flush_note_oldest_modification(buf_pool_t *buf_pool,
                                        buf_block_t *block, lsn_t start_lsn) {
  ut_ad(mutex_own(buf_page_get_mutex(&block->page)));
  ut_ad(ib::redo::handler != nullptr);
  buf_flush_list_mutex_enter(buf_pool);
  ut_ad(buf_block_get_state(block) == BUF_BLOCK_FILE_PAGE);
  ut_ad(!block->page.in_flush_list);
  if (start_lsn == 0) {
    /* This is no-redo dirtied page. Borrow the lsn. */
    start_lsn = buf_flush_borrow_lsn(buf_pool);
    ...
    block->page.set_newest_lsn(
        srv_force_recovery < SRV_FORCE_NO_LOG_REDO
            ? std::max(start_lsn, ib::redo::handler->peek_first_nonpersisted_lsn())
            : start_lsn);
  }
  ...
  block->page.set_oldest_lsn(start_lsn);
  pages_persistence->page_became_dirty(block);
  buf_flush_list_mutex_exit(buf_pool);
}
```

Latch order here is the reason `buf_flush_ready_for_flush_gen` needs its two-phase check: block mutex is acquired *before* `flush_list_mutex` on the insert path (`buf0flu.cc:521-527`).

### 7.2 Insertion is at the **head**, with a *relaxed* order assertion

```cpp
// storage/innobase/buf/buf0flu.cc:385-397 (abridged)
void buf_flush_insert_into_flush_list(buf_pool_t *buf_pool, buf_block_t *block) {
  ut_ad(mutex_own(buf_page_get_mutex(&block->page)));
  ut_ad(buf_flush_list_mutex_own(buf_pool));
  ut_ad(UT_LIST_GET_FIRST(buf_pool->flush_list) == nullptr ||
        buf_flush_list_order_validate(
            UT_LIST_GET_FIRST(buf_pool->flush_list)->get_oldest_lsn(),
            block->page.get_oldest_lsn()));
  ut_ad(!block->page.in_flush_list);
  UT_LIST_ADD_FIRST(buf_pool->flush_list, &block->page);
  ut_d(block->page.in_flush_list = true);
  incr_flush_list_size_in_bytes(block, buf_pool);
```

There is **no sorted-insert variant** in 26.7. The order relaxation is explicit:

```cpp
// storage/innobase/buf/buf0flu.cc:328-336 (verbatim)
[[nodiscard]] static inline bool buf_flush_list_order_validate(
    lsn_t earlier_added_lsn, lsn_t new_added_lsn) {
  /* The flush order during recovery doesn't matter and is not maintained,
  because we flush all pages and clear the BufferPool before end of recovery. */
  if (recv_recovery_is_on()) {
    return true;
  }
  return earlier_added_lsn <= new_added_lsn + buf_flush_list_added->order_lag();
}
```

The invariant is documented in the header:

```cpp
// storage/innobase/include/buf0flu.h:410-417 (verbatim)
  /** The flush lists are not completely sorted, and the amount of disorder is
  limited by the order_lag() - which is controlled by immutable
  srv_buf_flush_list_added_size  sysvar - in the following way. If page A is
  added before page B in a flush_list, then it must hold that
  A.oldest_modification returned value < B.oldest_modification.
  @return the maximum lsn distance the subsequent elements of the flush list can
  lag behind the first element w.r.t. oldest_modification */
  uint64_t order_lag();
```

`Buf_flush_list_added_lsns` is backed by a `Link_buf<lsn_t>` ring sized by `srv_buf_flush_list_added_size` (`buf0flu.h:434-437`, `buf0flu.cc:4136`). Default **2 MiB**, min = one log block (512 B), max 1 GiB:

```cpp
// storage/innobase/include/log0constants.h:502-509
constexpr ulong INNODB_BUF_FLUSH_LIST_ADDED_SIZE_DEFAULT = 2 * 1024 * 1024;
constexpr ulong INNODB_BUF_FLUSH_LIST_ADDED_SIZE_MIN = OS_FILE_LOG_BLOCK_SIZE;
constexpr ulong INNODB_BUF_FLUSH_LIST_ADDED_SIZE_MAX = 1024 * 1024 * 1024UL;
```

The sysvar is READONLY and gated behind `ENABLE_EXPERIMENT_SYSVARS` (`ha_innodb.cc:22989-22996`, `23600-23604`) — so in a stock build the lag is fixed at 2 MiB of LSN.

**Why relax the order at all?** Because a strict total order would force every committing mtr to serialise its flush-list insertion against every other, at the exact point where they already contend on the log buffer. Instead each mtr calls `wait_to_add(start_lsn)`, which blocks only until all pages with `oldest_modification < start_lsn − order_lag` are in (`buf0flu.h:425-432`).

### 7.3 No-redo dirty pages borrow an LSN

```cpp
// storage/innobase/buf/buf0flu.cc:361-383 (abridged)
static inline lsn_t buf_flush_borrow_lsn(const buf_pool_t *buf_pool) {
  ut_ad(buf_flush_list_mutex_own(buf_pool));
  const auto page = UT_LIST_GET_FIRST(buf_pool->flush_list);
  if (page == nullptr) {
    /* Flush list is empty - use lsn up to which we know that all
    dirty pages with smaller oldest_modification were added to
    the flush list (they were flushed as the flush list is empty). */
    const lsn_t lsn = buf_flush_list_added->smallest_not_added_lsn();
    if (lsn < LOG_START_LSN) { ... }
    return lsn;
  }
  ut_ad(page->is_dirty());
  ut_ad(page->get_newest_lsn() >= page->get_oldest_lsn());
  return page->get_oldest_lsn();
}
```

Used for temp-tablespace pages and bulk-load pages that generate no redo — they still need a plausible `oldest_modification` so that the checkpoint arithmetic and the head-insertion invariant hold.

### 7.4 Removal

```cpp
// storage/innobase/buf/buf0flu.cc:575-591 (abridged)
void buf_flush_remove(buf_page_t *bpage) {
  ut_ad(mutex_own(buf_page_get_mutex(bpage)));
  ut_ad(bpage->in_flush_list);
  buf_flush_list_mutex_enter(buf_pool);
  /* Important that we adjust the hazard pointer before removing
  the bpage from flush list. */
  buf_pool->flush_hp.adjust(bpage);
  buf_pool->oldest_hp.adjust(bpage);
```

### 7.5 How the checkpoint LSN is derived from the flush lists — cite chain

**(a) Approximate oldest, per instance, using `oldest_hp` as a cursor and skipping temp-tablespace pages:**

```cpp
// storage/innobase/buf/buf0buf.cc:436-487 (abridged)
lsn_t buf_pool_get_oldest_modification_approx(void) {
  for (ulint i = 0; i < srv_buf_pool_instances; i++) {
    buf_flush_list_mutex_enter(buf_pool);
    /* We don't let log-checkpoint halt because pages from system
    temporary are not yet flushed to the disk. ... */
    bpage = buf_pool->oldest_hp.get();
    if (bpage == nullptr) bpage = UT_LIST_GET_LAST(buf_pool->flush_list);
    for (; bpage != nullptr && fsp_is_system_temporary(bpage->id.space());
         bpage = UT_LIST_GET_PREV(list, bpage)) { }
    if (bpage != nullptr) { lsn = bpage->get_oldest_lsn(); buf_pool->oldest_hp.set(bpage); }
    else { buf_pool->oldest_hp.set(UT_LIST_GET_FIRST(buf_pool->flush_list)); }
    buf_flush_list_mutex_exit(buf_pool);
    if (!oldest_lsn || oldest_lsn > lsn) oldest_lsn = lsn;
  }
  return (oldest_lsn);
}
```

**(b) Subtract the disorder lag to get a *safe* low watermark:**

```cpp
// storage/innobase/buf/buf0buf.cc:489-512 (verbatim)
lsn_t buf_pool_get_oldest_modification_lwm(void) {
  const lsn_t lsn = buf_pool_get_oldest_modification_approx();
  if (lsn == 0) { return (0); }
  ut_a(log_is_data_lsn(lsn));
  const lsn_t lag = buf_flush_list_added->order_lag();
  ut_a(lag % OS_FILE_LOG_BLOCK_SIZE == 0);
  const lsn_t checkpoint_lsn = pages_persistence->get_checkpoint_lsn();
  ut_a(checkpoint_lsn != 0);
  if (lsn > lag) {
    return (std::max(checkpoint_lsn, lsn - lag));
  } else {
    return (checkpoint_lsn);
  }
}
```

**(c) The checkpointer combines it with the "all dirty pages added up to" LSN and the redo durability point:**

```cpp
// storage/innobase/log/log0chkp.cc:162-201 (abridged; full comment at 143-158)
  const lsn_t dpa_lsn = buf_flush_list_added->smallest_not_added_lsn();
  ...
  lsn_t lwm_lsn = buf_pool_get_oldest_modification_lwm();
  /* We cannot return lsn larger than dpa_lsn,
  because some mtr's commit could be in the middle, after
  its log records have been written to log buffer, but before
  its dirty pages have been added to flush lists. */
  if (lwm_lsn == 0) {
    lwm_lsn = dpa_lsn;              /* Empty flush list. */
  } else {
    lwm_lsn = std::min(lwm_lsn, dpa_lsn);
  }
  ...
  const lsn_t flushed_lsn = ib::redo::handler->peek_first_nonpersisted_lsn();
  lsn_t lsn = std::min(lwm_lsn, flushed_lsn);
```

Then clamped upward by the current checkpoint (`log0chkp.cc:235`). So:

> **checkpoint_lsn ≤ min( max(chkp, approx_oldest − order_lag), smallest_not_added_lsn, first_nonpersisted_redo_lsn )**

This is exactly *why* order matters even in a relaxed list: the list's tail gives an approximate minimum cheaply, and the fixed `order_lag` bound converts "approximate" into "provably safe."

There is also a rare back-off: if `flushed_lsn < lwm_lsn` and the result lands on a log-block boundary, the code rewinds by `align_up(FN_REFLEN*10, 512)` so recovery can find an mtr boundary scanning *forward* (`log0chkp.cc:210-232`) — recovery cannot scan backwards because old files may be gone.

---

## 8. The WAL rule — exact enforcement point

Immediately before a dirty page is handed to the doublewrite/data-file writer:

```cpp
// storage/innobase/buf/buf0flu.cc:971-994 (verbatim)
  ut_ad(recv_recovery_is_on() || bpage->get_newest_lsn() != 0);

  /* Force the log to the disk before writing the modified block */
  if (!srv_read_only_mode) {
    const lsn_t flush_to_lsn = bpage->get_newest_lsn();

    /* Do the check before calling persist_smaller_than() because in most
    cases it would allow to avoid call, and because of that we don't
    want those calls because they would have bad impact on the counter
    of calls, which is monitored to save CPU on spinning in log threads.

    The peek_first_nonpersisted_lsn() and persist_smaller_than() shouldn't be
    called before start_writing(). See comment in log_write_up_to() for more
    explanation why we can skip the call when recv_recovery_is_on() == true. */
    if (!recv_recovery_is_on() &&
        ib::redo::handler->peek_first_nonpersisted_lsn() < flush_to_lsn) {
      ib::redo::must_succeed(
          ib::redo::handler->persist_smaller_than(
              flush_to_lsn,
              ib::redo::Handler_interface::Durability::FULLY_PERSISTED,
              ib::redo::Handler_interface::Origin::PAGE_FLUSHING),
          UT_LOCATION_HERE);
    }
  }
```

**[Δ vs 8.0 lore]** In 8.0 this line reads `log_write_up_to(*log_sys, bpage->get_newest_lsn(), true)`. In 26.7 it is `ib::redo::handler->persist_smaller_than(newest_lsn, FULLY_PERSISTED, PAGE_FLUSHING)` behind a pluggable redo handler interface. `log_write_up_to()` still exists (`log0write.h:63`, `log0write.cc:1058`) but is no longer the buffer-pool's WAL barrier. Three observable consequences: durability level is now an explicit enum argument; the call site is *attributed* (`Origin::PAGE_FLUSHING`) for log-thread spin accounting; and the fast-path guard `peek_first_nonpersisted_lsn() < flush_to_lsn` is documented as CPU-motivated, not correctness-motivated.

Only after this does the page get its LSN stamped and checksummed and go out:

```cpp
// storage/innobase/buf/buf0flu.cc:1016-1031 (abridged)
    case BUF_BLOCK_FILE_PAGE:
      ...
      buf_flush_init_for_writing(..., bpage->get_newest_lsn(),
                                 fsp_is_checksum_disabled(bpage->id.space()),
                                 false /* do not skip lsn check */);
      break;
  }
  dberr_t err = dblwr::write(flush_type, bpage, sync);
```

A second WAL-adjacent point: the page-cleaner coordinator opportunistically pushes redo out once per second so page flushing does not stall on it:

```cpp
// storage/innobase/buf/buf0flu.cc:3077-3085 (abridged)
    if (!srv_read_only_mode && mtr_t::s_logging.is_enabled() &&
        ret_sleep == OS_SYNC_TIME_EXCEEDED) {
      /* For smooth page flushing along with WAL,
      flushes log as much as possible. */
      ib::redo::must_succeed(
          ib::redo::handler->persist_available(
              ib::redo::Handler_interface::Origin::PAGE_FLUSHING),
          UT_LOCATION_HERE);
    }
```

---

## 9. Page cleaner architecture

### 9.1 Threads

One **coordinator** + N−1 **workers**, all drawn from `srv_threads.m_page_cleaner_workers`; slot 0 *is* the coordinator (`buf0flu.cc:2570-2576`, `2922-2929`). So `innodb_page_cleaners = N` means N total threads, not N in addition to a coordinator.

```cpp
// storage/innobase/buf/buf0flu.cc:2561-2564
  page_cleaner->n_slots = static_cast<ulint>(srv_buf_pool_instances);
  page_cleaner->slots = ut::make_unique<page_cleaner_slot_t[]>(
      UT_NEW_THIS_FILE_PSI_KEY, page_cleaner->n_slots);
```

**One slot per buffer-pool instance.** Threads are workers that grab slots; slots are not owned. Default `innodb_page_cleaners = number of buffer pool instances` (`ha_innodb.cc:22365-22370`), and it is clamped down at startup:

```cpp
// storage/innobase/handler/ha_innodb.cc:5051-5056 (abridged)
  if (!innodb_page_cleaners_is_set() ||
      srv_n_page_cleaners > srv_buf_pool_instances) {
    ...
    srv_n_page_cleaners = srv_buf_pool_instances;
  }
```

Cleaner threads try to set `nice -20` (`buf0flu.cc:80`, `2912-2919`).

Also notable: `buf_flush_page_cleaner_init()` is called from `Pages_persistence::init()` (`fil0innodb_pages_persistence.cc:55-61`), i.e. the page cleaner's lifecycle now belongs to the persistence layer. **[Δ vs 8.0 lore]**

### 9.2 Request / claim / join protocol

- `pc_request(min_n, lsn_limit)` (`buf0flu.cc:2608-2650`): divides `min_n` evenly across instances via `ut::div_ceil`, sets every slot to `PAGE_CLEANER_STATE_REQUESTED`, signals `is_requested`. Special values: `ULINT_MAX` = "flush everything up to `lsn_limit`", `0` = "LRU only".
- `pc_flush_slot()` (`buf0flu.cc:2655-2745`): claim the first REQUESTED slot, drop the cleaner mutex, then do **LRU flush first, flush-list flush second**:

```cpp
// storage/innobase/buf/buf0flu.cc:2695-2719 (abridged)
      /* Flush pages from end of LRU if required */
      slot->n_flushed_lru = buf_flush_LRU_list(buf_pool);
      ...
        /* Flush pages from flush_list if required */
        if (page_cleaner->requested) {
          slot->succeeded_list = buf_flush_do_batch(
              buf_pool, BUF_FLUSH_LIST, slot->n_pages_requested,
              page_cleaner->lsn_limit, &slot->n_flushed_list);
```

  The LRU pass runs **unconditionally every tick**; the flush-list pass only when `requested`. Per-slot timing for both is accumulated (`2727-2732`).
- The coordinator also calls `pc_flush_slot()` in a loop until no slots remain (`buf0flu.cc:3116-3118`), then `pc_wait_finished()` joins on `is_finished` and sums the counters (`2753-2787`).

### 9.3 The two flush types

**LRU-tail flush** — `buf_flush_LRU_list()` (`buf0flu.cc:1981-2005`): scan depth = `min(srv_LRU_scan_depth, LRU length)`, raised to the withdraw depth while shrinking. Then `buf_flush_LRU_list_batch()` (`1530-1609`) walks from the LRU tail under `lru_hp` and, per page, either:

- stale → `buf_page_free_stale` (evict count),
- **evictable** (`ready_for_replace`) → `buf_LRU_free_page` → free list (evict count),
- **flushable** → `buf_flush_page_and_try_neighbors(bpage, BUF_FLUSH_LRU, ...)` — the block goes to the free list later, in the I/O completion routine, because `BUF_FLUSH_LRU` forces `evict = true` (`buf0buf.cc:5901-5903`),
- `mutex_enter_nowait` failed → skip.

Loop guards (`buf0flu.cc:1541-1544`): stop when `count + evict_count >= max`, or `free_len >= srv_LRU_scan_depth + withdraw_depth`, or `lru_len <= BUF_LRU_MIN_LEN`. `BUF_LRU_MIN_LEN = 256` and lives in `buf0flu.cc:221`, **not** in `buf0lru.h` — easy to miss.

**Flush-list flush** — `buf_do_flush_list_batch(buf_pool, min_n, lsn_limit)` (`buf0flu.cc:1644-1697`): walk from the flush-list **tail** (oldest) under `flush_hp` while `count < min_n && oldest_lsn < lsn_limit`, calling `buf_flush_page_and_try_neighbors(..., BUF_FLUSH_LIST, ...)`.

An important asymmetry in `buf_flush_page()`: for `BUF_FLUSH_LIST` the SX latch is taken **after** committing to the flush, and if `nowait` fails, the doublewrite buffer is force-flushed first to unblock whoever holds the latch, then a blocking SX is taken (`buf0flu.cc:1138-1147`). For LRU and single-page flushes, a failed `rw_lock_sx_lock_nowait` simply abandons the page (`1096-1101`).

**Neighbour flushing** — `buf_flush_try_neighbors()` (`buf0flu.cc:1241-1382`):

```cpp
// storage/innobase/buf/buf0flu.cc:1254-1271 (abridged)
  if (UT_LIST_GET_LEN(buf_pool->LRU) < BUF_LRU_OLD_MIN_LEN ||
      srv_flush_neighbors == 0) {
    low = page_id.page_no();  high = page_id.page_no() + 1;
  } else {
    page_no_t buf_flush_area = std::min(buf_pool->read_ahead_area,
                                        static_cast<page_no_t>(buf_pool->curr_size / 16));
    low  = (page_id.page_no() / buf_flush_area) * buf_flush_area;
    high = (page_id.page_no() / buf_flush_area + 1) * buf_flush_area;
```

Mode 1 shrinks `[low, high)` to the maximal *contiguous dirty* run around the victim (`1273-1302`); mode 2 takes the whole area. **`innodb_flush_neighbors` default is 0** in the sysvar (`ha_innodb.cc:22681-22687`) even though `srv0srv.cc:444` initialises the C variable to 1 — the sysvar default wins. For LRU flushes, neighbours are skipped unless `buf_page_is_old()` "because the flushed blocks are soon freed" (`buf0flu.cc:1220-1228`, `1352-1356`).

### 9.4 Adaptive flushing algorithm

Namespace `Adaptive_flush` (`buf0flu.cc:2007-2516`). Entry point:

```cpp
// storage/innobase/buf/buf0flu.cc:2486-2515 (abridged)
ulint page_recommendation(ulint last_pages_in, bool is_sync_flush,
                          lsn_t sync_flush_limit_lsn) {
  if (initialize(last_pages_in)) return (0);          // first time around
  bool skip_lsn = (prev_lsn == cur_iter_lsn && !is_sync_flush);
  set_average();
  auto n_pages = skip_lsn ? 0
               : set_flush_target_by_lsn(is_sync_flush, sync_flush_limit_lsn);
  n_pages = set_flush_target_by_page(n_pages);
  ...
  return (n_pages);
}
```

**`get_pct_for_dirty()`** (`buf0flu.cc:2205-2231`):

```cpp
  if (srv_max_dirty_pages_pct_lwm == 0) {
    if (dirty_pct >= srv_max_buf_pool_modified_pct) return (100);
  } else if (dirty_pct >= srv_max_dirty_pages_pct_lwm) {
    return (static_cast<ulint>((dirty_pct * 100) / (srv_max_buf_pool_modified_pct + 1)));
  }
  return (0);
```

Defaults: `innodb_max_dirty_pages_pct = 90.0`, `innodb_max_dirty_pages_pct_lwm = 10` (`ha_innodb.cc:22372-22381`). Both are `DOUBLE` sysvars with mutual clamping (`ha_innodb.cc:20609-20661`, `4883-4886`).

**`get_pct_for_lsn(age)`** (`buf0flu.cc:2235-2268`):

```cpp
  log_checkpointing->get_limits(limit_for_free_check, limit_for_dirty_page_age);
  lsn_t af_lwm = (srv_adaptive_flushing_lwm * limit_for_free_check) / 100;
  if (age < af_lwm) return (0);
  if (age < limit_for_dirty_page_age && !srv_adaptive_flushing) return (0);
  lsn_age_factor = (age * 100.0) / limit_for_dirty_page_age;
  return (static_cast<ulint>(((srv_max_io_capacity / srv_io_capacity) *
                              (lsn_age_factor * sqrt(lsn_age_factor))) / 7.5));
```

The `x^1.5 / 7.5` curve is the classic adaptive-flush shape. `innodb_adaptive_flushing_lwm` default 10 % of log capacity (`ha_innodb.cc:22383-22386`); `innodb_adaptive_flushing` default ON (`22388-22391`). **[Δ vs 8.0 lore]** The limits now come from `Log_checkpointing::get_limits()` (`log0chkp.h:258`) rather than from `log_sys` fields read directly.

**`set_flush_target_by_lsn()`** (`buf0flu.cc:2275-2385`):

1. `age = cur_iter_lsn − oldest_modification_approx`.
2. `pct_total = max(pct_for_dirty, pct_for_lsn)`.
3. Target LSN: sync → the caller's limit; else `oldest_lsn + lsn_avg_rate * buf_flush_lsn_scan_factor` where the factor is a hardcoded **3** (`buf0flu.cc:85`).
4. Per instance, count flush-list pages with `oldest_lsn ≤ target_lsn`, capped at `(srv_max_io_capacity*2 / instances) * scan_factor * 2` (`2304-2325`); store per-slot `n_pages_requested`.
5. Blend for the non-sync case:

```cpp
// storage/innobase/buf/buf0flu.cc:2356-2361
  } else {
    n_pages = (PCT_IO(pct_total) + page_avg_rate + pages_for_lsn) / 3;
    if (n_pages > srv_max_io_capacity) n_pages = srv_max_io_capacity;
  }
```

  — an equal-weight average of the percentage-of-io_capacity term, the observed flush rate, and the LSN-driven page count. `PCT_IO(p) = srv_io_capacity * p/100` (`srv0srv.h:625-627`).
6. For sync flush, floor the target at `srv_io_capacity` with an explicit anti-stall rationale (`2346-2355`).
7. Redistribute per instance: if `pct_for_lsn > 30`, weight by each instance's LSN-age share; otherwise split evenly (`2369-2377`).

**`set_flush_target_by_page(n_pages_lsn)`** (`buf0flu.cc:2391-2474`) — this is the newer, redo-off-aware estimator. It returns the LSN-based number unchanged when redo logging is enabled (`2404-2407`). Otherwise: `estimate = prev_page_rate_sec + dirty_page_change_sec`, multiplied by `boost_factor = sqrt(dirty_pct / 90.0)` (documented as ranging 0.10→1.05 with 1.0 at 90 %, `2445-2450`), averaged with `page_avg_rate`, capped at `srv_max_io_capacity`, and used only if it exceeds the LSN estimate.

Averaging window: `srv_flushing_avg_loops` iterations, default **30** (`ha_innodb.cc:22398-22401`, used `buf0flu.cc:2090`).

### 9.5 Coordinator loop and sync flush on redo pressure

Main loop (`buf0flu.cc:2982-3181`):

1. Determine `is_server_active` (activity counter, pending reads, or an in-progress shrink) — `2991-3001`.
2. Sleep up to 1 s via `pc_sleep_if_needed()` unless sync-flushing (`3006-3019`). If a tick takes > 4 s, log `ER_IB_MSG_128` "Page cleaner took Nms to flush X and evict Y pages" with exponential back-off up to every 600 ticks (`3023-3056`).
3. **Sync-flush decision:**

```cpp
// storage/innobase/buf/buf0flu.cc:3058-3075 (abridged)
    if (srv_flush_sync && !srv_read_only_mode) {
      lsn_limit = requested_sync_flush_lsn.load();
      if (lsn_limit != 0) {
        if (mtr_t::s_logging.is_enabled()) {
          lsn_limit += Adaptive_flush::lsn_avg_rate * buf_flush_lsn_scan_factor;
        }
        is_sync_flush = true;
      } else { is_sync_flush = false; }
    } else { is_sync_flush = false; lsn_limit = LSN_MAX; }
```

  `requested_sync_flush_lsn` is a global atomic written by the log checkpointer (`buf0flu.h:65`, `buf0flu.cc:93`, written at `log0chkp.cc:758`).
4. Push redo (§8).
5. `page_recommendation()` → `pc_request()` → drain slots → `pc_wait_finished()` (`3087-3131`).
6. **Idle flushing**: when the server is inactive and a full second elapsed, `buf_flush_lists(PCT_IO(srv_idle_flush_pct), LSN_MAX, &n_flushed)` (`3163-3173`). `innodb_idle_flush_pct` default **100** (`srv_idle_flush_pct_default`, `srv0srv.cc:456-457`), range 0–100 (`ha_innodb.cc:22645-22650`). So an idle server drains dirty pages at the full `innodb_io_capacity` rate.

**Who requests sync flush.** `Log_checkpointing::get_sync_flush_lsn()` (`log0chkp.cc:689-753`):

```cpp
  const lsn_t max_age = ::adaptive_flush_max_age(estimate.soft_logical_capacity());
  if (current_lsn + margin - oldest_lsn > max_age) {
    flush_up_to = current_lsn + margin - max_age;
  }
  if (requested_checkpoint_lsn > flush_up_to) flush_up_to = requested_checkpoint_lsn;
  if (flush_up_to > current_lsn) flush_up_to = current_lsn;
  if (flush_up_to > oldest_lsn) {
    flush_up_to += buf_flush_list_added->order_lag();
    return flush_up_to;
  }
  return 0;
```

Note the `+ order_lag()` at the end — because the flush list is only approximately sorted, the sync-flush target is padded by the same lag. Then `consider_sync_flush()` publishes it and calls `log_request_sync_flush()` (`log0chkp.cc:755-772`):

```cpp
// storage/innobase/log/log0chkp.cc:613-628 (abridged)
  if (!buf_flush_page_cleaner_is_active() || srv_is_being_started) {
    buf_flush_sync_all_buf_pools();
    return;
  }
  if (srv_flush_sync) {
    int64_t sig_count = os_event_reset(buf_flush_tick_event);
    os_event_set(buf_flush_event);
```

and then waits on `buf_flush_tick_event` for **1 ms if the checkpoint is already more than a full soft log capacity behind, else 1000 ms** (`log0chkp.cc:641-649`) — a deliberate two-speed back-off whose comment blames missing `log_free_check()` calls for the bad case.

`innodb_flush_sync` default ON (`ha_innodb.cc:22393-22396`) — it is the switch that allows bursts to exceed `innodb_io_capacity` at checkpoints.

---

## 10. Doublewrite buffer

### 10.1 Files, not the system tablespace

**[Δ vs 5.7 lore]** dblwr lives in its own files since 8.0.20, and 26.7 keeps that:

```cpp
// storage/innobase/buf/buf0dblwr.cc:2770-2776
  file.m_id = id;
  file.m_name = std::string(dir_name) + OS_PATH_SEPARATOR + "#ib_";
  file.m_name += std::to_string(srv_page_size) + "_" + std::to_string(id);
  file.m_name += dot_ext[extension];
```

So filenames look like `#ib_16384_0.dblwr`. Extension defaults to `DWR`; the reduced-mode variant uses `BWR` → `.bdblwr` (`buf0dblwr.cc:2740-2742`, `2832-2834`). Directory from `innodb_doublewrite_dir`, defaulting to `"."` (`buf0dblwr.cc:81`, `ha_innodb.cc:22573-22576`, `13194-13206`). The legacy in-tablespace pages still exist as `dblwr::v1` purely so reads of them can be rejected (`buf0rea.cc:73-79`, `buf0dblwr.cc:3007-3023`).

### 10.2 Instances, files, segments

```cpp
// storage/innobase/buf/buf0dblwr.cc:2864-2890 (abridged)
  /* Separate instances for LRU and FLUSH list write requests. */
  Double_write::s_n_instances = std::max(4UL, srv_buf_pool_instances * 2);
  ...
  if (Double_write::s_n_instances <= dblwr::n_files) {
    segments_per_file = 1;
    Double_write::s_files.resize(Double_write::s_n_instances);
  } else {
    Double_write::s_files.resize(dblwr::n_files);
    segments_per_file = ut::div_ceil(n_instances, N);
```

`Double_write` instances = `max(4, 2 × bp_instances)`, split so half serve LRU flushes and half serve flush-list flushes (`buf0dblwr.cc:576-583`). Batch segments are pre-created and queued in two MPMC queues, `s_LRU_batch_segments` and `s_flush_list_batch_segments`; with more than one file, file parity decides which queue a segment joins, otherwise segment-id parity does (`buf0dblwr.cc:2396-2419`). Single-page-flush slots get extra space: `SYNC_PAGE_FLUSH_SLOTS = 512` pages, all in file 0 if there is one file, else spread across odd-id files (`buf0dblwr.cc:77`, `2917-2924`).

Tunables (all READONLY): `innodb_doublewrite_files` default **2** (`ha_innodb.cc:22583-22586`), `innodb_doublewrite_pages` default **128** per thread/segment, range 1–512 (`22578-22581`), `innodb_doublewrite_batch_size` default **0** = auto, max 256 (`22588-22591`). Note the C-variable initialisers in `buf0dblwr.cc:83-87` are `n_files{1}`, `n_pages{64}`, `batch_size{}` — the sysvar defaults override them at startup, so **do not quote the .cc values as the effective defaults**.

### 10.3 Write path, step by step

**Step 1 — `dblwr::write(flush_type, bpage, sync)`** (`buf0dblwr.cc:2590-2660`).

Early outs, in order:
- Page became stale → mark batch id invalid, `buf_page_free_stale_during_write()`, done (`2598-2608`).
- **Doublewrite bypassed entirely** when: read-only mode, system temp tablespace, `!dblwr::is_enabled()`, dblwr not initialised, or global redo logging disabled (`mtr_t::s_logging.dblwr_disabled()`). In that case go straight to `Double_write::write_to_datafile()`, with an `fil_flush(space_id)` afterwards if `sync` (`2610-2628`):

```cpp
// storage/innobase/buf/buf0dblwr.cc:2610-2616 (verbatim, abridged)
  if (srv_read_only_mode || fsp_is_system_temporary(space_id) ||
      !dblwr::is_enabled() || Double_write::s_instances == nullptr ||
      mtr_t::s_logging.dblwr_disabled()) {
    /* Skip the double-write buffer since it is not needed. Temporary
    tablespaces are never recovered, therefore we don't care about
    torn writes. */
```

**Step 2 — encrypt once.** `dblwr::get_encrypted_frame(bpage, type)` so that *identical* ciphertext goes to both the dblwr file and the data file (`buf0dblwr.cc:2632-2635`). This matters for recovery: the dblwr copy must be byte-comparable.

**Step 3 — async batch vs sync single page.**

```cpp
// storage/innobase/buf/buf0dblwr.cc:2637-2653 (abridged)
    if (!sync && flush_type != BUF_FLUSH_SINGLE_PAGE) {
      MONITOR_INC(MONITOR_DBLWR_ASYNC_REQUESTS);
      ut_d(bpage->release_io_responsibility());
      Double_write::submit(flush_type, bpage, e_block);
      err = DB_SUCCESS;
    } else {
      MONITOR_INC(MONITOR_DBLWR_SYNC_REQUESTS);
      /* Disable batch completion in write_complete(). */
      bpage->set_dblwr_batch_id(std::numeric_limits<uint16_t>::max());
      err = Double_write::sync_page_flush(bpage, e_block);
    }
```

**Step 4 — `enqueue()`: memcpy into the in-memory dblwr buffer.**

```cpp
// storage/innobase/buf/buf0dblwr.cc:660-697 (abridged)
  void enqueue(buf_flush_t flush_type, buf_page_t *bpage,
               const file::Block *e_block) noexcept {
    ... // frame = encrypted frame if present, else prepare(bpage,&frame,&len)
    for (;;) {
      mutex_enter(&m_mutex);
      if (m_buffer.append(frame, len)) break;
      if (flush_to_disk(flush_type)) {
        auto success = m_buffer.append(frame, len);
        ut_a(success);
        break;
      }
    }
    m_buf_pages.push_back(bpage, e_block);
    mutex_exit(&m_mutex);
  }
```

The buffer filling up is what *triggers* a batch write — there is no timer.

**Step 5 — `write_pages()`: dblwr file first, then data files.**

```cpp
// storage/innobase/buf/buf0dblwr.cc:2358-2364 (verbatim)
void Double_write::write_pages(buf_flush_t flush_type) noexcept {
  ut_ad(mutex_own(&m_mutex));
  ut_a(!m_buffer.empty());
  const uint16_t batch_id = write_dblwr_pages(flush_type);
  write_data_pages(flush_type, batch_id);
}
```

`write_dblwr_pages()` (`2265-2295`): dequeue a `Batch_segment` from the type-appropriate queue (spinning with `std::this_thread::yield()` if none free), write the whole buffer in one I/O, clear the buffer, **fsync the segment if required**, record the batch size, return the batch id.

```cpp
// storage/innobase/buf/buf0dblwr.cc:2280-2294 (abridged)
  batch_segment->write(m_buffer);
  m_bytes_written += m_buffer.size();
  m_buffer.clear();
#ifndef _WIN32
  if (is_fsync_required()) {
    batch_segment->flush();
  }
#endif /* !_WIN32 */
  batch_segment->set_batch_size(m_buf_pages.size());
  return batch_segment->id();
```

```cpp
// storage/innobase/buf/buf0dblwr.cc:872-876 (verbatim)
  [[nodiscard]] static bool is_fsync_required() noexcept {
    /* srv_unix_file_flush_method is a dynamic variable. */
    return srv_unix_file_flush_method != SRV_UNIX_O_DIRECT &&
           srv_unix_file_flush_method != SRV_UNIX_O_DIRECT_NO_FSYNC;
  }
```

So with `innodb_flush_method=O_DIRECT`, the dblwr fsync is skipped; on Windows it is always skipped.

`write_data_pages()` (`2297-2356`): for each collected page, stamp `bpage->set_dblwr_batch_id(batch_id)`, re-take I/O responsibility, and issue an **async** `write_to_datafile()` with a `pre_io_complete` lambda that handles `DB_PAGE_IS_STALE`/`DB_TABLESPACE_DELETED` and frees the encrypted block.

**Step 6 — batch completion recycles the segment.**

```cpp
// storage/innobase/buf/buf0dblwr.cc:2680-2708 (abridged)
      if (batch_id != std::numeric_limits<uint16_t>::max()) {
        auto batch_segment = s_segments[batch_id];
        if (batch_segment->write_complete()) {
          batch_segment->completed();
          srv_stats.dblwr_pages_written.add(batch_segment->batch_size());
          batch_segment->reset();
          ... // pick the right queue (reduced vs regular, LRU vs list)
          fil_flush_file_spaces();
          while (!segments->enqueue(batch_segment)) { std::this_thread::yield(); }
        }
      }
```

**The data-file `fsync` happens here** — `fil_flush_file_spaces()` after the last page of a batch completes. That is the point at which the dblwr copy becomes redundant and the segment can be reused.

Callers can force a partial batch out: `dblwr::force_flush(flush_type, buf_pool_index)` (`buf0dblwr.cc:3176-3179`), invoked at the end of every flush batch (`buf0flu.cc:1788-1793`) and when an SX latch cannot be had on a flush-list page (`buf0flu.cc:1138-1147`).

### 10.4 Modes, including `DETECT_ONLY`

```cpp
// storage/innobase/include/buf0dblwr.h:304-326 (abridged)
  enum mode_t {
    OFF,                 // == FALSEE; dblwr disabled
    ON,                  // == TRUEE == DETECT_AND_RECOVER
    DETECT_ONLY,         // "reduced" mode: torn-write detection only
    DETECT_AND_RECOVER,  // synonym of ON
    FALSEE,              // == OFF
    TRUEE                // == ON
  };
```

`innodb_doublewrite` is an ENUM with default `Mode::ON` (`ha_innodb.cc:22562-22566`). `is_enabled()` is true for ON/DETECT_ONLY/DETECT_AND_RECOVER/TRUEE; `is_atomic()` excludes DETECT_ONLY (`buf0dblwr.h:369-380`). Live mode changes between enabled↔disabled are **refused** with a "please shutdown" error (`ha_innodb.cc:934-980`).

**`DETECT_ONLY` mechanics.** Instead of full page images, a 16-byte record per page:

```cpp
// storage/innobase/include/buf0dblwr.h:269-295 (abridged)
/** When --innodb-doublewrite=DETECT_ONLY, page contents are not written to the
dblwr buffer. Only the following Reduced_entry information is stored in the
dblwr buffer. */
struct Reduced_entry {
  space_id_t m_space_id;
  page_no_t m_page_no;
  lsn_t m_lsn;
```

with `REDUCED_ENTRY_SIZE = 4+4+8 = 16` (`buf0dblwr.h:260-261`), packed into 8 KiB reduced-batch pages with a 20-byte header (batch id, checksum, data len, batch type, 9 unused) — `buf0dblwr.h:228-267`. `REDUCED_MAX_ENTRIES = (8192−20)/16 = 510`. These go to `.bdblwr` files, which can coexist with the regular `.dblwr` files (`buf0dblwr.cc:1206`, `717-720`).

The point of DETECT_ONLY: you cannot *repair* a torn page, but you can *detect* one and refuse to start silently corrupt — see the recovery check below.

### 10.5 Recovery

`recv::Pages::recover(space)` (`buf0dblwr.cc:3188-3227`):

1. Skip entirely if dblwr disabled or this is a cloned DB (`3193-3195`).
2. Recover each space at most once (`m_recovered_spaces` set, `3196-3200`).
3. For every loaded dblwr page image belonging to this space, call `dblwr_recover_page()`. The images are pre-sorted by LSN, so once a page is repaired the older copies fail the "actually corrupted" test and are ignored (`3202-3211`).
4. `detect_corruption_from_reduced_entries(space)` then `fil_flush_file_spaces()` (`3224-3226`).

`dblwr_recover_page()` (`buf0dblwr.cc:3114-3174`) — the torn-write test and repair:

```cpp
// storage/innobase/buf/buf0dblwr.cc:3127-3141 (abridged)
  if (buf_page_is_zeroes(dblwr_page, page_size) ||
      is_dblwr_page_corrupted(dblwr_page, space, page_no)) {
    /* The page in the Double-write buffer is broken. We can't trust the page ID
    read from it to confront the page on disk against it. */
    return;
  }
  if (!is_actual_page_corrupted(space, page_id)) {
    /* Database page is fine. No need to restore from dblwr. */
    return;
  }
  ib::info(ER_IB_MSG_DBLWR_1315)
      << "Database page corruption of page " << page_id
      << ". Trying to recover it from the doublewrite buffer.";
```

Corruption detection for both copies bottoms out in **checksum validation**, after decryption and decompression:

```cpp
// storage/innobase/buf/buf0dblwr.cc:3096-3111 (abridged)
  if (page_type == FIL_PAGE_COMPRESSED) {
    if (os_file_decompress_page(true, page, nullptr, 0) != DB_SUCCESS) { ... return true; }
  }
  BlockReporter check(true, page, page_size, fsp_is_checksum_disabled(space.id));
  return check.is_corrupted();
```

Decrypt failure or decompress failure both count as corrupted (`3078-3107`). Note the ordering: **the dblwr copy is validated first**, because a corrupt dblwr copy has an untrustworthy page id.

Cross-check against reduced entries — this is the DETECT_ONLY safety net:

```cpp
// storage/innobase/buf/buf0dblwr.cc:3148-3159 (abridged)
  const auto reduced_lsn = get_max_lsn_of_reduced_page_entries(page_id);
  lsn_t dblwr_lsn = mach_read_from_8(dblwr_page + FIL_PAGE_LSN);
  /* If we find a newer version of page that is in reduced dblwr, we
  shouldn't restore the old/stale page from regular dblwr. We should
  abort */
  if (reduced_lsn.has_value() && reduced_lsn > dblwr_lsn) {
    ib::fatal(UT_LOCATION_HERE, ER_IB_REDUCED_DBLWR_PAGE_FOUND, ...);
  }
```

Repair is a raw write with tablespace validation suppressed:

```cpp
// storage/innobase/buf/buf0dblwr.cc:3165-3170 (abridged)
  const auto err = fil_io(IORequest::Type::WRITE | IORequest::Type::DBLWR |
                              IORequest::Type::NO_COMPRESSION,
                          true, page_id, page_size, page_size.physical(),
                          const_cast<byte *>(dblwr_page), nullptr, false);
  ut_a(err == DB_SUCCESS);
```

Page 0 of a tablespace gets special treatment because the FSP header is needed before normal recovery can run: `get_first_page_content_for_recovery()` substitutes the dblwr copy (`buf0dblwr.cc:3229-3259`), and the code asserts the FSP cache is *not* populated until dblwr recovery for that space is finished (`3213-3222`).

One more coupling: `dblwr` can force a checkpoint — `pages_persistence->request_sharp_checkpoint()` at `buf0dblwr.cc:2032` (in the file-reset path), so that stale dblwr contents are not needed after a resize/truncate of the dblwr files.

---

## 11. Checkpointing — fuzzy, and now behind an interface

### 11.1 It is fuzzy: nothing is force-flushed at checkpoint time

A checkpoint in InnoDB writes a small header record naming a LSN; it does **not** flush the buffer pool. The write itself is `store_metadata(Metadata_key::CHECKPOINT, value)` on the redo handler:

```cpp
// storage/innobase/log/log0chkp.cc:960-979 (abridged)
bool Log_checkpointing::save_checkpoint_value(lsn_t checkpoint_lsn) {
  Metadata_value value;
  log_checkpoint_header_serialize({checkpoint_lsn}, value.data());
  if (ib::redo::handler->store_metadata(Metadata_key::CHECKPOINT, value) ==
      Status::SUCCESS) {
    ut_a(log_sys == nullptr || checkpoint_lsn == get_checkpoint());
    set_checkpoint(checkpoint_lsn);
    return true;
  }
  return false;
}
```

The checkpoint LSN is *derived from* what the page cleaners have already achieved (§7.5), never the other way round. Freeing redo space is a separate ack:

```cpp
// storage/innobase/log/log0chkp.cc:951-958 (verbatim)
void Log_checkpointing::update_limits() {
  ut_ad(log_limits_mutex_own());
  const auto checkpoint_lsn = m_checkpoint_lsn.load();
  auto status = ib::redo::handler->do_not_need_smaller_than(checkpoint_lsn);
  if (status != ib::redo::Status::SUCCESS) {
    ib::error(ER_IB_REDO_HANDLER_COULD_NOT_ACK_TO_TRUNCATE_LSN, checkpoint_lsn);
  }
}
```

### 11.2 The `log_checkpointer` thread and its lifecycle

`Log_checkpointing` (`log0chkp.h:109`) owns `m_checkpoint_lsn`, `m_available_for_checkpoint_lsn`, `m_last_checkpoint_time`, `checkpoint_mutex`, `limits_mutex`, and the thread. `should_checkpoint()` (`log0chkp.cc:779-...`) reads `available_for_checkpoint_lsn`, `requested_checkpoint_lsn`, whether periodical checkpoints are on, and the redo capacity estimate under `limits_mutex`, then decides.

**[Δ vs 8.0 lore]** The whole thing is now driven by `Pages_persistence`:

```cpp
// storage/innobase/fil/fil0innodb_pages_persistence.cc:55-89 (abridged)
Pages_persistence::Status Pages_persistence::init() {
  buf_flush_list_added = Buf_flush_list_added_lsns::create();
  buf_flush_page_cleaner_init();
  Log_checkpointing::init();
  if (const auto err = scan_tablespaces(); err != DB_SUCCESS) { ... }
  return Status::SUCCESS;
}
Pages_persistence::Status Pages_persistence::assume_checkpoint_lsn(Lsn min_needed_lsn) {
  ut_a(log_sys == nullptr || log_checkpointing->get_checkpoint() == min_needed_lsn);
  if (!log_checkpointing->save_checkpoint_value(min_needed_lsn)) return Status::IO_ERROR;
  buf_flush_list_added->assume_added_up_to(min_needed_lsn);
  return Status::SUCCESS;
}
void Pages_persistence::enable_checkpointing()            { log_checkpointing->start_thread(); }
void Pages_persistence::enable_periodical_checkpoints()   { log_checkpointing->enable_periodical_checkpoints(); }
Pages_persistence::Lsn Pages_persistence::get_checkpoint_lsn() const { return log_checkpointing->get_checkpoint(); }
```

The interface is explicit that the buffer pool no longer *owns* this concern:

```cpp
// storage/innobase/include/fil0pages_persistence_interface.h:73 (verbatim)
  @note It is page cleaners who do the heavy work of actually writing pages, and
```

and it declares an interface-level contract for eviction and dirtying notifications: `page_became_dirty()` (`:234`), `page_is_to_be_evicted()` (`:331-333`, called from `buf0lru.cc:1442`), `mtr_has_dirtied_pages()` (`:222-225`), `request_sharp_checkpoint()` (`:377`), `get_checkpoint_lsn()` (`:360`). Practically, this is InnoDB carving out a seam so that "where dirty pages are tracked and how the checkpoint LSN is computed" can be replaced — the shipping implementation is `ib::fil::Pages_persistence`.

### 11.3 Checkpoint age → forced flushing

The chain, end to end:

1. `Log_checkpointing::get_limits()` yields `limit_for_free_check` and `limit_for_dirty_page_age` (`log0chkp.h:258`, consumed `buf0flu.cc:2240-2241`).
2. `get_pct_for_lsn(age)` turns checkpoint age into a percentage of `io_capacity` on an `x^1.5` curve, kicking in above `innodb_adaptive_flushing_lwm` % of `limit_for_free_check` (`buf0flu.cc:2244-2267`).
3. If age exceeds `adaptive_flush_max_age(soft_logical_capacity)` minus a margin, `get_sync_flush_lsn()` returns a non-zero target (`log0chkp.cc:729-750`).
4. `consider_sync_flush()` publishes it to `requested_sync_flush_lsn` and wakes the cleaner (`log0chkp.cc:755-772`, `602-649`).
5. The coordinator enters sync-flush mode, which bypasses the 1 s sleep and floors the target at `io_capacity` (`buf0flu.cc:3006-3007`, `2346-2355`).
6. If the cleaner is not running (early startup / shutdown), the requester does it itself: `buf_flush_sync_all_buf_pools()` (`log0chkp.cc:616-620`, impl `buf0flu.cc:3377`).

Debug-only forcing hooks exist: `innodb_log_checkpoint_now` (sharp), `innodb_log_checkpoint_fuzzy_now`, `innodb_checkpoint_disabled`, `innodb_buf_flush_list_now` (`ha_innodb.cc:22262-22277`).

---

## 12. Tunables and observability

### 12.1 Tunables — verified defaults in **this** build

Sizing and layout:

| Sysvar | Default | Range / note | Anchor |
|---|---|---|---|
| `innodb_buffer_pool_size` | 128 MiB (`srv_buf_pool_def_size`) | min 5 MiB, max LLONG_MAX, 1 MiB blocks | `ha_innodb.cc:22522-22530`, `srv0srv.cc:416`, `418` |
| `innodb_buffer_pool_chunk_size` | 128 MiB | min 1 MiB, 1 MiB multiples, READONLY | `ha_innodb.cc:22532-22540`, `srv0srv.cc:425-429` |
| `innodb_buffer_pool_instances` | **0 = auto** | 0–64, READONLY | `ha_innodb.cc:22593-22598`, `srv0srv.cc:434` |
| `innodb_page_hash_locks` | 16 | debug/perf-debug builds only, max 1024 | `ha_innodb.cc:22542-22548`, `srv0srv.cc:436` |
| `innodb_buffer_pool_in_core_file` | OFF where `MADV_DONTDUMP` exists | — | `ha_innodb.cc:22619-22636` |
| `innodb_buffer_pool_dump_pct` | 25 | dump hottest N % | `ha_innodb.cc:22640-22643` |

LRU:

| Sysvar | Default | Anchor |
|---|---|---|
| `innodb_old_blocks_pct` | **37** (`100*3/8`), range 5–95 | `ha_innodb.cc:23091-23093` |
| `innodb_old_blocks_time` | **1000 ms**, 0 disables | `ha_innodb.cc:23095-23100` |
| `innodb_lru_scan_depth` | **1024**, min 100 | `ha_innodb.cc:22676-22679`, `srv0srv.cc:442` |
| `innodb_random_read_ahead` | **OFF** | `ha_innodb.cc:23329-23331` |
| `innodb_read_ahead_threshold` | **56**, range 0–64 | `ha_innodb.cc:23333-23337` |

Flushing:

| Sysvar | Default | Anchor |
|---|---|---|
| `innodb_io_capacity` | **10000** (!), min 100 | `ha_innodb.cc:22231-22234` |
| `innodb_io_capacity_max` | `UINT32_MAX` sentinel → resolved at startup | `ha_innodb.cc:22236-22241`, `4890-4898` |
| `innodb_max_dirty_pages_pct` | **90.0**, DOUBLE, 0–99.999 | `ha_innodb.cc:22372-22376` |
| `innodb_max_dirty_pages_pct_lwm` | **10**, DOUBLE | `ha_innodb.cc:22378-22381` |
| `innodb_adaptive_flushing` | ON | `ha_innodb.cc:22388-22391` |
| `innodb_adaptive_flushing_lwm` | 10 %, 0–70 | `ha_innodb.cc:22383-22386` |
| `innodb_flush_sync` | ON | `ha_innodb.cc:22393-22396` |
| `innodb_flushing_avg_loops` | 30 | `ha_innodb.cc:22398-22401` |
| `innodb_page_cleaners` | = bp instances | `ha_innodb.cc:22366-22370`, `5051-5056` |
| `innodb_flush_neighbors` | **0** | `ha_innodb.cc:22681-22687` |
| `innodb_idle_flush_pct` | **100** (`srv_idle_flush_pct_default`), 0–100 | `ha_innodb.cc:22645-22650`, `srv0srv.cc:456-457` |
| `innodb_use_fdatasync` | **true** | `ha_innodb.cc:22558-22560` |
| `innodb_buf_flush_list_added_size` | 2 MiB, READONLY, experiment-gated | `ha_innodb.cc:22989-22996`, `log0constants.h:502` |

Doublewrite: see §10.2.

**[Δ vs 8.0 lore] Two default changes that will bite anyone reasoning from 8.0 experience:**

1. **`innodb_io_capacity` default is 10000, not 200.** Since `get_pct_for_lsn()` scales by `srv_max_io_capacity / srv_io_capacity` (`buf0flu.cc:2265`) and the blend uses `PCT_IO(pct_total)` (`2357`), the whole adaptive-flush curve is anchored 50× higher than under 8.0. And because `io_capacity_max` is resolved at startup from `io_capacity` (`ha_innodb.cc:4890-4898`), the ratio term behaves differently too.
2. **`innodb_adaptive_hash_index` default is `false`.**

```cpp
// storage/innobase/handler/ha_innodb.cc:22462-22466 (verbatim)
static MYSQL_SYSVAR_BOOL(
    adaptive_hash_index, srv_btr_search_enabled, PLUGIN_VAR_OPCMDARG,
    "Enable InnoDB adaptive hash index (enabled by default). "
    " Disable with --skip-innodb-adaptive-hash-index.",
    nullptr, innodb_adaptive_hash_index_update, false);
```

Note the help text still says "enabled by default" while the default argument is `false` — the string is stale. This matters for buffer-pool work because AHI is what forces `BUF_BLOCK_REMOVE_HASH`, `buf_pool_clear_hash_index()`, the `ahi_t` atomics in every block, and the AHI-disable step at the front of every resize.

### 12.2 Observability

**`SHOW ENGINE INNODB STATUS` — BUFFER POOL AND MEMORY section.** Produced by `buf_print_io_instance()` (`buf0buf.cc:6679-6751`). Fields, in order:

- `Buffer pool size`, `Free buffers`, `Database pages` (= LRU length), `Old database pages` (= `LRU_old_len`), `Modified db pages` (= flush_list length), `Pending reads`, and **`Pending writes: LRU %zu, flush list %zu, single page %zu`** — the per-flush-type breakdown (`6685-6703`).
- `Pages made young N, not young M` and `X youngs/s, Y non-youngs/s` (`6705-6716`).
- Hit rate and young-making rates, **all per-mille and all since the last printout**:

```cpp
// storage/innobase/buf/buf0buf.cc:6718-6730 (verbatim)
  if (pool_info->n_page_get_delta) {
    fprintf(file,
            "Buffer pool hit rate %lu / 1000,"
            " young-making rate %lu / 1000 not %lu / 1000\n",
            (ulong)(1000 - (1000 * pool_info->page_read_delta /
                            pool_info->n_page_get_delta)),
            (ulong)(1000 * pool_info->young_making_delta /
                    pool_info->n_page_get_delta),
            (ulong)(1000 * pool_info->not_young_making_delta /
                    pool_info->n_page_get_delta));
  } else {
    fputs("No buffer pool page gets since the last printout\n", file);
  }
```

  The literal `1000 - 1000*reads/gets` means hit rate is **derived from reads, not from a hit counter** — a page created without a read (`buf_page_create`) counts as a hit.
- `Pages read ahead X/s, evicted without access Y/s, Random read ahead Z/s` (`6732-6739`) — the middle number is the read-ahead effectiveness signal fed by `stat.n_ra_pages_evicted` (`buf0lru.cc:336-341`).
- `LRU len`, `unzip_LRU len`, and `I/O sum[..]:cur[..], unzip sum[..]:cur[..]` — the raw inputs to the unzip-vs-LRU eviction heuristic (`6743-6750`).

**`information_schema.INNODB_BUFFER_POOL_STATS`** (`i_s.cc:3822-...`, bound at `4224`): one row per instance. Columns in declaration order: `POOL_ID`, `POOL_SIZE`, `FREE_BUFFERS`, `DATABASE_PAGES`, `OLD_DATABASE_PAGES`, `MODIFIED_DATABASE_PAGES`, `PENDING_DECOMPRESS`, `PENDING_READS`, `PENDING_FLUSH_LRU`, `PENDING_FLUSH_LIST`, `PAGES_MADE_YOUNG`, … (verified through index 10 at `i_s.cc:3897-3898`). Filled by `i_s_innodb_buffer_pool_stats` (`i_s.cc:4053`, `4154`).

**`information_schema.INNODB_BUFFER_PAGE`** (`i_s.cc:4273`, `4415`, bound `4827`) and **`INNODB_BUFFER_PAGE_LRU`** (`i_s.cc:5022`, `5150`, bound `5278`). Both walk chunks/LRU and emit per-page rows; `PAGE_STATE` uses the `buf_page_state_str` map (`buf0buf.h:155-165`), and the LRU variant also reports `freed_page_clock` (`i_s.cc:223-224`). Both are full scans of the pool under list latches — expensive.

**`INNODB_METRICS` counters** touched in the paths above (all via `MONITOR_*`): `MONITOR_LRU_GET_FREE_SEARCH`, `_LOOPS`, `_WAITS`; `MONITOR_LRU_SEARCH_SCANNED`, `_UNZIP_SEARCH_SCANNED`, `_BATCH_SCANNED`, `_BATCH_EVICT_*`, `_SINGLE_FLUSH_SCANNED`, `_SINGLE_FLUSH_FAILURE_COUNT`; `MONITOR_FLUSH_BATCH_*`, `_NEIGHBOR_*`, `_ADAPTIVE_*`, `_SYNC_*`, `_BACKGROUND_*`; `MONITOR_FLUSH_N_TO_FLUSH_BY_AGE`, `_BY_DIRTY_PAGE`, `_REQUESTED`, `MONITOR_FLUSH_PCT_FOR_DIRTY`, `_FOR_LSN`; `MONITOR_DBLWR_ASYNC_REQUESTS`, `_SYNC_REQUESTS`. Status variables: `innodb_dblwr_pages_written`, `innodb_dblwr_writes` (`ha_innodb.cc:5137-5142`), `innodb_buffer_pool_wait_free` (`buf0lru.cc:635`).

---

## 13. Surprising / little-known facts (all anchored)

**Architecture**

1. **`buf_pool_t` has no global mutex** — the field does not exist. Seven per-instance mutexes + per-block mutexes + 16 page-hash rw-lock shards (`buf0buf.h:2288-2313`, `2385-2388`, `buf0buf.cc:1359-1368`). Anything describing a "buffer pool mutex" is pre-5.7.
2. **The page-hash S-lock, not the block mutex, guards the fast-path fix.** A clean hit never touches the block mutex (`buf0buf.cc:3733-3737`).
3. **Waiting for someone else's read is a spin on acquire-then-immediately-release of the block latch**, not a condvar (`buf0buf.cc:3590-3605`). The initiator holds a *pass-mode* X latch released by a different thread, because a recursive X latch would let the initiator illegally proceed (`buf0buf.cc:4991-5000`).
4. **The `page_id → instance` hash discards the low 6 bits of the page number** so a 64-page extent always lands in one instance (`buf0buf.ic:823-832`) — read-ahead and neighbour-flush both depend on this.
5. **`buf_page_t::list` is one node shared by four lists** (free, withdraw, flush_list, zip_clean), disambiguated only by `state` (`buf0buf.h:1613-1629`).
6. **Instances are created in parallel by up to 8 core-pinned `nice -20` threads**; the comment cites 128 G/16 instances going 10 s → 4 s (`buf0buf.cc:1256-1274`, `1532-1541`).
7. **`io_fix` correctness is *proved*, not asserted ad hoc** — a debug-only `Stateful_latching_rules` helper plus an `io_responsibility_t` naming the single owning thread, with accessors whose names encode their latch requirements (`buf0buf.h:1409-1588`).
8. **Temp-tablespace pages synchronise readers against the flusher with the block mutex, not the rw-lock** (`buf0buf.cc:4194-4206`, `buf0flu.cc:1085-1093`) — which is why `Page_fetch::NORMAL` on a temp space is routed to `Buf_fetch_other` (`buf0buf.cc:4484`).
9. **`buf_page_t` holds a refcounted `fil_space_t*` plus a truncation version**, enabling lazy stale-page discard on DROP/TRUNCATE instead of an eager pool scan (`buf0buf.h:1230-1274`; discard sites `buf0buf.cc:3721-3731`, `buf0lru.cc:322-323`, `buf0flu.cc:1553-1557`, `buf0dblwr.cc:2598-2608`).
10. **`buf_pool->watch` sentinels are distinguished purely by pointer range**, and setting one X-locks *all* page-hash shards — justified as purge-only (`buf0buf.cc:2980-2992`, `3026-3036`). The real page inherits the sentinel's fix count (`buf0buf.cc:4838-4848`).

**LRU / replacement**

11. **Warm-up completely disables young-making**: until the first eviction (`freed_page_clock == 0`), `buf_page_peek_if_too_old` returns false unconditionally (`buf0buf.ic:183-188`). `Pages made young = 0` on a fresh server is correct, not a bug.
12. **The young-making throttle reads a 31-bit-wrapping counter with no latch and says so in a `FIXME`** (`buf0buf.ic:167-172`). A hot page is re-promoted at most once per ~16 % of a pool-turnover of evictions.
13. **`freed_page_clock` is stamped only on MRU insertion, never on midpoint insertion** (`buf0lru.cc:870-873`), so a newly read page starts at 0 (`buf0buf.cc:4789`).
14. **"3/8" is a sysvar default, not a constant.** The denominator is `BUF_LRU_OLD_RATIO_DIV = 1024` (`buf0lru.h:206`) and the default `innodb_old_blocks_pct = 37` maps to **378/1024 ≈ 36.9 %**, not 384/1024 (`ha_innodb.cc:23091-23093`, `buf0lru.cc:1566`).
15. **Two different "minimum LRU length" constants live in two different files**: `BUF_LRU_OLD_MIN_LEN = 512` (`buf0lru.h:59`) gates midpoint insertion; `BUF_LRU_MIN_LEN = 256` (`buf0flu.cc:221`) floors LRU-batch flushing.
16. **`innodb_lru_scan_depth` does *not* bound a user thread's first LRU search** — that is capped by `BUF_LRU_SEARCH_SCAN_THRESHOLD = 100` (`buf0lru.cc:79`, `309`). The sysvar bounds page-cleaner batches (`buf0flu.cc:1543`, `1995`) and the unzip_LRU search (`buf0lru.cc:264`).
17. **`Page_fetch::SCAN` is a caller-declared scan hint** suppressing young-making *and* random read-ahead, used by parallel read (`buf0buf.h:61-64`, `buf0buf.cc:4119`, `4398`, `4535`; `row0pread.cc:348`).
18. **Random read-ahead is OFF by default; linear is ON** (`ha_innodb.cc:23329-23337`). The random threshold is `5 + area/8` = 13 hot pages of 64 (`buf0rea.cc:57-59`).
19. **Linear read-ahead reads sibling page pointers out of the frame with no latch**, accepting garbage: "Even if we read values which are nonsense, the algorithm will work" (`buf0rea.cc:482-489`).

**Free-block acquisition**

20. **Single-page LRU flush still exists** and sits on the user-thread starvation path with **no retry bound** (`buf0lru.cc:630`, `buf0flu.cc:1896-1971`). It is the only flush type requiring `LRU_list_mutex` on entry to `buf_flush_page()` (`buf0flu.cc:1056-1064`).
21. **`buf_LRU_check_size_of_non_data_objects()` can crash the server on purpose**: free + LRU < `curr_size/20` fails a `ut_a` with `ER_IB_BUFFER_POOL_FULL` (`buf0lru.cc:465-471`). At `curr_size/3` it only warns.
22. **`try_LRU_scan` is a plain bool with manual `os_rmb`/`os_wmb`, not an atomic** (`buf0buf.h:2419-2423`, `buf0lru.cc:557-573`).
23. **`buf_LRU_get_free_block` wakes the AIO handlers before scanning**, to avoid self-deadlock where a thread queued a `DO_NOT_WAKE` read and then blocked waiting for a free block for another read (`buf0lru.cc:546-553`).
24. **After 100 failed read attempts for one page, InnoDB calls `ib::fatal` and the server dies** (`buf0buf.cc:299`, `4123-4139`).

**Dirty tracking / checkpoint / WAL — the biggest 8.0-lore deltas**

25. **The flush list is intentionally *not* sorted.** Bounded disorder up to `innodb_buf_flush_list_added_size` (2 MiB of LSN) is permitted, and both the checkpoint LSN and the sync-flush target subtract/add that lag (`buf0flu.h:410-417`, `buf0buf.cc:498-511`, `log0chkp.cc:747`). Nearly all public writing still calls it LSN-ordered.
26. **The WAL barrier is no longer `log_write_up_to()`.** It is `ib::redo::handler->persist_smaller_than(newest_lsn, FULLY_PERSISTED, PAGE_FLUSHING)` (`buf0flu.cc:985-993`); the fast-path guard is justified on CPU grounds, not correctness.
27. **Dirty-page tracking and checkpoint-LSN computation sit behind `Pages_persistence_interface`** (`fil0pages_persistence_interface.h:44`). `buf_flush_insert_into_flush_list` is now reached via `Pages_persistence::page_became_dirty()` (`fil0innodb_pages_persistence.cc:47-49`), and even `buf_flush_page_cleaner_init()` is called from `Pages_persistence::init()` (`:55-61`).
28. **No-redo dirty pages "borrow" an LSN** from the flush-list head, or from `smallest_not_added_lsn()` if empty, then take `max(borrowed, first_nonpersisted_lsn)` as `newest_modification` (`buf0flu.cc:361-383`, `420-463`).

**Doublewrite**

29. **dblwr is a set of files named `#ib_<page_size>_<id>.dblwr`**, with `max(4, 2×instances)` writer instances split by flush type across separate segment queues, plus 512 reserved single-page slots (`buf0dblwr.cc:2772-2776`, `2865`, `77`, `2917-2924`).
30. **The dblwr fsync is skipped entirely under `O_DIRECT`/`O_DIRECT_NO_FSYNC`, and always on Windows** (`buf0dblwr.cc:872-876`, `2286-2290`).
31. **The data-file fsync for a batch happens in the batch-completion callback** (`fil_flush_file_spaces()`, `buf0dblwr.cc:2703`), not at submit time — the segment is only recycled after that.
32. **`DETECT_ONLY` writes 16-byte `(space, page_no, lsn)` records into 8 KiB `.bdblwr` pages** (510/page) and cannot repair, only detect. If a reduced entry carries a *newer* LSN than the full copy, recovery **fatals rather than restore a stale page** (`buf0dblwr.h:260-295`, `buf0dblwr.cc:3148-3159`).
33. **Doublewrite is bypassed when global redo logging is off** (`mtr_t::s_logging.dblwr_disabled()`, `buf0dblwr.cc:2612`), as well as for temp tablespaces and read-only mode.
34. **Pages are encrypted once and the identical ciphertext goes to both files** (`buf0dblwr.cc:2632-2635`) — otherwise the recovery comparison would be meaningless.
35. **The dblwr copy is validated *before* the data-file copy**, because a corrupt dblwr page has an untrustworthy page id (`buf0dblwr.cc:3127-3132`).

**Defaults and observability traps**

36. **`innodb_io_capacity` defaults to 10000, not 200** (`ha_innodb.cc:22234`). Every adaptive-flush formula is scaled by it, so the whole curve is anchored 50× higher than under 8.0.
37. **`innodb_adaptive_hash_index` defaults to OFF, and the help string still claims otherwise** (`ha_innodb.cc:22462-22466`).
38. **`innodb_buffer_pool_instances` defaults to 0 = auto**: `clamp(min(bp_size/(chunk*2), vcpus/4), 1, 64)`, forced to 1 below 1 GiB (`srv0srv.cc:434`, `ha_innodb.cc:4650-4669`).
39. **Reading `srv0srv.cc` for defaults is a trap** — the C initialiser is often overridden by the sysvar default: `srv_flush_neighbors` 1 vs sysvar 0 (`srv0srv.cc:444` vs `ha_innodb.cc:22687`); `srv_use_fdatasync` false vs true (`srv0srv.cc:440` vs `22560`); `dblwr::n_files`/`n_pages` 1/64 vs 2/128 (`buf0dblwr.cc:83-87` vs `22578-22586`).
40. **`SHOW ENGINE INNODB STATUS`'s hit rate is `1000 − 1000×reads/gets`** — miss-derived, so pages created without a read inflate it (`buf0buf.cc:6720-6727`).
41. **Debug builds S-acquire a per-block `debug_latch` on every buffer fix** purely to catch unbalanced fix/unfix (`buf0buf.ic:771-784`), skipped for system-temporary pages.

## 14. Quick contrast crib for the CUBRID write-up

These are the axes where InnoDB and CUBRID's `page_buffer.c` differ most sharply. CUBRID-side claims are **not** verified in this session — they are the questions to answer against CUBRID source, not assertions.

| Axis | InnoDB 26.7 (anchored) | To check in CUBRID |
|---|---|---|
| Replacement policy | Two-sublist LRU, midpoint insertion at old-head, promotion gated by first-access age + eviction-clock distance (`buf0lru.cc:862-908`, `buf0buf.ic:161-203`) | 3 LRU zones + per-tran quota + AOUT victim history |
| Pool partitioning | N instances, extent-aligned page→instance hash (`buf0buf.ic:823-832`) | Single pool + LRU list count / private lists? |
| Descriptor split | `buf_page_t` embedded as first member of `buf_block_t` (`buf0buf.h:1760-1762`) | `PGBUF_BCB` / `PGBUF_HOLDER` / `PGBUF_IOPAGE_BUFFER` |
| Pin counter | atomic `uint32_t buf_fix_count`, no mutex (`buf0buf.ic:758-762`) | `fcnt` under BCB mutex? |
| Latch modes | S / X / SX / none, per-block `rw_lock_t` (`buf0buf.cc:4154-4177`) | READ / WRITE / FLUSH / VICTIM |
| Hash | sharded rw-lock hash, 16 shards, `2×pages` buckets (`buf0buf.cc:1359-1368`) | `pgbuf_hash_table` + hash mutexes |
| Waiting on in-flight read | spin on S-acquire/release of the block latch (`buf0buf.cc:3598-3603`) | condvar / thread entry wait queue? |
| Dirty tracking | per-instance flush_list, **relaxed** LSN order with 2 MiB bound (`buf0flu.h:410-417`) | dirty flag + LSA; ordered list? |
| Checkpoint | fuzzy; LSN *derived* from flush-list tails minus lag (`log0chkp.cc:162-201`) | flush of dirty pages at checkpoint? |
| WAL rule | `persist_smaller_than(newest_lsn, FULLY_PERSISTED)` before write (`buf0flu.cc:985-993`) | `logpb_flush_log_for_wal` before page write |
| Torn-write protection | dblwr files + checksum-based detect and repair; DETECT_ONLY mode (`buf0dblwr.cc:3127-3170`) | DWB (double write buffer) |
| Cleaner threads | coordinator + workers, one slot per instance, LRU pass every tick + adaptive flush_list pass (`buf0flu.cc:2561-2564`, `2695-2719`) | page flush thread / daemon |
| Scan resistance | `old_blocks_time` filter + `Page_fetch::SCAN` hint (`buf0buf.ic:188-199`, `buf0buf.h:61-64`) | zone quotas / `PGBUF_FETCH_MODE`? |
| Online resize | chunked, withdraw list, AHI disabled first (`buf0buf.cc:2190-2269`, `buf0lru.cc:427-447`) | not supported? |
