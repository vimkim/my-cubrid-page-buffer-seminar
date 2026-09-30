# LRU lesson coverage audit

Seminar base: `5e1c02f`. Source: clean detached CUBRID worktree
`/home/vimkim/gh/cb/pgbuf-grill`, verified HEAD
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.
This audit implements the ten-item LRU handoff dated 2026-09-30.
Examples are constructed source traces, not new runtime observations.

## Coverage and disposition

Each EN/KO pair was read for its explanation and qualifications, not merely
searched for keywords. Existing adequate explanations remain in place.

| Item | Assessment at the base | Final location and action |
| --- | --- | --- |
| 1. Merge LRU1/LRU2 and move every reuse to front | Sufficient: equal capacity, keep versus move policies, admission and synchronization costs, no optimality claim | Retained Lecture 0007 `zones`: [EN](../en/lessons/0007-replace-one-frame.html#zones), [KO](../ko/lessons/0007-replace-one-frame.html#zones). |
| 2. Ordinary final-unfix zone rules and exceptions | Sufficient: zero crossing, special paths and migration precede keep/conditional boost/boost | Retained Lecture 0007 `admission` and `reuse`, and Lecture 0012 `lru-conditional-movement`: [EN](../en/lessons/0012-prove-replacement-progress.html#lru-conditional-movement), [KO](../ko/lessons/0012-prove-replacement-progress.html#lru-conditional-movement). Softened the short-repeat table label to avoid implying universal rejection. |
| 3. Age, hotness, activity and sampling epochs | Correct but distributed; field-to-decision comparison was missing from the self-contained lecture | Added the three-measurement table in Lecture 0007 `reuse-age`: [EN](../en/lessons/0007-replace-one-frame.html#reuse-age), [KO](../ko/lessons/0007-replace-one-frame.html#reuse-age). Existing Lecture 0012B `activity` retains the sampling details. |
| 4. Half the current LRU2 count | Incomplete: lacked integer division, variable population and limits of the short-gap rationale | Added numeric cases, no optimality claim, cyclic-counter scope and distinctions from time, distinct accesses and physical position in `reuse-age`. |
| 5. Boost preserves saved tick | Missing from lessons; the reference's “other list-position events” wording was too strong | Added 100/150 → 100/151 example and explicit non-reset on boost/demotion in `reuse-age`; added the canonical guide explanation and corrected the reference's “other” wording. Lecture 0012 links to the example. |
| 6. Quota target, caps, 5% thresholds and queue advertisement | Target, caps and thresholds sufficient; queue connection needed to be explicit | Retained formulas and added over-quota plus candidate-count advertisement in Lecture 0007 `quota`: [EN](../en/lessons/0007-replace-one-frame.html#quota), [KO](../ko/lessons/0007-replace-one-frame.html#quota). Advertisement does not reserve a victim. |
| 7. Private-index assignment | Sufficient: zero-session/fewest-page priority, activity fallback, reuse by sessions, not per fix | Retained Lecture 0012B `assignment`: [EN](../en/lessons/0012b-understand-private-lru-index.html#assignment), [KO](../ko/lessons/0012b-understand-private-lru-index.html#assignment). No duplicate added. |
| 8. LRU1 overflow after LRU2 promotion | General aging present; exact promotion/boundary example missing | Added positive-threshold 2/2 → 3/1 → 2/2 example in Lecture 0007 `boost-boundary`: [EN](../en/lessons/0007-replace-one-frame.html#boost-boundary), [KO](../ko/lessons/0007-replace-one-frame.html#boost-boundary). One linked list; demotion changes metadata without relinking S1. |
| 9. Mutex scope and demoted BCB flags | Missing as an explicit worked protocol | Added caller-held H1 BCB mutex, continuous list mutex across remove/insert/adjust/sanity, unlocked adjustment helper, CAS flags and no separate S1 BCB lock in `boost-boundary`. Distinguishes LRU2 boost from LRU3 adjustment and states `min_one` scope. |
| 10. Private/shared rules and hypothetical AOUT | Active/dormant admission table sufficient; concrete expected trade-offs and revival tasks too terse | Retained Lecture 0007 `admission` comparison. Extended Lecture 0012A `effect` and `boundary`: [EN](../en/lessons/0012a-understand-aout-ghost-history.html#effect), [KO](../ko/lessons/0012a-understand-aout-ghost-history.html#effect). Added same-domain ghost-hit/miss example, history expiration/index reuse limits, and concurrency/memory/policy/measurement tasks. Forced-zero behavior and unknown historical root cause remain explicit. |

## Source verification

All ranges below refer to `src/storage/page_buffer.c` at the pinned engine
commit, unless another file is named.

| Claim | Checked range |
| --- | --- |
| Age expression and wrap | 1052–1058 |
| Final-unfix precedence and zone decisions | 6636–6844 |
| AOUT on/off admission and migration predicate | 6885–7038 |
| Tick increments and boundary movement | 9695–9830, 9890–9933 |
| Boost's lock scope and saved-tick assignments in new-membership helpers | 10123–10301 |
| Quota allocation, caps, thresholds and candidate queues | 14400–14501 |
| Private assignment and release | 14519–14625 |
| Zone/index CAS and counters | 15889–15985 |
| Hot-fix heuristic and activity epoch gate | 16335–16367, 16594–16610 |
| Dormant AOUT capacity, FIFO/hash and free nodes | 5802–5903, 10468–10636 |
| Forced-zero AOUT tuning | `src/base/system_parameter.c:9975–9987` |

The canonical addition is
[Saved ticks and a protected boost](../advanced/replacement-progress.md#saved-ticks-and-a-protected-boost).
The [existing field audit](../reference/private-lru-domain-hit-age-and-unfix-placement.md)
links there instead of creating a second detailed guide explanation.
Historical AOUT status remains owned by
[the existing source/history audit](../reference/victim-scan-cap-and-aout-evidence.md)
and [uncertainty registry](../unresolved-or-version-sensitive-findings.md).

## Verification

The task worktree was served at `http://127.0.0.1:3941`, with headless Chromium
through `/home/vimkim/temp/volmap/web/node_modules/@playwright/test/index.mjs`.

| Check | Result |
| --- | --- |
| Maintainer aggregate source, links, SVG ownership and English prose | PASS: 43 pages, 66 displayed SVGs, no orphans |
| Maintainer HTTP / live DOM | PASS: 109 resources / 43 pages |
| Bilingual inventory, navigation, links, technical parity, language/accessibility, static interaction and audience gates | PASS: 54 pairs |
| Bilingual HTTP / live DOM | PASS: 277 resources / 109 pages |
| Existing focused replacement, field and AOUT tests | PASS: 14 tests |
| Existing seminar browser suite | 17 pass, 1 pre-existing failure |
| Focused changed-section browser inspection | PASS: 24 section/mode observations across six pages; new-section previous/next in both languages |
| Original anchors, unique HTML IDs, inspected file hashes and diff whitespace | PASS |
| Required human language-review gate | FAIL / pending: 162 receipt/fingerprint messages across 54 pairs; separate work item 55 |

The full bilingual aggregate was run; all emitted failures were human-review
receipt/fingerprint failures. Individual automated gates were also run because
the aggregate suppresses success summaries when any gate fails. No human review
receipt was created or claimed.

The existing browser failure is
`replacement foundations supports prediction, deliberate steps, and language transfer`
at `scripts/seminar-browser.test.mjs:306`: actual `#lru`, expected `#opt`.
It reproduces against an exact `git archive 5e1c02f` served separately on port
3942. Its test, foundations HTML and shared controls are unchanged by this task.

The [machine observations](lru-coverage-browser-observations.json) record hashes
of all six changed HTML pages. Headless inspection opened the new/changed
sections in 1440 × 1000 presentation mode and at 390 × 844 without JavaScript,
opened native disclosures by keyboard, checked page overflow and runtime errors,
and traversed the new section boundary in both directions. Representative
[lock-scope projection](lru-coverage-lock-projection.png) and
[age explanation on mobile](lru-coverage-age-mobile.png) were visually inspected.
Long expanded explanations scroll; no page-wide horizontal overflow was found.
The first screenshot attempt failed in Playwright's element stability/scroll
helper; a viewport capture after an immediate scroll succeeded. That tooling retry
required no product change.

Reproduce the checks from the task worktree:

```sh
copyparty -i 127.0.0.1 -p 3941 -v .::r --ih -q
# In another terminal, with PLAYWRIGHT_MODULE set to the available module:
node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3941
node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3941
node --test scripts/check-replacement-progress.test.mjs scripts/check-private-lru-domain-hit-age.test.mjs scripts/check-victim-scan-aout.test.mjs
SEMINAR_URL=http://127.0.0.1:3941 node --test scripts/seminar-browser.test.mjs
```

No engine experiment, AOUT enablement, performance result, merge or publication
is part of this change. Technical examples remain pinned to the verified source;
final human translation acceptance is still open.
