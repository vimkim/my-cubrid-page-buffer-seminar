# Evidence reuse packet

## Role and scope

This packet identifies evidence that can be reused from the existing page-buffer Report Run without rerunning CUBRID or changing any service. The target scope is the expanded Markdown presentation in `analysis/research/scope.md` (SHA-256 `4f293bcd057ed228569b432963b5d9690031de008c6d9b9a4e8dfab32bde6bf6`). The prior artifact is:

```text
/home/vimkim/gh/my-cubrid-docs/code-analysis/
  page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/
  f799e05_codex/
```

In the references below, `PRIOR/` means that directory.

## Reuse decision

The prior source claims and captured runtime observations are reusable as evidence for the mechanisms they actually cover. They are not a substitute for tracing the newly requested public-interface inventory.

- CUBRID is still at `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.
- PostgreSQL is still at the pinned `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`.
- MySQL is still at the pinned `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8`.
- Every CUBRID file cited by the old claim ledger still has the recorded COMMIT hash. In particular, `src/storage/page_buffer.c` still hashes to `d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163`.
- The prior artifact contains 30 claims: 12 CUBRID claims, 4 PostgreSQL claims, 4 MySQL/InnoDB claims, and 10 comparison claims. The authoritative reuse source is `PRIOR/evidence/claims.jsonl`, whose sealed SHA-256 is `30ec3a1349d7756de95a05565d40293dee5eede180f2681ae9c4b01654b390dc`.
- The runtime observations are historical observations of the sealed debug build identified by `PRIOR/evidence/runtime-tools-baseline.json`, build run `runtime-baseline-build-2`, not observations of a newly rebuilt binary.

## Report and audit status

| Item | Evidence | Meaning for reuse |
|---|---|---|
| Prior report state | `PRIOR/report.json`: `REPORT_READY` | The report phase completed; the Live Grill did not. |
| Report audit | `PRIOR/evidence/report-audit.md` and `.json`: round 4, `APPROVED`, 2026-08-28 08:56:37 UTC, 189 reviewed files | The sealed old materials were independently reviewed for the old declared scope. |
| Grill | `PRIOR/grill/mastery.json`: `WAIT_FOR_USER`; all concepts and capstone `NOT_STARTED` | The artifact is not `COMPLETE` and has no complete-phase audit. Do not describe it as a completed mastery run. |
| Instrumentation | `PRIOR/report.json`: `instrumentation.status="not-used"` | Runtime evidence came from unmodified CUBRID counters, SQL-visible results, and utilities. |
| Current verification | `reportctl.py verify --phase report` currently exits 31 with `Repository identity drift: cubrid` | The seal remains useful for the immutable old files, but the old Report Run no longer verifies against the current worktree fingerprint. The cause observed here is status/provenance drift while HEAD and cited source hashes remain unchanged, not a change to the cited implementation bytes. |
| Scope identity | Old frozen scope SHA-256 `796828eab6754ed60bd88d65be34913c7d510e61b61d9a06e73f5340faae2d08`; new scope SHA-256 `4f293bcd...de6bf6` | Approval and `READY WITHIN DECLARED SCOPE` do not transfer to the new Markdown. |

The old scope was centered on `pgbuf_fix()` through `pgbuf_unfix()`, four central behavior classes, and representative heap/B-tree/recovery callers. The new scope asks for practical coverage of most interfaces exported by `page_buffer.h`. Therefore the old audit does **not** establish completeness for metadata/type/LSA/TDE helpers, copy helpers, invalidation/deallocation hooks, scan hooks and the opaque scan-copy buffer, diagnostics/validation, or the full maintenance interface. Those families need their own source-checked contract entries.

## Reusable CUBRID source claims

The following claims may be imported with their existing claim ID, exact wording or a faithful paraphrase, source references, confidence, and limitation. If the new document renumbers claims, retain a provenance backlink to the old ID.

| Claim | Safely reusable mechanism | Exact primary references | Required limitation |
|---|---|---|---|
| `CUBRID-C001` | `pgbuf_fix` hit/miss, VPID-keyed miss serialization, frame/BCB acquisition, DWB-or-volume read, latch acquisition, publication, and waiter retry | `src/storage/page_buffer.c:2260-2685`, `pgbuf_fix_release`; `:8392-8634`, `pgbuf_claim_bcb_for_fix`; full record in `PRIOR/evidence/claims.jsonl` | Representative OLD/NEW flow only; do not generalize to every fetch mode, public wrapper, or I/O cost. |
| `CUBRID-C002` | Atomic latch mode/waiter/fix-count state, per-thread holder nesting, conditional rejection, bounded unconditional wait, and last-unfix transition/wakeup | `src/storage/page_buffer.c:6277-6634`, `pgbuf_latch_bcb_upon_fix`; `:6636-6883`, `pgbuf_unlatch_bcb_upon_unfix` | Does not prove strict FIFO fairness, starvation freedom, or deadlock freedom for every interleaving. |
| `CUBRID-C003` | Representative caller contracts: heap ordered watcher/refetch validation, B-tree parent-child latch coupling/restart, and recovery fix plus page-LSA idempotence gate | `src/storage/heap_file.c:25543-25625`, `heap_prepare_object_page`; `src/storage/btree.c:23734-24089`, `btree_search_key_and_apply_functions`; `src/transaction/log_recovery.c:6399-6431`, `log_rv_redo_fix_page` | Representative caller families only. It is explicitly not an exhaustive call-site or all-exit cleanup audit. |
| `CUBRID-C004` | Flush snapshot/`FLUSHING` generation split, concurrent re-dirty preservation, WAL gate, DWB/direct write seam, ordinary I/O rollback, and ordinary victim eligibility | `src/storage/page_buffer.c:10723-10962`, `pgbuf_bcb_flush_with_wal`; `src/transaction/log_page_buffer.c:4150-4189`, `logpb_flush_log_for_wal`; `src/storage/page_buffer.c:9314-9538`, `pgbuf_get_victim_from_lru_list` | Excludes TDE/DWB early-error candidates and an exhaustive crash-interleaving proof. |
| `CUBRID-C009` | Initialization/finalization and restart/shutdown order across BCB/frame/hash/locks/LRU/holders/flush structures, DWB recovery, daemons, log recovery, and `log_final` | `src/storage/page_buffer.c:1640-1917`, `pgbuf_initialize`; `:1920-2114`, `pgbuf_finalize`; `src/transaction/boot_sr.c:1958-2430`, `boot_restart_server`; `:3044-3113`, `xboot_shutdown_server`; `src/transaction/log_manager.c:1730-1855`, `log_final` | Does not enumerate every partial-allocation branch or every fast-shutdown mode. |
| `CUBRID-C010` | Current-revision exceptional error paths: DWB read can return before common miss cleanup; TDE/DWB-slot setup can return before common flush rollback; async unfix flush errors are cleared rather than returned to the void unfix caller | `src/storage/page_buffer.c:8392-8565`, `pgbuf_claim_bcb_for_fix`; `:10723-10930`, `pgbuf_bcb_flush_with_wal`; `:6636-6883`, `pgbuf_unlatch_bcb_upon_unfix` | Source control flow is confirmed, but fault reachability and storage consequences were not runtime-tested. Present as current behavior/review candidates, not automatically as confirmed defects. |
| `CUBRID-C011` | Lock-free READ hit checks mode, waiter state, positive `fcnt`, and VPID before the CAS increment, but does not repeat the VPID check after successful CAS | `src/storage/page_buffer.c:7724-7787`, `pgbuf_lockfree_fix_ro` | This is not a proof of ABA freedom. A conceptual reimplementation may conservatively choose the normal locked path because timing/performance parity is excluded. |
| `CUBRID-C012` | In `SERVER_MODE`, holder allocation failure after lock-free READ `fcnt` increment asserts and returns NULL without backing out the increment | `src/storage/page_buffer.c:7724-7773`, `pgbuf_lockfree_fix_ro` | Fault reachability/pool exhaustion was not injected. Distinguish strict compatibility from a hardened implementation that rolls `fcnt` back. |

`CUBRID-C005` through `CUBRID-C008` are source-plus-runtime claims and are summarized in the experiment section rather than treated as broader source contracts.

## Reusable runtime observations

All four accepted mandatory observation runs directly executed the captured `csql` binary with a hashed SQL input, returned actual exit 0, matched the expected exit, and were linked to the runtime snapshot. Reuse them as **captured case studies**, not as fresh execution results.

### 1. Cold miss versus warm reuse (`CUBRID-C005`)

- Artifact chain: `PRIOR/experiments/experiment-1/{manifest.json,experiment.md,expected-oracle.md,experiment.sql}`; run `PRIOR/evidence/runs/exp1-observation-r2/{meta.json,stdout.txt,stderr.txt}`.
- Observation: both scans returned `COUNT=10000`, `SUM(id)=50005000`, and payload-length sum `8000000`; `Num_data_page_ioreads` changed from `46` to `0`. The first phase showed heap OLD-page fixes, while the immediate repeat showed resident `OLD_PAGE_IN_PB` fixes.
- Safe interpretation: the captured workload exercised a cold page-buffer read signature followed by resident reuse, consistent with `CUBRID-C001`.
- Do not claim: an OS device miss, exact VPID/frame identity, whether DWB or the main volume supplied a page, a concurrent duplicate-loader schedule, or that every second scan must have zero reads.

### 2. Holder/latch/dirty activity (`CUBRID-C006`)

- Artifact chain: `PRIOR/experiments/experiment-2/{manifest.json,experiment.md,expected-oracle.md,experiment.sql}`; run `PRIOR/evidence/runs/exp2-observation-r1/`.
- Observation: the empty read phase had promotion success/failure `0/0`; a 10,000-row insert produced promotion success `69589`, failure `0`, `Num_data_page_dirties=102114`, and positive `HOLDER_DIRTY` WRITE/MIXED unfix categories.
- Safe interpretation: read-only and mutating single-session phases produce distinct page-buffer activity signatures tied to the audited counter increment sites.
- Do not claim: one promotion per row, a particular BCB's holder chain, real competing-reader/writer wait/wakeup, timeout behavior, or waiter fairness.

### 3. Covered versus non-covered caller signatures (`CUBRID-C007`)

- Artifact chain: `PRIOR/experiments/experiment-3/{manifest.json,experiment.md,expected-oracle.md,experiment.sql}`; run `PRIOR/evidence/runs/exp3-observation-r1/`.
- Observation: the same 100-key range produced covered/non-covered counters `100/0` for the covered projection and `0/100` for the payload projection. The update affected 100 rows, produced generation sum 100, `Num_data_page_dirties=300`, and heap `HOLDER_DIRTY,WRITE` activity.
- Safe interpretation: the captured query shapes distinguish index-covered, index-to-heap, and mutating caller-family activity.
- Do not claim: an exact C stack, every caller's cleanup, the ordered-refix interleaving, or execution of the recovery fetch path.

### 4. Dirty generation and backup boundary (`CUBRID-C008`)

- Artifact chain: `PRIOR/experiments/experiment-4/{manifest.json,experiment.md,expected-oracle.md,experiment.sql}`; SQL run `PRIOR/evidence/runs/exp4-observation-r1/`; successful utility run `PRIOR/evidence/runs/exp4-backup-2/`.
- Observation: the update affected 10,000 rows, left `min(generation)=max(generation)=1`, had zero payload-length violations, and produced `Num_data_page_dirties=51774`. The second backup attempt completed with actual exit 0.
- Preserve the failed-attempt history: `exp4-backup` failed because its target directory did not exist; only `exp4-backup-2` is the successful boundary.
- Safe interpretation: the captured workload mutated and committed the expected data and reached a successful synchronous `backupdb -C -r` operational boundary.
- Do not claim: runtime proof of per-page WAL-before-data ordering, DWB completion, physical victimization, crash recovery, or physical data-page writes. The per-session log counters and post-hoc I/O counters were zero; those mechanisms remain source-only here.

The common cleanup evidence is `PRIOR/evidence/runs/runtime-cleanup-4/`. Quiz runner safety was separately checked in `PRIOR/evidence/runs/quiz-safe-runner-selfcheck-r1/`. These prove the captured old run's cleanup procedure, not the safety of a newly copied or modified runner.

## Reusable PostgreSQL and InnoDB evidence

The four per-database source claims can be reused at their pinned revisions. They should remain compact guardrails against false analogy, not expand the new presentation into full comparator reconstructions.

| Axis | PostgreSQL evidence | InnoDB evidence | Reusable conclusion |
|---|---|---|---|
| Lookup/miss publication | `PG-C001`: `src/backend/storage/buffer/bufmgr.c:2177-2351` `BufferAlloc`; `:7289-7387` `StartBufferIO`; `:7389-7445` `TerminateBufferIO` | `MYSQL-C001`: `storage/innobase/buf/buf0buf.cc:4876-5079` `buf_page_init_for_read`; `:4294-4443` `Buf_fetch<T>::single_page`; `:5731-5998` `buf_page_io_complete` | `CMP-C001`, partial analogy: all converge concurrent misses on one resident identity, but CUBRID publishes after latch/load while PostgreSQL and InnoDB expose an I/O-in-progress mapping before completion. |
| Ownership and content protection | `PG-C002`: `bufmgr.c:3269-3386` `PinBuffer`; `:5620-5682` `UnlockReleaseBuffer`; `:6061-6107` `BufferLockConditional` | `MYSQL-C002`: `buf0buf.cc:3696-3745`, `:4295-4443`, `:4148-4180`, `:4512-4610`; `mtr0mtr.cc:243-296` `memo_slot_release` | `CMP-C002`/`CMP-C005`, partial analogy: CUBRID couples holder/fix/latch in the fix interface, PostgreSQL separates pin and content lock, and InnoDB couples fix/latch lifetime to the MTR memo. Do not translate one API name directly into another. |
| Index-to-row handoff | `PG-C003`: `src/backend/access/nbtree/nbtsearch.c:80-210` `_bt_search`; `src/backend/access/heap/heapam_indexscan.c:231-298` `heapam_index_fetch_tuple`; mutation example `heapam.c:2068-2105` `heap_insert` | `MYSQL-C003`: `storage/innobase/btr/btr0cur.cc:618-1173` `btr_cur_search_to_nth_level`; `storage/innobase/dict/dict0dict.cc:3024-3205` `dict_index_build_internal_clust` | `CMP-C003`, no equivalent for a universal B-tree-to-separate-heap handoff: CUBRID/PostgreSQL follow a locator to heap storage, whereas an InnoDB clustered leaf is the row store. A secondary-to-clustered lookup is only a partial analogy. |
| WAL/redo and flush | `PG-C004`: `bufmgr.c:4509-4642` `FlushBuffer`; `freelist.c:169-321` `StrategyGetBuffer`; `bufmgr.c:2548-2681` `GetVictimBuffer` | `MYSQL-C004`: `buf0flu.cc:943-1167`; `buf0dblwr.cc:2525-2660`; `mtr0mtr.cc:779-800`; `include/buf0flu.ic:54-115` | `CMP-C004`, partial analogy: all enforce WAL/redo-before-data and protect pinned/fixed pages from ordinary replacement, but dirty-generation metadata, policy, DWB/TDE/FPI, and durability completion boundaries differ. |

Additional comparison rows are reusable from `CMP-C006` through `CMP-C010` in `PRIOR/evidence/claims.jsonl` and `PRIOR/chapters/09-comparison.html`:

- `CMP-C006`: torn-page defense is only a partial analogy—CUBRID DWB, PostgreSQL WAL full-page images, and InnoDB doublewrite are not the same mechanism.
- `CMP-C007`: ordinary victim eligibility shares the fixed/pinned exclusion, but CUBRID LRU zones, PostgreSQL clock sweep, and InnoDB midpoint LRU are different policies.
- `CMP-C008`: dirty state is linked to a log position in all three, but CUBRID DIRTY/oldest-unflush-LSA, PostgreSQL `BM_DIRTY`/page LSN, and InnoDB oldest/newest modification LSN plus flush list have different generation boundaries.
- `CMP-C009`: checkpoint/page-cleaner selection is log-position-aware, but CUBRID LSA sorting, PostgreSQL `BufferSync`, and InnoDB flush-list LSN limits have different completion semantics.
- `CMP-C010`: volatile buffer metadata is rebuilt and durable log/redo is applied at startup, but boot and recovery sequencing are only partial analogies.

Do not reuse any comparison as a performance ranking, timing guarantee, runtime observation of PostgreSQL/MySQL, or claim of interface equivalence.

## Warnings that should survive into the new Markdown

1. **Fix, latch, transaction lock, dirty, flush, commit, and eviction are different responsibilities.** In particular, `pgbuf_unfix()` is not commit, flush, or eviction.
2. **Keep orthogonal state machines separate.** Residency/identity, latch/fix ownership, dirty/flush generation, and LRU eligibility interact but do not form one scalar state.
3. **A counter name is not its semantics.** `Num_data_page_dirties` counts dirty-setting calls, not unique pages. `Num_data_page_ioreads` counts page-buffer read attempts at audited increment sites, not physical device cache misses. `Num_data_page_flushed` covers victim-candidate flushes, not every checkpoint/backup flush. The increment-site audit is in `PRIOR/research/packets/experiments-and-quizzes.md`, section 3.
4. **The runtime runs did not observe contention, victim eviction, or individual WAL/DWB ordering.** Keep those mechanisms `SOURCE-CONFIRMED`, not `SOURCE+RUNTIME-CONFIRMED`.
5. **Fairness and deadlock claims must remain bounded.** A latch timeout is a termination cap, not a deadlock-freedom proof; the old report explicitly does not promise strict FIFO fairness.
6. **Failure cleanup has revision-specific exceptions.** Preserve `CUBRID-C010` and `CUBRID-C012` whenever presenting a general “NULL means no caller-owned page” contract: caller ownership may be absent while internal provisional state or `fcnt` is not fully restored.
7. **The lock-free path carries an unproved safety obligation.** `CUBRID-C011` records the missing post-CAS VPID recheck; do not upgrade the surrounding rationale to a proved ABA guarantee.
8. **Dirty does not mean durable.** Page LSA, WAL force, DWB/direct write, and checkpoint/restart are separate boundaries. A successful commit or backup alone does not expose their individual physical order.
9. **An ordered refix can stale page-local pointers and slots.** The watcher and `page_was_unfixed` contract must lead to caller revalidation, not merely pointer reuse.
10. **Compatibility remains bounded.** The old report excludes ABI/byte layout, on-disk compatibility, exact scheduling/timing, every crash race, performance parity, and every transitive caller. The expanded interface document should repeat these exclusions.

## Scope-mismatched or stale material

Use the following only as leads that require new source verification:

- Any statement that the old report covers “most public APIs.” Its four central behaviors cover the deep fix/unfix lifecycle, not a header-wide contract matrix.
- Generic postconditions copied from `PRIOR/chapters/11-contract-evidence.html` without retaining the `CUBRID-C010`/`CUBRID-C012` exceptions.
- A public-interface use condition inferred from one representative heap, B-tree, or recovery caller. `CUBRID-C003` expressly excludes an exhaustive caller and cleanup audit.
- Runtime claims attached to newly covered interfaces such as metadata/type/LSA/TDE accessors, copy helpers, invalidation/deallocation, scan-copy APIs, diagnostics, validation, or specialized maintenance. The old experiments do not isolate those calls.
- Any use of old report readiness or audit approval as approval of the new Markdown. The scope hashes differ, and the current old-report verifier reports CUBRID provenance drift.
- Any exact counter magnitude as a stable performance property. Each accepted experiment had one repetition, and the claims intentionally use invariant/direction plus exact data checks rather than performance generalization.
- Any assertion that `exp4-backup` succeeded. The accepted successful run is `exp4-backup-2`.

## Suggested demonstration and quiz cards

These cards can be embedded in the new Markdown now using the captured artifacts; none requires starting or mutating a service during authoring.

### Card 1 — Classify a cold/warm transcript

- **Prompt:** Give the two checksum rows and the `46 -> 0` ioread excerpts from `exp1-observation-r2`. Ask the learner to label observation, source-backed interpretation, and unsupported inference.
- **Expected reasoning:** Same data result plus lower page-buffer read attempts supports miss-then-resident-reuse for this run. It does not establish physical disk latency, exact VPID identity, or a universal zero-read second scan.
- **Evidence:** `CUBRID-C001`, `CUBRID-C005`, `PRIOR/quiz/quiz-1/`.

### Card 2 — Balance ownership across branches

- **Prompt:** Provide four branches—successful normal fix, nested holder fix, conditional latch failure, and ordered watcher refix. Ask for `before -> guard -> acquired ownership -> required cleanup -> stale-data revalidation`.
- **Expected reasoning:** Only successful ownership is unfixed; nested holder and global `fcnt` are distinct; conditional failure has no caller PAGE_PTR to release; ordered temporary unfix invalidates page-local assumptions.
- **Evidence:** `CUBRID-C002`, `CUBRID-C003`, `PRIOR/quiz/quiz-2/` and `quiz-3/`.

### Card 3 — Read a caller signature without overclaiming

- **Prompt:** Show covered `100/0`, non-covered `0/100`, and update dirty `300` excerpts from `exp3-observation-r1`. Ask which caller-family transition each supports and what requires source tracing.
- **Expected reasoning:** Covered projection can stay in the index result path; payload projection crosses to heap lookup; mutation dirties heap pages. Exact call stacks, all-exit unfix balance, and recovery behavior remain source evidence.
- **Evidence:** `CUBRID-C003`, `CUBRID-C007`, `PRIOR/quiz/quiz-3/`.

### Card 4 — Re-dirty during flush state puzzle

- **Prompt:** Start with a dirty, unfixed BCB. Have the learner order snapshot, `FLUSHING`, old-DIRTY clear, WAL force, DWB/direct write, concurrent writer re-dirty, and completion. Ask whether successful old-image write permits the resident BCB to remain dirty.
- **Expected reasoning:** Yes. The flush writes a stable generation while a concurrent mutation creates a newer dirty generation; completion clears `FLUSHING` but must not erase the new DIRTY state.
- **Evidence:** `CUBRID-C004`, `PRIOR/quiz/quiz-4/`. Explicitly state that experiment 4 did not observe this interleaving.

### Card 5 — Choose the nearest analogy, then reject equivalence

- **Prompt:** Map CUBRID holder/fix/latch, miss publication, B-tree-to-row handoff, replacement, and torn-page defense to PostgreSQL and InnoDB. Require one `partial analogy` or `no equivalent` label and one semantic mismatch per row.
- **Expected reasoning:** PostgreSQL separates pin/content lock, InnoDB binds fix/latch to MTR memo; publication timing differs; InnoDB clustered leaves eliminate the universal separate-heap handoff; replacement and torn-page mechanisms differ despite shared responsibilities.
- **Evidence:** `CMP-C001` through `CMP-C007`, `PRIOR/chapters/09-comparison.html`, `PRIOR/quiz/quiz-4/` question 5.

## Recommended integration rule

Reuse old material in three visibly distinct forms:

1. **Pinned source fact:** cite the existing claim ID plus exact source symbol/range.
2. **Historical runtime observation:** cite the run ID, sealed build identity, exact observed values, and limitations.
3. **New interface analysis:** assign new evidence IDs after tracing complete functions and representative callers for that interface family.

This preserves the value of the approved old report while preventing its narrow readiness declaration from being stretched over the expanded public-API scope.
