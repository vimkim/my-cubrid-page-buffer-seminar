# Page-flush plain-language rewrite

Status: accepted by the user's `yes` on 2026-10-13. The paired HTML rewrite is
implemented; final verification and two-axis review are being recorded.
This record retains the settled criteria, factual investigation and the proposal
the user accepted before implementation.

## Scope and authority

Rewrite the complete paired `ko/seminar-3/04-page-flush.html` and
`en/seminar-3/04-page-flush.html`. The primary reader knows basic programming but
has no assumed buffer-pool, WAL or concurrency knowledge. Korean should be easy
enough to follow each cause and consequence, using a natural adult voice.

Follow `NOTES.md`, `CONTEXT.md`, ADRs 0004/0005 and the seminar curriculum design.
The canonical Markdown guide, source inventory and uncertainty registry retain
technical authority. The source baseline is CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.

Starting checkout: clean `main` at `028b800` in
`/home/vimkim/gh/my-cubrid-page-buffer-seminar`.
Task checkout: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-page-flush-plain-language`.
Task branch: `docs/page-flush-plain-language`. Local merge destination: `main`.
Work-tracker item: 348. Integration requires the separate repository merge
approval; push and deployment are outside this authorization.

## Settled criteria supplied by the user

- Explain why page-flush is needed with a small concrete case.
- Follow one page through problem, solution and required safety checks.
- State the starting conditions again whenever an example resets.
- Identify the actor, action, affected object and reason.
- Give each sentence one main idea.
- Explain indispensable terms before attaching their technical names.
- If an analogy is useful, state its mapping to actual objects.
- Distinguish candidate selection, write completion, current clean state and
  frame reuse, including why each needs its own check.
- Keep detailed settings, exceptions and long source excerpts in disclosures.
- Keep the core mechanism and safety conditions visible.
- Preserve technical meaning, evidence limits, URLs, anchors and interactions.
- Update English with the same meaning and structure; run required checks and
  make local task commits after implementation.

## Concrete reading obstacles

1. The current opening teaches the candidate protection gap before readers have
   seen a successful page journey. The second screen introduces cold state,
   DWB, WAL and a five-function source route together.
2. Terms such as submission, current eligibility, dirty obligation, completion,
   offer and receipt describe different events, but readers must infer the
   concrete actions that separate them.
3. Repeated independent examples alternate between P/Q, F/P/Q, G/G+1 and X/P/R.
   Local definitions exist, but the page has no simple successful story against
   which a reader can interpret each reset.
4. Exact timer branches, loop behavior, setting ranges, scan arithmetic and
   grouped counters occupy full early or middle screens. They interrupt the
   mechanism before readers can use those details.

The baseline contains 24 screens, Q07/Q08 and two interactive traces. These are
retention obligations, not evidence that every old screen must remain a separate
presentation step.

## Proposed visible route

| Screen | Korean question | Purpose |
| --- | --- | --- |
| 1 | 왜 변경 내용을 미리 기록해 둘까? | Establish P, missing Q, occupied frames and no immediately reusable frame. |
| 2 | 누가 페이지와 메모리 자리를 관리할까? | Explain page, frame, BCB, page identity and the allocator/background thread. |
| 3 | Page-flush는 언제 움직일까? | Explain recovery permission, wake requests and periodic pressure checks. |
| 4 | 어떤 페이지부터 살펴볼까? | Explain low retention priority and collecting a possible candidate. |
| 5 | 골라 둔 페이지를 왜 다시 확인할까? | Explain the unlocked interval and protected checks of identity and current state. |
| 6 | 왜 사본을 만들고 로그를 먼저 기록할까? | Explain a stable image, recovery log order and the write-submission boundary. |
| 7 | 쓰기 작업이 끝나면 그 자리를 바로 쓸 수 있을까? | Separate old completion, current obligations, eligibility, offer and actual receipt; introduce both waiter purposes. |
| 8 | 다른 작업이 끼어들면 무엇이 달라질까? | Keep Q07 and both existing traces visible with separate reset premises. |
| 9 | 필요한 로그가 늦으면 무엇을 기다릴까? | Keep Q08 visible and explain its independently reset WAL-progress case. |
| 10 | 어디까지 진행됐는지 어떻게 확인할까? | Recap the events; distinguish grouped counters from a page timeline and retain the proposed experiment. |

Screens 1-7 establish the successful journey. Screens 8-9 reset the example and
show why particular checks can stop that journey. Screen 7 keeps the possibility
of new changes visible even when the old write succeeds; no false success
guarantee is used to simplify the first journey.

This is the accepted editorial structure, not a runtime claim.
The final number can change if a screen becomes too dense, but the causal order
and preserved content require confirmation in the interview.

### Retention and disclosure placement

| Existing anchors/topics | Proposed destination |
| --- | --- |
| `workload` | Opening problem; retain anchor. |
| `handoff-problem` | Object identity and recheck explanation. |
| `trigger`, `flush-loop-boundaries`, `cost` | Wake/pressure explanation; exact loop, shutdown and interval details in disclosures. |
| `selection`, `flush-policy-settings`, `cost-part-2` | Candidate collection; exact policies and independent arithmetic in disclosures. |
| `selection-current-checks`, `source-guard` | Current checks; retain source branches and WAL route beside their explanation. |
| `first-code-path`, `flush-neighbor-settings` | Stable image/WAL/submission; retain direct/DWB and neighbor qualifications. |
| `waiter-origins`, `handoff-boundaries`, `handoff-boundaries-part-2`, `cost-part-3` | Completion/reuse and waiter purposes; detailed rejection table and work-cost analysis in disclosures. |
| `selection-part-2`, `selection-part-3`, `candidate-state-trace` | Visible Q07 and reader-fix trace, with unchanged identity and independent reset. |
| `identity-gap-trace-screen`, `identity-gap-trace`, `replacement-protocol` | Visible identity-change trace; reservation alternative remains explicitly proposed and disclosed. |
| `trigger-part-2` | Visible Q08 late-WAL case. |
| `flush-statistics`, `flush-diagnostics`, `experiment` | Diagnosis/recap; settings in disclosures and experiment still labeled unexecuted. |

Legacy anchors may become subordinate content blocks. Deep links must still open
the right disclosure and reach the right presentation screen. Questions and
interactive traces remain outside collapsed ancestors. Preserve their IDs,
controls, lane values and outcomes. Update both chapter contents maps, both
session contents maps, the Korean spoken map, and the teaching-label registry
where ordering changes. Explain each direct-link example's prerequisites locally.

The contents extractor counts every `section`, so do not retain old screens as
nested sections. Keep legacy detail anchors on visible summaries or their
`details` elements where possible. All marked definitions must remain outside
`details`; a screen-2 glossary does not replace local example definitions.
Keep existing Q&A answer summaries directly keyboard accessible rather than
nesting them in an initially closed technical disclosure. Two traces may need
separate presentation screens if their combined height obscures the simple
explanation; the ten-step route is a conceptual proposal, not a viewport limit.
Detailed generation, daemon lifecycle and handoff explanations retain their
existing neighboring-chapter owners (02, 03 and 05 respectively).

## Korean opening sample for user review

### 왜 변경 내용을 미리 기록해 둘까?

데이터베이스는 데이터를 여러 페이지로 나눠 저장합니다. 페이지는 데이터의
한 덩어리입니다. 그 페이지를 읽거나 바꾸려면 메모리로 가져와야 합니다.
메모리에서 페이지 하나가 들어가는 자리를 **프레임(frame)**이라고 부릅니다.

이번에는 이미 메모리에 있는 페이지 **P**를 생각해 봅시다. 어떤 작업이 P의
값을 10에서 20으로 바꿨습니다. 이 변경은 아직 저장소에 반영해야 합니다.
이처럼 기록할 변경 내용이 남은 페이지를 **dirty**라고 부릅니다.

이제 다른 페이지 **Q**를 읽어야 합니다. Q는 아직 메모리에 없습니다.
그런데 빈 프레임을 찾지 못했습니다. 지금 바로 재사용할 수 있는 프레임도
찾지 못했다고 가정합시다. Q를 가져올 자리가 필요한 상황입니다.

P가 있는 자리에 곧바로 Q를 덮어쓰면, 저장해야 할 P의 내용이 사라집니다.
그래서 P의 변경 내용을 기록하는 작업이 필요합니다.
**Page-flush**는 이런 작업을 미리 진행하는 백그라운드 스레드입니다.
요청을 처리하는 스레드와 별도로 움직입니다.

이번 설명에서는 page-flush가 P를 후보로 고른 경우를 따라갑니다.
먼저 P를 지금 처리해도 되는지 확인합니다. 그다음 저장할 사본을 만들고,
필요한 로그를 먼저 기록한 뒤, 사본 쓰기를 요청합니다.

**여기서 기억할 점:** P의 쓰기 작업이 끝나도, 그 프레임을 Q에 줄 수
있는지는 다시 확인해야 합니다. 다른 작업이 P를 사용하거나 새로 바꿨을
수 있기 때문입니다. 후보를 고르는 것부터 자리 재사용까지 차례로 살펴봅니다.

The numbers are constructed teaching values, not an observed database run. P is
one chosen example; the actual algorithm can choose other pages and another
provider can satisfy Q first. Later prose must explain direct-write versus DWB
acceptance without claiming physical-device persistence.

## Pinned source qualifications

Factual exploration checked the clean pinned worktree. Anchors below refer to
`src/storage/page_buffer.c` unless another source is named.

- Full occupancy alone is insufficient: allocation tries invalid frames and
  eligible clean victims before waiting and waking page-flush (8185-8319).
- The LRU walk saves BCB addresses and VPIDs without reserving a page
  (3789-3848). Cold is policy priority, not proof of non-use.
- Protected candidate checks include current VPID, DIRTY, FLUSHING, LRU3 and
  fixed-by-any; the latter includes fix count, waiters and latch state in this
  call mode (4040-4063; 9266-9282).
- Required WAL can cause a skip and log-flush wake; specific allocator pressure
  plus all candidates needing WAL permits one synchronous force and retry
  (4065-4082; 4135-4153).
- The helper copies a stable image with matching LSA bookkeeping before forcing
  required WAL and submitting through DWB or direct writing (10801-10898).
- DIRTY clears as FLUSHING is set, before submission. A later writer can dirty
  the page again. Completion clears old FLUSHING while preserving new DIRTY
  (16077-16112). Do not equate DIRTY=0 with completed writing or matching disk
  and memory contents.
- Completion can occur inline or be delegated when its branch conditions hold
  (10932-10954). Post-flush is conditional, not a mandatory stage for every page.
- Post-flush may reject offering while still completing the old flush; receipt
  checks the offered frame again (15498-15557; 15598-15654).
- Removing only VPID comparison demonstrates stale candidate association, not
  independently proved byte corruption. G/G+1 remain teaching notation.
- OS-write success, DWB acceptance, BCB completion and physical persistence are
  distinct (`src/storage/file_io.c:4135-4204`).

## Domain-language treatment

The existing `CONTEXT.md` owns document-domain vocabulary. Page, frame, BCB,
fix, WAL and dirty are existing implementation concepts, so the established
daemon-first-principles design's treatment applies: explain them in the owning
page rather than adding a duplicate glossary. No new domain role or irreversible
product decision has been found; no new glossary or ADR is proposed.

## Shared-understanding confirmation

The user answered `yes` after reviewing the Korean opening, ten-step route and
successful-journey-first organization. This confirmed the explanation level,
later reset failure cases and adjacent technical disclosures. No unresolved
design decision remains. The requested implementation is authorized.

During implementation, local main advanced through `2e0dc33`, adding the simple
search-loop explanation and the clean-tail-removal explanation. The isolated
task branch was updated to include those changes. Their prose and source routes
are retained in adjacent technical disclosures, with legacy anchors preserved.
Other chapters, their maps, and the VS-20 issue-reference update are preserved.

## Verification after implementation

Run both repository aggregates, then served HTTP and available headless DOM
checks on the task worktree. Run the existing focused Session 3 browser suite for
reading, projection, narrow viewports, direct links, native disclosures, question
visibility, traces, no-JavaScript access and the complete spoken screen map.
Verify original anchors, source routes and trace endpoints are preserved.
Refresh changed fingerprints without fabricating language-review receipts.
Report unavailable gates and existing failures honestly. Run validator tests if
validation code changes; no implementation-mirroring prose tests are proposed.

## Proposal-stage checks

On 2026-10-13, only this authoring record was added; product HTML, manifests,
validators and shared assets remain unchanged from the starting commit.

- The Copyparty Markdown source checker passed for this record.
- `git diff --check` passed.
- The Maintainer Guide aggregate passed Markdown source (43 pages), links,
  English prose and SVG ownership (71 displayed, zero orphaned).
- The bilingual aggregate exited 1 for existing missing Korean review receipts
  and stale review fingerprints. This authoring-only change cannot introduce
  those page failures; the human acceptance item remains separate.
- HTTP and live DOM gates were unavailable in this proposal-stage invocation
  because no Copyparty URL was supplied. These are not reported as passes.

The concrete sample and proposed outline are ready for user review. Next action
after shared-understanding confirmation: implement the paired full rewrite and
its synchronized routing artifacts, verify source and served behavior, then
commit before requesting local integration.
