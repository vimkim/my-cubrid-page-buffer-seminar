# Core Retrieval Prompts

**Level:** Question bank — Core
**Prerequisites:** Attempt each group after its linked Core page
**Capability gained:** Reconstruct the Core page-buffer model as source traces, ownership ledgers, state timelines, and change-impact artifacts.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract, Verified mechanism, Implementation policy, and Inference from the pinned source and [source inventory](../source-inventory.md)

Attempt these prompts before opening the [Core answers](./core-answers.md). Question order follows the Learning path; the `PGBUF-QB-*` identifier remains stable if editorial order changes.

## Contract and objects

Prerequisite: [Contract and Objects](../learning/01-contract-and-objects.md).

### PGBUF-QB-001 — What does the page-buffer Module own?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Capability tested:** Draw a Module boundary with caller and dependency obligations.
- **Inspect:** `src/storage/page_buffer.h:172-203,266-268,277-305,327-330`; `src/storage/page_buffer.c:2260-2685`

**Question:** Explain why the page buffer is more than an I/O cache, what successful access it owns, and which correctness work remains outside its boundary.

### PGBUF-QB-002 — What exactly does a VPID identify?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Capability tested:** Distinguish logical storage identity from memory and byte addresses.
- **Inspect:** `src/compat/dbtype_def.h:956-961`

**Question:** Define `VPID`, then explain why it is neither a `PAGE_PTR` nor an exact device byte offset.

### PGBUF-QB-003 — How do VPID, BCB, frame, PAGE_PTR, and holder differ?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Capability tested:** Produce an object-and-lifetime map with one owner per state.
- **Inspect:** `src/storage/storage_common.h:146`; `src/storage/page_buffer.c:460-555,5559-5660`

**Question:** Map identity, volatile control state, resident bytes, borrowed view, global ownership count, and per-thread debt without calling all of them “the page.”

### PGBUF-QB-004 — Which page states are independent?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Capability tested:** Classify one page across residency, ownership, concurrency, durability, and replacement axes.
- **Inspect:** `src/storage/page_buffer.c:499-555,4921-5096,9314-9538,10723-10962`

**Question:** Give one legal example showing why resident, fixed, WRITE-latched, dirty, durable, flushed, and victimizable cannot be collapsed into one scalar “page state.”

### PGBUF-QB-005 — What is the shared successful-fix postcondition?

- **Route:** Core
- **Retrieval mode:** Trace
- **Prerequisite:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Capability tested:** Mark the common postcondition reached after hit or miss preparation.
- **Inspect:** `src/storage/page_buffer.c:2260-2685,6277-6634`

**Question:** The fix-contract visual says hit and miss reach the same success postcondition. Name every part of that postcondition and the debt it creates.

## Fix, hold, and release

Prerequisite: [Fix, Hold, and Release](../learning/02-fix-hold-release.md).

### PGBUF-QB-006 — What policy does each fix input express?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Choose fetch knowledge, latch mode, and wait condition for a stated caller.
- **Inspect:** `src/storage/page_buffer.h:172-203`; `src/storage/page_buffer.c:2260-2332`

**Question:** Separate what the caller knows about the VPID, how it will access page bytes, and whether acquisition may wait.

### PGBUF-QB-007 — Where do normal hit and miss paths converge?

- **Route:** Core
- **Retrieval mode:** Trace
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Annotate preparation-specific and common-success regions in one call trace.
- **Inspect:** `src/storage/page_buffer.c:2342-2546`

**Question:** Trace normal residency lookup and cold materialization to the common page-header check, ownership/latch grant, and returned pointer.

### PGBUF-QB-008 — Who is the VPID load owner?

- **Route:** Core
- **Retrieval mode:** Trace
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Draw the owner/waiter/retry timeline for two concurrent misses.
- **Inspect:** `src/storage/page_buffer.c:7981-8178,8392-8634`

**Question:** Why does “the thread that searched for a BCB” not automatically mean “the load owner,” what is the owner's provisional BCB, and what does the waiter do after wakeup?

### PGBUF-QB-009 — Why is VPID checked more than once?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Identify the protection boundary that makes each identity recheck necessary.
- **Inspect:** `src/storage/page_buffer.c:7594-7722,6670-6703`

**Question:** Explain why an initial hash match cannot replace the protected BCB-identity recheck, and why release checks BCB/page identity again instead of trusting an old pointer.

### PGBUF-QB-010 — What does BCB and page-header agreement mean?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Distinguish control-block identity from the identity stored with resident page bytes.
- **Inspect:** `src/storage/page_buffer.c:2442-2472,6670-6703`

**Question:** State which identities are compared, what corruption or stale mapping the check guards against, and why agreement is not a substitute for fix ownership.

### PGBUF-QB-011 — Where can an OLD_PAGE miss read from?

- **Route:** Core
- **Retrieval mode:** Trace
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Trace cold materialization without overclaiming physical device I/O.
- **Inspect:** `src/storage/page_buffer.c:8392-8634`

**Question:** Explain the DWB-versus-data-volume read choices for an old page and why neither the source path nor an `ioreads` counter proves one physical disk operation.

### PGBUF-QB-012 — What is the resident-hit stale-observation boundary?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Mark which observations remain valid before, during, and after ownership acquisition.
- **Inspect:** `src/storage/page_buffer.c:2342-2546,7594-7722`

**Question:** A thread observes a resident BCB, temporarily loses protection, and later acquires it. Which identity and page-local observations must be revalidated, and when does the returned `PAGE_PTR` become trustworthy?

### PGBUF-QB-013 — How does a page latch differ from a transaction lock?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Produce a two-column physical-content versus logical-object protection ledger.
- **Inspect:** `src/storage/page_buffer.h:189-203`; `src/storage/heap_file.c:23120-23227`

**Question:** Explain why a WRITE page latch does not grant logical row/class ownership or transaction isolation, and why a transaction lock does not make page bytes safe to access.

### PGBUF-QB-014 — How do request mode and wait condition differ?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Predict grant, rejection, or wait for compatible and incompatible access.
- **Inspect:** `src/storage/page_buffer.h:189-203`; `src/storage/page_buffer.c:6560-6594`

**Question:** For a resident page already WRITE-latched by another thread, contrast READ/WRITE request mode with CONDITIONAL/UNCONDITIONAL acquisition without promising timing or fairness.

### PGBUF-QB-015 — What do fcnt and per-thread holders tell you?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Reconstruct global and per-thread ownership from the two ledgers.
- **Inspect:** `src/storage/page_buffer.c:460-488,6000-6184,6277-6634`

**Question:** If threads A and B both fix one BCB, where is global debt stored, where can per-thread ownership be found, and why is there no single “BCB owner thread” field?

### PGBUF-QB-016 — How does nested fixing change the ledgers?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Calculate global `fcnt` and holder `fix_count` before and after releases.
- **Inspect:** `src/storage/page_buffer.c:6128-6184,6277-6537,6636-6703`

**Question:** Thread A fixes one page twice and thread B fixes it once. Produce both ledgers, then release A once and explain why the page remains protected from replacement.

### PGBUF-QB-017 — What can an unconditional incompatible request do?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** State the bounded contract without inventing strict FIFO or infinite-wait guarantees.
- **Inspect:** `src/storage/page_buffer.c:6277-6634,7281-7590`

**Question:** Describe grant, queue/wait, timeout, interrupt, and zero-wait conversion outcomes for an incompatible unconditional request.

### PGBUF-QB-018 — Is fix debt the same as commit debt?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Correctly name and discharge ownership, logging, and transaction obligations.
- **Inspect:** `src/storage/page_buffer.c:3062-3201,6636-6883`

**Question:** A reader calls the obligation “commit debt.” Correct the term, identify what unfix repays, and distinguish it from transaction commit and recovery logging.

### PGBUF-QB-019 — Why can use-after-unfix appear to work?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Explain pointer lifetime independently from immediate frame reuse.
- **Inspect:** `src/storage/page_buffer.c:3062-3201,9293-9538`

**Question:** Explain why bytes may look unchanged immediately after unfix while every subsequent dereference is still invalid, including the frame-identity reuse risk.

## Caller completes correctness

Prerequisite: [Caller Completes Correctness](../learning/03-caller-completes-correctness.md).

### PGBUF-QB-020 — What correctness remains with a mutating caller?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Capability tested:** Produce a Module-guarantee versus caller-obligation ledger.
- **Inspect:** `src/storage/heap_file.c:23120-23324`; `src/storage/page_buffer.c:2260-2685`

**Question:** After a successful fix, assign page type/layout checks, logical locking, mutation validity, recovery meaning, page LSA, dirtying, and cleanup to their owning layers.

### PGBUF-QB-021 — What does NEW_PAGE not do?

- **Route:** Core
- **Retrieval mode:** Trace
- **Prerequisite:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Capability tested:** Trace allocation before materialization and caller-owned initialization.
- **Inspect:** `src/storage/page_buffer.c:2380-2616,8392-8634`; `src/storage/file_manager.c:5360-5590`; [NEW_PAGE fetch-mode audit](../reference/new-page-fetch-mode-audit.md)

**Question:** Show why `NEW_PAGE` is caller knowledge after logical allocation, not an allocation, page-type, payload-initialization, logging, or dirtying operation. Explain the different miss and hit behavior, why `OLD_PAGE` is not a safe substitute, and what could be narrowed without removing the no-read semantic operation.

### PGBUF-QB-022 — What becomes stale after ordered release and refix?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Capability tested:** List observations that must be recomputed after `page_was_unfixed`.
- **Inspect:** `src/storage/page_buffer.c:12268-13531`; `src/storage/heap_file.c:20493-20664`

**Question:** An ordered watcher temporarily releases and refixes pages. Explain why the VPID may remain the same while raw pointers, slot choices, space checks, and page-local observations become stale.

### PGBUF-QB-023 — What is the mutation, logging, LSA, dirty, release order?

- **Route:** Core
- **Retrieval mode:** Trace
- **Prerequisite:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Capability tested:** Annotate one complete heap insert success spine and every ownership transfer.
- **Inspect:** `src/storage/heap_file.c:20821-20939,23120-23324`; `src/transaction/log_manager.c:2194-2226`; `src/storage/page_buffer.c:4983-5055`

**Question:** Trace the representative heap insert from logical lock and fixed destination through physical mutation, recovery append, page-LSA update, dirtying, watcher transfer or release, and remaining cleanup.

### PGBUF-QB-024 — What survives the overflow-before-class-lock exit?

- **Route:** Core
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- **Capability tested:** Separate local fix debt from higher-layer transaction-recovery obligation on an early return.
- **Inspect:** `src/storage/heap_file.c:20469-20486,23217-23220`; `src/storage/overflow_file.c:146-258`

**Question:** If overflow insertion succeeds before class-lock acquisition fails, identify what was and was not acquired locally, who owns cleanup, and what further evidence would be needed before calling it a defect.

## Flush one generation

Prerequisite: [Flush One Generation](../learning/04-flush-one-generation.md).

### PGBUF-QB-025 — Why is a WRITE latch not durability?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Capability tested:** Separate concurrency, recoverability, transaction durability, and page propagation clocks.
- **Inspect:** `src/storage/page_buffer.c:4983-5096,10723-10962`; `src/transaction/log_page_buffer.c:4150-4189`

**Question:** Explain what a WRITE latch permits and why logging, commit, dirtying, flush, DWB acceptance, and home-page persistence remain different events.

### PGBUF-QB-026 — What do page LSA and oldest-unflushed LSA mean?

- **Route:** Core
- **Retrieval mode:** Explain
- **Prerequisite:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Capability tested:** Assign the two LSAs to current page history and dirty-generation lower-bound roles.
- **Inspect:** `src/storage/page_buffer.c:4983-5055,10723-10962`

**Question:** Explain how page LSA and `oldest_unflush_lsa` differ, when the lower bound is established, and why neither value alone says the resident generation is durable.

### PGBUF-QB-027 — Where is the WAL-before-data gate?

- **Route:** Core
- **Retrieval mode:** Trace
- **Prerequisite:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Capability tested:** Trace copied-page preparation through WAL force and DWB/direct-write submission.
- **Inspect:** `src/storage/page_buffer.c:10723-10962`; `src/transaction/log_page_buffer.c:4150-4189`

**Question:** Order TDE transformation, DWB-slot preparation, WAL force, and DWB/data-volume submission, then state which completion boundary the page-buffer path actually observes.

### PGBUF-QB-028 — How can flush succeed while the BCB remains dirty?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Capability tested:** Draw a G/G+1 timeline preserving the new dirty generation.
- **Inspect:** `src/storage/page_buffer.c:10723-10962,16077-16126`

**Question:** Snapshot dirty generation G, re-dirty the resident page as G+1 during I/O, and explain which flags and LSA lower bounds completion may clear or preserve.

## Replace one frame

Prerequisite: [Replace One Frame](../learning/05-replace-one-frame.md).

### PGBUF-QB-029 — What makes a frame safe to victimize?

- **Route:** Core
- **Retrieval mode:** Scenario
- **Prerequisite:** [Replace One Frame](../learning/05-replace-one-frame.md)
- **Capability tested:** Produce a hard-predicate versus policy table for one candidate.
- **Inspect:** `src/storage/page_buffer.c:9293-9538`

**Question:** Name the ordinary victim safety predicates, final protected rechecks, and replaceable selection-policy inputs. Explain why `fcnt == 0` or LRU-zone membership alone is insufficient.

## Maintainer capstone

Prerequisite: [Maintainer Capstone](../learning/06-maintainer-capstone.md).

### PGBUF-QB-030 — What belongs in a page-buffer change-impact plan?

- **Route:** Core
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Maintainer Capstone](../learning/06-maintainer-capstone.md)
- **Capability tested:** Produce a reviewable change-impact packet for one proposed exceptional-path change.
- **Inspect:** `src/storage/page_buffer.c:6000-6055,6457-6522,6595-6617,7738-7773,10795-10923`

**Question:** Build a plan naming Interface family, caller-visible behavior, state owner, guard, invariant, acquired state, every exit, caller impact, strongest verification seam, evidence level reached, and remaining uncertainty.

## Route navigation

- Compare only after attempting: [Core answers](./core-answers.md)
- Continue when a task requires deeper policy or concurrency: [Advanced prompts](./advanced.md)
- Return to the [Question-bank entry](./README.md)
