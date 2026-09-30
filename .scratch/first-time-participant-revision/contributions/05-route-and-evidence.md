# Ticket 05 integration contribution

Insert [the spoken segments](05-background-script.html) into the root presenter script after replacement and before comparison. Its 14 `ko/...#fragment` cues are relative to that root script, not this contribution directory. Preserve the native-disclosure pauses and the exact session exit links below. Ticket 07 owns final script assembly and route reconciliation.

## Selected stops

Both languages use identical fragments and previous/next lesson navigation remains unchanged.

| Stop | Entry | Included explanation | Exit |
| --- | --- | --- | --- |
| Four roles | [6A first-principles](../../../ko/lessons/0006a-understand-page-buffer-daemons.html#first-principles) | first-principles, why-background, page-flush-purpose, post-flush-purpose, maintenance-purpose, flush-control-purpose, cadence | [background-session-exit](../../../ko/lessons/0006a-understand-page-buffer-daemons.html#background-session-exit) links to 6B first-principles |
| Handoff | [6B first-principles](../../../ko/lessons/0006b-follow-page-flush-handoff.html#first-principles) | first-principles, session-handoff-check | [handoff-session-exit](../../../ko/lessons/0006b-follow-page-flush-handoff.html#handoff-session-exit) links to 6C first-principles |
| Policy and pacing | [6C first-principles](../../../ko/lessons/0006c-follow-maintenance-and-pacing.html#first-principles) | first-principles, session-pacing-check | [pacing-session-exit](../../../ko/lessons/0006c-follow-maintenance-and-pacing.html#pacing-session-exit) links to session itinerary |

The selected 6A safe-write explanation preserves dirty-data constraints and current-state rechecks. The precise write protocol moved after its explicit session exit to `deferred-write-protocol`; established deep anchors remain. Selected 6B/6C stop before `first-code-path`. Optional detailed links do not expand the selected live route. Both new prediction sections opt into existing `data-reset-answers` behavior. Predictions concern a live fix and post-write credit consumption, requiring no copied-generation or recovery reasoning.

## Dependency reconciliation

Read ticket 04's actual trace at content commit `1eced45` and spacing revision `baf6c72`. Its common state is a full 32,768-frame pool, shared private index 32, quota 5,000, thresholds 250/250. In the active branch both H1/H2 remain; with A paused H1 leaves but H2 remains. The script says exactly this before moving on. Its separate protected-recheck reset rejects an S3 candidate newly held by A; no frame is overwritten.

The background close-up starts a new constructed state, visibly declared in both languages and script. Execution context B requests S3; S4 and S5 are dirty candidates; H1/H2 are fixed. Four displayed pages are not the whole pool: the other frames are assumed to offer no eligible candidate. No new causal input is smuggled into ticket 04's two-branch ledger. In the maintenance sub-example A/B use different private lists, explicitly contrasting with the shared-index checkpoint: quota belongs to a list, not independently to each user. Old later-session B/E exercises have an explicit local naming reset.

## Source verification

Evidence is pinned local source at `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, not a runtime receipt. The following boundaries were re-read while authoring:

| Claim | Source | Verification |
| --- | --- | --- |
| Queue handoff versus inline completion | `src/storage/page_buffer.c:10929–10953` | All four conditions guard enqueue: page-flush producer, live post-flush object, waiting direct-victim allocator, successful queue production. The else branch locks the BCB, marks it flushed and wakes relevant flush waiters. |
| Current-state conditional assignment | `src/storage/page_buffer.c:15496–15564` | Consumer locks BCB; checks flags excluding the pending flush flag, fixes, victim zone, private quota; attempts direct assignment. Completion and flush-waiter handling follow even when assignment is rejected. |
| Policy maintenance | `src/storage/page_buffer.c:14260–14511,16972–17008` | Quota adjustment has time/activity gates; the task also calls the VS-20 backup. The uncertainty registry retains its source anomaly and unverified production impact. |
| Post-write credits and bounded retries | `src/storage/file_io.c:630–655,751–929` | Compensation requests tokens; absent bucket bypasses; ordinary insufficient-credit waiting is after successful write in participating paths. Retry bound counts wake/retry cycles, not elapsed time. A stopped supplier may therefore leave a wait pending. Credit generation replaces the shared balance. |

The consumer's flush waiters and B's allocator wait are separate roles. Finishing BCB state does not promise a frame to B. No fairness, universal wakeup or immediate-progress guarantee is introduced.

## Review state

The three owned manifest entries were already `review.state = pending` with empty fingerprints at the common base. They remain unchanged; there was no valid receipt to invalidate. No human acceptance is claimed. See [the check receipt](05-checks.md) for the tested content commit and open gates. [Anchor inventory](05-anchor-inventory.json) records every preserved and new ID.
