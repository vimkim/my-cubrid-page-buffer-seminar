# Why Read-to-Write Promotion Is a Separate Operation

**Level:** Evidence reference

**Question:** Why do B-tree and file-manager callers use `pgbuf_promote_read_latch()` after fixing a page for READ instead of calling `pgbuf_fix(..., PGBUF_LATCH_WRITE, ...)` for the same `VPID`?

**Source baseline:** CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`

**Evidence used:** Pinned source and repository history only. No runtime experiment is claimed.

## Short answer

The dedicated API does not merely provide a faster spelling of another fix. It expresses a different ownership operation:

- `pgbuf_fix(..., WRITE, ...)` is an **acquire-one-more-fix** operation. If a thread already owes `k` unfixes for the page, a successful nested call is intended to leave it owing `k + 1`.
- `pgbuf_promote_read_latch(&pgptr, ...)` is a **change-the-mode-of-my-existing-fixes** operation. It leaves the ownership debt at `k`, even if it must temporarily remove and reconstruct that debt while waiting.

Promotion also provides policies that the general fix interface does not: fail unless this thread is the only reader, or temporarily surrender its READ share and wait as the first promoter. It reports the intermediary unfixed state through an in/out `PAGE_PTR *`. These semantics are what B-tree needs for optimistic READ traversal followed by selective mutation; avoiding the full VPID lookup/fetch path when uncontended is a secondary implementation advantage.

The pinned ordinary-fix path contains what appears to be an accounting defect in its immediate nested READ-to-WRITE branch. That anomaly strengthens the rule not to treat an ordinary nested WRITE fix as a substitute, but it is **not** the historical reason the promotion API exists: repository history shows that nested WRITE fixes were explicitly prohibited before the promotion API was added for B-tree.

## The two calls have different contracts

Suppose the current thread already has one holder for BCB `A`, with `holder->fix_count == k`.

| Question | Another `pgbuf_fix(..., WRITE, ...)` | `pgbuf_promote_read_latch(&pgptr, condition)` |
|---|---|---|
| Input identifies | A `VPID`, fetch mode, latch mode, and wait condition | The already fixed `PAGE_PTR` itself and a promotion condition |
| Caller intent | Acquire one more fix, now requiring WRITE | Strengthen the existing fixed page from READ to WRITE |
| Debt after uncontended success | Intended to be `k + 1` | Remains `k` |
| When other readers exist | Conditional request fails; unconditional request removes the caller's `k` READ fixes, asks for `k + 1`, and joins the ordinary queue | `ONLY_READER` fails without surrendering the hold; `SHARED_READER` removes the caller's `k` READ fixes, asks for exactly `k`, and joins as the first promoter |
| Queue position and successful continuity | Ordinary tail; an earlier queued writer may modify the page before this request returns | Head, with at most one promoter; no queued writer interleaves before a successful promotion grant |
| Pointer failure signal after surrendering the hold | The new fix call returns `NULL`, but it cannot rewrite a previously held pointer supplied elsewhere by the caller | The in/out pointer is set to `NULL` if the promotion lost the hold and then failed |
| Normal cleanup | One additional `pgbuf_unfix()` is required after success | No additional `pgbuf_unfix()` is introduced |

The public declarations expose these as separate interface families: general fix takes a `VPID` and returns a `PAGE_PTR`, whereas promotion takes `PAGE_PTR *` and one of two `PGBUF_PROMOTE_CONDITION` values ([`page_buffer.h:205-209`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L205-L209), [`page_buffer.h:277-300`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L277-L300), and [`page_buffer.h:327-348`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L327-L348)).

### Ordinary nested WRITE fix: one more ownership debt

The normal fix entry performs parameter checks, optional page validation, hash lookup or BCB claim, BCB fix registration, latch acquisition, and post-acquisition bookkeeping before returning a page pointer ([`page_buffer.c:2250-2570`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2250-L2570)).

Inside `pgbuf_latch_bcb_upon_fix()`:

1. `request_fcnt` starts at `1`, representing the new request ([`page_buffer.c:6297-6343`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6297-L6343)).
2. If a current WRITE owner fixes again, both the BCB count and its holder count are incremented ([`page_buffer.c:6403-6411,6494-6509`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6403-L6411)).
3. If the caller holds READ while other readers exist, an unconditional WRITE request subtracts the caller's old `holder->fix_count`, then adds that old count to the new request's initial `1`. After wakeup the rebuilt holder receives `request_fcnt`, so the intended result is `k + 1` ([`page_buffer.c:6412-6437,6539-6632`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6412-L6437)).
4. It calls `pgbuf_block_bcb(..., false)`, which appends an ordinary waiter by walking to the tail of the singly linked BCB queue ([`page_buffer.c:6595-6603,7041-7099`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7041-L7099)).

The release path confirms that these counts are debts, not mere diagnostics: each `pgbuf_unfix()` decrements the thread holder once and the BCB `fcnt` once, removing the holder only when its count reaches zero ([`page_buffer.c:3062-3201,6128-6184,6636-6703`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L3062-L3201)).

### Dedicated promotion: transform the existing debt

`pgbuf_promote_read_latch()` starts from a page pointer the thread already holds and finds the corresponding holder ([`page_buffer.c:2842-2907`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2842-L2907)). Its two successful paths both preserve `k`:

- If the thread owns every current fix on the BCB, the function changes only `latch_mode` to WRITE. It does not change either fix count ([`page_buffer.c:2914-2933`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2914-L2933)).
- With other readers and `PGBUF_PROMOTE_SHARED_READER`, it saves `fix_count = k`, subtracts `k` from global `fcnt`, removes the holder, queues a WRITE request carrying exactly `k`, and reconstructs a holder with exactly `k` after wakeup ([`page_buffer.c:2934-3030`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2934-L3030)). Wakeup adds the queued `request_fix_count` back to BCB `fcnt` ([`page_buffer.c:7451-7543`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7451-L7543)).

This distinction matters even when `k == 1`: promotion means “the one existing fix is now WRITE,” while another fix means “there are now two successful acquisitions to release.” Substituting nested `pgbuf_fix()` would therefore require every B-tree success and cleanup path to gain one additional matching unfix.

## Promotion-specific contention semantics

### `PGBUF_PROMOTE_ONLY_READER`

If another reader contributes to BCB `fcnt`, `PGBUF_PROMOTE_ONLY_READER` returns `ER_PAGE_LATCH_PROMOTE_FAIL` before removing the caller's holder. It also fails if another promoter is already first in the queue ([`page_buffer.c:2914-2951`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2914-L2951)). This is not the same choice as general conditional/unconditional latch acquisition: it is a B-tree-visible statement that this multi-page operation may proceed only if promotion can be obtained under the sole-reader condition.

The B-tree source explains why. Insert traversal normally uses READ on non-leaf nodes and promotes only if a split or maximum-key update becomes necessary. The current/parent page uses `ONLY_READER` to avoid a multi-page dead-latch cycle among threads holding overlapping READ-latched pages; on failure, traversal restarts with WRITE latches ([`btree.c:28324-28344,28638-28668`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L28324-L28344)). Delete uses the same level-sensitive restriction for merge candidates ([`btree.c:31679-31694,31971-31985`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L31679-L31694)).

### `PGBUF_PROMOTE_SHARED_READER`

When waiting is allowed, the promotion request is inserted at the head rather than appended at the ordinary tail. The code asserts that there is at most one promoter ([`page_buffer.c:2990-2999,7041-7081`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7041-L7081)). When the active readers drain, the last unfix invokes the wake routine while holding the BCB mutex; that routine grants a head WRITE waiter alone and restores its requested fix count before waking it ([`page_buffer.c:6713-6719,6853-6879,7451-7589`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7451-L7589)). A queued ordinary writer therefore cannot run between the promoter's READ observation and its successful WRITE grant.

The promoter is internally **unfixed by its own thread** while blocked: its holder and READ contribution are removed. That fact does not by itself make the page contents stale on successful promotion. The remaining active holders are READ holders and cannot mutate the page under the latch contract; the promoter is first in the queue; and the zero-count transition grants it WRITE under the same BCB mutex before ordinary queued writers ([`page_buffer.c:2955-3018`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2955-L3018), [`7041-7081`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7041-L7081), and [`7451-7589`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L7451-L7589)).

**Inference from the verified queue mechanics and caller control flow:** the protocol preserves the page bytes and the observations made under the preceding READ latch across a successful first-promoter handoff. Pinned B-tree code relies on that continuity. In both the root and child cases it obtains `node_header`, computes `need_split` and `need_update_max_key_len`, performs `PGBUF_PROMOTE_SHARED_READER`, and then uses the already obtained header and decisions for the mutation without refetching them ([`btree.c:28304-28409`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L28304-L28409) and [`btree.c:28601-28710`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L28601-L28710)). By contrast, substituting the ordinary tail-queued nested WRITE path would allow a previously queued writer to acquire and modify the page first, invalidating that intended continuity.

The API also refuses a second promoter because the implementation cannot guarantee that two promoters that both surrender their holds will still observe the same page state they initially fixed ([`page_buffer.c:2936-2951`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2936-L2951)).

### Why the pointer is an in/out parameter

If a shared-reader promotion has already removed the holder and then blocking fails, the function sets `*pgptr_p = NULL`. It also nulls the pointer if holder removal fails after the BCB count was reduced ([`page_buffer.c:2974-2999`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2974-L2999)). This prevents the caller from treating an address as still fixed after the promotion protocol failed to restore ownership. In contrast, `ER_PAGE_LATCH_PROMOTE_FAIL` is decided before the holder is surrendered, so that soft failure leaves the existing READ hold intact.

Repository history makes the intent unusually explicit: commit [`ff28bf22a`](https://github.com/CUBRID/CUBRID/commit/ff28bf22aae29580b1cc1b4257c1236cb28b81ef) changed the parameter from `PAGE_PTR` to `PAGE_PTR *` so promotion would “reflect intermediary unfixed state.” An ordinary `pgbuf_fix()` cannot provide this signal for a page pointer obtained by an earlier call because that older pointer is not one of its output parameters.

## What the B-tree optimization actually is

The pinned insert and delete helper constructors initialize `nonleaf_latch_mode` to READ ([`btree.c:663-729`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L663-L729) and [`btree.c:767-820`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L767-L820)). The algorithms then inspect page contents and request WRITE only when they discover a mutation that cannot be skipped:

- Insert promotes the root to create an overflow-key file only when a large key requires it, and rechecks whether another thread created the file after the stronger latch is obtained ([`btree.c:28074-28112`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L28074-L28112)).
- Insert promotes for a root split, node split, or maximum-key-length update. Promotion failure changes the traversal mode to WRITE and restarts from the root ([`btree.c:28335-28393,28627-28696`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L28335-L28393)).
- Delete promotes only after it finds a possible root or sibling merge. A failed opportunistic promotion may skip the merge; when space pressure crosses the force threshold, the operation restarts with exclusive traversal ([`btree.c:31679-31694,31806-31865,32066-32109`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/btree.c#L31806-L31865)).

Thus the primary algorithmic optimization is **optimistic READ-first traversal**: do not serialize every non-leaf visit as a writer when most visits only inspect the node. The dedicated API lets the uncommon mutation path transform its already-owned fix debt and apply an explicit retry/dead-latch policy.

There is also a narrower uncontended cost advantage. Promotion converts the already resolved `PAGE_PTR` directly to its BCB, locks that BCB, finds the holder, and changes the latch tuple. Another `pgbuf_fix()` repeats the general VPID/fetch path, including validation and resident lookup. This is a source-based performance inference, not a measured latency claim ([`page_buffer.c:2250-2489,2842-2933`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2250-L2489)).

Historical evidence supports that interpretation. Commit [`40b817bec`](https://github.com/CUBRID/CUBRID/commit/40b817bec2a7984e03071c3b1d9cae27d7d2bf4c) introduced latch promotion specifically for B-tree insert/delete and changed traversal sites from direct WRITE fixing toward READ-first traversal plus conditional promotion. It followed commit [`076bf0114`](https://github.com/CUBRID/CUBRID/commit/076bf011458615c7262c56f5e4fe999e8d1459ae), whose subject and added assertions explicitly prohibited nested WRITE-mode fix. The separate operation therefore predates, and was designed independently of, the pinned ordinary-fix branch that now appears to perform an implicit upgrade.

## Pinned caller inventory

The pinned tree has eleven syntactic promotion calls in B-tree and one in file manager. They fall into seven decision regions:

| Owner and decision region | Calls | Condition and failure policy |
|---|---:|---|
| Insert root: large key needs an overflow-key file | `btree.c:28079` | `SHARED_READER`; on promotion failure, unfix and refix root WRITE |
| Insert root: split, max-key update, or root-as-leaf mutation | `btree.c:28372` | `SHARED_READER`; on failure, restart traversal in WRITE mode |
| Insert advance: current parent must split | `btree.c:28645` | `ONLY_READER`; on failure, release current/child and restart WRITE to avoid multi-page dead-latch |
| Insert advance: child must split or update max-key length | `btree.c:28675` | `SHARED_READER`; on failure, release current/child and restart WRITE |
| Delete reaches a root that is also a leaf | `btree.c:31715` | `SHARED_READER`; on failure, restart WRITE |
| Delete root merge: root, left child, right child | `btree.c:31829,31834,31838` | Root `ONLY_READER`, children `SHARED_READER`; skip an optional merge or restart WRITE when merge is forced |
| Delete sibling merge: current, child, right sibling | `btree.c:32076,32082,32086` | Current `ONLY_READER`, child/sibling level-sensitive; skip or restart WRITE depending on merge urgency |
| Numerable file lookup discovers it must auto-allocate | `file_manager.c:8251` | `SHARED_READER`; on failure, unfix and refix the header WRITE, then recheck the allocation condition |

The file-manager sequence is particularly compact evidence for same-debt intent: it fixes the header READ once, promotes that pointer, and has one normal header unfix on exit; its fallback explicitly unfixes before performing a fresh WRITE fix ([`file_manager.c:8234-8289`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L8234-L8289) and [`file_manager.c:8372-8387`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L8372-L8387)). B-tree cleanup similarly releases each page pointer as one acquired page; replacing promotions with additional successful fixes would require auditing and changing all those release paths, not just substituting a function name.

## The immediate nested-fix `fcnt` anomaly

The pinned code's “only owner” branch for an ordinary READ-held `pgbuf_fix(..., WRITE, ...)` is internally inconsistent with the surrounding accounting:

1. The branch is entered when `old_impl.impl.fcnt == holder->fix_count`.
2. It changes the latch to WRITE but assigns global `new_impl.impl.fcnt = 1` rather than incrementing the old global count.
3. The common success block then executes `holder->fix_count++`.

These statements are at [`page_buffer.c:6403-6421`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6403-L6421) and [`6494-6509`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6494-L6509). Starting from the smallest reachable ownership state, global `fcnt = 1` and holder `fix_count = 1`, the branch appears to produce:

```text
before nested WRITE fix     BCB fcnt = 1    holder fix_count = 1    latch = READ
after branch CAS            BCB fcnt = 1    holder fix_count = 1    latch = WRITE
after common success        BCB fcnt = 1    holder fix_count = 2    latch = WRITE
```

That disagrees with both possible interpretations:

- If the operation is another successful fix, both counts should become `2`.
- If the operation is a same-debt promotion, both counts should remain `1`; however, the common block increments the holder and the general API still returns a new successful fix result.

The subsequent unfix logic makes the consequence concrete in static control flow. One unfix decrements the holder to `1` but global `fcnt` to `0`, changing the BCB to `NO_LATCH`; a second unfix then attempts to drive global `fcnt` negative and enters the defensive error/clamp path ([`page_buffer.c:6128-6184`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6128-L6184) and [`6636-6703`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6703)). Starting from `k > 1` widens the discrepancy.

Repository history is further evidence that `= 1` is suspicious rather than an alternative count model. Immediately before the atomic-latch conversion, the equivalent sole-holder nested-WRITE path incremented both `bufptr->fcnt` and `holder->fix_count`. Commit [`58cef8e01`](https://github.com/CUBRID/CUBRID/commit/58cef8e01fcf121acbe3a35b7249deda54217532) replaced that logic with the atomic tuple assignment. `git blame` attributes the pinned `new_impl.impl.fcnt = 1` line to that conversion.

This document therefore classifies the mismatch as a **source-visible candidate defect**, not a demonstrated production failure. Static source proves the ledger divergence if the branch is reached, but it does not prove that supported production callers take this nested-fix path. The historical prohibition of nested WRITE fixes and the current B-tree/file-manager use of the dedicated API make low or accidental reachability plausible. A decisive test should:

1. fix one BCB READ once and record BCB `fcnt` plus the current holder count;
2. call ordinary `pgbuf_fix()` for the same `VPID` with WRITE;
3. record both counts and latch mode;
4. unfix twice, recording state and any waiter handoff after each release;
5. repeat from two nested READ fixes and in both debug and release builds.

The canonical mutable status for this anomaly belongs in [`VS-18`](../unresolved-or-version-sensitive-findings.md), not in this research note.

## Maintainer conclusion

Do not replace `pgbuf_promote_read_latch()` with a nested WRITE `pgbuf_fix()` as a local simplification.

Such a replacement changes all of the following at once: ownership debt, cleanup count, VPID-versus-pointer identity path, queue priority, single-promoter exclusion, sole-reader failure policy, intermediary-pointer invalidation, and B-tree restart behavior. It would require a protocol redesign and caller-wide proof, not a call-site substitution. For the pinned source, the ordinary immediate-upgrade branch also requires independent validation before it can be treated as safe at all.
