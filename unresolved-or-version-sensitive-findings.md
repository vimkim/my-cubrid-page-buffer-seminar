# Unresolved or version-sensitive findings

> Purpose: keep teaching claims honest. This is not a defect ticket list.
>
> Primary teaching baseline: CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.
> Older findings from `5cd4f860e` and `e6ed61e` are historical until rechecked.

## Confidence labels

| Label | Meaning |
|---|---|
| **Verified at f799e05** | Directly visible in the pinned source or its captured, same-revision evidence |
| **Candidate** | Source control flow exposes a cleanup or proof obligation, but reachability and production impact were not demonstrated |
| **Inference** | A plausible explanation of the implementation, not a stable public contract |
| **Historical** | Established at another revision or in an older experiment; useful for teaching, not current proof |
| **Open** | The available corpus does not settle the question |

## A. Current pinned-revision interface hazards

| ID | Status | Finding | Evidence and teaching treatment |
|---|---|---|---|
| `VS-01` | **Verified at f799e05** | Release builds declare/macro-map `pgbuf_fix_without_validation_release`, but repository-wide analysis found no definition or caller. Calling it would create a link failure. | `src/storage/page_buffer.h:320-326`; [`api-inventory.md`](../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md). Teach it as a dead/incomplete interface, never as an optimization option. |
| `VS-02` | **Verified at f799e05** | `pgbuf_copy_to_area()` prose and executable `do_fetch` branch disagree. On a normally compiled miss with `do_fetch=false`, the function may return the caller area without filling it. | `src/storage/page_buffer.c:4701-4817`, especially `4739-4760`; [`api-inventory.md`](../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md). Do not present this helper as a general page-read abstraction. |
| `VS-03` | **Verified at f799e05** | Outside `ENABLE_UNUSED_FUNCTION`, `pgbuf_copy_from_area()` effectively ignores `do_fetch` and always follows the `NEW_PAGE` fix/skip-logging path. | `src/storage/page_buffer.c:4819-4912`; [`api-inventory.md`](../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md). Restrict the helper to its existing owner protocol. |
| `VS-04` | **Verified at f799e05** | Names in the `pgbuf_peek_stats()` declaration drift from the meanings used by the definition for later output positions. Types remain compatible. | `src/storage/page_buffer.h:449-454`; `src/storage/page_buffer.c:14748-14847`. Do not label dashboards from parameter names alone. |
| `VS-05` | **Verified at f799e05** | Some waiter, prevent-deallocation, SHOW, and statistics interfaces deliberately expose approximate snapshots, sometimes without the BCB mutex. | `src/storage/page_buffer.c:14748-14847,17323-17530`; [`internal-mechanisms.md`](../../pgbuf-analysis/f799e05_claude/analysis/research/internal-mechanisms.md). Use them for diagnostics and scheduling, not as mutation/deallocation authorization. |
| `VS-06` | **Verified at f799e05** | Historical comments call some validation/page-type/temporary-LSA behavior debug-only even though executable release paths also use it. | [`api-inventory.md`](../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md). Follow code behavior; avoid repeating stale scope language. |

## B. Current pinned-revision cleanup and proof obligations

These are source-visible candidates, not observed production failures.

| ID | Status | Source-visible condition | Why it matters | Evidence needed to promote the claim |
|---|---|---|---|---|
| `VS-10` | **Candidate** | A DWB read error can return from the cold-miss load path before the ordinary provisional-BCB cleanup. | A miss loader owns internal state even though the caller receives no page. | Fault injection at `dwb_read_page()`, plus an audit of callee side effects and the invalid/hash/load-lock state after return. `src/storage/page_buffer.c:8510-8515`. |
| `VS-11` | **Candidate** | Holder allocation may fail after an atomic latch/fix grant; several call sites show no visible local rollback. | The caller may receive `NULL` while an internal `fcnt` or latch grant remains. | Force holder extension allocation failure on normal hit, lock-free hit, and awakened waiter paths; inspect holder list, latch tuple, and `fcnt`. |
| `VS-12` | **Candidate** | TDE encryption and DWB-slot reservation errors return before the ordinary FLUSHING/DIRTY/oldest-LSA rollback. | A BCB could retain a flushing state or lose retryable dirty-generation bookkeeping. | Reachable fault injection for both callees, followed by waiter wakeup, dirty/LSA, victim eligibility, and restart checks. `src/storage/page_buffer.c:10809-10828`. |
| `VS-13` | **Verified behavior; impact open** | Deferred flush failure triggered during `pgbuf_unfix()` is cleared because `pgbuf_unfix()` has no error return. | A normal caller cannot synchronously observe that asynchronous flush request failure. | Decide whether the owner protocol deliberately relies on monitoring/retry, or whether an error-bearing interface is required. `src/storage/page_buffer.c:6860-6875`. |
| `VS-14` | **Inference / proof obligation** | Lock-free READ-hit success has no post-CAS VPID recheck. | Safety depends on permanent BCB storage and the invariant that a positive `fcnt` excludes victim reuse. | A formal or concurrency-test proof covering the load/victim identity transition and memory ordering. `src/storage/page_buffer.c:7725-7786`. |
| `VS-15` | **Open source anomaly** | `file_dealloc()` contains `assert (error_code != NO_ERROR)` immediately before its normal exit even though the success value starts as `NO_ERROR`. | The assertion looks inconsistent, but no page-buffer teaching claim depends on it. | Recheck build configuration and reachable success paths. `src/storage/file_manager.c:6296-6299`. |
| `VS-16` | **Open diagnostic anomaly** | `pgbuf_rv_dealloc_undo_compensate()` has a debug-only diagnostic that appears to read a locally declared VPID without visible initialization. | Affects diagnostic reliability, not the type/flag restoration taught in the course. | Compile/run the diagnostic branch or trace macro expansion. `src/storage/page_buffer.c:15314-15335`. |
| `VS-17` | **Candidate** | `pgbuf_unlatch_thrd_holder()` reports a missing caller holder, but ordinary release `pgbuf_unfix()` does not fail closed before BCB accounting: the lock-free READ path does not consume `holder_status`, and the protected path decrements global `fcnt` before checking it. | An extra or wrong-thread unfix may consume another owner's fix debt; after a final valid unfix, the stale `PAGE_PTR` may also observe a reused BCB. The holder is therefore not a reliable release-build double-unfix guard. | Add targeted release-build tests for an immediate double unfix, wrong-thread unfix while another owner remains, READ fast-path conditions, and reuse between calls. Inspect holder lists, global `fcnt`, latch mode, errors, waiter handoff, and subsequent victim/fix behavior. `src/storage/page_buffer.c:3062-3201,6128-6184,6636-6703,7807-7835`. |
| `VS-18` | **Candidate** | In `pgbuf_latch_bcb_upon_fix()`, a thread that already owns every READ fix and requests another fix with WRITE takes the immediate upgrade branch. That branch sets the BCB tuple's `fcnt` to `1`; the common success path then increments the existing holder's `fix_count`. Starting from nested count 2 therefore appears to produce global `fcnt=1` and holder `fix_count=3`. | The two ownership ledgers no longer appear to match, so later unfix accounting and waiter handoff need runtime validation. This is separate from `pgbuf_promote_read_latch()`, whose documented purpose is a same-debt transformation. | Add a focused debug and release test: fix one BCB READ twice in one thread, call ordinary `pgbuf_fix(..., WRITE, ...)`, inspect global/thread counts and latch mode after every operation, then unfix all three times with and without a waiter. Recheck intended semantics with maintainers. `src/storage/page_buffer.c:6403-6437,6494-6537`. |
| `VS-19` | **Open source anomaly** | Repository-wide inspection at the pinned revision found allocation and consumption/requeue of `big_private_lrus_with_victims`, but no source path that produces its first index; the visible `produce` call only re-enqueues an index already consumed from that queue. | When an own private list is materially over quota, `pgbuf_get_victim()` restricts other-private discovery to the big-private queue. If the queue cannot receive its first entry, that step can return empty and proceed to shared search even when other large private lists have candidates. This is a static control-flow candidate, not a demonstrated bottleneck or correctness defect. | Instrument all big-private queue produce/consume sites under a workload with multiple private lists above `max(100, 2 × quota)`. Verify whether another generated/template path supplies initial indices and measure the effect on victim search. `src/storage/page_buffer.c:1864-1883,9148-9172,16424-16471`. |
| `VS-20` | **Open source anomaly** | `pgbuf_direct_victims_maintenance()` initializes each loop's `index` to its saved start index, then immediately requires `index != start_index`; both private and shared loop bodies are therefore skipped as written. | The maintenance daemon still adjusts quotas, but its comment-described low-activity backup cannot assign direct victims through this routine. Its initial `nassigns = 5` is only an outer continuation budget, not a strict assignment cap, because one helper call can assign multiple BCBs from a scan of up to 1,000 entries. Other direct-victim producers remain, so source shape alone does not prove starvation or a production failure. | Instrument direct-victim assignments by producer while allocators wait under low activity. Confirm loop-entry counts and whether a supported build variant or generated transformation changes the pinned control flow. `src/storage/page_buffer.c:9549-9648,16972-17000`. |

## C. Policy and timing that must not be taught as contract

| Topic | What is source-confirmed | What remains version-sensitive |
|---|---|---|
| LRU layout | The pinned revision has private/shared LRUs and LRU1/LRU2/LRU3 zones. | Zone thresholds, quota tuning, queue choice, and scan order are policy, not caller contract. |
| AOUT / 2Q history | The pinned code retains a bounded ghost FIFO/hash and its admission branches, but `prm_tune_parameters()` unconditionally overwrites `data_aout_ratio` with zero. Initialization and add/remove therefore short-circuit. | Whether another branch still forces zero and whether its dormant code is safe. CBRD-20741/CBRD-21135 document an older crash and an unknown cause; they do not prove the pinned dormant implementation reproduces it. Never summarize current CUBRID as simply “2Q” without rechecking. |
| Direct victims | Assignments are revalidated and may be revoked if the BCB becomes fixed again. | Exact fairness and starvation bounds are not proved. |
| Latch timeout | Unconditional wait may terminate through transaction timeout/interrupt, and zero-wait can become conditional. | Exact wall-clock timing and scheduler fairness are not guaranteed. |
| Daemon cadence | The pinned source divides work among maintain, flush, post-flush, and flush-control daemons. | Wakeup thresholds, intervals, and ownership may change independently of fix/unfix semantics. |
| Monitoring | SHOW and counters expose useful gauges/events. | They are not transaction-consistent state, physical-device-I/O counters, or exact unique-page counts. |

## D. Historical findings requiring revalidation

The older defect report
[`pgbuf-defects-report_5cd4f860e_claude.md`](../../pgbuf-analysis/pgbuf-defects-report_5cd4f860e_claude.md)
was produced at `5cd4f860e`, not the teaching baseline `f799e05`.

| Historical ID | Older finding | Current use |
|---|---|---|
| D1 | Early flush-error paths leak FLUSHING/dirty bookkeeping. | Partly re-established as `VS-12` at `f799e05`; still a candidate until fault-injected. |
| D2 | `direct_victims` initialization used the wrong `sizeof`. | Do not teach or ticket from this package until rechecked at the target branch. |
| D3 | Direct-victim maintenance loop condition prevented its body from running. | Historical design-debugging example only. |
| D4 | `big_private_lrus_with_victims` appeared to have no initial producer. | Historical queue-topology finding only. |
| D5 | `double_write_buffer_size=2M` was rejected and prevented boot. | Configuration usability observation, not a page-buffer invariant. Reproduce on the intended release before use. |
| D6 | Several counters used conflicting or partial definitions. | The general warning remains valid; each exact metric definition must be rechecked. |
| D7 | CBRD-20741 recorded an assertion/core in an older AOUT insertion path. CBRD-21135 and commit `d3554deee3a5` disabled AOUT while stating that the cause was unknown. The pinned source still contains the forced-zero tuning. | Teach the forced-zero state as verified at the pinned revision and the crash/root-cause account as historical evidence. Do not claim the dormant pinned code reproduces the old failure or that removing the override alone is a fix. See [the exact audit](reference/victim-scan-cap-and-aout-evidence.md#4-evidence-that-aout-is-disabled-because-of-a-bug). |
| D8 | `pgbuf_peek_stats` declaration names drifted. | Re-established as `VS-04` at `f799e05`. |

## E. Runtime evidence boundaries

| Evidence set | Verified observation | Do not infer |
|---|---|---|
| Audited experiments at `f799e05` | Cold/warm scans produce the same answer and a captured page-buffer ioread signature falls to zero on the immediate repeat. | Physical device miss, exact I/O source, or permanent residency. |
| Logging-only live monitor | Statement-level fix/unfix, hit/miss, promotion, dirty calls, and WAL-sync-before-page-flush order were observed twice. | Production latency, release-build overhead, unprobed ordered-watcher/victim/DWB internals. |
| Debug validation traffic | Full scan activity includes many volume-header/bitmap fixes. | That these counts represent release-build cost. |
| Idle observation | A polling observer generated its own catalog/page-buffer traffic. | That background activity belongs to the workload being measured. |

Sources:

- [`runtime-path-monitoring.md`](../../pgbuf-analysis/f799e05_claude/analysis/monitoring/runtime-path-monitoring.md)
- [`report-audit.md`](../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/evidence/report-audit.md)
- [`experiments-and-quizzes.md`](../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/research/packets/experiments-and-quizzes.md)

## F. Questions deliberately left open

1. Are `VS-10`, `VS-11`, `VS-12`, `VS-17`, and `VS-18` reachable under supported configurations, and what exact state survives each injected failure?
2. Does any supported path initially populate the `VS-19` big-private queue, and if not, how often does restricted other-private discovery lose a useful victim source?
3. Does `VS-20` prevent maintenance-owned direct-victim assignments in supported builds, and what allocator progress impact remains after accounting for the other producers?
3. Which of the historical replacement findings still exist on the branch used by new developers today?
4. What fairness claim, if any, is intended for page-latch promotion and direct-victim assignment?
5. Should `pgbuf_fix_without_validation_release` be implemented, removed, or hidden from release headers?
6. Should the copy-area helpers be repaired, documented as specialized, or replaced with a narrower interface?
7. Which page-buffer metrics are stable operational contracts versus implementation-local diagnostics?
8. Which source revision should be used for the next delivery of this course? Line references must be regenerated if it is not `f799e05`.

## G. Maintenance rule

When updating the teaching package to another CUBRID revision:

1. Diff `page_buffer.h` and the compact source-map ranges in `page_buffer.c`.
2. Re-run symbol searches for all `VS-*` entries.
3. Revalidate the acquisition, ownership, ordered-fix, dirty-generation, WAL, victim, and failure-unwind diagrams.
4. Keep historical experiment numbers labeled historical unless the exact harness is rerun.
5. Move resolved items out of this file only when the target source or runtime evidence proves resolution.
