# CUBRID Page Buffer Resources

## Knowledge

- [Pinned CUBRID source: `page_buffer.c`](https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c)
  Primary authority for lookup, load, latch acquisition, holder accounting, `pgbuf_unfix()`, flushing, and replacement. Use it to prove mechanisms, not merely terminology.
- [Pinned CUBRID interface: `page_buffer.h`](https://github.com/vimkim/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h)
  Primary authority for the public macros, modes, watcher types, and debug/release boundary. Use it whenever a caller contract is discussed.
- [Progressive `pgbuf` question bank](reference/pgbuf-question-bank.html)
  Thirty-eight source-backed questions with visible model answers and correctness explanations. Use for self-study, presentation rehearsal, and targeted drilling by question number.
- [Structure map reference card](reference/pgbuf-structure-map.html)
  Printable glossary of the pool's internal data structures (`PGBUF_BCB`, hash/lock chains, LRU+AOUT, holder ledger) with the question each answers, its protecting lock, and source lines. Use whenever a mechanism discussion needs the "which structure owns this state?" answer.
- [Durability contract card](reference/pgbuf-durability-contract.html)
  Printable separation of WRITE ownership, durable WAL, and later page-image propagation. Use when defending why commit does not wait for dirty data-page flush.
- [Offline book: _CUBRID Page Buffer Field Guide_](../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/index.html)
  Source-traceable Korean analysis at the same revision. Use chapters 4, 5, 6, and 7 for the fix/unfix lifecycle and cross-module call paths.
- [Evidence index and readiness appendix](../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/11-contract-evidence.html)
  Maps claims to source and runtime evidence. Use before presenting any strong guarantee to teammates.
- [Reproducible experiments](../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/08-experiments.html)
  Captured hit/miss and restart-oriented observations with scripts. Use to separate observed behavior from source-derived guarantees.
- [Notion-style Markdown companion](../../code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/notion/page-buffer-guide.md)
  Portable presentation notes with Mermaid and SVG visuals. Use to assemble slides or review without navigating the full book.

## Wisdom (Communities)

- Local: CUBRID storage/transaction teammates and reviewers
  Use for a whiteboard design review: ask them to challenge invariants, lock ordering, recovery assumptions, and unusual fetch modes.
- Local: presentation rehearsal with one heap/B-tree caller owner and one logging/recovery owner
  Use to expose vocabulary mismatches between buffer, storage, and transaction layers before the team presentation.

## Gaps

- No teammate feedback has been captured yet; the first rehearsal should record which questions caused hesitation.
- No learning record exists yet because lesson exposure is not evidence of mastery; the first teach-back answer will establish the baseline.
