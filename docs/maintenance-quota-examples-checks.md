# Numeric maintenance-quota examples

The [English maintenance chapter](../en/seminar-3/06-maintenance.html#worked-ratio-shift)
and [Korean counterpart](../ko/seminar-3/06-maintenance.html#worked-ratio-shift)
now expose one complete calculation before the formula disclosures. The
[canonical explanation](../advanced/replacement-progress.md#calculate-the-budget-before-dividing-it-among-lists)
owns the maintainer version. Two SVGs show the independent budget/share
calculations and the effect of a quota cap. The original three-epoch example
remains available, and existing screen anchors and contents maps are preserved.

## Arithmetic evidence

Rechecked the clean detached CUBRID source at
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912` on 2026-10-13. The relevant path is
`pgbuf_adjust_quotas()`, `src/storage/page_buffer.c:14318-14501`; constants are
at lines 276, 342, 1073 and 1077. The earlier
[calculation evidence](./maintenance-calculations-evidence.md) retains the
full derivations and uncertainty boundaries.

A temporary C++17 calculation reproduces the source's per-list integer rate
conversion, integer activity smoothing, binary32 ratio smoothing, casts, caps,
zero-activity branch and shared floor. All six expected tuples matched. These
are constructed arithmetic examples, not engine runs or Runtime observations.

| Case | Private budget | Private quotas 1 / 2 | Shared target per list |
| --- | --- | --- | --- |
| Five-second visible walkthrough | 6,250 | 3,906 / 2,343 | 937 |
| 20,000-frame pool, 5,000 cap | 10,000 | 5,000 / 1,000 | 2,500 |
| 6,000-frame pool, half-pool cap | 5,988 | 3,000 / 0 | 50 |
| 10,000 frames, 2,000 invalid | 4,000 | 2,000 / 2,000 | 1,500 |
| Five-second idle interval, old activities 300 / 200 | 2,550 | 1,530 / 1,020 | 1,862 |
| Ten-second idle interval | 0 | 0 / 0 | 2,500 |

The visible walkthrough's two 62.5% values have different denominators:
occupied capacity versus total private activity. Integer truncation leaves one
page of its private budget undistributed. Caps also leave undistributed budget;
the shared calculation still subtracts the original budget. Neither result
predicts resident counts or grants permission to reuse a frame.

## Verification

- Guide aggregate: all 43 Markdown pages, relative links, English prose and
  73 displayed SVGs pass; zero unused assets. Through the local Copyparty root,
  all 116 resources and the live DOM of all 43 pages pass.
- Validator, canonical-ownership and replacement-progress tests: 57 pass.
- Session 3 route, contents and browser tests: 18 pass, with no skipped tests.
- Changed EN/KO pages: reading widths 1,440, 390 and 320 pixels have no document
  overflow; 1,920-pixel presentation entry retains the visible example;
  keyboard disclosure works with and without JavaScript; no page errors.
- Both SVGs render with nonzero dimensions. Browser text bounds fit their
  viewBoxes and containing cards. Screenshots were inspected for both diagrams
  and their placement in the paired pages.
- The bilingual aggregate reports no failures outside its existing human-review
  gate. Maintenance fingerprints are refreshed using its normalized projection,
  and the pair remains pending genuine Korean and semantic review.
- The separate site-wide served browser gate finds the root page's existing
  implicit `/favicon.ico` request returning 404. Served HTML/assets pass for
  all 353 resources; changed maintenance pages pass the focused DOM checks.
  This root-page failure is disclosed rather than counted as a browser pass.

The read-only verification server mounts the task checkout at
`http://127.0.0.1:3938`, with the configured Copyparty Markdown renderer.
Headless Chromium 148 runs through the installed Playwright package using its
full Chromium channel; its separate default headless-shell binary is absent.
Validation logs and screenshots are temporary outputs outside the repository.
