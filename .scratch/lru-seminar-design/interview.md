# LRU seminar enhancement interview

Status: interview complete; consolidated design confirmed by the user on 2026-09-29.

Work item: 210. Started 2026-09-28 through grill-with-docs, grilling, and domain-modeling.

## Settled scope

Preserve the accepted [seminar curriculum](../../docs/seminar-curriculum-design.md) and ADRs 0004/0005: senior systems-engineer audience, Korean live experience, canonical English HTML with paired Korean pages, stable URLs, full Core/Advanced coverage, and no fixed total duration. The Markdown guide continues to own technical explanations and evidence. Implementation claims remain pinned to CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912.

The user requests an audit followed by an interview about remaining teaching gaps. Outcomes: teammates can predict page transitions, trace the pinned implementation, explain replacement safety and progress, and defend a policy change. Prefer one continuous worked example with source-linked checkpoints.

This interview records decisions as they are accepted. Proposed choices are not accepted decisions. Add glossary entries only when a new project-specific term is resolved; use ADRs only for consequential tradeoffs meeting the domain-modeling criteria.

## Initial audit

- Lecture 12 already provides a one-BCB lifecycle and safety/progress scenarios. The improvement is to make the example concrete enough to predict intermediate states, not to claim the lifecycle is absent. Its `trip` section describes insertions and cooling without a complete initial list snapshot and event sequence.
- Lecture 12B explains final-unfix placement, later migration, assignment, activity, and victim search. Its session A/page X exercise is separate from Lecture 12's BCB A/page P journey.
- The synthesis workshop and change-defense card provide broad integration and review structures. Evaluate how to connect these to the same replacement example.
- Work item 147 owns a separate faithful LRU simulator specification in `/home/vimkim/temp/cubrid-pgbuf-lru-simulator`; it retains unresolved validation work. This seminar remains self-contained, with optional later reuse of verified simulator evidence (Q2). Work item 55 owns existing bilingual human-review acceptance.

## Design tree and current frontier

1. Teaching emphasis and observed gaps (Q1, Q3).
   - Then choose example workload, progressive mechanism depth, and source-tracing checkpoints.
   - Then choose replacement-specific change-defense exercise and completion evidence.
2. Relationship to the simulator project (Q2).
   - Then choose static/manual trace, interactive presentation, and runtime-evidence requirements.
3. Once the above are settled, decide page distribution, bilingual delivery details, and verification requirements within the accepted curriculum.
4. Confirm shared understanding before implementing the agreed design.

### Round 1 — accepted 2026-09-29

- Q1: Predict transitions first, deriving policy reasoning from them; all four outcomes remain required.
- Q2: Self-contained seminar with optional later reuse of verified simulator evidence; no simulator delivery dependency.
- Q3: Prioritize connections between repeated access, final unfix, zone movement, private/shared migration, and victim selection. The user accepted this recommendation; no specific teammate feedback or observed learning failure was supplied.

### Round 2 — accepted 2026-09-29

- Q4, example fidelity: use a constructed snapshot of a valid larger pool, showing a few named frames plus exact relevant boundary/count state. Preserve pinned policy arithmetic; label it source-derived rather than an observed runtime trace.
- Q5, workload: repeated access to a small working set, a competing sequential scan, and a second context accessing a shared page. Add dirty/re-dirty and reservation races as branches at later checkpoints.
- Q6, presentation interaction: fixed, source-checked step-through with predict/reveal and before/after views, plus a complete readable no-JavaScript trace. Arbitrary workload execution remains outside this proposal.
- Q7, policy-defense target: review a proposal to promote every resident hit immediately to LRU1. Trace changed behavior and examine synchronization, costs, safety, and required measurements without assuming an improvement. This is an exercise proposal, not an authorized engine change.

The user's seven numbered answers reaffirmed Q1–Q3 and accepted Q4–Q7. Exact numerical snapshots are authoring work to derive and validate against the pin, not facts to ask the user to supply.

### Round 3 — accepted 2026-09-29

- Q8, source-reading depth: compact pinned excerpt at each major transition, identifying the predicate, changed fields, and synchronization; surrounding function detail behind disclosure and a pinned link.
- Q9, runtime evidence requirement: validate every constructed transition against pinned source and check trace consistency, without requiring a new engine experiment for this enhancement. Preserve existing applied curriculum requirements and runtime evidence limits.
- Q10, curriculum placement: one bilingual worked-example page, linked at relevant checkpoints from existing replacement lectures and the final defense, with explicit resume anchors. Existing URLs and lecture coverage remain.

All ten choices are settled. The user confirmed the [consolidated design](design.md) on 2026-09-29. Routine layout, exact numerical choices, and implementation mechanics belong in subsequent authoring/specification work. Existing glossary terms suffice; no new term is needed. No presentation or engine implementation has begun. The [specification](spec.md) and [ticket breakdown](ticket-breakdown.md) carry the next phase; ticket publication awaits breakdown review.

## Evidence routes

- [Replacement lecture](../../en/lessons/0012-prove-replacement-progress.html)
- [Private LRU lecture](../../en/lessons/0012b-understand-private-lru-index.html)
- [Victim eligibility lecture](../../en/lessons/0007-replace-one-frame.html)
- [First-principles audit](../../reference/replacement-policy-first-principles-audit.md)
- [Private-domain and unfix evidence](../../reference/private-lru-domain-hit-age-and-unfix-placement.md)
- [Uncertainty registry](../../unresolved-or-version-sensitive-findings.md)

## Completed read-only audit, 2026-09-28

Both audits agree that substantive mechanism coverage already exists. Prioritized presentation gaps:

1. Lecture 12 lines 49–57 and 100 narrate cooling and ask readers to demote a page, without enough initial state to derive those demotions.
2. Lecture 7 line 89 uses BCB[42] with pages A/B; Lecture 12 line 50 uses BCB A with P/Q; Lecture 12B line 141 uses sessions A/B and page X. A shared example would eliminate repeated reconstruction.
3. Lecture 7 line 169 supplies narrow pinned links and source checkpoints. Lecture 12B lines 99, 108, 118, and 135 mostly supply plain source-range strings; its transitions need equally usable source checkpoints.
4. Lecture 12 lines 91–104 explain progress but emphasize immediate rejection in exercises. A specified interleaving would exercise reservation, re-fix, revocation, and retry.
5. Lecture 12B explains quotas/activity/search separately; its practice does not calculate their combined consequences on one state.
6. The final defense is general. The replacement enhancement needs a concrete policy proposal with before/after reasoning and a verification plan; the proposal remains a user decision.

The English and Korean lecture structures were inspected, but this is not a human language-review receipt. Source audit sampled exact `git show f799e05d77d5300c6ea5753b4a6cc7caee6d8912` paths in the develop repository: `page_buffer.c:6680–6814`, `6996–7038`, `9330–9470`, `15591–15652`, and `16594–16610`. This was a targeted check, not an exhaustive technical audit.

Reuse the first-principles reference's four scenarios at lines 365–468 and detach/rebind sequence at 470–501; use the private-domain reference's branch catalog starting at line 186. Keep alternative schedules as explicit branches of the example.

Example-design constraints from the evidence audit: separate frame and page identity; include ordinary accesses that cause no immediate list movement; distinguish list-event age, quota epoch, and hot-fix history; specify context and waiter state. A tiny illustrated pool must not silently reuse production percentage arithmetic: choose an explicit larger-pool snapshot or disclose altered teaching thresholds. Existing runtime receipts do not prove this constructed eviction schedule. Dormant AOUT and open VS-19/20/21 findings retain their evidence qualifications.
