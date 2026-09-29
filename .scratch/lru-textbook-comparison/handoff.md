# Main-lecture comparison implementation

Base: e398babf6fddde57e092382c290df7a1ff3f23f9. Implementation: a50f19f; source-comment anchor correction: 40e5b3f. Work item222. User confirmed the design and explicitly permits JavaScript. Status: implemented and technically verified; independent closing Standards and Spec reviews complete with zero remaining findings. Human language acceptance remains open.

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

- Focused: **76/76 passed, zero skips**, including both validator suites, seminar contracts/regressions and18 browser tests. Executed after the comment-anchor correction.
- Broad: **188 tests,185 passed,3 inherited failures,zero skips**. Failures are NEW_PAGE/B-tree source-range assertion, exact approved Markdown inventory and stale private-LRU lecture title, matching the prior delivery. This run preceded the href-only correction; final focused and link gates cover that correction.
- All seven bilingual technical source gates passed for51pairs: inventory,navigation,links,technical,language,static,audience. The full aggregate was executed and fails for missing actual human receipts/current fingerprints. No approval or fingerprint receipt was fabricated.
- Actual Copyparty bilingual served checks: **HTTP PASS253resources; live DOM PASS103pages**, including image dimensions and rendering/interaction checks.
- Guide source: **PASS43pages**, relative linksPASS, **60displayedSVGs/0orphans**, EnglishPASS. Actual Copyparty guide **HTTP PASS103resources; live DOM FAIL43pages**, retaining the existing Copyparty asset404/MIME problem. Browser automation was available; this is a failed gate, not an unavailable skip. Source-only omitted serving gates were UNAVAILABLE and are superseded by the executed served results.
- English/Korean screenshots at1440×1000 projection and390×844 reading were inspected. Text and controls remain legible; no horizontal page overflow (scrollWidth equals viewport width in all four cases). Dense tables continue by ordinary vertical scrolling. This visual inspection is not a human language receipt.
- JavaScript syntax and scoped git diff --check passed. No validator implementation changed; both validator test suites ran in focused/broad. No build/typecheck applies beyond the static HTML/JavaScript syntax checks.

Commands: set PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs. Broad: node --test scripts/*.test.mjs. Focused: node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/seminar-browser.test.mjs. Run both aggregate scripts; served base is http://127.0.0.1:3923/code-analysis/page-buffer-presentation, passed with --copyparty-url; bilingual --gate served isolates serving results. Local supplemental logs: /tmp/lru-comparison-{full,focused,bilingual,served,guide-source,guide-served}.log. Screenshots: /tmp/lru-comparison-{en,ko}-{projection,mobile}.png. Durable outcomes are recorded above, not only in temporary files.

## Independent review

### Standards

Initial e398bab...a50f19f review: zero documented-standard or heuristic smell findings. Participant voice, visible assumptions, paired meaning, existing static HTML/JavaScript pattern and author-only facilitation comply. Separate bilingual markup follows the established design, not accidental duplicated logic. Closing review independently checked40e5b3f and evidence documents against actual logs: zero remaining Standards findings.

### Spec

Initial review: zero material implementation findings. Scope, placement, example assumptions, conditional unfix, age distinctions, policy-versus-safety separation and cost boundaries match the confirmed design. The known performance-comment link needed its last line6720; correction40e5b3f now links6719–6720. Closing review verified that correction, untouched worked-example history and actual validation logs: zero remaining Spec findings.

Human review remains work item55. Final curriculum acceptance is not asserted; inherited tests/rendering issues require their owners' disposition. No engine changes, pushes, PRs or unrelated cleanup occurred.
