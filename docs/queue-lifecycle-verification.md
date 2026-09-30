# Queue lifecycle clarification

Lecture 7 (EN/KO) and the canonical replacement guide now expose the exact
private/shared consume gates, pre-scan and post-scan requeue decisions, repeated
insertion versus duplicate registration, and the two direct candidate-add callers
with their concrete upstream events. Two shared SVGs show queue control flow and
the transfer of index 32 while its registration flag remains set.

Implementation evidence is pinned to CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, especially
`src/storage/page_buffer.c:9115–9220, 15674–15980, 16378–16578`.
Diagrams are constructed source traces, not runtime observations.

## Verification

- Maintainer aggregate source checks: PASS, 43 Markdown pages, 71 displayed SVGs,
  no orphaned SVGs, relative-link and English-prose checks.
- Copyparty HTTP: PASS, all 114 guide pages/assets requested from a temporary
  read-only mount of this task worktree.
- Bilingual technical parity, language/accessibility, links/assets, audience,
  inventory, navigation, and static interaction gates: PASS, 54 pairs.
- Full-site served browser checks were run with headless Chromium. They report a
  missing `/favicon.ico` at the preview root on the initial guide/site entry;
  therefore the aggregate live-DOM gate is FAIL, not a pass. A CDP network trace
  confirmed that specific 404. No unrelated favicon source change was made.
- Focused EN/KO Lecture 7 browser checks: PASS at 1440px and 390px, with JavaScript
  enabled and disabled. Added sections are visible, images have natural dimensions,
  and there is no document-width overflow.
- Both new SVGs were rendered and visually inspected. Text bounding boxes stay
  within the viewBox.
- `git diff --check`: PASS.

The existing full-site review gate remains open for missing human Korean review
receipts and stale fingerprints elsewhere. This pair's fingerprints were refreshed
while its review state remains pending. Automated checks are not a human review.
Validation code was not changed.
