# Pool structure map and per-`VPID` load serialization

The learner can name the buffer pool's internal structures with their cardinality units (per-frame: `BCB_table`/`iopage_table`; per-thread: `buf_lock_table` slot and holder anchor; per-transaction: private LRU; pool-global: hash table, shared LRU, AOUT, invalid list) and explain the buffer lock chain as per-`VPID` mutual exclusion over *materializing residency*, not as an I/O mechanism. They correctly derived that the one-slot-per-thread sizing follows from the synchronous miss path, identified that a worker-pool prefetch design needs no slot change while same-thread async prefetch breaks the fixed `buf_lock_table[thread_index]` premise itself, and completed the counterfactual: without the lock chain, two concurrent misses on one cold `VPID` produce duplicate resident BCBs, split-brain updates on different frames, and a lost update decided by flush order.

## Evidence

During the adaptive exchange ending 2026-09-01 the learner (a) restated the lock/sleep/wake mechanism of `pgbuf_lock_page()` unprompted, (b) predicted the prefetch sizing question before being taught it, and (c) finished the two-loader counterfactual in their own words: both copies dirty and unfixed, both flushed to the same disk pages, the earlier flush's value silently overwritten.

## Implications

The structure map (lesson 0003) can be treated as established, including the "no dedicated dirty list" and "hash bucket count is fixed at `1<<20`" facts. Remaining before the durability-chain record: the row-7 flush-failure variant (`was_dirty` → `pgbuf_bcb_mark_was_not_flushed()` → `oldest_unflush_lsa` restore). After that, proceed to writer/flusher interleaving state transitions (deck Q25–Q31 territory).
