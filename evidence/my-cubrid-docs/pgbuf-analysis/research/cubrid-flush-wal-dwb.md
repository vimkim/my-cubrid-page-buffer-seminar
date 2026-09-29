# CUBRID Page Buffer — Dirty-Page Management, WAL Coupling, Flushing, Checkpoint, Double Write Buffer

**Repo:** `/home/vimkim/gh/cb/pgbuf-analysis` (CUBRID 11.5.x)
**Commit:** `5cd4f860e` (`git rev-parse --short HEAD`)
**Date:** 2026-08-06
**Primary sources:** `src/storage/page_buffer.c` (17513 lines), `src/storage/page_buffer.h`, `src/storage/double_write_buffer.cpp` (4184 lines), `src/storage/double_write_buffer.hpp`
**Secondary:** `src/storage/file_io.c`, `src/storage/file_io.h`, `src/transaction/log_page_buffer.c`, `src/base/system_parameter.c`, `src/base/perf_monitor.c`, `src/parser/show_meta.c`

All line numbers are from reads at this commit. Claims I could not confirm by reading are marked **UNVERIFIED**.

---

## 1. Dirty tracking

### 1.1 The dirty bit lives in `PGBUF_BCB::flags`

Dirty state is one bit in a single `int` of atomically-updated BCB flags, not a separate field:

```c
/* page_buffer.c:222-241 */
/* bcb flags */
/* dirty: false initially, is set to true when page is modified. set to false again when flushed to disk. */
#define PGBUF_BCB_DIRTY_FLAG                ((int) 0x80000000)
/* is flushing: set to true when someone intends to flush the bcb to disk. dirty flag is usually set to false, but
 * bcb cannot be yet victimized. flush must succeed first. */
#define PGBUF_BCB_FLUSHING_TO_DISK_FLAG     ((int) 0x40000000)
...
/* flag for asynchronous flush request */
#define PGBUF_BCB_ASYNC_FLUSH_REQ           ((int) 0x02000000)
```

Dirty is one of the four flags in `PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK` that disqualify a BCB from victimization, alongside `FLUSHING_TO_DISK`, `VICTIM_DIRECT` and `INVALIDATE_DIRECT_VICTIM` (`page_buffer.c:258-262`).

### 1.2 Setting dirty

`pgbuf_bcb_set_dirty` (`page_buffer.c:15967-15995`) is deliberately hand-rolled rather than going through the generic `pgbuf_bcb_update_flags`, "since it is the most used case and the code should be as optimal as possible" (comment at `15971-15972`). It:

1. CAS-loops on `bcb->flags`, returning early if `PGBUF_BCB_DIRTY_FLAG` is already set (`15978-15982`).
2. `ATOMIC_INC_64 (&pgbuf_Pool.monitor.dirties_cnt, 1)` (`15987`).
3. If the BCB was in `PGBUF_LRU_3_ZONE` and had no other invalidating flag, calls `pgbuf_lru_remove_victim_candidate` — becoming dirty removes it from the victim-candidate count (`15990-15994`).

`pgbuf_bcb_clear_dirty` (`page_buffer.c:16003-16008`) goes through the generic `pgbuf_bcb_update_flags`, which maintains both the per-LRU victim-candidate counters (`15755-15777`) and `dirties_cnt`: it diffs the dirty bit between `old_flags` and `new_flags` and applies `ATOMIC_INC_64 (&pgbuf_Pool.monitor.dirties_cnt, ±1)`, then asserts `0 <= dirties_cnt <= num_buffers` (`15779-15793`).

### 1.3 Where the dirty count lives

`INT64 dirties_cnt;` is the **first** field of `PGBUF_PAGE_MONITOR` (`page_buffer.c:693-695`), reachable as `pgbuf_Pool.monitor.dirties_cnt` (`pgbuf_Pool.monitor` declared at `page_buffer.c:779`). Reset to 0 at init (`1628`, `1773`) and in `pgbuf_initialize_page_monitor` (`13999`). It is the only globally maintained dirty counter; `SHOW PAGE BUFFER STATUS` and `pgbuf_peek_stats` recompute their own by scanning the BCB table instead (see §11).

### 1.4 The public API: `pgbuf_set_dirty` and the `_dirty` unfix variants

`pgbuf_set_dirty` (`page_buffer.c:4874-4905`, debug variant `pgbuf_set_dirty_debug` at `4870`):

1. Optional `pgbuf_is_valid_page_ptr` check when `PGBUF_DEBUG_PAGE_VALIDATION_ALL` (`4879-4885`).
2. `CAST_PGPTR_TO_BFPTR`, `assert (!VPID_ISNULL (&bufptr->vpid))` (`4888-4889`).
3. In `SERVER_MODE` debug builds, page 0 of any volume gets `disk_volheader_check_magic` (`4891-4896`).
4. `pgbuf_set_dirty_buffer_ptr (thread_p, bufptr)` (`4898`).
5. If `free_page == FREE`, `pgbuf_unfix` (`4901-4904`).

`pgbuf_set_dirty_buffer_ptr` (`page_buffer.c:11592-11611`) is where the invariants are asserted:

```c
/* page_buffer.c:11599-11610 */
  pgbuf_bcb_set_dirty (thread_p, bufptr);

  holder = pgbuf_find_thrd_holder (thread_p, bufptr);
  assert (get_latch (&bufptr->atomic_latch) == PGBUF_LATCH_WRITE);
  assert (holder != NULL);
  if (holder != NULL && holder->perf_stat.dirtied_by_holder == 0)
    {
      holder->perf_stat.dirtied_by_holder = 1;
    }

  /* Record number of dirties in statistics */
  perfmon_inc_stat (thread_p, PSTAT_PB_NUM_DIRTIES);
```

So: **marking dirty requires a WRITE latch held by the calling thread** (asserted, debug only). `pgbuf_ordered_set_dirty_and_free` (`page_buffer.c:13744`) is the ordered-fix variant. `pgbuf_set_lsa_as_temporary` (`5369-5379`) also sets dirty.

### 1.5 Is there an assert tying dirty to having logged?

**No hard assert.** The relationship is the *reverse* and it is a release-build-only safety net inside `pgbuf_set_lsa`:

```c
/* page_buffer.c:5022-5028 */
#if defined (NDEBUG)
  /* We expect the page was or will be set as dirty before unfix. However, there might be a missing case to set dirty.
   * It is correct to set dirty here. Note that we have set lsa of the page and it should be also flushed.
   * But we also want to find missing cases and fix them. Make everything sure for release builds.
   */
  pgbuf_set_dirty_buffer_ptr (thread_p, bufptr);
#endif /* NDEBUG */
```

That is, **release builds auto-set dirty when an LSA is set; debug builds deliberately do not**, so that a missing `pgbuf_set_dirty` shows up as a bug in testing. The comment at `4990-4995` explains why `oldest_unflush_lsa` is captured in `pgbuf_set_lsa` and not in `pgbuf_set_dirty`: "some pages are set dirty before an LSA is set."

The converse case (dirty without logging) is only diagnosed under `CUBRID_DEBUG` in `pgbuf_unfix` (`page_buffer.c:3071-3091`), which warns "No logging on dirty pageid = %d" and then fabricates an LSA to silence repeats. In production, a dirty page with a NULL `oldest_unflush_lsa` is simply flushed with an `er_log_debug` note (see §3, step 7).

---

## 2. Page LSA discipline and the head/tail watermark

### 2.1 `FILEIO_PAGE` layout

`struct fileio_page` (`file_io.h:185-193`) is three parts: `FILEIO_PAGE_RESERVED prv` (the header), `char page[1]` (the user area), and `FILEIO_PAGE_WATERMARK prv2` — "system page area. It should be located at the end of page" (`192`). `prv` begins with `LOG_LSA lsa` and continues with `pageid`, `volid`, `ptype`, `pflag`, two reserved INT32s, and `INT64 tde_nonce` — "atomic counter for temp pages, lsa for perm pages" (`file_io.h:166-176`). `struct fileio_page_watermark` is a single `LOG_LSA lsa; /* duplication of prv.lsa */` (`178-182`).

`prv2` is **not** at its declared offset — it must be located via `fileio_get_page_watermark_pos()` = `io_page + (page_size - sizeof (FILEIO_PAGE_WATERMARK))` (`file_io.h:195-199`), with an explicit warning comment at `191`.

Every LSA mutation writes both copies: `fileio_set_page_lsa` does `LSA_COPY` into `prv.lsa` and into the watermark (`file_io.h:220-228`), and `fileio_init_lsa_of_page` / `fileio_reset_page_lsa` NULL both (`201-218`). The sanity test is the equality of the two (excerpt in §8).

### 2.2 `pgbuf_set_lsa`

`pgbuf_set_lsa` (`page_buffer.c:4944-5031`; debug variant `pgbuf_set_lsa_debug` at `4940`) is documented "for the exclusive use of the log and recovery manager" (`4937`). Steps:

1. Optional validation; `assert (lsa_ptr != NULL)` (`4950-4958`).
2. "NOTE: Does not need to hold mutex since the page is fixed" (`4960`).
3. **Refuse** if the page already carries the temp LSA, or the volume is auxiliary (`volid < LOG_DBFIRST_VOLID`, `page_buffer.c:172`) — returns NULL without touching anything (`4969-4973`). Comment: "Don't change LSA of temporary volumes or auxiliary volumes. (e.g., those of copydb, backupdb)."
4. If the volume is a temporary volume, re-stamp the temp LSA and return NULL when the current transaction is active (`4979-4986`).
5. `fileio_set_page_lsa` (both copies) (`4988`).
6. First-time-dirty bookkeeping: if `oldest_unflush_lsa` is NULL, cross-check `lsa_ptr` against `log_Gl.chkpt_redo_lsa` (re-read under `log_Gl.chkpt_lsa_lock`); a page LSA older than the checkpoint redo LSA raises `ER_LOG_CHECKPOINT_SKIP_INVALID_PAGE` and `assert (false)` (`4996-5018`). Then `LSA_COPY (&bufptr->oldest_unflush_lsa, lsa_ptr)` (`5019`).
7. Release-only `pgbuf_set_dirty_buffer_ptr` (§1.5).

### 2.3 The temp LSA sentinel

```c
/* page_buffer.h:260 */
const log_lsa PGBUF_TEMP_LSA = { NULL_LOG_PAGEID - 1, NULL_LOG_OFFSET - 1 };
```

With `NULL_LOG_PAGEID = -1` and `NULL_LOG_OFFSET = -1` (`log_lsa.hpp:65-66`), `PGBUF_TEMP_LSA == (-2, -2)` — distinct from NULL LSA `(-1, -1)`.

Helpers:

- `pgbuf_is_temp_lsa (const log_lsa &)` — `lsa == PGBUF_TEMP_LSA` (`page_buffer.c:17238-17242`).
- `pgbuf_init_temp_page_lsa` — stamps **both** `prv.lsa` and the watermark (`17244-17251`), so a temp page is "sane" by the watermark test.
- `pgbuf_reset_temp_lsa (PAGE_PTR)` — thin wrapper, no dirty marking (`5038-5045`).
- `pgbuf_set_lsa_as_temporary` — stamps temp LSA **and** sets dirty (`5369-5379`). Its header comment (`5360-5367`) says logging on such a page is "not enforced. A warning message is issued if someone logs something."
- `pgbuf_is_lsa_temporary` — true if temp LSA **or** temp volume (`5468-5484`).

Where temp LSAs get applied:

- Reading an existing temp-volume page: if the on-disk LSA is not the temp sentinel, re-stamp it and mark dirty (`page_buffer.c:8513-8521`).
- `NEW_PAGE` fetch: temp volume → temp LSA, permanent volume → NULL LSA (`8552-8559`).
- Volume reset: `disk_manager.c:759` passes `&PGBUF_TEMP_LSA` to `fileio_reset_volume`.

---

## 3. WAL rule enforcement — `pgbuf_bcb_flush_with_wal` walkthrough

`STATIC_INLINE int pgbuf_bcb_flush_with_wal (THREAD_ENTRY *, PGBUF_BCB *, bool is_page_flush_thread, bool *is_bcb_locked)` — `page_buffer.c:10670-10898`. This is the single funnel for every data-page write out of the pool.

The function's own summary (`page_buffer.c:10719-10731`) is worth quoting:

```c
  /* how this works:
   *
   * caller should already have bcb locked. we don't do checks of opportunity or correctness here (that's up to the
   * caller).
   *
   * we copy the page and save oldest_unflush_lsa and then we try to write the page to disk. if writing fails, we
   * "revert" changes (restore dirty flag and oldest_unflush_lsa).
   *
   * if successful, we choose one of the paths:
   * 1. send the page to post-flush to process it and assign it directly (if this is page flush thread and victimization
   *    system is stressed).
   * 2. lock bcb again, clear is flushing status, wake up of threads waiting for flush and return.
   */
```

### Entry state

1. `PGBUF_BCB_CHECK_OWN (bufptr)` — caller **must** hold the BCB mutex (`10691`); `*is_bcb_locked = true` (`10694`).
2. Latch must be `PGBUF_NO_LATCH`, `PGBUF_LATCH_READ`, or `PGBUF_LATCH_WRITE` (`10696-10697`). Notably **flushing under a WRITE latch is allowed** — but only if this thread is the holder, verified in debug builds by walking `thrd_hold_list` and asserting `holder != NULL` (`10698-10717`).
3. `pgbuf_check_bcb_page_vpid` sanity check; failure → `assert(false)` + `ER_FAILED` (`10733-10737`).

### Marking

4. `was_dirty = pgbuf_bcb_mark_is_flushing (thread_p, bufptr)` (`10739`). This sets `FLUSHING_TO_DISK` and **clears `DIRTY` and `ASYNC_FLUSH_REQ`** (`16018-16033`); the header comment (`16011-16013`) explains why: "while the page is flushed to disk, another thread may fix the page and modify it. the new change must be tracked." So a re-dirty during the flush is not lost.
5. `uses_dwb = dwb_is_created () && !is_temp` (`10741`) — temporary volumes never go through the DWB.

### Copying the page (yes — it flushes from a copy)

6. The page is copied out of the BCB into a **stack buffer** `char page_buf[IO_MAX_PAGE_SIZE + MAX_ALIGNMENT]` (`10673`), aligned via `PTR_ALIGN` (`10744`):
   - TDE-encrypted pages: `tde_encrypt_data_page (..., iopage)` writes the ciphertext into the stack buffer (`10747-10755`).
   - Otherwise `memcpy ((void *) iopage, (void *) (&bufptr->iopage_buffer->iopage), IO_PAGESIZE)` (`10758`).
   - If `uses_dwb`, `dwb_set_data_on_next_slot` immediately re-copies from the stack buffer into a DWB slot and sets `iopage = NULL` (`10760-10772`).

### Capturing and releasing

7. `lsa` = current page LSA, `oldest_unflush_lsa` saved, and the BCB's `oldest_unflush_lsa` set to NULL (`10775-10777`).
8. `PGBUF_BCB_UNLOCK (bufptr); *is_bcb_locked = false;` (`10779-10780`) — **the write itself happens with the BCB mutex released.**

### The WAL rule

```c
/* page_buffer.c:10782-10795 */
  if (!LSA_ISNULL (&oldest_unflush_lsa))
    {
      /* confirm WAL protocol */
      /* force log record to disk */
      logpb_flush_log_for_wal (thread_p, &lsa);
    }
  else
    {
      /* if page was changed, the change was not logged. this is a rare case, but can happen. */
      if (!pgbuf_is_temporary_volume (bufptr->vpid.volid))
	{
	  er_log_debug (ARG_FILE_LINE, "flushing page %d|%d to disk without logging.\n", VPID_AS_ARGS (&bufptr->vpid));
	}
    }
```

Note the asymmetry: the *decision* is gated on `oldest_unflush_lsa` (was anything logged for this page?) but the *target* passed to the log manager is the page's **current** LSA — the newest log record touching the page, which is what WAL actually requires.

`logpb_flush_log_for_wal` (`log_page_buffer.c:4161-4189`): if `logpb_need_wal(lsa)`, bump `PSTAT_LOG_NUM_WALS`, enter `LOG_CS`, re-check, then `logpb_flush_pages_direct`. `logpb_need_wal` (`log_page_buffer.c:11254-11267`) is simply `LSA_LE (nxio_lsa, lsa)` where `nxio_lsa = log_Gl.append.get_nxio_lsa()`.

### The write

9. DWB path: `dwb_add_page (thread_p, iopage, &bufptr->vpid, false, &dwb_slot)` (`10811`). If it returns `NO_ERROR` with `dwb_slot == NULL`, the DWB was destroyed concurrently — the code **re-locks the BCB and jumps back to `start_copy_page`** to redo the copy without DWB (`10814-10821`).
10. Non-DWB path (`10824-10837`): `show_status->num_pages_written++`; `write_mode = dwb_is_created() ? FILEIO_WRITE_NO_COMPENSATE_WRITE : FILEIO_WRITE_DEFAULT_WRITE`; `perfmon_inc_stat (PSTAT_PB_NUM_IOWRITES)`; `fileio_write (...)`.

`FILEIO_WRITE_DEFAULT_WRITE` triggers `fileio_compensate_flush` inside `fileio_write` (`file_io.c:4197-4200`), which is the flush-rate token gate plus the `sync_on_nflush` fsync trigger (§4.5). `FILEIO_WRITE_NO_COMPENSATE_WRITE` skips both.

### Error path

```c
/* page_buffer.c:10846-10861 */
  if (error != NO_ERROR)
    {
      PGBUF_BCB_LOCK (bufptr);
      *is_bcb_locked = true;
      pgbuf_bcb_mark_was_not_flushed (thread_p, bufptr, was_dirty);
      LSA_COPY (&bufptr->oldest_unflush_lsa, &oldest_unflush_lsa);
#if defined (SERVER_MODE)
      if (bufptr->next_wait_thrd != NULL)
	{
	  pgbuf_wake_flush_waiters (thread_p, bufptr);
	}
#endif
      return ER_FAILED;
    }
```

`pgbuf_bcb_mark_was_not_flushed` clears `FLUSHING_TO_DISK` and restores `DIRTY` only if it was dirty on entry (`16055-16060`). Note it **overwrites** `oldest_unflush_lsa` unconditionally with the saved value — if a concurrent `pgbuf_set_lsa` re-populated it while the mutex was released, that newer value is clobbered. Whether the restored (older) value is always ≤ the newer one is **UNVERIFIED**; if so the effect is conservative (flushes again earlier) rather than unsafe.

### Success paths and flush waiters

11. Hand-off to post-flush (only when the caller *is* the page flush thread and the victimization system is stressed):

```c
/* page_buffer.c:10865-10876 */
  /* if the flush thread is under pressure, we'll move some of the workload to post-flush thread. */
  if (is_page_flush_thread && (pgbuf_Page_post_flush_daemon != NULL)
      && pgbuf_is_any_thread_waiting_for_direct_victim () && pgbuf_Pool.flushed_bcbs->produce (bufptr))
    {
      /* page buffer maintenance thread will try to assign this bcb directly as victim. */
      pgbuf_Page_post_flush_daemon->wakeup ();
      ... PSTAT_PB_FLUSH_SEND_DIRTY_TO_POST_FLUSH
    }
```

In this branch the BCB is left **unlocked and still marked `FLUSHING_TO_DISK`**; `pgbuf_assign_flushed_pages` clears it later (`15481`) and only then wakes flush waiters (`15484-15487`).

12. Normal branch: re-lock, `pgbuf_bcb_mark_was_flushed` (clears `FLUSHING_TO_DISK`, `16041-16046`), `pgbuf_wake_flush_waiters` if any (`10880-10889`).
13. `PSTAT_PB_FLUSH_PAGE_FLUSHED` (`10894`).

### Flush waiters

Waiting for a flush is expressed as a latch request of the pseudo-mode `PGBUF_LATCH_FLUSH` queued on `bcb->next_wait_thrd`. `pgbuf_wake_flush_waiters` (`page_buffer.c:10907-10957`) walks the wait list, dequeues and wakes **only** `PGBUF_LATCH_FLUSH` waiters, leaving readers/writers queued (`10920-10943`). It then clears the atomic latch's `waiter_exists` bit if `!pgbuf_is_exist_blocked_reader_writer (bcb)` (`10950-10953`), with a comment naming the bug that motivated it: leaving the bit set on an idle BCB "poisons `pgbuf_latch_bcb_upon_fix`'s idle-grant CAS, which force-expects `waiter_exists == false` and never enqueues when `latch_mode == PGBUF_NO_LATCH` -- the next fix then spins forever while holding the bcb mutex (bulk-build CREATE INDEX livelock)" (`10944-10949`). Timed with `PSTAT_PB_WAKE_FLUSH_WAITER` (`10955`).

### 3.1 Synchronous vs. asynchronous: `pgbuf_bcb_safe_flush_internal`

`page_buffer.c:8764-8846` is the safety wrapper all normal callers use. Its own explanation (`8783-8791`) names the two cases where an immediate flush is unsafe: (1) the page is write-latched by someone else — "we cannot know when the latcher makes modifications", handled by setting `PGBUF_BCB_ASYNC_FLUSH_REQ` so the latch holder flushes on unfix; (2) another thread is already flushing — "allowing multiple concurrent flushes is not safe (we cannot guarantee the order of disk writing, therefore it is theoretically possible to write an old version over a newer version of the page)", handled by queueing on the BCB's wait list.

Flow: not dirty → return immediately (`8777-8781`). Then a CAS loop decides `immediate_flush` (not flushing, and latch is NO_LATCH / READ / WRITE-held-by-me) vs. `block` (`8793-8818`). `immediate_flush` → `pgbuf_bcb_flush_with_wal (..., is_page_flush_thread = false, locked)` (`8823`). Otherwise set `ASYNC_FLUSH_REQ` (`8829`) and, if `synchronous`, `pgbuf_block_bcb (..., PGBUF_LATCH_FLUSH, 0, false)` (`8836`).

Two thin wrappers manage the mutex contract: `pgbuf_bcb_safe_flush_force_unlock` (`8708-8720`) and `pgbuf_bcb_safe_flush_force_lock` (`8731-8751`).

The `ASYNC_FLUSH_REQ` flag is honoured on unlatch: `pgbuf_unlatch_bcb_upon_unfix` calls `pgbuf_bcb_safe_flush_force_unlock (..., synchronous = false)` when the flag is set (`page_buffer.c:6809-6825`), swallowing any error with `er_clear()`. A thread holding a page latched long-term can poll with `pgbuf_flush_if_requested` (`3577-3609`), documented for "permanently latched pages ... usually [requested] by checkpoint thread."

### 3.2 Two observations on `pgbuf_bcb_flush_with_wal`

- **Dead `goto`.** `goto copy_unflushed_lsa;` at `10770` targets the label at `10774`, which is the next statement. Harmless, but it means the `if (dwb_slot != NULL)` block at `10767-10771` does nothing beyond `iopage = NULL`.
- **Flushing-flag leak on two early returns.** `pgbuf_bcb_mark_is_flushing` runs at `10739`. The TDE-encryption failure return at `10753` and the `dwb_set_data_on_next_slot` failure return at `10765` both return before the flag is cleared, leaving the BCB with `FLUSHING_TO_DISK` set and `DIRTY` cleared. Such a BCB is permanently non-victimizable (it is in `PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK`) and any thread later blocked on `PGBUF_LATCH_FLUSH` for it is never woken. Both paths need `tde_is_loaded()` plus an allocation/IO failure, so they are rare. Flagging as a real defect, not a documented design choice.

---

## 4. Background flushing

### 4.1 The four page-buffer daemons

Registered by `pgbuf_daemons_init` (`page_buffer.c:17169`):

| Daemon | Thread name | Looper | Body |
|---|---|---|---|
| `pgbuf_Page_maintenance_daemon` | `pgbuf-maintain` | fixed 100 ms (`17091`) | `pgbuf_page_maintenance_execute` (`16930-16943`) |
| `pgbuf_Page_flush_daemon` | `pgbuf-page-flush` | `pgbuf_get_page_flush_interval` (`17109`) | `pgbuf_page_flush_daemon_task::execute` (`16963-17000`) |
| `pgbuf_Page_post_flush_daemon` | `pgbuf-page-post-flush` | backoff array `{1 ms, 10 ms, 100 ms}` (`17128-17133`) | `pgbuf_page_post_flush_execute` (`17005-17019`) |
| `pgbuf_Flush_control_daemon` | `pgbuf-flush-control` | fixed 50 ms (`17162`) | `pgbuf_flush_control_daemon_task::execute` (`17046-17070`) |

All four bail out immediately unless `BO_IS_FLUSH_DAEMON_AVAILABLE ()`.

**Page maintenance** does **not** flush. It does exactly two things (`16938-16942`): `pgbuf_adjust_quotas` (private/shared LRU quota re-tuning, which is where AOUT and activity accounting are consumed — covered by the LRU agent) and `pgbuf_direct_victims_maintenance` (scan lists and assign victims directly).

### 4.2 Page flush daemon wakeup conditions

`pgbuf_get_page_flush_interval` (`page_buffer.c:16908-16926`) reads `PRM_ID_PAGE_BG_FLUSH_INTERVAL_MSECS`: a positive value becomes a timed-wait period, and **0 means `is_timed_wait = false` — "infinite wait"**, so the daemon only ever runs when explicitly woken. The task then loops (`16971-16984`):

```c
      // did not timeout, someone requested flush... run at least once
      bool force_one_run = pgbuf_Page_flush_daemon->was_woken_up ();
      ...
      while (force_one_run || pgbuf_keep_victim_flush_thread_running ())
	{
	  pgbuf_flush_victim_candidates (&thread_ref, prm_get_float_value (PRM_ID_PB_BUFFER_FLUSH_RATIO), &m_perf_track,
					 &stop_iteration);
	  force_one_run = false;
	  if (stop_iteration) break;
	}
```

`pgbuf_keep_victim_flush_thread_running` = "any thread waiting for a direct victim **or** hit ratio low" (`15350-15353`). `pgbuf_is_hit_ratio_low` (`16568-16579`) is `lru_victim_req_cnt > 10 && lru_victim_req_cnt * 1000 > sum(fix_req)` — i.e. it demands better than a 99.9% hit rate before it declares the ratio acceptable.

Wakeup is via `pgbuf_wakeup_page_flush_daemon` (`11619-11638`), which in single-threaded (SA) builds **does the flush inline on the caller's thread** instead.

`PSTAT_PB_FLUSH_SLEEP` measures the idle interval between task invocations (`16990`).

### 4.3 `pgbuf_flush_victim_candidates` walkthrough

`int pgbuf_flush_victim_candidates (THREAD_ENTRY *, float flush_ratio, PERF_UTIME_TRACKER *, bool *stop)` — `page_buffer.c:3818-4119`.

1. `er_set (ER_NOTIFICATION_SEVERITY, ..., ER_LOG_FLUSH_VICTIM_STARTED, 0)` (`3856`) — every invocation emits a notification into the server error log.
2. Debug builds assert that only one thread ever calls this (`page_flush_thread == thread_p`, `3862-3873`).
3. `pgbuf_compute_lru_vict_target (&lru_sum_flush_priority)` (`3879`).
4. `lru_victim_req_cnt = ATOMIC_TAS_32 (&pgbuf_Pool.monitor.lru_victim_req_cnt, 0)` — read-and-reset; `fix_req_cnt = pgbuf_monitor_sum_fix_req (true)`; `lru_miss_rate = victim_req / fix_req` (0 on counter overflow) (`3887-3898`).
5. `cfg_check_cnt = num_buffers * flush_ratio` (`3900`).
6. Boost: `lru_dynamic_flush_adj = clamp(1 + (PGBUF_FLUSH_VICTIM_BOOST_MULT - 1) * lru_miss_rate, 1, 10)` with `PGBUF_FLUSH_VICTIM_BOOST_MULT = 10` (`305`, `3909-3910`). **Boost is disabled while a checkpoint is running** — "since checkpoint is already flushing pages we expect some of the victim candidates are already flushed by checkpoint" (`3905-3916`).
7. `check_count_lru = MIN (cfg_check_cnt * adj, (200 * 1024 * 1024) / DB_PAGESIZE)` — hard cap of 200 MB worth of BCBs examined per pass (`3918-3920`).
8. **Collect** via `pgbuf_get_victim_candidates_from_lru` (`3737-3807`), described below. Zero candidates → set `*stop` and return; the comment explains the semantics: "if [collection] failed to provide candidates, it means we already flushed enough. give threads looking for victims a chance to find them before looping again" (`3932-3940`).
9. Wake the log flush daemon (or `logpb_force_flush_pages` in SA mode) — "we need log up to date to be able to flush pages" (`3942-3952`).
10. **Sort** by `(volid, pageid)` if `data_buffer_sequential_victim_flush` (default true): `qsort (..., pgbuf_compare_victim_list)` (`3954-3957`). The comparator (`3709-3727`) is volid-major, pageid-minor — so the flush is issued in physical file order per volume.
11. `pgbuf_Pool.is_flushing_victims = true` (`3960`) — checkpoint waits on this (§5).
12. `PSTAT_PB_FLUSH_COLLECT` / `PSTAT_PB_FLUSH_COLLECT_PER_PAGE` timings (`3967-3978`).
13. **Flush loop** (`3986-4054`), per candidate, under the BCB mutex:
    - Skip if the VPID changed, not dirty any more, or already flushing → `num_skipped_already_flushed` (`3996-4003`).
    - Skip if it left the LRU victim zone or is now fixed → `num_skipped_fixed_or_hot` (`4005-4011`).
    - **WAL gate:** `if (logpb_need_wal (&bufptr->...prv.lsa))` → skip, track the **maximum** such LSA in `lsa_need_wal`, bump `num_skipped_need_wal`, and `log_wakeup_log_flush_daemon()` (`4013-4028`).
    - If `PGBUF_NEIGHBOR_PAGES > 1` → `pgbuf_flush_page_and_neighbors_fb` (which releases the mutex itself); else `pgbuf_bcb_flush_with_wal (..., is_page_flush_thread = true, ...)` then unlock (`4030-4043`).
    - Any error aborts the whole pass via `goto end` (`4044-4052`).
14. Skip counters recorded as `PSTAT_PB_NUM_SKIPPED_FLUSH` plus the three detailed breakdowns; `PSTAT_PB_FLUSH_FLUSH` / `_PER_PAGE` timings (`4056-4076`).
15. **One retry for WAL starvation** (`4080-4097`):

```c
  if (pgbuf_is_any_thread_waiting_for_direct_victim () && victim_count != 0 && count_need_wal == victim_count)
    {
      /* log flush thread did not wake up in time. we must make sure log is flushed and retry. */
      if (repeated) { assert (LSA_LT (&save_lsa_need_wal, &lsa_need_wal)); }
      else { repeated = true; save_lsa_need_wal = lsa_need_wal;
             logpb_flush_log_for_wal (thread_p, &lsa_need_wal); goto repeat; }
    }
```

16. `is_flushing_victims = false`; `ER_LOG_FLUSH_VICTIM_FINISHED` notification; `perfmon_add_stat (PSTAT_PB_NUM_FLUSHED, total_flushed_count)` (`4099-4116`).

### 4.4 Candidate gathering, and the direct-victim side effect

`pgbuf_get_victim_candidates_from_lru` (`page_buffer.c:3737-3807`):

- Iterates all `PGBUF_TOTAL_LRU_COUNT` lists, skipping any with `lru_victim_flush_priority_per_lru[lru_idx] <= 0` (`3756-3761`).
- Per-list budget is proportional to that priority: `check_count_this_lru = MAX (priority * check_count / lru_sum_flush_priority, 1)` (`3764-3765`).
- Holds the **LRU list mutex** (not BCB mutexes) while walking from `bottom` upward via `prev_BCB`, stopping when the BCB leaves the LRU victim zone or the budget is exhausted (`3769-3772`).
- **Only dirty BCBs become candidates** — they are recorded as `{bufptr, vpid}` pairs in the preallocated `pgbuf_Pool.victim_cand_list` (`3774-3780`), which is `num_buffers` entries long (`1747-1748`).
- **Clean BCBs get handed straight to a waiting thread**, at most once per call (`try_direct_assign`), gated by `pgbuf_is_any_thread_waiting_for_direct_victim() && pgbuf_is_bcb_victimizable(...) && PGBUF_BCB_TRYLOCK == 0`, counted as `PSTAT_PB_VICTIM_ASSIGN_DIRECT_SEARCH_FOR_FLUSH` (`3781-3794`). The comment calls this "handling a rare case when there are rare direct victim waiters although there are plenty victims" (`3747-3748`).

**Yes — flushing a page can directly feed a waiting thread**, by two routes: (a) the clean-BCB direct assignment above, and (b) the post-flush hand-off in `pgbuf_bcb_flush_with_wal` (`10867-10876`) feeding `pgbuf_Pool.flushed_bcbs`, a `lockfree::circular_queue<PGBUF_BCB *>` of `PGBUF_FLUSHED_BCBS_BUFFER_SIZE = 8 * 1024` entries (`751`, `1806`).

`pgbuf_assign_flushed_pages` (`15431-15493`) drains that queue. Per BCB it declines assignment when any victim-invalidating flag *other than* `FLUSHING_TO_DISK` is set, when it is fixed, when it is no longer in the LRU victim zone, or when it belongs to an under-quota private LRU ("give it a chance", `15463`). Regardless of the outcome it always clears `FLUSHING_TO_DISK` (`15481`) and wakes flush waiters (`15484-15487`).

### 4.5 Neighbor flush

`PGBUF_NEIGHBOR_PAGES` is `prm_get_integer_value (PRM_ID_PB_NEIGHBOR_FLUSH_PAGES)` (`311-312`), capped by `PGBUF_MAX_NEIGHBOR_PAGES = 32` (`310`). `pgbuf_flush_page_and_neighbors_fb` (`11750-…`) puts the target page at the centre of `pgbuf_Flush_helper` and walks outward alternating forward/backward, aborting on a page that is not cached, is already flushing, or is latched above READ (`11799-11909`). When `data_buffer_neighbor_flush_nondirty` is on it makes a second pass willing to include clean neighbors (`11819-11829`, `11911-…`). Each collected page goes through `pgbuf_flush_neighbor_safe` (`12080-12120`), which re-validates VPID / flushing / latch and then flushes — with a candid comment: `/* flush even if it is not dirty. todo: is this necessary? */` (`12105`).

### 4.6 Flush rate control — the token bucket

This lives in `file_io.c`, driven by the `pgbuf-flush-control` daemon.

- `fileio_compensate_flush (thread_p, fd, npage)` (`file_io.c:626-668`) runs on every `FILEIO_WRITE_DEFAULT_WRITE`: acquire `npage` tokens, then increment a global flushed-page counter and, if it exceeds `sync_on_nflush`, reset it and `fileio_synchronize_all` (`648-666`).
- `fileio_flush_control_get_token` (`751-829`) waits on a condvar for up to 10 rounds. **Threads holding `LOG_CS` are exempt** — they account their pages to `fc_Stats.num_log_pages` and return immediately without waiting (`771-774`, `783-790`, `808-812`), so log flushing is never throttled by data-page tokens. Waiting time is charged to `PSTAT_PB_COMPENSATE_FLUSH` (`822`).
- `fileio_flush_control_add_tokens` (`838-894`), called every 50 ms by the daemon with the elapsed µs (`page_buffer.c:17063-17069`), refills the bucket:
  - `adaptive_flush_control = true` (default): `gen_tokens = MAX (fileio_flush_control_get_desired_rate (tb), FILEIO_MIN_FLUSH_PAGES_PER_SEC * diff_usec / 1e6)` (`869-871`).
  - `false`: `gen_tokens = max_flush_pages_per_second * diff_usec / 1e6` (`876`).
  - Publishes `PSTAT_FC_NUM_PAGES`, `PSTAT_FC_NUM_LOG_PAGES`, `PSTAT_FC_TOKENS` (`861-863`), then `pthread_cond_broadcast` (`889`).
- `fileio_flush_control_get_desired_rate` (`900-…`) is the coupling point back into the page buffer: `int dirty_rate = pgbuf_flush_control_from_dirty_ratio ();` (`906`).

`pgbuf_flush_control_from_dirty_ratio` (`page_buffer.c:14788-14821`) targets **half the pool dirty**:

```c
  int crt_dirties_cnt = (int) pgbuf_Pool.monitor.dirties_cnt;
  int desired_dirty_cnt = pgbuf_Pool.num_buffers / 2;
  ...
  adapt_flush_rate = dirties_above_desired_cnt * dirties_above_desired_cnt / total_above_desired_cnt;   /* quadratic */
  ...
  adapt_flush_rate += diff * crt_dirties_cnt / pgbuf_Pool.num_buffers;                                  /* growth term */
```

It keeps `prev_dirties_cnt` in a **function-local `static int`** (`14791`) — fine only because a single daemon calls it.

---

## 5. Checkpoint flushing

### 5.1 `pgbuf_flush_checkpoint`

`int pgbuf_flush_checkpoint (THREAD_ENTRY *, const LOG_LSA *flush_upto_lsa, const LOG_LSA *prev_chkpt_redo_lsa, LOG_LSA *smallest_lsa, int *flushed_page_cnt)` — `page_buffer.c:4133-4264`. Contract (`4129-4131`): flush every dirty unfixed page whose LSA is below `flush_upto_lsa`, and report the smallest `oldest_unflush_lsa` among the pages **not** flushed — which becomes the next checkpoint's redo LSA.

1. `logpb_flush_log_for_wal (thread_p, flush_upto_lsa)` — "Things must be truly flushed up to this lsa" (`4155-4156`).
2. `LSA_SET_NULL (smallest_lsa)` (`4157`).
3. Use the singleton `pgbuf_Pool.seq_chkpt_flusher`, copy `flush_upto_lsa` into it (`4159-4162`).
4. `pgbuf_Pool.is_checkpoint = true` (`4169`).
5. **Scan the whole BCB table by index** — `for (bufid = 0; bufid < pgbuf_Pool.num_buffers; bufid++)` (`4172`). This is *not* LRU-ordered; checkpoint sweeps the entire pool.
6. Collection filter under the BCB mutex (`4197-4206`):

```c
      if (!pgbuf_bcb_is_dirty (bufptr)
	  || (!LSA_ISNULL (&bufptr->oldest_unflush_lsa) && LSA_GT (&bufptr->oldest_unflush_lsa, flush_upto_lsa))
	  || pgbuf_is_temporary_volume (bufptr->vpid.volid))
	{
	  PGBUF_BCB_UNLOCK (bufptr);
	  continue;
	}
```

   So the ordering key is **`oldest_unflush_lsa`**, and temporary volumes are excluded outright. A dirty page with a NULL `oldest_unflush_lsa` (dirtied without logging) is *included*.
7. Consistency check against the previous checkpoint: `oldest_unflush_lsa < prev_chkpt_redo_lsa` raises `ER_LOG_CHECKPOINT_SKIP_INVALID_PAGE` and `assert (false)` (`4208-4220`) — the same invariant `pgbuf_set_lsa` guards at `4998-5016`.
8. Batching: when `collected_bcbs >= seq_flusher->flush_max_size`, `qsort (f_list, ..., pgbuf_compare_victim_list)` (by volid/pageid) then `pgbuf_flush_chkpt_seq_list`, and reset the collector (`4174-4194`). A final partial batch is flushed after the loop (`4238-4248`).
9. Shutdown check inside the collection loop resets `is_checkpoint` and returns `ER_FAILED` (`4229-4235`).

`flush_max_size` is set once at pool init: `cnt = MIN ((int) (0.25f * num_buffers), 65536)` (`page_buffer.c:1761-1770`), and `burst_mode = true` (`14595`) — so **checkpoint always flushes in burst mode**, never the one-page-then-sleep mode.

### 5.2 `PGBUF_SEQ_FLUSHER` and rate control

`struct pgbuf_seq_flusher` (`page_buffer.c:674-690`) holds `flush_list`, `flush_upto_lsa` ("newest of the oldest LSA record of the pages which will be written to disk", `677`), the interval accounting (`control_intervals_cnt`, `control_flushed`, `interval_msec`), the list cursor (`flush_max_size`, `flush_cnt`, `flush_idx`, `flushed_pages`), `flush_rate`, and `burst_mode`. Its header comment (`668-673`) defines the scheme: "Flush rate control is achieved by breaking each 1 second into intervals, and attempt to flush an equal number of pages in each interval. Compensation is applied across all intervals in one second to achieve overall flush rate. In each interval, the pages are flushed either in burst mode or equally time spread during the entire interval."

`pgbuf_flush_chkpt_seq_list` (`4275-4362`) sets the pacing:

```c
  sleep_msecs = prm_get_integer_value (PRM_ID_LOG_CHECKPOINT_SLEEP_MSECS);
  chkpt_flush_rate = (sleep_msecs > 0) ? 1000.0f / sleep_msecs : 1000.0f;     /* 4293-4301 */
  flush_interval = (int) (1000.0f * PGBUF_CHKPT_BURST_PAGES / chkpt_flush_rate);  /* 4303 */
```

with `PGBUF_CHKPT_BURST_PAGES = 16`, `PGBUF_CHKPT_MIN_FLUSH_RATE = 50`, `PGBUF_CHKPT_MAX_FLUSH_RATE = 1200` (`page_buffer.c:321-326`). Default `checkpoint_sleep_msecs = 1` → rate 1000 pages/s, interval 16 ms.

Before each interval it **yields to the victim flusher**:

```c
/* page_buffer.c:4331-4337 */
      wait_victims = 0;
      while (pgbuf_Pool.is_flushing_victims == true && wait_victims < WAIT_FLUSH_VICTIMS_MAX_MSEC)
	{
	  /* wait 100 micro-seconds */
	  thread_sleep (0.1f);
	  wait_victims += 0.1f;
	}
```

`WAIT_FLUSH_VICTIMS_MAX_MSEC = 1500.0f` (`4279`) — so checkpoint can stall up to 1.5 s per interval while the victim flusher owns the IO path. After each interval, it sleeps the unused remainder (`4351-4354`).

### 5.3 `pgbuf_flush_seq_list`

`page_buffer.c:4383-4628`. Per interval:

- `flush_per_interval` is derived from `flush_rate`, the interval count, and `control_flushed` compensation (`4419-4448`), then floored at `(PGBUF_CHKPT_MIN_FLUSH_RATE * interval_msec) / 1000` (`4450-4451`).
- **Sequentiality heuristic** (`4473-4480`): if the next entry in the sorted list is not `pageid + 1`, set `flush_if_already_flushed = false` — "prefer sequentiality to an unnecessary flush; skip already flushed page if is the last in list or if there is already a gap due to missing next page." So mid-run pages are re-flushed to preserve one long sequential write; run-boundary pages are not.
- Drop the entry if the VPID changed, it is no longer dirty, or (when not preserving a run) its `oldest_unflush_lsa` moved past `flush_upto_lsa` (`4485-4492`).
- `pgbuf_bcb_safe_flush_force_lock (..., synchronous = true)` (`4495`). If afterwards `oldest_unflush_lsa` is still ≤ `flush_upto_lsa`, **flush again** via `pgbuf_bcb_safe_flush_internal` (`4497-4518`), with an honest comment: "I am not sure if this is really possible... It may seem that many planets should align, but let's be conservative and flush again."
- For pages that were **not** flushed, accumulate `chkpt_smallest_lsa = min (chkpt_smallest_lsa, oldest_unflush_lsa)` (`4544-4549`) — this is the value returned to the log manager.
- Time-limit break sets `*time_rem = -1` (`4559-4568`). Non-burst mode sleeps between pages, but only when the computed sleep exceeds `1000 / PGBUF_CHKPT_MAX_FLUSH_RATE` ms (`4570-4587`).
- Interval bookkeeping for the 1-second compensation window (`4596-4618`).

### 5.4 Callers on the log side

- **Main checkpoint:** `logpb_checkpoint` (`log_page_buffer.c`) does `logpb_flush_pages_direct` (`6985`), appends the `LOG_START_CHKPT` record and takes `newchkpt_lsa` (`6988-6995`), snapshots `log_Gl.hdr.chkpt_lsa` / `log_Gl.chkpt_redo_lsa` under `chkpt_lsa_lock` (`6980-6983`), reflects unique stats (`7005`), then:

```c
/* log_page_buffer.c:7010-7021 */
  detailed_er_log ("logpb_checkpoint: call pgbuf_flush_checkpoint()\n");
  if (pgbuf_flush_checkpoint (thread_p, &newchkpt_lsa, &chkpt_redo_lsa, &tmp_chkpt.redo_lsa, &flushed_page_cnt) !=
      NO_ERROR)
    { goto error_cannot_chkpt; }

  detailed_er_log ("logpb_checkpoint: call fileio_synchronize_all()\n");
  if (fileio_synchronize_all (thread_p) != NO_ERROR)
    { goto error_cannot_chkpt; }
```

  `tmp_chkpt.redo_lsa` (the `smallest_lsa` out-param) becomes the checkpoint's redo LSA, defaulting to `newchkpt_lsa` if nothing was left unflushed (`7025-7030`), and also advances `log_Gl.flushed_lsa_lower_bound` (`7032-7041`).
- **SA-mode archive removal:** `log_page_buffer.c:6277` calls it with `prev_chkpt_redo_lsa = NULL` to decide whether archives can be removed.
- `log_page_buffer.c:10700` — a third call site with NULL prev-redo.

---

## 6. Flush-all variants

`pgbuf_flush_all_helper (thread_p, volid, is_unfixed_only, is_set_lsa_as_null)` (`page_buffer.c:3611-3652`) is the shared body: full BCB-table scan, a cheap lock-free dirty/volid pre-filter (`3621-3624`), then re-check under the BCB mutex including `get_fcnt (&bufptr->atomic_latch) > 0` for the unfixed-only variants (`3626-3633`); optional `fileio_init_lsa_of_page` before flushing (`3635-3639`); `pgbuf_bcb_safe_flush_force_unlock (..., synchronous = true)` with best-effort error handling (`3641-3648`).

| Wrapper | Line | `is_unfixed_only` | `is_set_lsa_as_null` |
|---|---|---|---|
| `pgbuf_flush_all` | 3664-3668 | false | false |
| `pgbuf_flush_all_unfixed` | 3680-3684 | true | false |
| `pgbuf_flush_all_unfixed_and_set_lsa_as_null` | 3697-3701 | true | true |

All three are documented "Its use is recommended by only the log and recovery manager." Actual callers:

- Recovery: `log_recovery.c:930`, `:3936`, `:4996` (all `pgbuf_flush_all(NULL_VOLID)`).
- Boot/shutdown: `boot_sr.c:5105`, `:5137`.
- Log manager: `log_manager.c:1825`, `:5460` (`_unfixed`), `:8928`, `:8943` (`_unfixed_and_set_lsa_as_null`), `:8963`, `:9212`.
- Disk/volume operations: `disk_manager.c:730`, `:779`, `:830`.

Other entry points:

- `pgbuf_flush (pgptr, free_page)` (`3514-3527`) — wraps `pgbuf_flush_with_wal` and carries a warning from its own author: "caller flushes page but does not really care if page really makes it to disk. or doesn't know what to do in that case... I recommend against using it" (`3517-3518`).
- `pgbuf_flush_with_wal (pgptr)` (`3537-3567`) — asserts the caller holds at least a READ latch and is a registered holder (`3556`), then `pgbuf_bcb_safe_flush_force_unlock (..., true)`.
- `pgbuf_flush_if_requested (page)` (`3577-3609`) — for long-latched pages; flushes asynchronously only if `ASYNC_FLUSH_REQ` is set.
- `pgbuf_rv_flush_page` (`14831-…`) — a recovery redo handler (`RVPGBUF_FLUSH_PAGE`) that fixes a VPID and flushes it, because "Some changes must be flushed immediately to provide consistency, in case server crashes again during recovery" (`14825-14826`). Dump routine at `14869`.

There is only **one** `PGBUF_SEQ_FLUSHER` instance in the pool (`seq_chkpt_flusher`, `page_buffer.c:777`); the victim flusher uses the plain `victim_cand_list` array instead.

---

## 7. Double Write Buffer

### 7.1 Sizes and geometry

`double_write_buffer.cpp:48-55` fixes the geometry limits: `DWB_SLOTS_HASH_SIZE 1000`, `DWB_SLOTS_FREE_LIST_SIZE 100`, and — annotated "These values must be power of two" — `DWB_MIN_SIZE (512 * 1024)`, `DWB_MAX_SIZE (32 * 1024 * 1024)`, `DWB_MIN_BLOCKS 1`, `DWB_MAX_BLOCKS 32`.

`dwb_load_buffer_size` (`769-785`): `double_write_buffer_size == 0` → DWB disabled; otherwise `dwb_power2_ceil` into `[512K, 32M]`. `dwb_load_block_count` (`795-811`): `double_write_buffer_blocks == 0` → disabled; otherwise power-of-2 in `[1, 32]`.

`dwb_create_internal` (`1164-1254`):

```c
  num_pages = double_write_buffer_size / IO_PAGESIZE;      /* 1184 */
  num_block_pages = num_pages / num_blocks;                /* 1185 */
  /* Create and open DWB volume first */
  vdes = fileio_format (thread_p, boot_db_full_name (), dwb_volume_name, LOG_DBDWB_VOLID, num_block_pages, true,
			false, false, IO_PAGESIZE, 0, false);    /* 1193-1194 */
  /* Needs to flush dirty page before activating DWB. */
  fileio_synchronize_all (thread_p);                       /* 1201 */
```

**The DWB volume on disk is only `num_block_pages` long — one block, not the whole buffer.** Every block flush writes to page offset 0 (`fileio_write_pages (..., dwb_Global.vdes, block->write_buffer, 0, ...)`, `2329`). The in-memory buffer holds `num_blocks` blocks; the disk file is a single-block staging area reused each flush. With defaults (2 MB / 2 blocks, 16 KB pages) that is 64 pages in memory per block and a 1 MB `_dwb` file.

`log2_num_block_pages` is computed with floating-point `log()` (`1214`).

### 7.2 `position_with_flags` — one 64-bit word for everything

One `UINT64 volatile position_with_flags` (`262-278`) encodes everything, partitioned at `71-86`: `DWB_POSITION_MASK 0x000000003fffffff` (low 30 bits — the global slot position), `DWB_CREATE 0x0000000040000000`, `DWB_MODIFY_STRUCTURE 0x0000000080000000`, and `DWB_BLOCKS_STATUS_MASK 0xffffffff00000000` (high 32 bits — per-block "write started").

Block bit *b* is `1ULL << (63 - b)` (`106-120`) — hence `DWB_MAX_BLOCKS = 32`. Position → block: `position >> log2_num_block_pages` (`102-103`); position within block: `position & (num_block_pages - 1)` (`156-157`).

### 7.3 Write path: pgbuf → DWB

Two entry chains reach `dwb_add_page`:

**A. Page buffer flush** (`page_buffer.c`):
```
pgbuf_bcb_flush_with_wal
  → uses_dwb = dwb_is_created () && !is_temp                        (10741)
  → dwb_set_data_on_next_slot (thread_p, iopage, false, false, &dwb_slot)   (10762)
       → dwb_acquire_next_slot (can_wait = false)                   (dwb 2695 → 2468)
       → dwb_set_slot_data  (memcpy page into slot->io_page)        (dwb 2709 → 2612)
  → [unlock bcb, logpb_flush_log_for_wal]                           (10779-10787)
  → dwb_add_page (thread_p, iopage /* NULL */, &bufptr->vpid, false, &dwb_slot)  (10811)
```
Note `can_wait = false` at step `10762`: if no slot is available the BCB stays locked and `dwb_slot` is NULL, and the subsequent `dwb_add_page` re-runs `dwb_set_data_on_next_slot` with `can_wait = true` (`dwb 2743-2755`) — that is where the caller can block, *after* the BCB mutex was released.

**B. Everyone else** — `fileio_write_or_add_to_dwb` (`file_io.c:4008-4060`): if `dwb_is_created()` and the descriptor belongs to a **permanent** volume, stamp `prv.volid`/`prv.pageid` and `dwb_add_page`; otherwise write directly. Callers include volume format/expand and copy paths (`file_io.c:1906`, `2405`, `2425`, `2606`, `2815`, `2834`, `2897`). In `CS_MODE` the whole DWB branch is compiled out (`4057-4058`).

`dwb_acquire_next_slot` (`2468-2600`) advances the global position with a CAS loop. When the position lands on slot 0 of a block whose write-started bit is still set, it must wait (`2531-2564`):

```c
	  /*
	   * The previous iteration didn't finished, needs to wait, in order to avoid buffer overwriting.
	   * Should happens relative rarely, except the case when the buffer consist in only one block.
	   */
	  error_code = dwb_wait_for_block_completion (thread_p, current_block_no);
```

That is the DWB's back-pressure: with `double_write_buffer_blocks = 1` every wrap blocks.

`dwb_set_slot_data` (`2612-2634`) copies the page, `assert (fileio_is_page_sane (io_page_p, IO_PAGESIZE))` (`2629`), records `slot->lsa` and `slot->vpid` from the page header.

### 7.4 Slot hashing and same-page dedup

`dwb_add_page` (`2727-2829`):

1. `dwb_slots_hash_insert (thread_p, vpid, dwb_slot, &inserted)` (`2762`).
2. If not inserted, **invalidate this slot** so the same page is not written twice from one block (`2768-2773`): `VPID_SET_NULL (&dwb_slot->vpid); fileio_initialize_res (...)`.
3. `count_wb_pages = ATOMIC_INC_32 (&block->count_wb_pages, 1)`; `assert_release (count_wb_pages <= DWB_BLOCK_NUM_PAGES)` (`2780-2781`).
4. Block full → wake `dwb_flush_block_daemon` and return (`2803-2814`), or flush inline via `dwb_flush_block (thread_p, block, false, NULL)` when no daemon exists / SA mode (`2818`).

The hash is a `cubthread::lockfree_hashmap<VPID, dwb_slots_hash_entry>` (`258`, `279`) with `DWB_SLOTS_HASH_SIZE = 1000` buckets. `dwb_slots_hash_insert` (`1380-1464`) resolves collisions by LSA:

- Existing slot has a **newer** LSA → keep the old entry, unlock, return (`1398-1407`). ("The older slot is better than mine" — the log message text is misleading; the code keeps the entry with the higher LSA.)
- **Equal** LSAs → still replace, with the reasoning at `1410-1413`: "We are in 'flushing to disk without logging' case. The page was modified but not logged. We have to flush this version since is the latest one." If the old slot is in the **same block**, it is invalidated in place (`1414-1423`); if in a different block, debug code asserts the older block flushes first by comparing `(version, block_no)` (`1426-1442`).
- `slot->ensure_metadata` is OR-ed forward so a metadata-sync request survives replacement (`1447`).

### 7.5 Block flush: exact IO and fsync order

`dwb_flush_block (thread_p, block, file_sync_helper_can_flush, out_position)` — `2192-2458`. "The block pages can't be modified by others during flush" (`2190`).

1. `ATOMIC_INC_32 (&dwb_Global.blocks_flush_counter, 1); assert (... <= 1)` — **only one block flushes at a time** (`2217-2219`).
2. `dwb_block_create_ordered_slots` — sort the block's slots by VPID (`2222`).
3. Dedup adjacent equal VPIDs in the sorted array, invalidating the older (`2230-2254`), OR-ing `ensure_metadata` forward (`2253`).
4. Debug WAL cross-check (`2257-2264`): a slot still satisfying `logpb_need_wal (&s1->io_page->prv.lsa)` is tolerated only if `log_Gl.append.get_nxio_lsa ()` is NULL — i.e. `assert (LSA_ISNULL (&nxio_lsa))`, "Check whether log buffer pool was destroyed."
5. Wait for the previous block's `file_sync_helper_block` to drain — sleeping 1 ms per round if the helper daemon exists, otherwise doing the helper's fsyncs itself (`2276-2306`). Timed as `PSTAT_DWB_WAIT_FILE_SYNC_HELPER_TIME_COUNTERS` (`2321`).
6. **Write the DWB file:** `fileio_write_pages (dwb_Global.vdes, block->write_buffer, page 0, count_wb_pages, IO_PAGESIZE, FILEIO_WRITE_NO_COMPENSATE_WRITE)` (`2329-2330`), then `perfmon_add_stat (PSTAT_PB_NUM_IOWRITES, block->count_wb_pages)` (`2339`).
7. **fsync the DWB file:** `fileio_synchronize (dwb_Global.vdes, dwb_Volume_name, /* ensure_metadata */ false)` (`2341`). This is the durability point that makes the copies trustworthy.
8. **Write the home locations:** `dwb_write_block (...)` (`2351-2352`), detailed below.
9. **fsync each data volume** that received pages (`2362-2402`): skip volumes the helper already flushed (`num_pages == 0`, `2367-2371`); leave volumes with more than `sync_on_nflush / 2` pages to the helper when it is available (`2359`, `2374-2382`); claim ownership with `ATOMIC_CAS_32 (&flushed_status, VOLUME_NOT_FLUSHED, VOLUME_FLUSHED_BY_DWB_FLUSH_THREAD)` (`2389-2394`); then `fileio_synchronize (vdes, NULL, flush_volumes_info[i].metadata)` (`2399`).
10. `block->all_pages_written = true` (`2405`); optional `perfmon_db_flushed_block_volumes` (`2407-2410`).
11. Reset: `count_wb_pages = 0`, `version++` (`2416-2417`); CAS-clear the block's write-started bit (`2420-2428`); CAS-advance `next_block_to_flush` (`2431-2438`); `dwb_signal_block_completion` to release waiters (`2441`); `blocks_flush_counter--` (`2448`); `PSTAT_DWB_FLUSH_BLOCK_TIME_COUNTERS` (`2455`).

`dwb_write_block` (`2008-2179`):

- Iterates the VPID-sorted slots, skipping invalidated (NULL-VPID) entries (`2039-2043`).
- Groups consecutive pages by volume, registering each volume in `block->flush_volumes_info` via `dwb_add_volume_to_block_flush_area` (`2048-2071`).
- `fileio_write (last_written_vol_fd, slot.io_page, vpid->pageid, IO_PAGESIZE, FILEIO_WRITE_NO_COMPENSATE_WRITE)` (`2086-2087`) — **no per-write fsync and no token throttling** for the home-location writes.
- After every `sync_on_nflush` writes (or at a volume boundary), it tries to hand the block to the file-sync helper: `ATOMIC_CAS_ADDR (&dwb_Global.file_sync_helper_block, NULL, block)` then wake the helper (`2102-2119`), also charging `PSTAT_PB_NUM_IOWRITES`.
- Finally deletes the block's hash entries — after all writes, deliberately: "Write the whole slots data first and then remove it from hash. Is better to do in this way... While the current transaction has delays caused by fileio_write, the concurrent transaction still can access the data from memory instead disk" (`2023-2027`, deletion at `2153-2176`, timed as `PSTAT_DWB_DECACHE_PAGES_AFTER_WRITE`).

`dwb_file_sync_helper` (`3776-…`) is the parallel fsync worker: it CAS-claims each volume's `flushed_status` (`3818-3824`), only fsyncs volumes with at least `sync_on_nflush` pages or whose `all_pages_written` is set (`3830-3863`), and otherwise loops waiting.

`dwb_flush_next_block` (`3467-3513`) is the daemon body; it flushes only a block whose `count_wb_pages == DWB_BLOCK_NUM_PAGES` (`dwb_get_next_block_for_flush`, `2660-2674`) and loops until no full block remains. The daemon task is gated on `double_write_buffer_enable_flush_thread` (`4045`).

### 7.6 Forced flush and its role as fsync replacement

`dwb_flush_force (thread_p, bool *all_sync)` (`3523-…`) pads the current block with dummy pages so it becomes flushable, then waits. It is reached from:

- `dwb_synchronize (thread_p, vol_fd, vlabel)` (`2842-2902`): for **permanent** volumes, `dwb_flush_force` replaces the plain fsync; if it reports `complete == false` the caller falls back to `fsync (vol_fd)` (`2864-2875`). A sync failure is escalated to `ER_FATAL_ERROR_SEVERITY` (`2885-2890`).
- `file_io.c:4642` and `disk_manager.c:733`.

### 7.7 Reads must consult the DWB

`dwb_read_page (thread_p, vpid, io_page, &success)` (`3978-4015`) looks the VPID up in the slots hash, re-verifies `slot->vpid` still matches, and memcpy's the slot's page out.

The page buffer read path calls it **before** touching disk:

```c
/* page_buffer.c:8454-8465 */
      if (dwb_read_page (thread_p, vpid, &bufptr->iopage_buffer->iopage, &success) != NO_ERROR)
	{ assert (false); return NULL; }
      else if (success == true)
	{ /* Nothing to do, copied from DWB */ }
      else if (fileio_read (thread_p, fileio_get_volume_descriptor (vpid->volid), &bufptr->iopage_buffer->iopage,
			    vpid->pageid, IO_PAGESIZE) == NULL)
```

This is a correctness requirement, not an optimisation: between `dwb_add_page` and step 8 of the block flush, the home location still holds the previous version.

### 7.8 Recovery: `dwb_load_and_recover_pages`

Called from `boot_sr.c:2408`. Volume name: `fileio_make_dwb_name` = `<dwb_path>/<db_name>_dwb` (`file_io.c:5881-5885`, `FILEIO_SUFFIX_DWB "_dwb"` at `file_io.h:92`), mounted as `LOG_DBDWB_VOLID`.

Walkthrough (`double_write_buffer.cpp:3199-3403`):

1. `assert (dwb_Global.vdes == NULL_VOLDES)`; if the `_dwb` file does not exist, skip straight to `dwb_create` (`3209-3215`, `3383`).
2. `fileio_mount` the DWB volume; `num_dwb_pages = fileio_get_number_of_volume_pages (...)` (`3218-3224`).
3. **Gate:** recover only if `num_dwb_pages > 0 && IS_POWER_OF_2 (num_dwb_pages)` (`3235`). The reasoning (`3227-3234`): the size may differ from the parameter either because the user changed it, or because the previous DWB "was created, partially flushed and the system crashed"; a non-power-of-2 size means a partially written DWB file, and its contents are discarded.
4. Build a **single** recovery block of `num_dwb_pages` slots (`dwb_create_blocks (thread_p, 1, num_dwb_pages, &rcv_block)`, `3238`) and `fileio_read_pages` the whole file into its `write_buffer` (`3245`).
5. Reconstruct each slot's VPID and LSA **from the page headers themselves** (`3252-3259`) — the DWB file carries no separate metadata.
6. Sort by VPID (`3262`), then dedup (`3273-3318`): keep the higher LSA; on **equal** LSAs keep the one at the **lower** position in the block, because "This is the case when page was modified without setting LSA. The first appearance in DWB contains the oldest page modification - last flush in DWB!" (`3297-3299`).
7. Debug-only `dwb_debug_check_dwb` (`3320-3327`).
8. `dwb_check_data_page_is_sane` (`3091-3185`) — the actual repair decision, per slot:
   - Skip if `vpid->pageid >= vol_pages` — "The page was written in DWB, not in data volume" (`3135-3139`).
   - `fileio_read` the home page, then `fileio_page_check_corruption` (`3142-3153`).
   - Home page **sane** → discard the DWB copy: `VPID_SET_NULL (&slot.vpid); fileio_initialize_res (...)` (`3155-3161`). **A sane page is never overwritten**, even if the DWB copy is newer.
   - Home page **corrupted** → check the DWB copy too; if that is also corrupted, `assert_release (false)` and `ER_FAILED` — unrecoverable (`3163-3176`).
   - Otherwise count it as recoverable (`3178-3180`).
9. If anything is recoverable (`3336-3369`):
   - `pgbuf_invalidate_all (thread_p, NULL_VOLID)` first, with an explanatory comment (`3338-3339`): "pgbuf may still hold pre-recovery copies of these boot-read pages; drop them so recovery re-reads the pages DWB rewrites on disk below."
   - `dwb_write_block (..., file_sync_helper_can_flush = false, remove_from_hash = false)` — the hash is not in use yet (`3347-3348`).
   - `fileio_synchronize (..., ensure_metadata = true)` per touched volume; the comment notes `flush_volumes_info[i].metadata` is meaningless here (`3355-3366`).
10. `fileio_dismount`, then `fileio_unformat (dwb_Volume_name)` — "Destroy the old file, since data recovered" (`3374-3379`). On error the old file is intentionally kept (`3390`).
11. `dwb_create (thread_p, dwb_path_p, db_name_p)` rebuilds the DWB with current parameter values (`3383`).

### 7.9 When the DWB is bypassed

| Condition | Evidence |
|---|---|
| `double_write_buffer_size = 0` | `dwb_load_buffer_size` returns false → `dwb_create_internal` returns without creating (`776-780`, `1178-1182`) |
| `double_write_buffer_blocks = 0` | same path (`802-806`) |
| Temporary volumes | `uses_dwb = dwb_is_created () && !is_temp` (`page_buffer.c:10741`) |
| Non-permanent volumes on the generic write path | `fileio_traverse_permanent_volume` miss → direct write (`file_io.c:4029-4051`) |
| Client-side build | `#else` branch of `fileio_write_or_add_to_dwb` under `CS_MODE` (`file_io.c:4057-4058`) |
| DWB destroyed mid-flush | `dwb_slot == NULL` from `dwb_add_page` → retry without DWB (`page_buffer.c:10814-10821`) |

I found **no** size-based bypass (no "big pages skip the DWB" rule); pages are always `IO_PAGESIZE`.

---

## 8. Torn-page detection on read

**Mechanism: duplicated LSA at the head and tail of the page. There is no checksum anywhere in this path.**

```c
/* file_io.h:230-236 */
STATIC_INLINE int
fileio_is_page_sane (FILEIO_PAGE * io_page, PGLENGTH page_size)
{
  FILEIO_PAGE_WATERMARK *prv2 = fileio_get_page_watermark_pos (io_page, page_size);
  return (LSA_EQ (&io_page->prv.lsa, &prv2->lsa));
}
```

`fileio_page_check_corruption` (`file_io.c:11924-11932`) is a one-line wrapper: `*is_page_corrupted = !fileio_is_page_sane (io_page, IO_PAGESIZE);` (`11929`).

A partial write that lands the first sector but not the last leaves the two LSA copies disagreeing. Since `FILEIO_PAGE_WATERMARK` is one `LOG_LSA`, the tail check costs 8 bytes of the user page area.

**Every call site of the check, at this commit:**

| Site | Context |
|---|---|
| `double_write_buffer.cpp:3149` | DWB recovery — is the home page corrupted? |
| `double_write_buffer.cpp:3164` | DWB recovery — is the DWB copy corrupted? |
| `double_write_buffer.cpp:2629` | `assert` only — page entering a DWB slot must be sane |
| `file_io.c:3695` | Inside a **fault-injection** debug block (`PRM_ID_ER_LOG_DEBUG`, random-exit simulation) — `assert (... is_page_corrupted == false)` |
| `page_buffer.c:11455` | `pgbuf_is_consistent`, compiled only under `CUBRID_DEBUG` |

Consequently: **the normal `pgbuf_fix` read path performs no torn-page validation.** `page_buffer.c:8454-8489` calls `dwb_read_page` then `fileio_read` and, on success, proceeds to TDE decryption (`8492-8505`) and temp-LSA fixups (`8513-8521`) without ever calling `fileio_page_check_corruption`. The only production consumer of the watermark is DWB recovery at boot — which is coherent with the design: the DWB is what makes torn pages repairable, so the check is applied exactly where a repair is possible.

`pgbuf_is_consistent` (`page_buffer.c:11403-11485`, `CUBRID_DEBUG` only) is a separate diagnostic: it re-reads the page from disk and compares LSA + body against the in-memory copy, classifying `PGBUF_CONTENT_GOOD / LIKELY_BAD / BAD`, and additionally checks a guard region for buffer overruns (`11411-11416`).

---

## 9. Interaction with the log manager and vacuum

**Log manager → page buffer:**

- `logpb_checkpoint` → `pgbuf_flush_checkpoint` → `fileio_synchronize_all` (`log_page_buffer.c:7010-7021`).
- SA-mode archive removal → `pgbuf_flush_checkpoint` with `prev_chkpt_redo_lsa = NULL` (`log_page_buffer.c:6277`), plus `log_page_buffer.c:10700`.
- Recovery and shutdown → `pgbuf_flush_all*` (see §6).

**Page buffer → log manager:**

- `logpb_flush_log_for_wal` from `pgbuf_bcb_flush_with_wal` (`10786`), `pgbuf_flush_checkpoint` (`4156`), and the victim-flush WAL retry (`4094`).
- `logpb_need_wal` as a cheap pre-check in the victim flush loop (`4013`) and in the DWB's debug assertion (`double_write_buffer.cpp:2258`).
- `log_wakeup_log_flush_daemon` when candidates are blocked on WAL (`4025`) and once per collection pass (`3946`); `logpb_force_flush_pages` in SA mode (`3951`).
- `log_Gl.chkpt_redo_lsa` read (under `chkpt_lsa_lock`) inside `pgbuf_set_lsa` for the invalid-page assertion (`5003-5005`).

**Vacuum:** nothing flush-specific. `PGBUF_BCB_TO_VACUUM_FLAG` (`239`) only participates in LRU placement — set by `pgbuf_notify_vacuum_follows` (`16129-16136`), cleared when a vacuum worker fixes the page (`2626-2628`, `8610`), and queried by the LRU logic (`16147`). Vacuum workers are excluded from promoting pages on unfix (`PGBUF_VACUUM_SHOULD_IGNORE_UNFIX`, `283`) and get high-priority treatment when waiting for a victim (`8196`, `8208`). Victim/LRU details belong to the LRU agent's scope.

---

## 10. Tunables

All defaults read from the `prm_Def[]` table in `src/base/system_parameter.c`; the field order is `default_value, value, upper_limit, lower_limit` (`system_parameter.h:717-720`).

| Parameter (`cubrid.conf` name) | Type | Default | Range | Table line | Notes |
|---|---|---|---|---|---|
| `page_flush_interval_in_msecs` | int (ms) | 1000 | ≥ 0, no upper | 1806-1817 | 0 = daemon waits indefinitely; `PRM_DEPRECATED` |
| `data_buffer_flush_ratio` | float | 0.01 | 0.01 – 0.95 | 1158-1168 | fraction of pool scanned per victim-flush pass; `PRM_HIDDEN` |
| `data_buffer_sequential_victim_flush` | bool | true | — | 4067-4077 | sort candidates by (volid, pageid); `PRM_HIDDEN` |
| `data_buffer_neighbor_flush_pages` | int | 8 | 0 – 32 | 3953-3964 | > 1 enables neighbor batch flush |
| `data_buffer_neighbor_flush_nondirty` | bool | false | — | 3942-3952 | allow clean neighbors in a batch |
| `sync_on_nflush` | int (pages) | 200 | 1 – INT_MAX | 1866-1877 | fsync trigger in `fileio_compensate_flush`; also the DWB helper hand-off threshold; `PRM_DEPRECATED` |
| `max_flush_pages_per_second` | int | 10000 | 1 – INT_MAX | 1842-1853 | token refill when adaptive control is off; `PRM_DEPRECATED` |
| `adaptive_flush_control` | bool | true | — | 1830-1841 | routes refill through `pgbuf_flush_control_from_dirty_ratio` |
| `checkpoint_every_npages` | int | 100000 | ≥ 10 | 1358-1368 | `PRM_DEPRECATED`, `PRM_RELOADABLE` |
| `checkpoint_interval_in_mins` | int (min) | 360 | ≥ 60 | 1380-1390 | `PRM_DEPRECATED`, `PRM_DIFFER_UNIT` (min↔sec conversion funcs) |
| `checkpoint_sleep_msecs` | int (ms) | 1 | ≥ 0 | 1402-1412 | 0 → rate pinned at 1000 pages/s; `PRM_HIDDEN` |
| `double_write_buffer_size` | int (bytes) | 2 MB | 0 – 32 MB | 4309-4320 | 0 disables DWB; rounded up to a power of 2 ≥ 512 KB |
| `double_write_buffer_blocks` | int | 2 | 0 – 32 | 4321-4332 | 0 disables DWB; power of 2; `PRM_HIDDEN` |
| `double_write_buffer_enable_flush_thread` | bool | true | — | 4333-4343 | false → block flush happens on the producing thread; `PRM_HIDDEN` |
| `double_write_buffer_logging` | bool | false | — | 4344-4354 | enables `dwb_log`/`dwb_log_error`; `PRM_HIDDEN` |
| `log_pgbuf_victim_flush` | bool | false | — | 4444-4454 | victim-flush debug logging; `PRM_HIDDEN` |
| `detailed_checkpoint_logging` | bool | false | — | 4455-4465 | checkpoint `detailed_er_log`; `PRM_HIDDEN` |

Compile-time constants that are *not* tunable:

| Constant | Value | Line |
|---|---|---|
| `PGBUF_FLUSH_VICTIM_BOOST_MULT` | 10 | `page_buffer.c:305` |
| `PGBUF_MAX_NEIGHBOR_PAGES` | 32 | `page_buffer.c:310` |
| `PGBUF_CHKPT_MAX_FLUSH_RATE` | 1200 pages/s | `page_buffer.c:322` |
| `PGBUF_CHKPT_MIN_FLUSH_RATE` | 50 pages/s | `page_buffer.c:323` |
| `PGBUF_CHKPT_BURST_PAGES` | 16 | `page_buffer.c:326` |
| `WAIT_FLUSH_VICTIMS_MAX_MSEC` | 1500.0f | `page_buffer.c:4279` |
| checkpoint flush-list size | `MIN (0.25 * num_buffers, 65536)` | `page_buffer.c:1763-1764` |
| victim-flush scan cap | 200 MB / `DB_PAGESIZE` | `page_buffer.c:3919-3920` |
| `PGBUF_FLUSHED_BCBS_BUFFER_SIZE` | 8192 | `page_buffer.c:751` |
| `DWB_SLOTS_HASH_SIZE` | 1000 | `double_write_buffer.cpp:48` |

---

## 11. Observability

### 11.1 perfmon counters (statdump names from `src/base/perf_monitor.c`)

| Enum | statdump name | Line |
|---|---|---|
| `PSTAT_PB_NUM_DIRTIES` | `Num_data_page_dirties` | 210 |
| `PSTAT_PB_NUM_IOWRITES` | `Num_data_page_iowrites` | 212 |
| `PSTAT_PB_NUM_FLUSHED` | `Num_data_page_flushed` | 213 |
| `PSTAT_PB_FLUSH_PAGE_FLUSHED` | `Num_data_page_writes` | 485 |
| `PSTAT_PB_FLUSH_SEND_DIRTY_TO_POST_FLUSH` | `Num_data_page_dirty_to_post_flush` | 486 |
| `PSTAT_PB_NUM_SKIPPED_FLUSH` | `Num_data_page_skipped_flush` | 487 |
| `PSTAT_PB_NUM_SKIPPED_NEED_WAL` | `Num_data_page_skipped_flush_need_wal` | 488 |
| `PSTAT_PB_NUM_SKIPPED_ALREADY_FLUSHED` | `Num_data_page_skipped_flush_already_flushed` | 489 |
| `PSTAT_PB_NUM_SKIPPED_FIXED_OR_HOT` | `Num_data_page_skipped_flush_fixed_or_hot` | 490 |
| `PSTAT_PB_FLUSH_COLLECT` | `flush_collect` (counter+timer) | 480 |
| `PSTAT_PB_FLUSH_FLUSH` | `flush_flush` | 481 |
| `PSTAT_PB_FLUSH_SLEEP` | `flush_sleep` | 482 |
| `PSTAT_PB_FLUSH_COLLECT_PER_PAGE` | `flush_collect_per_page` | 483 |
| `PSTAT_PB_FLUSH_FLUSH_PER_PAGE` | `flush_flush_per_page` | 484 |
| `PSTAT_PB_COMPENSATE_FLUSH` | `compensate_flush` | 491 |
| `PSTAT_PB_WAKE_FLUSH_WAITER` | `wake_flush_waiter` | 493 |
| `PSTAT_FC_NUM_PAGES` | `Num_adaptive_flush_pages` | 310 |
| `PSTAT_FC_NUM_LOG_PAGES` | `Num_adaptive_flush_log_pages` | 311 |
| `PSTAT_FC_TOKENS` | `Num_adaptive_flush_max_pages` | 312 |
| `PSTAT_FILE_NUM_IOWRITES` | `Num_file_iowrites` | 201 |
| `PSTAT_FILE_NUM_IOSYNCHES` | `Num_file_iosynches` | 202 |
| `PSTAT_DWB_FLUSH_BLOCK_TIME_COUNTERS` | `DWB_flush_block` | 537 |
| `PSTAT_DWB_FILE_SYNC_HELPER_TIME_COUNTERS` | `DWB_file_sync_helper` | 538 |
| `PSTAT_DWB_FLUSH_BLOCK_COND_WAIT` | `DWB_flush_block_cond_wait` | 539 |
| `PSTAT_DWB_FLUSH_BLOCK_SORT_TIME_COUNTERS` | `DWB_flush_block_sort` | 540 |
| `PSTAT_DWB_DECACHE_PAGES_AFTER_WRITE` | `DWB_decache_pages_after_write` | 541 |
| `PSTAT_DWB_WAIT_FLUSH_BLOCK_TIME_COUNTERS` | `DWB_wait_flush_block` | 542 |
| `PSTAT_DWB_WAIT_FILE_SYNC_HELPER_TIME_COUNTERS` | `DWB_wait_file_sync_helper` | 543 |
| `PSTAT_DWB_FLUSH_FORCE_TIME_COUNTERS` | `DWB_flush_force` | 544 |
| `PSTAT_DWB_FLUSHED_BLOCK_NUM_VOLUMES` | `Num_dwb_flushed_block_volumes` (complex/histogram) | 605 |

The detailed skip counters and the two hand-off counters are gated on `PERFMON_ACTIVATION_FLAG_PB_VICTIMIZATION` (`page_buffer.c:3841`, `4060`, `10872`, `10892`); `PSTAT_DWB_FLUSHED_BLOCK_NUM_VOLUMES` on `PERFMON_ACTIVATION_FLAG_FLUSHED_BLOCK_VOLUMES` (`double_write_buffer.cpp:2407`).

### 11.2 `SHOW PAGE BUFFER STATUS`

Columns (`src/parser/show_meta.c:693-712`, DBA-only per `720`) relevant here: `Victim_candidate_pages`, `Clean_pages`, `Dirty_pages`, `Num_pages_created`, `Num_pages_written`, `Pages_written_rate`, `Num_pages_read`, `Pages_read_rate`, `Num_flusher_waiting_threads`.

`Dirty_pages` / `Clean_pages` / `Victim_candidate_pages` come from `pgbuf_scan_bcb_table` (`page_buffer.c:17256-…`), a **lock-free full scan** of the BCB table reading `bufptr->flags` non-atomically (`17273-17293`). `Victim_candidate_pages` there is counted as "in `PGBUF_LRU_3_ZONE` **and** dirty" (`17290-17293`) — the pages the victim flusher would target, not the pages immediately victimizable.

`pgbuf_peek_stats` (`page_buffer.c:14683-14780`) does a second independent scan for `showstmt`/monitoring, with an explicit caveat: "copy flags. we do not lock the bcb and we can be affected by concurrent changes" (`14713`). Its `avoid_victim_cnt` counts `PGBUF_BCB_FLUSHING_TO_DISK_FLAG` (`14739-14742`), and `victim_candidates` sums the per-LRU `count_vict_cand` maintained by `pgbuf_lru_add/remove_victim_candidate` (`14752-14755`).

Error-log notifications: `ER_LOG_FLUSH_VICTIM_STARTED` / `ER_LOG_FLUSH_VICTIM_FINISHED` fire on every victim-flush pass regardless of any parameter (`page_buffer.c:3856`, `4114`).

---

## 12. Surprising / little-known facts

1. **The DWB file on disk is one block, not the whole buffer.** `fileio_format` is called with `num_block_pages` (`double_write_buffer.cpp:1193-1194`) and every block flush writes at page offset 0 (`2329`). With defaults the `<db>_dwb` file is `2 MB / 2 = 1 MB`. Sizing the file from `double_write_buffer_size` is wrong.

2. **Recovery refuses to use a DWB file whose page count is not a power of two** (`3235`), treating it as evidence of a partially written DWB and silently discarding all copies (`3227-3234`). Changing `double_write_buffer_size` to a non-power-of-2 value therefore also disables recovery from the *previous* DWB.

3. **Torn-page detection is a duplicated LSA, not a checksum** (`file_io.h:230-236`) — and the normal read path never runs it. Outside DWB recovery, the only call sites are a fault-injection assertion and `CUBRID_DEBUG` code (§8).

4. **DWB recovery never overwrites a home page that passes the sanity check**, even when the DWB holds a newer version (`3155-3161`). The DWB repairs torn pages only; ordinary redo handles version recovery.

5. **`Num_pages_written` in `SHOW PAGE BUFFER STATUS` and `PSTAT_PB_NUM_IOWRITES` from pgbuf both stop counting when the DWB is enabled.** Both are incremented only in the non-DWB branch of `pgbuf_bcb_flush_with_wal` (`10826`, `10831`); the DWB branch at `10809-10823` increments neither. The writes reappear later under the DWB's own `perfmon_add_stat (PSTAT_PB_NUM_IOWRITES, ...)` calls (`double_write_buffer.cpp:2115`, `2150`, `2339`) — which, because the DWB writes each page twice, count the DWB-file write and the home write **separately**.

6. **Release and debug builds have different dirty-marking semantics.** `pgbuf_set_lsa` auto-marks the page dirty only `#if defined (NDEBUG)` (`5022-5028`), explicitly so that debug builds surface missing `pgbuf_set_dirty` calls as bugs while release builds stay safe.

7. **`PGBUF_TEMP_LSA` is `(-2, -2)`, not NULL LSA.** (`page_buffer.h:260` with `log_lsa.hpp:65-66`.) `pgbuf_init_temp_page_lsa` stamps both the head and the watermark (`17244-17251`), so temp pages satisfy `fileio_is_page_sane`.

8. **`pgbuf_set_lsa` silently returns NULL for temp-LSA pages and auxiliary volumes** (`4969-4973`) — an LSA set on such a page is dropped with no error. `PGBUF_IS_AUXILIARY_VOLUME` is `volid < LOG_DBFIRST_VOLID` (`172`).

9. **A page may be flushed while WRITE-latched, if the flusher is the latch holder** (`10696-10717`) — debug builds verify holder identity by walking the thread's holder list. This is what makes `pgbuf_flush_with_wal` callable from code that is mid-modification.

10. **Neighbor flush writes clean pages on purpose**, with the author unsure it is needed: `/* flush even if it is not dirty. todo: is this necessary? */` (`12105`).

11. **Checkpoint yields to the victim flusher for up to 1.5 seconds per 16-page interval** (`4279`, `4331-4337`), and reciprocally the victim flusher disables its 10× boost while `pgbuf_Pool.is_checkpoint` is set (`3905-3916`). The two flushers actively de-prioritise each other.

12. **Checkpoint deliberately re-flushes already-clean pages to keep a sequential run intact** (`4473-4480`), and will flush the same page twice in one pass if `oldest_unflush_lsa` is still within range afterwards (`4497-4518`).

13. **Threads holding `LOG_CS` bypass the flush-control token bucket entirely** (`file_io.c:771-774`, `808-812`), so log flushing is never throttled by the data-page rate limiter.

14. **Adaptive flush control targets exactly half the pool dirty** (`desired_dirty_cnt = pgbuf_Pool.num_buffers / 2`, `14793`) and grows the rate quadratically above that (`14804`). `prev_dirties_cnt` is a function-local `static` (`14791`), safe only because a single daemon calls it.

15. **The page flush daemon considers the hit ratio "low" below 99.9%** (`PGBUF_DESIRED_HIT_VS_MISS_RATE 1000`, `16571`), so with `page_flush_interval_in_msecs = 0` it will still spin continuously under any realistic miss rate.

16. **`pgbuf_wake_flush_waiters` carries a fix for a `CREATE INDEX` livelock** in its comment (`10944-10953`): failing to clear the atomic latch's `waiter_exists` bit after dequeuing flush waiters made the next `pgbuf_fix` spin forever holding the BCB mutex.

17. **Only one DWB block flushes at a time** (`assert (dwb_Global.blocks_flush_counter <= 1)`, `2219`), and with `double_write_buffer_blocks = 1` every wrap of the buffer blocks producers in `dwb_wait_for_block_completion` (`2544-2548`).

18. **DWB hash entries are removed only *after* all home writes complete** (`2023-2027`, `2153-2176`), deliberately so concurrent readers keep getting the page from memory rather than from a home location that may be mid-rewrite.

19. **Two early returns in `pgbuf_bcb_flush_with_wal` leak the `FLUSHING_TO_DISK` flag** (returns at `10753` and `10765`, after `mark_is_flushing` at `10739`), permanently pinning the BCB against victimization and stranding any `PGBUF_LATCH_FLUSH` waiter. Also, the `goto copy_unflushed_lsa` at `10770` targets the immediately following label and is dead. See §3.2.

20. **`pgbuf_flush` documents itself as not to be used**: "caller flushes page but does not really care if page really makes it to disk. or doesn't know what to do in that case... I recommend against using it" (`3517-3518`).

21. **Every victim-flush pass writes two `ER_NOTIFICATION_SEVERITY` records to the server error log** (`3856`, `4114`), independent of `log_pgbuf_victim_flush`.

22. **`dwb_synchronize` escalates fsync failure to `ER_FATAL_ERROR_SEVERITY`**, with the reasoning "sync error is not alwasy handled and I am not sure a proper safe handling is possible" (`2885-2890`); `fileio_synchronize` does the same (`file_io.c:4486-4491`).

23. **`fileio_synchronize` picks `fsync` vs `fdatasync` from `ensure_metadata`** (`file_io.c:4476`), and the DWB propagates a per-slot `ensure_metadata` flag through hash replacement and dedup so a metadata-sync request is never lost (`double_write_buffer.cpp:1447`, `2076`, `2253`).

---

## 13. In-repo secondary reference

`src/storage/docs/buffer-io-durability.md` exists in the tree (committed by `fa448de5a`, "[CBRD-26974] Document storage AGENTS references"). Its line 68 states the same head/tail watermark mechanism described in §8, and line 51 lists the flush entry points from §6. I verified those two claims independently against the source rather than citing the doc.
