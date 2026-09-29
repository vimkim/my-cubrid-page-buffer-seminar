# CUBRID Page Buffer Question Bank

## Evidence frame

- Role: adversarial question-bank designer; this packet intentionally contains **questions only**, not answers.
- CUBRID source root: `/home/vimkim/gh/cb/pgbuf-analysis`
- CUBRID revision: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
- PostgreSQL comparison root/revision: `/home/vimkim/gh/pg/postgres` at `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`
- MySQL comparison root/revision: `/home/vimkim/gh/mysql/mysql-server` at `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8`
- Intended use: questions that may arise while hearing the presentation or while implementing, reviewing, debugging,
  tuning, or recovering code that uses `page_buffer.h`.
- Difficulty scale: **Foundation** (terminology and basic contract), **Working** (safe caller use), **Advanced**
  (internal mechanism and multi-module reasoning), **Expert** (race, failure, compatibility, or proof obligation).
- Source anchors identify the exact primary-source regions an answerer should inspect. They are leads for answering,
  not answers embedded in this packet.

## 1. Mental model and Interface choice

### PGBUF-Q001 — What does a successful fix actually promise?

- **Category:** Mental model / Interface boundary
- **Difficulty:** Foundation
- **Likely setting:** Presentation
- **Question:** If `pgbuf_fix()` is not merely a page read, which postconditions concerning identity, residency,
  replacement safety, latch ownership, and thread accounting must all hold before its `PAGE_PTR` is usable?
- **Why it matters:** This is the base contract from which every later ownership and failure question follows.
- **Inspect:** `src/storage/page_buffer.h:172-209` (`PAGE_FETCH_MODE`, `PGBUF_LATCH_MODE`,
  `PGBUF_LATCH_CONDITION`); `src/storage/page_buffer.c:2256-2679` (`pgbuf_fix_debug`, `pgbuf_fix_release`).

### PGBUF-Q002 — Which object is the page?

- **Category:** Mental model / Identity
- **Difficulty:** Foundation
- **Likely setting:** Presentation, debugging
- **Question:** How should an engineer distinguish `VPID`, hash identity, `PGBUF_BCB`, the paired I/O frame,
  `PAGE_PTR`, the global `fcnt`, and a per-thread holder when reading a crash dump or call path?
- **Why it matters:** Collapsing these objects into one “page” hides lifetime boundaries and produces misleading
  diagnoses.
- **Inspect:** `src/storage/page_buffer.c:382-517` (`PGBUF_ATOMIC_LATCH`, `PGBUF_HOLDER`, `PGBUF_BCB`,
  `PGBUF_IOPAGE_BUFFER`); `src/storage/page_buffer.c:744-893` (`PGBUF_BUFFER_POOL`, `pgbuf_Pool`).

### PGBUF-Q003 — How should a caller choose among acquisition families?

- **Category:** Interface choice
- **Difficulty:** Working
- **Likely setting:** Implementation, review
- **Question:** Given an existing page, a newly allocated VPID, a best-effort resident probe, a page racing
  deallocation, a recovery page, or a read-only temporary page, which fix family and fetch mode is appropriate, and
  what evidence must the caller already possess to make that choice?
- **Why it matters:** The fetch mode encodes allocation knowledge and protocol ownership, not a performance hint.
- **Inspect:** `src/storage/page_buffer.h:172-187` (`PAGE_FETCH_MODE`); `src/storage/page_buffer.c:2256-2679`
  (`pgbuf_fix_release`); `src/storage/page_buffer.c:2700-2838` (`pgbuf_simple_fix`, `pgbuf_simple_unfix`,
  `pgbuf_dealloc_temp_page`); `src/storage/page_buffer.c:15355-15405` (`pgbuf_fix_if_not_deallocated`).

### PGBUF-Q004 — When is `NULL` expected rather than an error?

- **Category:** Interface choice / Result interpretation
- **Difficulty:** Working
- **Likely setting:** Implementation, debugging
- **Question:** Which acquisition paths may return `NULL` as an expected absence or non-acquisition, how should the
  caller distinguish those cases from hard failure, and when does a `NULL` result create no unfix debt?
- **Why it matters:** Treating all `NULL` results alike can either hide corruption or make expected races fail a
  transaction.
- **Inspect:** `src/storage/page_buffer.c:2298-2353` (`pgbuf_fix_release` entry and in-buffer-only branch);
  `src/storage/page_buffer.c:2572-2615` (post-fix page-type gate); `src/storage/page_buffer.c:6537-6594`
  (`pgbuf_latch_bcb_upon_fix` conditional rejection); `src/storage/page_buffer.c:15355-15405`
  (`pgbuf_fix_if_not_deallocated`).

### PGBUF-Q005 — What does `NEW_PAGE` not do?

- **Category:** Interface choice / Allocation seam
- **Difficulty:** Working
- **Likely setting:** Implementation, review
- **Question:** Which responsibilities remain with file/disk allocation and the initialization callback when a caller
  uses `NEW_PAGE`, and which page type, TDE, logging, LSA, and dirty obligations remain after the frame is obtained?
- **Why it matters:** Misreading `NEW_PAGE` as logical allocation can expose stale disk bytes or create an
  unrecoverable page image.
- **Inspect:** `src/storage/page_buffer.c:8599-8632` (`pgbuf_claim_bcb_for_fix` NEW-page branch);
  `src/storage/file_manager.c:5420-5592` (`file_alloc`); `src/storage/btree.c:5154-5193`
  (`btree_get_new_page`, `btree_initialize_new_page`).

### PGBUF-Q006 — Why can a resident probe and a disk-validity check disagree?

- **Category:** Interface choice / Validation
- **Difficulty:** Advanced
- **Likely setting:** Debugging, recovery
- **Question:** How are “allocated on disk,” “resident in the pool,” and “currently typed as `PAGE_UNKNOWN`” separate
  facts, and which APIs answer each question without accidentally performing I/O?
- **Why it matters:** Allocation, residency, and page-type state can diverge during deallocation and recovery races.
- **Inspect:** `src/storage/page_buffer.c:2256-2615` (`pgbuf_fix_release`); `src/storage/page_buffer.c:11066-11103`
  (`pgbuf_is_valid_page`); `src/storage/page_buffer.c:11164-11237` (page-type checks);
  `src/storage/page_buffer.c:15355-15405` (`pgbuf_fix_if_not_deallocated`).

### PGBUF-Q007 — When may code bypass the page buffer for raw volume I/O?

- **Category:** Interface choice / External I/O seam
- **Difficulty:** Advanced
- **Likely setting:** Implementation, recovery, review
- **Question:** What flush and invalidation ordering is required before direct file/volume operations overwrite or
  reset storage that may also have cached page images?
- **Why it matters:** Bypassing the pool without a coherence protocol can create two conflicting authorities for the
  same logical page.
- **Inspect:** `src/storage/disk_manager.c:511-814` (`disk_format`); `src/storage/page_buffer.c:3487-3559`
  (`pgbuf_invalidate_all`); `src/transaction/log_page_buffer.c:6901-7406` (`logpb_checkpoint`).

## 2. Ownership, lifetime, and release debt

### PGBUF-Q008 — Can one pointer represent multiple release debts?

- **Category:** Ownership
- **Difficulty:** Foundation
- **Likely setting:** Presentation, implementation
- **Question:** If the same thread fixes the same page recursively and receives the same pointer value, how are the
  global fixes and per-thread nested holds counted, how many unfix operations are required, and why must
  `pgbuf_unfix_all()` remain a leak detector/backstop rather than normal cleanup?
- **Why it matters:** Pointer identity cannot be used to infer ownership cardinality.
- **Inspect:** `src/storage/page_buffer.c:416-460` (`PGBUF_HOLDER`, `PGBUF_HOLDER_ANCHOR`);
  `src/storage/page_buffer.c:6135-6183` (holder fix accounting); `src/storage/page_buffer.c:3075-3373`
  (`pgbuf_unfix`, `pgbuf_unfix_all`).

### PGBUF-Q009 — Which returned pointers survive unfix?

- **Category:** Ownership / Borrowed data
- **Difficulty:** Working
- **Likely setting:** Implementation, review
- **Question:** Which metadata accessors return copied values and which return borrowed pointers into a BCB or page
  header, and what becomes invalid at the matching unfix or later victim reuse?
- **Why it matters:** Page-local pointers can become use-after-unfix bugs even when the frame address appears unchanged.
- **Inspect:** `src/storage/page_buffer.c:4959-4984` (`pgbuf_get_lsa`); `src/storage/page_buffer.c:5208-5257`
  (`pgbuf_get_vpid`, `pgbuf_get_vpid_ptr`); `src/storage/page_buffer.c:5264-5372` (page/volume/latch accessors).

### PGBUF-Q010 — When does watcher replacement transfer rather than add ownership?

- **Category:** Ownership / Transfer
- **Difficulty:** Advanced
- **Likely setting:** Heap implementation, review
- **Question:** What exactly moves between `old_watcher` and `new_watcher` in `pgbuf_replace_watcher()`, which counts
  must remain unchanged, and which cleanup owner becomes responsible afterward?
- **Why it matters:** Mistaking bookkeeping transfer for a new fix causes leaks or double-unfix.
- **Inspect:** `src/storage/page_buffer.c:13759-13799` (`pgbuf_replace_watcher`);
  `src/storage/heap_file.c:23120-23325` (`heap_insert_logical`).

### PGBUF-Q011 — What do `FREE` and the release macros actually consume?

- **Category:** Ownership / API ergonomics
- **Difficulty:** Working
- **Likely setting:** Implementation, review
- **Question:** For `pgbuf_set_dirty`, `pgbuf_flush`, `pgbuf_set_dirty_and_free`, and the checked/unconditional unfix
  macros, which operation consumes one hold, which one nulls the caller lvalue, and what macro-expansion hazards must a
  reviewer notice?
- **Why it matters:** Similar-looking convenience APIs have different pointer and error postconditions.
- **Inspect:** `src/storage/page_buffer.h:40-92` (`FREE`, `DONT_FREE`, unfix macros);
  `src/storage/page_buffer.h:382-390` (`pgbuf_set_dirty_and_free`); `src/storage/page_buffer.c:3566-3621`
  (`pgbuf_flush`, `pgbuf_flush_with_wal`); `src/storage/page_buffer.c:4921-4957` (`pgbuf_set_dirty`).

### PGBUF-Q012 — Why are both `fcnt` and per-thread holders needed?

- **Category:** Ownership / Internal invariant
- **Difficulty:** Advanced
- **Likely setting:** Presentation, reimplementation, debugging
- **Question:** Which safety or diagnostic property would be lost if the implementation kept only global `fcnt`, only
  per-thread holders, or neither, and how does holderless `pgbuf_simple_fix()` alter the invariant?
- **Why it matters:** A redesign must preserve both replacement exclusion and caller-specific balance without assuming
  the general protocol applies to the temporary exception.
- **Inspect:** `src/storage/page_buffer.c:382-467` (`PGBUF_ATOMIC_LATCH`, `PGBUF_HOLDER`);
  `src/storage/page_buffer.c:6008-6183` (holder allocation/accounting); `src/storage/page_buffer.c:2700-2804`
  (`pgbuf_simple_fix`, `pgbuf_simple_unfix`).

## 3. Latch, wait, promotion, and lock ordering

### PGBUF-Q013 — Why can a buffer hit still block or time out?

- **Category:** Latch / Wait
- **Difficulty:** Foundation
- **Likely setting:** Presentation, debugging
- **Question:** Once a matching resident BCB is found, which latch and waiter states can still prevent immediate return,
  and which transaction timeout or interruption policies determine the outcome?
- **Why it matters:** Residency statistics alone cannot explain latency or failed fixes.
- **Inspect:** `src/storage/page_buffer.c:6298-6634` (`pgbuf_latch_bcb_upon_fix`);
  `src/storage/page_buffer.c:7051-7448` (enqueue/wait/timeout paths); `src/storage/page_buffer.c:2298-2332`
  (`pgbuf_fix_release` zero-wait conversion).

### PGBUF-Q014 — What algorithmic promise does conditional acquisition make?

- **Category:** Latch / Caller retry
- **Difficulty:** Working
- **Likely setting:** Implementation, review
- **Question:** When a caller already holds page A and conditionally requests page B, what must it do after rejection,
  and why is changing the flag to unconditional not a local performance tweak?
- **Why it matters:** Conditional acquisition is often the caller's deadlock-avoidance or restart seam.
- **Inspect:** `src/storage/page_buffer.c:6537-6594` (`pgbuf_latch_bcb_upon_fix` conditional path);
  `src/storage/btree.c:28237-28845` (`btree_split_node_and_advance`);
  `src/storage/page_buffer.c:13815-13872` (`pgbuf_get_condition_for_ordered_fix`).

### PGBUF-Q015 — What fairness does `waiter_exists` provide, and what does it not prove?

- **Category:** Latch / Fairness
- **Difficulty:** Advanced
- **Likely setting:** Tuning, review
- **Question:** How does the waiter summary prevent new-reader barging, how are reader batches, writers, promoters, timed
  entries, and FLUSH waiters treated, and which stronger FIFO or starvation claims remain unproved?
- **Why it matters:** Tuning or correctness decisions must not rely on a fairness guarantee the queue does not provide.
- **Inspect:** `src/storage/page_buffer.c:6298-6634` (`pgbuf_latch_bcb_upon_fix`);
  `src/storage/page_buffer.c:7051-7589` (wait insertion and `pgbuf_wakeup_reader_writer`).

### PGBUF-Q016 — What can promotion do to the caller's old pointer and observations?

- **Category:** Promotion
- **Difficulty:** Working
- **Likely setting:** B-tree implementation, review
- **Question:** How do `PGBUF_PROMOTE_ONLY_READER` and `PGBUF_PROMOTE_SHARED_READER` differ, under which paths may the old
  READ ownership be dropped, and what must be revalidated after success or failure?
- **Why it matters:** A pointer-to-pointer promotion API can alter both ownership and data freshness.
- **Inspect:** `src/storage/page_buffer.h:205-209` (`PGBUF_PROMOTE_CONDITION`);
  `src/storage/page_buffer.c:2842-3064` (`pgbuf_promote_read_latch_debug`,
  `pgbuf_promote_read_latch_release`); `src/storage/btree.c:28074-28140`, `src/storage/btree.c:28365-28696`
  (promotion/restart callers).

### PGBUF-Q017 — Why is there only one leading promoter?

- **Category:** Promotion / Dead-latch avoidance
- **Difficulty:** Expert
- **Likely setting:** Concurrency review, bug diagnosis
- **Question:** What wait cycle or accounting ambiguity is avoided by rejecting another leading promotion, and why do
  B-tree parent and child promotions use different promotion conditions and restart rules?
- **Why it matters:** Promotion queue policy and higher-level tree traversal are jointly responsible for progress.
- **Inspect:** `src/storage/page_buffer.c:2849-3059` (`pgbuf_promote_read_latch_release`);
  `src/storage/page_buffer.c:7051-7099` (promoter queue insertion); `src/storage/btree.c:28237-28845`
  (`btree_split_node_and_advance`).

### PGBUF-Q018 — What does `pgbuf_fix_with_retry()` retry, count, and rewrite?

- **Category:** Wait / Error policy
- **Difficulty:** Advanced
- **Likely setting:** Implementation, debugging
- **Question:** Which errors are retryable, what exactly the `retry` argument counts, which conditions stop immediately,
  and why can the final reported error differ from the last underlying latch failure?
- **Why it matters:** A caller must know whether the helper bounds attempts, timeouts, or a broader transaction retry.
- **Inspect:** `src/storage/page_buffer.c:2125-2164` (`pgbuf_fix_with_retry`);
  `src/storage/page_buffer.c:7148-7448` (latch wait outcomes).

### PGBUF-Q019 — Which lock protects which state, and where must rechecks occur?

- **Category:** Lock ordering
- **Difficulty:** Expert
- **Likely setting:** Implementation, race review
- **Question:** What are the separate roles and allowed ordering of the hash-anchor mutex, VPID buffer lock, BCB mutex,
  LRU mutex, page latch, and transaction lock, and where does the code deliberately drop one protection before waiting
  for another?
- **Why it matters:** Calling every mechanism a “page lock” obscures both deadlock edges and identity-reuse races.
- **Inspect:** `src/storage/page_buffer.c:7600-8177` (`pgbuf_search_hash_chain`, `pgbuf_lock_page`,
  `pgbuf_unlock_page`); `src/storage/page_buffer.c:9324-9534` (`pgbuf_get_victim_from_lru_list`);
  `src/storage/page_buffer.c:16656-16836` (BCB mutex monitor); `src/transaction/lock_manager.c:2290-2330`
  (`pgbuf_has_perm_pages_fixed` caller context).

## 4. Ordered watcher protocol

### PGBUF-Q020 — What total order do ordered watchers enforce?

- **Category:** Ordered watcher / Ordering
- **Difficulty:** Working
- **Likely setting:** Presentation, heap implementation
- **Question:** Why is the ordering key a heap group plus semantic rank plus VPID rather than VPID alone, which page
  types and ranks are admitted, and what deadlock risk remains when a thread mixes watcher-backed ordered holds with
  ordinary untracked holds?
- **Why it matters:** The ordering must reflect the multi-page heap operation's dependency structure, not merely a
  convenient sort key.
- **Inspect:** `src/storage/page_buffer.h:166-167`, `src/storage/page_buffer.h:219-249`
  (`PGBUF_IS_ORDERED_PAGETYPE`, ordered rank/group/watcher declarations);
  `src/storage/page_buffer.c:12193-12247` (ordered comparator);
  `src/storage/page_buffer.c:12460-12639` (`pgbuf_ordered_fix` holder/watcher audit).

### PGBUF-Q021 — What exactly becomes stale after `page_was_unfixed`?

- **Category:** Ordered watcher / Revalidation
- **Difficulty:** Working
- **Likely setting:** Implementation, review
- **Question:** After ordered acquisition temporarily releases and refixes an existing page, which pointer-derived
  slots, record addresses, page-type assumptions, and higher-level decisions must be recomputed even if `pgptr` has the
  same address?
- **Why it matters:** Refix restores ownership, not the old contents or the validity of decisions made before waiting.
- **Inspect:** `src/storage/page_buffer.c:12250-13080` (`pgbuf_ordered_fix`);
  `src/storage/heap_file.c:3263-3571` (`heap_remove_page_on_vacuum`).

### PGBUF-Q022 — Is ordered-fix failure all-or-none?

- **Category:** Ordered watcher / Failure cleanup
- **Difficulty:** Advanced
- **Likely setting:** Error-path review
- **Question:** If requested-page acquisition or restoration fails midway, which watchers may be restored, which may
  remain `NULL`, what happens to the requested page, and how must a common cleanup label inspect the set?
- **Why it matters:** An all-fixed or all-unfixed assumption creates leaks, double releases, or stale access.
- **Inspect:** `src/storage/page_buffer.c:12250-12267` (`pgbuf_ordered_fix` contract comment);
  `src/storage/page_buffer.c:12640-13080` (sort/refix/error paths);
  `src/storage/heap_file.c:3537-3570` (`heap_remove_page_on_vacuum` cleanup).

### PGBUF-Q023 — Which invariants must `pgbuf_ordered_callback()` preserve?

- **Category:** Ordered watcher / Callback seam
- **Difficulty:** Advanced
- **Likely setting:** Implementation, review
- **Question:** Before temporarily releasing ordered pages around a callback, what relationship must hold among holder
  fix counts and watcher counts, what may the callback fix or retain, and how are callback error and refix error
  prioritized?
- **Why it matters:** The callback runs outside the original latch set but must leave enough information to reconstruct
  it safely.
- **Inspect:** `src/storage/page_buffer.c:13066-13400` (`pgbuf_ordered_callback`);
  `src/storage/bestspace.cpp:56-82`, `src/storage/bestspace.cpp:1564-1612`
  (`wait_for_shard_allocation`, `bestspace::find_from_shards`).

### PGBUF-Q024 — What does avoid-deallocation protect during ordered refix?

- **Category:** Ordered watcher / Deallocation race
- **Difficulty:** Expert
- **Likely setting:** Vacuum implementation, concurrency review
- **Question:** Why does ordered fixing register an avoid-deallocation counter while a page is temporarily unlatched,
  why is that counter not a replacement pin, and how can its BCB association change across victimization?
- **Why it matters:** Conflating logical-deallocation avoidance with `fcnt`-based frame protection leads to invalid
  safety arguments.
- **Inspect:** `src/storage/page_buffer.c:12460-13080` (`pgbuf_ordered_fix` release/refix);
  `src/storage/page_buffer.c:16249-16337` (avoid-deallocation helpers);
  `src/storage/page_buffer.c:14733-14743` (`pgbuf_has_prevent_dealloc`).

## 5. Dirty state, LSA, WAL, DWB, and flush

### PGBUF-Q025 — Which operations are deliberately separate in a logged mutation?

- **Category:** Durability / Caller contract
- **Difficulty:** Foundation
- **Likely setting:** Presentation, implementation
- **Question:** How should a caller reason separately about byte mutation, recovery-record construction/append, page LSA
  advancement, dirty marking, unfix, commit, and data-page flush when their exact call order varies by subsystem?
- **Why it matters:** Treating `pgbuf_set_dirty()` as a logging or durability operation can break recovery.
- **Inspect:** `src/storage/page_buffer.c:4921-5096` (`pgbuf_set_dirty`, `pgbuf_get_lsa`, `pgbuf_set_lsa`);
  `src/storage/heap_file.c:23120-23325` (`heap_insert_logical`); `src/storage/btree.c:29700-29872`
  (representative leaf logging/dirty paths).

### PGBUF-Q026 — Why does the BCB track `oldest_unflush_lsa` in addition to page LSA?

- **Category:** Durability / Checkpoint
- **Difficulty:** Advanced
- **Likely setting:** Recovery, checkpoint review
- **Question:** Which dirty generation does `oldest_unflush_lsa` delimit, when is it initialized, saved, nulled,
  restored, or compared, and how does checkpoint use it to compute the remaining redo floor?
- **Why it matters:** Page LSA alone does not describe the oldest still-unflushed responsibility of the resident BCB.
- **Inspect:** `src/storage/page_buffer.c:4996-5081` (`pgbuf_set_lsa`);
  `src/storage/page_buffer.c:10733-10961` (`pgbuf_bcb_flush_with_wal`);
  `src/storage/page_buffer.c:4185-4678` (`pgbuf_flush_checkpoint` and sequential flushing).

### PGBUF-Q027 — How can a successful flush leave the resident page dirty?

- **Category:** Durability / Concurrent generations
- **Difficulty:** Advanced
- **Likely setting:** Presentation, race review
- **Question:** At what point does the flusher separate the old dirty generation from the resident BCB, what can a
  concurrent writer change during I/O, and which completion transition must avoid erasing the newer generation?
- **Why it matters:** A “flush success means clean now” invariant would lose a concurrent update.
- **Inspect:** `src/storage/page_buffer.c:10733-10961` (`pgbuf_bcb_flush_with_wal`);
  `src/storage/page_buffer.c:16020-16137` (dirty/flushing flag helpers).

### PGBUF-Q028 — Why are WAL and DWB complementary rather than interchangeable?

- **Category:** Durability / Storage failure model
- **Difficulty:** Working
- **Likely setting:** Presentation, recovery design
- **Question:** Which failure is prevented by forcing log through the copied page LSA, which failure is addressed by
  the DWB path, and what durability boundary remains outside both mechanisms?
- **Why it matters:** Confusing ordering, torn-page defense, and filesystem synchronization produces invalid crash
  guarantees.
- **Inspect:** `src/storage/page_buffer.c:10733-10961` (`pgbuf_bcb_flush_with_wal`);
  `src/transaction/log_page_buffer.c:4150-4189` (`logpb_flush_log_for_wal`);
  `src/storage/double_write_buffer.cpp:2520-2730` (DWB write path; inspect concrete callees reached from the flush).

### PGBUF-Q029 — When does safe flush write, defer, wait, or return?

- **Category:** Flush / Latch interaction
- **Difficulty:** Advanced
- **Likely setting:** Implementation, debugging
- **Question:** How do clean state, active FLUSHING, NO/READ/WRITE latch ownership, synchronous versus asynchronous
  intent, and a foreign writer determine whether `pgbuf_bcb_safe_flush_internal()` flushes now, sets a request, or
  queues a FLUSH waiter—and is `pgbuf_flush_with_wal()` on a READ-held page a supported contract or only a broader
  assertion than its source comment suggests?
- **Why it matters:** Flush scheduling must preserve page consistency without requiring every caller to drop ownership.
- **Inspect:** `src/storage/page_buffer.c:8810-8901` (`pgbuf_bcb_safe_flush_internal`);
  `src/storage/page_buffer.c:3589-3659` (`pgbuf_flush_with_wal`, `pgbuf_flush_if_requested`);
  `src/storage/page_buffer.c:7101-7145`, `src/storage/page_buffer.c:7474-7511` (FLUSH waiters).

### PGBUF-Q030 — Why is checkpoint flush not “flush all dirty pages”?

- **Category:** Checkpoint / Recovery
- **Difficulty:** Advanced
- **Likely setting:** Presentation, recovery tuning
- **Question:** Which LSA range and page classes are selected, why are candidates sorted, what does the returned
  smallest LSA mean, how does this differ from all-pages, unfixed-only, and reset-LSA bulk variants, and which
  log/file/volume synchronization steps belong to the checkpoint owner afterward?
- **Why it matters:** A fuzzy checkpoint's correctness and cost depend on its bounded redo responsibility, not a fully
  clean pool.
- **Inspect:** `src/storage/page_buffer.c:3663-3758` (bulk flush variants);
  `src/storage/page_buffer.c:4185-4678` (`pgbuf_flush_checkpoint` and helpers);
  `src/transaction/log_page_buffer.c:6901-7406` (`logpb_checkpoint`).

### PGBUF-Q031 — Do all flush failures restore a retryable dirty state?

- **Category:** Flush / Failure
- **Difficulty:** Expert
- **Likely setting:** Fault-injection design, code review
- **Question:** Which ordinary I/O failure path restores DIRTY, `oldest_unflush_lsa`, and waiter progress, which TDE or
  DWB-slot errors return before common rollback, and how do failures reached from void `pgbuf_unfix()` or the
  return-discarding recovery flush callback become visible, if at all?
- **Why it matters:** Error-handling guarantees must match current control flow before tests or hardening changes are
  designed.
- **Inspect:** `src/storage/page_buffer.c:10733-10961` (`pgbuf_bcb_flush_with_wal`, especially 10809-10922);
  `src/storage/page_buffer.c:6657-6883` (`pgbuf_unlatch_bcb_upon_unfix`);
  `src/storage/page_buffer.c:14888-14922` (`pgbuf_rv_flush_page`).

## 6. Replacement, pressure, and background progress

### PGBUF-Q032 — Why is clean plus `fcnt == 0` still insufficient for victim reuse?

- **Category:** Replacement / Eligibility
- **Difficulty:** Foundation
- **Likely setting:** Presentation, debugging
- **Question:** Which latch, waiter, FLUSHING, direct-victim, zone, and final identity conditions must also be checked
  before a BCB can be removed from hash and reused?
- **Why it matters:** Simplified victim predicates can reuse a frame while another protocol still depends on it.
- **Inspect:** `src/storage/page_buffer.c:9266-9312` (`pgbuf_is_bcb_victimizable` and related checks);
  `src/storage/page_buffer.c:9324-9534` (`pgbuf_get_victim_from_lru_list`);
  `src/storage/page_buffer.c:8643-8686` (`pgbuf_victimize_bcb`).

### PGBUF-Q033 — What problem do LRU1/LRU2/LRU3 and AOUT each solve?

- **Category:** Replacement / Policy
- **Difficulty:** Working
- **Likely setting:** Presentation, tuning
- **Question:** How should hotness zones, first-unfix placement, promotion, and the nonresident AOUT history be
  distinguished, and which policy choices are not caller-visible correctness guarantees?
- **Why it matters:** Tuning or reimplementation should not mistake ghost history for residency or eligibility.
- **Inspect:** `src/storage/page_buffer.c:182-217` (LRU zone design); `src/storage/page_buffer.c:622-648`
  (`PGBUF_AOUT_LIST`); `src/storage/page_buffer.c:6896-7037` (last-unfix placement/boost);
  `src/storage/page_buffer.c:10476-10644` (AOUT operations).

### PGBUF-Q034 — How do private and shared LRUs avoid becoming correctness state?

- **Category:** Replacement / Quotas
- **Difficulty:** Advanced
- **Likely setting:** Tuning, session-lifecycle review
- **Question:** How are private LRUs assigned, enabled, released, promoted to shared ownership, and periodically
  re-quoted from approximate activity, and which placement assumptions must callers never rely on?
- **Why it matters:** Adaptive isolation is a policy seam whose lifecycle and metrics can affect performance without
  changing fix semantics.
- **Inspect:** `src/storage/page_buffer.c:13949-14118` (private-LRU initialization);
  `src/storage/page_buffer.c:14260-14635` (`pgbuf_adjust_quotas`, `pgbuf_assign_private_lru`,
  `pgbuf_release_private_lru`); `src/session/session.c:380-760` (session ownership call sites).

### PGBUF-Q035 — How does the pool make progress when ordinary victim search fails?

- **Category:** Resource pressure / Direct victims
- **Difficulty:** Expert
- **Likely setting:** Performance debugging, concurrency review
- **Question:** How do high/low-priority allocator queues, victim flush, maintenance, post-flush assignment, timeout, and
  the revocable direct-victim flag cooperate, and what race forces the recipient to discard an assigned candidate?
- **Why it matters:** “All buffers dirty” and long allocation waits require tracing a distributed progress protocol,
  not one LRU scan.
- **Inspect:** `src/storage/page_buffer.c:8189-8367` (`pgbuf_allocate_bcb` path);
  `src/storage/page_buffer.c:15429-15651` (direct-victim queues/assignment/claim);
  `src/storage/page_buffer.c:9617-9691` (`pgbuf_direct_victims_maintenance`).

### PGBUF-Q036 — Which daemon owns which progress step, and when is synchronous fallback used?

- **Category:** Background maintenance / Lifecycle
- **Difficulty:** Advanced
- **Likely setting:** Boot, recovery, tuning
- **Question:** In what order are the pool, DWB/recovery dependencies, and daemons initialized and torn down; what
  distinct work is performed by maintenance, victim-flush, post-flush, and flush-control daemons; when are their tasks
  gated; and what path supplies progress when the page-flush daemon is unavailable?
- **Why it matters:** Startup ordering and standalone/recovery modes change who performs pressure relief without
  changing the public caller contract.
- **Inspect:** `src/storage/page_buffer.c:1649-2122` (`pgbuf_initialize`, `pgbuf_finalize`);
  `src/storage/page_buffer.c:16975-17255` (daemon execute/init/destroy functions);
  `src/storage/page_buffer.c:11684-11702` (`pgbuf_wakeup_page_flush_daemon` fallback);
  `src/transaction/boot_sr.c:2363-2444` (`boot_restart_server` daemon gate).

## 7. Invalidation, deallocation, and recovery

### PGBUF-Q037 — How do unfix, flush, invalidate, deallocate, and victimization differ?

- **Category:** Destructive-looking operations
- **Difficulty:** Foundation
- **Likely setting:** Presentation, review
- **Question:** For each operation, which of caller ownership, resident mapping, logical allocation, dirty state, and
  durable content changes, and which operation may consume the caller's fix internally?
- **Why it matters:** These verbs cross different transaction, cache, and recovery boundaries despite similar names.
- **Inspect:** `src/storage/page_buffer.c:3075-3559` (`pgbuf_unfix`, `pgbuf_invalidate`,
  `pgbuf_invalidate_all`); `src/storage/page_buffer.c:3566-3621` (one-page flush);
  `src/storage/page_buffer.c:8643-8752` (victimize/invalidate BCB); `src/storage/page_buffer.c:15182-15237`
  (`pgbuf_dealloc_page`).

### PGBUF-Q038 — Why can `pgbuf_invalidate_all()` leave pages resident?

- **Category:** Invalidation / Concurrency
- **Difficulty:** Advanced
- **Likely setting:** Boot, volume maintenance, debugging
- **Question:** Which fixed, refixed, dirty, or avoid-victim pages are skipped or rechecked by one-page and bulk
  invalidation, and what quiescence obligation must the higher-level volume operation supply?
- **Why it matters:** The function name must not be interpreted as forcefully revoking live owners.
- **Inspect:** `src/storage/page_buffer.c:3383-3559` (`pgbuf_invalidate`, `pgbuf_invalidate_all`);
  `src/transaction/boot_sr.c:500-560` (representative volume invalidation caller);
  `src/storage/disk_manager.c:721-811` (`disk_format` reset/error paths).

### PGBUF-Q039 — Why is permanent deallocation postponed and not immediately invalidated?

- **Category:** Deallocation / Transaction boundary
- **Difficulty:** Advanced
- **Likely setting:** File/heap implementation, recovery review
- **Question:** Why must reuse wait for commit, why does the final buffer operation require and internally consume a
  sole WRITE fix without nulling the caller's lvalue, what is logged and changed to `PAGE_UNKNOWN`, and why is the dirty
  frame steered toward LRU bottom instead of synchronously removed?
- **Why it matters:** Premature reuse or incorrect fix ownership can make abort/recovery unable to reconstruct the page.
- **Inspect:** `src/storage/file_manager.c:6131-6312` (`file_dealloc`);
  `src/storage/file_manager.c:6599-6793` (`file_perm_dealloc`, `file_rv_dealloc_internal`);
  `src/storage/page_buffer.c:15182-15237` (`pgbuf_dealloc_page`).

### PGBUF-Q040 — How should a caller distinguish “deallocated” from “reused”?

- **Category:** Deallocation race / Fetch mode
- **Difficulty:** Expert
- **Likely setting:** Vacuum, B-tree scan, debugging
- **Question:** How do disk-sector reservation, `OLD_PAGE_MAYBE_DEALLOCATED`, `PAGE_UNKNOWN`, and a VPID reused with a
  different page type combine, and which outcomes mean successful absence rather than a storage error?
- **Why it matters:** A race-aware scan must not process a newly reused metadata page as the old heap/index page.
- **Inspect:** `src/storage/page_buffer.c:2501-2525` (`pgbuf_fix_release` deallocated-mode check);
  `src/storage/page_buffer.c:15355-15405` (`pgbuf_fix_if_not_deallocated`);
  `src/query/vacuum.c:1581-1908` (`vacuum_heap_page`);
  `src/storage/btree.c:24980-25060` (representative not-deallocated B-tree call site).

### PGBUF-Q041 — Why does redo use `RECOVERY_PAGE`, and how is replay idempotence decided?

- **Category:** Recovery
- **Difficulty:** Advanced
- **Likely setting:** Recovery implementation, presentation
- **Question:** Why can ordinary allocation validation be incorrect during parallel redo, when does page LSA cause a
  record to be skipped, who sets the post-redo LSA, and which scope guarantees unfix on every exit?
- **Why it matters:** Recovery must tolerate partially reconstructed allocation metadata while preventing duplicate
  application.
- **Inspect:** `src/transaction/log_recovery.c:497-536` (`log_rv_fix_page_and_check_redo_is_needed`);
  `src/transaction/log_recovery.c:6407-6431` (`log_rv_redo_fix_page`);
  `src/transaction/log_recovery_redo.hpp:587-668` (`log_rv_redo_record_sync`).

## 8. Specialized APIs and observability

### PGBUF-Q042 — Why is `pgbuf_simple_fix()` not a cheaper ordinary fix?

- **Category:** Specialized API / Temporary pages
- **Difficulty:** Working
- **Likely setting:** Implementation, review
- **Question:** Which temporary/read-only/no-concurrent-writer assumptions replace the ordinary latch and holder
  protocol, what does `need_fix` control, and which exact release/deallocation functions must be paired with it?
- **Why it matters:** Mixing simple and normal protocols breaks both content protection and ownership diagnostics.
- **Inspect:** `src/storage/page_buffer.h:270-273` (simple-fix contract);
  `src/storage/page_buffer.c:2700-2838` (`pgbuf_simple_fix`, `pgbuf_simple_unfix`,
  `pgbuf_dealloc_temp_page`); `src/storage/file_manager.c:4073-4366`
  (`file_sector_map_dealloc_temp`, `file_destroy`).

### PGBUF-Q043 — Is a scan-copy `PAGE_PTR` a fixed page?

- **Category:** Specialized API / Scan snapshot
- **Difficulty:** Working
- **Likely setting:** Heap-scan implementation, review
- **Question:** What storage and dummy metadata does `PGBUF_COPY_BUFFER_HANDLE` own, how long is its returned pointer
  valid, which metadata accessors are meaningful on it, which ownership/mutation APIs are forbidden, and what live
  watcher still supplies deallocation safety?
- **Why it matters:** A pointer-shaped snapshot does not carry hash, latch, holder, or replacement ownership.
- **Inspect:** `src/storage/page_buffer.h:512-519` (opaque copy API);
  `src/storage/page_buffer.c:910-981` (`pgbuf_copy_buffer_alloc`, `pgbuf_copy_page_for_scan`, access/free helpers);
  `src/storage/heap_file.c:6439-6465`, `src/storage/heap_file.c:7556-7645` (scan-cache callers).

### PGBUF-Q044 — Can callers trust `do_fetch` in the area-copy helpers?

- **Category:** Specialized API / Revision hazard
- **Difficulty:** Expert
- **Likely setting:** Review, bug diagnosis
- **Question:** What do the comments claim, which normal-build branches execute for hit and miss with each `do_fetch`
  value, when may an output area remain unchanged despite a non-`NULL` return, and why is the write helper unsuitable
  for WAL-managed pages?
- **Why it matters:** The current comment/code drift can turn a convenience helper into silent stale-data use.
- **Inspect:** `src/storage/page_buffer.c:4701-4826` (`pgbuf_copy_to_area`);
  `src/storage/page_buffer.c:4833-4912` (`pgbuf_copy_from_area`); `src/storage/external_sort.c:5920-6005`
  (representative caller).

### PGBUF-Q045 — Which metadata helpers mutate recovery state rather than merely inspect it?

- **Category:** Specialized API / Metadata
- **Difficulty:** Advanced
- **Likely setting:** Implementation, review
- **Question:** Which latch and subsystem context are required for LSA, temporary-LSA, page-type, and TDE setters,
  which getters return borrowed storage, which setters dirty or log under only narrowly defined conditions, and does
  the debug/release difference in defensive dirty marking change how a missing caller step is detected?
- **Why it matters:** Similar accessor names hide very different persistence and ownership side effects.
- **Inspect:** `src/storage/page_buffer.c:4959-5203` (LSA and TDE functions);
  `src/storage/page_buffer.c:5210-5537` (identity, latch, type access/check/set functions);
  `src/storage/page_buffer.c:17305-17319` (temporary-LSA predicate).

### PGBUF-Q046 — What exactly does each page-buffer metric measure?

- **Category:** Observability / Tuning
- **Difficulty:** Advanced
- **Likely setting:** Performance debugging, presentation Q&A
- **Question:** Which values are event counters, interval deltas, approximate unlocked gauges, or daemon statistics;
  where do the `pgbuf_peek_stats()` header parameter names drift from definition semantics; how do SHOW labels differ
  from internal victim predicates; and where must an answerer inspect increment sites before interpreting `ioreads`,
  `dirties`, or `flushed`?
- **Why it matters:** Counter names can suggest stronger physical-I/O or consistency semantics than the code records.
- **Inspect:** `src/storage/page_buffer.h:443-456` (`pgbuf_peek_stats` declaration);
  `src/storage/page_buffer.c:14748-14847` (`pgbuf_peek_stats` definition);
  `src/storage/page_buffer.c:17259-17287` (`pgbuf_daemons_get_stats`);
  `src/storage/page_buffer.c:17323-17530` (`pgbuf_start_scan` and status gathering);
  `src/base/perf_monitor.c` (search every `PSTAT_PB_*` increment consumed by the answer).

## 9. Current-revision hazards and failure proof obligations

### PGBUF-Q047 — What remains owned internally after a DWB read error on a cold miss?

- **Category:** Failure / Current-revision hazard
- **Difficulty:** Expert
- **Likely setting:** Fault-injection review
- **Question:** At the direct return from `dwb_read_page()` failure, which provisional BCB, hash mutex/load record, and
  waiter-wakeup obligations have already been established, and which common cleanup path is bypassed?
- **Why it matters:** A caller may receive no page while the pool retains internal state that blocks future progress.
- **Inspect:** `src/storage/page_buffer.c:8404-8634` (`pgbuf_claim_bcb_for_fix`, especially 8431-8559);
  `src/storage/page_buffer.c:7991-8177` (`pgbuf_lock_page`, `pgbuf_unlock_page`);
  `src/storage/double_write_buffer.cpp` (`dwb_read_page`, inspect its failure-side effects).

### PGBUF-Q048 — What happens if holder allocation fails after latch/fix grant?

- **Category:** Failure / Current-revision hazard
- **Difficulty:** Expert
- **Likely setting:** OOM audit, hardening design
- **Question:** Across normal grant, blocked wakeup, lock-free hit, and promotion paths, which atomic state is changed
  before holder allocation, which branches lack visible rollback, and what compatibility choice would a hardened
  implementation need to make?
- **Why it matters:** “`NULL` means no internal ownership exists” is not unconditional at this revision.
- **Inspect:** `src/storage/page_buffer.c:6465-6470`, `src/storage/page_buffer.c:6516-6522`,
  `src/storage/page_buffer.c:6607-6613` (`pgbuf_latch_bcb_upon_fix` holder failures);
  `src/storage/page_buffer.c:7725-7787` (`pgbuf_lockfree_fix_ro`);
  `src/storage/page_buffer.c:2849-3059` (`pgbuf_promote_read_latch_release`).

### PGBUF-Q049 — What proof closes the lock-free READ-hit reuse race?

- **Category:** Concurrency / Current-revision proof obligation
- **Difficulty:** Expert
- **Likely setting:** Race review, reimplementation
- **Question:** Given that the fast path checks VPID before successful CAS but does not repeat the identity check after
  CAS, which victimization and memory-lifetime invariants must exclude ABA-style reuse, and what test or formal argument
  would falsify that reasoning?
- **Why it matters:** A symbol named “lockfree” is not itself proof that identity publication and reuse are race-free.
- **Inspect:** `src/storage/page_buffer.c:7725-7787` (`pgbuf_lockfree_fix_ro`);
  `src/storage/page_buffer.c:9266-9312` (victim eligibility);
  `src/storage/page_buffer.c:8643-8686` (`pgbuf_victimize_bcb`).

### PGBUF-Q050 — Is `pgbuf_fix_without_validation()` an available Interface?

- **Category:** Interface drift / Current-revision hazard
- **Difficulty:** Working
- **Likely setting:** Implementation, link-failure diagnosis
- **Question:** Which build configuration exposes the macro and declaration, where is its definition expected, whether
  any call site exists, and what should documentation or a caller conclude from the repository-wide negative search?
- **Why it matters:** Header visibility can falsely advertise a usable optimization and defer failure until link time.
- **Inspect:** `src/storage/page_buffer.h:286-356` (debug/release fix declarations and macros, especially 320-326);
  repository-wide searches for `pgbuf_fix_without_validation_release` and `pgbuf_fix_without_validation`.

### PGBUF-Q051 — Is the deallocation-undo diagnostic reading initialized identity?

- **Category:** Recovery diagnostic / Current-revision hazard
- **Difficulty:** Expert
- **Likely setting:** Recovery debugging, code review
- **Question:** In `pgbuf_rv_dealloc_undo_compensate()`, is the local `VPID` used by the debug TDE log initialized on
  every compiled path, is the issue confined to diagnostics, and what evidence would be needed before inferring a
  wider recovery-state defect?
- **Why it matters:** Undefined diagnostic identity can misdirect recovery investigations even if page restoration is
  otherwise correct.
- **Inspect:** `src/storage/page_buffer.c:15314-15348` (`pgbuf_rv_dealloc_undo_compensate`), including the
  `NDEBUG`-guarded diagnostic branch; `src/storage/page_buffer.c:15264-15312` (`pgbuf_rv_dealloc_undo`) as the
  neighboring initialized-identity contrast.

## 10. Cross-database analogies that invite follow-up questions

### PGBUF-Q052 — What is the nearest ownership analogue in PostgreSQL and InnoDB?

- **Category:** Cross-database / Ownership
- **Difficulty:** Advanced
- **Likely setting:** Presentation Q&A, design comparison
- **Question:** Which responsibilities bundled by CUBRID `pgbuf_fix()` are split between PostgreSQL pin/content lock and
  InnoDB buffer fix/MTR memo, and where would a literal API-name mapping misstate caller obligations?
- **Why it matters:** The comparison should transfer concepts without implying Interface equivalence.
- **Inspect:** CUBRID `src/storage/page_buffer.c:2256-2679`, `src/storage/page_buffer.c:6008-6883`;
  PostgreSQL `src/backend/storage/buffer/bufmgr.c:3269-3386` (`PinBuffer`),
  `src/backend/storage/buffer/bufmgr.c:5620-5682` (`UnlockReleaseBuffer`),
  `src/backend/storage/buffer/bufmgr.c:6061-6107` (`BufferLockConditional`);
  MySQL `storage/innobase/buf/buf0buf.cc:3696-3745`, `storage/innobase/buf/buf0buf.cc:4295-4443`,
  `storage/innobase/mtr/mtr0mtr.cc:243-296` (`memo_slot_release`).

### PGBUF-Q053 — When is an in-progress miss published to other threads?

- **Category:** Cross-database / Miss coordination
- **Difficulty:** Expert
- **Likely setting:** Architecture comparison, concurrency review
- **Question:** At what point do CUBRID, PostgreSQL, and InnoDB expose a mapping for a page whose I/O is incomplete,
  what object do waiters observe, and how does each design prevent duplicate resident identity or duplicate loading?
- **Why it matters:** Similar “one page, one frame” goals can have materially different publication and failure-cleanup
  states.
- **Inspect:** CUBRID `src/storage/page_buffer.c:7991-8177`, `src/storage/page_buffer.c:8404-8634`;
  PostgreSQL `src/backend/storage/buffer/bufmgr.c:2177-2351` (`BufferAlloc`),
  `src/backend/storage/buffer/bufmgr.c:7289-7445` (`StartBufferIO`, `TerminateBufferIO`);
  MySQL `storage/innobase/buf/buf0buf.cc:4876-5079` (`buf_page_init_for_read`),
  `storage/innobase/buf/buf0buf.cc:5731-5998` (`buf_page_io_complete`).

### PGBUF-Q054 — Which replacement-policy analogy is useful without becoming false equivalence?

- **Category:** Cross-database / Replacement
- **Difficulty:** Advanced
- **Likely setting:** Tuning, presentation Q&A
- **Question:** Which responsibility is shared by CUBRID LRU zones/AOUT/private lists, PostgreSQL clock sweep, and
  InnoDB midpoint LRU, and which hotness, ghost-history, ownership, and candidate-selection semantics prevent treating
  the algorithms as interchangeable?
- **Why it matters:** Policy comparisons should explain trade-offs rather than imply identical knobs or workload
  response.
- **Inspect:** CUBRID `src/storage/page_buffer.c:8994-10720`, `src/storage/page_buffer.c:13949-14635`;
  PostgreSQL `src/backend/storage/buffer/freelist.c:169-321` (`StrategyGetBuffer`),
  `src/backend/storage/buffer/bufmgr.c:2548-2681` (`GetVictimBuffer`);
  MySQL `storage/innobase/buf/buf0buf.cc:4148-4180`, `storage/innobase/buf/buf0buf.cc:4512-4610`
  (LRU access/eviction paths named in the pinned source).

### PGBUF-Q055 — How do WAL ordering, dirty generations, checkpointing, and torn-page defense differ across engines?

- **Category:** Cross-database / Durability
- **Difficulty:** Expert
- **Likely setting:** Recovery design, presentation Q&A
- **Question:** What is genuinely analogous among CUBRID page LSA/oldest-unflush-LSA/DWB, PostgreSQL page LSN/full-page
  images/checkpoint flushing, and InnoDB modification LSN/flush list/doublewrite, and which completion boundaries make
  the mapping only partial?
- **Why it matters:** Durability mechanisms with related goals are not substitutes unless their crash assumptions and
  caller contracts also match.
- **Inspect:** CUBRID `src/storage/page_buffer.c:10733-10961`,
  `src/storage/page_buffer.c:4185-4678`, `src/transaction/log_page_buffer.c:6901-7406`;
  PostgreSQL `src/backend/storage/buffer/bufmgr.c:4509-4642` (`FlushBuffer`) and checkpoint paths reachable from
  `BufferSync`; MySQL `storage/innobase/buf/buf0flu.cc:943-1167`,
  `storage/innobase/buf/buf0dblwr.cc:2525-2660`, `storage/innobase/mtr/mtr0mtr.cc:779-800`,
  `storage/innobase/include/buf0flu.ic:54-115`.

## Runtime-confirmation flags

The following questions are source-answerable in part but would be materially strengthened or disambiguated by a
controlled runtime observation. This packet does not run those experiments. Fault injection or instrumentation is
needed only where explicitly stated; simple SQL/counter observation is sufficient for the remaining behavioral cases.

| IDs | Why runtime confirmation is valuable | Evidence shape to consider later |
|---|---|---|
| PGBUF-Q008, Q013, Q016, Q018 | Nested debt, blocking, promotion, timeout, and retry outcomes depend on live thread/transaction state. | Narrow single-/multi-session workload plus audited latch/holder counters or debugger observation. |
| PGBUF-Q015, Q017, Q019, Q020–Q024 | Fairness, lock order, promotion, and ordered release/refix questions involve scheduler-dependent interleavings. | Controlled concurrency harness validating invariants rather than one exact schedule. |
| PGBUF-Q027, Q029–Q031 | Re-dirty, deferred flush, checkpoint selection, and error restoration are generation- and timing-sensitive. | Existing counters plus a synchronous flush boundary; fault injection only for the named error branches. |
| PGBUF-Q033–Q036 | LRU/AOUT/quota/direct-victim/daemon behavior is adaptive and pressure-dependent. | Small-buffer pressure workload with source-audited counters and daemon statistics. |
| PGBUF-Q038–Q041 | Invalidation, deallocation, VPID reuse, and redo are strongest when checked across commit/restart boundaries. | Skill-owned database, deterministic allocation/deallocation, and restart/recovery observation. |
| PGBUF-Q042–Q046 | Temporary, scan-copy, copy-area, metadata, and metric semantics include build-mode and caller-path differences. | Focused unit/caller test; compare debug/release only where the question names that distinction. |
| PGBUF-Q047–Q049, Q051 | Source exposes cleanup or identity proof obligations, but production reachability and consequence are unproved. | Isolated fault injection or race instrumentation; never use user-owned data/services. |
| PGBUF-Q050 | The hazard is a build/link property rather than a server runtime property. | Minimal compile/link probe in both relevant build configurations. |

## Coverage summary

| Category | IDs | Count |
|---|---|---:|
| Mental model and Interface choice | PGBUF-Q001–Q007 | 7 |
| Ownership and lifetime | PGBUF-Q008–Q012 | 5 |
| Latch, wait, promotion, lock ordering | PGBUF-Q013–Q019 | 7 |
| Ordered watcher | PGBUF-Q020–Q024 | 5 |
| Dirty, LSA, WAL, DWB, flush | PGBUF-Q025–Q031 | 7 |
| Replacement and pressure | PGBUF-Q032–Q036 | 5 |
| Invalidation, deallocation, recovery | PGBUF-Q037–Q041 | 5 |
| Specialized APIs and observability | PGBUF-Q042–Q046 | 5 |
| Current-revision hazards | PGBUF-Q047–Q051 | 5 |
| Cross-database analogies | PGBUF-Q052–Q055 | 4 |
| **Total** | **PGBUF-Q001–Q055** | **55** |

## Answerer discipline

For every future answer derived from this bank:

1. Read the complete anchored function and the directly relevant caller/callee path, not only the cited line fragment.
2. Separate caller-facing contract, current implementation, observed runtime behavior, inference, and suspected defect.
3. Do not convert timeout or anti-barging behavior into a blanket deadlock/fairness guarantee.
4. Do not infer a physical-I/O event from a counter name without auditing every increment site.
5. For Q047–Q051, distinguish a source-visible cleanup exception or proof obligation from a reproduced production bug.
6. For Q052–Q055, classify the comparison as equivalent, partial analogy, or no equivalent only after checking every
   participating engine's pinned primary source.
