# CUBRID Page-buffer Resources

## Knowledge

- [Pinned CUBRID source: `page_buffer.c`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c)
  The primary authority for lookup, load serialization, latch and holder accounting, dirty generations, flushing, and replacement. Use it to prove mechanisms at the pinned revision.
- [Pinned CUBRID interface: `page_buffer.h`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h)
  The primary authority for caller-visible modes and Interface families. Use it before stating what callers may request or must repay.
- [Page-buffer Maintainer Guide](./page-buffer-teaching-material.md)
  The route selector for the canonical Core, Advanced, playbook, reference, and Question-bank paths. Use it to choose the next document rather than reading the implementation in file order.
- [Core learning path: Contract and Objects](./learning/01-contract-and-objects.md)
  The canonical first explanation of the successful-fix contract, the six objects and lifetimes, and the independent state axes.
- [Source and Caller Map](./reference/source-map.md)
  The compact routing index for representative implementation regions, caller families, and symptom owners.
- [Source inventory and reconciliation](./source-inventory.md)
  The evidence authority for provenance, accepted runtime receipts, revision conflicts, and known gaps. Use it before strengthening a claim.
- [Evidence and uncertainty registry](./unresolved-or-version-sensitive-findings.md)
  The sole mutable status source for defect candidates, version-sensitive policy, and incomplete runtime proof.
- [CUBRID Page-buffer Question Bank](./questions/README.md)
  Retrieval, scenario, and Applied routes with evidence-aware companion answers. Use it for spaced rehearsal after each canonical lesson.
- [Pinned PostgreSQL buffer manager: `bufmgr.c`](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c)
  Primary authority for the comparison's split pin/content-lock lifetime, backend-private nested pin accounting, ResourceOwner cleanup, miss publication, and WAL-gated flush behavior.
- [Pinned InnoDB buffer pool: `buf0buf.cc`](https://github.com/mysql/mysql-server/blob/06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8/storage/innobase/buf/buf0buf.cc)
  Primary authority for page-hash lookup, `buf_fix_count`, pre-I/O `BUF_IO_READ` publication, requested latch acquisition, and MTR integration in the compared InnoDB revision.
- [Audited three-engine comparison](../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/chapters/09-comparison.html)
  Same-scenario synthesis across CUBRID, PostgreSQL, and InnoDB with explicit `equivalent`, `partial analogy`, and `no equivalent` boundaries. Use after learning the CUBRID mechanism from the Canonical pages.

## Wisdom (Communities)

- Local: CUBRID storage and transaction teammates
  Use for a whiteboard review that challenges ownership, lock ordering, recovery assumptions, and unusual fetch modes.
- Local: one heap/B-tree owner and one logging/recovery owner
  Use for a rehearsal that exposes vocabulary mismatches and questions the guide may not anticipate.

## Gaps

- The learner's presentation date, duration, audience mix, and current source-level familiarity are not recorded yet.
- No rehearsal feedback has been captured in this teaching workspace.
- Existing runtime evidence did not force real eviction or prove contention fairness, crash boundaries, or fault-injected cleanup.
- No cross-engine latency or throughput benchmark exists; the holder-lookup and nested-atomic opportunities remain source-shaped hypotheses until a release-build CUBRID benchmark isolates their cost.
