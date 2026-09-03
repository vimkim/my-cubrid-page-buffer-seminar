# Presentation Script Technical Claims Audit

**Level:** Evidence reference

**Purpose:** Resolve the technical questions and redesign claims in `my-presentation-script-prompt.md` before they are carried into the bilingual presentation script.

**Source baseline:** CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism and Implementation policy from pinned first-party source; Historical evidence from first-party repository history; explicit Inference where source does not establish intent. No runtime benchmark or contention experiment is claimed.

## Executive corrections

| Draft claim | Evidence-safe conclusion |
|---|---|
| Seven holders means the developer expected at most seven fixes. | Seven is the number of entries reserved **per thread at startup**, not a maximum and not evidence of an expected maximum. Additional backing sets contain ten entries each and are allocated on demand. The rationale for choosing seven is not recorded in the inspected source or its blame ancestry. |
| Holder entries only grow and therefore leak. | Active thread–BCB bindings do shrink: final nested unfix moves the entry from the thread's hold list to its free list. Backing capacity does not shrink during normal operation and is freed at page-buffer finalization. Call this retained high-water capacity, not a proven leak. |
| Repeated fix/unfix is necessarily a bottleneck, so hold one extra fix or make unfix asynchronous. | The source exposes linear holder lookup and extra work at zero crossings, so a scalability risk is defensible. No profile proves a bottleneck. Keeping an anchor fix changes latch/ownership duration, and asynchronous unfix changes the synchronization contract; neither is a safe generic recommendation. |
| One LRU victim search is `O(M + K)` and `K=1000`. | For one already selected LRU, let `D` be the number of zone-boundary demotions performed before the walk and `K` the number of visited LRU3 BCB nodes. The helper is `O(D + K)`, with `K <= min(Z3, 1000)`. It does not inspect 1,000 LRU descriptors. |
| Source explains why the victim cap is exactly 1,000. | It does not. The value arrived with the page-quota/victim-search rewrite and is an Implementation policy constant. Repository history calls the broader work victim-search optimization but gives no derivation or benchmark for the exact cap. |
| One hundred waiters means 4,950 comparisons during a wakeup. | If 100 ordinary requests append while the queue never drains, queue construction performs `0+1+...+99 = 4,950` existing-node link tests cumulatively. That is enqueue work across 100 arrivals, not one wakeup's cost. |
| `WRITE(k)` means enqueueing `k` WRITE requests. | It is one queued WRITE request whose `request_fix_count` is `k`. A successful wake adds `k` to global `fcnt` and recreates one holder with nested count `k`. Dedicated promotion preserves existing debt; it does not multiply requests. |
| BCB has five states and fix moves it to LRU1. | INVALID, VOID, LRU1, LRU2, and LRU3 are five **list/zone membership values**, not the full BCB state. A fix normally leaves existing list membership in place. Final global-zero unfix performs placement or movement according to current zone and policy. |
| The direct-victim flag means the BCB is already free. | It is a reservation/handoff flag on an eligible BCB assigned to an allocator that is sleeping for space. The old identity can still be hash-visible. A concurrent fix invalidates the reservation, and the allocator retries. |
| Holder state or dedicated promotion can simply be removed. | The linked-list representation is replaceable; the per-owner information and semantics are not. General fixes need nested per-thread debt, promotion needs same-debt transfer and queue priority, ordered fixing enumerates watcher-bearing holdings, and cleanup/progress code consumes the same ledger. |

## Holder entry: lifetime, memory, and structural cost

### Two lifetimes must be separated

**Verified mechanism.** Page-buffer startup allocates one holder anchor per managed thread and reserves seven `PGBUF_HOLDER` entries for each anchor. A first fix of a distinct BCB takes a free entry, prepends it to that thread's active list, and records `bufptr` plus `fix_count=1`. A nested fix of the same BCB reuses the active entry and increments its count. Each matching unfix decrements the count; when the thread-local count becomes zero, removal unlinks that binding and pushes its storage onto that thread's free list. [Holder constants and layout](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L86-L94), [startup reservation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5922-L5996), [allocation and active-list insertion](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6000-L6086), [decrement and recycling](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6128-L6275).

If a thread has no free entry, the pool allocates one shared backing set containing ten entries. Each consumed extension entry later returns to the consuming thread's own free list, while the backing set remains linked from the pool. Finalization frees the initial reserved array and every extension set. [Extension allocation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6037-L6075), [finalization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1986-L2004).

The precise classification is therefore:

- **Not a proven leak:** all pool-owned holder storage has a finalization path.
- **Retained high-water capacity:** extension storage is not returned to the allocator by ordinary unfix, so a temporary peak can raise the process footprint until page-buffer shutdown.
- **A real leaked fix is different:** if a caller omits an owed unfix, the active binding and global `fcnt` remain and may block replacement. That is ownership-debt leakage, not evidence that the holder allocator itself lacks reclamation.

Seven is a startup capacity. Ten is an extension block size. Neither is a bound on active holders or nested fixes. The comment says only “by default”; it does not say that maintainers measured seven as the expected maximum. The constant is inherited from old repository history, but the inspected ancestry supplies no numeric rationale. Treat “seven reflects the common case” as an **Inference**, and do not attribute intent to the original developer.

### Complexity uses distinct held BCBs, not total nested fixes

Let `H` be the number of distinct BCBs currently present in one thread's active holder list.

**Verified mechanism plus derived structural complexity:** `pgbuf_find_thrd_holder()` starts at the list head and compares `holder->bufptr` until a match or `NULL`, so lookup is worst-case `O(H)`. A first acquisition of `N` distinct BCBs without releasing previous ones performs `0+1+...+(N-1)` failed comparisons, which is `N(N-1)/2` and therefore cumulative `O(N^2)`. Final removal of a non-head entry may traverse the list again to find the predecessor. [Lookup](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6090-L6126), [removal](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6186-L6275), [normal grant use](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6318-L6531).

This is a source-visible scalability risk, not a runtime bottleneck finding. The list is thread-local, so the traversal itself is CPU/cache work rather than contention on a shared holder-list mutex. A defensible bottleneck claim needs profiles showing large `H`, unfavorable ordering, and material samples in the find/remove helpers.

### Thread-local zero and global zero are different events

There are two easily confused zero crossings:

1. `holder->fix_count` reaches zero: this thread–BCB binding returns to the thread's free list.
2. BCB-wide `atomic_latch.fcnt` reaches zero: the latch tuple changes to `NO_LATCH`; the unfix path may perform LRU placement/movement, scan and grant waiters, and service a deferred flush request.

They coincide only when this thread repays the last fix held by **all** threads. If another thread still owns a fix, the first event can occur without the second. [Per-thread decrement](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6128-L6184), [global decrement and zero path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6883).

Keeping one “anchor” fix across a repeated loop can avoid both final-holder recycling and global-zero work when it remains the last ownership share. But every nested fix/unfix still finds the holder, and the anchor deliberately extends replacement exclusion plus the READ or WRITE latch lifetime. It can delay writers, victimization, and shutdown/request cleanup. This can only be evaluated as an algorithm-specific optimization with an explicit lifetime and contention measurement; it is not a general rule that “fix twice is faster.”

Making the current `pgbuf_unfix()` asynchronous is not a local queue optimization. Unfix defines the point where the borrowed `PAGE_PTR` lifetime ends, changes the caller's ownership ledger, may release the content latch, wakes waiters, affects replacement eligibility, performs LRU policy, and may service deferred flush work. A redesign could split synchronous ownership release from deferrable policy bookkeeping, but it would need a new protected intermediate state, queue ownership, shutdown draining, waiter progress, and caller/thread-lifetime proofs. Queueing the whole current operation would merely keep debt/latches alive longer or mutate a thread-owned ledger from another execution context.

### What can be redesigned safely

The singly linked representation is not an Interface contract. A per-thread `unordered_map<BCB*, owner_record>` could reduce expected lookup cost while preserving the forward ownership direction; an `unordered_set` alone is insufficient because nested counts and other owner fields remain necessary. A BCB-side reader map moves updates and allocation to a shared hot object and needs one `<thread, count>` record per concurrent reader. An explicit acquisition handle changes the `PAGE_PTR`-only release API and still needs aggregation for nested ownership and promotion.

The current consumer set is wider than sole-reader detection: normal grant/re-entry, matching unfix, dedicated and ordinary promotion, ordered watcher enumeration, request-end cleanup, allocation-priority classification, and performance accounting all consume holder state. The holder-free `pgbuf_simple_fix()` is a useful counterexample only because source restricts it to a narrow, latchless temporary-file read protocol and forbids mixing it with general fix semantics. [General holder consumers](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6277-L6634), [restricted simple-fix protocol](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2688-L2811), [ordered-fix entry](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12186-L12474).

## LRU victim search: `D`, `K`, and the three unrelated 1,000s

### The selected-list cost

`pgbuf_get_victim_from_lru_list(thread_p, lru_idx)` receives one already selected LRU index. If a private list's protected zones exceed quota, it first calls zone adjustment; let `D` be the number of BCB boundary demotions caused by that step. It then starts at `victim_hint` or `bottom` and follows `prev_BCB` only while the node remains in LRU3 and a local `search_cnt` is below `MAX_DEPTH`. Let `K` be the number of loop-body visits. Then:

```text
selected-list helper work = O(D + K)
K <= min(reachable LRU3 nodes, 1000)
```

Each visit checks flags/fixers/waiters, conditionally tries the BCB mutex, and performs a protected recheck before detaching a successful candidate. The helper neither scans 1,000 list descriptors nor returns 1,000 victims. [Bounded selected-list scan](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9314-L9538), [zone-adjustment primitives](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9881-L10048).

The prompt's `M` can be retained if it is explicitly defined as “BCB zone demotions performed before the bounded walk.” This note uses `D` because `M` is otherwise easy to mistake for the number of lists, mutexes, or buffers.

### Why exactly 1,000 remains open

Three distinct pinned constants use the same numeral:

1. `MAX_DEPTH 1000` caps BCB visits in one selected LRU3 scan.
2. `PGBUF_MIN_PAGES_IN_SHARED_LIST 1000` makes automatic shared-list sizing target roughly one thousand buffers per list.
3. The hidden explicit `num_LRU_chains` parameter accepts at most 1,000 shared lists.

They do not cap the same object. The first two were present together in the large [CBRD-20074 page-quota rewrite](https://github.com/CUBRID/CUBRID/commit/39e234caffb915969f6134d224448cba37462727), whose commit message mentions avoiding wasted victim-search CPU and “various optimizations to victim searching.” The diff supplies no calculation or benchmark for the `MAX_DEPTH` value. Earlier shared-list sizing did include the qualitative comment that an estimated 1,000 frames per LRU “will be good”; that is Historical evidence of a heuristic, not proof that 1,000 is optimal and not a rationale for the scan cap.

The safe presentation statement is: “The pinned policy bounds one selected LRU3 walk at 1,000 BCB visits. The exact numeric choice is not justified by the available first-party source/history and should be benchmarked before changing it.”

## Latch wait queue: cost, wakeup, and cancellation

### Exact queue-build arithmetic

**Verified mechanism.** Each BCB stores only the head pointer `next_wait_thrd`; the linked nodes are waiting `THREAD_ENTRY` objects. An ordinary incompatible request appends by walking from the head to the final node while holding the BCB mutex. A blocking promoter is the exception and inserts at the head. [BCB and thread-entry fields](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L499-L528), [ordinary append and promoter insertion](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7041-L7099), [request fields](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.hpp#L228-L256).

At queue length `W`, one ordinary append is `O(W)`. Starting empty and preventing all drainage, `N` arrivals perform:

```text
existing-node link tests = 1 + 2 + ... + (N - 1) = N(N - 1) / 2
actual next-pointer advances = 0 + 1 + ... + (N - 2)
                             = (N - 1)(N - 2) / 2
```

For `N=100`, that is 4,950 link tests and 4,851 pointer advances across the entire enqueue phase. The figure is not “4,950 comparisons to wake 100 waiters.” A newly arriving 101st request would itself inspect 100 existing-node links.

When global `fcnt` reaches zero, the releasing thread scans under the BCB mutex. If it grants WRITE first, the tuple becomes WRITE and the scan stops. If it grants READ first, incompatible WRITE entries remain linked while the outer scan continues and can grant later READ entries across them. This is reader grouping, not strict FIFO. Resumed requesters create their holders only after the queued grant succeeds. [Zero-crossing wake loop](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7452-L7590), [post-wakeup holder recording](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6595-L6633).

Thus pure queued writers normally drain one head grant per zero-crossing with constant list-removal work per handoff. The quadratic source-visible cost is the non-draining ordinary append phase, and potentially many arbitrary timeout removals—not every possible drain pattern.

### Timeout and interrupt removal

For READ/WRITE waiting, `pgbuf_timed_sleep()` locks the waiter's own thread entry, releases the BCB mutex, and sleeps with an interrupt-aware timed wait. The pinned hidden page-latch cap defaults to 300 seconds; exact error mapping also depends on transaction wait policy. [Timed-sleep handoff](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7281-L7334), [timeout parameter](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L5308-L5319).

On interrupt or timeout, the waiter writes `PGBUF_NO_LATCH` into its own `request_latch_mode` while holding the thread-entry lock. In that field, `NO_LATCH` is a cancellation tombstone, not BCB residency state. Cleanup then locks the BCB and removes the exact `THREAD_ENTRY`: head removal is constant work; arbitrary removal searches the singly linked queue for the predecessor and is worst-case `O(W)`. If wakeup races with timeout, `resume_status` plus the thread-entry lock decides whether grant already won. The zero-crossing waker also removes any tombstoned node it sees. [Arbitrary removal](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7198-L7279), [interrupt/timeout tombstone and race handling](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7335-L7448), [waker tombstone handling](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7474-L7544).

An ordinary waiter has no new holder, page pointer, or fix debt until grant. Timeout/interrupt therefore returns without debt. A blocking **promotion** is different: it surrendered the old READ holder before sleeping, so hard failure nulls the in/out pointer and does not restore that old debt.

The source and inspected history establish that there is no BCB tail pointer and no per-node predecessor pointer. They do not record why those choices were retained. A tail pointer would target append cost; a predecessor/doubly linked design would target arbitrary removal. Either change must update promoter head insertion, cancellation, reader grouping across writers, FLUSH-node retention, waiter-bit reconciliation, and all wake/timeout races under the BCB and thread-entry locks. “Just add a doubly linked list” is therefore a proposal, not a source-backed fix.

## Dedicated READ-to-WRITE promotion and `WRITE(k)`

### `WRITE(k)` is one request carrying a debt count

Suppose this thread's existing READ holder has `fix_count=k` and other readers exist. Under `PGBUF_PROMOTE_SHARED_READER`, the promotion path:

1. subtracts `k` from BCB-wide `fcnt`;
2. removes this thread's READ holder;
3. creates one queue request with `request_latch_mode=WRITE` and `request_fix_count=k` at the queue head;
4. on grant, adds `k` back to global `fcnt`; and
5. recreates one WRITE holder with `fix_count=k`.

Before and after successful promotion, the caller owes `k` unfixes. There are not `k` independent WRITE requests. [Promotion transfer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2934-L3030), [queued count](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7068-L7081), [wakeup restores the count](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7514-L7583).

By contrast, an ordinary nested `pgbuf_fix(..., WRITE, ...)` means acquire one additional fix. Its contended path carries old count plus one and appends at the ordinary tail. Dedicated promotion transforms the existing debt, exposes `ONLY_READER` versus `SHARED_READER` policy, permits only one head promoter, and can invalidate the caller's old pointer on hard failure. [Ordinary nested path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6403-L6603), [public promotion conditions](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L205-L209).

### Why B-tree needs the separate operation

**Verified caller mechanism.** B-tree traverses non-leaf nodes optimistically with READ, inspects whether a split/max-key update/merge is needed, and promotes only on the mutation path. `ONLY_READER` lets multi-page cases fail/restart rather than enter a dead-latch cycle. `SHARED_READER` gives the first promoter queue-head priority; while it waits, remaining active owners are readers and queued writers cannot pass it. Pinned B-tree uses the READ-side decisions after successful promotion, which is caller evidence that the protected head handoff preserves those page observations. [Insert root decision and restart](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L28304-L28409), [insert child decision and restart](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L28601-L28710), [delete/merge strategy](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L31672-L31866).

**Historical evidence.** Promotion was introduced specifically for B-tree insert/delete as part of moving from direct WRITE fixing toward READ-first traversal, after nested WRITE fixes had been prohibited. The API was later changed to `PAGE_PTR *` to reflect the intermediary unfixed state. [Promotion introduction](https://github.com/CUBRID/CUBRID/commit/40b817bec2a7984e03071c3b1d9cae27d7d2bf4c), [nested-WRITE prohibition](https://github.com/CUBRID/CUBRID/commit/076bf011458615c7262c56f5e4fe999e8d1459ae), [in/out pointer change](https://github.com/CUBRID/CUBRID/commit/ff28bf22aae29580b1cc1b4257c1236cb28b81ef).

The safe conclusion is not “promotion is redundant because general fix can upgrade.” General nested fix has different debt, queue position, failure output, and caller cleanup. Moreover, the pinned immediate sole-reader branch of ordinary nested WRITE sets global `fcnt` to 1 and then increments the holder count. This source relationship is tracked as `VS-18`; consult the registry before making a current behavior or replacement claim. [Immediate branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6403-L6421), [common holder increment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6494-L6509), [current registry status](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations).

## Replacement topology, defaults, and one BCB's travel

### The worked 184-list default is conditional

Under the teaching example's explicit assumptions—default 32,768 buffer pages, 16 KiB I/O pages, `max_clients=100`, HA off, automatic shared lists, and automatic private lists—the calculation is:

```text
B = 32,768
MAX_NTRANS = 100 normal + 1 admin + 1 system = 102
S = max(4, min(MAX_NTRANS, floor(B / 1000))) = 32 shared LRUs
P = MAX_NTRANS + VACUUM_MAX_WORKER_COUNT = 102 + 50 = 152 private LRUs
L = S + P = 184 LRU descriptors
```

The buffer-page default and I/O-page default are first-party source values. `MAX_NTRANS` is `css_get_max_conn()+1`; `css_get_max_conn()` includes normal plus reserved connections, and HA-off contributes no HA reservation. Automatic shared sizing begins at `MAX_NTRANS` and reduces it when that would place fewer than 1,000 buffers in a shared list. Automatic private sizing uses `MAX_NTRANS+50`. [Buffer-page default](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1169-L1190), [16 KiB page default](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/storage_common.h#L89-L101), [`MAX_NTRANS`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_common_impl.h#L48-L52), [connection reservations](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L75-L110), [HA-off rule and total](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L158-L241), [shared derivation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5740-L5766), [private derivation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13941-L13985), [vacuum count](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.h#L128-L136).

Do not call 184 an unconditional CUBRID default. It is the result of those deployment assumptions. Also do not say private LRU “max is `MAX_NTRANS+50`.” That is the **automatic count**. A positive explicit `num_private_chains` is a different policy input, floored to four and parameter-capped at 4,050 at this baseline; zero disables private LRUs. [Private parameter bounds](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L4171-L4182).

### Five membership values, not five total states

**Verified mechanism.** All `B` BCB/frame pairs are allocated at startup. Every BCB starts on the single INVALID list with null identity; all LRU descriptors start empty. An invalid-list pop is constant-time head work and changes the selected BCB to VOID while keeping its BCB mutex. [BCB/frame initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5559-L5667), [invalid-list initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5906-L5919), [invalid-list pop](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8904-L8952).

The five zone/list values mean:

| Membership | Meaning |
|---|---|
| INVALID | On the global free/invalid list; no resident identity. |
| VOID | On neither INVALID nor an LRU; used during load, first fixed lifetime, protected movement, or victim handoff. |
| LRU1 | Hot protected zone in one LRU; ordinary victim search does not inspect it. |
| LRU2 | Protected buffer/second-chance zone; ordinary victim search does not inspect it. |
| LRU3 | Cold zone scanned for ordinary victims, still subject to all safety checks. |

These do not replace the independent VPID, `fcnt`, latch, waiter, dirty/flushing, and direct-victim coordinates. In particular, VOID does not mean free, and LRU3 does not mean reusable. [Zone definitions](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L174-L216), [victim safety check](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9255-L9312).

A correct default-path travel story is:

1. startup: INVALID;
2. cold miss claims the fixed BCB/frame pair: INVALID to VOID, then binds and loads the requested identity;
3. first **global-zero unfix**: with active AOUT forced off, enter the unfixing context's private LRU at LRU1 top when it has a private index, otherwise enter a round-robin shared LRU at LRU2 middle;
4. threshold adjustment caused by list activity or quota changes demotes boundary nodes LRU1 to LRU2 to LRU3—wall-clock time alone does not decrement a BCB's zone;
5. later final unfix: LRU1 normally stays put, a sufficiently aged LRU2 member can boost to LRU1, and an ordinary LRU3 member boosts to LRU1; private-domain mismatch or a hot-and-old private page can instead migrate through VOID to shared LRU2;
6. victim scan: only a clean, non-flushing, unfixed, waiter-free, non-reserved LRU3 BCB that passes the BCB try-lock and protected recheck is detached to VOID;
7. victimization removes the old hash identity and allows the same BCB/frame pair to bind another VPID.

[First VOID placement](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6994), [private-to-shared rule](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6996-L7038), [zone-dependent final unfix](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6713-L6844), [boost rationale and activity age](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10141-L10197), [protected detach](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9391-L9478).

### Private versus shared is policy association, not access ownership

A session or vacuum context is assigned a private-list-local index. Assignment scans all `P` private descriptors, preferring an unused list with the fewest BCBs and otherwise the least-active list. Multiple contexts can share a private list after all are assigned; releasing the context's index decrements a session count but does not empty that LRU. A BCB stores only its current full LRU index and zone, not a context owner. [Assignment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14513-L14624).

Victim discovery normally tries the caller's own private list if policy permits, consumes one advertised other-private list index, consumes one advertised shared list index, and finally may retry its own private list even when under quota. It does not enumerate all transactions on each miss. [Victim order](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9067-L9253), [candidate-list advertisement](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16369-L16414).

The list-index circular queues request capacities `2P` for ordinary private indexes, `2P` for “big private” indexes, and `2S` for shared indexes; the queue implementation rounds requested capacity to a power of two. These are queues of **LRU indexes**, not page queues and not fixed partitions of BCBs. [Queue allocation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1864-L1892), [capacity rounding](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/lockfree_circular_queue.hpp#L210-L217).

The separate `big_private_lrus_with_victims` first-producer question is routed through `VS-19`; do not claim that route is complete or broken without runtime instrumentation. [Pinned consume/requeue path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16416-L16506), [current registry status](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations).

## What the direct-victim flag means

When invalid-list allocation and normal victim discovery find nothing, a server-mode allocator can enqueue its `THREAD_ENTRY` on a high- or low-priority direct-victim waiter queue, wake the page-flush daemon, and sleep. Another thread that holds a clean, unfixed candidate's BCB mutex can assign that BCB directly to the sleeping allocator. Assignment sets `PGBUF_BCB_VICTIM_DIRECT_FLAG`, stores the BCB pointer in the target thread's per-index slot, and wakes it. [Allocator wait](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8239-L8355), [direct assignment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15420-L15485).

This flag is a reservation, not a free-state marker. Before the waiter consumes it, the BCB can remain in an LRU and its old VPID can remain hash-visible. If a normal fix finds it, that path replaces the reservation flag with `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG`. The allocator later atomically takes its assigned pointer, sees invalidation, clears it, and retries; otherwise it clears the reservation, rechecks victim eligibility, detaches the BCB from its LRU if needed, and receives it locked in VOID. [Fix invalidates the reservation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2380-L2444), [consumer validation and detach](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15592-L15652), [flag definitions](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L222-L262).

Potential providers include final-unfix paths and successful flush completion; ordinary victim scans also contain a panic-assignment path under waiter pressure. Exact fairness and starvation bounds are not established. Maintenance-backup evidence is routed through `VS-20` and must not be credited as verified progress without resolving that registry entry. [Final-unfix providers](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6817-L6936), [post-flush provider](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15489-L15556), [maintenance path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9542-L9689), [current registry status](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations).

## Evidence-safe wording for the final script

- Say “holder lookup is linear in this thread's currently held distinct BCBs; it is a plausible hot-path risk, not a measured bottleneck.”
- Say “holder bindings recycle at final nested unfix, while backing capacity remains until page-buffer finalization; this is retention, not a proven allocator leak.”
- Say “global-zero unfix is a synchronous ownership/latch handoff point; keeping an extra fix or deferring unfix changes concurrency semantics.”
- Say “one selected LRU3 walk visits at most 1,000 BCBs; optional zone demotions are separate work, and the source does not justify 1,000 as optimal.”
- Say “100 non-draining ordinary arrivals cumulatively perform 4,950 existing-node link tests while appending.”
- Say “timeout/interrupt tombstones and removes the ungranted `THREAD_ENTRY` under thread-entry and BCB protection; arbitrary removal is linear.”
- Say “promotion queues one `WRITE(k)` request that preserves `k` existing debts; ordinary nested WRITE requests one additional debt.”
- Say “184 LRUs is a worked result for the stated 32,768-page, 100-client, HA-off defaults—not a universal constant.”
- Say “INVALID/VOID/LRU1/LRU2/LRU3 are membership states; list activity and quota thresholds cause demotion, and final unfix—not fix itself—normally performs recency placement.”
- Say “direct victim means a clean candidate reserved for a waiting allocator, with an invalidation-and-retry path if the old page is fixed again.”

## Questions that remain open

1. Why were seven reserved holder entries chosen? Available first-party source and inspected ancestry do not state a reason.
2. Why is one selected LRU3 walk capped at exactly 1,000? The policy and its introduction are source-visible; the quantitative rationale is not.
3. Why does the latch queue retain only a head pointer rather than a tail or predecessor support? The mechanism and complexity are visible; design intent is not recorded in the inspected history.
4. Are holder traversal, queue append/removal, or zero-crossing LRU work material bottlenecks under the target workload? Source complexity alone cannot answer; queue depth, held-set depth, mutex hold/wait time, and profile samples are required.
5. What fairness guarantee, if any, is intended for reader grouping, promotion, and direct-victim assignment? The pinned source does not establish strict FIFO or starvation freedom.
6. Are the conditions routed through `VS-18`, `VS-19`, and `VS-20` reachable and impactful in the deployment being presented? Follow their current status and proof route in the uncertainty registry rather than copying either into this note.
