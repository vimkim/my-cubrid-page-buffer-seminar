# What “private domain” means in AOUT-off admission

**Question.** At CUBRID baseline
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, what does “a private-domain
page” mean in the sentence about post-load admission, and does that sentence
say that the private-LRU1-top or shared-LRU2-middle path is absent?

**Evidence boundary.** This note reports a **Verified mechanism** and an
**Implementation policy** from the pinned first-party source. It does not turn
LRU placement into a caller-visible ownership or reuse contract. The local
[full evidence reference](../../reference/private-lru-domain-hit-age-and-unfix-placement.md)
owns the broader branch catalog.

## Short answer

No path is absent. Both placements are executable. The precise reading is:

```text
a newly loaded BCB is still in VOID
        |
        | first eligible unfix that makes global fcnt == 0
        v
unfixing thread has an enabled private-LRU assignment?
        | yes                              | no
        v                                  v
private list S+p, LRU1 top          selected shared list, LRU2 middle
```

“Private-domain page” is loose shorthand for **a VOID BCB whose final-unfixing
execution context has an effective private-LRU assignment**. It is not an
intrinsic page property. At this point the BCB has not yet acquired private or
shared LRU membership; the current thread supplies the destination policy
input. [`th_lru_idx` derivation and VOID dispatch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6713-L6750),
[exact VOID branches](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6885-L6994)

## The association belongs to the context; membership belongs to the BCB

The source has three separate pieces of state:

| State | Where it lives | Meaning |
|---|---|---|
| private-local id `p`, or `-1` | `SESSION_STATE.private_lru_index`, then `THREAD_ENTRY.private_lru_index` | The session/context's association with a private replacement-policy domain |
| effective-private gate | `THREAD_ENTRY.m_is_private_lru_enabled` | Whether page-buffer code should use the thread's raw `p` |
| full LRU index and zone | encoded in `PGBUF_BCB.flags` once the BCB is in an LRU | The BCB's current shared/private list membership and LRU1/LRU2/LRU3 position |

The BCB structure has no session id, transaction id, or private-owner field.
Its `flags` encode only current list/zone state, while holder and latch/fix
state separately describe access ownership. Thus private LRU is a locality and
quota association, not access control. Multiple sessions can even share the
same private list because the assignment algorithm falls back to the
least-active list when no idle list is available.
[BCB representation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L499-L543),
[index conversion and effective-private test](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1079-L1105),
[assignment and possible sharing](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14514-L14602)

The association is normally created at server session creation, stored as
private-local `p`, and copied into the worker that executes a request.
`pgbuf_thread_variables_init()` sets `m_is_private_lru_enabled` only when the
pool has private LRUs and the copied id is not `-1`. Thread entries start with
`-1`/`false`; generic retirement clears both, while session destruction
releases the association and resets the session field. Releasing an association
does not walk the LRU or move its BCBs.
[session assignment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L729-L744),
[request copy and initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/connection/server_support.c#L2069-L2087),
[effective gate calculation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1545-L1560),
[thread initialization and reset](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry.cpp#L81-L148),
[generic context retirement/recycling](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/thread/thread_entry_task.cpp#L61-L110),
[session release](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/session/session.c#L331-L407)

Vacuum worker records are separately assigned private-local ids and a worker
context copies its worker record's id; the vacuum master record has `-1`.
This is another context-association path, not a page owner stored in the BCB.
[vacuum worker assignment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L1244-L1277),
[vacuum context copy/reset](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/query/vacuum.c#L840-L907)

## Why AOUT-off produces these two destinations

Parameter tuning forcibly writes `data_aout_ratio = 0`. AOUT initialization
therefore sets `max_count = 0` and returns, so
`pgbuf_unlatch_void_zone_bcb()` leaves `aout_enabled == false`.
[forced zero](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L9975-L9987),
[zero-capacity initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5802-L5834)

At the eligible zero-count unfix,
`PGBUF_THREAD_HAS_PRIVATE_LRU(thread_p)` decides whether `th_lru_idx` is the
full private index `S+p` or `-1`. In the VOID helper:

1. `th_lru_idx != -1` enters the private block. Because AOUT is off,
   `!aout_enabled` is true, so the BCB is added to the top of that private list.
2. `th_lru_idx == -1` skips the private block and adds the BCB to the middle of
   a selected shared list.

The low-level top insertion explicitly assigns `PGBUF_LRU_1_ZONE`; middle
insertion explicitly assigns `PGBUF_LRU_2_ZONE`. These calls are the two real
placement paths, not descriptions of paths that were removed.
[final-unfix index derivation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6636-L6750),
[AOUT-off private/shared branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6896-L6994),
[top means LRU1 and middle means LRU2](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9694-L9830)

## Server versus stand-alone

In `SERVER_MODE`, private LRU count comes from `num_private_chains`; `-1`
automatically creates private lists, `0` disables them, and a positive value is
accepted subject to the minimum rule. A normal session can therefore take the
private-top path, while a context with no effective assignment—or a server
configured with private chains disabled—takes shared-middle.
[parameter default](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L4171-L4182),
[server quota initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13941-L13983)

In stand-alone mode, initialization forces the private-list count to zero and
the compile-time `PGBUF_THREAD_HAS_PRIVATE_LRU` macro is always false. Ordinary
VOID admission therefore takes shared-LRU2-middle; private-LRU1-top is not
available in that build mode.
[stand-alone quota rule](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13960-L13983),
[stand-alone thread macros](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1081-L1095)

## First placement is not later movement

The quoted sentence describes admission of a newly loaded BCB that remains
`VOID` until its first eligible final unfix. A normal hit does not first reassign
the BCB to the accessor's private domain. Once admitted, the BCB retains its
current list while fixed and follows the LRU1/LRU2/LRU3 branches on later final
unfixes.
[invalid BCB becomes VOID](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8904-L8952),
[normal fix preserves membership](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2342-L2489),
[zone-dependent later unfix](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6742-L6844)

On a later eligible final unfix, an already-private BCB moves through `VOID` to
shared LRU2 middle if the current context's full private index differs from the
BCB's stored list index—including when the current context has no private
assignment—or if the same-domain BCB is both hot and old enough. An
already-shared BCB does not move back to private through this branch. These are
later movement rules, separate from the initial AOUT-off admission choice.
[private-to-shared predicate](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6996-L7038),
[private-to-shared remove/add](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10331-L10353)

Finally, “admission ranking” does not authorize reuse: the allocator has
already obtained an INVALID or safely detached victim BCB before loading the
new identity. The post-load VOID branch only chooses where the resident BCB
enters the replacement lists. A vacuum-specific direct-victim handoff may also
return before ordinary VOID insertion, which is a separate progress mechanism.
[allocation before load](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8180-L8390),
[load/publish path](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L8392-L8634),
[vacuum special branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6909-L6962)

## Less ambiguous wording

> With AOUT disabled, the first eligible global-zero unfix admits a newly
> loaded VOID BCB at the final-unfixing context's private LRU1 top when that
> context has an enabled private-LRU assignment; otherwise it admits the BCB at
> a selected shared LRU's LRU2 middle.

