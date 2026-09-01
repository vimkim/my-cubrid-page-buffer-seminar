# Page-buffer maintainer guide

This directory owns the internal welcome guide for senior engineers who will modify and maintain CUBRID's `src/storage/page_buffer.c/.h`.

## Before editing

- Read `maintainer-guide-notes.md` whenever changing the guide, its structure, or its visuals.
- Read `source-inventory.md` before adding or strengthening implementation-specific claims.
- Read `unresolved-or-version-sensitive-findings.md` when a claim concerns a possible defect, an older revision, or incomplete runtime evidence.
- Treat CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` as the pinned baseline. Verify symbols and control flow before carrying an assertion to another revision.

## Document contract

- Write a readable internal maintainer guide, not slides, speaker notes, or a timed course.
- Keep Korean explanatory prose and canonical English source identifiers.
- Lead with maintainer tasks: locate, reason about invariants, change safely, debug, and verify.
- Distinguish Interface contract, Implementation policy, inference, runtime observation, and historical evidence.
- Keep deep catalogs and experiment receipts in the linked evidence documents instead of duplicating them.
- Use standard CMake, `ctest`, and project-provided test concepts in organization-facing instructions. Do not present personal `justfile` commands as CUBRID workflow.

## Assets and links

- Every displayed SVG belongs in `./assets/` and is referenced as `./assets/<name>.svg`.
- Do not link displayed images from another analysis directory.
- Keep only visuals used by `page-buffer-teaching-material.md`.
- Use repo-relative Markdown links compatible with the Copyparty `*.md?v` viewer.

## Required checks

Run from this directory after changing the guide or its assets:

```bash
node scripts/check-maintainer-guide-assets.mjs page-buffer-teaching-material.md
python /home/vimkim/.agents/skills/markdown-write/scripts/check_copyparty_markdown.py page-buffer-teaching-material.md
```

Also verify every changed relative link and request every displayed SVG through the local Copyparty server. If browser automation is available, require rendered images to have nonzero natural dimensions; otherwise report that live-DOM validation was unavailable.
