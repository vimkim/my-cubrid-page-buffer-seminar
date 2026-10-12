# PostgreSQL buffer replacement under concurrent clients

Research date: 2026-10-13. Evidence type: **Verified mechanism** and **Implementation policy**, with the stated **Inference** boundaries below. No runtime experiment or cross-engine benchmark was executed.

## Answer to the seminar question

The shared-per-page pin count is real; the conclusion that it ignores concurrent clients is false. PostgreSQL uses a shared Clock-sweep cursor, a replacement `usage_count` for each buffer, and a shared reference count for each buffer. It does not put all page pins into one global counter. Backend-private pin bookkeeping, partitioned lookup, buffer content locks, I/O coordination, and workload-specific buffer rings explicitly address concurrent activity. The mechanism inventory below supports that conclusion; algorithm names alone do not establish a performance winner.

## Revision boundary

The seminar's PostgreSQL baseline is commit `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`. It identifies itself as **20devel**, not PostgreSQL 18 or a released PostgreSQL 19. [Pinned version declaration](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/configure.ac#L20).

To establish that the central concurrent-client mechanisms also exist in a released version, this note checks PostgreSQL **18.0**, immutable commit `3d6a828938a5fa0444275d3d2f67b64ec3199eb7` corresponding to `REL_18_0`. PostgreSQL 18 documentation is used only for version-qualified observation interfaces. This is a source comparison of those two revisions, not a claim about every PostgreSQL release.

## Distinguish safety, retention, and allocation coordination

| State | Scope | Question it answers |
|---|---|---|
| Shared reference count | One shared buffer descriptor | Does a pin currently prevent recycling this frame? |
| Backend-private reference count | One backend and one buffer | How many outstanding pins must this backend release? |
| `usage_count` | One shared buffer descriptor | How much replacement credit remains? |
| `nextVictimBuffer` | Shared strategy controller | Which candidate should the next Clock-sweep step inspect? |

The per-buffer placement of reference and usage counts is explicit in [`BufferDesc` and the state definitions](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/include/storage/buf_internals.h#L33-L93), while the shared cursor is in [`BufferStrategyControl`](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L26-L56).

For ordinary backend pins, the shared count contributes one per backend with at least one outstanding pin. Nested pins remain private; only the first pin and final unpin change shared accounting. A default-strategy first pin adds usage credit; a strategy pin only raises zero to one. [18.0 first and nested pin paths](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/bufmgr.c#L3043-L3155), [18.0 final-unpin path](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/bufmgr.c#L3267-L3336), [20devel private bookkeeping rationale](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L230-L261).

### Constructed two-backend trace

Assume a valid resident shared page, no I/O in progress, no sweep step, and default access strategy. Initially both backends have no pin and usage credit is zero. This is a constructed schedule, not an observed execution.

| Event | A private pins | B private pins | Shared refcount | Usage credit |
|---|---:|---:|---:|---:|
| Initial state | 0 | 0 | 0 | 0 |
| A first pin | 1 | 0 | 1 | 1 |
| A nested pin | 2 | 0 | 1 | 1 |
| B first pin | 2 | 1 | 2 | 2 |
| A releases one pin | 1 | 1 | 2 | 2 |
| B releases its final pin | 1 | 0 | 1 | 2 |
| A releases its final pin | 0 | 0 | 0 | 2 |

The final release removes pin protection but leaves replacement credit. Clock-sweep must age that credit before selecting this frame. The transition rules are the cited pin/unpin paths above and [`StrategyGetBuffer`](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L239-L310).

**AIO caveat:** the shared count can include an additional I/O lifetime pin. Both revisions add one so error cleanup cannot recycle a frame during asynchronous I/O. Thus it is not universally an exact census of backend processes. [18.0 rationale and increment](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/bufmgr.c#L6765-L6855), [20devel increment](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L8318-L8407), [20devel release](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L7425-L7435).

`usage_count` is capped at five in the pinned baseline. It records neither distinct users nor transaction ownership; one backend can accumulate credit through repeated release and first-pin cycles. The source explicitly trades recency approximation against sweep work. [Usage-count cap and rationale](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/include/storage/buf_internals.h#L136-L146).

## Mechanisms that address concurrent activity

### Partitioned lookup and buffer-local coordination

The shared mapping hash has 128 partitions. Lookups require a shared partition lock; insertion and deletion require an exclusive partition lock. Different partitions can proceed independently, although collisions and hot partitions still create contention. [Mapping table setup and lock requirements](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/buf_table.c#L52-L151), [partition count](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/include/storage/lwlock.h#L82-L83).

Content locks protect page bytes independently of pins. In the baseline they use per-buffer state and a per-buffer waiter list. I/O callers can join an existing operation or wait for its completion. [Content-lock and waiter fields](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/include/storage/buf_internals.h#L303-L358), [I/O coordination](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L7185-L7346).

### A shared hand with atomic work assignment

`ClockSweepTick` assigns candidates using atomic fetch-add. A spinlock coordinates wrap/pass bookkeeping. Candidate aging and claiming use a per-descriptor compare-and-swap loop. Pinned candidates are skipped; unpinned candidates with credit are aged; zero-credit candidates can be claimed. [Cursor coordination](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L104-L165), [candidate loop](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L239-L310).

**Inference:** avoiding an exact LRU list update is a design tradeoff, not proof of scalability at every load. The shared hand can still create cache-coherence traffic during allocation churn, and a hot descriptor can incur atomic retries. Ordinary resident-page hits do not require advancing the hand. [Resident hit path](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L2216-L2269).

### Workload-specific rings and protection of other access

A `BufferAccessStrategy` stores a private array of **shared buffer IDs**. The page storage remains in the shared pool. Each ring is capped at one eighth of `NBuffers`; its requested size depends on strategy and I/O settings. The cap applies per ring, not to the aggregate footprint of all concurrent queries. [18.0 strategy representation](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/freelist.c#L67-L92), [18.0 sizes and cap](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/freelist.c#L533-L655).

Ring reuse requires shared refcount zero and usage credit at most one. Higher credit makes the ring seek another candidate. Normal access can therefore protect a formerly scanned page from immediate ring recycling. This is an aggregate credit heuristic: it does not preserve user identity, count distinct past users, or promise permanent protection. [18.0 ring eligibility](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/freelist.c#L757-L780), [20devel ring eligibility](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L652-L696).

In bulkread mode a dirty permanent ring victim can be rejected when reuse would require a WAL flush. Other strategies need not reject it. [WAL-aware caller](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L2613-L2630), [18.0 rejection policy](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/freelist.c#L829-L858).

### Per-backend limits for operations that pin ahead

The baseline computes an advisory proportional pin budget from buffer count and possible backends. Read streams combine it with strategy limits, reduce look-ahead as needed, and allow at least one pin for progress. This controls outstanding pins; it is not a hard per-session resident-cache allocation. [Advisory budget](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L4241-L4248), [read-stream budget use](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/aio/read_stream.c#L392-L420), [strategy and backend limits](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/aio/read_stream.c#L838-L858).

## What can be observed in PostgreSQL 18

`pg_stat_io` groups counters by backend type, object, and context. Compare `normal`, `bulkread`, `bulkwrite`, and `vacuum`, especially hits, reads, writes, evictions, and reuses. Ring reuses and acquisitions from the wider pool are distinct events. These counters do not identify every user's working set, and kernel reads do not distinguish OS-cache hits from physical device reads. Relevant wait observations include `BufferMapping`, `BufferContent`, `BufferPin`, and I/O waits. [PostgreSQL 18 monitoring documentation](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-IO-VIEW).

`pg_buffercache` exposes `usagecount`, `isdirty`, and `pinning_backends`; it provides individually consistent buffer records without a globally simultaneous snapshot. Its summary and usage-count functions are useful for pool-level observations. [PostgreSQL 18 pg_buffercache documentation](https://www.postgresql.org/docs/18/pgbuffercache.html).

**Documentation/source boundary:** the versioned documentation's general wording about not taking buffer-manager locks must not be read as a precise implementation statement for these pinned revisions. The 18.0 view implementation takes individual buffer header locks but does not hold partition locks for a pool-wide snapshot; the 20devel implementation also locks each inspected header. [18.0 snapshot and header-lock code](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/contrib/pg_buffercache/pg_buffercache_pages.c#L186-L223), [20devel inspection](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/contrib/pg_buffercache/pg_buffercache_pages.c#L154-L165).

The `pinning_backends` field is populated directly from shared refcount. During AIO the lifetime pin above can affect its value, so do not equate every sample with that many client sessions. [18.0 field assignment](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/contrib/pg_buffercache/pg_buffercache_pages.c#L205-L210), [20devel field assignment](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/contrib/pg_buffercache/pg_buffercache_pages.c#L154-L165).

## Limits of the CUBRID comparison

At CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, private-to-shared migration tests replacement-domain index mismatch or a hot-and-old BCB. The executable test does not count distinct users. Private-list assignment can place multiple sessions in one list. Thus private-domain membership is policy accounting, not exclusive access or a one-to-one session identity. [Migration predicate](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7006-L7038), [private-list assignment](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14514-L14602).

Keep domain migration separate from zone boosting: migration removes the BCB from its private list and inserts it in the shared list's middle; boosting moves a BCB toward the top of its existing list. Calling both simply promotion hides the distinction. [Domain migration](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10332-L10354), [zone boost](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10124-L10196).

**Inference:** this explicit domain policy gives CUBRID a different policy dimension from PostgreSQL's aggregate page credit and operation-specific rings. Source mechanisms establish neither workload fairness nor a universal performance winner.

For the seminar, compare four separate questions: preventing reuse during active access; protecting repeated and shared access; containing a streaming workload; and paying for synchronization under pressure. Then test concrete hypotheses about isolation and retention on a controlled mixture of point access, large scans, and updates. Record page and pool bytes, active clients and working sets, durability settings, warm-up, OS-cache conditions, background activity, throughput, per-workload latency including tail latency, fairness, and CPU/lock/I/O costs. Change workload sharing and client count deliberately. This is an experiment proposal, not measured superiority.

## Details that must not be generalized across the revisions

| Detail | PostgreSQL 18.0 | Pinned 20devel |
|---|---|---|
| Descriptor state | 32-bit atomic | 64-bit atomic |
| Content-lock representation | Descriptor LWLock | State bits and dedicated waiter list |
| Unused-buffer freelist | Present | Removed; ring fallback uses Clock-sweep |

The contrasting descriptor layouts are [18.0 `BufferDesc`](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/include/storage/buf_internals.h#L258-L271) and [20devel `BufferDesc`](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/include/storage/buf_internals.h#L326-L358). The allocation paths are [18.0 freelist and Clock-sweep](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/storage/buffer/freelist.c#L267-L354) and [20devel Clock-sweep](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/freelist.c#L239-L310). These differences do not erase the verified private-pin, usage-credit, and ring mechanisms checked above.
