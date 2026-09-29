# Mission: Defend CUBRID's page-buffer design

## Why
Build a source-level mental model of `page_buffer.c/.h`, centered on the complete `pgbuf_fix()`/`pgbuf_unfix()` lifecycle, so I can explain the design to teammates and withstand difficult follow-up questions without hand-waving.

## Success looks like
- Trace both hit and miss paths from a caller's `VPID` to a usable `PAGE_PTR`, naming the state and synchronization transitions.
- Explain the caller contract across heap, B-tree, logging/recovery, dirty flushing, and replacement code.
- Distinguish identity, residency, ownership, concurrency, durability, and release in a whiteboard explanation.
- Defend trade-offs and failure cases with pinned source references and reproducible experiments.
- Deliver a concise team presentation, then answer adversarial design questions accurately.

## Constraints
- Use the local CUBRID source at pinned revision `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` as the authority.
- Lessons must work offline and be short enough to complete between normal engineering tasks.
- Prefer diagrams, retrieval practice, and teach-back over passive reading.
- Do not assume a graphical browser is available; always expose exact saved paths.

## Out of scope
- Re-teaching general database internals unless needed to explain a page-buffer mechanism.
- Modifying the CUBRID engine while this course is focused on understanding and presentation mastery.
- Treating PostgreSQL or InnoDB as normative designs for CUBRID.
