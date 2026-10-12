# Session 3 Korean spoken-script readability

Status: user criteria recorded; representative wording and one read-aloud-depth choice await shared-understanding confirmation.

## Scope and reader

Rewrite `my-presentation-script-session-3.html` for developers who attended the first two sessions but do not yet know the detailed `page_buffer.c` implementation. The presenter should be able to read the prose naturally; participants should be able to follow the execution order without reconstructing missing actors or premises.

The deliverable is the complete presenter script. This is not a summary or a reduction of the required mechanisms. It remains separate from participant navigation. Existing `CONTEXT.md`, `NOTES.md`, ADR 0005, and `docs/seminar-curriculum-design.md` retain their authority. No new domain concept or hard-to-reverse product decision has been identified, so a second glossary or ADR would duplicate the established documentation vocabulary.

## Settled criteria supplied by the user

- Explain starting state, actor/action, state change, and reason in that order when it helps the mechanism.
- Name the responsible thread and the affected page, frame, or field.
- Put one main action in each sentence; split dense paragraphs at causal transitions.
- Replace abstract preservation obligations, supply, and protection shorthand with concrete actions and conditions.
- Explain indispensable terminology in natural Korean on first use, retaining exact source identifiers and established English database terms.
- Define notation and the starting state before use; state independent resets and continuation explicitly.
- Separate spoken prose from screen-operation cues.
- Preserve mechanism depth, concurrency and safety conditions, evidence categories, qualifications, and pinned revisions.
- Preserve links, anchors, question identities and answers, native disclosures, and presentation behavior.

## Representative review samples

Three samples from the baseline script illustrate distinct problems:

1. Line 114, the no-copy alternative: omitted actors and abstract exclusion, obligation, and cleanup language. The alternative must remain a constructed design rather than a statement of current CUBRID behavior. Appropriate page-content protection, matching page LSA, WAL ordering, success/failure state, and longer writer waits must survive.
2. Line 231, post-flush consumption: dense current-state checks obscure two waiter types and the order of direct-victim offer versus FLUSHING cleanup. An offer is separate from allocator receipt and safe reuse; rejected reuse still requires old-flush completion.
3. Line 476, BULKREAD writeback: ring-slot removal and candidate release obscure which state changes and which does not. Keep the ring-selected dirty permanent page plus additional WAL-flush premise, released pin and retry, shared DIRTY preservation, and strategy-specific behavior.

## Remaining decision

Recommended: expand technical conditions and exceptions into complete, speakable Korean sentences even where this increases the script length. Keep source URLs and screen operations as separate cues. The user will review the three concrete examples and confirm whether this read-aloud depth fits the intended delivery. That answer will also confirm the shared understanding required by the invoked grilling workflow.

## Implementation and verification plan

After confirmation, work through all twelve run-sheet sections and their questions/answers. Retain the `.cue` and `.screen-cues` structural seams and exact link labels that mirror existing chapter headings. Use `.scratch` authoring records for the agreed style; do not change technical vocabulary in `CONTEXT.md` merely to accommodate a Korean wording preference.

The script is outside `teaching-pages.json` and the 27-page teaching-label registry, so script-only wording edits do not change the paired-page review fingerprints. Existing human review gaps remain separate.

Run both repository aggregate source validators. Run served HTTP and available headless-browser checks through a local Copyparty endpoint, including the Korean script test in `scripts/session-3-live.test.mjs`. Check twelve run-sheet sections, native answers, preserved question IDs, matching complete chapter screen maps, and all cue targets. Compare IDs, hrefs, source identifiers, and question/answer structure against the starting script. Report unavailable gates and pre-existing failures honestly.

Starting checkout: `/home/vimkim/gh/my-cubrid-page-buffer-seminar`, clean `main` at `85d0368`.

Task checkout: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-session3-korean-script`, branch `docs/session3-korean-script`. Local `main` is the merge destination; integration requires the repository's separate approval. No push or deployment is authorized.

Work-tracker item: 339.
