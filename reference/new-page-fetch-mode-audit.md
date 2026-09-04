# `NEW_PAGE`: allocation-to-buffer materialization contract

**Level:** Evidence reference

**Question:** What exactly does `PAGE_FETCH_MODE::NEW_PAGE` mean, why does it
exist, and can CUBRID remove it?

**Source baselines:** CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; PostgreSQL
`fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`; MySQL/InnoDB
`06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8`

**Evidence used:** Verified mechanism and Interface contract from pinned
first-party source. No runtime experiment was run. Design recommendations are
labeled as Inference.

## Executive answer

`NEW_PAGE` does not allocate a disk page. It tells the page-buffer Module that
an allocation owner has already made the VPID valid and that, on a cache miss,
the Module must create a resident BCB/frame **without reading the old home-page
image**. The returned page is fixed and latched, but its logical type, layout,
logging, TDE policy, dirty state, and final release remain caller work. This is
the boundary between file/disk allocation and buffer materialization, not a
cache-performance hint. The declared contract and the no-read branch establish
those responsibilities directly.
[Fetch-mode declaration](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L172-L187),
[miss materialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8392-L8634),
and [representative allocation-before-fix caller](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L5408-L5556).

The **responsibility cannot simply be removed**. Replacing `NEW_PAGE` with
`OLD_PAGE` changes both I/O and validity behavior: a miss reads DWB or the data
volume, and a `PAGE_UNKNOWN` image is rejected. That breaks the supported case
in which a newly allocated VPID reuses a deallocated page image. Replacing it with
`RECOVERY_PAGE` still reads on a miss and bypasses a different validation
boundary. A redesign may hide the enum member behind a narrower creation
function, but it must retain an explicit no-read, accept-new-image operation.
[Read-versus-create branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8494-L8632)
and [`PAGE_UNKNOWN` disposition by mode](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2572-L2616).

The claim that other DBMSs do not expose such a distinction is false at the
comparable boundary. PostgreSQL has `RBM_ZERO_AND_LOCK`, documented as “do not
read; caller initializes,” in its internal buffer-manager interface. InnoDB
uses a separate `buf_page_create()` function that usually avoids the read and
returns a buffer-fixed, latched block. The spelling differs—mode versus separate
function—but the responsibility is the same.
[PostgreSQL `ReadBufferMode`](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/include/storage/bufmgr.h#L43-L54),
[PostgreSQL contract](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L884-L923),
and [InnoDB `buf_page_create()` contract](https://github.com/mysql/mysql-server/blob/06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8/storage/innobase/include/buf0buf.h#L468-L479).

**Inference / recommendation:** retain the behavior, but consider replacing
the broadly composable enum choice with a narrow internal
`pgbuf_fix_new_page()`-style operation that fixes WRITE and carries the
initialization obligation in its name. Keep the external-sort overwrite path
separate because it uses the same no-read machinery for a different purpose.
Do not propose removal until regression tests lock down the miss, resident
deallocated-page, failure, logging, and full-page overwrite cases.

## 1. The contract in plain language

The normal creation sequence is:

```text
file/disk owner reserves identity
        |
        | VPID is now allocated, but no initialized logical page exists
        v
pgbuf_fix(..., NEW_PAGE, WRITE, ...)
        |
        | miss: claim frame without DWB/home read
        | hit:  use the resident mapping; do not reinitialize it here
        | both: fix + WRITE latch, identity check, PAGE_UNKNOWN accepted
        v
caller initializes type/layout and applies TDE/logging policy
        |
        v
caller marks dirty and eventually unfixes
```

The important word is **newly allocated**, not merely “not resident.” Debug
validation asks disk allocation metadata whether the VPID belongs to a
reserved sector; it is not a request to allocate that sector.
[Validation entry](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2283-L2319)
and [allocation-metadata check](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L11065-L11099).

### Preconditions

The pinned callers establish these effective preconditions:

1. A file, disk, or equivalent owner has already chosen and reserved the VPID.
2. The caller is authorized to replace the logical contents at that identity.
3. The caller will initialize the logical page before making it available.
4. The caller supplies the logging/TDE/dirty/release protocol appropriate to
   the owning subsystem.

All ten direct creation call sites pass `PGBUF_LATCH_WRITE` and
`PGBUF_UNCONDITIONAL_LATCH`. The type system does not enforce that combination;
it is an empirical invariant of the pinned callers. Moreover, an unconditional
request may be downgraded to conditional when the transaction has zero-wait
policy, so callers must still handle `NULL`.
[Latch-policy adjustment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2322-L2332).

### Successful postcondition

On success, the caller owns one fix debt and the requested page latch, just as
with ordinary `pgbuf_fix()`. The BCB has the requested VPID and is published in
the resident hash before the function returns. A concurrent caller can find
the resident mapping but cannot observe half-initialized logical contents while
the creator retains its WRITE latch. The VPID-keyed load lock serializes miss
materialization; a competing miss waiter wakes and retries rather than
inheriting the creator's fix.
[Common fix, latch, publish, and return path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2342-L2685)
and [miss claim/load-lock path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8392-L8478).

Success does **not** mean that the logical page is complete or durable. The
caller must eventually repay the fix and must perform the relevant
initialization, logging, dirtying, and error cleanup.

## 2. Exact miss and hit behavior

### Miss: what `NEW_PAGE` initializes

The miss path first obtains a reusable BCB, assigns its BCB-side VPID, resets
the latch tuple, clears selected BCB state, and nulls `oldest_unflush_lsa`.
Unlike every other fetch mode, `NEW_PAGE` then skips the DWB/home-page read,
decryption, and read statistics.
[BCB preparation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8470-L8493)
and [read branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8494-L8598).

For a temporary volume it writes the special temporary LSA into both LSA
locations. For a permanent volume it writes null LSAs, then places `-1|-1` in
the on-page identity fields. The common path copies the BCB VPID into those
identity fields and sets `ptype = PAGE_UNKNOWN`. This deliberately creates an
identity-bearing but not yet logically typed page image.
[NEW_PAGE metadata initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8599-L8632),
[identity bootstrap](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5432-L5471),
[null-LSA helper](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_io.h#L195-L208),
and [temporary-LSA helper](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17304-L17317).

The logical payload is **not initialized by this branch**. In a CUBRID debug
build the whole frame is deliberately scrambled to expose assumptions about
uninitialized bytes; otherwise the shown branch only initializes the page
metadata described above. Therefore course prose should say “materializes the
frame without reading old bytes and initializes page-buffer metadata,” not
“initializes the page” without qualification.
[Debug scramble call and production branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8599-L8623)
and [scramble implementation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L11281-L11307).

The SHOW accounting treats a materialized miss as a created page and also as a
hit; it does not increment data-page reads. That is an observability policy,
not evidence that old bytes were found in the cache.
[Creation counters](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8625-L8632).

### Hit: no second initialization

If the VPID is already resident, `NEW_PAGE` follows the ordinary resident path.
It does not execute the miss-only LSA/identity initialization. It records a hit,
acquires the requested latch/fix, and accepts `PAGE_UNKNOWN`. This supports
reuse of a deallocated page that still has a resident BCB. A debug assertion
also flags a non-temporary, already-typed page passed as `NEW_PAGE`; that is
caller misuse rather than a request to erase the existing page.
[Resident NEW_PAGE branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2380-L2416)
and [post-latch page-type rules](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2572-L2616).

This hit behavior has the same shape as InnoDB's `buf_page_create()`: if the
page is already in the pool, InnoDB frees its spare block and falls back to a
normal latched get rather than reinitializing the frame.
[InnoDB resident branch](https://github.com/mysql/mysql-server/blob/06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8/storage/innobase/buf/buf0buf.cc#L5094-L5143).

## 3. What the caller must complete

`NEW_PAGE` and new-page recovery logging are separate operations. The fetch
mode does not call `pgbuf_set_page_ptype()`, append a log record, choose TDE,
mark the BCB dirty, or unfix it. The generic new-page logging helper appends an
`RVPGBUF_NEW_PAGE` undo/redo record containing the initialized prefix and then
marks the page dirty. Redo copies that data and sets the page type; undo resets
the type to `PAGE_UNKNOWN`.
[New-page log helper](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15093-L15123)
and [redo/undo routines](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15125-L15171).

`file_alloc()` makes that layering concrete:

1. It fixes the file header and allocates the VPID through `file_temp_alloc()`
   or `file_perm_alloc()`.
2. It fixes the allocated VPID as `NEW_PAGE` with a WRITE latch.
3. It invokes the owner-supplied initializer and asserts that the page type is
   no longer unknown.
4. It applies the file's TDE algorithm.
5. It either transfers the still-fixed page to `page_out` or unfixes it.
6. Its initializer contract owns logging and dirtying; the standard permanent
   page-type initializer appends `RVPGBUF_NEW_PAGE` and marks dirty.

[Allocation and materialization sequence](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L5408-L5556)
and [standard initializer](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L5360-L5405).

### Error implications

`NEW_PAGE` avoids the DWB read, home-volume read, and decryption failures in the
ordinary miss branch. It can still fail because of an invalid argument, an
interrupt, page-validation failure in validating builds, load-lock/latch
coordination, no reusable BCB, or holder/latch acquisition. The common claim
path has explicit cleanup for BCB-allocation returns and reported latch errors
before returning `NULL`. Holder allocation failure after an atomic grant has a
separate unresolved rollback proof obligation (`VS-11`), so this audit does not
claim that every low-memory interleaving is already proved safe.
[Entry failures](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2283-L2353),
[claim failure](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2414-L2427),
and [latch-failure cleanup](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2485-L2512).
[Current failure-proof registry](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations).

Once `pgbuf_fix()` succeeds, a later initializer or logging failure is not a
page-buffer fetch failure. The allocation owner must release the fix and roll
back or compensate its allocation protocol. `file_alloc()` demonstrates local
unfix plus system-operation abort on failure.
[Initializer failure and allocation unwind](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L5499-L5514)
and [system-operation exit](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L5561-L5590).

## 4. Complete pinned call-site inventory

The inventory command was:

```sh
git grep -n -w NEW_PAGE f799e05d77d5300c6ea5753b4a6cc7caee6d8912 -- \
  '*.c' '*.h' '*.cpp' '*.hpp'
```

There are ten direct `pgbuf_fix(..., NEW_PAGE, ...)` creation calls outside
`page_buffer.c`, all in `disk_manager.c` or `file_manager.c`. All ten request
WRITE and UNCONDITIONAL. There is one additional effective page-buffer use in
`pgbuf_copy_from_area()`, reached by one external-sort caller.

| Site | Owner intent before the fix | Work after success |
|---|---|---|
| [`disk_format():590`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/disk_manager.c#L501-L605) | `fileio_format()` has created the volume; materialize its volume-header page. | Set `PAGE_VOLHEADER`, fill header, append volume-format recovery records, and later dirty/flush under the format protocol. |
| [`disk_stab_init():4925`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/disk_manager.c#L4901-L4989) | The formatted volume defines a range of sector-table pages. | Set `PAGE_VOLBITMAP`, zero the payload, initialize bitmap state, log permanent maps, dirty, then flush or unfix. |
| [`file_create():3499`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L3398-L3528) | Reserved sectors have supplied the file-header VPID. | Zero the payload, set `PAGE_FTAB`, initialize the file header, then log/dirty under file creation. |
| [`file_create():3726`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L3700-L3761) | File creation has selected and marked an extra file-table VPID. | Set `PAGE_FTAB`, zero and initialize extensible data, then log and release/dirty. |
| [`file_table_append_full_sector_page():5008`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L4982-L5029) | The helper receives an already newly allocated table-page VPID. | Set `PAGE_FTAB`, initialize the full-sector table, log it as a new page, unfix, and link it. |
| [`file_alloc():5502`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L5454-L5543) | `file_perm_alloc()` or `file_temp_alloc()` has allocated the user-page VPID. | Run the owner callback, require a known type, apply TDE, then transfer or release the fix. |
| [`file_alloc():5549`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L5544-L5556) | Temporary allocation returned a VPID and the caller requested the page without an initializer. | Return the fixed WRITE-latched page; the caller now owns initialization and release. |
| [`file_perm_dealloc():6558`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L6534-L6581) | A metadata update needed and allocated a new partial-sector table page. | Set `PAGE_FTAB`, initialize/append its first entry, log the new page, and unfix. |
| [`file_numerable_add_page():8048`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L8003-L8087) | Permanent or temporary allocation produced a new user-page-table VPID. | Set `PAGE_FTAB`, initialize the table, log permanent state or dirty temporary state. |
| [`file_temp_alloc():8761`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/file_manager.c#L8725-L8795) | A newly reserved temporary sector contributes its first page as a table page. | Set `PAGE_FTAB`, link it, initialize its table, update temporary metadata, and dirty through the containing protocol. |

### Specialized no-read overwrite

`pgbuf_copy_from_area()` always calls `pgbuf_fix(..., NEW_PAGE, WRITE, ...)` in
the normally compiled path, sets `PAGE_AREA` and TDE state, copies bytes, calls
`log_skip_logging()`, dirties, and frees. Its only pinned external caller,
`sort_write_area()`, supplies an entire `DB_PAGESIZE` image after finding or
auto-expanding the numbered page. This is not ordinary page allocation; it is a
specialized owner asserting that the previous image need not be read because a
complete replacement image is available.
[Copy helper](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L4810-L4911)
and [sole caller](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/external_sort.c#L5870-L5927).

This path is already tracked as `VS-03`: outside the dormant direct-I/O branch,
`do_fetch` does not change the executable path. A redesign should not silently
fold this whole-page, skip-logging overwrite into the normal allocation API.
[Current uncertainty registry](../unresolved-or-version-sensitive-findings.md#a-current-pinned-revision-interface-hazards).

### Same enum name in the log-page buffer

`log_page_buffer.c` reuses `PAGE_FETCH_MODE` and its `NEW_PAGE` value for a
different buffer pool. There, `logpb_locate_page()` fills a new log page with
`0xff` and initializes its header instead of reading the log file. The concept
is again explicit no-read creation, but it is not a `pgbuf_fix()` call. Removing
or privatizing the data-page enum therefore also requires decoupling this log
buffer parameter, not merely editing the ten calls above.
[Log-page create contract and branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L771-L900)
and [append-page uses](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L2496-L2600).

## 5. Counterfactual: what happens if it is removed?

| Replacement | Source-backed consequence | Verdict |
|---|---|---|
| Use `OLD_PAGE` everywhere | Misses perform DWB/home read and decrypt; `PAGE_UNKNOWN` is rejected after the latch. A deallocated-but-resident page is also rejected. This changes correctness and creates avoidable I/O. | Not equivalent. |
| Use `RECOVERY_PAGE` | It accepts unknown/deallocated images and skips the normal allocation validation, but it still follows the non-`NEW_PAGE` read path on a miss. Its purpose is recovery's broader state tolerance, not allocation ownership. | Not equivalent. |
| Use `OLD_PAGE_IF_IN_BUFFER` | A miss returns `NULL` without claiming a BCB, so it cannot materialize an allocated page. | Not equivalent. |
| Infer “new” from cache absence | Absence says only “not resident.” The Module must decide whether to read before it can inspect the page image; allocation intent is owned above this seam. | Circular and unsafe. |
| Read and then let every caller overwrite | This can preserve some fully overwriting callers, but it adds DWB/home I/O, exposes read failures for bytes that are intentionally irrelevant, and still needs a rule for `PAGE_UNKNOWN`. | Possible only as a slower redesigned protocol, not deletion. |
| Bypass the page buffer and write directly | The replacement must reimplement or coordinate resident identity, concurrent lookup, latching, fix lifetime, hash publication, dirty/flush state, TDE, and WAL. | Moves the responsibility; does not remove it. |

The first three rows follow directly from the pinned common switch and read
branch.
[`PAGE_UNKNOWN` switch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2572-L2616)
and [miss I/O decision](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8494-L8634).

## 6. Is it public API?

There are three different meanings of “public”:

| Boundary | Finding |
|---|---|
| SQL, CCI, or application API | **No.** `page_buffer.h` is not among the headers installed by the CUBRID target. The installed client-facing set includes `dbi.h`, type/date/ELO headers, `error_code.h`, and `cubrid_log.h`, not `page_buffer.h`. |
| CUBRID server-module Interface | **Yes.** `PAGE_FETCH_MODE` and externally linked `pgbuf_fix()` declarations are in `src/storage/page_buffer.h`, so server implementation modules can include and call them. |
| Page-buffer Implementation | **Partly exposed.** The mode selects deep internal branches, but current direct creation calls are confined to disk/file/page-buffer owners rather than arbitrary SQL execution code. |

[CUBRID installed-header list](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/cubrid/CMakeLists.txt#L777-L809)
and [`pgbuf_fix()` declarations](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.h#L258-L338).

The useful review question is therefore not “why does CUBRID expose this to
users?” It does not. The question is “should the server-internal interface
express no-read creation as one member of a broad mode enum or as a narrower
operation?”

## 7. Nearest PostgreSQL and InnoDB mechanisms

| Responsibility | CUBRID | PostgreSQL | MySQL/InnoDB |
|---|---|---|---|
| Express caller knowledge that old disk bytes are unnecessary | `NEW_PAGE` member of `PAGE_FETCH_MODE` | `RBM_ZERO_AND_LOCK` / `RBM_ZERO_AND_CLEANUP_LOCK` members of `ReadBufferMode`; newer extension callers can use `ExtendBufferedRel()` | Separate `buf_page_create()` function; normal reads use `buf_page_get_gen()` and `Page_fetch` has no “new page” member |
| Allocate identity | File/disk layer before ordinary data-page `NEW_PAGE` fix | `P_NEW` compatibility path or `ExtendBufferedRel()` can extend the relation as part of the buffer-manager operation | Tablespace allocator chooses/marks the page number before `buf_page_create()` |
| Miss action | Skip DWB/home read; initialize LSA and identity bootstrap metadata; payload remains caller-owned | Zero the buffer instead of reading it, make it valid, and return it locked | Initialize buffer-pool block state without a normal file read; mark enough frame header state to prevent stale contents being mistaken for a live index page |
| Resident action | Do not reinitialize; acquire ordinary fix/latch and accept expected `PAGE_UNKNOWN` | Do not zero an already-valid buffer; still return it locked | Fall back to ordinary latched page get; do not recreate the resident frame |
| Visibility protection | Creator holds WRITE latch while it initializes | Function returns with exclusive or cleanup lock | Creation latches the page before releasing the page-hash lock and records it in the MTR memo |
| Caller completion | Type/layout, recovery log, TDE, dirty, unfix | Page initialization, WAL as required, dirty, unlock/unpin | `fsp_init_file_page()` and subsystem initialization/logging in the MTR |

PostgreSQL's primary-source comment explicitly says zero-and-lock saves I/O,
avoids irrelevant corrupt-header failures, and prevents others from observing
the page before initialization. It also warns not to use the mode beyond EOF
unless the caller is using the supported new-page extension protocol.
[PostgreSQL mode behavior](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L898-L920),
[zero-and-lock implementation](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L1131-L1215),
and [extension path](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L1270-L1346).

InnoDB makes the same responsibility more obvious by giving it a separate
function. `buf_page_create()` obtains a free block, publishes buffer identity,
buffer-fixes it, acquires SX or X latch before releasing the hash lock, adds it
to LRU, and returns it through the caller's mini-transaction. The allocation
helper then calls `fsp_init_file_page()`.
[InnoDB creation implementation](https://github.com/mysql/mysql-server/blob/06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8/storage/innobase/buf/buf0buf.cc#L5082-L5243)
and [allocation-to-initialization wrapper](https://github.com/mysql/mysql-server/blob/06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8/storage/innobase/fsp/fsp0fsp.cc#L1799-L1831).

These interfaces are internal engine interfaces. Their existence supports the
need for the semantic distinction; it does not prove that CUBRID's current API
shape is optimal.

## 8. Design options

| Option | Benefit | Cost/risk | Assessment |
|---|---|---|---|
| Retain as-is | No code churn; established callers and semantics remain. | Name sounds like allocation; invalid latch/mode combinations remain expressible; specialized overwrite is conflated with allocation. | Safe baseline, but documentation must be precise. |
| Rename enum member | `NEWLY_ALLOCATED_PAGE` or `ALLOCATED_PAGE_NO_READ` would expose the precondition. | Broad combinatorial API remains; rename touches the separate log buffer and all source references. | Better language, incomplete interface improvement. |
| Hide behind a wrapper | A `pgbuf_fix_new_page()` wrapper can enforce WRITE and the intended wait policy while keeping current implementation internally. | Still needs a decision about initialization callback, error unwind, and the overwrite exception. | Low-risk migration step. |
| Split creation from fetch | A dedicated creation operation mirrors InnoDB and can own stronger assertions or an initializer callback. Keep ordinary fetch modes focused on existing pages. | Larger refactor; tests must preserve resident-hit/deallocated-image behavior and ownership timing. | **Recommended direction** if maintainers want a deeper Interface. |
| Split no-read overwrite too | A separately named full-page overwrite operation makes the external-sort exception explicit and can require full-page length/skip-logging ownership. | Requires auditing `pgbuf_copy_from_area()` and its recovery assumptions (`VS-03`). | Recommended companion to the creation split. |
| Remove the semantic operation | Smaller apparent API. | Forces incorrect `OLD_PAGE` substitution or duplicates identity/concurrency machinery elsewhere. | Reject. |

**Inference:** a promising target shape is:

```text
file/disk allocator
  -> pgbuf_fix_new_page(vpid, WRITE implied, init callback/owner contract)

external sort owner
  -> pgbuf_overwrite_full_page_no_read(vpid, PAGE_AREA, TDE, skip-log contract)

ordinary readers/writers
  -> pgbuf_fix_existing_page(...)
```

This is a design sketch, not a source-backed promised API. In particular,
whether the initializer belongs inside the page-buffer operation or remains in
`file_alloc()` needs fault-injection and ownership review.

## 9. Evidence required before an engine change

Before renaming, hiding, splitting, or removing the enum member, add narrow
tests or probes for:

1. A new-page miss: zero data-page read count, identity header installed,
   `PAGE_UNKNOWN` returned under WRITE latch, and no automatic dirty/log action.
2. Reallocation while the deallocated `PAGE_UNKNOWN` image remains resident.
3. Reallocation after the image has been evicted, with irrelevant old home
   bytes present.
4. A competing fixer: no observation of caller payload before initialization
   and release.
5. Permanent and temporary `file_alloc()` with successful initialization,
   callback failure, system-operation abort, TDE selection, and ownership
   transfer through `page_out`.
6. Volume header, sector bitmap, and all file-table creation families from the
   inventory above.
7. The external-sort full-page overwrite, plus an explicit decision on whether
   partial `pgbuf_copy_from_area()` use is supported.
8. BCB exhaustion, interrupt, and zero-wait/conditional failure cleanup.
9. Compile-time rejection or assertion for unsupported combinations such as
   `NEW_PAGE + READ` if a wrapper is introduced.
10. The independent log-page-buffer `NEW_PAGE` users if the shared enum is
    privatized.

The counterfactual to include in a regression should replace one controlled
creation with `OLD_PAGE` and demonstrate the changed I/O/`PAGE_UNKNOWN` result;
it should not be merged as production code.

## 10. Bilingual HTML course impact

Exactly seven English/Korean page pairs currently contain the token `NEW_PAGE`:

| Pair | Current role | Recommended treatment |
|---|---|---|
| [`Lesson 0003`](../en/lessons/0003-trace-fix-convergence.html) / [KO](../ko/lessons/0003-trace-fix-convergence.html) | Fetch-mode table and miss convergence | Keep the compact mode distinction and no-read miss branch. Replace unqualified “initializes the frame” wording with the precise metadata/payload boundary, then link forward to the canonical explanation. |
| [`Lesson 0005`](../en/lessons/0005-audit-a-logged-mutation.html#new-page) / [KO](../ko/lessons/0005-audit-a-logged-mutation.html#new-page) | Existing “caller knowledge” section after logged mutation | **Canonical location to expand.** It already owns allocation-before-materialization and caller-owned logging/dirtying. Add exact miss/hit behavior, why `OLD_PAGE` is not a substitute, the direct caller families, internal-versus-client API scope, and the PostgreSQL/InnoDB responsibility comparison. |
| [`Lesson 0014`](../en/lessons/0014-preserve-lifecycle-order.html) / [KO](../ko/lessons/0014-preserve-lifecycle-order.html) | Lifecycle owner table | Keep one routing sentence; link to Lesson 0005 rather than repeating the contract. |
| [`Lesson 0015`](../en/lessons/0015-route-a-specialized-interface.html) / [KO](../ko/lessons/0015-route-a-specialized-interface.html) | `pgbuf_copy_from_area()` / `VS-03` exception | Preserve as the specialized no-read overwrite exception and link back to the canonical creation explanation. |
| [`Caller mutation card`](../en/reference/caller-mutation-card.html) / [KO](../ko/reference/caller-mutation-card.html) | Source anchor for allocation-before-materialization | Keep compact and route to Lesson 0005. |
| [`Fix convergence map`](../en/reference/fix-convergence-map.html) / [KO](../ko/reference/fix-convergence-map.html) | One-line miss map | Keep compact; say metadata materialization rather than implying full logical initialization. |
| [`Expected Team Questions`](../en/reference/expected-team-questions.html#reader-q-15) / [KO](../ko/reference/expected-team-questions.html#reader-q-15) | Direct answer for likely listener feedback | State the removal verdict, comparison boundary, and route to Lesson 0005 plus this audit. |

Lesson 0005 is the best canonical owner because the teammate questions are not
only about cache-miss mechanics. They are about who knows that a page is new,
who allocates it, who initializes/logs/dirties it, and whether another engine
expresses the same boundary. Those are caller-correctness questions, which is
the purpose of that lesson. Lesson 0003 should still introduce the branch at
the moment readers trace fix convergence, but it should not duplicate the full
explanation.

The expanded section should visibly separate:

- **Interface contract:** allocated VPID in; fixed WRITE-latched page out;
- **Verified mechanism:** miss skips read, initializes page-buffer metadata,
  accepts `PAGE_UNKNOWN`, and publishes under latch protection;
- **Caller obligations:** logical layout/type, TDE, recovery log, dirty, release;
- **Counterfactual:** why `OLD_PAGE` and `RECOVERY_PAGE` are not substitutes;
- **Comparison:** PostgreSQL encodes it as a read mode, InnoDB as a creation
  function;
- **Recommendation:** retain the behavior; optionally narrow the internal API.

Per ADR 0004, edit the English page as the canonical content source and produce
a natural Korean counterpart. Automation may print normalized EN/KO
fingerprints, but a Korean-capable human must review the changed pair before its
review receipt can be marked current. Do not make the Markdown maintainer guide
bilingual.
[Bilingual publication decision](../docs/adr/0004-publish-bilingual-teaching-html.md).

## Evidence boundary

This audit proves pinned source behavior and the pinned caller inventory. It
does not prove that every future revision has the same calls, that the current
API shape is the maintainers' preferred design, or that splitting the API will
improve performance or defect rate. No runtime experiment measured the saved
I/O or exercised removal. The recommendation is a source-informed design
judgment; implementation should begin only after the regression matrix above
is agreed.
