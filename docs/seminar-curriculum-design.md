# Audience-facing page-buffer curriculum design

This document consolidates the decisions accepted during the grill-with-docs interview. It describes the target design; it is not a report of implemented HTML changes. The product decision is recorded in [ADR 0005](./adr/0005-make-html-an-audience-facing-seminar-curriculum.md), with vocabulary in [CONTEXT.md](../CONTEXT.md).

## Purpose and audience

Teammates use the HTML directly during live lectures and independently afterward. Participants match the existing Target-maintainer baseline: senior C/C++ systems engineers who understand buffer pools and WAL but need to learn CUBRID's page-buffer implementation. The material explains the Module directly to them.

The curriculum has no fixed total duration. Begin with the 25 existing lesson pages as provisional lecture units, merging or splitting only where conceptual cohesion requires it. A lecture normally uses 90 minutes: approximately 60 for explanation and source tracing, 20 for scenarios or exercises, and 10 for questions. Repeat or extend work where participant evidence reveals gaps. The earlier single 90-minute seminar plus 30-minute Q&A proposal is superseded.

Korean is the primary live experience; English remains the canonical seminar content source. The root index remains a language selector and stable shared URL. Use ko/index.html directly in Korean sessions. Preserve paired English and Korean pages and existing URLs, including lessons/ filenames; visible headings use Lecture and mechanism-centered titles.

## Authority and scope

The canonical Markdown Maintainer Guide owns technical explanations and evidence provenance, with mutable uncertainty owned by its existing registry. English HTML owns seminar wording and structure. Korean HTML expresses the same meaning naturally, retaining established technical jargon and source identifiers in English. Condensation and visualization must preserve technical meaning and evidence boundaries.

All implementation claims remain pinned to CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912. Consult the source inventory and uncertainty registry before strengthening claims and verify affected claims against pinned source. Change canonical Markdown when review identifies an actual technical or explanatory defect.

Review every active English/Korean page pair across audience and voice, causal narrative, technical accuracy, information density, semantic parity and natural Korean, and projection/accessibility/navigation/independent reading. Preserve useful technical depth across the complete collection.

## Curriculum organization

The syllabus groups lectures by conceptual dependencies. Existing numeric filenames remain stable even when the syllabus reorders their presentation.

| Phase | Coverage |
| --- | --- |
| Foundations | Module boundary, page journey, objects, independent state axes |
| Acquisition and ownership | Fix convergence, fix debt, holder structure and lifetime |
| Mutation and durability | Caller correctness, flush generations, daemons, pacing |
| Replacement | Eligibility, progress, private LRU, dormant AOUT |
| Concurrency | Latch waits, promotion, ordered refix |
| Recovery and specialized behavior | Redo, lifecycle, specialized interfaces, failure proof |
| Maintainer integration | Safe changes, diagnosis and verification reasoning, technical defense |
| Cross-engine perspective | PostgreSQL/InnoDB responsibility and replacement comparisons |

All existing Core and Advanced mechanism lessons belong in the curriculum. Cross-engine comparisons receive dedicated late lectures after the CUBRID model is established. Detailed evidence catalogs remain reference material. The Topic library remains available from the syllabus and relevant lectures.

## Lecture experience

Each lecture has its own HTML page. Use a recognizable, flexible sequence: maintainer problem, conceptual model, causal mechanism, representative source trace, governing invariants and counterexamples, Audience checkpoint, then summary and next routes. Omit sections that add no value. Show one representative source transition per major concept and preserve the source of deeper claims through links or expandable details.

Write explanations for participants. Purposeful directions such as following a transition or considering a failure are appropriate. Remove instructions to teach a concept, ask a teaching agent, submit to chat, demonstrate mastery to an agent, or follow a route dictated by personal reading history.

Additional callers, extended source ranges, rare edge cases, derivations, and full provenance notes may be collapsed. The central mechanism, required invariants, safety warnings, and qualifications necessary to interpret a visible claim must remain visible. Checkpoint explanations start collapsed and remain immediately available to open.

Replace text-entry keyword exercises with concise scenarios, time to reason individually or together, expandable explanations, and links to deeper practice. The site neither stores participant answers nor scores mastery. Preserve useful mechanism demonstrations, including the ownership-ledger simulator, as demonstrations rather than assessments.

Provide persistent previous/next, curriculum, and library navigation. An explicit Presentation-mode toggle enlarges type, focuses sections, and hides secondary metadata or library-only navigation while preserving an exit back to ordinary reading. Support deliberate previous/next section navigation without automatic advancement. Keep diagrams and safety warnings visible, controls accessible, and all content readable without JavaScript. Implement the exact focus and persistence behavior through the visual prototype.

## Learning evidence

Use source tracing between lectures, periodic Synthesis workshops, reversible runtime probes, and a final diagnosis/change-review capstone. A production engine modification is optional. Exercise instructions must state setup, observation, supported conclusions, and evidence limits, using standard project build/test concepts.

Curriculum completion requires participants to explain the full page journey and state axes; trace representative acquisition, release, mutation, flush, replacement, concurrency, recovery, and lifecycle paths; reason through failures and concurrent schedules; diagnose a realistic symptom; produce and defend a change-impact and verification plan; and complete a technical defense without overstating evidence.

Presenter- or team-reviewed Completion records remain outside the audience site. The site provides exercise templates and rubrics. Individual Audience checkpoints do not block site navigation; curriculum readiness is a human judgment over accumulated evidence.

## Existing artifact dispositions

| Artifact | Target disposition |
| --- | --- |
| en/index.html and ko/index.html | Syllabus-oriented landing pages without personal progress |
| reference/course-learning-path.html pairs | Public Curriculum syllabus |
| reference/core-synthesis-studio.html pairs | Synthesis workshop without scoring or chat handoff |
| reference/presentation-rehearsal-card.html pairs | Final technical-defense rubric |
| reference/presentation-spine.html pairs | Concise curriculum recap |
| reference/course-coverage-matrix.html pairs | Move useful authoring coverage to docs/curriculum-coverage.md; retain old URLs as redirects to the public syllabus, outside audience navigation |
| MISSION.md | Audience-facing curriculum purpose and completion criteria |
| NOTES.md | Durable curriculum-authoring rules replacing stale personal coaching |
| presenter-runbook.md | One separate delivery document for timing, transitions, facilitation, and likely questions |

The runbook is outside audience navigation; this does not establish HTTP access control. Keep personal Completion records outside the published site. Git history preserves removed personal course state. Keep the site as direct static HTML with shared CSS and JavaScript; focused audit helpers are appropriate without introducing a required generation pipeline.

## Prototype and delivery sequence

First prototype the Korean landing page and the dense flush-generation lecture, followed by their English counterparts once the Korean visual experience is settled. Use these pages to test projection density, diagrams, source detail, transitions, checkpoints, and navigation. Obtain the user's review of the concrete prototype before rolling its pattern across the site.

Then migrate the complete collection, navigation, authoring documents, manifest, redirects, and validation. Track every existing page's retained, rewritten, merged, or redirected destination so no useful mechanism disappears during conversion. The 25-lecture inventory is provisional; splitting and merging must update the syllabus, pairing, and coverage together.

## Completion and verification

The redesign is complete only when every active audience page satisfies the contract and every existing page has an accounted-for destination. A working prototype alone is insufficient.

Require aggregate link, asset, pairing, technical invariant, accessibility, and interaction checks. Add focused checks for teaching-agent dependencies, historical learner state, keyword-based mastery claims, missing route navigation, and inaccessible disclosure or presentation controls. Review presenter directives editorially as well as with automated detection; legitimate maintainer instructions must remain usable.

Run the required maintainer-guide and bilingual-site aggregate checks, their relevant validator tests when validation code changes, and served-resource/browser checks through the local Copyparty endpoint. Inspect behavior and layouts at representative desktop/projector sizes, plus ordinary responsive reading. Report unavailable HTTP or DOM gates as unavailable.

Record Korean naturalness and EN/KO semantic reviews honestly against the applicable fingerprints. Preserve ADR 0004's human-review requirement: automated validation cannot manufacture a human review receipt. Unreviewed pairs remain pending. Final acceptance includes the user's prototype approval, visual review, language review, working redirects and relative links, complete authoring artifacts, and passing available required checks; missing required human or browser evidence remains an explicit open gate.

## Design status

The interview's product choices are settled through Q40. The user accepted layout A on 2026-09-08; the [prototype review](seminar-prototype-review.md) records the decision and archive. The bilingual migration is implemented, with page dispositions and automated verification recorded in the [coverage audit](curriculum-coverage.md). Final acceptance remains open for human Korean-language and semantic review against the current EN/KO fingerprints. Prototype approval and automated checks do not satisfy that separate review requirement.
