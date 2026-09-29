# Textbook-first page-buffer replacement seminar design

Status: confirmed by the user on 2026-09-29 after acceptance of Q1–Q6 and the consolidated design. Work item: 215.

Decision history: [interview](interview.md). This design revises the entry to the existing bilingual seminar, not the separate English Maintainer Guide. It supersedes only the prior assumption that a brief textbook-LRU reminder is sufficient and the restriction that all conceptual cross-engine orientation must come late. Other accepted curriculum decisions remain in force.

## Audience and destination

Assume basic programming and familiarity with arrays and linked lists, but no prior buffer-pool, virtual-memory, or WAL knowledge. Teach those concepts as they become necessary. College-sophomore accessibility describes the starting point, not a reduced final destination: participants still progress to source tracing, replacement safety/progress reasoning, and a defensible CUBRID policy-change proposal.

Keep Korean as the primary live experience and English as the canonical seminar wording. Retain the existing no-total-duration-cap decision, all required Core and Advanced coverage, stable URLs, no-JavaScript reading, and human language-review requirements.

## Teaching sequence

1. **Limited fast storage.** Establish the memory-hierarchy motivation, caching, page versus frame, locality, hits, misses, and the cost of accessing a slower backing store. Distinguish the requested data identity from the reusable storage slot.
2. **The capacity problem before the algorithm.** Fill three frames and request an absent fourth page. State fixed capacity and the system contract before asking what happens without replacement. Discuss eviction, permitted bypass, waiting/refusal, and growth where allowed; do not imply universal crashing or data loss.
3. **Policy as a choice.** Trace FIFO, OPT/MIN, exact LRU, and Clock/second chance on one authored reference sequence. Show frame contents, hit/miss, victim, and policy metadata. Define initial state and deterministic tie/hand/reference-bit conventions. Use OPT as an offline benchmark, not an implementable prediction oracle. Contrast Random and LFU briefly.
4. **Limits and transfer.** Explain why LRU need not win, why metadata and synchronization costs matter, and how approximation differs from exact recency. Use brief labeled counterexamples when the central sequence cannot demonstrate a limitation. Transfer the capacity problem to OS pages, CPU cache lines, application objects, and database pages without treating their policies or legal victims as interchangeable.
5. **Database constraints.** Extend the recurring workload with in-use/pinned and dirty pages. Separate policy preference from legal reuse, dirty writeback from eviction, and safety from progress. Introduce durability/WAL concepts before relying on them. Give a conceptual PostgreSQL/InnoDB bridge; detailed revision-specific comparisons remain later.
6. **CUBRID mechanism and defense.** Enter the existing object/acquisition/ownership route with prerequisites now established. Continue to the pinned-source replacement example, then cooling, migration, candidate selection, safe reuse, progress branches, and the accepted policy-defense exercise.

## One recurring example, explicit model boundaries

Use a recurring hot working set interrupted by a sequential scan. Start in an abstract three-frame cache, compare the four policies on the same requests, and extend the story in explicit phases for database constraints.

Map the workload shape—not fabricated three-frame implementation arithmetic—into the existing source-derived CUBRID larger-pool snapshot. Preserve the completed admission/reuse example from commit 45435a9. Each transition between models states what carries forward and what changes. Incompatible concurrency branches begin from named checkpoints rather than becoming one impossible history.

Reference strings, exact phase boundaries, page filenames, and visual layout are routine authoring choices to verify, not additional preference questions.

## Learning checks

Use predict-before-reveal checkpoints with separate instructor explanations, accessible disclosures, and no navigation locks. An unseen sequence checks transfer beyond memorizing the demonstrated trace.

Participants should explain misses and victims, update policy metadata, distinguish a preferred victim from a reusable frame, explain how protected pages affect progress, and compare policies using workload behavior and maintenance costs. Later checks retain exact source-linked CUBRID transitions and the final proposal to promote every resident hit immediately to LRU1. Participants may defend or reject that proposal; no improvement is presumed and no engine modification is authorized.

These are low-stakes learning checks, not a formal graded certification. Human-reviewed reasoning remains the learning evidence; the site does not store scores or claim mastery automatically.

## Integration and evidence

Add a required foundations block before current Lecture 1. Preserve existing lecture URLs and completed CUBRID work. Update paired navigation, syllabus, prerequisites, introductions, presenter guidance, manifest, and coverage together. Reconcile the Seminar participant glossary entry and the accepted curriculum's audience/comparison rules; retain the Target maintainer definition for the English Maintainer Guide. Keep conceptual explanations canonical and link rather than duplicate deeper evidence.

Use [OSTEP's replacement-policy chapter](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys-policy.pdf) as a textbook anchor and [CMU's buffer-pool lecture](https://15445.courses.cs.cmu.edu/spring2026/slides/04-bufferpool.pdf) as a database teaching bridge. Author original examples and illustrations. Implementation-specific database claims require appropriate first-party revision evidence, not a textbook analogy. CUBRID claims remain pinned to f799e05d77d5300c6ea5753b4a6cc7caee6d8912.

Verify every hand trace, its metadata conventions, answers, and hit/miss arithmetic. Keep constructed examples separate from runtime observations and avoid unsupported performance/fairness claims. The independent simulator and new native experiments remain outside the enhancement's prerequisites.

## Delivery order and verification

After confirmation, revise the specification and task dependencies to put the foundational teaching slice before remaining CUBRID replacement tickets. Complete the beginner entry and bridge, then resume the accepted cooling/migration, safety/progress, policy-defense, and integrated-delivery work. Ticket01 remains preserved rather than redone.

Run the existing aggregate guide and bilingual-site checks, relevant tests, served-resource checks, and available browser checks. Verify reading/projection, mobile width, keyboard disclosure, links, paired content, and no-JavaScript access. Report pre-existing failures and unavailable checks separately. Human Korean-naturalness and semantic-parity review remains a distinct required gate; automated checks do not substitute for it.
