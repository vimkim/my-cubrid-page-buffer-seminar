# Ticket 02: concurrent-use delivery receipt

Content commit: `b88f511612d1b9e6dc9ab762e555980a3ab6f1f7`. Worktree: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-ticket-02`; branch: `docs/seminar-ticket-02`. Exact served root: `http://127.0.0.1:8912`, read-only Copyparty volume rooted at this worktree. HTTP bytes for the EN lecture were compared with the local file before browser checks.

## Route and dependency reconciliation

Entry: `ko/lessons/0004-repay-fix-debt.html#session-concurrency` (paired EN fragment identical). Follow `#session-readers`, `#session-writer`, `#rule`, `#ledgers`, `#predict`, `#simulate`, `#pointers`, `#release`, `#session-release-boundary`. Exit links to `0007-replace-one-frame.html#first-principles`; the next owner's `#admission` is a later focused cue. Full-curriculum previous/next links remain unchanged.

Ticket 01 confirmed A/B execution contexts and H1/H2 page identities. The close-up changes H1 only; it states that H2 remains unchanged. Ticket 03 confirmed per-context final release versus global zero, absence of waiter takeover for the subsequent policy example, and the full replacement entry at `#first-principles`. Global zero is not guaranteed placement, cleaning or eviction. This reconciles the delivered vocabulary contract; root/07 still verifies the integrated route against final upstream commits.

The complete Korean spoken segment is [02-spoken.html](02-spoken.html). It supplies actual explanations, visible starting assumptions, prediction pauses, reveal reasoning, the existing ledger demonstration and the policy transition. Cues correspond to existing or added fragments, and introduce no prior lock-manager requirement. The contribution is an integration fragment, not a second current standalone presenter script.

## Technical evidence

Pinned CUBRID revision: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, inspected in `/home/vimkim/gh/cb/pgbuf-grill` and via `git show` at the pin. No engine files changed.

- `page_buffer.c:6277–6634`, `pgbuf_latch_bcb_upon_fix()`: READ/READ without waiters permits another grant; a nonholder's conflicting WRITE enters the wait path; successful grant establishes holder debt. The writer is a nonholder, so this is not a promotion example.
- `page_buffer.c:6128–6184`, `pgbuf_unlatch_thrd_holder()`: decrements the current holder and removes it at zero.
- `page_buffer.c:6636–6703`, `pgbuf_unlatch_bcb_upon_unfix()`: decrements global count and transitions latch mode at zero. No eviction conclusion follows merely from zero.
- Existing canonical ownership explanation and lecture evidence retained. New schedules are constructed source-consistent examples, not new runtime receipts. No performance or participant-understanding claim was added.

## Verification

- `git diff --check`: PASS.
- `node scripts/check-maintainer-guide.mjs`: PASS for source, all 43 pages, relative links, 64 SVGs and English prose; HTTP/DOM unavailable in the source-only invocation.
- `node scripts/check-bilingual-teaching-site.mjs`: nonzero solely for 160 human-review/fingerprint diagnostics; no other diagnostics. Updated only this pair's computed fingerprints; review remains pending, with no manufactured reviewer receipt.
- `PLAYWRIGHT_MODULE=/tmp/objects-playwright.mjs SEMINAR_URL=http://127.0.0.1:8912 node --test --test-name-pattern=ticket02 scripts/seminar-browser.test.mjs`: PASS, 1 focused test, no skips. Both languages, 1440×1000 presentation and 390×844 no-JavaScript reading; assumptions visible, outcomes initially concealed, Enter opens both answers, section advance reaches writer, exit link intact, no horizontal overflow or page errors.
- Korean reader prediction screenshot at 1440×1000 inspected headlessly: assumptions, numbered actors and closed disclosure fit the projected viewport; presentation controls and full-curriculum navigation remain usable. Screenshot is disposable `/tmp/ticket02-readers.png`.
- `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:8912` with the same Playwright module: source gates and HTTP PASS (107 resources); live DOM FAIL due to a 404 console resource on the Guide entry. A focused fresh-browser diagnostic identified the resource as `/favicon.ico`, outside the changed lecture. This failure is disclosed, not counted as a pass.
- `node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:8912` with the same Playwright module: FAIL on root `index.html` for the same fresh-browser missing favicon. Focused changed-page checks pass, but do not replace this aggregate result.

AC05/AC09 ownership slice is implemented. AC14 has paired semantic review by the agent and current fingerprints; formal human Korean review is pending. AC15 has the full segment and exact cues; final script integration belongs to 07. AC17 focused behavior passes with the aggregate favicon limitation above. AC18 scope and no-publication boundary preserved. AC19 is recorded against the exact content commit and root above. Overall acceptance remains open for the integrated checks and human review.
