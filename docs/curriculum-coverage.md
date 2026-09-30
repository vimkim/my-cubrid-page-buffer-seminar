# Curriculum coverage and migration audit

This author-only audit accompanies the [accepted design](seminar-curriculum-design.md). The public coverage-page URLs now redirect to the syllabus. Personal reading history and mastery state have been removed from the audience product; no participant completion is asserted here.

## Lecture 7 split (2026-09-30)

Lecture 7 now owns LRU organization, admission, zones, movement and quota.
Lecture 7A owns victim selection, queue behavior, the independently reset
residency outcomes, protected frame reuse and progress. All 38 original sections
remain in both languages, split 18/20; existing source evidence and mechanism
wording are retained. A short opening recap on 7A defines the scenario across the
page boundary. The [updated design](replacement-socratic-design.md#lecture-split-2026-09-30)
records the packaging change.

Both landings, syllabi, full-curriculum previous/next links, manifest and lecture
order include 7A. The first-principles session keeps all twelve stops and their
included sections, with direct destination links in both itineraries and the
current Korean script. Old fragments on Lecture 7 retain no-JavaScript destination
links, including the nested `session-recheck` anchor. Human Korean-language and
semantic review remains pending against updated fingerprints.

Verification: all seven bilingual source gates pass for 56 pairs; the maintainer
aggregate passes all 43 Markdown pages, relative links, 71 displayed SVGs with no
orphans, English prose, and 114 Copyparty HTTP resources. The validator, curriculum
contract and regression unit suites pass 59/59 checks. The seminar, admission and
victim-queue browser suites pass their 38 existing checks; the two new split-page
navigation checks pass after narrowing disclosure selectors to the intended
answer. These checks cover both languages, projection, keyboard interaction,
mobile/no-JavaScript access, old bookmarks and the exact served session/script
links. Desktop, projector and mobile Korean screenshots were inspected.

The full aggregate runs still fail on the pre-existing missing `/favicon.ico`
resource and pending human language-review receipts/unrelated stale fingerprints;
these are disclosed failures, not passed gates. Tests used this worktree mounted
at `http://127.0.0.1:3949` with headless Chromium via `PLAYWRIGHT_MODULE`. No source
mechanism, SVG, runtime evidence or engine behavior was changed.

## Worked-example split (2026-09-30)

The paired `reference/lru-worked-example.html` pages now own admission, movement,
list selection (checkpoints 0–12), and the separate two-schedule residency example.
The paired `reference/lru-reuse-and-policy.html` pages own the selection baseline,
protected reuse (checkpoints 13–16), and hypothetical policy comparison and defense.
The second page opens with the constructed starting conditions and retains links
to the first page's complete chain and quota derivation. Existing mechanism text,
source links, reset boundaries, and safety qualifications are retained.

Both topic libraries, syllabus routes, related lecture links, previous/next
navigation, and the pairing manifest expose the split. Old first-page fragment
URLs retain explicit destination links that work without JavaScript. These
compatibility links stay outside the presentation section sequence. The first-time
participant route and its two residency branches keep their original URLs.
Human Korean-language and semantic review remains pending against new fingerprints.

Verification on the split worktree: all 24 original sections in each language are
accounted for, with 16 on the first page and 8 on the second; mechanism text is
unchanged outside the expanded starting checkpoint. All seven automated bilingual
source gates pass for 55 pairs. The headless seminar browser suite passes 30/30
checks, including mobile/no-JavaScript links, old fragment destinations, language
switching, disclosures, and presentation stepping. Both aggregate validator unit
suites pass 46/46 checks. Korean reading and projected reuse screenshots were
inspected during the check.

The maintainer aggregate passes Markdown (43 pages), relative links, SVG ownership
(71 displayed, zero orphaned), English prose, and Copyparty HTTP (114 resources).
Both aggregate live-DOM runs report a missing `/favicon.ico` on their first page;
this HTTP 404 was also reproduced on the existing main server. The bilingual full
aggregate additionally reports the existing pending human-review receipts and
unrelated stale fingerprints. These gates remain failures, not passes; the split
adds no human review receipt. The tested worktree was served at the Copyparty URL
root on `http://127.0.0.1:3949`, using headless Chromium via `PLAYWRIGHT_MODULE`.

## Ticket 04 policy-defense addition

Ticket 04 adds the bounded immediate-hit-promotion defense to the existing worked-example pair at policy-proposal, policy-compare and policy-defense. It independently resets to checkpoint 3 and S49, defines fix-time protection/current-list placement with unchanged final-unfix migration, compares source-derived baseline and explicitly hypothetical states, and provides a 20-hit counterexample, correctness/performance verification plan and five-part human-review rubric. Lecture 17 and the technical-defense card link into it and have return routes. Existing native disclosures and presentation controls support keyboard/projection and complete mobile no-JavaScript reading. No engine change, performance result, new pair or human-language receipt is claimed; all three edited pairs remain pending. The ticket 04 handoff records source/check evidence and integration limits.

## Scope and six-axis review

The explicit textbook-versus-CUBRID extension adds five paired Lecture12 sections: policy comparison, R/P prediction, conditional zone movement, placement/search/safe-reuse separation, and costs/limits. Lecture12B and the syllabus link to the main explanation. It preserves the existing worked-example states, 51-pair inventory, pinned evidence ownership and all prior lectures. English/Korean editorial parity and automated interaction checks do not constitute human naturalness acceptance; the three changed pairs retain pending review. See `.scratch/lru-textbook-comparison/` for the accepted scope and actual verification record.

The manifest now contains 51 paths per language: 27 lectures, one landing page, 22 curriculum/reference pages, and one compatibility redirect. The original 48-path migration is recorded below; later additions are recorded separately. All Core and Advanced mechanisms remain required, with detailed source-level cross-engine comparison in the final phase and no fixed total duration.

## Cooling, migration, and selection extension (2026-09-29)

Ticket 02 extends the existing worked-example pair through explicit scan batches, threshold-driven cooling, P's source-derived boost, B's sequential private-to-shared migration, full INVALID exhaustion, an accepted quota epoch, and the first victim-list decision. Lecture 12B links to exact checkpoints and the trace links back. The terminal state stops before candidate locking/detach and supplies the safety/progress schedules; policy comparisons independently reset to checkpoint 3 and S49. Source arithmetic is independently checked; fixed-trace disclosures and browser regressions cover direct projection entry, keyboard answers, next/back, language transfer, and complete mobile no-JavaScript reading. No new page pair or UI framework is added. Current human Korean-naturalness and semantic review remains pending for the worked-example and Lecture 12B pairs; see the ticket 02 handoff for executed validation and exact continuity state.

## Database bridge addition (2026-09-29)

F02 inserts the paired `0000a-database-bridge.html` lecture between F01 and Lecture 1. Both landings, syllabi, sequence links, manifest, and dependency validator expose the same required route. It compares system units and management, introduces pin/latch, dirty/writeback/eviction and durability/WAL, then separates preference, safe reuse, and progress through independently reset DB-A/B/C checkpoints. PostgreSQL/InnoDB orientation uses the existing pinned comparator revisions and links to the later detailed lecture and canonical evidence note.

The workload shape transfers explicitly to ticket 01's constructed 32,768-frame snapshot; neither toy arithmetic nor runtime evidence transfers. The existing snapshot and source trace remain intact. Six-axis review covers novice explanations, causal prerequisites, explicit branch assumptions and source checks, native disclosures, paired wording with actual human review pending, and served reading/projection/mobile/keyboard/no-JavaScript behavior. The [F02 handoff](../.scratch/lru-seminar-design/F02-handoff.md) records exact results and open gates. No engine changes or automated mastery claims are introduced.

## Replacement foundations addition (2026-09-29)

F01 adds [English](../en/lessons/0000-replacement-foundations.html) and [Korean](../ko/lessons/0000-replacement-foundations.html) required entry lectures. The ninth curriculum phase precedes the existing eight, and Lecture 1 links back to it. Both landing pages, both syllabi, the pairing manifest, and the dependency-order validator now include the entry. Existing lecture identifiers and ticket 01 remain intact.

The pair explains capacity before policy, distinguishes page identity from frame storage, and gives original FIFO/OPT/LRU/Clock traces with explicit metadata, an LRU counterexample, and an unseen exercise. Separate instructor reasoning is in the author-only runbook. The pages reuse native disclosures and shared presentation controls; their unprefixed URL follows the existing English redirect convention.

Six-axis review covers novice voice, causal sequence, independently checked constructed arithmetic, disclosure of detailed tables, equivalent paired claims with human review pending, and served keyboard/mobile/projection/no-JavaScript delivery. No engine implementation claim is added. The [F01 handoff](../.scratch/lru-seminar-design/F01-handoff.md) records actual checks and remaining acceptance gates. F02 owns the database-constraints bridge and subsequent route adjustment. Human Korean-naturalness and semantic-parity review remains pending for all new or edited pairs; earlier review records are not acceptance evidence for this addition.

## Ticket 03 safe reuse and progress (2026-09-29)

The existing EN/KO worked-example pair adds four independent source-pinned schedules: rejected candidates (`reuse-reject`), protected detach/old-hash retirement/rebind (`reuse-safe`), G/G+1 flush alternatives (`reuse-flush`), and post-flush reservation/refix/revocation/retry (`reuse-direct`). Each starts from the ticket02 selection baseline or an explicitly named dirty checkpoint. C50/Q is the victim candidate; F42/P remains shared1 LRU2. Native disclosures and opt-in answer resets preserve independent reading and branch navigation without a simulator. Lecture12 links to the exact checkpoints. Existing pairing entries remain pending human review; new fingerprints are not receipts. See the ticket03 handoff for source checks, independent reviews, and actual validation gates.

## LRU worked-example addition (2026-09-29)

The new [English](../en/reference/lru-worked-example.html) and [Korean](../ko/reference/lru-worked-example.html) pair implements admission and repeated-access prediction from a source-derived larger-pool snapshot. Lecture 12 links to its starting checkpoint in both languages. The page reuses the existing presentation controls and native disclosures; its unprefixed URL redirects to English under the site's compatibility convention.

This paragraph records ticket 01's original slice; ticket 02 extends it as recorded above. Progress branches and policy defense remain subsequent work. Admission evidence and validation are recorded in the [ticket 01 handoff](../.scratch/lru-seminar-design/ticket01-handoff.md). Human Korean/semantic review remains pending. Historical 48-pair results below do not validate these additions.

| Axis | Check performed and boundary |
| --- | --- |
| Audience and voice | Replaced personal coaching, chat handoffs, keyword scoring, progress status, and teaching-oriented headings; retained meaningful maintainer instructions and scenarios. |
| Causal narrative | Preserved mechanism bodies; introduced dependency-ordered phases, mechanism-centered openings, and integrated scenario routes. |
| Technical accuracy and evidence | Preserved code/preformatted values and source routes across retained mechanism/reference pages, checked EN/KO technical parity, and restored evidence links from removed coaching footers. Existing pinned evidence remains authoritative; this is not a new engine-source audit. |
| Information density | Continuous reading uses layout A; optional projection focuses one section. Tables and code scroll locally at narrow widths. Detailed mechanisms remain available rather than being deleted to fit a time limit. |
| Semantic parity and natural Korean | Paired editorial changes and technical/language checks completed. Human Korean-capable semantic review and exact-content fingerprint receipts remain pending for all 48 pairs. Automated parity is not native-language sign-off. |
| Projection, accessibility and independent reading | Shared accessible controls, native answer disclosures, explicit navigation, served images, mobile layouts and no-JavaScript fallback are exercised by the aggregate browser gate. See the dated verification receipt below. |

## Page dispositions

All retained URLs below have both editions. Language review is pending for every row, including the redirect wording. The root language selector remains a stable shared entry.

| Existing path | English / Korean | Disposition |
| --- | --- | --- |
| index.html | [EN](../en/index.html) / [KO](../ko/index.html) | Rewritten as eight-phase curriculum landing and topic library. |
| lessons/0001-present-the-page-journey.html | [EN](../en/lessons/0001-present-the-page-journey.html) / [KO](../ko/lessons/0001-present-the-page-journey.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0002-separate-objects-from-state.html | [EN](../en/lessons/0002-separate-objects-from-state.html) / [KO](../ko/lessons/0002-separate-objects-from-state.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0003-trace-fix-convergence.html | [EN](../en/lessons/0003-trace-fix-convergence.html) / [KO](../ko/lessons/0003-trace-fix-convergence.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0004-repay-fix-debt.html | [EN](../en/lessons/0004-repay-fix-debt.html) / [KO](../ko/lessons/0004-repay-fix-debt.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0004a-understand-holder-anchor.html | [EN](../en/lessons/0004a-understand-holder-anchor.html) / [KO](../ko/lessons/0004a-understand-holder-anchor.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0005-audit-a-logged-mutation.html | [EN](../en/lessons/0005-audit-a-logged-mutation.html) / [KO](../ko/lessons/0005-audit-a-logged-mutation.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0006-flush-one-generation.html | [EN](../en/lessons/0006-flush-one-generation.html) / [KO](../ko/lessons/0006-flush-one-generation.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0006a-understand-page-buffer-daemons.html | [EN](../en/lessons/0006a-understand-page-buffer-daemons.html) / [KO](../ko/lessons/0006a-understand-page-buffer-daemons.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0006b-follow-page-flush-handoff.html | [EN](../en/lessons/0006b-follow-page-flush-handoff.html) / [KO](../ko/lessons/0006b-follow-page-flush-handoff.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0006c-follow-maintenance-and-pacing.html | [EN](../en/lessons/0006c-follow-maintenance-and-pacing.html) / [KO](../ko/lessons/0006c-follow-maintenance-and-pacing.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0007-replace-one-frame.html | [EN](../en/lessons/0007-replace-one-frame.html) / [KO](../ko/lessons/0007-replace-one-frame.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0008-defend-a-safe-change.html | [EN](../en/lessons/0008-defend-a-safe-change.html) / [KO](../ko/lessons/0008-defend-a-safe-change.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0009-classify-latch-wait.html | [EN](../en/lessons/0009-classify-latch-wait.html) / [KO](../ko/lessons/0009-classify-latch-wait.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0010-revalidate-after-promotion.html | [EN](../en/lessons/0010-revalidate-after-promotion.html) / [KO](../ko/lessons/0010-revalidate-after-promotion.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0011-rebuild-after-ordered-refix.html | [EN](../en/lessons/0011-rebuild-after-ordered-refix.html) / [KO](../ko/lessons/0011-rebuild-after-ordered-refix.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0012-prove-replacement-progress.html | [EN](../en/lessons/0012-prove-replacement-progress.html) / [KO](../ko/lessons/0012-prove-replacement-progress.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0012b-understand-private-lru-index.html | [EN](../en/lessons/0012b-understand-private-lru-index.html) / [KO](../ko/lessons/0012b-understand-private-lru-index.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0012a-understand-aout-ghost-history.html | [EN](../en/lessons/0012a-understand-aout-ghost-history.html) / [KO](../ko/lessons/0012a-understand-aout-ghost-history.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0013-gate-redo-by-page-lsa.html | [EN](../en/lessons/0013-gate-redo-by-page-lsa.html) / [KO](../ko/lessons/0013-gate-redo-by-page-lsa.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0014-preserve-lifecycle-order.html | [EN](../en/lessons/0014-preserve-lifecycle-order.html) / [KO](../ko/lessons/0014-preserve-lifecycle-order.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0015-route-a-specialized-interface.html | [EN](../en/lessons/0015-route-a-specialized-interface.html) / [KO](../ko/lessons/0015-route-a-specialized-interface.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0016-close-a-failure-proof.html | [EN](../en/lessons/0016-close-a-failure-proof.html) / [KO](../ko/lessons/0016-close-a-failure-proof.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0017-defend-the-module-live.html | [EN](../en/lessons/0017-defend-the-module-live.html) / [KO](../ko/lessons/0017-defend-the-module-live.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0018-compare-three-buffer-pools.html | [EN](../en/lessons/0018-compare-three-buffer-pools.html) / [KO](../ko/lessons/0018-compare-three-buffer-pools.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| lessons/0018a-compare-replacement-policies.html | [EN](../en/lessons/0018a-compare-replacement-policies.html) / [KO](../ko/lessons/0018a-compare-replacement-policies.html) | Mechanism retained; participant opening, checkpoint disclosure and curriculum navigation installed. |
| reference/caller-mutation-card.html | [EN](../en/reference/caller-mutation-card.html) / [KO](../ko/reference/caller-mutation-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/change-defense-card.html | [EN](../en/reference/change-defense-card.html) / [KO](../ko/reference/change-defense-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/core-synthesis-studio.html | [EN](../en/reference/core-synthesis-studio.html) / [KO](../ko/reference/core-synthesis-studio.html) | Rewritten as synthesis workshop; scoring and personal state removed. |
| reference/course-coverage-matrix.html | [EN](../en/reference/course-coverage-matrix.html) / [KO](../ko/reference/course-coverage-matrix.html) | Redirects to course-learning-path.html; useful author coverage moved below. |
| reference/course-learning-path.html | [EN](../en/reference/course-learning-path.html) / [KO](../ko/reference/course-learning-path.html) | Rewritten as public syllabus, practice routes and completion criteria. |
| reference/expected-team-questions.html | [EN](../en/reference/expected-team-questions.html) / [KO](../ko/reference/expected-team-questions.html) | Reference retained; audience framing and shared navigation revised. |
| reference/failure-proof-ledger-card.html | [EN](../en/reference/failure-proof-ledger-card.html) / [KO](../ko/reference/failure-proof-ledger-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/fix-convergence-map.html | [EN](../en/reference/fix-convergence-map.html) / [KO](../ko/reference/fix-convergence-map.html) | Reference retained; audience framing and shared navigation revised. |
| reference/flush-generation-card.html | [EN](../en/reference/flush-generation-card.html) / [KO](../ko/reference/flush-generation-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/latch-queue-card.html | [EN](../en/reference/latch-queue-card.html) / [KO](../ko/reference/latch-queue-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/lifecycle-order-card.html | [EN](../en/reference/lifecycle-order-card.html) / [KO](../ko/reference/lifecycle-order-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/object-and-state-map.html | [EN](../en/reference/object-and-state-map.html) / [KO](../ko/reference/object-and-state-map.html) | Reference retained; audience framing and shared navigation revised. |
| reference/ordered-watcher-card.html | [EN](../en/reference/ordered-watcher-card.html) / [KO](../ko/reference/ordered-watcher-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/ownership-debt-card.html | [EN](../en/reference/ownership-debt-card.html) / [KO](../ko/reference/ownership-debt-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/presentation-rehearsal-card.html | [EN](../en/reference/presentation-rehearsal-card.html) / [KO](../ko/reference/presentation-rehearsal-card.html) | Reframed as technical-defense rubric. |
| reference/presentation-spine.html | [EN](../en/reference/presentation-spine.html) / [KO](../ko/reference/presentation-spine.html) | Reframed as page-journey recap. |
| reference/promotion-restart-card.html | [EN](../en/reference/promotion-restart-card.html) / [KO](../ko/reference/promotion-restart-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/redo-recovery-card.html | [EN](../en/reference/redo-recovery-card.html) / [KO](../ko/reference/redo-recovery-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/replacement-progress-card.html | [EN](../en/reference/replacement-progress-card.html) / [KO](../ko/reference/replacement-progress-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/replacement-safety-card.html | [EN](../en/reference/replacement-safety-card.html) / [KO](../ko/reference/replacement-safety-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/specialized-interface-card.html | [EN](../en/reference/specialized-interface-card.html) / [KO](../ko/reference/specialized-interface-card.html) | Reference retained; audience framing and shared navigation revised. |
| reference/three-engine-performance-card.html | [EN](../en/reference/three-engine-performance-card.html) / [KO](../ko/reference/three-engine-performance-card.html) | Reference retained; audience framing and shared navigation revised. |

## Canonical capability routing

The useful routing and capability evidence from the former coverage page are retained below without personal state. Historical lesson IDs remain stable URLs; the public syllabus owns execution order.

### Core

| Canonical capability | Lecture route | Reference | Capability evidence |
| --- | --- | --- | --- |
| [Contract and Objects](../learning/01-contract-and-objects.md) | [L1](../en/lessons/0001-present-the-page-journey.html)–[L2](../en/lessons/0002-separate-objects-from-state.html) | [Object/state map](../en/reference/object-and-state-map.html) | Draw objects, lifetimes, independent axes, and one counterexample. |
| [Fix, Hold, and Release](../learning/02-fix-hold-release.md) | [L3](../en/lessons/0003-trace-fix-convergence.html)–[L4](../en/lessons/0004-repay-fix-debt.html) + [L4A](../en/lessons/0004a-understand-holder-anchor.html) | [Convergence](../en/reference/fix-convergence-map.html) · [Debt](../en/reference/ownership-debt-card.html) | Trace hit/miss convergence, balance global/per-thread debt through release, and explain holder lookup and reuse. |
| [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) | [L5](../en/lessons/0005-audit-a-logged-mutation.html) | [Mutation audit](../en/reference/caller-mutation-card.html) | Audit a real caller's lock, validation, log/LSA/dirty order, and every exit. |
| [Flush One Generation](../learning/04-flush-one-generation.md) | [L6](../en/lessons/0006-flush-one-generation.html) | [Generation card](../en/reference/flush-generation-card.html) | Predict G/G+1, four flag states, WAL gate, propagation, and retryable failure. |
| [Replace One Frame](../learning/05-replace-one-frame.md) | [L7](../en/lessons/0007-replace-one-frame.html) | [Safety card](../en/reference/replacement-safety-card.html) | Prove identity and hard eligibility under protection before discussing policy. |
| [Maintainer Capstone](../learning/06-maintainer-capstone.md) | [L8](../en/lessons/0008-defend-a-safe-change.html) | [Change defense](../en/reference/change-defense-card.html) | Defend one change-impact packet and stop every claim at its evidence level. |

### Advanced

| Canonical capability | Lecture route | Reference | Capability evidence |
| --- | --- | --- | --- |
| [Acquisition Concurrency](../advanced/acquisition-concurrency.md) | [L9](../en/lessons/0009-classify-latch-wait.html)–[L11](../en/lessons/0011-rebuild-after-ordered-refix.html) | [Queue](../en/reference/latch-queue-card.html) · [Promotion](../en/reference/promotion-restart-card.html) · [Watcher](../en/reference/ordered-watcher-card.html) | Trace queue/grant completion, blocking promotion restart, ordered refix, and partial unwind. |
| [Replacement Progress](../advanced/replacement-progress.md) | [L12](../en/lessons/0012-prove-replacement-progress.html) · [L12B](../en/lessons/0012b-understand-private-lru-index.html) | [Progress card](../en/reference/replacement-progress-card.html) | Explain hard victim safety, private-index lifetimes and selection policy, direct-victim revocation, G+1 handoff, liveness, and fairness limits. |
| [Recovery and Lifecycle](../advanced/recovery-and-lifecycle.md) | [L13](../en/lessons/0013-gate-redo-by-page-lsa.html)–[L14](../en/lessons/0014-preserve-lifecycle-order.html) | [Redo](../en/reference/redo-recovery-card.html) · [Lifecycle](../en/reference/lifecycle-order-card.html) | Apply the page-LSA gate, separate allocation/residency, and repair dependency order. |
| [Specialized Interfaces](../advanced/specialized-interfaces.md) | [L15](../en/lessons/0015-route-a-specialized-interface.html) | [Interface card](../en/reference/specialized-interface-card.html) | Classify owner, byte location, guard, accounting, permission, cleanup, and diagnostic authority. |
| [Failure Proof Obligations](../advanced/failure-and-proof-obligations.md) | [L16](../en/lessons/0016-close-a-failure-proof.html) | [Proof ledger](../en/reference/failure-proof-ledger-card.html) | Reach the risk boundary, inspect settled acquisition/generation debt, retry, impact, and target status. |

### Maintainer work

| Maintainer need | Canonical route | Lecture route | Capability evidence |
| --- | --- | --- | --- |
| Change safely | [Change playbook](../playbooks/change-safely.md) | [L8](../en/lessons/0008-defend-a-safe-change.html) + [L16](../en/lessons/0016-close-a-failure-proof.html) | One complete impact plan reviewed against negative paths and target risks. |
| Diagnose a symptom | [Symptom playbook](../playbooks/debug-by-symptom.md) | [L17 live routing](../en/lessons/0017-defend-the-module-live.html) | Route a symptom to owner, wait/state class, discriminating probe, and evidence limit. |
| Verify at the risk | [Verification playbook](../playbooks/verify-a-change.md) | [L16](../en/lessons/0016-close-a-failure-proof.html) | Choose the highest relevant seam and record supported/unsupported conclusions. |
| Locate source/invariant | [Source map](../reference/source-map.md) · [Invariant index](../reference/invariant-index.md) | [L17](../en/lessons/0017-defend-the-module-live.html) | Navigate one claim to its Canonical page, pinned range, and evidence owner live. |
| Check mutable status | [Inventory](../source-inventory.md) · [Registry](../unresolved-or-version-sensitive-findings.md) | [L8](../en/lessons/0008-defend-a-safe-change.html) + [L15](../en/lessons/0015-route-a-specialized-interface.html) | State what is verified, inferred, historical, candidate, or open without copying stale status. |
| Retrieve and explain | [Question bank](../questions/README.md) | [L17](../en/lessons/0017-defend-the-module-live.html) + [review card](../en/reference/presentation-rehearsal-card.html) | Independent explanation, shuffled challenges, corrected peer question, and feedback receipt. |
| Compare designs and rank performance hypotheses | [Evidence inventory](../source-inventory.md) | [L18](../en/lessons/0018-compare-three-buffer-pools.html) + [comparison card](../en/reference/three-engine-performance-card.html) | Explain responsibility-level differences, rank holder lookup before nested-atomic redesign, and state falsifiers. |

### Added detailed routes

Lecture 6A introduces daemon lifecycle; 6B covers page-flush/post-flush handoff; 6C covers maintenance and pacing. Lecture 12B makes private-LRU index ownership explicit; 12A separates dormant AOUT from active policy. Lectures 18 and 18A are required late comparisons, not optional mastery extensions. Each lecture retains its linked canonical explanation and evidence boundaries.

## Integrated replacement delivery (2026-09-29)

The current inventory is 51 EN/KO pairs and 27 required lectures. F1 and F2 precede the original 25 lectures; no Core or Advanced mechanism was removed. Both Topic libraries now expose the complete LRU worked example, and both syllabi link its admission, cooling/migration, selection/progress, and policy-defense checkpoints. Lecture 12, Lecture 12B, Lecture 17 and the technical-defense card retain their exact checkpoint routes. The [Presenter runbook](../presenter-runbook.md#integrated-replacement-itinerary) joins these routes with prediction pauses and explicit independent resets.

The admission-only and earlier ticket receipts below/above describe their historical scope. Safety/progress and policy-defense content is now delivered. `selection-baseline` is the input to the safety/progress schedules; policy comparisons independently restart at checkpoint 3 and S49, never at the completed reuse state. The first-generation 48-pair receipt below remains historical, not current acceptance evidence.

All changed pairs retain pending review entries in `teaching-pages.json`; no human receipt or fingerprint approval was invented. Current technical results, participant rubric, source/trace audit and outstanding acceptance gates are recorded in the [ticket 05 handoff](../.scratch/lru-seminar-design/ticket05-handoff.md). The narrow canonical InnoDB citation correction now points to actual midpoint insertion and its disk-read caller and states the short-list head-insertion exception, consistent with F2.

## Historical verification receipt (2026-09-08)

Checks run on 2026-09-08 against the local Copyparty site:

- Bilingual inventory, navigation, links, technical parity, language/accessibility, static interactions and audience contract: PASS for all 48 pairs.
- Served bilingual HTTP: PASS for 243 resources. Chromium live DOM: PASS for all 97 HTML routes, including 390px layout, presentation controls, native disclosures and no-JavaScript reading.
- Canonical Markdown aggregate: PASS for 43 pages, 60 displayed SVGs with no orphans, relative links, English prose, 103 HTTP resources and all 43 rendered Markdown pages.
- Validator and served-browser regression tests: 59 passed, with no skips and Playwright enabled, including the audience-contract tests.
- Human translation review: NOT COMPLETE. All 48 pairs lack Korean-capable review receipts and current recorded fingerprints. The full bilingual aggregate therefore remains unsuccessful; the passing technical gates do not override that acceptance boundary.

The model explanations added to five lectures summarize mechanisms already explained on those pages; they do not establish new runtime findings. The retained mechanism/reference corpus preserves every distinct original code/preformatted value across both languages. The landing, syllabus, coverage redirect and synthesis workshop were editorial rewrites, audited by their explicit dispositions above rather than by exact-text retention.

### Review corrections (2026-09-08)

Test-first corrections resolved conflicting inline/rail curriculum routes and optional-AOUT wording, presentation shortcuts after real toolbar focus, and exposed checkpoint explanations in both languages. Each regression was observed failing before its fix. The aggregate browser gate now exercises real keyboard input and checks checkpoint disclosures individually, including the question reference. The HTTP test fixture serves renderable HTML/SVG so its resource checks also work when browser automation is enabled.

The independent Standards and Spec reviews against baseline `09843fd4924bad01776afb75f3ed4437fb95c0aa`, including this directory's uncommitted and untracked changes, both finished with zero outstanding actionable findings. These reviews do not replace human language acceptance.

Run the five regression files together with `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs scripts/seminar-browser.test.mjs`. For browser checks, provide an installed Playwright module through `PLAYWRIGHT_MODULE` when it is not locally resolvable, and serve the site through Copyparty; `SEMINAR_URL` can override the browser test's local site URL. Browser unavailability is a disclosed skip, not a pass.

To review the current content, use the EN/KO links in the disposition table. Run `node scripts/check-bilingual-teaching-site.mjs --print-fingerprints` at review time, then record the actual reviewer, date and matching fingerprints in the pairing manifest only after that review. Prototype approval is not a substitute for these receipts.


## Foundations-first presentation route (2026-09-30)

The collection now contains 52 registered page pairs. Added `reference/first-principles-route.html` in English/Korean with a stable root redirect, landing/library/syllabus entry links, an elapsed-time route, evidence-reading guidance, and linked misconception recap.

Added concept/purpose/absence/example introductions to lectures 0000, 0001, 0002, 0006A, 0006B, 0006C, 0007, 0012B, and 0018A. Added compact verified paths for acquisition, array initialization, ordinary final-unfix admission, all four daemon roles, PostgreSQL Clock selection, and InnoDB common-LRU eviction. Existing canonical detail, lecture order, anchors, and presentation controls are retained.

All affected wording remains pending genuine human Korean-naturalness and semantic-parity review. This change does not manufacture or renew a human receipt. See `docs/first-principles-delivery-checks.md` for the implementation verification record.


## NEW_PAGE versus OLD_PAGE deep dive (2026-09-30)

The collection now contains 53 registered page pairs. Added `reference/new-page-vs-old-page.html` in English/Korean with a stable root redirect, a Topic-library entry, and links from the Lecture 3 fetch-mode table and the Lecture 5 `NEW_PAGE` section. It follows the pinned source one level below Lecture 5: the single miss branch, the header bootstrap, residual frame bytes, format metadata that bounds reads, publication order in overflow insertion, and stale-VPID safety as a caller protocol tracked as `VS-22`. Three new diagrams live in `assets/`.

Lecture 5 remains the canonical owner of the allocation-to-buffer contract. The canonical audit gains a short "Why residual frame bytes are harmless" section. The new pair is pending genuine human Korean-naturalness and semantic-parity review.


## First-time participant session reconciliation (2026-09-30)

The inventory remains 54 registered EN/KO pairs; this revision adds no participant page pair. Existing lecture URLs, compatibility routes, Core/Advanced phases and deep content remain available. The paired first-principles itinerary selects request/objects, F1 through exercise, concurrent use, admission/policy, source-derived residency branches, protected reuse, 6A/6B/6C background stops and 18A comparison/recap. It does not require the deferred WAL/recovery/LSA/DWB/copied-generation material, and does not replace full-curriculum completion.

The [one current Korean script](../my-presentation-script.html) integrates the committed 01–06 spoken contributions with exact entry/included/exit/next cues; the runbook distinguishes this session from older full-curriculum facilitation. The old companion remains in Git history. The [trace ledger](first-time-participant-revision-trace.md) is constructed pinned-source evidence, not a new experiment. The [AC01–AC19 check record](first-time-participant-revision-checks.md) records route-to-script coverage, content revision and genuine gate outcomes. Human Korean-naturalness and EN/KO semantic review remains pending.
