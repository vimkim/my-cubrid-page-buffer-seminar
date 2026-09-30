# Presenter runbook

Author-only facilitation notes for the [seminar curriculum](docs/seminar-curriculum-design.md). This file is deliberately absent from participant navigation, but is not protected from direct access.

Use Korean as the default live edition. Begin in reading mode to show the lecture's scope, then use presentation mode when focusing a section. PageUp/PageDown move between sections; Escape returns to reading. Open a model explanation after participants have considered the scenario. No participant responses are stored by the site.

A provisional meeting can allocate roughly 60 minutes to mechanisms and source traces, 20 to a worked scenario, and 10 to questions. These are planning aids, not limits. Split a dense lecture across meetings and revisit prerequisites whenever an ownership, guard, lifetime, or evidence boundary remains unclear. Continue until teammates can explain the causal path and handle counterexamples, even if the series exceeds a college semester.

Ask participants to distinguish what the source establishes from what requires a runtime experiment. Route unresolved claims to the uncertainty registry rather than settling them by confidence. Use the synthesis workshop and technical-defense rubric for shared reasoning, not a personal scorecard or a gate enforced by page visits.

Before presenting, open the exact served URL and check the intended viewport, diagrams, disclosure controls, source links, and language switch. Keep reading mode available if a projected section needs more context. Consult the coverage audit for remaining editorial or human language-review work.


## Current first-time participant session

Use the [complete Korean spoken script](my-presentation-script.html) as the one current companion. It contains actual explanations, transitions, diagram cues, prediction pauses and reveal explanations for every selected stop. The previous script is superseded for this session and preserved in Git history. Ticket contribution fragments are author evidence, not additional current companions.

The [Korean itinerary](ko/reference/first-principles-route.html#session-itinerary) and [English itinerary](en/reference/first-principles-route.html#session-itinerary) state exact entry, included sections, final included section and next stop. The script repeats the entire screen sequence. Its coverage table links every stop to its spoken segment. At an explicit exit, follow the next session cue rather than full-curriculum or section-next navigation.

Start with the concrete request and objects, then F1 through `#exercise`, concurrent use, admission/final unfix and domain/age/zone/quota policy. List choice precedes the common branch checkpoint. Read both branches from that checkpoint independently; a resume of A's H1/H2 reads before B's S1/S2 scan is the only changed input. Continue through protected recheck and safe reuse, four background roles, handoff, post-write pacing, comparison and the page-journey recap. End at Lecture 18A `#session-page-journey`; there is no final diagnostic workshop in this session.

WAL, LSA, recovery, DWB internals and copied-generation detail belong to the next session. Dirty changes still require preservation before possible reuse; successful write/completion does not waive current-state checks. No prior transaction-lock seminar is assumed. The older full-curriculum facilitation below remains available for that broader curriculum only, including F02 and detailed dirty-generation exercises. This session is untimed and does not replace Core/Advanced completion evidence.

Close native outcomes before a new prediction. In presentation mode the opted-in sections reset answers on navigation; without JavaScript, close them manually. A displayed worked example may show its result; an unseen prediction must not. Formal Korean-language and EN/KO semantic human review remains pending; agent review and browser passes are not human acceptance or participant mastery.

## Integrated replacement itinerary

Lecture12 now owns the explicit textbook-versus-CUBRID comparison at `#textbook-vs-cubrid`, following the membership-state explanation. Use its R/P checkpoint before the complete BCB trip: distinguish access ordering from ownership, then conditional unfix movement, list selection and protected reuse. Ask which stated condition would invalidate the keep result. Retain the exact-LRU MRU-on-left convention used there; it intentionally differs from the oldest-first metadata in F1. The visible performance discussion separates source intent/structural work from measured benefit. JavaScript presentation controls remain available; script-disabled reading is a fallback, not a ban on interactions.

Use the [Korean syllabus resume routes](ko/reference/course-learning-path.html#replacement-route) or the [English counterpart](en/reference/course-learning-path.html#replacement-route). The Topic library also exposes the complete worked example. These checkpoints supplement the full Core/Advanced curriculum; they do not bypass acquisition, ownership, or durability prerequisites.

| Teaching stop | Prediction pause and source task | Reset or return |
| --- | --- | --- |
| F1 → F2 → Lecture 1 | Predict an unseen victim and metadata, then explain why a preferred database victim can be unavailable. | Each policy and DB-A/B/C starts independently. Transfer workload shape only into CUBRID. |
| Lecture 12 → snapshot through unfix-p | Draw F42/P separately from F43/R; locate admission and the LRU1 keep branch before revealing placement. | Preserve the 32,768-frame starting snapshot and first six checkpoints. |
| Lecture 12B → cooling through selection-baseline | Derive S49 boundaries, P's saved tick, sequential migration, and quota inputs. Ask which helper executes next, not which frame is already owned. | End before A allocates T. Revisit the canonical evidence for disputed fields. |
| Lecture 12 → reuse-reject / reuse-safe | Name prefilter versus protected recheck, then count linked and hashed frames through C50/Q → C50/T. | Each begins at selection-baseline; successful reuse stops with T fixed in VOID. |
| reuse-flush / reuse-direct | State the added vacuum/LSA schedule, distinguish G from G+1, and predict direct reservation consumption or revocation. | F starts from selection-baseline plus its dirtying events; D restarts F's dirty pre-copy state. Neither inherits successful T reuse. |
| Lecture 17 → policy-proposal / policy-defense | State the proposed trigger and locks, calculate the two comparisons, then defend or reject it with a counterexample and verification plan. | Reset A to checkpoint 3 and B to S49. Never carry alternative ticks into baseline selection. |

At every pause, ask for before state, one event, after state, controlling predicate, owner/guard, and an unsupported conclusion. Reveal only after the prediction; a wrong answer is a reason to revisit a prerequisite, not to lock navigation. Branch choice selects an authored schedule rather than running a simulator. With scripts disabled, all histories remain readable; close answers manually for another prediction.

Use the participant rubric in the policy-defense disclosure and technical-defense card for human discussion. Keep participant Completion records outside the site. The [integrated acceptance record](.scratch/lru-seminar-design/ticket05-handoff.md) separates delivery checks from pending human language acceptance; its technical checks are not evidence that participants have mastered the Module.

## F01 replacement foundations

Begin with basic programming and array/linked-list knowledge only. Follow F01 with the required F02 database bridge before Lecture 1. No fixed total meeting duration is imposed.

Ask why a full cache cannot simultaneously retain P/R/S and load T under fixed capacity. The instructor explanation is conditional: replacement creates a reusable slot; bypass, waiting/refusal, or growth require a different permitted outcome. A clean cached copy can leave while its backing copy survives. Neither crash nor data loss follows just from being full.

For the common P R P S P R T U P R trace, ask for physical frames and metadata separately. At request 7, FIFO and Clock evict P; LRU and OPT evict S. At request 8, LRU loses P while OPT preserves P/R. Thus identical FIFO/LRU/Clock totals (3 hits, 7 misses) hide different histories. Clock's first full sweep clears all three bits before replacing F0; a reference bit is not a last-access timestamp. OPT's 5 misses meet the five-distinct-page lower bound only under this model.

Use the independent counterexample P R S P T R to challenge “LRU always wins”: FIFO has 2 hits/4 misses; LRU has 1 hit/5 misses. Have participants explain the recent-use assumption and metadata cost rather than infer throughput from hit counts.

The unseen exercise P R S R T P R uses a fresh empty cache. Instructor totals: FIFO/Clock 1 hit/6 misses, LRU 2 hits/5 misses, OPT 3 hits/4 misses. Request 6 distinguishes FIFO's eviction of R from LRU's eviction of S, explaining the final R miss versus hit. Use the full answer ledgers in native disclosures only after prediction. Ask for reasoning and state transitions, not an automated score. These checks do not establish participant mastery or replace human language review.

## Ticket 03 safe reuse and progress

Use the four `reuse-*` checkpoints in the LRU worked example. Ask participants to name the starting history before any prediction: R and S reset to selection-baseline; F adds a logged vacuum-worker modification; D restarts F's dirty pre-copy state and explicitly adds allocation contention/waiting. Do not concatenate mutually exclusive outcomes. A stable frame name survives identity retirement; VOID, INVALID latch, and INVALID free-list membership are distinct.

Instructor explanation: a successful scan retains the BCB mutex across list detach and old-hash retirement, then the claim path binds T. Flush clears the old dirty obligation before I/O, so G completion clears flushing while a G+1 dirty obligation survives. The vacuum unfix exception is deliberate: ordinary LRU3 final unfix would boost Q. Direct reservation leaves Q reachable; B's refix revokes the offer and A retries at high priority. Temporary per-visit mutex contention supplies a legal bounded-search failure, not a runtime observation or evidence of fairness. Use corrected VS-19 for the ordinary-to-big queue publication path; preserve the VS-20/21 qualifications. In no-JavaScript reading, close the native disclosure manually before a fresh prediction; all event histories remain visible and no dynamic state is carried.

## Ticket 02 cooling, migration, and selection

Use Lecture 12B's exact trace links after the admission sequence. Ask for S46–S49 boundaries before opening the answer: at S49 combined-zone overflow demotes Z48 first, then zone1 overflow demotes P. P's age is 51 list events against a threshold of 25, so its later final unfix boosts it while preserving saved tick1000. B's index33 mismatch then moves the same frame through protected VOID into shared1 LRU2; it does not create a private copy or add a second epoch10 hit.

Require conservation across the full explicit scan: private30867 + shared1900 + sharedP1 =32768, INVALID0. A quota of1000 did not prohibit invalid-frame admission. Ask participants to explain why the one accepted quota pass can raise private thresholds to250/250 without promoting nodes: it only adjusts an over-quota protected region. The complete chain still has50/50/30767. The shared target uses uncapped all_private_quota32702, producing20/2 despite private32's cap5000.

The selection answer ends before the selected-list helper and before ownership of any candidate. C50/Q is the named clean bottom for later safe-reuse work; F42/P remains sharedLRU2. If a participant treats a positive candidate counter as overwrite authorization, return to the database bridge's safety/progress distinction. Conditional failed-search routing is not a second history already executed. Keep the corrected VS-19 queue path, VS-20/21 qualifications, and dormant AOUT visible; human-reviewed reasoning, not visiting the page, establishes learning evidence.

## Ticket 04 immediate-promotion defense

Use Lecture 17's policy-review link or the technical-defense card to enter policy-proposal. Establish that “every hit” means every successful ordinary resident OLD_PAGE fix in this bounded hypothesis, including nested/fast-path successes. The proposed protected operation happens after latch/holder grant and before return; it targets the current list, preserves same-list saved tick, and adds one top-insertion tick even for an existing top. It is not a call to the current boost helper, which asserts that its input is not LRU1. Existing final-unfix migration still applies.

Reset A to checkpoint 3: the baseline keeps R above P at tick 1002; the alternative moves P above R at tick 1003, both with counts 4/48/50. Reset B independently to S49: the alternative promotes P during A's fix, while the baseline waits for final unfix and age 51 ≥ 25. Both then reach tick 1052 and counts 50/50/51. B's alternative hit adds a private tick even though P is already top; final unfix migrates both to shared 1 LRU2 with saved tick 0/shared tick 1, leaving private ticks 1052 versus 1053. Do not merge the alternative's ticks into the original terminal selection baseline.

Before opening the defense disclosure, ask participants to calculate ten P,R pairs from checkpoint 3 without scan or intervening events. Both have 20 hits/0 misses and the same final chain; baseline tick 1002 versus alternative 1022 exposes extra protected metadata work with no residency gain in that interval. This refutes a universal residency benefit, not a measured throughput claim. Ask how a quick second scan touch, shared-list contention, or a changed working set could alter the tradeoff. The source's age-gating rationale is an implementation policy, not benchmark evidence.

Use the five-row human rubric to review definitions/state, controlling source, invariants/concurrency, counterexample/tradeoffs, and verification/decision. Accept a defended rejection or narrowed proposal. Require a concrete race/failure test and a paired workload/counter plan, including tail latency and synchronization cost. No engine implementation or new native experiment is required in this ticket. Keep participant evidence outside the published site and retain the pending human Korean/semantic review gate.

## F02 database bridge facilitation

Use the systems table to ask what the cached unit is, who controls placement, and which candidates are legal. A CPU line is not a database page; a set restricts candidates. An application may discard a recomputable value but cannot infer the same contract for pending writes. Introduce pin versus latch, dirty versus clean, durability and WAL before the dirty checkpoint. A page flush is neither eviction nor transaction commit.

DB-A, DB-B, and DB-C each restart at P/R/S; they are not successive rows or F01 terminal states. Ask participants to name the reset and explain the assumptions before opening each disclosure. Instructor explanation for DB-A: FIFO prefers pinned P, but R is oldest eligible, so T replaces R in F1, giving P/T/S and FIFO P→S→T. The atomic eligibility/reuse step is an explicit teaching-model premise.

DB-B has dirty unpinned P and clean pinned R/S. Successful WAL-ordered writeback with no concurrent change leaves P/R/S and clean P; only subsequent protected reuse gives T/R/S. Its alternative re-dirty schedule restarts at DB-B and does not inherit that successful ending. DB-C has all three pinned: no recency improvement frees a frame. Progress needs another event, such as release; waiting is not itself a guarantee. Ask for permitted next actions and unsupported fairness claims separately.

PostgreSQL's ring and InnoDB's delayed promotion motivate scan handling without predicting a winner. Keep detailed comparator control flow in Lecture 18A. Before entering Lecture 1, state that ticket 01 starts a different 32,768-frame constructed model, first uses INVALID frames, and keeps F42/F43 distinct from toy F0/F1. Repeating P can leave its LRU1 position unchanged under the preserved example's assumptions. Later ticket 02 extends that source-derived state; do not improvise three-frame cooling thresholds. Use human-reviewed reasoning as learning evidence, with language review still pending.
