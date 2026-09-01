# Replacement Policy and Background Progress

**Level:** Advanced
**Prerequisites:** [Flush One Generation](../learning/04-flush-one-generation.md) and [Replace One Frame](../learning/05-replace-one-frame.md)
**Capability gained:** Analyze pinned replacement and background-progress policy without weakening the core victim-eligibility contract.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Implementation policy, and Runtime observation from the [pinned-source inventory](../source-inventory.md), exact ranges below, and the [replacement deep reference](../../../pgbuf-analysis/research/cubrid-lru-victim.md).

Eligibility comes before every mechanism on this page. A policy may decide where to look and how to make progress; only the [core eligibility gate](../learning/05-replace-one-frame.md) decides whether a frame is safe to reuse.

## Pinned implementation policy: domains, zones, and hints

The pinned revision distributes resident frames across private LRU domains assigned to active contexts and shared LRU domains. Each list uses LRU1/LRU2/LRU3 zones; the victim scan starts in the victim zone and may use a victim hint (`victim_hint`) to avoid rescanning known-ineligible candidates.

Quota policy adjusts private-list targets from activity and redistributes pressure toward shared lists. Each candidate queue, count, and hint accelerates search; none is an ownership proof. The scan still rejects flags/fix ownership and performs a final BCB-protected eligibility check before removal.

Source: structures and list state at `src/storage/page_buffer.c:560-773`; initialization at `src/storage/page_buffer.c:5744-5903`; ordinary selection at `src/storage/page_buffer.c:9293-9538`; quota policy at `src/storage/page_buffer.c:13942-14440`. Detailed routing: [CUBRID LRU/victim fact sheet](../../../pgbuf-analysis/research/cubrid-lru-victim.md).

## Direct victim assignment and revocation

Direct victims are a progress mechanism for allocators already waiting for a frame. A provider assigns an eligible BCB to a waiting thread; the consumer later locks and revalidates it. If an active worker fixed the page again in the intervening window, invalidation revokes the assignment and the allocator asks for another candidate.

The direct-victim flag is therefore a reservation, not permission to bypass hard predicates. Source: `src/storage/page_buffer.c:15420-15627`.

## Victim flush and post-flush coordination

Dirty frames cannot pass ordinary victim eligibility, so pressure can wake the page-flush path. Flush snapshots one generation using the [core generation model](../learning/04-flush-one-generation.md). Under configured pressure, a successfully submitted snapshot may be queued to post-flush processing, which rechecks whether the BCB is still clean, unfixed, in the victim zone, and policy-eligible before direct assignment.

A newer dirty generation G+1 defeats assignment even though G completed: post-flush must not turn old-generation completion into reuse of new resident bytes. Victim flush and post-flush are progress coordination layered on generation correctness.

Source: flush handoff at `src/storage/page_buffer.c:10925-10952`; post-flush assignment at `src/storage/page_buffer.c:15489-15556`.

## Daemons: ownership is source-visible, cadence is version-sensitive

The pinned module registers maintenance, page-flush, post-flush, and flush-control daemons. Their current loops divide list maintenance, dirty-victim propagation, post-flush handoff, and I/O token control.

Daemon ownership and cadence are version-sensitive implementation policy, not caller guarantees. Wake thresholds, periods, priorities, batch sizes, and quota formulas must be rechecked on the target revision and configuration. Do not encode them into the fix/unfix contract.

Source: `src/storage/page_buffer.c:16972-17298`.

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

- Core prerequisite: [Flush One Generation](../learning/04-flush-one-generation.md)
- Core prerequisite: [Replace One Frame](../learning/05-replace-one-frame.md)
- Investigate a symptom: [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- Plan validation: [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- Deep source reference: [CUBRID LRU/victim](../../../pgbuf-analysis/research/cubrid-lru-victim.md)
