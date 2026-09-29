# 04: Defend the immediate-promotion proposal

**What to build:** A Target maintainer can use the same worked example to defend or reject “promote every resident hit immediately to LRU1,” connecting changed behavior to invariants, synchronization costs, counterexamples, and a verification plan.

**Blocked by:** 02 — Predict cooling, migration, and victim-list selection.

**Status:** implemented — integrated and technically verified; human acceptance pending

Implementation and acceptance mapping: [ticket04 handoff](../ticket04-handoff.md) and [combined integration](../integration-handoff.md). The checklist below remains the acceptance contract; implementation evidence does not constitute a human language receipt.

## Context

Read the [specification](../spec.md), [confirmed design](../design.md), and tickets 01–02's delivered baseline. This exercise is a hypothetical policy review, not an engine implementation. CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912 remains the factual baseline. Ticket 03 is not a prerequisite: the comparison uses ordinary-policy checkpoints from ticket 02 and existing canonical safety explanations.

## Acceptance criteria

- [ ] Precisely define the hypothetical hit trigger, list destination, interaction with existing private/shared policy, and necessary synchronization assumptions before asking participants to compare outcomes.
- [ ] Present baseline and alternative steps on the same starting workload/state, visibly distinguishing hypothetical behavior from verified pinned behavior.
- [ ] Ask participants to identify changed movement, unchanged safety obligations, possible synchronization/maintenance cost, and workload-dependent advantages or disadvantages. Do not assert a performance improvement without measurements.
- [ ] Provide an evidence-bounded model review and human-review rubric covering before/after reasoning, controlling source paths, invariants, counterexamples, and an actionable correctness/performance verification plan.
- [ ] Integrate the exercise into the worked-example pair and existing final technical-defense route with working checkpoint and return navigation.
- [ ] Preserve natural Korean/English equivalence, accessible prediction/reveal, and complete no-JavaScript reading. Do not collect answers or assign automated mastery scores.
- [ ] Check that alternative calculations follow the explicitly defined proposal and baseline calculations follow pinned source. Run aggregate and relevant navigation/disclosure/browser checks; record pending human-review or unavailable gates.
- [ ] Record delivery/source locations and validation evidence for final integration. Make no engine changes and require no new native experiment for this ticket.
