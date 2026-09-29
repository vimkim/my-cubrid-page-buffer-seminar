# F01: Explain and hand-trace replacement from first principles

**What to build:** A required bilingual beginner entry that makes the capacity problem concrete and teaches four policies on a common original trace.

**Blocked by:** None.

**Status:** implemented — integrated and technically verified; human acceptance pending

Implementation and acceptance mapping: [F01 handoff](../F01-handoff.md). The checklist below remains the acceptance contract; implementation evidence does not constitute a human language receipt.

## Context

Read the [specification](../spec.md), [confirmed extension](../../lru-foundations-design/design.md), NOTES.md, and accepted curriculum. Assume basic programming and arrays/linked lists only. Preserve the completed CUBRID example and all existing URLs; do not alter the separate Maintainer Guide audience or introduce a simulator dependency.

## Acceptance criteria

- [ ] Explain memory hierarchy, locality, page versus frame, hits/misses, and miss costs before naming replacement policies.
- [ ] Establish a full fixed-capacity three-frame cache and an absent fourth page; explain system-dependent alternatives without universal crash/data-loss claims.
- [ ] Trace FIFO, OPT/MIN, exact LRU, and Clock on the same authored sequence in the working-set-plus-scan story. Define initialization, tie rules, hand/bit conventions, metadata, victims, and hit/miss totals; independently verify each result.
- [ ] Explain OPT's future-knowledge limitation, exact LRU's maintenance cost, and Clock's approximation. Briefly contrast Random/LFU and use labeled counterexamples when needed rather than claiming a universal winning policy.
- [ ] Include predict/reveal checkpoints, separate instructor explanations, and an unseen-sequence exercise; no automated mastery scores or navigation gates.
- [ ] Attribute conceptual sources using the confirmed reading list and original examples. Keep model limitations visible.
- [ ] Deliver equivalent EN/KO pages and entry/navigation/manifest/coverage updates. Preserve complete reading and no-JavaScript access, accessible disclosures, and presentation controls.
- [ ] Run relevant source/browser tests and both aggregates, inspect served resources and layout, and disclose unavailable/pre-existing failures and pending human review. Record conventions and terminal state for F02.
