# Main-lecture textbook LRU comparison

Status: confirmed by the user; implementation in progress. Work item222. See interview.md for decisions and source audit.

## Delivery

Add an audience-facing comparison block to paired Lecture12 immediately after #states and before #trip. Preserve URLs, original sections, the completed worked example, all required curriculum content and source evidence ownership. Add narrow discovery links from the syllabus and Lecture12B; no new lecture, simulator or engine change.

Teach in this order:

1. A plain-language distinction: exact LRU records every access in an exact recency order; CUBRID's pinned policy uses multiple lists, zones and conditional placement rather than one global exact order.
2. A compact comparison of ordering, movement timing, cooling/promotion, private/shared domains, quota/search, and metadata/synchronization costs. Generic database safety is a separate layer, not a unique alternative to exact LRU.
3. The existing R-before-P LRU1 example: before, P fix, final unfix. Define top/MRU orientation and hold assumptions constant. Explain why exact LRU would reorder, while this CUBRID keep branch does not. Do not transplant three-frame arithmetic into the engine snapshot.
4. Explain conditional outcomes rather than “unfix always moves”: LRU1 keep, age-gated LRU2 boost, ordinary LRU3 boost with exceptions, and private/shared migration. Introduce terms before source identifiers and link full derivations to their existing owners.
5. Separate placement, victim-list selection, and protected frame reuse. Explicitly say pin/dirty/WAL/recheck requirements also apply to a database that chooses exact LRU.
6. Explain structural trade-offs with bounded evidence: avoid some exact-recency update work but retain list/BCB synchronization and other costs; no measured speedup, optimality, guaranteed scan resistance or fairness claim.

Retain a short optional predict/reveal checkpoint with a native answer, source-linked representative branches and visible qualifications. Keep the main explanation readable without opening reference pages. Detailed counts, complete traces and catalogs remain linked rather than duplicated.

## Verification and limits

Update English/Korean together and affected presenter/coverage metadata as needed. JavaScript is permitted for presentation, navigation and useful interactions; reuse or extend the existing seminar.js where appropriate. The no-JavaScript requirement is a readable-content fallback, not a ban on JavaScript. Preserve reading/projection, keyboard and mobile behavior, with the complete explanation still readable when scripts are disabled. Verify claims against pinned source, review meaning and example assumptions independently, and run both existing aggregates and relevant tests/browser checks. Record inherited failures separately; editing content does not create a human-language receipt. Current human acceptance remains tracked by item55.

This is a reversible editorial extension under the existing curriculum ADR, so no new ADR or implementation-bearing glossary entry is warranted.
