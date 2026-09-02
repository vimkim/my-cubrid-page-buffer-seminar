# Replacement Policy and Background Progress

**Level:** Advanced
**Prerequisites:** [Flush One Generation](../learning/04-flush-one-generation.md) and [Replace One Frame](../learning/05-replace-one-frame.md)
**Capability gained:** Analyze pinned replacement and background-progress policy without weakening the core victim-eligibility contract.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Implementation policy, and Runtime observation from the [pinned-source inventory](../source-inventory.md) and exact ranges below. Historical evidence in the [replacement deep reference](../../../pgbuf-analysis/research/cubrid-lru-victim.md) is explicitly revision-bound to `5cd4f860e`; this page uses it only as a deep navigation aid after revalidating current claims against the pinned baseline.

Eligibility comes before every mechanism on this page. A policy may decide where to look and how to make progress; only the [core eligibility gate](../learning/05-replace-one-frame.md) decides whether a frame is safe to reuse.

## Pinned implementation policy: domains, zones, and hints

The pinned revision distributes resident frames across private LRU domains assigned to active contexts and shared LRU domains. Each list uses three zones: LRU1 is the hot zone, LRU2 is a buffer zone in which a fallen BCB can be boosted back, and LRU3 is the victimization zone, so "victim zone" in this guide always means LRU3. The victim scan starts in LRU3 and may use a victim hint (`victim_hint`) to avoid rescanning known-ineligible candidates.

![Private and shared LRU domains, three zones per list, and the victim search order](../assets/lru-domains-zones.svg)

Read the two panels as domains and the three chips in every list as zones. A private list is assigned as a locality/quota domain to active contexts; it is not necessarily exclusive to one transaction. A caller searches its own list first when that list is over quota. A materially over-quota own list restricts the **other-private** step to the big-private queue; the pinned control flow still proceeds to shared lists. An under-quota own list is searched only as a last resort. The bottom row is the search order of `pgbuf_get_victim()`; when quota is disabled, only the shared lists are searched.

Quota policy adjusts private-list targets from activity and redistributes pressure toward shared lists. Each candidate queue, count, and hint accelerates search; none is an ownership proof. The scan still rejects flags/fix ownership and performs a final BCB-protected eligibility check before removal.

### Counts, quotas, and zone boundaries at the pinned revision

One BCB belongs to one LRU list at a time; “private and shared LRU” names alternative domains, not two simultaneous memberships. Their configured and derived limits are:

| Policy input | Pinned behavior |
|---|---|
| Shared-list count | Hidden `num_LRU_chains`; zero means auto-size from `MAX_NTRANS`, reduce the count to keep roughly 1,000 buffers per list, and never use fewer than four. An explicit value is capped at 1,000. |
| Private-list count | `num_private_chains`; in server mode, `-1` means `MAX_NTRANS + VACUUM_MAX_WORKER_COUNT`, `0` disables private quotas, and a positive value is clamped to at least four. Stand-alone mode uses no private lists. |
| Total list count | Shared plus private. Initialization allocates one contiguous LRU array for that total. |
| Shared zone targets | `lru_hot_ratio` defaults to 0.40 and `lru_buffer_ratio` to 0.05. Each is clamped to 0.05–0.90, and their sum is constrained to leave at least 0.05 for LRU3. |
| Private zone targets | Each private quota reserves 5% for LRU1 and 5% for LRU2; the remaining quota can age into LRU3. |

The maintenance path samples fix activity, clamps the pool-wide private share to 1%–99.8%, and smooths it over a ten-second interval. It applies that share to the currently resident population, distributes private quotas by each list's activity, caps one private quota at 5,000 pages and half the pool, then divides the remainder across shared lists with a minimum target of 50. These are revision-bound search and placement targets, not ownership limits: reaching a quota does not invalidate a fix and never makes an unsafe page eligible.

### LRU object, assignment, and membership lifetimes

The LRU objects do not come and go with transactions. `pgbuf_initialize_lru_list()` allocates one contiguous `PGBUF_LRU_LIST` array containing all shared indices followed by all private indices. Every list has one mutex; top/bottom and LRU1/LRU2 boundaries; one victim hint; zone/candidate counts; thresholds, quota, ticks, flags, and its immutable array index. The array and mutexes live from page-buffer initialization until `pgbuf_finalize()`.

A private list's **context assignment** is shorter than the object lifetime. `pgbuf_assign_private_lru()` chooses an idle list with the fewest pages when possible, otherwise the least-active list, and increments that list's session count. `pgbuf_release_private_lru()` decrements the session count and resets activity when the last assignment leaves. It does not destroy the list object or immediately empty its resident BCBs. Several contexts can therefore be assigned the same private list under pressure; “private” is a quota/locality domain, not exclusive ownership of every member.

A BCB's **membership lifetime** is shorter again. It has only one `prev_BCB`/`next_BCB` pair, and its atomic `flags` value encodes exactly one zone plus one 16-bit LRU index. Add helpers assert that the BCB is not already in an LRU, lock the target list, link it, and atomically publish one index/zone. Removal under that list's mutex clears both links and changes the zone to `PGBUF_VOID_ZONE`. Private-to-shared movement is explicitly remove-then-add, so the BCB passes through VOID instead of belonging to both lists. Zone/index assertions, counters, victim hints, and `pgbuf_lru_sanity_check()` detect protocol violations in diagnostic builds.

Source: structures at `src/storage/page_buffer.c:499-623`; array initialization at `src/storage/page_buffer.c:5744-5800`; finalization at `src/storage/page_buffer.c:1921-1985`; add/remove/move at `src/storage/page_buffer.c:9695-9879,10200-10415`; encoded zone/index update at `src/storage/page_buffer.c:15900-16030`; private assignment/release at `src/storage/page_buffer.c:14513-14650`.

First unfix is also policy-visible. With the analyzed default AOUT-disabled path, a newly materialized BCB enters the top of its assigned private list when it has a private domain; otherwise it enters the middle of a shared list. On later zero-crossing unfixes, LRU1 remains hot without being boosted, LRU2 is boosted only after it is old enough, and ordinary reuse boosts an LRU3 page. Zone adjustment ages pages from LRU1 through LRU2 into LRU3.

### How the victim search assigns priority

There is no scalar “victim priority” stored on every BCB. Priority is the composition of three ordered decisions:

1. **Domain order:** search the caller's own private list first when it is over quota, then advertised other private lists, then shared lists, and finally its own under-quota private list. If the own list is materially over quota, the other-private step consumes only the big-private queue; shared search still follows in the pinned control flow.
2. **Recency inside a list:** inspect only LRU3, beginning at its victim hint or bottom and scanning at most 1,000 candidates toward newer entries. Fixed or avoid-victim BCBs are skipped; the scan uses a nonblocking BCB lock while holding the LRU mutex.
3. **Safety override:** after the policy finds a candidate, the final BCB-protected identity, ownership, flag, dirty/flush, and list-state checks can reject it. Hard eligibility always outranks policy preference.

Direct-victim waiters have a separate queue priority: vacuum workers and threads already holding a hot or contended page use the high-priority queue; other waiters use the low-priority queue. That decides which waiter receives a produced candidate, not whether the candidate is safe.

Source: zone semantics at `src/storage/page_buffer.c:185-200`; limits at `src/storage/page_buffer.c:1071-1118`; structures and list state at `src/storage/page_buffer.c:560-773`; initialization at `src/storage/page_buffer.c:5744-5903,13942-13985`; placement and aging at `src/storage/page_buffer.c:6636-6994,9695-10197`; victim ordering and scan at `src/storage/page_buffer.c:9067-9538`; quota policy at `src/storage/page_buffer.c:14251-14511`; parameter defaults at `src/base/system_parameter.c:1794-1829,3754-3777,4171-4182`. Detailed routing: [CUBRID LRU/victim fact sheet](../../../pgbuf-analysis/research/cubrid-lru-victim.md).

### How a caller finds another private list

![Cross-private victim discovery and LRU zone movement](../assets/lru-cross-search-and-aging.svg)

The current transaction does not enumerate other transactions, discover their session objects, or lock every private LRU. Candidate-producing paths advertise **LRU array indices**:

1. When an eligible clean BCB contributes to a list's LRU3 candidate count, `pgbuf_lru_add_victim_candidate()` updates the hint/count. A shared list is advertisable immediately; a private list is advertised when it is over quota. Quota adjustment also republishes qualifying lists.
2. `pgbuf_lfcq_add_lru_with_victims()` atomically sets `PGBUF_LRU_VICTIM_LFCQ_FLAG`, preventing duplicate normal enlistment, then pushes the integer index into a lock-free circular queue. Private, big-private, and shared indices use separate queues; the regular queue capacities are twice their list counts.
3. `pgbuf_lfcq_get_victim_from_private_lru()` consumes the big-private queue first. If the caller is not restricted and that queue is empty, it consumes the regular private queue. The integer selects `pgbuf_Pool.buf_LRU_list[lru_idx]`; no transaction lookup occurs.
4. Only then does `pgbuf_get_victim_from_lru_list()` lock that one list's mutex, inspect at most 1,000 LRU3 entries, and use nonblocking BCB try-locks. The index is requeued when candidates and quota conditions still justify more searches; otherwise the enlistment flag is cleared so a future candidate/quota adjustment can advertise it again.

This design can still contend: several victimizers, unfix/boost operations, and quota adjustment can meet on the same hot list mutex. But the cost is not “lock all other transactions' LRUs.” Queue selection is lock-free, one LRU mutex is held at a time, scan depth is bounded, and BCB locks are tried rather than waited for under the LRU mutex. A bottleneck claim is therefore plausible under concentrated pressure on a small number of advertised lists, but it requires mutex-wait/CPU evidence; the structure alone does not prove severe contention.

Source: queue allocation at `src/storage/page_buffer.c:1825-1898`; candidate advertisement at `src/storage/page_buffer.c:15674-15728,16370-16414`; other-private consumption/requeue at `src/storage/page_buffer.c:16417-16506`; bounded per-list locking and scan at `src/storage/page_buffer.c:9330-9538`; quota republishing at `src/storage/page_buffer.c:14380-14511`.

### Promotion and demotion rules in one table

| Current state or event | Pinned transition |
|---|---|
| New BCB, private domain, analyzed default AOUT disabled | First zero-crossing unfix inserts at private LRU1 top. |
| New BCB without a private domain | First zero-crossing unfix inserts at shared LRU2 middle. |
| LRU1 ordinary zero-crossing unfix | Keep position; record activity, with rare private-to-shared movement. No boost is needed because it is already hot/non-victim. |
| LRU1 exceeds `threshold_lru1` | Zone adjustment moves the oldest LRU1 edge into LRU2 until the count fits. |
| LRU2 ordinary zero-crossing unfix | Boost to LRU1 top only if old enough; a very recent repeated fix does not earn promotion. |
| LRU2 exceeds `threshold_lru2` | Zone adjustment moves the oldest LRU2 edge into LRU3 and updates candidate count/hint when eligible. |
| LRU3 ordinary zero-crossing unfix | Boost to LRU1 top; vacuum/direct-victim paths have explicit exceptions. |
| Private BCB fixed from a different private context, or hot and old enough | Remove from its private list, pass through VOID, add at shared LRU2 middle. |
| LRU3 clean and hard-eligible under protected recheck | Detach to VOID and hand to victimization/direct assignment. |

For private lists, LRU1 and LRU2 thresholds are each 5% of that list's current quota. For shared lists, thresholds use the configured 40%/5% defaults against the derived shared target. The remaining tail is LRU3; quota is not a fixed allocation of physical BCBs and does not prevent temporary overage.

Source: zero-crossing placement and movement at `src/storage/page_buffer.c:6636-7040`; add/adjust/boost at `src/storage/page_buffer.c:9695-10353`; quota thresholds at `src/storage/page_buffer.c:14251-14511`.

## No free BCB: the allocation progress loop

![Allocation progress loop when no free BCB is immediately available](../assets/allocation-progress.svg)

A cold miss needs a frame, and "the free list is empty" is sometimes described as the start of an infinite wait. The pinned allocator is a loop with bounded exits, not an open-ended wait:

1. **Invalid list first.** `pgbuf_allocate_bcb()` takes a BCB from the invalid (free) list when one exists. Those BCBs are used by nobody and need no flush or recheck.
2. **Victim search.** Otherwise `pgbuf_get_victim()` searches the LRU lists in a fixed order: the thread's own private list when it is over quota, then other private lists, then the shared lists, and finally the thread's own private list even under quota as a last resort. A found candidate still passes the [core eligibility gate](../learning/05-replace-one-frame.md) under the BCB mutex before it is reused.
3. **Wait for a direct victim (server mode).** If nothing is eligible and the page-flush daemon is available, the thread enqueues itself in the direct-victim waiter queue—high priority for vacuum threads and for threads that hold a hot page or a page others are waiting on, low priority otherwise—wakes the page-flush daemon, and sleeps with the same latch timeout used by latch waiters. Producers of direct victims are victim flush, post-flush, LRU direct assignment, and vacuum unfix in the LRU3 zone.
4. **Resume and revalidate.** A thread resumed with an assigned BCB locks it and revalidates. If another thread fixed the page in between, the assignment is revoked and the allocator retries the wait with high priority. An interrupt or shutdown un-assigns any BCB and returns `ER_INTERRUPTED`. A timeout ends the wait with an error and no frame.
5. **No daemon.** In stand-alone mode or during recovery, the thread flushes synchronously and searches the LRU lists again.
6. **Explicit failure.** If no BCB was produced and no earlier error is set, the allocator reports `ER_PB_ALL_BUFFERS_DIRTY` and the fix returns without a page pointer.

So an empty free list starts a progress protocol whose every path ends in an assignment, a retry, an interrupt, a timeout, or an explicit error. Two limits remain. The source's own comment acknowledges that a waiter depends on producers and describes a theoretical "forgotten waiter" whose only exit is the timeout; the [uncertainty registry](../unresolved-or-version-sensitive-findings.md) records that fairness and starvation bounds for direct victims are not proved. And the timeout, queue priorities, and search order are Implementation policy that another revision may change.

Source: allocation loop at `src/storage/page_buffer.c:8181-8403`; victim search order at `src/storage/page_buffer.c:9067-9265`; direct-victim consumption and revocation at `src/storage/page_buffer.c:15592-15660`; high-priority classification at `src/storage/page_buffer.c:11734-11790`.

## Direct victim assignment and revocation

Direct victims are a progress mechanism for allocators already waiting for a frame. A provider assigns an eligible BCB to a waiting thread; the consumer later locks and revalidates it. If an active worker fixed the page again in the intervening window, invalidation revokes the assignment and the allocator asks for another candidate.

The direct-victim flag is therefore a reservation, not permission to bypass hard predicates. Source: `src/storage/page_buffer.c:15420-15627`.

## Victim flush and post-flush coordination

Dirty frames cannot pass ordinary victim eligibility, so pressure can wake the page-flush path. Flush snapshots one generation using the [core generation model](../learning/04-flush-one-generation.md). Under configured pressure, a successfully submitted snapshot may be queued to post-flush processing, which rechecks whether the BCB is still clean, unfixed, in the victim zone, and policy-eligible before direct assignment.

A newer dirty generation G+1 defeats assignment even though G completed: post-flush must not turn old-generation completion into reuse of new resident bytes. Victim flush and post-flush are progress coordination layered on generation correctness.

Source: flush handoff at `src/storage/page_buffer.c:10925-10952`; post-flush assignment at `src/storage/page_buffer.c:15489-15556`.

## Daemons: ownership is source-visible, cadence is version-sensitive

In server mode, the pinned module nominally registers four daemon objects after recovery makes them available. Stand-alone mode has no page-buffer daemons and uses synchronous progress instead.

| Daemon | Pinned work and wake cadence |
|---|---|
| Maintenance | Adjusts private/shared quotas and maintains direct-victim progress every 100 ms. |
| Page flush | Wakes on demand or after `page_bg_flush_interval` (1,000 ms by default), then may loop while pressure still calls for victim flushing. A nonpositive interval makes it event-driven. |
| Post-flush | Rechecks completed flush candidates and hands eligible ones to waiters; adaptive waits are 1, 10, or 100 ms, returning to the fast interval when assignment work is found. |
| Flush control | Adds I/O tokens from elapsed time every 50 ms. Its daemon can be absent when flush-control initialization is unavailable. |

Daemon count, ownership, and cadence are version-sensitive implementation policy, not caller guarantees. Wake thresholds, periods, priorities, batch sizes, and quota formulas must be rechecked on the target revision and configuration. Do not encode them into the fix/unfix contract.

Source: `src/storage/page_buffer.c:16972-17255`; default page-flush interval at `src/base/system_parameter.c:1806-1829`.

## AOUT caveat: structures present, analyzed default disabled

AOUT data structures and code implement a ghost-history idea: remember recently evicted VPIDs so later insertion policy can react to reuse. However, the analyzed revision explicitly forces `data_aout_ratio` to zero pending an older issue, so AOUT is disabled in the analyzed default.

Do not summarize the pinned/current system unconditionally as “using 2Q.” On another revision, verify parameter initialization and runtime configuration before claiming the mechanism participates.

Source: AOUT initialization/use at `src/storage/page_buffer.c:5807-5903,10475-10720`; analyzed-default override at `src/base/system_parameter.c:9976-9986`. Deep reference: [CUBRID LRU/victim fact sheet](../../../pgbuf-analysis/research/cubrid-lru-victim.md).

## Runtime evidence: no eviction was forced

Existing cold/warm and pressure-adjacent observations are no-eviction evidence: they observed reuse/counters but did not force or identify an actual victim. This evidence does not prove a replacement schedule, LRU-zone choice, direct assignment, daemon cadence, or fairness. Use controlled pressure with explicit victim events before making those claims; see the [source inventory](../source-inventory.md).

## Review checklist

- Have all candidates passed core eligibility before policy is discussed?
- Is a private/shared/zone/quota statement pinned to this revision?
- Can a direct reservation be revoked after a new fix?
- Does post-flush preserve a newer dirty generation?
- Are daemon timing and formulas labelled version-sensitive?
- Is AOUT participation verified rather than inferred from data structures?
- Did runtime evidence force actual eviction?

## Related routes

- Practice: [LRU domains and zones](../questions/advanced.md#pgbuf-qb-037-what-do-lru-domains-and-zones-decide)
- Practice: [no free BCB](../questions/advanced.md#pgbuf-qb-040-what-happens-when-no-free-bcb-is-immediately-available) and [why the allocator reports no victim](../questions/maintenance-scenarios.md#pgbuf-qb-068-why-can-the-allocator-report-no-victim)
- Core prerequisite: [Flush One Generation](../learning/04-flush-one-generation.md)
- Core prerequisite: [Replace One Frame](../learning/05-replace-one-frame.md)
- Investigate a symptom: [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- Plan validation: [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- Deep source reference: [CUBRID LRU/victim](../../../pgbuf-analysis/research/cubrid-lru-victim.md)
