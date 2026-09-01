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

### Counterexample: `fcnt == 0` is insufficient

Imagine a scanner observes `fcnt == 0`, but the frame is `DIRTY`; reuse would discard unpropagated bytes. Or it observes zero before a waiter/fixer commits ownership, then acts after the state changes. Or the frame is `FLUSHING`, so the copied image still refers to its identity. The number zero is one predicate sampled at one time—not a reuse proof.

**Interface contract:** no caller may retain a successful fix when a frame is rebound. **Implementation policy:** the protected final check is the seam that turns fallible candidate observations into a safe reuse decision.

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

## Evidence boundary: the existing runs did not evict

Existing runtime observations did not force eviction or identify a physical victim, so they are not victim evidence. The [advanced replacement page](../advanced/replacement-progress.md#runtime-evidence-no-eviction-was-forced) owns the bounded interpretation; the [source inventory](../source-inventory.md) owns the receipts.

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

- [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- [Maintainer Invariant Index](../reference/invariant-index.md)
- [Replacement Policy and Background Progress](../advanced/replacement-progress.md)
