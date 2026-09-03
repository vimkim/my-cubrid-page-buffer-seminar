# File-I/O Pacing Tokens and the Page-Flush/Post-Flush Handoff

**Research question:** At CUBRID baseline
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, what is the file-I/O token
bucket, and exactly what work can `pgbuf-page-flush` hand to
`pgbuf-page-post-flush`?

**Evidence boundary:** This note reports Verified mechanism and Implementation
policy from pinned source inspection. It makes no runtime scheduling or latency
claim. The reader-facing evidence owner remains the
[Page-Buffer Daemon Lifecycle Audit](../../reference/page-buffer-daemon-lifecycle-audit.md);
this scratch note narrows the two concepts that need clearer teaching language.

## Short answer

The token bucket is a shared, soft **post-write pacing mechanism**. Roughly
every 50 ms, `pgbuf-flush-control` replaces a page-count budget and broadcasts
to writers waiting after an OS write. A normal writer spends one token per page
and may wait when the current budget is gone, but it eventually proceeds after
ten wake/retry cycles; a writer holding the log critical section does not wait.
The bucket neither selects dirty pages nor grants correctness permission for an
I/O operation. [Token structure](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.h#L433-L441),
[post-write consumer path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L626-L668),
[wait and bypass rules](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L743-L829).

The post-flush handoff is a transfer of **remaining BCB-state completion work**,
not a transfer of disk I/O. After a page-flush submission succeeds, the page
image is already past the submission boundary. Under allocator pressure,
page-flush may enqueue the still-`FLUSHING` BCB pointer so post-flush can lock it,
revalidate its current eligibility, clear the old `FLUSHING` generation, wake
flush waiters, and perhaps reserve that clean BCB for one allocator. If the
handoff conditions are not met, page-flush performs the same completion locally.
[Submission and conditional handoff](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10781-L10952),
[post-flush drain](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15487-L15556).

## 1. The file-I/O token bucket

### State and lifecycle

`TOKEN_BUCKET` contains only a mutex, the current integer token balance, a
consumed-token counter, and a condition variable. There is no independent
maximum-capacity or refill-rate field in the bucket. `file_io.c` owns one static
instance and exposes it through a nullable global pointer. Initialization
creates the mutex/condition, starts `tokens` and `token_consumed` at zero, resets
the flush-control statistics, and publishes the pointer. Finalization first
clears the pointer, then destroys the synchronization objects. In non-server
builds these operations and token acquisition are no-ops.
[Structure](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.h#L433-L449),
[static owner](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L465-L473),
[initialize/finalize](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L671-L741).

`pgbuf_flush_control_daemon_task::initialize()` creates this state before the
daemon is created; an initialization failure prevents creation of that daemon.
The daemon has a 50 ms start-to-start looper. Its first gate-open execution only
records a timestamp. Later executions measure actual elapsed microseconds and
call `fileio_flush_control_add_tokens()`. The task's `retire()` finalizes the
bucket after the daemon loop has stopped.
[Task lifecycle](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17088-L17143),
[initializer and 50 ms looper](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17206-L17228).

### Producer/refill semantics

Each active update holds `token_mutex`, snapshots and clears
`token_consumed`, exports the preceding interval's page/log-page/token
statistics, calculates `gen_tokens`, then performs:

```c
tb->tokens = gen_tokens;
pthread_cond_broadcast (&tb->waiter_cond);
```

This is budget **replacement**, not an additive refill. Unused credit does not
accumulate across intervals. Therefore the useful meaning of “capacity” is the
newly generated interval budget; it varies with elapsed time and feedback and
has no separate fixed cap in `TOKEN_BUCKET`.
[Update, replacement, and broadcast](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L831-L894).

Adaptive control is enabled by default. It starts with the preceding interval's
generated budget. When tokens remain, it normally subtracts 10% of the unused
balance; when the balance is exhausted, it grows by at least 50% of the prior
budget or by the page-buffer dirty-pressure suggestion. The result is floored
at 40 MiB/s expressed as pages over the measured interval. With adaptive
control disabled, the budget is instead the configured maximum page rate times
elapsed time; the pinned internal default is 10,000 pages/s.
[Adaptive calculation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L896-L929),
[40 MiB/s floor and 50%/10% constants](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L281-L297),
[dirty-pressure suggestion](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14846-L14885),
[parameter defaults](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1830-L1865).

At 16 KiB per page, the adaptive floor is 2,560 pages/s, or approximately 128
tokens over a nominal 50 ms interval. The non-adaptive 10,000-page/s default is
approximately 500 tokens over 50 ms. These are examples, not fixed bucket
capacities: actual elapsed time, integer truncation, and adaptive feedback set
each replacement budget.

### Consumer and gating semantics

The direct page-write path is:

```text
fileio_write(..., FILEIO_WRITE_DEFAULT_WRITE)
  -> fileio_os_write(...) succeeds
  -> fileio_compensate_flush(..., 1 page)
       -> fileio_flush_control_get_token(..., 1)
```

`fileio_write_pages()` follows the same sequence for `num_pages`. The token
check is deliberately after the OS write, so missing tokens delay the caller's
subsequent progress rather than authorize the write that just finished.
[Single-page ordering](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L4122-L4204),
[multi-page ordering](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L4285-L4373).

Under the token mutex, a caller consumes all requested tokens when enough are
present. If only a partial balance exists, it consumes that balance and waits
for the remainder. A normal caller waits on `waiter_cond` and retries after at
most ten broadcasts. It then returns `NO_ERROR` even if some requested tokens
remain unmet. If the caller owns the log critical section, it consumes any
available tokens but returns immediately instead of waiting. If the global
bucket pointer is null, acquisition also returns immediately.
[Acquisition loop](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L750-L829).

`fileio_compensate_flush()` also increments a separate flushed-page counter and
may call `fileio_synchronize_all()` after the configured threshold. That
synchronization policy is adjacent to token pacing, but it is not a property of
the token bucket itself.
[Compensation and sync threshold](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.c#L626-L668).

### What the token bucket is not

- It is not the page-flush daemon's dirty-BCB queue; it stores only counters and
  a waiter condition, not page images or `PGBUF_BCB *` values.
- It is not a pre-I/O admission gate, strict rate ceiling, or correctness lock;
  token acquisition occurs after the OS write, log-CS owners do not wait, and
  ordinary callers give up waiting after ten retry cycles.
- It does not choose victim candidates, enforce WAL, set/clear BCB flags, or
  choose between DWB and direct I/O.
- It does not cover every write. `FILEIO_WRITE_NO_COMPENSATE_WRITE` skips the
  compensation call; the page-buffer direct branch selects that mode when DWB
  exists, and DWB's own data/home-volume writes shown here also use that mode.
  [Page-buffer write-mode choice](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10868-L10900),
  [DWB write modes](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/double_write_buffer.cpp#L2079-L2088),
  [DWB-file write mode](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/double_write_buffer.cpp#L2325-L2331).

## 2. What “page-flush hands completion to post-flush” means

### The word “completion”

Here, completion is not an asynchronous file-I/O callback and does not mean
that post-flush writes the page. It means finishing the CPU-side state transition
for one resident BCB generation after the page image has already been accepted
at the chosen submission boundary:

1. clear the old `PGBUF_BCB_FLUSHING_TO_DISK_FLAG`;
2. wake threads waiting for that BCB's flush;
3. under current allocator pressure, try to reserve the now-clean BCB directly
   for one waiter.

With DWB active for a permanent page, successful submission can mean DWB has
accepted the stable image; the home-volume write may occur downstream. Without
DWB, it means the direct `fileio_write()` returned successfully. Post-flush
issues no second write in either case.
[DWB/direct submission branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10868-L10900),
[post-flush completion operations](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15487-L15556).

### Structures and ownership

The server-mode buffer pool owns three cooperating structures:

- `flushed_bcbs`: a lock-free `circular_queue<PGBUF_BCB *>` constructed with
  capacity 8,192 for pending post-flush work;
- high- and low-priority lock-free queues of allocator `THREAD_ENTRY *`
  waiters; and
- `direct_victims.bcb_victims[thread_index]`, one publication slot through
  which a chosen BCB is handed to its allocator.

[Pool structure and 8,192 constant](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L738-L752),
[pool fields](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L811-L824),
[allocation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1824-L1861).

`flushed_bcbs` carries a borrowed pointer to a pool-owned BCB. It does not move
or free the BCB or its page image. Publication transfers responsibility for
finishing the old `FLUSHING` state. The flag itself prevents ordinary
victimization before successful completion, and the consumer takes the BCB
mutex before inspecting or changing it.
[Flag meaning and victim mask](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L222-L262),
[consumer lock](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15504-L15553).

The queue is created with the page-buffer pool and deleted during pool
finalization. The post-flush daemon is created later with the page-buffer
daemon group and is stopped/joined before pool teardown, so a live daemon does
not outlast the queue or BCB table it references.
[queue destruction](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2060-L2085),
[daemon-group lifecycle](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17230-L17255),
[normal daemon shutdown ordering](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/boot_sr.c#L3086-L3114),
[later pool finalization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_tran_table.c#L580-L594).

### Exact producer path

```text
pgbuf-page-flush task
  -> pgbuf_flush_victim_candidates()
  -> candidate is still same VPID, dirty, cold, unfixed, not already flushing,
     and not WAL-blocked
  -> pgbuf_bcb_flush_with_wal(..., is_page_flush_thread = true)
       BCB mutex held
       -> set FLUSHING and clear the old DIRTY generation
       -> copy stable page image and saved LSA state
       -> unlock BCB
       -> force WAL boundary when needed
       -> submit to DWB or perform direct fileio_write()
       -> on success, test the four handoff conditions
```

[Candidate recheck and call](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L4031-L4105),
[generation setup, unlock, WAL, and submission](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10781-L10923),
[flag transition](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16076-L16126).

After successful submission, the function calls
`flushed_bcbs->produce(bufptr)` only when all four conditions hold:

1. `is_page_flush_thread` is true;
2. `pgbuf_Page_post_flush_daemon` exists;
3. at least one direct-victim allocator queue appears nonempty; and
4. the bounded `flushed_bcbs` queue accepts the pointer.

On success, the producer leaves the BCB unlocked and still in its completion
state, wakes post-flush, and returns. If any condition is false—including a
full queue—the same page-flush caller locks the BCB, calls
`pgbuf_bcb_mark_was_flushed()`, wakes its flush waiters, and returns with local
completion finished.
[Four-way branch and fallback](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10925-L10952).

Source-wide search at the pinned revision finds this as the only producer of
`flushed_bcbs`; `pgbuf_assign_flushed_pages()` is its only consumer. Neighbor
flushes reached from the page-flush candidate loop also pass
`is_page_flush_thread = true`, so each successfully submitted neighbor can
independently take the same branch.
[Neighbor call path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12044-L12183).

The producer-side source comment says the “page buffer maintenance thread” will
process the queued BCB, but the executable path wakes
`pgbuf_Page_post_flush_daemon`, whose callback invokes the sole consumer. The
comment is stale or imprecise; the implementation makes post-flush the actual
consumer.
[Comment and actual wake](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10925-L10937),
[post-flush callback](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17070-L17085).

### Exact consumer path and the BCB's next owner

`pgbuf-page-post-flush` uses an increasing 1 ms, 10 ms, 100 ms looper followed
by wake-only sleep. Its task passes through the boot gate, calls
`pgbuf_assign_flushed_pages()`, and resets the looper to its fast interval if at
least one item was consumed. The page-flush producer explicitly calls
`wakeup()` after successful publication.
[Task and reset](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17070-L17085),
[looper construction](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17182-L17204).

The consumer drains until `consume()` fails. For each BCB pointer it locks that
BCB and rechecks present state, because the page may have been fixed, dirtied,
or heated since submission. Direct assignment is attempted only when:

- no victim-invalidating flag other than the old `FLUSHING` flag is set;
- the BCB has zero fixes;
- it remains in the LRU victim zone; and
- if it belongs to a private LRU, that list remains over quota.

Whether or not those checks permit assignment, post-flush finishes the old
`FLUSHING` state, wakes all BCB flush waiters, and unlocks the BCB.
[Drain and protected revalidation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15487-L15556).

If the BCB remains eligible, `pgbuf_assign_direct_victim()` consumes a live
allocator waiter, locks that thread entry, marks the BCB as a direct victim,
publishes it in `bcb_victims[waiter_thread->index]`, wakes the allocator, and
unlocks the thread entry. The allocator resumes in `pgbuf_allocate_bcb()`,
atomically takes its publication slot through `pgbuf_get_direct_victim()`,
locks/revalidates the BCB, removes it from its LRU, and continues to
`pgbuf_victimize_bcb()` for reuse.
[Post-flush-to-waiter publication](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15420-L15485),
[allocator resume](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8303-L8389),
[allocator takes and revalidates BCB](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15591-L15652).

### One lifecycle in plain language

```text
allocator cannot find a reusable BCB
  -> joins a direct-victim waiter queue and wakes page-flush
  -> page-flush selects and submits one cleanable cold generation
  -> successful submission leaves its BCB marked FLUSHING
  -> if pressure + daemon + queue room: publish BCB* and wake post-flush
       -> post-flush locks and rechecks current BCB state
       -> always finishes FLUSHING and wakes flush waiters
       -> if still eligible, publishes BCB* to one waiting allocator and wakes it
       -> allocator takes, revalidates, removes, and victimizes that BCB
     otherwise:
       -> page-flush finishes FLUSHING and wakes flush waiters itself
```

This is why “page-flush can hand completion to post-flush” is technically
correct but hard to read without naming the object and state: **after successful
page-image submission, page-flush may hand the still-`FLUSHING` BCB pointer to
post-flush, which completes BCB bookkeeping and may pass the clean frame to a
waiting allocator.** It never hands off the page write itself.

## Teaching constraints carried forward

- Introduce a token as “one page of post-write pacing credit,” then immediately
  say the credit is spent after the OS write.
- Replace the bare word “completion” with “finish the old BCB `FLUSHING` state,
  wake flush waiters, and possibly reserve the clean BCB for an allocator.”
- Keep DWB's submission boundary explicit: post-flush does not prove a
  home-volume write has completed.
- Present the queue branch beside its local fallback so readers do not infer
  that every page flush uses post-flush.
- Treat the 50 ms target, adaptive formulas, 8,192 queue capacity, and retry
  count as pinned Implementation policy, not page-buffer Interface contracts.
