# Ticket03 / ticket04 parallel integration contract

Status: released after verified ticket02 commit 42c9ea748a9c10d44b99305d7aec632f157fff60. Both children start from the subsequent integration-contract commit.

Both implementation owners receive separate repository worktrees from the same ticket02 integration commit. No shared-worktree concurrent edits. Each owner commits only its ticket's paths; the main orchestrator integrates the results serially into the original worktree. Existing unrelated dirty work is preserved.

## Shared interface

- Ticket02 handoff owns the numerical baseline, identity map, event schedule, flags, list boundaries, and exact before-helper selection checkpoint. Neither child silently changes that baseline.
- Ticket03 owns `reuse-*` checkpoint anchors, candidate rejection, protected detach/rebind, and separately reset flushing/direct-victim progress schedules.
- Ticket04 owns `policy-*` checkpoint anchors, the bounded immediate-hit-promotion hypothesis, baseline-versus-alternative analysis, and defense rubric.
- Ticket04 depends on ticket02, not ticket03. Link existing canonical safety explanations rather than pretending ticket03's new branches already exist in its isolated baseline.
- New content extends the same EN/KO worked-example pair. Preserve prior anchors and distinguish alternative histories. Keep changes localized; avoid whole-page reformatting that obscures integration.
- Shared navigation, test files, coverage, and presenter guidance may change in both isolated trees. Main resolves their integration by retaining both features and reruns checks; a clean textual merge alone is not acceptance.

## Review and handoff

Each ticket uses its own independent Standards and Spec review agents, subject to the seven-agent concurrency ceiling. Their integration baseline is fixed and recorded. Each handoff includes changed paths, commits, actual test results, exact branch starting/ending states, new anchors, open gates, and any required integration treatment.

Final served checks run on the integrated original worktree before ticket05 starts. Human language receipts remain pending unless an actual qualified review occurs; do not substitute agent review or generated fingerprints.
