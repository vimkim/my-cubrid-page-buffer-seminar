# CUBRID page buffer: presentation + analysis corpus (f799e05, claude)

Seminar package for the `src/storage/page_buffer.c` internals presentation.

- Source of claims: CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` (unmodified control flow).
- Live monitoring ran on that revision plus logging-only probes: branch
  [`page-buffer-survey-with-tracers`](https://github.com/vimkim/cubrid/tree/page-buffer-survey-with-tracers),
  probe commit `75d64f959`.

| Path | Content |
|---|---|
| [`CUBRID_PAGE_BUFFER_PRESENTATION_KO.md`](./CUBRID_PAGE_BUFFER_PRESENTATION_KO.md) | Final audience-facing presentation (Korean): 52-min deck + reference appendix + contract cards + 55 Q&A |
| [`presentation-assets/`](./presentation-assets/page-buffer-state-axes.svg) | SVG assets referenced by the presentation |
| [`analysis/README.md`](./analysis/README.md) | Index of the English evidence notes |
| [`analysis/research/`](./analysis/research/scope.md) | Scope, API inventory, caller use cases, internals, evidence reuse, pedagogy plan, Q&A (English) |
| [`analysis/monitoring/`](./analysis/monitoring/runtime-path-monitoring.md) | Live whole-pool trace analysis, driver script, raw trace log (English) |
