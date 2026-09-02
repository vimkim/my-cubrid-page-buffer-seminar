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
  "alternating-read-write-waiters.svg": "advanced/acquisition-concurrency.md",
  "aout-ghost-admission.svg": "advanced/replacement-progress.md",
  "bcb-page-header-identity.svg": "learning/02-fix-hold-release.md",
  "checkpoint-selection-vs-wal.svg": "learning/04-flush-one-generation.md",
  "claim-levels-ladder.svg": "advanced/failure-and-proof-obligations.md",
  "dirty-page-flush-actors.svg": "learning/04-flush-one-generation.md",
  "durability-chain.svg": "learning/04-flush-one-generation.md",
  "exceptional-return-gaps.svg": "learning/06-maintainer-capstone.md",
  "fix-contract.svg": "learning/02-fix-hold-release.md",
  "fix-write-vs-promote.svg": "advanced/acquisition-concurrency.md",
  "holder-anchor-vs-entry.svg": "advanced/holder-entry-lifecycle.md",
  "holder-entry-lifetime.svg": "advanced/holder-entry-lifecycle.md",
  "identity-check-timeline.svg": "learning/02-fix-hold-release.md",
  "latch-request-structures.svg": "advanced/acquisition-concurrency.md",
  "latch-versus-lock.svg": "learning/03-caller-completes-correctness.md",
  "latch-wait-queue.svg": "advanced/acquisition-concurrency.md",
  "lifecycle-order.svg": "advanced/recovery-and-lifecycle.md",
  "load-owner-waiter.svg": "learning/02-fix-hold-release.md",
  "lru-cross-search-and-aging.svg": "advanced/replacement-progress.md",
  "lru-domains-zones.svg": "advanced/replacement-progress.md",
  "lru-scan-depth-vs-list-count.svg": "learning/05-replace-one-frame.md",
  "mutation-ownership-spine.svg": "learning/03-caller-completes-correctness.md",
  "object-ownership-map.svg": "learning/01-contract-and-objects.md",
  "oldest-unflush-checkpoint.svg": "learning/04-flush-one-generation.md",
  "ordered-watcher-refix.svg": "advanced/acquisition-concurrency.md",
  "ownership-ledgers.svg": "learning/02-fix-hold-release.md",
  "page-buffer-daemon-control-loops.svg": "reference/dirty-page-flush-actors.md",
  "promotion-outcomes.svg": "advanced/acquisition-concurrency.md",
  "redo-lsa-gate.svg": "advanced/recovery-and-lifecycle.md",
  "repeated-read-lru-effects.svg": "advanced/replacement-progress.md",
  "replacement-data-structures.svg": "learning/05-replace-one-frame.md",
  "replacement-lifecycle-quantities.svg": "advanced/replacement-progress.md",
  "startup-bcb-lifetime.svg": "learning/01-contract-and-objects.md",
  "state-axes.svg": "learning/01-contract-and-objects.md",
  "three-engine-replacement-paths.svg": "reference/cross-database-replacement-policy-comparison.md",
  "three-engine-responsibility-seams.svg": "reference/cross-database-replacement-policy-comparison.md",
  "two-lsa-timeline.svg": "learning/04-flush-one-generation.md",
  "unconditional-latch-scenarios.svg": "advanced/acquisition-concurrency.md",
  "victim-eligibility.svg": "learning/05-replace-one-frame.md",
  "why-thread-holder.svg": "advanced/holder-entry-lifecycle.md",
});

export const canonicalVisualNames = Object.freeze(
  Object.keys(canonicalVisualOwners).sort(),
);
