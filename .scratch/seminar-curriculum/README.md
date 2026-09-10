# Audience-facing curriculum migration

Work item: 55. Accepted scope: [curriculum design](../../docs/seminar-curriculum-design.md). Prototype verdict and archive: [layout A review](../../docs/seminar-prototype-review.md).

Implementation and automated validation are finished. The [coverage audit](../../docs/curriculum-coverage.md) maps all 48 paired paths and records verification. The full bilingual aggregate exits unsuccessfully only for 48 missing human Korean-review receipts and their 96 unrecorded fingerprints; do not fabricate these to close the work.

Next action: a Korean-capable reviewer reads the final EN/KO pairs, records reviewer/date and actual matching fingerprints, and reruns the aggregate. Until then, the implementation is available for review but final language acceptance is open.

Review corrections on 2026-09-08: all three reported issues were fixed with observed failing-to-passing regressions. All 59 tests pass without skips; independent Standards and Spec re-reviews have zero outstanding findings. The served HTML and canonical Markdown gates pass. Human language review remains the only open acceptance gate.

`migrate.mjs` and `lectures.json` are one-time migration working files, not a build pipeline. The migration has already run; rerunning it would duplicate production markup. Edit the static HTML and shared assets directly under the authoring contract.
