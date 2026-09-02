# Bilingual Page-buffer Teaching Site

Status: resolved

This specification consolidates the authoritative decisions in the resolved
[Wayfinder map](./map.md) and its eight child issues. If this summary conflicts
with a linked decision, the linked decision governs.

## Scope

Migrate the 41 teaching HTML pages—the course entry, 18 lessons, and 22 HTML
reference cards—into matching `en/` and `ko/` trees. English HTML remains the
canonical content source. Korean pages provide natural Korean explanations for
senior engineers while preserving established database/CUBRID jargon, evidence
labels, code, source identifiers, links, anchors, and claim strength in English.

The canonical English Markdown maintainer guide, its Learning and Advanced
paths, playbooks, Question bank, and Evidence references remain shared and are
not translated. CUBRID behavior remains pinned to
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; changing engine behavior, course
curriculum, answer correctness, the hosting platform, or Copyparty is outside
this effort.

## Decisions

- Keep temporary English redirect stubs at the former lesson and HTML-reference
  URLs; root `index.html` becomes the language selector instead of redirecting
  ([01](./issues/01-choose-legacy-url-transition.md)).
- Reuse the existing English SVGs unchanged from the root `assets/` seam; do not
  create Korean visual variants
  ([02](./issues/02-choose-korean-visual-asset-boundary.md)).
- Pair every canonical English page with one maintained Korean page through a
  machine-readable manifest that owns structural and review metadata, not page
  content ([03](./issues/03-choose-bilingual-source-of-truth.md)).
- Put a visible, accessible, crawlable `EN | KO` control on every paired page,
  linking directly to the counterpart. Keep root selection manual and never
  force a locale choice ([04](./issues/04-choose-per-page-language-navigation.md)).
- Translate meaning into concise, natural Korean rather than mirroring English
  syntax. Localize reader-facing prose, controls, metadata, and accessibility
  text while preserving the technical invariants enumerated by the translation
  contract ([05](./issues/05-define-korean-translation-style-contract.md)).
- Use one aggregate bilingual checker with fixture-based regression tests to
  protect inventory, topology, links/assets, technical parity,
  language/accessibility, interactions, and served behavior
  ([06](./issues/06-define-bilingual-validation-gates.md)).
- Make review currency belong to exact EN/KO fingerprints. Only an explicit
  Korean-capable human review receipt can make a pair current; automation checks
  but never creates that receipt
  ([07](./issues/07-define-translation-review-and-drift-workflow.md)).
- Publish the complete cutover atomically after all mandatory gates pass. Keep
  legacy stubs for at least 90 days after publication and use a normal Git revert
  for rollback ([08](./issues/08-choose-cutover-and-rollback-sequence.md)).

## Acceptance gates

Acceptance requires all of the following:

1. Root `index.html` is a nonredirecting selector for `en/index.html` and
   `ko/index.html`; both trees contain exactly the same 41 manifest-paired paths.
2. Every pair has correct document language metadata and a direct accessible
   counterpart link. IDs, fragments, local HTML/CSS/JavaScript/image links,
   Markdown Evidence links, and shared SVG constraints validate from their
   nested locations.
3. Paired technical content remains equivalent: code and preformatted text,
   source URLs and anchors, pinned hashes, identifiers, script-facing classes and
   data, imported scripts, controls, answer values, and exercise behavior do not
   drift.
4. English pages and shared SVGs contain no unintended Korean prose. Korean
   pages have meaningful natural Korean reader content and localized titles,
   metadata, navigation, form help, feedback, and accessibility names while
   keeping the required jargon and identifiers in English.
5. Shared interaction logic contains no hard-coded reader-facing language. Each
   supported interaction works without exceptions and preserves the paired page
   identity when switching language.
6. Every pair is `reviewed`, its stored fingerprints match both current files,
   its Korean-capable human review receipt is complete, and technical parity
   passes.
7. The bilingual checker and its Node test suite pass. The canonical Markdown
   aggregate checker and its tests also pass unchanged. With a Copyparty URL,
   every page, redirect, and local dependency is requested; available live-DOM
   automation additionally checks navigation, rendering, console/page errors,
   image dimensions, and representative interactions. Missing HTTP or browser
   prerequisites must be reported as `UNAVAILABLE`, never as a pass.

## Publish gate

Do not publish or push the cutover until the selector, both complete trees,
localized interaction content, manifest, current review receipts, redirect
stubs, and every mandatory acceptance gate pass together. Record unavailable
optional environment gates explicitly. Push only after the final Standards and
Spec review has no unresolved material finding. Removing redirects is a separate
reviewed cleanup no earlier than 90 days after the published cutover and only
after repository-owned links are proven independent of them.
