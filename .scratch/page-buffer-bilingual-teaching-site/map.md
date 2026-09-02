# Bilingual Page-buffer Teaching Site

Label: wayfinder:map
Status: resolved

## Destination

Produce an implementation-ready decision set for migrating all 41 current teaching HTML pages—the root entry, 18 lessons, and 22 reference pages—into structurally mirrored `en/` and `ko/` sites. The root `index.html` becomes a language selector. Korean pages use natural Korean explanatory prose while retaining English technical jargon, canonical source identifiers, code, and source links. The resulting specification must preserve navigation, shared assets, Markdown evidence links, anchors, scripts, and source traceability, and it must define automated validation for both language trees.

Wayfinding ends when the remaining architecture, translation-governance, compatibility, navigation, validation, review, and cutover choices are explicit enough to hand to `/to-spec`, `/to-tickets`, and `/implement`. Moving, translating, validating, committing, and pushing the HTML are implementation work after that handoff.

## Notes

- The scoped inventory is 41 HTML files: `index.html`, 18 files under `lessons/`, and 22 files under `reference/`.
- The bilingual site covers the teaching HTML. The canonical English Markdown maintainer guide and Evidence references remain shared unless a later decision explicitly changes that boundary.
- Existing CSS, JavaScript, SVG, Markdown Evidence references, and external CUBRID source links are dependencies whose relative paths must remain valid after nesting the language trees.
- CUBRID implementation claims remain tied to pinned baseline `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; translation must not strengthen or reinterpret those claims.
- Canonical English source symbols, filenames, function names, code fragments, evidence labels, and database terminology are translation invariants.
- Relevant sessions use Wayfinder to maintain this map, Grilling to settle trade-offs, and Domain Modeling to keep teaching and evidence vocabulary consistent.

## Decisions so far

- [01 — Choose the legacy URL transition](issues/01-choose-legacy-url-transition.md): keep compatibility redirect stubs for the current lesson and reference URLs during a defined transition period.
- [02 — Choose the Korean visual-asset boundary](issues/02-choose-korean-visual-asset-boundary.md): reuse the existing English SVGs from the shared root asset seam; do not create Korean SVG variants.
- [03 — Choose the bilingual source-of-truth model](issues/03-choose-bilingual-source-of-truth.md): English HTML is canonical; a manifest pairs every English page with its Korean counterpart and carries translation-review metadata.
- [04 — Choose per-page language navigation](issues/04-choose-per-page-language-navigation.md): every teaching page exposes a direct `EN | KO` counterpart switch; the root selector is the fallback and locale redirects are not forced.
- [05 — Define the Korean translation style contract](issues/05-define-korean-translation-style-contract.md): translate meaning into natural Korean sentences while keeping established database/CUBRID jargon and all technical identifiers in English.
- [06 — Define bilingual HTML validation and parity gates](issues/06-define-bilingual-validation-gates.md): enforce automated structural and technical parity across all 41 pairs, with recorded human review for Korean naturalness and optional served/live-DOM gates reported honestly.
- [07 — Define translation review and drift workflow](issues/07-define-translation-review-and-drift-workflow.md): manifest fingerprints make either side of a reviewed pair stale after review-relevant change; only an explicit Korean-capable human review receipt can make it current again.
- [08 — Choose the cutover and rollback sequence](issues/08-choose-cutover-and-rollback-sequence.md): stage logically reviewable changes, publish only after both complete trees pass every required gate, retain compatibility redirects for at least 90 days, and roll back with a Git revert of the cutover.

## Not yet specified

None. The decision map is ready for implementation.

## Out of scope

- Translating the canonical Markdown maintainer guide, Learning path, Advanced pages, playbooks, questions, or Evidence references.
- Changing CUBRID engine behavior, source code, or the substance of verified implementation claims.
- Redesigning the course curriculum, adding new lessons, or changing answer correctness.
- Publishing to a new hosting platform or changing Copyparty itself.
- Implementing, committing, or pushing the migration during the Wayfinder charting phase.
