# Maintenance Scenario Prompts

**Level:** Question bank — Maintenance scenarios
**Prerequisites:** The Core or Advanced mechanism named by each scenario
**Capability gained:** Produce review, diagnosis, and verification artifacts for realistic page-buffer maintenance decisions.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract, Verified mechanism, Implementation policy, Inference, Runtime observation, and Historical evidence as each scenario permits

Attempt these task packets before opening the [scenario answers](./maintenance-scenarios-answers.md). A good response names the state owner, governing invariant, failure or symptom discriminator, and strongest justified verification seam.

## Change safely

Route owner: [Change the Module Safely](../playbooks/change-safely.md).

### PGBUF-QB-056 — Is the proposed change a contract change or a policy change?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Change the Module Safely](../playbooks/change-safely.md)
- **Capability tested:** Produce a caller-impact table before reviewing a page-buffer diff.
- **Inspect:** `src/storage/page_buffer.h:226-486`; the changed implementation region and every interface-family caller

**Question:** A patch changes victim selection and adds a new failure return. Classify each part, list affected callers and invariants, and state the minimum review evidence for each.

### PGBUF-QB-057 — What does a new early return still own?

- **Route:** Maintenance scenario
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Change the Module Safely](../playbooks/change-safely.md)
- **Capability tested:** Build an acquired-state exit table for a newly introduced failure.
- **Inspect:** `src/storage/page_buffer.c:6000-6055,6457-6522,7738-7773`

**Question:** A helper can now fail after latch/fix state changes. Produce an exit table covering identity, mutex/latch, global and per-thread debt, queues, flags, wakeups, and error propagation.

### PGBUF-QB-058 — How would you investigate post-acquisition candidates VS-10 and VS-11?

- **Route:** Maintenance scenario
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md)
- **Capability tested:** Separate visible control flow, supported reachability, surviving state, impact, and branch status.
- **Inspect:** `src/storage/page_buffer.c:6000-6055,6457-6522,6595-6617,7738-7773,8510-8515`; registry `VS-10` and `VS-11`

**Question:** Write a fault-injection packet for the DWB-read and holder-allocation candidates without calling either a confirmed defect.

### PGBUF-QB-059 — How would you review flush candidates VS-12 and VS-13?

- **Route:** Maintenance scenario
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Capability tested:** Audit both dirty-generation ledgers and caller error visibility.
- **Inspect:** `src/storage/page_buffer.c:6860-6875,10795-10923`; registry `VS-12` and `VS-13`

**Question:** Design separate review artifacts for an early TDE/DWB-slot failure and an unfix-triggered deferred failure, including what can and cannot reach the caller.

### PGBUF-QB-060 — What would close proof obligation VS-14?

- **Route:** Maintenance scenario
- **Retrieval mode:** Proof obligation
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Combine a memory-order argument with a controlled identity/reuse schedule.
- **Inspect:** `src/storage/page_buffer.c:7725-7786`; registry `VS-14`

**Question:** Specify the state timeline, observations, and assertions needed to justify lock-free READ-hit success without a post-CAS VPID recheck.

### PGBUF-QB-061 — How should source anomalies VS-15 and VS-16 be promoted or dismissed?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md)
- **Capability tested:** Produce reachability and target-branch status checks for assertion and diagnostic anomalies.
- **Inspect:** `src/storage/file_manager.c:6296-6299`; `src/storage/page_buffer.c:15314-15335`; registry `VS-15` and `VS-16`

**Question:** For each anomaly, distinguish parsed source, active build configuration, reachable execution, surviving production state, and evidence needed before changing code.

## Diagnose by symptom

Route owner: [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md).

### PGBUF-QB-062 — Is the symptom fix debt, a latch wait, or a transaction lock?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Fix, Hold, and Release](../learning/02-fix-hold-release.md)
- **Capability tested:** Build a wait-owner discriminator and two-ledger trace.
- **Inspect:** `src/storage/page_buffer.c:6000-7582`; representative caller lock acquisition

**Question:** A request stalls and later reports held pages. Decide which observations distinguish a holder leak, page-latch queue, cold-load owner, and transaction-lock wait.

### PGBUF-QB-063 — Where can a cold-miss performance regression arise?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Trace latency seams without equating a page-buffer miss with device latency.
- **Inspect:** `src/storage/page_buffer.c:7981-8178,8290-8634`

**Question:** A repeated scan becomes slow after restart. Produce a latency decomposition for lookup, load ownership, frame acquisition, DWB/volume read, validation, publication, and latch wait, plus one discriminator per seam.

### PGBUF-QB-064 — What can a cold/warm hit-rate observation prove?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Specialized Interfaces and Approximate Observability](../advanced/specialized-interfaces.md)
- **Capability tested:** Write a claim/evidence/alternative-explanation table for a cold/warm scan.
- **Inspect:** `src/storage/page_buffer.c:8497`; [executed evidence inventory](../source-inventory.md)

**Question:** A first scan reports positive page-buffer ioreads and an immediate repeat reports zero. State the strongest supported claim and every important boundary it leaves open.

### PGBUF-QB-065 — Which increment sites define the reported metric?

- **Route:** Maintenance scenario
- **Retrieval mode:** Trace
- **Prerequisite:** [Specialized Interfaces and Approximate Observability](../advanced/specialized-interfaces.md)
- **Capability tested:** Produce a metric-definition card from increment, snapshot, reset, and field-mapping sites.
- **Inspect:** `src/storage/page_buffer.c:8497,11656-11675`; SHOW/statistics readers on the target branch

**Question:** Before using fetch, ioread, iowrite, dirty, or flushed values in a diagnosis, trace what one increment means and identify destructive, approximate, or multiplicity effects.

### PGBUF-QB-066 — How would you investigate duplicate residency or identity corruption?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Contract and Objects](../learning/01-contract-and-objects.md)
- **Capability tested:** Build an identity/publication timeline with protected rechecks.
- **Inspect:** `src/storage/page_buffer.c:7725-7786,7981-8178,8392-8634,9293-9538`

**Question:** A crash suggests two BCBs may have represented one VPID. Identify the owners and observations needed to distinguish duplicate publication, stale lookup, victim rebind, and a misleading crash symptom.

### PGBUF-QB-067 — Is persistent DIRTY or FLUSHING a newer generation or a failed unwind?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Flush One Generation](../learning/04-flush-one-generation.md)
- **Capability tested:** Draw a G/G+1 and error-unwind state timeline.
- **Inspect:** `src/storage/page_buffer.c:10795-10952`; registry `VS-12` and `VS-13`

**Question:** A page remains dirty after a reported flush. Specify how to discriminate valid concurrent re-dirty, deferred completion, WAL/DWB/write failure, lost wakeup, and bookkeeping damage.

### PGBUF-QB-068 — Why can the allocator report no victim?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Replacement Progress](../advanced/replacement-progress.md)
- **Capability tested:** Separate hard eligibility rejection from search/progress policy.
- **Inspect:** `src/storage/page_buffer.c:8290-8389,9293-9538,13942-14440,15420-15627`

**Question:** Under verified pool pressure, build a rejection table for fixed, dirty, flushing, waiter-owned, direct-reserved, and policy-deprioritized candidates, then select the next probe.

### PGBUF-QB-069 — What must be reread after ordered access temporarily releases pages?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Acquisition Concurrency](../advanced/acquisition-concurrency.md)
- **Capability tested:** Audit watcher ownership and stale page-local observations across release/refix.
- **Inspect:** `src/storage/page_buffer.c:12268-13531`; `src/storage/heap_file.c:20493-20664`

**Question:** A caller uses an offset captured before ordered refix and later sees corruption. Produce a watcher timeline and name every observation that must be reconstructed.

## Verify at the risk boundary

Route owner: [Verify at the Risk Boundary](../playbooks/verify-a-change.md).

### PGBUF-QB-070 — Which verification seam crosses the actual risk?

- **Route:** Maintenance scenario
- **Retrieval mode:** Scenario
- **Prerequisite:** [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- **Capability tested:** Select regression, controlled schedule, fault injection, pressure, or crash/recovery evidence and disclose its limit.
- **Inspect:** The changed source seam, representative callers, and existing receipts in the [source inventory](../source-inventory.md)

**Question:** Given one contract change, one waiter race, one allocation failure, one victim-policy change, and one WAL/page-image change, produce a risk-to-test matrix and reject evidence that stops before the risky boundary.

## Route navigation

- Compare only after attempting: [Scenario answers](./maintenance-scenarios-answers.md)
- Rehearse mechanisms directly: [Core prompts](./core.md) and [Advanced prompts](./advanced.md)
- Return to the [Question-bank entry](./README.md)
