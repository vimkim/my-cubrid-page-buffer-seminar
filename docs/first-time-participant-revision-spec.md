# Self-contained replacement seminar and Korean presentation script

Status: ready-for-agent (local specification; not published)

Accepted input: [revision design](first-time-participant-revision-design.md), confirmed on 2026-09-30. Specification baseline: `c54a260` on `docs/seminar-revision-design`; participant content baseline: `fd44ccf`. These repository revisions are distinct from the pinned CUBRID source revision, `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.

This specification preserves the confirmed choices. It concretizes file ownership, route boundaries and verification; it does not reopen the interview or implement the presentation. The user explicitly prohibits merge and publication. Use the existing local `ready-for-agent` convention rather than creating an external issue or applying remote labels.

## Problem Statement

A Seminar participant who knows basic programming and arrays/linked lists can find substantial information in the site but cannot reliably follow the first-principles route without encountering unexplained dependencies. The route reaches replacement and background work without first building the required concurrency model. Individual replacement examples explain rules without completing the motivating hot-set-plus-scan story. Some prediction diagrams expose the outcome before the participant can reason about it. Author-review commentary and uneven Korean prose interrupt the explanation.

The presenter also needs a full Korean spoken script that matches the current route. The existing script assumes earlier transaction-lock instruction and contains durability teaching that the user now explicitly assigns to the next session.

The defect is not a lack of a full maintainer curriculum. The wider curriculum, detailed traces, experimental receipts and durability lectures already exist and must remain available.

## Solution

Revise the existing bilingual First-principles route into a self-contained explanation of page requests, replacement and concurrent frame reuse. Begin with a concrete record request, introduce the page/frame/BCB model and textbook policies, then teach concurrent access before applying it to CUBRID replacement safety. Explain admission and final unfix before zone/age rules.

Follow repeated H1/H2 reads competing with a scan. From one fully stated checkpoint, change one workload condition and derive two source-consistent outcomes: the hot pages remain in one branch and a hot page is displaced in the other. Use authored stepwise actor/state diagrams and native prediction disclosures rather than a simulator.

Teach daemon roles, handoffs and candidate progress to the depth needed to complete this story. Dirty state means that changes must be preserved before reuse; the detailed durability mechanism is a named next-session boundary. WAL ordering, recovery, LSA, DWB internals and copied-generation timelines are not current-session prerequisites or exercises.

Finish with the existing engine comparison and a concise page-journey recap. Do not add a final diagnostic exercise. Supply a complete Korean spoken script, with exact page/section cues, transitions and prediction/reveal pauses, alongside the participant material.

## User Stories

1. As a Seminar participant, I want to start from a familiar record request, so that a page request has a concrete purpose.
2. As a Seminar participant, I want to distinguish a record from its containing page, so that I do not assume one SQL request touches exactly one page.
3. As a Seminar participant, I want to distinguish a page identity from a frame and BCB, so that frame reuse does not appear to create a new memory object.
4. As a Seminar participant, I want to know which responsibility belongs to the caller and which to the page buffer, so that protected byte access does not imply complete caller correctness.
5. As a Seminar participant, I want to reuse the existing textbook traces, so that I can predict a victim before learning CUBRID-specific policy.
6. As a Seminar participant, I want the transition from textbook to CUBRID examples to state what resets, so that toy capacities and hit totals do not silently transfer.
7. As a Seminar participant, I want a two-reader example, so that I understand how compatible uses coexist while preventing frame reuse.
8. As a Seminar participant, I want to see where a conflicting writer must wait, so that I distinguish byte-access protection from residency protection.
9. As a Seminar participant, I want to see nested fixes and matching unfixes, so that repeated pointers do not conceal outstanding use.
10. As a Seminar participant, I want dirty state explained without a WAL prerequisite, so that I can understand why an unused page may still be unavailable for replacement.
11. As a Seminar participant, I want admission and final unfix introduced before zone rules, so that I know which event triggers ordinary placement.
12. As a Seminar participant, I want private/shared domains distinguished from exclusive ownership, so that shared access does not look like copying page bytes between pools.
13. As a Seminar participant, I want age and quota quantities introduced before calculations use them, so that similar words do not hide different counters.
14. As a Seminar participant, I want one visible state history for the main workload, so that successive diagrams describe a continuation rather than unrelated snapshots.
15. As a Seminar participant, I want two branches from one stated checkpoint, so that I can identify which condition changes the outcome.
16. As a Seminar participant, I want the final residency of H1/H2 shown, so that the opening question receives an actual answer.
17. As a Seminar participant, I want candidate preference separated from safe reuse, so that good retention policy is not mistaken for permission to overwrite a frame.
18. As a Seminar participant, I want to predict a race before seeing its result, so that I practice protected revalidation rather than repeat a displayed conclusion.
19. As a Seminar participant, I want the BCB and list protection explained by what they stabilize, so that every synchronization mechanism is not simply called a page lock.
20. As a Seminar participant, I want to follow old mapping removal and new identity publication, so that stable addresses do not imply stable page identity.
21. As a Seminar participant, I want to see what can make a waiting allocation progress, so that waiting itself is not mistaken for freeing a frame.
22. As a Seminar participant, I want page-flush and post-flush responsibilities separated, so that queue consumption does not look like writing the same page again.
23. As a Seminar participant, I want maintenance and pacing distinguished from page transfer, so that four daemon roles do not appear to be a mandatory four-stage pipeline.
24. As a Seminar participant, I want the next-session durability boundary clearly stated, so that I can complete this session without learning WAL or recovery.
25. As a Seminar participant, I want comparison questions about the same workload, so that engine-specific age and reuse mechanisms can be compared without equating them.
26. As a Seminar participant, I want capacity limits distinguished from observed all-miss behavior, so that one experiment does not become a universal policy claim.
27. As a Seminar participant, I want equivalent English and natural Korean explanations, so that language switching preserves assumptions and conclusions.
28. As a Seminar participant, I want assumptions visible before opening an answer, so that predictions are answerable without guessing hidden premises.
29. As a Seminar participant, I want diagrams and explanations available without JavaScript, so that independent reading preserves the complete account.
30. As a presenter, I want explicit entry and exit points for every teaching stop, so that I do not accidentally continue into deferred material.
31. As a presenter, I want a full Korean spoken script, so that I can rehearse the entire explanation rather than expand an outline during delivery.
32. As a presenter, I want the script to specify diagram cues and reveal pauses, so that speech and displayed state stay synchronized.
33. As a presenter, I want one clearly identified current companion, so that an older script does not reintroduce prior-knowledge assumptions.
34. As a maintainer of the seminar, I want existing URLs, anchors and curriculum navigation preserved, so that a focused session revision does not break the complete curriculum.
35. As a maintainer of the seminar, I want source-derived scenarios checked independently of their rendering, so that a convincing diagram cannot certify an incorrect transition.
36. As a maintainer of the seminar, I want human review and unavailable verification reported honestly, so that automated passes do not imply language acceptance or participant mastery.

## Implementation Decisions

### Scope and authority

- Use the existing Audience-facing seminar site and First-principles route. The accepted Core/Advanced curriculum and Maintainer Guide remain intact.
- The user-selected next-session boundary supersedes the critique's recommendation to teach WAL and a crash/flush timeline now. References to those subjects may remain available; current predictions and required route stops must not depend on them.
- Keep the current static HTML architecture, native disclosures and shared presentation controls. No new generator, scoring model, simulator or engine experiment is needed.
- Retain source pins and canonical evidence ownership. Consult the source inventory and uncertainty registry before strengthening technical claims. Verify new authored transitions from the exact pinned source, not a possibly instrumented working-tree file.
- Preserve established evidence qualifications, including uncertainty around victim-supply paths. Deferring durability teaching does not authorize claiming that any write immediately permits reuse.

### Session route and prerequisites

- Treat the session itinerary and full curriculum navigation as distinct. Keep the full lecture previous/next order; the session itinerary gives precise teaching stops and return points.
- Each stop names its entry section, included conceptual blocks, final included section and next route stop. The script repeats these cues. At a session/deep-material boundary, show a clear end-of-stop indication so section-next is not mistaken for the session itinerary.
- Use the following dependency order: concrete request and objects; textbook replacement; concurrent ownership/access; admission and final unfix; domains, zones, age and quota; candidate selection/recheck/reuse; background roles; comparison and recap.
- Teach compatible READ uses, a conflicting WRITE request, nested debt and release before asking participants to evaluate reuse. Use a separate bounded recheck schedule when candidate selection needs it. Clearly separate page latch, BCB metadata protection and list protection.
- Keep ordinary-case explanations visible before optional details. Do not delete deep material just to shorten the session. Route participants to selected self-contained sections rather than requiring an entire durability bridge as prior reading.

### Continuing example and two outcomes

- Use A/B for execution contexts, H1/H2 for repeatedly requested page identities and S1/S2/... for scan identities. Clearly distinguish these labels from BCB/frame indices and internal zone names. Map any reused reference names explicitly.
- Give the constructed CUBRID checkpoint a valid larger-pool state and a small displayed window. Account for omitted occupancy, thresholds, relevant list order, ages, quota, thread/domain assignments and candidate eligibility sufficiently to determine the outcome.
- Keep both branches' initial state identical. Change one named workload condition; subsequent differences in policy state must be derived consequences of that change, not additional unexplained inputs.
- Do not select convenient numbers that contradict pinned policy. Verify a workable checkpoint and schedule before authoring its final diagrams. If the first attempted scenario fails to produce the promised contrast, revise the constructed checkpoint/schedules and verify again; do not invent an eviction or silently add a second independent change.
- Show before state, event, prediction and revealed after state at consequential transitions. Identify the exact branch checkpoint when returning or comparing outcomes. Complete both branches with H1/H2 residency and the event responsible for retention/loss.
- Reuse existing textbook/alternative-policy results and native receipts with their original assumptions. These remain separate from the constructed CUBRID branches.
- Preserve a reviewable transition ledger with source locations and arithmetic. This is an author evidence artifact, not an interactive simulation or a new benchmark.

### Background roles without a durability lesson

- Explain dirty-page cleaning as required preservation work before possible reuse. Identify who selects candidates, who completes state processing, who adjusts retention policy and who refreshes pacing credits.
- Show that queued work transfers a BCB reference across execution contexts, and that a later state check can reject direct assignment. Inline completion and a stopped consumer with queued work are distinct cases.
- Avoid a new detailed dirty-generation or crash timeline. Detailed WAL, LSA, DWB and recovery explanations remain in their existing later-session locations. Keep necessary safety qualifications next to claims; remove unexplained durability dependencies from the selected live sections.
- Retain maintenance/pacing explanations at their causal level. Preserve the post-write nature of pacing; do not imply a strict pre-write authorization gate or guarantee of progress.

### Questions, language and script

- Use short local prediction questions; do not import all 84 editorial questions. Keep valid existing checkpoints. An explicitly worked example may reveal its result; an unseen prediction must conceal that result until requested, including equivalent diagram labels.
- Preserve visible assumptions, safety conditions and the facts needed to answer. Disclosure is for outcomes and supporting detail, not necessary premises.
- Rewrite surrounding Korean sentences naturally while keeping identifiers and established technical terms. Keep each changed English/Korean pair semantically aligned, including qualification and branch conditions.
- Remove conversation-specific observations and private review paths from participant explanations. Preserve useful evidence in author records with its original limits; do not turn an unreproduced observation into a runtime receipt.
- Provide one current full Korean presenter script. For every teaching stop, include the actual spoken explanation, transition into the example, page/diagram cue, prediction pause, reveal explanation and transition onward. A title plus bullet reminders is insufficient.
- Keep the script outside participant navigation. Align the presenter runbook and clearly identify the former script as superseded through repository history and author-facing notes. Reuse its useful explanations after removing prior-lock-seminar assumptions and deferred durability teaching.

### Concrete file change map

The user explicitly requested file-level planning. Paths below are verified against this worktree; `{en,ko}` denotes two files changed together. This table overrides the skill's generic preference to omit paths. It is a bounded plan, not authorization for unrelated edits.

| Files | Required change and ownership |
| --- | --- |
| `{en,ko}/reference/first-principles-route.html` | Own the session itinerary, entry/exit section links, prerequisite order, next-session boundary and closing recap. Link selected concurrency sections before replacement. |
| `{en,ko}/lessons/0001-present-the-page-journey.html` | Add a simplified record-to-page request; state module boundaries and session scope. Preserve the existing journey and anchors. |
| `{en,ko}/lessons/0002-separate-objects-from-state.html` | Ensure object/state vocabulary is introduced before the route uses it; connect identities to the recurring story. Preserve allocation/ABI depth in disclosures. |
| `{en,ko}/lessons/0004-repay-fix-debt.html` | Own the selected beginner concurrency/ownership block: compatible readers, conflicting writer, nested uses and release. Reuse its current ownership demonstration. Keep special holder detail outside the selected stop. |
| `{en,ko}/lessons/0007-replace-one-frame.html` | Reorder admission/final-unfix before zone/age reasoning; integrate the two outcomes and protected-recheck timeline; repair answer leakage and remove volmap author-review residue. Keep private/shared and quota qualifications. |
| `{en,ko}/reference/lru-worked-example.html` | Own the detailed source-consistent branch checkpoint and trace. Add dedicated anchors for the selected retention/loss branches without changing the meaning of existing traces and resets. Lecture 7 supplies a short live explanation and links to the detailed state ledger. |
| `{en,ko}/lessons/0006a-understand-page-buffer-daemons.html` | Provide the route's self-contained four-role explanation and current-state handoff example without durability prerequisites. Mark where detailed next-session material begins. |
| `{en,ko}/lessons/0006b-follow-page-flush-handoff.html`, `{en,ko}/lessons/0006c-follow-maintenance-and-pacing.html` | Align selected handoff/maintenance/pacing sections and boundaries; keep detailed durability/source content reachable without requiring it during this session. |
| `{en,ko}/lessons/0018a-compare-replacement-policies.html` | Reduce duplicate explanation, retain the common workload and compare what each mechanism remembers. Avoid current-session questions requiring deferred durability knowledge. |
| `my-presentation-script.html` | Rewrite the current presenter companion as the complete Korean spoken script for the accepted route. Reuse the existing printable HTML structure where useful. Preserve useful older content in Git history rather than leave two unmarked current scripts. |
| `presenter-runbook.md` | Identify the revised session and its current script, page/section cue convention and boundary from the full curriculum. Keep the broader curriculum's facilitation guidance. |
| `NOTES.md`, `docs/seminar-curriculum-design.md`, `docs/curriculum-coverage.md` | Record the scoped route and next-session boundary, coverage preservation and authored trace disposition. Clearly distinguish this session from required full-curriculum completion. |
| `teaching-pages.json` | Invalidate stale language-review receipts for edited pairs using the existing manifest format. Preserve honest pending state; no new participant pair is planned, so do not inflate inventory counts. |
| `docs/first-time-participant-revision-trace.md` (new during implementation) | Record the constructed branch checkpoint, inputs, transition arithmetic and exact pinned-source justification. State that it is constructed evidence, not a runtime capture. |
| `docs/first-time-participant-revision-checks.md` (new during implementation) | Record AC-by-AC evidence, tested commit, commands, served worktree identity, browser/editorial observations and open human-review gates. |
| `scripts/seminar-browser.test.mjs` | Extend existing high-level coverage for the revised route, selected timeline disclosure, branch return, language parity of navigation and script-linked fragments. Prefer focused behavioral assertions. |

Conditional edits must name the reason in the implementation report:

- `{en,ko}/lessons/0000-replacement-foundations.html`: route-return labels or naming bridge only, unless revalidation finds an actual explanatory defect. Preserve validated FIFO/LRU/Clock/OPT behavior.
- `{en,ko}/reference/replacement-lab.html`: add or adjust the local capacity-versus-policy inference checkpoint only if existing results cannot be linked without confusing the session. Preserve receipts and their limits.
- `{en,ko}/index.html` and `{en,ko}/reference/course-learning-path.html`: update session discovery labels if needed; keep full-curriculum phases and lecture order unchanged.
- `assets/replacement-socratic.css`: small layout adjustments if existing diagram/card rules cannot fit the timeline. Prefer HTML/CSS diagrams and existing styles. Any new SVG must live in root `assets/`, be used and meet existing safety checks.
- `scripts/seminar-contract.mjs` and its existing unit/regression tests: change only if a genuine contract gap is found, such as presenter-companion navigation escaping existing detection. Do not weaken global lecture-order checks to accommodate the session itinerary.
- Shared `assets/seminar.js` / `assets/seminar.css`: no change planned. If a demonstrated interaction/layout defect requires one, scope the fix and run the applicable interaction tests.

Preserve without teaching-route expansion: the full database bridge, logged mutation, flush-generation, recovery, ordered-access and final-defense lessons; the Maintainer Guide and question bank; native experiment code and receipts; unprefixed compatibility pages. Correct a discovered factual defect through its canonical evidence owner rather than conceal it in the new script.

## Testing Decisions

### Primary seam and prior art

The primary behavioral seam is the served bilingual HTML through the existing headless browser suite. The accepted design already chose this seam and the current presentation controls; no new test API or interview is required. Prefer externally observable navigation, visibility and state interpretation over class-name or prose snapshots.

Reuse the existing bilingual aggregate for inventory, navigation, links, technical parity, audience contract, static behavior, language-review currency and served resources. Reuse the maintainer aggregate for the guide's Markdown/link/SVG contract. Extend the existing seminar browser tests, whose prior cases already exercise native keyboard disclosure, presentation navigation, branch return, no-JavaScript reading and mobile overflow.

Source-trace correctness and Korean naturalness require review beyond this browser seam. Validate the scenario ledger independently from rendered output. Do not write a helper that generates both the diagram and its expected answer and then treat their equality as source verification. Do not introduce brittle tests asserting incidental sentence wording.

### Acceptance matrix

| ID | Observable completion condition | Verification evidence |
| --- | --- | --- |
| AC01 | The session route explicitly lists concrete request/objects, textbook policies, concurrency, CUBRID replacement, daemon roles, comparison and recap in dependency order. | Follow every route stop in EN and KO; record exact entry/exit fragments and concept prerequisites. |
| AC02 | No selected explanation or checkpoint requires WAL, LSA, recovery, DWB or copied-generation reasoning; both route and script assign those topics to a later session. | Editorial walk of all selected sections and script; inspect teaching dependencies rather than banning every acronym across the repository. |
| AC03 | Full curriculum phase/order, existing deep lectures, established fragment targets and compatibility links remain available. | Aggregate navigation/link checks plus before/after ID inventory for edited pages. |
| AC04 | A concrete operation reaches a page request without implying one record equals one page or one SQL request uses one frame. | Intro/script review against the object model; no unsupported end-to-end SQL call claim. |
| AC05 | Before replacement safety, the route supports prediction of compatible uses, conflicting access and remaining nested debt after an unfix. | Walk the selected ownership sequence; review actor/permission/count consistency against canonical pinned evidence. |
| AC06 | Admission/final-unfix and the relevant age quantity precede their use in zone rules; private/shared membership is separate from access ownership. | Section-order and first-use review in both languages and script. |
| AC07 | Two branches start from an identical stated checkpoint and change one named workload condition. Relevant hidden pool state is accounted for. | Trace ledger compares initial fields, records the single changed input, conserves counts and identifies source predicates for derived changes. |
| AC08 | The verified branches produce the claimed H1/H2 retention versus displacement and show the responsible events. | Independent arithmetic/source review of the complete branch transitions and final states before authoring is accepted. |
| AC09 | Prediction assumptions are visible and the outcome is initially concealed, including diagram equivalents. Reveal provides state and reason. | Browser check for selected checkpoints plus semantic review for answer leakage; keyboard Enter opens native disclosure. |
| AC10 | Branch navigation returns to the stated checkpoint and does not carry an open answer into a newly presented prediction under existing presentation behavior. | Headless forward/back/branch-return checks in EN and KO; no new persistence model. |
| AC11 | Daemon explanations distinguish page submission, bookkeeping, policy adjustment and pacing; current-state checks remain necessary. | Causal walkthrough and source-backed qualifications; no promised fairness, universal wakeup or durability shortcut. |
| AC12 | Comparison preserves its common workload and the distinction between retention policy and reuse safety; capacity overflow is not taught as universal all-miss behavior. | Local comparison/inference question review using existing examples and unchanged receipt limits. |
| AC13 | Participant explanations contain no author-specific volmap conversation or inaccessible local review path needed to understand the topic. | Targeted source search and editorial inspection; useful observations retained in appropriate evidence with limits. |
| AC14 | Changed EN/KO pairs preserve assumptions, event order, outcomes and evidence limits; Korean prose is coherent when spoken. | Pair review and current fingerprints. Formal human language acceptance is separately recorded or explicitly pending. |
| AC15 | Every required route stop has a corresponding complete Korean spoken segment, with working page/fragment cues, transition, diagram explanation and applicable prediction/reveal cues. | Route-to-script coverage table; manually follow every cue and read the full script for undefined prerequisites. Do not use word count as completeness proof. |
| AC16 | There is one clearly identified current script, outside participant navigation, and no active instruction assumes attendance at a prior lock-manager seminar. | Runbook/current-script review, link check and audience navigation inspection. |
| AC17 | Reading and presentation modes work; no-JavaScript mode retains explanations; keyboard interaction works; mobile content is not lost to overflow. | Headless checks at 1440×1000 and 390×844, relevant console/page errors and image natural dimensions; inspect representative screenshots headlessly. |
| AC18 | No simulator, stored answers, scoring, final diagnostic workshop, new runtime claim, engine modification or publication is introduced. | Scoped diff and artifact review. Existing full-curriculum exercises remain. |
| AC19 | The implementation report maps every AC to evidence or an explicit open gate, including its exact content commit and served root. | Review the committed checks report; classify pre-existing failures separately and do not count unavailable gates as passes. |

### Commands and gate handling

Run from the implementation worktree. Serve that exact worktree at a Copyparty URL root; verify the served content matches the checkout before recording results. The URL below is a placeholder to replace with the actual local endpoint, not a command to run literally.

```sh
node scripts/check-maintainer-guide.mjs
node scripts/check-bilingual-teaching-site.mjs
node scripts/check-maintainer-guide.mjs --copyparty-url <base-url>
node scripts/check-bilingual-teaching-site.mjs --copyparty-url <base-url>
SEMINAR_URL=<base-url> node --test scripts/seminar-browser.test.mjs
```

Use the configured `PLAYWRIGHT_MODULE` if needed; browsers must run headless. Scope additional checks to actual changes:

- If validators/contracts change, run their existing unit/regression tests: `scripts/check-maintainer-guide.test.mjs`, `scripts/check-bilingual-teaching-site.test.mjs`, `scripts/seminar-contract.test.mjs` and `scripts/seminar-regressions.test.mjs`, selecting those affected.
- If textbook interactions change, run `scripts/replacement-foundations-browser.test.mjs`; if lab behavior changes, run the existing replacement-lab checker using its current interface.
- The aggregate guide discovery does not include every author document or the standalone presenter script. Check new Markdown evidence/report files with the configured Copyparty Markdown checker, resolve their links, and explicitly request/render the presenter HTML.
- Review Markdown/SVG requirements apply to new relevant artifacts. Intentional Korean belongs in the Korean presenter/participant material; do not misclassify it as an English-guide regression.
- Record aggregate exit status and gate diagnostics. The known human-review backlog does not justify suppressing the review gate. A separate `--gate served` invocation can establish served behavior when the all-gates result remains nonzero for review currency.
- Report browser skips as `UNAVAILABLE`, missing human receipts as pending, and any unrelated baseline failures with exact evidence. Do not claim full acceptance until required open gates are satisfied.

## Out of Scope

- Redesigning or reducing the full Core/Advanced curriculum, its completion criteria or the Maintainer Guide audience.
- Teaching WAL, crash recovery, LSA, DWB internals or the detailed copied-generation protocol in this session; deleting their existing material is also out of scope.
- New interactive simulation, arbitrary workload input, automatic grading, participant state or a final diagnostic exercise.
- Engine changes, enabling AOUT, new native experiments, production benchmarks or guarantees of fairness/performance.
- Changing source pins, global lecture order or stable public URLs merely to fit the scoped session.
- A full English spoken script; participant English/Korean parity remains required.
- Claiming actual participant comprehension or formal human language review from automated checks.
- Creating remote issues, applying remote triage labels, merging, pushing or deploying. The user's local-only instruction overrides the skill's publication step.

## Further Notes

The primary design inputs are the [accepted interview record](first-time-participant-revision-design.md), [curriculum contract](seminar-curriculum-design.md), [replacement design](replacement-socratic-design.md), [comparison design](comparison-clarity-design.md), [ADR 0005](adr/0005-make-html-an-audience-facing-seminar-curriculum.md) and [domain glossary](../CONTEXT.md). Historical designs that teach durability in an earlier route do not supersede the user's current-session deferral.

The repository already uses local Markdown specifications with `Status: ready-for-agent`. That status means this specification can feed `/to-tickets`; it does not mean the implementation or human acceptance is complete. If a later task explicitly requests publication to a newly configured external issue tracker, use `/setup-matt-pocock-skills` if its tracker/label configuration is still absent. No external tracker setup is needed for this authorized local artifact.

Dependency order for future tickets: establish route/prerequisites and verify the branching trace; integrate replacement and background/comparison presentation; write the Korean script against the stable route; finish cross-artifact verification. Trace verification must precede claiming its outcomes, and route stabilization must precede final script acceptance. Each implementation slice should preserve EN/KO pairing and existing navigation.

Implementation may choose exact scenario arithmetic, additional non-conflicting fragment IDs and diagram arrangement within these constraints. These are engineering/editorial details, not unresolved product decisions. Record exact chosen values and source evidence before presenting them as verified mechanism. Escalate only if evidence shows the accepted outcome cannot be honestly met without changing scope.
