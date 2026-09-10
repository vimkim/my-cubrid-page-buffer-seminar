# Seminar authoring notes

## Audience and ownership

Write directly to participants. Explain the problem, contract, state owner and guard, then the bounded source path. Questions invite reasoning about consequences and counterexamples; native disclosures provide model explanations. Presenter pacing and facilitation belong in [presenter-runbook.md](presenter-runbook.md), outside participant navigation. That separation is editorial, not access control.

The [accepted design](docs/seminar-curriculum-design.md) and [ADR 0005](docs/adr/0005-make-html-an-audience-facing-seminar-curriculum.md) govern the HTML. The English Markdown guide remains governed by [maintainer-guide-notes.md](maintainer-guide-notes.md). Its canonical explanations, source inventory, and uncertainty registry retain ownership of technical claims.

## Editing a page

1. Update English and Korean together. Korean sentences should read naturally while retaining established database terminology, evidence labels, and exact source identifiers. Preserve qualifications beside their claims.
2. Keep mechanism depth and source routes. Define documentation-only notation before use: G/G+1 are reasoning labels, not stored counters; VS-* identifies an uncertainty-registry entry. Distinguish stable BCB storage from current VPID, compatible holders from identities, and sequential LRU movement from simultaneous membership.
3. Retain established URLs and anchors. The curriculum's dependency order, rather than filename order, owns previous/next lecture navigation. Landing and syllabus pages expose the same eight phases; topic references remain reachable independently.
4. Use shared layout A styles and presentation controls. Reading and no-JavaScript modes expose the complete explanation; presentation mode focuses one section without auto-advance. Native details work without application scripts. Preserve safety qualifications in the visible explanation.
5. Review both pages against all six axes in the design. Run both aggregate validators and their tests when changing validation. Browser checks cover reading, projection, mobile width, answer disclosure, and no-JavaScript access. A missing browser gate is unavailable, not passed.

The teaching-pages.json manifest remains the pairing and human language-review registry. Editing wording invalidates old fingerprint receipts. Automation may print fingerprints and report checks, but only an actual Korean-capable review can supply a review receipt. Reading history, keyword matches, and prototype preference are not language review or participant mastery evidence.

## Curriculum maintenance

All Core and Advanced content is required. Lectures can expand over multiple meetings with no total time limit. Cross-engine comparisons are late, responsibility-based lenses; performance ideas remain hypotheses until supported by controlled evidence. The [coverage audit](docs/curriculum-coverage.md) belongs to authors, not the participant topic library.
