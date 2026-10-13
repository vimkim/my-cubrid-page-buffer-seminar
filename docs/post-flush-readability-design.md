# Post-flush chapter readability revision

Work item 343 owns this revision of the paired [English chapter](../en/seminar-3/05-post-flush.html) and [Korean chapter](../ko/seminar-3/05-post-flush.html). The user accepted the outline and bilingual opening on 2026-10-13 through `grill-with-docs`. The starting commit is `d280b55`; local integration targets `main` and requires the repository's separate merge approval.

## Accepted explanation

Participants know basic programming. Explain what remains after successful image submission before explaining queues and thread records. English owns canonical wording, and Korean is the primary live experience. The chapter has two consecutive parts on the same existing URL:

1. Purpose; two distinct waits; one successful actor timeline; a separate flush-waiter completion example; independently reset queue-full, re-dirty and revoked-offer cases; then a recap of completion, notification, offer and protected receipt.
2. The full maintainer analysis: source structures and wakeup ordering, consumer guards and cadence, quota cases, other suppliers, identity/receiving checks, precise removals, coherent alternatives, costs, defense and observation plans. Detailed call listings and cadence policy use native disclosures. Necessary safety qualifications and example premises remain visible.

The opening replaces abstract bookkeeping with concrete actions: clear old `FLUSHING` and wake any flush waiters. Post-flush can also offer a currently eligible frame. Receipt requires a later protected check; removal of the previous identity precedes actual reuse. The full branching visual is a recap after the basic cases, rather than an opening prerequisite. Existing anchors, questions, trace snapshots and source routes remain reachable.

No new domain term or hard-to-reverse architectural decision is introduced. [CONTEXT.md](../CONTEXT.md) remains the vocabulary authority; no parallel glossary or ADR is needed for this reversible editorial revision.

## Source constraints

The exact inspected source is CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` at `/home/vimkim/gh/cb/pgbuf-grill`. These are Verified mechanisms and constructed teaching schedules, not Runtime observations or measured performance improvements.

| Explanation | Required source qualification |
| --- | --- |
| Why a separate daemon exists | The source explicitly describes moving some post-submission work out of page-flush under pressure. Delegation requires the page-flush caller, an existing daemon, an allocator waiter and successful insertion. Otherwise the submitting caller completes locally. [Producer boundary](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10925-L10952). |
| Successful starting state | Clean current page, zero outstanding fixes, no BCB-attached waiters or other blocking flags, shared LRU3, live allocator, available daemon and queue space. Shared LRU3 avoids introducing private quota in the first example. No competing caller changes the frame during this constructed success. |
| Separate flush-waiter example | `pgbuf_is_bcb_fixed_by_any(bcb, true)` conservatively rejects any BCB-attached waiter, including a flush waiter. A successful direct offer and an attached flush waiter cannot be combined in the same consumer pass. [Waiter-aware check](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9274-L9284). |
| Exact completion ordering | Consumer locks, checks current state and may offer. The successful offer's flag update sets DIRECT and clears FLUSHING together. The common tail ensures FLUSHING is clear, wakes flush waiters if present and unlocks. On rejected assignment, that tail still completes the old flush and preserves any new DIRTY state. [Offer and consumer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15429-L15556). |
| Notification and publication | Source signals the allocator before storing its pointer while holding the thread-entry lock. The resumed wait must reacquire that lock. The basic actor timeline groups these as a protected offer/wake event; the deeper explanation retains the exact order. |
| Receipt and reuse | Receiver takes the pointer, locks the BCB, rejects revocation and rechecks eligibility. On success it removes list membership and returns still locked. Later victimization removes the old lookup identity before the new claim. [Receipt](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15598-L15660), [victimization call](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8369-L8399), [new identity](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8480-L8486). |
| Submission and durability | Successful submission is not a universal home-volume durability certificate. DWB may accept into staging before home writes. Post-flush starts no new page write. The opening retains this qualification. |

## Applied structure and local definitions

There are 28 screens: twelve first-pass screens followed by sixteen maintainer-analysis screens. All 22 original section anchors remain; six new screens add the missing conceptual bridge. All four original interactive traces and Q09, Q10, Q11 and D27 remain. Their independent resets, answers and final snapshots are preserved.

| New screen | Visible local premises and terms |
| --- | --- |
| `handoff-map` | Recap diagram with local frame/BCB, allocator, fix, LRU3, quota, WAL and DWB definitions before the image. No accumulated scenario state is implied. |
| `two-waits` | Frame, BCB, flush waiter, allocator, mutex and three distinct storage roles. Attached-waiter exclusion is stated before the successful example. |
| `successful-submission` | P is the current database page; BCB controls its frame. Clean, fix protection, absence of waiters/other flags, shared LRU3, allocator waiting, daemon existence and queue space are stated before actions. |
| `successful-offer` | Continues the same success but repeats P, BCB, outstanding FLUSHING, current eligibility and allocator premises for direct entry. The actual flag-update ordering remains visible. |
| `successful-receipt` | Continues the offer with P defined locally, clean/unfixed current state, no new waiter or revocation, and BCB unlocked. Victimization is explained before claiming a new identity. |
| `flush-waiter-completion` | Independent reset; P, frame/BCB, queued FLUSHING, cold shared page and both waiter roles are restated. The attached flush waiter blocks offering but not old completion. |

P is already registered in [the teaching-label registry](session-3-teaching-labels.json). G/G+1 first appear when the separate examples need copied-versus-current bytes; they remain reasoning labels, never claimed as stored counters. Existing notation and reset details remain in [the readability ledger](session-3-readability-review.md).

The root and paired contents maps, chapter navigation and exact Korean spoken map follow the actual new chapter order and headings. The spoken post-flush block mirrors the same first-pass cases before its deeper explanation. Paired-page fingerprints are recomputed by the established validator. Human Korean-language and semantic acceptance stays pending; no review receipt is manufactured.

## Verification

Checks ran from `/home/vimkim/gh/my-cubrid-page-buffer-seminar-post-flush-readability` against the read-only loopback Copyparty root `http://127.0.0.1:8993`, with headless Chromium supplied by the existing Playwright installation. Retained logs and integrity/projection receipts are in `/tmp/post-flush-checks.9sbzzP`.

| Check | Result |
| --- | --- |
| Maintainer Guide aggregate, including served checks | PASS: 43 Markdown pages, relative links, 71 displayed SVGs with zero orphans, English prose, 114 HTTP resources and 43 live-DOM pages. |
| Bilingual source checks | No technical failure. Source parity passes all 78 pairs; Session 3 route/definitions/contents pass all 27 dedicated pages; the audience contract passes all 78 pairs. The full aggregate retains its existing nonzero human-review result: 78 missing Korean receipts and 96 stale historical fingerprints. Both changed pairs have current validator-computed fingerprints and pending review. |
| Bilingual served gate | PASS: 351 HTTP resources and 158 live-DOM pages; no unavailable gate. |
| Focused Session 3 tests | PASS: 31 tests, zero failures or skips. Definitions, complete contents maps, reading/projection, 390px and 320px responsive widths, native answers, keyboard traversal, all existing trace outcomes/resets, no-JavaScript access and the full Korean spoken map are covered. |
| Retained chapter material | All 35 original IDs, all 33 pinned GitHub source URLs and Q09/Q10/Q11/D27 remain in each language. The four original trace-step sequences are byte-for-byte unchanged. Spoken material outside the post-flush block is byte-for-byte unchanged. |
| Focused projection inspection | Sixteen EN/KO views of the opening, waits, success, waiter completion and recap were checked at 1920px, with zero horizontal overflow or page/console errors. Korean opening, offer, event table and map screenshots were inspected. The full branching map remains vertically scrollable at the unchanged diagram/type size; its event table is now a separate screen. |
| Author documents and diff | Copyparty Markdown source checks and relative-file closure pass for this record and the supplemented readability ledger. `git diff --check` passes. |

The successful timeline, attached-waiter exclusion, flag-update order and later identity removal were checked against the exact source before authoring. Checks do not establish participant understanding, human translation acceptance, runtime concurrency outcomes or a measured performance benefit. No engine change, benchmark, native runtime experiment, push or deployment is included.
