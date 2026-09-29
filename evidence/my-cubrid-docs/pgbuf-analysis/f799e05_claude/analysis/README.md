# CUBRID page-buffer analysis materials

All analysis notes in this directory are in English. The final audience-facing presentation is Korean and lives at `../CUBRID_PAGE_BUFFER_PRESENTATION_KO.md`.

| File | Purpose |
|---|---|
| `research/scope.md` | Frozen scope, audience, exclusions, and evidence policy |
| `research/api-inventory.md` | Complete `page_buffer.h` inventory: 106 concrete declarations, 95 logical callable interfaces, types, macros, contracts, and current-revision hazards |
| `research/caller-use-cases.md` | Representative heap, B-tree, file, recovery, vacuum, boot, and daemon call paths |
| `research/internal-mechanisms.md` | BCB/hash/latch/holder/flush/replacement internals and concurrency invariants |
| `research/evidence-reuse.md` | Same-revision audited claims, historical runtime observations, comparison evidence, and reuse limits |
| `research/pedagogy-plan.md` | Korean 50–60 minute teaching progression, visual plan, and gap audit |
| `research/qa-questions.md` | 55 source-anchored questions likely to arise during the presentation or implementation, review, debugging, tuning, and recovery work |
| `research/qa-answers.md` | Independent source-grounded answers to all 55 questions, including caller consequences, evidence, confidence, and limits |
| `monitoring/runtime-path-monitoring.md` | Live whole-pool trace analysis: probes inserted into `page_buffer.c`, simple SQLs executed, per-statement page-buffer paths reconstructed |
| `monitoring/run-monitor.sh` | Reproducible driver for the live monitoring session (instrumented lab build required) |
| `monitoring/trace-all.log` | Raw whole-pool event trace captured by the driver (regenerated on each run) |

Primary source revision: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.

The same-revision historical runtime evidence is reused only within its original limits. The expanded interface catalog is source-confirmed; it does not inherit the older report's readiness seal because the declared scope is broader.
