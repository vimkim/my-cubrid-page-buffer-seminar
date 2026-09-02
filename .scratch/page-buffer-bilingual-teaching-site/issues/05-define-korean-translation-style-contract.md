# Define the Korean translation style contract

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

What exact style rules turn “natural Korean with English jargon” into a reviewable contract for headings, explanatory prose, UI labels, evidence labels, database terms, source identifiers, code, answer feedback, `lang` metadata, accessibility text, and search metadata? The recommended starting point is natural Korean sentences with established database and CUBRID terms kept in English, no parenthetical Korean coinages for familiar jargon, and byte-identical code/source identifiers across counterparts.

## Answer

Translate the intended explanation, not the English sentence shape. Korean prose must read as if it was written for a Korean senior engineer: reorder clauses, split or combine sentences, make omitted subjects explicit when useful, and choose natural connective language. Do not preserve awkward English syntax merely to maintain line-by-line correspondence, and do not add stronger claims, new advice, or certainty absent from the canonical page.

Apply these review rules to every Korean page:

- Keep established database and CUBRID jargon in English inside otherwise natural Korean sentences. This includes terms such as page buffer, buffer pool, page, frame, BCB, fix/unfix, pin, latch, mutex, holder, waiter, dirty, flush, WAL, Page LSA, redo, recovery, victim, replacement, LRU, hash, MVCC, invariant, fast path, and slow path. Do not append forced Korean coinages in parentheses for familiar jargon.
- Keep canonical evidence and teaching vocabulary in English, including Interface contract, Verified mechanism, Implementation policy, Inference, Runtime observation, Historical evidence, Learning path, Question bank, Core maintainer, and Advanced maintainer. Explain those labels in natural Korean where context requires it; do not silently rename the taxonomy.
- Preserve code, command text, SQL, filenames, paths, URLs, anchors, revision hashes, line ranges, HTML IDs/classes/data attributes, JavaScript keys, API names, function and type names, constants, variables, and other source identifiers byte-for-byte except for path changes explicitly required by the new directory layout.
- Translate headings, narrative text, table prose, instructions, questions, choices, answer explanations, feedback, buttons, link descriptions, placeholders, captions, and human-readable status messages naturally. A heading may mix Korean and English jargon; it need not mirror English word order.
- Preserve lesson intent, exercise mechanics, correct-answer logic, evidence level, warning strength, and source attribution. Korean wording may be reorganized, but it must not change what a learner is asked to infer or which answer the script accepts.
- Set Korean documents to `<html lang="ko">`. Write `<title>`, description/search metadata, navigation labels, `aria-label` text, form help, and nonvisual image descriptions in natural Korean while retaining English jargon and identifiers where they carry technical meaning. Shared SVG artwork and its embedded labels remain English under decision 02.
- Use ordinary Korean spacing, punctuation, honorific-neutral technical prose, and concise active constructions. Avoid translationese, unnecessary transliteration, and repetitive English/Korean double-labels.

A Korean page passes style review only when a Korean engineer can read it naturally without losing any English term needed to search the code, follow the canonical guide, compare engines, or verify the paired English source.
