# Session 3: Background progress and PostgreSQL strategies

This is the **third and final page-buffer seminar session**, lasting **n hours**. The presenter has completed sessions 1 and 2 (3 and 4 hours), covering page-buffer basics, BCBs, and private/shared LRU organization. Use that shared model to answer one remaining question: **when the pool is full, who makes a frame reusable, and what must still be checked?**

The [delivery record](../README.md#seminar-delivery) owns session status. The [Korean spoken script](../my-presentation-script-session-3.html) is the presenter companion for this session. The earlier script remains a reference for the completed material.

## What participants should be able to explain at the end

- Follow one dirty CUBRID page through generation capture, WAL gating, submission, BCB completion, and possible direct-victim assignment.
- Distinguish the four page-buffer daemon jobs, their triggers, shared state, and completion boundaries.
- Explain why a timer, completed flush, queued BCB pointer, or direct-victim offer requires further state reasoning.
- Hand-trace PostgreSQL's clock sweep and a buffer-access-strategy ring, separating pins, content protection, reuse credit, and dirty-page writeback.
- Diagnose a new full-pool scenario by naming the owner, blocking predicate, next useful observation, and limit of the conclusion.

Use the final discussion exercise to connect the mechanisms and close the seminar. The broader Core/Advanced library remains available for later maintenance work; it does not impose another live seminar session.

## Preparation and delivery

Keep the duration flexible. Complete the essential explanation, prediction, and recap in each block; expand its source trace only when useful. Take a break after the post-flush block and another before PostgreSQL if needed. Let participant questions determine the remaining time.

Open the Korean screen links below in reading mode first. Use presentation mode for a selected section, then jump directly to the next listed fragment. The existing full-curriculum next/previous controls retain their broader order. Earlier session-boundary panels describe the previous route; this session deliberately enters the detailed sections beyond them.

Do a short retrieval check on identity, fix debt, latching, and dirty state. Introduce WAL, page LSA, stable copied images, and DWB locally before they become necessary. Completed coverage does not establish that those durability details were already taught.

All worked schedules in the script are constructed reasoning examples. They are not runtime captures or performance measurements. CUBRID claims use `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; PostgreSQL claims use `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`, a separately pinned development revision. Constants, ring sizing, synchronization, and timing are revision-bound Implementation policy. Consult the [source inventory](../source-inventory.md) and [uncertainty registry](../unresolved-or-version-sensitive-findings.md) before carrying them to another revision.

## Essential screen route

| Block / script | Exact Korean screen route | Participant work and stopping point |
| --- | --- | --- |
| 1. [Opening](../my-presentation-script-session-3.html#opening) | [Page journey](../ko/lessons/0001-present-the-page-journey.html#journey) | Reconstruct identity, ownership, byte access, and propagation. Finish at the full-pool question. |
| 2. [Flush bridge](../my-presentation-script-session-3.html#generation) | [DIRTY](../ko/lessons/0006-flush-one-generation.html#flush-purpose) → [copied generation](../ko/lessons/0006-flush-one-generation.html#generation-meaning) → [WAL boundary](../ko/lessons/0006-flush-one-generation.html#moments) → [generation steps](../ko/lessons/0006-flush-one-generation.html#generation) → [DWB route](../ko/lessons/0006-flush-one-generation.html#copy-versus-dwb) → [re-dirty](../ko/lessons/0006-flush-one-generation.html#redirty) | Predict which image completes when memory changes again. Stop once G completion and G+1 work are distinct. |
| 3. [Four independent loops](../my-presentation-script-session-3.html#daemons) | [Cadence](../ko/lessons/0006a-understand-page-buffer-daemons.html#cadence) → [daemon loop](../ko/lessons/0006a-understand-page-buffer-daemons.html#daemon) → [lifecycle](../ko/lessons/0006a-understand-page-buffer-daemons.html#lifecycle) | Assign jobs and triggers. Explain boot gating and stop → wake → join. |
| 4. [Page-flush](../my-presentation-script-session-3.html#page-flush) | [Call path](../ko/lessons/0006b-follow-page-flush-handoff.html#first-code-path) → [trigger](../ko/lessons/0006b-follow-page-flush-handoff.html#trigger) → [selection](../ko/lessons/0006b-follow-page-flush-handoff.html#selection) | Trace collect → unlock list → lock BCB → recheck identity/state/WAL → submit. Stop at the submission boundary. |
| 5. [Post-flush](../my-presentation-script-session-3.html#post-flush) | [Handoff](../ko/lessons/0006b-follow-page-flush-handoff.html#handoff) → [consumer call path](../ko/lessons/0006b-follow-page-flush-handoff.html#post-flush-code-path) → [current-state checks](../ko/lessons/0006b-follow-page-flush-handoff.html#post) → [re-dirty question](../ko/lessons/0006b-follow-page-flush-handoff.html#audience-checkpoint) | Predict a queued BCB that is fixed or dirtied again. Finish by separating flush waiters from allocation waiters. |
| 6. [Maintenance](../my-presentation-script-session-3.html#maintenance) | [Policy call path](../ko/lessons/0006c-follow-maintenance-and-pacing.html#first-code-path) → [quota updates](../ko/lessons/0006c-follow-maintenance-and-pacing.html#maintain) → [source limitations](../ko/lessons/0006c-follow-maintenance-and-pacing.html#maintenance-boundary) | Distinguish a 100 ms task attempt from an accepted quota epoch. Route the backup anomaly to VS-20. |
| 7. [Flush-control](../my-presentation-script-session-3.html#pacing) | [Credit call path](../ko/lessons/0006c-follow-maintenance-and-pacing.html#credit-code-path) → [post-write credit](../ko/lessons/0006c-follow-maintenance-and-pacing.html#control) → [soft pacing](../ko/lessons/0006c-follow-maintenance-and-pacing.html#soft) → [outside actors](../ko/lessons/0006c-follow-maintenance-and-pacing.html#outside) | Place the token wait after OS writing. Identify log flush, checkpoint, and DWB as separate owners. |
| 8. [PostgreSQL model](../my-presentation-script-session-3.html#postgres-model) | [Resident descriptor and credit](../ko/lessons/0018a-compare-replacement-policies.html#postgres-model) → [credit changes](../ko/lessons/0018a-compare-replacement-policies.html#postgres-credit) | Map BCB/fix/latch responsibilities to descriptor/pin/content protection without equating the interfaces. |
| 9. [Clock sweep](../my-presentation-script-session-3.html#postgres-clock) | [Worked clock trace](../ko/lessons/0018a-compare-replacement-policies.html#postgres-first-trace) → [source mechanism](../ko/lessons/0018a-compare-replacement-policies.html#postgresql) | Hand-trace the script's fresh four-descriptor teaching model. Stop at the selected descriptor's new pin. |
| 10. [Access-strategy rings](../my-presentation-script-session-3.html#postgres-ring) | [Ring explanation](../ko/lessons/0018a-compare-replacement-policies.html#postgres-ring) | Trace ring reuse, a higher-credit rejection, and fallback to the global clock. Explain NORMAL/BULKREAD/BULKWRITE/VACUUM. |
| 11. [Writeback and comparison](../my-presentation-script-session-3.html#postgres-writeback) | [Dirty-page progress](../ko/lessons/0018a-compare-replacement-policies.html#dirty) → [PostgreSQL tradeoffs](../ko/lessons/0018a-compare-replacement-policies.html#postgres-tradeoffs) | Separate backend eviction writes, background-writer cleaning, and checkpoint work. End with conditional design tradeoffs, supported by source. |
| 12. [Final workshop and closure](../my-presentation-script-session-3.html#closing) | [Script's fresh scenarios](../my-presentation-script-session-3.html#closing) → [complete page journey](../ko/lessons/0018a-compare-replacement-policies.html#session-page-journey) | Explain two unfamiliar schedules, then reconstruct the complete journey. Close the page-buffer seminar here. |

Use the matching `en/` paths when participants want English wording. The PostgreSQL section selects the PostgreSQL parts of Lecture 18A; its InnoDB sections remain optional library material.

## What to emphasize

**One page, two generations.** Use the script's value 10 → 11 → 12 example. Establish the WAL-before-page obligation, a stable captured image, and current dirty work. With DWB, successful submission can mean acceptance of the captured image; it does not establish a completed home-volume write. Link the [canonical flush explanation](../learning/04-flush-one-generation.md) for the complete protocol.

**Four loops, four outputs.** Page-flush creates clean-candidate supply. Post-flush finishes BCB state and may assign a direct victim. Maintenance adapts replacement quotas and zones. Flush-control refreshes a shared pacing allowance after writes. Their full trigger, lock, and lifecycle catalog belongs in the [daemon audit](../reference/page-buffer-daemon-lifecycle-audit.md).

**Completion and assignment are separate.** The post-flush queue contains BCB pointers. Its consumer uses the BCB mutex to inspect current flags, fixes, zone, and private quota before assignment. It still finishes the old FLUSHING state and wakes flush waiters when assignment is rejected. Handoff requires a page-flush producer, an existing consumer daemon, an allocation waiter, and successful queue insertion; otherwise completion occurs locally.

**Policy and progress remain distinct.** A maintenance attempt can return without a quota update. VS-20's pinned backup loop bodies are skipped as written; the registry owns its status and unresolved allocator impact. File-I/O tokens are replaced each update, and post-write waits have bypass/escape paths. Use these as examples of reading executable boundaries rather than treating a function name or comment as a guarantee.

**PostgreSQL remembers limited credit.** A normal first pin by a backend raises usage credit up to five; same-backend nested pins use its private refcount. A strategy pin can raise zero credit to one and preserves a higher existing credit. The clock skips pinned descriptors, decrements positive credit, and claims an unpinned zero-credit descriptor with a pin. Dirty writeback and identity invalidation remain later work.

**The ring owns references, not frames.** A backend-local strategy object stores shared buffer IDs. An unusable slot falls back to the global clock and is replaced with the selected buffer ID. A ring slot is recyclable only when unpinned with usage credit at most one. Higher credit can represent other work that should retain the page. Factory defaults and ring sizes belong to the pinned source; the teaching ring is deliberately a smaller reasoning model.

**Compare costs with conditions.** CUBRID's many replacement domains and PostgreSQL's global clock with workload-local rings make different choices about ordering, metadata work, and where writeback latency is paid. The [canonical comparison](../reference/cross-database-replacement-policy-comparison.md#postgresql-decay-a-resident-counter-under-a-clock-hand) owns the deeper explanation. A source trace supports a mechanism comparison; a performance winner requires a controlled workload and measurement.

## Bounded source traces

Read one main branch per block. The ranges below were inspected at the pinned commits while preparing this session; the traces establish source behavior, not an observed execution.

| Question | Pinned source route |
| --- | --- |
| What wakes and runs page-flush? | CUBRID [pause policy and daemon tasks](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16971-L17136), [shared pressure predicate](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15407-L15418), [waiter wake semantics](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_waiter.cpp#L76-L101) |
| What authorizes a remembered flush candidate? | CUBRID [candidate collection and protected recheck](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3780-L4165) |
| When does completion move to post-flush? | CUBRID [four-condition handoff and local completion](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10925-L10952), [queue drain and direct-victim checks](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15487-L15556) |
| Why can a maintenance attempt do no quota work? | CUBRID [accepted-pass guards](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14294-L14340), [VS-20 backup loops](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9608-L9648) |
| Where is write pacing charged? | CUBRID [post-write call](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L4122-L4204), [bounded token waits and interval replacement](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L751-L891) |
| Where does PostgreSQL select and pin a descriptor? | PostgreSQL [clock sweep and claim](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L171-L295), [normal/strategy/nested pin behavior](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L3295-L3386) |
| How does a ring reuse, reject, or refill a slot? | PostgreSQL [strategy factory](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L420-L540), [ring reuse and insertion](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L615-L705), [bulk-read WAL rejection](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L741-L770) |
| Who writes a dirty PostgreSQL victim, and when can reuse fail? | PostgreSQL [foreground victim path](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L2548-L2673), [identity invalidation recheck](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L2471-L2511), [WAL before a permanent-page write](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L4561-L4604) |
| How do background writer and checkpoint differ? | PostgreSQL [background cleaning](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L3854-L4115), [eligible-buffer write helper](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L4152-L4211), [checkpoint work selection](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L3575-L3615) |

## Final workshop and rehearsal

Before opening the script's answers, ask each participant to record **before state → event → after state**, the controlling predicate, and the next useful source or runtime observation. Use the two fresh schedules in the closing block, then ask them to reconstruct the whole page journey aloud. These are discussion artifacts, with human feedback rather than an automated score.

Rehearse the route once from start to finish. Check the spoken transitions, definition-before-use ordering, diagram legibility, and whether each prediction's premises are visible before its answer. Keep a closed-answer copy when presenting. Verify exact fragments in both languages and mobile/no-JavaScript readability. Automated source and browser checks support technical delivery; Korean spoken-language acceptance still requires human review.

If time is tight, shorten raw source reading and factory arithmetic first. Keep the G/G+1 bridge, conditional handoff, post-write pacing boundary, clock/ring predictions, and final diagnosis. Close with the completed page journey and direct participants to the [symptom playbook](../playbooks/debug-by-symptom.md), [source map](../reference/source-map.md), and [Maintainer Guide](../page-buffer-teaching-material.md) for future work.

## Preparation checks (2026-10-12)

- Copyparty Markdown source checks pass for this plan, README, NOTES, and the presenter runbook. Relative file/fragment checks pass for all 157 links in the changed documents and script; 24 unique pinned GitHub source-file/line targets resolve in the local source repositories.
- The script has 12 spoken blocks and 14 initially closed answer disclosures. Headless checks pass at 1440 px and 390 px with JavaScript disabled, including keyboard disclosure, section navigation, viewport containment, and console/page errors.
- All 66 EN/KO script screen cues render against the exact served files. Ten representative EN/KO presentation-mode cues pass. Changed Markdown files render without relevant errors.
- The required Maintainer Guide aggregate passes: 43 pages, 71 displayed SVGs, zero orphaned SVGs, 114 HTTP resources, and 43 live-DOM pages.
- The bilingual aggregate retains its existing review-only failures: 58 missing human Korean review receipts and 78 stale fingerprints. Existing audience HTML and its manifest are unchanged. This preparation does not supply those receipts or human acceptance of the new spoken script.
- Source reasoning and constructed schedules were reviewed; no new engine runtime experiment, observed participant session, or cross-engine benchmark was performed.
