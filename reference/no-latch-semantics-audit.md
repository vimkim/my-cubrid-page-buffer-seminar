# `PGBUF_NO_LATCH`: Real BCB State, Queue Tombstone, and Metadata Default

**Level:** Evidence reference

**Question:** Is `PGBUF_NO_LATCH` only a placeholder, or does the page-buffer implementation actively use it?

**Source baseline:** CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`

**Evidence used:** Verified mechanism from the pinned source. No runtime experiment or later revision is used.

## Short answer

It is not merely a placeholder. On a BCB, `PGBUF_NO_LATCH` is the real mode for a resident page that currently has no granted READ or WRITE page latch. A resident BCB—clean or dirty—normally stays in this mode after its last holder unfixes, potentially for a long time, until another fix, flush, invalidation, or replacement action reaches it.

The same enum value is also reused in two other fields, with different meanings:

| Field | What `PGBUF_NO_LATCH` means there | Stable or transient? |
|---|---|---|
| `PGBUF_BCB.atomic_latch.latch_mode` | No READ or WRITE page latch is currently granted | A stable resident-idle state, and also a transient handoff/rebind state |
| `THREAD_ENTRY.request_latch_mode` | Initially no request; while the entry is still in a BCB queue, timeout/interrupt has cancelled the request | Initialization default or active cancellation tombstone; not reliable after dequeue |
| `PGBUF_WATCHER.latch_mode` | A newly initialized watcher has not yet recorded the mode of a successful ordered fix | Metadata default only; an inactive cleared watcher may retain an older mode |

The maintainer rule is therefore: **always name the owning field**. “The BCB is `NO_LATCH`” and “this queued thread has `request_latch_mode == NO_LATCH`” are not the same state.

## One enum, three contexts

`PGBUF_LATCH_MODE` assigns value zero to `PGBUF_NO_LATCH`, followed by READ, WRITE, FLUSH, and INVALID. The header explicitly says FLUSH is only a blocking mode and a page is never fixed with a FLUSH latch ([`page_buffer.h:189-197`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L189-L197)). There is only one `PGBUF_NO_LATCH` enumerator in the pinned source. The apparent overload comes from storing that enum value in fields that describe different objects.

### BCB mode is packed with count and waiter summary

The BCB does not store `latch_mode` alone. `PGBUF_ATOMIC_LATCH_IMPL` packs:

```text
atomic_latch = (latch_mode, waiter_exists, fcnt)
```

into one atomic 64-bit value. The BCB separately owns the linked-list head `next_wait_thrd` and its mutex ([`page_buffer.c:499-522`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L499-L522)). Therefore a mode name never describes the full concurrency state by itself.

### Thread request mode describes a queue node

Every `THREAD_ENTRY` has `request_latch_mode`, `request_fix_count`, and `next_wait_thrd`; its constructor initializes the mode to `PGBUF_NO_LATCH` ([`thread_entry.hpp:248-256`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.hpp#L248-L256), [`thread_entry.cpp:85-111`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.cpp#L85-L111)). When that thread blocks, `pgbuf_block_bcb()` overwrites the field with READ, WRITE, or FLUSH and links the thread entry into the BCB queue ([`page_buffer.c:7041-7099`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7041-L7099)).

### Watcher mode is ordered-fix metadata

`PGBUF_INIT_WATCHER()` sets a watcher's mode to `PGBUF_NO_LATCH` while its `pgptr` and links are null. A successful ordered fix later records the actual READ or WRITE mode in `pgbuf_add_watch_instance_internal()` ([`page_buffer.h:124-160`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L124-L160), [`page_buffer.c:13535-13588`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13535-L13588)). `PGBUF_CLEAR_WATCHER()` clears the pointer and links but does not reset `latch_mode`; therefore an inactive watcher can retain its previous READ or WRITE metadata. Use `pgptr` and the watcher cleanliness contract, not `watcher.latch_mode == NO_LATCH`, to decide whether a watcher is active.

## The normal BCB lifecycle

The following is the main reason the docs mention `NO_LATCH` repeatedly:

```text
startup/free pool
  latch=INVALID, fcnt=0, VPID=NULL, zone=INVALID
        |
        | pop invalid list, bind requested identity
        v
newly claimed resident BCB
  latch=NO_LATCH, fcnt=0, zone=VOID
        |
        | grant requested fix
        v
active resident BCB
  latch=READ or WRITE, fcnt>0
        |
        | final unfix
        v
idle resident BCB
  latch=NO_LATCH, fcnt=0
        |
        +--------------------> next fix: READ or WRITE
        |
        +--------------------> flush: mode may remain NO_LATCH
        |
        `--------------------> safe victim/invalidation: INVALID
```

### 1. Pool initialization begins in INVALID

`pgbuf_initialize_bcb_table()` creates every BCB with null VPID, zero fix count, no waiter bit, and `PGBUF_LATCH_INVALID`. It then links the BCBs as the initial free/invalid population ([`page_buffer.c:5554-5569`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5554-L5569), [`5605-5639`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5605-L5639)).

Popping a BCB from the invalid list moves its replacement zone to VOID while holding the BCB mutex; the latch is still INVALID at that instant ([`page_buffer.c:8905-8951`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8905-L8951)). VOID and NO_LATCH are therefore not synonyms: VOID is list membership, while NO_LATCH is concurrency mode.

### 2. Identity binding resets the BCB to NO_LATCH

After allocation, the claim path writes the requested VPID and resets the packed latch tuple to `NO_LATCH`, `waiter_exists=false`, and `fcnt=0` before reading or creating the page ([`page_buffer.c:8470-8492`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8470-L8492)). This occurrence is transient preparation: the caller will request READ or WRITE for the new resident identity.

### 3. A fix converts idle NO_LATCH into READ or WRITE

The ordinary fix latch path accepts only READ or WRITE requests. When it sees an idle BCB, it constructs the new packed tuple with the requested mode and `fcnt=1`; compatible/reentrant fixes then update the mode/count according to ownership and queue state ([`page_buffer.c:6297-6452`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6297-L6452)). `PGBUF_NO_LATCH` is not a meaningful request to `pgbuf_fix()`.

The same entry has a fail-closed consistency check: if the BCB is NO_LATCH and its actual queue is empty but the packed `waiter_exists` bit is still true, it asserts, logs, and clears the stranded bit before attempting the idle grant. An idle grant expects the complete old tuple rather than using the mode in isolation ([`page_buffer.c:6318-6368`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6318-L6368)).

### 4. The last unfix converts READ or WRITE back to NO_LATCH

`pgbuf_unlatch_bcb_upon_unfix()` atomically decrements global `fcnt`. If it reaches zero, the same compare/exchange also changes the BCB mode to `PGBUF_NO_LATCH` ([`page_buffer.c:6636-6703`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6703)). With no blocked reader/writer, this is a normal stable idle state; the BCB may remain resident and linked in an LRU list.

The negative-count defensive branch also clamps the tuple to `NO_LATCH, fcnt=0, waiter_exists=false`. That is error recovery, not a normal transition, and should not be used to define the ordinary semantics ([`page_buffer.c:6684-6700`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6684-L6700)).

### 5. At handoff, NO_LATCH can coexist briefly with a queue

After the zero crossing, `pgbuf_wakeup_reader_writer()` expects `latch_mode=NO_LATCH` and `fcnt=0`, but the BCB may still have queued waiters. The routine removes cancelled entries, preserves FLUSH waiters, and changes the BCB to READ or WRITE as it grants requests ([`page_buffer.c:7451-7590`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7451-L7590)).

Thus this implication is false:

```text
BCB latch_mode == NO_LATCH  =>  BCB queue is empty
```

The stronger quiescent resident snapshot is:

```text
latch_mode == NO_LATCH
fcnt == 0
waiter_exists == false
next_wait_thrd == NULL
```

Even that snapshot does not say whether the page is clean, which replacement zone contains it, or whether another thread owns the BCB mutex.

### 6. Safe replacement requires NO_LATCH, but much more

The victim filter treats positive `fcnt`, a nonempty waiter queue, and—when sampled without the BCB mutex—a latch mode other than NO_LATCH as evidence that the BCB is currently in use. It separately rejects dirty/flushing/direct-victim/invalidation-flag states through `pgbuf_bcb_avoid_victim()` ([`page_buffer.c:9255-9312`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9255-L9312)). The LRU scan also requires LRU3 membership, flag eligibility, a successful BCB try-lock, and a protected recheck before detaching the BCB ([`page_buffer.c:9314-9475`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9314-L9475)).

`pgbuf_victimize_bcb()` rechecks the full condition under the BCB mutex, asserts `NO_LATCH`, removes the old VPID from the hash chain, and only then changes the mode to INVALID ([`page_buffer.c:8638-8679`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8638-L8679)). Therefore:

```text
NO_LATCH is necessary for an ordinary safe victim,
but NO_LATCH alone never means “victimizable.”
```

### 7. Returning to the invalid list restores INVALID

`pgbuf_put_bcb_into_invalid_list()` clears the VPID, sets `PGBUF_LATCH_INVALID`, changes the replacement zone to INVALID, and links the BCB into the invalid list ([`page_buffer.c:8954-8984`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8954-L8984)). An idle resident BCB and a free BCB are consequently distinct:

| State | VPID | Latch mode | Typical list membership |
|---|---|---|---|
| Resident but idle | Valid page identity | `PGBUF_NO_LATCH` | LRU1/LRU2/LRU3, or transient VOID |
| Free/unbound | Null identity | `PGBUF_LATCH_INVALID` | Invalid list |

## Synchronization that still applies in NO_LATCH

It says no page-content READ/WRITE latch is granted. It does not say that no code is operating on the BCB:

- A thread may own the BCB mutex while inspecting or changing metadata.
- A flush may proceed from NO_LATCH; the safe-flush path explicitly allows immediate flush for NO_LATCH and READ, subject to the FLUSHING flag and other checks ([`page_buffer.c:8809-8892`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8809-L8892)).
- A clean or dirty resident page may be NO_LATCH. Dirty is a separate BCB flag.
- Replacement list membership is a separate `PGBUF_ZONE` encoded in BCB flags.
- Queued demand is represented by `next_wait_thrd`; blocked READ/WRITE demand is summarized by `waiter_exists`, not by the mode alone. A FLUSH-only queue is the important exception, so the linked list remains authoritative.

This is why source assertions for flushing admit NO_LATCH, READ, or WRITE while separately requiring BCB-mutex ownership and, for WRITE, current-thread ownership ([`page_buffer.c:10723-10779`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10723-L10779)).

## The queue tombstone participates in waiter cancellation

Timeout and wakeup race over a `THREAD_ENTRY` that may still be linked in a BCB queue. The implementation uses `request_latch_mode == PGBUF_NO_LATCH` as a cancellation tombstone:

```text
waiting THREAD_ENTRY in BCB queue
  request_latch_mode = READ or WRITE
             |
             | timeout / interrupt, under thread-entry lock
             v
cancelled but possibly still linked
  request_latch_mode = NO_LATCH
             |
             +--> timeout side removes itself
             `--> owner/waker observes tombstone and removes it
```

On interrupt or timeout, `pgbuf_timed_sleep()` changes `request_latch_mode` to NO_LATCH before releasing the thread-entry lock, then invokes queue cleanup ([`page_buffer.c:7281-7384`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7281-L7384)). The wake routine checks the field, removes a tombstoned node without granting it, and rechecks after taking the thread-entry lock to close the race ([`page_buffer.c:7474-7544`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7474-L7544)). `pgbuf_wakeup()` likewise refuses to signal when it sees the tombstone ([`page_buffer.c:11606-11631`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L11606-L11631)).

The pinned source does not reset `request_latch_mode` to NO_LATCH on the successful dequeue path; a later wait overwrites it. Outside the protected queue/wakeup context, this field can therefore retain an old READ, WRITE, or FLUSH value. It is not an ownership ledger and must not be used to answer “which pages does this thread currently hold?” The holder list supplies that fact.

Documentation should call such a queued node a **cancelled request whose request mode was overwritten with the NO_LATCH tombstone**, not a “NO_LATCH latch request.” No caller requests a NO_LATCH page latch.

## Direct-reference ledger

The following groups cover every direct `PGBUF_NO_LATCH` reference in `page_buffer.c`, `page_buffer.h`, and `thread_entry.cpp` at the pinned baseline. Generic `get_latch()` callers that do not spell the enumerator are outside this syntactic ledger.

| Source cluster | Field and role |
|---|---|
| [`page_buffer.h:124-160`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L124-L160) | Initialize `PGBUF_WATCHER.latch_mode`; metadata default |
| [`page_buffer.h:189-197`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L189-L197) | Define the one shared enum value |
| [`thread_entry.cpp:85-111`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.cpp#L85-L111) | Initialize `THREAD_ENTRY.request_latch_mode`; request metadata default |
| [`page_buffer.c:6277-6368`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6277-L6368) | Describe/check idle BCB state, heal a stranded waiter bit, and prepare an idle grant |
| [`page_buffer.c:6636-6703`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6703) | Set BCB NO_LATCH when final unfix reaches zero; defensive negative-count clamp |
| [`page_buffer.c:7281-7384`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7281-L7384) | Overwrite a queued thread request with the timeout/interrupt tombstone |
| [`page_buffer.c:7451-7590`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7451-L7590) | Require BCB NO_LATCH at zero-count handoff; remove tombstones; grant READ/WRITE |
| [`page_buffer.c:7882-7930`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7882-L7930) | State hash deletion's idle precondition; unexpected-FLUSHING failure branch resets the BCB mode |
| [`page_buffer.c:8470-8492`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8470-L8492) | Reset a newly bound BCB identity to NO_LATCH, zero count, no waiter bit |
| [`page_buffer.c:8638-8679`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8638-L8679) | Assert NO_LATCH before deleting victim identity and changing to INVALID |
| [`page_buffer.c:8694-8750`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8694-L8750) | Permit normal invalidation only from NO_LATCH; unexpected else branch asserts and forces NO_LATCH before unlock |
| [`page_buffer.c:8809-8897`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8809-L8897) | Allow immediate safe flush from NO_LATCH (or compatible READ/current-owner WRITE) |
| [`page_buffer.c:9255-9312`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9255-L9312) | Treat a sampled non-NO_LATCH BCB as in use when the checker lacks the BCB mutex |
| [`page_buffer.c:10723-10779`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10723-L10779), [`12102-12130`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12102-L12130) | Assert the resident modes accepted by flush/batch machinery |
| [`page_buffer.c:10964-11020`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10964-L11020) | Explain why a stale waiter bit on an idle NO_LATCH BCB would poison the next fix |
| [`page_buffer.c:11606-11631`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L11606-L11631) | Suppress wakeup of a thread whose request became the NO_LATCH tombstone |
| [`page_buffer.c:14943-14974`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14943-L14974) | Render the enum value as `No Latch` for diagnostics |

The pinned GDB helper applies the same full-idle idea when inspecting BCBs: it treats positive `fcnt`, non-NO_LATCH mode, or a non-null wait queue as evidence that the BCB is not idle ([`page_buffer.gdb:394-409`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/contrib/gdb_debugging_scripts/page_buffer.gdb#L394-L409)).

## FLUSH belongs to the waiter request protocol

The shared enum makes this easy to misread. In the pinned mechanism:

- `PGBUF_LATCH_FLUSH` is placed in `THREAD_ENTRY.request_latch_mode` when a synchronous flusher must wait ([`page_buffer.c:8820-8897`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8820-L8897)).
- `pgbuf_wakeup_reader_writer()` leaves FLUSH requests queued; the actual flush-completion path removes and wakes them ([`page_buffer.c:7474-7512`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7474-L7512), [`page_buffer.c:10964-11020`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10964-L11020)).
- The BCB's in-flight flush state is the `PGBUF_BCB_FLUSHING` flag, not `atomic_latch.latch_mode = PGBUF_LATCH_FLUSH`.

A BCB concurrency diagram should consequently show normal resident modes as NO_LATCH, READ, and WRITE. FLUSH belongs on a waiter/flag lane, and INVALID belongs on the BCB lifetime lane.

## Stable state versus narrow transitions

| Observation | Interpretation |
|---|---|
| Resident BCB, `NO_LATCH`, `fcnt=0`, no queue | Normal stable idle page; it may be clean or dirty and may remain resident indefinitely |
| VOID BCB, `NO_LATCH`, `fcnt=0` during claim | New identity is prepared but the requested fix has not yet been granted |
| `NO_LATCH`, `fcnt=0`, queue nonempty under BCB mutex | Zero-count handoff is selecting and granting waiters |
| LRU3 BCB sampled as non-NO_LATCH without its mutex | Conservatively treat it as fixed/in transition and skip it for now |
| Queued thread with `request_latch_mode=NO_LATCH` | Timed out or interrupted request awaiting/removing its queue node |
| Initialized watcher with `latch_mode=NO_LATCH`, `pgptr=NULL` | No successful ordered-fix mode has been recorded yet |
| Invalid-list BCB | Must be described as `PGBUF_LATCH_INVALID`, not NO_LATCH |

The source comment in `pgbuf_is_bcb_fixed_by_any()` also recognizes a narrow mutex-owned transition where a non-NO_LATCH observation can be temporary during unfix and will become NO_LATCH before unlock. The victim algorithm still uses the protected full tuple and queue state rather than treating the mode as a standalone truth ([`page_buffer.c:9255-9284`](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9255-L9284)).

## Documentation corrections to apply

The canonical guide and paired lessons should use these formulations:

1. On first mention, write **“BCB latch mode `PGBUF_NO_LATCH`”**, not bare “NO_LATCH.” Define it as “no currently granted page-content READ/WRITE latch.”
2. Add the stable idle tuple and explicitly say that NO_LATCH does not imply clean, free, VOID, LRU3, queue-empty, mutex-free, or victimizable.
3. In waiter diagrams, replace labels such as “NO_LATCH waiter” or “cancelled NO_LATCH” with **“cancelled waiter: `THREAD_ENTRY.request_latch_mode=NO_LATCH` tombstone.”**
4. Keep BCB replacement diagrams field-specific: LRU3 plus clean/flag checks plus zero fixes/no waiters plus BCB try-lock/recheck. Do not draw NO_LATCH as a direct synonym for “victim.”
5. Keep three orthogonal state lanes visible when space permits:

   ```text
   lifetime/list: INVALID <-> VOID <-> LRU1/LRU2/LRU3
   page latch:    NO_LATCH <-> READ/WRITE
   I/O/requests:  DIRTY, FLUSHING, waiter queue
   ```

6. Do not draw `PGBUF_LATCH_FLUSH` as a granted BCB page latch. Draw a FLUSH waiter in the queue and `PGBUF_BCB_FLUSHING` as the in-flight BCB flag.
7. When discussing a thread's ownership, use its `PGBUF_HOLDER` entries. `THREAD_ENTRY.request_latch_mode` is queue-request metadata and can be stale after successful dequeue.
8. When discussing ordered watchers, treat NO_LATCH only as initialization metadata; use `watcher.pgptr` and watcher links to determine whether it is active.

## Maintainer checklist

When reading or changing a `NO_LATCH` branch, answer these questions before inferring behavior:

- Which object owns the field: BCB, thread entry, or watcher?
- If it is a BCB, what are `fcnt`, `waiter_exists`, `next_wait_thrd`, zone, flags, and mutex ownership?
- If it is a thread entry, is the entry currently linked in a BCB queue and protected by the relevant thread/BCB locks?
- If it is a watcher, is `pgptr` non-null, or is the mode only initialized/stale metadata?
- Is the code on a normal lifecycle path, a zero-count handoff, or one of the defensive repair branches?

That field-qualified reading resolves the apparent contradiction: `PGBUF_NO_LATCH` is both an important real BCB state and a reused sentinel/default in other records.
