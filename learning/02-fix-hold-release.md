# Fix, Hold, and Release: Borrowing a Resident Page

**Level:** Core
**Prerequisites:** [Contract and Objects](./01-contract-and-objects.md)
**Capability gained:** Trace a normal fix and matching release while accounting for global and per-thread ownership debt.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract and Verified mechanism, established by the [source inventory](../source-inventory.md) and the pinned source anchors below.

## The maintainer problem

A fix is successful only when temporary ownership has been granted and its matching release debt is understood. To audit that boundary, a maintainer must follow caller intent through lookup or materialization, latch grant, both ownership ledgers, borrowed use, and exactly one release.

## Start with caller intent: three separate choices

Fetch intent is caller knowledge, not a convenience hint. Before calling the Module, the caller states what it knows about allocation and residency, separately chooses how the resident bytes must be protected, and separately chooses whether an incompatible latch may wait. Latch mode and wait condition are independent choices: READ versus WRITE answers *what access is allowed*; conditional versus unconditional answers *what to do when that access cannot be granted immediately*.

| Choice | Question answered | Core examples and consequence |
|---|---|---|
| `PAGE_FETCH_MODE` | What does the caller know about the page's allocation or possible residency? | `OLD_PAGE` expects an allocated existing page. `NEW_PAGE` says allocation already happened and permits materialization without reading old bytes. `OLD_PAGE_IF_IN_BUFFER` asks only for an already-resident page. |
| `PGBUF_LATCH_MODE` | How may this borrower access the resident bytes? | `PGBUF_LATCH_READ` permits compatible readers; `PGBUF_LATCH_WRITE` requests exclusive page-content access. This choice does not say whether the call waits. |
| `PGBUF_LATCH_CONDITION` | May an incompatible request wait? | `PGBUF_CONDITIONAL_LATCH` rejects rather than joining the latch wait path. `PGBUF_UNCONDITIONAL_LATCH` permits the wait path, although a transaction configured for zero wait is converted to conditional behavior. |

Expected non-acquisition is part of some owner protocols. On an `OLD_PAGE_IF_IN_BUFFER` miss, `pgbuf_fix_release()` returns `NULL` because the caller explicitly declined materialization. A conditional conflict can also return without a grant. In either case there is no successful acquisition and therefore no release debt. `NULL` alone is not one universal error category: the caller must interpret it using the fetch/wait intent and the error contract for that interface.

**Pinned-source evidence:** the three input types are distinct at `src/storage/page_buffer.h:172-203`; validation and zero-wait conversion are visible at `src/storage/page_buffer.c:2260-2332`; the resident-only miss returns `NULL` at `src/storage/page_buffer.c:2408-2413`; and conditional rejection occurs without a grant at `src/storage/page_buffer.c:6560-6594`.

## One trace, two preparation paths, one postcondition

![Normal resident hit and cold miss converging on one fix contract](../assets/fix-contract.svg)

The visual deliberately follows the normal mutex-protected path. It shows where a normal resident hit and a cold miss do different preparation, then converge; the optimized READ path is an advanced continuation, not a prerequisite for understanding the contract.

1. **Locate.** A resident hit finds a BCB whose current `vpid` initially matches the request. A cold miss enters the VPID-keyed buffer-lock protocol. One thread becomes the load owner; a waiter sleeps, wakes, and retries lookup instead of receiving the owner's provisional BCB.
2. **Identity recheck 1 — after protecting a hit candidate.** Hash lookup checks the candidate's `vpid`, acquires the BCB mutex, and checks the `vpid` again. If reuse changed the identity in between, lookup releases the candidate and retries. This is the resident-hit stale-observation boundary.
3. **Materialize on a miss.** The load owner allocates a reusable BCB/frame, assigns the requested `VPID`, and obtains the old bytes from DWB or the data volume for `OLD_PAGE`. This protocol serializes resident-identity preparation; it does not prove exactly one physical device I/O.
4. **Identity recheck 2 — at convergence.** Hit and miss reach the common path with the BCB mutex held. The code sets the page header identity where the mode permits it, then checks the page-header VPID against the BCB identity. A mismatch exits without returning a borrowed pointer.
5. **Grant and commit debt.** `pgbuf_latch_bcb_upon_fix()` grants the compatible latch and updates global `fcnt` plus the current thread's holder. Ownership debt is committed for the successful fix when this helper returns `NO_ERROR` with both ledgers established. Only then may the common path return `PAGE_PTR`; a newly loaded BCB is also published and its VPID load lock is released before return.
6. **Identity recheck 3 — while releasing.** The mutex-based unfix path asserts that the BCB still has a non-null identity and that the page-header identity still agrees before it decrements global `fcnt`. This protects the release transition; the borrowed pointer itself must not be treated as an identity proof.

The common caller-visible postcondition is therefore independent of preparation: the requested page is resident, the requested latch is granted, this acquisition is represented in both ledgers, and one borrowed `PAGE_PTR` is returned with one release debt.

Pinned-source trace:

- Normal hit/miss branch, convergence, page-header check, grant, publication, and return: `src/storage/page_buffer.c:2342-2546`
- Protected hash-candidate VPID rechecks: `src/storage/page_buffer.c:7594-7722`
- VPID-keyed load owner/waiter protocol and wakeup: `src/storage/page_buffer.c:7981-8178`
- Cold-miss BCB assignment and DWB/data-volume materialization: `src/storage/page_buffer.c:8392-8634`
- Release-time BCB/page identity check and global decrement: `src/storage/page_buffer.c:6670-6703`

**Evidence boundary:** this source trace establishes resident-identity serialization and convergence, not one physical I/O, fairness among waiters, or every exceptional cleanup path. In particular, holder allocation occurs after an atomic latch/`fcnt` grant on some paths; its failure window remains candidate `VS-11` in the [uncertainty registry](../unresolved-or-version-sensitive-findings.md), not an established production defect.

## Two ledgers, one debt per acquisition

![Global replacement exclusion and per-thread release debt ledgers](../assets/ownership-ledgers.svg)

For the successful normal fixes in the example below, the two counters reconcile in total but answer different maintenance questions.

| Ledger | What it records | What a maintainer uses it to prove |
|---|---|---|
| BCB global `fcnt` | Granted fixes on this BCB across all threads | A positive value excludes ordinary replacement reuse. It does not identify which thread owes which releases. |
| Current thread's holder `fix_count` | This thread's nested granted fixes on one BCB | The thread's release debt and whether its holder record remains live. It does not summarize other threads. |

Suppose thread A fixes one resident page twice under a compatible latch and thread B fixes it once. The BCB's global `fcnt` is 3; A has one holder whose `fix_count` is 2; B has one holder whose `fix_count` is 1. Nested fixes can return the same `PAGE_PTR`, but they create separate call-level debt. Counting unique pointer values would undercount ownership.

**Invariant:** every successful acquisition creates exactly one release debt. One normal `pgbuf_unfix()` decrements the calling thread's nested holder count and the BCB's global count by one. The holder record is removed when that thread's count reaches zero; the BCB may become latch-idle when global `fcnt` reaches zero. Neither event means the resident page was flushed or evicted.

Pinned source separates the holder structure from the BCB atomic state at `src/storage/page_buffer.c:460-488`. Grant paths increment global `fcnt` and either create a holder or increment its nested count at `src/storage/page_buffer.c:6277-6634`. Release first decrements the current thread's holder at `src/storage/page_buffer.c:6128-6184`, then decrements global `fcnt` and handles the zero-count transition at `src/storage/page_buffer.c:6636-6883`.

## Release variants: consume debt at the owning protocol

Use the release form paired with the acquisition protocol; do not treat wrappers or emergency cleanup as extra releases.

| Release form | Canonical use | Debt rule |
|---|---|---|
| `pgbuf_unfix()` | Normal release when the caller holds a non-`NULL` borrowed page | Consumes exactly one successful normal-fix debt. |
| `pgbuf_unfix_and_init()` | Normal release plus assignment of the caller's local page variable to `NULL` | Calls `pgbuf_unfix()` once, then clears the local variable. It prevents accidental local reuse; it does not consume additional debt. |
| `pgbuf_unfix_and_init_after_check()` | Cleanup when the local page variable may be `NULL` because acquisition did not succeed | Consumes one debt only when the pointer is non-`NULL`, then clears it. A successful acquisition still requires this branch to run. |
| `pgbuf_ordered_unfix()` | Release through a `PGBUF_WATCHER` owner protocol | Consumes watcher-owned debt. Ordered release/reorder/refix semantics belong to [advanced acquisition](../advanced/acquisition-concurrency.md). Do not substitute raw unfix without auditing the watcher. |
| `pgbuf_unfix_all()` | Request-end diagnostic cleanup for debts that should already have been paired | Not a normal caller strategy and not evidence that individual success/error exits are balanced. |

The public wrappers are defined at `src/storage/page_buffer.h:64-92`; normal release is traced at `src/storage/page_buffer.c:3062-3201`; request-end cleanup is at `src/storage/page_buffer.c:3276-3354`; and the watcher-owned release entry is at `src/storage/page_buffer.c:13471-13531`.

## Borrowed pointers end with ownership

`PAGE_PTR` is an address into reusable frame storage. Any record pointer, slot pointer, key pointer, or offset-derived view computed from it is page-local and shares the same ownership boundary. Once the caller's final applicable ownership ends, neither the page pointer nor a derived pointer may be used. Address equality after a later fix does not establish the same `VPID`, frame generation, record layout, or observation.

Nested ownership needs precise language. If one thread has holder `fix_count == 2`, its first unfix consumes one debt but one granted ownership remains; the thread has not yet reached its final ownership boundary. The second matching unfix ends that thread's remaining ownership. The two fixes may have returned the same `PAGE_PTR`; same address does not merge separate acquisition debt.

Blocking promotion and ordered watcher protocols may temporarily release and reacquire ownership, so they require explicit revalidation of page-local observations. This core page names that rule; [Acquisition Concurrency and Multi-page Ownership](../advanced/acquisition-concurrency.md) owns those mechanisms.

## Advanced mechanisms deliberately deferred

This page gives the ordinary contract a stable shape before concurrency optimizations and multi-page protocols are introduced. Continue to [Acquisition Concurrency and Multi-page Ownership](../advanced/acquisition-concurrency.md) for the lock-free READ hit and its memory-ordering proof, blocking promotion and its release/reacquire boundary, and ordered watchers with release/reorder/refix. Those mechanisms must preserve the identity, debt, and pointer-lifetime invariants taught here; they are not alternative shortcuts around them.

## Understanding check: Predict–Locate–Explain

Scenario: a page is resident and currently has global `fcnt == 0`. Thread A successfully fixes it twice with `OLD_PAGE`, READ, and unconditional wait. Thread B then successfully fixes the same page with a compatible READ. The three calls return equal pointer values. A unfixes once, B unfixes once, and A finally unfixes once.

### Predict

Without reading the answer, write the global `fcnt`, A's holder `fix_count`, and B's holder `fix_count` after each successful fix and each unfix. Mark when A may still use its borrowed page, when B may still use its borrowed page, and when neither thread may use any page-local pointer from this sequence.

### Locate

Annotate one bounded normal call path:

1. Label the three caller choices in `src/storage/page_buffer.h:172-203`.
2. Follow the normal hash hit through convergence and return at `src/storage/page_buffer.c:2342-2546`.
3. Mark the protected VPID recheck at `src/storage/page_buffer.c:7594-7722` and the common page-header check at `src/storage/page_buffer.c:2442-2472`.
4. Mark the global and holder increments, including nested acquisition, at `src/storage/page_buffer.c:6277-6537`.
5. Follow one debt through the holder decrement at `src/storage/page_buffer.c:6128-6184` and the global decrement at `src/storage/page_buffer.c:6636-6703`.

### Explain

Produce one reviewable artifact with two parts:

- an **annotated call path** from caller choices through locate, both acquisition identity checks, the debt-commit boundary, borrowed return, and matching release;
- a **debt ledger** with one row per event and separate columns for global `fcnt`, A's holder, B's holder, and pointer usability.

Finish with one sentence explaining why equal pointer addresses do not change the number of debts, and one sentence stating what the trace does not prove.

### Model answer

The annotated path for each normal hit is:

```text
VPID + OLD_PAGE + READ + unconditional
  -> hash candidate
  -> lock BCB, recheck candidate VPID                 [identity recheck 1]
  -> verify page-header VPID against BCB identity     [identity recheck 2]
  -> grant compatible READ latch
  -> increment BCB global fcnt and A/B holder count   [debt commit]
  -> return borrowed PAGE_PTR
  -> matching unfix: decrement caller holder, then global fcnt
```

The debt ledger is:

| Event | Global `fcnt` | A holder | B holder | Who still owns usable borrowed access? |
|---|---:|---:|---:|---|
| A fix 1 succeeds | 1 | 1 | — | A |
| A fix 2 succeeds | 2 | 2 | — | A, with two debts |
| B fix succeeds | 3 | 2 | 1 | A and B |
| A unfixes once | 2 | 1 | 1 | A and B |
| B unfixes once | 1 | 1 | removed | A only |
| A unfixes finally | 0 | removed | removed | Neither; all page-local pointers from these borrows are dead |

Thus the global `fcnt` values rise through 1, 2, and 3 while the thread ledgers preserve who owes each release. Pointer equality is expected for borrows of the same resident frame and does not merge three successful calls into one debt. A's first unfix does not end all of A's access because one nested ownership remains; its final unfix does.

**Evidence boundary:** the pinned source proves the normal accounting transitions and the bounded identity checks. This exercise does not prove waiter fairness, the lock-free path's memory-ordering argument, or that `fcnt == 0` by itself makes the BCB a valid victim; replacement has additional predicates.

## Learning navigation

**Previous:** [Contract and Objects](./01-contract-and-objects.md)
**Next:** [Caller Completes Correctness](./03-caller-completes-correctness.md)

## Related routes

- [Change the Module Safely](../playbooks/change-safely.md)
- [Source and Caller Map](../reference/source-map.md)
- [Acquisition Concurrency and Multi-page Ownership](../advanced/acquisition-concurrency.md)
