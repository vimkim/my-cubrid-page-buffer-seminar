# Durability chain and the two redo gates

The learner can defend the full mutation-to-durability chain: WRITE latch grants only in-memory exclusivity; the caller completes the contract with logging, page LSA, and `pgbuf_set_dirty()`; durable WAL (not data-page flush) is what makes a commit crash-safe; the flusher forces WAL up to the snapshot LSA before writing a copied image. They can state the flush failure path (`was_dirty` → `pgbuf_bcb_mark_was_not_flushed()` → `oldest_unflush_lsa` restore) and articulate redo's per-page gate in their own words: records at or below the disk image's page LSA are skipped, records above it are applied. Combined, they can explain why recovery has two gates — the checkpoint-derived scan start and the per-page LSA comparison — and why data loss requires both to miss (record never scanned AND disk image older than the record).

## Evidence

Adaptive exchange ending 2026-09-01: the learner independently produced the split-brain lost-update consequence (both copies flushed, first value overwritten), answered the normal-world checkpoint contribution (LSA 100) correctly in the counterfactual timeline, and stated the per-page gate ("120이면 119는 스킵하고 그 위부터 적용") unprompted for the page-LSA-120 variant.

## Caveats

Two retrieval weaknesses were observed and corrected in-session: (1) the learner once restated a visible model answer instead of transforming it; (2) they initially answered NULL for the false-refill step — the fact that `pgbuf_set_lsa()` treats a NULL `oldest_unflush_lsa` as a first dirtying and silently records a too-new LSA (`page_buffer.c:5040-5052` pinned) was taught, not retrieved. Re-test the false-refill mechanism cold in a later session before treating it as stored.

## Implications

Lessons 0001–0003 material plus the durability chain can now anchor the seminar's §7. The counterfactual timeline was promoted into the presentation deck as §7.5 at the learner's request, alongside §2.1 (cardinality/sizing). Next teaching target: writer/flusher interleaving as explicit state transitions (deck Q25–Q31), which builds directly on the FLUSHING/DIRTY generation accounting already established.
