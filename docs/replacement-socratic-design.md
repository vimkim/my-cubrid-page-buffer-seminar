# CUBRID replacement: causal explanation design

## Status

Design accepted on 2026-09-30. The user confirmed the complete shared design and
authorized implementation.

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
