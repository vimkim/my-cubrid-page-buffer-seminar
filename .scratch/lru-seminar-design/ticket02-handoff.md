# Ticket 02: cooling, migration, and selection handoff

Status: implementation, independent content/source reviews, and final focused/served verification complete. Human Korean-naturalness and semantic review remains pending. This is not final curriculum acceptance.

Base: `56ee4cb`. Scoped implementation commit: `3347d0b`; a subsequent scoped commit records minor review corrections and this handoff. Work item 216 remains owned by the main coordinator. No engine changes, pushes, simulator work, or new runtime experiments occurred. Ticket 01's identities and numerical states remain preserved; introductory scope now explicitly distinguishes its first sequence from later events.

## Acceptance and routes

| Requirement | Delivered route and boundary |
| --- | --- |
| Explicit scan pressure and cooling | `#carry-forward` names existing unnamed nodes; `#cooling` derives S46–S49 and combined-zone demotion before zone-1 demotion. |
| Reuse and unchanged positions | `#cooled-reuse` derives age 51 versus 25, protected boost, unchanged saved tick, and routes back to the existing LRU1 keep case. |
| Second context and migration | `#cross-context` uses B's full index 33, sequential list locks under the BCB mutex, protected VOID, and destination shared 1. |
| Activity, quota and distinct clocks | `#quota-epoch` supplies unfix counts, interval and sample inputs, an accepted epoch, caps, shared arithmetic, hot-fix qualification and VS-21. |
| Genuine allocation pressure and list choice | `#exhaust-invalid` defines every remaining invalid-frame admission; `#select-list` predicts the first own-list helper and conditional restricted fallback without claiming candidate ownership. |
| Safety and evidence limits | AOUT remains dormant; VS-19/20/21 are visible and explicitly defined as uncertainty-registry IDs. No runtime/fairness/performance claim is added. |
| Bilingual integration and access | Existing EN/KO reference pair, native disclosures, shared controls, Lecture 12B checkpoint/return links, coverage and presenter reasoning. Manifest inventory stays 51 pairs; both changed pairs already have pending review records. |
| Successor baseline | `#selection-baseline` is the common state before T allocation, with no BCB/list mutex held. Exact state below supports tickets 03 and 04. |

All older anchors remain. Added anchors: `cooling`, `cooled-reuse`, `cross-context`, `exhaust-invalid`, `quota-epoch`, `select-list`, `selection-baseline`. `carry-forward` retains its URL as the continuation boundary. The `reuse-*` namespace is reserved for ticket 03, `policy-*` for ticket 04. Successors may append sections before the closing article and add matching rail links. Preserve these checkpoints and the original 0–5 sequence. Main owns the isolated-worktree integration contract.

## Complete source-derived state

The new names refine previously unspecified snapshot details; they introduce no insertion. Initial private LRU2 is Z1…Z48, LRU3 C1…C50. C50 is a permanent BCB/frame alias whose page identity is Q. The remaining INVALID chain is G1…G30766, with fresh hit_age 0. Scan page Sn enters permanent frame Gn. All listed pages are clean, not flushing/reserved, free of invalid-candidate flags, idle between events, and without waiter or unfix hint. No direct-victim waiter exists. Epoch 10, quota 1000 and thresholds 50/50 remain until the explicit pass.

| Checkpoint | INVALID / resident | Private 32 LRU1/2/3 | tick_list | bottom_1 / bottom_2 |
| --- | --- | --- | --- | --- |
| Ticket 01 carry-forward | 30766 / 2002 | 4/48/50 | 1002 | H2 / Z48 |
| S46 | 30720 / 2048 | 50/48/50 | 1048 | H2 / Z48 |
| S47 | 30719 / 2049 | 50/49/50 | 1049 | H1 / Z48 |
| S48 | 30718 / 2050 | 50/50/50 | 1050 | F42 / Z48 |
| S49 | 30717 / 2051 | 50/50/51 | 1051 | F43 / Z47 |
| A boosts P | 30717 / 2051 | 50/50/51 | 1052 | G1 / Z47 |
| B migrates P | 30717 / 2051 | 49/50/51 | 1052 | G1 / Z47 |
| S50 | 30716 / 2052 | 50/50/51 | 1053 | G1 / Z47 |
| S30766 | 0 / 32768 | 50/50/30767 | 31769 | G30717 / G30667 |
| Accepted epoch 11 | 0 / 32768 | 50/50/30767 | 31769 | G30717 / G30667 |

At S49, P's saved tick1000 gives age51 ≥ floor(50/2)=25. A's boost retains saved tick1000, moves P to top and R to LRU2, and adds one list tick. B then uses full index33, unlike P's32. B's successful fix leaves P linked; its final zero-count unfix migrates P through VOID. The private and shared list mutexes are held sequentially, while the BCB mutex protects the transition. `add_shared_lru_idx=0`, `avoid_shared_lru_idx=-1` select shared1 after increment to1, without refresh. Empty shared1 tick0 becomes1, and P saves0. Shared1 is 0/1/0, with top/bottom/bottom_2=P and bottom_1=NULL. Shared0's1900 LRU3 nodes remain unchanged.

For each completed scan n=50…30766: private size=101+n, counts=50/50/(n+1), resident=2002+n, INVALID=30766−n, list tick=1003+n. Thus all 30,766 admissions are explicit; no replacement happens during the batch. A quota bounds selection policy, not residence while INVALID supplies frames. No quota pass during this authored interleaving is a scheduling assumption, not a runtime timing claim.

Final private chain, top to bottom:

```text
LRU1 G30766 … G30717
LRU2 G30716 … G30667
LRU3 G30666 … G1 → F43/R → H1 → H2 → Z1 … Z48 → C1 … C50/Q
```

Conservation: private30867 + shared0's1900 + shared1'sP1 =32768; INVALID0. G1…G49 save ticks1002…1050; G50…G30766 save n+1002. F43 keeps saved tick1001. Initial private tick_lru3=100 and C1…C50 ticks99…50 establish C50 as the oldest hint; 30717 falls give final tick_lru3=30817. R falls at S100 with tick_lru3=150; Gn falls at S(n+100) and gets tick_lru3=n+150 for n≤30666. C50's previous node is C49; C50 remains bottom/hint. Private advertised candidates=30767, shared0=1900, shared1=0. Ordinary private queue[32] was first published at S900, when private size1001 exceeded quota1000; shared queue[0] remains, big-private queue is empty, no consumer has run. Successful publication is explicit.

The accepted pass uses `diff_usec=10000000`, private quota enabled and `is_adjusting=0`, without overlapping events. Unfix shards were reset by the prior pass, so the new sum is 3 original +30766 scan +1 boost +1 B=30771. Epoch-10 lru_hits[32]=30768; P's repeat/boost/migration add no second sample. All other hits are zero. Gates pass; activity32=floor(30768/10)=3076 and other private activity=0. At ten seconds old smoothing inputs are discarded. Private ratio clamps3076/3077 to0.998; uncapped all_private_quota=floor(32768×0.998)=32702. List32 quota=min(32702,5000,16384)=5000, thresholds250/250; other private quotas/thresholds remain0. Shared target=max(floor((32768−32702)/32),50)=50, thresholds20/2. Per-list cap remainder is not redistributed. Existing protected counts are not over the relevant gates, so no nodes move. Total candidates32667 makes victim_rich true. Epoch becomes11; all lru_hits reset0, while lru_activity[32]=3076. P/R hit_age remains10. P has four ordinary fixes, R one, each scan page one—below hot threshold64.

## Exact successor interface

Terminal `#selection-baseline` is **after the quota pass and before A allocates absent valid T**. No BCB or list mutex is held; all fixes are released. No candidate is detached, reserved, or overwritten. `#select-list` is a prediction from this state, not an executed allocation.

A's index32 has protected100≤quota5000 and total30867>quota5000 with30767 advertised candidates. Empty INVALID makes the real next allocation enter `pgbuf_get_victim`; its first call is `pgbuf_get_victim_from_lru_list(thread_p,32)` with no queue consumption. The helper locks list32, performs no protected-quota demotion, and resets a stale hint to clean bottomC50. The scan limit is1000; successful protected detach would retain the BCB mutex, but ticket02 has not executed that protocol. If the own search fails, size30867>5050 sets restriction; empty big-private queue skips ordinary[32] and routes to shared[0]. This conditional route is not another completed event.

Ticket03 can start with C50/Q as the candidate and introduce explicit alternative dirty/fix/reservation schedules. It must state extra LSAs, flags, ownership and intervening events it needs. F42/P remains shared1 LRU2 and is not a victim merely because the private scan exhausted INVALID. Ticket04 can compare unchanged LRU1 reuse and the exact S49 boost/migration sequence while retaining this separate terminal baseline. Do not silently promote private nodes to fill the new250/250 thresholds or replace Q with T before the protected protocol.

## Source and independent review

All checks used `git show f799e05d77d5300c6ea5753b4a6cc7caee6d8912:src/storage/page_buffer.c` in `/home/vimkim/gh/cb/develop`; the current worktree file was not the authority. Routes: age1053–1061; caps/quotas1069–1118; fix-history2444,16336–16367; unfix/migration6752–7038; INVALID-first8227–8243; shared selector8988–9063; victim list9067–9253; scan9330–9538; adjustment9985–10116; boost10118–10199; new insertion10207–10265; migration/unlink10303–10417; quotas14251–14511; candidate advertisement15674–15728 and zone bookkeeping15889–16001; queue16424–16471; hit sample16594–16610.

An independent factfinding agent derived scan counts, boundaries, age, retained saved ticks and conservation before final authoring. A separate independent Spec reviewer rechecked source, scan arithmetic, selector1, quota and queue routing, and found no incorrect implementation or scope creep. Its only pending item was this validation handoff; follow-up review of the completed handoff and its extra tick derivation cleared that item. The Standards reviewer verified all15 paired code excerpts against pinned source after whitespace normalization; its minor requirement to define VS-* was fixed in both languages and re-reviewed with zero remaining findings. Agent review supplies no human Korean-language receipt.

Final review: Standards 0 remaining findings; Spec 0 remaining findings. No remaining source/content finding is being deferred to tickets03/04.

## Verification

- Two approved served-page TDD slices failed before the relevant sections existed, then passed: direct cooling projection entry, native keyboard reveal, next/back and real counterpart navigation; complete no-JavaScript mobile pressure/quota/selection answers and keyboard return route.
- Broad suite: **181 tests,178 passed,3 failed,0 skipped**. The same pre-existing failures recorded by tickets01/F01/F02 remain: NEW_PAGE/B-tree source range; exact approved Markdown inventory; stale private-LRU lecture title. The broad run includes both aggregate validator test files and all browser regressions. It preceded only the minor VS identifier/sample wording correction.
- Final focused suite: **69/69 passed,0 skipped**, after the final wording correction; includes both validator test files, contract/regressions, and browser tests.
- All seven bilingual source gates individually pass for51 pairs: inventory, navigation, links/assets, technical parity, language/accessibility, static interaction and audience contract. The full aggregate ran and remains unsuccessful on missing actual human review receipts/current fingerprints across the site. No receipt was fabricated.
- Final bilingual served gate: **HTTP PASS253 resources; live DOM PASS103 pages**, after the final wording correction.
- Maintainer-guide aggregate: source PASS43 pages, relative links PASS, SVG PASS60 displayed/0 orphaned, English prose PASS, HTTP PASS103 resources. **Live DOM FAIL43 pages** because the existing Copyparty `/.cpr/w/` scripts/styles return404 or incorrect MIME. Browser was available; this is a failed gate, not unavailable.
- Both cooling answer projection renders at1440×1000 and reading entry renders at390×844 were inspected. Tables, states and controls are legible; revealed sections continue by normal vertical scrolling. No horizontal page overflow was observed. Terminal mobile renders were additionally inspected; their longer text continues by normal vertical scrolling.
- Scoped `git diff --check` passed. Static HTML/JavaScript has no separate TypeScript build/typechecking step. No new UI or SVG/raster assets were introduced.

Commands: `PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs`; Copyparty base `http://127.0.0.1:3923/code-analysis/page-buffer-presentation`. Broad: `node --test scripts/*.test.mjs`. Focused: `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/seminar-browser.test.mjs`. Both aggregate scripts used `--copyparty-url <base>`; bilingual `--gate served` isolates HTTP/DOM evidence from human-review currency.

Temporary diagnostics: `/tmp/lru-ticket02-{full,focused,bilingual,served,guide}.log` and `/tmp/lru-ticket02-{en,ko}-{projection,mobile,terminal-mobile}.png`. These are validation artifacts, not retained runtime or language-review evidence.

## Scoped files

EN/KO `reference/lru-worked-example.html`, EN/KO `lessons/0012b-understand-private-lru-index.html`, `scripts/seminar-browser.test.mjs`, `docs/curriculum-coverage.md`, `presenter-runbook.md`, and this handoff. The pairing manifest needed no inventory or review-status change: both affected pairs already have pending reviews. Main-owned orchestration/integration files and unrelated repository edits are excluded.
