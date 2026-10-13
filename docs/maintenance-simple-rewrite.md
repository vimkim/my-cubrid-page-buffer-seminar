# Maintenance quotas: a simple worked story

The user asked to understand quota adjustment through examples with very simple
language. This revision replaces the abstract opening of the paired
[English](../en/seminar-3/06-maintenance.html) and
[Korean](../ko/seminar-3/06-maintenance.html) chapters with a book-shelf analogy
and one continuous calculation. It supersedes the opening wording and heading
inventory in the [earlier readability record](maintenance-readability-design.md).
It does not change engine behavior or the canonical Maintainer Guide.

## Reading route

The opening explains a frame as a place for one book, the pool as the shelf,
and quota as a target written on a label. It then separates the two divisions:
private versus shared activity determines the total private target; each private
list's mixed activity determines its share of that target. The two accepted
updates show why a sustained change produces gradual quota changes.

A separate 100-page example explains zone adjustment without claiming that a
smaller quota immediately empties frames. The existing Q12 and interactive trace
still explain accepted updates whose calculated quota stays unchanged. The recap
provides an explicit exit to the next chapter. Each of the thirteen supporting
screens now starts with a short explanation and puts precise prose and source
rules in native disclosures. Detailed disclosures and questions remain flat so
keyboard activation can reach every one.

All 24 section anchors, the exact-arithmetic disclosure anchors, Q12/Q13, the
quota trace and all 18 Q&A disclosures in each language remain present. The
three contents maps, route title and affected Korean script follow the new
headings. No shared JavaScript, CSS, validator or SVG source changed. The existing
maintenance data-structure diagram follows the basic explanation, beside the
separate backup discussion; its registered definition remains visible.

## Constructed inputs and arithmetic

These calculations are source-derived examples, not runtime observations. They
use CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, checked in the clean
`/home/vimkim/gh/cb/pgbuf-grill` worktree.

The continuous example has 10,000 occupied frames, four private lists and four
shared lists. Only the Blue and Green private lists have activity. The starting
stored private fraction is 0.5 and each active list's stored activity is 500.
Each accepted update occurs 5,000,000 microseconds after its predecessor, with
10,000 counted final unfixes, no intervening update, no concurrent counter change
and no wrap. This is a constructed sampling interval, not the daemon's timer.

| Input or result | First update | Second update |
| --- | --- | --- |
| Blue / Green raw hit samples | 4,500 / 500 | 4,500 / 500 |
| Raw samples per shared list | 1,250 | 1,250 |
| Blue / Green current integer rates | 900 / 100 | 900 / 100 |
| Total shared integer rate | 1,000 | 1,000 |
| Blue / Green old activity | 500 / 500 | 700 / 300 |
| Blue / Green mixed activity | 700 / 300 | 800 / 200 |
| New and stored private fraction | 0.5 | 0.5 |
| Total private target | 5,000 | 5,000 |
| Blue / Green quota | 3,500 / 1,500 | 4,000 / 1,000 |

The page presents the division as seven versus three, then eight versus two,
shares out of ten. Both the 5,000-page and half-pool caps leave these quotas
unchanged. A standalone C++ arithmetic check reproduced the source's integer
rate conversion, integer activity mixing and float quota multiplication, yielding
700/300 and 3,500/1,500, followed by 800/200 and 4,000/1,000.

In the independently reset zone example, quota 100 becomes 60 with initial
LRU1/LRU2/LRU3 counts 20/50/30. There is no direct-victim waiter or concurrent
change. The private outer guard passes because 70 > 60. The two inner thresholds
are each `int(60 * 0.05f) = 3`. Demotion changes the counts to 6/0/94 and then
3/3/94, with all 100 pages still resident. The retained deeper example shows the
full movement order and the separate state where the outer guard does not pass.

Primary source routes:

- [Rate conversion and activity mixing](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14332-L14377).
- [Private fraction, target division and caps](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14379-L14455).
- [Private/shared publication and adjustment guards](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14457-L14494).
- [Zone demotion and optional protected direct offer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9993-L10120).

Samples remain selected, approximate signs of use rather than every read. Targets
remain policy metadata rather than capacity reservations or safe-reuse authority.
Protected current identity, use, waiters and write obligations still govern reuse.
VS-20 and VS-21 retain their existing uncertainty status.

## Verification

The guide aggregate passes source validation for 43 pages, 75 displayed SVGs
with no orphaned SVG, all 118 HTTP resources, and all 43 live-DOM pages.
The Session 3 product contract passes for all 27 product pages. The changed
chapters retain every previous ID and all Q&A disclosures.

Focused headless checks of both languages pass at 1440, 390 and 320 pixels,
in reading and presentation modes and with JavaScript disabled. Native details
open without scripts. The rendered quota tables were visually inspected.
An initial full Session 3 browser run exposed keyboard activation failures for
nested disclosures; flattening the new wrappers fixed both affected checks.
The final full Session 3 suite passes all 15 tests with no failures or skips.
After adding explicit Blue/Green definitions at each relevant direct-entry
screen, focused definition and spoken-map checks were run again. The actor
names are registered in the teaching-label ledger with the same Blue/Green
identifiers in both languages; no validator was changed. The filtered runners
printed passing assertions but stayed alive during cleanup, so their private
browser processes were stopped. A separate final direct browser check completed
normally for both revised chapters, including visible definitions, mobile widths,
presentation and script-disabled native disclosures.

The bilingual aggregate has no technical/source, HTTP or live-DOM diagnostic
after the final rewrite. It still reports 78 missing human language-review
receipts and 102 stale fingerprints on unrelated pairs, so the aggregate as a
whole is not a pass. Only the two edited pairs' fingerprints
were refreshed; their review state remains pending. Automated checks do not
establish Korean-language acceptance or participant understanding.

The first served guide check used a renderer mount without its vendor assets and
failed its DOM gate. Pointing the validation server at the complete existing
renderer directory resolved those errors; the successful result above is from
that corrected server. No repository validation rule was changed.


## Approved local integration

The user approved local rebase and merge on 2026-10-13. The rewrite was rebased
onto the current destination, preserving the subsequently integrated quota
calculation diagrams, exact-limit explanations, beginner/depth speaker layout,
flush-control rewrite, scan-order explanation and daemon completion conditions.
The last destination inspected before integration was `c4f61f5`.

All maintenance section/disclosure IDs, the original quota trace and all 18 Q&A
disclosures remain present in each language. Every other speaker-script section
and every other contents chapter matches the current destination. Only the
maintenance and contents pairs' fingerprints are refreshed; review stays pending.

The full 15-test Session 3 browser suite passes on the first rebased tree.
After the later independent changes were incorporated, all 17 contents/definition
contract tests and direct headless checks of both maintenance chapters pass.
The guide aggregate passes its 43-page source and live-DOM gates and all 132
HTTP resources, with 89 displayed SVGs and zero orphaned SVGs. The bilingual
aggregate on that tree reports only 78 missing human receipts and 98 stale
fingerprints inherited from its destination; the later daemon-completion merge
refreshes its changed pair, leaving 96 stale unrelated fingerprints. The final
source aggregate has the same 78 receipt and 96 fingerprint diagnostics and no
other failure. Available rendered gates pass; no pending human gate is treated
as a pass.
