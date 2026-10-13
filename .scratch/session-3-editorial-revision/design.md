# Session 3 chapters 03–07 editorial revision plan

The participant presentation repeats several mechanisms across standalone sections. Revise chapters 03–07 into a shorter causal route while keeping the technical argument, bilingual meaning, source evidence, and independently readable scenarios intact. Secondary material remains accessible in native disclosures or established references.

**Status:** Round 1 decisions accepted; final shared-understanding confirmation pending. This file and the [section disposition map](section-plan.json) are a design proposal. Audience HTML, navigation code, source code, and spoken scripts have not been edited by this work.

## Scope and baseline

- Work item: **354**, “Settle Session 3 chapters 03–07 editorial revision plan.”
- Starting repository revision: `bedae28232ff59439b34a58bf8e2932f4a19d1c5` on local `main`.
- Design checkout: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-editorial-design`, branch `docs/session-3-editorial-design`; merge destination is local `main`.
- Product scope: the five paired chapters under `en/seminar-3/` and `ko/seminar-3/`, their root and paired contents maps, and the affected spoken explanations and screen maps.
- CUBRID source baseline: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.
- Preserve the other seven Session 3 chapters, broad curriculum, Maintainer Guide, technical authority, and existing uncertainty registry. Supporting documents may receive scoped consistency corrections when the approved editorial choices change their route requirements.

Use the established language in [CONTEXT.md](../../CONTEXT.md), including Seminar participant, Audience-facing seminar site, Presentation mode, Audience checkpoint, and Presenter runbook. Do not create a competing glossary. These are reversible editorial choices within [ADR 0005](../../docs/adr/0005-make-html-an-audience-facing-seminar-curriculum.md); no new ADR is required.

The [seminar curriculum design](../../docs/seminar-curriculum-design.md) and [accepted Session 3 design](../../docs/session-3-live-design.md) remain governing context. This revision preserves their seven-part argument for each major mechanism: problem and premises, required property, implementation, precise removal, coherent alternative, costs and limits, and defense. Shorten duplicated exposition; do not replace necessary explanation with a source link.

## Accepted decisions

The user accepted all three recommendations on 2026-10-13.

| Decision | Accepted answer | Consequence |
| --- | --- | --- |
| Q1: secondary questions and traces | Retain secondary material as optional. | Core queue-full, re-dirty, and revoked-offer cases stay on the live route. Secondary diagnostics and repeated traces may leave normal section stepping, retaining their IDs, outcomes, premises, and accessible explanations. |
| Q2: maintenance arithmetic | Keep one complete, source-faithful calculation. | The live explanation connects activity samples to rates, smoothing, quotas, thresholds, and conditional zone movement. Additional arithmetic, rounding cases, caps, and boundary examples remain optional. |
| Q3: spoken companion | Revise spoken prose and maps together. | Chapters 03–07 narration follows the shortened route. Useful omitted explanation becomes optional presenter notes. Reconcile the separate speaker-script task before making overlapping edits. |

Established requirements already settle EN/KO editing, anchor retention, current-state safety checks, visible prerequisites, scenario resets, source pins, exact contents maps, and truthful review/experiment labels. These do not need another preference question.

## Proposed essential route

The proposed route has **62 standalone sections**, compared with **119** at the baseline. This is a consequence of conceptual grouping, not a fixed presentation-time limit or a quota to meet by hiding information. Split a retained section if projection would become too dense; record the reason and update its maps.

| Chapter | Current sections | Proposed sections | Main editorial change |
| --- | --- | --- | --- |
| 03: daemon architecture | 31 | 15 | Separate responsibilities, scheduling, pending work, lost wakes, and lifecycle; route detailed page/list traversal to its owning chapters. |
| 04: page-flush | 10 | 9 | Keep the candidate-to-submission argument; make the post-flush material a short transition instead of a second completion lesson. |
| 05: post-flush | 29 | 14 | Keep the normal journey, waiter distinction, and failure cases; combine each case with its explanation and trace. |
| 06: maintenance | 24 | 12 | Connect sampling to one worked calculation and guarded zone movement; demote catalogs and secondary anomaly investigations. |
| 07: flush-control | 25 | 12 | Concentrate on post-write credit use, refresh, feedback, and bypasses; demote lifecycle, storage settings, and extended tuning. |

The JSON map gives every current section exactly one retained owner and lists the complete proposed order in each chapter. Its actions mean:

- **Keep:** retain a standalone essential section, shortening repeated wording.
- **Merge:** incorporate unique explanation into its retained owner, with the original section ID on a useful local subheading or block.
- **Disclose:** retain secondary explanation in native details under its owner, keeping indispensable premises and qualifications visible.
- **Link:** retain a concise anchored explanation or qualification and link to the established canonical owner.

These are authoring dispositions, not new participant categories or evidence labels. A disposition applies to the section's standalone role; it does not authorize deleting a unique safety condition, checkpoint, trace, or source qualification.

### Chapter 03: who does which work, and what makes another pass possible?

Retain the full-pool problem, background preparation, and reason for separate jobs. Use one role explanation and one schedule table. Fold `cadence-part-2`, `cadence-loops`, and `plain-language-bridge` into `cadence`; keep a concise distinction between completion waits and pacing waits. Move the boot/work checks from `cadence-part-3` beside the schedule.

Keep `scan-scope` as the comparison of what each daemon visits. Replace `scan-page-flush` and `scan-maintenance` with anchored summaries linking to chapter 04's selection explanation and chapter 06's sampling/zone explanation. The architecture chapter still explains list-counter visits versus BCB traversal.

Keep Q05, its missed-wakeup risk, the decisive waiter code, and the remedy comparison visible. Combine `daemon-wakeup-risk` with `daemon-part-2`; keep `daemon-wakeup-source` and `daemon-wakeup-remedies` separate enough to preserve readable source reasoning. A retained work record does not itself schedule a sleeping consumer.

Use one startup/permission explanation (`lifecycle`) and one shutdown/lifetime explanation with Q06 (`lifecycle-part-2`). Creation catalogs and failure branches become optional. Incorporate join's ordering and the recovery/shutdown qualifications into these owners. The extended lifecycle trace, pending-target removal comparison, and D26 timer diagnostic remain at their old anchors as optional cases.

Keep the coherent one-thread alternative and its continuation, cancellation, lifetime, and fairness costs. End with the short missed-wakeup experiment proposal. Put counter preflight beside that experiment, linking to the existing [daemon observability reference](../../reference/page-buffer-daemon-lifecycle-audit.md#observability-already-exposed-by-the-daemon-framework).

### Chapter 04: select, recheck, copy, and submit

Retain the page/frame/BCB model, trigger, candidate traversal, present-state guards, stable copy and matching LSA, WAL ordering, Q07 candidate races, Q08 late-log diagnosis, and experiment.

Merge `handoff-boundaries` into the end of `first-code-path` as a concise transition: image submission, BCB completion, and safe frame receipt require different evidence. Chapter 05 owns the complete waiter, delegation, re-dirty, offer, and receipt explanation. Preserve the old anchor and child anchors as useful local summaries or links.

Batching settings, online-setting persistence, skip-counter internals, and repeated statistics setup remain optional. Do not demote the VPID/current-use distinction, content protection during copying, required WAL, or DWB acceptance limits. Existing source routes and the candidate-reservation alternative remain reachable.

### Chapter 05: completion responsibility and current reuse permission

Keep the successful journey as explicit steps: successful copy submission, queued completion, protected offer, and protected receipt with old identity removal. Combine the three-structure table and flush-waiter selection with `two-waits`; retain the attached-flush-waiter case separately because its offer rejection is a distinct result.

Put producer/consumer source details beside `completion-handoff`, the current guard list beside `successful-offer`, and allocator publication/receiving details beside `successful-receipt`. A wake is a notification; it is not evidence that a valid frame was received.

Combine Q09 and the full-queue trace under `handoff-part-2`. Preserve the causal explanation that failed insertion leaves completion with the submitting caller, which clears the old flush state and wakes flush waiters without publishing a direct-victim offer.

Combine `redirty-case` with the G/G+1 trace. Keep the earlier completed image, new dirty work, and retained fix distinct. Complete the earlier bookkeeping without clearing newer obligations.

Place Q10 and its policy/revocation trace in `post-part-2`; retain Q11 and the receiving-check removal comparison in `post-part-3`. Their schedules reset independently. The former distinguishes policy rejection before offer from revocation afterward; the latter explains the unsafe unchecked receiver and the continuously reserved alternative. Shared events do not justify silently combining their premises.

Use `handoff` as the recap, with the full map in a disclosure. The repeated page-selection identity explanation becomes a short anchored link to chapter 04. Detailed clean-unfix suppliers become optional under the revocation case, but two warnings remain visible: ordinary release is not assignment, and later unfix does not revive a revoked offer.

Disclose operation-count formulas under delegation, retaining the short visible boundaries: queue capacity is neither total work in a pass nor a completion deadline; stop does not promise drain within a fixed time. Keep one full retained-reservation alternative and its costs under `handoff-alternatives`; the separate completion-ticket design remains optional at `replacement-protocol`. End with the experiment distinguishing submission, completion, offer, revocation, and receipt.

### Chapter 06: sampled activity changes retention, not reuse authority

Combine the finite-pool and changing-workload examples. Retain the policy-domain/quota explanation, approximate final-unfix samples, call path, accepted-update distinction with Q12 and its trace, one calculation, guarded zone movement, protected reuse checks, recap, fixed-quota alternative, and experiment.

Fold `admission-guards` into `maintain` and `maintain-part-4` into the Q12 owner. Put the quiet-pool arithmetic behind a disclosure. The live explanation still distinguishes a helper call, accepted sample consumption, an unchanged numerical result, and allocator receipt.

Merge `computed-policy` with the calculation owner. Keep the useful limits beside the worked values; disclose extra cap, low-activity, zero-activity, ratio-shift, and rounding cases. Startup catalogs and the cost model become optional details. Approximate samples do not authorize reuse.

Fold the short VS-20 backup qualification and VS-21 approximation boundary into `reuse-checks`. The loop excerpt, Q13 operational diagnosis, and sampling-anomaly catalog remain optional. Keep the distinction between skipped backup bodies and unmeasured allocator impact; independent quota work and other suppliers remain possible.

The new route places calculation and zone movement before the recap. Preserve the existing arithmetic and zone-case anchors even when their detailed variants are disclosed.

### Chapter 07: write, charge, wait, refresh, retry

Fold RAM/file-write distinctions into the workload. Retain write actors and compensation scope, the refresh task, successful write before charging, the shared condition variable, replacement of the allowance with Q14 and its trace, fixed/adaptive branch selection, feedback, bypasses with Q15, the coherent pre-write limiter alternative, and experiment.

Combine `control-part-3` and the decisive assignment from `source-guard` into `control-part-2`. The separate accumulation/no-pacing trace becomes optional there. Credit refresh replaces the old balance; broadcast offers a retry, not a private allocation for each writer.

Startup initialization, failure cleanup, and retirement become optional under the refresh-task owner. Other storage actors, synchronization/DWB-resource settings, and repeated statistics setup become optional under their relevant owners. Keep a visible qualification that successful OS writing is different from synchronized persistence and that dependent writers must cease using shared resources before destruction.

Move extended faster-storage and high-rate tuning into details under `control-policy`. Preserve short visible comparisons of configured versus adaptive rates, the lack of a public unlimited switch at the pin, and possible competition with reads/log writes. These are policy alternatives and source-based cost reasoning, not measured tuning recommendations.

Retain the log-owner and DWB compensation bypasses and the untimed wait/ten-return distinction. D28 remains optional under Q15, with its quota/epoch premise and timing limits intact. Do not conflate ten returned waits with ten elapsed refresh periods.

## One complete maintenance calculation

Use the first accepted epoch from the existing [worked-epochs example](../../en/seminar-3/06-maintenance.html#worked-epochs), with all of its constructed premises. The first two active private lists start with activity 500/500 and quotas 2,500/2,500; the other two private lists have zero activity. There are 10,000 occupied frames, four shared lists, a stored private ratio of 0.5, a five-second accepted-update interval, and no concurrent contribution or wrap. Counted unfix activity is not low.

Explain the first accepted update completely:

1. Private raw samples 4,500/500 produce rates 900/100. Four shared lists contribute rate 250 each, totaling 1,000.
2. The sampled and stored private ratio both remain 0.5. Five-second smoothing produces private activity 700/300.
3. The private target is 5,000 pages. Its 70%/30% split gives quotas 3,500/1,500; the existing caps do not reduce them.
4. Private thresholds are 175/175 and 75/75. Shared target and default shared thresholds are 1,250 and 500/62.
5. State an explicit constructed zone snapshot for the second private list: LRU1/LRU2/LRU3 counts 100/1,500/400, with no waiting allocator or concurrent list change. The combined warmer count 1,600 exceeds quota 1,500, admitting adjustment. Demote 1,450 entries to LRU3, then move 25 LRU1 entries to LRU2. Counts become 75/75/1,850; all 2,000 entries remain resident.

The added zone snapshot is a teaching premise extending the existing epoch example, not a recorded runtime continuation. Its demotion follows the separate admission and inner-threshold conditions. Show that distinction explicitly; thresholds changing does not alone prove movement. No page bytes are written or evicted in this no-waiter zone example. Candidate/reuse checks remain separate.

The source rules were inspected in the pinned local worktree: `page_buffer.c:14332–14498` for activity, ratios, quotas, thresholds, and call guards, and `page_buffer.c:9882–10047` for combined demotion followed by LRU1 adjustment. Link these exact routes beside the participant explanation. Additional epochs and independent private/shared guard counterexamples remain accessible at their existing anchors. Revalidate integer/float arithmetic and source premises during implementation; this plan is not an engine execution receipt.

## Anchors, disclosures, and definitions

Inventory every authored ID in the ten current chapter files before implementation. Preserve each ID exactly once in its language counterpart and preserve its meaning. The disposition map covers top-level sections; child question, trace, source-detail, and example anchors must also survive.

A removed standalone section can retain its ID on an `h3`, `div`, or `details` inside its owner. Existing [presentation controls](../../assets/seminar.js) choose the containing screen and open the fragment target's containing disclosures, including a target that is itself a `details`. No navigation rewrite is anticipated. Projection starts at the containing section's top, so an old link is not a promise of the exact former scroll position.

Do not use nested `section` elements to preserve subtopics: [chapter screen discovery](../../scripts/session-3-contract.mjs) does not share navigation's outermost/class filtering and can count a nested section as another screen. Use real top-level `section.section` plus `h2` only for standalone steps.

Retain a visible, informative summary at a disclosed or linked former anchor. Existing references may hold catalogs or deeper evidence, but participant chapters still explain their essential mechanisms. Avoid the historical `reference/defense-*` route: the current Session 3 contract rejects those links from dedicated chapters.

Keep indispensable terms, actors, initial states, and continuation/reset markers visible in the retained owner before their first use. A whole trace may move into a disclosure only if its local premises and required definitions remain visible outside it. `data-teaching-def` inside any disclosure fails the current checker, even when the disclosure starts open. Update [the label registry](../../docs/session-3-teaching-labels.json) and [definition/reset ledger](../../docs/session-3-readability-review.md) to match the authored content; do not weaken definition-before-use rules.

Directly opening every former section, question, and trace fragment must provide a useful destination in both languages. Test script-enabled projection and no-JavaScript reading. Native disclosure access must remain keyboard usable. Moving to another section may reset optional answers; retained trace controls must still work after reopening.

## Questions, traces, and source evidence

Preserve Q05, Q06, and D26 in chapter 03; Q07/Q08 in 04; Q09/Q10/Q11 in 05; Q12/Q13 in 06; and Q14/Q15/D28 in 07. Each required question ID appears exactly once per language across Session 3. Do not restore the previously omitted D27.

Preserve every existing trace ID, control, independent reset, lane meaning, and terminal result. The current whole-session minimum of 25 traces remains required; demotion changes access, not retention. Core cases stay in visible essential sections. Secondary traces may be disclosed under Q1, with browser fixtures updated to open their owner before driving controls. Count-only passes cannot establish equivalent scenario meaning.

Each major mechanism still has a representative source transition, precise removal/counterexample, coherent alternative, meaningful costs and limits, and discriminating defense. Each chapter ends with a short falsifiable, unexecuted experiment proposal. Keep hypothesis, controlled premises, changed variable, exact observation, falsifier, and observer/evidence limits; move repeated revision/configuration/statistics preflight into optional detail or the established observability reference.

Keep qualifications adjacent to claims: DWB acceptance is not home-volume completion; a wake is not receipt; quota is policy, not exclusive ownership or reuse authority; and source anomalies/constructed schedules are not observed operational failures. [Source inventory](../../source-inventory.md) and [uncertainty status](../../unresolved-or-version-sensitive-findings.md) retain authority.

## Contents and spoken companions

Rebuild root, EN, and KO `.screen-map` contents from the final standalone sections and exact visible headings, in chapter order. Retired anchors remain in subtopic links or optional-detail lists outside `.screen-map`. Do not leave a removed section listed as an ordinary presentation stop merely because its fragment survives.

Rewrite the chapters 03–07 blocks of [the full Session 3 script](../../my-presentation-script-session-3.html). Its `.screen-cues` map must match every retained Korean standalone screen and heading exactly. Adjust the actual narration and transitions, including the current page-3 instructions to visit the separate scan screens. Retain useful omitted narration as clearly optional presenter notes outside the main speaking sequence. The other seven blocks keep their scope.

Work item **352** is independently writing a separate Korean chapters 03–07 speaker script. Work item **353** is clarifying maintenance LRU scope, and a separate daemon-wake worktree also exists. Preserve their checkouts and changes. At implementation start, rediscover current branches and artifacts; apply the editorial plan to the integrated current source without overwriting their work. Reconcile both script artifacts if the separate one has landed. Reconfirm only if an integrated technical correction changes the agreed editorial outcome.

## Verification and completion

A chapter edit is complete when its EN/KO essential argument, disclosures, all retained anchors, scenario definitions/resets, dependent contents maps, and spoken explanation agree. Implement complete paired chapter slices; do not postpone all link/map repairs until the end.

Required implementation checks:

1. Compare baseline and revised anchor inventories for all ten files; resolve every local link and old fragment. Check every original section against its disposition.
2. Run the bilingual aggregate and the Maintainer Guide aggregate. Human-review-only failures must be distinguished from technical regressions; fingerprints cannot substitute for a real Korean review receipt.
3. Run existing Session 3 contract, definitions, contents, and relevant browser/trace tests. When tests change, preserve independent outcome oracles and meaningful browser behavior; do not assert only that the planned counts were achieved.
4. Extend focused browser coverage for former standalone anchors and disclosed trace access. Test reading/projection, keyboard disclosures and section stepping, mobile widths, no-JavaScript snapshots, and relevant render/console errors.
5. With the checkout mounted at a Copyparty URL root, run both aggregates with `--copyparty-url`. Unavailable HTTP or live-DOM checks remain unavailable, not passed.
6. Review natural Korean and semantic parity across the changed pairs; keep pending human acceptance explicit. Verify the new calculation against pinned source/arithmetic without presenting it as a runtime measurement.
7. Inspect the diff and commit meaningful task changes in the isolated topic checkout. Request the repository's local rebase/merge approval for the reviewable result. No push or deployment is authorized by this design interview.

For this design-only phase, check the Markdown source, relative links, disposition completeness/uniqueness, route owners/counts, source premises of the worked calculation, and diff. Audience rendering and runtime experiments are future implementation work.

## Design tree and remaining frontier

| Branch | Prerequisite | State | Result |
| --- | --- | --- | --- |
| Scope and preservation | User prompt and existing product contract | Settled | Chapters 03–07; essential reasoning, EN/KO parity, stable anchors, visible premises, contents/script consistency |
| Secondary material | Scope | Settled: Q1 | Optional access allowed; core cases remain essential |
| Maintenance arithmetic | Scope | Settled: Q2 | One complete calculation stays essential; secondary variants remain accessible |
| Spoken delivery | Scope | Settled: Q3 | Narration and maps both follow the revised route; concurrent script task preserved |
| Section ownership and technical feasibility | Accepted choices and read-only fact review | Proposed concretely | Complete 119-section disposition map; 62 standalone owners; existing navigation reused |
| Final shared understanding | Complete plan | Pending: Q4 | User confirms that this plan matches intent before HTML implementation |

Final confirmation concerns this recorded plan. Implementation specification/tickets are the subsequent workflow, and this design record alone does not authorize starting HTML implementation or publishing changes remotely. Local integration of the design files has its own explicit Git approval unless the user's Q4 answer grants it together with shared understanding.
