# Maintenance Scenario Answers

**Level:** Question bank — Maintenance-scenario answers
**Prerequisites:** Attempt the matching item in [Maintenance scenarios](./maintenance-scenarios.md)
**Capability gained:** Evaluate a maintenance decision path against canonical owners, state ledgers, evidence boundaries, and risk-matched verification.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract, Verified mechanism, Implementation policy, Inference, Runtime observation, and Historical evidence as each answer permits

Use IDs to pair these answers with [Maintenance scenarios](./maintenance-scenarios.md). Candidate status remains owned by the [evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md).

## Change safely

### PGBUF-QB-056 — Is the proposed change a contract change or a policy change?

- **Evidence:** Interface contract and Implementation policy
- **Canonical guide:** [Change the Module Safely](../playbooks/change-safely.md)
- **Source anchors:** `src/storage/page_buffer.h:226-486`; changed implementation and caller sites
- **Confidence/limit:** The classification is exact only after tracing caller-visible outcomes; a selection-policy edit that adds a return state has crossed into contract.

**Model answer:** Produce two rows. The victim-selection row is policy if final protected eligibility and all caller-visible outcomes remain unchanged; review hard invariants first, then pressure and progress. The new failure row is contract: name its return, error, retained ownership, retry owner, and every caller family that can observe it. Link each touched field to its owner and require a representative negative-path test for the contract row.

**Why:** “Only policy” is unsafe shorthand when a diff also changes ownership or failure semantics.

### PGBUF-QB-057 — What does a new early return still own?

- **Evidence:** Verified mechanism and Inference
- **Canonical guide:** [Change the Module Safely](../playbooks/change-safely.md)
- **Source anchors:** `src/storage/page_buffer.c:6000-6055,6457-6522,7738-7773`
- **Confidence/limit:** An exit table identifies obligations; only exercising the failure seam establishes reachable surviving state.

**Model answer:** Make one row per exit and columns for BCB identity/hash membership, mutex, atomic latch tuple, global `fcnt`, per-thread holder debt, queue/load owner, dirty/flush state, wakeup, error, and retry owner. Fill the row from all preceding calls, including helper transfers. An exit is reviewable only when each acquired item is transferred, consumed, restored, or deliberately retained by a named owner.

**Why:** Local cleanup review misses state acquired by callees or before the edited block.

### PGBUF-QB-058 — How would you investigate post-acquisition candidates VS-10 and VS-11?

- **Evidence:** Verified mechanism and Inference
- **Canonical guide:** [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md)
- **Source anchors:** `src/storage/page_buffer.c:6000-6055,6457-6522,6595-6617,7738-7773,8510-8515`; [registry](../unresolved-or-version-sensitive-findings.md)
- **Confidence/limit:** Both remain candidates until supported reachability and surviving state are observed on the target branch.

**Model answer:** For `VS-10`, force `dwb_read_page()` failure after proving the cold-load branch is active; record provisional BCB identity, hash/load-lock ownership, cleanup, publication, waiter wakeup, and retry. For `VS-11`, force holder extension failure separately after normal, lock-free, and awakened-waiter grants; compare atomic latch/`fcnt` with the thread holder list. For each, report source path, configuration reachability, surviving state, caller result, possible impact, and target commit independently.

**Why:** Seeing an early return is not proof that supported execution reaches it or leaks production state.

### PGBUF-QB-059 — How would you review flush candidates VS-12 and VS-13?

- **Evidence:** Verified mechanism and Inference
- **Canonical guide:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Source anchors:** `src/storage/page_buffer.c:6860-6875,10795-10923`; [registry](../unresolved-or-version-sensitive-findings.md)
- **Confidence/limit:** `VS-12` is a candidate; `VS-13` is verified behavior with open impact. The registry owns current status.

**Model answer:** For `VS-12`, inject TDE and DWB-slot failures separately and capture `DIRTY`, `FLUSHING`, copied versus resident generation, `oldest_unflush_lsa`, waiters, victim eligibility, and retry before and after return. For `VS-13`, draw the unfix-triggered call chain and record that the interface has no error return; then decide whether monitoring/retry is the intended owner or whether the contract must change. Do not merge the two: one asks whether state unwinds; the other asks how a verified failure is surfaced.

**Why:** A correct retryable state and an observable failure are different obligations.

### PGBUF-QB-060 — What would close proof obligation VS-14?

- **Evidence:** Inference
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:7725-7786`; [registry](../unresolved-or-version-sensitive-findings.md)
- **Confidence/limit:** No passing stress count alone closes the proof; memory ordering and the identity/reuse transition both matter.

**Model answer:** State the invariant that a successful CAS creates positive `fcnt` before victim reuse can rebind the permanent BCB, and name the reads ordered around it. Drive a schedule in which lookup observes the old VPID while victim selection tries removal/rebind; log VPID, hash membership, atomic latch tuple, `fcnt`, and final returned identity. Assert either reuse loses before grant or the acquisition retries/fails. Pair the schedule with a source-level happens-before argument for every observation.

**Why:** The missing post-CAS recheck makes the reuse-exclusion argument itself the proof boundary.

### PGBUF-QB-061 — How should source anomalies VS-15 and VS-16 be promoted or dismissed?

- **Evidence:** Inference and Historical evidence
- **Canonical guide:** [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md)
- **Source anchors:** `src/storage/file_manager.c:6296-6299`; `src/storage/page_buffer.c:15314-15335`; [registry](../unresolved-or-version-sensitive-findings.md)
- **Confidence/limit:** Textual anomalies do not establish active production defects.

**Model answer:** For `VS-15`, determine whether assertions are compiled, trace a normal successful `file_dealloc()` caller, and observe the exit under the target build. For `VS-16`, expand relevant macros/data flow, compile the diagnostic branch, and execute it if safely reachable while checking the VPID passed to output. Report production state separately: the first may affect an assertion build; the second is currently framed as diagnostic reliability. Update status only with target commit and retained receipt.

**Why:** Build configuration and reachability can turn suspicious text into dead code, diagnostic-only impact, or a confirmed failure.

## Diagnose by symptom

### PGBUF-QB-062 — Is the symptom fix debt, a latch wait, or a transaction lock?

- **Evidence:** Interface contract and Verified mechanism
- **Canonical guide:** [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- **Source anchors:** `src/storage/page_buffer.c:6000-7582`; representative caller lock sites
- **Confidence/limit:** A remaining-hold report is a symptom, not the owner classification by itself.

**Model answer:** Correlate BCB `fcnt` with the current thread holder and nested count to identify fix debt. For a page-latch wait, capture VPID, requested mode/condition, current holders, waiter state, timeout/interrupt result. For cold load, capture the VPID-keyed owner and provisional publication. For transaction lock, capture logical object, transaction holder/waiter, and lock result. Do not use evidence from one class to conclude another.

**Why:** These waits have different owners, queues, lifetimes, and fixes despite a common “hang” symptom.

### PGBUF-QB-063 — Where can a cold-miss performance regression arise?

- **Evidence:** Verified mechanism and Inference
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:7981-8178,8290-8634`
- **Confidence/limit:** Source tracing identifies seams; timing probes are required to attribute the regression.

**Model answer:** Divide the path into hash lookup, VPID load-owner wait, free/victim BCB acquisition, DWB-versus-volume read, decrypt/validation, publication/retry, and final latch acquisition. At each boundary record time and owner plus state-specific evidence: hash result, load owner, rejection reason, read source, validation result, publication event, and latch queue. Control SQL plan and page-buffer configuration. A page-buffer miss says the page was not resident, not that the operating system or device was cold.

**Why:** One aggregate ioread or elapsed time collapses multiple serialization, policy, CPU, and I/O causes.

### PGBUF-QB-064 — What can a cold/warm hit-rate observation prove?

- **Evidence:** Runtime observation
- **Canonical guide:** [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- **Source anchors:** `src/storage/page_buffer.c:8497`; [source inventory](../source-inventory.md)
- **Confidence/limit:** The retained observation supports one controlled run, not a universal hit rate or physical-device fact.

**Model answer:** The strongest claim is that identical-result scans at the pinned revision showed a first-run page-buffer ioread signature followed by immediate resident reuse consistent with zero recorded ioreads. It does not identify exact VPIDs or frames, distinguish DWB from main-volume source, prove an OS/device cache miss, establish permanent residency, exercise duplicate-load races, or guarantee every second scan is zero. Record configuration, plan, checksum, interval/reset semantics, and raw receipt.

**Why:** A useful observation becomes misleading when its instrumentation boundary is promoted into a stronger storage claim.

### PGBUF-QB-065 — Which increment sites define the reported metric?

- **Evidence:** Verified mechanism and Implementation policy
- **Canonical guide:** [Specialized Interfaces and Approximate Observability](../advanced/specialized-interfaces.md)
- **Source anchors:** `src/storage/page_buffer.c:8497,11656-11675`; target-branch SHOW/statistics readers
- **Confidence/limit:** Exact meanings are revision-sensitive and may differ by branch or configured path.

**Model answer:** Create a card with metric name, every increment branch, unit, multiplicity, snapshot/read site, reset behavior, configuration gates, and unobserved boundary. For example, an ioread increment before DWB-versus-volume resolution cannot identify the source; a dirty count may count calls rather than unique pages; one logical flush may cause multiple writes. Validate the public field mapping rather than inferring meaning from the label.

**Why:** Counter names compress control-flow events and often hide multiplicity and observer effects.

### PGBUF-QB-066 — How would you investigate duplicate residency or identity corruption?

- **Evidence:** Verified mechanism and Inference
- **Canonical guide:** [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- **Source anchors:** `src/storage/page_buffer.c:7725-7786,7981-8178,8392-8634,9293-9538`
- **Confidence/limit:** A crash signature alone does not establish duplicate publication.

**Model answer:** Capture one timeline keyed by VPID and BCB address: hash lookup, protected VPID recheck, load owner, provisional preparation, publication, waiter retry, `fcnt`, victim removal, final eligibility recheck, and rebind. Assert one published mapping per VPID and agreement between mapping and resident header where that invariant applies. Compare the failure against caller page-type validation and memory corruption outside the page buffer before attributing it.

**Why:** Duplicate load, stale observation, victim reuse, and downstream overwrite can present similar late symptoms.

### PGBUF-QB-067 — Is persistent DIRTY or FLUSHING a newer generation or a failed unwind?

- **Evidence:** Verified mechanism and Inference
- **Canonical guide:** [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- **Source anchors:** `src/storage/page_buffer.c:10795-10952`; [registry](../unresolved-or-version-sensitive-findings.md)
- **Confidence/limit:** Resident `DIRTY` after completion is valid when G+1 exists; candidate failure status remains in the registry.

**Model answer:** Record copied generation G, resident generation G+1, page LSA and oldest-unflushed lower bounds, `FLUSHING`, completion/wakeup, WAL force, TDE/DWB/write outcome, and retry owner. If G completes and G+1 remains, persistent dirty is correct. If an error leaves no newer generation but flags or lower bounds are not restored, test the relevant candidate. If completion is deferred, prove which owner clears state and wakes waiters before diagnosing a lost wakeup.

**Why:** “Flush succeeded” describes one copied generation, not necessarily the current resident bytes.

### PGBUF-QB-068 — Why can the allocator report no victim?

- **Evidence:** Verified mechanism and Implementation policy
- **Canonical guide:** [Replacement Progress](../advanced/replacement-progress.md)
- **Source anchors:** `src/storage/page_buffer.c:8290-8389,9293-9538,13942-14440,15420-15627`
- **Confidence/limit:** Search order, quota, and daemon timing are policy; final protected eligibility is the safety boundary.

**Model answer:** For every inspected BCB record identity/zone, `fcnt`, latch/waiter/transient ownership, `DIRTY`, `FLUSHING`, direct-victim reservation, and final recheck result. Hard rejection explains non-reuse; only then examine private/shared placement, quota, candidate hints, direct handoff, flushing progress, wait, timeout, and interrupt. Require evidence that an allocator actually lacked a frame—cache warmth is insufficient.

**Why:** Policy tuning cannot make an ineligible frame safe, and a no-victim symptom does not identify which predicate blocked progress.

### PGBUF-QB-069 — What must be reread after ordered access temporarily releases pages?

- **Evidence:** Verified mechanism and Interface contract
- **Canonical guide:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Source anchors:** `src/storage/page_buffer.c:12268-13531`; `src/storage/heap_file.c:20493-20664`
- **Confidence/limit:** Exact caller observations depend on the page format and callback; the release marker establishes the revalidation duty.

**Model answer:** Track every watcher through initial owner, release, sorted order, refix, callback, transfer, and failure cleanup. When `page_was_unfixed` is set, discard page-local pointers, offsets, slot/record positions, key comparisons, child choice, and any decision derived from mutable bytes; reconstruct them after refix under the new latch. Also revalidate VPID and the caller’s logical traversal assumptions.

**Why:** Reacquiring the same page identity does not preserve observations made while other writers could modify it.

## Verify at the risk boundary

### PGBUF-QB-070 — Which verification seam crosses the actual risk?

- **Evidence:** Verified mechanism and Runtime observation
- **Canonical guide:** [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- **Source anchors:** Changed source and representative callers; existing receipts in the [source inventory](../source-inventory.md)
- **Confidence/limit:** The selected evidence supports only the observed boundary; every untested durable, concurrency, or production boundary must be disclosed.

**Model answer:** Use a representative caller regression for an exported contract, a deterministic interleaving for waiter/identity order, named fault injection with state assertions for allocation unwind, controlled verified pressure for victim policy, and crash/recovery with explicit WAL/page-image durability boundaries for recovery changes. Reject a success-only test for an error seam, repetition without a controlled race, warm-cache counters without eviction, and clean restart without the required fault model. Record revision, build, configuration, workload, observer effect, observed boundary, untested boundary, and receipt.

**Why:** More runtime is not stronger evidence when execution never crosses the risky transition.

## Route navigation

- Return to [Maintenance scenarios](./maintenance-scenarios.md)
- Select a controlled task in [Applied exercises](./applied-exercises.md)
- Return to the [Question-bank entry](./README.md)
