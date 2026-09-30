# Seminar authoring notes

## Audience and ownership

Write directly to participants. Explain the problem, contract, state owner and guard, then the bounded source path. Questions invite reasoning about consequences and counterexamples; native disclosures provide model explanations. Presenter pacing and facilitation belong in [presenter-runbook.md](presenter-runbook.md), outside participant navigation. That separation is editorial, not access control.

The [accepted design](docs/seminar-curriculum-design.md) and [ADR 0005](docs/adr/0005-make-html-an-audience-facing-seminar-curriculum.md) govern the HTML. The English Markdown guide remains governed by [maintainer-guide-notes.md](maintainer-guide-notes.md). Its canonical explanations, source inventory, and uncertainty registry retain ownership of technical claims.

## Editing a page

1. Update English and Korean together. Korean sentences should read naturally while retaining established database terminology, evidence labels, and exact source identifiers. Preserve qualifications beside their claims.
2. Keep mechanism depth and source routes. Define documentation-only notation before use: G/G+1 are reasoning labels, not stored counters; VS-* identifies an uncertainty-registry entry. Distinguish stable BCB storage from current VPID, compatible holders from identities, and sequential LRU movement from simultaneous membership.
3. Retain established URLs and anchors. The curriculum's dependency order, rather than filename order, owns previous/next lecture navigation. Landing and syllabus pages expose the same phases, including the required replacement-fundamentals entry block; topic references remain reachable independently.
4. Use shared layout A styles and presentation controls. Reading and no-JavaScript modes expose the complete explanation; presentation mode focuses one section without auto-advance. Native details work without application scripts. Preserve safety qualifications in the visible explanation.
5. Review both pages against all six axes in the design. Run both aggregate validators and their tests when changing validation. Browser checks cover reading, projection, mobile width, answer disclosure, and no-JavaScript access. A missing browser gate is unavailable, not passed.

The teaching-pages.json manifest remains the pairing and human language-review registry. Editing wording invalidates old fingerprint receipts. Automation may print fingerprints and report checks, but only an actual Korean-capable review can supply a review receipt. Reading history, keyword matches, and prototype preference are not language review or participant mastery evidence.

## Curriculum maintenance

All Core and Advanced content is required. Lectures can expand over multiple meetings with no total time limit. Teach cache and replacement basics before the existing CUBRID entry, assuming only basic programming knowledge. Early conceptual cross-system comparisons motivate the problem; detailed source-level cross-engine comparisons remain late, responsibility-based lenses. Performance ideas remain hypotheses until supported by controlled evidence. The [coverage audit](docs/curriculum-coverage.md) belongs to authors, not the participant topic library.

## Causal replacement explanation

The [accepted replacement design](docs/replacement-socratic-design.md) supersedes
fixed timing for the first-principles route. Lecture 0007 owns the self-contained
seminar explanation of private/shared organization, zones, quota, candidate
selection and safe reuse. Build each mechanism from a concrete question and the
consequence of its absence. Keep the scenario visible and use native disclosures
for the outcome and explanation. Treat simplified alternatives as teaching
models; distinguish policy trade-offs from correctness failures. Existing deeper
lectures remain supporting references, and the Markdown guide keeps technical
authority. Update English and Korean together.


## Self-contained first-time participant session

The accepted [first-time participant specification](docs/first-time-participant-revision-spec.md) narrows one session without reducing the full curriculum. Preserve its exact request → objects → textbook → concurrency → admission/policy → branch outcomes/reuse → background → comparison/recap order. The paired first-principles itinerary owns entry, included blocks, exit and next-stop links; the [one current Korean script](my-presentation-script.html) repeats them outside participant navigation. At a selected exit, do not route section stepping into deferred detail without a visible boundary.

Detailed WAL, LSA, recovery, DWB and copied-generation reasoning belongs to the next session. Preserve its full-curriculum pages and anchors. Keep dirty preservation and protected current-state rechecks visible. The two constructed residency branches reset at the same checkpoint; their source/arithmetic ledger is [author evidence](docs/first-time-participant-revision-trace.md), not a runtime observation. Adding prose invalidates prior language receipts; record current fingerprints without fabricating a reviewer. The [integration checks](docs/first-time-participant-revision-checks.md) distinguish technical results from pending human acceptance.
