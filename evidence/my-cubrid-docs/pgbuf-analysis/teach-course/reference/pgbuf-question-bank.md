---
title: CUBRID Page Buffer Question Bank
---

Use this as an explanation ladder, not a memorization sheet. For each item, read the model answer, cover it, and reconstruct why every clause is necessary. Claim IDs refer to the verified offline book at revision `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.

## Level 1 — Identity, residency, and the public contract

### What problem does the page-buffer module solve?

> **Model/recommended answer:** It keeps a bounded set of database pages resident in memory and coordinates their lookup, loading, concurrent access, modification tracking, flushing, and replacement. Callers work with a stable page identity instead of issuing raw file I/O for every access.

> **Why correct:** A cache description alone omits correctness. The module must also stop two identities from claiming one frame, prevent replacement while a caller owns a page, and coordinate dirty data with WAL.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/01-orientation.html">Book chapter 1</a>; CUBRID-C001–C004.</p>

### What exactly is a `VPID`?

> **Model/recommended answer:** A `VPID` is CUBRID's storage page identifier: `(volid, pageid)`. It identifies a page in the database storage address space; it is not a process memory address and should not be described as an exact device byte offset.

> **Why correct:** `VOLID` selects the volume and `PAGEID` selects a database page within that volume. The page buffer hashes this value to locate a resident BCB.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/compat/dbtype_def.h"><code>dbtype_def.h:956–963</code></a>; <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2380–2383</code></a>.</p>

### How do `VPID`, BCB, frame, and `PAGE_PTR` differ?

> **Model/recommended answer:** `VPID` is page identity. A BCB is control metadata for one resident page, including identity, latch/fix state, flags, LRU links, and dirty metadata. Its I/O-page buffer owns the frame bytes, while `PAGE_PTR` is the caller's borrowed pointer into those bytes.

> **Why correct:** Mixing these concepts hides lifetime and synchronization. Identity survives residency changes; the BCB/frame can be reused; the pointer is valid only while its fix contract remains active.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:499–555</code></a>; CUBRID-C001/C002.</p>

### Why is `pgbuf_fix()` more than a page lookup?

> **Model/recommended answer:** It maps a `VPID` to a resident BCB/frame, validates the mapping, obtains a compatible latch, records holder/fix ownership, and only then returns a `PAGE_PTR`. A miss may additionally select a frame and perform I/O.

> **Why correct:** Lookup alone would not prevent concurrent mutation or frame reuse. The function's success postcondition includes residency, concurrency permission, and an owned lifetime.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/04-fix-lookup-load.html#fix-lookup-load">Book chapter 4</a>; CUBRID-C001.</p>

### What policy does each `pgbuf_fix()` argument express?

> **Model/recommended answer:** `thread_p` supplies thread ownership and wait context; `vpid` selects identity; `fetch_mode` defines what page state/source is acceptable; `request_mode` asks for READ or WRITE latch permission; `condition` chooses immediate failure versus waiting when the latch conflicts.

> **Why correct:** These are independent dimensions. In particular, fetch semantics, latch compatibility, and wait policy must not be collapsed into one “read/write” flag.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h"><code>page_buffer.h:275–330</code></a>; <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2246–2332</code></a>.</p>

## Level 2 — The complete `pgbuf_fix()` path

### What must be true when `pgbuf_fix()` succeeds?

> **Model/recommended answer:** The requested identity corresponds to the returned resident frame; the caller owns a compatible latch/fix; ownership is reflected in the thread holder and BCB fix accounting; and the pointer may be used until the caller releases the matching acquisition.

> **Why correct:** These are the common postconditions of both hit and miss paths. Durability is deliberately absent: fixing a page does not make modifications crash-safe.

<p class="source-line">Source: CUBRID-C001/C002; <a href="../reference/pgbuf-fix-contract.html">contract card</a>.</p>

### How do hit and miss paths differ, and where do they converge?

> **Model/recommended answer:** A hit finds an existing BCB through the lock-free READ path or hash chain. A miss claims a BCB, may read page bytes, and publishes the mapping. Both converge on page-identity validation, latch/holder acquisition, and the same borrowed-pointer contract.

> **Why correct:** Residency changes preparation cost, not the meaning of success. Treating hit as “unprotected” would break the common caller interface.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2358–2516</code></a>; CUBRID-C001.</p>

### When is the lock-free READ fast path attempted?

> **Model/recommended answer:** It is attempted for an unconditional READ latch with selected existing-page fetch modes such as `OLD_PAGE`, `OLD_PAGE_PREVENT_DEALLOC`, or `OLD_PAGE_MAYBE_DEALLOCATED`. If its atomic checks fail, normal hash/latch processing remains available.

> **Why correct:** The path is an optimization with a narrow safety predicate, not a different contract. It must reject states with incompatible latch/waiter conditions and fall back safely.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2358–2377, 7725–7780</code></a>; CUBRID-C005.</p>

### What happens when `OLD_PAGE_IF_IN_BUFFER` misses?

> **Model/recommended answer:** `pgbuf_fix()` unlocks the hash anchor and returns `NULL` without claiming a frame or reading from storage.

> **Why correct:** The fetch mode explicitly asks for a non-I/O probe. A miss is an allowed negative result, not evidence of corruption.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2408–2413</code></a>; CUBRID-C001.</p>

### How are two concurrent misses for the same `VPID` prevented from loading duplicate frames?

> **Model/recommended answer:** The miss path uses a `VPID`-scoped buffer lock so one thread owns the load/publication work. A waiter does not inherit the loader's private BCB; after notification it retries lookup and observes the published mapping.

> **Why correct:** This preserves the invariant that one resident identity maps to one BCB while keeping partially initialized frames private.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/04-fix-lookup-load.html#fix-lookup-load">Book chapter 4</a>; CUBRID-C001.</p>

### Why must the BCB's `vpid` be rechecked before granting access?

> **Model/recommended answer:** Frames and BCBs are reusable, so an earlier lookup or victim decision can race with state changes. Rechecking confirms that the control block still describes the requested page before the pointer escapes.

> **Why correct:** Hash membership or a stale local pointer alone is not sufficient proof of current identity. The check closes an identity-reuse race.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2442–2472</code></a>; CUBRID-C001.</p>

### Name important ways `pgbuf_fix()` may return `NULL`.

> **Model/recommended answer:** Examples include an invalid/deallocated page under the chosen fetch mode, interrupt, a permitted `OLD_PAGE_IF_IN_BUFFER` miss, conditional latch conflict, timeout/zero-wait behavior, I/O or frame-allocation failure, and identity validation failure.

> **Why correct:** `NULL` is not one semantic category. Correct callers must interpret it using the requested mode and current error state, then clean up any other resources they already own.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2285–2512</code></a>; CUBRID-C001/C010/C012.</p>

## Level 3 — Latch, holder, fix count, and `pgbuf_unfix()`

### What is the difference between a page latch and a transaction lock?

> **Model/recommended answer:** A page latch protects short-lived in-memory page structure access and physical consistency. A transaction lock protects logical database operations and isolation over a longer transaction lifetime. Holding one does not replace the other.

> **Why correct:** Two transactions may be logically allowed to touch different records on one page while still requiring serialized byte-level updates to that shared page frame.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/06-caller-contracts.html#caller-contracts">Book chapter 6</a>; CUBRID-C003.</p>

### What is the difference between `request_mode` and `condition`?

> **Model/recommended answer:** `request_mode` selects the permission being requested—READ or WRITE. `condition` controls what happens on incompatibility—fail immediately or wait subject to timeout/interrupt policy.

> **Why correct:** Compatibility and waiting are separate decisions. An unconditional request can still be converted to conditional under a transaction zero-wait policy.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:2285–2332, 6277–6634</code></a>; CUBRID-C002.</p>

### Why does CUBRID track both BCB `fcnt` and a per-thread holder `fix_count`?

> **Model/recommended answer:** BCB `fcnt` represents aggregate replacement protection across acquisitions. A thread holder identifies which thread owns a particular BCB and how many nested fixes that thread has, enabling correct reentry, promotion, diagnostics, and release.

> **Why correct:** A global count cannot answer “which thread may unfix or promote?” A per-thread holder alone cannot cheaply answer “is anyone still fixing this frame?”

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:460–518</code></a>; CUBRID-C002.</p>

### What must happen when one thread fixes the same page more than once?

> **Model/recommended answer:** Nested ownership is counted rather than replaced. Every successful acquisition needs a matching release; an intermediate `pgbuf_unfix()` reduces the thread's holder count and aggregate protection but does not end a remaining acquisition.

> **Why correct:** Treating nested fixes as one boolean would either release too early or leak ownership permanently.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/05-latch-holder-unfix.html#latch-holder-unfix">Book chapter 5</a>; CUBRID-C002.</p>

### What does `waiter_exists` accomplish?

> **Model/recommended answer:** It prevents new readers from continually barging ahead of queued incompatible requests, while selected existing-holder reentry is still allowed for nested-operation liveness.

> **Why correct:** Without a gate, a steady stream of readers could starve a writer. An absolute ban on holder reentry can deadlock or break nested page-buffer operations.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/05-latch-holder-unfix.html#latch-holder-unfix">Book chapter 5</a>; CUBRID-C002.</p>

### What does `pgbuf_unfix()` actually do?

> **Model/recommended answer:** It maps `PAGE_PTR` back to its BCB, updates/removes the current thread's holder, decrements fix ownership, uses a lock-free READ release when safe or the full unlatch path otherwise, and on the last fix may transition to `NO_LATCH`, update LRU state, wake waiters, or service deferred flush work.

> **Why correct:** `unfix` is a state transition and scheduling point, not simply a decrement instruction.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:3062–3203, 6636–6883</code></a>; CUBRID-C002.</p>

### Why can use-after-unfix appear to work?

> **Model/recommended answer:** Unfix ends ownership but does not erase the frame. The bytes may remain unchanged until another thread mutates the page or replacement reassigns the frame, making the bug timing-dependent.

> **Why correct:** Pointer lifetime is contractual, not indicated by immediate memory deallocation. Apparent success in a quiet test does not restore the lost latch/fix guarantee.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:3062–3068</code></a>; CUBRID-C002.</p>

## Level 4 — Heap, B-tree, ordered fixing, and recovery callers

### What responsibility remains with every caller after a successful fix?

> **Model/recommended answer:** The caller must interpret the page format, obey the granted latch mode, perform required logging before/with mutation, mark modifications dirty, avoid stale page-local pointers after refix, and release every acquired fix on all exits.

> **Why correct:** The page buffer provides generic residency and concurrency machinery; it cannot know heap slots, B-tree structure invariants, or the recovery semantics of a particular mutation.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/06-caller-contracts.html#caller-contracts">Book chapter 6</a>; CUBRID-C003.</p>

### Why does heap code use ordered watchers instead of keeping only raw pointers?

> **Model/recommended answer:** Ordered fixing may temporarily unfix and refix pages to satisfy rank/order constraints. A watcher retains identity and ordering metadata and exposes `page_was_unfixed`, telling the caller to revalidate page-local slots or pointers.

> **Why correct:** The same logical page may return at a different moment or frame state. A raw address and slot pointer captured before temporary release can be stale.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c"><code>heap_file.c:25543–25625</code></a>; CUBRID-C003.</p>

### What is the basic B-tree parent-to-child latch pattern?

> **Model/recommended answer:** Descent fixes the current page, obtains the child under the required protection, and releases upper pages when their structural protection is no longer needed. Some reverse/sibling paths use conditional acquisition and restart rather than waiting while holding a dangerous set of pages.

> **Why correct:** The pattern preserves traversal structure while controlling latch footprint and avoiding cycles caused by incompatible acquisition order.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c"><code>btree.c:23734–24089</code></a>; CUBRID-C003.</p>

### How does recovery use `pgbuf_fix()` differently from an ordinary reader?

> **Model/recommended answer:** Redo obtains a recovery-appropriate WRITE fix, compares the page LSA with the log record, skips work already reflected on the page, otherwise reapplies the change, updates the page LSA/dirty state, and unfixes. Physical undo similarly needs controlled WRITE access and cleanup.

> **Why correct:** Recovery needs idempotence and may encounter page states that ordinary fetch modes reject. The LSA gate prevents repeated redo from corrupting an already-applied page.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_recovery.c"><code>log_recovery.c:6399–6431</code></a>; CUBRID-C003.</p>

### What does “cleanup on every exit” mean for page-buffer callers?

> **Model/recommended answer:** Every successfully fixed page must be released exactly as required even when a later fix, allocation, validation, log operation, or mutation fails. Only pages actually modified under a valid protocol are marked dirty; partially acquired page sets are released in an order that preserves caller invariants.

> **Why correct:** A leaked fix causes replacement pressure and possible latch stalls. An unearned dirty mark or missing log creates durability errors, while a missing unfix on error may be invisible until load increases.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/06-caller-contracts.html#caller-contracts">Book chapter 6</a>; CUBRID-C003/C007.</p>

## Level 5 — Dirty pages, WAL, flushing, and replacement

### Does a successful WRITE fix make a modification durable?

> **Model/recommended answer:** No. A WRITE fix grants exclusive in-memory access. The caller must follow the logging protocol, associate the page with the relevant LSA, and mark it dirty. Transaction durability comes from forcing the required WAL/commit record; the data page may be flushed later and reconstructed by redo after a crash.

> **Why correct:** Latches solve concurrent memory access. Durable WAL makes the logical change recoverable without synchronously writing every dirty data page at commit. The later page write propagates the image and eventually makes that generation clean.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/07-dirty-wal-flush-replace.html#dirty-wal-flush-replace">Book chapter 7</a>; CUBRID-C004.</p>

### What do DIRTY and `oldest_unflush_lsa` mean?

> **Model/recommended answer:** DIRTY says the resident image contains changes not fully reflected in its durable data-page copy. `oldest_unflush_lsa` tracks the oldest relevant log position for that dirty generation and helps checkpoint/flush ordering and restoration on failure.

> **Why correct:** A boolean says whether writeback is needed; an LSA boundary connects the page generation to WAL and checkpoint progress.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:11657–11738</code></a>; CUBRID-C004/C008.</p>

### State the WAL-before-data rule for a page flush.

> **Model/recommended answer:** Before writing a page image whose page LSA depends on log records, CUBRID forces the required log through that LSA, then submits the page through DWB/TDE or the data-volume path.

> **Why correct:** If the data page reached storage before its redo information, a crash could leave a page containing changes that recovery cannot reconstruct consistently.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c"><code>log_page_buffer.c:4150–4189</code></a>; CUBRID-C004.</p>

### How can a page be successfully flushed and still remain dirty?

> **Model/recommended answer:** The flusher snapshots one generation, sets FLUSHING, and clears the old DIRTY state under protection. While that snapshot is written, a writer may create a newer dirty generation on the resident BCB. Completion cleans only the snapshot it wrote and must preserve the newer DIRTY state.

> **Why correct:** I/O operates on an older stable copy while concurrency continues on the resident frame. Clearing all dirty state at completion would lose the newer update.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:10723–10962</code></a>; CUBRID-C004.</p>

### What is the difference between replacement eligibility and replacement policy?

> **Model/recommended answer:** Eligibility asks whether a frame is safe to reuse—for example, unfixed, clean/not flushing, waiter-free, and revalidated under protection. Policy chooses which eligible frame to prefer using LRU zones, age, private/shared lists, and pressure behavior.

> **Why correct:** Safety predicates are correctness; victim ranking is performance policy. A hot frame may be eligible but undesirable, while a fixed cold frame is simply unsafe.

<p class="source-line">Source: <a href="https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c"><code>page_buffer.c:9314–9538</code></a>; CUBRID-C004.</p>

### Why are `pgbuf_unfix()`, flush, commit, and eviction not synonyms?

> **Model/recommended answer:** Unfix releases one borrowed ownership; flush writes a page generation; commit establishes transaction durability/visibility rules; eviction removes an eligible resident mapping so the frame can be reused. They may influence one another but are separate transitions.

> **Why correct:** Conflating them produces false claims such as “unfix writes the page” or “commit evicts it.” A dirty page can be unfixed yet resident, and a clean page can remain cached long after commit.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/05-latch-holder-unfix.html#latch-holder-unfix">Book chapter 5</a>; CUBRID-C002/C004.</p>

### What happens under severe buffer pressure when no usable victim is immediately available?

> **Model/recommended answer:** Allocation searches invalid and victim sources, may request dirty-page flushing, retry or wait for progress, and can ultimately fail when all candidates remain fixed/dirty or resources cannot be obtained. The caller must treat this as an error path, not assume eviction always succeeds.

> **Why correct:** A bounded pool cannot manufacture a safe frame. Progress depends on holders releasing pages and dirty generations becoming flushable.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/07-dirty-wal-flush-replace.html#replacement">Book chapter 7</a>; CUBRID-C004/C010.</p>

## Level 6 — Experiments, comparisons, and design defense

### What does a high page-buffer hit rate prove—and what does it not prove?

> **Model/recommended answer:** It shows that, for the observed workload and measurement window, many requests found resident pages. It does not prove latch contention is low, pages are correctly logged, physical I/O is absent, or replacement policy is optimal.

> **Why correct:** Hit/miss is one event boundary. Concurrency, daemon I/O, dirty generation, and durability require different counters or source/runtime evidence.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/08-experiments.html">Book chapter 8</a>; CUBRID-C005–C008.</p>

### Why must you verify where a performance counter is incremented?

> **Model/recommended answer:** A counter's label can be broader than its actual instrumentation sites. For example, a “page flushed” counter may count only victim flushes and omit checkpoint writes, so its zero value cannot establish that no data pages were written.

> **Why correct:** Runtime evidence proves only the events connected to the counter's real increment sites and active watcher scope.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/08-experiments.html">Book chapter 8</a>; CUBRID-C008.</p>

### How is CUBRID's fix contract different from PostgreSQL's buffer contract?

> **Model/recommended answer:** CUBRID's fix interface combines replacement protection, thread-holder accounting, and requested page latch. PostgreSQL ordinarily separates the buffer pin returned by `ReadBuffer` from the content lock acquired by the caller, with ResourceOwner providing an error-cleanup backstop.

> **Why correct:** Both protect resident frames and contents, but their interface seams and cleanup ownership differ; the mapping is a partial analogy, not equivalence.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#postgresql">Book chapter 9</a>; PG-C001/C002, CMP-C002.</p>

### How is CUBRID's fix contract different from InnoDB's?

> **Model/recommended answer:** InnoDB couples buffer-fix and S/SX/X page-latch lifetimes to a mini-transaction (MTR) memo, which releases them in memo order. CUBRID uses thread holders and explicit `pgbuf_unfix()`/watcher protocols. InnoDB's clustered leaf also stores rows, so CUBRID's B-tree-to-heap handoff has no direct equivalent.

> **Why correct:** The responsibilities overlap, but ownership containers, release boundaries, and row-storage architecture differ materially.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#mysql">Book chapter 9</a>; MYSQL-C001–C003, CMP-C002/C003.</p>

### Why are CUBRID DWB, PostgreSQL full-page images, and InnoDB doublewrite only partial analogies?

> **Model/recommended answer:** All address torn or incomplete page-write recovery, but CUBRID and InnoDB use doublewrite-family data paths while PostgreSQL records full-page images in WAL for recovery. Their activation, completion, and recovery boundaries are different.

> **Why correct:** Sharing a failure objective does not make mechanisms or performance consequences equivalent.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html#cross-database-comparison">Book chapter 9</a>; CMP-C006.</p>

### What invariants would you require when reimplementing the core module?

> **Model/recommended answer:** Require one resident BCB per `VPID`; never expose a partially loaded frame; grant pointers only with valid identity and recorded ownership; never replace while fixed or waited on; match every acquisition with release; preserve newer dirty generations across flush completion; force WAL before dependent data; and make every error path restore or explicitly invalidate intermediate state.

> **Why correct:** These invariants span identity, publication, concurrency, lifetime, replacement, and durability. An implementation that matches the happy-path function names but violates one is behaviorally incorrect.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/10-blueprint.html#blueprint">Book chapter 10</a>; CUBRID-C001–C004/C009–C012.</p>

### Give the complete two-minute explanation of a page's lifecycle.

> **Model/recommended answer:** A caller presents `VPID` plus fetch/latch/wait policy. `pgbuf_fix()` validates it, finds a resident BCB or serializes a miss, obtains/loads a frame, verifies identity, grants a compatible latch, records holder and `fcnt`, and returns a borrowed pointer. The caller reads or performs logged mutation and marks dirty. Durable commit WAL makes that change recoverable even while the data page remains dirty. `pgbuf_unfix()` releases one acquisition; the page may remain resident. Later flush snapshots a dirty generation, forces WAL through the page LSA, writes through the configured data path, and preserves concurrent re-dirty. Only an unfixed, safe, eligible frame can be selected by replacement policy and reused for another identity.

> **Why correct:** It connects the module's five central questions—identity, ownership, concurrency, durability, and release—without claiming that fix, unfix, flush, commit, or eviction are the same operation.

<p class="source-line">Source: <a href="../../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/index.html">Complete offline book</a>; claims CUBRID-C001–C004.</p>
