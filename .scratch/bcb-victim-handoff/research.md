# What “BCB Victim Handoff” Means

**Question:** In this maintainer-guide set, what does “finish BCB state and
direct-victim handoff” mean at CUBRID baseline
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`?

**Evidence boundary:** This is a short term note. The longer page-flush analysis
is [already recorded here](../clarify-daemon-concepts/research.md#2-what-page-flush-hands-completion-to-post-flush-means).

## Answer

A **BCB victim handoff** is a revocable reservation of one pool-owned
`PGBUF_BCB *` for a thread waiting for a reusable frame. It does **not** copy
page bytes, perform a second write, or mean that the old resident page has
already been evicted.

```text
allocator cannot find a free/ordinary victim BCB
  -> allocator waits for a direct victim
  -> a provider reserves eligible BCB* and wakes that allocator
  -> allocator takes BCB*, locks it, and rechecks it
       still eligible -> detach old identity and reuse the frame
       fixed meanwhile -> revoke the reservation and retry
```

This is the `direct-victim handoff` named in the
[page-buffer daemon table](../../learning/04-flush-one-generation.md#four-independent-page-buffer-daemon-roles)
and summarized as “assignment is a reservation” in
[Replacement Progress](../../advanced/replacement-progress.md#what-happens-when-every-scan-fails).

## Pinned verified mechanism

1. After the INVALID list and ordinary victim search fail, server-mode
   `pgbuf_allocate_bcb()` enqueues its `THREAD_ENTRY *`, wakes page-flush, and
   waits. On a refixed/invalidated assignment it retries.
   ([`pgbuf_allocate_bcb()`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8181-L8389))
2. Under the BCB mutex, `pgbuf_assign_direct_victim()` marks an eligible BCB
   with `PGBUF_BCB_VICTIM_DIRECT_FLAG`, stores its pointer in the waiting
   thread's `bcb_victims[thread_index]` slot, and wakes that thread.
   ([assignment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15420-L15485))
3. The direct-victim flag also excludes the BCB from ordinary victim selection.
   If another worker fixes that resident page before consumption, the fix path
   replaces the flag with `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG`.
   ([flag mask](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L222-L262),
   [fix-side invalidation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2380-L2388))
4. `pgbuf_get_direct_victim()` atomically takes the pointer, locks the BCB, and
   rejects an invalidated reservation. Otherwise it clears the direct flag,
   rechecks victim eligibility, and detaches an LRU member to `PGBUF_VOID_ZONE`.
   The common victimization path then rechecks again and removes the old VPID
   from the hash before reuse.
   ([consume/recheck/detach](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15591-L15652),
   [final victimization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8638-L8686))

## Why post-flush appears in the phrase

After page-flush successfully submits a copied page generation, it may enqueue
the still-`FLUSHING` BCB pointer to post-flush—but only when post-flush exists,
an allocator is waiting, and the bounded queue accepts it. Otherwise page-flush
finishes locally.
([conditional handoff and fallback](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10925-L10952))

Post-flush locks the BCB and rechecks current dirty/fixed/LRU/quota state. It
always completes the old `FLUSHING` bookkeeping and wakes flush waiters; only a
still-eligible BCB is then handed to a waiting allocator through the reservation
protocol above. This is a transfer of **remaining BCB-state work**, not I/O.
([post-flush consumer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15489-L15556))

## Similar term, different path

The guide's ordinary **protected handoff** is not this queue protocol. An LRU
scan nominates a BCB, try-locks and rechecks it, detaches it, then returns it
still locked to the allocator in the same call.
([canonical explanation](../../learning/05-replace-one-frame.md#protected-handoff-in-concrete-steps),
[pinned scan](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9395-L9475))

## Classification

- **Verified mechanism:** flags, per-thread pointer publication, wakeup,
  consumer recheck, revocation, detach, and final victimization at `f799e05`.
- **Implementation policy:** queue sizes/priorities, provider choice,
  post-flush routing, LRU/quota thresholds, and daemon timing.
- **Inference/design rationale:** the handoff avoids repeated victim scans under
  pressure; it is not a caller-visible guarantee.
- **Not established:** any fixed latency or fairness bound for a waiter.

See the [source inventory](../../source-inventory.md#pinned-follow-up-audit-for-maintainer-questions)
and [uncertainty registry](../../unresolved-or-version-sensitive-findings.md#c-policy-and-timing-that-must-not-be-taught-as-contract)
for the maintained evidence boundaries.
