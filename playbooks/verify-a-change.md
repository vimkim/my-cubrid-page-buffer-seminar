# Verify at the Risk Boundary

**Level:** Playbook
**Prerequisites:** A stated interface behavior and risk; begin with [Change the Module Safely](./change-safely.md)
**Capability gained:** Choose the weakest sufficient evidence that exercises the actual change risk and disclose what remains untested.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Inference, Runtime observation, and Historical evidence from the [source inventory](../source-inventory.md), [uncertainty registry](../unresolved-or-version-sensitive-findings.md), and the risk statement produced by the change playbook.

## Risk-to-test matrix

| Risk | Minimum useful evidence | Add when the risk crosses… |
|---|---|---|
| Pure helper/state transform | Focused unit test with boundary and negative cases | Integration if real owner/guard behavior is mocked away |
| Exported success/failure contract | Representative caller regression | Multiple caller families if semantics differ |
| Ownership, latch, waiter, stale observation | Deterministic concurrency schedule or controlled interleaving | Repetition/pressure only after the schedule establishes the seam |
| Allocation, read, decrypt, validation, WAL, DWB, write unwind | Fault injection at the named call, with state assertions | Each distinct pre/post-protection failure position |
| Victim/progress/queue policy | Controlled pressure with verified eviction/progress observations | Long-running fairness or performance evidence |
| WAL/page-image/crash invariant | Crash/recovery test with explicit durable boundaries | DWB/home-volume inspection when that exact boundary is claimed |

“Focused unit” means the narrowest real unit that retains the state owner and guard being changed. “Representative caller” means a caller whose ownership and retry behavior exercises the changed interface—not merely any call site.

## Standard build and test route

Configure and build with the project’s supported CMake workflow for the target configuration. Run the focused executable or project-provided test script, then the relevant `ctest` selection, then the broader affected suite. Record the exact CMake configuration, compiler/build type, test filter, and target revision.

Do not substitute a personal wrapper command in organization-facing verification instructions. Report standard build/test concepts and the actual evidence boundary.

## Runtime probe card

**Revision:** Full source commit and any local diff identifier.

**Build:** Compiler, build type, relevant feature/debug options, and binaries used.

**Configuration:** Page-buffer size, DWB/TDE/log/recovery settings, thread count, and other state that changes reachability.

**Workload:** Exact setup, data shape, caller path, concurrency schedule, fault site, duration/repetitions, and cleanup.

**Observer effects:** Logging, probes, breakpoints, counters, timing perturbation, reset/destructive snapshot semantics.

**Observed boundary:** The latest boundary directly observed—for example atomic grant, holder record, WAL force request, DWB acceptance, direct write return, or recovered query result.

**Untested boundary:** State explicitly not observed, such as home-page persistence, exact victimization, crash redo, waiter fairness, or production latency.

**Result and receipt:** Expected versus actual observation, assertion/log location, command/test identifier, and retained artifact.

## Evidence escalation rules

1. Start with source tracing to name owners, transitions, and the risky seam.
2. Use a focused unit only if it retains the real state/guard under risk.
3. Add a representative caller when the contract or cleanup is caller-visible.
4. Use concurrency for ordering/wait/stale-state claims; use fault injection for exceptional unwind.
5. Use controlled pressure only when actual selection/progress is observed.
6. Use crash/recovery when the claim crosses durable recovery—not as a generic “stronger test.”
7. Stop at the observed boundary and disclose the untested one.

The [source inventory](../source-inventory.md) owns existing receipts and reconciliation. The [uncertainty registry](../unresolved-or-version-sensitive-findings.md) owns candidate/current status. Consult [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md) for open source-visible cases.

## Related routes

- [Practice risk-to-test selection](../questions/maintenance-scenarios.md#pgbuf-qb-070-which-verification-seam-crosses-the-actual-risk)
- [Change the Module Safely](./change-safely.md)
- [Flush One Generation](../learning/04-flush-one-generation.md)
- [Replace One Frame](../learning/05-replace-one-frame.md)
- [Source and Caller Map](../reference/source-map.md)
- [Source inventory](../source-inventory.md)
- [Evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md)
- [Failure Unwind and Open Proof Obligations](../advanced/failure-and-proof-obligations.md)
