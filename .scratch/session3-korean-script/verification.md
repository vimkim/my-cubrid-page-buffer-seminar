# Session 3 Korean script rewrite verification

Date: 2026-10-13. Baseline: `85d0368`. Task branch: `docs/session3-korean-script`.

The user confirmed the representative complete read-aloud style. All twelve chapters, their starting states, questions, answers, alternatives, observation proposals, and final synthesis were reviewed. The rewrite changes 270 of 275 non-cue/source paragraphs; five already-clear introductory, transition, or link paragraphs remain. Existing screen-operation paragraphs now carry a visible Korean cue label. The two generation-table obligation labels use concrete recording language.

## Preserved structure

An ordered comparison against the baseline script preserved all 53 IDs, 510 hrefs, four stylesheet/script resources, 24 question identities, 94 code elements with exact text, twelve run-sheet section attributes, and 41 native details disclosures. The thirteen h2 and 52 h3 elements retain their exact authored markup. Table/list scaffolding, question containers, and details/summary attributes are unchanged. Complete Korean screen-map order and current headings were checked by the served-browser suite.

The script is not a paired participant page in `teaching-pages.json`. Its wording does not change paired-page review fingerprints or the 27-page teaching-definition registry.

## Results

| Check | Result |
| --- | --- |
| `git diff --check` | PASS |
| Maintainer-guide aggregate with Copyparty | PASS: 43 Markdown pages; links; 71 displayed SVGs with no orphans; English prose; 114 HTTP resources; live DOM for all 43 pages |
| Complete bilingual aggregate with Copyparty | Existing review gate remains FAIL: 78 missing Korean review receipts and 96 stale historical fingerprints; exact failure set is unchanged from baseline; no other failure |
| Bilingual `--gate served` | PASS: 350 HTTP resources and live DOM for 158 pages; no unavailable browser gate |
| `node --test scripts/session-3-live.test.mjs` | PASS: 15 tests, zero failures, zero skipped; includes all Korean spoken screen cues and complete maps |
| Focused script reading check | PASS: 1920, 1280, 390, and 320 px widths with no horizontal overflow; all 29 native answers open and close with JavaScript enabled and disabled; no page errors |
| Rendered Korean review | Agent visual inspection of the generation/question reading view; clear reading measure and intact native disclosures |

The browser reading check handles both paragraph-based and plain-text disclosure answers. Its initial paragraph-only assertion was too narrow for existing plain-text answers; the corrected check verifies rendered disclosure content independent of its internal element choice. No product defect was attributed to that temporary assertion failure.

## Semantic review

Read-only comparison of 224 explanatory replacements against baseline wording and adjacent context identified and corrected eight semantic or actor ambiguities. Corrections retained the acquisition-accounting cost comparison, prohibited observer-created gaps as production counterexamples, pinned asynchronous-I/O wording, clarified no-copy image protection and DWB submission ownership, retained identity lifecycle work, required checkpoint inclusion, and separated early counters from possible later invalidation rejection. The remaining question rewrites retain the original questions' reasoning targets and premises.

The review retained CUBRID's post-flush offer-before-FLUSHING order, new-DIRTY preservation, queue-full caller completion, receiver rechecks, VS-20/21 evidence limits, post-write token accounting and retry-versus-time distinction. It also retained PostgreSQL's private/shared pin accounting and I/O lifetime qualification, conditional CAS, strategy-specific ring rejection, current DIRTY invalidation checks, promotion comparisons, and the final trace's special vacuum-unfix premise.

No engine code, source pin, runtime experiment, benchmark result, human-language review receipt, participant page, or shared UI was changed. Agent editorial/visual comparison is not a human language-acceptance receipt.

## Reproduction

The task checkout was mounted read-only at a local Copyparty URL root. Browser checks used an installed Playwright ESM entry and headless Chromium; no GUI was launched.

```sh
node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3949
node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3949
node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:3949
SEMINAR_URL=http://127.0.0.1:3949 node --test scripts/session-3-live.test.mjs
```

Set `PLAYWRIGHT_MODULE` to the available Playwright entry if the module is not on Node's normal search path. The focused structure and reading receipts and aggregate logs are retained in [checks](checks/).

## Integration boundary

The starting main checkout was clean. Other authorized work advanced local main during this task; its participant-page and screen-heading changes are not part of this rewrite. After merge approval, rebase onto the current local main, preserve those updates, reconcile any cue labels with the current chapters, and run proportionate checks before the fast-forward merge. No push or deployment is authorized.
