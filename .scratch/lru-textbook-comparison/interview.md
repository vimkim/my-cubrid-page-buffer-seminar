# Explicit textbook-versus-CUBRID LRU explanation

Status: design interview in progress; no HTML implementation authorized by design confirmation yet. Work item 222.

## Request and preserved decisions

The user requests an easy, detailed explanation of how CUBRID replacement differs from textbook LRU inside the main HTML lecture, using grill-with-docs. Existing scattered checkpoints/reference links alone did not meet this need.

Preserve the accepted beginner-to-maintainer curriculum, canonical English and Korean live delivery, stable URLs, one recurring workload, explicit toy versus pinned-source model boundaries, accessible presentation and full no-JavaScript reading. Keep CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912 and existing evidence ownership. Completed implementation item216 is not reopened. Human review item55 remains separate.

## Design tree and first frontier

1. Placement: expand an existing main replacement lecture, or add a separate required lecture? Recommendation: a visible comparison block early in Lecture12, linked from Lecture12B and the syllabus, without creating another lecture.
2. Explanatory scope: focus only on hit/final-unfix movement, or explain the complete replacement-policy model? Recommendation: cover ordering, update timing, zones, private/shared organization, quota/search, and protected reuse; separate generic database safety constraints from CUBRID-specific policy choices. Use prose, a compact comparison, and existing worked-example checkpoints rather than duplicate the full trace.
3. After these settle and the read-only audit returns: resolve any actual placement/prerequisite or example conflicts, then obtain confirmation of the consolidated design before implementation.

## Vocabulary and documentation boundaries

Use the existing Seminar lecture and Canonical explanation vocabulary. Do not invent a glossary entry for general LRU terminology or put implementation details into CONTEXT.md. This reversible editorial addition does not presently justify an ADR. Record newly accepted scope decisions here as the interview proceeds.

## Accepted first-round answers

The user answered “yes yes”: Q1 and Q2 recommendations are accepted. Expand existing Lecture12 rather than create a separate required lecture; cover the complete comparison rather than only hit/final-unfix movement. Existing bilingual, audience, source and accessibility decisions remain in force.

## Evidence audit and resolved placement

The read-only audit found the gap is explicit main-lecture synthesis, not missing technical evidence. Lecture F1 already explains exact LRU, and F2 owns introductory database safety. Insert the new Lecture12 block after #states and before #trip, so state vocabulary precedes the comparison. Connect Lecture12B's activity, movement and victim-search sections without duplicating their full explanations. Preserve the completed worked example and its snapshots.

The representative event is the existing reference's #hit-p → #unfix-p: private LRU1 has R before P; ordinary matching-domain/non-hot access and release of P leave it below R, unlike exact LRU. Retain assumptions and identify this as a window into the larger pinned snapshot, not a new tiny CUBRID pool.

Audit source checks at f799e05d77d5300c6ea5753b4a6cc7caee6d8912: zero-count/waiter gates6675–6725; LRU1 keep6752–6778; LRU2 age6780–6815; LRU3 exceptions/boost6817–6844; migration6996–7038; age1053–1058; zone adjustment9890–10106; list selection9115–9250; protected scan9340–9454; quota epoch14297–14330 and sampling16595–16610. These are source observations, not runtime or performance evidence.

Do not equate LRU1's protective role with the separate hotness heuristic. Distinguish list-event age, quota epoch and hot-fix history. Private means policy domain, not exclusive ownership; quota is not a hard physical partition. Avoid universal speedup, scan-resistance or progress guarantees, and do not relabel the active mechanism as 2Q while AOUT is dormant.

## Remaining frontier

The user confirmed the consolidated design with “yes”; HTML implementation may proceed.

## JavaScript clarification during implementation

The user explicitly permits JavaScript and challenged wording that sounded like a prohibition. There is no JavaScript ban in the accepted curriculum: shared seminar.js already provides presentation/navigation behavior. Clarified design.md to distinguish permitted JavaScript enhancement from the existing readable-content fallback when scripts are disabled. This does not require removing working JavaScript or disabling useful interactions.
