# Session 3 live seminar design

This author record captures decisions accepted during the `grill-with-docs` interview for the final page-buffer seminar on 2026-10-13. It refines the dedicated participant presentation required by the handoff; the interview is still open, and this document does not report implemented HTML or completed seminar delivery.

Work item 328 owns this design interview. Work item 327 owns the separate presentation implementation. The starting repository commit is `1bba3a1f43e2085cc8507d1040f3ee8bd620627e`. The input is `handoff-page-buffer-session-3-live-seminar-toc-20261012.md`, SHA-256 `17e5854778a19d560dab0cffbfccd278cd7c043d646f230c3aeb1bdc0715c8fe`.

## Settled requirements

The [delivery record](../README.md#seminar-delivery) supplies the three-session history and flexible final duration. The first two sessions covered basics, BCBs, and private/shared LRU organization. The [preparation plan](final-session-preparation.md#preparation-and-delivery) requires a brief retrieval of those concepts and local introduction of WAL, LSA, stable images, and DWB.

The handoff requires a Korean-first root `toc.html`, paired detailed TOCs, and twelve dedicated paired chapters under `ko/seminar-3/` and `en/seminar-3/`, from opening through final defense and closure. The participant presentation must explain its essential arguments itself. Existing lecture and reference URLs remain available, and the Korean spoken companion retains its twelve blocks with exact new screen cues. The current broad curriculum and Maintainer Guide remain separate products.

The [curriculum design](seminar-curriculum-design.md#authority-and-scope), [source inventory](../source-inventory.md), and [uncertainty registry](../unresolved-or-version-sensitive-findings.md) retain technical authority. CUBRID is pinned to `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; PostgreSQL is pinned to `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`. The [defense research](final-session-defense-research.md) supplies the existing claim ledger. The seven-part depth contract in the handoff already requires problem and assumptions, property, mechanism, precise removal, coherent alternative, costs and boundaries, and demanding defense with discriminating evidence. New native execution is not a requirement established by this interview.

## Accepted decisions: round 1

The user accepted Q1, Q2, and Q3 on 2026-10-12. Canonical terms are recorded in [CONTEXT.md](../CONTEXT.md).

| Decision | Accepted choice | Consequence for the presentation |
| --- | --- | --- |
| Q1: connected situation | Use the Session 3 workload throughout: repeated page access, a large scan, and dirty-page pressure in a full finite pool. | Connect each chapter to what the preceding mechanism resolved and what remains. Apply the same workload question to each engine's own protocol. Each constructed interleaving resets independently, so transitions from separate examples do not silently accumulate into a simulated execution. |
| Q2: falsifiable claims | Include a short Seminar experiment proposal for each major performance or progress claim. | State hypothesis, conditions, changed variable, observations, and falsification criterion. Clearly mark unexecuted plans as proposals; preserve the distinction between source reasoning, constructed schedules, and Runtime observations. |
| Q3: projected source reasoning | Show state transitions, owners, and protection conditions first. Use minimal code excerpts where code interpretation is the issue. | Give every implementation claim an exact pinned source route. A source link accompanies an explained transition; it cannot replace the explanation. Avoid turning every screen into a raw-code reading exercise. |

These are presentation choices within the established product contract. They do not establish measured performance, audience understanding, a formal proof, or human language acceptance.

## Decision tree and current frontier

The root is the already requested self-contained final-session participant presentation. The following branches are now settled or ready for user judgment; downstream questions will be recomputed after the next answers.

| Branch | Prerequisite | State | Next decision |
| --- | --- | --- | --- |
| Connected workload | Established topic scope | Settled: Q1 | How the final defense tests transfer across mechanisms |
| Alternative designs | Established depth contract and Q1 | Open: Q4 | Depth and breadth of the alternatives argued on the essential route |
| Falsifiable experiment proposals | Q2 | Open: Q5 | How far each plan reaches toward concrete observation and execution steps |
| Final defense | Q1 and established closure requirement | Open: Q6 | Whether diagnosis reveals evidence progressively and accepts bounded unresolved conclusions |
| Projected source reasoning | Q3 | Settled | Use state/owner/guard explanations and selective code excerpts during implementation |

Q4, Q5, and Q6 are questions awaiting answers, not approved design requirements. No additional ADR is recorded at this stage: the three accepted choices are reversible editorial decisions within the existing architecture.

## Documentation and implementation boundary

Capture resolved terminology and decisions as the interview proceeds. Finish the interview only after its decision frontier is empty and the user confirms shared understanding, following the invoked grilling workflow. The HTML implementation remains work item 327. Local integration of these design documents follows the repository's separate rebase and fast-forward approval workflow.
