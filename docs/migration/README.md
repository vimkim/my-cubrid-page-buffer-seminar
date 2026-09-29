# Independent repository migration

The complete page-buffer documentation product was extracted from `vimkim/my-cubrid-docs` at commit `d84433fded947507f51b01cad99174f29744ba93`, under `code-analysis/page-buffer-presentation/`. The accepted [design](../../.scratch/seminar-repository-migration/spec.md) and [ADR 0006](../adr/0006-maintain-page-buffer-as-an-independent-seminar-repository.md) record the ownership and publication decisions.

## History and content

An isolated clone was filtered to the topic directory using `git-filter-repo`. Original history in `my-cubrid-docs` was not rewritten. The [commit map](history-commit-map.txt) maps original commits to extracted commits; zero destinations represent commits pruned because they did not contribute to the extracted history. Historical source-commit names in authoring records remain identifiers from the original repository.

The import preserves the existing topic layout and all tracked topic files. Site HTML and the human-review manifest remain byte-identical to the extraction baseline. Links crossing the former directory boundary now point into `evidence/my-cubrid-docs/`; corresponding test expectations were updated. The browser-test default now uses the new local serving root.

## Evidence snapshots

The [evidence manifest](evidence-manifest.json) records 318 imported files, their original paths, SHA-256 digests before and after link adjustment, and whether each was tracked at the source revision. The imported evidence totals 6,596,079 source bytes. It includes the full directories explicitly linked by the source inventory, preserving their browsable structure.

Of those files, 151 were tracked at the source revision and 167 were locally ignored runtime-receipt files captured from the source working tree. The latter are local snapshots identified by their digests, not files claimed to exist in the cited Git commit. Existing timestamps and runtime metadata describe the original experiments; the migration did not rerun them. Historical commands naming source worktrees remain reproduction prerequisites, not dependencies for browsing the imported documents.

The original evidence remains in `my-cubrid-docs` for other consumers. Imported evidence is a provenance-bound snapshot; future updates should be intentional and retain their origin. The [link-rewrite inventory](link-rewrites.json) lists files whose cross-boundary paths changed during import.

## Acceptance

Verification results are recorded in [verification.md](verification.md). Existing human Korean-language and semantic-parity review gaps remain tracked separately as work item 55. Old shared URLs are intentionally not preserved. The former directory receives a relocation README after verification and publication; the parent collection and submodule setup remain user-managed.
