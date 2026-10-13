# Maintenance chapter: explain the policy before its arithmetic

> The later [simple worked-story revision](maintenance-simple-rewrite.md) replaces
> the opening wording and heading inventory below while preserving its anchors
> and source details. This record describes the earlier accepted revision.

The maintenance chapter now explains why retention targets need reconsideration,
what a target changes, and why candidate selection still requires protected
checks. Exact timing, formulas, configuration, cost and revision-specific findings
follow that model. The user accepted this order and the first three Korean screen
samples on 2026-10-13. Work item 344 records the decision and execution.

## Scope and authority

The [English chapter](../en/seminar-3/06-maintenance.html) and
[Korean chapter](../ko/seminar-3/06-maintenance.html) are the paired audience product.
The three contents maps and the maintenance block of the
[spoken script](../my-presentation-script-session-3.html#maintenance) follow their
actual headings and order. Existing chapter URLs, all 17 prior section anchors,
Q12, Q13 and the quota trace remain stable.

While this work was in progress, `main` received the daemon Q&A commit `1d1a886`.
The rewritten chapter preserves all 18 of its maintenance Q&A disclosures in each
language. The dirty-page/over-quota question follows the definitions on
`reuse-checks`; the remaining questions retain their corresponding source sections.
Their native disclosure and answer-reset behavior is preserved.

This is an editorial revision under [ADR 0005](adr/0005-make-html-an-audience-facing-seminar-curriculum.md)
and the [curriculum design](seminar-curriculum-design.md). It changes no domain
definition, engine behavior or evidence status. The existing vocabulary in
[CONTEXT](../CONTEXT.md) remains authoritative; another glossary or ADR is not
needed for these reversible explanation choices.

## Accepted explanation choices

- Assume basic programming and linked-list knowledge, without page-buffer or
  quota-adjustment prerequisites.
- Start with a full 12-frame teaching pool, a request repeatedly reading four
  pages and a concurrent sequential scan. Continue that example when the repeated
  set changes to eight pages.
- These numbers describe workload pressure. They are neither a supported pool
  configuration nor an execution of CUBRID quota arithmetic.
- Explain replacement lists and quota only after the competition and the limits
  of an unchanged target. Private lists are session-associated accounting groups;
  multiple sessions can share one. Shared lists are not a synonym for scan pages.
- Separate the counters that help admit an update from the list samples that
  contribute to target calculations. Neither is a complete read history.
- Show target publication, conditional movement and candidate-source publication
  as different effects. Keep current-use and write-obligation checks visible.
- Keep the existing unchanged-quota question and trace in the basic explanation.
  Put exact gates, smoothing, limits, startup inputs, CPU work, backup-loop findings,
  alternatives and experiments after a recap.
- Preserve reading, presentation, native answer disclosure and script-disabled
  access. Do not infer participant understanding from automated checks.

## Current screen order

The first eleven screens establish the model. The remaining thirteen make it
precise and support source reading or diagnosis. Details remain part of the same
chapter and are reachable through stable direct links.

| Screen | Anchor | Responsibility |
| --- | --- | --- |
| 1 | `workload` | Page/frame/pool and the cost of removing a soon-needed page. |
| 2 | `fixed-targets` | Continue the 12-frame example: repeated set four to eight; no computed quota claim. |
| 3 | `retention-targets` | Lists, private/shared meaning, quota and nonreservation. |
| 4 | `activity-samples` | Fix/final unfix, two input purposes and bounded per-frame sampling. |
| 5 | `first-code-path` | Conditional verified call path from samples to metadata. |
| 6 | `quota-change` | Zones, private adjustment guard and separate candidate advertisement. |
| 7 | `reuse-checks` | Dirty/flushing, protected offer and receiver recheck. |
| 8 | `maintain` | Attempt versus accepted update, epoch and foreground callers. |
| 9 | `maintain-part-3` | Q12: unchanged quota does not identify whether an update ran. |
| 10 | `maintain-part-4` | Four-step quota trace with original values and explicit reset. |
| 11 | `chapter-recap` | Revisit the four requested explanation outcomes. |
| 12 | `admission-guards` | Original exact guard explanation, moved from the early route. |
| 13 | `maintain-part-2` | Independent 32,768-frame arithmetic, 8,192 and 81 thresholds. |
| 14 | `quota-from-samples` | Rates, ratio bounds, ten-second smoothing and target division. |
| 15 | `computed-policy` | Caps, integer zone thresholds, shared floor and supply hint. |
| 16 | `startup-inputs` | Structural settings and online-change limits. |
| 17 | `startup-policy` | Cached ratios, compiled policy, runtime state and inactive AOUT. |
| 18 | `cost-model` | CPU work counts and mutex waits, without page I/O. |
| 19 | `maintenance-boundary` | Separate backup behavior and the VS-20 evidence boundary. |
| 20 | `source-guard` | Original skipped-loop excerpt and different-revision qualification. |
| 21 | `maintenance-boundary-part-2` | Q13: source finding versus operational cause. |
| 22 | `pacing-boundaries` | VS-21 sampling uncertainties and continuing safety checks. |
| 23 | `replacement-protocol` | Fixed-share alternative and its trade-offs. |
| 24 | `experiment` | Original unexecuted proposal, observables and activation limits. |

## Definition and reset ledger

General terms are introduced in the order above and restated where a direct-entry
question or example needs them. In particular, `retention-targets` explains a
zone's role; `quota-change` names LRU1/2/3; `reuse-checks` defines BCB, dirty,
flushing and allocator; `maintain` defines epoch and `adjust_age`.

| Authored notation | Screen-local definition |
| --- | --- |
| `B` | `maintain-part-2`: pool frame count, independently 32,768. |
| `VS-20` | `maintenance-boundary`, Q13 and `source-guard`: uncertainty-registry finding, not a counter or event. |
| `VS-21` | `pacing-boundaries`: registry finding about unresolved sampling behavior. |
| `T`, `L`, `D` | `cost-model`: counter shards, list descriptors and demoted BCB entries, not elapsed times. |

The 12-frame workload continues only from `workload` to `fixed-targets`. Subsequent
mechanism descriptions make no numerical quota prediction from that example.
The larger-pool arithmetic begins independently. Q12 starts independently at
`adjust_age=8`, six calls, four early returns and two accepted updates, with the
selected quota remaining 60 and no concurrent/other update or wrap. The trace
resets that same Q12 starting state and preserves every original lane/value.
Its terminal values remain `6 / 2`, `10`, `60` and
`second sample set consumed; policy recomputed`.

Q13 begins an independent diagnostic case. It does not inherit latency from Q12.
The experiment begins fresh; same-epoch BCB reuse and forced wrap receive separate
resets. Proposed probes remain unexecuted proposals.

## Pinned source qualifications

Claims remain pinned to CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, following
the [source inventory](../source-inventory.md) and
[uncertainty registry](../unresolved-or-version-sensitive-findings.md).

- [Counted final unfixes](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6713-L6731)
  and [list-hit samples](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16601-L16610)
  are approximate selected-path inputs. A repeated page normally contributes at
  most one eligible list sample in an accepted epoch. The mixed workload does not
  establish that repeated reads gain quota while scans lose it.
- [Private publication and adjustment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14449-L14494)
  writes new targets first. Private zone adjustment requires the combined LRU1/2
  count to exceed the new quota; smaller zone thresholds alone do not trigger that
  call. Each private zone threshold truncates five percent of quota to an integer.
  Shared lists use their separate threshold guard.
- [Demotion can offer a direct victim](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10059-L10097)
  after eligibility observation, BCB try-lock and protected recheck. Therefore do
  not claim maintenance never offers a frame or that reuse necessarily waits for
  another call. The [receiver checks again](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15606-L15626).
- VS-20 still records skipped bodies in the separate backup. It does not disable
  quota adjustment or establish allocator starvation. VS-21 establishes no
  measured sampling-error bound or production failure.

## Verification record

The available checks were run in the task checkout against its own Copyparty URL
root. No validator or shared UI code changed.

- The Maintainer Guide aggregate passed all source checks: 43 discovered pages,
  relative links, English prose, 71 displayed SVGs and zero orphaned SVGs. Its
  served checks passed 114 HTTP resources and all 43 live DOM pages.
- Bilingual inventory, navigation, link/asset closure, technical parity, language
  and accessibility, static interaction and audience gates passed for 78 pairs.
  The dedicated Session 3 route contract passed for all 27 product pages.
- The headless Session 3 suite passed all 15 tests with zero failures or skips
  after preservation of the current-main Q&A. It covers direct reading,
  presentation/keyboard stepping, mobile widths, native answers, all relocated
  trace outcomes and resets, script-disabled access and the full Korean spoken
  screen map.
- Explicit preservation checks found every original chapter and script ID,
  unchanged trace lane labels/values and all 18 current-main Q&A disclosures in
  both languages.
- An independent pinned-source inspection found no material error in the new
  sample, quota-effect, offering and update explanations. It prompted the explicit
  integer truncation qualification for private zone thresholds. This is a source
  review, not a workload measurement or human language-review receipt.
- The changed Markdown passes the configured Copyparty source checker, and
  `git diff --check` passes. Only the two affected page pairs' fingerprints were
  refreshed; their review state remains pending.

The full bilingual aggregate is **not a pass**. Its final run reports 78 missing
human review receipts, 96 stale fingerprints elsewhere in the document set, and
one live-DOM console diagnostic on the unchanged root language selector. The
console diagnostic is the browser's default `/favicon.ico` request returning 404
from the validation server, confirmed by HTTP and server logs. No changed chapter
or asset diagnostic appears. No unrelated selector, icon or validation rule was
changed to conceal this gate. Human Korean-naturalness and semantic acceptance
remain pending; approving the explanation direction is not a fingerprint-specific
review receipt.

The author inspected the projected [opening](maintenance-readability/opening-desktop.png)
and [quota explanation](maintenance-readability/target-desktop.png). Both retain
the visible qualification and fit the captured 1440-pixel viewport. An optional
mobile screenshot capture stalled and was stopped; no mobile image receipt is
claimed. The completed browser suite supplies the mobile DOM/interaction checks.

## Approved local integration

The user approved local rebase and merge on 2026-10-13. Integration first rebased
onto `main` at `4c46157`, then incorporated the later queue explanation at
`67dcfff` under the same approval. The paired chapter, contents and manifest
conflicts were resolved without changing other chapters: all current-destination
maintenance Q&A and IDs remain present, the other eleven TOC entries retain their
destination content, and every other spoken-script run-sheet section matches the
destination.

On the first rebased tree, all 15 Session 3 browser tests passed again with zero
failures or skips. The guide aggregate passed its 43-page source/DOM checks and
114-resource HTTP checks. The bilingual aggregate retained only the same human
review/fingerprint diagnostics and unchanged-selector favicon diagnostic described
above. After the later queue wording was incorporated, all seven bilingual source
gates passed and four focused browser checks passed: the complete root route,
both languages' reading/presentation/keyboard/disclosure behavior, and the full
Korean spoken screen map. Markdown and diff checks passed.
