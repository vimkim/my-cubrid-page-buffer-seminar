# First-time participant revision interview

## Status and provenance

Design accepted on 2026-09-30. The user confirmed the consolidated scope and shared understanding with “yes.” The interview is complete. Presentation implementation has not begun. Work item: 241. Current review baseline: `fd44ccf` on `main`, inspected on 2026-09-30.

Input: the [archived seminar critique](../critics.md), originally committed as `c421d40` on the former `docs/seminar-critique` branch. The critique describes baseline `c793ee6`; current main additionally clarifies private/shared zone placement and the always-promote alternative. The critique remains a set of proposals, not accepted requirements or observed participant feedback.

## Confirmed constraints

The user explicitly established these constraints for this interview:

- Participants know basic programming and arrays/linked lists, with no assumed database, buffer-pool, WAL or CUBRID knowledge.
- Korean is the primary live language; preserve English/Korean semantic parity, technical depth and pinned-source accuracy.
- There is no fixed total duration.
- Ask one consequential question at a time, recommend an answer and explain its trade-offs. Resolve factual questions from the material.
- Preserve settled design decisions unless a specific critique warrants revisiting them. Use the 84 questions as an editorial bank.
- Record agreed decisions and observable acceptance criteria. Recommend direct implementation or specification/ticket work after the interview.
- Use a sibling topic worktree. Do not merge or publish.

## Existing decisions retained pending any explicit revision

The [curriculum design](seminar-curriculum-design.md), [ADR 0005](adr/0005-make-html-an-audience-facing-seminar-curriculum.md), [replacement design](replacement-socratic-design.md), and [comparison design](comparison-clarity-design.md) already establish:

- The first-principles route is distinct from completion of the full Core/Advanced curriculum; replacement is its central topic.
- Existing bilingual HTML is the audience-facing product. Established URLs, anchors, native disclosures and presentation controls remain valuable.
- Constructed examples, source-derived mechanisms and runtime receipts have different evidence scopes. A small teaching cache does not become a faithful tiny CUBRID configuration.
- The Maintainer Guide owns technical evidence; seminar revisions do not automatically require changing its structure.
- Human language acceptance remains separate from automated checks.

No new glossary term has been settled. `CONTEXT.md` remains the canonical glossary; editorial planning belongs here. These are reversible teaching-scope and editorial decisions within the existing curriculum; no new ADR is required.

## Initial factual revalidation

- The current [first-principles route](../ko/reference/first-principles-route.html) still goes from page buffer and structures through replacement to daemons and comparison. The database bridge and flush-generation lecture are not explicit numbered route steps.
- The [database bridge](../en/lessons/0000a-database-bridge.html) already explains WAL, commit versus data-page propagation, and constrained victim scenarios. This is a routing/scaffolding gap, not absence of the information from the repository.
- The [flush-generation lecture](../en/lessons/0006-flush-one-generation.html) already explains copied G, concurrent G+1, DIRTY/FLUSHING combinations, WAL boundaries and failure restoration. Any revised route should reuse that substance rather than commission a duplicate tutorial.
- The current [introduction](../ko/lessons/0001-present-the-page-journey.html) starts from a page request. It defines page/frame and fix/unfix, but does not first work through a concrete record-level operation into that request.
- Main's change since the critique concerns zone/admission explanation and supporting evidence. It does not itself change the route's prerequisite order.

- Critique 3 requires qualification: the [worked example](../ko/reference/lru-worked-example.html#load-p) already carries a detailed trace forward and labels alternative resets. The live H1/H2 narrative needs integration; a new tracing framework is not automatically required.
- Critique 5 persists: Lecture 7 introduces its zone comparison before the later admission/final-unfix and age explanations.
- Critique 7 is local: [the recheck diagram](../ko/lessons/0007-replace-one-frame.html#handoff-details) visibly reveals rejection, while the preceding candidate-selection question legitimately keeps its explanation hidden. Do not classify all checkpoints as answer leakage.
- Critique 9 persists: the admission section retains an author-specific volmap receipt and local path; the separate presenter script assumes prior transaction-lock teaching.
- Critique 12 needs a narrow repair: the comparison already opens with a common H1/H2-plus-scan story and shared questions. Strengthen transfer exercises rather than replacing an absent framework.
- Critique 13 can reuse [the lab results](../ko/reference/replacement-lab.html#results): the three-frame, four-page cyclic teaching example compares LRU with MRU/OPT and demonstrates that capacity overflow does not require every request to miss. New engine experiments are not necessary to illustrate that distinction.

These observations establish the factual basis for the decisions below. The later user decision explicitly defers WAL and recovery instruction; the existence of those prerequisites does not authorize adding them to this session.

## Consolidated decisions

### Q1 — Focus on the first-principles route

Accepted A. Make the existing first-principles presentation route self-contained for its selected topics, revising linked lectures and the prerequisite explanations needed for replacement, concurrency, background progress and comparison. Preserve the full Core/Advanced curriculum and its evidence. This revision does not claim completion of the broader maintainer curriculum.

### Q2 — Teach concurrency; defer WAL to the next session

The user initially deferred this question, then resolved it explicitly: teach concurrent access in this session; WAL is unnecessary here and belongs to the next session. This supersedes both originally proposed combined concurrency/WAL routes.

Establish fix/unfix ownership and latch-based access before using them in CUBRID replacement safety. Use numbered actor/state timelines to explain compatible use and the race between candidate observation and protected recheck.

Explain dirty state only to the depth needed for replacement: changed contents must be preserved before a frame can be reused, and cleaning/completion can help supply eligible candidates. A completed write does not authorize reuse without current-state checks. Do not imply that flush is commit or that page submission alone establishes transaction durability.

WAL ordering, crash/recovery timelines, log/page LSA reasoning, DWB internals and the detailed copied-generation protocol are deferred. Preserve their existing deep lectures and identify the next-session boundary; do not require them to follow this session. The previously proposed detailed flush timeline is consequently outside this revision's teaching scope. Daemon instruction stays at roles, handoffs, changing candidate state, fallback behavior and progress, without asking participants to reason about the deferred durability protocol.

### Q3 — Compare two outcomes from one checkpoint

Accepted A. Follow A's repeated H1/H2 reads and B's scan. Use one explicitly stated starting checkpoint and two branches differing in one named workload condition. Trace the final residency and causal transitions in both branches: retention in one branch and loss of a hot page in the other.

Choose and verify initial state and schedules against the pinned mechanism before claiming the contrast. An arbitrary delay is not presumed to guarantee eviction. Keep textbook models, constructed CUBRID scenarios and existing runtime receipts distinct. Reuse existing worked examples and counterexamples where applicable; no new native experiment is required by this design.

### Q4 — Omit a separate final diagnostic exercise

The user chose to skip it. Short prediction questions embedded in explanations remain in scope. Close with the completed page journey and comparison takeaways rather than adding a diagnosis workshop.

### Q5 — Use authored stepwise timelines

Accepted A. Keep actor lanes and state labels stable, state the initial assumptions, ask for the next transition and reveal the resulting state with its explanation. Use existing presentation controls and native disclosures; retain complete no-JavaScript reading. No interactive simulator is in scope. Q2 narrows the current timeline work to concurrent access and replacement rather than detailed WAL/flush-generation teaching.

### Q6 — Include a complete Korean spoken script

The user requested the full Korean script, rather than only concise presenter notes. Align it with the revised participant route, including spoken explanations, transitions, diagram/page cues, prediction pauses and reveal explanations. It assumes no prior transaction-lock seminar. Keep presenter directions outside participant navigation.

Use one clearly identified current script and align the existing runbook/older script routing so incompatible older assumptions cannot be mistaken for this session's preparation. Preserve useful historical material. English/Korean parity applies to participant HTML; the requested Korean presenter companion does not by itself require a second full English spoken script.

## Proposed route implementing the decisions

1. A concrete record request leads to a page request; introduce the buffer's responsibility and page/frame/BCB distinctions.
2. Use the existing textbook replacement progression to establish capacity, locality and policy trade-offs.
3. Introduce concurrent access: fix/unfix, latch protection and the state needed to reason about a frame's users. State the dirty-page constraint without teaching WAL.
4. Follow CUBRID admission and final unfix into private/shared lists, zones, age and quota. Introduce each prerequisite before its first use.
5. Complete the hot-set-plus-scan branches through candidate selection, protected recheck and frame reuse. Use the concurrency timeline where the previously introduced concepts become necessary.
6. Explain background roles and handoffs when reusable candidates are scarce, preserving the current-state recheck and next-session durability boundary.
7. Compare engine replacement mechanisms with the existing common workload, then recap the completed journey and each policy's limits.

These are conceptual blocks, not new page URLs or fixed-duration slots. Keep existing anchors and useful depth; select section boundaries and link targets during implementation. Deferred durability lectures remain available for the next session.

## Observable acceptance criteria

- Every concept required by an in-session prediction has been introduced before that prediction. No required step assumes earlier database, transaction-lock or WAL teaching.
- Both languages and the Korean script agree on the current-session/next-session boundary. No current checkpoint requires WAL, LSA, crash-recovery or DWB reasoning.
- The participant route follows a concrete page request; main example states are carried forward, and alternative branches explicitly return to a named checkpoint.
- The two H1/H2 branches share the initial pool/domain/zone/page state, change one named workload condition, and show source-consistent resulting residency. Preserve the evidence for the chosen transitions.
- Admission, final unfix and the applicable age quantity are explained before using them to justify zone behavior. Safety protection and replacement-policy preference are distinguished.
- Timeline assumptions remain visible while predicted outcomes stay concealed until the presenter or reader reveals them. Worked examples may show their outcomes but are identified as demonstrations rather than unseen prediction tests.
- Reuse existing explanation, trace and native evidence where sufficient. Do not claim new runtime measurements or participant comprehension from source review.
- Remove author-specific conversation references and inaccessible local review paths from participant explanations; keep needed provenance in appropriate evidence notes.
- Korean surrounding prose reads as explanatory sentences while exact identifiers and established technical terms remain searchable. Revise EN/KO meaning together; do not manufacture human-review receipts.
- The complete Korean script references the corresponding participant pages/sections and supplies spoken transitions and prediction/reveal cues without introducing incompatible prerequisites or new unsupported claims.
- Existing URLs, fragment targets, presentation controls and no-JavaScript reading remain valid. No simulator or separate final diagnostic exercise is added.
- Run required aggregate source checks, relevant served/headless checks and editorial walkthroughs of the changed route. Report unavailable gates and outstanding human review distinctly from passes.

## Recommended next flow

Use `/to-spec` followed by `/to-tickets`, then implementation. The work spans prerequisite order, a source-consistent branching trace, several bilingual lecture pairs, interactions/visibility and a full Korean script. A shared specification and small dependency-ordered tickets reduce drift between these artifacts.

Suggested ticket boundaries, to be refined by the specification rather than treated as already created issues:

1. Establish the route, concrete request and concurrency prerequisites, including the explicit next-session durability boundary.
2. Verify and integrate the paired replacement traces, zone explanation order and local prediction disclosures.
3. Align daemon/comparison presentation and participant-facing language with the route; retain deep references.
4. Write the full Korean spoken script against the stable route and reconcile presenter companion links.
5. Complete route-level editorial, bilingual source and served/headless verification; preserve honest human-review status.

No design questions remain. The user has confirmed the consolidated understanding; the next phase can use this document as its accepted design input without repeating the interview. The selected flow is specification, dependency-ordered tickets, then implementation. Merge and publication remain unauthorized.

## Specification

The local [implementation specification](first-time-participant-revision-spec.md) concretizes the accepted design into file ownership, route boundaries, user stories and observable acceptance criteria. It is ready for ticket decomposition; no presentation implementation or publication is claimed.
