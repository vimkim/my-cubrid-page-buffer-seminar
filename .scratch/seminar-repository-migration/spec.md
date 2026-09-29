# Page-buffer seminar repository migration

Status: confirmed; execution in progress

Work item: 223. The user confirmed the complete contract on 2026-09-29, including both repository pushes.

## Accepted decisions

- Q1 A: migrate the entire `page-buffer-presentation` directory, including the bilingual seminar, English Maintainer Guide, local evidence, assets, validators, and design records.
- Q2: `my-cubrid-seminar` is a multi-topic collection. Page buffer becomes an independent Git repository; the user will add it to the collection as a submodule later. Creating the parent collection or adding the submodule is outside this migration's current scope.
- Q3: preserving old shared URLs is not required.
- Q4: the independent topic repository will live at `/home/vimkim/gh/my-cubrid-page-buffer-seminar`, a sibling of the future collection.
- Q5: preserve extracted directory history if feasible. Keep the original repository history intact; extracted commit hashes may differ.
- Q6: import required external evidence and its dependencies with source-revision provenance. Readers should not need the old checkout layout to follow local evidence links.
- Q7: validation portability is not a migration requirement. Retain existing personal tooling dependencies; fix paths affected by migration without vendoring the personal checker or introducing a portable toolchain.
- Q8: after successful verification, remove the original directory's migrated content and leave a small relocation README. Keep external evidence used elsewhere in `my-cubrid-docs`.
- Q9: publish the new repository to GitHub with the same name and public visibility. The authenticated account is `vimkim`, giving `vimkim/my-cubrid-page-buffer-seminar`. Commit the migration and source retirement; the final confirmation includes pushing the source retirement to the existing documentation remote as well.
- Q10: accept the migration based on content/history preservation, resolved evidence links, applicable source and test checks, and served/browser checks. Carry existing human-review gaps forward without claiming they are complete. Disclose any unavailable verification explicitly.

The ownership decision is recorded in [ADR 0006](../../docs/adr/0006-maintain-page-buffer-as-an-independent-seminar-repository.md).

## Inspected facts

Before interview documentation edits, the source repository was clean on `main`, tracking `origin/main` at `vimkim/my-cubrid-docs`. The directory contained 383 tracked files and approximately 4.5 MB, with 93 commits touching its path. `/home/vimkim/gh/my-cubrid-seminar` existed as an empty directory without a Git repository.

The read-only inventory found 37 unique relative targets outside the directory, mainly in `my-cubrid-docs/pgbuf-analysis/` and the adjacent lifecycle report. A plain move would break evidence links. Some validation tests encode these relative paths; the Markdown checker defaults to an agent-local script, and the browser test defaults to the old local hosting URL.

## Feasibility follow-up

The topic destination does not exist. History extraction is feasible in an isolated clone using a temporary `uv`-provided `git-filter-repo`; the original repository history must not be rewritten. Preserve the interview documents as part of the migrated content, including edits not yet committed when inspection ran.

The inspected evidence dependency closure contains 318 external files totaling approximately 6.6 MB, including complete explicitly linked directories. No large binary artifacts were found. Historical runtime commands name source worktrees; preserve these as provenance/reproduction prerequisites rather than claiming runtime environments migrate with the documents. Resolve apparent placeholder/parser link errors by checking their context.

Copyparty, the personal Markdown checker, and Chromium through the existing Playwright override are available. Adapt serving configuration to the new topic location and verify it there. Keep site content at the topic repository root, preserving its internal page layout; the future parent collection and submodule remain user-managed.

The authenticated GitHub account is `vimkim`; GitHub did not resolve an existing `vimkim/my-cubrid-page-buffer-seminar` repository during inspection.

## Execution and acceptance

1. Capture the source revision and scoped interview documentation; extract the topic history in an isolated repository without rewriting the original.
2. Import the required evidence closure with source paths, revisions, and an explicit snapshot provenance record. Update affected links, validator path assumptions, and authoring guidance while preserving technical content and review status.
3. Run the maintainer-guide and bilingual aggregate validators, relevant validator tests, and served/browser checks against the new location. Account for every migrated file and record history-extraction correspondence. Personal tooling dependencies remain permitted.
4. Create and push the public topic repository. Retire the original content only after verification, leaving the relocation README and preserving external evidence still owned by the documentation repository.
5. Commit and push the scoped source retirement to `my-cubrid-docs`, record final repository URLs and verification evidence, and leave parent/submodule setup to the user.

## Remaining confirmation

The user confirmed the complete contract on 2026-09-29, including publication of both the new topic repository and the source retirement.
