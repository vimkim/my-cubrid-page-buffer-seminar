# Core Retrieval Answers

**Level:** Question bank — Core answers
**Prerequisites:** Attempt the matching item in [Core prompts](./core.md)
**Capability gained:** Evaluate a Core artifact against the governing invariant, pinned source, and explicit confidence boundary.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract, Verified mechanism, Implementation policy, and Inference from the pinned source and Canonical guide pages

Use IDs rather than page position to pair answers with [Core prompts](./core.md). These answers are evaluation aids; the linked Learning page remains the Canonical explanation.

## Contract and objects

### PGBUF-QB-001 — What does the page-buffer Module own?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Source anchors:** `src/storage/page_buffer.h:172-203,266-268,277-305,327-330`; `src/storage/page_buffer.c:2260-2685`
- **Confidence/limit:** Establishes the pinned Module boundary, not correctness of every caller.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-001-what-does-the-page-buffer-module-own)

**Model answer:** The Module maps a caller-supplied page identity to resident bytes, prevents reuse while fixed, coordinates page-byte latching, tracks ownership debt, and participates in dirty/flush/replacement protocols. Callers still own allocation knowledge, logical locks, page type and layout, mutation validity, recovery meaning, dirtying order, retry, and cleanup; log, file, disk, DWB, and recovery owners complete their own boundaries.

**Why:** Successful access is a temporary ownership contract, not proof that the caller selected or modified the page correctly.

### PGBUF-QB-002 — What exactly does a VPID identify?

- **Evidence:** Interface contract
- **Canonical guide:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Source anchors:** `src/compat/dbtype_def.h:956-961`
- **Confidence/limit:** Defines CUBRID storage identity; it does not specify physical-device placement.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-002-what-exactly-does-a-vpid-identify)

**Model answer:** A `VPID` is `(volid, pageid)`, the identity of a database page within the volume/page address space. A `PAGE_PTR` is a temporary memory view into a resident frame, while lower storage layers may map the VPID through files, DWB, caching, and device layout; the pair is not an exact byte address.

**Why:** Identity must remain stable while memory addresses and lower-level placement can change.

### PGBUF-QB-003 — How do VPID, BCB, frame, PAGE_PTR, and holder differ?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Source anchors:** `src/storage/storage_common.h:146`; `src/storage/page_buffer.c:460-555,5559-5660`
- **Confidence/limit:** Describes the pinned private layout, not a stable ABI.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-003-how-do-vpid-bcb-frame-pageptr-and-holder-differ)

**Model answer:** `VPID` is logical identity. A BCB is volatile control state for one resident identity and its paired frame. The frame stores page bytes; `PAGE_PTR` borrows a view into those bytes. BCB `fcnt` is global replacement protection, while per-thread holders record which thread owes how many matching releases.

**Why:** Each object has a different identity, owner, guard, and lifetime; conflating them hides stale-pointer and ownership bugs.

### PGBUF-QB-004 — Which page states are independent?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Source anchors:** `src/storage/page_buffer.c:499-555,4921-5096,9314-9538,10723-10962`
- **Confidence/limit:** Shows legal state combinations in the pinned design, not every transition interleaving.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-004-which-page-states-are-independent)

**Model answer:** A page may be resident and unfixed, fixed under a READ latch and clean, fixed under WRITE and still clean before mutation, dirty after its transaction's WAL commit, or clean after one copied generation completed while a newer resident generation is dirty. Victim eligibility additionally needs no fix, waiter, dirty, or flushing blocker and a protected final recheck.

**Why:** Residency, ownership, content concurrency, recoverability/propagation, and replacement are stored and changed by different protocols.

### PGBUF-QB-005 — What is the shared successful-fix postcondition?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Contract and Objects](../learning/01-contract-and-objects.md) and [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:2260-2685,6277-6634`
- **Confidence/limit:** Applies to ordinary successful fix; specialized families add or narrow protocol rules.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-005-what-is-the-shared-successful-fix-postcondition)

**Model answer:** The requested VPID agrees with the resident BCB/page representation, the frame cannot be reused because global fix ownership is positive, the requested latch has been granted, the current thread's holder records one new debt, and the returned pointer is usable only until that debt is repaid. Hit and miss differ only in preparation before this boundary.

**Why:** A caller should reason from the common contract rather than treating cache-hit preparation as weaker ownership.

## Fix, hold, and release

### PGBUF-QB-006 — What policy does each fix input express?

- **Evidence:** Interface contract
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.h:172-203`; `src/storage/page_buffer.c:2260-2332`
- **Confidence/limit:** Exact specialized modes remain owner-specific.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-006-what-policy-does-each-fix-input-express)

**Model answer:** Fetch mode states what the caller knows about allocation/residency and what absence means. Latch mode states how the caller will access page bytes. Latch condition states whether an incompatible acquisition may wait. None is a generic performance hint.

**Why:** These choices encode correctness knowledge that the page buffer cannot infer from a VPID alone.

### PGBUF-QB-007 — Where do normal hit and miss paths converge?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:2342-2546`
- **Confidence/limit:** Covers the representative ordinary path, not every fast or specialized family.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-007-where-do-normal-hit-and-miss-paths-converge)

**Model answer:** A hit locates an existing BCB; a miss obtains load ownership, prepares a BCB/frame, reads and publishes the page, then rejoins. Before return, both paths validate the resident page representation and complete latch/fix/holder ownership so the caller sees the same success contract.

**Why:** Publication or residency alone is not caller access; convergence occurs only after the ownership grant is complete.

### PGBUF-QB-008 — Who is the VPID load owner?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:7981-8178,8392-8634`
- **Confidence/limit:** Establishes serialized resident publication, not exactly one physical device read.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-008-who-is-the-vpid-load-owner)

**Model answer:** Any thread can first observe a hash miss, but the VPID-keyed load-lock protocol selects one owner. That owner prepares a provisional BCB/frame not yet usable as the resident mapping, materializes and publishes it, then wakes waiters. A waiter does not inherit the provisional object; it retries lookup against the now-current mapping.

**Why:** Search observation and load ownership occur under different protection, preventing duplicate resident identities without promising lower-layer I/O count.

### PGBUF-QB-009 — Why is VPID checked more than once?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:7594-7722,6670-6703`
- **Confidence/limit:** Explains protected normal-path checks; the lock-free proof has a separate Advanced obligation.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-009-why-is-vpid-checked-more-than-once)

**Model answer:** A hash candidate can become stale between observation and acquiring the protection needed to grant ownership, so the BCB's VPID is rechecked at the protected transition. Release checks the page-to-BCB relationship before decrementing the current ownership. The checks protect different time boundaries and cannot be collapsed into the first lookup.

**Why:** A mutable resident mapping must be validated after every gap in which victimization or reassignment could have occurred.

### PGBUF-QB-010 — What does BCB and page-header agreement mean?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:2442-2472,6670-6703`
- **Confidence/limit:** Detects mapping/representation disagreement; it does not establish caller-specific page type or layout validity.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-010-what-does-bcb-and-page-header-agreement-mean)

**Model answer:** The BCB's resident identity is checked against the identity associated with its frame/page representation. Agreement guards the one-identity/one-resident-frame invariant and catches corruption or a stale association. The caller must still hold a fix/latch and separately validate the subsystem page type and content.

**Why:** Identity coherence, ownership, and logical page validity are three separate obligations.

### PGBUF-QB-011 — Where can an OLD_PAGE miss read from?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:8392-8634`
- **Confidence/limit:** Establishes path choices, not the physical device operation ultimately served by caches or storage.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-011-where-can-an-oldpage-miss-read-from)

**Model answer:** Cold materialization can consult the double-write buffer and otherwise read the main data-volume path before installing the frame. “Data volume” means the normal database-volume source; DWB is the protected page-image path. An increment before that choice or a source call does not prove a physical device miss, because DWB, filesystem, OS, and device caching remain below it.

**Why:** Counter/site evidence identifies a Module event boundary, not every lower-layer I/O consequence.

### PGBUF-QB-012 — What is the resident-hit stale-observation boundary?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:2342-2546,7594-7722`
- **Confidence/limit:** Applies to observations made before protected acquisition; lock-free ordering requires its own proof.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-012-what-is-the-resident-hit-stale-observation-boundary)

**Model answer:** A hash hit is only a candidate observation until the thread protects and revalidates the BCB identity and receives fix/latch ownership. Any VPID, flags, frame association, slot, or content observed across an unprotected gap may be stale. The returned `PAGE_PTR` becomes usable only after the successful ownership postcondition and expires at release.

**Why:** Residency lookup does not extend object lifetime through a protection gap.

### PGBUF-QB-013 — How does a page latch differ from a transaction lock?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Source anchors:** `src/storage/page_buffer.h:189-203`; `src/storage/heap_file.c:23120-23227`
- **Confidence/limit:** Describes the responsibility seam, not every access-method locking rule.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-013-how-does-a-page-latch-differ-from-a-transaction-lock)

**Model answer:** A page latch protects concurrent access to one in-memory page representation for a short physical operation. A transaction lock protects a logical database object and its transaction-level conflict/visibility protocol. Heap mutation composes both because neither implies the other.

**Why:** Substituting one mechanism for the other leaves either page bytes or logical correctness unprotected.

### PGBUF-QB-014 — How do request mode and wait condition differ?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.h:189-203`; `src/storage/page_buffer.c:6560-6594`
- **Confidence/limit:** Predicts contract-level outcomes, not exact queue order or wall-clock delay.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-014-how-do-request-mode-and-wait-condition-differ)

**Model answer:** READ or WRITE expresses the desired content-access compatibility. CONDITIONAL says reject rather than wait when the grant is currently incompatible; UNCONDITIONAL permits the wait protocol, subject to timeout, interrupt, and zero-wait conversion. A resident hit can therefore still block or fail to acquire.

**Why:** Residency and content-concurrency acquisition are independent stages.

### PGBUF-QB-015 — What do fcnt and per-thread holders tell you?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:460-488,6000-6184,6277-6634`
- **Confidence/limit:** Holder structures support thread-local debt inspection in the pinned implementation; diagnostics may still be approximate.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-015-what-do-fcnt-and-per-thread-holders-tell-you)

**Model answer:** BCB `fcnt` tells how many global fixes prevent replacement, not one exclusive owner identity. Each thread's holder list records the BCB and nested `fix_count` it owes. With A and B both fixed, their separate holder records are the back-references; the BCB does not need a single owner-thread field because multiple readers can own it concurrently.

**Why:** Global exclusion from reuse and attribution of release debt are different ledgers.

### PGBUF-QB-016 — How does nested fixing change the ledgers?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:6128-6184,6277-6537,6636-6703`
- **Confidence/limit:** Assumes three successful ordinary fixes and no unrelated owners.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-016-how-does-nested-fixing-change-the-ledgers)

**Model answer:** Initially global `fcnt=3`; A's holder has `fix_count=2`, and B's holder has `fix_count=1`. After A releases once, `fcnt=2`, A remains at one, and B remains at one. Replacement is still excluded because positive global ownership survives.

**Why:** Each successful acquisition creates exactly one debt in both the global total and the acquiring thread's nested ledger.

### PGBUF-QB-017 — What can an unconditional incompatible request do?

- **Evidence:** Interface contract; Verified mechanism; Inference
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:6277-6634,7281-7590`
- **Confidence/limit:** The source confirms bounded exit paths but does not establish strict FIFO or starvation freedom.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-017-what-can-an-unconditional-incompatible-request-do)

**Model answer:** A compatible request may be granted immediately. An incompatible unconditional request may queue and later wake for re-evaluation, but transaction timeout, interrupt, or a configured zero-wait conversion can terminate acquisition without a fix. Exact scheduling and fairness are not caller guarantees.

**Why:** “Unconditional” permits the wait protocol; it does not mean wait forever or inevitably acquire.

### PGBUF-QB-018 — Is fix debt the same as commit debt?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:3062-3201,6636-6883`
- **Confidence/limit:** Names the page-buffer ownership obligation; transaction commit/recovery rules remain caller-specific.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-018-is-fix-debt-the-same-as-commit-debt)

**Model answer:** The correct term here is fix or release debt: every successful fix must receive one matching unfix or ownership transfer. Unfix decrements holder/global ownership and may handle latch/list/waiter transitions. It neither commits a transaction nor substitutes for logging, dirtying, WAL flush, or page propagation.

**Why:** Naming the ledger by the operation that creates and consumes it prevents durability and lifetime protocols from being conflated.

### PGBUF-QB-019 — Why can use-after-unfix appear to work?

- **Evidence:** Interface contract; Inference
- **Canonical guide:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Source anchors:** `src/storage/page_buffer.c:3062-3201,9293-9538`
- **Confidence/limit:** Explains why apparent success is possible, not a guaranteed reuse schedule.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-019-why-can-use-after-unfix-appear-to-work)

**Model answer:** Release does not erase bytes, so an invalid pointer may temporarily show the old contents. But ownership no longer prevents another thread from changing the page or replacement from assigning the frame to another VPID. Every read after unfix is outside the Interface contract regardless of what happened in one run.

**Why:** Pointer validity is an ownership fact, not an observation that bytes have or have not changed yet.

## Caller completes correctness

### PGBUF-QB-020 — What correctness remains with a mutating caller?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Source anchors:** `src/storage/heap_file.c:23120-23324`; `src/storage/page_buffer.c:2260-2685`
- **Confidence/limit:** Uses one representative heap caller; it is not a census proving every caller correct.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-020-what-correctness-remains-with-a-mutating-caller)

**Model answer:** The page buffer supplies resident identity, fix ownership, and the requested page latch. Heap/access-method code chooses intent, validates page type/layout/slot/record, obtains logical locks, selects recovery semantics, performs the mutation, arranges page LSA and dirtying, releases or transfers watchers, and decides retry/error behavior.

**Why:** Generic access cannot infer the logical database operation or its recovery meaning.

### PGBUF-QB-021 — What does NEW_PAGE not do?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Source anchors:** `src/storage/file_manager.c:5420-5590`
- **Confidence/limit:** Shows representative file allocation; exact initialization/logging remains subsystem-specific.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-021-what-does-newpage-not-do)

**Model answer:** File management allocates the identity before fixing it as `NEW_PAGE`. That mode avoids reading an old image while materializing already allocated storage; it does not allocate, choose type/layout, initialize bytes, establish TDE/recovery policy, set the right LSA, mark dirty, or decide release.

**Why:** `NEW_PAGE` communicates caller knowledge to the page buffer rather than transferring allocation ownership into it.

### PGBUF-QB-022 — What becomes stale after ordered release and refix?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) and [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:12268-13531`; `src/storage/heap_file.c:20493-20664`
- **Confidence/limit:** Applies when ordered access reports temporary release; a path that retained ownership has a different boundary.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-022-what-becomes-stale-after-ordered-release-and-refix)

**Model answer:** A refixed watcher may again represent the same VPID, but its raw pointer, page bytes, slot choice, free-space observation, and any page-local derived pointer may have changed while ownership was absent. `page_was_unfixed` tells the caller to recompute these observations rather than treating identity continuity as content continuity.

**Why:** Ordered deadlock avoidance can preserve logical intent while breaking the lifetime of every prior resident observation.

### PGBUF-QB-023 — What is the mutation, logging, LSA, dirty, release order?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Source anchors:** `src/storage/heap_file.c:20821-20939,23120-23324`; `src/transaction/log_manager.c:2194-2226`; `src/storage/page_buffer.c:4983-5055`
- **Confidence/limit:** Represents ordinary heap insertion; recovery mode and specialized operations can vary.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-023-what-is-the-mutation-logging-lsa-dirty-release-order)

**Model answer:** The caller establishes logical locking and a valid destination, mutates through heap/slotted-page code, appends the recovery record with the page address, lets log management advance the page LSA when required, marks the resident generation dirty, then transfers or releases the home watcher and cleans the remaining watcher set on success and error.

**Why:** WRITE permission, recovery meaning, dirty publication, and ownership repayment are adjacent but separate responsibilities.

### PGBUF-QB-024 — What survives the overflow-before-class-lock exit?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Source anchors:** `src/storage/heap_file.c:20469-20486,23217-23220`; `src/storage/overflow_file.c:146-258`
- **Confidence/limit:** Source proves ordering and system-operation attachment, not a surviving production leak or impact.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-024-what-survives-the-overflow-before-class-lock-exit)

**Model answer:** The exit occurs before a destination/home-page watcher is acquired, so it creates no new home-page fix debt. Overflow storage was already created; its successful system operation attached to the outer transaction, making transaction recovery the higher-layer owner. Reachability, rollback outcome, surviving storage, and user-visible impact would still need targeted evidence before a defect claim.

**Why:** An early `return` must be audited from all state accumulated before it, not only local page-buffer ownership.

## Flush one generation

### PGBUF-QB-025 — Why is a WRITE latch not durability?

- **Evidence:** Interface contract; Verified mechanism
- **Canonical guide:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Source anchors:** `src/storage/page_buffer.c:4983-5096,10723-10962`; `src/transaction/log_page_buffer.c:4150-4189`
- **Confidence/limit:** Separates protocol clocks; exact persistence boundary depends on configured DWB/direct-write behavior.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-025-why-is-a-write-latch-not-durability)

**Model answer:** WRITE latch grants exclusive page-byte mutation, not logging or persistence. The caller must establish recovery information and dirty state; transaction commit advances the transaction's log durability, while a later page-buffer flush snapshots a generation, forces WAL through its page LSA, and submits the copied image through DWB or direct data-volume I/O.

**Why:** Concurrency, recoverability, transaction durability, and page propagation have distinct owners and completion events.

### PGBUF-QB-026 — What do page LSA and oldest-unflushed LSA mean?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Source anchors:** `src/storage/page_buffer.c:4983-5055,10723-10962`
- **Confidence/limit:** Describes the pinned generation bookkeeping, not a stable private-field ABI.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-026-what-do-page-lsa-and-oldest-unflushed-lsa-mean)

**Model answer:** Page LSA identifies the latest represented recovery history for the current page image. `oldest_unflush_lsa` is the lower bound retained for the dirty generation that still needs propagation. Dirtying establishes/preserves that lower bound; a flush consumes the copied generation's values without erasing a newer resident generation.

**Why:** One LSA supports recovery ordering while the other helps track the oldest unpropagated generation.

### PGBUF-QB-027 — Where is the WAL-before-data gate?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Source anchors:** `src/storage/page_buffer.c:10723-10962`; `src/transaction/log_page_buffer.c:4150-4189`
- **Confidence/limit:** Proves source ordering at the page-buffer submission boundary, not physical-device completion order or crash behavior.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-027-where-is-the-wal-before-data-gate)

**Model answer:** The copied page may be transformed for TDE and a DWB slot prepared before the WAL call. Before the data image is submitted through DWB or direct file I/O, log management is asked to force WAL through the copied page LSA. A successful page-buffer boundary can mean DWB acceptance or direct-write return; it is not automatically home-page persistence.

**Why:** TDE is an image transformation, DWB is an integrity/propagation mechanism, and WAL is the recoverability ordering gate.

### PGBUF-QB-028 — How can flush succeed while the BCB remains dirty?

- **Evidence:** Verified mechanism
- **Canonical guide:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Source anchors:** `src/storage/page_buffer.c:10723-10962,16077-16126`
- **Confidence/limit:** Establishes generation-preserving state transitions; early exceptional returns have separate proof obligations.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-028-how-can-flush-succeed-while-the-bcb-remains-dirty)

**Model answer:** Starting flush marks G as FLUSHING and clears its old DIRTY marker while copying bytes/LSAs. A concurrent mutation sets DIRTY again for G+1. Completion clears only FLUSHING for G; it must retain the new DIRTY state and lower bound, so the I/O can succeed while the resident BCB still needs another flush.

**Why:** Completion owns the copied generation, not every mutation that happened after the snapshot.

## Replace one frame

### PGBUF-QB-029 — What makes a frame safe to victimize?

- **Evidence:** Verified mechanism; Implementation policy
- **Canonical guide:** [Replace One Frame](../learning/05-replace-one-frame.md)
- **Source anchors:** `src/storage/page_buffer.c:9293-9538`
- **Confidence/limit:** Captures ordinary victim eligibility; direct/specialized protocols add their own transitions.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-029-what-makes-a-frame-safe-to-victimize)

**Model answer:** Policy may choose an LRU domain/zone/candidate, but the frame must be unfixed, clean and not flushing, free of disqualifying waiters/flags, conditionally protectable, and still the expected identity when rechecked under BCB protection before list removal/reuse. `fcnt==0` or zone membership alone omits other owners and in-flight state.

**Why:** Safety predicates authorize reuse; replacement policy only decides where and when to search among safe candidates.

## Maintainer capstone

### PGBUF-QB-030 — What belongs in a page-buffer change-impact plan?

- **Evidence:** Verified mechanism; Inference
- **Canonical guide:** [Maintainer Capstone](../learning/06-maintainer-capstone.md)
- **Source anchors:** `src/storage/page_buffer.c:6000-6055,6457-6522,6595-6617,7738-7773,10795-10923`
- **Confidence/limit:** A source-grounded plan can expose proof obligations but cannot establish reachability or impact without the selected verification.
- **Prompt:** [Attempt this question](./core.md#pgbuf-qb-030-what-belongs-in-a-page-buffer-change-impact-plan)

**Model answer:** Record the Interface family and caller-visible behavior, each state owner and guard, the invariant, every acquisition/transition, success and exceptional exits, cleanup or transfer postconditions, representative caller impact, strongest risk-matched test seam, evidence level currently reached, and uncertainty left open. For candidate paths, explicitly separate visible control flow, reachability, surviving state, production impact, and target-branch status.

**Why:** Safe maintenance requires a closed ownership/evidence argument, not merely a plausible code edit.

## Route navigation

- Return to [Core prompts](./core.md)
- Continue to [Advanced prompts](./advanced.md)
- Return to the [Question-bank entry](./README.md)
