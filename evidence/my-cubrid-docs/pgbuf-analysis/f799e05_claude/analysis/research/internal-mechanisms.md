# CUBRID `page_buffer.c` internal mechanisms packet

## Provenance, scope, and evidence notation

- Source tree: `/home/vimkim/gh/cb/pgbuf-analysis`
- Pinned revision: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
- Primary implementation: `src/storage/page_buffer.c`
- Public declarations and caller-facing enums: `src/storage/page_buffer.h`
- The same-revision audited report under `my-cubrid-docs/.../f799e05_codex/` was used as a map, but every mechanism below was checked against the pinned source.
- `file:line-line` means the line numbers at the pinned revision. Statements marked **inference** follow from the cited implementation but are not separately documented promises.

This packet deliberately separates two things:

1. **Interface obligation**: what a caller must supply, owns, may assume on success, and must do on failure.
2. **Current implementation**: the particular hash, BCB, atomic-latch, LRU, DWB, daemon, and retry machinery that realizes that obligation at this revision.

The separation matters. A caller is entitled to a fixed page identity and latch, not to a particular LRU zone. Conversely, the implementation depends on stronger internal invariants—such as `fcnt > 0` preventing victimization—that are not useful public API surface.

## 1. The module is four coupled state machines, not one

The central implementation mistake to avoid in an explanation or reimplementation is collapsing all page-buffer state into “cached/not cached.” Four largely orthogonal dimensions meet at fix, unfix, flush, and victimization:

| Dimension | Representative states | Owner/protection | Persistent after crash? |
|---|---|---|---|
| Residency/identity | `INVALID -> VOID -> hash resident -> VOID -> INVALID` | hash-anchor mutex, VPID buffer lock during cold publication, BCB mutex | No |
| Borrow/latch | `INVALID/NO_LATCH/READ/WRITE`; atomic `fcnt`; waiter bit and queue | 64-bit atomic CAS plus BCB mutex; per-thread holder list | No |
| Durability generation | clean, DIRTY, FLUSHING, concurrently re-dirtied; page LSA and `oldest_unflush_lsa` | WRITE latch for mutation; atomic flags/BCB mutex for flush snapshot | Page/log bytes yes; metadata no |
| Replacement policy | invalid, void, private/shared LRU zones 1/2/3, AOUT history, direct victim | LRU/AOUT/invalid mutexes, flag CAS, lock-free queues | No |

The source encodes LRU index, zone, and BCB flags in one `int`, but checks at startup that their masks do not overlap (`page_buffer.c:16840-16864`). This is storage optimization, not conceptual unification.

## 2. Core data structures and protection rules

### 2.1 `PGBUF_BUFFER_POOL`

`pgbuf_Pool` owns all volatile page-buffer state: the fixed-size BCB table, corresponding I/O frames, hash anchors, one VPID-load lock record per thread, shared and private LRUs, AOUT history, invalid BCB free list, flush candidate arrays, holder pools, quota/monitor state, direct-victim queues, post-flush queue, and status counters (`page_buffer.c:744-849`). The global object is static (`page_buffer.c:893`).

Approximate capacity cost is therefore:

```text
N * (sizeof(PGBUF_BCB) + PGBUF_IOPAGE_BUFFER_SIZE)
+ 2^20 hash anchors
+ O(thread count) buffer locks and reserved holders
+ O(LRU count) list/quota/monitor state
+ bounded AOUT, candidate, direct-victim, and status arrays
```

This is not an ABI promise; the structures are private to `page_buffer.c`.

### 2.2 `PGBUF_BCB` and its frame

Each BCB contains:

- the current `VPID` identity;
- a 64-bit atomic latch tuple;
- flags containing dirty/flushing/direct-victim/deallocation/vacuum state plus zone/LRU index;
- the latch waiter queue;
- hash and LRU links;
- hotness/age counters;
- packed fix/avoid-deallocation counters;
- `oldest_unflush_lsa`;
- a pointer to its permanently paired I/O frame (`page_buffer.c:468-502`).

The paired `PGBUF_IOPAGE_BUFFER` points back to the BCB and embeds `FILEIO_PAGE` (`page_buffer.c:504-517`). This backpointer arrangement is why conversion macros can map a public `PAGE_PTR` to both frame metadata and BCB metadata without a hash lookup.

The BCB table and I/O-frame array are allocated separately but linked one-to-one during initialization. Initial BCB identity is null, latch is `PGBUF_LATCH_INVALID` with zero fixes, flags are `PGBUF_INVALID_ZONE`, LSA is null, and all BCBs are chained for the invalid list (`page_buffer.c:5559-5669`).

### 2.3 Atomic latch versus BCB mutex

`PGBUF_ATOMIC_LATCH` is `std::atomic<uint64_t>`. A union view packs `latch_mode`, 16-bit `waiter_exists`, and 32-bit `fcnt` into that word (`page_buffer.c:382-390`, `page_buffer.c:462-467`). All grant/decrement transitions use acquire/release CAS.

The atomic tuple answers the hot questions “is a compatible latch already held?”, “may a new reader barge?”, and “how many fixes exist?” without always requiring the BCB mutex. The BCB mutex protects multi-field operations: VPID rechecks, queue edits, hash/LRU transitions, flush snapshots, and state changes whose consistency spans the atomic tuple and other BCB fields.

Important invariant:

```text
fcnt > 0  => the BCB must not be victimized or invalidated for reuse
```

Victim tests also reject latch waiters and non-`NO_LATCH` state where applicable (`page_buffer.c:9266-9312`). A `PAGE_PTR` is therefore borrowed ownership represented twice: globally by BCB `fcnt`, and per thread by a holder.

### 2.4 Per-thread `PGBUF_HOLDER`

A holder groups all nested fixes by one thread on one BCB. It stores its own `fix_count`, the BCB pointer, performance dirtiness/latch history, and a linked list of ordered-fix watchers (`page_buffer.c:416-444`). Each thread has a cache-line-sized anchor with free and held lists (`page_buffer.c:446-460`).

Initialization reserves `PGBUF_DEFAULT_FIX_COUNT` holders per thread; extra holders come from never-returned shared holder sets protected by `free_holder_set_mutex` (`page_buffer.c:5926-5996`, `page_buffer.c:6008-6086`). The holder is thread-owned after allocation; it does not need its own mutex.

Public obligation: a successful normal fix must be balanced by exactly one normal unfix by the same thread. Nested fixes increment both global `fcnt` and the thread holder's `fix_count`; holder removal occurs only when its count reaches zero (`page_buffer.c:6135-6183`).

### 2.5 Hash anchor and VPID buffer lock are different locks

Each of the fixed `2^20` hash anchors owns two chains under one mutex:

- `hash_next`: VPID-to-resident-BCB mapping;
- `lock_next`: VPID-keyed in-progress cold-load records (`page_buffer.c:550-575`, initialization at `page_buffer.c:5677-5698`).

The buffer-lock table has one record per thread, not one per page. A cold-load owner inserts its own record into the hash anchor's lock chain; other threads requesting the same VPID sleep on that record and retry the hash after wakeup (`page_buffer.c:7991-8087`). Thus:

```text
hash mutex       protects chain integrity
VPID buffer lock serializes “one loader/publisher for this absent identity”
BCB latch        protects callers using an already chosen resident frame
```

They are not interchangeable.

## 3. Lifecycle: initialization, thread attachment, and finalization

### Interface obligation

- Higher layers must call `pgbuf_initialize()` before any fix and must quiesce page-buffer users and daemons before `pgbuf_finalize()`.
- `pgbuf_initialize()` returns `NO_ERROR` only after all internal tables needed by steady-state paths exist.
- `pgbuf_finalize()` is resource teardown, not a durability operation. It does not promise to flush dirty pages.
- A thread using page buffers must have its holder anchor/private-LRU fields attached through the thread/bootstrap integration.

### Current initialization order

`pgbuf_initialize()` first zeroes every pointer/counter so partial teardown is intended to be possible, reads the configured pool size and clamps it to the minimum, reads page-latch timeout, clamps LRU1/LRU2 ratios, then initializes components in this order (`page_buffer.c:1649-1793`):

1. private-LRU quota parameters;
2. BCB table and frames;
3. hash table;
4. buffer-lock table;
5. LRU array;
6. invalid list;
7. AOUT;
8. per-thread holders;
9. quota arrays;
10. monitor arrays;
11. victim candidate and checkpoint sequential-flusher arrays;
12. direct-victim queues, post-flush queue, LRU-with-victim queues, and cache-line-aligned status shards (`page_buffer.c:1794-1912`).

Any failure jumps to `pgbuf_finalize()` and returns `ER_FAILED` rather than the original component error (`page_buffer.c:1914-1917`). Component initializers do set more precise error-manager state, so callers may inspect it, but the function return itself is collapsed.

The invalid-list initializer makes every BCB immediately allocatable (`page_buffer.c:5911-5918`). LRU list count is configurable; auto mode begins from transaction count, targets at least 1000 pages per shared list, and ensures at least four shared LRUs (`page_buffer.c:5744-5763`). Private LRU count is server-only and can be disabled, explicitly set with a minimum of four, or auto-sized from transactions plus vacuum workers (`page_buffer.c:13949-13985`).

`pgbuf_thread_variables_init()` enables a thread's already assigned private LRU when appropriate and caches the address of its holder anchor (`page_buffer.c:1546-1564`). This is attachment, not allocation of the pool.

Daemon creation is separate from pool initialization. `pgbuf_daemons_init()` creates maintenance, victim-flush, post-flush, and file-I/O flush-control daemons (`page_buffer.c:17146-17241`). Therefore **initialized pool** and **page-flush daemon available** are separate runtime states.

### Finalization

`pgbuf_finalize()` optionally dumps fixed pages in debug mode, destroys hash and BCB mutexes, frees all arrays/queues/holder expansions, destroys status/AOUT/invalid/free-holder synchronization, and clears holder-anchor pointers in thread entries (`page_buffer.c:1928-2114`). It does not walk dirty BCBs to write them. The orderly-shutdown obligation belongs above this module: stop daemons, finish log/data durability, then free the volatile pool.

Partial-initialization nuance: the top-level zeroing and null checks make most allocations safe to finalize, but several mutex destroys are unconditional (`invalid_mutex`, `free_holder_set_mutex`, `Aout_mutex`, and status mutex). This is the current cleanup shape, not a portable guarantee that arbitrary mid-constructor failure states are valid outside the intended order (`page_buffer.c:1983-1999`, `page_buffer.c:2027`, `page_buffer.c:2109-2110`).

## 4. Complete fix path: validation, hit, miss, load, publication

### 4.1 Caller-facing contract

The fetch modes are semantic requests, not cache hints (`page_buffer.h:172-187`):

| Fetch mode | Caller intent / success meaning |
|---|---|
| `OLD_PAGE` | The allocated page must exist; read from disk on a miss. |
| `NEW_PAGE` | The page was newly allocated; initialize a frame without reading old disk bytes. |
| `OLD_PAGE_IF_IN_BUFFER` | Return it only if currently resident; a miss returns `NULL` without I/O. |
| `OLD_PAGE_PREVENT_DEALLOC` | Protect the miss/race interval against deallocation until the latch is acquired. |
| `OLD_PAGE_DEALLOCATED` | Recovery/special caller expects `PAGE_UNKNOWN`. |
| `OLD_PAGE_MAYBE_DEALLOCATED` | Return `NULL` for a deallocated page without treating that as an unexpected caller error. |
| `RECOVERY_PAGE` | Recovery may encounter new, ordinary, or deallocated content. |

Only READ or WRITE are valid caller fix modes; FLUSH is an internal wait reason, not a fixed-page latch (`page_buffer.h:189-203`). Conditionality controls waiting, not compatibility.

On success, the returned `PAGE_PTR` refers to the requested resident identity, the caller has a compatible latch, `fcnt` and the caller's holder count include this fix, and the pointer remains usable until the matching unfix. On `NULL`, the caller has no `PAGE_PTR` to unfix. This last statement does not imply every internal accounting failure path is perfectly rolled back; exceptions are audited below.

### 4.2 Entry validation and retry wrapper

The main fix validates latch/condition enums, increments a per-thread request counter, optionally validates allocation on disk, rejects negative page IDs, and converts an unconditional request into conditional if the transaction wait policy is zero-wait (`page_buffer.c:2285-2332`). Each retry iteration checks transaction interruption (`page_buffer.c:2342-2353`).

`pgbuf_fix_with_retry()` retries only interrupt/timeout-family results and stops on other errors. Its numeric retry budget is incremented only for timeout-class errors; `NO_ERROR`/`ER_INTERRUPTED` can re-enter the loop without consuming that budget. A terminal timeout-class result is rewritten to `ER_PAGE_LATCH_ABORTED` (`page_buffer.c:2125-2156`). The wrapper may therefore call the complete fix protocol multiple times; callers must not treat it as an in-place wait on one immutable BCB.

### 4.3 Lock-free READ hit

The fast path is attempted only for unconditional READ of `OLD_PAGE`, `OLD_PAGE_PREVENT_DEALLOC`, or `OLD_PAGE_MAYBE_DEALLOCATED` (`page_buffer.c:2358-2377`). It scans the hash chain without the hash or BCB mutex, then CAS-increments `fcnt` only when:

- the current latch is READ;
- no waiter exists;
- `fcnt` is already positive;
- BCB VPID still matches (`page_buffer.c:7725-7750`).

After the CAS it increments an existing holder or allocates a new one, then converts BCB to `PAGE_PTR` (`page_buffer.c:7753-7786`).

**Internal proof obligation/inference:** BCB objects and frames are never freed until pool finalization, and a positive READ `fcnt` makes the BCB non-victimizable. The path does not perform a second VPID check after its successful CAS. Its safety therefore relies on the CAS/identity check and victimization protocol closing reuse races, not on hash mutex ownership.

### 4.4 Normal hash hit

`pgbuf_search_hash_chain()` first attempts an unlocked chain scan and then locks the matching BCB; after acquiring it, it rechecks VPID and retries if the frame was replaced (`page_buffer.c:7600-7654`). If the fast scan cannot complete, it uses the hash mutex, releases that mutex before blocking on the BCB mutex, and again rechecks VPID (`page_buffer.c:7656-7721`).

The ownership convention is unusual but important:

```text
found     -> return with BCB mutex held, hash mutex not held
not found -> return NULL with hash-anchor mutex held
```

The main fix uses that convention directly (`page_buffer.c:2380-2416`). A hit that had been promised as a direct victim flips `VICTIM_DIRECT` to `INVALIDATE_DIRECT_VICTIM`, telling the waiting allocator to retry instead of evicting a just-reused hot page (`page_buffer.c:2383-2388`).

### 4.5 Cold miss serialization

On a miss, the thread enters `pgbuf_claim_bcb_for_fix()` with the hash mutex held. `pgbuf_lock_page()` either:

- finds an existing VPID load record, enqueues/sleeps, returns `PGBUF_LOCK_WAITER`, and causes the outer fix to retry lookup; or
- installs the current thread's buffer-lock record and becomes `PGBUF_LOCK_HOLDER` (`page_buffer.c:7991-8087`, `page_buffer.c:8431-8453`).

The loader owns the VPID lock across frame allocation, disk/DWB read or NEW initialization, latch/holder creation, and hash publication. `pgbuf_unlock_page()` removes the load record, releases the hash mutex, and wakes all waiters, which re-search rather than inherit a BCB pointer (`page_buffer.c:8104-8177`). This is what prevents duplicate resident frames for one cold VPID.

### 4.6 BCB allocation and load

Allocation sources are tried in this order:

1. pop an unused BCB from the invalid list;
2. search replacement queues/LRUs for a clean victim;
3. in server mode with a flush daemon, enqueue the requester for a directly assigned victim and sleep with timeout/interrupt handling;
4. without a flush daemon (standalone/recovery), flush candidates synchronously and search again (`page_buffer.c:8189-8367`).

A chosen resident victim is revalidated and removed from the hash by `pgbuf_victimize_bcb()`; it becomes `PGBUF_LATCH_INVALID` while its mutex remains held for reuse (`page_buffer.c:8369-8389`, `page_buffer.c:8643-8686`). No candidate yields `ER_PB_ALL_BUFFERS_DIRTY` if no more specific error exists (`page_buffer.c:8379-8384`).

The claimed BCB is reset to requested VPID, `NO_LATCH`, zero fixes, clear async-flush state, zero avoid-deallocation count, and null oldest-unflushed LSA (`page_buffer.c:8480-8492`).

For an old page:

1. increment I/O-read statistics;
2. try `dwb_read_page()`;
3. if the DWB has no copy, call `fileio_read()`;
4. decrypt according to page TDE flags;
5. normalize temporary-volume LSA to `PGBUF_TEMP_LSA`, dirtying if normalization changed it (`page_buffer.c:8494-8598`).

For `NEW_PAGE`, no read occurs. Debug memory may be scrambled; permanent-page LSA and persisted page identity are initialized to null/sentinel so the later caller initialization is explicit (`page_buffer.c:8599-8632`).

### 4.7 Identity validation, latch, and publication

Back in the main fix, the BCB registers a fix/hotness count, repairs the on-page VPID for immature/recovery pages, checks BCB identity, and registers temporary avoid-deallocation state if requested (`page_buffer.c:2442-2477`). It then acquires the requested latch and creates/updates the per-thread holder (`page_buffer.c:2485-2512`).

Only after bytes are loaded/initialized, VPID is validated, and latch/holder acquisition succeeds does the miss owner insert the BCB into the hash. It then removes the VPID load record and wakes waiters (`page_buffer.c:2525-2544`). This yields the publication happens-before:

```text
initialize bytes + identity + latch/holder
    -> hash insert while load record exists
    -> remove load record / wake
    -> waiter retries hash and sees resident BCB
```

The post-fix page-type gate decides whether `PAGE_UNKNOWN` is legal for this fetch mode. Unexpected deallocated pages are unfixed before returning `NULL`; `OLD_PAGE_MAYBE_DEALLOCATED` emits warning state then also unfixes (`page_buffer.c:2572-2615`).

### 4.8 Normal error cleanup and two exceptions

Ordinary file-read, TDE-decrypt, identity-check, or initial latch failure returns the provisional BCB to the invalid list and removes the VPID load record (`page_buffer.c:2450-2511`, `page_buffer.c:8520-8559`). A load-lock waiter returns `retry=true`; an allocation failure unlocks the VPID lock (`page_buffer.c:8431-8477`).

Two source-visible exception families must not be silently described away:

1. `dwb_read_page()` error returns directly from `pgbuf_claim_bcb_for_fix()` without returning the provisional BCB or removing the VPID load record (`page_buffer.c:8510-8515`). This is a **source-confirmed cleanup exception/defect candidate**; reachability and DWB side effects would be needed before claiming a runtime reproducer.
2. Holder allocation is performed after the atomic latch/fix count was already granted in the lock-free, idle, compatible-reader, blocked-wakeup, and promotion paths. Each OOM branch asserts and returns without a visible `fcnt` rollback (`page_buffer.c:6465-6470`, `page_buffer.c:6516-6522`, `page_buffer.c:6607-6613`, `page_buffer.c:7763-7773`, `page_buffer.c:3007-3015`). The code treats this as impossible, but strict failure-cleanup documentation cannot promise balance here.

### 4.9 Specialized simple fix

`pgbuf_simple_fix()` is explicitly only for read-only access to temporary files and must not be mixed with general latch-based fix. It uses the same hash/miss-load publication machinery but merely increments `fcnt`, installs no holder, and adds a newly loaded BCB to an LRU directly (`page_buffer.c:2690-2781`; declaration warning at `page_buffer.h:270-273`). `pgbuf_simple_unfix()` only decrements `fcnt` under BCB mutex (`page_buffer.c:2784-2804`).

This is not a faster interchangeable `pgbuf_fix()`: there is no page-content latch, no holder ownership diagnostic, and no normal last-unfix LRU/waiter processing. Its correctness obligation is imposed on the temporary-file caller: no concurrent writer and balanced simple fix/unfix.

## 5. Latch grant, holder accounting, waiters, promotion, and unfix

### 5.1 Compatibility and no-barging policy

`pgbuf_latch_bcb_upon_fix()` evaluates the atomic tuple while the BCB mutex is held (`page_buffer.c:6298-6452`):

| Existing state | Request | Result |
|---|---|---|
| `NO_LATCH` or freshly allocated miss | READ/WRITE | Set requested mode, `fcnt=1`. |
| READ, no waiters | READ | Share and increment `fcnt`. |
| READ, waiter exists, same thread already holds | READ | Permit nested reentry. |
| READ, waiter exists, new thread | READ | Do not barge; conditional fail or queue. |
| WRITE, same holder | READ or WRITE nested fix | Permit and increment `fcnt`; holder remembers modes used. |
| READ, same holder is sole reader | WRITE | In-place promote. |
| READ, other readers exist | WRITE | Conditional fail, or drop own read fixes and queue a promotion. |
| incompatible and no holder | READ/WRITE | Conditional fail or timed queue wait. |

The current code also heals an impossible `NO_LATCH + waiter_exists + empty queue` state under BCB mutex to prevent an idle-grant CAS spin (`page_buffer.c:6320-6333`).

The waiter bit is an anti-barging summary, not the queue itself. Queue membership is in `next_wait_thrd` under BCB mutex. It must remain true while a blocked READ/WRITE exists, and is cleared after queue processing finds none (`page_buffer.c:7586-7589`, `page_buffer.c:11008-11017`).

### 5.2 Conditional failure and unconditional wait

A conditional conflict releases the BCB mutex and returns `ER_FAILED`; zero-wait may also set `ER_LK_PAGE_TIMEOUT` (`page_buffer.c:6560-6594`). No page ownership is returned, so the caller must not unfix.

An unconditional conflict queues the thread. Ordinary waiters append; a promoter is inserted at the head and there may be only one leading promoter (`page_buffer.c:7051-7099`). READ/WRITE waits are timed because the code explicitly does not guarantee absence of page-latch deadlocks (`page_buffer.c:7148-7165`). Interruption and timeout remove the waiter, may wake a compatible reader batch behind it, and set interruption/page-timeout/transaction-abort errors depending on transaction wait policy (`page_buffer.c:7199-7448`).

FLUSH waiters use the same queue but are not latch owners and wait without the ordinary page-latch timeout; they are removed by flush completion, not by the last-unfix reader/writer wake path (`page_buffer.c:7101-7145`, `page_buffer.c:7474-7511`).

### 5.3 Wake policy

At `fcnt==0`, `pgbuf_wakeup_reader_writer()` removes timed-out placeholders, skips FLUSH waiters, grants a prefix/batch of compatible readers, or exactly one writer (`page_buffer.c:7459-7589`). This is not strict global FIFO: a timed-out head is discarded, leading READs may be batched, FLUSH waiters are skipped for latch granting, and promotion is deliberately front-queued. It is nevertheless writer-starvation-aware because new external readers cannot barge when `waiter_exists` is true.

### 5.4 Explicit promotion API

`pgbuf_promote_read_latch()` requires the caller already own a READ-fixed page. If its holder owns all global fixes, it CASes the mode to WRITE in place. Otherwise:

- `PGBUF_PROMOTE_ONLY_READER` fails;
- another leading promoter causes failure;
- shared-reader promotion subtracts this holder's fixes, removes the holder, puts the promoter first, waits, and reconstructs its holder after the WRITE latch is granted (`page_buffer.c:2849-3059`).

The pointer argument is in/out because a failed blocking promotion may set `*pgptr_p = NULL` after releasing the caller's old ownership (`page_buffer.c:2974-2999`). The caller must inspect both return code and pointer state.

### 5.5 Unfix fast and full paths

`pgbuf_unfix()` first validates the pointer/holder, records performance history, and decrements/removes the thread holder (`page_buffer.c:3075-3188`). Then:

- fast READ unfix CAS-decrements `fcnt` only if mode remains READ, no waiter exists, and this is not the last global fix (`page_buffer.c:3190-3193`, implementation `page_buffer.c:7807-7828`);
- otherwise it locks the BCB and enters the full unlatch path (`page_buffer.c:3195-3201`).

The full path CAS-decrements `fcnt`; at zero it switches mode to `NO_LATCH` (`page_buffer.c:6657-6703`). Last unfix then:

1. applies a deferred move-to-LRU-bottom request if deallocation set it;
2. if no blocked reader/writer, places a VOID BCB into LRU or updates/boosts its existing zone;
3. wakes latch waiters;
4. if `ASYNC_FLUSH_REQ` is set, attempts safe flush and deliberately clears/ignores any resulting error because public unfix returns `void` (`page_buffer.c:6713-6882`).

Therefore:

```text
unfix != flush != commit != eviction
```

Unfix only ends one borrowed lifetime. A last-unfixed page may remain resident and dirty. It becomes immediately victimizable only if it is also in zone 3, clean, not flushing/direct-victim, and has no waiter/avoidance condition.

`pgbuf_unfix_all()` is an end-of-request diagnostic/backstop: in release it repeatedly unfixes leaked holders; in debug it asserts and reports rather than silently hiding them (`page_buffer.c:3276-3350`).

## 6. Ordered multi-page fix and watcher obligations

### Interface obligation

Ordered fix applies to HEAP and OVERFLOW pages (`page_buffer.h:166-167`). A caller must initialize a clean `PGBUF_WATCHER` with its heap group (heap-header VPID) and rank. Success attaches the watcher to the thread's holder. Release must use `pgbuf_ordered_unfix()`, which detaches the watcher before normal unfix.

The total order is:

```text
(group_id.volid, group_id.pageid, rank, vpid.volid, vpid.pageid)
```

Null group sorts last (`page_buffer.c:12193-12247`). Ranks place heap header before ordinary heap then overflow (`page_buffer.h:219-231`).

### Current algorithm

`pgbuf_ordered_fix()` first tries unconditional latch only when the thread holds no other page (or only this page); otherwise it tries conditional latch (`page_buffer.c:12340-12358`). An immediate success simply attaches the watcher, deriving a missing heap group when necessary (`page_buffer.c:12360-12403`).

If conditional fix conflicts, it audits every currently held ordered page. Every releasable holder must have exactly one watcher per fix, all watchers on that holder must agree on group/rank, and the saved set is bounded by `PGBUF_MAX_PAGE_FIXED_BY_TRAN` (`page_buffer.c:12460-12639`). It saves VPID, aggregate latch mode, page type, watcher list, and prevent-deallocation state; pages that sort after the requested page are detached/unfixed. Avoid-deallocation counters bridge the interval where a page is temporarily not latched. The requested page and saved pages are sorted and fixed in total order, then watchers are reattached (`page_buffer.c:12640-13080`).

If refixing occurred, watcher `page_was_unfixed` is left true; callers must treat prior page-derived pointers/assumptions as stale even if the watcher again has a non-null `pgptr`. On partial refix failure, the requested page is unfixed and some older watchers may have been restored while others remain null. The function comment makes inspection of every watcher an explicit error-path obligation (`page_buffer.c:12249-12264`).

`pgbuf_ordered_callback()` generalizes the same release/sort/refix envelope around a callback; its exit path unregisters all temporary prevent-deallocation counts (`page_buffer.c:13081-13398`).

Watcher internals are holder-linked. Attachment records page, latch mode, group/rank, and optionally resets `page_was_unfixed`; ordered unfix removes the watcher then calls normal unfix (`page_buffer.c:13479-13588`). `pgbuf_replace_watcher()` transfers one holder attachment without changing BCB fix count (`page_buffer.c:13759-13798`).

This interface solves page-latch ordering only. It does not replace transaction locks, establish record visibility, or guarantee general deadlock freedom for non-watcher pages.

## 7. Dirty state, page LSA, WAL, DWB, flush, and re-dirty

### 7.1 Mutation obligation

The caller must hold a WRITE latch while modifying page bytes and must coordinate logging/page LSA according to the subsystem's recovery contract. `pgbuf_set_dirty()` asserts the WRITE-holder condition internally through `pgbuf_set_dirty_buffer_ptr()`, sets DIRTY atomically, records holder dirtiness, and optionally unfixes (`page_buffer.c:4921-4955`, `page_buffer.c:11657-11675`).

The first clean-to-dirty transition increments the global dirty count and, if the BCB was a clean zone-3 victim candidate, removes it from the victim-candidate accounting (`page_buffer.c:16032-16061`). Repeated dirty marks are cheap and do not double-count.

Dirty and LSA are related but not one operation. `pgbuf_set_lsa()` writes the page LSA and, if this is the first unflushed logged change, records `oldest_unflush_lsa`. It rejects special temporary/auxiliary cases, validates against checkpoint redo LSA, and in release builds defensively sets DIRTY (`page_buffer.c:4996-5081`). The invariant checked elsewhere is:

```text
oldest_unflush_lsa != NULL => DIRTY
```

Temporary pages use the reserved `PGBUF_TEMP_LSA` in both page header and watermark (`page_buffer.c:17305-17317`). They do not participate in ordinary WAL forcing.

### 7.2 Safe-flush arbitration

All public/bulk/checkpoint flush routes converge on `pgbuf_bcb_safe_flush_internal()` or the lower flush primitive. With BCB mutex held, safe flush returns immediately if clean. It may flush immediately only if no other flush is active and the page is:

- unlatched;
- READ latched; or
- WRITE latched by the calling thread itself (`page_buffer.c:8821-8879`).

If another writer owns it, an async request flag asks that holder to flush on unfix/periodic check. If another flush owns it and synchronous completion is required, the caller enters the BCB queue with reason `PGBUF_LATCH_FLUSH`; an asynchronous caller merely requests progress and returns (`page_buffer.c:8882-8901`).

`pgbuf_flush_with_wal()` requires a fixed page and current holder, synchronously invokes safe flush, returns the same pointer on success, and does not unfix (`page_buffer.c:3589-3617`). `pgbuf_flush()` is a lossy convenience wrapper that asserts on failure but returns `void`; it optionally unfixes (`page_buffer.c:3566-3577`). Permanently latched writers must call `pgbuf_flush_if_requested()` periodically (`page_buffer.c:3629-3659`).

### 7.3 Generation-separated flush protocol

`pgbuf_bcb_flush_with_wal()` executes this sequence (`page_buffer.c:10733-10961`):

1. Under BCB mutex, validate identity.
2. Atomically set FLUSHING, clear the prior DIRTY generation and async request, remembering whether it was dirty (`page_buffer.c:10801-10803`, helper `page_buffer.c:16085-16098`).
3. Copy/encrypt a stable page image; reserve/fill a DWB slot if enabled.
4. Copy current page LSA and `oldest_unflush_lsa`, then null the BCB's oldest LSA.
5. Release the BCB mutex.
6. Force log through the copied page LSA when the saved oldest LSA is non-null (`page_buffer.c:10836-10857`).
7. Submit the copied image to DWB, or write the home page directly with `fileio_write()` (`page_buffer.c:10868-10899`).
   `dwb_add_page()` can return after slot enqueue when the block is not full; the DWB daemon may perform its block and
   home writes later (`double_write_buffer.cpp:2715-2820`).
8. On ordinary I/O failure, reacquire BCB, restore DIRTY for the old generation if necessary, restore oldest LSA, clear FLUSHING, and wake flush waiters (`page_buffer.c:10908-10922`).
9. On success, either queue the BCB for post-flush/direct-victim processing or reacquire it, clear FLUSHING, and wake flush waiters (`page_buffer.c:10927-10952`).

The old DIRTY bit is deliberately cleared before submission so a writer may dirty the still-resident BCB while the
copied generation is in the direct-I/O or DWB pipeline. On successful page-buffer-layer completion, only FLUSHING is
cleared; any new DIRTY bit remains. With DWB enabled, that completion may be slot acceptance rather than a completed
physical home write. Thus retirement of the old page-buffer responsibility and a currently dirty BCB are compatible,
not a lost update.

The WAL ordering applies to the copied generation:

```text
snapshot page LSA L
    -> force log through L
    -> submit copied image to DWB, or perform direct home write
    -> later DWB block/home writes and higher-level synchronization where applicable
```

DWB adds torn-page protection; it does not replace WAL. TDE encryption is applied to the copied output, leaving the resident plaintext page available to holders.

### 7.4 Early flush error exceptions

Two direct returns occur after FLUSHING was set and old DIRTY cleared but before the common rollback section:

- `tde_encrypt_data_page()` error (`page_buffer.c:10809-10816`);
- `dwb_set_data_on_next_slot()` error (`page_buffer.c:10822-10828`).

They return while the BCB is still locked and without visibly restoring DIRTY/oldest-LSA or clearing FLUSHING. These are **source-confirmed cleanup exceptions/defect candidates**. Callers' force-lock/force-unlock wrappers cannot repair flag state by themselves. Do not present “every flush error leaves the page dirty and retryable” as an unconditional guarantee for this revision.

### 7.5 Victim flush and checkpoint flush

The victim-flush daemon collects dirty zone-3 BCBs according to per-LRU flush priorities, rechecks VPID/dirty/flushing/fixed/hot conditions under BCB mutex, and skips pages whose WAL is not yet durable (`page_buffer.c:3789-3857`, `page_buffer.c:4043-4079`). It may sort candidates by VPID for sequentiality, flush neighbors, and force WAL/retry if all candidates were skipped only for WAL while allocators are waiting (`page_buffer.c:4005-4169`). It flushes; it does not itself decache the BCB.

Checkpoint first forces log through `flush_upto_lsa`, collects permanent dirty BCBs whose `oldest_unflush_lsa` is not newer than the target, sorts them by VPID, and flushes in rate-controlled batches (`page_buffer.c:4185-4312`). Each candidate is rechecked before flush. If a prior concurrent flush was followed by another qualifying modification, checkpoint may flush the same BCB again (`page_buffer.c:4533-4564`). It returns the smallest still-relevant oldest LSA when a candidate cannot be completed.

Bulk helpers scan all BCBs and recheck after locking. Variants can include fixed pages, restrict to unfixed pages, or null page LSA before flush; the latter are explicitly log/recovery-manager tools (`page_buffer.c:3663-3751`).

## 8. Replacement: LRU zones, AOUT, quotas, victims, and direct assignment

### 8.1 Eligibility versus policy

Eligibility is a safety predicate; policy chooses where to search. `pgbuf_is_bcb_victimizable()` rejects:

- DIRTY, FLUSHING, already direct-victim, or invalidated-direct-victim flags;
- positive `fcnt`;
- latch waiters / non-idle latch state (`page_buffer.c:9294-9312`, masks at `page_buffer.c:241-271`).

Policy additionally restricts normal eviction to LRU zone 3 and generally respects private-list quotas. A clean page in LRU1 is eligible in a durability sense but intentionally not a replacement candidate until it ages through zones.

### 8.2 Three LRU zones

The doubly linked LRU is divided contiguously:

- LRU1: hottest; no victimization and no routine boost on every hit;
- LRU2: buffer zone; old reused pages may boost;
- LRU3: victim zone (`page_buffer.c:182-217`).

Each list tracks top/bottom, zone boundaries/counters, candidate count, a victim hint, thresholds, quota, and age ticks (`page_buffer.c:577-620`). Add/remove/zone-change helpers update links, counters, candidate queues, and shared-page counts as one policy operation (`page_buffer.c:9703-10464`, `page_buffer.c:15791-15986`).

At a BCB's first normal last-unfix from VOID, AOUT history and thread-private ownership decide placement:

- private top for vacuum or a history hit in the same private list;
- private middle for a cold/no-history page;
- shared middle when history says another owner/list, or no private list exists (`page_buffer.c:6896-6994`).

Existing LRU1 hits stay put; LRU2 old-enough hits and LRU3 hits boost; cross-transaction access or sufficiently hot/old private pages move to a shared LRU (`page_buffer.c:6742-6844`, `page_buffer.c:7006-7037`).

### 8.3 AOUT history

AOUT is a bounded FIFO of VPIDs, not resident frames. It has its own mutex, node pool, and sharded memory hash (`page_buffer.c:622-648`, initialization `page_buffer.c:5807-5903`). Eviction records the VPID and former LRU index; reload's first unfix removes the history entry and uses it to distinguish reuse from one-time scan pollution (`page_buffer.c:9473-9475`, `page_buffer.c:10476-10644`).

This is the “out” portion of a 2Q-style policy. AOUT membership does not pin a page, prove disk allocation, or provide bytes.

### 8.4 Private and shared LRU quotas

Private LRUs isolate pages primarily used by one transaction/session; shared LRUs hold cross-transaction or promoted hot pages. `pgbuf_assign_private_lru()`/`pgbuf_release_private_lru()` manage session ownership and enablement (`page_buffer.c:14519-14635`).

The maintenance daemon periodically derives activity from per-LRU hits and per-thread unfix counts, computes a smoothed private-page ratio, divides private quota by activity, caps each list, updates zone thresholds, and queues over-quota lists with victims (`page_buffer.c:14260-14518`). Victim flush priority separately balances actual private/shared occupancy and over-quota private targets (`page_buffer.c:14127-14249`).

These are adaptive policy heuristics, not caller-visible placement guarantees. Counters are intentionally approximate: fix/unfix shards accept races because they feed coarse quota decisions (`page_buffer.c:2160-2244`).

### 8.5 Victim search

Lists with clean zone-3 candidates are advertised through lock-free queues so allocators do not scan every LRU. A CAS flag prevents the same LRU from being enqueued twice (`page_buffer.c:16378-16414`). Search order is:

1. own private LRU if over quota;
2. another/big private LRU;
3. shared LRU;
4. own private LRU even if under quota as a fallback (`page_buffer.c:9076-9251`).

Within one list, search starts from `victim_hint` or bottom, stays in zone 3, has a depth cap of 1000, filters avoidance/fixed state, try-locks the BCB while holding LRU mutex, rechecks victimizability, removes the chosen BCB from LRU, and records its VPID in AOUT (`page_buffer.c:9324-9534`). It wakes the flush daemon when the new tail is dirty or no victim can be found.

After LRU removal, `pgbuf_victimize_bcb()` performs the final safety recheck under BCB mutex, removes the hash mapping, clears VPID, and switches atomic latch to INVALID before reuse (`page_buffer.c:8643-8686`). This final recheck closes the gap between candidate observation and ownership.

### 8.6 Direct victims under pressure

When ordinary search fails in server mode, allocators enqueue in high- or low-priority waiter queues, wake the flush daemon, and sleep (`page_buffer.c:8247-8354`). High priority includes vacuum and threads already holding particularly important/hot pages. Every fourth consumer attempt checks low priority first, preventing total starvation (`page_buffer.c:15566-15588`).

Providers include:

- an unfix exposing a clean zone-3/VOID BCB;
- normal victim search under panic threshold;
- victim-flush collection;
- post-flush processing;
- maintenance fallback scans (`page_buffer.c:6820-6827`, `page_buffer.c:9550-9691`, `page_buffer.c:15429-15556`).

Assignment marks `PGBUF_BCB_VICTIM_DIRECT_FLAG`, stores the BCB in a per-thread slot, and wakes the allocator (`page_buffer.c:15429-15484`). A concurrent fix may replace that flag with `INVALIDATE_DIRECT_VICTIM`; the allocator atomically takes its slot, sees invalidation, clears it, and retries (`page_buffer.c:15598-15651`). Thus direct assignment is a revocable promise until the recipient re-locks and revalidates the BCB.

## 9. Invalidation and deallocation

### 9.1 Invalidation is a cache action

`pgbuf_invalidate()` expects the caller's fixed page, normally WRITE latched. If global `fcnt > 1`, it only removes one caller fix and returns. If this is the last fix, it synchronously flushes dirty content, unfixes, reacquires BCB mutex, and rechecks VPID/fcnt/avoid-victim before removing it from hash/LRU and returning it to the invalid list (`page_buffer.c:3383-3471`).

For persistent pages the source comment requires invalidation to be a postponed operation after commit decision; temporary pages may be invalidated freely (`page_buffer.c:3352-3376`). This is a caller transaction/recovery obligation, not something the BCB can infer.

`pgbuf_invalidate_all()` scans a volume (or all volumes), skips fixed pages, flushes dirty pages synchronously, rechecks identity/fix state, skips avoidance, and invalidates (`page_buffer.c:3487-3548`). `pgbuf_invalidate_bcb()` itself clears dirty and oldest LSA, removes from LRU/hash, and pushes to invalid list (`page_buffer.c:8695-8752`).

Invalid-list push nulls VPID, sets latch INVALID, sets zone INVALID, resets packed counters, links under invalid mutex, and finally unlocks the BCB (`page_buffer.c:8964-8984`). Pop uses a double-checked empty test, removes the head, locks the BCB, and changes it to VOID (`page_buffer.c:8915-8951`).

### 9.2 Logical page deallocation is not immediate cache invalidation

`pgbuf_dealloc_page()` requires exactly one fix. It logs undo/redo metadata, changes page type to `PAGE_UNKNOWN`, clears page flags/TDE, sets DIRTY plus `MOVE_TO_LRU_BOTTOM`, and unfixes (`page_buffer.c:15182-15235`). The source explicitly says the old immediate-invalidation approach was too expensive; the dirty deallocation image is flushed later and the BCB is steered toward replacement.

Redo repeats the type/TDE reset and dirties. Undo fixes with `OLD_PAGE_DEALLOCATED`, restores type/flags, writes a compensation record, and dirties/unfixes (`page_buffer.c:15245-15337`). The page-buffer meaning of “deallocated” is therefore persistent/recoverable `PAGE_UNKNOWN` plus storage allocation state, not merely absence from hash.

`pgbuf_fix_if_not_deallocated()` first checks the disk sector-reservation map, then fixes with `OLD_PAGE_MAYBE_DEALLOCATED`; a `PAGE_UNKNOWN` result is translated into success with output page `NULL` outside the exceptional recovery window (`page_buffer.c:15355-15405`).

Avoid-deallocation is a packed atomic counter separate from `fcnt`. `OLD_PAGE_PREVENT_DEALLOC` registers it before latch acquisition and unregisters once the latch is held; ordered release/refix uses it across unlatching gaps (`page_buffer.c:2474-2477`, `page_buffer.c:2562-2566`, helpers `page_buffer.c:16249-16337`). It prevents vacuum workers from logically deallocating the page; it is deliberately **not** a replacement pin. The source accepts that a marked BCB can be victimized and that the replacement BCB may consequently have a zero counter when ordered fix unregisters it (`page_buffer.c:16276-16296`). Positive `fcnt` and the victim-exclusion flags, not this counter, govern cache victimization.

### 9.3 Temporary-page deallocation

`pgbuf_dealloc_temp_page()` is paired with the specialized simple-fix contract. It sets `PAGE_UNKNOWN`, clears page flags and DIRTY, optionally decrements simple `fcnt`, and does not run normal holder/LRU/wakeup logic (`page_buffer.c:2814-2838`). It must not be generalized to persistent pages.

## 10. Daemons and observability

### 10.1 Daemon division of labor

| Daemon | Period/wakeup | Work |
|---|---|---|
| `pgbuf-maintain` | 100 ms | adjust private/shared quotas; backup direct-victim assignment (`page_buffer.c:16997-17009`, `page_buffer.c:17153-17161`) |
| `pgbuf-page-flush` | configured timed interval or wake-only | flush dirty victim candidates while explicitly woken, direct-victim waiters exist, or hit ratio is below 99.9% target (`page_buffer.c:16975-16992`, `page_buffer.c:17018-17067`) |
| `pgbuf-page-post-flush` | adaptive 1/10/100 ms | consume successfully flushed BCBs, clear FLUSHING, wake flush waiters, directly assign eligible victims (`page_buffer.c:17072-17085`, `page_buffer.c:17189-17203`) |
| `pgbuf-flush-control` | 50 ms | replenish file-I/O flush-control tokens; initializes/finalizes file-I/O controller (`page_buffer.c:17094-17143`, `page_buffer.c:17213-17227`) |

When no page-flush daemon is available, `pgbuf_wakeup_page_flush_daemon()` executes victim flushing synchronously. This supports standalone mode and recovery/bootstrap phases (`page_buffer.c:11684-11702`).

`pgbuf_daemons_destroy()` destroys all four through the thread manager; this must precede pool finalization (`page_buffer.c:17249-17255`). Daemon runtime statistics are exported in fixed daemon order (`page_buffer.c:17259-17287`).

### 10.2 Counters and their limits

Hot counters are sharded per thread (`show_status`, fix/unfix request shards) to avoid global cache-line contention. `pgbuf_start_scan()` locks only the show-status serialization mutex, then scans BCB flags/page headers without BCB locks and sums status shards (`page_buffer.c:17323-17443`). It exposes interval hit/request/read/write counts and an approximate current snapshot of free/clean/dirty/page-type categories (`page_buffer.c:17445-17530`).

`pgbuf_peek_stats()` similarly reads most BCB flags without locking and explicitly warns that concurrent changes affect the result. It reports fixed/dirty/zone/private/avoidance counts plus direct-victim and LRU-queue depths (`page_buffer.c:14748-14844`). These are operational observations, not a transactionally consistent inventory.

Other diagnostics include:

- `pgbuf_has_any_waiters()` locks the BCB and excludes FLUSH waiters (`page_buffer.c:14674-14692`);
- `pgbuf_has_any_non_vacuum_waiters()` walks without taking the BCB mutex, so it is a quick advisory check (`page_buffer.c:14701-14723`);
- `pgbuf_get_fix_count()` and `pgbuf_get_hold_count()` expose global fixes versus current-thread distinct holders (`page_buffer.c:15043-15065`);
- BCB mutex monitoring detects double locks, unintended two-BCB lock nesting, ownership mismatch, and exit leaks when enabled (`page_buffer.c:16656-16836`);
- `pgbuf_is_io_stressful()` means low-priority direct-victim waiters exist, not a general disk-utilization measurement (`page_buffer.c:16618-16625`).

The SHOW snapshot labels dirty zone-3 pages as `victim_candidate_pages` (`page_buffer.c:17356-17359`), whereas the internal `count_vict_cand` tracks clean eligible candidates. Presentations must name these metrics carefully; they are not the same predicate.

## 11. Opaque scan-copy buffer

### Interface obligation

The public header deliberately exposes only `PGBUF_COPY_BUFFER_HANDLE` and four functions (`page_buffer.h:512-519`). This object is a private scan-local copy, not a pool slot:

- allocation may return `NULL` on OOM;
- `pgbuf_copy_page_for_scan()` requires a currently fixed source page and a valid handle;
- the returned `PAGE_PTR` belongs to the handle and is valid until the next copy or free;
- it must never be passed to `pgbuf_unfix()`, dirtied, flushed, or treated as shared/live buffer ownership;
- it carries a copied VPID for page macros, but no real latch/holder/LRU/hash residency.

### Current layout and mechanics

The private struct is a dummy real `PGBUF_BCB` followed by a dynamically sized `PGBUF_IOPAGE_BUFFER`. Dynamic size uses `offsetof + PGBUF_IOPAGE_BUFFER_SIZE` because `FILEIO_PAGE.page` is a one-byte flexible-payload idiom (`page_buffer.c:910-924`). Allocation placement-constructs the atomic-containing dummy BCB, cross-links dummy BCB and frame, nulls VPID, and initializes debug guard bytes (`page_buffer.c:927-948`). Free explicitly ends the BCB lifetime then uses `free_and_init()` (`page_buffer.c:952-960`).

Copy performs exactly `IO_PAGESIZE` from the fixed source frame and copies source BCB VPID into the dummy BCB. `get_page_ptr()` returns the copied frame's page payload (`page_buffer.c:964-981`). There is no internal lock: ownership/thread confinement is a caller obligation.

Heap scan cache allocates the handle only for eligible query scans; OOM degrades silently to ordinary COPY mode with no `er_set` and no scan-start failure (`heap_file.c:6439-6465`). Same-VPID iterations can then skip a page-buffer fix and use the prior local frame; a new VPID is fixed normally, copied, and retained with a live watcher while slot traversal needs deallocation safety (`heap_file.c:7556-7565`, `heap_file.c:7632-7645`; one-page counterpart `heap_file.c:7923-7984`). Scan-cache end frees the handle (`heap_file.c:6787-6829`).

The copied frame makes record bytes stable independently of later pool-frame reuse, but it is only a snapshot. The live watcher retained by the heap scan supplies the concurrency/deallocation guarantee; the dummy BCB does not.

## 12. Lock ordering and concurrency invariants

The implementation uses short critical sections and rechecks rather than one global lock. The recurring acquisition discipline is:

```text
lookup:
  scan hash -> acquire BCB -> recheck VPID
  if hash mutex was needed, release it before blocking on BCB

cold miss:
  hash mutex -> install VPID load record -> release hash mutex
  allocate/load BCB under BCB ownership
  publish with hash mutex -> remove load record -> wake waiters

victim:
  LRU mutex -> try-lock BCB only -> recheck -> remove from LRU
  then hash mutex under BCB lock -> unlink mapping

flush:
  BCB mutex -> snapshot/mark generation -> release BCB
  WAL + DWB/file I/O with no BCB mutex
  reacquire BCB -> finish generation/wake
```

The BCB mutex monitor treats blocking acquisition of a second BCB as forbidden; only deliberate try-lock nesting under LRU is tolerated (`page_buffer.c:16663-16737`).

Key invariants:

1. A published non-null VPID appears in at most one resident BCB; cold VPID buffer locks serialize publishers.
2. Hash readers that acquire a candidate BCB must recheck VPID because victim reuse can race observation.
3. `fcnt` equals the total granted fixes, and normal per-thread holder counts partition those fixes; simple-fix is the explicit holderless exception.
4. `fcnt > 0`, a blocked latch waiter, DIRTY, FLUSHING, or direct-victim state prevents ordinary victim reuse.
5. `waiter_exists` summarizes remaining blocked READ/WRITE state and prevents new-reader barging; queue edits happen under BCB mutex.
6. A non-null `oldest_unflush_lsa` requires DIRTY, except transient state owned by the flusher after it saved and nulled that LSA.
7. FLUSHING separates the on-disk snapshot generation from any concurrent new DIRTY generation.
8. Only zone 3 contributes ordinary victims; zone changes and candidate counts must change together.
9. An invalid-list BCB has null VPID, INVALID latch, INVALID zone, no BCB flags, and reset packed counters.
10. A normal `PAGE_PTR` is invalid for caller use after matching unfix, even if the same frame happens to remain resident.

## 13. Fast, slow, retry, and error paths at a glance

| Operation | Fast path | Slow/retry path | Failure/cleanup boundary |
|---|---|---|---|
| READ fix hit | unlocked hash scan + atomic READ `fcnt++` + holder | locked hash/BCB lookup, latch queue | NULL means no caller pointer; holder-OOM accounting exception exists |
| WRITE/conditional hit | BCB lock + immediate CAS grant | conditional returns immediately | no unfix on rejected request |
| WRITE/unconditional hit | immediate compatible/nested grant | timed waiter queue; promotion may release old READ fixes | interruption/timeout removes waiter; promotion may null input pointer |
| cold fix | invalid-list BCB | victim search, direct-victim sleep, retry hash after competing loader | normal provisional cleanup; DWB-read direct-return exception |
| unfix | READ/no-waiter/non-last atomic decrement | BCB mutex, LRU/queue/deferred flush | public void; async-flush error is erased |
| dirty | already-dirty flag test | CAS and victim-candidate update | requires WRITE holder |
| flush | clean return | async request, FLUSH waiter, WAL+DWB/I/O | ordinary I/O rollback; TDE/DWB-slot early exceptions |
| victim | queue-advertised clean zone-3 candidate | scan depth, direct assignment, daemon flush/wait | final BCB/hash recheck; all-dirty error |
| ordered fix | conditional fix succeeds | detach/sort/fix/refix watcher set | inspect every watcher on partial failure |
| scan copy | same VPID local snapshot reuse | fix live page, copy frame | OOM degrades to COPY; handle is never unfixable ownership |

## 14. Findings that should be stated with calibrated confidence

### Source-confirmed behavior

- One cold-loader/publication owner per VPID, with waiters retrying hash.
- Shared READ anti-barging when waiters exist, except same-holder nested reentry.
- Timed page-latch waits are a termination policy, not a deadlock-proof algorithm.
- Dirty is cleared at flush start so re-dirty represents a new generation.
- WAL is forced through copied page LSA before DWB/home submission.
- Ordinary I/O failure restores the old dirty generation and oldest LSA.
- Finalization does not flush.
- Direct-victim assignment is revocable if the BCB is fixed again.
- Ordered-fix partial failure may leave only some watchers restored.
- Scan-copy handles are standalone dummy-BCB/frame pairs and OOM gracefully degrades heap scans.

### Source-confirmed exception/defect candidates

- DWB read error bypasses provisional miss cleanup (`page_buffer.c:8510-8515`).
- Holder allocation failure after latch/fix grant has no visible rollback at multiple call sites.
- TDE encryption and DWB-slot reservation errors bypass common FLUSHING/DIRTY rollback (`page_buffer.c:10809-10828`).
- `pgbuf_unfix()` deliberately swallows deferred asynchronous flush errors (`page_buffer.c:6860-6875`).

The first three are valid compatibility/proof concerns. They should not be promoted to “observed production bug” without a reachable fault-injection experiment and callee-side-effect audit.

### Implementation inferences, not stable promises

- Lock-free hit safety depends on permanent BCB storage plus positive-`fcnt` victim exclusion.
- Approximate monitoring can be transiently inconsistent because many reads intentionally avoid locks.
- LRU/AOUT/private placement is policy and may change without altering caller-visible fix/unfix semantics.
- Current direct-victim priority is starvation-mitigated, not strictly fair.

## 15. Compact source map

| Mechanism | Primary source lines |
|---|---|
| Public fetch/latch/watcher contracts | `src/storage/page_buffer.h:172-249` |
| Pool/BCB/hash/LRU/AOUT structures | `src/storage/page_buffer.c:382-849` |
| Lifecycle | `src/storage/page_buffer.c:1649-2114` |
| Main fix | `src/storage/page_buffer.c:2256-2685` |
| Simple temporary fix | `src/storage/page_buffer.c:2700-2838` |
| Promotion/unfix | `src/storage/page_buffer.c:2849-3274` |
| Invalidate/bulk invalidate | `src/storage/page_buffer.c:3383-3548` |
| Public/bulk/victim/checkpoint flush | `src/storage/page_buffer.c:3566-4678` |
| Dirty and page LSA | `src/storage/page_buffer.c:4921-5096`, `src/storage/page_buffer.c:11657-11675` |
| Initialization helpers | `src/storage/page_buffer.c:5559-5997`, `src/storage/page_buffer.c:13949-14118` |
| Holder/latch/wait/wakeup | `src/storage/page_buffer.c:6008-7590` |
| Hash/load/allocation | `src/storage/page_buffer.c:7600-8985` |
| Victim/LRU/AOUT | `src/storage/page_buffer.c:8994-10720`, `src/storage/page_buffer.c:15429-16610` |
| WAL/DWB flush primitive | `src/storage/page_buffer.c:10733-11048`, `src/storage/page_buffer.c:16020-16137` |
| Ordered fix/watchers | `src/storage/page_buffer.c:12193-13938` |
| Quotas/private LRUs | `src/storage/page_buffer.c:13949-14635` |
| Recovery/deallocation hooks | `src/storage/page_buffer.c:14896-15405` |
| Daemons/observability | `src/storage/page_buffer.c:16618-17530` |
| Opaque scan-copy buffer | `src/storage/page_buffer.c:910-981`, `src/storage/page_buffer.h:512-519` |
| Heap scan-copy ownership | `src/storage/heap_file.c:6439-6465`, `src/storage/heap_file.c:6787-6829`, `src/storage/heap_file.c:7556-7645`, `src/storage/heap_file.c:7923-7984` |
