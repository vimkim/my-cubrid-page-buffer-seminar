# Main-lecture comparison implementation

Base: e398babf6fddde57e092382c290df7a1ff3f23f9. Work item222. User confirmed the design and explicitly permits JavaScript. Status: implemented; full validation and independent reviews in progress.

## Delivered

Paired Lecture12 adds textbook-vs-cubrid, lru-hit-comparison, lru-conditional-movement, lru-policy-layers and lru-tradeoffs after states and before trip. The main explanation now covers exact versus conditional recency, the existing R/P counterexample, global-zero-count and exception gates, cooling and three different age notions, domains/quota/search, generic database safety, and evidence-bounded costs. Its LRU1 definition no longer conflates zone membership with the separate hotness heuristic. Lecture12B and the syllabus link into this explanation. Coverage and author-only facilitation notes are updated; the 51-pair inventory and prior worked-example states remain unchanged.

JavaScript is allowed and existing seminar.js is reused for projection and section navigation. Script-disabled reading is a fallback, not an implementation ban. No new simulator or engine change is introduced. No runtime observation, human language receipt or participant mastery is claimed.

## Evidence and example conventions

Use CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912, not current checkout HEAD. Read-only audit and author checked unfix6675–6845, age1053–1058, migration6996–7038 and selection9115–9250. Other evidence routes preserve existing zone-adjustment, candidate-scan, quantity and uncertainty owners.

The four displayed members are a window into the existing 32,768-frame snapshot, not a miniature engine configuration. Leftmost means MRU in the exact-LRU comparison and list top in CUBRID. R/P/H1/H2 begin in that order. Under the stated matching-domain/non-hot/clean/no-waiter/no-hint/nonconcurrent conditions, P fix then final unfix leaves CUBRID R/P/H1/H2 while exact LRU becomes P/R/H1/H2. Fix count0→1→0 does not change frame identity F42/P. The reference's full counts/ticks and source explanations are preserved.

## Test development

One served-page slice initially failed because the new comparison checkpoint was absent, then passed after paired content. A test attempt toggled from reading mode and encountered the existing viewport-based section selection rather than its intended target; the final regression uses the supported direct ?present=1 checkpoint entry and checks the JS toolbar state, keyboard disclosure, next/previous and actual trace navigation. No production navigation behavior was changed.

The second slice failed for the missing syllabus link, then passed after adding paired routes. It follows the link with keyboard input at390px with scripts disabled, opens the native answer, checks all five sections remain available and checks page-width overflow. Both new tests pass in both languages. Semantic/source review is separate from these behavioral assertions.

## Final verification

Pending full-suite, aggregate, served/visual and independent Standards/Spec results. Existing human-review and inherited broad/guide-rendering failures must be reported, never converted into passes.
