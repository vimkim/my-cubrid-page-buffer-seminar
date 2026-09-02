/**
 * The canonical visual roster: every SVG the document set displays, keyed by
 * file name under `assets/`, with the single guide page that owns it.
 *
 * Tests import this map instead of hard-coding the roster so that adding or
 * retiring a visual is one edit.
 */
export const canonicalVisualOwners = Object.freeze({
  "allocation-progress.svg": "advanced/replacement-progress.md",
  "durability-chain.svg": "learning/04-flush-one-generation.md",
  "fix-contract.svg": "learning/02-fix-hold-release.md",
  "identity-check-timeline.svg": "learning/02-fix-hold-release.md",
  "latch-wait-queue.svg": "advanced/acquisition-concurrency.md",
  "object-ownership-map.svg": "learning/01-contract-and-objects.md",
  "ownership-ledgers.svg": "learning/02-fix-hold-release.md",
  "state-axes.svg": "learning/01-contract-and-objects.md",
  "victim-eligibility.svg": "learning/05-replace-one-frame.md",
});

export const canonicalVisualNames = Object.freeze(
  Object.keys(canonicalVisualOwners).sort(),
);
