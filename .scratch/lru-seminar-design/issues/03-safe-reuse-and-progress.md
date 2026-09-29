# 03: Explain safe reuse and concurrent progress branches

**What to build:** A Seminar participant follows the selected-list trace into candidate rejection and safe reuse, then explores explicit alternative schedules for dirty-page progress and revocable direct-victim handoff.

**Blocked by:** 02 — Predict cooling, migration, and victim-list selection.

**Status:** implemented — integrated and technically verified; human acceptance pending

Implementation and acceptance mapping: [ticket03 handoff](../ticket03-handoff.md) and [combined integration](../integration-handoff.md). The checklist below remains the acceptance contract; implementation evidence does not constitute a human language receipt.

## Context

Read the [specification](../spec.md), [confirmed design](../design.md), and the existing trace delivered by tickets 01–02. Use the same named objects and checked state at CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912. This ticket delivers constructed schedules, not new runtime traces or fairness evidence.

## Acceptance criteria

- [ ] Show rejected candidates and a successful protected scan/detach/victimization/rebind path. Distinguish list detachment, old hash-identity removal, and rebinding of the stable frame.
- [ ] Every decision exposes relevant flags, ownership, waiters, lock outcome, and recheck conditions with short pinned-source excerpts and participant predictions.
- [ ] Add dirty/re-dirty and flush-completion alternatives with clear generation labels and WAL-related qualifications; show why a completed older flush need not authorize reuse.
- [ ] Add direct-victim reservation, reacquisition, revocation, and retry alternatives. State the event order and producer/consumer roles, preserving source-anomaly and fairness limitations.
- [ ] Each branch names a valid starting checkpoint, shows its own event history, and provides a deterministic return/reset. Switching branches cannot carry stale state or an answer from another schedule.
- [ ] Deliver equivalent English/Korean explanations, native answer disclosures, direct checkpoint routes, and full no-JavaScript reading. Link relevant replacement/progress lectures to these checkpoints.
- [ ] Independently verify branch initial states, consecutive states, source conditions, and identity/list invariants. Exercise branch switching and return after both forward and backward navigation in the existing browser suite.
- [ ] Run aggregate and relevant served/browser checks, update pairing/coverage records, and disclose unavailable or pending human-review gates. Leave a source/validation handoff for integration.
