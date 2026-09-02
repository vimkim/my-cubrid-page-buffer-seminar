# Holder Entry Structure, Lifetime, and Unfix Cost

**Level:** Advanced
**Prerequisites:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
**Capability gained:** Trace a `PGBUF_HOLDER` from pool initialization through nested fix and final unfix, and evaluate when holder-list work can make `pgbuf_unfix()` expensive.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism for structure and control flow; Inference for performance consequences. No pinned runtime profile in this corpus proves a bottleneck.

## Why this needs a separate route

The Core material already establishes the two-ledger contract: a BCB's global `fcnt` counts fixes across threads, while one thread's holder `fix_count` records that thread's nested debt to one BCB. It also explains that attribution runs from each thread's holder list toward BCBs, not from a BCB to its holder threads.

That is enough to use fix/unfix correctly, but not enough to answer structure, storage lifetime, growth, list maintenance, or cost questions. This page owns those implementation details.

## Structure: one entry has two mutually exclusive list roles

![Per-thread holder entry structure and lifetime](../assets/holder-entry-lifetime.svg)

At the pinned revision, `PGBUF_HOLDER` contains:

| Field group | Meaning while held | Meaning while free |
|---|---|---|
| `fix_count`, `bufptr` | Nested fixes owed by this thread to one BCB, and the BCB back-reference. | No active debt; their old values are not the free-list identity. The next grant overwrites the meaningful values. |
| `thrd_link` | Links this entry through the thread's used/hold list. | Not used to link the free list. |
| `next_holder` | `NULL` by invariant for a held entry. | Links this entry through the owning thread's free list. |
| `perf_stat` | Remembers whether the page was dirty before the hold, whether this holder dirtied it, and whether READ/WRITE latches participated. | Reinitialized when a new logical hold starts. |
| watcher fields | `watch_count`, `first_watcher`, and `last_watcher` attach ordered-watcher ownership to the same thread–BCB record. | Empty before reuse; final holder removal requires `watch_count == 0`. |
| debug fix-site fields | A non-release build can retain call-site text for outstanding fixes. | Diagnostic storage only; not part of the release contract. |

Each thread index also owns one cache-line-sized `PGBUF_HOLDER_ANCHOR`: counters plus `thrd_free_list` and `thrd_hold_list` heads. The anchor is padded to 64 bytes because these fields are hot and adjacent thread anchors must not false-share. Source: constants and structure definitions at `src/storage/page_buffer.c:86-94,127-132,438-500`; pool ownership at `src/storage/page_buffer.c:783-804`.

### How a repeated fix finds the existing entry

![One per-thread holder anchor organizing active and reusable holder entries](../assets/holder-anchor-vs-entry.svg)

The anchor does not remember an entry's numeric position. `pgbuf_find_thrd_holder(thread_p, bufptr)` lazily caches the current thread's array-selected anchor in `thread_p->m_holder_anchor`, starts at that anchor's `thrd_hold_list`, compares each active `holder->bufptr` with the requested BCB address, and follows `thrd_link` until it finds a match or reaches `NULL`.

A successful same-thread fix of the same BCB increments the matching entry's `fix_count`; it does not create another entry or change `num_hold_cnt`. A fix of a different BCB creates a new active entry and prepends it to the list. Consequently, `num_hold_cnt` counts distinct active thread–BCB records, not the sum of nested fix debts. Another thread fixing the same BCB uses its own anchor and its own holder, while the BCB's global `fcnt` combines both threads.

There is no per-thread holder hash table or BCB-owned reverse holder list in this path, so lookup is O(`H`) in the number of distinct BCBs held by that thread. Source: exact traversal at `src/storage/page_buffer.c:6090-6126`; normal match/allocate branches at `6494-6531`; resident READ fast path at `7753-7782`.

## Two lifetimes must be distinguished

### Backing-storage lifetime

`pgbuf_initialize_thrd_holder()` runs during page-buffer initialization. It allocates one anchor per configured thread and reserves seven `PGBUF_HOLDER` entries per thread (`PGBUF_DEFAULT_FIX_COUNT == 7`). Every thread starts with those seven entries on its free list and an empty hold list.

If a thread has more than seven distinct held BCBs, `pgbuf_allocate_thrd_holder_entry()` takes an entry from a process-wide expansion set. Expansion is serialized by `free_holder_set_mutex` and allocates `PGBUF_NUM_ALLOC_HOLDER == 10` entries at a time. Once an entry is assigned and later released, it goes to that thread's free list. Reserved storage and every expansion set remain allocated until `pgbuf_finalize()` frees the pool; an individual final unfix does not free heap memory.

Source: initialization call at `src/storage/page_buffer.c:1641-1778`; holder initialization at `src/storage/page_buffer.c:5922-5994`; expansion at `src/storage/page_buffer.c:6000-6085`; teardown at `src/storage/page_buffer.c:1921-2003`.

### Logical hold lifetime

One entry's logical binding is shorter:

1. `pgbuf_latch_bcb_upon_fix()` or the lock-free READ hit first searches the current thread's hold list with `pgbuf_find_thrd_holder()`.
2. If no entry points to this BCB, `pgbuf_allocate_thrd_holder_entry()` pops the thread free-list head (or expands), prepends the entry to the hold list, and the grant path sets `bufptr`, `fix_count = 1`, latch/dirty statistics, and empty watcher state.
3. A nested fix by the same thread on the same BCB reuses that entry and increments `fix_count`; it does not allocate a second holder.
4. Watcher helpers attach and detach watcher objects through the same entry. Blocking promotion may remove and later recreate a holder because ownership is temporarily released.
5. `pgbuf_unfix()` calls `pgbuf_unlatch_thrd_holder()`, which finds the entry and decrements `fix_count`. A positive count keeps the binding live. Zero calls `pgbuf_remove_thrd_holder()`, which removes the entry from the hold list and pushes it onto that thread's free list.

The backing address can therefore survive many unrelated logical holds. A holder pointer is not a permanent page identity, just as a `PAGE_PTR` address is not one.

Source: find/decrement/remove at `src/storage/page_buffer.c:6098-6275`; normal grant maintenance at `src/storage/page_buffer.c:6298-6634`; lock-free READ grant at `src/storage/page_buffer.c:7735-7798`; normal unfix at `src/storage/page_buffer.c:3062-3201`; watcher lookup at `src/storage/page_buffer.c:13673-13699`.

## Can holder maintenance make `pgbuf_unfix()` a bottleneck?

**Short answer:** yes, the concern is mechanically plausible for some ownership shapes, but it is not proven for a workload merely because many fixes and unfixes occur.

Let `H` be the number of distinct BCBs currently held by one thread. The per-thread hold list is singly linked and has no BCB-to-holder index:

| Unfix work | Source-visible cost |
|---|---|
| Find the holder | `pgbuf_unlatch_thrd_holder()` calls `pgbuf_find_thrd_holder()`: up to `H` pointer comparisons. |
| Consume a nested debt | Decrement `fix_count`; if it stays positive, the holder remains where it was. |
| Remove the final debt | Unless the entry is the hold-list head, `pgbuf_remove_thrd_holder()` walks from the head again to find its predecessor: up to another `H` links. |
| Release global ownership | Every call decrements the atomic BCB `fcnt`. Compatible READ release can use `pgbuf_lockfree_unfix_ro()` only when the latch is READ, there are no waiters, and global `fcnt > 1`. Other cases take the BCB mutex. |
| Handle global zero | The last global release may wake waiters and execute zone placement, promotion, direct-victim, or async-flush work. This is separate from holder-list complexity. |

First-time acquisition also matters. Fixing `N` distinct pages without releasing earlier ones performs 0, 1, 2, …, `N−1` unsuccessful comparisons: every new BCB lookup must reach the end before it can allocate and prepend an entry. The total is `N(N−1)/2`, or O(`N²`), even if later release order is favorable.

Release order changes the additional cost. New holder entries are prepended, so releasing in LIFO order usually finds and removes the head. Releasing old entries while many newer ones remain, or repeatedly fixing/unfixing an older held page, repeatedly scans a long list; releasing a large set in an unfavorable order can add another O(`N²`) traversal pattern. Repeated nested fixes of the only held page are O(1), and repeated fixes of the current head are also cheap. Reusing a non-head entry does not grow the list, but still costs as many comparisons as its current position.

The list is thread-local, so this traversal does not create cross-thread list-lock contention; its direct costs are instructions and cache accesses. The seven per-thread reserved entries are consistent with a common expected shape of few simultaneous distinct holds, but they are not a hard limit or proof that `H` is small in a particular workload. Extension sets provide more entries.

Two workload shapes are easy to conflate. **One thread holding many distinct pages** stresses the linear holder list. **Many threads fixing the same page** gives each thread its own holder—often at a short-list position—but makes them update the same BCB `atomic_latch` cache line; compatible READ unfix uses a compare/exchange loop and may suffer cache-line contention even when it avoids the BCB mutex. The last owner, a waiter, a WRITE latch, or an asynchronous-flush request takes the slower protected path. Repeated fixes of the same page by one thread still use one holder entry; nested call count increases debt, not list length.

The claim therefore makes sense when a profile shows all three ingredients: many distinct outstanding BCBs per thread, an unfavorable access/release order, and substantial samples in `pgbuf_find_thrd_holder()` or `pgbuf_remove_thrd_holder()` beneath `pgbuf_unfix()`. It makes less sense when `H` is small, access is LIFO, or time is actually dominated by BCB contention, waiter wakeup, LRU movement, flush, or debug/performance instrumentation.

This is an **Inference from pinned data structure and control flow**, not a Runtime observation. Before redesigning the ledger, measure list depth and CPU samples in a controlled reproduction, then preserve nested-debt correctness, request-end cleanup, watcher ownership, promotion/retry behavior, allocation-failure unwind, and thread-local ownership.

Source: unfix entry at `src/storage/page_buffer.c:3062-3201`; linear find/remove at `src/storage/page_buffer.c:6098-6275`; BCB decrement and zero-crossing work at `src/storage/page_buffer.c:6636-6883`; lock-free READ unfix at `src/storage/page_buffer.c:7807-7835`.

## Maintainer checklist

- Distinguish entry storage lifetime from one thread–BCB binding lifetime.
- Count one holder per distinct BCB held by a thread, not one holder per nested fix.
- Treat `thrd_link` and `next_holder` as mutually exclusive list roles.
- Include watcher emptiness before final removal.
- Attribute linear lookup/removal only to the per-thread value `H`, not to global buffer-pool size.
- Separate holder-list cost, atomic BCB release, BCB-mutex contention, and zero-crossing LRU/flush work in any bottleneck claim.
- Label unprofiled performance conclusions as Inference.

## Related routes

- Practice: [Acquisition concurrency questions](../questions/advanced.md#acquisition-concurrency)
- [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- [Acquisition Concurrency and Multi-page Ownership](./acquisition-concurrency.md)
- [Change the Module Safely](../playbooks/change-safely.md)
- [Source and Caller Map](../reference/source-map.md)
