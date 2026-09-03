# Private LRU indexes, assignment lifetime, and victim-search order

**Research question:** At CUBRID baseline
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, what does an LRU index mean,
why does the default example have 152 private LRUs, when are those objects and
their associations created and released, and in what order does allocation
search private, shared, and direct-victim sources?

**Evidence boundary:** This note reports **Verified mechanism** and
**Implementation policy** from the pinned first-party CUBRID source. It makes no
runtime performance or fairness claim. Exact list counts, assignment heuristics,
quota thresholds, scan order, queue priorities, and scan caps are replaceable
**Implementation policy**, not a caller-visible page-buffer contract. The hard
eligibility rechecks are **Verified mechanism** required by the pinned reuse
protocol.

## Short answer

- A BCB LRU index is the low 16-bit identifier of the one pool-global LRU
  descriptor whose intrusive list currently contains that BCB. Shared full
  indices are `[0, S)`; private full indices are `[S, S + P)`. A session or
  vacuum worker instead carries a private-local id `p` in `[0, P)`, converted by
  `S + p`. Neither form is a transaction-table index.
- `P = 152` is the ordinary server-default example, not a universal constant:
  `max_clients 100 + admin 1 + system transaction 1 +
  VACUUM_MAX_WORKER_COUNT 50 = 152` when HA is off and
  `num_private_chains = -1` requests automatic sizing.
- All `S + P` LRU descriptor objects are allocated and initialized once when the
  page-buffer pool starts and destroyed when it finalizes. A transaction start
  does **not** create 152 objects. Session creation borrows one existing
  private-local id; server-request threads copy it while executing work.
- Assignment prefers an unassociated private descriptor with the fewest BCBs;
  when none is idle it selects the least-active descriptor. Races are retried,
  then sharing is allowed. Session teardown decrements an association count but
  neither destroys the descriptor nor drains its BCBs.
- When INVALID is empty, the ordinary allocator tries: eligible own private,
  advertised other private, advertised shared, then own private even if under
  quota if it was skipped initially. If normal search fails in server mode with
  page-flush available, it waits for a revocable direct-victim reservation.
  Every actual reuse still requires protected clean/unfixed/waiter-free checks.

## 1. “LRU index” names three different namespaces

### The BCB's full LRU-array index

The page-buffer pool owns one `PGBUF_LRU_LIST` array. Shared descriptors occupy
full indices `0 ... S-1`; private descriptors occupy `S ... S+P-1`.
`PGBUF_LRU_INDEX_FROM_PRIVATE(p)` performs exactly `S + p`, while
`PGBUF_PRIVATE_LIST_FROM_LRU_INDEX(i)` subtracts `S`. A descriptor contains
list boundary pointers, counts, thresholds, quota, flags, and its full `index`;
it contains no transaction identifier and no exclusive-owner field.
([descriptor and index macros](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L584-L623),
[shared/private index domains](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1069-L1114))

A resident BCB has one pair of intrusive `prev_BCB`/`next_BCB` links and one
`flags` word. The low 16 bits encode the full LRU index and higher bits encode
LRU1/LRU2/LRU3 or INVALID/VOID plus other BCB flags. Therefore an in-LRU BCB
belongs to exactly one shared or private list at a time. The accessor asserts
that the BCB is in an LRU before interpreting those low bits; for INVALID or
VOID, “its LRU index” is not a valid membership fact.
([bit encoding](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L174-L216),
[BCB links and flags](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L510-L543),
[guarded accessor](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15988-L16011))

The 16-bit representation permits 65,536 encoded full indices. That is a
representation limit, not the configured private-list maximum and not the
1,000-node per-list victim scan cap. The inspected initializer does not show a
separate combined `S + P <= 65,536` guard.

### The context's private-local id

`SESSION_STATE.private_lru_index`, `VACUUM_WORKER.private_lru_index`, and
`THREAD_ENTRY.private_lru_index` store private-local `p`, not full `S + p`.
Page-buffer code enables private-LRU behavior only when private quota is enabled
and the thread field is not `-1`. The full list index used for BCB placement and
victim scanning is derived later.
([thread enable test](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1545-L1560),
[thread fields](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.hpp#L218-L230))

### The transaction index is unrelated

`THREAD_ENTRY.tran_index` is a separate integer field identifying the
transaction-table entry to which the thread belongs. `NULL_TRAN_INDEX` is `-1`,
the system transaction index is `0`, and the transaction table is expanded to
at least `MAX_NTRANS`. No page-buffer expression maps `tran_index` to an LRU
index. `MAX_NTRANS` influences the *automatic count* of descriptors, but an
individual transaction-table slot is not used to choose descriptor `p`.
([separate thread fields](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.hpp#L218-L230),
[`NULL_TRAN_INDEX`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/storage_common.h#L321-L327),
[system index](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/transaction_global.hpp#L26-L29),
[transaction-table sizing](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_tran_table.c#L391-L438))

The maintainable vocabulary is:

| Value | Domain | Meaning |
|---|---:|---|
| transaction index | transaction table | Current transaction descriptor slot; unrelated to list membership |
| private-local id `p` | `[0, P)` or `-1` | Context association with one private domain |
| full LRU index `i` | `[0, S+P)` while in LRU | Descriptor array slot stored in a BCB's flags and advertised to victimizers |

## 2. Why the pinned default example is 152

With `num_private_chains = -1`, server-mode page-buffer initialization uses:

```text
P = MAX_NTRANS + VACUUM_MAX_WORKER_COUNT
```

`MAX_NTRANS = css_get_max_conn() + 1 system transaction`.
`css_get_max_conn()` sums the configured normal clients, one reserved admin
connection, and HA-reserved connections. At the ordinary defaults,
`max_clients = 100` and `ha_mode = off`, so:

```text
normal client connections       100
admin connection                  1
HA-reserved connections           0
NUM_NON_SYSTEM_TRANS            101
system transaction                1
MAX_NTRANS                       102
VACUUM_MAX_WORKER_COUNT           50
automatic private LRUs P         152
```

([automatic private count](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13941-L13985),
[`MAX_NTRANS` expansion](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_common_impl.h#L48-L52),
[`max_clients` default](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1569-L1580),
[admin and HA reservations](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L83-L111),
[connection sum and HA formula](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.c#L157-L241),
[vacuum maximum](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.h#L121-L136))

### Configuration and build dependencies

The value is configuration- and build-dependent:

- `num_private_chains = 0` disables private LRUs. A positive explicit value is
  used, with values 1--3 floored to 4 by page-buffer initialization. Parameter
  validation caps explicit values at `CSS_MAX_CLIENT_COUNT + 50 = 4,050` at
  this revision. The automatic `-1` expansion is not clamped by that initializer.
  ([parameter definition](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L4171-L4182),
  [4,000 client compile-time maximum](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/connection_globals.h#L31-L36))
- Changing `max_clients` or HA topology changes `MAX_NTRANS` and therefore the
  automatic count. Changing page-buffer size or page size does not directly
  change `P`; those values do affect BCB count and automatic *shared* LRU count.
- `VACUUM_MAX_WORKER_COUNT = 50` is a compile-time capacity. The separate
  `vacuum_worker_count` parameter defaults to 10 and controls the created worker
  pool size, but the `P` formula still reserves 50 and vacuum initialization
  initializes/assigns all 50 worker records when vacuum is enabled.
  ([worker-count parameter](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3802-L3813),
  [all 50 worker records assigned](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L1244-L1277),
  [configured worker-pool size](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L1328-L1347))
- A non-`SERVER_MODE`/stand-alone build forces `P = 0`. Therefore “152 private
  LRUs” is specifically an ordinary server-mode, default-configuration example.

These are **Implementation policy** formulas. The correctness contract does not
require 152 lists.

## 3. Descriptor lifetime is not context or transaction lifetime

### Pool-owned descriptor objects

Page-buffer startup computes `P`, computes `S`, allocates one array of `S + P`
`PGBUF_LRU_LIST` objects, initializes every descriptor and mutex, and leaves all
lists empty. Pool finalization destroys all descriptor mutexes and frees that
single array. These objects therefore live for the page-buffer-pool lifetime.
([initialization order](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1713-L1787),
[descriptor allocation and initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5740-L5800),
[descriptor finalization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1921-L1981))

All BCB/frame pairs are also allocated at pool initialization, initially linked
on INVALID rather than any LRU. No transaction creates a BCB or LRU descriptor.
([BCB allocation and initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5554-L5669))

### Session association

Session state starts with `private_lru_index = -1`. Session creation calls
`pgbuf_assign_private_lru()` once and stores the returned local `p`; session
destruction calls `pgbuf_release_private_lru()` and resets the field. A server
request copies the session's `p` into whichever worker thread executes that
request, and worker-context retirement/recycling resets the thread field to
`-1`. This is a **session association** copied into an execution context, not an
allocation at transaction begin.
([session-state initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L300-L328),
[session teardown](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L331-L427),
[session creation assignment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L704-L745),
[request copy](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/server_support.c#L2069-L2087),
[thread reset](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry_task.cpp#L61-L110))

### Vacuum association

When vacuum is enabled, `vacuum_initialize()` calls the same assignment helper
for every one of the 50 preallocated `VACUUM_WORKER` records. A vacuum execution
context copies the worker record's id on creation and resets only the context
copy on retirement. The pinned source has no vacuum-side call to
`pgbuf_release_private_lru()`; the worker-record associations effectively remain
until page-buffer/vacuum shutdown. If vacuum is disabled, `vacuum_initialize()`
returns before these assignments.
([vacuum disable gate](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L1181-L1191),
[vacuum assignments](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L1244-L1277),
[context copy/reset](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L840-L907))

### Independent lifetimes

```text
LRU descriptor object:  page-buffer initialize --------------------> finalize
vacuum-worker association:       vacuum initialize ----------------> shutdown
session association:                  session create -----> session destroy
thread context copy:                     request/task ---> recycle/retire
BCB list membership:                         admit -> move -> detach/invalidate
fix/latch ownership:                             fix -> unfix
transaction:                              begin/commit, orthogonal to the above
```

A release only changes association accounting. It does not traverse, unlink, or
move the descriptor's BCBs. Those BCBs remain pool residents and may later move
because of ordinary final-unfix policy, quota adjustment, victimization, or
invalidation.

## 4. Exact private-id assignment, sharing, fallback, and release

`pgbuf_assign_private_lru()` is **Implementation policy** and executes as
follows:

1. If private quota is disabled, return `-1`.
2. Scan every private full index from `S` through `S+P-1`.
3. Among descriptors with `private_lru_session_cnt[p] == 0`, remember the one
   with the fewest total BCBs. Stop early if an empty descriptor is found.
4. In parallel, remember the descriptor with the smallest smoothed
   `monitor.lru_activity[full_index]`.
5. Prefer the zero-session candidate. If none exists, use the least-active
   candidate, atomically increment its association count, and share it.
6. For a nominally zero-session candidate, atomically increment the count. If
   the result is greater than one, another context took it concurrently; undo
   the increment and retry while `retry_cnt++ < 5`. Once that retry allowance is
   exhausted, retain the increment and share the selected descriptor.
7. Attempt quota adjustment and return private-local `p`.

([exact assignment loop](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14513-L14602))

The selection does not inspect `tran_index`, session id, SQL transaction start
time, thread id, or a hash of any of them. Under the default capacity, idle
descriptors normally permit distinct associations, but uniqueness is not a
guarantee: oversubscription and the bounded race retry both lead to sharing.

`pgbuf_release_private_lru()` accepts a valid local `p`, decrements the
association count, and, when it reaches zero, clears the list's activity and
attempts quota adjustment. It does not destroy the descriptor and does not
change its BCB links. ([release](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14604-L14625))

## 5. Exact allocator victim order

### Before any LRU search

`pgbuf_allocate_bcb()` first pops INVALID. Only when no unused BCB exists does it
call `pgbuf_get_victim()`. Thus INVALID is an allocation source but not a
victimization domain.
([allocation order](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8180-L8245))

### One `pgbuf_get_victim()` call

The executable order is:

1. **Own private list, conditionally.** If the thread has local `p`, form full
   `S+p`. Search it only if LRU1+LRU2 exceeds quota, or if total list size exceeds
   quota and it currently reports at least one victim candidate. If this search
   fails, mark it searched. For non-vacuum contexts, if total size exceeds
   `quota + max(10, 1% of quota)`, restrict the next other-private attempt to the
   “big private” advertisement queue.
2. **An advertised other-private list.** This step exists only when private quota
   is enabled and page-flush is available. The helper first consumes the big-list
   queue; when unrestricted and that is empty, it consumes the regular private
   queue. The queues carry full integer LRU indices, not sessions or
   transactions. The regular queue is populated when an over-quota private list
   has victim candidates.
3. **An advertised shared list.** Consume one shared full index and scan it. With
   page-flush available this is one queue selection. Without page-flush, the
   code may keep consuming shared advertisements, guarded by shared-list-count
   and queue-cursor bounds.
4. **Own-private last resort.** If the thread has a private id and step 1 skipped
   it because it was under quota, scan that own list now. If step 1 already
   searched it, do not scan it again.

([own/other/shared/fallback branches](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9066-L9253),
[advertisement producer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15667-L15719),
[private queue consumer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16416-L16506),
[shared queue consumer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16508-L16578))

The comment above `pgbuf_get_victim()` says the three searches loop while
`victim_rich` is true, but the pinned executable body contains no such outer
loop and does not read `victim_rich`. Teach the executable sequence above, not
that stale comment.

There is a second source-shape caveat: the big-private queue is allocated empty,
and the only visible `produce()` in this file re-enqueues an index that the same
helper first consumed. This audit found no initial producer. Therefore the
restricted big-private path must not be taught as a proven progress or fairness
mechanism without additional runtime validation.
([queue allocation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1864-L1887),
[consume/re-enqueue only](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16434-L16489))

### What one selected-list scan does

`pgbuf_get_victim_from_lru_list(thread, full_index)` locks exactly one
descriptor, optionally demotes protected-zone nodes when a private list's
LRU1+LRU2 exceeds quota, starts at `victim_hint` or bottom, and follows
`prev_BCB` through LRU3 for at most 1,000 visited positions. It does not scan
all `P` descriptors and does not enumerate transactions. Each higher-level list
selection gets its own per-call 1,000-node budget.
([selected-list scan](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9314-L9538))

### Hard eligibility below the preference order

Own/private/shared order is preference. An ordinary selected-list candidate is
reusable only when all of these pinned checks hold:

- it is in that list's LRU3;
- none of DIRTY, FLUSHING, direct-victim, or invalidated-direct-victim flags is
  set;
- `fcnt == 0`, there is no BCB waiter, and, before mutex ownership, latch mode is
  `NO_LATCH`;
- the scanner can try-lock the BCB without blocking while holding the LRU mutex;
- the same eligibility predicate still passes under the BCB mutex;
- after detach to protected VOID, `pgbuf_victimize_bcb()` checks eligibility
  again before deleting the old VPID from the resident hash.

([invalidating flag mask](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L222-L265),
[fixed/waiter/latch predicate](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9255-L9312),
[try-lock, recheck, and detach](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9391-L9475),
[final victimization recheck](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8637-L8686))

These gates are the **Verified mechanism** that protects identity and bytes.
Quota and list order must never be presented as permission to bypass them.

### Direct-victim path comes after normal search failure

In server mode with page-flush available, a normal-search miss queues the
allocator in a high- or low-priority waiter queue, wakes page-flush, and sleeps.
A provider reserves an eligible `PGBUF_BCB *` in that waiter's per-thread slot
and wakes it. The allocator atomically takes the pointer, locks the BCB, rejects
a reservation invalidated by a concurrent refix, rechecks eligibility, and
detaches it if it is still in an LRU. A revoked reservation causes retry with
high priority. This is a revocable handoff, not a bypass around victim safety.
([wait after normal failure](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8247-L8355),
[assignment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15420-L15485),
[consume/recheck/detach](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15591-L15652),
[refix invalidation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2380-L2388))

Pinned direct-victim providers include:

- page-flush candidate collection offering one already-clean LRU3 BCB while it
  scans lists;
- post-flush offering a successfully cleaned, still-idle LRU3 BCB, except a
  private-list BCB whose list is not over quota;
- quota/zone adjustment offering a clean BCB as it falls into LRU3;
- vacuum final unfix offering an eligible LRU3 or newly VOID BCB;
- panic assignment scanning onward in an already locked LRU when the ordinary
  victim scan observes many low-priority waiters;
- the move-to-bottom path offering a still-VOID eligible BCB before insertion.

([flush-scan provider](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3780-L3847),
[vacuum final-unfix providers](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6740-L6844),
[VOID vacuum provider](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6933),
[zone-demotion provider](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10050-L10110),
[move-to-bottom provider](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10267-L10301),
[panic provider](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9540-L9605),
[post-flush provider and quota gate](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15487-L15556))

Without page-flush available, the allocator wakes/runs the flush path and then
calls normal victim search again; it does not enter the server direct-victim
wait protocol. ([no-daemon retry](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8357-L8367))

## 6. Documentation recommendation

**Recommendation: split, do not replace the canonical owner.** Keep Lesson 12
as the concrete one-BCB replacement story, and add a paired **Lesson 12B:
“Understand private-LRU indexes and victim search order”** in English and Korean.
The present Lesson 12 combines startup arithmetic, list states, a full BCB trip,
hard eligibility, private assignment/activity, migration, direct-victim
progress, and complexity. The reader's questions show that the private-index
namespace and lifetime model are being buried inside that larger story.

The split should be:

| Page | Owns in the teaching sequence | Must link elsewhere for detail |
|---|---|---|
| Lesson 12 | INVALID versus VOID, one BCB's admission/cooling/detach/rebind, and the hard eligibility spine | Advanced canonical page for formulas and full policy |
| Lesson 12B | Three index namespaces; why 152; descriptor/session/thread/BCB/transaction lifetimes; assignment and sharing; exact own/other/shared/fallback order; direct-victim as post-search fallback | Canonical Advanced Markdown and focused Evidence references |
| Lesson 12A | Dormant AOUT history only | Canonical AOUT Advanced page |

Move, rather than duplicate, Lesson 12's current detailed `#defaults`,
`#private`, most of `#progress`, and policy-order/cost material into 12B. Leave
one short “private is a domain, not ownership” bridge and the hard eligibility
table in Lesson 12. In 12B, use one visual timeline for the five independent
lifetimes and one numbered allocator flow; do not lead with quota-activity
formulas.

Canonical ownership remains:

- `advanced/replacement-progress.md`: canonical explanation of active
  replacement policy, assignment, order, and progress;
- `reference/private-lru-domain-hit-age-and-unfix-placement.md`: exhaustive
  private association/final-unfix evidence;
- `reference/replacement-policy-first-principles-audit.md`: count derivation,
  hard gates, complete search/direct-victim inventory, and source caveats;
- Lesson HTML: a bilingual teaching projection that links to those owners and
  does not become a second claim authority.

Because ADR 0004 requires paired teaching pages, 12B should be created in both
`en/lessons/` and `ko/lessons/`, connected by an `EN | KO` switch, entered in the
teaching manifest/indexes, and covered by existing aggregate validation. This
research task intentionally makes no HTML change.

## Maintainer conclusions

- Say **private LRU domain**, not “transaction LRU.”
- Always distinguish local `p` from full `S+p` and from `tran_index`.
- Say **152 descriptors are initialized at pool startup** and **a session borrows
  one id at session creation**; never say 152 lists are created at transaction
  start.
- Say **sharing is allowed** and **release does not drain pages**.
- Present list order as **Implementation policy** and the protected candidate
  gates as **Verified mechanism**.
- Disclose the stale `victim_rich` loop comment and unseeded big-private queue as
  pinned source-shape caveats rather than converting them into promised progress.
