# Textbook-first LRU implementation orchestration

Work item: 216. Authorized 2026-09-29. Initial repository HEAD: 6e88f91328499533ba0f769842709af549dc930a.

## Execution contract

One implementation owner per ticket, with separate Standards and Spec reviewers. Order: F01 → F02 → 02 → {03,04} → 05. Ticket01 is already implemented at 45435a9 and retains its documented acceptance gaps. Human language review is not fabricated or treated as a technical prerequisite for unrelated downstream work.

The main orchestrator owns accepted planning/contract changes that were uncommitted at start. Ticket agents own their scoped implementations and handoffs. Unrelated dirty files outside this directory are excluded. No remote publication or engine changes are authorized.

Before 03/04 start, use the verified ticket02 state as an integration baseline and assign isolated worktrees or explicit non-overlapping edit ownership. Integrate serially and recheck semantic consistency of shared state and anchors. No concurrent index/commit operations in a shared worktree.

## Progress

| Ticket | Owner | State | Evidence |
| --- | --- | --- | --- |
| 01 | Prior completed work | Preserved | ticket01-handoff.md |
| F01 | implement_f01 | Implemented and verified | 74bec21, f8ace01; F01-handoff.md |
| F02 | implement_f02 | Implemented and verified | fb78b76, b9bf97d; F02-handoff.md |
| 02 | implement_02 | Ready to start | F02 interface verified; preserve ticket01 state |
| 03 | Not spawned | Blocked by 02 | |
| 04 | Not spawned | Blocked by 02 | |
| 05 | Not spawned | Blocked by 03 and 04 | |

## Acceptance limits

The starting site has missing/stale human review receipts. Ticket01 also records three pre-existing broad-test failures and a Copyparty Markdown DOM asset problem. Recheck rather than assume these persist; report source, HTTP, DOM, and human gates separately. Implementation completion is distinct from final human curriculum acceptance.
