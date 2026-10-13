# Post-flush explanation for first-time readers

Work item 349 records the user-invoked `implement` refinement of the paired
[Korean chapter](../ko/seminar-3/05-post-flush.html) and
[English chapter](../en/seminar-3/05-post-flush.html). The immutable starting
commit is `1d133309c18cab7694ca4c000cec499468d31a31`, which already includes the
[previous readability revision](post-flush-readability-design.md). The task
checkout is `/home/vimkim/gh/my-cubrid-page-buffer-seminar-post-flush-simple`,
branch `docs/post-flush-simple`. Local integration targets `main` and requires
the repository's merge approval.

## Requested outcome

The user requested a complete rewrite for adults who know basic programming
but are new to page buffers and flush. Explain in small steps and natural,
simple Korean without a childish voice. Preserve technical accuracy and align
English meaning and explanation order.

The central question is why a successful page-write call does not immediately
give another request its memory slot. The requested explanation must:

- Start with one page and one memory slot, the earlier user's changes, the
  successful copy write, and another request needing the slot.
- Explain roles before introducing names such as BCB, FLUSHING, and allocator.
- Distinguish write success, completion handling, current checks, an offer,
  and protected receipt; explain why each preceding result is insufficient.
- Separate flush waiters from frame waiters; identify the queue payload as a
  BCB pointer and state that post-flush starts no new page write.
- Complete the normal example before separately resetting queue-full,
  later-change, and intervening-reader cases.
- Explain events, reasons, actions, results, and remaining limits in short
  sentences with concrete subjects. Keep critical qualifications visible.
- Place source and policy detail after the basic explanation in native
  disclosures, while preserving established URLs, anchors and modes.
- Verify implementation claims against pinned source, run required checks,
  and commit the result.

## Applied explanation and source boundaries

The chapter contains 30 screens. The normal path introduces the page and frame
before the control record. A separate queue-handoff screen introduces post-flush
and the pointer payload. A plain later-change screen precedes the detailed
generation trace. Queue-full and generation traces move after the basic recap.
All former IDs, question IDs, source routes and four trace snapshots remain.

The ordering is deliberately faithful to source: post-flush checks current
state before its common completion tail. Successful assignment sets DIRECT and
clears FLUSHING together; rejected assignment still reaches completion. The
conceptual distinctions are not presented as a fictional sequence of five
separate source calls. Protected receipt precedes removal of the old lookup
identity in the allocation path.

Source was inspected in the clean detached `pgbuf-grill` checkout at CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. Producer conditions and direct
completion are at `page_buffer.c:10925–10952`; offer, common completion,
waiter selection and protected receipt are at `15429–15660`. The pinned source
is authoritative; constructed schedules are not runtime observations or
performance measurements. The DWB/home-volume qualification, attached-waiter
exclusion, preserved new DIRTY work, revocable offer and VS-20 limitation remain
explicit. No engine code or implementation policy changes.

## Definition and reset review

| Screen or group | Visible prerequisites and case boundary |
| --- | --- |
| `workload` | P is one database page in one frame; flush sends changed contents to the write path. No control-record or generation notation is needed first. |
| `two-waits` | BCB controls a frame; FLUSHING records unfinished completion; threads, flush waiters and allocator roles are introduced before the table. |
| `successful-submission` through `successful-receipt` | Each screen locally defines P and restates the relevant pending work. The same normal example continues without competing state changes. Current use, waiters, flags and policy premises are visible before offering. Exact shared-LRU3 policy is expandable. |
| `flush-waiter-completion` | Independent reset; the attached flush waiter blocks offering while completion still finishes. |
| `handoff-part-2`, `redirty-case`, `post-part-3` | Three separate resets after the completed normal path; queue insertion failure, later dirty work/current use, and a new reader between offer and receipt are separated. P and reader/allocator names are defined locally. |
| `handoff` and `handoff-map` | A comparison table, not a combined schedule; full branching diagram is an optional recap with its terms visible before it. |
| Four trace screens | Local actor/state definitions precede controls and generated status. G/G+1 remain explanatory labels rather than stored counters. Policy and revocation branches explicitly reset independently. |
| Later maintainer screens | List, wait and source mechanics retain their safety limits. Cost variables are defined visibly; formulas and implementation policy are expandable. VS-20 names an uncertainty-registry entry, not proven starvation. |

The authored-label registry adds VS-20 for this pair. Other labels remain
registered and visibly defined in their own screens. Contents maps, the chapter
menu, and the Korean spoken screen map follow actual order and headings.

Agent editorial reading checks Korean phrasing and paired meaning. It does not
provide the human Korean-language acceptance required by ADR 0004. Updated
fingerprints record current content and keep human review pending.

## Verification record

The untouched baseline's bilingual aggregate reported 174 pre-existing
human-review messages: 78 missing receipts and 96 stale historical
fingerprints. Task verification must distinguish these from new failures.
Final check and review results are recorded after execution.

Checks use the read-only Copyparty root `http://127.0.0.1:8996` serving this
exact task checkout, with headless Chromium 151 through the existing
Playwright-core 1.62.1 installation. Logs and visual previews are retained as
`/tmp/post-flush-simple-*`. An initial Playwright 1.60 module expected an absent
headless-shell revision; selecting the already installed matching runtime
resolved that environment failure without changing repository tooling.

| Check | Result |
| --- | --- |
| Maintainer Guide aggregate | PASS: 43 Markdown pages, links, 71 displayed SVGs with no orphans, English prose, 114 HTTP resources and 43 live-DOM pages. |
| Bilingual aggregate | No new failure: all 174 final failure messages equal the baseline set exactly. The nonzero result remains the pre-existing human-review gate, not a technical pass for that gate. |
| Bilingual served gate | PASS: all 351 HTTP resources and 158 live-DOM pages; no unavailable gate. |
| Complete repository test suite | PASS: 262 tests, zero failures, skips or cancellations. Covers both validators and reading, projection, narrow widths, native answers, direct anchors, trace outcomes/reset, no-JavaScript access and complete contents/spoken maps. |
| Integrity comparison | All 37 prior DOM IDs, four question IDs and 45 pinned source URLs retained in each language; all four traces retain their exact snapshot values. |
| Author Markdown and diff | Both changed author documents pass the Copyparty Markdown source checker; `git diff --check` passes. |
| Visual inspection | Korean opening, current-check/offer and recap projection previews inspected. The 390px reading view has no horizontal overflow or page runtime error. This is agent inspection, not human acceptance. |

Human Korean and semantic-parity acceptance remain pending.

## Standards

Independent read-only review compared `1d133309...4193228`.

0 actionable Standards findings; no hard violations or baseline smells identified.

The paired chapter explains roles before symbols, preserves the normal-path
premises, and explicitly resets the later cases. Required qualifications remain
visible: write success does not establish final durability, attached flush
waiters block an offer, later dirty work survives completion, and offers remain
revocable.

The source-order explanation matches the pinned consumer and receiver paths:
current checks precede the common completion tail; successful assignment sets
DIRECT and clears FLUSHING together; protected receipt precedes old-identity
removal. Korean and English preserve these distinctions and explanation order.

The presenter material, route labels, and author records remain consistent with
the rewrite. Verification records disclose pending human acceptance and
distinguish the unchanged human-review failures from passing technical gates;
no fabricated receipt or false acceptance claim appears.

## Spec

Independent read-only review compared `1d133309...4193228`.

0 actionable Spec findings: no missing requirements, incorrect implementations,
or unrequested scope changes found.

The paired chapters satisfy the requested outcome: one page/frame story,
gradual definitions, a completed normal path, two waiter roles, explicit
BCB-pointer handoff, and independently reset queue-full, later-change, and
reader cases. Detailed source and policy explanations follow the basic recap;
necessary safety qualifications remain visible.

Pinned-source review confirms current guards precede common completion,
successful assignment sets the offer marker and clears FLUSHING together,
rejection still completes the earlier flush without clearing new DIRTY work,
and protected receipt precedes old-identity removal.

Independent comparison confirms preservation of prior anchors, all 45 pinned
source URLs per language, and snapshot values for all four traces. Navigation,
presentation controls, and spoken cues remain aligned. Human Korean-language
and semantic acceptance remain explicitly pending; no receipt is claimed.

Standards: 0 findings. Spec: 0 findings. No unresolved issue within either axis.
The final record clarifies the integrity count as 37 DOM IDs plus four question
IDs, rather than grouping the 41 identifiers under one ambiguous label. This
changes the audit description only.
