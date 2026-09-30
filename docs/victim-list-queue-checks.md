# Victim-list queue explanation and verification

Date: 2026-09-30. Work item: 246. Review branch: `docs/victim-list-queues`.
The task worktree is `/home/vimkim/gh/my-cubrid-page-buffer-seminar-victim-queues`,
created from documentation commit `ce22e02`. No integration merge or push is part
of this change. Engine source was read from the clean detached worktree at
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.

## Delivered explanation

Lecture 0007 now names all three `pgbuf_Pool` list-index queues and explains
publication, `consume`, requeue, registration flags, capacity rounding, and
removal tradeoffs in English and Korean. The three SVGs show full LRU indices
32 and 0, shared candidate registration, and a stale private index after
own-list detach. They are constructed source traces, not runtime captures.
The English Markdown guide owns the canonical lifecycle; the Korean presenter
script links to the participant figures.

The source correction matters independently of the diagrams: ordinary-private
consumption can feed the big-private queue. The former no-initial-producer
claim missed that branch. VS-19 and its current teaching references now reflect
this correction. Historical evidence and previously recorded checks are left
as historical records. Empty big queues in constructed examples remain explicit
starting assumptions, not consequences of the rejected source claim.

The visual roster was extended for the new assets. Verification also exposed a
pre-existing missing roster entry for `pool-arrays-and-lru-recap.svg` and an
obsolete hard-coded asset count. The ownership test now compares the exact set
of guide-displayed images with the canonical roster, while the aggregate
validator continues to enforce ownership and usage of seminar-only images.

## Commands and results

The read-only Copyparty instance used the exact task worktree as URL root:

```sh
copyparty -i 127.0.0.1 -p 8926 -v .::r --ih -q
```

Browser commands used the following environment. All browsers were headless.

```sh
export PLAYWRIGHT_MODULE=/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs
export SEMINAR_URL=http://127.0.0.1:8926
```

| Check | Result |
| --- | --- |
| `node scripts/check-maintainer-guide.mjs` | PASS: 43 Markdown pages, links, English prose, 69 displayed SVGs, no orphaned assets. |
| `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:8926` | PASS: source gates, 112 HTTP resources, 43 live-DOM pages. |
| `node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:8926` | Exit 1 solely for 148 existing human-review/fingerprint diagnostics described below; no other diagnostics. |
| `node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:8926` | PASS: 281 HTTP resources, 109 live-DOM pages. |
| Validator, canonical ownership, completion, replacement, and seminar regression tests | 68 passed, zero failed/skipped. |
| Replacement-progress and compact-reference tests | 9 passed, zero failed/skipped. |
| Seminar browser suite plus focused victim-queue browser suite | 36 passed, zero failed/skipped. |
| SVG visual inspection and text bounds | All three rendered images inspected; no text outside the viewBox. |
| `git diff --check` | PASS. |

The exact source-test command was:

```sh
node --test scripts/check-maintainer-guide.test.mjs \
  scripts/check-bilingual-teaching-site.test.mjs \
  scripts/check-canonical-ownership.test.mjs \
  scripts/check-document-set-completion.test.mjs \
  scripts/check-replace-one-frame.test.mjs \
  scripts/seminar-regressions.test.mjs
node --test scripts/check-replacement-progress.test.mjs \
  scripts/check-compact-references.test.mjs
node --test scripts/seminar-browser.test.mjs scripts/victim-queue-browser.test.mjs
```

The focused browser suite checks both languages at 1440 × 1000 in reading and
presentation modes, and at 390 × 844 with JavaScript disabled. It verifies image
loading, section visibility, no page-level horizontal overflow, keyboard answer
disclosure, presentation next/back navigation, and SVG text bounds. Figures link
to their full-size SVGs; prose and localized alternative text explain them
without requiring a color distinction.

## Explicit limits

Human review remains pending for all 54 page pairs. The aggregate's 148 review
diagnostics consist of 54 missing human-review receipts and 94 stale/missing
fingerprints on other content. Current fingerprints were recorded for the three
changed page pairs without inventing a reviewer or marking them reviewed.
The full aggregate diagnostics were compared with the review-only output and
matched exactly. This is not a full bilingual acceptance pass. Work item 55
continues to own human review.

No engine changes, runtime victimization experiment, throughput measurement, or
fairness proof was performed. Queue-removal consequences are labeled inference.

## Content fingerprints

These SHA-256 values identify the delivered main pages and SVGs independently
of the later commit that includes this receipt.

- `en/lessons/0007-replace-one-frame.html`: `04a3c287029881b5b30163c830e0b2bfe6084dcf03a5f06e73058d5705b721e7`
- `ko/lessons/0007-replace-one-frame.html`: `6abdc1237a6232a972b018e52a9997f82f6dffcb1867a43700b886b84c673747`
- `assets/victim-list-queue-map.svg`: `20094781b6c64b865ae216f1e7bcd47a7091b009776ef3aefda015301e17634c`
- `assets/shared-victim-queue-registration.svg`: `65bc997e6b4f9ee09a50fd219b49c9dcb90851d2d66a1f7453c34c4b85e6f3a6`
- `assets/private-victim-queue-stale-index.svg`: `f00f811d7950f405172566723fb3028dd929ae2df1f29b60df5b12adc4f3fa4d`

## Rebase and integration verification

On 2026-09-30 the user requested rebase and fast-forward integration. The queue
change was rebased onto `main` at `6fc2cf3`, preserving the newer 3,000-visit
explanation and title changes. The only conflict was the Lecture 0007 review
fingerprint row; both hashes were regenerated from the combined HTML, with
human review still pending. Older archived history was already represented in
main, so only the queue task commit was replayed.

After rebase, canonical-ownership, replacement, seminar-regression, seminar-browser,
and victim-queue-browser suites passed all 52 tests. The guide aggregate passed
43 Markdown pages, 69 SVGs, 112 HTTP resources, and 43 live-DOM pages. The full
bilingual aggregate reported only 150 existing review diagnostics (54 missing
human receipts and 96 stale fingerprints, including upstream title changes);
no technical, link, HTTP, or DOM diagnostics occurred. Lecture 0007's fingerprints
are current. The earlier fingerprint list above identifies the pre-rebase
content; the combined lecture hashes are:

- `en/lessons/0007-replace-one-frame.html`: `4abff07aefad85c48760e2cc91a7757e954ca3fb43fb6983b9e71c1fd5a7ddcd`
- `ko/lessons/0007-replace-one-frame.html`: `100ddc8c4fb6092ec2f4b771b1bce4a61f94cf836ae9e6ecc2c5f3b50c6c8f90`
