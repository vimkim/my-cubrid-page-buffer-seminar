# Replace One Frame: Eligibility Before Policy

**Level:** Core
**Prerequisites:** [Fix, Hold, and Release](./02-fix-hold-release.md) and [Flush One Generation](./04-flush-one-generation.md)
**Capability gained:** Prove whether one resident frame is safe to reuse before evaluating replaceable selection and progress policy.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Implementation policy, and Runtime observation from the [pinned-source inventory](../source-inventory.md) and exact source ranges cited below.

## The maintainer question

Replacement has two layers. **Eligibility** asks whether reuse is safe now. **Policy** asks which safe candidate should be chosen and how the system should make progress under pressure. An optimization may change policy; it must not weaken eligibility.

![Hard victim predicates gating replacement policy](../assets/victim-eligibility.svg)

## Hard eligibility

A candidate must pass all of these conditions, then pass them again at the protected handoff:

| Predicate | Why reuse must stop when it fails |
|---|---|
| **Identity is stable** | The frame must still represent the VPID/list candidate that selection examined; rebinding stale identity would corrupt the page table. |
| **No ownership remains** | `fcnt` must be zero and no thread may still fix the frame. A waiter or granted/transient claim can make apparently idle state non-reusable. |
| **Generation is propagatable** | `DIRTY` means bytes still need propagation; `FLUSHING` means a copied generation has not completed. Direct-victim flags also exclude ordinary selection. |
| **No conflicting waiter/transient state** | Latch waiters and in-progress protocol states can carry rights not summarized by a casual counter read. |
| **Final protected revalidation succeeds** | Selection observations can go stale. Under BCB protection, recheck flags, ownership, identity/zone, and any handoff-specific conditions immediately before unlink/reuse. |

The pinned ordinary LRU path scans the victim zone, rejects avoid-victim flags and fixed frames, conditionally locks the BCB, calls `pgbuf_is_bcb_victimizable(..., true)`, and only then removes the frame from its LRU list. Source: `src/storage/page_buffer.c:9293-9538`.

### “Protected handoff” in concrete steps

**Handoff** is the ownership transition from “the LRU scan has nominated this pointer” to “the allocator exclusively owns a detached BCB, still locked, and may victimize/rebind it.” The scan result alone carries no such authority.

Suppose the reusable slot at address `BCB[42]` represents VPID A:

1. Under the LRU mutex, the scan reads cheap prefilters: LRU3 membership, avoid-victim flags, `fcnt`, latch mode, and waiter state. It remembers the pointer to `BCB[42]`.
2. Those facts are not all protected by the LRU mutex. A fixer/unfixer or flush/direct-victim protocol can change BCB ownership and flags; another path can own the BCB mutex. “All clear before lock” means only that the prefilter samples passed at this instant.
3. The scan uses `PGBUF_BCB_TRYLOCK()` rather than waiting while it holds the LRU mutex. Failure means another BCB transition is in progress, so the scan skips the candidate.
4. With both the list membership protected by the LRU mutex and the BCB state protected by the BCB mutex, `pgbuf_is_bcb_victimizable(..., true)` reads the current state again. Only an all-clear result permits `pgbuf_remove_from_lru_list()` to unlink it and change its encoded zone to `PGBUF_VOID_ZONE`.
5. The function releases the LRU mutex but returns the BCB still locked. The allocator can now complete `pgbuf_victimize_bcb()` without another thread treating the detached slot as the old ordinary resident candidate.

Without steps 3–5, an A-based decision could be applied after ownership, flags, or list position changed—or, in a broader reuse race, after the stable address had been detached and rebound to VPID B. “Stale” means the read was once true but no longer describes the state on which the destructive action will operate. Protection does not make the earlier read eternal; it establishes a current all-clear state and prevents conflicting transitions through the detach boundary.

Source: unprotected prefilters, try-lock, protected recheck, unlink, and locked return at `src/storage/page_buffer.c:9399-9478`; zone/index mutation at `src/storage/page_buffer.c:15900-16030`.

### What “no waiters or transient claim” means

These are guide terms for several concrete source states, not one field named `transient_claim`:

| Source-visible state | Why it blocks ordinary reuse |
|---|---|
| `atomic_latch.fcnt > 0` | One or more granted fixes still own the frame. |
| `next_wait_thrd != NULL` | A latch/flush waiter remains enrolled in the BCB protocol. Even before a new fix is granted, detaching the BCB would strand or misdirect its wake/grant transition. |
| Latch mode is not `PGBUF_NO_LATCH` when the BCB mutex is not owned by the checker | The sampled zero count may be inside a transition. With the BCB mutex owned, the source recognizes the narrow unfix case in which latch mode is temporary and will be cleared before unlock. |
| BCB try-lock fails | Another thread currently owns the BCB transition guard. The scanner does not wait while holding the LRU mutex; it skips this candidate. |
| `PGBUF_BCB_VICTIM_DIRECT_FLAG` or `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG` | A direct-victim producer/consumer handoff already owns or has invalidated the candidate; ordinary LRU selection must not claim it again. |

`pgbuf_is_bcb_fixed_by_any()` implements the first three checks, with different latch-mode treatment depending on whether the caller owns the BCB mutex. The invalid-victim flag mask adds DIRTY, FLUSHING, and the two direct-victim flags. Source: `src/storage/page_buffer.c:225-263,9265-9325,16217-16231`.

### Clean state and completed I/O are separate requirements

A DIRTY BCB contains a resident generation whose bytes have not completed the configured page-image propagation boundary. Detaching and overwriting that frame would lose those bytes.

A FLUSHING BCB may no longer be DIRTY for the copied generation, but completion still refers to the old BCB identity and snapshot: WAL forcing, DWB/direct submission, flag clearing, waiter wakeup, and possibly post-flush victim handoff have not all completed. Rebinding the BCB during that interval could let old-generation completion mutate or wake state now associated with another resident identity. Concurrent re-dirty makes the distinction sharper: generation G can be FLUSHING while the current resident generation G+1 is DIRTY. Both predicates must therefore be false before ordinary reuse.

The source enforces this with `PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK`; `pgbuf_bcb_avoid_victim()` rejects DIRTY, FLUSHING, direct-victim-assigned, and direct-victim-invalidated flags. Source: `src/storage/page_buffer.c:221-263,9293-9311,16217-16231`; generation completion at `src/storage/page_buffer.c:10723-10962`.

### Counterexample: `fcnt == 0` is insufficient

Imagine a scanner observes `fcnt == 0`, but the frame is `DIRTY`; reuse would discard unpropagated bytes. Or it observes zero before a waiter/fixer commits ownership, then acts after the state changes. Or the frame is `FLUSHING`, so the copied image still refers to its identity. The number zero is one predicate sampled at one time—not a reuse proof.

**Interface contract:** no caller may retain a successful fix when a frame is rebound. **Implementation policy:** the protected final check is the seam that turns fallible candidate observations into a safe reuse decision.

## When victim selection is actually attempted

Victim selection is demand-driven by a miss that must materialize a page. `pgbuf_allocate_bcb()` first tries the invalid/free list. Only when that list returns no BCB does it call `pgbuf_get_victim()` and search the LRUs. “The pool is full” is a reasonable shorthand for “no identity-free pool slot is immediately available,” but it does not mean every slot is an ordinary LRU member: slots can be fixed, provisional, flushing, directly assigned, or in another transient state.

### Concrete structures and operation costs

![Invalid-list head pop, bounded LRU scan, and mapping replacement costs](../assets/replacement-data-structures.svg)

The BCB pool storage and the runtime lists are different layers. `BCB_table` is one contiguous array allocated at page-buffer initialization. The initialization loop pairs every BCB with one frame and sets each BCB's `next_BCB` to the next array entry. `pgbuf_initialize_invalid_list()` then points `invalid_top` at `BCB[0]`. Building this initial chain is O(`N`) once for `N` buffers.

At runtime, “try the invalid list” does **not** mean scan the BCB array. `PGBUF_INVALID_LIST` is a mutex, `invalid_top`, and `invalid_cnt`; its BCB nodes form a singly linked list through `next_BCB`. `pgbuf_get_bcb_from_invalid_list()` first reads an unlocked empty hint, then locks and rechecks. On success it advances `invalid_top` by one link, decrements the count, unlocks the list, locks the returned BCB, clears its list link, and moves it to the void zone. The list manipulation is O(1), although mutex scheduling can make wall-clock time variable. Returning a BCB to the invalid list is likewise a head push.

The LRU path is different. Each LRU is doubly linked. `pgbuf_get_victim_from_lru_list(thread_p, lru_idx)` receives the index of **one list that has already been selected**. It starts from that list's `victim_hint`, or its bottom when no hint exists, and follows `bufptr->prev_BCB` through LRU3 toward newer nodes. Entering the loop body once is one BCB-node visit: inspect its flags and ownership, perhaps try-lock it, then either return it or advance one link. The body can run at most `MAX_DEPTH == 1000` times in that invocation. “1,000 links” therefore does not mean an array of 1,000 lists and does not mean that 1,000 victims are found. It means at most 1,000 candidate-position visits inside one selected LRU3.

![Private LRU count, selected-list population, and one victim scan's 1,000-node budget](../assets/lru-scan-depth-vs-list-count.svg)

Keep three quantities separate. `P` is the number of private LRU descriptors. `Z3` is the number of BCBs in the selected list's LRU3. `K` is how many of those nodes this call visits, with `K ≤ min(Z3 reachable from the start, 1000)`. The selected list can contain more than 1,000 nodes; this call stops before node 1,001 and a later attempt may start from an updated hint. Conversely, it can return after one visit if the first BCB passes the protected check.

The private-list count is not capped at 1,000. In pinned server mode, `num_private_chains = -1` expands to `MAX_NTRANS + VACUUM_MAX_WORKER_COUNT`, and the latter constant is 50. An explicit positive setting is floored to four and its parameter-table maximum is 4,050; automatic `MAX_NTRANS` also includes admin/HA-reserved connections and is not clamped to 1,000 by the initializer. The two other source uses of 1,000 are unrelated: the explicit **shared** `num_LRU_chains` maximum and the automatic target of roughly 1,000 buffers per shared list.

The higher-level `pgbuf_get_victim()` may make several selected-list calls: caller's private list, an advertised other-private index, an advertised shared index, and a final own-list fallback. Therefore 1,000 is not a whole-allocation bound. Moreover, when a selected private list is over quota, the helper may first demote `M` boundary BCBs into LRU3; that adjustment is outside `MAX_DEPTH`. The precise helper cost is O(`M + K`) with `K ≤ 1000`, while the scan itself is a bounded O(`K`) linked-list walk. Each cheap reject is constant-field work, a plausible candidate receives a non-waiting BCB try-lock and protected recheck, and known-node removal is O(1).

After LRU detach, `pgbuf_victimize_bcb()` removes the old VPID mapping from its hash bucket. That bucket is a singly linked chain, so removal is O(`B`) for bucket length `B`, plus possible hash-mutex wait. Loading a requested old page then uses DWB or data-volume I/O (and possibly decryption); storage latency is not meaningfully captured by calling the CPU step O(1). Publishing the new mapping at the hash head and adding the BCB to one LRU are constant-link insertions, again with possible mutex contention.

| Stage | Structural CPU work | Latency qualification |
|---|---|---|
| Initial BCB/invalid chain | O(`N`) once | Startup only. |
| Invalid-list pop or push | O(1) | No array scan; shared invalid-list mutex may wait. |
| One selected-LRU helper | O(`M + K`), `K ≤ 1000` | `M` is optional pre-scan zone demotion; the bounded LRU3 walk holds one LRU mutex, and cache behavior, failed try-locks, and candidate distribution matter. |
| Protected candidate recheck | O(1) | Try-lock skips rather than waiting, but repeated skips extend the scan. |
| Known-node LRU detach | O(1) | Performed under the LRU mutex. |
| Old hash mapping removal | O(`B`) | `B` is bucket-chain length; hash mutex may wait. |
| Old-page materialization | Storage operation | DWB/file read and optional decryption can dominate. |
| Hash-head/LRU publication | O(1) link work | Hash/LRU mutex wait remains workload-dependent. |

The pinned source does not provide a universal nanosecond duration. It instruments allocation, victim-search subphases, and condition waits through `PSTAT_PB_ALLOC_BCB`, `PSTAT_PB_ALLOC_BCB_SEARCH_VICTIM`, list-search timers, and condition-wait timers. Use those observations or a focused benchmark for the target build and workload; Big-O alone is not a latency measurement.

Source: invalid-list structure at `src/storage/page_buffer.c:626-634`; BCB array/link initialization at `5559-5660`; invalid head initialization and pop/push at `5907-5919,8905-8983`; per-list bound and scan at `9327-9537`; zone adjustment at `9984-10048`; high-level list selection at `9067-9263`; private-list count at `13941-13985` and `src/base/system_parameter.c:4171-4182`; hash deletion at `7883-7957`; BCB allocation timing at `8181-8403`. Full derivation: [Victim scan cap and AOUT status](../reference/victim-scan-cap-and-aout-evidence.md).

If every BCB is fixed, the invalid list is empty and every LRU candidate fails ownership eligibility. The page buffer never steals one. With the page-flush daemon available, the requesting server thread enters the direct-victim wait protocol; an unfix can eventually make a clean BCB eligible and feed it. If ownership never ends, the request can leave only through timeout, interrupt, or shutdown. Without the daemon, the code flushes/searches synchronously and expects a victim; if none is produced, the allocation ultimately fails (the fallback error name is `ER_PB_ALL_BUFFERS_DIRTY`, even though “all fixed” is the actual reason in this scenario). This outcome exposes leaked or excessive ownership rather than weakening safety.

Source: demand and invalid-list-first rule at `src/storage/page_buffer.c:8181-8235`; wait/retry/bounded exits at `src/storage/page_buffer.c:8236-8403`; fixed/waiter rejection at `src/storage/page_buffer.c:9265-9325`.

## Selection and progress are policy

Once hard gates pass, the analyzed revision uses policy machinery: LRU placement and zones, private LRU and shared LRU domains, quota decisions, candidate queue/hint state, and direct assignment to threads waiting for a frame. These mechanisms affect fairness, locality, CPU cost, and progress; they do not redefine what “safe to reuse” means.

Keep formulas and daemon coordination in [Replacement Policy and Background Progress](../advanced/replacement-progress.md). In core review, ask: “Could this policy choice change while every hard predicate and final recheck remains intact?”

### Advanced policy boundary

Direct-victim assignment is revocable: if the candidate is fixed again before consumption, the allocator must request another candidate. That is enough for the Core policy classification; [Replacement Policy and Background Progress](../advanced/replacement-progress.md) owns the flag transitions, source trace, and progress argument.

## Similar verbs, different operations

| Operation | Meaning |
|---|---|
| **Unfix** | Consume one caller’s fix debt; the resident mapping normally remains. |
| **Flush** | Propagate one copied dirty generation; residency normally remains. |
| **Victimization** | Select and detach a safe resident frame so its storage can be rebound. |
| **Invalidation** | Remove or reject a resident mapping for an explicit coherence/lifecycle reason; it is not merely LRU selection. |
| **Logical deallocation** | File/disk ownership says a page is no longer allocated; page-buffer invalidation is only one required consequence. |

Avoid-deallocation bookkeeping for vacuum is not, by itself, the ordinary victim blocker. Source: `src/storage/page_buffer.c:16262-16296` as reconciled by the [inventory](../source-inventory.md).

## Evidence boundary of the existing non-eviction runs

Existing runtime observations did not force eviction or identify a physical victim, so they are not victim evidence. The [advanced replacement page](../advanced/replacement-progress.md#evidence-boundary) owns the bounded interpretation; the [source inventory](../source-inventory.md) owns the receipts.

## Understanding check: predicate or policy

### Predict

For a candidate that is in the victim zone, has `fcnt == 0`, is clean, has a latch waiter, and belongs to an under-quota private list, predict whether it is safe and whether policy should choose it.

### Locate

Trace `pgbuf_get_victim_from_lru_list()` from its unprotected scan checks through `PGBUF_BCB_TRYLOCK`, `pgbuf_is_bcb_victimizable(..., true)`, and removal. Then trace one direct assignment through invalidation when fixed again.

### Explain

Produce a predicate-versus-policy table with columns: observation, hard predicate or policy, protection required, stale-observation risk, and result.

### Model answer

The latch waiter fails a hard ownership/wait-state gate even though `fcnt` was observed as zero. Under-quota private-list membership is policy: it may give an otherwise eligible frame another chance, but cannot make an unsafe frame reusable. The final answer requires BCB-protected revalidation because the scan’s flags, ownership, identity, and zone observations can change. A direct victim fixed again is revoked; the allocator requests another candidate rather than forcing reuse.

## Learning navigation

**Previous:** [Flush One Generation](./04-flush-one-generation.md)
**Next:** [Maintainer Capstone](./06-maintainer-capstone.md)

## Related routes

- [Practice victim eligibility](../questions/core.md#pgbuf-qb-029-what-makes-a-frame-safe-to-victimize)
- [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- [Maintainer Invariant Index](../reference/invariant-index.md)
- [Replacement Policy and Background Progress](../advanced/replacement-progress.md)
