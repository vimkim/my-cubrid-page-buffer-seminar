# Session 3 chapters 03–07 speaker script

Work item 352 implements the selected five-chapter delivery. The Korean presenter companion is [my-presentation-script-session-3-03-07.html](../my-presentation-script-session-3-03-07.html). It follows all 124 current audience screens: 36 in chapter 03, 10 in 04, 29 in 05, 24 in 06 and 25 in 07. Each screen has its exact heading and anchor, a central claim, spoken paragraphs, a visual or control cue, a question, expected answer, misconception note and transition. The opening supplies the omitted prerequisite concepts; the ending closes after chapter 07.

Four new English SVGs show each daemon's data structures and access order. They are displayed in the English/Korean audience pairs and in the Korean script, with Korean spoken diagram explanations:

| Daemon | Audience screen | SVG |
| --- | --- | --- |
| Page-flush | `04-page-flush.html#selection` | `assets/daemon-page-flush-data-structures.svg` |
| Post-flush | `05-post-flush.html#waiter-storage` | `assets/daemon-post-flush-data-structures.svg` |
| Maintenance | `06-maintenance.html#first-code-path` | `assets/daemon-maintenance-data-structures.svg` |
| Flush-control | `07-flush-control.html#token-waiter-wakeup` | `assets/daemon-flush-control-data-structures.svg` |

## Source and editorial review

The source checkout was verified at `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. The author checked the daemon tasks and initialization in `page_buffer.c:16970–17305`, post-flush eligibility and protected receipt in `15420–15665`, conditional completion delegation in `10925–10952`, quota admission and calculation in `14290–14511`, the skipped backup loops in `9615–9642`, token consumption and replacement in `file_io.c:751–929`, and wake-only behavior in `thread_waiter.cpp:77–100,148–156`. The existing audience claims and evidence references supply the remaining screen-level context.

The author reviewed the Korean prose for explicit starting states, the distinction between retained pointers and current identity, old completion versus new dirty work, admission versus policy calculation, and post-write compensation versus durability. The four rendered diagrams were inspected; corrections shortened overflowing node text, repaired a character-by-character SVG generation error, routed linked waiter input into the eligibility check, and explicitly retained the possibility of direct LRU1-to-LRU3 movement. This is AI author review, not a human language-acceptance receipt.

## Verification

The task checkout was mounted read-only at `http://127.0.0.1:8943` using Copyparty. Chromium ran headlessly through `/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs`.

| Check | Result |
| --- | --- |
| `node scripts/check-maintainer-guide.mjs` | PASS: 43 pages, relative links, English prose, 75 displayed SVGs, zero orphans |
| Same aggregate with `--copyparty-url http://127.0.0.1:8943` | PASS: 118 HTTP resources and 43 live-DOM pages |
| `node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:8943` | Technical/source/served checks have no non-human failures. Overall FAIL: 78 missing human Korean review receipts and 104 stale fingerprints; four changed pairs add eight stale fingerprints to the historical 96. No receipts were fabricated. |
| Focused Session 3 suite | PASS: 43 tests, zero failures, zero skips |
| Script coverage and local links | PASS: 124 ordered heading/anchor matches; at least two spoken paragraphs and question/answer/transition on every screen; 523 local links resolve; unique HTML IDs |
| New assets | PASS: four parseable passive English SVGs with `viewBox`, no text outside the viewBox, all eight paired audience images have nonzero natural dimensions |
| Script and changed audience pages | PASS: no horizontal overflow at 1440, 390 and 320 pixels; script readable without JavaScript; native answers available |
| Print | PASS: all 124 screen answers visible in print CSS; A4 preview exported to `/tmp/speaker352-script.pdf` (133 pages), with a retained copy at `/home/vimkim/temp/page-buffer-session-3-03-07-script.pdf` |
| `git diff --check` | PASS |

The focused suite command was:

```sh
PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs \
SEMINAR_URL=http://127.0.0.1:8943 \
node --test scripts/session-3-live.test.mjs scripts/session-3-contents.test.mjs \
  scripts/session-3-definitions.test.mjs scripts/session-3-traces-browser.test.mjs
```

Temporary evidence is under `/tmp/speaker352-*`: aggregate logs, focused test logs, coverage/browser receipt, desktop/mobile screenshots, four SVG screenshots and the print preview. The broad engine experiment proposals remain unexecuted. The existing independently observed waiter result retains its narrow original evidence boundary. No engine source, server configuration, remote publication or deployment was changed.

## Approved integration

Local main advanced to `34c86b6` before the approved rebase. Its five additional chapter-03 screens (`scan-share`, `scan-budget`, `scan-complexity`, `scan-queue-bound`, `scan-elapsed-time`) are retained and now have complete spoken screen entries. The companion covers 124 screens; pool-capacity wording and direct-wakeup explanations also track the integrated source.

Repeated integration verification passed the guide source/HTTP/DOM aggregate, all 43 focused tests, 124 exact screen matches, 523 local links, SVG/image/mobile/no-JavaScript checks and regenerated print preview. The bilingual aggregate has no non-human failures; its overall failure remains limited to 78 missing human receipts and 104 stale fingerprints. Integration logs are `/tmp/speaker352-integration-guide.log`, `/tmp/speaker352-integration-bilingual.log` and `/tmp/speaker352-integration-tests.log`.
