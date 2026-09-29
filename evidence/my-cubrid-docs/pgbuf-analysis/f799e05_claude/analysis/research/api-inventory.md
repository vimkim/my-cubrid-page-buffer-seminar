# `page_buffer.h` interface inventory

Revision: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`  
Primary sources: `src/storage/page_buffer.h` (read in full) and complete reachable implementations in
`src/storage/page_buffer.c`; representative call sites are from the same revision.

## 1. Reading the Interface correctly

`PAGE_PTR` is not an owned allocation. For the ordinary API it is a borrowed pointer into a buffer control block
(BCB), made stable by a **fix count** and a page **READ or WRITE latch** held on behalf of the calling thread. A
successful `pgbuf_fix` adds one hold; the same thread must eventually consume each hold with `pgbuf_unfix` (or an API
whose `FREE` argument promises to do so). The pointer, its `VPID *`, and addresses into page data must not be used after
that release. The common happy path is therefore:

```c
PAGE_PTR page = pgbuf_fix (thread_p, &vpid, OLD_PAGE,
                           PGBUF_LATCH_WRITE, PGBUF_UNCONDITIONAL_LATCH);
if (page == NULL)
  {
    return er_errid ();
  }

/* Log, then modify page contents. */
pgbuf_set_dirty_and_free (thread_p, page); /* consumes the hold and nulls page */
```

The BCB mutex, hash-anchor mutex, LRU mutexes, and flush state are implementation synchronization, not locks a normal
caller acquires. The caller-facing concurrency objects are the fix/latch and, for heap pages, `PGBUF_WATCHER` ordering.
This boundary is visible in `pgbuf_fix_debug`/`pgbuf_fix_release`, which validates modes, finds or claims a BCB, obtains
the requested latch, installs a per-thread holder, and returns only after internal mutexes are released
(`page_buffer.c:2256-2679`, symbols `pgbuf_fix_debug`, `pgbuf_fix_release`). `pgbuf_unfix` removes the holder/fix and makes
an otherwise unheld page replaceable (`page_buffer.c:3071-3286`).

Classification used below:

- **General Interface**: normal storage-engine callers may use it while honoring the stated ownership/latch contract.
- **Specialized Interface**: safe only inside the named protocol (ordered heap access, temporary pages, cached scans,
  logging/recovery, boot, or monitoring).
- **Maintenance seam**: exported so server daemons/session/boot infrastructure can drive page-buffer internals; it is
  not a page-access API.
- **Debug/adapter**: build-mode wrapper, diagnostic callback, formatting helper, or generic hash callback.

## 2. Public vocabulary, modes, and macros

### Fetch and latch modes

| Interface | Caller condition and effect | Result / evidence |
|---|---|---|
| `OLD_PAGE` | Page is expected allocated. On miss, read it from disk; a `PAGE_UNKNOWN` page is an error. | Fixed page or `NULL`; `ER_PB_BAD_PAGEID` for a deallocated result. `page_buffer.h:172-187`; `page_buffer.c:2256-2679`. |
| `NEW_PAGE` | Disk/file allocation has already made the VPID valid; caller normally requests WRITE and initializes page type/content. A miss may be created directly without reading old contents. | Fixed page; `PAGE_UNKNOWN` is accepted. It does **not** itself allocate a disk page. Same evidence. |
| `OLD_PAGE_IF_IN_BUFFER` | Best-effort probe only; no I/O on miss. | `NULL` on a cache miss is normal and need not carry an error (`page_buffer.c:2344-2350`). |
| `OLD_PAGE_PREVENT_DEALLOC` | Existing page may race deallocation before its latch is acquired. | Temporarily raises the BCB avoid-deallocation counter, then drops that marker once latched (`page_buffer.c:2405-2408,2476-2480`). |
| `OLD_PAGE_DEALLOCATED` | Recovery expects `PAGE_UNKNOWN`; ordinary code must not use this to bypass allocation state. | Returns a deallocated page; used by deallocation undo (`page_buffer.c:15264-15312`). |
| `OLD_PAGE_MAYBE_DEALLOCATED` | Caller treats concurrent deallocation as an expected absence. | A `PAGE_UNKNOWN` result is unfixed and returns `NULL`; implementation sets warning `ER_PB_BAD_PAGEID`, while wrapper `pgbuf_fix_if_not_deallocated` translates expected absence to `NO_ERROR` (`page_buffer.c:2501-2525,15355-15403`). |
| `RECOVERY_PAGE` | Crash recovery may encounter new, normal, or deallocated pages; ordinary validation expectations do not apply. | Any allocation state is accepted (`page_buffer.h:185-186`; `page_buffer.c:2278-2285,2501-2508`). |
| `PGBUF_LATCH_READ`, `PGBUF_LATCH_WRITE` | Only modes accepted by `pgbuf_fix`. READ permits compatible readers; page-content mutation requires WRITE. | Invalid request mode asserts and returns `NULL` (`page_buffer.c:2279-2290`). |
| `PGBUF_UNCONDITIONAL_LATCH` | May wait according to transaction timeout; zero-wait transactions are internally converted to conditional. | `NULL` on interrupt, timeout, validation, I/O, or allocation/latch error (`page_buffer.c:2298-2311`). |
| `PGBUF_CONDITIONAL_LATCH` | Do not wait for an incompatible latch; use for skip/retry/deadlock avoidance. | `NULL` is an expected non-acquisition; callers must inspect their protocol/error state rather than assume I/O failure. |
| `PGBUF_LATCH_FLUSH` | Internal block mode only; a page can never be fixed in it. | Header contract: `page_buffer.h:189-203`. |

### Ownership and watcher macros

| Macro/type | Contract and use | Evidence |
|---|---|---|
| `FREE`, `DONT_FREE` | Boolean arguments controlling whether `pgbuf_flush`/`pgbuf_set_dirty` also release one hold. They do not mean heap-memory free. | `page_buffer.h:40-41`; consumers at `page_buffer.c:3566-3577,4921-4957`. |
| `pgbuf_unfix_and_init_after_check`, `pgbuf_unfix_and_init` | Consume one hold and set the caller lvalue to `NULL`; first form tolerates `NULL`, second expects a real page. | `page_buffer.h:64-77`. |
| `pgbuf_set_dirty_and_free` | Marks dirty, consumes one hold, then nulls the lvalue. It expands to two unbraced statements, so callers must use normal statement discipline around conditionals. | `page_buffer.h:388`. |
| `PGBUF_INIT_WATCHER`, `PGBUF_CLEAR_WATCHER`, `PGBUF_IS_CLEAN_WATCHER` | Caller owns watcher storage. Initialize before first attach/fix; a clean watcher has no links or page. Debug builds also stamp magic/call-site data. | `page_buffer.h:124-164`. |
| `PGBUF_WATCHER_SET_GROUP`, `PGBUF_WATCHER_COPY_GROUP`, `PGBUF_WATCHER_RESET_RANK` | Establish/copy the heap-header group and requested rank before an ordered fix. `COPY_GROUP` requires a non-null source group. | `page_buffer.h:94-122`. |
| `pgbuf_ordered_unfix_and_init` | If a watcher exists, checks that `page == watcher->pgptr`, performs ordered unfix, and clears both; otherwise performs ordinary unfix. | `page_buffer.h:79-92`. |
| `PGBUF_IS_ORDERED_PAGETYPE` | Ordered protocol is intentionally limited to `PAGE_HEAP` and `PAGE_OVERFLOW`. | `page_buffer.h:166-167`. |
| `PGBUF_IS_PAGE_CHANGED` | Compares current page LSA with a caller-saved reference LSA. Caller must still own/fix the page. | `page_buffer.h:169-170`. |
| `VPID_GET_FROM_OID`, `VPID_EQ_FOR_OIDS` | Pure conversion/same-page helpers; no page ownership effect. | `page_buffer.h:43-51`. |
| `PGBUF_PAGE_*_AS_ARGS`, `PGBUF_PAGE_STATE_*`, `PGBUF_PAGE_MODIFY_*` | Logging/format adapters. They call metadata accessors, so `pg` must remain fixed. | `page_buffer.h:53-61`. |
| `pgbuf_aligned_buffer`, `pgbuf_resizable_buffer` | Caller-owned stack/extensible aligned I/O-sized scratch buffers, not buffer-pool pages and needing no unfix. | `page_buffer.h:253-256`. |
| `vpid_Null_vpid`, `PGBUF_ORDERED_NULL_HFID`, `PGBUF_TEMP_LSA` | Shared null/sentinel values. `PGBUF_TEMP_LSA` is `(-2,-2)` and identifies non-WAL temporary pages. Callers must not mutate exported sentinel objects. | `page_buffer.h:43,94-95,258-260`; temp test at `page_buffer.c:17305-17319`. |

`PGBUF_PAGE_VPID_AS_ARGS` and related macros evaluate `pg` more than once. Expressions with side effects are therefore
not valid arguments.

## 3. Lifecycle, thread state, and private replacement domains

**Family contract.** These calls require page-buffer/server lifecycle sequencing, not page latches. They allocate or
tear down global state and connect thread/session state to per-thread holder and private-LRU structures.

| API (classification) | Preconditions, postconditions, ownership, result | Representative use / source evidence |
|---|---|---|
| `pgbuf_initialize`, `pgbuf_finalize` (**maintenance**) | Initialize after parameters/thread counts are ready and before page access. Success owns global BCB/hash/lock/LRU/holder/quota/monitor memory; failure calls `pgbuf_finalize` and returns `ER_FAILED`. Finalize requires quiesced users/daemons, destroys that state, clears holder anchors, and returns void. | Boot lifecycle. Definitions `page_buffer.c:1649-1926,1928-2122`. |
| `pgbuf_thread_variables_init` (**maintenance**) | `NULL` is a no-op. Otherwise enables private LRU if assigned and lazily points `m_holder_anchor` at this thread's holder slot. No ownership transfer/error. | Called when server worker/session state is connected (`connection/server_support.c:2082`, `session/session.c:2801`); definition `page_buffer.c:1546-1561`. |
| `pgbuf_assign_private_lru`, `pgbuf_release_private_lru` (**session seam**) | Assignment requires initialized quota state; returns a private index, or `-1` when quotas are disabled (despite the stale “NO_ERROR” comment). Session stores and later releases the index. Release tolerates invalid/disabled indices, decrements session count, may readjust quotas, and returns `NO_ERROR`. | `session/session.c:740,406`; definitions `page_buffer.c:14519-14629`. |
| `pgbuf_adjust_quotas` (**maintenance**) | Initialized pool only; scans activity and retunes private/shared quotas. No page pointer, caller cleanup, or result. Concurrent calls are suppressed by an internal atomic `is_adjusting`. | Maintenance daemon and assignment/release paths; definition `page_buffer.c:14260-14511`. |
| `pgbuf_hash_vpid`, `pgbuf_compare_vpid` (**adapter**) | Non-null VPID-compatible keys; hash size must be nonzero. Pure functions: modulo hash and lexicographic-ish comparison (`volid`, then `pageid`). | Generic hash-table callback use; `page_buffer.c:1611-1646`. These are not the pool's private mirrored hash fast path. |

## 4. Ordinary acquisition, promotion, and release

**Family contract.** On success the caller owns one additional current-thread hold and a READ/WRITE latch. On failure
there is no new hold. Each successful acquisition must be matched. A page may be fixed recursively by the same thread;
fix count, not pointer identity, determines how many releases are required.

| API (classification) | Preconditions / postconditions and latch rules | Result, cleanup, use, evidence |
|---|---|---|
| `pgbuf_fix` (`*_debug` or `*_release`) (**General Interface**) | Non-null valid VPID; mode is READ/WRITE; fetch/latch condition matches intent. Returns a stable borrowed page and records a holder. Caller must unfix once per success. Debug macro records file/line/function. | `PAGE_PTR` or `NULL`; error manager carries hard failures, but conditional/miss modes can make absence expected. File manager reads a header at `file_manager.c:1385`; definition `page_buffer.c:2256-2679`; wrappers `page_buffer.h:275-356`. |
| `pgbuf_fix_with_retry` (**General Interface, sparingly**) | Same as unconditional `pgbuf_fix`; `retry` counts only `ER_LK_UNILATERALLY_ABORTED`, `ER_LK_PAGE_TIMEOUT`, and `ER_PAGE_LATCH_TIMEDOUT`, not total attempts. Default-case errors stop, but `NO_ERROR` and `ER_INTERRUPTED` retry without consuming budget and can therefore loop without a bound from this argument. | Page or `NULL`; counted-budget exhaustion/non-retry error is replaced with `ER_PAGE_LATCH_ABORTED`. Caller unfixes success. `page_buffer.c:2125-2164`. |
| `pgbuf_fix_if_not_deallocated` / `_with_caller` (**General Interface for racing scans**) | Valid non-null VPID/output pointer. First checks disk sector reservation, then fixes with `OLD_PAGE_MAYBE_DEALLOCATED`; output is initialized `NULL`. | `NO_ERROR` + `*page == NULL` means expected deallocation; `NO_ERROR` + page means caller owns a hold; other code is a real error. B-tree leaf traversal: `btree.c:25023`; definition `page_buffer.c:15355-15403`. |
| `pgbuf_promote_read_latch` (`*_debug`/`*_release`) (**General Interface**) | `PAGE_PTR *` refers to a page held READ by the current thread. `PGBUF_PROMOTE_ONLY_READER` succeeds only if this holder is sole reader; `PGBUF_PROMOTE_SHARED_READER` may temporarily drop this thread's fixes and wait at the head for WRITE, during which another writer may change the page, so prior observations/page-derived addresses must be revalidated. | `NO_ERROR` means WRITE. `ER_PAGE_LATCH_PROMOTE_FAIL` is an expected contention/protocol rejection. On some internal blocking failures the function sets `*pgptr_p = NULL`, so caller must inspect the pointer before cleanup/use. `page_buffer.c:2849-3064`. |
| `pgbuf_unfix` (`*_debug`) (**General Interface**) | Current thread owns at least one hold on non-null page. Consumes one fix/holder count; after the last hold the page may enter LRU/replacement. Does not imply dirty or flush. | Void. Pointer becomes invalid to caller; prefer `pgbuf_unfix_and_init`. `page_buffer.c:3071-3286`. |
| `pgbuf_unfix_all` (**request cleanup/debug safety net**) | Called at request teardown. It expects no holds; each found hold is evidence of a leak (`assert(false)`), though release builds attempt cleanup. | Void; not a substitute for structured cleanup. `page_buffer.c:3288-3373`. |
| `pgbuf_get_fix_count`, `pgbuf_get_hold_count` (**diagnostic**) | Page must be fixed for first; thread/pool initialized for second. Snapshot values may change concurrently. | BCB global fix count and current-thread holder count respectively; no ownership change. `page_buffer.c:15043-15068`. |
| `pgbuf_has_perm_pages_fixed` (**lock-order guard**) | Current thread initialized. Checks holder list; `PAGE_QRESULT` is treated as non-permanent for this predicate. | Boolean used to assert lock/page ordering (`lock_manager.c:2312`); `page_buffer.c:11712-11734`. |
| `pgbuf_force_to_check_for_interrupts`, `pgbuf_is_log_check_for_interrupts` (**transaction seam**) | Global force setter has no page precondition. Checker needs a thread/transaction context. | Checker returns true and sets `ER_INTERRUPTED` when forced and interrupted. `log_tran_table.c:2889`; `page_buffer.c:5381-5410`. |

### Latchless temporary-file exception

`pgbuf_simple_fix`, `pgbuf_simple_unfix`, and `pgbuf_dealloc_temp_page` are **not** cheaper ordinary fixes. They form a
special protocol restricted to read-only temporary files.

| API | Contract | Evidence |
|---|---|---|
| `pgbuf_simple_fix(thread,vpid,need_fix)` | Asserts a temporary volume. On hit it increments only `fcnt`: no page latch and no LRU mutex. If absent and `need_fix == false`, returns `NULL`; if true, may claim/read a BCB. Success must be released only by `pgbuf_simple_unfix` (or the temp dealloc path). It cannot safely coexist with writes or general FIX/LATCH access. | `query_manager.c:2733`; `page_buffer.c:2688-2791`. |
| `pgbuf_simple_unfix` | Input came from simple fix; decrements only `fcnt`. It neither performs ordinary holder cleanup nor nulls caller storage. | `page_buffer.c:2794-2811`. |
| `pgbuf_dealloc_temp_page(pg,need_free)` | Temporary page is held under the simple protocol; sets type unknown, clears page flags and dirty state. With `need_free`, consumes the simple fix and asserts final `fcnt == 0`. | Returns `NO_ERROR`; `page_buffer.c:2814-2842`. |

## 5. Ordered heap/overflow ownership

**Family contract.** Ordered access prevents page-latch deadlocks across heap header/normal/overflow pages by sorting on
group (heap header VPID), rank, and VPID. The caller owns every `PGBUF_WATCHER` object and must initialize it. The
watcher's `pgptr` is the authoritative page after any ordered call. Reordering may unfix and refix pages; therefore a
saved record pointer/slot pointer derived from an older `PAGE_PTR` must be recomputed whenever `page_was_unfixed` is
true. Only ordered page types are supported (`page_buffer.h:219-249`; sort/fix implementation
`page_buffer.c:12193-13068`).

| API (all **specialized**) | Preconditions, postconditions, cleanup | Error/result and use / evidence |
|---|---|---|
| `pgbuf_ordered_fix` (`*_debug`/`*_release`) | Clean initialized watcher with rank/group; `req_watcher->pgptr == NULL`; requested type is heap/overflow. Fast path tries conditional when other pages are held; slow path temporarily releases out-of-order watched pages, protects them from deallocation, sorts, and refixes. Success stores the fixed page in watcher. | Returns `NO_ERROR` or an error. If restoring any page fails, requested page is unfixed and **some old watchers may be restored while others remain `NULL`**; caller must inspect every watcher. `page_was_unfixed` records refix. Locator use `locator_sr.c:12788`; contract `page_buffer.c:12250-12267`. |
| `pgbuf_ordered_unfix` | Watcher currently belongs to a current-thread holder. Removes watcher, clears its page/link/rank state, then consumes one underlying fix. | Void; watcher storage remains caller-owned/reusable. `page_buffer.c:13479-13535`. |
| `pgbuf_ordered_set_dirty_and_free` | Watcher has a fixed page, normally WRITE. Marks dirty without freeing, then ordered-unfixes so watcher bookkeeping is preserved. | Void; consumes hold and clears watcher page. `page_buffer.c:13808-13817`. |
| `pgbuf_ordered_callback` | All currently held ordered pages must have watchers and `fix_count == watch_count`; callback must neither require those pages nor leave any page fixed. Non-ordered held pages remain fixed. | Temporarily releases ordered pages, runs callback, then restores in global order even if callback returns error. Refix failure overrides callback status and may leave watcher pages null. `page_buffer.c:13081-13400`. |
| `pgbuf_attach_watcher` | Page is already fixed by current thread, valid HFID supplied, watcher storage clean. It infers heap-header vs normal rank and attaches without adding a fix. | Void; from then on release through ordered API. `page_buffer.c:13624-13662`. |
| `pgbuf_replace_watcher` | Old watcher attached; new watcher clean/initialized. | Transfers group/rank/latch association without changing the fix count; old becomes clean. `page_buffer.c:13759-13799`. |
| `pgbuf_get_condition_for_ordered_fix` | Both VPIDs belong to supplied heap; used only when full ordered fix cannot be used (documented vacuum case). | Returns CONDITIONAL if new page sorts before the held one, otherwise UNCONDITIONAL. `page_buffer.c:13832-13872`. |
| `pgbuf_watcher_init_debug`, `pgbuf_is_page_fixed_by_thread` | Debug-build helpers only; valid watcher/thread/VPID. | Stamp watcher provenance or inspect current thread holder list. `page_buffer.c:13879-13944`. |

## 6. Mutation, identity, page type, LSA, and TDE

**Family contract.** Unless explicitly described as a read-only accessor, mutation requires a current WRITE-latched
fixed page. Accessors rely on the page remaining fixed; they do not take a new hold. Setting dirty is distinct from
logging, setting page LSA, and flushing.

| API (classification) | Caller contract and state transition | Result / use / evidence |
|---|---|---|
| `pgbuf_set_dirty` (`*_debug`) (**General Interface**) | Fixed page whose bytes/header were modified; normally WRITE latch. Sets BCB dirty. `FREE` additionally consumes one hold; `DONT_FREE` preserves it. | Void; it does not create WAL or change page LSA. Vacuum uses both forms (`vacuum.c:253,429`); `page_buffer.c:4921-4957`. |
| `pgbuf_get_lsa` (**General read accessor**) | Page fixed. | Borrowed pointer into page header, valid only while fixed; `NULL` only under debug pointer validation failure. `page_buffer.c:4964-4984`. |
| `pgbuf_set_lsa` (`*_debug`) (**log/recovery only**) | Fixed page, non-null LSA, log/recovery protocol owns correctness. Updates page LSA and initializes `oldest_unflush_lsa`. Already-temp-LSA and auxiliary pages reject it; a temporary-volume page is first reset to temp LSA and an active transaction is rejected, while non-active recovery context may continue. Release builds defensively mark dirty. | Returns input LSA on success and `NULL` for the rejection paths/validation failure. Logging use `log_manager.c:2217`; explicit restriction and implementation `page_buffer.c:4992-5083`. |
| `pgbuf_reset_temp_lsa`, `pgbuf_set_lsa_as_temporary`, `pgbuf_is_lsa_temporary` (**temporary/debug**) | Page fixed. Reset writes `PGBUF_TEMP_LSA`; `set_lsa_as_temporary` also marks dirty. Logging must not be done to such a page. Predicate also recognizes volumes whose disk purpose is temporary. | Void/boolean, no ownership change. `page_buffer.c:5090-5096,5421-5432,5520-5537`. |
| `pgbuf_set_page_ptype` (**General initialization/recovery**) | Fixed, normally WRITE; type in valid enum. Sets VPID/header defaults if needed and updates `ptype`; caller must separately log/dirty as required. | Void; new-page callers must not leave persistent pages `PAGE_UNKNOWN`. `file_manager.c:3499` plus page initialization paths; `page_buffer.c:5482-5512`. |
| `pgbuf_get_page_ptype` | Fixed page. | `PAGE_TYPE`, or `PAGE_UNKNOWN` on debug pointer rejection. `page_buffer.c:5306-5331`. |
| `pgbuf_check_page_ptype`, `pgbuf_check_page_type_no_error` (**validation**) | Fixed page and expected type. Unknown type is accepted by the internal check. First form treats mismatch as a programming assertion; second is a quiet predicate. | Boolean; `page_buffer.c:11164-11237`. |
| `pgbuf_get_vpid` | Fixed page and non-null output. | Copies VPID; copy outlives the fix. `page_buffer.c:5210-5233`. |
| `pgbuf_get_vpid_ptr` | Fixed page. Caller must not modify result. | Borrowed pointer to BCB identity; invalid immediately after unfix/victim reuse. Explicit warning `page_buffer.c:5240-5257`. |
| `pgbuf_get_page_id`, `pgbuf_get_volume_id`, `pgbuf_get_volume_label`, `pgbuf_get_latch_mode` | Fixed page. Volume-label result is `PEEK` storage owned by file I/O. | Scalar/borrowed label; no ownership change. `page_buffer.c:5264-5372`. |
| `pgbuf_set_tde_algorithm` (**General metadata mutation**) | Fixed WRITE page; TDE subsystem loaded unless selecting NONE. If algorithm changes, optionally logs undo/redo unless `skip_logging`, rewrites encryption flag, and marks page dirty without freeing. | Void. File allocation supplies file algorithm (`file_manager.c:5533`); `page_buffer.c:5106-5152`. |
| `pgbuf_get_tde_algorithm` | Fixed page; encryption bits must be mutually exclusive. | NONE/AES/ARIA; no ownership change. `page_buffer.c:5179-5203`. |
| `pgbuf_rv_set_tde_algorithm` (**recovery callback**) | `rcv->pgptr` fixed by recovery; data length is one `TDE_ALGORITHM`. | Applies without logging and returns `NO_ERROR`; `page_buffer.c:5159-5172`. |

## 7. Copy helpers and cached-scan copies

| API (classification) | Preconditions / ownership / synchronization | Result, use, evidence |
|---|---|---|
| `pgbuf_copy_to_area` (**specialized `PAGE_AREA` reader**) | Caller owns `area`; range must fit `DB_PAGESIZE`. Resident fast path holds only internal BCB mutex during `memcpy`, not a caller page latch. With `do_fetch == true`, a miss is fixed READ/copied/unfixed. | Returns `area` or `NULL`. External sort calls it (`external_sort.c:5966`). Definition `page_buffer.c:4701-4826`. **Current-source caveat:** header comment says buffering occurs when `do_fetch` is false, but executable code fetches when true. With false on a miss, the direct-I/O branch is under `ENABLE_UNUSED_FUNCTION`; normally the function returns the unchanged `area` without copying. |
| `pgbuf_copy_from_area` (**specialized `PAGE_AREA` writer**) | Range fits; caller owns source `area`. Current normal build always fixes `NEW_PAGE` WRITE, sets `PAGE_AREA` and TDE, copies, calls `log_skip_logging`, dirties and frees. | Returns `area` or `NULL`. `do_fetch` affects only an `ENABLE_UNUSED_FUNCTION` direct-write branch, so it is effectively ignored in normal builds. Do not use for WAL-related page changes. `page_buffer.c:4833-4912`. |
| `pgbuf_copy_buffer_alloc` / `free` (**cached heap scan**) | Alloc returns a heap-owned opaque dummy-BCB+iopage buffer or `NULL` for OOM; caller owns handle and must free exactly once (`free(NULL)` is safe). No page-buffer fix/latch is acquired. | Heap scan cache lifecycle; `page_buffer.c:927-961`, header `page_buffer.h:512-519`. |
| `pgbuf_copy_page_for_scan` | Source page is currently fixed/latching prevents source change; handle is non-null and privately owned by caller (no internal synchronization). Copies exactly `IO_PAGESIZE` and source VPID. | Void. Heap scans use at `heap_file.c:7638,7977`; `page_buffer.c:964-975`. |
| `pgbuf_copy_buffer_get_page_ptr` | Live handle. | Returns a `PAGE_PTR`-shaped pointer into the copy. It is **not fixed pool ownership**: do not `pgbuf_unfix`, dirty, flush, or retain past handle free. `page_buffer.c:978-981`. |

## 8. Flush, durability, and invalidation

**Family contract.** Dirtying, page-LSA advancement, WAL force, page copy/encryption, DWB/file write, and release are
separate steps. The internal flush copies the page while protected, marks `FLUSHING` while clearing the old dirty bit,
forces log through the copied page LSA, then submits through DWB or performs direct file I/O. `dwb_add_page()` may return
after slot enqueue, before later DWB block/home writes. A concurrent post-copy writer can set DIRTY again, so successful
page-buffer-layer flush need not mean “currently clean” or “physically persisted.” Failed direct/ordinary I/O restores the prior dirty flag and
`oldest_unflush_lsa` (`page_buffer.c:10733-10969`; flag transitions `page_buffer.c:16085-16132`).

| API (classification) | Preconditions, postconditions, ownership/latch | Result / use / evidence |
|---|---|---|
| `pgbuf_flush_with_wal` (**General Interface when synchronous durability is required**) | Page fixed by current thread; source comment says CUBRID callers hold WRITE, while assertion technically accepts held READ/WRITE. Flushes only if dirty and preserves the caller hold. | Same page on success, `NULL` on failure. Overflow path checks failure (`overflow_file.c:672`); `page_buffer.c:3589-3621`. |
| `pgbuf_flush` (**legacy convenience**) | Same fixed-page requirement; performs WAL-aware flush. `FREE` consumes the hold even after internal failure assertion, so caller must not use pointer afterwards. | Void and therefore cannot report I/O failure; source explicitly recommends against it. `page_buffer.c:3566-3577`. |
| `pgbuf_flush_if_requested` (**permanently latched-page protocol**) | Current thread owns WRITE latch on a deliberately long-lived page and calls periodically. | If async-flush flag is set, synchronously services it; preserves fix. `page_buffer.c:3629-3655`. |
| `pgbuf_flush_all`, `pgbuf_flush_all_unfixed`, `pgbuf_flush_all_unfixed_and_set_lsa_as_null` (**log/recovery maintenance**) | Initialized/quiescent-enough pool; `NULL_VOLID` selects all volumes. First may flush fixed pages; second skips fixed; third also mutates selected page LSAs to NULL before flush and is recovery-specific. | Best-effort scan, returns `NO_ERROR` or `ER_FAILED`; does not grant/release caller page ownership. `page_buffer.c:3663-3758`. |
| `pgbuf_flush_checkpoint` (**checkpoint only**) | Non-null `flush_upto_lsa` and `smallest_lsa`; optional previous redo LSA/count. Forces WAL first, gathers dirty non-temp pages whose `oldest_unflush_lsa` is in range, sorts for sequential writes. | Error code; writes smallest remaining dirty LSA and optional flush count. `log_page_buffer.c:7011`; `page_buffer.c:4185-4320`. |
| `pgbuf_flush_victim_candidates` (**flush daemon**) | Flush-daemon/single-thread fallback context; valid tracker and `stop` output. Selects cold dirty LRU candidates, respects WAL and current fix/hot state, but does not decache them. | Error code; `*stop` tells daemon iteration it has flushed enough/no useful candidates. Driven at `page_buffer.c:17028-17031`; definition `page_buffer.c:3870-4170`. |
| `pgbuf_invalidate` (**specialized post-commit/temp cleanup**) | Caller holds the page WRITE and exactly one fix for immediate invalidation. If more than one fix exists it only consumes one hold. Dirty page is synchronously flushed before disassociation. Persistent-page invalidation must be a post-commit operation; temp pages may be invalidated anytime. | `NO_ERROR`/`ER_FAILED`; always consumes the caller's hold. It may decline actual invalidation if page was refixed/changed/avoid-victim. `page_buffer.c:3380-3476`. |
| `pgbuf_invalidate_all` (**boot/recovery/volume maintenance**) | Volume must not be concurrently in normal use; `NULL_VOLID` selects all. Scans only currently unfixed pages, flushes dirty pages, skips refixed/avoid-victim pages. | Error code; fixed pages can remain resident, so name does not guarantee an empty volume cache under concurrency. Boot call `boot_sr.c:535`; `page_buffer.c:3484-3559`. |

## 9. Allocation state and recovery callbacks

| API (classification) | Preconditions / state and ownership effects | Result / evidence |
|---|---|---|
| `pgbuf_log_new_page`, `pgbuf_log_redo_new_page` (**allocation/logging**) | Newly fixed WRITE page, known non-unknown type, positive data length. First appends undo/redo full-page record; second redo-only. Both mark dirty but preserve the fix. | Void; `page_buffer.c:15103-15127`. |
| `pgbuf_rv_new_page_redo`, `pgbuf_rv_new_page_undo` (**recovery**) | Recovery supplies fixed page; redo length fits page and type is in `rcv->offset`. | Redo copies bytes, sets type, dirty; undo sets `PAGE_UNKNOWN`, dirty. Both preserve recovery's fix and return `NO_ERROR`; `page_buffer.c:15133-15173`. |
| `pgbuf_dealloc_page` (**file manager**) | Current thread has the sole (`fcnt == 1`) WRITE fix on an allocated page. Logs deallocation undo/redo, sets type unknown, clears TDE flags, dirties and moves toward LRU bottom. | Void and **consumes the fix itself**. Callers must null/stop using pointer. File manager calls `file_manager.c:4055`; `page_buffer.c:15182-15237`. |
| `pgbuf_rv_dealloc_redo` | Recovery-fixed page. | Sets unknown/NONE TDE, dirty, preserves fix, returns `NO_ERROR`; `page_buffer.c:15245-15257`. |
| `pgbuf_rv_dealloc_undo` | Logical undo record contains VPID/type/flags; it fixes the deallocated page itself using `OLD_PAGE_DEALLOCATED`. | Restores type/flags, writes compensation record, dirties and frees; returns error if refix fails. `page_buffer.c:15264-15312`. |
| `pgbuf_rv_dealloc_undo_compensate` | Recovery already supplied `rcv->pgptr` and valid undo payload. | Restores type/flags, returns `NO_ERROR`; caller/recovery retains fix. `page_buffer.c:15314-15348`. |
| `pgbuf_rv_flush_page`, `pgbuf_rv_flush_page_dump` | Recovery flush callback expects `rcv->pgptr == NULL` and data holding one VPID; dump expects same payload and valid `FILE *`. | Missing/deallocated page is cleared to success. Otherwise callback fixes WRITE, appends dummy log, dirties, synchronously flushes, unfixes. Dump only prints. `page_buffer.c:14896-14947`. |

## 10. Replacement, daemons, vacuum hints, and I/O pressure

These are **internal-but-exported maintenance seams**. Callers do not own returned pages, and normal storage code should
not call them to influence replacement.

| API | Contract / result | Driver and evidence |
|---|---|---|
| `pgbuf_direct_victims_maintenance` | Single-threaded maintenance use; round-robin searches private/shared LRUs and assigns at most a small batch to waiting allocators. Void. | Page maintenance daemon; `page_buffer.c:9617-9656,16997-17009`. |
| `pgbuf_keep_victim_flush_thread_running` | Server mode; reads victim-wait queues/hit-ratio heuristic. | Boolean loop condition for page flush daemon, `page_buffer.c:15414-15421,17020-17034`. |
| `pgbuf_assign_flushed_pages` | Server post-flush consumer; drains flushed-BCB queue, validates each candidate under BCB mutex, may directly hand it to a waiter, clears flushing and wakes waiters. | Returns whether queue had work; post-flush daemon `page_buffer.c:15496-15557,17072-17085`. |
| `pgbuf_daemons_init`, `pgbuf_daemons_destroy` | Server manager initialized; call once in lifecycle and destroy after work quiesces. Create/destroy maintenance, flush, post-flush, and flush-control daemons. | Boot initializes at `boot_sr.c:2419`; `page_buffer.c:17235-17256`. |
| `pgbuf_notify_vacuum_follows` | Page currently fixed; sets `TO_VACUUM` hint. No latch/ownership change and no guarantee of residency. A vacuum worker fixing the page clears the hint. | Log/B-tree use `log_manager.c:2225`, `btree.c:28300`; `page_buffer.c:16196-16218`. |
| `pgbuf_is_io_stressful` | Snapshot heuristic; server reports low-priority victim waiters, non-server always false. | Boolean advisory only; `page_buffer.c:16618-16629`. |
| `pgbuf_flush_control_from_dirty_ratio` | Initialized pool; reads dirty counter and static previous value without caller locking. | Returns suggested *increase* in adaptive flush rate, not a status/error. `page_buffer.c:14853-14889`. |

## 11. Validation, wait-state queries, observability, and SHOW scan

| API (classification) | Preconditions and semantics | Result / evidence |
|---|---|---|
| `pgbuf_is_valid_page` (**disk validation**) | Valid VPID/volume context. Calls sector-reservation check; `no_error == false` sets fatal `ER_PB_BAD_PAGEID` and asserts for invalid. Despite stale comment, it is not a no-op in release. | `DISK_VALID`, `DISK_INVALID`, or `DISK_ERROR`; `page_buffer.c:11077-11103`. |
| `pgbuf_has_any_waiters` | Page fixed/stable. Internally locks BCB and excludes flush waiters. | Snapshot boolean; non-server false. `page_buffer.c:14674-14694`. |
| `pgbuf_has_any_non_vacuum_waiters` | Page fixed/stable. Traverses waiter list without taking BCB mutex, so result is advisory/racy. | Boolean; non-server false. `page_buffer.c:14701-14726`. |
| `pgbuf_has_prevent_dealloc` | Page fixed/stable. Reads packed avoid-deallocation count without BCB lock. | Advisory boolean; non-server false. `page_buffer.c:14733-14743`. |
| `pgbuf_peek_stats` | Every output pointer non-null; initialized pool. Performs intentionally unlocked BCB/flag snapshots. | Populates counts; approximate under concurrency, no error. `page_buffer.c:14748-14847`. **Header naming drift:** the 13th–15th output names do not match definition semantics; see unknowns. |
| `pgbuf_daemons_get_stats` | `stats_out` has room for four daemon statistic blocks. | Void; fills available server daemon stats, non-server no-op. `page_buffer.c:17259-17285`. |
| `pgbuf_get_page_type_for_stat` | Fixed page. For detailed B-tree metrics it may inspect B-tree page content. | `PERF_PAGE_TYPE`; no ownership change. `page_buffer.c:15074-15094`. |
| `pgbuf_dump_if_any_fixed` | `CUBRID_DEBUG` only; pool initialized. | Dumps leaked fixed pages; debug/finalize diagnostic. `page_buffer.c:11320-11358`. |
| `pgbuf_start_scan` | SHOW framework passes `ptr` output and owns eventual SHOW context cleanup; serialized by show-status mutex in server. Input `type/arg_values/arg_cnt` are currently unused. | Builds one 19-column `SHOW PAGE BUFFER STATUS` row, returns error and leaves `*ptr == NULL` on failure. Registered by `show_scan.c:235`; `page_buffer.c:17411-17579`. |

## 12. Representative end-to-end caller patterns

| Caller path | Interface composition and contract lesson | Evidence |
|---|---|---|
| File allocation | Disk/file manager allocates VPID, `pgbuf_fix(...NEW_PAGE, WRITE...)`, initializes page/TDE, logs, dirties, releases. `NEW_PAGE` is buffer materialization, not disk allocation. | `file_manager.c:3499,5533`; APIs above. |
| B-tree scan racing deallocation | `pgbuf_fix_if_not_deallocated` separates expected `NO_ERROR + NULL` from a real error and a held page. | `btree.c:25023,25742,26190`. |
| Heap multi-page update | Watchers encode heap group/rank; ordered fix may refix existing pages, so callers must re-derive page-local addresses after `page_was_unfixed`. | `locator_sr.c:12788`; ordered implementation `page_buffer.c:12250-13068`. |
| Logged mutation | Log manager appends record and calls `pgbuf_set_lsa`; caller modifies bytes, then `pgbuf_set_dirty`. A later flush forces WAL through copied page LSA. | `log_manager.c:2217-2225`; `page_buffer.c:4996-5083,10733-10969`. |
| Checkpoint | Log layer supplies cutoff, page buffer forces WAL, batches/sorts eligible dirty pages, reports earliest remaining dirty LSA. | `log_page_buffer.c:7010-7012`; `page_buffer.c:4185-4320`. |
| Vacuum cooperation | Log/B-tree set `TO_VACUUM`; vacuum worker fix clears hint. Vacuum uses ordinary dirty/free rules and may query non-vacuum waiters to yield. | `log_manager.c:2225`, `vacuum.c:253,429`; `page_buffer.c:2666-2670,16196-16218`. |
| Boot/recovery volume transition | `pgbuf_invalidate_all` flushes/disassociates currently unfixed pages; it does not forcibly revoke live owners. | `boot_sr.c:535`, `log_recovery.c:5124`; `page_buffer.c:3484-3559`. |
| Cached heap scan | Fixed source is copied into caller-owned opaque buffer; scan can release source and read copy, but must not treat copy as a fixable/dirty pool page. | `heap_file.c:7638,7977`; `page_buffer.c:927-981`. |

## 13. Coverage accounting and unresolved points

### Method and count

The header was read linearly from line 1 through 521. I extracted every distinct `pgbuf_*(` token, then collapsed
debug/release implementation spellings behind the public macro (`pgbuf_fix_debug` + `pgbuf_fix_release` => logical
`pgbuf_fix`, and likewise for ordered fix/callback, promotion, unfix, invalidate, watcher attach/replace, dirty, and
LSA). I also counted public statement macros such as `pgbuf_set_dirty_and_free` as logical callable APIs.

- At the concrete declaration level there are **106 distinct function names**, counting both sides of conditional
  debug/release declarations. **105/106** resolve to `page_buffer.c`; none resolve to another source file. The sole
  unmatched declaration is below.
- At the caller-contract level there are **95 logical callable interfaces** after collapsing the 12 debug/release name
  pairs and adding the public `pgbuf_set_dirty_and_free` statement macro. **94/95** reach implementation code and are
  covered above, grouped where they share one contract.
- The header also exposes **12 named types** (six enums, the ordered-group alias, watcher struct, callback type, two
  aligned-buffer aliases, and the opaque copy-buffer handle) and **38 unique API macro names** excluding the include
  guard. Conditional duplicate spellings were counted once.
- In addition, the inventory covers the two public boolean constants, three exported/sentinel objects, VPID helpers,
  six state-format macros, three unfix helpers, watcher initialization/group/rank helpers, the changed-page predicate,
  the two buffer aliases, and all public enums/struct semantics that affect ownership.
- Internal `static` functions are not inventoried as APIs, but complete implementations were traced where required to
  establish latch, WAL, dirty/re-dirty, victim, and cleanup behavior.

### Unknowns, drift, and hazards worth carrying into the final report

1. **Declared but not implemented:** release builds expose macro `pgbuf_fix_without_validation` and declaration
   `pgbuf_fix_without_validation_release` (`page_buffer.h:320-326`), but repository-wide search finds no definition or
   call site at this revision. It would become a link error if called. Debug builds expose no counterpart. Treat it as
   dead/incomplete Interface, not an available bypass.
2. **`pgbuf_copy_to_area` comment/code disagreement:** header/implementation prose says a miss is buffered when
   `do_fetch` is false, but executable code fixes only when true (`page_buffer.c:4739-4760`). With false, the direct I/O
   body is normally compiled out and a miss returns `area` without filling it. This is a correctness hazard, not merely
   documentation wording.
3. **`pgbuf_copy_from_area` dormant option:** outside `ENABLE_UNUSED_FUNCTION`, `do_fetch` has no effect; function
   always goes through `NEW_PAGE` buffer fix and skip-logging flow (`page_buffer.c:4840-4909`). Callers must not infer a
   supported direct-I/O mode from the parameter/comment.
4. **`pgbuf_peek_stats` prototype-name drift:** header calls outputs 13–15 `alloc_bcb_waiter_low`, `lfcq_big_prv_num`,
   `lfcq_prv_num` (`page_buffer.h:449-454`), while the definition interprets the same positions as
   `flushed_bcbs_waiting_direct_assign`, `lfcq_big_prv_num`, `lfcq_prv_num` and has `lfcq_shr_num` as position 16
   (`page_buffer.c:14748-14847`). C type compatibility is unchanged, but name-based documentation can mislabel values.
5. **Approximate predicates:** waiter/prevent-dealloc/stat APIs deliberately expose snapshots, some without BCB locks.
   They are suitable for scheduling/diagnostics, not correctness checks that authorize deallocation or mutation.
6. **Comments sometimes overstate debug-only behavior:** `pgbuf_is_valid_page`, page-type setters/checks, and temporary
   LSA helpers have historical “debug” wording but execute in release too. Classification above follows code, not the
   stale prose.
7. **No ABI/fairness claim:** exact waiter fairness, timeout timing, and on-disk compatibility were outside scope. The
   inventory specifies observable ownership/error paths only to the extent fixed by this revision's implementation.
