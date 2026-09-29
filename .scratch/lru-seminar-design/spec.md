# Textbook-first replacement foundations and continuous LRU worked example

Status: ready-for-agent

The original product design and its textbook-first extension were confirmed on 2026-09-29. The [extension](../lru-foundations-design/design.md) governs beginner prerequisites and early conceptual comparisons; all other original decisions remain. Ticket 01 is implemented in commit 45435a9. This label records specification readiness, not implementation completion or authorization to modify the engine.

## Problem Statement

Seminar participants can read substantial explanations of CUBRID replacement safety, progress, and private/shared lists, but cannot consistently calculate the next state from the examples. Cooling depends on unspecified later insertions, examples change identities between lectures, and progress scenarios are detached from the main page journey. Source routes are uneven and the final policy-defense rubric lacks a concrete replacement proposal.

## Solution

First provide a required bilingual foundations block before current Lecture 1. Assume basic programming and arrays/linked lists, not buffer-pool or WAL knowledge. Teach capacity, locality, page/frame identity, hits/misses, and full-cache alternatives before comparing FIFO, OPT/MIN, exact LRU, and Clock/second chance by hand. Briefly contrast Random and LFU. Continue through cross-system transfer and database safety/progress constraints into the existing CUBRID route. Retain the maintainer-level destination and separate English Maintainer Guide audience.

Provide one bilingual worked-example page that carries stable frame and page identities through a fully specified constructed trace. Participants predict transitions, reveal the result and source explanation, branch into concurrent schedules, and finish by defending or rejecting a concrete policy change. Existing replacement lectures route into the same trace at relevant checkpoints.

## User Stories

1. As a Seminar participant, I want to see the initial state and assumptions, so that I can predict rather than guess the next transition.
2. As a Seminar participant, I want stable BCB/frame names distinct from VPIDs, so that reuse does not look like allocating another frame.
3. As a Seminar participant, I want a textbook-first introduction and common hand trace for FIFO, OPT/MIN, exact LRU, and Clock, so that I can explain the capacity problem and identify where CUBRID's policy differs.
4. As a Seminar participant, I want to follow admission and final unfix, so that I understand when ordinary list placement occurs.
5. As a Seminar participant, I want access events that leave list position unchanged, so that I do not assume every hit immediately moves a node.
6. As a Seminar participant, I want explicit thresholds and boundary counts, so that I can derive cooling and subsequent promotion.
7. As a Seminar participant, I want repeated working-set access alongside a sequential scan, so that policy consequences have a workload context.
8. As a Seminar participant, I want a second context to access the same page, so that I can distinguish policy association from ownership.
9. As a Seminar participant, I want to track private/shared migration, so that I can explain both membership changes and their protection.
10. As a Seminar participant, I want quota and activity inputs distinguished from other age/history fields, so that I can explain list selection without conflating counters.
11. As a Seminar participant, I want to predict candidate rejection and successful protected reuse, so that I can distinguish preference from safety.
12. As a Seminar participant, I want to follow dirty/re-dirty and direct-victim branches, so that I can explain waiting, revocation, and retry without claiming guaranteed fairness.
13. As a Seminar participant, I want a narrow pinned-source excerpt at each major transition, so that I can locate the predicate, fields, and locks behind the result.
14. As a Seminar participant, I want explanations revealed after prediction, so that I can practice reasoning before seeing the answer.
15. As a Seminar participant, I want deliberate forward/backward navigation and explicit branch starts, so that I can revisit events without mixing incompatible histories.
16. As a Seminar participant, I want a complete readable trace without JavaScript, so that independent reading retains the full explanation.
17. As a Seminar participant, I want equivalent English and natural Korean content, so that live instruction and later reading convey the same mechanism and qualifications.
18. As a Target maintainer, I want to evaluate immediate LRU1 promotion on every resident hit, so that I can defend a change using behavior, invariants, cost, and evidence.
19. As a presenter, I want existing lectures to link to exact example checkpoints, so that I can integrate the trace without replacing the accepted curriculum.
20. As a maintainer of the seminar, I want source provenance and evidence limits attached to the trace, so that a constructed example is never mistaken for runtime measurements.
21. As a maintainer of the seminar, I want existing validation gates to cover the new page and interactions, so that subsequent edits preserve navigation, accessibility, pairing, and evidence qualifications.

## Implementation Decisions

- Use one recurring hot-working-set-plus-scan story. The abstract three-frame trace has explicit initialization, metadata, tie rules, and Clock hand/bit conventions. Carry its workload shape into the faithful CUBRID snapshot, not its toy arithmetic. Permit short labeled counterexamples and an unseen transfer exercise.
- Explain fixed-capacity full-cache misses before discussing absence of replacement; bypass, growth, waiting/refusal depend on the system contract. Never imply inevitable crashing or data loss. Distinguish OS pages, CPU lines, application objects, and database pages.
- Add a conceptual PostgreSQL/InnoDB bridge and pinned/dirty-page constraints before CUBRID. Define durability/WAL before relying on it. Preserve detailed source comparisons late. Use original examples supported by the textbook and primary references selected in the confirmed extension; verify version-specific engine claims separately.
- Preserve the accepted audience-facing curriculum and existing URLs. Add one English/Korean worked-example pair with stable checkpoint anchors and return routes from the replacement lectures and final defense.
- English remains the canonical seminar content; Korean expresses the same meaning naturally. The Maintainer Guide retains ownership of technical explanations; the new example applies and links those explanations.
- Pin all implementation claims to CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912.
- Construct a valid larger-pool snapshot and display a small window into it. Retain actual policy arithmetic, relevant hidden counts, list boundaries, quotas, and execution-context metadata. Specify enough omitted state to make outcomes determinate.
- Use stable BCB/frame identities, changing VPIDs, and two explicit contexts. Combine a frequently reused working set and a competing sequential scan.
- Present before state, event, prediction, revealed after state, explanation, and a short pinned excerpt at each major transition. Deeper surrounding code remains available through disclosure and source links.
- Include admission, no-movement accesses, demotion, promotion, cross-context migration, policy inputs, list search, candidate rejection, detach, and rebinding. Add explicit alternative schedules for flushing, re-dirty, reservation, reacquisition, and revocation.
- Use a fixed authored trace, not arbitrary workload execution. Branches restart from identified states; state from another branch cannot leak into the displayed history.
- Prefer existing shared presentation controls and native disclosures. All explanations remain accessible in reading and no-JavaScript modes. Any new behavior is confined to pages that opt into it.
- The policy-defense exercise precisely defines immediate-hit LRU1 promotion as a hypothetical alternative, including its trigger and synchronization assumptions. Require before/after analysis, invariants, costs, counterexamples, and a measurement plan; do not imply measured improvement.
- Keep AOUT dormant in the active baseline. Retain relevant uncertainty qualifications and distinguish list-event age, quota epoch, and hot-fix history.
- Update affected pairing metadata, curriculum/library routes, coverage accounting, and presenter guidance as each complete slice lands. New or edited language-review receipts remain pending until actual review.

## Testing Decisions

- Independently verify all four textbook traces, metadata, victims, and hit/miss totals. Provide predict/reveal checkpoints, separate instructor explanations, and an unseen-sequence exercise. Assess explanations of preference versus safe reuse, safety versus progress, and costs beyond hit rate; do not introduce graded certification or navigation locks.
- The primary behavioral test boundary is the served bilingual page in the existing browser suite. Exercise prediction/reveal, forward/backward steps, branch return, language pairing, direct checkpoint navigation, presentation mode, keyboard access, and no-JavaScript reading.
- Reuse the existing bilingual-site and maintainer-guide aggregate validation entry points. Existing seminar browser and regression suites provide prior art for navigation, keyboard shortcuts, disclosures, and unavailable-browser reporting.
- Validate the trace independently of its visual rendering: review pinned source predicates and numerical arithmetic; check consecutive snapshots, conservation of represented counts, one-list membership, and branch-entry consistency. Do not accept a renderer's own output as the correctness oracle.
- Use focused behavioral regressions where stateful interactions could show the wrong event, branch, or answer. Avoid tests that merely assert incidental prose or mirror the rendering implementation.
- Require source excerpts and links to match the pinned revision and control flow. Clearly distinguish checked constructed state from existing runtime receipts.
- Run relevant validator tests when validation changes. Check served pages/assets, rendered image dimensions, relevant render errors, projection and responsive reading, with unavailable HTTP/DOM gates disclosed rather than counted as passes.
- Preserve human Korean-naturalness and semantic-parity review against current fingerprints. Automated checks do not create review receipts or prove participant mastery.
- No new native engine experiment is required for this enhancement. Existing applied curriculum requirements remain unchanged.

## Out of Scope

- General-purpose simulation, arbitrary workload input, or dependence on the separately tracked simulator project.
- Engine policy changes, new engine instrumentation, or new runtime performance/fairness claims.
- Changing the pinned baseline, separate Maintainer Guide audience, maintainer-level destination, or canonical language ownership. Only the seminar entry prerequisites and early conceptual comparison placement change as explicitly accepted.
- Enabling AOUT or resolving source anomalies as part of the teaching enhancement.
- Storing participant answers, automated mastery scores, or site-enforced curriculum completion.

## Further Notes

Implementation can choose precise numerical state, display layout, and file names using the existing architecture. Numerical convenience cannot override actual pinned policy. Each slice should be demoable in both languages and source-checked before being presented as complete.

The work is complete when the full trace and branches, source checkpoints, policy-defense exercise, curriculum routes, automated checks, and required human reviews are accounted for. Missing required human or browser evidence remains an explicit open gate. The prior audit was targeted, not exhaustive validation of future authored trace state.
