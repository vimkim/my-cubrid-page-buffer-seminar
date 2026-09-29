# Expanded page-buffer Markdown scope

## Topic

Explain CUBRID's `src/storage/page_buffer.c` as a caller-facing page ownership, concurrency, durability, and replacement Module, with practical coverage of most interfaces exported by `page_buffer.h` at revision `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.

## Audience and deliverables

- Audience: storage specialists who can read C/C++ but may have no prior DBMS buffer-pool knowledge.
- English evidence notes: interface inventory/contracts and internal mechanisms.
- Final visible presentation: one Korean Markdown file with Mermaid, SVG, tables, and short code examples.
- Source identifiers, code, paths, and standard technical terms remain English.

## Included

- Lifecycle and environment: initialization, finalization, per-thread state, daemons, private LRU assignment.
- Page acquisition and release: fetch modes, latch modes/conditions, retry, simple fix, ordered watchers, promotion, unfix, copy helpers.
- Page metadata and mutation: VPID, page type, LSA, temporary pages, TDE, dirty marking.
- Durability and maintenance: WAL-aware flush, checkpoint/all-page/victim flush, invalidation, deallocation and recovery hooks.
- Validation, diagnostics, observability, scan hooks, and the opaque scan-copy buffer.
- Representative call paths from heap, B-tree, file/disk, logging/recovery, vacuum, boot, and daemon code.
- Internal structures and state transitions needed to explain hit, miss, latch wait, dirty/flush/re-dirty, and victim reuse.
- Important failure, retry, ownership, ordering, and performance conditions.

## Excluded

- An exhaustive list of every transitive call site; representative use cases establish each interface family's contract.
- ABI, on-disk byte compatibility, strict timing/fairness, or performance parity guarantees.
- Re-running experiments already captured and independently audited for this exact revision unless a new central claim needs runtime proof.
- Full PostgreSQL/MySQL reconstruction; the final presentation may retain only comparison points useful for preventing false analogies.

> **Scope change (2026-09-01).** The updated `prompt.md` explicitly requests live probing/logging of the page-buffer
> code and a monitoring analysis of simple SQL runs, so the earlier "no engine instrumentation" exclusion is
> superseded. The lab-branch tracer in `src/storage/page_buffer.c` was extended with a whole-pool mode and path
> probes, and the resulting analysis lives in `../monitoring/runtime-path-monitoring.md`. The instrumented build is
> the pinned revision plus logging-only probes; pinned-source claims still cite the unmodified control flow.

## Central questions

1. What problem does each public interface family solve, and when should a caller use it?
2. What preconditions, ownership/lifetime rules, latch/lock ordering, errors, and cleanup obligations cross the Interface?
3. Which internal structures and synchronization rules implement those contracts?
4. How do fast, slow, retry, and failure paths converge—or deliberately differ?
5. How do dirty tracking, page LSA, WAL, DWB, flushing, and replacement compose without becoming one operation?
6. Which interfaces are general caller tools, specialized subsystem hooks, diagnostics, recovery callbacks, or internal-but-exported maintenance seams?

## Evidence policy

Pinned local source and complete reachable functions are authoritative. The existing same-revision audited report under `my-cubrid-docs/code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/` may be reused for claims and runtime observations, but expanded interface claims must be rechecked against the current pinned source.

## Worktree boundary

The pre-existing dirty `cubrid-cci` submodule (`win/cci_version.h` build-number drift) is outside this analysis scope and
is preserved unchanged. The root engine `src/` tree and the pinned `page_buffer.c`/`.h` inputs are not modified.
