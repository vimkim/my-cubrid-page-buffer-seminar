# Replacement comparison clarity

## Agreed direction

The user requested a more reader- and listener-friendly Lecture 18A, including
an explicit conclusion and advantages and disadvantages relative to CUBRID.
The grill-with-docs interview accepted these recommendations:

- Briefly recap CUBRID private/shared lists and three zones; introduce PostgreSQL
  and InnoDB without assuming knowledge of their internals.
- Expand the explanation beyond the existing 15-minute comparison allocation.
  A revised total presentation duration has not been specified.
- Explain workload-dependent structural benefits and costs relative to CUBRID.
  Separate possible improvement hypotheses from established behavior and avoid
  unmeasured performance rankings.

Revise the English and Korean pair together, preserving established URLs and
anchors. Source pins and evidence ownership remain unchanged.

## Confirmed page structure

1. Introduce a recurring hot working set interrupted by a one-pass scan.
2. Recap CUBRID's domains, zones, and distinction between candidate preference
   and safe frame reuse.
3. Explain PostgreSQL usage credit, access, clock aging, candidate selection,
   and strategy rings through a small constructed example.
4. Explain InnoDB old/young regions, admission, qualifying later access,
   promotion, and tail selection through the same workload story.
5. Compare each alternative directly with CUBRID: remembered information,
   bookkeeping, scan protection, candidate search, and dirty-page progress.
6. Conclude with what each engine protects, what the design costs, and what
   evidence would be needed before borrowing a mechanism for CUBRID.

Core causal explanations and diagrams stay visible in reading and presentation
modes. Source details use native disclosures. Constructed examples illustrate
mechanisms without claiming benchmark or runtime evidence.

The factual audit found that current candidate traces precede their conceptual
introductions, later sections repeat some coverage, the existing diagram is a
dense matrix, and the page lacks explicit tradeoffs and conclusion sections.
The revision should reorganize this material rather than merely append text.

## Implementation status

The user confirmed the complete structure and authorized implementation.
Work item: 237. Both language versions now implement this structure.

After integration with main, the first-principles route is untimed, as established
by the replacement lecture revision. The expanded Lecture 18A fits that route;
the superseded 15-minute timing disclosure is removed. No fixed total duration
is claimed. No new glossary role or architectural decision
is needed: the existing audience, presentation and evidence vocabulary applies.


## Source review

A read-only source audit verified the constructed transitions at the existing
CUBRID, PostgreSQL and MySQL pins in the canonical comparison reference.
PostgreSQL credit increases assume fully released previous pins, the default
strategy and no intervening aging. Decrementing credit from one to zero does
not claim the frame on that visit. Ring reuse rejects pinned frames and credit
above one. InnoDB's timeline requires an ordinary priority-updating access,
continued old-region residency and an active eviction clock; specialized SCAN
and PEEK_IF_IN_POOL fetch modes bypass younging. CUBRID examples describe
ordinary final-unfix transitions, not every access or specialized caller.

The added terms explain general database mechanisms locally; they do not add
new document roles to CONTEXT.md. No architecture decision or ADR was needed.

## Verification

Verification used the task worktree mounted at the root of a local Copyparty
server, `http://127.0.0.1:3940`, and headless Chromium. No GUI was launched.

- The maintainer aggregate passed for 43 Markdown pages, relative links,
  63 displayed SVGs with no orphans, English prose, 106 HTTP resources and
  43 rendered pages.
- Bilingual audience, inventory, navigation, links, technical parity, language
  and static-behavior gates passed for 54 pairs. The full aggregate reported
  only the existing review-receipt/fingerprint gate: 162 diagnostics across
  54 pending pairs. No human receipt was manufactured.
- The separate bilingual served gate passed for 270 HTTP resources and
  109 rendered pages.
- Focused EN/KO browser checks passed for presentation next/previous navigation,
  keyboard-operated native disclosures, 390 × 844 mobile width, complete
  no-JavaScript reading, unique IDs and absence of JavaScript page errors.
  All preceding fragment targets remain present.
- Screenshot inspection covered the PostgreSQL introduction, InnoDB timeline,
  conclusion and mobile reading. The initial PostgreSQL section was split into
  terminology and credit-transition sections to reduce projection density.
- `git diff --check` passed. Validator code and shared presentation behavior
  were not modified, so validator unit suites were not rerun.

Commands:

```sh
node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3940
node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3940
node scripts/check-bilingual-teaching-site.mjs --gate served --copyparty-url http://127.0.0.1:3940
```

`PLAYWRIGHT_MODULE` selected the available Playwright package under
`/home/vimkim/.cache/uv/archive-v0/4O6KYEhbJwMgh8m4qcuPa/playwright/driver/package/index.mjs`,
which matches installed Chromium headless-shell revision 1234. Formal human
Korean-naturalness and bilingual semantic acceptance remains pending under
work item 55. This change provides no cross-engine benchmark or participant
comprehension evidence.


## Approved rebase integration

The user approved rebasing and fast-forward merging. Main had independently
replaced the three-hour agenda with an untimed first-principles route. Conflict
resolution preserves that complete route, retains the approved comparison
lecture, and changes its route-link label to match. The route now describes the
expanded comparison without reinstating the obsolete timing table.
