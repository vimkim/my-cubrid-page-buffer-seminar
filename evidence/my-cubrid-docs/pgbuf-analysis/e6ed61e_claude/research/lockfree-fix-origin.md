# Where the pgbuf lock-free fix path came from, and what reverting it would cost

Research ticket for the CBRD-27263 wayfinder map.
Source of truth for line numbers: `git show e6ed61e87:src/storage/page_buffer.c` (develop HEAD, 2026-08-15, 17535 lines).
All git commands used were read-only (`git log`, `git show`, `git grep <rev>`, `git merge-base --is-ancestor`, `gh pr view`, `gh api`).

---

## 1. Which commit introduced it

**One commit, one PR, one ticket.** All three identifiers entered `develop` together in a single squash merge:

| | |
|---|---|
| Commit | `58cef8e01fcf121acbe3a35b7249deda54217532` |
| Subject | `[CBRD-26425] Replace bcb mutex lock into atomic_latch (#6704)` |
| Author / committer date | Ilhan (Il Han, Song) `<70995854+xmilex-git@users.noreply.github.com>` — 2026-01-14 19:27:05 +0900 |
| Parent | `051851d1e1a04b43c649159fb71a5cf3177e662a` |
| PR | https://github.com/CUBRID/cubrid/pull/6704 (base `develop`, head `feature/refactor-pgbuf`, merged 2026-01-14T10:27:05Z) |
| JIRA | http://jira.cubrid.org/browse/CBRD-26425 — Sub-task, Closed/Fixed, Target Version **guava**, parent **CBRD-26242** |
| Diffstat | 9 files, +994 / −506; `src/storage/page_buffer.c` alone 1462 lines changed |

Proof that nothing pre-existed — the parent blob contains none of the three identifiers, the merge commit contains all of them:

```
$ git grep -c pgbuf_lockfree_fix_ro            051851d1e -- src/storage/page_buffer.c   -> (no output)
$ git grep -c pgbuf_search_hash_chain_no_bcb_lock 051851d1e -- ...                      -> (no output)
$ git grep -c atomic_latch                     051851d1e -- ...                         -> (no output)
$ git grep -c pgbuf_lockfree_fix_ro            58cef8e01 -- ...                         -> 3
$ git grep -c atomic_latch                      58cef8e01 -- ...                        -> 83
```

`git log --all -S` finds only four commits for `pgbuf_lockfree_fix_ro`, and the other three are not origins:

| Commit | What it is |
|---|---|
| `dedd387e6` | `[CBRD-26425] Replace bcb mutex lock into atomic_latch (#6689)` — the same work merged **into the feature branch** `feature/refactor-pgbuf` on 2025-12-11. `git merge-base --is-ancestor dedd387e6 e6ed61e87` → **NO**. It is not in develop's history; only `origin/feature/refactor-pgbuf` contains it. PR #6689 body is `Purpose: N/A`. |
| `c93b883e8` | `[CBRD-26177] Rebase to sync with develop (#6788)` — carries the code into another feature branch. |
| `adf03be3b` | `Merge develop into feature/internal_lob (#7268)` — same, into feature/internal_lob. |

**Full commit message of the introducing commit** (this is the entirety of it):

```
[CBRD-26425] Replace bcb mutex lock into atomic_latch (#6704)

http://jira.cubrid.org/browse/CBRD-26425

Purpose

Atomic latch has been introduced to improve the page buffer performance of CUBRID.
```

The PR body is the same three lines in Korean: `CUBRID의 page buffer 성능 개선을 위하여, atomic latch를 도입하였습니다.`

### Release exposure

The change is **develop-only; it has not shipped in a maintenance release.**

| Tag | Contains `58cef8e01`? | What the tag is |
|---|---|---|
| `v11.4.5` (2026-04-24) | no | 11.4.5 release |
| `v11.4.5.1878` | no | |
| `v11.4.5.1898` (2026-07-10) | **yes** | a develop build tag — it is an ancestor of `origin/develop` and is contained in ~109 branches, i.e. a QA/nightly build stamp, not a maintenance release |
| `v11.4.5.1906` (2026-07-17) | no | on `origin/release/11.4_hotfix` |

So the 11.4 hotfix line does **not** carry the lock-free path. This corroborates the epic note in `my-cubrid-jira/issues/CBRD-27193-page-buffer-epic_e6ed61e_claude.md:89` — fixing before the "guava" release means zero customer exposure.

---

## 2. Stated motivation, and the performance numbers

Commit message and PR body say only "improve page buffer performance". The real numbers live in JIRA.

### The problem (parent ticket CBRD-26242)

**[CBRD-26242] Performance Bottleneck Caused by Concurrent Access to the Same Page in the Data Buffer** — reporter `youngiinj`, created 2025-08-13, still **Open/Unresolved**, type "Improve Function/Performance", components CUBRID + QP. Test build `develop 8dae125eb`.

Workload — concurrent index joins over the **same** table:

```sql
select /*+ NO_COVERING_IDX NO_PARALLEL_HEAP_SCAN USE_IDX ORDERED */ count(*)
  from a, b where a.id = b.id and b.name = 'math';
```

Measurements quoted in the ticket:

- single execution ≈ **2.5 s**; **80 concurrent** executions ≈ **mid-80 s**
- with `tp_Domain_area` replaced by plain `malloc`/`free`: still ≈ **mid-50 s** (so the domain allocator is not the dominant cost)
- same table vs. different tables: **55.841 s ↔ 21.198 s**, a **163.4 %** gap
- VTune attributes the bottleneck to `PGBUF_BCB_LOCK` / `PGBUF_BCB_UNLOCK`, specifically `__pthread_mutex_unlock_usercnt` under `pgbuf_latch_bcb_upon_fix` (`pgbuf_fix_release`) and `pgbuf_unlatch_bcb_upon_unfix` (`pgbuf_unfix`)

The reporter's framing: *"데이터 버퍼에서 같은 페이지가 PGBUF_LATCH_READ 로 여러 질의에서 사용되면 성능 이점이 있어야 한다고 생각합니다. 지금은 성능 병목을 발생시키는 상태입니다."* — a page shared READ by many queries ought to be a win, and instead it is a bottleneck.

That is exactly the shape the fast path targets: a BCB already `PGBUF_LATCH_READ` with `fcnt > 0` and no waiters, i.e. a hot shared read page.

### The claimed gain (CBRD-26425)

The sub-task's **Acceptance Criteria**, verbatim:

> - 기존 QA test case 통과
> - **CBRD-26242 테스트 64core 기준 성능 4배 증가 확인**

So: **4× throughput at 64 cores** on the CBRD-26242 workload. That is the only quantified number attached to the change, and it is an acceptance target rather than a measured result published in the PR. No perf numbers appear anywhere in PR #6704 — its 18 discussion comments are `/run all` / `/run shell` CI triggers plus one note about an unrelated tcpdump shell-test failure.

CBRD-26425's own description spells out the design in three parts (translated):

1. **Atomic latch structure** — `PGBUF_ATOMIC_LATCH` = `std::atomic<uint64_t>` holding `latch_mode`, `waiter_exists`, `fcnt` in one word; `pgbuf_atomic_latch_impl` union for field access; CAS-based lock-free updates.
2. **Lock-free read-only operations** — `pgbuf_lockfree_fix_ro()`, `pgbuf_lockfree_unfix_ro()`, `pgbuf_search_hash_chain_no_bcb_lock()`.
3. Private-LRU check + holder anchor moved into `THREAD_ENTRY` (`m_is_private_lru_enabled`, `m_holder_anchor`), plus `pgbuf_thread_variables_init()`.

### What was dropped before merge

The feature branch also carried a **btree non-leaf page cache** (`pgbuf_cached_fix`, a `chn` field inside the atomic latch word, `btree.c` changes). It was removed in `6c811cf35 REVERT btree cached fix` before the develop merge. Reason, from CBRD-26425 comment by Il Han, Song on 2026-01-14:

> btree non-leaf cache를 도입할 경우 **YCSB 성능이 1/10로 낮아지는것**을 확인하여, 이번 변경에서 내용을 제거하고 커밋했습니다.

(YCSB throughput fell to 1/10.) Confirmed in the merged source: the latch union at `page_buffer.c:501-510` has only `latch_mode` / `waiter_exists` / `fcnt`, no `chn`. Useful context — most of the Codex review noise on PR #6704 was about that reverted cache, not about the fast path.

### Risk that was flagged at the time

Two signals that the fast path was reviewed for *races*, never for *counter accounting*:

- CBRD-26425 comment, Il Han, Song, 2026-01-05 (to QA): the CAS retry loop *"페이지가 계속 변경되는 상황에서는 여러 차례 실패가 발생해 오히려 성능이 저하될 가능성이 있습니다"* — under heavy page churn the retries could make things slower; QA was asked to add concurrent inserts to the select-heavy test.
- PR #6704 inline review by `shparkcubrid` on `page_buffer.c:7800`: *"기존과 달리 hash에서 BCB 뮤텍스를 잡지 않기 때문에 문제가 발생할 가능성은 없을까요?"* — asks whether skipping the BCB mutex during the hash walk can return a victimized-and-reused BCB, and asks for an explicit `bcb->vpid` comparison. The author added it in `d017c163e`. That check is the `bufptr->vpid.pageid != vpid->pageid || bufptr->vpid.volid != vpid->volid` clause now at `page_buffer.c:7690`.

Nobody asked what the `goto fast_path` jumps over. See §4.

### Cost already paid

CBRD-26425 has one inward **Regress** link: **CBRD-27084**, fixed 2026-07-23 in `e8b961468` — *"Infinite spin (hang) during page fix due to uncleared page buffer waiter_exists after waking flush waiters"*. From its commit message:

> This defect has existed potentially since **CBRD-26425 (#6704)**, which replaced the BCB mutex latch with an atomic latch. It was reproduced intermittently during long-running parallel CREATE INDEX workloads on data much larger than the page buffer, with a reproduction rate of about 50-60% per attempt.

A BCB could be stranded at `{latch_mode = PGBUF_NO_LATCH, fix_count = 0, wait queue = empty, waiter_exists = 1}`, and the idle-grant CAS in `pgbuf_latch_bcb_upon_fix()` then spun at 100 % CPU **while holding the BCB mutex**, hanging even `cubrid server stop`. So the atomic-latch conversion has already produced one release-blocking hang, found six months after merge. CBRD-27263 is the second defect traced to the same commit.

---

## 3. How entangled the lock-free path is

**Verdict: reverting the fast path is mechanically simple and local (≈130 lines, 5 edit sites, no field or struct changes). Reverting `atomic_latch` is a different project entirely and is not on the table.**

### The two are separable

`atomic_latch` is *not* fast-path machinery — it is the BCB's latch word, and it **replaced** the former `bufptr->latch_mode` and `bufptr->fcnt` fields. In `e6ed61e87`:

```c
typedef std::atomic<uint64_t> PGBUF_ATOMIC_LATCH;     /* :367 */

union pgbuf_atomic_latch_impl                         /* :501-510 */
{
  uint64_t raw;
  struct { PGBUF_LATCH_MODE latch_mode; uint16_t waiter_exists; int32_t fcnt; } impl;
};

PGBUF_ATOMIC_LATCH atomic_latch;   /* :520, inside struct pgbuf_bcb */
```

There is no separate `fcnt` or `latch_mode` member left in `struct pgbuf_bcb` (`:513-545`). Consequently `atomic_latch` appears **87 times across 42 functions** in `page_buffer.c` — fix, unfix, promote, victimize, invalidate, flush, WAL, block/wakeup, dump, stats. Only **2 of those 42 functions are the lock-free pair**:

```
  5  pgbuf_promote_read_latch_release      3  pgbuf_invalidate_bcb        2  pgbuf_lockfree_fix_ro
  5  pgbuf_unlatch_bcb_upon_unfix          3  pgbuf_bcb_safe_flush_internal 2  pgbuf_lockfree_unfix_ro
  4  pgbuf_latch_bcb_upon_fix              3  pgbuf_is_bcb_fixed_by_any   2  pgbuf_claim_bcb_for_fix
  4  pgbuf_wakeup_reader_writer            3  pgbuf_victimize_bcb         ... 30 more functions
  4  pgbuf_bcb_flush_with_wal              3  pgbuf_block_bcb
```

So: **no field is exclusive to the lock-free path.** It adds no member to `PGBUF_BCB`, reads only `atomic_latch`, `vpid` and `hash_next`, and writes only `atomic_latch.fcnt`. The `waiter_exists` bit it consults belongs to the block/wakeup machinery (`pgbuf_block_bcb`, `pgbuf_wakeup_reader_writer`, `pgbuf_wake_flush_waiters`), which would keep it after a fast-path-only revert.

### Complete call-site and definition inventory (`e6ed61e87`)

| Site | Lines | What |
|---|---|---|
| Forward declarations | `:1123-1128` | all three, `STATIC_INLINE … ALWAYS_INLINE` |
| **Fast-path block in `pgbuf_fix_release`** | `:2311-2330` | the entry condition + `goto fast_path` — the only caller of `pgbuf_lockfree_fix_ro` |
| `fast_path:` label | `:2498` | sits between the register (`:2427`) and unregister (`:2516`) — the whole defect |
| **Fast-unfix hook in `pgbuf_unfix`** | `:3140-3144` | `if (pgbuf_lockfree_unfix_ro (…)) { return; }` — the only caller |
| `pgbuf_lockfree_fix_ro` body | `:7671-7734` | grant condition at `:7689-7693`; calls `pgbuf_search_hash_chain_no_bcb_lock` at `:7677-7678` |
| `pgbuf_search_hash_chain_no_bcb_lock` body | `:7736-7751` | 16 lines; walks `hash_anchor->hash_next` with **no** `hash_mutex`; only caller is `:7678` |
| `pgbuf_lockfree_unfix_ro` body | `:7753-7776` | CAS `fcnt--`, bails on `fcnt == 1` so the last unfix always takes the slow path |

That is **five edit sites**, all inside `page_buffer.c`. Nothing in `page_buffer.h`, no other translation unit, no external caller (all three are file-static inline). A revert of the fast path only:

1. delete `:2311-2330` (20 lines) and the now-unused `fast_path:` label at `:2498` — the label must go too, or GCC warns `label defined but not used`;
2. delete `:3140-3144` (5 lines);
3. delete `:7671-7776` (106 lines, the three functions) and `:1123-1128` (6 lines of declarations).

Everything the fast path uses survives, because everything it uses is shared. The only cross-check needed is that `pgbuf_unfix`'s `#if !defined (NDEBUG)` tracker decrement is not double-counted: `pgbuf_lockfree_unfix_ro` does its own `get_pgbuf_tracker ().decrement (pgptr)` at `:7773`, and the slow path does the same at `:3149`. Deleting the hook leaves exactly one decrement. Clean.

**Caveat that makes a revert a decision rather than a chore:** the fast path is the *stated deliverable* of a Closed/Fixed sub-task whose acceptance criterion is a 4× gain on a still-**Open** parent ticket (CBRD-26242). Reverting it re-opens the bottleneck the atomic-latch work was commissioned to fix. Also note that the fast path is not what removed the mutex from the *slow* path — `pgbuf_latch_bcb_upon_fix` still CASes `atomic_latch` and only falls back to the BCB mutex when it must block, so a fast-path-only revert keeps most of CBRD-26425's win and loses the zero-mutex hot-read case. Quantifying that split is not something this research can do from the record; the 4× figure is attributed to the whole change, not to the fast path alone.

---

## 4. Was the missing register a conscious choice or an oversight?

**Oversight, and the diff proves it: the introducing commit never touched the avoid-dealloc counter at all.**

Three independent pieces of evidence.

### (a) The strings do not occur in the diff

```
$ git show 58cef8e01 -- src/storage/page_buffer.c | grep -n "register_avoid_deallocation\|unregister_avoid_deallocation"
(no output)
$ git show 58cef8e01 -- src/storage/page_buffer.c | grep -n "^@@.*ordered"
(no output)
```

Neither `pgbuf_bcb_register_avoid_deallocation` nor `pgbuf_bcb_unregister_avoid_deallocation` appears on any changed line — not as context, not added, not removed — across all 98 hunks. `pgbuf_ordered_fix` was likewise never entered. The only `count_fix_and_avoid_dealloc` line in the whole diff is `dest_bcb->count_fix_and_avoid_dealloc = src_bcb->count_fix_and_avoid_dealloc;` in the new `copy_bcb` helper, i.e. a field copy, not accounting logic.

### (b) Before the commit, the pairing was guaranteed by straight-line control flow

In the parent blob `051851d1e:src/storage/page_buffer.c`, inside `pgbuf_fix_release` (starts `:1782`):

- register: `:1970`
- unregister: `:2059`
- **labels between them: none. `goto` statements between them: none.**

Every path from register to unregister was either a fall-through or an early `return NULL` on error. The invariant "if you registered, you reach the unregister" was structural — it did not need a comment, and it has none.

`58cef8e01` inserted the **first and only** jump that lands in the middle of that span. In `e6ed61e87` the ordering is:

```
:2311  if (request_mode == PGBUF_LATCH_READ && (… || fetch_mode == OLD_PAGE_PREVENT_DEALLOC || …)
:2315      pgptr = pgbuf_lockfree_fix_ro (thread_p, vpid, fetch_mode);
:2328      goto fast_path;            <-- jumps forward past :2427
   …
:2395  pgbuf_bcb_register_fix (bufptr);                        <-- skipped
:2425  if (fetch_mode == OLD_PAGE_PREVENT_DEALLOC)
:2427      pgbuf_bcb_register_avoid_deallocation (bufptr);      <-- skipped  (+1 never happens)
   …
:2498  fast_path:                     <-- landing point
:2515  if (fetch_mode == OLD_PAGE_PREVENT_DEALLOC)
:2516      pgbuf_bcb_unregister_avoid_deallocation (bufptr);    <-- still runs (-1 happens)
```

The new entry condition at `:2312` *explicitly enumerates* `OLD_PAGE_PREVENT_DEALLOC` as an eligible mode, and `pgbuf_lockfree_fix_ro` even asserts it at `:7674`. So the author deliberately admitted that fetch mode into the fast path, and — in the same edit — placed the landing label past its `+1` and before its `−1`. There is no comment, no `else` branch, and no compensating call anywhere in the diff. A conscious choice would have had to *do something*; this did nothing, which is the signature of not having looked.

### (c) The same jump silently skipped two more things nobody discussed

The `goto` at `:2328` skips `:2331-2497` wholesale. Besides the avoid-dealloc register, that region contains:

| Skipped | Line | Consequence |
|---|---|---|
| `pgbuf_bcb_register_fix (bufptr)` | `:2395` | the **hot-page fix counter** (upper 16 bits of `count_fix_and_avoid_dealloc`) is never bumped on a lock-free hit. Exactly the hottest shared-read pages — the fast path's target — under-report their hotness to LRU boost/quota logic. Milder than CBRD-27263 (a tuning-accuracy loss, not a correctness one) but the same root cause, and worth its own line on the wayfinder map. |
| `pgbuf_set_bcb_page_vpid` / `pgbuf_check_bcb_page_vpid` | `:2399`, `:2402` | tolerable: the grant condition requires `latch_mode == PGBUF_LATCH_READ && fcnt != 0` plus a `vpid` match, so the page is already validly fixed by somebody, and the `iopage.prv.ptype == PAGE_UNKNOWN` deallocated-page switch at `:2523-2554` is *after* the label and still runs. |
| `had_holder = pgbuf_find_thrd_holder (…) != NULL` | `:2438` | debug-only defect. `had_holder` is initialized `false` at `:2230`, so the fast path's `pgbuf_add_fixed_at (…, !had_holder)` at `:2320` always passes `reset = true` — re-fixing a page you already hold via the fast path **wipes** the accumulated fixed-at trace instead of appending. `!NDEBUG` builds only. |

Three accounting side effects lost to one `goto`, none of them mentioned in the commit message, PR description, JIRA, or any review comment. That is a pattern, not a decision.

---

## 5. What the local knowledge bases already say

### `/home/vimkim/gh/my-cubrid-jira`

- `issues/CBRD-27263-pgbuf-lockfree-avoid-dealloc-asymmetry_e6ed61e_claude.md` — the ticket draft itself (261 lines): five-row accounting table, three candidate fixes, instrumentation repro. Does **not** name the origin commit or the motivation; that gap is what this research fills.
- `issues/CBRD-27193-page-buffer-epic_e6ed61e_claude.md:89` — already attributes the defect correctly: *"lock-free fast path 가 2026-01 atomic latch 개편(CBRD-26425)에서 들어온 **최근 회귀**이므로, 이 변경이 포함될 릴리스 이전에 수정하면 고객 노출 없이 끝난다 — 릴리스 일정과 교차 확인 필요."* This research confirms the release-schedule half: `58cef8e01` is in develop and in the develop build tag `v11.4.5.1898`, but in **no** maintenance release and **not** on `release/11.4_hotfix`.
- `issues/CBRD-27265-pgbuf-debug-build-defects_e6ed61e_claude.md:60` — independent corroboration that `58cef8e01` folded `fcnt`/`latch_mode` into `atomic_latch`: `pgbuf_dump` still references the deleted `bufptr->fcnt` / `bufptr->zone`, which is why `CUBRID_DEBUG` builds fail.
- `issues/CBRD-27196-pgbuf-sx-latch-survey_5cd4f86_claude.md` — mentions the lock-free fix path in the SX-latch survey.

### `/home/vimkim/gh/my-cubrid-docs`

Nothing on the *origin* — no file mentions `CBRD-26425` (`grep -rn 26425` over the whole KB: zero hits). The existing notes describe the mechanism as it stands:

- `pgbuf-analysis/e6ed61e_claude/00-overview.md:94` and `07-qa-workbook.md:127` — the three-tier fix path (lock-free fast path → normal hit → miss), with `:2311-2330` cited.
- `pgbuf-analysis/e6ed61e_claude/01-structures.md:179` — the 64-bit latch union at `:501-510`; `:175` warns that `count_fix_and_avoid_dealloc`'s fix count is *not* the latch fix count (`atomic_latch.impl.fcnt` is) — the exact confusion at the heart of CBRD-27263.
- `pgbuf-analysis/e6ed61e_claude/00-overview.md:185` — item 7 already lists "latch fix count vs. hot-page counter are separate" as a gotcha.
- `pgbuf-analysis/research/cubrid-structs-fix.md:418-420, 987` — "the hot read path takes **no mutex at all**".
- `code-analysis/cbrd-27196-…/f799e05_claude/research/jira/CBRD-27196.md:165` — for the SX-latch design, notes that any `sx` bit must be CAS-updated because *readers CAS the same 64-bit word without the mutex*; a mutex-only read-modify-write would lose concurrent `fcnt` updates. Directly relevant if a CBRD-27263 fix ever considers doing the register under the BCB mutex.
- `pgbuf-rebuild-spec/ch01-requirements.html:412` — states the invariant `bcb.atomic_latch.fcnt == Σ_t holder(t, bcb).fix_count`.

No KB file records why the fast path was added, what it was measured at, or that it is a January 2026 change. This document is the first to.

---

## Reference: minimal fact sheet for the wayfinder map

| Question | Answer | Evidence |
|---|---|---|
| Introducing commit | `58cef8e01` (2026-01-14), PR #6704, CBRD-26425 | `git log --all -S`, parent `051851d1e` has none of the identifiers |
| Earlier feature-branch commit | `dedd387e6`, PR #6689 — **not** in develop history | `git merge-base --is-ancestor dedd387e6 e6ed61e87` → NO |
| Author | Il Han, Song (`xmilex-git`) | commit + JIRA assignee |
| Motivation | same-page READ contention on `PGBUF_BCB_LOCK`/`UNLOCK` (VTune), CBRD-26242 | CBRD-26242 description |
| Numbers | 2.5 s single → mid-80 s at 80 concurrent; 55.841 s vs 21.198 s same-vs-different table (163.4 %); acceptance target **4× at 64 cores** | CBRD-26242 + CBRD-26425 Acceptance Criteria |
| Numbers in commit/PR | none | commit message and PR body are three lines |
| Shipped to customers? | no — develop + develop build tag `v11.4.5.1898` only | `git tag --contains` |
| Already cost one hang | CBRD-27084, fixed `e8b961468` (2026-07-23), 50-60 % repro on parallel CREATE INDEX | its commit message names CBRD-26425 |
| Fast-path revert surface | 5 sites, ~137 lines, all in `page_buffer.c`: `:1123-1128`, `:2311-2330`, `:2498`, `:3140-3144`, `:7671-7776` | inventory above |
| `atomic_latch` revert surface | 87 refs / 42 functions; replaced `bcb->fcnt` and `bcb->latch_mode` outright — full CBRD-26425 revert, not in scope | function attribution above |
| Fields exclusive to the fast path | **none** | it adds no `PGBUF_BCB` member |
| Was the counter asymmetry deliberate? | no — the diff never touches `register/unregister_avoid_deallocation`, and pre-commit the pairing was straight-line with no label or `goto` between `:1970` and `:2059` | `git show 58cef8e01 \| grep`, `051851d1e` analysis |
| Collateral, same root cause | `pgbuf_bcb_register_fix` (`:2395`) skipped → hot-page counter under-counts on fast hits; `had_holder` always `false` → `pgbuf_add_fixed_at` resets the debug trace | `:2230`, `:2320`, `:2395`, `:2438` |
