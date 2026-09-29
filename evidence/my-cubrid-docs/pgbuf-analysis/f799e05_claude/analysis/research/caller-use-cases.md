# Caller-facing page-buffer use cases

## Evidence frame

- Source root: `/home/vimkim/gh/cb/pgbuf-analysis`
- Pinned revision: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
- Scope: representative complete paths from heap, B-tree, file/disk, log/recovery, vacuum, boot, and page-buffer daemons into interfaces declared by `src/storage/page_buffer.h`.
- Method: locate call sites with `rg`, identify the enclosing symbol, then read the complete function and its directly relevant helper/callback functions. This packet is intentionally representative, not an exhaustive call-site catalog.

## Contract vocabulary visible at the boundary

The header itself explains why callers need variants rather than one generic pin call:

- `PAGE_FETCH_MODE` distinguishes a validated old page, a newly allocated page that can be created in memory, an in-buffer-only probe, a pin that prevents deallocation, an expected deallocated page, a maybe-deallocated page, and a recovery page that may have any allocation state (`src/storage/page_buffer.h:172-187`).
- `PGBUF_LATCH_CONDITION` distinguishes a caller willing to wait from a caller that must fail/reorder/retry rather than wait (`src/storage/page_buffer.h:199-203`). Promotion separately distinguishes “I must be the only reader” from “shared readers are allowed” (`src/storage/page_buffer.h:205-209`).
- Ordered heap/overflow access has semantic ranks—header, normal heap, overflow—and a heap-header VPID group, not just a global VPID sort (`src/storage/page_buffer.h:219-243`). A watcher records both its current page and whether ordered fixing temporarily unfixed/refixed it (`page_was_unfixed`).
- `pgbuf_simple_fix` is explicitly restricted to reading temporary files (`src/storage/page_buffer.h:270-273`).
- Successful ordinary fixes transfer a page hold that must be released. Ordered fixes transfer ownership into the watcher. Several specialized consumers instead consume the hold themselves: `pgbuf_set_dirty(..., FREE)`, `pgbuf_dealloc_page`, and `pgbuf_dealloc_temp_page(..., true)`.

## Representative paths at a glance

| Use case | Complete caller path | Interface choice and ownership result |
|---|---|---|
| Normal heap insert | `heap_insert_logical` -> `heap_get_insert_location_with_lock` -> `heap_find_bestpage`/bestspace -> ordered watcher -> `heap_insert_physical` -> heap log -> `pgbuf_set_dirty` -> watcher replacement or ordered unfix | Ordered watcher because heap operations can already hold related heap/header/overflow pages. The page remains write-latched across physical mutation, logging, and dirty marking. A scan cache may inherit the watcher instead of releasing the page. |
| Vacuum of an interrupted heap page | `vacuum_heap_page` -> `pgbuf_fix_if_not_deallocated` -> type recheck -> vacuum/log/dirty -> optional `heap_remove_page_on_vacuum` | “Not deallocated” is an expected result, not an error. A reused `PAGE_FTAB` is also treated as already completed work. |
| Vacuum heap-page removal | `vacuum_heap_page` -> `heap_remove_page_on_vacuum` -> attach current-page watcher -> ordered fixes of header/prev/next -> revalidation -> logged link changes -> dirty -> ordered unfix current -> `file_dealloc` | Ordered fixing may temporarily release/refetch the candidate; the caller checks `page_was_unfixed`, refreshes its pointer, and revalidates emptiness. Physical file deallocation begins only after releasing the page being removed. |
| B-tree insert and split | `btree_insert` -> `btree_insert_internal` -> `btree_search_key_and_apply_functions` -> `btree_fix_root_for_insert` / `btree_split_node_and_advance` -> key mutation -> log -> dirty -> traversal cleanup | Optimistic read latches on non-leaves, write latch on leaves. Promotions avoid pessimistic write-latching of the full path; a failed promotion changes the mode to write and restarts from root. |
| B-tree page allocation | `btree_get_new_page` -> `file_alloc` -> `pgbuf_fix(... NEW_PAGE, WRITE, UNCONDITIONAL)` -> `btree_initialize_new_page` -> log -> dirty -> TDE assignment -> return fixed page | `NEW_PAGE` avoids a disk read for a file-manager-allocated VPID. The initialization callback establishes page type/layout and logging before the still-fixed page is returned to the B-tree splitter. |
| Temporary-file teardown | `file_destroy` mapping -> `file_sector_map_dealloc_temp` -> `pgbuf_simple_fix(..., need_fix=false)` -> `pgbuf_dealloc_temp_page(..., need_free=true)` | Teardown only cares about temporary pages already resident in the pool; it deliberately does not fetch missing pages from disk. The deallocation helper consumes/releases a found simple hold. |
| Permanent page deallocation | `file_dealloc` -> append `RVFL_DEALLOC` postpone -> commit/run-postpone -> `file_rv_dealloc_on_postpone` -> `file_rv_dealloc_internal` -> `file_perm_dealloc` -> `pgbuf_dealloc_page` | Runtime deallocation is postponed so the page cannot be reused before commit. The actual buffer transition logs the old page type/flags, marks the type unknown/dirty, moves it toward the LRU bottom, and consumes the sole fix. |
| Volume format/reset | `disk_format` -> force earlier format log -> raw `fileio_format` -> `pgbuf_fix(... NEW_PAGE)` header -> logged initialization -> temporary-LSA conversion -> flush/invalidate before direct volume reset | The buffer pool owns page images while formatted metadata is being built. Direct raw reset is allowed only after dirty pages are flushed and all volume buffers invalidated. |
| Fuzzy checkpoint | `logpb_checkpoint` -> flush append log -> append start-checkpoint -> `pgbuf_flush_checkpoint` -> `fileio_synchronize_all` -> checkpoint transaction table/end record -> flush log/header -> volume-header checkpoint/sync | The checkpoint interface takes a cutoff LSA and returns the smallest redo LSA; it is not “flush every dirty page.” WAL/log flushing precedes qualifying data-page persistence. |
| Crash redo | redo scan -> sync or per-page async dispatch -> `log_rv_redo_record_sync` -> `log_rv_fix_page_and_check_redo_is_needed` -> `pgbuf_fix(... RECOVERY_PAGE, WRITE)` -> recovery callback -> `pgbuf_set_lsa` -> scope-exit unfix | Recovery bypasses normal allocation-state assumptions. Page LSA makes redo idempotent; the fixed page is always released by scope cleanup, including error returns. |
| Recovery of page creation/deallocation | `RV_fun` dispatch -> `pgbuf_rv_new_page_*` / `pgbuf_rv_dealloc_*` | New-page redo restores bytes/type then dirties. Deallocation redo clears type/TDE. Logical deallocation undo fixes with `OLD_PAGE_DEALLOCATED`, restores type/flags, emits a compensation record, and dirty-frees. |
| Boot and daemons | `boot_restart_server` -> `logtb_define_trantable` -> `pgbuf_initialize`; later `pgbuf_daemons_init`; after recovery `BO_ENABLE_FLUSH_DAEMONS`; shutdown/error -> disable/destroy -> `log_final`/`pgbuf_finalize` | Pool initialization precedes file manager initialization. Daemon objects may exist during recovery but their tasks are gated until recovery is finished. Shutdown stops page-buffer daemons before finalizing the log/pool. |

## 1. Heap insert: ordered ownership, log-before-dirty, and cache handoff

`heap_insert_logical` is a compact representative of the normal mutation protocol (`src/storage/heap_file.c:23120-23325`):

1. It normalizes the record, acquires the class lock, and asks `heap_get_insert_location_with_lock` for a page/slot (`src/storage/heap_file.c:23138-23227`).
2. Location selection uses `heap_find_bestpage`, which delegates to the in-memory bestspace structure while passing a `PGBUF_WATCHER` (`src/storage/heap_file.c:20521-20545`; `src/storage/heap_file.c:4620-4648`). This preserves ordered heap ownership if finding/allocating a candidate must touch other heap pages.
3. It physically inserts first, then appends the appropriate heap log record while the page remains write latched, then calls `pgbuf_set_dirty(..., DONT_FREE)` (`src/storage/heap_file.c:23231-23260`). Here “log before dirty” means the logged mutation is established before the page is advertised dirty/releasable; the in-memory byte mutation itself necessarily precedes construction of some log payloads.
4. The final ownership action is conditional. With a scan cache that caches the last fixed page, `pgbuf_replace_watcher` transfers the existing hold into `scan_cache->page_watcher`; otherwise `pgbuf_ordered_unfix` releases it (`src/storage/heap_file.c:23263-23279`). `heap_unfix_watchers` then releases any other physical watcher slots (`src/storage/heap_file.c:19824-19846`).
5. The error label calls `heap_unfix_watchers` too (`src/storage/heap_file.c:23315-23324`); already transferred or cleared watcher slots are harmless because cleanup tests `pgptr`.

Why not ordinary `pgbuf_fix`? Heap insert can nest header, normal, and overflow access, so watcher group/rank state is part of the operation. Why not always unfix? A scan cache deliberately owns a cross-call page hold, so watcher replacement makes that ownership transfer explicit.

## 2. Ordered watcher requirements under vacuum page removal

`heap_remove_page_on_vacuum` is the clearest complete multi-page watcher example (`src/storage/heap_file.c:3263-3571`).

- Preconditions are unusually strict: the candidate is already fixed and empty, and the heap identity is known (`src/storage/heap_file.c:3283-3289`). The existing fix is attached to a normal-page watcher; new watcher objects are initialized for heap header, previous normal page, and next normal page (`src/storage/heap_file.c:3300-3307`).
- The header is requested first because it has higher semantic priority (`src/storage/heap_file.c:3313-3317`). Ordered fixing is allowed to rearrange existing holds. Therefore, after the call the caller checks `crt_watcher.page_was_unfixed` and refreshes `*page_ptr` (`src/storage/heap_file.c:3325-3328`). It repeats that check after acquiring all pages and revalidates that the candidate is still empty because another transaction could have changed it during the release/refix window (`src/storage/heap_file.c:3366-3379`).
- Deallocation safety is rechecked only after the entire latch set is acquired. `pgbuf_has_prevent_dealloc` rejects a page reached by an active heap scan, and any remaining waiter is treated as unexpected (`src/storage/heap_file.c:3382-3400`).
- A system operation then updates the header and neighbor links. Each physical change is paired with an undo/redo record and `pgbuf_set_dirty(..., DONT_FREE)` while all relevant latches are still held (`src/storage/heap_file.c:3403-3505`).
- The current page is ordered-unfixed and its pointer nulled before `file_dealloc` (`src/storage/heap_file.c:3507-3515`). That separation is essential: the file manager later needs to fix/deallocate the same VPID and `pgbuf_dealloc_page` requires a sole fix.
- Success commits the system operation and releases next, previous, then header watchers (`src/storage/heap_file.c:3518-3535`). Failure aborts the system operation and conditionally releases every watcher; if ordered fixing had replaced the caller's pointer, cleanup reconciles it before `pgbuf_ordered_unfix_and_init` (`src/storage/heap_file.c:3537-3570`).

This use case demonstrates that a watcher is more than syntactic pin cleanup. It carries the group/rank metadata required to reorder acquisitions and tells the caller that page content must be re-read.

`pgbuf_ordered_callback` supports the same rule for waiting that is not itself a page fix. `bestspace::find_from_shards` invokes it when every shard reports an allocation in progress (`src/storage/bestspace.cpp:1564-1607`). The callback yields for the first 20 attempts, then briefly sleeps, and checks transaction interruption (`src/storage/bestspace.cpp:56-81`). The wrapper first verifies that every held ordered page has matching watchers, records each VPID/rank/latch mode, prevents deallocation, clears the watchers, and drops all ordered holds (`src/storage/page_buffer.c:13117-13264`). It then runs the callback with no ordered pages fixed and refixes the saved pages in global order even if the callback failed; partial refix is unwound, watcher pointers remain clear, and the caller receives `ER_INTERRUPTED` or `ER_PB_ORDERED_REFIX_FAILED` (`src/storage/page_buffer.c:13264-13397`). Thus the wait/retry point can coexist with tracked page ownership, but every ordered hold must be watcher-backed and callers must tolerate cleared watcher pointers after a refix failure.

## 3. Vacuum: expected deallocation, waiter fairness, and conditional refix

`vacuum_heap_page` reads as a caller specification for specialized fetch modes (`src/query/vacuum.c:1581-1908`).

- A first attempt uses ordinary `OLD_PAGE` with an unconditional write latch (`src/query/vacuum.c:1665-1677`). A replay of an interrupted vacuum instead calls `pgbuf_fix_if_not_deallocated`; a NULL output is successful evidence that the previous run already deallocated the page (`src/query/vacuum.c:1625-1648`).
- Even a non-NULL page must be type-checked: `PAGE_FTAB` means the old heap VPID was deallocated and reused, which is again successful completion rather than corruption (`src/query/vacuum.c:1649-1663`).
- Vacuum processes records while retaining the home write latch, logs page-vacuum state, then marks dirty (`src/query/vacuum.c:1706-1840`). If the page becomes empty and no scan has set prevent-deallocation, it delegates to the ordered removal path above (`src/query/vacuum.c:1842-1862`).
- If non-vacuum waiters exist and more objects remain, vacuum logs/releases its work and unconditionally refixes the page, explicitly favoring foreground threads (`src/query/vacuum.c:1875-1895`). This is a caller-driven fairness point, separate from buffer-pool latch queuing.
- The end label funnels any remaining home page through `vacuum_heap_page_log_and_reset`, which logs/dirty-releases according to accumulated work (`src/query/vacuum.c:1900-1907`).

For read-mostly vacuum metadata, `vacuum_find_dropped_file` fixes each dropped-files page read-latched, calls `pgbuf_notify_vacuum_follows` to postpone victimization because these pages are never normally boosted, copies the next VPID/searches, and releases on every return/iteration (`src/query/vacuum.c:6621-6717`, especially `6642-6665` and `6685-6700`).

## 4. B-tree insert: optimistic latches, promotion, restart, and split cleanup

The complete path starts at `btree_insert` and funnels into `btree_insert_internal` (`src/storage/btree.c:27618-27653`; `src/storage/btree.c:27718-27876`). The internal function selects the leaf callback for new-object insertion and passes root, advance, and key callbacks to `btree_search_key_and_apply_functions` (`src/storage/btree.c:27751-27799`).

The generic traversal owns cleanup and restart semantics (`src/storage/btree.c:23754-23939`):

- At each restart it first releases `crt_page`, then calls the root callback (`src/storage/btree.c:23791-23835`).
- On each non-leaf step, it calls the advance callback, handles an explicit restart, releases the parent after accepting `advance_page`, and continues (`src/storage/btree.c:23839-23879`).
- At the leaf it invokes the key callback. It either transfers the leaf fix to an output parameter or unfixes it; the error path releases both current and advance pages (`src/storage/btree.c:23881-23938`).

Insert deliberately starts optimistically. The insert-helper constructor initializes `nonleaf_latch_mode` to `PGBUF_LATCH_READ` (`src/storage/btree.c:719-725`). `btree_fix_root_for_insert` fixes the root with that mode and only performs one-time header/statistics work on the first traversal (`src/storage/btree.c:27895-28155`). A large key that requires creating the overflow-key file promotes the root. If `PGBUF_PROMOTE_SHARED_READER` fails, it unfixes and refixes the root write-latched, then rechecks whether another thread already created the file before logging/updating/dirtying the root (`src/storage/btree.c:28074-28140`).

`btree_split_node_and_advance` documents the policy directly (`src/storage/btree.c:28237-28845`): non-leaves normally use read latches, leaves use write latches, and updates/splits promote only when necessary (`src/storage/btree.c:28324-28344`).

- Root promotion uses `PGBUF_PROMOTE_SHARED_READER`; failure releases the root, changes traversal mode to write, and returns `restart=true` (`src/storage/btree.c:28365-28393`).
- A child is fixed while its parent remains held. Leaves or known-to-change children are fixed write-latched; otherwise the configured non-leaf mode is used (`src/storage/btree.c:28568-28591`).
- If a child split requires changing a read-latched parent, parent promotion uses stricter `PGBUF_PROMOTE_ONLY_READER` to avoid the documented multi-thread promotion dead-latch. Failure releases both child and parent and restarts in write mode (`src/storage/btree.c:28638-28668`). Child promotion failure has the same restart cleanup (`src/storage/btree.c:28670-28696`).
- Header mutations are logged before the corresponding `pgbuf_set_dirty` (`src/storage/btree.c:28698-28720`). Split work is enclosed in a system operation; the chosen child retains ownership as `advance_to_page`, the other child is released, and the system operation is committed (`src/storage/btree.c:28723-28790`).
- Error cleanup releases newly allocated pages before aborting the system operation because abort deallocates them and requires fix count zero; it then releases the existing child (`src/storage/btree.c:28818-28844`).

At the leaf, record mutation builds redo/undo data, updates the slotted-page record, appends the log record, and only then marks the page dirty (representative non-unique case: `src/storage/btree.c:29700-29746`; representative unique case: `src/storage/btree.c:29833-29872`).

## 5. File allocation: `NEW_PAGE` and initialization callbacks

`btree_get_new_page` asks `file_alloc` to allocate a VPID and run `btree_initialize_new_page`; it returns the initialized page still fixed to the split caller (`src/storage/btree.c:5153-5173`). The callback sets `PAGE_BTREE`, initializes the slotted page, appends the new-page undo/redo record, and marks dirty (`src/storage/btree.c:5183-5192`).

`file_alloc` provides the complete generic lifecycle (`src/storage/file_manager.c:5420-5592`):

1. Fix the file header with an unconditional write latch (`src/storage/file_manager.c:5442-5449`).
2. For a permanent file, start an atomic system operation and allocate the file-table bit; temporary allocation skips durable system-operation logging (`src/storage/file_manager.c:5457-5484`). Numerable files also add the VPID to their user-page table (`src/storage/file_manager.c:5488-5497`).
3. Fix the allocated VPID as `NEW_PAGE` with a write latch (`src/storage/file_manager.c:5499-5507`). This mode is correct because the file allocator just established ownership; reading an old disk image would be both unnecessary and semantically wrong.
4. Run the subsystem callback, verify that it assigned a page type, and propagate the file's TDE algorithm (`src/storage/file_manager.c:5508-5534`). If the caller requested `page_out`, transfer the fix; otherwise unfix locally (`src/storage/file_manager.c:5535-5542`).
5. On success, end the atomic system operation with logical undo `RVFL_ALLOC`, so rollback can deallocate. On failure, abort; cleanup releases any transferred page and the file header (`src/storage/file_manager.c:5561-5590`).

The same generic callback family can call `pgbuf_log_new_page`, which appends a full/partial page redo image and marks dirty (`src/storage/page_buffer.c:15103-15123`). This is distinct from `pgbuf_set_page_ptype`: establishing the in-memory type alone does not establish a durable new-page image.

## 6. Temporary teardown and permanent deallocation are intentionally different

`file_destroy` disables interruption while destroying a temporary file because a mid-destroy interruption would leak pages, then fixes the file header as an ordinary `OLD_PAGE` under an unconditional write latch and collects its sectors (`src/storage/file_manager.c:4135-4205`). Its temporary-file map callback uses `pgbuf_simple_fix(..., need_fix=false)` (`src/storage/file_manager.c:4073-4124`). The implementation confirms that `need_fix=false` returns NULL instead of claiming/loading a missing BCB and also declines a direct-victim BCB (`src/storage/page_buffer.c:2700-2782`). A resident file-table page is simple-unfixed for later handling; any other resident page is passed to `pgbuf_dealloc_temp_page(..., true)`, which resets type/flags, clears dirty, and decrements the simple fix count (`src/storage/page_buffer.c:2814-2838`). This is why an ordinary validated `OLD_PAGE` fix would be wrong for the mapped user pages: teardown must not populate the pool just to discard temporary state.

After mapping user pages, `file_destroy` probes collected file-table pages the same way, invalidates each resident one, invalidates the already write-fixed header with `need_free=false`, and then releases that ordinary header fix (`src/storage/file_manager.c:4273-4335`). Only after buffer state is removed does it unreserve the file's sectors. The common exit releases any surviving header hold, frees both collectors, and restores interrupt checking (`src/storage/file_manager.c:4337-4365`).

Permanent runtime deallocation is a transaction protocol, not immediate invalidation. `file_dealloc` appends `RVFL_DEALLOC` as a postpone record, because reuse before commit is unsafe (`src/storage/file_manager.c:6131-6207`). Numerable files additionally mark their user-page-table entry deleted, log that change, dirty the containing file-table/header page, and release all fixed metadata pages on exit (`src/storage/file_manager.c:6210-6309`).

At commit/run-postpone, recovery dispatch reaches `file_rv_dealloc_on_postpone` -> `file_rv_dealloc_internal` (`src/storage/file_manager.c:6631-6793`). It fixes the file header write-latched, starts an atomic system operation, updates file allocation tables via `file_perm_dealloc`, ends with logical run-postpone/compensation, then unfixes the header (`src/storage/file_manager.c:6660-6762`). `file_perm_dealloc` finally fixes the target write-latched and calls `pgbuf_dealloc_page` (`src/storage/file_manager.c:6599-6608`).

`pgbuf_dealloc_page` consumes the sole fix rather than returning a still-owned `PAGE_PTR`: it logs the old VPID/type/TDE flags, sets the page type to `PAGE_UNKNOWN`, clears page flags, marks dirty plus “move to LRU bottom,” removes the thread holder, and unlatches/unfixes (`src/storage/page_buffer.c:15182-15235`). It deliberately does not synchronously invalidate/write the frame; deferred flush/victimization avoids making deallocation wait for I/O.

## 7. Disk format: buffer ownership around raw volume I/O

`disk_format` is a complete example of when file I/O and page-buffer interfaces may be mixed (`src/storage/disk_manager.c:511-814`):

- It first logs the logical format undo and forces those log pages, then creates the volume with raw `fileio_format` (`src/storage/disk_manager.c:560-583`). This guarantees recovery knows how to remove/recreate the external object.
- It fixes the volume-header VPID with `NEW_PAGE`, assigns `PAGE_VOLHEADER`, builds the header and allocation tables, and appends redo records while holding the write latch (`src/storage/disk_manager.c:585-720`).
- For temporary-purpose volumes it first calls `pgbuf_flush_all`, then fixes system pages and sets temporary LSAs (`src/storage/disk_manager.c:721-752`). If it will reset a permanent volume directly through `fileio_reset_volume`, it calls `pgbuf_invalidate_all` first; the comment explicitly requires flushing dirty pages and invalidating their buffers before bypassing the pool (`src/storage/disk_manager.c:753-766`).
- Success dirty-frees the header, performs an extra volume flush and DWB synchronization, and returns (`src/storage/disk_manager.c:770-782`). Error cleanup unfixes the header, invalidates all buffers for the doomed volume, and immediately removes an unlogged temporary volume (`src/storage/disk_manager.c:788-811`).

The sequencing rule is: raw I/O may create/reset the external volume, but cached page images must either not exist yet or be flushed and invalidated before raw overwrites.

## 8. Checkpoint: selective data flush coordinated with WAL and physical sync

`logpb_checkpoint` is the main external caller of `pgbuf_flush_checkpoint` (`src/transaction/log_page_buffer.c:6901-7406`). The relevant ordering is:

1. Enter the log critical section, suppress concurrent checkpoints, snapshot previous checkpoint state, and flush append log pages (`src/transaction/log_page_buffer.c:6940-6985`).
2. Append the start-checkpoint marker and obtain `newchkpt_lsa`, then release the log critical section (`src/transaction/log_page_buffer.c:6987-7002`).
3. Reflect in-memory unique statistics, then call `pgbuf_flush_checkpoint(newchkpt_lsa, previous_redo_lsa, &smallest_lsa, &count)` and `fileio_synchronize_all` (`src/transaction/log_page_buffer.c:7004-7021`). The buffer interface therefore flushes qualifying dirty pages up to the checkpoint boundary and computes the remaining redo floor; it does not blindly flush everything.
4. Reenter the log critical section, snapshot active transactions/system operations, append the end-checkpoint record, flush log pages, and persist the log header (`src/transaction/log_page_buffer.c:7023-7230`).
5. Record the checkpoint LSA in every permanent volume header and synchronize each through DWB (`src/transaction/log_page_buffer.c:7237-7267`).
6. On any failure, reacquire the log critical section if necessary, set `run_nxchkpt_atpageid` to the current append page so the next checkpoint is due immediately, and return `NULL_PAGEID` (`src/transaction/log_page_buffer.c:7391-7403`).

This path is the caller-facing proof that WAL flush, data-page flush, filesystem synchronization, checkpoint record persistence, and per-volume checkpoint metadata are separate ordered steps.

## 9. Crash redo and page-buffer recovery hooks

Recovery dispatch maps page-buffer record types to callbacks: `RVPGBUF_FLUSH_PAGE`, `RVPGBUF_NEW_PAGE`, `RVPGBUF_DEALLOC`, its compensation record, and TDE change (`src/transaction/recovery.c:784-831`). The redo scan sends ordinary page records through synchronous or per-page asynchronous execution; operations such as volume create/expand/reservation are forced synchronous (`src/transaction/log_recovery_redo_parallel.hpp:380-418`; `src/transaction/log_recovery.c:543-567`).

The complete synchronous apply path is `log_rv_redo_record_sync` (`src/transaction/log_recovery_redo.hpp:587-668`):

- `log_rv_fix_page_and_check_redo_is_needed` fixes the target and compares the record LSA with page LSA. If already applied, it unfixes and skips (`src/transaction/log_recovery.c:497-536`).
- `log_rv_redo_fix_page` uses `RECOVERY_PAGE` with an unconditional write latch. Its comment explains that redo must accept new, normal, or apparently deallocated pages, because sector-reservation redo may be parallel and reservation validation is both racy for this purpose and expensive (`src/transaction/log_recovery.c:6407-6430`).
- A scope-exit object guarantees `pgbuf_unfix_and_init_after_check` on every exit after a successful fix (`src/transaction/log_recovery_redo.hpp:611-619`).
- The selected recovery callback mutates and dirties the page. The generic wrapper then sets the page LSA to the log record's LSA before scope cleanup releases it (`src/transaction/log_recovery_redo.hpp:621-667`).

Special cases clarify fetch-mode intent:

- New-page redo copies the logged bytes, restores the page type, and marks dirty; undo sets `PAGE_UNKNOWN` and marks dirty (`src/storage/page_buffer.c:15133-15171`).
- Deallocation redo sets `PAGE_UNKNOWN`, clears TDE, and marks dirty (`src/storage/page_buffer.c:15245-15250`).
- Deallocation undo is logical because a normally deallocated page cannot be fixed as an old allocated page. It reconstructs the VPID from undo data, fixes with `OLD_PAGE_DEALLOCATED`, restores type/TDE flags, appends a compensation record, then `pgbuf_set_dirty_and_free` consumes the hold (`src/storage/page_buffer.c:15254-15303`).
- `pgbuf_rv_flush_page` uses `OLD_PAGE_MAYBE_DEALLOCATED`; missing is successful. Otherwise it appends a dummy record required by system-operation bookkeeping, marks dirty, flushes, and unfixes (`src/storage/page_buffer.c:14896-14921`). This callback exists for recovery changes that must become durable immediately in case recovery itself crashes.

## 10. Boot and daemon sequencing

The pool is initialized as part of transaction-table setup: after system transaction and lock manager initialization, `logtb_define_trantable_log_latch` calls `pgbuf_initialize`, then `file_manager_init`; error funnels through transaction-table teardown (`src/transaction/log_tran_table.c:468-512`). Teardown reverses manager ownership with lock finalization, `pgbuf_finalize`, then file-manager finalization (`src/transaction/log_tran_table.c:580-594`). `boot_restart_server` invokes this setup before mounting/recovering the database (`src/transaction/boot_sr.c:2274`; enclosing function `src/transaction/boot_sr.c:1974-2801`).

During restart, after volumes, disk/file/vacuum metadata, and DWB recovery are ready, boot creates page-buffer and DWB daemons before invoking `log_initialize`; their work is still gated (`src/transaction/boot_sr.c:2363-2428`). Only after log recovery completes does boot call `BO_ENABLE_FLUSH_DAEMONS` (`src/transaction/boot_sr.c:2437-2444`). Every page-buffer daemon task checks `BO_IS_FLUSH_DAEMON_AVAILABLE` and returns without touching the pool while disabled (`src/storage/page_buffer.c:16996-17009`, `17029-17050`, `17071-17085`, `17112-17136`).

`pgbuf_daemons_init` creates four roles (`src/storage/page_buffer.c:17146-17241`):

- maintenance: periodically adjusts private/shared LRU quotas and searches/directly assigns victims;
- page flush: loops over `pgbuf_flush_victim_candidates` while pressure says it should continue;
- post-flush: calls `pgbuf_assign_flushed_pages` and resets its adaptive looper when more assignment work remains;
- flush control: periodically replenishes file-I/O flush tokens.

`pgbuf_daemons_destroy` destroys all four objects (`src/storage/page_buffer.c:17244-17255`). Normal shutdown stops vacuum master, destroys page-buffer daemons, then calls `log_final`; DWB is destroyed only after log final says pages are flushed (`src/transaction/boot_sr.c:3086-3113`). Restart error cleanup first disables flush daemons, then destroys page-buffer/DWB daemons before `log_final` and global finalization (`src/transaction/boot_sr.c:2740-2800`).

## Sequencing invariants distilled for callers

1. **Choose fetch mode from allocation knowledge.** Existing allocated data: `OLD_PAGE`. Just-allocated VPID: `NEW_PAGE`. Recovery: `RECOVERY_PAGE`. Expected prior deallocation: `fix_if_not_deallocated`, `OLD_PAGE_DEALLOCATED`, or `OLD_PAGE_MAYBE_DEALLOCATED` according to whether the caller wants absence, resurrection, or best-effort flush.
2. **Latch condition is an algorithm choice.** Unconditional is the common ownership request. Conditional is used when the caller already holds another page and has an explicit release/retry plan (B-tree repair and older heap retry helpers are representative); failure must not be silently treated as corruption.
3. **Ordered watchers require content revalidation.** An ordered acquisition may release/refix a lower-priority page. Test `page_was_unfixed`, refresh pointers, and re-read state before mutation.
4. **Keep the write latch across mutation, log construction/append, and dirty marking.** Representative heap and B-tree paths mutate first, append physical undo/redo while the before/after data remains stable, then mark dirty before releasing/transferring ownership.
5. **Dirty does not mean released or flushed.** `DONT_FREE` retains the hold. Release explicitly, transfer a watcher, use `FREE`, or call a consuming deallocation helper. Flush/checkpoint/DWB synchronization remain later durability stages.
6. **Do not hold the deallocated page through file deallocation.** Heap vacuum releases the candidate first; actual `pgbuf_dealloc_page` expects/consumes the sole fix.
7. **Recovery idempotence is page-LSA based.** Generic redo skips already-applied records, applies under `RECOVERY_PAGE`, sets the record LSA, and always unfixes.
8. **Raw volume writes require buffer coherence.** Flush and invalidate cached volume pages before `fileio_reset_volume` or removal.

## Examined searches and complete functions

### Searches

- `rg -n` for `pgbuf_fix`, `pgbuf_ordered_fix`, `pgbuf_ordered_callback`, `pgbuf_promote_read_latch`, unfix variants, dirty/LSA setters, flush/invalidate families, new/deallocation/recovery hooks, daemon hooks, and `pgbuf_fix_if_not_deallocated` across `heap_file.c`, `btree.c`, `file_manager.c`, `disk_manager.c`, `vacuum.c`, `src/transaction`, and `src/thread`.
- Focused `rg -n` for `pgbuf_simple_fix`, `pgbuf_copy_to_area`, `pgbuf_copy_from_area`, `pgbuf_fix_with_retry`, recovery dispatch (`RV_fun`, `redofun`, `undofun`), checkpoint callers, daemon entry points, and boot initialization/finalization.
- Symbol-anchor searches for every enclosing function named in this packet, followed by numbered source reads.

### Complete functions read for claims in this packet

- `heap_insert_logical` (`src/storage/heap_file.c:23120-23325`)
- `heap_get_insert_location_with_lock` (`src/storage/heap_file.c:20508-20664`)
- `heap_find_bestpage` (`src/storage/heap_file.c:4620-4648`)
- `heap_unfix_watchers` (`src/storage/heap_file.c:19825-19846`)
- `heap_remove_page_on_vacuum` (`src/storage/heap_file.c:3263-3571`)
- `vacuum_heap_page` (`src/query/vacuum.c:1581-1908`)
- `vacuum_find_dropped_file` (`src/query/vacuum.c:6622-6718`)
- `wait_for_shard_allocation` and `bestspace::find_from_shards` (`src/storage/bestspace.cpp:56-82`, `1564-1612`)
- `btree_insert`, `btree_insert_internal`, `btree_search_key_and_apply_functions`, `btree_fix_root_for_insert`, and `btree_split_node_and_advance` (`src/storage/btree.c:27618-27653`, `27718-27876`, `23754-23939`, `27896-28156`, `28237-28845`)
- `btree_get_new_page` and `btree_initialize_new_page` (`src/storage/btree.c:5154-5193`)
- `file_alloc` (`src/storage/file_manager.c:5420-5592`)
- `file_sector_map_dealloc_temp` and `file_destroy` (`src/storage/file_manager.c:4073-4124`, `4135-4366`)
- `file_dealloc`, `file_perm_dealloc`, `file_rv_dealloc_internal`, and its two wrappers (`src/storage/file_manager.c:6131-6312`, `6324-6620`, `6631-6793`)
- `disk_format` (`src/storage/disk_manager.c:511-814`)
- `logpb_checkpoint` (`src/transaction/log_page_buffer.c:6901-7406`)
- `log_rv_fix_page_and_check_redo_is_needed`, `log_rv_redo_fix_page`, `log_rv_redo_record_sync`, and `log_rv_redo_record_sync_or_dispatch_async` (`src/transaction/log_recovery.c:497-536`, `6407-6431`; `src/transaction/log_recovery_redo.hpp:587-668`; `src/transaction/log_recovery_redo_parallel.hpp:382-418`)
- Page-buffer recovery callbacks (`src/storage/page_buffer.c:14896-14922`, `15103-15338`)
- `pgbuf_simple_fix`, `pgbuf_simple_unfix`, `pgbuf_dealloc_temp_page`, and `pgbuf_ordered_callback` (`src/storage/page_buffer.c:2700-2839`, `13081-13398`)
- Page-buffer daemon execute/init/destroy functions (`src/storage/page_buffer.c:16975-17255`)
- `logtb_define_trantable_log_latch` setup/error path and `logtb_undefine_trantable` manager teardown (`src/transaction/log_tran_table.c:405-513`, `580-625`)
- `boot_restart_server` relevant success/error lifecycle and `xboot_shutdown_server` relevant shutdown lifecycle (`src/transaction/boot_sr.c:1974-2801`, `3055-3113`)

## Unknowns and cautions

- This packet does not enumerate every `page_buffer.h` interface or every transitive caller; the companion interface inventory should own exhaustiveness.
- `pgbuf_fix_with_retry` had no direct caller in the focused subsystem search at this revision; its caller-facing rationale cannot be demonstrated with one of the requested representative paths without expanding scope beyond them.
- `pgbuf_copy_to_area`/`pgbuf_copy_from_area` were found in external sort, outside the required caller families. They were not used to infer heap/B-tree contracts.
- The precise scheduling/fairness behavior of ordered fix, promotion queues, daemon loopers, and parallel redo is internal and timing-dependent. Caller evidence establishes release/retry obligations, not fairness guarantees.
- `file_dealloc` contains `assert (error_code != NO_ERROR)` immediately before its normal exit label (`src/storage/file_manager.c:6296-6299`) even though the success value is initialized to `NO_ERROR`. This appears inconsistent, but it is recorded only as a source anomaly; no behavior claim in this packet depends on that assertion.
- `pgbuf_rv_dealloc_undo_compensate` declares a `VPID vpid` used only in an `NDEBUG`-excluded diagnostic without visible initialization (`src/storage/page_buffer.c:15314-15335`). This packet relies only on its type/flag restoration semantics, not that debug message.
