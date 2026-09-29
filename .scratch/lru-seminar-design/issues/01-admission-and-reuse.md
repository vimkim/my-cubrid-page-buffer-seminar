# 01: Predict admission and reuse in one bilingual trace

**What to build:** A Seminar participant can open the new English/Korean worked example, understand its initial state, predict admission and repeated-access outcomes, reveal source explanations, and step through the first complete sequence. This is the first usable slice of the approved continuous LRU example.

**Blocked by:** None (can start immediately).

**Status:** done

## Context

Read the [specification](../spec.md) and [confirmed design](../design.md). Preserve the accepted audience-facing curriculum, existing URLs, canonical English content, natural Korean counterpart, and Maintainer Guide ownership of technical explanations. All implementation claims use CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912. This is a fixed constructed trace, independent of the simulator; no engine change or new runtime experiment is required.

## Acceptance criteria

- [x] Derive and document a valid larger-pool snapshot with explicit relevant counts, boundaries, policy settings, and execution-context state; distinguish displayed frames from omitted pool state. Retain actual pinned arithmetic.
- [x] Use stable BCB/frame identities separate from VPIDs and introduce the working-set/scan/two-context scenario that later tickets extend. Briefly compare textbook LRU without presenting it as CUBRID's implementation.
- [x] Show a complete acquisition, final-unfix admission, and repeated-access sequence including an event that does not move the resident BCB. Account for the relevant fix count, waiter state, and context conditions.
- [x] Each major event supplies before state, prediction, revealed after state, causal explanation, and a short checked pinned excerpt identifying predicates, changed fields, and protection; deeper source and canonical explanation links work.
- [x] Both language pages support explicit forward/backward stepping, native prediction/answer disclosure, direct checkpoint anchors, and complete no-JavaScript reading. Reuse established presentation behavior without changing unrelated pages.
- [x] Register the pair and link it from the relevant existing lecture with a return route; update affected coverage metadata. Keep new language-review receipts pending until genuine review.
- [x] Independently check numerical and source consistency. Run existing aggregate checks and relevant served-page/browser checks, including keyboard, disclosure, language navigation, image rendering, and no-JavaScript behavior. Add meaningful interaction regression coverage; disclose unavailable gates.
- [x] Record the delivered page/checkpoint locations, trace evidence, validation results, and remaining human-review gates for downstream tickets. Do not claim runtime observations, performance, or participant mastery.

## Completion

Implemented and reviewed on 2026-09-29. See the [source and validation handoff](../ticket01-handoff.md) for delivered routes, numerical state, checks, independent review, and outstanding site-wide/human-review gates. Ticket 02 can extend the verified terminal state. Final curriculum acceptance remains with ticket 05.
