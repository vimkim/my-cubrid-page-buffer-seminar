# Final-session report application

The final seminar now delivers the questions from [socratic-questions.md](../socratic-questions.md) in the Korean script and six paired projected lectures. Fifteen authored state traces expose the actor, current fields, controlling guard and changed result. The [preparation plan](final-session-preparation.md) continues to own scope and screen routes.

## Revision and input identity

Implementation started from local main `fa812bb8b795ea8cdd5b88845a8db296c2ff41f7` on 2026-10-12. Work item 322 owns this phase. The input reports remain unchanged historical agent reviews; they are not human acceptance receipts.

| Input | SHA-256 at the starting revision |
| --- | --- |
| Korean script | `c2bf881dbdbd1891efbfe2c825b2a7b7837e2d7cda057efab0aac97f49ed4ef3` |
| Editorial feedback | `49f5088cf502fa9d61459f40dce931331feaadda4a8aa386710c766a8af0728f` |
| Socratic questions | `2a49c1d3d48c8d146bbe56bc367c4ef4a703e729ae0fdc5b49327f847515be71` |

CUBRID mechanisms remain pinned to `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; PostgreSQL to `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`. New artifact identities and browser evidence are recorded separately in [check-results.json](session-3-depth/check-results.json). The source ranges were read from the local pinned objects, including candidate checks, common completion fallback, post-flush, direct-victim receiving checks, quota admission, token consumption/replacement, pin accounting, clock CAS, ring claim/rejection and protected invalidation. No engine execution or benchmark was added.

## Editorial findings

These rows follow the nine prioritized findings in [feedback.md](../feedback.md#우선순위별-발견-사항과-처리). Successful script edits are retained; added teaching content extends them.

| Finding | Concrete application |
| --- | --- |
| P1: compressed residency/generation language | [Script generation](../my-presentation-script-session-3.html#generation) retains the G/G+1 definition. [Visible state trace](../ko/lessons/0006-flush-one-generation.html#flush-state-trace) separates current bytes, stable copy, flags and storage boundaries. |
| P1: completion versus waiter/allocator work | [Post-flush trace](../ko/lessons/0006b-follow-page-flush-handoff.html#post-flush-state-trace) has separate flush-waiter and allocator lanes; completion clears FLUSHING while newer DIRTY survives. |
| P1: wake described as runtime observation | [Q08](../ko/lessons/0006b-follow-page-flush-handoff.html#q08) states the unfinished constructed trace and asks for the next WAL/submission evidence. The EN trigger wording now names the gate and waiter-reported wake. |
| P1: fallback owner too narrowly page-flush | [Q09 and queue-full trace](../ko/lessons/0006b-follow-page-flush-handoff.html#queue-full-state-trace) identify the submitting caller. Corrected both projected handoff paragraphs, the shared SVG and the [evidence owner](../reference/page-buffer-daemon-lifecycle-audit.md#3-pgbuf-page-post-flush-finish-and-revalidate-bcbs). |
| P2: frequent English explanatory terms | New Korean explanations use causal sentences and retain source names; the existing professional spoken wording remains. [Script maintenance](../my-presentation-script-session-3.html#maintenance) and [pacing](../my-presentation-script-session-3.html#pacing) supply the delivered route. Human naturalness review remains open. |
| P2: undefined epoch | [Q12 and quota trace](../ko/lessons/0006c-follow-maintenance-and-pacing.html#quota-state-trace) distinguish six attempts, two accepted passes, age 8→10 and unchanged quota 60. |
| P2: credit/reset before definitions | [Pin trace](../ko/lessons/0018a-compare-replacement-policies.html#pin-state-trace) follows descriptor/pin definitions. [Independent clock alternative](../ko/lessons/0018a-compare-replacement-policies.html#clock-alternative-trace) states every reset input. |
| P2: permanent page versus dirty state | [Q20](../ko/lessons/0018a-compare-replacement-policies.html#q20) and [final PostgreSQL case](../ko/lessons/0018a-compare-replacement-policies.html#final-postgres) retain the BM_PERMANENT category and current DIRTY qualification separately. |
| P2: presentation-method phrasing in closure | Q23/Q24 precede the spoken recap and farewell. [Projected closing](../ko/lessons/0018a-compare-replacement-policies.html#session-page-journey) now labels the earlier first-principles boundary and completes Session 3 explicitly. |

The five source-backed clarifications are preserved: logged permanent-page WAL scope (Q02), gate/waiter wake interpretation (Q05/Q08), DIRTY in the consumer mask (Q10 and the completion trace), submitting-caller fallback (Q09), and capped first-pin credit versus private nesting (Q16). Newly taught prerequisites and claims are visible; native answer disclosures remain initially closed.

## Delivered question dispositions

Every main question is available directly where its prerequisites are explained, with its constructed premise, a closed model answer and its original optional follow-up. All 24 are main discussions; optional follow-ups remain inside their answer disclosure. Repeated generic prompts were removed from the script, while its opening retrieval question, two independent clock predictions and final cases remain. The author report alone is no longer the delivery route.

| ID | Reasoning retained | Projected EN / KO anchor | Korean script anchor |
| --- | --- | --- | --- |
| Q01 · main | Reuse approval counterexample | [EN](../en/lessons/0001-present-the-page-journey.html#q01) / [KO](../ko/lessons/0001-present-the-page-journey.html#q01) in #journey | [#opening / q01](../my-presentation-script-session-3.html#q01) |
| Q02 · main | Copied WAL target | [EN](../en/lessons/0006-flush-one-generation.html#q02) / [KO](../ko/lessons/0006-flush-one-generation.html#q02) in #generation | [#generation / q02](../my-presentation-script-session-3.html#q02) |
| Q03 · main | Equal payload, newer logged work | [EN](../en/lessons/0006-flush-one-generation.html#q03) / [KO](../ko/lessons/0006-flush-one-generation.html#q03) in #redirty | [#generation / q03](../my-presentation-script-session-3.html#q03) |
| Q04 · main | DWB completion claim | [EN](../en/lessons/0006-flush-one-generation.html#q04) / [KO](../ko/lessons/0006-flush-one-generation.html#q04) in #copy-versus-dwb | [#generation / q04](../my-presentation-script-session-3.html#q04) |
| Q05 · main | Wake before sleep | [EN](../en/lessons/0006a-understand-page-buffer-daemons.html#q05) / [KO](../ko/lessons/0006a-understand-page-buffer-daemons.html#q05) in #daemon | [#daemons / q05](../my-presentation-script-session-3.html#q05) |
| Q06 · main | Stop versus joined termination | [EN](../en/lessons/0006a-understand-page-buffer-daemons.html#q06) / [KO](../ko/lessons/0006a-understand-page-buffer-daemons.html#q06) in #lifecycle | [#daemons / q06](../my-presentation-script-session-3.html#q06) |
| Q07 · main | Same identity, changed protection | [EN](../en/lessons/0006b-follow-page-flush-handoff.html#q07) / [KO](../ko/lessons/0006b-follow-page-flush-handoff.html#q07) in #selection | [#page-flush / q07](../my-presentation-script-session-3.html#q07) |
| Q08 · main | Entry versus useful submission | [EN](../en/lessons/0006b-follow-page-flush-handoff.html#q08) / [KO](../ko/lessons/0006b-follow-page-flush-handoff.html#q08) in #trigger | [#page-flush / q08](../my-presentation-script-session-3.html#q08) |
| Q09 · main | Queue-full caller completion | [EN](../en/lessons/0006b-follow-page-flush-handoff.html#q09) / [KO](../ko/lessons/0006b-follow-page-flush-handoff.html#q09) in #handoff | [#post-flush / q09](../my-presentation-script-session-3.html#q09) |
| Q10 · main | Current private quota | [EN](../en/lessons/0006b-follow-page-flush-handoff.html#q10) / [KO](../ko/lessons/0006b-follow-page-flush-handoff.html#q10) in #post | [#post-flush / q10](../my-presentation-script-session-3.html#q10) |
| Q11 · main | Revoked offered frame | [EN](../en/lessons/0006b-follow-page-flush-handoff.html#q11) / [KO](../ko/lessons/0006b-follow-page-flush-handoff.html#q11) in #post | [#post-flush / q11](../my-presentation-script-session-3.html#q11) |
| Q12 · main | Accepted epochs with unchanged quota | [EN](../en/lessons/0006c-follow-maintenance-and-pacing.html#q12) / [KO](../ko/lessons/0006c-follow-maintenance-and-pacing.html#q12) in #maintain | [#maintenance / q12](../my-presentation-script-session-3.html#q12) |
| Q13 · main | VS-20 causal evidence | [EN](../en/lessons/0006c-follow-maintenance-and-pacing.html#q13) / [KO](../ko/lessons/0006c-follow-maintenance-and-pacing.html#q13) in #maintenance-boundary | [#maintenance / q13](../my-presentation-script-session-3.html#q13) |
| Q14 · main | Token replacement | [EN](../en/lessons/0006c-follow-maintenance-and-pacing.html#q14) / [KO](../ko/lessons/0006c-follow-maintenance-and-pacing.html#q14) in #control | [#pacing / q14](../my-presentation-script-session-3.html#q14) |
| Q15 · main | Log-critical-section bypass | [EN](../en/lessons/0006c-follow-maintenance-and-pacing.html#q15) / [KO](../ko/lessons/0006c-follow-maintenance-and-pacing.html#q15) in #soft | [#pacing / q15](../my-presentation-script-session-3.html#q15) |
| Q16 · main | Shared and private pin accounting | [EN](../en/lessons/0018a-compare-replacement-policies.html#q16) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q16) in #postgres-model | [#postgres-model / q16](../my-presentation-script-session-3.html#q16) |
| Q17 · main | Content-protection contract | [EN](../en/lessons/0018a-compare-replacement-policies.html#q17) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q17) in #postgres-model | [#postgres-model / q17](../my-presentation-script-session-3.html#q17) |
| Q18 · main | CAS interference | [EN](../en/lessons/0018a-compare-replacement-policies.html#q18) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q18) in #postgresql | [#postgres-clock / q18](../my-presentation-script-session-3.html#q18) |
| Q19 · main | Shared frame identity behind ring ID | [EN](../en/lessons/0018a-compare-replacement-policies.html#q19) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q19) in #postgres-ring | [#postgres-ring / q19](../my-presentation-script-session-3.html#q19) |
| Q20 · main | Strategy-specific WAL rejection | [EN](../en/lessons/0018a-compare-replacement-policies.html#q20) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q20) in #postgres-ring | [#postgres-ring / q20](../my-presentation-script-session-3.html#q20) |
| Q21 · main | Re-dirty after another user leaves | [EN](../en/lessons/0018a-compare-replacement-policies.html#q21) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q21) in #dirty | [#postgres-writeback / q21](../my-presentation-script-session-3.html#q21) |
| Q22 · main | Writeback owners and checkpoint obligation | [EN](../en/lessons/0018a-compare-replacement-policies.html#q22) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q22) in #dirty | [#postgres-writeback / q22](../my-presentation-script-session-3.html#q22) |
| Q23 · main | Choose correlated completion evidence | [EN](../en/lessons/0018a-compare-replacement-policies.html#q23) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q23) in #session-page-journey | [#closing / q23](../my-presentation-script-session-3.html#q23) |
| Q24 · main | Transfer transition contracts | [EN](../en/lessons/0018a-compare-replacement-policies.html#q24) / [KO](../ko/lessons/0018a-compare-replacement-policies.html#q24) in #session-page-journey | [#closing / q24](../my-presentation-script-session-3.html#q24) |

## Visual coverage and interaction contract

The current root [index.html](../index.html) loads `teach-course.css` then `seminar.css`. The script now uses that same chain before its scoped layout. Its earlier blue palette and filled rounded hero are removed. Four existing shared diagrams use the current paper/green/amber palette, with their source roles and geometry preserved. No new SVG ownership seam or site redesign was introduced.

| Visible trace | Mechanism and bounded source basis |
| --- | --- |
| [Copied generation](../en/lessons/0006-flush-one-generation.html#flush-state-trace) | Stable G versus current G+1, copied LSA 120 versus current 180, later oldest-unflush 160, WAL 140, DWB acceptance and unobserved home write; page_buffer.c:10723–10962. |
| [Daemon lifecycle](../en/lessons/0006a-understand-page-buffer-daemons.html#daemon-state-trace) | RUNNING wake not latched, wake-only sleep, later accepted wake, stop/wake/join and resource lifetime; thread_waiter.cpp:76–101, thread_daemon.cpp:53–105, boot_sr.c:2405–2441. The visible control-loops diagram keeps four roles separate. |
| [Candidate gap](../en/lessons/0006b-follow-page-flush-handoff.html#candidate-state-trace) | Remembered pointer/VPID, list unlock, reader fix, BCB-protected rejection; page_buffer.c:4041–4088. |
| [Completion versus assignment](../en/lessons/0006b-follow-page-flush-handoff.html#post-flush-state-trace) | Synchronous submission, queue publication/wake, later consumer, current DIRTY/fix rejection, old FLUSHING completion and distinct waiters; page_buffer.c:10925–10952,15487–15556. |
| [Queue-full fallback](../en/lessons/0006b-follow-page-flush-handoff.html#queue-full-state-trace) | No publication; submitting caller completes under BCB mutex; page_buffer.c:10925–10952. |
| [Quota and revoked offer](../en/lessons/0006b-follow-page-flush-handoff.html#offer-state-trace) | Current size80/quota100 rejection, explicit reset to size80/quota60, offer then re-fix and allocator retry; page_buffer.c:15512–15545,15592–15660,8315–8325. |
| [Accepted quota epochs](../en/lessons/0006c-follow-maintenance-and-pacing.html#quota-state-trace) | Early-return guards, accepted adjust_age increments despite equal quota, sample consumption; page_buffer.c:14294–14340. Q13 keeps VS-20’s source finding separate from unmeasured impact. |
| [Post-write tokens](../en/lessons/0006c-follow-maintenance-and-pacing.html#token-state-trace) | Successful OS writes precede spending 7→3, replacement 3→5, independent shortage/reset, ordinary versus log-CS waits; file_io.c:4122–4204,751–829,850–891. |
| [Pin accounting](../en/lessons/0018a-compare-replacement-policies.html#pin-state-trace) | Stable descriptor, backend-local nesting, shared participating-backend count and bounded credit; bufmgr.c:3295–3386. |
| [Clock](../en/lessons/0018a-compare-replacement-policies.html#clock-state-trace) / [independent alternative](../en/lessons/0018a-compare-replacement-policies.html#clock-alternative-trace) | Fixed descriptor positions, decrement and skip visits, later successful zero-credit claim; freelist.c:239–317. |
| [CAS interference](../en/lessons/0018a-compare-replacement-policies.html#clock-cas-trace) | Zero observation, B’s pin, stale expected-state CAS failure and skip; freelist.c:252–317. |
| [Ring references](../en/lessons/0018a-compare-replacement-policies.html#ring-state-trace) | Local slots reference shared frames, usage≤1 claim, higher-credit rejection, global fallback and one ID replacement; freelist.c:615–705; bufmgr.c:2471–2673. |
| [Strategy/WAL](../en/lessons/0018a-compare-replacement-policies.html#ring-wal-trace) | Independently reset BULKREAD/BULKWRITE/VACUUM, permanent/from-ring/WAL guard, slot invalidation versus shared identity, pinned H protection; bufmgr.c:2590–2639; freelist.c:741–770. |
| [Later dirty invalidation](../en/lessons/0018a-compare-replacement-policies.html#invalidation-state-trace) | Earlier write, B’s mutation and release, sole pin insufficient while DIRTY, mapping/header protected rejection; bufmgr.c:2471–2511. |

Each snapshot preserves lane order and labels changed fields in prose as well as color. Previous/Next/Reset and Show-all operate only on authored snapshots, with native keyboard buttons and live status. Resets affect one scenario. No JavaScript exposes the full sequence; print also exposes all steps. There is no automatic stepping, stored participant state or engine simulation. Sources describe the mechanisms; the particular arithmetic and interleavings are constructed assumptions.

## Open human and runtime evidence

| Feedback question | Explicit disposition |
| --- | --- |
| Spoken Korean pronunciation and pacing | Human rehearsal against the new script hash remains open. |
| G versus G+1 and the two waiter roles | Prediction and state trace now delivered; participant reasoning must still be heard and reviewed. |
| Clock decrement versus claim, ring versus shared frame | Independent traces and Q18/Q19/Q20 now delivered; transfer understanding remains human evidence. |
| Wake latency and VS-20 allocator impact | Existing uncertainty status preserved; no new runtime claim. |
| Cross-engine metadata/writeback advantage | Mechanism comparison only; a controlled benchmark remains outside this phase. |

The bilingual review registry is unchanged. Editing six pairs invalidates their current fingerprints; genuine historical receipts remain intact. The new verification receipt attributes review-only deltas separately from technical failures. Automated language parity and render checks are not human Korean acceptance or participant mastery.
