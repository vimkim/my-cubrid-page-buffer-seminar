# Session 3 live seminar design

This author record captures decisions accepted during the `grill-with-docs` interview for the final page-buffer seminar on 2026-10-13. It refines the dedicated participant presentation required by the handoff. All six design decisions are settled, and the user confirmed shared understanding in Q7 on 2026-10-12. This document does not report implemented HTML or completed seminar delivery.

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

## Accepted decisions: round 2

The user accepted Q4, Q5, and Q6 on 2026-10-12.

| Decision | Accepted choice | Consequence for the presentation |
| --- | --- | --- |
| Q4: alternative depth | Fully argue at least one coherent alternative for each major mechanism, while preserving comparison of every alternative named in the handoff. | Explain the representative alternative's additional state, protection conditions, failure handling, and costs. State the assumptions and costs of the remaining alternatives. Keep the implemented protocol, the precisely removed mechanism, and the coherent replacement distinct. |
| Q5: concrete observation plans | Specify exactly where and what to observe, beyond broad latency and throughput measures. | Distinguish existing statistics from observations requiring additional probes. Name proposed probe locations, events, decision criteria, and observer effects. Additional instrumentation remains a writing plan unless actual implementation and execution evidence is recorded. |
| Q6: staged final diagnosis | Add a Staged diagnostic case that exposes new evidence after participants select their next observation. | Publish the initial premises before prediction, then narrow competing hypotheses with successive constructed observations. Accept an explicitly bounded unresolved conclusion where evidence is insufficient. Preserve the existing closing cases and complete page journey. |

The Staged diagnostic case is a new final-defense exercise, not a rewrite of every existing trace. Keep each earlier schedule's independent reset, visible premises, and closed model answer. New diagnostic evidence is authored as a constructed case unless a real receipt supports a Runtime observation label. Neither the exercise nor its proposed experiments score participant mastery.

## Applying the accepted choices

Use the common workload to connect the chapters without pretending that two engines execute the same state machine. Each explanation identifies its actors, frame or image, independent state axes, relevant owner and protection, then the guarded event. The reader can distinguish a past completion from permission to act on current state.

The essential route retains every major mechanism's problem, property, implementation, removal schedule, alternative, costs and limits, and defense. State/owner/guard reasoning remains visible at normal presentation type sizes. Split dense arguments into focused screens instead of shrinking them or outsourcing essential understanding to reference pages. The detailed TOCs and Korean script must address those exact screens; sources and optional catalogs can remain disclosed or linked.

Extend each Seminar experiment proposal with a pinned revision and build/configuration premise, controlled workload or interleaving, observation method, and the boundary that its result could establish. Use the existing [Runtime probe card](../playbooks/verify-a-change.md#runtime-probe-card) for recording conditions and observer effects. Explain which plausible alternatives the observation separates and which conclusions remain unsupported. A condition under which the hypothesis would fail must be explicit.

Existing [daemon observability guidance](../reference/page-buffer-daemon-lifecycle-audit.md#observability-already-exposed-by-the-daemon-framework) and [defense diagnosis questions](final-session-defense-research.md#synthesis-and-diagnosis) provide starting points for observation plans. Before claiming that a metric observes a protected transition, verify its counting location and meaning against the pinned source. Correlate candidate selection, rejection, submission, completion, offer, and final reuse only where the evidence actually exposes those events. Aggregate counters and hypothetical probes cannot supply an unrecorded per-frame runtime history.

All implementation-specific material must be rechecked during work item 327. This design record introduces presentation obligations, not new findings about either engine or changes to the uncertainty registry.

## Decision tree and current frontier

The root is the already requested self-contained final-session participant presentation. Every design branch visited in the two rounds is settled. The design frontier is empty, and Q7 supplies the final shared-understanding confirmation required by the grilling workflow.

| Branch | Prerequisite | State | Result |
| --- | --- | --- | --- |
| Connected workload | Established topic scope | Settled: Q1 | Recurring workload question with independently reset engine-specific schedules |
| Alternative designs | Established depth contract and Q1 | Settled: Q4 | Detailed representative replacement protocol and preserved breadth of comparison |
| Falsifiable experiment proposals | Established evidence contract | Settled: Q2 | Hypothesis, conditions, changed variable, observations, and falsification criterion |
| Concrete observation plans | Q2 | Settled: Q5 | Existing observables versus proposed probes, with explicit criteria and observer effects |
| Final defense | Q1 and established closure requirement | Settled: Q6 | Staged diagnostic evidence and bounded conclusions, preserving earlier closing cases |
| Projected source reasoning | Established source contract | Settled: Q3 | State/owner/guard explanations and selective code excerpts |

No additional ADR is recorded: these are reversible editorial choices within the existing architecture. Implementation details such as screen counts, exact example values, and the representative alternatives are resolved by authors within the handoff's named coverage, source constraints, and accepted choices.

In Q7 the user explicitly confirmed shared understanding and approved rebasing and fast-forward merging the completed design-document changes into local `main`. This approval applies to the documentation integration.

## Documentation and implementation boundary

The design interview is complete: its decision frontier is empty, terminology and decisions are recorded, and the user has confirmed shared understanding. Work item 327 owns HTML implementation, using this accepted design together with the original handoff. Its completed presentation will require its own review and local integration approval under the established Git workflow.
