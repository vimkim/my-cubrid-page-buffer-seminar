# Causal replacement lecture verification

Base seminar commit: `954dcac`. Engine source: pinned CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, read from the clean detached worktree
and an exact `git show` export. The [accepted design](replacement-socratic-design.md)
owns scope. No engine changes, new native runs or performance claims were made.

## Content and source review

The paired Lecture 0007 pages now have 24 presentation sections: an opening
scenario, 19 numbered causal questions, one compact call path, and three retained
deeper reference sections. Every original fragment ID remains available.
H1/H2 repeated reads and B's scan connect pool structure, private/shared lists,
admission, aging, reuse, migration, quota, list choice, protected selection and
frame reuse. The old candidate-first opening no longer assumes those concepts.

Checked the affected mechanisms against the pinned source: LRU/BCB structures
and initialization; final-unfix placement and migration predicates; age/hot
checks; quota sampling and thresholds; victim queue selection; bounded selected
list scan and try-lock/recheck; victimization and new mapping preparation.
Representative calls are real functions, and allocation return work is shown
separately from its nested calls. Special unfix branches, disabled AOUT,
VS-19/VS-20 limitations and native experiment boundaries remain explicit.

The first-principles route is now an ordered topic sequence without a duration
cap. Incoming route labels in both languages agree. The curriculum's previous/
next lecture order is unchanged. Authoring guidance and the route glossary record
the change; earlier delivery records are identified as historical.

## Verification results

| Check | Result |
| --- | --- |
| Maintainer aggregate source, links, English prose and SVG ownership | PASS: 43 pages, 63 displayed SVGs, zero orphans |
| Maintainer Copyparty HTTP / live DOM | PASS: 106 resources / 43 pages |
| Bilingual audience, inventory, navigation, links, technical parity, language/accessibility and static gates | PASS: 54 pairs per gate |
| Bilingual Copyparty HTTP / live DOM | PASS: 270 resources / 109 pages |
| Focused EN/KO headless browser inspection | PASS: 54 recorded observations, no detected issues |
| Existing seminar browser suite | 17 pass, 1 pre-existing failure reproduced on main |
| Human translation-review currency | FAIL / pending: missing receipts and stale fingerprints, tracked separately in work item 55 |
| Original Lecture 0007 anchor preservation | PASS: none removed in either language |
| Active route timing remnants and diff whitespace | PASS |

The bilingual aggregate was run in full. Its reported failures were exclusively
translation-review failures (162 messages for the 54 pending pairs). Other gates
were additionally run individually because the aggregate suppresses successful
gate summaries when any gate fails. Automated parity and editorial review do
not supply the human receipts required by ADR 0004.

## Browser inspection

Headless Chromium examined each of the 24 sections in both languages at
1440 × 1000: exactly one section was visible in presentation mode, answers
started collapsed and opened through keyboard activation, and no page-level
horizontal overflow occurred. Previous/next returned between the first two
sections; Escape restored all 24 reading sections without page errors.

At 390 × 844 with JavaScript disabled, all sections remained available and every
answer opened through native disclosure. The topic route retained seven entries
without horizontal overflow. The [recorded observations and content hashes](replacement-socratic-browser-observations.json)
identify the inspected files; these are machine evidence, not a language-review
receipt. Visual inspection covered the private/shared, zone and quota sections.
The [projection capture](replacement-socratic-projection.png) and
[mobile capture](replacement-socratic-mobile.png) retain representative results.
Long opened explanations intentionally scroll; the controls remain available.

## Reproduce the aggregate checks

Serve the repository at a Copyparty URL root without launching a GUI:

```bash
copyparty -i 127.0.0.1 -p 3939 -v .::r --ih -q
```

With Playwright available (this environment used
`/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs` as
`PLAYWRIGHT_MODULE`):

```bash
node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3939
node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3939
SEMINAR_URL=http://127.0.0.1:3939 node --test scripts/seminar-browser.test.mjs
```

Open the paired Lecture 0007 URLs at `?present=1#first-principles` to reproduce
presentation traversal; turn JavaScript off to inspect independent reading.

## Existing regression outside this revision

The test `replacement foundations supports prediction, deliberate steps, and
language transfer` fails at `scripts/seminar-browser.test.mjs:306`: it expects
`#opt` but the existing next target is `#lru`. The same selected test fails on
unchanged main at `954dcac`, served on port 3935. This revision only changes
that foundations page's incoming route label, not its sequence or controls.
No unrelated navigation or test expectation was changed to hide the failure.
