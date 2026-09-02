/**
 * The canonical visual roster: every SVG the document set displays, keyed by
 * file name under `assets/`, with the single guide page that owns it.
 *
 * Tests import this map instead of hard-coding the roster so that adding or
 * retiring a visual is one edit.
 */
export const canonicalVisualOwners = Object.freeze({
  "access-forms-compared.svg": "advanced/specialized-interfaces.md",
  "allocation-progress.svg": "advanced/replacement-progress.md",
  "claim-levels-ladder.svg": "advanced/failure-and-proof-obligations.md",
  "durability-chain.svg": "learning/04-flush-one-generation.md",
  "exceptional-return-gaps.svg": "learning/06-maintainer-capstone.md",
  "fix-contract.svg": "learning/02-fix-hold-release.md",
  "identity-check-timeline.svg": "learning/02-fix-hold-release.md",
  "latch-versus-lock.svg": "learning/03-caller-completes-correctness.md",
  "latch-wait-queue.svg": "advanced/acquisition-concurrency.md",
  "lifecycle-order.svg": "advanced/recovery-and-lifecycle.md",
  "load-owner-waiter.svg": "learning/02-fix-hold-release.md",
  "lru-domains-zones.svg": "advanced/replacement-progress.md",
  "mutation-ownership-spine.svg": "learning/03-caller-completes-correctness.md",
  "object-ownership-map.svg": "learning/01-contract-and-objects.md",
  "ordered-watcher-refix.svg": "advanced/acquisition-concurrency.md",
  "ownership-ledgers.svg": "learning/02-fix-hold-release.md",
  "promotion-outcomes.svg": "advanced/acquisition-concurrency.md",
  "redo-lsa-gate.svg": "advanced/recovery-and-lifecycle.md",
  "state-axes.svg": "learning/01-contract-and-objects.md",
  "two-lsa-timeline.svg": "learning/04-flush-one-generation.md",
  "victim-eligibility.svg": "learning/05-replace-one-frame.md",
});

export const canonicalVisualNames = Object.freeze(
  Object.keys(canonicalVisualOwners).sort(),
);
