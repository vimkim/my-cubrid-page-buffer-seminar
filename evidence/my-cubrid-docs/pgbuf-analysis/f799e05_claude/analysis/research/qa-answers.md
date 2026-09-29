# CUBRID page-buffer answer bank

## Evidence frame

- Role: independent answer researcher. This packet was written without reading the Korean presentation.
- CUBRID: `/home/vimkim/gh/cb/pgbuf-analysis` at `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.
- PostgreSQL: `/home/vimkim/gh/pg/postgres` at `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`.
- MySQL/InnoDB: `/home/vimkim/gh/mysql/mysql-server` at `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8`.
- `PRIOR/` below means `/home/vimkim/gh/my-cubrid-docs/code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/`.
- Labels used below: **contract** is caller-visible; **implementation** is revision-specific; **inference** is a proof
  argument not promised by the API; **suspected defect** is anomalous source control flow without a production
  reproducer; **runtime observed** is limited to the previously sealed same-revision runs cited explicitly.

## 1. Mental model and Interface choice

### PGBUF-Q001 — What does a successful fix actually promise?

- **Direct answer — contract:** success returns the requested VPID's resident frame, protected from replacement by one
  new fix, protected for content access by the requested READ/WRITE latch, and represented in the current thread's
  holder accounting. The pointer is usable only until the matching release.
- **Mechanism/consequence:** hit or miss converges on a BCB whose identity is checked, whose atomic `fcnt`/latch is
  granted, and whose holder is installed. A caller owes one unfix per success; neither residency nor pointer equality
  removes that debt.
- **Evidence:** `src/storage/page_buffer.h:172-209`; `src/storage/page_buffer.c:2256-2679`,
  `src/storage/page_buffer.c:6298-6634`.
- **Confidence/limit:** high, public contract plus implementation. Exceptional holder-OOM rollback is separately
  qualified in Q048.

### PGBUF-Q002 — Which object is the page?

- **Direct answer — implementation vocabulary:** `VPID` is logical identity; the hash maps it to a resident
  `PGBUF_BCB`; the BCB owns volatile latch/flags/LRU/LSA metadata and points to its paired I/O frame; `PAGE_PTR` points
  into that frame. Global `fcnt` prevents reuse, while a per-thread holder records who owes releases.
- **Mechanism/consequence:** a frame address may later represent another VPID, and one pointer may correspond to
  multiple nested holds. Crash-dump analysis must correlate VPID, BCB state, frame backpointer, atomic latch, and holder
  list rather than call all of them “the page.”
- **Evidence:** `src/storage/page_buffer.c:382-517`, `src/storage/page_buffer.c:744-893`.
- **Confidence/limit:** high, current private layout; not ABI.

### PGBUF-Q003 — How should a caller choose among acquisition families?

- **Direct answer — contract:** use `OLD_PAGE` for an allocated page, `NEW_PAGE` only after allocation ownership is
  established, `OLD_PAGE_IF_IN_BUFFER` for a no-I/O resident probe, `OLD_PAGE_PREVENT_DEALLOC` across a deallocation
  race, `OLD_PAGE_{DEALLOCATED,MAYBE_DEALLOCATED}` only for their recovery/race protocols, and `RECOVERY_PAGE` during
  redo. Use `pgbuf_simple_fix` only for read-only temporary-file protocol.
- **Mechanism/consequence:** fetch mode states what the caller already knows about allocation and what absence means;
  it is not a speed hint. A racing scan should prefer `pgbuf_fix_if_not_deallocated`, which returns status separately
  from its optional page.
- **Evidence:** `src/storage/page_buffer.h:172-187`, `src/storage/page_buffer.c:2256-2679`,
  `src/storage/page_buffer.c:2700-2838`, `src/storage/page_buffer.c:15355-15405`.
- **Confidence/limit:** high, contract. The recovery-only modes are not general validation bypasses.

### PGBUF-Q004 — When is `NULL` expected rather than an error?

- **Direct answer — contract:** `OLD_PAGE_IF_IN_BUFFER` miss, conditional latch rejection, and
  `pgbuf_fix_if_not_deallocated`'s expected deallocation may legitimately yield no page. In each case no caller hold was
  returned, so there is no unfix debt.
- **Mechanism/consequence:** hard I/O, validation, interrupt, timeout, or allocation failures also return `NULL`, so
  callers must use the selected protocol and error/status result—not `NULL` alone—to classify it. The
  `fix_if_not_deallocated` wrapper translates expected `PAGE_UNKNOWN` absence to `NO_ERROR` plus `*page == NULL`.
- **Evidence:** `src/storage/page_buffer.c:2298-2353`, `src/storage/page_buffer.c:2572-2615`,
  `src/storage/page_buffer.c:6537-6594`, `src/storage/page_buffer.c:15355-15405`.
- **Confidence/limit:** high caller contract; Q047/Q048 qualify internal cleanup after exceptional failure.

### PGBUF-Q005 — What does `NEW_PAGE` not do?

- **Direct answer — contract:** `NEW_PAGE` does not allocate a disk page, choose its logical type, initialize subsystem
  bytes, establish TDE policy, create recovery logging, set the correct LSA, or mark it dirty.
- **Mechanism/consequence:** it only avoids reading stale disk bytes when claiming the already allocated VPID. The file
  allocator must allocate first, fix as `NEW_PAGE`, invoke an initializer, verify a non-unknown page type, propagate
  TDE, log the new image, and dirty/release according to its system operation.
- **Evidence:** `src/storage/page_buffer.c:8599-8632`, `src/storage/file_manager.c:5420-5592`,
  `src/storage/btree.c:5154-5193`.
- **Confidence/limit:** high; exact logging order is subsystem-specific.

### PGBUF-Q006 — Why can a resident probe and a disk-validity check disagree?

- **Direct answer — contract:** disk allocation, hash residency, and in-page type are separate facts.
  `pgbuf_is_valid_page` asks allocation metadata; `OLD_PAGE_IF_IN_BUFFER` asks residency without loading; page-type
  getters/checkers inspect a fixed image; `fix_if_not_deallocated` combines reservation checking with race-aware fix.
- **Mechanism/consequence:** a valid allocated page may be absent from cache; a deallocation image may remain resident
  as `PAGE_UNKNOWN`; a VPID can later be allocated again with another type. Callers must ask the question they need and
  recheck expected type after a racing acquisition.
- **Evidence:** `src/storage/page_buffer.c:2256-2615`, `src/storage/page_buffer.c:11066-11237`,
  `src/storage/page_buffer.c:15355-15405`.
- **Confidence/limit:** high; no one API supplies an atomic snapshot of all three facts.

### PGBUF-Q007 — When may code bypass the page buffer for raw volume I/O?

- **Direct answer — contract:** only when no conflicting cached authority exists, or after dirty cached pages have
  been flushed and the relevant volume's buffers invalidated before raw reset/overwrite/removal.
- **Mechanism/consequence:** `disk_format` demonstrates WAL/log force before external object creation, buffer-managed
  header initialization, and flush/invalidate before `fileio_reset_volume`. Checkpoint separately orders log flush,
  selected data flush, file synchronization, checkpoint records, and volume metadata.
- **Evidence:** `src/storage/disk_manager.c:511-814`, `src/storage/page_buffer.c:3487-3559`,
  `src/transaction/log_page_buffer.c:6901-7406`.
- **Confidence/limit:** high for these callers; raw-I/O users must establish equivalent quiescence.

## 2. Ownership, lifetime, and release debt

### PGBUF-Q008 — Can one pointer represent multiple release debts?

- **Direct answer — contract:** yes. Recursive same-thread fixes can return the same address while incrementing global
  `fcnt` and that holder's nested `fix_count`; the caller owes one unfix per successful fix.
- **Mechanism/consequence:** the holder remains one list node while its count is greater than zero. `pgbuf_unfix_all`
  reports/asserts leaked holds and only acts as release-build cleanup at request teardown; using it as normal cleanup
  hides branch imbalance.
- **Evidence:** `src/storage/page_buffer.c:416-460`, `src/storage/page_buffer.c:6135-6183`,
  `src/storage/page_buffer.c:3075-3373`.
- **Confidence/limit:** high. **Runtime candidate:** a small instrumented nested-fix unit probe could show the two
  counters and successive unfixes; ordinary SQL cannot isolate this contract reliably.

### PGBUF-Q009 — Which returned pointers survive unfix?

- **Direct answer — contract:** copied scalar/output values survive; borrowed addresses do not. `pgbuf_get_vpid`
  copies identity, while `pgbuf_get_vpid_ptr` and `pgbuf_get_lsa` return BCB/frame-backed addresses. Page payload,
  volume label association, and any record/slot pointer are likewise valid only while the page remains fixed.
- **Mechanism/consequence:** after final unfix, victim reuse may change VPID and bytes even if the frame address remains
  unchanged. Copy needed values before release and never retain page-local addresses across refix.
- **Evidence:** `src/storage/page_buffer.c:4959-4984`, `src/storage/page_buffer.c:5208-5372`.
- **Confidence/limit:** high contract; a later independent object copied by value has its own lifetime.

### PGBUF-Q010 — When does watcher replacement transfer rather than add ownership?

- **Direct answer — contract:** `pgbuf_replace_watcher` moves the existing holder attachment—group, rank, latch/page
  association and bookkeeping—from `old_watcher` to a clean `new_watcher`; it does not perform another fix.
- **Mechanism/consequence:** BCB `fcnt` and holder `fix_count` remain unchanged. The old watcher becomes clean and the
  new watcher becomes the only cleanup owner, so releasing both would double-unfix and releasing neither leaks.
- **Evidence:** `src/storage/page_buffer.c:13759-13799`, `src/storage/heap_file.c:23120-23325`.
- **Confidence/limit:** high, specialized ordered-watcher contract.

### PGBUF-Q011 — What do `FREE` and the release macros actually consume?

- **Direct answer — contract:** `pgbuf_set_dirty(..., FREE)` and `pgbuf_flush(..., FREE)` consume one hold;
  `DONT_FREE` retains it. `pgbuf_set_dirty_and_free` dirties, consumes one hold, and then nulls the caller lvalue.
  `pgbuf_unfix_and_init*` also consumes and nulls; plain `pgbuf_unfix` does not null automatically.
- **Mechanism/consequence:** `FREE` means release a buffer hold, not heap-free memory. The dirty-and-free macro expands
  to two unbraced statements, and page-format macros evaluate arguments repeatedly; side-effect expressions or an
  unbraced conditional are unsafe.
- **Evidence:** `src/storage/page_buffer.h:40-92`, `src/storage/page_buffer.h:382-390`,
  `src/storage/page_buffer.c:3566-3621`, `src/storage/page_buffer.c:4921-4957`.
- **Confidence/limit:** high; macro syntax is revision-specific.

### PGBUF-Q012 — Why are both `fcnt` and per-thread holders needed?

- **Direct answer — implementation:** `fcnt` is the global replacement-exclusion count; holders partition ordinary
  fixes by thread, support balanced nested release, watcher attachment, latch ownership checks, and diagnostics.
- **Mechanism/consequence:** only `fcnt` would not identify the owner or release debt; only holders would make the hot
  victim predicate expensive and fail to cover holderless simple fixes. `pgbuf_simple_fix` deliberately increments
  only `fcnt`, so its caller must use the simple release/deallocation protocol.
- **Evidence:** `src/storage/page_buffer.c:382-467`, `src/storage/page_buffer.c:6008-6183`,
  `src/storage/page_buffer.c:2700-2804`.
- **Confidence/limit:** high current invariant; implementation could be redesigned only if both properties survive.

## 3. Latch, wait, promotion, and lock ordering

### PGBUF-Q013 — Why can a buffer hit still block or time out?

- **Direct answer — contract:** residency resolves identity, not latch compatibility. A resident BCB may have a foreign
  WRITE latch, incompatible readers for a WRITE request, or an existing promoter/writer queue. FLUSHING itself is not
  a latch-grant predicate; short BCB-mutex ownership or a synchronous FLUSH waiter's `waiter_exists` can indirectly wait.
- **Mechanism/consequence:** `waiter_exists` prevents a new reader from barging except nested same-holder reads;
  unconditional callers queue with transaction latch-timeout/interruption handling, while zero-wait is converted to a
  conditional attempt. A hit therefore can return `NULL` with timeout/abort state.
- **Evidence:** `src/storage/page_buffer.c:2298-2332`, `src/storage/page_buffer.c:6298-6634`,
  `src/storage/page_buffer.c:7051-7448`.
- **Confidence/limit:** high source contract. Historical SQL showed hit/read signatures, not contention or timeout.

### PGBUF-Q014 — What algorithmic promise does conditional acquisition make?

- **Direct answer — contract:** it promises not to wait behind an incompatible page latch. Rejection returns no new
  page ownership, and the caller must release/reorder/restart according to its higher-level algorithm.
- **Mechanism/consequence:** B-tree split uses conditional child/parent acquisition and explicit restart/promotion
  paths to avoid latch-order cycles. Changing it to unconditional introduces a new blocking edge and can create a
  deadlock; it is not merely a latency trade.
- **Evidence:** `src/storage/page_buffer.c:6537-6594`, `src/storage/btree.c:28237-28845`,
  `src/storage/page_buffer.c:13815-13872`.
- **Confidence/limit:** high for named callers; conditional acquisition alone is not a global deadlock proof.

### PGBUF-Q015 — What fairness does `waiter_exists` provide, and what does it not prove?

- **Direct answer — implementation:** it provides reader anti-barging once blocked READ/WRITE demand exists. Wakeup
  discards timed placeholders, skips FLUSH waiters, grants a compatible reader prefix/batch or one writer, and gives a
  sole promoter front position.
- **Mechanism/consequence:** this reduces writer starvation, but is not strict FIFO: readers batch, promoter insertion
  reorders, FLUSH uses different wake rules, and timeout/interruption removes entries. No blanket starvation-freedom or
  deadlock-freedom claim follows.
- **Evidence:** `src/storage/page_buffer.c:6298-6634`, `src/storage/page_buffer.c:7051-7589`.
- **Confidence/limit:** high for queue policy; scheduling fairness remains unproved and timing-dependent.

### PGBUF-Q016 — What can promotion do to the caller's old pointer and observations?

- **Direct answer — contract:** `ONLY_READER` succeeds only when the caller's holder owns all fixes. `SHARED_READER`
  may subtract all of that holder's READ fixes, remove its holder, wait at queue head, and reconstruct WRITE ownership.
- **Mechanism/consequence:** another writer can change the page during the gap. Some failure paths set `*pgptr_p =
  NULL`, so the caller must inspect both status and pointer, then refetch/revalidate keys, slots, and page-derived
  addresses before continuing.
- **Evidence:** `src/storage/page_buffer.h:205-209`, `src/storage/page_buffer.c:2842-3064`,
  `src/storage/btree.c:28074-28140`, `src/storage/btree.c:28365-28696`.
- **Confidence/limit:** high; historical promotion counters do not prove the blocking interleaving.

### PGBUF-Q017 — Why is there only one leading promoter?

- **Direct answer — implementation:** a shared-reader promotion releases its own READ fixes and enters at the queue
  head; allowing a second leading promoter would leave multiple former readers competing for the exclusive grant and
  complicate who owns/subtracted fixes, risking a promotion cycle. The code rejects it.
- **Mechanism/consequence:** B-tree applies `ONLY_READER` where it can restart cheaply and `SHARED_READER` only with a
  protocol prepared to lose/revalidate old ownership. Progress is jointly supplied by queue policy and tree restart.
- **Evidence:** `src/storage/page_buffer.c:2849-3059`, `src/storage/page_buffer.c:7051-7099`,
  `src/storage/btree.c:28237-28845`.
- **Confidence/limit:** high observed policy; the exact avoided cycle is an implementation rationale, not a formal
  global deadlock proof.

### PGBUF-Q018 — What does `pgbuf_fix_with_retry()` retry, count, and rewrite?

- **Direct answer — implementation:** it reruns full unconditional fix. The `retry` budget is consumed by
  `ER_LK_UNILATERALLY_ABORTED`, `ER_LK_PAGE_TIMEOUT`, or `ER_PAGE_LATCH_TIMEDOUT`; default-case errors stop. Surprisingly,
  `NO_ERROR` and `ER_INTERRUPTED` neither consume the numeric budget nor stop the loop, so repeated returns with either
  state can retry without a bound from the `retry` argument.
- **Mechanism/consequence:** the number is not total attempts or transaction retries. If the helper gives up, it sets
  `ER_PAGE_LATCH_ABORTED`, so the final error may intentionally replace the underlying last latch error.
- **Evidence:** `src/storage/page_buffer.c:2125-2164`, `src/storage/page_buffer.c:7148-7448`.
- **Confidence/limit:** high source behavior; no direct caller was found at this revision.

### PGBUF-Q019 — Which lock protects which state, and where must rechecks occur?

- **Direct answer — implementation:** hash-anchor mutex protects resident/load chains; the VPID buffer lock serializes
  one cold loader; BCB mutex protects identity rechecks, queue and multi-field transitions; page latch protects bytes;
  LRU mutex protects list/policy state; transaction locks protect logical database resources.
- **Mechanism/consequence:** lookup drops hash protection before blocking on BCB and then rechecks VPID. Victim search
  holds LRU only for a BCB try-lock, then rechecks before unlink/reuse. The BCB monitor forbids ordinary blocking
  two-BCB nesting. Transaction locks and latches must not be conflated.
- **Evidence:** `src/storage/page_buffer.c:7600-8177`, `src/storage/page_buffer.c:9324-9534`,
  `src/storage/page_buffer.c:16656-16836`, `src/transaction/lock_manager.c:2290-2330`.
- **Confidence/limit:** high for current paths; not a complete lock graph for every subsystem.

## 4. Ordered watcher protocol

### PGBUF-Q020 — What total order do ordered watchers enforce?

- **Direct answer — contract:** `(heap-group volid/pageid, semantic rank, VPID volid/pageid)`, with ranks heap header,
  ordinary heap, then overflow; only `PAGE_HEAP` and `PAGE_OVERFLOW` participate.
- **Mechanism/consequence:** group and rank encode dependency order that raw VPID order cannot. Slow path audits that
  every releasable ordered hold has matching watcher counts. Ordinary untracked holds remain outside this proof and can
  still form latch cycles when mixed carelessly.
- **Evidence:** `src/storage/page_buffer.h:166-167`, `src/storage/page_buffer.h:219-249`,
  `src/storage/page_buffer.c:12193-12247`, `src/storage/page_buffer.c:12460-12639`.
- **Confidence/limit:** high, specialized contract; not general transaction deadlock avoidance.

### PGBUF-Q021 — What exactly becomes stale after `page_was_unfixed`?

- **Direct answer — contract:** every observation derived from the prior ownership interval: record/slot addresses,
  offsets tied to mutable layout, cached header/type assumptions, neighboring-page decisions, and predicate results.
- **Mechanism/consequence:** ordered slow path may unfix, wait, and refix; the new frame can even have the same address,
  but intervening writers may have changed content. The caller must recompute from `watcher.pgptr` after checking
  `page_was_unfixed`.
- **Evidence:** `src/storage/page_buffer.c:12250-13080`, `src/storage/heap_file.c:3263-3571`.
- **Confidence/limit:** high; exactly what to recompute depends on the caller's derived state.

### PGBUF-Q022 — Is ordered-fix failure all-or-none?

- **Direct answer — contract:** no. On restoration failure the requested page is released, some old watchers may have
  been restored, and later ones may remain `NULL`.
- **Mechanism/consequence:** cleanup must inspect every watcher independently, unfix only non-null restored ownership,
  and discard old page-local pointers regardless. A single success/failure flag cannot encode the remaining ownership
  set.
- **Evidence:** `src/storage/page_buffer.c:12250-12267`, `src/storage/page_buffer.c:12640-13080`,
  `src/storage/heap_file.c:3537-3570`.
- **Confidence/limit:** high, explicitly documented implementation contract.

### PGBUF-Q023 — Which invariants must `pgbuf_ordered_callback()` preserve?

- **Direct answer — contract:** for every ordered holder it may release, holder `fix_count` must equal watcher count;
  all watchers must describe a consistent ordered ownership set. The callback runs without those ordered pages and must
  not retain newly fixed pages on return.
- **Mechanism/consequence:** the wrapper saves, registers deallocation avoidance, releases, calls back, sorts/refixes,
  and unregisters avoidance. Restoration is attempted even after callback error; a refix failure takes precedence
  because ownership reconstruction is the stronger postcondition.
- **Evidence:** `src/storage/page_buffer.c:13066-13400`, `src/storage/bestspace.cpp:56-82`,
  `src/storage/bestspace.cpp:1564-1612`.
- **Confidence/limit:** high for current callback envelope; arbitrary callback behavior outside the stated rule is
  unsupported.

### PGBUF-Q024 — What does avoid-deallocation protect during ordered refix?

- **Direct answer — implementation:** it prevents logical page deallocation while an ordered page is temporarily
  unlatched; it is not a replacement pin and does not substitute for positive `fcnt`.
- **Mechanism/consequence:** the source permits the marked BCB to be victimized; refix may locate a new BCB whose local
  avoid counter is zero, and unregister code tolerates that association change. The protection is protocol intent for
  vacuum/deallocation, not frame-address stability.
- **Evidence:** `src/storage/page_buffer.c:12460-13080`, `src/storage/page_buffer.c:16249-16337`,
  `src/storage/page_buffer.c:14733-14743`.
- **Confidence/limit:** high current semantics; race-freedom depends on deallocator honoring the counter protocol.

## 5. Dirty state, LSA, WAL, DWB, and flush

### PGBUF-Q025 — Which operations are deliberately separate in a logged mutation?

- **Direct answer — contract:** byte mutation, undo/redo construction and append, page-LSA update, dirty marking,
  unfix, transaction commit, and eventual data-page flush are separate responsibilities. Their local order varies with
  the recovery record type, but `pgbuf_set_dirty` performs only dirty bookkeeping (and optional release).
- **Mechanism/consequence:** heap/B-tree callers keep WRITE ownership while producing a stable before/after image,
  append logging, then mark dirty before release. A caller cannot repair omitted logging by dirtying, nor infer
  durability from unfix or commit alone.
- **Evidence:** `src/storage/page_buffer.c:4921-5096`, `src/storage/heap_file.c:23120-23325`,
  `src/storage/btree.c:29700-29872`.
- **Confidence/limit:** high; precise mutation-vs-log append ordering is record-family-specific.

### PGBUF-Q026 — Why does the BCB track `oldest_unflush_lsa` in addition to page LSA?

- **Direct answer — implementation:** page LSA describes the newest logged state in the page image;
  `oldest_unflush_lsa` marks the first still-unflushed logged generation resident in that BCB.
- **Mechanism/consequence:** first logged dirtying initializes it. A flusher saves and nulls it for the copied
  generation; ordinary failure restores it, success retires it unless a concurrent new generation installed another.
  Checkpoint selects by this oldest responsibility and returns the smallest remaining value as the redo floor.
- **Evidence:** `src/storage/page_buffer.c:4996-5081`, `src/storage/page_buffer.c:10733-10961`,
  `src/storage/page_buffer.c:4185-4678`.
- **Confidence/limit:** high current mechanism; temporary LSAs follow a special non-WAL path.

### PGBUF-Q027 — How can a successful flush leave the resident page dirty?

- **Direct answer — implementation:** the flusher marks FLUSHING and clears the old DIRTY generation before copying
  and submitting it. While the BCB mutex is released, a permitted writer can set DIRTY for a newer generation.
- **Mechanism/consequence:** page-buffer-layer completion clears FLUSHING but must preserve that new DIRTY bit and its
  new oldest LSA. With DWB enabled, completion may mean slot acceptance; block and home writes can occur later. Thus
  retirement of the old page-buffer responsibility is compatible with a currently dirty resident page.
- **Evidence:** `src/storage/page_buffer.c:10733-10961`, `src/storage/page_buffer.c:16020-16137`.
- **Confidence/limit:** high source mechanism; prior runtime update/backup did not isolate this interleaving, so it is
  not runtime-confirmed here.

### PGBUF-Q028 — Why are WAL and DWB complementary rather than interchangeable?

- **Direct answer — contract/implementation:** WAL force orders redo records through the copied page LSA before the
  page enters the data-write path. The DWB pipeline creates a whole-page intermediate before corresponding home writes
  to defend against torn/partial pages. Neither page-buffer flush success nor either mechanism alone is the final
  filesystem/device persistence boundary.
- **Mechanism/consequence:** CUBRID copies/encrypts, forces log when the saved oldest LSA requires it, then either writes
  the home page directly or calls `dwb_add_page`. That call can return after slot enqueue when its block is not full;
  DWB block/home writes and synchronization occur later. Higher layers own checkpoint/backup sync boundaries.
- **Evidence:** `src/storage/page_buffer.c:10733-10961`, `src/transaction/log_page_buffer.c:4150-4189`,
  `src/storage/double_write_buffer.cpp:2520-2730`.
- **Confidence/limit:** high source ordering; no crash/fault run proves physical media ordering in this packet.

### PGBUF-Q029 — When does safe flush write, defer, wait, or return?

- **Direct answer — implementation:** clean returns immediately. Unlatched, READ-latched, or caller-owned WRITE pages
  can be snapshotted. A foreign writer causes async request/defer; an active flusher makes synchronous callers wait as
  FLUSH waiters while async callers request progress and return.
- **Mechanism/consequence:** `pgbuf_flush_if_requested` lets a long writer honor deferred work. `pgbuf_flush_with_wal`
  verifies a current holder and the implementation admits READ ownership, although its nearby comment emphasizes a
  fixed page rather than declaring a broad stable public READ-flush guarantee.
- **Evidence:** `src/storage/page_buffer.c:8810-8901`, `src/storage/page_buffer.c:3589-3659`,
  `src/storage/page_buffer.c:7101-7145`, `src/storage/page_buffer.c:7474-7511`.
- **Confidence/limit:** high implementation observation; treat READ-held public use as revision behavior, not a
  portability promise.

### PGBUF-Q030 — Why is checkpoint flush not “flush all dirty pages”?

- **Direct answer — contract:** it flushes permanent dirty generations whose oldest-unflushed LSA falls within the
  checkpoint boundary, sorts candidates for I/O locality, and reports the smallest qualifying responsibility that
  remains. A fuzzy checkpoint can leave later generations dirty.
- **Mechanism/consequence:** all-pages and unfixed-only helpers have different selection rules; reset-LSA variants are
  log/recovery tools. `logpb_checkpoint` additionally owns log forcing, file synchronization, end-checkpoint record and
  header persistence, plus volume checkpoint metadata/DWB sync.
- **Evidence:** `src/storage/page_buffer.c:3663-3758`, `src/storage/page_buffer.c:4185-4678`,
  `src/transaction/log_page_buffer.c:6901-7406`.
- **Confidence/limit:** high; selection is source-confirmed, not a guarantee that the pool becomes clean.

### PGBUF-Q031 — Do all flush failures restore a retryable dirty state?

- **Direct answer — suspected defect:** no unconditional guarantee exists at this revision. Ordinary home/DWB I/O
  failure reacquires BCB, restores old DIRTY and `oldest_unflush_lsa`, clears FLUSHING, and wakes waiters. TDE encrypt
  and DWB-slot setup errors return before that common rollback.
- **Mechanism/consequence:** a deferred flush triggered by void `pgbuf_unfix` has its error cleared; the recovery flush
  callback also does not propagate every lower outcome. Hardened tests must assert internal flag/waiter recovery, not
  just the caller's return.
- **Evidence:** `src/storage/page_buffer.c:10733-10961`, `src/storage/page_buffer.c:6657-6883`,
  `src/storage/page_buffer.c:14888-14922`.
- **Confidence/limit:** high control-flow finding, but no fault injection or production reproducer; classify the early
  returns as suspected defects/proof obligations.

## 6. Replacement, pressure, and background progress

### PGBUF-Q032 — Why is clean plus `fcnt == 0` still insufficient for victim reuse?

- **Direct answer — implementation:** the BCB must also have idle latch/no blocked readers or writers, not be
  FLUSHING, not carry direct-victim invalidation state, reside in the eligible zone, and pass final VPID/state rechecks
  while being removed from LRU and hash.
- **Mechanism/consequence:** candidate selection is only a hint. `pgbuf_victimize_bcb` is the commit point that
  rechecks, removes the mapping, nulls identity, and makes the BCB INVALID for reuse.
- **Evidence:** `src/storage/page_buffer.c:9266-9312`, `src/storage/page_buffer.c:9324-9534`,
  `src/storage/page_buffer.c:8643-8686`.
- **Confidence/limit:** high; avoidance flags/counters add context-specific filters beyond the compact predicate.

### PGBUF-Q033 — What problem do LRU1/LRU2/LRU3 and AOUT each solve?

- **Direct answer — implementation:** LRU1 protects hottest residents, LRU2 buffers aging/reuse, and LRU3 is the
  ordinary victim zone. AOUT is bounded nonresident VPID history used on reload to distinguish reuse from one-pass
  scans and influence placement.
- **Mechanism/consequence:** first-last-unfix places by history/private ownership; later accesses may boost or migrate.
  AOUT contains no page bytes, pin, or allocation proof, and zone placement is policy—not a caller correctness
  postcondition.
- **Evidence:** `src/storage/page_buffer.c:182-217`, `src/storage/page_buffer.c:622-648`,
  `src/storage/page_buffer.c:6896-7037`, `src/storage/page_buffer.c:10476-10644`.
- **Confidence/limit:** high current policy; tuning response is workload-dependent.

### PGBUF-Q034 — How do private and shared LRUs avoid becoming correctness state?

- **Direct answer — contract/implementation:** session-assigned private LRUs isolate likely private working sets;
  cross-owner/hot pages can migrate to shared LRUs. Assignment/release and periodic quota adjustment use approximate
  activity to enable, cap, and redistribute lists.
- **Mechanism/consequence:** every placement still obeys the same fix/latch/dirty/victim invariants. Callers must never
  depend on a page remaining private, a quota being exact, or a particular list index for correctness.
- **Evidence:** `src/storage/page_buffer.c:13949-14118`, `src/storage/page_buffer.c:14260-14635`,
  `src/session/session.c:380-760`.
- **Confidence/limit:** high policy/lifecycle observation; metrics are intentionally approximate.

### PGBUF-Q035 — How does the pool make progress when ordinary victim search fails?

- **Direct answer — implementation:** the allocator tries invalid/ordinary victims, then queues as a high- or
  low-priority direct-victim waiter, wakes flushing/maintenance, and sleeps with timeout/interruption. Victim flush
  cleans candidates; post-flush or maintenance can assign them directly.
- **Mechanism/consequence:** assignment is revocable: a concurrent fix changes the direct-victim flag, so the awakened
  recipient must atomically take its slot, re-lock/recheck, discard an invalidated candidate, and retry. Without the
  daemon, allocation falls back to synchronous flushing.
- **Evidence:** `src/storage/page_buffer.c:8189-8367`, `src/storage/page_buffer.c:15429-15651`,
  `src/storage/page_buffer.c:9617-9691`.
- **Confidence/limit:** high progress protocol; priority is starvation-mitigated, not strict fairness.

### PGBUF-Q036 — Which daemon owns which progress step, and when is synchronous fallback used?

- **Direct answer — implementation:** maintenance adjusts quotas and backs direct-victim assignment; page-flush
  writes victim candidates; post-flush clears completion state/wakes/assigns; flush-control replenishes file-I/O
  tokens. Tasks are gated until restart/recovery enables flush daemons.
- **Mechanism/consequence:** pool initialization precedes daemon creation; shutdown destroys daemons before pool/log
  teardown. `pgbuf_wakeup_page_flush_daemon` performs victim flushing synchronously when no daemon exists, preserving
  progress in standalone/bootstrap/recovery modes.
- **Evidence:** `src/storage/page_buffer.c:1649-2122`, `src/storage/page_buffer.c:11684-11702`,
  `src/storage/page_buffer.c:16975-17255`, `src/transaction/boot_sr.c:2363-2444`.
- **Confidence/limit:** high lifecycle observation; `pgbuf_finalize` itself does not flush.

## 7. Invalidation, deallocation, and recovery

### PGBUF-Q037 — How do unfix, flush, invalidate, deallocate, and victimization differ?

- **Direct answer — contract:** unfix consumes caller ownership; flush writes a dirty generation but usually preserves
  mapping/ownership; invalidate removes a cached mapping after required flush/rechecks; deallocate changes logical
  allocation/type recoverably; victimization reuses an eligible frame without logically deallocating its disk page.
- **Mechanism/consequence:** `pgbuf_dealloc_page` is the notable consuming operation: it expects the sole WRITE fix and
  internally unfixes after logging, setting `PAGE_UNKNOWN`, dirtying, and requesting LRU-bottom movement.
- **Evidence:** `src/storage/page_buffer.c:3075-3621`, `src/storage/page_buffer.c:8643-8752`,
  `src/storage/page_buffer.c:15182-15237`.
- **Confidence/limit:** high. None of these verbs implies transaction commit.

### PGBUF-Q038 — Why can `pgbuf_invalidate_all()` leave pages resident?

- **Direct answer — implementation:** it does not revoke live users. It skips fixed pages, flushes dirty eligible
  pages, then rechecks VPID/fix/avoidance state under BCB protection before invalidating; races can make a candidate
  ineligible between scan and action.
- **Mechanism/consequence:** higher-level volume reset/remove must quiesce owners and order flush/invalidate before raw
  I/O. The function name means “invalidate all currently safe candidates,” not “forcibly cancel every hold.”
- **Evidence:** `src/storage/page_buffer.c:3383-3559`, `src/transaction/boot_sr.c:500-560`,
  `src/storage/disk_manager.c:721-811`.
- **Confidence/limit:** high; completeness depends on caller-supplied quiescence.

### PGBUF-Q039 — Why is permanent deallocation postponed and not immediately invalidated?

- **Direct answer — contract:** reuse before commit would make abort/recovery unable to restore the old page safely.
  `file_dealloc` records postpone work; run-postpone/compensation later updates allocation tables inside a system
  operation and finally obtains the sole WRITE fix for `pgbuf_dealloc_page`.
- **Mechanism/consequence:** that helper logs old identity/type/TDE, sets `PAGE_UNKNOWN`, clears flags, marks dirty and
  move-to-LRU-bottom, removes holder/latch, but does not null the caller's local variable. Delayed flush/victimization
  avoids synchronous I/O on deallocation.
- **Evidence:** `src/storage/file_manager.c:6131-6312`, `src/storage/file_manager.c:6599-6793`,
  `src/storage/page_buffer.c:15182-15237`.
- **Confidence/limit:** high. Callers must treat the passed pointer as consumed even though C cannot null by value.

### PGBUF-Q040 — How should a caller distinguish “deallocated” from “reused”?

- **Direct answer — contract:** first distinguish unreserved sector/expected `PAGE_UNKNOWN` from a hard error; then
  validate the acquired page's expected subsystem type. A reused VPID with another non-unknown type is not the old
  heap/index page.
- **Mechanism/consequence:** `OLD_PAGE_MAYBE_DEALLOCATED` accepts the race and yields absence for unknown pages;
  `pgbuf_fix_if_not_deallocated` combines disk reservation with that behavior. Vacuum/B-tree callers must recheck type
  and treat expected absence as success, while rejecting incompatible reuse.
- **Evidence:** `src/storage/page_buffer.c:2501-2525`, `src/storage/page_buffer.c:15355-15405`,
  `src/query/vacuum.c:1581-1908`, `src/storage/btree.c:24980-25060`.
- **Confidence/limit:** high caller protocol; reservation and page image are not one atomic snapshot.

### PGBUF-Q041 — Why does redo use `RECOVERY_PAGE`, and how is replay idempotence decided?

- **Direct answer — contract:** parallel redo cannot trust normal allocation validation because allocation metadata may
  itself still be replaying. `RECOVERY_PAGE` therefore accepts new, ordinary, or deallocated page state.
- **Mechanism/consequence:** after fix, the redo record is skipped when page LSA already covers it. Otherwise the
  recovery callback applies the record, the generic wrapper sets page LSA to the record LSA, and scope-exit guarantees
  unfix on all exits.
- **Evidence:** `src/transaction/log_recovery.c:497-536`, `src/transaction/log_recovery.c:6407-6431`,
  `src/transaction/log_recovery_redo.hpp:587-668`.
- **Confidence/limit:** high recovery contract; special logical/deallocation records have their own callbacks.

## 8. Specialized APIs and observability

### PGBUF-Q042 — Why is `pgbuf_simple_fix()` not a cheaper ordinary fix?

- **Direct answer — contract:** it is restricted to read-only temporary files with no competing writer. It increments
  `fcnt` but installs neither page latch nor per-thread holder; `need_fix=false` makes absence/direct-victim state return
  `NULL` instead of loading.
- **Mechanism/consequence:** success must be paired only with `pgbuf_simple_unfix` or
  `pgbuf_dealloc_temp_page(..., true)`. Mixing normal dirty/unfix/latch APIs defeats both content protection and holder
  diagnostics.
- **Evidence:** `src/storage/page_buffer.h:270-273`, `src/storage/page_buffer.c:2700-2838`,
  `src/storage/file_manager.c:4073-4366`.
- **Confidence/limit:** high specialized contract; not a general performance optimization.

### PGBUF-Q043 — Is a scan-copy `PAGE_PTR` a fixed page?

- **Direct answer — contract:** no. It is a handle-owned snapshot frame paired with a dummy BCB. The pointer lasts only
  until the next copy or handle free and carries copied VPID/page bytes, but no hash residency, real latch, holder,
  LRU membership, or fix debt.
- **Mechanism/consequence:** read-only page-format access to copied bytes/identity is meaningful; unfix, dirty, flush,
  mutation, latch-state assumptions, and borrowed live metadata are forbidden. Heap scan retains a separate live
  watcher to protect against deallocation while using the snapshot.
- **Evidence:** `src/storage/page_buffer.h:512-519`, `src/storage/page_buffer.c:910-981`,
  `src/storage/heap_file.c:6439-6465`, `src/storage/heap_file.c:7556-7645`.
- **Confidence/limit:** high; OOM degrades eligible scan cache to ordinary copy mode.

### PGBUF-Q044 — Can callers trust `do_fetch` in the area-copy helpers?

- **Direct answer — suspected defect/interface drift:** no. `pgbuf_copy_to_area`'s note says a miss is buffered when
  `do_fetch == false`, but the normal compiled code fetches when it is `true`; when false, the direct-I/O alternative is
  compiled out, so a miss may return the caller's area without filling it. `pgbuf_copy_from_area`'s comment says
  `do_fetch` controls buffering, but normal code ignores that distinction, fixes `NEW_PAGE`, copies, sets TDE with
  skipped logging, and dirties regardless of a general WAL protocol.
- **Mechanism/consequence:** callers must initialize/check their output and audit the exact build branch. The write
  helper is suitable only for its external-sort style temporary/unlogged contract, not WAL-managed data pages.
- **Evidence:** `src/storage/page_buffer.c:4701-4826`, `src/storage/page_buffer.c:4833-4912`,
  `src/storage/external_sort.c:5920-6005`.
- **Confidence/limit:** high comment/code drift observation; stale-output production impact is not reproduced.

### PGBUF-Q045 — Which metadata helpers mutate recovery state rather than merely inspect it?

- **Direct answer — contract:** getters mostly inspect fixed storage; `pgbuf_get_lsa`/`get_vpid_ptr` are borrowed.
  `pgbuf_set_lsa`, temporary-LSA reset/set, page-type setter, and TDE setter mutate recovery-relevant metadata and
  require the subsystem's WRITE/logging context.
- **Mechanism/consequence:** `set_lsa` initializes oldest-unflushed responsibility and release builds defensively dirty;
  page-type assignment alone does not log a new page; TDE setter logs unless `skip_logging` is valid for the specialized
  caller. Debug/release dirty behavior can expose or mask a caller's missing explicit dirty step differently.
- **Evidence:** `src/storage/page_buffer.c:4959-5203`, `src/storage/page_buffer.c:5210-5537`,
  `src/storage/page_buffer.c:17305-17319`.
- **Confidence/limit:** high current semantics; `skip_logging` is not general permission to omit recovery logging.

### PGBUF-Q046 — What exactly does each page-buffer metric measure?

- **Direct answer — implementation:** SHOW hit/request/create/read/write values are accumulated event counters reported
  as deltas, while SHOW free/clean/dirty/type/victim-candidate values come from an unlocked BCB-table snapshot and are
  approximate gauges. `pgbuf_peek_stats` is another unlocked gauge, and daemon stats are separate loop/wait/run
  measurements. Counter names must be traced to every `PSTAT_PB_*` increment site.
- **Mechanism/consequence:** `Num_data_page_ioreads` records audited page-buffer read attempts, not device-cache misses;
  dirties count dirty-setting transitions/calls according to sites, not unique pages; flushed counters do not cover
  every checkpoint/backup write. In `pgbuf_peek_stats`, the header's `alloc_bcb_waiter_low` position is the definition's
  `flushed_bcbs_waiting_direct_assign`; SHOW's “victim candidate” dirty-zone label also differs from the internal
  clean-victim predicate.
- **Evidence:** `src/storage/page_buffer.h:443-456`, `src/storage/page_buffer.c:14748-14847`,
  `src/storage/page_buffer.c:17259-17530`, `src/base/perf_monitor.c` (`PSTAT_PB_*` increment sites).
- **Confidence/limit:** high source interpretation. **Runtime observed:** sealed runs showed cold/warm ioreads `46 ->
  0`, insert dirties `102114`, and update dirties `300`, but those magnitudes are case-specific. **Runtime candidate:**
  one fresh simple SQL phase with before/after SHOW counters can validate the presentation's labels, not physical I/O.

## 9. Current-revision hazards and failure proof obligations

### PGBUF-Q047 — What remains owned internally after a DWB read error on a cold miss?

- **Direct answer — suspected defect:** the loader has installed its VPID load record, obtained/reset a provisional BCB,
  and still owns BCB/load coordination when `dwb_read_page` error returns directly. The usual path that returns the BCB
  to invalid list, removes the load record, releases the hash mutex, and wakes waiters is bypassed.
- **Mechanism/consequence:** the caller receives no page, but internal provisional identity/lock state may remain and
  later requesters may block. A hardened implementation would funnel through common cleanup after auditing DWB
  callee-side effects.
- **Evidence:** `src/storage/page_buffer.c:7991-8177`, `src/storage/page_buffer.c:8404-8634`, especially
  `src/storage/page_buffer.c:8510-8515`; `src/storage/double_write_buffer.cpp` (`dwb_read_page`).
- **Confidence/limit:** high control-flow proof obligation; no fault injection, reachability proof, or production bug
  claim.

### PGBUF-Q048 — What happens if holder allocation fails after latch/fix grant?

- **Direct answer — suspected defect:** several paths atomically grant/increment latch/`fcnt` before allocating or
  reconstructing a holder. On allocation failure they assert/return without visible rollback: immediate grant,
  compatible reader, blocked wakeup, lock-free hit, and promotion reconstruction.
- **Mechanism/consequence:** `NULL` can mean no caller-usable page while internal `fcnt` remains elevated. Hardening must
  choose compatibility with the “impossible OOM” assumption or explicitly roll back latch/fix/queue state without
  violating wakeup ordering.
- **Evidence:** `src/storage/page_buffer.c:6465-6470`, `src/storage/page_buffer.c:6516-6522`,
  `src/storage/page_buffer.c:6607-6613`, `src/storage/page_buffer.c:7725-7787`,
  `src/storage/page_buffer.c:2849-3059`.
- **Confidence/limit:** high source finding; no holder-pool fault injection or production consequence reproduced.

### PGBUF-Q049 — What proof closes the lock-free READ-hit reuse race?

- **Direct answer — inference/proof obligation:** the intended proof is that BCB/frame storage is permanent until pool
  finalization and a successful CAS from a positive READ `fcnt` to `fcnt+1` overlaps an ownership generation that
  victimization cannot reuse. However, VPID is checked before CAS and not rechecked after it.
- **Mechanism/consequence:** reviewers must prove no sequence can observe old matching VPID, allow last owner/victim
  reuse, then succeed against an ABA-equivalent atomic latch word. A stress/fault harness should force identity churn
  between pre-CAS check and CAS and assert returned VPID; failure falsifies the proof.
- **Evidence:** `src/storage/page_buffer.c:7725-7787`, `src/storage/page_buffer.c:9266-9312`,
  `src/storage/page_buffer.c:8643-8686`.
- **Confidence/limit:** medium: missing post-CAS recheck is source-confirmed, but neither safety nor a race bug is proved.

### PGBUF-Q050 — Is `pgbuf_fix_without_validation()` an available Interface?

- **Direct answer — interface drift:** only `NDEBUG` exposes the macro mapping to
  `pgbuf_fix_without_validation_release` and declares that function. Repository-wide search finds no definition and no
  call site; debug builds do not expose the same macro.
- **Mechanism/consequence:** a new release caller may compile but fail at link, while debug compilation fails earlier.
  Documentation should mark it unavailable/dead until implementation or declaration is fixed, not advertise it as an
  optimization.
- **Evidence:** `src/storage/page_buffer.h:286-356`, especially `src/storage/page_buffer.h:320-326`; negative
  repository-wide searches for both symbols at the pinned revision.
- **Confidence/limit:** high repository fact. **Runtime/build candidate:** a minimal release compile/link probe would
  demonstrate the link failure; it would not exercise the server.

### PGBUF-Q051 — Is the deallocation-undo diagnostic reading initialized identity?

- **Direct answer — suspected defect:** `pgbuf_rv_dealloc_undo_compensate` declares local `VPID vpid` and uses it in an
  `NDEBUG`-excluded TDE diagnostic without a visible initialization on that path. The neighboring undo function
  reconstructs and initializes its VPID before use.
- **Mechanism/consequence:** the anomaly appears confined to debug diagnostic identity, so it may print undefined or
  misleading VPID data. Recovery-state corruption cannot be inferred without showing that the value affects restored
  page/type/TDE state outside logging.
- **Evidence:** `src/storage/page_buffer.c:15314-15348`, contrasted with
  `src/storage/page_buffer.c:15264-15312`.
- **Confidence/limit:** high uninitialized diagnostic observation; low evidence for any wider recovery defect.

## 10. Cross-database analogies

### PGBUF-Q052 — What is the nearest ownership analogue in PostgreSQL and InnoDB?

- **Direct answer — partial analogy:** CUBRID `pgbuf_fix` bundles identity acquisition, replacement fix, content latch,
  and holder debt. PostgreSQL splits shared-buffer pin/resource-owner tracking from content lock and releases with
  combinations such as unlock plus release. InnoDB uses buffer fix plus S/X/SX latch, commonly recorded and released
  through an MTR memo.
- **Mechanism/consequence:** all prevent replacement while owned and protect contents separately in concept, but a
  literal function-name mapping loses who tracks nested ownership, when logging is coupled, and whether lock and pin
  lifetimes coincide.
- **Evidence:** CUBRID `src/storage/page_buffer.c:2256-2679`, `src/storage/page_buffer.c:6008-6883`; PostgreSQL
  `src/backend/storage/buffer/bufmgr.c:3269-3386`, `:5620-5682`, `:6061-6107`; MySQL
  `storage/innobase/buf/buf0buf.cc:3696-3745`, `:4295-4443`,
  `storage/innobase/mtr/mtr0mtr.cc:243-296`.
- **Confidence/limit:** high conceptual comparison; **classification: partial analogy, not equivalent**.

### PGBUF-Q053 — When is an in-progress miss published to other threads?

- **Direct answer — partial analogy:** CUBRID keeps a separate VPID load record and publishes the hash BCB only after
  bytes, identity, latch, and holder are ready; waiters sleep on the load record then retry. PostgreSQL inserts a
  pinned tag with invalid/I/O-in-progress content before completion, so others can find and wait on that descriptor.
  InnoDB likewise initializes a page/block hash object with read I/O-fix before completion, then completes I/O state.
- **Mechanism/consequence:** all converge duplicate misses on one identity, but their waiter-visible object and failure
  cleanup differ; only the goal is equivalent.
- **Evidence:** CUBRID `src/storage/page_buffer.c:7991-8177`, `:8404-8634`; PostgreSQL
  `src/backend/storage/buffer/bufmgr.c:2177-2351`, `:7289-7445`; MySQL
  `storage/innobase/buf/buf0buf.cc:4876-5079`, `:5731-5998`.
- **Confidence/limit:** high pinned-source comparison; **classification: partial analogy**.

### PGBUF-Q054 — Which replacement-policy analogy is useful without becoming false equivalence?

- **Direct answer — partial analogy:** all three estimate reuse value while excluding owned/in-flight frames. CUBRID
  uses private/shared LRUs with three zones plus AOUT ghost history; PostgreSQL uses clock sweep/usage count and
  optional strategy rings; InnoDB uses midpoint-style young/old LRU behavior and separate flush/ownership state.
- **Mechanism/consequence:** they share the responsibility “choose a safe low-value victim,” but hotness history,
  admission, ownership, candidate queues, and tuning knobs differ. Workload behavior cannot be transferred by naming
  all three “LRU.”
- **Evidence:** CUBRID `src/storage/page_buffer.c:8994-10720`, `:13949-14635`; PostgreSQL
  `src/backend/storage/buffer/freelist.c:169-321`, `src/backend/storage/buffer/bufmgr.c:2548-2681`; MySQL
  `storage/innobase/buf/buf0buf.cc:4148-4180`, `:4512-4610`.
- **Confidence/limit:** high responsibility-level comparison; **classification: partial analogy, no algorithmic
  equivalence**.

### PGBUF-Q055 — How do WAL ordering, dirty generations, checkpointing, and torn-page defense differ across engines?

- **Direct answer — partial analogy:** all link dirty pages to log positions and force redo/WAL before data-page write.
  CUBRID uses page LSA plus `oldest_unflush_lsa`, generation-separated FLUSHING, checkpoint LSA selection, and DWB.
  PostgreSQL flushes through page LSN and completes checkpoint durability with filesystem sync; full-page images repair
  torn-page risk through WAL. InnoDB tracks oldest/newest modification LSN on flush lists, persists redo before page
  flush, and uses doublewrite.
- **Mechanism/consequence:** CUBRID DWB and InnoDB doublewrite are physical intermediate-copy analogues; PostgreSQL FPI
  is a WAL reconstruction mechanism. Checkpoint completion and dirty-generation retirement occur at different
  boundaries, so none is a drop-in equivalent.
- **Evidence:** CUBRID `src/storage/page_buffer.c:10733-10961`, `:4185-4678`,
  `src/transaction/log_page_buffer.c:6901-7406`; PostgreSQL
  `src/backend/storage/buffer/bufmgr.c:4509-4642` and `BufferSync` callers; MySQL
  `storage/innobase/buf/buf0flu.cc:943-1167`, `storage/innobase/buf/buf0dblwr.cc:2525-2660`,
  `storage/innobase/mtr/mtr0mtr.cc:779-800`, `storage/innobase/include/buf0flu.ic:54-115`.
- **Confidence/limit:** high mechanism comparison; **classification: partial analogy**. No cross-engine runtime test or
  performance ranking was performed.

## Runtime-evidence decisions

Only three questions merit a minimal local confirmation beyond source reading:

1. **Q008:** an instrumented unit-level nested-fix probe could show global versus per-thread debt. This needs a narrow
   test hook; simple SQL would not identify the exact holder.
2. **Q046:** simple SQL with before/after SHOW/performance counters can validate which presentation labels move, while
   retaining the warning that counters do not prove device I/O.
3. **Q050:** a tiny `NDEBUG` compile/link probe can confirm the missing-definition consequence. This is a build
   property, not runtime server behavior.

No new runtime experiment is recommended for Q015/Q017/Q019-Q024/Q027/Q031/Q047-Q049/Q051: a short successful run
would not prove fairness, race exclusion, error rollback, or recovery safety. Those require purpose-built scheduling or
fault injection and must remain source proof obligations until such a harness exists.

## Historical runtime observations reused with limits

- **Runtime observed, Q013/Q046 context:** sealed run `PRIOR/evidence/runs/exp1-observation-r2/` returned identical
  checksums while
  `Num_data_page_ioreads` changed `46 -> 0`. This supports that run's cold-then-resident signature, not a physical disk
  miss or a universal warm result.
- **Runtime observed, Q016/Q025/Q046 context:** `PRIOR/evidence/runs/exp2-observation-r1/` recorded promotion success
  `69589`, failure `0`,
  and dirties `102114`; it does not show one promotion per row or contention semantics.
- **Runtime observed, Q025/Q046 context:** `PRIOR/evidence/runs/exp3-observation-r1/` produced covered/non-covered
  `100/0` and `0/100` signatures;
  a 100-row update produced dirties `300`. These are caller-family observations, not exact stack proofs.
- **Runtime observed, Q027-Q030 context:** `PRIOR/evidence/runs/exp4-observation-r1/` verified a 10,000-row update's
  generation values; `PRIOR/evidence/runs/exp4-backup-2/` captured the subsequent successful `backupdb -C -r`
  boundary. It did not expose individual WAL-before-data, DWB, re-dirty, checkpoint, or physical-write ordering.

## Self-audit

- IDs answered: 55/55 (`PGBUF-Q001` through `PGBUF-Q055`), each exactly once.
- Every answer contains a direct answer, mechanism/caller consequence, exact pinned source locations, and a confidence
  or limitation statement.
- Current-revision hazards Q031/Q044/Q047-Q051 are not described as reproduced production bugs.
- Cross-engine Q052-Q055 are classified as partial analogies; no interface or algorithm equivalence is claimed.
- Runtime evidence is explicitly historical and bounded; only Q008, Q046, and Q050 are nominated for minimal new
  confirmation.
