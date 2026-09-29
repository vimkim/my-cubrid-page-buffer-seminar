# 02: Predict cooling, migration, and victim-list selection

**What to build:** A Seminar participant continues the same bilingual trace through scan pressure, cooling, reuse, second-context access, private/shared migration, and victim-list selection, calculating each result from explicit state.

**Blocked by:** 01 — Predict admission and reuse in one bilingual trace (implemented); [F02 — Database bridge](F02-database-bridge.md).

**Status:** ready-for-agent

## Context

Read the [specification](../spec.md), [confirmed design](../design.md), and completed ticket 01's trace and validation handoff. Extend the existing worked-example pair, preserving identities and its accessible fixed-trace interaction. Claims stay pinned to CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912. Do not substitute a simplified small-pool algorithm or introduce a simulator dependency.

## Acceptance criteria

- [ ] Continue the working-set plus sequential-scan workload from established state; explicitly derive threshold-driven zone changes and subsequent reuse/promotion, including unchanged-position cases.
- [ ] Introduce the second context with explicit private-list association and show a source-valid private/shared migration. Explain why list association does not grant exclusive page ownership.
- [ ] Distinguish list-event age, accepted quota-adjustment epoch, and hot-fix history. Supply sufficient inputs to calculate every authored activity/quota consequence, or explicitly define a valid starting value with its evidence boundary.
- [ ] Derive victim-list selection from concrete quota and advertised-candidate state. Separate selecting a list from authorizing reuse of a BCB; preserve qualifications for source anomalies and dormant AOUT.
- [ ] Provide before/event/after predictions and pinned code explanations in English and Korean, with relevant lecture checkpoint/return links. Keep safety and evidence qualifications visible.
- [ ] Verify counts, membership, boundary positions, tick/epoch changes, and continuity with ticket 01 independently of the renderer. Do not skip unspecified insertions when they determine the answer.
- [ ] Preserve direct anchors, backward/forward stepping, language pairing, keyboard operation, presentation mode, and complete no-JavaScript reading. Run aggregates and relevant browser/source checks; report unavailable gates and pending human review.
- [ ] Record terminal and branch-ready states, source evidence, and validation results so tickets 03 and 04 can build on the same baseline.
