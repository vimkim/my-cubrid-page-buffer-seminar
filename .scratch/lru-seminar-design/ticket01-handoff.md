# Ticket 01: admission and reuse handoff

Status: ticket 01 implementation complete; scoped validation and independent review complete. Human language review and the existing site-wide acceptance issues below remain open.

Work item: 214. Starting documentation commit: e5b843a488743af961adc3d0e19bbdbd7ce18a34.

## Delivered routes

- [English trace](../../en/reference/lru-worked-example.html)
- [Korean trace](../../ko/reference/lru-worked-example.html)
- Lecture 12's `trip` section links to `snapshot` in both languages.
- Checkpoints: `snapshot`, `load-p`, `admit-p`, `admit-r`, `hit-p`, `unfix-p`, `carry-forward`.

The new reference pair uses existing seminar presentation controls and native disclosures; no new runtime application logic is introduced. The bilingual inventory now declares 49 pairs; its checker validates the declared positive integer and actual discovered inventory instead of freezing the old 48-pair count. A root compatibility route follows the existing redirect convention.

## Constructed state and source verification

All engine checks used `git show f799e05d77d5300c6ea5753b4a6cc7caee6d8912:src/storage/page_buffer.c` in the local CUBRID repository, not its current worktree source.

| Checkpoint | INVALID | Resident | Private list 32: LRU1/2/3 | List tick | P fix count |
| --- | --- | --- | --- | --- | --- |
| Start | 30768 | 2000 | 2/48/50 | 1000 | not resident |
| P fix returns | 30767 | 2001 | 2/48/50 | 1000 | 1, VOID |
| P final unfix | 30767 | 2001 | 3/48/50 | 1001 | 0 |
| R fix and final unfix | 30766 | 2002 | 4/48/50 | 1002 | 0 |
| P repeated fix | 30766 | 2002 | 4/48/50 | 1002 | 1 |
| P final unfix again | 30766 | 2002 | 4/48/50 | 1002 | 0 |

The initial 2000 resident frames comprise 100 private and 1900 shared. During a successful new fix, the new resident VOID frame is outside those LRU counts. Every row conserves 32768 frames. Private threshold 50/50 follows quota 1000 at the pinned 5% ratios; protected totals 50, 51, and 52 never exceed combined threshold 100. Initial zone1 count 2 grows to 4 and never exceeds 50. H2 and the 48th zone2 node remain the boundaries.

The prior quota snapshot specifies private ratio 0.5 and private activity concentrated in list 32: 2000 * 0.5 = 1000; that list receives the full private quota and others receive zero. Shared target is floor(31768 / 32) = 992, thresholds 396/49. These are constructed snapshot values, not a claim about default runtime workload activity. No adjustment occurs during the trace.

Source routes: topology 5744–5800; quota calculation 14359–14496; INVALID pop 8905–8952; claim/load/publication 8392–8634; final-unfix zero/waiter gates and LRU1 keep 6636–6814; VOID admission 6885–6994; migration predicate 6996–7038; READ fast-path rejection 7738–7749; ordinary latch/holder grant 6277–6634; top insertion 9694–9740; protected new-node insertion 10207–10232; zone adjustment 9985–10016; quota epoch sample 16594–16610.

F42/P saves tick 1000 and F43/R saves 1001; final list order is F43 → F42 → H1 → H2 followed by 48 zone2 and 50 zone3 nodes. Both are clean, non-hot, NO_LATCH, fcnt 0, private list 32. Their hit ages are 10; quota epoch is 10; list hits are 2, including the first admissions but no duplicate contribution from P's repeat in that epoch. No intervening activity or hidden policy-changing event is assumed. Context A uses full index 32; context B's index 33 is introduced but B remains idle in this slice.

## Verification record

- Browser regression observed red (404 before the page existed), then green for both languages: prediction/reveal, step order, backward navigation, unchanged list order, and presentation deep link.
- Inventory regression observed red under the 48-pair constant, then green with the declared-count check; mismatched counts still fail.
- The final focused suite passed 62/62 tests: maintainer-guide validator, bilingual validator, seminar contract, seminar regressions, and browser tests. This includes both no-JavaScript language variants, mobile-width overflow checks, actual language-link navigation, and expandable source context.
- The broad suite ran 173 tests before the final added no-JavaScript regression: 170 passed, three failed. All three failures were reproduced from an archived starting commit: stale NEW_PAGE source-range assertion, stale exact Markdown inventory, and stale Lesson 0012B title assertions. These are pre-existing, not repaired in this scoped ticket. Focused tests were rerun after review changes.
- Maintainer-guide source validation passed: 43 Markdown pages, relative links, 60 displayed SVGs with no orphans, and English prose. Served HTTP passed for 103 resources, but Markdown live DOM FAILED because the existing Copyparty endpoint returns 404/incorrect MIME for its own `/.cpr/w/` assets. This is a failed environment-dependent gate, not a pass or an unavailable-browser skip.
- All bilingual source/technical gates passed for 49 pairs: inventory, navigation, links/assets, technical parity, language/accessibility, static interactions, and audience contract.
- Bilingual served HTTP and live DOM passed: 247 resources and 99 pages. Chromium was available through the installed Playwright test package. Desktop/projector and mobile renders of the new page were inspected; opening setup still requires vertical scrolling, with quota derivation collapsed and explicit scrolling supported. No horizontal page overflow was observed at 390px.
- The full bilingual aggregate remains unsuccessful only on human review currency: existing pairs and the new pair lack actual review receipts/current recorded fingerprints. No receipt was fabricated. The new pair and edited Lecture 12 pair require review before final curriculum acceptance.
- Independent Standards review found no hard violations and raised setup density/overloaded notation as readability concerns. The quota derivation is now disclosed and the private-list-count label no longer conflicts with page P. Independent Spec/source review confirmed all numerical transitions; its source-excerpt-depth finding was fixed with expandable exact admission, idle-grant, and LRU1-keep branches and re-reviewed with no remaining findings.

Reproduction uses the existing local Copyparty endpoint at `http://127.0.0.1:3923/code-analysis/page-buffer-presentation` and `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs`. Run `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/seminar-browser.test.mjs` for the focused suite; run both aggregate validator scripts with `--copyparty-url` for served checks. The bilingual script's `--gate served` isolates HTTP/DOM results from human-review currency. Temporary raw receipts are `/tmp/lru-ticket01-focused.log`, `/tmp/lru-ticket01-tests.log`, `/tmp/lru-ticket01-baseline-tests.log`, `/tmp/lru-ticket01-baseline-shell.log`, `/tmp/lru-ticket01-guide.log`, and `/tmp/lru-ticket01-served-final.log`; they are diagnostic artifacts, not permanent runtime evidence.

## Remaining scope

Tickets 02–05 own cooling/migration, progress branches, policy defense, and complete integration. They extend the same fixed example. New engine experiments and a simulator are not prerequisites. Human review receipts must be supplied by actual reviewers; no automated fingerprint output is a receipt.
