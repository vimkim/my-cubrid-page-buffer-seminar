# First-time participant revision: approved ticket breakdown

Status: approved by the user on 2026-09-30. Seven local implementation tickets have been issued; implementation has not begun.

Input: [implementation specification](../../docs/first-time-participant-revision-spec.md), repository commit `68120b2`. The [accepted design](../../docs/first-time-participant-revision-design.md) remains authoritative. Use the existing local Markdown tracker and `ready-for-agent` status; no external issue publication, merge or push is authorized.

## Slicing rule

Each content ticket delivers its English/Korean participant explanation, the matching full Korean spoken-script segment, working session-route cues and focused verification together. Do not postpone all Korean writing, script writing or browser checks to the last ticket. Exact files and commands remain in the specification's change map and testing section.

The complete Korean script is accepted only after the route is stable. Intermediate scripts clearly identify completed current-session segments and do not imply that unwritten segments are finished. Preserve useful legacy content through repository history and author-facing guidance, without leaving two unmarked current scripts.

No prefactor is required: the existing static HTML, native disclosures and presentation controls supply the needed boundaries. New engine experiments, interactive simulation and durability teaching remain excluded.

## 01 — Follow a concrete request into the buffer

**Blocked by:** None (can start immediately).

**What it delivers:** A novice can follow a record request into a page request, distinguish page/frame/BCB and enter the existing textbook replacement explanation. The presenter can deliver this complete opening in Korean using working screen cues.

- Explain caller versus buffer responsibilities without asserting one record/request equals one page/frame.
- Establish the scoped route and next-session durability boundary, preserving full-curriculum navigation.
- Define opening entry/exit stops and map textbook naming into the recurring workload without importing toy capacities into CUBRID.
- Write the opening spoken-script segment and establish one clearly identified current companion.
- Verify paired links, cue targets, existing textbook interactions if touched, and opening reading/presentation behavior.

**Primary spec coverage:** AC01 (opening), AC04, AC16 (companion setup). Shared criteria below also apply.

## 02 — Explain concurrent use before replacement

**Blocked by:** 01 — Follow a concrete request into the buffer.

**What it delivers:** Participants can predict compatible reader use, a conflicting writer and remaining nested fix debt using authored timelines, before being asked whether a frame can be reused.

- Reuse the existing ownership demonstration and explicitly introduce final unfix.
- Distinguish use lifetime, byte-access permission and basic dirty-state preservation obligations without WAL prerequisites.
- Present visible starting assumptions and concealed next-state answers through existing controls and native disclosures.
- Add the complete Korean explanation, prediction pauses and route transition into CUBRID policy.
- Source-check counts/permissions and verify keyboard disclosure, no-JavaScript readability and exact script cues.

**Primary spec coverage:** AC05, AC09 (ownership timeline).

## 03 — Follow admission through domains, zones and quota

**Blocked by:** 02 — Explain concurrent use before replacement.

**What it delivers:** Participants follow one page from ordinary admission/final unfix into private/shared policy domains and can explain zone movement using previously defined age and quota quantities.

- Reorder concepts so admission and final unfix precede zone rules, and age is defined before its calculation is used.
- Preserve private/shared policy versus access-ownership distinctions, current-source qualifications and existing anchors.
- Complete a bounded admission/reuse sequence with a visible resulting state; this is a demoable teaching slice even before the later outcome comparison exists.
- Remove author-specific volmap conversation and private review paths from the participant explanation while preserving useful qualified evidence.
- Supply the corresponding Korean script, predictions and source-backed state checks in the same slice.

**Primary spec coverage:** AC06, AC13.

## 04 — Complete the two replacement outcomes and safe reuse

**Blocked by:** 03 — Follow admission through domains, zones and quota.

**What it delivers:** Starting from one valid checkpoint, participants can compare hot-page retention with displacement when one workload condition changes, then explain protected candidate rejection or reuse.

- First verify a valid checkpoint and two schedules against the pinned source; do not draft a promised result before its state transitions are established.
- Account for hidden pool occupancy, thresholds, relevant ages, assignments and eligibility; record arithmetic/source evidence independently of rendering.
- Make each branch's changed input explicit and show final H1/H2 residency with the causal events.
- Integrate the concise live story with the detailed reference trace and explicit branch resets; preserve pre-existing examples.
- Complete the concurrency race at candidate recheck, old mapping removal and new identity, with no answer leakage in the prediction diagram.
- Write full Korean narration for both outcomes and verify branch-return, reveal and forward/back behavior in both languages.

**Primary spec coverage:** AC07, AC08, AC09 (recheck timeline), AC10.

## 05 — Explain how background work supplies progress

**Blocked by:** 04 — Complete the two replacement outcomes and safe reuse.

**What it delivers:** From the preceding request's blocked-candidate situation, participants can explain which daemon can help and which state changes still prevent reuse, without learning the deferred durability protocol.

- Cover page-flush, post-flush, maintenance and post-write pacing as distinct responsibilities, not a mandatory pipeline.
- Connect the waiting request to BCB handoff, current-state recheck and conditional assignment; distinguish inline completion from stranded queued work.
- Keep dirty-data preservation constraints and uncertainty qualifications, without WAL/LSA/DWB/crash or copied-generation exercises.
- Give precise entry/exit boundaries for selected background sections and preserve detailed full-curriculum material.
- Add complete Korean spoken explanations and verify selected route/cue links and disclosure behavior.

**Primary spec coverage:** AC11, AC02 (background boundary).

## 06 — Compare engines and finish the page journey

**Blocked by:** 04 — Complete the two replacement outcomes and safe reuse.

**What it delivers:** Participants apply the established hot-set-plus-scan story to the existing engine comparison, distinguish capacity limits from policy outcomes and close with the completed page journey.

- Remove unnecessary repetition while preserving each engine's stated mechanism, benefits, costs and evidence limits.
- Use the common workload and existing counterexamples to distinguish capacity overflow from inevitable all-miss behavior.
- Keep questions local to the concepts already taught, without requiring WAL or adding a final diagnostic workshop.
- Provide the comparison/closing Korean script and the route's completed recap.
- Verify both languages, local answer visibility, existing result links and source/evidence qualifications.

**Primary spec coverage:** AC12, AC01 (closing).

## 07 — Deliver one coherent route and complete Korean script

**Blocked by:** 05 — Explain how background work supplies progress; 06 — Compare engines and finish the page journey.

**What it delivers:** The presenter can deliver the entire accepted session from one script and itinerary, and participants can follow either language with no missing prerequisites or accidental jump into deferred material.

- Reconcile transitions, naming, exact stop boundaries and screen cues across already completed segments; complete any cross-segment spoken transitions.
- Complete the route-to-script coverage table and reconcile runbook, authoring guidance, coverage records and current-companion identification.
- Check every current-session explanation/question against the explicit next-session boundary. Keep full curriculum and legacy fragments intact.
- Record current fingerprints and honest human-review state. Do not manufacture language-review receipts.
- Run the integrated aggregate/served/headless checks on the exact implementation checkout and explicitly request/render the standalone script.
- Map all specification criteria to committed evidence or explicit open gates. Report unrelated baseline failures, missing browser capability and pending human review separately. Do not label overall acceptance complete while required gates remain open.

**Primary spec coverage:** AC01 (complete itinerary), AC02 (whole session), AC03 (whole site), AC15 (whole script), AC16 (final companion audit), AC19.

This ticket delivers cross-segment coherence, not the first tests or the first script. Local behavior, language pairing and evidence must already be checked by each content ticket.

## Shared completion obligations

For every affected slice, apply AC02/AC03 (scope and preservation), AC09 (applicable predictions), AC14 (EN/KO meaning and honest review state), AC15 (its full Korean spoken segment), AC17 (served interaction/accessibility) and AC18 (exclusions). Record slice evidence as work proceeds; AC19 consolidates it in ticket 07. A human-review backlog is an explicit acceptance limitation, not an automated pass.

Every slice must preserve existing anchors and the full lecture-order contract, use exact pinned evidence for new transitions, check its relative links and script cues, and finish with a scoped local commit and clean task worktree. Follow the specification for aggregate commands and conditional validator tests. No ticket authorizes merge or publication.

## Blocking rationale and frontier

The dependency graph is `01 → 02 → 03 → 04`, then `04 → 05` and `04 → 06`, followed by `05 + 06 → 07`.

- 02 relies on the established object vocabulary and opening route.
- 03 uses final-unfix and ownership vocabulary established in 02.
- 04 applies the completed policy model and stabilized example identities from 03.
- 05 continues the pending-request/candidate state established in 04.
- 06 compares the completed CUBRID outcome from 04; it does not require newly authored daemon content from 05. Comparison remains at policy and abstract reuse-safety level, so no artificial 05 dependency is added.
- 07 requires both remaining teaching blocks and their script segments before checking the complete route.

Only 01 is initially startable. After 04, 05 and 06 are logically independent. This does not mandate parallel agents: they share route/script artifacts, so sequential execution is straightforward unless editing ownership is explicitly coordinated.

## Local issue index

The user approved this breakdown with “yes.” Each ticket is a separate local file with explicit blockers and `ready-for-agent` status. Readiness describes the ticket definition, not completion of its dependencies.

- [01: Follow a concrete request into the buffer](issues/01-request-and-buffer.md) — blocked by: None.
- [02: Explain concurrent use before replacement](issues/02-concurrent-use.md) — blocked by: 01.
- [03: Follow admission through domains, zones and quota](issues/03-admission-domains-zones.md) — blocked by: 02.
- [04: Complete the two replacement outcomes and safe reuse](issues/04-replacement-outcomes.md) — blocked by: 03.
- [05: Explain how background work supplies progress](issues/05-background-progress.md) — blocked by: 04.
- [06: Compare engines and finish the page journey](issues/06-engine-comparison.md) — blocked by: 04.
- [07: Deliver one coherent route and complete Korean script](issues/07-integrated-korean-delivery.md) — blocked by: 05, 06.

Start with ticket 01 and work the frontier of completed blockers. After 04, tickets 05 and 06 can run in either order; coordinate shared route/script edits if using parallel work. Ticket 07 joins both paths.

No parent issue was modified. Local issuance does not claim implementation completion or authorize merge, push, remote publication or deployment.
