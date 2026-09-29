# Ticket03/04 integration handoff

Verified combined implementation base: `b87c7d5`. Isolated branches began at `ebdb2dd`; ticket02's implementation was `42c9ea7`. See each ticket handoff for source evidence, terminal states, and separate Standards/Spec review results.

The orchestrator integrated 03 first and 04 second. Expected conflicts in the English/Korean worked example and browser test file were resolved by retaining both section groups, navigation groups, and all four new browser tests. Read-only identity checks confirmed each reviewed reuse-* and policy-* section remains verbatim, exactly once, in both languages. No engine or remote changes were made.

One integration browser race was corrected in 6bf473d: after branch navigation, wait for #reuse-direct to become visible before focusing its disclosure summary. The initial combined run passed 72/73; the focused browser rerun passed 15/15. The final combined focused run passed 73/73, zero skips, at b87c7d5 (`/tmp/lru-integrated-focused-final.log`).

Technical parity and link closure pass for 51 language pairs. Guide source checks pass for 43 pages and 60 SVGs in the original workspace. Actual Copyparty bilingual served checks passed 253 resources/103 pages before the final source-anchor wording commits; ticket05 must rerun final validation. Separate isolated-worktree missing external evidence receipts do not occur in the original workspace. Existing guide Copyparty DOM/server-asset problems and three known broad-test failures require explicit rechecks/disclosure, not invented passes.

Downstream contract: reuse branches reset independently from selection-baseline; policy comparisons reset from their stated earlier checkpoints, not from a completed reuse branch. Preserve these boundaries. Native disclosures support complete no-JavaScript reading; JavaScript branch reset applies only to marked answer groups.

Ticket05 should audit the inherited InnoDB midpoint citation noted in F02-handoff.md, verify source before narrowing any correction, complete curriculum entry/presenter routes, and publish actual technical evidence separately from pending human Korean-naturalness and semantic acceptance. No human receipts have been supplied.
