# Replacement foundations: visual explanation design

## Accepted decisions

During the 2026-09-30 grill-with-docs interview, the user accepted all three
recommendations for the paired `0000-replacement-foundations.html` lecture:

- The opening makes the replacement problem immediately apparent. Each later
  view makes one transition understandable; a compact policy comparison follows
  the individual mechanisms.
- Within the existing 20-minute textbook block, participants predict FIFO/LRU
  victims, follow one Clock sweep, and explain OPT's future-knowledge advantage.
  Complete independent tracing remains available for the longer curriculum.
- Presenter-controlled Previous/Next steps keep physical frames in stable
  positions, highlight metadata changes, and explain each step in one sentence.
  Static states remain readable without JavaScript.

These choices preserve the existing audience, bilingual pairing, lecture URLs,
three-hour agenda and full curriculum. This document records design decisions;
the user confirmed the complete design, including the OPT/workload distinction,
and authorized its implementation.

## Accepted teaching sequence

Use one evolving request sequence: the existing `P R P S P R T U P R` trace.
Show page/frame and hit/miss definitions beside the initial scene. Walk from
empty frames through reuse and a full-cache miss, then compare independent
policy runs with their reset clearly indicated.

Teach FIFO beside exact LRU, followed by Clock and then OPT. Keep the core
diagrams visible. Put complete ledgers and additional counterexamples in native
disclosures. Keep each policy's required initial state and the model's clean,
immediately reusable page assumption visible. Preserve the distinction between
metadata movement and page contents, and between the textbook model and CUBRID.

## Accepted OPT and workload explanation

The user requested an explanation connecting theoretical miss minimization,
future knowledge, and workload-specific optimization, using sysbench as an
example. The user accepted this precise wording:

> If we knew the exact future page-request sequence, OPT would minimize misses
> in this fixed-capacity, equal-page-size model by evicting the page whose next
> use is farthest away. A recorded trace lets us calculate that ideal result
> offline. Knowing a workload's pattern, such as a configured sysbench workload,
> can help us tune a replacement policy, but does not by itself reveal the exact
> future page sequence or guarantee an optimal policy. A general-purpose system
> cannot rely on perfect future knowledge, so practical policies use available
> information to estimate what will be useful again.

Here, **recorded request trace** means an ordered sequence of page requests;
**workload profile** means characteristics such as hot-set size and access
distribution. These are explanatory terms for this lecture, not new document
roles in the repository glossary. Avoid calling a tuned profile “optimal”
without establishing the objective, model, and result.

[OSTEP chapter 22, sections 22.2–22.3](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys-policy.pdf)
supports OPT as a minimum-miss offline comparison. The
[sysbench documentation](https://github.com/akopytov/sysbench) describes configurable
random distributions, seeds, and threads; knowing those settings alone does not
establish an exact database page-request trace. The latter distinction is an
inference about the difference between benchmark configuration and page-level
execution, not a measured sysbench result.

## Implementation and verification

The EN/KO pair now exposes prerequisite terms and mechanism diagrams, follows
one request sequence, compares FIFO/LRU through reversible authored request
states, and places Clock before OPT. Full ledgers and further practice remain
available. The workload-knowledge conclusion has its own presentation section.
Existing fragment IDs remain available. Formal human EN/KO review remains
pending in the existing review registry.

Verification on 2026-09-30 used a local Copyparty mount at port 3938 and
headless Chromium through the available Playwright installation:

- `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3938`:
  all source checks passed; HTTP passed for 106 resources and DOM for 43 pages.
- `node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3938`:
  the full gate reports pending human review receipts/fingerprints. Separate
  audience, inventory, navigation, links, technical, language, static and served
  gates passed: 54 pairs, 269 served resources and 109 DOM pages.
- `node --test scripts/replacement-foundations-browser.test.mjs scripts/seminar-contract.test.mjs scripts/seminar-regressions.test.mjs`:
  19 tests passed with the local server configured through `SEMINAR_URL` and
  the available browser module through `PLAYWRIGHT_MODULE`. These include the
  decisive request 3/7 states, backwards/reset controls, keyboard navigation,
  presentation section navigation and no-JavaScript mobile reading.
- `node --test scripts/check-maintainer-guide.test.mjs scripts/check-bilingual-teaching-site.test.mjs`:
  all 45 validator tests passed.
- Existing anchors, original policy tables and exercise ledgers were checked
  against the preceding commit and remain intact; fragment IDs are unique.
- Headless screenshot inspection at 1440 × 900 checked the projected mechanism
  views; mobile checks used 390 × 844. These are layout checks, not participant
  comprehension or human language-review evidence.

The pending human review remains owned by work item 55. No review receipt was
created. This revision adds no benchmark run or runtime performance claim.
