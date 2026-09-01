# Maintainer guide authoring notes

This file records the document contract for
[`page-buffer-teaching-material.md`](./page-buffer-teaching-material.md).
It is for people or agents maintaining the guide, not for page-buffer newcomers.

## Document contract

- Audience: senior engineers new to CUBRID who will review, debug, modify, and test `src/storage/page_buffer.c/.h`.
- Language: Korean prose with canonical English source identifiers and systems terms.
- Primary use: linear onboarding followed by symptom-driven lookup during real maintenance.
- Baseline: CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.
- Main narrative: Module Interface, source navigation, state model, invariants, safe-change workflow, debugging, and verification.
- Deep catalogs: remain in linked evidence documents rather than being copied into the guide.

## Sources of truth

Use evidence in this order:

1. Pinned CUBRID source through `git show f799e05:<path>` or a clean matching worktree.
2. [`source-inventory.md`](./source-inventory.md) for provenance, accepted runtime receipts, conflict resolution, and source routing.
3. Same-revision packets under `../../pgbuf-analysis/f799e05_claude/`.
4. The audited lifecycle report under `../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/`.
5. Historical `e6ed61e` and `5cd4f860e` material only when explicitly labeled revision-bound.

Never use an older defect summary as proof of a current defect. Carry candidates through
[`unresolved-or-version-sensitive-findings.md`](./unresolved-or-version-sensitive-findings.md).

## Asset contract

Every SVG displayed by the guide is owned by [`assets/`](./assets/).

- Guide links use only `./assets/<name>.svg`.
- Each SVG has a `viewBox` and no active content.
- Reused visuals are copied into this directory so the guide remains self-contained.
- Copy only visuals the guide actually displays.
- If a source visual changes, update the local copy intentionally and review its wording against the current evidence boundary.
- The pool map must retain the warning that AOUT is disabled in the analyzed default.

Run:

```bash
node scripts/check-maintainer-guide-assets.mjs page-buffer-teaching-material.md
```

The check must fail when an SVG moves outside the local asset seam, is missing, lacks a `viewBox`, or contains active content.

## Writing rules

- Lead each section with the maintainer problem it solves.
- Explain the concept before the CUBRID symbol.
- Prefer continuous prose, compact tables, and task-oriented checklists.
- Use a visual only for object relationships, state transitions, or a multi-step lifecycle.
- Keep exhaustive API inventories, experiment logs, and Q&A in linked references.
- Keep source citations near implementation-specific claims.
- Distinguish Interface contract, Implementation policy, inference, runtime observation, and historical evidence.
- Use `Module`, `Interface`, `Implementation`, and `seam` consistently.
- Remove presentation timing, speaker notes, slide language, and audience-performance prompts.

## Updating to another CUBRID revision

1. Record the new commit.
2. Diff `page_buffer.h` and every source-map region cited by the guide.
3. Recheck representative heap, B-tree, file, recovery, checkpoint, and boot callers.
4. Re-run known-hazard symbol and control-flow searches.
5. Regenerate line anchors.
6. Keep old runtime counts historical unless the exact harness is rerun.
7. Update the uncertainty register before strengthening any claim.
8. Re-run all Markdown and asset checks.

## Validation

Run from this directory:

```bash
python <markdown-write-skill-dir>/scripts/check_copyparty_markdown.py page-buffer-teaching-material.md
node scripts/check-maintainer-guide-assets.mjs page-buffer-teaching-material.md
```

Then verify all repo-relative links and request every `./assets/*.svg` through the local Copyparty server. When browser automation is available, inspect the rendered `*.md?v` DOM and require every image to have nonzero natural dimensions.

## Retired presentation material

The previous 52-minute narrative and 55-question appendix remain available as source material at
[`CUBRID_PAGE_BUFFER_PRESENTATION_KO.md`](../../pgbuf-analysis/f799e05_claude/CUBRID_PAGE_BUFFER_PRESENTATION_KO.md).
Do not merge that deck back into the maintainer guide wholesale. Pull only evidence or explanations that directly help a maintainer locate, change, debug, or verify the Module.
