# Advanced Retrieval Answers

**Level:** Question bank — Advanced answers
**Prerequisites:** Attempt the matching item in [Advanced prompts](./advanced.md)
**Capability gained:** Evaluate advanced mechanism and proof reasoning without confusing policy, inference, historical evidence, or mutable candidate status with an Interface contract.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Implementation policy, Inference, and Historical evidence from pinned source and linked Evidence references

Use IDs to pair these answers with [Advanced prompts](./advanced.md). Follow the Canonical Advanced page and the uncertainty registry when the answer exposes a gap rather than treating the bank as a status authority.

## Acquisition concurrency

### PGBUF-QB-031 — What closes the lock-free READ-hit proof?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:7725-7786`; [VS-14](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)
- **Confidence/limit:** Source shows the CAS/fcnt path; memory-order and reuse safety remain a proof obligation.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-031-what-closes-the-lock-free-read-hit-proof)

**Model answer:** The safety argument needs permanent BCB storage, a CAS that makes `fcnt` positive only for the intended identity, memory ordering that makes the observed identity/frame state valid, and the invariant that positive `fcnt` excludes victim reuse. Because there is no post-CAS VPID recheck, a controlled identity-transition interleaving plus a formal ordering argument must close the gap.

**Why:** Lack of observed corruption does not prove a lock-free lifetime invariant.

### PGBUF-QB-032 — When does a cold miss become the resident mapping?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:7981-8178,8392-8634`
- **Confidence/limit:** Establishes publication protocol, not a universal lower-layer I/O count.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-032-when-does-a-cold-miss-become-the-resident-mapping)

**Model answer:** The VPID lock selects one load owner. Its BCB/frame is provisional while allocated, assigned, and materialized; other threads cannot treat it as the resident answer. Publication installs the mapping and wakeup releases waiters to retry normal lookup and acquire their own latch/fix/holder state.

**Why:** Prepared state becomes shared state only at a protected publication boundary.

### PGBUF-QB-033 — How are many unconditional WRITE waiters handled?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:6277-7582`
- **Confidence/limit:** Queue and exit paths are visible; strict FIFO, starvation freedom, and exact timing are not proved.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-033-how-are-many-unconditional-write-waiters-handled)

**Model answer:** Incompatible writers enter the page-latch wait protocol, where release/wakeup causes candidates to re-evaluate the current latch tuple rather than granting all at once. Some requests may time out, be interrupted, or act conditionally under zero-wait policy. The implementation may group or allow bounded barging, so one hundred requests do not imply one deterministic queue order or guaranteed completion time.

**Why:** Unconditional means the caller permits waiting, not that scheduling becomes a fairness contract.

### PGBUF-QB-034 — When should promotion failure trigger restart?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:2842-3050`; `src/storage/btree.c:28365-28393,28638-28696`
- **Confidence/limit:** The B-tree ranges are representative caller policy, not a universal restart rule.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-034-when-should-promotion-failure-trigger-restart)

**Model answer:** The generic Interface can attempt promotion, but the access method knows whether waiting while holding its current page set is safe. The representative B-tree caller treats promotion failure as a signal to unfix, switch traversal policy, mark restart, and re-enter rather than retain an unsafe dependency set.

**Why:** Retry and latch-order policy require knowledge above a generic page acquisition.

### PGBUF-QB-035 — Why can ordered fixing release pages first?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:12268-13531`; `src/storage/heap_file.c:20493-20664`
- **Confidence/limit:** Describes representative ordered-watcher protocol; callbacks and owners define exact revalidation.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-035-why-can-ordered-fixing-release-pages-first)

**Model answer:** To avoid acquiring a multi-page set in a conflicting order, the helper may release held watchers, sort the requested order, refix, and invoke owner callbacks. Refix restores ownership but not old content observations; the caller must react to `page_was_unfixed` by recomputing page-local state.

**Why:** Deadlock avoidance deliberately crosses a lifetime boundary and must expose that boundary to the caller.

### PGBUF-QB-036 — What is avoid-deallocation ownership for?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:16262-16296`
- **Confidence/limit:** Applies to the pinned vacuum/deallocation owner protocol, not all allocation races.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-036-what-is-avoid-deallocation-ownership-for)

**Model answer:** Avoid-deallocation bookkeeping coordinates a page identity with vacuum-style logical deallocation so that the relevant owner can prevent or observe that race. It neither grants page-byte access nor replaces `fcnt`, latching, or the ordinary victim eligibility checks.

**Why:** Logical allocation lifetime and resident-frame replacement are related but separately owned protocols.

## Replacement progress

### PGBUF-QB-037 — What do LRU domains and zones decide?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:560-773,5744-5903,9293-9538`
- **Confidence/limit:** Layout and scans are pinned policy; thresholds and list selection can change.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-037-what-do-lru-domains-and-zones-decide)

**Model answer:** Private/shared domains partition search pressure, zones encode recency position, and hints choose where a scan resumes. They identify candidates efficiently. Reuse still requires the hard unfixed, clean/not-flushing, waiter/flag, conditional-lock, and final identity checks.

**Why:** Search policy reduces cost; it cannot authorize unsafe reuse.

### PGBUF-QB-038 — What correctness claim can quota policy make?

- **Evidence:** Implementation policy; Verified mechanism
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:13942-14440`
- **Confidence/limit:** Quota formulas and targets are revision/configuration sensitive.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-038-what-correctness-claim-can-quota-policy-make)

**Model answer:** Quota can change private-list targets, redistribute pressure, and influence which list is searched. It cannot make a fixed, dirty, flushing, waiter-owned, or identity-mismatched BCB safe; every candidate still passes the canonical eligibility gate.

**Why:** Resource-allocation policy operates inside correctness constraints.

### PGBUF-QB-039 — Why is a direct victim only a reservation?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:15420-15627`
- **Confidence/limit:** Source shows assignment/revalidation/revocation, not fairness of assignments.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-039-why-is-a-direct-victim-only-a-reservation)

**Model answer:** A provider reserves an eligible BCB for a waiting allocator, but the consumer must later lock and revalidate it. If another worker fixes the page in between, invalidation revokes the assignment and the allocator retries. The flag therefore coordinates progress but never bypasses hard predicates.

**Why:** Eligibility can change between producer and consumer, so reservation cannot equal ownership.

### PGBUF-QB-040 — What happens when no free BCB is immediately available?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:8290-8389`
- **Confidence/limit:** Enumerates pinned outcomes; timing and fairness are not guaranteed.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-040-what-happens-when-no-free-bcb-is-immediately-available)

**Model answer:** Allocation searches available/invalid state and eligible victims, can trigger flush or background progress, wait for or consume a direct victim, and retry. Interrupt or timeout can end the wait; a state where all buffers are dirty can surface its specific error. An empty free list is only the start of this progress protocol, not proof of an infinite wait.

**Why:** Capacity pressure has multiple producers, queues, wakeups, and bounded exits.

### PGBUF-QB-041 — Can post-flush assign an old generation as a victim?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:10925-10952,15489-15556`
- **Confidence/limit:** Establishes the generation recheck path, not an observed eviction schedule.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-041-can-post-flush-assign-an-old-generation-as-a-victim)

**Model answer:** No. Completion of G only validates the copied generation. If the resident BCB is dirty as G+1, post-flush finds that it is no longer clean/eligible and must not hand it to an allocator. A later flush must propagate G+1 first.

**Why:** Old-generation success cannot erase or reuse newer resident bytes.

### PGBUF-QB-042 — What do the four page-buffer daemons own?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:16972-17298`
- **Confidence/limit:** Ownership is source-visible; thresholds, periods, priorities, and batches are version-sensitive.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-042-what-do-the-four-page-buffer-daemons-own)

**Model answer:** Maintenance manages replacement-list housekeeping, page flush propagates selected dirty work, post-flush rechecks and hands off eligible results, and flush control regulates I/O work. Exact cadence and formulas are tuning policy and must be rechecked on the target revision/configuration.

**Why:** Background responsibility can remain stable while scheduling policy changes independently.

### PGBUF-QB-043 — Is AOUT active replacement policy?

- **Evidence:** Verified mechanism; Implementation policy; Historical evidence
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:5807-5903,10475-10720`; `src/base/system_parameter.c:9976-9986`
- **Confidence/limit:** Structures and pinned/default override are visible; another revision/configuration requires revalidation.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-043-is-aout-active-replacement-policy)

**Model answer:** AOUT structures implement ghost history intended to influence later insertion after recent eviction. In the analyzed default, parameter tuning forces its ratio to zero so it does not participate. The correct statement is configuration/revision-bound, not an unconditional algorithm label.

**Why:** Code presence proves a mechanism exists, not that current policy activates it.

## Recovery and lifecycle

### PGBUF-QB-044 — Who chooses special fetch modes?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Source anchors:** `src/storage/file_manager.c:5420-5590`; `src/storage/page_buffer.c:14896-14921,15133-15303`
- **Confidence/limit:** Each special mode remains constrained to its owner protocol.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-044-who-chooses-special-fetch-modes)

**Model answer:** File management chooses `NEW_PAGE` after allocation because it owns materialization. Recovery chooses recovery/deallocated modes because it knows log-time allocation state and idempotence requirements. None is a general way to skip validation for an ordinary reader.

**Why:** Absence and allocation semantics require knowledge the page buffer does not possess.

### PGBUF-QB-045 — Why is checkpoint not “flush every page”?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Source anchors:** `src/transaction/log_page_buffer.c:6901-7406`
- **Confidence/limit:** Describes the pinned checkpoint path; exact selection/tuning can vary.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-045-why-is-checkpoint-not-flush-every-page)

**Model answer:** Checkpoint first coordinates log state and a start marker, asks page buffer to flush pages qualifying up to a boundary and return the remaining redo floor, synchronizes filesystem state, records transaction/system-operation metadata, persists checkpoint/header and volume metadata, and crosses the configured DWB boundary. Page buffer owns only the selective resident-page step.

**Why:** A checkpoint is a cross-module durability protocol, not a blanket cache-empty operation.

### PGBUF-QB-046 — How does redo use page LSA for idempotence?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Source anchors:** `src/transaction/log_recovery.c:497-536,6407-6431`; `src/transaction/log_recovery_redo.hpp:587-668`
- **Confidence/limit:** The page-LSA gate prevents duplicate page application; it does not prove arbitrary callback side effects idempotent.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-046-how-does-redo-use-page-lsa-for-idempotence)

**Model answer:** Redo fixes the recovery page under WRITE, compares the record LSA with the page LSA, and skips/release if the record is already represented. Otherwise it applies the recovery function, updates the page LSA, dirties as required, and scope cleanup releases ownership on every exit.

**Why:** The page-LSA comparison is the page-image idempotence gate; callback behavior outside that image needs separate reasoning.

### PGBUF-QB-047 — How do deallocation, invalidation, and raw overwrite interact?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Source anchors:** `src/storage/disk_manager.c:721-811`; `src/storage/page_buffer.c:14896-14921,15133-15303`
- **Confidence/limit:** Shows owner separation for representative file/disk/recovery paths.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-047-how-do-deallocation-invalidation-and-raw-overwrite-interact)

**Model answer:** File/disk/recovery code owns whether an identity is logically allocated or overwritten. Page buffer owns coherence of any resident mapping, so the owner must flush/invalidate as its protocol requires before bypassing cached bytes. Invalidation removes resident coherence state; it is not the logical allocation decision.

**Why:** Storage truth and cache truth must change in an owner-ordered sequence.

### PGBUF-QB-048 — What dependency order constrains lifecycle changes?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md)
- **Source anchors:** `src/transaction/log_tran_table.c:468-512,580-594`; `src/transaction/boot_sr.c:1974-2801,3055-3113`; `src/storage/page_buffer.c:16996-17255`
- **Confidence/limit:** Establishes pinned dependency ordering, not every shutdown failure interleaving.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-048-what-dependency-order-constrains-lifecycle-changes)

**Model answer:** Initialization creates lock/page/file dependencies before use; restart prepares recovery/DWB state and creates but gates daemons until log recovery finishes. Shutdown stops background owners, finalizes logging while page propagation remains possible, then destroys DWB/pool dependencies and finally the page buffer before later file teardown.

**Why:** No daemon may access a finalized pool, and log finalization that flushes pages needs the pool alive.

## Specialized interfaces and observability

### PGBUF-QB-049 — Why is simple fix not a faster ordinary fix?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Source anchors:** `src/storage/page_buffer.h:270-273`; `src/storage/page_buffer.c:2688-2811`; `src/query/query_manager.c:2733`
- **Confidence/limit:** Applies to the narrow pinned owner protocol; it is not a general optimization contract.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-049-why-is-simple-fix-not-a-faster-ordinary-fix)

**Model answer:** Simple fix serves a narrow temporary/read-only protocol and omits normal page-content latch behavior, holder diagnostics, and last-unfix processing. Its owner supplies the missing assumptions and cleanup, so substituting it for ordinary fix would weaken guarantees rather than merely improve speed.

**Why:** A shallower Interface is safe only behind a narrower owner contract.

### PGBUF-QB-050 — What does a scan-copy handle own?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Source anchors:** `src/storage/page_buffer.c:910-981`; `src/storage/heap_file.c:6439-6465,6787-6829,7556-7645,7923-7984`
- **Confidence/limit:** Describes representative heap ownership of opaque copied state.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-050-what-does-a-scan-copy-handle-own)

**Model answer:** The handle owns copied/opaque scan state whose allocation, validity, release, and reuse are managed by its heap protocol. It is not a borrowed resident `PAGE_PTR`, does not imply an ordinary BCB fix debt, and cannot be used with ordinary pointer-lifetime assumptions.

**Why:** Copy lifetime and resident-frame ownership are different resource protocols.

### PGBUF-QB-051 — Why are area-copy helpers hazardous conveniences?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Source anchors:** `src/storage/page_buffer.c:4701-4912`; [VS-02 and VS-03](../unresolved-or-version-sensitive-findings.md#a-current-pinned-revision-interface-hazards)
- **Confidence/limit:** Pinned executable branches show the drift; intended future contract remains a design decision.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-051-why-are-area-copy-helpers-hazardous-conveniences)

**Model answer:** The reader's `do_fetch` prose and executable miss branch disagree, while the writer's normal build effectively follows a specialized `NEW_PAGE`/skip-logging/dirty protocol regardless of the apparent option. General reuse would make absence, logging, and mutation semantics ambiguous.

**Why:** A convenience that hides owner-specific recovery behavior is not a safe general abstraction.

### PGBUF-QB-052 — What can approximate diagnostics authorize?

- **Evidence:** Interface contract; Verified mechanism; Inference
- **Canonical guide:** [Specialized Interfaces](../advanced/specialized-interfaces.md)
- **Source anchors:** `src/storage/page_buffer.c:14748-14847,17323-17530`; [VS-04 and VS-05](../unresolved-or-version-sensitive-findings.md#a-current-pinned-revision-interface-hazards)
- **Confidence/limit:** Useful for hypotheses and scheduling; snapshots are not transaction-consistent authorization.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-052-what-can-approximate-diagnostics-authorize)

**Model answer:** A snapshot can highlight pressure, waiters, counters, or a region worth tracing and can inform maintenance scheduling. It cannot prove the currently guarded state required to mutate, deallocate, invalidate, or victim-select a particular page; that decision must use the owning protected protocol.

**Why:** Observation without the state owner's guard can be stale before an action executes.

## Failure and proof obligations

### PGBUF-QB-053 — When is an exported name not an available Interface?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Specialized Interfaces](../advanced/specialized-interfaces.md) and [Failure Obligations](../advanced/failure-and-proof-obligations.md)
- **Source anchors:** `src/storage/page_buffer.h:320-326`; [VS-01](../unresolved-or-version-sensitive-findings.md#a-current-pinned-revision-interface-hazards)
- **Confidence/limit:** Repository analysis found no definition/caller at the pinned baseline; another revision requires a fresh search/link test.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-053-when-is-an-exported-name-not-an-available-interface)

**Model answer:** A header declaration and macro mapping describe a name but cannot supply executable behavior. Without a definition or caller/link seam, using it would fail rather than provide an optimization. Availability requires definition, owner protocol, callers, and tests on the target revision.

**Why:** Interface surface is established by the complete build/runtime contract, not declaration text alone.

### PGBUF-QB-054 — How do you audit a failure after ownership changes?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Failure Obligations](../advanced/failure-and-proof-obligations.md)
- **Source anchors:** `src/storage/page_buffer.c:6000-6055,6457-6522,6595-6617,7738-7773`; [VS-11](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)
- **Confidence/limit:** Source exposes candidate post-grant failures; reachability and surviving state are unproved.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-054-how-do-you-audit-a-failure-after-ownership-changes)

**Model answer:** Record the identity and latch tuple before grant, global `fcnt`, holder allocation/update, waiters, and the expected rollback/retry postcondition on each `NULL` exit. Then force holder extension failure separately on normal, awakened, and lock-free paths and inspect both ledgers plus latch/identity state. Only observed surviving state advances beyond source-visible control flow.

**Why:** Returning no pointer does not prove that an internal grant was undone.

### PGBUF-QB-055 — What evidence promotes an exceptional-path candidate?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Failure Obligations](../advanced/failure-and-proof-obligations.md)
- **Source anchors:** `src/storage/page_buffer.c:8510-8515,10795-10923`; [current proof obligations](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)
- **Confidence/limit:** Current source supplies candidates, not production-defect conclusions.
- **Prompt:** [Attempt this question](./advanced.md#pgbuf-qb-055-what-evidence-promotes-an-exceptional-path-candidate)

**Model answer:** First establish exact control flow. Next prove supported-configuration reachability with a focused fault. Inspect surviving identity/load-lock/BCB or DIRTY/FLUSHING/LSA/waiter state, then demonstrate caller or production impact, and finally recheck target-branch status. The fault must run at the owner seam; a source return or old report cannot skip those levels.

**Why:** Candidate promotion is an evidence ladder, not a label inferred from suspicious code shape.

## Route navigation

- Return to [Advanced prompts](./advanced.md)
- Continue to [Maintenance scenarios](./maintenance-scenarios.md)
- Return to the [Question-bank entry](./README.md)
