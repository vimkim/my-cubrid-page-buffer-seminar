# Page-buffer maintainer guide

This directory owns the English internal documentation set for senior engineers who will modify and maintain CUBRID's `src/storage/page_buffer.c/.h`.

## Before editing

- Read `maintainer-guide-notes.md` whenever changing the guide entry, a guide page, the document structure, or a visual.
- Read `CONTEXT.md` for canonical reader, document, and evidence vocabulary; read relevant decisions under `docs/adr/` before changing the document-set shape or language.
- Read `source-inventory.md` before adding or strengthening implementation-specific claims.
- Read `unresolved-or-version-sensitive-findings.md` when a claim concerns a possible defect, an older revision, or incomplete runtime evidence.
- Treat CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` as the pinned baseline. Verify symbols and control flow before carrying an assertion to another revision.

## Document contract

- Write a readable internal maintainer guide, not slides, speaker notes, or a timed course.
- Use English explanatory prose and canonical English source identifiers.
- Serve four reading modes: the ordered `learning/` path builds Core maintainer capability; `advanced/` extends it; `playbooks/` supports change, diagnosis, and verification work; `reference/` routes source and invariant lookup.
- Keep `page-buffer-teaching-material.md` as the Guide entry that routes readers without duplicating the Learning path.
- Give each concept one canonical explanation. Other pages link to that explanation instead of copying it.
- Lead with maintainer tasks: locate, reason about invariants, change safely, debug, and verify.
- Distinguish Interface contract, Verified mechanism, Implementation policy, Inference, Runtime observation, and Historical evidence.
- Keep deep catalogs, experiment receipts, and mutable uncertainty status in the linked Evidence references instead of duplicating them.
- Use standard CMake, `ctest`, and project-provided test concepts in organization-facing instructions. Do not present personal `justfile` commands as CUBRID workflow.

## Assets and links

- Every displayed SVG belongs to the root `assets/` seam. The Guide entry uses `./assets/<name>.svg`; nested pages use `../assets/<name>.svg`.
- Resolve an SVG target before checking ownership; do not require one literal link prefix.
- Do not link displayed images from another analysis directory.
- Keep only visuals used by at least one page in the document set.
- Use repo-relative Markdown links compatible with the Copyparty `*.md?v` viewer.

## Required checks

- Run `node scripts/check-maintainer-guide.mjs` from this directory for the aggregate source checks.
- With this directory mounted at the Copyparty URL root, run `node scripts/check-maintainer-guide.mjs --copyparty-url <base-url>` to add HTTP and available live-DOM checks. An `UNAVAILABLE` gate is a disclosure, not a pass.
- When changing validation code, run `node --test scripts/check-maintainer-guide.test.mjs`.
- Use one aggregate validation entry point that discovers every guide page: the Guide entry plus `learning/`, `playbooks/`, `advanced/`, and `reference/` Markdown.
- Run the Copyparty Markdown source checker on every discovered page and resolve every relative link, including links to external Evidence references.
- Require every displayed SVG to resolve inside `assets/`, exist, contain a `viewBox`, and contain no active content; reject unused SVGs.
- Check authored Markdown and SVG text for unintended Korean prose.
- Request every page and displayed SVG through the local Copyparty server.
- When browser automation is available, require rendered images to have nonzero natural dimensions and pages to have no relevant render error. Otherwise report live-DOM validation as unavailable.
