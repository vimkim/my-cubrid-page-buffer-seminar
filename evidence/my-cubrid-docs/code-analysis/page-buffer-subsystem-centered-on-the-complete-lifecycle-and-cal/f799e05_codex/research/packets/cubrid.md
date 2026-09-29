# CUBRID source-trace research packet

- role: CUBRID Source Tracer
- topic: CUBRID page buffer subsystem centered on the complete `pgbuf_fix()` / `pgbuf_unfix()` lifecycle
- frozen scope SHA256: `796828eab6754ed60bd88d65be34913c7d510e61b61d9a06e73f5340faae2d08`
- active verification root: `/home/vimkim/gh/cb/pgbuf-grill`
- revision: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
- evidence state: cited files and the active detached worktree are `COMMIT`-clean at the pinned revision; the original research checkout was later replaced for verification after unrelated intentional edits appeared there
- provenance rebound UTC: `2026-09-01` with a sealed build and fresh experiment/quiz replay
- generated UTC: `2026-08-28T07:33:28Z`

This packet is raw research material, not the final book. Local `pgbuf-rebuild-spec` and the earlier page-buffer seminar documents were used only as search leads; all substantive findings below were revalidated against the pinned source.

## Executive mechanism map

The shortest accurate description of `pgbuf_fix()` is not “read a page.” It is an ownership protocol over a resident page identity:

1. Validate the requested fetch/latch contract and try the lock-free read-hit path.
2. Otherwise search `VPID -> BCB`; a hit proceeds to latch acquisition.
3. A miss takes a per-VPID buffer lock so only one thread loads/creates that identity. It obtains a BCB from the invalid list or victim machinery, reads first from DWB and then the volume for an old page (or initializes a new page), decrypts if needed, and initializes BCB identity/state.
4. It increments the BCB fix accounting and grants, regrants, promotes, conditionally rejects, or queues the requested latch. A per-thread holder records nested ownership.
5. Only after a newly loaded BCB has a granted latch is it published in the hash; the per-VPID loader lock is then released and its waiters retry lookup.
6. The returned `PAGE_PTR` is borrowed while the holder/fix remains. Callers must pair every successful fix with the matching plain or ordered unfix path, and must dirty a modified page under a write latch.
7. `pgbuf_unfix()` decrements the thread holder first and the atomic BCB fix count second. When global `fcnt` reaches zero, it transitions the latch to `NO_LATCH`, performs LRU placement/boosting, wakes compatible latch waiters, and services deferred flush requests.
8. Dirty flush makes a stable page snapshot while holding the BCB mutex, marks `FLUSHING` while clearing the old dirty bit so concurrent re-dirty is preserved, releases the mutex, forces WAL to the page LSA, and then writes through DWB or directly to the data volume. Only clean, unfixed, waiter-free zone-3 BCBs are ordinary victims.

## Interface, ownership, and state inventory

### Public contract surface

- `PAGE_FETCH_MODE` is not a cache hint. It defines allocation/deallocation semantics: `OLD_PAGE`, `NEW_PAGE`, in-buffer-only, prevent-deallocation, deallocated/maybe-deallocated, and `RECOVERY_PAGE` (`page_buffer.h:172-187`).
- Public latch modes are `READ`, `WRITE`, and `NO_LATCH`; `FLUSH` is explicitly a blocking pseudo-mode and cannot be requested as a normal fix (`page_buffer.h:189-197`).
- The condition selects immediate failure versus waiting (`page_buffer.h:199-203`). Even an unconditional request is converted to conditional for a zero-wait transaction (`page_buffer.c:2322-2331`).
- `PGBUF_WATCHER` carries the ordered-heap contract: page pointer, group, rank, latch mode, and `page_was_unfixed`, which tells a caller that cached page-local pointers/slot assumptions must be revalidated (`page_buffer.h:219-249`; `page_buffer.c:12250-12263`).

### Resident object and ownership

- `PGBUF_BCB` owns resident identity (`VPID`), a 64-bit atomic latch tuple `{latch_mode, waiter_exists, fcnt}`, state flags, waiter queue, hash/LRU links, oldest unflushed LSA, and its I/O page frame (`page_buffer.c:499-555`).
- `PGBUF_HOLDER` is per-thread ownership bookkeeping: one entry per held BCB, a nested `fix_count`, performance provenance, and an ordered-watcher chain (`page_buffer.c:460-488`). It is not the global fix count.
- A successful fix gives a borrowed `PAGE_PTR`; it does not transfer BCB or frame ownership. The BCB/frame persists beyond an unfix as a cached LRU resident until invalidated or victimized.
- `pgbuf_unfix_all()` is a request-termination leak audit. Release builds forcibly unfix leaked holders; diagnostic builds report/assert instead (`page_buffer.c:3277-3350`). It is a safety net, not a substitute for caller cleanup.

### State axes that must not be collapsed into one diagram

The BCB has orthogonal state dimensions:

| Axis | Representative values | Transition owner |
|---|---|---|
| Identity/residency | invalid VPID, loading/VOID, hash-resident, victimized | miss loader, hash/victim code |
| Latch | `INVALID`, `NO_LATCH`, `READ`, `WRITE`; plus queued pseudo-`FLUSH` | fix/unfix and waiter wakeup |
| Fix ownership | global atomic `fcnt`; per-thread holder `fix_count` | fix/unfix |
| Durability | clean, dirty, flushing, concurrent re-dirty; page LSA + `oldest_unflush_lsa` | log/recovery and flusher |
| Replacement | INVALID, VOID, LRU1 hot, LRU2 buffer, LRU3 victim zone | first unfix, later hits, maintenance/victim |
| Protection | direct-victim flags, async-flush request, waiter bit; avoid-deallocation separately protects vacuum deallocation | allocation/deallocation/flush/latch paths |

LRU1 and LRU2 are not victim zones; LRU3 is (`page_buffer.c:184-212`). Dirty, flushing, and direct-victim flags invalidate ordinary victim candidacy (`page_buffer.c:222-265`).

## Complete fix lookup/load path

### Hit path

`pgbuf_fix_release()` first attempts `pgbuf_lockfree_fix_ro()` only for unconditional `READ` fixes of the old-page family. The fast path walks the hash without a BCB mutex, requires a positive `READ` latch with no waiters and matching VPID, increments atomic `fcnt` with CAS, and creates/increments the thread holder (`page_buffer.c:2358-2377,7725-7787`).

If the fast path does not apply or loses its CAS conditions, the normal hash search optimistically walks without the bucket mutex, locks the matching BCB, rechecks VPID after that lock, and falls back to a bucket-mutex phase when necessary (`page_buffer.c:7594-7722`). A normal hit registers a fix, validates page identity, and enters the common latch path (`page_buffer.c:2380-2489`).

Important current-revision detail: `pgbuf_lockfree_fix_ro()` checks VPID before its successful `fcnt` CAS but does **not** perform the post-CAS VPID recheck described by `pgbuf-rebuild-spec/ch10-verification.html`. The source argument for safety therefore has to be the positive `READ`-latched `fcnt` that prevents victimization during the CAS window, not a nonexistent second VPID check. This is a documentation/source contradiction requiring explicit treatment, not silent harmonization.

### Miss/load path

`pgbuf_lock_page()` serializes concurrent loaders for one VPID. A waiter sleeps; after wakeup it does not inherit a page/BCB, but returns to `try_again` and re-searches the hash (`page_buffer.c:7991-8088,8404-8453`). `pgbuf_unlock_page()` removes the buffer-lock record and wakes all VPID waiters (`page_buffer.c:8104-8178`).

The loader gets a BCB from the invalid list first and otherwise searches victim sources. Under server pressure it joins high/low-priority direct-victim queues and wakes the page-flush daemon; if no BCB is obtained, `ER_PB_ALL_BUFFERS_DIRTY` is set (`page_buffer.c:8189-8389`).

For an old page, `pgbuf_claim_bcb_for_fix()`:

1. Initializes BCB identity, latch tuple, flags, fix/deallocation accounting, and oldest-unflushed LSA.
2. Increments the data-page read statistic.
3. Calls `dwb_read_page()` first, then `fileio_read()` only if DWB did not have the page.
4. Decrypts encrypted page data in place.
5. Initializes temporary-volume LSA state and dirty state when required.

For `NEW_PAGE`, it deliberately skips disk read, initializes the page LSA/header identity, and counts a created page (`page_buffer.c:8480-8634`; DWB read lookup at `double_write_buffer.cpp:3970-4015`).

After the common latch succeeds, a new BCB is inserted in the hash and its per-VPID lock released. This publish-after-latch ordering ensures a hash-visible page already has valid resident state and a holder (`page_buffer.c:2485-2544`). Fetch-mode-specific deallocated-page validation happens while latched; unexpected deallocated pages are immediately unfixed before returning `NULL` (`page_buffer.c:2572-2610`).

### Retry and error behavior

- A same-VPID loader waiter sets `retry=true`; the public fix loop restarts lookup (`page_buffer.c:2416-2425,8431-8453`).
- `OLD_PAGE_IF_IN_BUFFER` returns `NULL` without loading when absent (`page_buffer.c:2408-2413`).
- Bad page identity, file read failure, and decrypt failure return the claimed BCB to invalid and release the VPID lock (`page_buffer.c:2450-2471,8520-8559`).
- `pgbuf_fix_with_retry()` retries selected latch/abort timeout errors only up to its caller-supplied count, then converts exhaustion to `ER_PAGE_LATCH_ABORTED` (`page_buffer.c:2117-2157`).
- A conditional latch conflict returns failure without sleeping. An unconditional conflict queues and uses a timed read/write latch sleep; an infinite transaction wait is still bounded by the page-latch timeout parameter (`page_buffer.c:6560-6634,7049-7169,7288-7449`).

## Latch, holder, wait, and unfix lifecycle

### Grant matrix and reentrancy

The CAS-controlled latch path behaves as follows (`page_buffer.c:6298-6634`):

| Existing state / requester | Outcome |
|---|---|
| Idle BCB | set requested mode, `fcnt=1`, allocate holder |
| READ + new READ, no waiters | share, increment `fcnt`, allocate/increment holder |
| READ + new READ, waiter exists | no barging; only an existing holder may reenter |
| Existing holder on WRITE | regrant READ or WRITE, increment nested ownership |
| Sole READ holder promotes to WRITE | replace its read ownership with one write fix |
| READ holder promotes while other readers exist | conditional fails; unconditional drops its read count and queues a promoter at the front |
| Incompatible non-holder | conditional fails; unconditional appends to waiter queue |

This is not a general transaction deadlock detector. The source explicitly states page-latch deadlocks are not guaranteed to be detected and therefore bounds read/write blocking with timed sleep (`page_buffer.c:7148-7158`). Timeout removal also attempts to grant compatible head readers; the ordinary wake path discards timed-out entries, leaves pseudo-FLUSH waiters for the flusher, grants a batch of compatible readers at the head or one writer, and reconciles `waiter_exists` (`page_buffer.c:7192-7279,7459-7590`).

### Unfix

`pgbuf_unfix()` maps the frame pointer back to its BCB, validates current-thread holder ownership, decrements/removes the holder, emits extended unfix stats, and tries an atomic lock-free decrement for a shared read latch with no waiters and `fcnt > 1`. Otherwise it locks the BCB and enters the full unlatch path (`page_buffer.c:3062-3201,6135-6184,7806-7829`).

The full path CAS-decrements global `fcnt`; zero changes latch mode to `NO_LATCH`. At zero it places a freshly loaded VOID BCB into private/shared LRU, keeps LRU1, conditionally boosts LRU2, boosts LRU3, or handles direct victim assignment. It then wakes latch waiters. If an async flush was requested, unfix invokes safe flush after latch release (`page_buffer.c:6657-6883,6896-6990`).

Two often-confused consequences:

- “Unfixed” means replacement-eligible **only if** all replacement exclusion conditions are clear. Non-zone3, waiter-bearing/non-`NO_LATCH`, `FLUSHING`, or direct-victim-invalid BCBs remain non-victims; dirtiness requires a successful WAL-safe flush before reuse. The avoid-deallocation count protects vacuum deallocation and is not itself a victim-selection blocker.
- `pgbuf_set_dirty(..., FREE)` is a convenience pairing that dirty-marks and then unfixes; `DONT_FREE` leaves the holder live (`page_buffer.c:4913-4956`).

## Representative caller call paths

### Heap: ordered ownership and direct page mutation

Representative object-page preparation:

```text
heap_prepare_object_page
  -> derive VPID from OID
  -> ordered_unfix stale watcher page, if any
  -> pgbuf_ordered_fix(OLD_PAGE, caller latch mode, watcher)
  -> translate bad-page / latch-timeout errors to heap-facing errors
```

Source: `heap_file.c:25543-25591`.

`pgbuf_ordered_fix()` first tries unconditional only when no other page is held (or only the same page is held); otherwise it uses a conditional latch. If that fails, it gathers watcher-backed pages violating `(group, rank, VPID)` order, prevents deallocation, clears watchers, unfixes all nested fixes, sorts and refixes, restores watchers, and sets `page_was_unfixed`. A failure may leave only some old watchers refixed, so callers must inspect every watcher (`page_buffer.c:12250-13063`). Plain holders without watchers cannot be safely restored and are deliberately ignored/asserted in key inconsistency cases (`page_buffer.c:12460-12524`).

Representative update:

```text
heap_update_set_prev_version
  -> use already fixed home/forward watcher
  -> mutate PEEK record header directly
  -> pgbuf_set_dirty(DONT_FREE)
  -> REC_BIGONE: ordered_fix overflow WRITE
       -> mutate overflow page -> dirty -> ordered_unfix
```

Source: `heap_file.c:25370-25477`. `heap_clean_get_context()` either transfers the home watcher into the scan cache or ordered-unfixes home and forward pages, then asserts both are clear (`heap_file.c:25593-25625`). This shows why a returned page pointer is scoped ownership, not a copy.

### B-tree: latch coupling, release, and restart

Ordinary key descent:

```text
btree_locate_key
  -> btree_search_key_and_apply_functions
     -> btree_get_root_with_key
        -> btree_fix_root_with_info(READ, UNCONDITIONAL)
     -> while non-leaf:
        btree_advance_and_find_key
          -> choose child from current node
          -> pgbuf_fix(child, OLD_PAGE, READ, UNCONDITIONAL)
        -> pgbuf_unfix(current parent)
     -> leaf is returned fixed to the caller, or cleanup unfixes it
```

Source: `btree.c:15426-15485,23734-24089` (root helper at `1837-1905`). The algorithm momentarily holds parent and child, then releases the parent; all error/restart exits explicitly release current/advance pages.

Leaf sibling traversal adds a direction-specific contention rule. Ascending next-page traversal uses unconditional READ; descending previous-page traversal uses conditional READ. A conditional failure is converted to `ER_DESC_ISCAN_ABORTED` after releasing held pages, forcing higher-level restart rather than waiting while holding the sibling (`btree.c:16867-17013`).

The repair path `btree_repair_prev_link_by_btid()` is an even clearer adversarial example: root is unconditional, current/next pages are conditional, contention releases pages, sleeps, and restarts with a cap of 20 attempts (`btree.c:8937-9134`). Do not generalize this repair-only retry policy to every B-tree operation.

### Recovery: special fetch semantics and page-LSA idempotence

Undo physical record:

```text
log_rv_undo_record
  -> physical: pgbuf_fix(OLD_PAGE, WRITE, UNCONDITIONAL)
  -> append compensation / execute undo function
  -> cleanup pgbuf_unfix
  -> logical record: no page fix here; undo function owns logical work
```

Source: `log_recovery.c:150-408`.

Redo:

```text
log_rv_fix_page_and_check_redo_is_needed
  -> log_rv_redo_fix_page
     -> pgbuf_fix(RECOVERY_PAGE, WRITE, UNCONDITIONAL)
  -> if record LSA <= page LSA: unfix and skip (already applied)
  -> otherwise execute redo function
  -> pgbuf_set_lsa(page, record LSA)
  -> recovery function dirty-marks modified page
  -> caller cleanup unfix
```

Source: `log_recovery.c:411-535,6260-6312,6399-6431`. `RECOVERY_PAGE` intentionally bypasses ordinary reservation/deallocation assumptions because sector-table replay is parallel and changes must be reapplied even when a page temporarily appears deallocated.

## Dirty, WAL, flush, checkpoint, DWB, and replacement

### Modification contract

`pgbuf_set_dirty_buffer_ptr()` atomically dirty-marks the BCB and asserts the current thread owns a WRITE latch/holder (`page_buffer.c:11657-11675`). `pgbuf_set_lsa()` is reserved for log/recovery, writes the page LSA, captures the first `oldest_unflush_lsa`, handles temp/auxiliary volume exceptions, and in release builds also forces dirty to protect against missing caller dirty calls (`page_buffer.c:4982-5081`). Dirty and LSA are related but not interchangeable: some code dirty-marks before an LSA exists.

### Safe flush and snapshot protocol

`pgbuf_bcb_safe_flush_internal()` flushes immediately only if the BCB is not already flushing and is unlatch/READ-latched, or WRITE-latched by the current thread. It cannot safely copy another writer’s page, so it sets `ASYNC_FLUSH_REQ`; a synchronous caller also queues a pseudo-FLUSH wait. It also forbids two concurrent writes of the same BCB because disk completion order could place an older image over a newer one (`page_buffer.c:8810-8902`).

`pgbuf_bcb_flush_with_wal()` then:

1. Atomically sets `FLUSHING` and clears the old dirty bit, allowing a concurrent updater to set dirty again independently.
2. Copies/encrypts the page to a separate aligned output image while holding the BCB mutex and optionally reserves/copies a DWB slot.
3. Copies page LSA and `oldest_unflush_lsa`, clears the latter, releases the BCB mutex.
4. Calls `logpb_flush_log_for_wal(page_lsa)` before data-page submission.
5. Submits to DWB or calls `fileio_write()` directly.
6. On ordinary I/O error, reacquires BCB, restores prior dirty/oldest-LSA state, clears flushing, and wakes flush waiters.
7. On success, clears only `FLUSHING`; a dirty bit set concurrently remains set.

Source: `page_buffer.c:10723-10962,16076-16126`; WAL force implementation: `log_page_buffer.c:4150-4189`. The DWB path copies the page into an acquired slot, hashes it by VPID, fills blocks, and later writes home-volume pages in VPID order (`double_write_buffer.cpp:2460-2634,2676-2800,1994-2150`). On the read side, a cache miss checks the live DWB slot hash before the data volume (`double_write_buffer.cpp:3969-4015`).

Checkpoint explicitly forces the log through `flush_upto_lsa`, collects dirty permanent BCBs whose oldest-unflushed LSA is eligible, sorts them, and flushes sequentially (`page_buffer.c:4180-4315`). Because a BCB may have been modified again around another flush, checkpoint conservatively tests `oldest_unflush_lsa` and can flush the page a second time (`page_buffer.c:4519-4573`).

### Replacement

- Allocation order is invalid-list BCB, then private/shared victim searches, then direct-victim wait/flush pressure (`page_buffer.c:8189-8389,9076-9280`).
- Ordinary victims must be zone3, clean/not flushing/not direct-victim, unfixed, and free of read/write waiters (`page_buffer.c:253-262,9294-9312,9324-9538`).
- Victimization rechecks eligibility, removes the BCB from the hash, and changes the latch to invalid before reuse (`page_buffer.c:8637-8687`).
- Clean eviction therefore does not imply a preceding data write. A dirty page must first be flushed; once clean it can later be selected.

### Startup and shutdown ordering

The transaction-table bootstrap initializes lock manager, page buffer, then file manager (`log_tran_table.c:484-505`). `pgbuf_initialize()` reads pool size, latch timeout and LRU ratios, constructs BCB/frame/hash/buffer-lock/LRU/invalid/AOUT/holder/quota/monitor/flush structures, and on partial failure calls `pgbuf_finalize()` (`page_buffer.c:1640-1917`).

At restart, DWB pages are loaded/recovered before page-buffer/DWB daemons and before log recovery (`boot_sr.c:2407-2428`). At clean shutdown, page-buffer daemons stop before `log_final`; `log_final` flushes log pages, all data pages, and all volume descriptors before marking shutdown/checkpoint state and tearing down the transaction table, which calls `pgbuf_finalize()`. Only after this does boot destroy DWB (`boot_sr.c:3067-3113`; `log_manager.c:1730-1855`; `log_tran_table.c:573-594`). `pgbuf_finalize()` itself only destroys in-memory structures; it is not the durability flush boundary (`page_buffer.c:1920-2114`).

## Observability and configuration

Source-backed parameters:

| Parameter family | Pinned defaults / semantics | Source |
|---|---|---|
| page buffer size | `page_buffer_size` defaults to 32768 I/O pages; deprecated `data_buffer_pages` equivalent remains | `system_parameter.c:1169-1190` |
| LRU zones | hot ratio 0.40; buffer ratio 0.05 | `system_parameter.c:3754-3777` |
| neighbor flush | non-dirty neighbor flush false; 8 pages, max 32 | `system_parameter.c:3942-3964` |
| latch timeout | hidden, 300000 ms default, 3000000 ms max | `system_parameter.c:5308-5319` |
| victim flush ratio | hidden, 0.01 default | `system_parameter.c:1158-1168` |

The base stat names are defined at `perf_monitor.c:207-222`. Extended fix/unfix arrays preserve module, page type, hit/miss mode, latch and condition dimensions (`perf_monitor.c:570-593,1160-1239`). A runtime experiment must attach a watcher before the workload; otherwise cumulative counters may remain unchanged.

Counter caveat: `Num_data_page_flushed` is incremented only in victim-candidate flushing (`page_buffer.c:4167`). It is **not** a general checkpoint completion counter. Use `Num_data_page_iowrites`, checkpoint start/end, dirty gauge, and sync counters for checkpoint observations. This naming mismatch is source-confirmed and has an existing runtime playbook warning.

The pinned branch also contains committed seminar-only trace code at `page_buffer.c:850-897`. With `CUBRID_PGBUF_TRACE_VPID="vol|page"`, it emits per-target events including `FIX_HIT`, `READ_FROM_DISK`, `ENTER_LRU`, `FALL_TO_ZONE3`, `BOOST_TO_TOP`, `EVICTED`, `SET_DIRTY`, and `FLUSHED_TO_DISK` (call sites: `page_buffer.c:2375,2397,6960-6989,8499,10112,10171,10485,10954,16039`). Treat this as pinned-branch instrumentation, not a generic upstream API.

## Claim candidates (ledger schema)

These four objects are ledger-ready source candidates. All cited bytes are commit-clean and each named symbol occurs in its range.

```json
{
  "id": "CUBRID-C001",
  "claim_ko": "고정된 리비전에서 pgbuf_fix는 READ/OLD 계열의 lock-free hit를 먼저 시도하고, 일반 hit에서는 해시로 BCB를 찾아 래치를 얻는다. miss에서는 VPID별 buffer lock으로 중복 loader를 직렬화하고 invalid/victim BCB를 확보한 뒤 OLD 페이지는 DWB 우선·데이터 볼륨 차선으로 읽고 NEW 페이지는 디스크 읽기 없이 초기화한다. 새 BCB는 래치 취득 뒤 해시에 공개되며, loader 대기자는 소유권을 넘겨받지 않고 깨어나 해시 조회부터 재시도한다.",
  "database": "cubrid",
  "revision": "f799e05d77d5300c6ea5753b4a6cc7caee6d8912",
  "kind": "source",
  "confidence": "SOURCE-CONFIRMED",
  "source_refs": [
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_fix_release","line_start":2260,"line_end":2685,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_lockfree_fix_ro","line_start":7724,"line_end":7787,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_allocate_bcb","line_start":8180,"line_end":8389,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_claim_bcb_for_fix","line_start":8392,"line_end":8634,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/double_write_buffer.cpp","symbol":"dwb_read_page","line_start":3969,"line_end":4015,"file_sha256":"32ae9d886d6ef5d2f3c1b280980eab25172fb74e9bc3e2178153f9122d6b365a","evidence_state":"COMMIT"}
  ],
  "runtime_run_ids": [],
  "limitations_ko": "이 주장은 고정 리비전의 구현 경로를 설명한다. 실제 캐시 적중률, I/O 횟수, 특정 스케줄에서의 대기 시간은 런타임 증거가 필요하다.",
  "report_locations": ["chapters/04-fix-lookup-load.html#claim-CUBRID-C001"]
}
```

```json
{
  "id": "CUBRID-C002",
  "claim_ko": "BCB의 atomic latch는 전역 latch mode·waiter bit·fix count를 함께 관리하고, 스레드별 holder는 같은 BCB에 대한 중첩 fix 소유권을 관리한다. 호환 READ는 waiter가 없거나 기존 holder의 재진입일 때 공유되고, 유일한 READ holder만 즉시 WRITE로 승격할 수 있다. 조건부 충돌은 즉시 실패하고 무조건 충돌은 제한시간이 있는 대기열로 들어간다. pgbuf_unfix는 holder와 전역 fcnt를 각각 감소시키고 마지막 unfix에서 NO_LATCH, LRU 이동/승격, 호환 waiter 기상, 지연 flush 처리를 수행한다.",
  "database": "cubrid",
  "revision": "f799e05d77d5300c6ea5753b4a6cc7caee6d8912",
  "kind": "source",
  "confidence": "SOURCE-CONFIRMED",
  "source_refs": [
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_holder","line_start":460,"line_end":488,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_latch_bcb_upon_fix","line_start":6277,"line_end":6634,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_unfix","line_start":3062,"line_end":3201,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_unlatch_bcb_upon_unfix","line_start":6636,"line_end":6883,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_timed_sleep","line_start":7281,"line_end":7449,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"}
  ],
  "runtime_run_ids": [],
  "limitations_ko": "큐 전체의 엄격한 FIFO 공정성을 주장하지 않는다. FLUSH pseudo-waiter, promoter 우선 배치, timed-out waiter 제거, reader batch wakeup이 섞인다. 모든 경쟁 interleaving의 무기아성도 증명하지 않는다.",
  "report_locations": ["chapters/05-latch-holder-unfix.html#claim-CUBRID-C002"]
}
```

```json
{
  "id": "CUBRID-C003",
  "claim_ko": "pgbuf 호출자의 계약은 모듈 목적에 따라 다르다. heap은 여러 관련 페이지의 latch deadlock을 줄이기 위해 watcher 기반 ordered fix를 사용하고 재fix 여부를 재검증해야 하며, B-tree 탐색은 부모를 고정한 채 자식을 READ fix한 뒤 부모를 unfix하고 일부 역방향/수리 경로는 조건부 실패 후 재시작한다. recovery는 물리 undo에 OLD/WRITE를, redo에 예약·할당 상태를 허용하는 RECOVERY_PAGE/WRITE를 사용하고 page LSA로 이미 적용된 redo를 건너뛴다. 모든 성공 fix는 해당 plain/ordered cleanup 경로와 짝을 이룬다.",
  "database": "cubrid",
  "revision": "f799e05d77d5300c6ea5753b4a6cc7caee6d8912",
  "kind": "source",
  "confidence": "SOURCE-CONFIRMED",
  "source_refs": [
    {"path":"src/storage/page_buffer.h","symbol":"PAGE_FETCH_MODE","line_start":172,"line_end":203,"file_sha256":"2f052cd4be1df289692990973dcb30f332bd75f5b135ea367a5960e866c9b197","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_ordered_fix_release","line_start":12249,"line_end":13063,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/heap_file.c","symbol":"heap_prepare_object_page","line_start":25543,"line_end":25625,"file_sha256":"93849b9ce9f37e731339ac7cdf0257f28eb5ebace8993293f1803078fd170289","evidence_state":"COMMIT"},
    {"path":"src/storage/btree.c","symbol":"btree_search_key_and_apply_functions","line_start":23734,"line_end":24089,"file_sha256":"547c44afb9ed2d86eca95744b3118ab5eee566ba48a779690ffe92abc75993b3","evidence_state":"COMMIT"},
    {"path":"src/storage/btree.c","symbol":"btree_find_next_index_record_holding_current_helper","line_start":16867,"line_end":17013,"file_sha256":"547c44afb9ed2d86eca95744b3118ab5eee566ba48a779690ffe92abc75993b3","evidence_state":"COMMIT"},
    {"path":"src/transaction/log_recovery.c","symbol":"log_rv_undo_record","line_start":150,"line_end":408,"file_sha256":"971f2bd465a5c34b64ae3d1dffeeb6d01fac7155f3adbd8db980f43e0d2c90bf","evidence_state":"COMMIT"},
    {"path":"src/transaction/log_recovery.c","symbol":"log_rv_redo_fix_page","line_start":6399,"line_end":6431,"file_sha256":"971f2bd465a5c34b64ae3d1dffeeb6d01fac7155f3adbd8db980f43e0d2c90bf","evidence_state":"COMMIT"}
  ],
  "runtime_run_ids": [],
  "limitations_ko": "대표 heap/B-tree/recovery 경로를 추적한 것으로 모든 pgbuf_fix 호출자를 열거한 주장이 아니다. ordered watcher의 page_was_unfixed를 각 heap 호출자가 모두 올바르게 검사하는지에 대한 전수 감사도 범위 밖이다.",
  "report_locations": ["chapters/06-caller-contracts.html#claim-CUBRID-C003"]
}
```

```json
{
  "id": "CUBRID-C004",
  "claim_ko": "WRITE holder가 수정한 페이지는 dirty로 표시되고 log/recovery는 page LSA와 최초 oldest_unflush_lsa를 기록한다. 안전 flush는 다른 WRITE holder나 동시 flusher를 피하고, BCB mutex 아래 페이지 스냅샷을 만든 뒤 FLUSHING을 세우면서 이전 dirty를 지워 동시 재-dirty를 보존한다. mutex를 놓은 뒤 page LSA까지 WAL을 먼저 강제하고 DWB 또는 데이터 볼륨에 기록한다. 일반 I/O 실패는 dirty·oldest LSA를 복구한다. replacement는 zone3의 clean·unfixed·waiter-free BCB만 일반 victim으로 선택한다.",
  "database": "cubrid",
  "revision": "f799e05d77d5300c6ea5753b4a6cc7caee6d8912",
  "kind": "source",
  "confidence": "SOURCE-CONFIRMED",
  "source_refs": [
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_set_lsa","line_start":4982,"line_end":5081,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_set_dirty_buffer_ptr","line_start":11656,"line_end":11675,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_bcb_safe_flush_internal","line_start":8810,"line_end":8902,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_bcb_flush_with_wal","line_start":10723,"line_end":10962,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/storage/page_buffer.c","symbol":"pgbuf_get_victim_from_lru_list","line_start":9314,"line_end":9538,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},
    {"path":"src/transaction/log_page_buffer.c","symbol":"logpb_flush_log_for_wal","line_start":4150,"line_end":4189,"file_sha256":"98dbfb055d2370ab7a98334de328bebc46c1828c0e04e2ea80a7d14e8472ef9c","evidence_state":"COMMIT"},
    {"path":"src/storage/double_write_buffer.cpp","symbol":"dwb_add_page","line_start":2676,"line_end":2800,"file_sha256":"32ae9d886d6ef5d2f3c1b280980eab25172fb74e9bc3e2178153f9122d6b365a","evidence_state":"COMMIT"}
  ],
  "runtime_run_ids": [],
  "limitations_ko": "일반 fileio/DWB 제출 오류의 rollback 경로를 설명한다. 아래 unknowns에 적은 암호화·DWB 슬롯 예약 조기 반환은 동일 rollback을 거치지 않으므로 별도 결함 후보이며, 모든 crash interleaving이나 저장장치 보장은 이 source-only 주장에 포함하지 않는다.",
  "report_locations": ["chapters/07-dirty-wal-flush-replace.html#claim-CUBRID-C004"]
}
```

## Prospective runtime claim slots

The following are deliberately `unknown` packet candidates, not ledger-ready runtime claims. Do not relabel them `RUNTIME-OBSERVED` or invent run IDs. After a successful captured run, replace the hypothesis wording, set `kind=runtime` (or `source+runtime`), set the matching confidence, and attach immutable run IDs.

```json
{"id":"CUBRID-C005","claim_ko":"미실행 가설: skill-owned DB의 동일 heap 스캔을 cold restart 뒤 두 번 실행하면 첫 실행은 target 페이지의 READ_FROM_DISK와 ioread 증가를 보이고, 두 번째 실행은 버퍼에 남은 페이지에서 FIX_HIT를 보이며 추가 ioread가 현저히 적다.","database":"cubrid","revision":"f799e05d77d5300c6ea5753b4a6cc7caee6d8912","kind":"unknown","confidence":"UNKNOWN","source_refs":[{"path":"src/storage/page_buffer.c","symbol":"pgbuf_quiz_trace","line_start":850,"line_end":897,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"}],"runtime_run_ids":[],"limitations_ko":"아직 실행하지 않았다. background vacuum/daemon read, working-set 크기와 watcher 부착 시점을 통제해야 하며 exact count를 oracle로 삼으면 안 된다.","report_locations":["chapters/04-fix-lookup-load.html#claim-CUBRID-C005"]}
```

```json
{"id":"CUBRID-C006","claim_ko":"미실행 가설: 한 csql 세션의 heap scan 동안 Num_data_page_fix_ext/Num_data_page_unfix_ext가 증가하고 문장 종료 뒤 Num_data_page_fixed가 사전 baseline으로 돌아오지만 LRU resident gauge는 유지되어 fix ownership 해제와 residency가 분리됨을 관찰할 수 있다.","database":"cubrid","revision":"f799e05d77d5300c6ea5753b4a6cc7caee6d8912","kind":"unknown","confidence":"UNKNOWN","source_refs":[{"path":"src/base/perf_monitor.c","symbol":"perfmon_pbx_unfix","line_start":1215,"line_end":1239,"file_sha256":"3c23ce773eb1694796ff004af13a0bc3512386ca464f00e91b6f47ed3b4a66a0","evidence_state":"COMMIT"}],"runtime_run_ids":[],"limitations_ko":"아직 실행하지 않았다. 이 실험은 holder/unfix 회계를 관찰하지만 READ 공유, WRITE 대기, promotion queue를 직접 검증하지 않는다. 시스템 thread가 가진 fix 때문에 절대 0 대신 workload 전후 baseline을 비교해야 한다.","report_locations":["chapters/05-latch-holder-unfix.html#claim-CUBRID-C006"]}
```

```json
{"id":"CUBRID-C007","claim_ko":"미실행 가설: 같은 skill-owned DB에서 heap full scan, primary-key index lookup, indexed UPDATE를 분리 실행하면 extended fix 배열의 module/page-type/latch 차원과 dirty/unfix 배열이 서로 다른 패턴을 보이며, SQL 수준 결과는 대표 heap/B-tree 호출 경로와 일치한다.","database":"cubrid","revision":"f799e05d77d5300c6ea5753b4a6cc7caee6d8912","kind":"unknown","confidence":"UNKNOWN","source_refs":[{"path":"src/base/perf_monitor.c","symbol":"perfmon_pbx_fix","line_start":1160,"line_end":1239,"file_sha256":"3c23ce773eb1694796ff004af13a0bc3512386ca464f00e91b6f47ed3b4a66a0","evidence_state":"COMMIT"}],"runtime_run_ids":[],"limitations_ko":"아직 실행하지 않았다. perfmon의 module/page type은 호출 stack 자체가 아니므로 runtime 결과만으로 특정 C 함수 call path를 증명하지 말고 CUBRID-C003의 source trace와 결합해야 한다.","report_locations":["chapters/06-caller-contracts.html#claim-CUBRID-C007"]}
```

```json
{"id":"CUBRID-C008","claim_ko":"미실행 가설: committed UPDATE로 dirty 페이지를 만든 뒤 interval statdump watcher가 붙은 상태에서 skill-owned scratch backup을 사용해 동기 checkpoint를 강제하면 checkpoint end, data-page iowrites, WAL/sync 계열 카운터가 증가하고 dirty gauge가 감소하며 정상 재시작 뒤 값이 보존된다.","database":"cubrid","revision":"f799e05d77d5300c6ea5753b4a6cc7caee6d8912","kind":"unknown","confidence":"UNKNOWN","source_refs":[{"path":"src/storage/page_buffer.c","symbol":"pgbuf_flush_checkpoint","line_start":4180,"line_end":4315,"file_sha256":"d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163","evidence_state":"COMMIT"},{"path":"src/transaction/log_page_buffer.c","symbol":"logpb_flush_log_for_wal","line_start":4150,"line_end":4189,"file_sha256":"98dbfb055d2370ab7a98334de328bebc46c1828c0e04e2ea80a7d14e8472ef9c","evidence_state":"COMMIT"}],"runtime_run_ids":[],"limitations_ko":"아직 실행하지 않았다. Num_data_page_flushed는 victim flush 전용이라 checkpoint oracle로 사용하면 안 되며, 정상 재시작은 crash-recovery 보장을 직접 검증하지 않는다. DWB가 켜져 있으면 page당 정확한 write 수를 약속할 수 없다.","report_locations":["chapters/07-dirty-wal-flush-replace.html#claim-CUBRID-C008"]}
```

## Suggested safe experiments

All runs should use the report skill’s build gate, a uniquely named skill-owned database/directory, `csql -i <hashed.sql>` receipts, and exact-process cleanup. Do not run the repository `quizzes/*.sh` verbatim: their reusable `quizdb`, shared `$CUBRID/conf/cubrid.conf` rewrite, stop/restart logic, and long-lived watcher are useful designs but do not satisfy the report skill’s ownership/safety contract without adaptation.

### E1 — cold/hot fix path, optional single-VPID trace (targets C005)

- Adapt `quizzes/01-cold-vs-hot-read/run.sh` into the skill-owned DB.
- Attach the watcher before the workload or embed `;set communication_histogram=yes`, `;.hist on`, and `;.dump_hist` in one hashed SQL input.
- Create a table whose working set fits the configured pool; allow initial vacuum work to settle; cleanly restart only the owned server; run the same full scan twice.
- Oracle: first run has positive `Num_data_page_ioreads`; second has positive fetches but materially fewer ioreads. Compare magnitude, not an exact count.
- Strong optional oracle: adapt the clean `quizzes/12-trace-a-page-journey/run.sh` method. `SHOW HEAP HEADER OF <table>` yields the heap-header VPID; start the owned server with `CUBRID_PGBUF_TRACE_VPID` and a unique scratch output path. Capture `READ_FROM_DISK` followed by later `FIX_HIT` for that VPID.
- Falsifier: the second run repeatedly records `READ_FROM_DISK` with a fitting, non-pressured working set; investigate daemon activity, unexpected restart, VPID selection, or replacement before changing the claim.

### E2 — ownership release versus residency (targets C006)

- Adapt `quizzes/02-fix-lifecycle/run.sh` with an interval watcher whose exact command line contains a run-unique output path.
- Record `Num_data_page_fixed`, LRU1/2/3 gauges, and extended fix/unfix arrays immediately before and after one full scan.
- Oracle: fix and unfix events both increase; fixed gauge returns to the pre-run baseline while some LRU residency remains. Do not require absolute fixed count zero.
- This run is intentionally limited. A direct READ/WRITE waiter and promotion experiment would require either a deterministic internal harness or test-only instrumentation in an isolated experiment patch. SQL row/transaction locks can otherwise masquerade as page-latch waiting. Do not claim queue semantics from a blocked SQL statement alone.

### E3 — heap/B-tree caller profiles (targets C007)

- In separate hashed csql runs over the same owned schema, execute: a forced heap/full scan, a selective primary-key lookup, and an indexed update plus commit.
- Capture `Num_data_page_fix_ext`, `Num_data_page_unfix_ext`, promote arrays, dirties, ioreads, and the query plan used. Extended statistics must be enabled only within the owned DB configuration and restored afterward.
- Oracle: the three workloads produce nonzero but different page-type/module/latch profiles; update produces write/dirtied-by-holder observations. Use source trace C003 to interpret the profiles.
- Falsifier: optimizer chose a different access path. Fix the experiment/query plan; do not reinterpret the result as B-tree evidence.

### E4 — dirty/WAL/checkpoint/DWB path (targets C008)

- Attach a run-unique interval `statdump` watcher because checkpoint/flush daemons are invisible to a per-transaction csql histogram.
- Commit a bounded UPDATE, snapshot counters/gauges, then invoke `cubrid backupdb -D <owned-scratch> -C -r <owned-db>` to force a synchronous checkpoint. Capture another snapshot and verify rows after a clean owned-server restart.
- Oracle: positive checkpoint-end delta, positive `Num_data_page_iowrites`, relevant WAL/sync activity, reduced dirty gauge, and preserved committed value.
- Explicit non-oracle: `Num_data_page_flushed` (victim flush only).
- Optional A/B: DWB enabled versus disabled in two isolated owned-DB runs, restoring config each time. Expect DWB-specific counters only in the enabled run, but do not promise exact I/O ratios.
- Crash injection is not needed for the central experiment. If later authorized, kill only the exact verified PID of the skill-owned server and retain the restart/recovery logs; never use broad process matching.

### Existing committed experiment assets examined

The following clean scripts are useful templates but have not been executed in this packet:

- `quizzes/01-cold-vs-hot-read/run.sh` — `f77b038d5edf7fdc76eff6a798a5161ec9d7a6b290aff58f10d9086173219061`
- `quizzes/02-fix-lifecycle/run.sh` — `b490958f7301f2b792638f2aebe25b99f4e402b0d11c1a8646515003ec28fdae`
- `quizzes/03-dirty-lazy-write/run.sh` — `246e78fdb9757b16e5a05c22ccaf1cc0f39456c56a17049fe3d0a44fe3346a7e`
- `quizzes/04-wal-before-data/run.sh` — `3a7f981c1a3550a32bc5578f5505775a5ba4f135dc9ee1a7cb20e0a5fa5f52ed`
- `quizzes/05-eviction-pressure/run.sh` — `e969a8d22d97a0db2ec6e1371a746ae32d82dc1de0f3818aa5907f75c8b99a1a`
- `quizzes/10-checkpoint/run.sh` — `33842c36295ecd973413ffe3944bfe2c458909b4b455d34d72b0bf738fbfb83c`
- `quizzes/11-double-write-buffer/run.sh` — `e04b4dcedd6ba12e1d2d11abb571879a0384671e700977ea4d2aab73114f9113`
- `quizzes/12-trace-a-page-journey/run.sh` — `d38e889a43b692b80fab4575400bf1f64301c3e806dfcc9eb4aaa4beb5949b58`
- `quizzes/lib/common.sh` — `22b98756d3ad063e33599d018a1c4a1f5e9da9bb6e3f3b5e265f0cd274d9202d`

## Unknowns, search gaps, and defect candidates

### Material contradictions

1. **Lock-free post-CAS VPID recheck:** local `pgbuf-rebuild-spec/ch10-verification.html` says the algorithm rechecks VPID after CAS. Pinned `pgbuf_lockfree_fix_ro()` does not. The book must use pinned source and explicitly identify the local document as stale/overstated. It may explain the likely safety premise (positive READ `fcnt` prevents victimization) as an inference with a falsifier, not as an implemented second check.
2. **`Num_data_page_flushed` naming:** source increments it only after `pgbuf_flush_victim_candidates`, while checkpoint uses other paths. Any earlier prose calling it “all flushed pages” is incorrect for this revision.

### High-value error-path audit candidates

These are not folded into C001/C004 guarantees and should be treated as defect hypotheses until a focused review/test confirms reachability and consequence:

1. `pgbuf_claim_bcb_for_fix()` returns directly when `dwb_read_page()` itself returns an error (`page_buffer.c:8510-8515`). Unlike the following `fileio_read()` and TDE-decrypt errors, this branch does not visibly return the BCB to invalid or release the per-VPID buffer lock. The comment says “Should not happen,” but that is not cleanup. Search gap: confirm whether all reachable `dwb_read_page()` implementations/callees can in fact never return nonzero after DWB creation.
2. `pgbuf_bcb_flush_with_wal()` marks `FLUSHING` and clears old dirty before TDE encryption/DWB-slot acquisition, but TDE encryption error (`page_buffer.c:10811-10816`) and `dwb_set_data_on_next_slot()` error (`10824-10828`) return before the common rollback at `10908-10922`. Potential consequence: stranded FLUSHING, lost preexisting dirty, and sleeping synchronous flush waiters. Search gap: prove error reachability and inspect whether callees restore state indirectly (none was visible in the traced functions).
3. Deferred async flush failure during unfix is intentionally erased with `er_clear()` and `NO_ERROR` (`page_buffer.c:6860-6875`). This may be an interface choice because `pgbuf_unfix()` is void, but it means callers cannot learn the flush failure from unfix. The book should distinguish “error not propagated” from “error not recorded elsewhere.”

### Completeness gaps

- No focused `pgbuf_fix`/latch unit test was found under `unit_tests`; the only directly adjacent unit target is a narrow disabled-DWB behavior test in `unit_tests/double_write_buffer/test_double_write_buffer.cpp`. Search performed: `rg` for `pgbuf_fix`, `pgbuf_unfix`, `pgbuf_set_dirty`, and `page_buffer` under `unit_tests`.
- Representative heap/B-tree/recovery paths were read in full, but the thousands of transitive `pgbuf_fix` call sites were not catalogued. This matches frozen scope; avoid “all callers” wording.
- Ordered-fix correctness across every heap caller, especially every use of `page_was_unfixed`, was not exhaustively audited.
- Runtime behavior is entirely prospective in this packet. C005-C008 must remain unknown until captured experiment receipts exist.
- No source-only reasoning here proves every hardware/storage crash interleaving, exact fairness, timing, hit ratio, or I/O amplification.

## Examined files and symbols

Primary source (all commit-clean at the pinned revision):

| File | Symbols/areas read | SHA256 |
|---|---|---|
| `src/storage/page_buffer.c` | BCB/holder/latch structures; initialize/finalize; fix/retry/hash/buffer-lock/load; latch/block/timeout/wakeup; unfix/ordered-fix; dirty/LSA; flush/checkpoint; LRU/victim; daemon init/destroy; seminar trace | `d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163` |
| `src/storage/page_buffer.h` | fetch/latch/condition enums; ordered ranks; watcher; public API | `2f052cd4be1df289692990973dcb30f332bd75f5b135ea367a5960e866c9b197` |
| `src/storage/heap_file.c` | `heap_update_set_prev_version`, `heap_prepare_object_page`, `heap_clean_get_context` | `93849b9ce9f37e731339ac7cdf0257f28eb5ebace8993293f1803078fd170289` |
| `src/storage/btree.c` | root fix; locate/search traversal; child latch coupling; sibling scan; link repair retry | `547c44afb9ed2d86eca95744b3118ab5eee566ba48a779690ffe92abc75993b3` |
| `src/transaction/log_recovery.c` | physical undo; redo fix/skip; redo LSA; record dirty | `971f2bd465a5c34b64ae3d1dffeeb6d01fac7155f3adbd8db980f43e0d2c90bf` |
| `src/transaction/log_page_buffer.c` | `logpb_flush_log_for_wal` | `98dbfb055d2370ab7a98334de328bebc46c1828c0e04e2ea80a7d14e8472ef9c` |
| `src/transaction/log_manager.c` | `log_final` flush/sync/finalize ordering | `73969c9343765e8affdd44ae7b312aac5243365418df08592be90c3325761975` |
| `src/transaction/log_tran_table.c` | page-buffer initialization/finalization ownership | `f6b98fcd69697aca8980a6b0d45e57b7eb0b29dac959f93cda59a52e6777e7fc` |
| `src/transaction/boot_sr.c` | DWB recovery/daemon/log-recovery startup; clean shutdown order | `01c1189c162d2d6b6a41dac4d9a52e0cab169c5fd1e6ae2cd003bb5f90343651` |
| `src/storage/double_write_buffer.cpp` | slot acquisition/copy/add, home writes, read lookup | `32ae9d886d6ef5d2f3c1b280980eab25172fb74e9bc3e2178153f9122d6b365a` |
| `src/storage/file_io.c` | physical data-page read/write/sync callees | `3d4f38846aaf9e5f4dc0e753cb95946329429087775dbae3a6ce7c08eb101762` |
| `src/storage/tde.c` | data-page encrypt/decrypt callees | `a013f0133ded67a65fa12f81d602e7de4a9284188aa149711e76fc6c796ed2cc` |
| `src/base/perf_monitor.c` | page-buffer stat metadata and extended fix/unfix dimensions | `3c23ce773eb1694796ff004af13a0bc3512386ca464f00e91b6f47ed3b4a66a0` |
| `src/base/system_parameter.c` | buffer/LRU/flush/latch-timeout parameters | `0131061a8223b4cc5cede0ffe8dba27d9842574d3fe40a58f8f108c349e939d6` |

Local contextual material checked before source tracing:

- `/home/vimkim/gh/my-cubrid-docs/pgbuf-rebuild-spec/`, especially chapters 02, 04-10.
- `/home/vimkim/gh/my-cubrid-docs/pgbuf-analysis/e6ed61e_claude/` research notes and prior report; these are an earlier revision and were not used as primary evidence.
- Existing same-revision CUBRID packet for a narrower flush/AIO topic, used only as a lead and revalidated here.

## Presenter pressure points suggested by source

These are question seeds for the later quiz/grill author, not quiz artifacts:

1. Why is the buffer lock keyed by VPID different from the BCB latch, and why must a loader waiter re-search rather than receive the loader’s BCB directly?
2. Why is a successful fix count represented both globally (`atomic_latch.fcnt`) and per thread (`holder->fix_count`)? Give one bug each structure prevents.
3. Why does `waiter_exists` stop a new reader but allow the current reader-holder to reenter? What starvation/deadlock trade-off is encoded?
4. During READ-to-WRITE promotion with other readers, why does the promoter drop all its read fix count before blocking, and how is nested ownership restored?
5. Explain why `pgbuf_unfix()` can make a page *eligible* for replacement without evicting it, and list every independent condition that still blocks victimization.
6. Why does ordered heap fix need watchers rather than plain page pointers? What precisely becomes invalid when `page_was_unfixed=true`?
7. Contrast ordinary B-tree parent-child latch coupling with descending sibling traversal’s conditional abort. Why is one willing to wait and the other restart?
8. Why does redo use `RECOVERY_PAGE` even if allocation metadata temporarily says the page is deallocated? How does page LSA make redo idempotent?
9. At flush start, why clear DIRTY while setting FLUSHING instead of leaving DIRTY set until the write completes?
10. Why must WAL be forced to the copied page image’s LSA after the BCB mutex is released but before DWB/home submission?
11. How can a page be dirty again immediately after a successful flush, and which flags/LSAs distinguish the two generations?
12. Why can `EVICTED` legitimately appear without `FLUSHED_TO_DISK` immediately before it?
13. Why is `Num_data_page_flushed` a bad checkpoint oracle in this revision, despite its name?
14. Which clean-shutdown component actually guarantees data flush: `pgbuf_finalize()` or `log_final()`? Defend using call order.
15. Challenge the lock-free fix code: local design text claims a post-CAS VPID recheck, source has none. State the current safety premise and a test or proof obligation that could falsify it.
