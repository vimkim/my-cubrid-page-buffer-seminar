# Session 3: Background progress and PostgreSQL strategies

**Current selected delivery:** Present only chapters 03–07, in order, using the [five-chapter Korean speaker script](../my-presentation-script-session-3-03-07.html). It covers all 119 current screens, introduces the necessary WAL/LSA/generation/DWB prerequisites locally, explains each daemon's data structures with an SVG, and closes after chapter 07. The twelve-chapter route below remains the full preparation reference.

This is the **third and final page-buffer seminar session**, lasting **n hours**. The presenter has completed sessions 1 and 2 (3 and 4 hours), covering page-buffer basics, BCBs, and private/shared LRU organization. Use that shared model to answer one remaining question: **when the pool is full, who makes a frame reusable, and what must still be checked?**

The [delivery record](../README.md#seminar-delivery) owns session status. The [Korean spoken script](../my-presentation-script-session-3.html) is the presenter companion for this session. The earlier script remains a reference for the completed material.

The [agent editorial feedback](../feedback.md) and [Socratic discussion route](../socratic-questions.md) are author-only companions. Use the feedback for revision review and select questions from the discussion route for rehearsal or live discussion; keep both reports outside participant navigation and the Maintainer Guide topology.

## What participants should be able to explain at the end

- Follow one dirty CUBRID page through generation capture, WAL gating, submission, BCB completion, and possible direct-victim assignment.
- Distinguish the four page-buffer daemon jobs, their triggers, shared state, and completion boundaries.
- Explain why a timer, completed flush, queued BCB pointer, or direct-victim offer requires further state reasoning.
- Hand-trace PostgreSQL's clock sweep and a buffer-access-strategy ring, separating pins, content protection, reuse credit, and dirty-page writeback.
- Diagnose a new full-pool scenario by naming the owner, blocking predicate, next useful observation, and limit of the conclusion.

Use the final discussion exercise to connect the mechanisms and close the seminar. The broader Core/Advanced library remains available for later maintenance work; it does not impose another live seminar session.

## Preparation and delivery

Keep the duration flexible. Complete the essential explanation, prediction, and recap in each block; expand its source trace only when useful. Take a break after the post-flush block and another before PostgreSQL if needed. Let participant questions determine the remaining time.

Open the dedicated Korean chapter links below in reading mode first. Presentation mode selects one screen; chapter Next/Previous follows the final-session order, and Return reaches its TOC. The separate full curriculum retains its own navigation and earlier session boundaries.

Do a short retrieval check on identity, fix debt, latching, and dirty state. Introduce WAL, page LSA, stable copied images, and DWB locally before they become necessary. Completed coverage does not establish that those durability details were already taught.

All worked schedules in the script are constructed reasoning examples. They are not runtime captures or performance measurements. CUBRID claims use `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; PostgreSQL claims use `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`, a separately pinned development revision. Constants, ring sizing, synchronization, and timing are revision-bound Implementation policy. Consult the [source inventory](../source-inventory.md) and [uncertainty registry](../unresolved-or-version-sensitive-findings.md) before carrying them to another revision.

## Essential screen route

Open [root Session 3 contents](../toc.html), then [Korean detailed contents](../ko/seminar-3/toc.html) or [English contents](../en/seminar-3/toc.html). The dedicated chapter order is owned by `session-3-route.json`; it is separate from the broad curriculum order. Every chapter has its own previous/next, session-TOC return, exact counterpart and section controls. Start at chapter 1 and close at chapter 12.

The [accepted live design](session-3-live-design.md) governs the recurring workload, state/owner/guard-first projection, representative alternatives, concrete experiment proposals and staged final diagnosis. Reading and no-JavaScript modes expose the full argument. Essential mechanism and failure qualifications stay visible; prediction answers start closed.

| Block | Dedicated participant chapter | Spoken block |
| --- | --- | --- |
| 1 | [KO](../ko/seminar-3/01-opening.html#workload) / [EN](../en/seminar-3/01-opening.html#workload): A full pool: who can authorize reuse? | [Script](../my-presentation-script-session-3.html#opening) |
| 2 | [KO](../ko/seminar-3/02-flush-generations.html#workload) / [EN](../en/seminar-3/02-flush-generations.html#workload): One page, two generations | [Script](../my-presentation-script-session-3.html#generation) |
| 3 | [KO](../ko/seminar-3/03-daemon-architecture.html#workload) / [EN](../en/seminar-3/03-daemon-architecture.html#workload): Four roles, four progress obligations | [Script](../my-presentation-script-session-3.html#daemons) |
| 4 | [KO](../ko/seminar-3/04-page-flush.html#workload) / [EN](../en/seminar-3/04-page-flush.html#workload): A remembered candidate needs a current check | [Script](../my-presentation-script-session-3.html#page-flush) |
| 5 | [KO](../ko/seminar-3/05-post-flush.html#workload) / [EN](../en/seminar-3/05-post-flush.html#workload): Completion is followed by a revocable offer | [Script](../my-presentation-script-session-3.html#post-flush) |
| 6 | [KO](../ko/seminar-3/06-maintenance.html#workload) / [EN](../en/seminar-3/06-maintenance.html#workload): Adapt retention without authorizing reuse | [Script](../my-presentation-script-session-3.html#maintenance) |
| 7 | [KO](../ko/seminar-3/07-flush-control.html#workload) / [EN](../en/seminar-3/07-flush-control.html#workload): Pace work after the write | [Script](../my-presentation-script-session-3.html#pacing) |
| 8 | [KO](../ko/seminar-3/08-postgresql-buffers.html#workload) / [EN](../en/seminar-3/08-postgresql-buffers.html#workload): PostgreSQL: identity, pins, bytes and credit | [Script](../my-presentation-script-session-3.html#postgres-model) |
| 9 | [KO](../ko/seminar-3/09-clock-sweep.html#workload) / [EN](../en/seminar-3/09-clock-sweep.html#workload): Clock: inspect, age, skip, claim | [Script](../my-presentation-script-session-3.html#postgres-clock) |
| 10 | [KO](../ko/seminar-3/10-strategy-rings.html#workload) / [EN](../en/seminar-3/10-strategy-rings.html#workload): A scan ring names shared frames | [Script](../my-presentation-script-session-3.html#postgres-ring) |
| 11 | [KO](../ko/seminar-3/11-writeback-and-reuse.html#workload) / [EN](../en/seminar-3/11-writeback-and-reuse.html#workload): Writeback precedes protected identity retirement | [Script](../my-presentation-script-session-3.html#postgres-writeback) |
| 12 | [KO](../ko/seminar-3/12-final-defense.html#workload) / [EN](../en/seminar-3/12-final-defense.html#workload): Defend a protocol and diagnose a stall | [Script](../my-presentation-script-session-3.html#closing) |

Each chapter ends its mechanism argument with a coherent replacement protocol and a falsifiable experiment proposal. The Korean script lists every exact screen, including the new staged evidence and final closure. Proposals identify conditions, intervention, built-in observables or proposed probes, falsifiers and limits. They are not execution receipts.

Keep the Q01-Q24 and D25-D33 coverage except D27, whose separate section was omitted from the live session at the user’s request; retain the 22 existing state traces and three additional independent cases. The [application record](session-3-live-application.md) maps every question and trace to its new anchor. Native details expose diagnostic evidence after participants choose an observation; all initial premises remain visible. Q23/Q24, the complete page journey and farewell remain part of the ending.

## Intensive defense route

This stable heading now routes to the [dedicated final-defense chapter](../ko/seminar-3/12-final-defense.html#workload), with its [English counterpart](../en/seminar-3/12-final-defense.html#workload). The former seven reference arguments remain historical inputs at stable URLs, not the current live sequence. Their [research ledger](final-session-defense-research.md) still owns the investigated claims and primary-source map. The new lecture recomposes those arguments across twelve chapters rather than using a renamed reference menu.

## What to emphasize

**One page, two generations.** Use the script's value 10 → 11 → 12 example. Establish the WAL-before-page obligation, a stable captured image, and current dirty work. With DWB, successful submission can mean acceptance of the captured image; it does not establish a completed home-volume write. Link the [canonical flush explanation](../learning/04-flush-one-generation.md) for the complete protocol.

**Four loops, four outputs.** Page-flush creates clean-candidate supply. Post-flush finishes BCB state and may assign a direct victim. Maintenance adapts replacement quotas and zones. Flush-control refreshes a shared pacing allowance after writes. Their full trigger, lock, and lifecycle catalog belongs in the [daemon audit](../reference/page-buffer-daemon-lifecycle-audit.md).

**Completion and assignment are separate.** The post-flush queue contains BCB pointers. Its consumer uses the BCB mutex to inspect current flags, fixes, zone, and private quota before assignment. It still finishes the old FLUSHING state and wakes flush waiters when assignment is rejected. Handoff requires a page-flush producer, an existing consumer daemon, an allocation waiter, and successful queue insertion; otherwise completion occurs locally.

**Policy and progress remain distinct.** A maintenance attempt can return without a quota update. VS-20's pinned backup loop bodies are skipped as written; the registry owns its status and unresolved allocator impact. File-I/O tokens are replaced each update, and post-write waits have bypass/escape paths. Use these as examples of reading executable boundaries rather than treating a function name or comment as a guarantee.

**PostgreSQL remembers limited credit.** A normal first pin by a backend raises usage credit up to five; same-backend nested pins use its private refcount. A strategy pin can raise zero credit to one and preserves a higher existing credit. The clock skips pinned descriptors, decrements positive credit, and claims an unpinned zero-credit descriptor with a pin. Dirty writeback and identity invalidation remain later work.

**The ring owns references, not frames.** A backend-local strategy object stores shared buffer IDs. An unusable slot falls back to the global clock and is replaced with the selected buffer ID. A ring slot is recyclable only when unpinned with usage credit at most one. Higher credit can represent other work that should retain the page. Factory defaults and ring sizes belong to the pinned source; the teaching ring is deliberately a smaller reasoning model.

**Compare costs with conditions.** CUBRID's many replacement domains and PostgreSQL's global clock with workload-local rings make different choices about ordering, metadata work, and where writeback latency is paid. The [canonical comparison](../reference/cross-database-replacement-policy-comparison.md#postgresql-decay-a-resident-counter-under-a-clock-hand) owns the deeper explanation. A source trace supports a mechanism comparison; a performance winner requires a controlled workload and measurement.

The common multi-client question now has a dedicated [FAQ screen](../ko/seminar-3/08-postgresql-buffers.html#multiclient-faq) and [English counterpart](../en/seminar-3/08-postgresql-buffers.html#multiclient-faq). Continue through the backend pin budget, concurrent hand, another backend's effect on ring eligibility, and the domain/promotion comparison in chapters 8–11. The [research note](research/postgresql-multiclient-buffers.md) records primary-source evidence, a narrow PostgreSQL 18.0 cross-check, the AIO lifetime-pin qualification, and the limits of a performance claim. Its experiment proposal has not been executed.

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

The receipts below describe earlier preparation and reference-page revisions. Use the new dedicated presentation's live checks record for current artifacts; old counts and screenshots are historical inputs.

- Copyparty Markdown source checks pass for this plan, README, NOTES, and the presenter runbook. Relative file/fragment checks pass for all 157 links in the changed documents and script; 24 unique pinned GitHub source-file/line targets resolve in the local source repositories.
- The script has 12 spoken blocks and 14 initially closed answer disclosures. Headless checks pass at 1440 px and 390 px with JavaScript disabled, including keyboard disclosure, section navigation, viewport containment, and console/page errors.
- All 66 EN/KO script screen cues render against the exact served files. Ten representative EN/KO presentation-mode cues pass. Changed Markdown files render without relevant errors.
- The required Maintainer Guide aggregate passes: 43 pages, 71 displayed SVGs, zero orphaned SVGs, 114 HTTP resources, and 43 live-DOM pages.
- The bilingual aggregate retains its existing review-only failures: 58 missing human Korean review receipts and 78 stale fingerprints. Existing audience HTML and its manifest are unchanged. This preparation does not supply those receipts or human acceptance of the new spoken script.
- Source reasoning and constructed schedules were reviewed; no new engine runtime experiment, observed participant session, or cross-engine benchmark was performed.

## Polish checks (2026-10-12)

These checks apply to the final script SHA-256 `c2bf881dbdbd1891efbfe2c825b2a7b7837e2d7cda057efab0aac97f49ed4ef3`. The preparation checks above describe the earlier `38749d1` revision. The [machine-readable receipt](session-3-polish/check-results.json) records final artifact digests and focused browser results.

Three agents completed sequential write phases: presenter CSS (`328ee39`), Korean editing (`d2181f5`, followed by the caller clarification in `ecf60bb`), and the question route (`00c509c`). The dedicated stylesheet narrows spoken prose to 672 px on desktop and preserves readable table columns through keyboard-accessible scrolling on mobile. The script's 12 blocks now use consistent professional Korean and explicit causal transitions. The editorial report records five source-backed clarifications; the question route has 24 main questions and 24 optional follow-ups with fresh constructed premises and exact script anchors.

The question author's transfer review found that local completion was described too narrowly as page-flush work. The final script identifies the submitting thread as the owner when any post-flush handoff condition fails, matching the pinned common-helper branch. The report records this correction separately from language edits. No engine code was changed.

- Copyparty Markdown source checks pass for all six changed Markdown files. Relative files and fragments resolve, and all 28 distinct pinned GitHub source-file/line targets resolve against the local pinned repositories. The question route covers all 12 blocks, the closing section, and both final-case anchors.
- Served script and stylesheet bytes match the local files. Headless Chromium checks pass at 1440, 390, and 320 px with JavaScript disabled: 12 visible blocks, 14 initially closed answers, keyboard open/close for every answer, all 12 section links, the skip link, keyboard scrolling for all five narrow tables, and no document overflow or relevant runtime error.
- All 66 EN/KO script HTML fragment destinations render against exact served files, including the clean-unfix source route. Ten representative presentation-mode destinations pass. All six changed Markdown files render without relevant errors.
- The Maintainer Guide aggregate passes: 43 source pages, 71 displayed SVGs, zero orphaned SVGs, 114 HTTP resources, and 43 live-DOM pages.
- The full bilingual aggregate's diagnostic set exactly matches the pre-polish baseline: 58 missing human Korean review receipts and 78 stale fingerprints, with no new failure. Its served gate separately passes 295 HTTP resources and 117 live-DOM pages. Human spoken-language acceptance of this script remains open; the two agent-authored reports do not supply a human review receipt.
- The orchestrator inspected the committed CSS, editorial, and question changes against the repository rules and this session's scope. `git diff --check` passes. Source scenarios remain constructed examples; no engine runtime experiment, participant observation, or cross-engine benchmark was added.

The final screenshots were refreshed after Korean editing and inspected. Compare the complete flush-generation section at [desktop before](session-3-polish/desktop-before.png) / [desktop final](session-3-polish/desktop-final.png) and [mobile before](session-3-polish/mobile-before.png) / [mobile final](session-3-polish/mobile-final.png). The [desktop daemon view](session-3-polish/desktop-daemons-final.png) and [mobile daemon view](session-3-polish/mobile-daemons-final.png) provide additional typography and table evidence. The CSS agent also verified that Chromium 151 print output includes initially closed answers; that print check belongs to the CSS phase, before the later wording revisions.

## Current report application and visual checks (2026-10-12)

This implementation follows the polished `fa812bb` baseline above. The [application map](final-session-report-application.md) accounts for all nine prioritized editorial findings, the five source clarifications, every Q01–Q24 and the remaining human/runtime questions. It preserves the two input reports as historical artifacts. The new [verification receipt](session-3-depth/check-results.json) identifies current files separately from those older checks.

The Korean script retains its 12 major blocks and final closure, now with 24 delivered report questions and 29 initially closed answers. Six paired projected lecture pages contain those questions, their original optional follow-ups and fifteen authored traces. Native controls select stable snapshots; they do not execute engine logic. The script and updated visuals follow the shared style chain used by root `index.html`.

| Stop | Participant-visible worked state |
| --- | --- |
| Flush bridge | [G/G+1, copied LSA, current LSA and DWB](../ko/lessons/0006-flush-one-generation.html#flush-state-trace) |
| Four loops | [Visible roles and shared-state diagram](../ko/lessons/0006a-understand-page-buffer-daemons.html#cadence), then [gate/wake/stop trace](../ko/lessons/0006a-understand-page-buffer-daemons.html#daemon-state-trace) |
| Candidate and handoff | [Protection gap](../ko/lessons/0006b-follow-page-flush-handoff.html#candidate-state-trace), [queue-full fallback](../ko/lessons/0006b-follow-page-flush-handoff.html#queue-full-state-trace), [re-dirty completion](../ko/lessons/0006b-follow-page-flush-handoff.html#post-flush-state-trace), [quota/revoked offer](../ko/lessons/0006b-follow-page-flush-handoff.html#offer-state-trace) |
| Policy and pacing | [Accepted epochs](../ko/lessons/0006c-follow-maintenance-and-pacing.html#quota-state-trace), [post-write token replacement](../ko/lessons/0006c-follow-maintenance-and-pacing.html#token-state-trace) |
| PostgreSQL | [Private/shared pins](../ko/lessons/0018a-compare-replacement-policies.html#pin-state-trace), [clock](../ko/lessons/0018a-compare-replacement-policies.html#clock-state-trace), [independent alternative](../ko/lessons/0018a-compare-replacement-policies.html#clock-alternative-trace), [CAS interference](../ko/lessons/0018a-compare-replacement-policies.html#clock-cas-trace), [ring](../ko/lessons/0018a-compare-replacement-policies.html#ring-state-trace), [strategy/WAL](../ko/lessons/0018a-compare-replacement-policies.html#ring-wal-trace), [later dirty invalidation](../ko/lessons/0018a-compare-replacement-policies.html#invalidation-state-trace) |

Confirm each trace's independent starting assumptions before asking for a prediction. Next/Previous/Reset controls are keyboard buttons, with visible focus and a live change description. Show-all and script-disabled reading retain complete snapshots. Questions remain closed until discussion; moving to another projected section closes the opted-in answers. Shorten raw source reading when necessary, while preserving the generation, guard, fallback and closing reasoning.

- The Maintainer Guide aggregate passes source, relative-link, English-prose, SVG ownership, 114 HTTP-resource and 43 live-DOM-page checks: 43 guide pages, 71 displayed SVGs, zero orphans.
- The bilingual aggregate has no technical diagnostic. Its review-only failures are 58 missing human receipts and 82 stale fingerprints, versus 58/78 at baseline. The four newly stale entries are the EN/KO maintenance/pacing and replacement-comparison pairs; the other four changed pairs were already stale. No human receipt was replaced or fabricated. The separate served gate passes HTTP and live-DOM checks.
- All 25 focused tests pass, including every trace's keyboard stepping/back/reset/show-all, fixed lane order, independent clock reset, source-bounded final states, native question disclosures, and 390/320 px script-disabled reading. The two existing audience-regression fixtures now target their checkpoint section explicitly, preserving their rejection tests after new earlier questions were added.
- Focused delivery checks resolve relative files/fragments and pinned source ranges, preserve original script anchors/links, verify all 96 EN/KO screen targets, and check 36 projected targets. The script works at 1440/390/320 px with JavaScript disabled, including all 29 keyboard disclosures and 12 route links. Its five tables remain focusable and wrap completely inside the 390/320 px viewport. Reduced-motion scrolling and projected answer resets pass. Browser console/page errors are absent.
- Current content, input-report digests and screenshots are recorded in the receipt. Source reasoning and screenshots establish delivery behavior; human Korean rehearsal, semantic acceptance, participant understanding and performance conclusions remain open evidence requirements.

Inspect the changed visual feedback at [copied-state start](session-3-depth/projection-flush-start.png), [later re-dirty state](session-3-depth/projection-flush-redirty.png), [post-flush rejection/completion](session-3-depth/projection-post-flush.png), [CAS rejection](session-3-depth/projection-clock-cas.png) and [mobile trace](session-3-depth/mobile-trace.png). Compare script [desktop before](session-3-depth/script-desktop-before.png) / [after](session-3-depth/script-desktop-after.png) and [mobile before](session-3-depth/script-mobile-before.png) / [after](session-3-depth/script-mobile-after.png). The [earlier projected flush](session-3-depth/projection-flush-before.png) records the original explanation before state feedback was added. Screenshot captures temporarily isolate the captured section, hide fixed navigation overlays and expand viewport height to include it; normal delivery checks retain the complete layout and controls.
