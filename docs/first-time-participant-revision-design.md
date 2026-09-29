# First-time participant revision interview

## Status and provenance

Design interview in progress; implementation is not yet authorized by a confirmed shared design. Work item: 241. Current review baseline: `fd44ccf` on `main`, inspected on 2026-09-30.

Input: `critics.md` at commit `c421d40` on `docs/seminar-critique`, available in `/home/vimkim/gh/my-cubrid-page-buffer-seminar-critique/critics.md`. The critique describes baseline `c793ee6`; current main additionally clarifies private/shared zone placement and the always-promote alternative. The critique remains a set of proposals, not accepted requirements or observed participant feedback.

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

No new glossary term has been settled. `CONTEXT.md` remains the canonical glossary; editorial planning belongs here. No ADR is warranted before a consequential new trade-off is accepted.

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

These observations establish candidate problems. They do not settle the revised teaching order, breadth, or exercise design.

## Decision tree

1. Revision boundary and completion target — Q1 accepted: first-principles route plus required prerequisites.
2. Given that boundary: prerequisite order and conceptual stopping points.
3. Given the route: continuous workload, page identity and explicit example resets.
4. Given that story: concurrency and crash/flush timelines with bounded assumptions.
5. Given the concepts: prediction/reveal behavior, Korean prose and source-detail placement.
6. Observable acceptance criteria; Q4 excludes a separate final diagnostic task.
7. Confirm shared understanding; choose direct implementation or specification/tickets.

The interview advances one consequential question at a time. Decisions depending on an unanswered question remain pending.

## Q1 — Accepted revision boundary

The user selected A. Decision: make the existing first-principles route self-contained for the stated novice audience, revising linked lectures and adding the minimum prerequisite explanations needed for its replacement, progress and comparison story. Preserve the full curriculum's maintainer scope and deep references.

Alternative: redesign the entire Core/Advanced curriculum in this effort, extending prerequisite and exercise review through recovery, ordered access, specialized interfaces and technical defense. This is a materially wider objective.

Trade-off: the route-focused option targets the critique's principal reading experience and supports a bounded end-to-end diagnosis exercise; it does not claim to complete the broader maintainer curriculum redesign.


Observable scope criteria:

- The revised route explicitly reaches every prerequisite explanation needed by its scenarios before asking participants to use it.
- Its linked explanations support a complete page-request/replacement/progress story. Q4 subsequently excludes a separate final diagnostic exercise.
- Existing Core/Advanced depth and evidence remain available; completion of this revision does not assert completion of the full maintainer curriculum.

## Q2 — Prerequisite placement (deferred)

Recommendation A: introduce constraints when the continuing request encounters them. Begin with a concrete record request, pages/frames/BCBs and textbook replacement. Establish basic fix/latch/dirty meanings before CUBRID policy; use a clean, unfixed scenario for admission, domains, zones and quota. Then let the request encounter fixed and dirty candidates, introducing the concurrency schedule and WAL/copied-generation explanation before resolving safe reuse and background progress. Finish with comparison and diagnosis.

Alternative B: teach the concurrency and durability foundations in full before the CUBRID replacement sequence, then apply them together during candidate selection and progress.

Trade-off: A reaches the central replacement topic sooner and gives each deeper mechanism an immediate problem to solve, but requires explicit scenario continuity and revisiting the pending request. B provides all prerequisites in advance but lengthens the introduction before participants reach the central policy story. Neither option permits using undefined concepts or silently assuming prior database knowledge. Exact section navigation and page boundaries remain downstream decisions.

## Q2 deferral clarification

The user clarified “No, proceed to Q3.” Only Q2 is deferred; the interview continues. Q1 remains accepted and neither Q2 option is selected. Questions that require a chosen teaching order remain pending, while independent scenario decisions may proceed. No presentation implementation has begun.

## Q3 — Outcome of the recurring workload (accepted A)

Question: should the H1/H2-plus-scan story demonstrate both conditional retention success and a contrasting loss of a hot page, or one successful main outcome with limitations covered by separate exercises?

The user selected A. Decision: use one explicitly stated checkpoint and two branches differing in a clearly named workload condition (for example, the interval before A reuses its hot pages while B continues scanning). Show the final residency and causal transitions in both branches. Exact initial state and schedules must be verified before selecting a pair that actually yields the contrasting outcomes; this is not an assertion that any chosen delay guarantees eviction.

Alternative B: complete one source-consistent successful main trace and use existing separate counterexamples to explain limitations. This is easier to follow, but less directly tests which assumptions are responsible for the main outcome.

This decision is independent of Q2: it determines what the example must demonstrate, not where concurrency or WAL is introduced. Preserve the existing distinction between constructed CUBRID scenarios, textbook models and runtime observations.


Observable Q3 criteria:

- Both branches start from the same explicitly stated pool, domain, zone and page-state checkpoint.
- One named workload condition differs; resulting state transitions are derived rather than independently assumed.
- Show the final residency of H1/H2 in both branches and identify the events responsible for retention or loss.
- Verify the chosen schedules against the pinned mechanism before claiming either outcome. Label constructed scenarios separately from runtime observations.

## Q4 — Separate final diagnostic exercise (excluded)

The user said “I think we can skip this.” The separate final diagnostic exercise is excluded from this revision. Short prediction checkpoints within explanations remain in scope. The following alternatives were considered but neither is selected.

Proposed A: progressively disclose evidence for a slow page request. Participants first identify plausible causes, choose the next observation and explain what would distinguish their hypotheses. Reveal prepared evidence, ask them to revise the diagnosis, then expose model reasoning and remaining uncertainty. Cases should exercise retention misses, fixed-candidate pressure and dirty-page progress without assuming every symptom has a unique cause.

Alternative B: provide all relevant observations at once and ask participants to classify the cause and explain the mechanism. This is easier to facilitate and checks conceptual application, but gives less evidence that participants can choose what to inspect.

This question is independent of Q2. Exact counters, evidence cards and any source routes are factual implementation work after the exercise objective is agreed; no new runtime experiment or interactive scoring system is implied.


## Q5 — Timeline presentation form (pending)

Recommendation A: use authored, numbered steps with stable lanes for actors and state. Show the initial conditions, ask for the next transition, and reveal the resulting state and explanation using existing presentation controls/native disclosures. Keep the complete sequence readable without JavaScript. Apply this format to both concurrency and copied-generation flush scenarios.

Alternative B: add an interactive simulation in which participants choose thread actions or write/flush timing and observe derived transitions. This enables experimentation but requires a defined simulation model, controls and additional behavioral verification beyond the existing presentation workflow.

Both alternatives retain concrete timelines; the decision concerns interaction scope, not teaching order. Q2 remains deferred. No new engine experiments are implied by either option.
