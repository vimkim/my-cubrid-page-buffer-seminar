# Is `OLD_PAGE_PREVENT_DEALLOC` correctness or performance?

**Research ticket for wayfinder map** `pgbuf_docs/wayfinder-CBRD-27263/map.md` — resolves solution
candidate **(B) "remove `OLD_PAGE_PREVENT_DEALLOC` entirely if it is only a perf feature"**.

Baseline: CUBRID `develop` @ `e6ed61e87`. All `file:line` references are at that commit
(read via `git show e6ed61e87:<path>`, not the working tree).

---

## Verdict

**(a) — the protection is REQUIRED for correctness as the callers are written today.**
Candidate (B) is **not viable** as a bounded change.

It is not a performance optimization in any sense: it buys no throughput, saves no I/O, and costs
an atomic increment per fix. Its only product is the *absence* of a failure. Removing it converts a
race that today is rare into one that fires routinely, and every one of the 10 consumer call sites
turns that race into a hard error — `assert (false)` in debug builds, `ER_PB_ORDERED_REFIX_FAILED`
or `ER_HEAP_UNKNOWN_OBJECT` in release.

Two qualifications matter for the wayfinder decision, and they pull in opposite directions:

- **It is weaker than it looks.** It is not a "scanner is present" flag despite what its own
  comment says (`page_buffer.c:14665`). It is a *latch-gap bridge*: registered when a fix begins
  and released the moment the latch is held (`page_buffer.c:2425-2428`, `:2513-2517`). During
  steady-state scanning the counter is **0** and vacuum is held off by the page latch instead.
  And the mechanism explicitly declares itself best-effort — a marked BCB can still be victimized,
  losing the marker (`page_buffer.c:16232-16244`, "we prefer the existing risks").
- **It is nonetheless load-bearing**, because for *held* pages `pgbuf_ordered_fix` offers no
  tolerant path at all, at any fetch mode (see [§4](#4-is-there-a-graceful-retry-path)). The
  callers have no vocabulary for "your page is gone."

So the accurate framing for the map: this is a **best-effort guard that callers depend on
absolutely**. That asymmetry — a probabilistic mechanism guarding a non-negotiable caller
requirement — is itself the deeper design smell behind CBRD-27263, and it is why "just delete it"
and "just fix the counter" are both incomplete answers.

---

## 1. What the mechanism actually is

`count_fix_and_avoid_dealloc` (`page_buffer.c:535-540`) is a two-purpose field: the high 16 bits
count fixes for hot-page detection (`PGBUF_BCB_COUNT_FIX_SHIFT_BITS = 16`, `:268`), the low 16 bits
count outstanding "do not deallocate" markers (`PGBUF_BCB_AVOID_DEALLOC_MASK = 0x0000FFFF`, `:269`).
The field's own comment explains the packing: *"we don't use two separate shorts because avoid
deallocation needs to be changed atomically... 2-byte sized atomic operations are not common."*
Only the low half is at issue here.

There are **two structurally distinct markers**, with different owners and different lifetimes.
Conflating them is the single easiest way to misread this code.

| | **Marker A — requested page** | **Marker B — held pages** |
|---|---|---|
| Registered | `page_buffer.c:2427`, inside `pgbuf_fix_release` when `fetch_mode == OLD_PAGE_PREVENT_DEALLOC`, under the BCB mutex, **before** the latch attempt | `page_buffer.c:12639`, inside `pgbuf_ordered_fix`, immediately before unfixing each held page |
| Tracked by | `has_dealloc_prevent_flag` (`page_buffer.c:12228`, set `:12394`) | `ordered_holders_info[i].prevent_dealloc` (`:12640`) |
| Released | `:2516` on the fast success path; otherwise `:12702` / `:12850` after the reorder | `:12883` on success, `:12994` on the `exit` cleanup |
| Protects against | vacuum reclaiming the page **we are trying to reach** while we have dropped every latch to reorder | vacuum reclaiming a page **we already held** and must re-fix at `:12787` |
| Depends on caller fetch mode? | **Yes** — this is what `OLD_PAGE_PREVENT_DEALLOC` buys | **No** — `pgbuf_ordered_fix` does this unconditionally for any fetch mode |

Marker B is unconditional. That means **removing the `OLD_PAGE_PREVENT_DEALLOC` fetch mode would
not remove the held-page protection** — it would remove only Marker A. Worth stating plainly on the
map, because it changes what candidate (B) even means.

### The intentional cross-function hand-off

Marker A's lifetime spans two functions, and the seam is deliberate but undocumented:

```
pgbuf_ordered_fix (req_vpid, OLD_PAGE_PREVENT_DEALLOC, ...)              :12206
  ├─ latch condition = CONDITIONAL when other pages are held            :12280-12288
  ├─ 1st attempt: pgbuf_fix (req_vpid, <original fetch mode>, ...)       :12292-12296
  │     ├─ register Marker A under BCB mutex                            :2427
  │     └─ conditional latch conflict -> return NULL *without* undoing   :2440-2463  <-- deliberate
  ├─ has_dealloc_prevent_flag = true; fetch_mode := OLD_PAGE            :12392-12396
  │     (Marker A now survives, owned by ordered_fix)
  ├─ register Marker B on every held page, then unfix them all          :12639-12644
  ├─ ... blocked on the unconditional latch for req_vpid ...
  ├─ re-fix everything in VPID order                                    :12773-12794
  └─ release Marker A                                                   :12702 / :12850
```

`page_buffer.c:2440-2463` returning `NULL` *without* unregistering is not a leak — it is the
hand-off. That is precisely the property the lock-free path violates: `pgbuf_lockfree_fix_ro`
(`page_buffer.c:7671-7734`) contains no `register` call anywhere, accepts
`OLD_PAGE_PREVENT_DEALLOC` (`:7674`), and on success jumps `goto fast_path` (`:2328` → label at
`:2498`), so the unregister at `:2513-2517` runs unpaired.

The counter accounting for all five entry situations is already tabulated in
`my-cubrid-jira/issues/CBRD-27263-pgbuf-lockfree-avoid-dealloc-asymmetry_e6ed61e_claude.md` — not
duplicated here.

---

## 2. History

| Commit | Ticket / date | What it introduced |
|---|---|---|
| `5879542b2` | CUBRIDSUS-16989, 2015-06-03 — *"Prevent deallocation of heap pages while scanning."* | The entire mechanism: the `OLD_PAGE_PREVENT_DEALLOC` fetch mode, `avoid_dealloc_cnt` on the BCB, **Marker A** (register in `pgbuf_fix` + the `has_dealloc_prevent_flag` hand-off in `pgbuf_ordered_fix`), `pgbuf_has_prevent_dealloc`, and *both* consumer guards (`vacuum.c` pre-check and the `heap_file.c` post-latch recheck). Also converted ~8 heap chain-walk sites to the new mode in one sweep. |
| `63e7070d2` | CBRD-20755, 2017-01-26 — *"Fix page buffer handling deallocated pages"* | The post-fix `PAGE_UNKNOWN` check keyed on fetch mode, with the deliberate 3-way outcome quoted in the commit message: *"1. page is returned … 2. NULL is returned … 3. NULL is returned and debug server crashes by default."* This is the origin of `assert (false)` at `:2538` and of `OLD_PAGE_MAYBE_DEALLOCATED`'s tolerant branch at `:2545-2553`. |
| `0aac5432e` | CBRD-20697, 2017-02-10 — *"Ordered fix: prevent unfixed page from being deallocated"* | **Marker B.** The commit message is the canonical statement of the race, verbatim: *"This issue is that vacuum deallocated pages unfixed by ordered fix. Active worker wants to advance during heap scan from a page to next page. Next page has higher priority, so current page must be unfixed. A vacuum worker fixes page and deallocates it before active worker fixes it again."* Note this landed **20 months after** Marker A — Marker A alone was demonstrably insufficient, in production. |
| `51dda1b12` | CBRD-21100, 2017-03-22 | Safe-guards only; commit message concedes *"This is not an actual fix, but just more safe-guards to hopefully catch the issue earlier."* |
| `d78d7f92b` | CBRD-21100, 2017-03-29 — *"Do not deregister 'avoid deallocation' on victimized bcb"* | Both artifacts named in the research brief. It **replaced** an `ER_FATAL_ERROR_SEVERITY` `er_set` with the `assert (false)` + `"page was deallocated an we told it not to!"` log (`:12816-12819`), and added the 0-guard with the *"we prefer the existing risks"* comment (`:16226-16250`). |

The `d78d7f92b` pairing deserves a note on the map, because it is where the design became
self-contradictory: **the same commit that introduced the assert also documented why the invariant
it asserts can legitimately be false.** The comment at `:16240-16244` reads:

> *"note: avoid deallocation count is supposed to prevent vacuum workers from deallocating these
> pages. so, victimizing a bcb marked to avoid deallocation is not perfectly safe. however, the
> likelihood of page really getting deallocated is ... almost zero. the alternative of avoiding
> victimization when bcb's are marked for deallocation is much more complicated and poses serious
> risks (what if we leak the counter and prevent bcb from being victimized indefinitely?). so, we
> prefer the existing risks."*

`ER_PB_ORDERED_REFIX_FAILED` itself long predates all of this (`c6655c24c`, CUBRIDSUS-14738,
"Multiple page ordered fix for heap").

---

## 3. Consumer analysis

### 3.1 The two consumers of the marker

Both are on the vacuum side, and both check the page vacuum wants to *remove*:

- `vacuum.c:1850` — in `vacuum_heap_page`, once the page is down to ≤1 record and reusable:
  `if (pgbuf_has_prevent_dealloc (helper.home_page) == false && heap_remove_page_on_vacuum (...))`.
  A cheap pre-check while already holding the WRITE latch.
- `heap_file.c:3383` — in `heap_remove_page_on_vacuum`, *after* WRITE-latching header, previous
  (`:3343`) and next (`:3356`) pages, commented *"recheck the dealloc flag after all latches are
  acquired"*. On a hit it logs *"Candidate heap page %d|%d to remove has waiters"* and gives up —
  vacuum simply retries the page later, so a false positive here is free.

`pgbuf_has_prevent_dealloc` is `SERVER_MODE`-only and hardcoded `false` in SA builds
(`page_buffer.c:14673-14682`), which is sound: no concurrent vacuum worker exists there.

Note the third guard at `heap_file.c:3395`: `pgbuf_has_any_waiters` → `assert (false)` with
*"Unexpected page waiters"*. Vacuum genuinely believes that by this point nobody can be interested
in the page. The marker is what makes that belief true.

### 3.2 The producers, and the navigation model that decides everything

All 10 `OLD_PAGE_PREVENT_DEALLOC` sites reach `pgbuf_ordered_fix` (via
`heap_scan_pb_latch_and_fetch`'s watcher branch, `heap_file.c:958-970`, or directly), and all 10
share one code shape:

```
   hold page P via old_pg_watcher          <- P's READ latch is what protects Q
   ordered_fix (Q, OLD_PAGE_PREVENT_DEALLOC, ...)   <- may unfix P to satisfy VPID order
   unfix P
   if (fixing Q failed) -> HARD ERROR, abort the whole operation
   next_vpid = heap_vpid_next (Q)          <- the next hop is readable only from Q
   replace_watcher (Q -> old)
```

| Site | Function | On failure |
|---|---|---|
| `heap_file.c:7572` | `heap_next_internal` | `S_ERROR`; rewrites `ER_PB_BAD_PAGEID` → `ER_HEAP_UNKNOWN_OBJECT` (`:7580-7588`) |
| `heap_file.c:7726` | `heap_next_internal` (copy-then-peek re-fix) | `S_ERROR`, same rewrite (`:7730-7745`) |
| `heap_file.c:8979` | `heap_update_statistics` | `ASSERT_ERROR_AND_SET` → `exit_on_error` (`:8980-8984`) |
| `heap_file.c:9375` | `heap_get_capacity` | `goto exit_on_error` (`:9381-9385`) |
| `heap_file.c:14366` | `heap_check_all_pages_by_heapchain` | `valid_pg = DISK_ERROR; break;` (`:14371-14375`) — reports the heap file as corrupt |
| `heap_file.c:14780` | `heap_dump` | bare `return;` (`:14785-14789`) — void function, so the dump **silently truncates** |
| `heap_file.c:17478` | `heap_compact_pages` | `ER_FAILED` → `exit_on_error` (`:17483-17487`) |
| `heap_file.c:18923` | `heap_page_next` | `S_ERROR` (`:18929-18932`) |
| `heap_file.c:19022` | `heap_page_prev` | `S_ERROR` (`:19028-19031`) |
| `locator_sr.c:12788` | `redistribute_partition_data` | `goto exit` with the error (`:12795-12798`) |

**Not one of them retries or resynchronizes.** Nine turn it into a hard error; the tenth
(`heap_dump`) silently produces incomplete output, which is worse in kind though harmless in
consequence. Note `heap_check_all_pages_by_heapchain` in particular: a lost chain page makes the
integrity checker declare the heap file `DISK_ERROR`, so removing the marker would make
`checkdb` report corruption on a perfectly healthy database. That uniformity is the empirical
core of verdict (a).

Now contrast the `OLD_PAGE_MAYBE_DEALLOCATED` users — and this is the load-bearing observation
of this whole document:

| Site | How it finds the next page | Tolerates a missing page? |
|---|---|---|
| `px_scan_input_handler_heap.cpp:126` (parallel heap scan) | file-table **sector bitmap** snapshot, `m_tl_ftab.page_bitmap` | **Yes** — `:138-145` comments *"page valid at bitmap build time but deallocated since; ignorable"*, then `er_clear (); found = false; continue;` |
| `histogram_sampler_sr.cpp:843`, `:1335` (sampling scan) | pages pre-picked from **ftab metadata** (CBRD-26761) | Yes |
| `bestspace.cpp:681`, `:890` | **best-space candidate list** of VPIDs | Yes |
| `btree_load.c:5180` | caller-supplied VPID | Yes |

Every tolerant caller navigates by an **external page directory**. Every intolerant caller
navigates by the **intrusive next/prev links inside the heap pages themselves**
(`heap_vpid_next` / `heap_vpid_prev`).

That is the whole answer. A chain walker cannot skip a lost page, because the lost page *was the
only copy of the pointer to where it should go next*. A directory walker can skip freely, because
its itinerary lives somewhere the page's death does not touch. `OLD_PAGE_PREVENT_DEALLOC` is not
protecting data — it is protecting **the reader's place in a singly-linked list it does not own**.

---

## 4. Is there a graceful retry path?

**For the requested page: yes, and it already works.** `OLD_PAGE_MAYBE_DEALLOCATED` gets a clean
`NULL` + `ER_WARNING_SEVERITY` (`page_buffer.c:2545-2553`), and `pgbuf_ordered_fix` surfaces it as a
plain `ER_PB_BAD_PAGEID` return (`:12355-12359`, `:12806-12813`) with no assert. The parallel heap
scan is the proof of concept.

**For a previously-held page: no, and not by changing the fetch mode.** Two hard blocks in
`pgbuf_ordered_fix`:

1. `page_buffer.c:12783` — held pages are re-fixed with `curr_fetch_mode = OLD_PAGE`, **hardcoded**.
   The caller's fetch mode is applied only to `req_vpid` (`:12778`). So a caller passing
   `OLD_PAGE_MAYBE_DEALLOCATED` still gets the strict mode on its own held pages.
2. `page_buffer.c:12806` — the tolerant branch is gated on `VPID_EQ (req_vpid, ...)`. A held page
   fails that test by construction and falls to the `else` at `:12814-12820`: `assert (false)` plus
   *"page was deallocated an we told it not to!"*, then `:12822-12828` escalates to
   `ER_PB_ORDERED_REFIX_FAILED`.

Worse, by then the caller's state is already destroyed and unrecoverable. `pgbuf_ordered_fix`
cleared every watcher at `:12663` (`PGBUF_CLEAR_WATCHER`, `page_was_unfixed = true`) before the
unfix loop. There is no API through which it could report *"the page you asked for is fine, but one
of the pages you were holding is gone"* — the return value is a single `int`, and the watchers the
caller would need to inspect have been zeroed. The `exit` cleanup (`:12972-12998`) then trips its
own `assert (false)` at `:12983`/`:12990` when the BCB is missing from the hash chain or already
unmarked — i.e. the cleanup path is itself written on the assumption that this never happens.

Note also `heap_file.c:3368-3380`: heap code *does* already handle `crt_watcher.page_was_unfixed`
by re-validating. So the "my page was dropped and re-acquired, re-check my assumptions" pattern is
established and callers cope with it. What does not exist is any extension of it to "…and it never
came back."

---

## 5. Strongest counter-example

The scenario below is not hypothetical — it is CBRD-20697's reported bug, and Marker B exists
solely to prevent it. Reading it with Marker B hypothetically removed:

```
  Heap file chain:  HDR -> ... -> P(vpid 0|500) -> Q(vpid 0|300) -> R(vpid 0|700)
                                  ^ P holds the only pointer to Q that the scanner can reach

  T1 (SELECT ... FROM t, sequential scan, heap_next_internal)
    1. holds P READ-latched; has returned P's rows; reads heap_vpid_next(P) = Q
    2. pgbuf_replace_watcher (P -> old_page_watcher)          heap_file.c:7553
    3. ordered_fix (Q, ..., &page_watcher)                    heap_file.c:7571
         Q(0|300) < P(0|500), so VPID order is violated
         -> conditional latch on Q fails, P must be unfixed    page_buffer.c:12606-12644
         -> P is UNLATCHED and (without Marker B) UNMARKED
         -> T1 blocks on the unconditional latch for Q

  T2 (vacuum worker, vacuum_heap_page on P)
    4. P's last record was deleted and is now vacuumable; P drops to <= 1 record
    5. WRITE-latches P — succeeds, T1 let go in step 3
    6. pgbuf_has_prevent_dealloc (P) -> false                  vacuum.c:1850
         (with Marker B: true -> vacuum backs off, bug does not occur)
    7. heap_remove_page_on_vacuum: WRITE-latches HDR, prev, next; recheck at
       heap_file.c:3383 also false; pgbuf_has_any_waiters (P) false
    8. unlinks P, sets ptype PAGE_UNKNOWN, deallocates

  T1 resumes
    9. gets Q, re-fixes held pages in order -> re-fix P with OLD_PAGE  page_buffer.c:12787
   10. P is PAGE_UNKNOWN -> assert (false) + ER_PB_BAD_PAGEID          page_buffer.c:2534-2544
   11. ordered_fix: not req_vpid -> assert (false),
       "page was deallocated an we told it not to!"                    page_buffer.c:12814-12820
       -> ER_PB_ORDERED_REFIX_FAILED                                   page_buffer.c:12825-12827
   12. heap_next_internal -> S_ERROR                                   heap_file.c:7578-7588
```

Outcome: debug builds abort at step 10 or 11; release builds fail the user's `SELECT`. Note this is
a **spurious failure of a read-only query caused purely by background vacuum timing** — no user
error, no resource limit, nothing the application can prevent or meaningfully retry against at the
statement level.

The reason step 12 cannot be softened into "skip P and continue" is step 1: P was the only reachable
holder of the link to Q, and more importantly the scan's *position* in the chain is defined by P. To
recover, `heap_next_internal` would have to re-derive its position from outside the chain — which is
exactly the capability it does not have, and exactly the capability `px_scan_input_handler_heap.cpp`
does have.

**Why this scenario is not merely theoretical.** Heap scans following `heap_vpid_next` are among the
hottest paths in the engine, vacuum runs continuously, and empty-page reclamation is its normal
behavior. What keeps this rare today is only the marker; the residual failures the marker cannot
cover (victimized BCBs) are what `:16241-16244` calls *"almost zero"*. Remove the marker and the
same window is exposed on every chain hop of every sequential scan.

---

## 6. Assessing candidate (b) — caller-side retry

Not bounded. The work is not in the buffer manager, it is in the callers' navigation model:

1. **`pgbuf_ordered_fix` needs a new contract** for held-page loss: a distinguishable return code,
   plus a way to tell the caller *which* watcher died, plus preserving enough watcher state past
   `:12663` for the caller to act. The `exit` cleanup asserts (`:12983`, `:12990`) all assume the
   page is still in the buffer, and would need rework.
2. **Each of the 10 sites needs a resynchronization strategy**, and for the chain walkers there is
   no correct local one. `heap_next_internal` restarting from the heap header risks duplicate rows;
   resuming at a remembered successor VPID risks silently skipping rows if the chain was relinked —
   the *wrong-results* failure mode, strictly worse than today's error. `heap_check_all_pages_by_heapchain`
   is a consistency checker whose entire purpose is to walk the chain; "skip the page that vanished"
   defeats it. `heap_compact_pages` and `redistribute_partition_data` hold WRITE latches inside
   larger multi-page operations.
3. **The real fix is architectural, and CUBRID has already started it**: replace chain walking with
   ftab/bitmap-directed walking, then tolerate missing pages the way parallel scan does
   (`b334446d6` CBRD-27041, `ec867f4aa`/`a13ba2eea` CBRD-26761, `45730b900` CBRD-26615,
   `e84a7f6dc` CBRD-26176). Converting `heap_next_internal` is a substantial project in its own
   right, not a subtask of CBRD-27263.

Practical consequence for the map: **candidate (B) should be closed as rejected**, and the choice
narrows to (A) revert the lock-free fix, (C) make the lock-free path protection-correct, or (D).
Since Marker B is unconditional, note that (C) only has to get **Marker A**'s accounting right.

---

## 7. Adjacent observation (flagging, not concluding)

`heap_file.c:7721-7727` — the copy-then-peek scan path (`b334446d6`, CBRD-27041) — re-fixes a page
it has **already fully released**, solely to read that page's chain link, with the comment *"the
links in the local copy may be stale."* During the gap (a visible record was returned to the client
and the query pipeline ran) the page holds **no latch and no marker** — Marker A only exists during a
fix. So this path appears exposed to the same vacuum race *independently of* CBRD-27263, and would
surface as a spurious `ER_HEAP_UNKNOWN_OBJECT` (`:7730-7734`) on a plain `SELECT`.

I have not verified this dynamically and it may be excluded by something I did not trace (e.g. a
guarantee that `local_cache_vpid`'s page cannot empty out while the scan is mid-page). Recording it
because it is squarely in the parent EPIC CBRD-27193's territory and, if real, is a separate defect
rather than part of this ticket.

---

## 8. Cross-references (not duplicated here)

- `my-cubrid-jira/issues/CBRD-27263-pgbuf-lockfree-avoid-dealloc-asymmetry_e6ed61e_claude.md` —
  the 5-entry-situation counter accounting table, the three fix candidates with trade-offs, and the
  instrumentation/repro recipe. This document deliberately does not restate any of it.
- `my-cubrid-docs/pgbuf-analysis/e6ed61e_claude/05-ordered-fix-dealloc.md` — full `pgbuf_ordered_fix`
  walkthrough (phases P1-P6, the `has_dealloc_prevent_flag` demotion at `:12392`, the register/
  unregister inventory at its lines 1047-1063, and the same lock-free asymmetry at its line 607).
  My §1 table reorganizes that material around the Marker A / Marker B split, which that document
  does not draw as a distinction.
- `my-cubrid-docs/pgbuf-analysis/e6ed61e_claude/02-fix-unfix-latch.md`,
  `00-overview.md`, `09-issue-proposals.md` — mention CBRD-27263.
- Not previously recorded anywhere I found: the **navigation-model split** of §3.2 (chain walkers vs
  directory walkers) and the **`d78d7f92b` self-contradiction** of §2. Those are this ticket's
  contribution.
