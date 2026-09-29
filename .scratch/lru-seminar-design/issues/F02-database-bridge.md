# F02: Transfer replacement fundamentals into databases and CUBRID

**What to build:** A bilingual bridge that extends the recurring workload into real-system constraints and prepares participants for the existing CUBRID path.

**Blocked by:** [F01](F01-replacement-foundations.md).

**Status:** ready-for-agent

## Context

Read the [specification](../spec.md), [confirmed extension](../../lru-foundations-design/design.md), F01 handoff, and [ticket01 handoff](../ticket01-handoff.md). Maintain the distinction between a textbook model and the pinned CUBRID implementation. Detailed source-level database comparisons remain late.

## Acceptance criteria

- [ ] Explain concise OS-page, CPU-cache-line, and application-object examples, including differences in units, management, and permitted victim choices. Do not describe all caches as interchangeable page buffers.
- [ ] Give a deeper conceptual PostgreSQL/InnoDB orientation with first-party evidence appropriate to any version-specific claims; retain later detailed comparison routes.
- [ ] Extend the workload with in-use/pinned and dirty pages. Distinguish preferred victims from safe reuse, writeback from eviction, and safety from eventual progress. Introduce durability/WAL concepts before relying on them.
- [ ] Show prediction checkpoints where a preferred page cannot be reused; explain permitted next actions without unsupported fairness or timing guarantees.
- [ ] Explicitly map the recurring workload shape into the existing source-derived CUBRID snapshot. Do not imply three-frame toy arithmetic is faithful CUBRID behavior or label constructed state as runtime observation.
- [ ] Connect the new entry to current Lecture 1 and the eventual replacement example with clear prerequisite and return routes, preserving stable URLs and prior required coverage.
- [ ] Update EN/KO pairing, coverage, syllabus and presenter facilitation guidance together; retain accessible reading, presentation, keyboard and no-JavaScript behavior.
- [ ] Run relevant checks and aggregates and record evidence, unavailable/pre-existing failures, and actual human-review status. Supply a handoff enabling ticket02 to resume without repeating ticket01.
