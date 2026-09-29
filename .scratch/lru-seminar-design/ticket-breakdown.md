# Approved implementation slices

Status: original five slices approved and textbook-first design extension confirmed on 2026-09-29. Revised execution order below implements that extension; ticket 01 is already implemented.

Published tickets: [F01](issues/F01-replacement-foundations.md), [F02](issues/F02-database-bridge.md), [01](issues/01-admission-and-reuse.md), [02](issues/02-cooling-migration-and-selection.md), [03](issues/03-safe-reuse-and-progress.md), [04](issues/04-policy-defense.md), [05](issues/05-integrated-delivery.md).

The [specification](spec.md) is based on the [confirmed design](design.md). All slices include source checking, English/Korean content, complete reading access, relevant navigation/manifest updates, and proportionate verification. No separate translation-only or testing-only implementation phase is needed.

## F01 — Explain and hand-trace replacement from first principles

Blocked by: None. Next implementation task.

Deliver the required bilingual entry before current Lecture 1: memory hierarchy, locality, pages/frames, hits/misses, full-cache alternatives, and one common three-frame trace for FIFO, OPT/MIN, exact LRU, and Clock. Include metadata conventions, independent arithmetic checks, short Random/LFU contrasts, counterexamples where needed, predict/reveal, and an unseen transfer exercise. Preserve source attribution, reading/no-JavaScript access, and existing URLs. Update entry routes, pairing, and coverage with the slice.

## F02 — Transfer the model into database constraints and CUBRID

Blocked by: F01.

Continue the recurring workload through concise OS/CPU/application-cache comparisons, a deeper conceptual PostgreSQL/InnoDB orientation, and in-use/dirty-page constraints. Explain safety versus progress and necessary durability concepts before entering CUBRID. Explicitly bridge the toy model to the existing source-derived larger snapshot without equating their arithmetic. Update prerequisites and routes through existing lectures and presenter guidance; verify claims and paired accessible delivery.

## 01 — Predict admission and reuse in one bilingual trace

Implemented: commit 45435a9; preserve the [handoff](ticket01-handoff.md), including pending human review and disclosed validation limits. Do not repeat this implementation as a prerequisite of F01.

Blocked by: None.

Deliver a navigable worked-example pair with a valid initial larger-pool snapshot, named frames/pages/contexts, and a first complete sequence from acquisition through final-unfix admission and repeated access. Show at least one no-movement event, pinned code explanations, prediction/reveal, and deliberate stepping. Expose the full trace without JavaScript and link it from the relevant existing lecture. Record source derivations and validate the first transitions and observable controls. This establishes the page and behavioral test boundary with real teaching content.

## 02 — Predict cooling, migration, and victim-list selection

Blocked by: 01 (implemented), F02.

Extend the same example through competing scan activity, threshold-driven zone movement, reuse, and second-context access. Explain private/shared migration and quota/activity effects on list selection using explicit state. Keep list-event age, quota epoch, and hot-fix history distinct. Add source-linked predictions and affected lecture routes. Check boundaries, counts, continuity, and backward/forward navigation through the longer trace.

## 03 — Explain safe reuse and concurrent progress branches

Blocked by: 02.

Continue from list selection into candidate rejection and successful protected detach/rebind. Add alternative dirty/re-dirty and direct-victim reservation/reacquisition/revocation schedules from named checkpoints. Readers can explain why the allocator succeeds, retries, or remains waiting in the specified schedule. Verify branch reset/return, exact source conditions, identity continuity, and evidence limits in both reading and presentation modes.

## 04 — Defend the immediate-promotion proposal

Blocked by: 02.

Add the bounded proposal to promote every resident hit immediately to LRU1. Precisely define hypothetical timing and protection, contrast selected baseline and alternative steps, and give a model review covering invariants, synchronization cost, workload counterexamples, and required measurements. Integrate with the existing final defense and provide a human-review rubric. This slice depends on the ordinary policy trace, but does not require the completed progress branches.

## 05 — Complete the integrated teaching route and acceptance review

Blocked by: 03, 04.

Deliver the uninterrupted replacement teaching route and final defense with coherent resume/return links, curriculum/library visibility, and presenter facilitation guidance. Review the complete example for missing or contradictory state, duplicated canonical explanations, source/evidence qualifications, and English/Korean parity. Run aggregate source and served/browser checks, inspect projection/mobile/no-JavaScript behavior, and record actual language-review receipts. Missing required review or browser evidence stays open. Earlier slices must already pass their own relevant checks; this final slice owns integration across the whole route.

## Approval and execution

The user approved the original five slices and confirmed the textbook-first extension. Execution now proceeds F01 → F02 → 02 → {03, 04} → 05, reusing implemented 01. The existing served-page browser suite and aggregate validators remain the testing boundary, supported by independent textbook arithmetic and source/trace consistency review. Ticket 05 integrates both the new foundations and the deeper CUBRID route, not just the latter. Ready-for-agent status does not waive blocking edges; human review remains an explicit acceptance gate.
