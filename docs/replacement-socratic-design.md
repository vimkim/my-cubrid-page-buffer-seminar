# CUBRID replacement: causal explanation design

## Status

Design accepted on 2026-09-30. The user confirmed the complete shared design and
authorized implementation.

## Lecture split (2026-09-30)

The user requested a shorter Lecture 7 after its expansion to 38 sections. The
causal sequence now spans two paired lecture pages: `0007-replace-one-frame.html`
retains pool/list organization, admission, zones, movement and quota (18 sections);
`0007a-select-and-reuse-frame.html` continues from list selection through victim
queues, residency outcomes, safe reuse and progress (20 sections). This supersedes
the single-page packaging and unchanged-navigation constraints below. Mechanism
content, source evidence, examples and reset boundaries remain intact.

The full curriculum places 7A immediately after 7. The bounded first-principles
session retains its existing stop order and included sections; its policy exit at
quota now coincides with the end of Lecture 7. The itinerary and current Korean
script use direct links to 7A for selection and reuse. Old Lecture 7 fragment URLs
retain explicit destination links outside the presentation section sequence.

## Accepted decisions

- Assume participants understand page/frame/BCB distinctions and textbook LRU.
  Introduce CUBRID private/shared LRU, LRU1/2/3 and quota from their foundations.
- Make the paired Lecture 0007 pages a self-contained explanation. Keep one
  continuing example through pool structure, private/shared organization, zones,
  page entry and subsequent access, candidate selection, safety checks and reuse.
  Existing deeper pages remain supporting references.
- Replacement is the most important topic. Give it as much teaching time as
  understanding requires; the previous 35-minute cap does not constrain this
  revision. Do not demote cost or native evidence solely to fit that cap.
- Advance Socratically: explain why each mechanism exists and what would happen
  without it before explaining its operation.
- Construct simpler designs and test them with concrete scenarios before adding
  CUBRID mechanisms. Each step follows question, prediction, counterexample,
  mechanism, and remaining limitations.
- Keep each question and scenario diagram visible. Reveal the predicted outcome
  and explanation through native disclosures, including the reason to introduce
  the next concept. The presenter controls advancement; independent reading and
  no-JavaScript access remain supported.
- Replace the first-principles route's fixed timetable with an ordered topic
  route. Keep its existing URLs. Do not shorten other topics to force replacement
  into three hours. Update active route wording and governing authoring documents
  consistently; historical delivery records remain historical.

## Accepted explanation sequence

Start with a shared pool and a request for a nonresident page. Establish why a
free frame avoids eviction and why a full pool needs replacement. Then test a
single exact-LRU list with concurrent access and repeated reads mixed with a
scan. Introduce private/shared organization, explain what private does and does
not mean, and show how each list's zones participate in placement and reuse.

Continue the same example through initial placement, subsequent access, zone
movement, quota, selection of a list, and selection of a candidate within it.
Explain each device's absence using a clearly labelled simplified alternative.
Separate policy consequences from correctness failures: removing a performance
policy need not make reuse unsafe, while removing a safety check can do so.

Finally follow candidate protection and recheck, old mapping removal, and frame
reuse. Explain progress when candidates are fixed or dirty. Connect zone costs
and existing native evidence after the causal model is established, preserving
their scope and limitations. Compact verified function paths connect each major
mechanism to source; deeper existing material remains reachable.

## Implementation scope

Rewrite paired Lecture 0007 while preserving its existing fragment IDs and deep
reference material. Use the existing presentation controls and native answer
disclosures, with responsive HTML diagrams in a lecture-specific stylesheet.
Keep the full curriculum navigation unchanged. Replace the route timetable and
its active incoming labels in both language trees, and update authoring guidance
and the route glossary. Human translation-review receipts remain pending.

## Evidence boundaries

Counterfactual designs are teaching models, not claims about CUBRID's historical
design intent. Validate actual transitions and policy conditions against the
repository's pinned source before authoring implementation explanations.

## Accepted private/shared rationale extension (2026-09-30)

The user approved rebuilding the paired Lecture 0007 explanation around why
multiple shared LRUs alone do not provide private-domain accounting. Follow one
page through session-associated admission, same-domain reuse, cross-domain reuse,
and reclamation. Connect list sharding, quota and victim preference before
introducing migration. Preserve the existing anchors and native disclosures.

Use exact pinned-source traces and explicitly constructed scenarios, without a
new native experiment. Include different sessions sharing one private domain,
one domain migrating a hot-and-old page, and the final-unfix context boundary.
Distinguish policy intent from the index predicate; show that migration changes
the current full LRU index and enters shared LRU2 without eviction immunity.
The existing focused Evidence reference retains technical provenance ownership.

This is a reversible explanation revision within the accepted curriculum;
no new architectural decision record is needed. The replacement glossary records
domain meanings; executable conditions remain in the explanation and evidence.

The user additionally required explicit design assumptions and consequences of
omitting each mechanism. Show domain-local reuse, sampled-activity prediction,
cross-domain/hot reuse signals and maintenance-cost trade-offs alongside their
failure boundaries. Contrast shared-only, private-without-quota and
private-without-migration models; separate policy losses from safety failures.

## Clarity revision: equal protection capacity (2026-09-30)

Lecture 0007 now compares LRU1=100 plus LRU2=100 with LRU1=200, retaining
existing LRU1 reuse behavior in the latter teaching alternative. Extra protected
capacity alone does not justify LRU2. The distinction is conditional promotion
in LRU2 versus keeping position in LRU1. A larger region with an equivalent
conditional promotion rule remains a possible alternative; no comparative
performance advantage is established here.

Private/shared rationale and assumptions are shorter, with migration predicates
and edge cases in a technical disclosure. The visible explanation states that
private-to-shared migration enters shared LRU2 independently of dormant AOUT.
The exact pinned source was read with `git show f799e05:src/storage/page_buffer.c`
to avoid relying on working-tree instrumentation. Existing anchors are retained.

Verification in the sibling task worktree, served at local Copyparty port 3942:

- Maintainer aggregate: all gates passed, including 43 Markdown pages,
  63 displayed SVGs, 106 HTTP resources and 43 live-DOM pages.
- Bilingual aggregate with HTTP and headless DOM checks: only the existing
  translation-review gate reported failures (162 missing-receipt or stale
  fingerprint diagnostics across 54 pairs). No human receipts were supplied.
- Focused EN/KO checks passed for mobile width, no-JavaScript disclosures,
  presentation mode, keyboard disclosure, next-section navigation and page errors.
  The Korean presentation view was visually inspected.
- `git diff --check` passed. No validation or shared interaction code changed.

Human language acceptance and participant comprehension remain unverified.
