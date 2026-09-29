# Direct-victim queue policy seminar integration

Integrated the 2026-09-30 starvation-audit handoff into the paired Lecture 12
pages, based on seminar `cd583e7`. The helper investigation remains on
`docs/starvation-audit` at `9725d77`; this change does not merge that repository.

## Scope and evidence

Lecture 12 now connects high-priority retry after the first invalidated assignment
with low-first selection on every fourth shared selection-function call. Its new
`waiter-priority` anchor is linked from both existing worked examples, preserving
their constructed schedules. It distinguishes selection, assignment and successful
receipt, and explains why neither priority nor a renewed wait deadline bounds
request completion. The wider direct-victim/VOID work and presenter helper notes
are outside this focused integration.

Checked CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` with `git show`:
`src/storage/page_buffer.c:8250–8325` (registration/deadline/retry),
`15420–15560` (assignment and producer eligibility), and `15565–15651`
(shared counter, queue order and protected receipt). The existing
[first-principles audit](../reference/replacement-policy-first-principles-audit.md)
retains detailed policy provenance. No engine change, starvation reproduction or
performance experiment is claimed. Exclusive reservation remains a hypothetical
alternative, not an implemented mechanism; this addition does not introduce it
as current behavior or use the VS-20 maintenance backup as a progress guarantee.

## Verification

The task worktree was mounted at the Copyparty URL root on loopback port 3941.
Headless Chromium used Playwright from
`/home/vimkim/.cache/uv/archive-v0/4O6KYEhbJwMgh8m4qcuPa/playwright/driver/package/index.mjs`
through `PLAYWRIGHT_MODULE`.

- `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3941`:
  PASS for 43 Markdown pages, links, English prose, 63 displayed SVGs with zero
  orphans, 106 HTTP resources and 43 live-DOM pages.
- `node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3941`:
  overall FAIL solely for pending human Korean review receipts and review
  fingerprints. No failures from inventory, navigation, links, technical parity,
  language/accessibility, static interaction, audience, HTTP or live-DOM checks.
  The manifest remains pending; automated checks do not create review receipts.
- Focused headless checks on the changed Lecture 12 pair: PASS at widths 390 and
  1440, with JavaScript on and off; native source disclosures open, no horizontal
  document overflow or page exceptions. With JavaScript, the new anchor is
  reachable in presentation mode. Korean presentation screenshot inspected.
- The first ad hoc browser probe hit an action-stability timeout with JavaScript
  disabled; a later probe incorrectly assumed presentation entry would retain
  the reading section after scrolling. The completed probe uses native forced
  clicks and explicit presentation hash navigation; it does not claim to verify
  reading-to-presentation scroll-position preservation.
- `git diff --check`: PASS. No validator code changed.

Human language acceptance remains separate (existing work item 55). No merge,
push or deployment is included.

## Follow-up: cumulative wait, reservation cost and candidate supply

The subsequent discussion is integrated into the same EN/KO Lecture 12 pair.
The existing `waiter-priority` explanation remains the owner of the verified
high/low selection rules; three following sections extend its reasoning:

- `reservation-cost`: a separate P/Q/F example distinguishes assignment from
  eviction, delayed resident access from a later miss, and a buffer miss from
  physical-device I/O. A link beside the existing direct-handoff worked example
  reaches this explanation without rewriting that example's constructed schedule.
- `cumulative-wait`: a hypothetical threshold preserves the original allocation
  wait start across retries, includes scheduling/mutex/revocation delay after
  wakeup, and separates the subsequent requested-page read. Resetting the clock
  can hide unbounded cumulative delay. Neither a threshold value nor a measured
  performance benefit is claimed.
- `no-eligible-frame`: existing fixes cannot be overridden by priority or a
  reservation. Candidate supply and execution assumptions remain necessary.
  A disclosure distinguishes starvation from a constructed resource dependency
  cycle; all-fixed state alone is not evidence of deadlock. This was an unanswered
  discussion extension, not evidence of participant mastery or a reproduced bug.

The new design discussion explicitly remains hypothetical. Rechecked the pinned
allocator's retry/deadline path at `page_buffer.c:8250–8330`; no new runtime or
engine-behavior claim is added to the canonical Markdown guide.

Validation for this revision used the task worktree served at
`http://127.0.0.1:3942`, with the same headless Playwright module listed above:

- Maintainer aggregate: PASS, including 43 Markdown pages, 63 displayed SVGs,
  106 HTTP resources and 43 live-DOM pages.
- Bilingual aggregate: FAIL only for missing human review receipts and stale
  review fingerprints. No other failure was reported. Human review remains open.
- Focused EN/KO browser probe: PASS across all eight combinations of language,
  widths 390/1440, and JavaScript enabled/disabled. All three new disclosures
  open; no document overflow or page exceptions. With JavaScript, each new
  section is reachable using its presentation-mode URL anchor.
- `git diff --check`: PASS. Validation code was unchanged.

The preview server was stopped after verification. No merge, push or deployment
is included; the existing task branch is retained for review.
