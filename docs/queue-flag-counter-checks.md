# Queue registration and candidate-counter clarification

Updated the EN/KO Lecture 0007A duplicate-registration section against pinned
CUBRID f799e05: per-list flags and array lookup, CAS registration, consumer
requeue/clear behavior, incremental candidate counting, and the distinction
between an O(1) count check and a BCB search. Existing anchors are preserved.
Current pair fingerprints are recorded; human language review remains pending.

Validation in the task worktree:

- Maintainer aggregate: Markdown, links, SVG ownership, English prose PASS;
  Copyparty HTTP PASS (114 resources). Live DOM failed on a resource 404 at
  the unchanged Guide entry; it is not recorded as passed.
- Bilingual aggregate: existing human-review/fingerprint failures remain.
  The served run also reported a resource 404 at the unchanged root index.
  The new prose initially triggered code-order parity; this was corrected,
  and the technical gate passed for all 56 pairs.
- Focused headless browser checks: both changed pages at desktop (1440 px),
  mobile (390 px), and desktop with JavaScript disabled passed content,
  horizontal-overflow, and native disclosure checks.
- `git diff --check`: PASS.

The served checks used read-only Copyparty at `http://127.0.0.1:8937`, rooted
in this task worktree, and `/tmp/private-shared-playwright.mjs` for headless
Chromium. No runtime engine experiment or human-review completion is claimed.
