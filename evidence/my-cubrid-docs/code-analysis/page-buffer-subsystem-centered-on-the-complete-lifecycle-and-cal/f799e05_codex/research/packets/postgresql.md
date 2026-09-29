# PostgreSQL Comparator Evidence Packet

- Role: Role 2 — PostgreSQL Comparator
- Topic: CUBRID page buffer subsystem centered on the complete `pgbuf_fix()` → `pgbuf_unfix()` lifecycle
- Declared Scope SHA-256: `796828eab6754ed60bd88d65be34913c7d510e61b61d9a06e73f5340faae2d08`
- PostgreSQL root: `/home/vimkim/gh/pg/postgres`
- PostgreSQL revision: `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc` (`master`)
- Evidence state: `COMMIT` for every cited file; the only worktree entry was pre-existing untracked `.omc/`
- Captured at UTC: `2026-08-28T07:29:43Z`
- Runtime status: source-only; PostgreSQL was not built or run

## Shared-scenario answer in one view

PostgreSQL does not have one operation whose contract is identical to CUBRID `pgbuf_fix(vpid, old/new, latch_mode, latch_condition)`. Its nearest responsibility is deliberately split:

```text
ReadBuffer()/ReadBufferExtended()
  -> BufferTag lookup or victim allocation
  -> pin (replacement protection)
  -> start/join physical read when invalid
  -> validate page and publish BM_VALID
  -> return Buffer (still pinned, not normally content-locked)

caller
  -> LockBuffer(SHARE | SHARE_EXCLUSIVE | EXCLUSIVE)
  -> inspect or mutate BufferGetPage(buffer)
  -> [mutation] MarkBufferDirty() before XLogInsert(), then PageSetLSN()
  -> UnlockReleaseBuffer(), or unlock and retain/release the pin separately
```

Thus the shared scenario maps as follows:

1. B-tree traversal uses `_bt_getbuf()` (`ReadBuffer` + `_bt_lockbuf` + page validation), releases each parent before acquiring the child, and returns the leaf locked and pinned.
2. Heap index fetch retains a pin on the current heap block but takes a `BUFFER_LOCK_SHARE` only around visibility/HOT-chain examination.
3. A writer obtains an exclusive content lock, mutates inside a critical section, marks dirty before inserting WAL, sets the page LSN from `XLogInsert()`, then atomically unlocks and releases its pin.
4. Under pressure, clock sweep considers only unpinned buffers, ages `usage_count`, and pins a candidate. A dirty candidate is conditionally share-exclusively locked, WAL is forced through the page LSN for permanent relations, the page is handed to the kernel, dirty state is cleared only while the conflicting content lock excludes writers, and then the old `BufferTag` mapping is invalidated.

The nearest overall classification is **partial analogy**. The responsibility and central safety goals align, but PostgreSQL splits pin and content lock, uses `BufferTag`/relation forks instead of `VPID`, uses clock sweep rather than CUBRID LRU-family metadata, and has no page-buffer DWB or built-in TDE stage in the traced write path.

## Examined files and complete functions/call paths

| File | Complete functions / regions examined | Why it matters |
|---|---|---|
| `src/include/storage/bufmgr.h` | `ReadBufferMode`, `BufferLockMode`, `LockBuffer` | External Interface modes and the pin/lock split |
| `src/include/storage/buf_internals.h` | buffer state layout, flags, `BufferTag`, `BufferDesc`, mapping-partition helpers | Identity, shared ownership, atomic state, lock/waiter fields |
| `src/backend/storage/buffer/buf_init.c` | `BufferManagerShmemRequest`, `BufferManagerShmemInit`, `BufferManagerShmemAttach` | Frame/descriptor/CV allocation and startup invariants |
| `src/backend/storage/buffer/buf_table.c` | `BufTableShmemRequest`, `BufTableHashCode`, `BufTableLookup`, `BufTableInsert`, `BufTableDelete` | Unique `BufferTag -> buf_id` mapping and partition-lock obligations |
| `src/backend/storage/buffer/bufmgr.c` | `ReadBuffer`, `ReadBufferExtended`, `ReadBufferWithoutRelcache`, `PinBufferForBlock`, `ReadBuffer_common`, `StartReadBuffersImpl`, `StartReadBuffer(s)`, `WaitReadBuffers`, `AsyncReadBuffers`, `BufferAlloc`, `GetVictimBuffer`, `InvalidateVictimBuffer`, `MarkBufferDirty`, `PinBuffer`, `UnpinBuffer*`, `ReleaseBuffer`, `UnlockReleaseBuffer`, `BufferLockAcquire`, `BufferLockConditional`, `BufferLockAttempt`, queue/dequeue/wakeup/release helpers, `StartSharedBufferIO`, `WaitIO`, `TerminateBufferIO`, `AbortBufferIO`, `buffer_readv_complete_one`, `BufferSync`, `BgBufferSync`, `SyncOneBuffer`, `FlushBuffer`, `FlushUnlockedBuffer`, `CheckPointBuffers`, resource-owner release callbacks | End-to-end hit, miss, wait, retry, I/O failure, pin/lock lifetime, dirty/flush/checkpoint/replacement, and error cleanup |
| `src/backend/storage/buffer/freelist.c` | `ClockSweepTick`, `StrategyGetBuffer`, `StrategySyncStart`, strategy-ring paths | Replacement policy and resource-pressure failure |
| `src/backend/access/nbtree/nbtpage.c` | `_bt_getbuf`, `_bt_allocbuf`, `_bt_relandgetbuf`, `_bt_relbuf`, `_bt_lockbuf`, `_bt_unlockbuf`, `_bt_conditionallockbuf`, `_bt_upgradelockbufcleanup` | B-tree caller contract and conditional-lock deadlock defense |
| `src/backend/access/nbtree/nbtsearch.c` | `_bt_search`, `_bt_moveright` | Parent/child lifetime and split-race traversal |
| `src/backend/access/heap/heapam_indexscan.c` | `heapam_index_fetch_tuple` and reachable HOT-chain search context | B-tree TID to heap-buffer read contract |
| `src/backend/access/heap/heapam.c` | `heap_insert` | Mutation, dirty-before-WAL, page LSN, and release ordering |
| `src/backend/access/transam/xlogutils.c` | `XLogReadBufferForRedo`, `XLogReadBufferForRedoExtended`, `XLogFlushBufferForRedoIfInit` | Recovery caller contract and full-page-image restoration |
| `src/backend/access/transam/README` | WAL-logged action and full-page-image rules | Normative source-tree description cross-checked against callers |
| `src/include/storage/smgr.h`, `src/backend/storage/smgr/smgr.c`, `src/backend/storage/smgr/md.c` | `smgrwrite`, `smgrwritev`, `mdwritev` | Physical write, short-write retry, ENOSPC, and fsync registration |
| `src/backend/utils/misc/guc_parameters.dat`, `src/backend/utils/adt/pgstatfuncs.c` | buffer/I/O GUC entries and IO-op column mapping | Configuration and observability |

## PG-C001 — fix-lookup-load

### Claim candidate

`PG-C001` (`source`, `SOURCE-CONFIRMED`): PostgreSQL identifies a shared-buffer page by `BufferTag = {spcOid, dbOid, relNumber, forkNum, blockNum}` and returns a numeric `Buffer` whose frame is pinned. `BufferAlloc()` performs a partition-locked lookup; a hit pins the descriptor and distinguishes `BM_VALID` from an in-progress/failed/deferred read, while a miss obtains a clock-sweep victim, resolves insertion races under the mapping partition's exclusive lock, installs the tag and `BM_TAG_VALID`, and returns the still-invalid pinned descriptor. The read path then either starts or joins `BM_IO_IN_PROGRESS`, dispatches `smgrstartreadv()`, validates each completed page with `PageIsVerified()`, and atomically publishes either `BM_VALID` or `BM_IO_ERROR` while waking I/O waiters. The mapping exists before I/O so concurrent readers converge on one frame rather than allocate duplicate copies.

### Source references

| Path | Symbol | Lines | SHA-256 | Evidence |
|---|---|---:|---|---|
| `src/include/storage/buf_internals.h` | `BufferTag` | 149–168 | `9ebf91dfbabf16fc66a783b795129919cb076bde30c35de08d1d5ec20e55c845` | identity fields |
| `src/include/storage/buf_internals.h` | `BufferDesc` | 266–359 | `9ebf91dfbabf16fc66a783b795129919cb076bde30c35de08d1d5ec20e55c845` | tag/state/refcount/content-lock/waiter ownership |
| `src/backend/storage/buffer/buf_init.c` | `BufferManagerShmemRequest` | 73–111 | `f203fffe8f118f8d30f2db6277d17f21c0da15272aec23d38f598950401d5bca` | `NBuffers` descriptors, blocks, and I/O CVs |
| `src/backend/storage/buffer/buf_init.c` | `BufferManagerShmemInit` | 113–145 | `f203fffe8f118f8d30f2db6277d17f21c0da15272aec23d38f598950401d5bca` | initial empty states and immutable `buf_id` |
| `src/backend/storage/buffer/buf_table.c` | `BufTableLookup` | 89–111 | `94c4083062f39d816f8ab0aa9447faf3f187cfc768d792c8f742765a4b7c7e6f` | partition-lock lookup contract |
| `src/backend/storage/buffer/buf_table.c` | `BufTableInsert` | 113–145 | `94c4083062f39d816f8ab0aa9447faf3f187cfc768d792c8f742765a4b7c7e6f` | duplicate-tag collision result |
| `src/backend/storage/buffer/bufmgr.c` | `ReadBufferExtended` | 884–940 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | pinned return, modes, validation/error contract |
| `src/backend/storage/buffer/bufmgr.c` | `ReadBuffer_common` | 1270–1368 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | split zero-and-lock vs normal synchronous read paths |
| `src/backend/storage/buffer/bufmgr.c` | `StartReadBuffersImpl` | 1370–1592 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | hit/miss batching, forwarding, synchronous/AIO branch |
| `src/backend/storage/buffer/bufmgr.c` | `WaitReadBuffers` | 1752–1918 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | foreign I/O wait and partial-read retry |
| `src/backend/storage/buffer/bufmgr.c` | `AsyncReadBuffers` | 1920–2175 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | join/start I/O and `smgrstartreadv()` dispatch |
| `src/backend/storage/buffer/bufmgr.c` | `BufferAlloc` | 2177–2351 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | lookup, pin, victim, publication collision, tag installation |
| `src/backend/storage/buffer/bufmgr.c` | `StartSharedBufferIO` | 7250–7362 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | I/O state arbitration and wait/no-wait results |
| `src/backend/storage/buffer/bufmgr.c` | `buffer_readv_complete_one` | 8569–8716 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | checksum/header verification and `BM_VALID`/`BM_IO_ERROR` publication |

### Reachable call paths

```text
ReadBuffer
  -> ReadBufferExtended
    -> ReadBuffer_common
      -> StartReadBuffer
        -> StartReadBuffersImpl
          -> PinBufferForBlock
            -> BufferAlloc
              hit: BufTableLookup -> PinBuffer -> return valid/invalid
              miss: GetVictimBuffer -> BufTableInsert
                    -> install BufferTag + BM_TAG_VALID -> return invalid
          -> AsyncReadBuffers
            -> StartBufferIO -> StartSharedBufferIO
            -> smgrstartreadv
              -> aio_shared_buffer_readv_cb.complete_shared
                -> buffer_readv_complete
                  -> buffer_readv_complete_one
                    -> PageIsVerified
                    -> TerminateBufferIO(BM_VALID or BM_IO_ERROR)
      -> WaitReadBuffers (join foreign I/O or retry partial/failed work)
```

### State transitions

```text
unmapped/reusable
  --BufTableInsert + tag install--> TAG_VALID, pinned, !VALID
  --StartSharedBufferIO-----------> TAG_VALID, pinned, IO_IN_PROGRESS
  --successful completion--------> TAG_VALID, pinned, VALID
  --failed/invalid completion----> TAG_VALID, pinned, IO_ERROR, !VALID
  --later retry-------------------> IO_IN_PROGRESS -> VALID or IO_ERROR
```

### Limits

- `ReadBuffer` returns a `Buffer` handle, not a stable direct page pointer. `BufferGetPage()` derives the frame address; the caller must keep the pin.
- `RBM_ZERO_AND_LOCK` is a special combined zero/lock path. It does not make ordinary `ReadBuffer` equivalent to CUBRID's latch-bearing `pgbuf_fix()`.
- The revision includes asynchronous I/O and multi-block reads, so older PostgreSQL descriptions that say every miss performs a synchronous `smgrread()` are stale for this pinned source.

## PG-C002 — latch-holder-unfix

### Claim candidate

`PG-C002` (`source`, `SOURCE-CONFIRMED`): PostgreSQL separates replacement protection (pin) from page-content protection (buffer content lock). A backend's first pin increments the shared descriptor refcount and creates a resource-owner-tracked `PrivateRefCountEntry`; repeated pins by that backend increment only the private count. Content locks have share, share-exclusive, and exclusive modes encoded in the same atomic descriptor state but tracked separately from pins. Blocking acquisition queues the backend and waits on its semaphore with cancel/die interrupts held; conditional exclusive acquisition returns false without waiting. `ReleaseBuffer()` removes one private pin and decrements the shared refcount only when that backend's private count reaches zero. `UnlockReleaseBuffer()` can subtract the content-lock state and final shared pin in one atomic operation, process content-lock wakeups, notify a cleanup-lock pin waiter, and resume interrupts. On error, the ResourceOwner callbacks abort owned I/O and release a held content lock plus every leaked pin.

### Source references

| Path | Symbol | Lines | SHA-256 | Evidence |
|---|---|---:|---|---|
| `src/include/storage/buf_internals.h` | buffer state layout / flags | 33–147 | `9ebf91dfbabf16fc66a783b795129919cb076bde30c35de08d1d5ec20e55c845` | atomic refcount, usage, flags, and content-lock representation |
| `src/include/storage/bufmgr.h` | `BufferLockMode` | 202–223 | `78163ef84277a07935fd4bee2f06f79036efd3920086ad3caf177fe4db9ab794` | lock compatibility modes |
| `src/backend/storage/buffer/bufmgr.c` | `PrivateRefCountData` | 100–131 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | backend-local pin count and owned lock mode |
| `src/backend/storage/buffer/bufmgr.c` | private-refcount design | 230–269 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | first-pin shared count optimization and lifetime checks |
| `src/backend/storage/buffer/bufmgr.c` | `PinBuffer` | 3269–3386 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | CAS pin, usage aging, private repeated pins |
| `src/backend/storage/buffer/bufmgr.c` | `UnpinBufferNoOwner` | 3472–3528 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | last-private-pin shared decrement and cleanup waiter signal |
| `src/backend/storage/buffer/bufmgr.c` | `ReleaseBuffer` | 5605–5618 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | public unpin Interface |
| `src/backend/storage/buffer/bufmgr.c` | `UnlockReleaseBuffer` | 5620–5682 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | combined atomic unlock/unpin and wakeups |
| `src/backend/storage/buffer/bufmgr.c` | `BufferLockAcquire` | 5902–6031 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | wait queue, retry, semaphore, interrupt holdoff |
| `src/backend/storage/buffer/bufmgr.c` | `BufferLockConditional` | 6061–6107 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | no-wait conditional failure |
| `src/backend/storage/buffer/bufmgr.c` | `BufferLockAttempt` | 6109–6180 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | exact lock compatibility CAS |
| `src/backend/storage/buffer/bufmgr.c` | `BufferLockWakeup` | 6322–6452 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | waiter selection and wake ordering barrier |
| `src/backend/storage/buffer/bufmgr.c` | `ResOwnerReleaseBufferIO` / `ResOwnerReleaseBuffer` | 7869–7927 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | error unwind of I/O, lock, and pin ownership |

### Lock compatibility at this revision

| Requested mode | Conflicts with | Typical use |
|---|---|---|
| `BUFFER_LOCK_SHARE` | exclusive | read page contents |
| `BUFFER_LOCK_SHARE_EXCLUSIVE` | share-exclusive and exclusive | flush / hint-bit-safe mutation while allowing readers |
| `BUFFER_LOCK_EXCLUSIVE` | every content-lock mode | ordinary page mutation |

### Semantic mapping

- **Pin ↔ CUBRID fix/holder replacement protection:** equivalent responsibility, partial Interface analogy. Both keep a frame from replacement, but PostgreSQL coalesces a backend's repeated pins into one shared refcount contribution plus a private count.
- **Content lock ↔ CUBRID page latch:** partial analogy. PostgreSQL acquisition is a separate call after ordinary `ReadBuffer`; its three-mode compatibility is not CUBRID's exact latch-mode/condition matrix.
- **`UnlockReleaseBuffer` ↔ `pgbuf_unfix`:** partial analogy. It combines lock release and final unpin only for callers that currently own both; callers may instead unlock while retaining the pin, or release an already-unlocked pin.
- **Timeout/interruption:** no equivalent was found for a page-content-lock timeout result in this path. Blocking content-lock acquisition defers cancel/die interrupts until unlock; a conditional API gives immediate boolean failure. This should not be paraphrased as CUBRID's timeout/interrupt contract.

## PG-C003 — caller-contracts

### Claim candidate

`PG-C003` (`source`, `SOURCE-CONFIRMED`): PostgreSQL access methods own the pin/lock balance and WAL protocol. Nbtree centralizes page access through wrappers: `_bt_getbuf()` reads, locks, and checks the page; `_bt_search()` descends by releasing each parent before reading/locking the child and returns only the leaf locked and pinned; `_bt_allocbuf()` uses a conditional content lock for an FSM candidate to avoid self/concurrent deadlock. After a B-tree lookup yields a heap TID, `heapam_index_fetch_tuple()` retains a pin on the current heap block across calls but acquires a share content lock only while inspecting visibility/HOT-chain state. For a durable heap insert, the caller mutates under an exclusive content lock and critical section, calls `MarkBufferDirty()` before `XLogInsert()`, sets `PageSetLSN()` from the returned record pointer, ends the critical section, then unlocks and unpins. Redo uses `XLogReadBufferForRedoExtended()` to return an exclusively (or cleanup) locked and pinned page, restore a WAL full-page image when required, set its LSN, and mark it dirty. These responsibilities are caller contracts, not behavior inferred solely from `ReadBuffer()`.

### Source references

| Path | Symbol | Lines | SHA-256 | Evidence |
|---|---|---:|---|---|
| `src/backend/access/nbtree/nbtpage.c` | `_bt_getbuf` | 812–842 | `a076f1f664aa048efac5cbde5f530584c5f20bac1dda7c79b6c6395993b2e428` | nbtree requires both pin and lock and validates the page |
| `src/backend/access/nbtree/nbtpage.c` | `_bt_allocbuf` | 844–972 | `a076f1f664aa048efac5cbde5f530584c5f20bac1dda7c79b6c6395993b2e428` | conditional lock to avoid deadlock and zero-page recovery |
| `src/backend/access/nbtree/nbtpage.c` | `_bt_relbuf` / wrappers | 1017–1111 | `a076f1f664aa048efac5cbde5f530584c5f20bac1dda7c79b6c6395993b2e428` | required release wrapper and no-wait wrapper |
| `src/backend/access/nbtree/nbtsearch.c` | `_bt_search` | 80–210 | `1270d65b1af5c27e5b293dffa2cbcab00c983a6dd0a1e9814ff983117cdd1cc0` | parent release before child and returned leaf ownership |
| `src/backend/access/nbtree/nbtsearch.c` | `_bt_moveright` | 212–324 | `1270d65b1af5c27e5b293dffa2cbcab00c983a6dd0a1e9814ff983117cdd1cc0` | split-race retry/right-link traversal |
| `src/backend/access/heap/heapam_indexscan.c` | `heapam_index_fetch_tuple` | 231–298 | `9d0b917ec6b06de6f13ad678ded6f398b51772e017c1a042908f0230fb76a774` | retained heap pin, short share-lock interval, tuple-slot handoff |
| `src/backend/access/heap/heapam.c` | `heap_insert` | 2030–2067 | `9be2f576df608c95992b65b2009640c3da5a9238aba73cf2cf106af124f77878` | buffer acquisition, visibility-map ordering, critical section |
| `src/backend/access/heap/heapam.c` | `heap_insert` | 2068–2105 | `9be2f576df608c95992b65b2009640c3da5a9238aba73cf2cf106af124f77878` | page mutation and dirty-before-WAL |
| `src/backend/access/heap/heapam.c` | `heap_insert` | 2151–2197 | `9be2f576df608c95992b65b2009640c3da5a9238aba73cf2cf106af124f77878` | WAL registration/insertion, page LSN, release order |
| `src/backend/access/transam/xlogutils.c` | `XLogReadBufferForRedoExtended` | 346–452 | `bec4ea21e83653bcd86901064097e5560d07828f1f6db8b16a3932ace45af3ac` | redo locked-page contract, FPI restore, LSN, dirty state |
| `src/backend/access/transam/README` | WAL-logged action schema | 437–486 | `137ff195933dddbf58cfa62fb42a56e713d20d41c226cdf6973b3567a7a881f5` | source-tree contract cross-check |

### Representative shared call path

```text
B-tree lookup
  _bt_search
    -> _bt_getroot
    -> _bt_moveright
    -> _bt_relandgetbuf(parent, child, BT_READ)
         UnlockReleaseBuffer(parent)
         ReadBuffer(child)
         _bt_lockbuf(child, BT_READ)
         _bt_checkpage(child)
    -> return leaf locked+pinned

heap fetch from leaf TID
  heapam_index_fetch_tuple
    -> ReleaseBuffer(previous heap block) [only on block switch]
    -> ReadBuffer(heap block)              [pin retained]
    -> LockBuffer(SHARE)
    -> heap_hot_search_buffer
    -> LockBuffer(UNLOCK)
    -> ExecStoreBufferHeapTuple
```

### Mutation and recovery ordering

```text
normal heap insert:
  exclusive-locked+pinned buffer
  -> START_CRIT_SECTION
  -> mutate page
  -> MarkBufferDirty
  -> XLogRegisterBuffer / XLogInsert
  -> PageSetLSN
  -> END_CRIT_SECTION
  -> UnlockReleaseBuffer

redo:
  XLogReadBufferForRedoExtended
  -> read/zero and exclusive-lock
  -> restore FPI or compare page LSN
  -> PageSetLSN + MarkBufferDirty when replayed
  -> redo routine later unlocks/releases
```

### Semantic mapping

- **Ordered fixing:** partial analogy. PostgreSQL nbtree generally releases the parent before acquiring the child and repairs split races by moving right/retrying. It does not expose a general `PGBUF_WATCHER`-like ordered-fix object in the traced APIs.
- **Page validation:** equivalent responsibility, different placement. Generic reads validate checksums/page headers in the I/O completion path; nbtree also checks its access-method-specific page shape after locking.
- **Dirty-before-release and dirty-before-WAL:** strong semantic equivalent for the shared invariant, though the API and critical-section/error model differ.
- **Error cleanup:** partial analogy. Normal code balances explicitly, while ResourceOwner callbacks provide backstop cleanup of I/O, content locks, and pins after PostgreSQL errors.

## PG-C004 — dirty-wal-flush-replace

### Claim candidate

`PG-C004` (`source`, `SOURCE-CONFIRMED`): A PostgreSQL caller may mark a shared buffer dirty only while it is pinned and exclusively content-locked. Checkpoint correctness relies on dirtying before `XLogInsert()`. Checkpoint first snapshots the target set by adding `BM_CHECKPOINT_NEEDED` to buffers dirty at checkpoint start; background writer and checkpoint both pin candidates and flush under a share-exclusive content lock. Replacement uses clock sweep: pinned buffers are skipped, nonzero `usage_count` is aged, and an unpinned zero-usage descriptor is atomically pinned; if it is dirty, the backend conditionally share-exclusively locks it to avoid deadlock, may reject a strategy-ring victim that would require a WAL flush, and otherwise calls `FlushBuffer()`. `FlushBuffer()` owns output with `BM_IO_IN_PROGRESS`, reads the protected page LSN, calls `XLogFlush()` first for permanent relations, sets the checksum, writes through `smgrwrite()` to `mdwritev()`/`FileWriteV()`, and clears dirty/checkpoint-needed state on successful completion. The data write initially reaches the kernel and the segment is registered for fsync before checkpoint durability. I/O errors retain dirty state, set `BM_IO_ERROR` through resource-owner cleanup, and can report repeated failure. PostgreSQL uses WAL full-page images/reinitialization to address torn-page hazards; no DWB or built-in TDE transformation stage occurs in the traced page-buffer write path.

### Source references

| Path | Symbol | Lines | SHA-256 | Evidence |
|---|---|---:|---|---|
| `src/backend/storage/buffer/bufmgr.c` | `MarkBufferDirty` | 3160–3219 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | pinned+exclusive precondition and atomic dirty transition |
| `src/backend/storage/buffer/freelist.c` | `ClockSweepTick` | 103–166 | `276156fbe9ee0f85c711cfbebc99c2c1c0e62ce2926fb4e80d8c751bd3d364ba` | global atomic clock hand |
| `src/backend/storage/buffer/freelist.c` | `StrategyGetBuffer` | 168–317 | `276156fbe9ee0f85c711cfbebc99c2c1c0e62ce2926fb4e80d8c751bd3d364ba` | pin/usage policy and no-unpinned-buffer error |
| `src/backend/storage/buffer/bufmgr.c` | `GetVictimBuffer` | 2547–2686 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | dirty-victim conditional lock, WAL-aware ring rejection, flush, invalidation retry |
| `src/backend/storage/buffer/bufmgr.c` | `BufferSync` | 3564–3840 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | checkpoint target snapshot, sorting, throttling, pending writeback |
| `src/backend/storage/buffer/bufmgr.c` | `SyncOneBuffer` | 4137–4212 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | dirty-before-WAL dependency and flush locking |
| `src/backend/storage/buffer/bufmgr.c` | `FlushBuffer` | 4509–4642 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | WAL force, checksum, physical write, successful clean transition |
| `src/backend/storage/buffer/bufmgr.c` | `TerminateBufferIO` | 7388–7453 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | exact flag clearing and waiter wakeup |
| `src/backend/storage/buffer/bufmgr.c` | `AbortBufferIO` | 7455–7502 | `e06ef92568b542148fda10ecae264c7451a52c0269182d1403d0ec6a31837732` | failure keeps dirty and sets I/O error |
| `src/include/storage/smgr.h` | `smgrwrite` | 123–135 | `ce36c4c2c6d4f866e4e381c3bfee90e7f75de1469d7542228f0e934314eea529` | single-block wrapper to `smgrwritev` |
| `src/backend/storage/smgr/smgr.c` | `smgrwritev` | 764–798 | `fdc06ead7eb9e413f420cc12c016fa4052a6e56cea52504616683c96dbd4418c` | kernel write now, fsync provision before checkpoint |
| `src/backend/storage/smgr/md.c` | `mdwritev` | 1062–1165 | `7436b973583f6b5437c1937e6d6aa0ee602e4dbb7c73e3ad408f254ab6ad167a` | direct `FileWriteV`, short-write loop, ENOSPC, dirty-segment registration |
| `src/backend/access/transam/README` | `XLogRegisterBuffer` FPI contract | 555–578 | `137ff195933dddbf58cfa62fb42a56e713d20d41c226cdf6973b3567a7a881f5` | torn-page defense through FPI/reinitialization |

### Flush/replacement state flow

```text
VALID, clean, pinned+EXCLUSIVE
  --caller mutation + MarkBufferDirty--> VALID, DIRTY
  --XLogInsert + PageSetLSN-----------> VALID, DIRTY, page LSN=L
  --unlock/unpin----------------------> replacement-eligible only when refcount=0

clock sweep:
  refcount>0     -> skip
  usage_count>0  -> decrement and continue
  refcount=0 && usage_count=0 -> CAS pin candidate

dirty victim:
  conditional SHARE_EXCLUSIVE lock fails -> unpin and choose another
  lock succeeds -> StartSharedBufferIO(output) -> IO_IN_PROGRESS
                -> [permanent] XLogFlush(page LSN)
                -> checksum -> smgrwrite -> kernel
                -> TerminateBufferIO(clear DIRTY/CHECKPOINT_NEEDED)
                -> unlock -> invalidate mapping (retry if repinned/redirtied)
```

### Configuration and observability

| Concern | PostgreSQL mechanism | Source |
|---|---|---|
| Pool capacity | `shared_buffers` sets `NBuffers` | `src/backend/utils/misc/guc_parameters.dat:2714–2723` |
| Read concurrency | `effective_io_concurrency`; `io_method` selects worker/io_uring/sync implementation | `guc_parameters.dat:847–855`, `1408–1414` |
| Background cleaning | `bgwriter_delay`, `bgwriter_lru_maxpages`, `bgwriter_lru_multiplier`, `bgwriter_flush_after` | `guc_parameters.dat:337–372` |
| Checkpoint pacing/writeback | `checkpoint_completion_target`, `checkpoint_flush_after` | `guc_parameters.dat:410–426` |
| Backend writeback | `backend_flush_after` | `guc_parameters.dat:311–319` |
| Buffer hit/read/dirty/write | per-query `BufferUsage` plus `pg_stat_io` IO operations (`HIT`, `READ`, `WRITE`, `EVICT`, `REUSE`, `FSYNC`, `WRITEBACK`) | `bufmgr.c:1682–1707`, `2152–2170`, `3210–3218`, `4598–4627`; `pgstatfuncs.c:1370–1455` |
| Wait diagnosis | wait events `BufferIO`, `BufferShared`, `BufferShareExclusive`, `BufferExclusive` | `bufmgr.c:5984–6017`, `7184–7247` |
| Low-level tracing | `TRACE_POSTGRESQL_BUFFER_READ_*`, `BUFFER_FLUSH_*`, `BUFFER_SYNC_*`, SMGR write tracepoints | cited `bufmgr.c` and `md.c` paths |

`guc_parameters.dat` SHA-256 is `e308005cebdcbe545fe9fe8635bfcf071dcc5cbb741b599b50cb3ab72ba94a67`. `pgstatfuncs.c` SHA-256 is `5a9fca47f3f52d07fb0755a8b9a162eda1831777143b721b0db6977a47866bb9`.

## Identical comparison axes

| Axis | PostgreSQL responsibility split | Mapping classification and semantic gap |
|---|---|---|
| Module boundary / Interface | `ReadBuffer*` finds/loads and pins; `LockBuffer*` protects contents; access methods own validation-specific rules, dirty/WAL/LSN ordering, and balanced release; SMGR owns storage I/O; checkpointer/bgwriter own proactive cleaning. | **Partial analogy.** There is no single ordinary `pgbuf_fix()`-equivalent Interface combining page identity, old/new semantics, pin, and requested latch condition. |
| Identity / ownership / lifetime | `BufferTag` names relation fork block; shared hash maps to stable descriptor/frame slot; pin prevents tag/frame reuse; one shared refcount contribution per backend plus private multiplicity; ResourceOwner tracks pins and I/O. | **Partial analogy.** Same core identity→frame lifetime responsibility, different identity namespace and holder accounting. |
| State transitions | `TAG_VALID`, `VALID`, `DIRTY`, `IO_IN_PROGRESS`, `IO_ERROR`, `CHECKPOINT_NEEDED`, refcount, usage count, and content-lock bits share atomic state; tag changes under header lock and mapping partition lock. | **Partial analogy.** Comparable lifecycle roles, not field/state equivalence to `PGBUF_BCB`. |
| Concurrency | Partitioned mapping locks prevent duplicate identities; atomic pin/usage/lock state; per-buffer I/O CV/AIO wait ref; explicit content-lock queue; conditional lock used in deadlock-prone victim/FSM paths. | **Partial analogy.** Pin and content lock are orthogonal and PostgreSQL's lock modes/wait semantics differ from CUBRID latch conditions/timeouts. |
| Durability / recovery | Dirty-before-WAL-insert makes checkpoint target selection safe; flush forces WAL to page LSN before data write; checkpoint later fsyncs; redo uses LSN and FPI restore. | **Equivalent core WAL-ordering responsibility**, but **partial analogy** overall because checkpoint/FPI/write-path architecture differs. |
| Policy | Global clock sweep with bounded `usage_count` (maximum 5), optional access-strategy rings, WAL-aware ring rejection, predictive bgwriter, checkpoint target snapshot/sort/throttle. | **Partial analogy.** Not CUBRID's LRU/victim metadata or daemon policy. |
| Errors / resource pressure | All pinned after a full unchanged scan raises `ERROR`; read verification may error or zero by mode/GUC; partial reads retry; write ENOSPC raises error; ResourceOwner abort marks `BM_IO_ERROR` and releases locks/pins. | **Partial analogy.** Same categories, different result model (`ereport` nonlocal error handling vs C return/error codes) and no content-lock timeout contract found. |
| Configuration / observability | `shared_buffers`, I/O method/concurrency, bgwriter/checkpoint/writeback GUCs; `pg_stat_io`, query `BufferUsage`, checkpointer stats, wait events, tracepoints. | **Partial analogy.** Rich equivalent responsibilities; names, counter scopes, and daemon attribution differ. |
| Performance | Partitioned lookup, CAS pin/lock state, per-backend private refcounts, 64-byte padded descriptors, multi-block/AIO reads, rings, clock sweep, sorted/checkpoint-balanced writes, coalesced writeback advice. | **Partial analogy.** Optimization targets align, algorithms and cost surfaces do not. |

## Behavior-level mapping classifications

| Declared central behavior | Nearest PostgreSQL mechanism | Classification | Reason |
|---|---|---|---|
| `fix-lookup-load` | `ReadBuffer*` → `BufferAlloc` → `Start/WaitReadBuffers` → `StartSharedBufferIO` → SMGR/AIO completion | **partial analogy** | Same lookup/hit/miss/single-copy/load/validate/pin responsibility; ordinary read does not return content-locked and identity/storage namespaces differ. |
| `latch-holder-unfix` | `PinBuffer` + `LockBuffer*` + private/shared refcounts + `ReleaseBuffer`/`UnlockReleaseBuffer` + ResourceOwner cleanup | **partial analogy** | Same replacement-vs-content protection, but split Interfaces and different modes/wait semantics/accounting. |
| `caller-contracts` | nbtree wrappers/search ordering, heap pin/short lock interval, dirty-before-WAL access-method protocol, redo helpers | **partial analogy** | Same obligation families, but no general watcher object and PostgreSQL critical-section/ResourceOwner error model differs. |
| `dirty-wal-flush-replace` | `MarkBufferDirty`, clock sweep, bgwriter/checkpoint, `FlushBuffer`, `XLogFlush`, SMGR/md, FPI redo | **partial analogy** | WAL-before-data and deferred dirty write are equivalent core invariants; replacement, checkpoint, torn-page defense, and physical-I/O pipeline differ. |
| CUBRID DWB stage | no stage between `FlushBuffer` and `mdwritev/FileWriteV`; PostgreSQL relies on WAL full-page images/reinitialization for torn-page recovery | **no equivalent** | Responsibility is located in WAL/FPI rather than a double-write buffer. |
| CUBRID TDE transformation seam | no built-in encryption transform found on the traced shared-buffer read/write path | **no equivalent within searched core scope** | Do not generalize this to extensions, filesystem encryption, or every PostgreSQL fork. |

## Errors and resource-pressure details

- A full clock-sweep scan that finds every buffer pinned without making an aging change raises `ERROR: no unpinned buffers available` (`freelist.c:239–275`). It does not wait indefinitely for an unpin.
- Mapping insertion races are normal: after obtaining a victim, `BufTableInsert()` may report that another backend installed the requested tag. PostgreSQL unpins its unused victim and pins the winner (`bufmgr.c:2263–2317`).
- An in-progress read is not treated as a second physical miss. The caller either joins a valid AIO wait reference, waits through the buffer I/O CV, or sees completion and retries (`bufmgr.c:2032–2096`, `7250–7362`).
- Physical read completion separates failed lower-level I/O, invalid page/checksum, zero-on-error, and ignored-checksum cases before publishing `BM_VALID` or `BM_IO_ERROR` (`bufmgr.c:8569–8700`).
- A failed buffer output remains dirty. Error cleanup sets `BM_IO_ERROR`; a later write failure can warn that the problem may be permanent (`bufmgr.c:7455–7502`).
- `mdwritev()` loops after a short write; a negative write reports the relation segment and gives a disk-space hint for `ENOSPC` (`md.c:1108–1159`).
- Content-lock acquisition itself exposes blocking and immediate conditional forms, not a page-latch timeout result. Blocking acquisition holds cancel/die interrupts until lock release (`bufmgr.c:5902–6031`, `6061–6107`).

## Negative-search scopes

### No page-buffer DWB implementation in the traced core path

Performed:

```text
rg -n -i "double.?write|torn page|transparent data encryption|\bTDE\b|data encryption" \
  src/backend/storage src/backend/access/transam src/include/storage src/include/access
```

Results contained torn-page/FPI discussion but no `doublewrite`, `double_write_buffer`, or DWB implementation. More importantly, the reachable write chain was read completely:

```text
FlushBuffer (bufmgr.c:4526–4642)
  -> smgrwrite (smgr.h:130–135)
    -> smgrwritev (smgr.c:790–798)
      -> storage-manager smgr_writev
        -> mdwritev (md.c:1070–1165)
          -> FileWriteV
          -> register_dirty_segment
```

No intermediate double-write stage exists in that pinned core chain. PostgreSQL's source-tree WAL contract instead requires registering modified buffers so first-after-checkpoint full-page images or page reinitialization protect against torn pages (`access/transam/README:555–578`). This supports **no equivalent** for the DWB stage, not “PostgreSQL has no torn-page defense.”

### No built-in page-buffer TDE transform in the traced core path

The same scoped search found no TDE/data-encryption transformation in shared buffer, SMGR, md, or WAL block-image paths. Reads dispatch from `AsyncReadBuffers()` to SMGR into the frame; writes pass frame bytes through checksum setup to SMGR/md. Therefore the safe conclusion is **no equivalent within the examined core source path**. This search does not cover extensions, downstream forks, storage appliances, or filesystem encryption.

### No single `pgbuf_fix()`-shaped Interface

Searched `src/include/storage/bufmgr.h`, all of `src/backend/storage/buffer/`, and representative heap/nbtree/recovery callers for read/fix/pin/lock/release APIs. Ordinary callers use the split `ReadBuffer*` + `LockBuffer*` Interface. `RBM_ZERO_AND_LOCK` combines zero-initialization with an exclusive/cleanup lock only for new/reinitialized pages; it is not a general combined read-latch API.

### No general ordered-watcher object

Searched representative nbtree and heap caller families and buffer headers for `watcher`, `ordered fix`, and parent/child buffer acquisition abstractions. Ordering is encoded in access-method call flows and wrappers (`_bt_relandgetbuf`, `_bt_conditionallockbuf`, visibility-map-before-heap locking), not in one shared buffer-manager watcher type. This is a scoped negative, not proof that no PostgreSQL subsystem has any object named watcher.

## Unknowns and limitations

1. **Every PostgreSQL access method was not audited.** Heap, nbtree, redo, buffer manager, SMGR/md, checkpointer/bgwriter, configuration, and statistics cover the shared scenario. GiST, GIN, hash, BRIN, custom table/index AMs, and extensions may impose additional caller-specific lock ordering.
2. **AIO executor internals were followed to the registered shared-buffer callbacks, but worker/io_uring implementation scheduling was not reconstructed.** This does not weaken the buffer state/I/O ownership Claim, but exact completion-thread/process scheduling remains outside this packet.
3. **OS/fsync completion beyond dirty-segment registration was not reconstructed end-to-end.** The packet proves kernel handoff and registration for checkpoint fsync, not every sync-file queue/retry/shutdown branch.
4. **No PostgreSQL runtime evidence exists by contract.** Performance, wait distribution, and exact I/O grouping are source-derived only.
5. **`BufferAccessStrategy` ring details are summarized rather than exhaustively specified.** The default clock-sweep path and WAL-aware ring rejection needed by the shared scenario were read; every ring size/tuning branch was not elevated to a Claim.
6. **The CUBRID side was not reopened by this role.** Mapping labels use the frozen Declared Scope's CUBRID responsibilities. The main agent must cite direct CUBRID Claims alongside any final cross-database Claim.

## Contradictions and stale-model warnings

1. **“`ReadBuffer()` returns a locked page” is false for ordinary reads.** It returns a pinned buffer. Ordinary callers separately call `LockBuffer`; only zero-and-lock modes are special.
2. **“Each PostgreSQL pin increments the shared refcount” is false.** Repeated pins by one backend increment only its private refcount; the descriptor's shared refcount represents participating backends/AIO ownership, not raw nesting depth.
3. **“Replacement flush can block on the victim content lock” is false for `GetVictimBuffer()`.** It conditionally acquires share-exclusive and abandons the victim on failure specifically to avoid deadlock.
4. **“Dirty write completion can blindly clear a concurrently re-dirtied flag” does not describe this revision.** `FlushBuffer()` holds share-exclusive content protection, which conflicts with ordinary exclusive dirties and with other share-exclusive lockers; successful `TerminateBufferIO(clear_dirty=true)` clears dirty under that exclusion. A later writer must acquire its conflicting lock after release and dirty again.
5. **“Checkpoint writes every page dirtied at any time during the checkpoint” is false.** The initial scan marks only the start-set with `BM_CHECKPOINT_NEEDED`; later dirtying lacks that marker and belongs to a later checkpoint unless another writer happens to flush it.
6. **“PostgreSQL has a DWB because it handles torn pages” is false.** The traced core path directly writes through SMGR/md; WAL full-page images/reinitialization locate torn-page protection in recovery logging.
7. **“A cache miss always does synchronous single-page `smgrread()`” is stale for this revision.** `StartReadBuffers`/`AsyncReadBuffers` support multi-block AIO and joining foreign in-progress I/O, while `io_method=sync` retains a synchronous execution path.

## Integration notes for comparison Claims

- A final `CMP-*` Claim about the shared scenario should cite `PG-C001` for identity/lookup/I/O publication, `PG-C002` for pin/content-lock lifetime, `PG-C003` for caller ordering and dirty-before-WAL, and `PG-C004` for flush/replacement/durability.
- Use **equivalent** only for a narrow responsibility/invariant such as “replacement cannot reuse a pinned/fixed frame” or “permanent data-page output must not precede WAL durability through the page LSN.”
- Use **partial analogy** for the four central behaviors as wholes.
- Use **no equivalent** only for the DWB and built-in TDE stages within the explicit negative-search scope. Do not collapse PostgreSQL FPI into DWB terminology.
- The main report must keep PostgreSQL `Buffer` (numeric handle), `BufferDesc` (shared descriptor), frame bytes (`BufferBlocks`), pin, content lock, header lock, and relation lock as distinct concepts.
