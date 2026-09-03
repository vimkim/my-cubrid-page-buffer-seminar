# CUBRID log page buffering from first principles

**Level:** Evidence reference
**Source baseline:** CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Purpose:** Primary-source audit for extending Lesson 0013 with the relationship between the data page buffer, the log page buffer, the active-log ring, and archive logs
**Evidence used:** Verified mechanism and Implementation policy from pinned CUBRID source plus the local official CUBRID manual at `3b6ae97bfbdc664b010ffa933ded5a05b291ae03`. No runtime experiment was performed.

## Short answer

`src/transaction/log_page_buffer.c` implements a **separate log-page buffering subsystem**. It does not put log pages into the data-page `PGBUF_BCB` pool.

The shortest accurate picture is:

```text
transaction change
      |
      v
LOG_PRIOR_NODE list                 data-page BCB/frame
(record is staged and gets an LSA)  (changed bytes, page LSA, DIRTY)
      |                                      |
      v                                      |
direct-mapped LOG_BUFFER pool                |
(append pages, dirty bit, no PGBUF_BCB)       |
      |                                      |
      v                                      |
fixed-size active-log file ring              |
      |                                      |
      +---- durable through required LSA <---+  WAL gate before data-page write
      |
      v
archive files preserve older logical log pages before ring slots are reused
```

There are four distinct capacities:

1. The **data page buffer** has `PGBUF_BCB` objects, data frames, page latches, fix counts, holder entries, a resident hash, and replacement lists.
2. The **log page buffer** has a fixed array of small `LOG_BUFFER` descriptors and log-page frames. Its slot choice is direct modulo indexing; there is no BCB, holder list, resident hash, or LRU policy.
3. The **active log file** is a fixed-size on-disk ring. Logical log page IDs keep increasing while their physical slots wrap.
4. **Archive log files** preserve older logical ranges before the active ring overwrites them. The set of retained archives can grow, or old files can be removed according to retention and safety constraints.

An LSA is the logical coordinate `(logical log page ID, offset in that page)`. It makes a long logical log addressable across the fixed active ring and archive files; the LSA itself does not allocate storage, archive pages, or guarantee that an old page is still retained.

## 1. The two page-buffer implementations

### Data pages

The data page buffer in `src/storage/page_buffer.c` represents each resident data page with a `PGBUF_BCB`. The BCB carries a `VPID`, packed latch/fix state, a waiter queue, dirty/flushing state, resident-hash links, and replacement-list links. It returns shared resident page pointers that callers fix and later unfix.

### Log pages

The log page buffer declares its own descriptor:

```c
struct log_buffer
{
  volatile LOG_PAGEID pageid;
  volatile LOG_PHY_PAGEID phy_pageid;
  bool dirty;
  LOG_PAGE *logpage;
};
```

The global pool owns an array of these descriptors, one contiguous page area, and a separate descriptor/page for the log header ([`log_page_buffer.c:191-253`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L191-L253)). A direct search for `PGBUF_BCB` in `log_page_buffer.c`, `log_impl.h`, and `log_storage.hpp` has no match at the pinned baseline.

The two structures solve different problems:

| Question | Data page buffer | Log page buffer |
|---|---|---|
| Resident descriptor | `PGBUF_BCB` | `LOG_BUFFER` |
| Identity | `VPID = (volid, pageid)` | logical `LOG_PAGEID`, plus active-file `phy_pageid` |
| Caller ownership | fix/unfix debt recorded in holders and global `fcnt` | no per-page fix/unfix ledger in `LOG_BUFFER` |
| Byte protection | per-BCB READ/WRITE latch and BCB mutex | log critical section (`CSECT_LOG`) plus narrower mutexes |
| Lookup | resident hash | `logical_pageid % num_buffers` |
| Replacement | INVALID list and private/shared LRU policy | predetermined direct-mapped slot; flush-before-reuse invariant |
| Read result | pointer to shared resident frame | normally a copy into caller-provided `LOG_PAGE` storage |
| Disk home | data volume page | active-log ring or archive file |

The include of `page_buffer.h` in `log_page_buffer.c` does not merge the two pools. The file calls `pgbuf_*` routines for cross-subsystem work such as checkpointing data pages, flushing/invalidation during backup/copy operations, and checking whether a committing thread still holds permanent data pages. Those calls coordinate with the data page buffer; the log-page frames remain `LOG_BUFFER` frames ([`log_page_buffer.c:4062, 6277, 7010-7011, 7517`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L4062-L4062)).

## 2. Pool allocation and default size

`logpb_initialize_pool()` reads `PRM_ID_LOG_NBUFFERS`, allocates exactly that many `LOG_BUFFER` descriptors, allocates `num_buffers * LOG_PAGESIZE` bytes for their page frames, initializes every slot as invalid, and allocates one extra log-header page ([`log_page_buffer.c:545-628`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L545-L628)). Initialization gives each slot:

```text
pageid                  = NULL_PAGEID
phy_pageid              = NULL_PAGEID
dirty                   = false
logpage.header.pageid   = NULL_PAGEID
```

([`log_page_buffer.c:414-434`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L414-L434))

At the pinned baseline, the source default for `log_buffer_size` is 16,384 log pages, with a lower bound of 128 pages. The size-valued parameter and deprecated page-count parameter share one internal value ([`system_parameter.c:1336-1357`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1336-L1357), [`5451-5457`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L5451-L5457)). The official manual reports the same default and describes it as memory used to cache log pages ([manual `config.rst:1185-1190, 1257-1263`](https://github.com/CUBRID/cubrid-manual/blob/3b6ae97bfbdc664b010ffa933ded5a05b291ae03/en/admin/config.rst#L1185-L1190)).

With the default 16 KiB log page size:

```text
16,384 frames * 16 KiB = 256 MiB of log-page frame bytes
```

This is separate from the default 32,768-frame, 512 MiB **data** page buffer ([`system_parameter.c:1169-1190`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1169-L1190)). It also excludes `LOG_BUFFER` descriptors, pointer arrays, the extra header page, the partial-append scratch page, and other logging metadata. `LOG_PAGESIZE` is initialized from the 16 KiB default in `storage_common.c`, while `IO_DEFAULT_PAGE_SIZE` is defined as 16 KiB ([`storage_common.c:46-48`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/storage_common.c#L46-L48), [`storage_common.h:91`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/storage_common.h#L91)). An existing database records its actual log page size in `LOG_HEADER.db_logpagesize`, so maintainers should use the database header rather than assuming 16 KiB in every deployment ([`log_storage.hpp:125-135`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_storage.hpp#L125-L135)).

## 3. Direct mapping replaces hash lookup and LRU selection

For every non-header logical page, the memory slot is:

```c
index = logical_pageid % log_Pb.num_buffers;
```

([`log_page_buffer.c:375-384`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L375-L384))

For a toy pool with four frames:

```text
logical page 0 -> memory slot 0
logical page 1 -> memory slot 1
logical page 2 -> memory slot 2
logical page 3 -> memory slot 3
logical page 4 -> memory slot 0  (reuses page 0's slot)
logical page 5 -> memory slot 1  (reuses page 1's slot)
```

There is no search for a “best” victim. A logical page has exactly one candidate slot. `logpb_locate_page()` checks that slot:

1. If it already has the requested page ID, return its page frame.
2. If it has a different page ID, invalidate the old identity.
3. A dirty collision is declared unexpected; the defensive path asserts and writes the dirty old page before reuse.
4. For `NEW_PAGE`, initialize the frame without reading disk.
5. For `OLD_PAGE`, read the requested logical page from the active log or an archive.

([`log_page_buffer.c:788-916`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L788-L916))

The append-flush list is sized specifically to avoid reaching a dirty direct-map collision in normal operation. `logpb_initialize_flush_info()` allocates one pointer per log-buffer slot but sets `max_toflush = num_buffers - 1` ([`log_page_buffer.c:10897-10927`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L10897-L10927)). Each newly reached append page is added in logical order; reaching the maximum forces `logpb_flush_all_append_pages()` ([`log_page_buffer.c:2715-2738`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L2715-L2738)). After a successful flush, the array is cleared and only the still-current append page is reinserted ([`log_page_buffer.c:3802-3823`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L3802-L3823)).

This yields a useful distinction:

```text
data page replacement: choose an eligible BCB from a policy-managed set
log page replacement: the modulo formula already chose the slot; make reuse safe
```

## 4. Synchronization and read ownership

The log pool has no BCB-level read/write latch and no holder entry. Structural and append operations use the global log critical section. `LOG_CS_ENTER()` takes `CSECT_LOG` exclusively, while `LOG_CS_ENTER_READ_MODE()` enters it as a reader ([`log_manager.c:15443-15477`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_manager.c#L15443-L15477)). `LOG_FLUSH_INFO.flush_mutex` protects the append-page pointer array ([`log_impl.h:318-336`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_impl.h#L318-L336)). Archive mount/state has its own archive critical section.

The ordinary reader API has copy semantics:

```c
logpb_fetch_page(thread, requested_lsa, access_mode, caller_log_page);
```

`logpb_copy_page()` copies a matching resident log frame with `memcpy()`. On a miss it reads from a file into the caller's supplied page. During recovery only, a forward-moving miss may also be copied into the direct-mapped pool as an optimization ([`log_page_buffer.c:1726-1793`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L1726-L1793), [`1856-1989`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L1856-L1989)). `log_reader` demonstrates the caller-owned pattern: it embeds an aligned `IO_MAX_PAGE_SIZE` buffer and makes `m_page` point into it ([`log_reader.hpp:128-160`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_reader.hpp#L128-L160)).

Consequences:

- A log reader normally does not receive a long-lived pointer to a shared frame.
- There is no `pgbuf_unfix()` equivalent for the copied page.
- The caller may keep using its copy after leaving the log critical section, subject to the semantic validity of the log content it copied.
- The append path is different: `log_Gl.append.log_pgptr` points directly at the current pool frame and is mutated while the append protocol owns the required log synchronization.

The source sometimes describes the append page as “fixed,” but `LOG_BUFFER` has no fix-count field. That word should be read as “the current append frame is retained by the log append protocol,” not as evidence of a hidden `PGBUF_HOLDER` or `PGBUF_BCB` fix.

## 5. How a record reaches a log page

The append path has a staging layer before the physical log pages. `LOG_PRIOR_NODE` holds a record header, assigned starting LSA, undo/redo bytes, and a `next` link. `LOG_PRIOR_LSA_INFO` owns a head/tail list, its byte size, a flush list, and a mutex ([`log_append.hpp:90-129`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_append.hpp#L90-L129)).

The high-level flow is:

```text
caller describes undo/redo record
        |
        v
allocate LOG_PRIOR_NODE and assign logical LSA
        |
        v
append node to prior_list_header ... prior_list_tail
        |
        | logpb_prior_lsa_append_all_list()
        v
copy record header/data into current LOG_PAGE frame
        |
        | record crosses a page boundary
        v
logpb_next_append_page(): advance append_lsa.pageid and create next frame
        |
        v
mark modified append pages dirty and retain their pointers in toflush[]
```

`logpb_prior_lsa_append_all_list()` detaches the staged list under its mutex and passes it to `logpb_append_prior_lsa_list()`; the latter consumes nodes and materializes them in log pages ([`log_page_buffer.c:3033-3124`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L3033-L3124)). `LOG_APPEND_INFO` separately tracks the active-log volume descriptor, the lowest not-yet-written address `nxio_lsa`, the last record address, and the current append page pointer ([`log_append.hpp:72-88`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_append.hpp#L72-L88)).

On a page transition, `logpb_next_append_page()`:

1. marks the old append page dirty if required;
2. increments `append_lsa.pageid` and resets its offset;
3. archives old active-log pages if the next disk-ring slot would overtake the next page that has not been archived;
4. advances the active-ring base when physical position 1 is reached again;
5. creates the next log page in its predetermined memory slot; and
6. appends its pointer to the ordered `toflush[]` array.

([`log_page_buffer.c:2603-2738`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L2603-L2738))

## 6. Flush order and the log-flush daemon

`logpb_flush_all_append_pages()` is more than “write every dirty frame.” It preserves a valid end-of-log boundary:

1. It walks `toflush[]` in logical order.
2. It groups successive dirty logical and physical pages into vector writes.
3. It skips the page containing `nxio_lsa` during the first pass.
4. It writes that boundary page last, after the later pages are on disk.
5. It synchronizes the active-log file.
6. It advances `nxio_lsa`, the lowest log address not yet known written.

The source explains that writing the `nxio_lsa` page last prevents recovery from accepting a new end-of-log boundary before all preceding page writes are complete ([`log_page_buffer.c:3355-3369`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L3355-L3369), [`3545-3722`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L3545-L3722)). A record spanning pages has an additional partial-append state machine so a forced flush never exposes an unfinished record as valid log tail ([`log_page_buffer.c:202-240`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L202-L240)).

In server mode, a commit can wake the log-flush daemon and optionally wait, depending on synchronous/asynchronous and group-commit settings. The daemon takes the log critical section, calls `logpb_flush_pages_direct()`, and broadcasts completion to group-commit waiters ([`log_page_buffer.c:3965-4056`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L3965-L4056), [`log_manager.c:10405-10427`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_manager.c#L10405-L10427)). Without an available daemon, the caller flushes directly.

This daemon is different from the data-page flush-control and page-flush daemons. It writes append-log pages and establishes log durability; it does not choose data-page BCB victims.

## 7. The fixed active-log disk ring

The active log file has one physical header page and `LOG_HEADER.npages` data-log slots. Its header records:

- `fpageid`: the logical page currently located at physical slot 1;
- `append_lsa`: the logical append coordinate;
- `nxarv_pageid` and `nxarv_phy_pageid`: the next logical/physical position to archive;
- `nxarv_num`: the next archive file number.

([`log_storage.hpp:112-147`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_storage.hpp#L112-L147))

`logpb_to_physical_pageid()` maps an increasing logical page ID into this fixed range with modulo arithmetic. Physical slot 0 is reserved for the header; data-log slots are 1 through `LOG_HEADER.npages` ([`log_page_buffer.c:4939-4982`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L4939-L4982)).

For an eight-slot toy active ring:

```text
physical active-log file

slot:       0      1      2      3      4      5      6      7
purpose:  header   L0     L1     L2     L3     L4     L5     L6

after one wrap:
slot:       0      1      2      3      4      5      6      7
purpose:  header   L7     L8     L9    L10    L11    L12    L13
                   ^ older L0..L6 must be archived before overwrite
```

The actual mapping is anchored by `fpageid`; this picture assumes the initial base is zero.

The source default `log_volume_size` is 512 MiB, with a 20 MiB minimum and 4 GiB maximum for newly created databases ([`system_parameter.c:3269-3280`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3269-L3280)). Creation converts that byte size to pages ([`boot_sr.c:1621-1639`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/boot_sr.c#L1621-L1639)). The log header subtracts one page because the header occupies physical page 0 ([`log_page_buffer.c:1351-1369`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L1351-L1369)). Thus, with 16 KiB pages:

```text
512 MiB / 16 KiB = 32,768 physical pages in the file
1 header page + 32,767 active data-log page slots
```

`log_volume_size` is a creation default, not a statement that a running database's active log expands forever. The existing file's fixed ring size is stored in its log header. The official manual makes the creation-default scope explicit ([manual `config.rst:839-883`](https://github.com/CUBRID/cubrid-manual/blob/3b6ae97bfbdc664b010ffa933ded5a05b291ae03/en/admin/config.rst#L839-L883)).

## 8. Archive creation protects ring reuse

Before an append transition reuses the physical slot identified by `nxarv_phy_pageid`, `logpb_next_append_page()` calls `logpb_archive_active_log()` ([`log_page_buffer.c:2661-2672`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L2661-L2672)). The archive routine:

1. flushes current append pages;
2. defines an archive range from `nxarv_pageid` through the page before the current record's page boundary;
3. creates or completes `prefix_logarchive.N`;
4. synchronizes it;
5. advances `nxarv_num`, `nxarv_pageid`, and `nxarv_phy_pageid`; and
6. flushes the active-log header with the new archive boundary.

([`log_page_buffer.c:5640-5751`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L5640-L5751), [`5829-5887`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L5829-L5887))

With `background_archiving=yes`, append-page flush also copies completed pages incrementally into a temporary background archive, deliberately excluding the last page because it can still change. At the archive boundary, that temporary file can be renamed into the numbered archive instead of copying the whole range in one burst ([`log_page_buffer.c:2858-2971`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L2858-L2971), [`5741-5824`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L5741-L5824)). This is archive-I/O smoothing. It is not the data-page double-write buffer and does not create another logical log stream.

For reads, `logpb_read_page_from_file()` decides whether a logical page belongs to the archive range. An archive-classified page may still be read from the active ring if its physical slot has not yet been overwritten; otherwise `logpb_fetch_from_archive()` locates and reads the appropriate numbered archive ([`log_page_buffer.c:2000-2101`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L2000-L2101), [`5176-5637`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L5176-L5637)). The subsystem caches metadata and a mounted descriptor for an archive, but that is separate from the direct-mapped log-page frame array.

## 9. Logical length, physical capacity, and retention

Calling the log “unlimited” blends three separate statements:

| Statement | Accurate interpretation |
|---|---|
| Logical LSAs can keep increasing across active-log wraps | Yes, until the fixed-width LSA representation is exhausted |
| The active log file grows with every record | No; it is a fixed ring |
| Every historical log byte remains readable forever | No; availability depends on archive creation, retention, deletion, backup, and disk state |

`LOG_LSA` packs a signed 48-bit page ID and signed 16-bit offset. The pinned source defines `MAX_LOG_LSA_PAGEID = 2^47 - 1`, so the logical address space is extremely large but finite ([`log_lsa.hpp:35-72`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_lsa.hpp#L35-L72)). At 16 KiB per page, the maximum positive page-ID span corresponds to roughly 2 EiB of logical page bytes. This is an address-space observation, not a supported database-size promise.

Archives turn old active-ring ranges into separate files. Their aggregate disk use can grow as more archives are retained. It is not inherently bounded by the 512 MiB active-log file. However, archive removal can make an old LSA unavailable locally.

At the pinned source default:

- `log_max_archives = INT_MAX`;
- `force_remove_log_archives = yes`;
- `background_archiving = yes`.

([`system_parameter.c:1413-1423`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L1413-L1423), [`3000-3021`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3000-L3021))

`INT_MAX` causes the limit-based removal routine to return without deleting anything. With a finite limit, removal still respects additional safety needs such as vacuum, system-crash recovery, HA/log-copy progress, CDC, and flashback ([`log_page_buffer.c:5991-6210`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L5991-L6210)). Packaged configuration or an administrator can override the compiled defaults, so a maintainer must inspect effective parameters and the header/archive state before claiming a retained time range.

The LSA therefore answers **where a record belongs in logical order**. These fields and policies answer **where its bytes can currently be found**:

```text
LSA.pageid / LSA.offset        logical coordinate
LOG_HEADER.fpageid             current active-ring base
LOG_HEADER.npages              active-ring capacity
LOG_HEADER.nxarv_*             archive frontier
LOG_ARV_HEADER.fpageid/npages  logical range in one archive
log_max_archives + safety use  retention/removal decision
```

## 10. The WAL bridge to data pages

The two pools meet at the write-ahead logging rule, not by sharing frames.

A dirty data page contains a page LSA describing the latest logged change represented by its bytes. Before the data page buffer writes that page to its data volume, it calls:

```c
logpb_flush_log_for_wal(thread_p, &data_page_lsa);
```

The data-page flush path copies the page LSA and calls the WAL function before issuing the home-page write ([`page_buffer.c:10781-10849`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10781-L10849)). The log subsystem compares the requested LSA with `nxio_lsa`, the lowest log address not yet written. If `nxio_lsa <= data_page_lsa`, it flushes append pages and rechecks ([`log_page_buffer.c:4150-4189`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L4150-L4189), [`11251-11267`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L11251-L11267)).

```text
data page wants to reach its home volume
                 |
                 v
is required page LSA at/after nxio_lsa?
       | no                         | yes
       v                            v
log already durable enough      flush/sync append log pages
       |                            |
       +-------------+--------------+
                     v
              write data page
```

This ordering ensures recovery can find the log record needed to redo or undo a data page that has reached disk. It does not mean the data page was copied into the log buffer or that a log page uses the data page's BCB.

## 11. Representative structures and functions

| Symbol | Maintainer meaning | Evidence |
|---|---|---|
| `LOG_BUFFER` | Four-field descriptor for one direct-mapped in-memory log frame | [`log_page_buffer.c:191-200`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L191-L200) |
| `LOG_PB_GLOBAL_DATA` / `log_Pb` | Descriptor array, frame area, dedicated header frame, partial-record scratch state | [`log_page_buffer.c:230-279`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L230-L279) |
| `LOG_APPEND_INFO` | Active-log descriptor, durability frontier, last-record LSA, current append frame | [`log_append.hpp:72-88`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_append.hpp#L72-L88) |
| `LOG_FLUSH_INFO` | Ordered pointer array of append frames waiting for flush | [`log_impl.h:318-336`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_impl.h#L318-L336) |
| `LOG_HEADER` | Active-ring size/base, append/checkpoint/archive frontiers, database page sizes | [`log_storage.hpp:110-174`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_storage.hpp#L110-L174) |
| `LOG_ARV_HEADER` | Logical first page, page count, and number of one archive | [`log_storage.hpp:230-257`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_storage.hpp#L230-L257) |
| `logpb_locate_page()` | Direct-map resident hit, safe slot reuse, new-page creation, or old-page read | [`log_page_buffer.c:788-917`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L788-L917) |
| `logpb_fetch_page()` / `logpb_copy_page()` | Materialize staged records when necessary, then copy a resident/file page into caller storage | [`log_page_buffer.c:1726-1793`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L1726-L1793), [`1856-1989`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L1856-L1989) |
| `logpb_next_append_page()` | Advance logical append position, archive before disk-ring collision, create next memory frame | [`log_page_buffer.c:2603-2738`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L2603-L2738) |
| `logpb_flush_all_append_pages()` | Preserve end-of-log order, batch writes, sync, advance `nxio_lsa` | [`log_page_buffer.c:3225-3823`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L3225-L3823) |
| `logpb_to_physical_pageid()` | Map a long-lived logical log page ID into the fixed active-log ring | [`log_page_buffer.c:4939-4982`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L4939-L4982) |
| `logpb_archive_active_log()` | Copy/sync an old logical range into a numbered archive before ring reuse | [`log_page_buffer.c:5640-5887`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L5640-L5887) |
| `logpb_flush_log_for_wal()` | Establish log durability required before a data-page home write | [`log_page_buffer.c:4150-4189`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/transaction/log_page_buffer.c#L4150-L4189) |

## 12. Documentation corrections to carry into Lesson 0013

The rewrite should prevent these common wrong models:

| Tempting model | Correct model |
|---|---|
| “`log_page_buffer.c` reuses `page_buffer.c`.” | It is a separate pool. The two modules call each other only at coordination boundaries such as WAL and checkpoint. |
| “A log page has a BCB and holder entry.” | It has a `LOG_BUFFER` descriptor. Synchronization is log-CS based, and readers normally receive a copy. |
| “The log buffer chooses a victim with LRU.” | A modulo formula predetermines the memory slot. Flush-before-reuse makes the collision safe. |
| “The 512 MiB log grows without limit.” | The active log is a fixed disk ring; archives carry older ranges into additional files. |
| “LSA stores or retains the log.” | LSA names logical order. Ring/header/archive metadata and retention policy locate or remove bytes. |
| “Archive files make history permanent.” | Archives can be deleted after safety/retention constraints permit. |
| “Background archiving is a double-write buffer.” | It incrementally builds a temporary archive to spread archive I/O. |
| “Log flush and data-page flush are the same operation.” | Log flush establishes log durability; data-page flush writes a BCB frame to its data-volume home. WAL orders them. |

## 13. Suggested Lesson 0013 structure

The existing Lesson 0013 explains the redo page-LSA gate. The user's question starts one layer earlier, so the easiest sequence is:

1. **Open with two buffers and one WAL bridge.** State in the first paragraph that data pages use `PGBUF_BCB`, log pages use `LOG_BUFFER`, and neither frame lives in the other pool.
2. **Show one update end to end.** Data-page WRITE fix → stage log record and assign LSA → append to direct-mapped log frame → log flush/sync → data-page flush allowed → later redo compares record LSA with page LSA.
3. **Explain the two modulo mappings separately.** Memory: `logical_pageid % log_buffer_pages`. Disk: logical page ID mapped into the active file's `npages` ring relative to `fpageid`.
4. **Show archive-before-overwrite.** Use a small eight-slot ring with real numbers and move the archive frontier before slot 1 is reused.
5. **Answer the “unlimited” question.** Separate logical address span, fixed active file, cumulative archive storage, and retained readable history.
6. **Return to the redo gate.** A recovery reader supplies its own `LOG_PAGE` buffer; the fetched log record names a data page, which is fixed through the ordinary data page-buffer subsystem with `RECOVERY_PAGE`/WRITE.
7. **End with a compare-back table.** Ask which subsystem owns BCB, page LSA, log LSA, dirty log frame, active-ring slot, archive range, and WAL decision.

### Suggested SVG 1: two independent buffer pools

Filename: `assets/data-and-log-buffer-separation.svg`

```text
left: data page buffer                     right: log page buffer
PGBUF_BCB -> data frame                    LOG_BUFFER -> log frame
hash + private/shared LRU                  modulo-indexed array
fix/unfix + holder                         LOG_CS + caller copy
             \                             /
              +--- logpb_flush_log_for_wal ---+
```

The connector should point from the data-page flush gate to log durability, not from one frame into the other pool.

### Suggested SVG 2: two rings with different sizes

Filename: `assets/log-memory-and-active-file-rings.svg`

Show a four-frame memory pool above an eight-page active disk ring:

```text
logical L12
   |-- memory index 12 % 4 = 0
   `-- active physical slot computed relative to fpageid and 7 data slots
```

Label both mappings explicitly so readers do not confuse `log_Pb.num_buffers` with `LOG_HEADER.npages`.

### Suggested SVG 3: archive frontier and readable history

Filename: `assets/log-ring-archive-retention.svg`

Use three horizontal bands:

```text
logical order: ... 100 101 102 103 104 105 106 107 108 ...
active ring:                    [104][105][106][107]
archives:       archive.7 [100..103]
retention:      keep | eligible for deletion only after all safety floors pass
```

Animate nothing; use arrows for `append_lsa`, `nxio_lsa`, `nxarv_pageid`, and `fpageid`. The important visual fact is that the four addresses are different frontiers.

## Verification boundary

This audit reconstructs source-level mechanism. It does not prove crash persistence on a particular filesystem, the effective runtime values of a deployed server, archive availability after operator action, HA copy progress, or the exact amount of allocator overhead. Those claims require the effective configuration, log header/dump state, file inventory, and controlled crash/restart evidence from the target build.
