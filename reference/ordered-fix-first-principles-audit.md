# Ordered Fix from First Principles

**Level:** Evidence reference

**Question:** What problem does Lesson 0011's ordered-fix protocol solve, and what does `pgbuf_ordered_fix()` actually do?

**Source baseline:** CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`

**Evidence used:** Verified mechanism from the pinned source only. No runtime experiment or later revision is used.

## Short answer

`pgbuf_ordered_fix()` prevents a page-latch wait cycle when one thread must hold several heap or overflow pages at once. It does not merely sort an in-memory list, and it does not force every request through an expensive release-and-refix sequence.

The protocol is:

```text
request one more page
        |
        v
try the ordinary fix without sleeping while other pages are held
        |
        +-- granted --------------------> attach the new watcher; done
        |
        +-- terminal error/zero-wait ---> return without reordering
        |
        `-- would have to wait
                 |
                 v
        identify held pages that sort after the request
                 |
                 v
        save their ownership receipts and fully unfix them
                 |
                 v
        sort {request + released pages}
                 |
                 v
        fix that set unconditionally in canonical order
                 |
                 v
        restore watcher links and tell callers which pages were released
```

The phrase **canonical order** means the tuple:

```text
(group header VPID, semantic rank, page VPID)
```

For the heap protocol, semantic rank is heap header, then normal heap page, then overflow page. A caller supplies the group and initial rank through a `PGBUF_WATCHER`; page buffer compares the tuples and performs the ownership transfer.

The essential safety rule is:

> A thread may wait for a later page while retaining earlier pages. Before it waits for an earlier page, it releases every reorderable page it holds later in the same global order.

Source: watcher/rank definitions at [`page_buffer.h:94-249`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L94-L249); tuple comparison at [`page_buffer.c:12186-12247`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12186-L12247); ordered fix at [`page_buffer.c:12250-13063`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12250-L13063).

## 1. The deadlock that ordinary multi-page fixing can create

Consider two pages with canonical order `A < B`:

```text
Thread T1                         Thread T2
---------                         ---------
holds B                           holds A
requests A unconditionally        requests B unconditionally
waits for T2                      waits for T1
       \                           /
        `------ latch cycle ------'
```

The page buffer cannot solve this by making a single READ or WRITE latch fairer. Each latch sees only its own BCB, while the cycle crosses two BCBs. The participating access method must use one common order for the whole set.

Ordered fix breaks the example as follows:

```text
1. T2 holds A and conditionally tries B. B is busy, so T2 does not sleep yet.
2. A sorts before requested B, so T2 is allowed to retain A and then wait for B.
3. T1 holds B and conditionally tries A. A is busy, so T1 does not sleep yet.
4. B sorts after requested A, so T1 saves and fully unfixes B.
5. T2 obtains B, completes its protected work, and releases A and B.
6. T1 obtains A and then refixes B. Its watcher reports that B crossed an unfixed window.
```

There is no cycle after step 4: only T2 can be waiting while holding the earlier page. The important operation is **release before sleep**, not sorting for its own sake.

The source repository's storage reference states the intended scope directly: ordered heap/overflow access carries group/rank/latch state in `PGBUF_WATCHER` to avoid latch-order deadlocks ([`src/storage/docs/buffer-io-durability.md:56-62`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/docs/buffer-io-durability.md#L56-L62)). The implementation first chooses an unconditional ordinary fix only when the thread has no other holder, or its sole holder is already for the requested VPID; otherwise it chooses a conditional ordinary fix ([`page_buffer.c:12340-12358`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12340-L12358)).

## 2. The exact order

`pgbuf_compare_hold_vpid_for_sort()` compares two `PGBUF_HOLDER_INFO` values in this sequence:

1. a page with a known group sorts before a page whose group is null;
2. group volume ID;
3. group page ID;
4. rank;
5. page volume ID;
6. page ID.

Source: [`page_buffer.c:12193-12247`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12193-L12247).

The public rank values are numeric and ordered:

| Rank | Value | Heap meaning |
|---|---:|---|
| `PGBUF_ORDERED_HEAP_HDR` | 0 | The heap header page |
| `PGBUF_ORDERED_HEAP_NORMAL` | 1 | An ordinary heap page |
| `PGBUF_ORDERED_HEAP_OVERFLOW` | 2 | An overflow page |
| `PGBUF_ORDERED_RANK_UNDEFINED` | 3 | Initialization/error boundary, not a valid attached rank |

Source: [`page_buffer.h:219-231`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L219-L231).

Two consequences are easy to miss:

- Rank is compared before the page's own VPID. Within one heap, the header sorts before every normal page even if its page number is larger. Likewise, every normal heap page sorts before every overflow page in that group.
- Different heaps are ordered by their group IDs first. The group for heap pages is the VPID of the heap header, derived from `HFID`; it is not the transaction ID or the BCB address.

For a requested page, `pgbuf_ordered_fix()` changes `curr_rank` to `PGBUF_ORDERED_HEAP_HDR` when the request VPID equals its supplied group ID. Otherwise it copies `initial_rank` to `curr_rank` ([`page_buffer.c:12318-12336`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12318-L12336)). This is why initializing a header request with an ordinary-page rank does not make the header sort as an ordinary page when its group is already known.

## 3. Holder and watcher have different jobs

The protocol uses two caller-side ledgers:

```text
Thread's holder list

PGBUF_HOLDER for BCB A
  bufptr -------------> BCB A
  fix_count = 2
  watch_count = 2
  first_watcher ------> watcher A1 <----> watcher A2 <------ last_watcher
                         |                  |
                         +-- pgptr=A        +-- pgptr=A
                         +-- group/rank     +-- group/rank
                         +-- latch mode     +-- latch mode
                         `-- was_unfixed    `-- was_unfixed

PGBUF_HOLDER for BCB B
  ...
```

### `PGBUF_HOLDER`: one aggregate per thread and BCB

The holder records the BCB pointer and the thread's `fix_count` for that BCB. It is a node in the thread's singly linked active-holder list. It also owns `watch_count` and the head/tail of the watchers attached to that one page ([`page_buffer.c:460-488`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L460-L488)). A new holder is inserted at the head of the thread list ([`page_buffer.c:6000-6086`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6000-L6086)).

The ordered helper does not receive an array of pages the caller already owns. It discovers them by walking this thread holder list.

### `PGBUF_WATCHER`: one movable receipt per ordered fix

The watcher records:

- the current `PAGE_PTR`;
- `next` and `prev` links within that holder's watcher chain;
- group ID;
- granted latch mode;
- initial and current rank; and
- `page_was_unfixed`, which reports that this receipt was released and rebuilt.

Source: [`page_buffer.h:233-249`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L233-L249).

`PGBUF_INIT_WATCHER()` makes a clean unattached watcher: links and `pgptr` are null, latch metadata is `PGBUF_NO_LATCH`, `page_was_unfixed` is false, the caller's rank becomes `initial_rank`, `curr_rank` is undefined, and the optional `HFID` supplies the group ([`page_buffer.h:94-164`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L94-L164)).

After a successful fix, `pgbuf_add_watch_instance_internal()` appends the watcher to the holder's doubly linked watcher chain using its tail pointer, fills `pgptr` and latch mode, and increments `watch_count`. The append itself is constant-time ([`page_buffer.c:13535-13610`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13535-L13610)).

### Why the slow path needs every fix represented

For a watched page that must be released, the slow path requires:

```text
holder.fix_count == holder.watch_count
```

It also requires all attached watchers on that page to agree on group and current rank. It saves the strongest latch mode—WRITE if any watcher used WRITE—before release ([`page_buffer.c:12512-12610`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12512-L12610)).

This equality is not cosmetic. Refix must reconstruct the exact number of ordinary fix debts and update every external watcher pointer. An unrepresented fix has no watcher through which the helper can report a new pointer or an unfixed window. The implementation treats a partial ledger as an assertion failure instead of silently releasing ownership it cannot reconstruct ([`page_buffer.c:12516-12526`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12516-L12526)).

A holder with `watch_count == 0` is skipped under an explicit assumption that the page will not participate in the latch-deadlock cycle ([`page_buffer.c:12460-12470`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12460-L12470)). This is an implementation precondition on callers, not proof that arbitrary unwatched pages are safe to retain.

### Attaching a watcher to an already fixed page

`pgbuf_attach_watcher()` enrolls a page that was fixed by an earlier ordinary path. It derives header-versus-normal rank from the page VPID and `HFID`, initializes the watcher, finds the thread's holder, and attaches the watcher ([`page_buffer.c:13612-13664`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13612-L13664)).

The heap vacuum-removal caller demonstrates the intended use: the current page arrives already WRITE-fixed, so it attaches `crt_watcher` before ordered-fixing the heap header, previous page, and next page ([`heap_file.c:3263-3364`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L3263-L3364)).

## 4. Entry and fast paths

The public call returns an error code. The output page pointer is `req_watcher->pgptr`, not the function return value. The requested watcher must be non-null and unattached; a non-null input `pgptr` is rejected ([`page_buffer.c:12250-12316`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12250-L12316)).

### No other page can form a cycle

When the thread holds no page, or its only holder is already the requested page, the helper calls ordinary fix with `PGBUF_UNCONDITIONAL_LATCH`. There is no different held BCB with which to form the multi-page cycle ([`page_buffer.c:12340-12358`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12340-L12358)).

### Other pages are held, but the request is immediately compatible

With another holder present, the first ordinary fix is conditional. If it succeeds, the helper finds the new holder, resolves or copies group information when needed, appends `req_watcher`, and returns. No old page is released and no `page_was_unfixed` flag is set ([`page_buffer.c:12352-12403`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12352-L12403)).

This is why ordered fix should not be described as “unfix everything, sort, and fix again.” The common uncontended result can be one conditional ordinary fix plus watcher attachment.

### The initial failure may be terminal

The helper does not interpret every null page pointer as “start reordering.” It returns directly for:

- `ER_PB_BAD_PAGEID`;
- `ER_INTERRUPTED`;
- the warning form of `ER_PB_BAD_PAGEID` from `OLD_PAGE_MAYBE_DEALLOCATED`;
- zero-wait or force-zero-wait policy, mapped to `ER_LK_PAGE_TIMEOUT`; or
- a failure from the nominally unconditional entry path.

Only a nonterminal conditional rejection under a waiting policy enters the reorder path ([`page_buffer.c:12404-12452`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12404-L12452)). Ordinary `pgbuf_fix()` itself converts an unconditional request to conditional under zero-wait policy ([`page_buffer.c:2322-2331`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2322-L2331)).

`bestspace::shard::L1_fix()` is a representative force-zero-wait caller: it temporarily selects `LK_FORCE_ZERO_WAIT`, calls ordered fix, translates `ER_LK_PAGE_TIMEOUT` into `CONTENDED`, and continues rather than releasing/reordering and sleeping ([`bestspace.cpp:672-703`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/bestspace.cpp#L672-L703)).

## 5. The slow path, step by step

Assume the request would block, the transaction may wait, and the thread has other watched pages.

### Step 1: classify each held page relative to the request

The helper walks the thread's singly linked holder list. For each watched holder, it walks that holder's doubly linked watcher chain, verifies the ledger, and creates a temporary `PGBUF_HOLDER_INFO` snapshot containing VPID, group, rank, watcher pointers, strongest latch mode, and page type ([`page_buffer.c:12460-12610`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12460-L12610)).

When the requested group is already known:

| Comparison | Meaning | Action |
|---|---|---|
| `request < held` | Held page comes later | Save it for release and refix |
| `request == held` | Duplicate ordering identity | Assertion/error |
| `request > held` | Held page comes earlier | Leave it continuously fixed |

Source: [`page_buffer.c:12611-12662`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12611-L12662).

This selection is the core of the protocol: **only held pages after the request are released**. Earlier pages remain protected and may legitimately remain held while the thread later waits for the request.

### Step 2: release the selected pages completely

For every selected holder, the helper:

1. disconnects the holder's watcher chain;
2. registers “avoid deallocation” on the BCB;
3. calls ordinary unfix once per saved `fix_count`, removing the holder when the count reaches zero;
4. clears each watcher pointer/link; and
5. sets each released watcher's `page_was_unfixed=true`.

Source: [`page_buffer.c:12666-12733`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12666-L12733).

The avoid-deallocation registration is not a pin and does not promise the same BCB or pointer on refix. Its purpose is to stop page deallocation while the ordered protocol has temporarily surrendered normal fix ownership. The source explicitly permits victimization during this window and explains that the page may be loaded into another BCB before the registration is balanced ([`page_buffer.c:16243-16296`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16243-L16296)).

### Step 3: discover an unknown group without creating another latch cycle

A caller may initialize the watcher with a null `HFID`, so the requested page's group is not yet known. In that case, the helper cannot safely compare the request with held pages; it conservatively selects every watched page for release ([`page_buffer.c:12611-12623`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12611-L12623)).

After releasing those pages, it fixes the requested page, obtains its class OID, unfixes the page before catalog access, looks up the `HFID`, and uses the heap header VPID as group. The explicit unfix avoids holding the requested heap latch while catalog pages are fetched ([`page_buffer.c:12735-12786`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12735-L12786), [`13400-13468`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13400-L13468)).

The long source comment at `page_buffer.c:12735-12742` records a version-sensitive identity-reuse assumption around this discovery window. The lesson should explain the mechanism without upgrading that assumption into a general interface guarantee.

### Step 4: insert the request and sort the released set

The request is appended to the temporary array with its now-known group/rank, and the helper calls `qsort()` when the set contains more than one entry ([`page_buffer.c:12795-12832`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12795-L12832)). Earlier pages that were never released are absent from this array; they already sort before the request.

For example:

```text
continuously held:   H(header)
temporary array:     N120, request N100, O200
after qsort:         request N100, N120, O200

complete held order: H(header), N100, N120, O200
```

### Step 5: acquire in sorted order and rebuild the ledgers

The helper now ordinary-fixes every temporary entry with `PGBUF_UNCONDITIONAL_LATCH`. It uses the caller's original fetch and latch modes for the requested page; old pages are refixed as `OLD_PAGE` using the strongest saved latch mode ([`page_buffer.c:12834-12856`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12834-L12856)).

For the request, it attaches `req_watcher`. For a released old page, it:

- unregisters avoid-deallocation;
- checks the saved page type in debug builds;
- repeats ordinary fix until the original watcher/fix count is restored; and
- attaches every saved watcher with `clear_unfix_flag=false`, preserving `page_was_unfixed=true`.

Source: [`page_buffer.c:12894-13006`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12894-L13006).

The resulting pointer may have the same numeric value or a different value. Neither case revives observations made in the old borrowed lifetime.

## 6. What `page_was_unfixed` tells the caller

`page_was_unfixed` means this already-attached watcher crossed a full unfix/refix window during an ordered operation. It is a state-validity warning, not an error code.

During that window, another thread may have:

- inserted, deleted, or compacted records;
- changed a slot's contents or layout;
- changed page header fields or free-space facts; or
- changed a cross-page relationship the caller previously derived.

The caller must therefore reread any page-derived data after seeing the flag. Restoring a latch and a pointer restores ownership, not old knowledge.

Pinned callers demonstrate two valid policies:

- `heap_remove_page_on_vacuum()` updates its current-page pointer after refix and rechecks whether the page is still empty before deallocation ([`heap_file.c:3323-3379`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L3323-L3379)).
- `heap_delete_bigone()` re-peeks the home record because vacuum or page compaction may have changed it while the home page was unfixed ([`heap_file.c:21170-21193`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L21170-L21193)).
- `heap_delete_relocation()` re-peeks the forward record and may disable an optimization if its MVCC flags changed while another ordered fix released that page ([`heap_file.c:21322-21363`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L21322-L21363)).
- `heap_vpid_remove()` treats an unexpected refix as an error rather than attempting to rebuild its more fragile prior reasoning ([`heap_file.c:3072-3090`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L3072-L3090)).

The correct response is caller-specific. The page buffer can report the protection gap, but only the access method knows which derived facts must be recomputed or whether the operation should restart.

## 7. Unfix and watcher lifecycle

The normal lifecycle is:

```text
PGBUF_INIT_WATCHER
  pgptr=NULL, links=NULL, curr_rank=UNDEFINED
             |
             | successful ordered fix or attach
             v
attached watcher
  pgptr=current page, linked under holder, latch/group/rank recorded
             |
             | optional ordered release/refix
             v
attached watcher
  pgptr=restored page, page_was_unfixed=true
             |
             | pgbuf_ordered_unfix
             v
clean watcher
  detached, pgptr=NULL, curr_rank=UNDEFINED
```

`pgbuf_ordered_unfix()` finds the thread holder for `watcher.pgptr`, searches backward from the holder's watcher tail for the exact watcher, removes it from the doubly linked watcher chain, and performs one ordinary unfix ([`page_buffer.c:13470-13533`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13470-L13533)). `pgbuf_remove_watcher()` repairs adjacent links, clears the watcher pointer/current rank, and decrements `watch_count` ([`page_buffer.c:13705-13748`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13705-L13748)).

Replacing ordered unfix with raw `pgbuf_unfix()` would consume ordinary fix debt without removing the matching watcher receipt. The holder's `fix_count` and `watch_count` would diverge and a later reorder would fail its complete-ledger check.

## 8. Failure is a per-watcher outcome

The function comment states the non-atomic failure contract: if refixing a previously released page fails, some older entries in sorted order may already be refixed while others are not. Callers must inspect watcher page pointers before using them ([`page_buffer.c:12250-12264`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12250-L12264)).

The implementation maps a failed refix of an old page to `ER_PB_ORDERED_REFIX_FAILED`; `ER_INTERRUPTED` remains distinct. It then exits rather than pretending the whole set rolled back atomically ([`page_buffer.c:12858-12891`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12858-L12891)). On exit it:

- releases the requested page if it was acquired but the overall call failed;
- preserves restored old watcher pointers already rebuilt;
- leaves unrecovered watcher pointers null; and
- finds and unregisters any outstanding avoid-deallocation registrations.

Source: [`page_buffer.c:13008-13062`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13008-L13062).

The caller's error-path question must be “what does each watcher own now?”, not merely “did `pgbuf_ordered_fix()` return an error?”

### Fixed implementation limits and consistency failures

The temporary holder array and per-page watcher array use the compile-time value 64. The scan rejects too many saved pages and asserts the per-holder watcher bound ([`page_buffer.c:316-319`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L316-L319), [`12472-12526`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12472-L12526)). Treat 64 as an internal bounded-work assumption, not a general transaction interface promise.

The slow path also rejects:

- an input watcher already carrying a pointer;
- another holder for the same request where the control flow says that should be impossible;
- unequal fix and watcher counts on a page selected for reorder;
- watchers on one page that disagree on group or rank; and
- inability to locate a saved holder during release/rebuild.

These are consistency failures because safe reconstruction is no longer provable.

## 9. Structural cost

Define:

- `H`: active holder nodes on the thread's singly linked holder list;
- `W`: watcher nodes visited across those holders;
- `M`: previously held pages selected for release;
- `F`: total fix receipts on those released pages, equal to their watcher count on a valid reorder path.

Ignore device I/O and actual latch sleep for the moment.

| Phase | Structure | Bookkeeping cost |
|---|---|---:|
| Choose initial latch condition | inspect holder-list head and possibly its next link | `O(1)` |
| Initial ordinary fix | normal hash/latch/load machinery | outside the local ordered bookkeeping bound |
| Immediate-success holder lookup | singly linked holder list | `O(H)` worst case; normally the newly allocated holder is at the head |
| Validate/classify slow-path set | holder list plus each watcher chain | `O(H + W)` |
| Compare held pages with request | constant-size tuple per watched holder | included in `O(H)` |
| Fully unfix selected pages | one ordinary unfix per receipt | `F` ordinary unfix operations; each may itself search/remove a holder |
| Sort request and released pages | array `qsort()` | `O((M+1) log(M+1))` comparisons on average |
| Rebuild ownership | one ordinary fix per receipt plus watcher append | `F + 1` or similar ordinary fixes, plus `O(F)` watcher attachment |
| Ordered unfix by caller | holder lookup plus backward watcher search | `O(H + W_page)` worst case |

Source for holder lookup/removal costs: [`page_buffer.c:6090-6126`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6090-L6126), [`6186-6269`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6186-L6269). Source for sort and refix: [`page_buffer.c:12829-13006`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L12829-L13006).

The local sort is usually not the dominant cost. An unconditional refix can wait for another thread and a miss can read from storage, so wall-clock latency has no useful bound in terms of `H`, `W`, and `M` alone. The performance purpose of the conditional first attempt is to avoid all release/sort/refix bookkeeping on uncontended requests.

The implementation is also not maintaining the holder list in canonical page order. The thread holder list remains a head-inserted ownership list. Canonical order exists in watcher metadata and the temporary sorted array; it governs acquisition sequence, not permanent linked-list layout.

## 10. Related ordered callback

`pgbuf_ordered_callback()` applies the same ownership vocabulary to a different need: execute a callback while no ordered heap/overflow pages are fixed, then refix them in canonical order. It validates that every ordered page is fully represented by watchers, saves and sorts them, registers avoid-deallocation, unfixes all of them, calls the callback, and restores them. Non-ordered page types are left fixed under the source's stated heap-allocation assumption ([`page_buffer.c:13065-13398`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13065-L13398)).

This callback is related evidence, but Lesson 0011 should teach ordinary `pgbuf_ordered_fix()` first. Mixing the two control flows at the start obscures the simpler “conditional attempt, selective release, sorted refix” mechanism.

## 11. Representative caller map

The pinned source calls ordered fix from several subsystems, but the dominant semantic owner is heap access:

| Caller | Why ordered ownership matters |
|---|---|
| `heap_scan_pb_latch_and_fetch()` | Chooses ordered fix whenever a caller supplies a watcher; otherwise uses ordinary unconditional fix ([`heap_file.c:919-989`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L919-L989)) |
| `heap_remove_page_on_vacuum()` | Holds current, header, previous, and next heap pages under one ordered protocol and rechecks the current page after a gap ([`heap_file.c:3263-3390`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L3263-L3390)) |
| Heap operation context | Initializes home/forward as normal, overflow as overflow, and header as header rank ([`heap_file.c:19848-19869`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L19848-L19869)) |
| `heap_fix_header_page()` / `heap_fix_forward_page()` | Adds header or forward pages to an existing heap operation and translates zero-wait timeout where needed ([`heap_file.c:20013-20129`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/heap_file.c#L20013-L20129)) |
| Bestspace | Uses WRITE ordered fixes under force-zero-wait to skip contended candidates ([`bestspace.cpp:672-703`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/bestspace.cpp#L672-L703)) |

Syntactic call sites also exist in histogram sampling, parallel and ordinary scan code, B-tree loading, and locator code. Their presence does not change the protocol owner: those paths use watchers when they participate in ordered heap-page access.

## 12. Recommended rewrite and visual plan for Lesson 0011

The current lesson should begin with the deadlock problem before introducing watcher fields. A reader who does not yet know the problem cannot assign meaning to group, rank, or refix.

Recommended order:

1. **One two-thread deadlock.** Draw T1 holding B/waiting A and T2 holding A/waiting B.
2. **The release-before-sleep rule.** Replay the same example with the later page released.
3. **The canonical key.** Show `(group, rank, VPID)` as a three-column sort key, with header before normal before overflow.
4. **Holder versus watcher.** Draw one thread holder node per BCB and one watcher receipt per ordered fix attached beneath it.
5. **Fast-path state machine.** Separate unconditional no-other-holder, successful conditional, terminal/zero-wait failure, and reorder trigger.
6. **Selective slow path.** Show earlier pages staying latched while later pages move into a temporary array, sort, and refix.
7. **Protection gap.** Show an old record pointer becoming stale while `watcher.pgptr` is cleared, then ownership returning with `page_was_unfixed=true`.
8. **Per-watcher failure ledger.** Show a partial refix where early entries have non-null pointers and later entries remain null.
9. **Cost table and caller example.** Use the `H/W/M/F` definitions above and one heap caller that actually rereads data.

### SVG 1: why ordered fix exists

Use two horizontal timelines in one SVG:

```text
UNORDERED
T1: hold B ---------------- wait A ---------------- X
T2: hold A ---------------- wait B ---------------- X

ORDERED
T1: hold B -> conditional A fails -> release B -> wait A -> hold A -> refix B
T2: hold A -> conditional B fails ----------------> gets B -> finish/release
```

Mark the wait-for cycle in the upper lane and the moment B is released in the lower lane. This should be the first visual.

### SVG 2: where ordering metadata lives

Show three distinct layers:

```text
thread holder list      one node per held BCB, aggregate fix_count
        |
        +-- holder A watcher chain     one node per ordered fix receipt
        `-- holder B watcher chain

temporary reorder array                copied group/rank/VPID + watcher pointers
        |
        `-- qsort -> unconditional fix sequence
```

This prevents the common misconception that the active holder linked list itself is kept in group/rank/VPID order.

### SVG 3: selective release and stale knowledge

Use pages `H`, `N100`, and `N120`:

```text
before:  hold H continuously | hold N120 + cached slot pointer | request N100
after conditional failure:   | release N120; watcher.pgptr=NULL |
sorted acquisition:           hold H | acquire N100 | refix N120
caller result:                H observations protected; N120 observations stale
```

The image should label `page_was_unfixed=true` on N120 and should avoid saying that pointer equality restores prior state.

## Maintainer checklist

Before changing an ordered-fix caller or implementation branch, answer:

- Which pages can this thread hold when it calls the function?
- Do all pages that may need release have complete watcher coverage?
- Do all watchers on one page agree on group and rank?
- Which held pages sort before the request and therefore remain continuously protected?
- Which pages may be fully unfixed before the function sleeps?
- What caller observations were derived from those pages?
- Where does the caller test `page_was_unfixed` and rebuild or restart?
- Under error, which watcher pointers can be non-null and who consumes each remaining debt?
- Is zero-wait supposed to skip the contended page rather than reorder and sleep?
- Is avoid-deallocation balanced on every exit without being mistaken for a residency pin?

The central review statement is:

```text
ordered fix preserves a global acquisition direction;
watchers make released debt reconstructable;
page_was_unfixed makes stale caller knowledge visible.
```
