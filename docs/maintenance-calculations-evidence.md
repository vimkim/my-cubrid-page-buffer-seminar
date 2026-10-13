# Exact maintenance calculations at the seminar baseline

This author research note verifies the quota and LRU-zone calculations used by
the paired [maintenance chapter](../en/seminar-3/06-maintenance.html). All
mechanism claims below refer to CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, verified in the clean detached
worktree `/home/vimkim/gh/cb/pgbuf-grill` on 2026-10-13. Its
`src/storage/page_buffer.c` SHA-256 is
`d1e71931b2a2da569f7e96c8a35eab85ec5bf0b4dac5fa0c3d0ac69adf03c163`.
The names in that source are `pgbuf_bcb_register_hit_for_lru()` and
`pgbuf_lru_adjust_zones()`; similar proposed names are not the actual symbols.

The formulas describe **Verified mechanism / Implementation policy**. Every
numerical example is **constructed arithmetic**, not an engine runtime
observation, a reservation guarantee, or a claim of optimal policy. The examples
assume no concurrent changes, no counter overflow, and no successful direct
victim assignment unless explicitly stated. The
[VS-21 registry](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)
owns unresolved sampling, BCB-reuse and signed-wrap qualifications; this note
does not change their status.

## 1. Inputs, units and exact numerical operations

| Notation used only in this note | Source value | Unit |
| --- | --- | --- |
| `B` | `pgbuf_Pool.num_buffers` | Frames in the pool |
| `I` | `pgbuf_Pool.buf_invalid_list.invalid_cnt` | Frames on the invalid list |
| `O = B - I` | Operand used for the total private budget | Occupied frames |
| `S` | `pgbuf_Pool.num_LRU_list` / `PGBUF_SHARED_LRU_COUNT` | Shared lists |
| `P` | `quota.num_private_LRU_list` | Private lists |
| `d` | `diff_usec`, an `INT64` | Microseconds since the last accepted update's saved tick |
| `U_read`, `U_reset` | Results of `pgbuf_monitor_sum_pg_unfix(false/true)` | Selected final-unfix events since the prior reset |
| `H_i` | Hit count returned by `ATOMIC_TAS_32(&monitor.lru_hits[i], 0)` | Sampled hits for list `i` |
| `h_i` | Normalized local `lru_hits` | Integer sampled hits per second |
| `A_i`, `A'_i` | Previous/new private `monitor.lru_activity[i]` | Smoothed integer sampled hits per second |
| `r` | New local `private_ratio` | Dimensionless fraction |
| `R`, `R'` | Previous/new `quota.private_pages_ratio` | Dimensionless fraction |
| `K` | `all_private_quota` | Private budget in frames, before individual-list truncation/caps |
| `w_i` | `new_lru_ratio` | Private list's dimensionless activity share |
| `q_i` | Private `lru_list->quota` | Retention target in frames |
| `g` | `avg_shared_lru_size` | Computed target size per shared list |
| `t1`, `t2` | `threshold_lru1`, `threshold_lru2` | Zone target counts in frames |
| `n1`, `n2`, `n3` | `count_lru1`, `count_lru2`, `count_lru3` | Actual zone membership counts |

The source uses `int` for counts, hits, activities, budgets and quotas; `INT64`
for `d` and the time constants; and `float` for ratios. Integer division and
conversion to `int` truncate toward zero. For the nonnegative inputs in these
examples, this has the effect of discarding the fractional part. A float product
is rounded as a float before its conversion to `int`: replacing the complete
expression with a real-number floor can give a different boundary result.
[types and local constants](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14262-L14286),
[quota/monitor fields](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L692-L735)

## 2. Attempt, accepted epoch, and changed output are different events

`pgbuf_page_maintenance_execute()` returns without calling either maintenance
helper while `BO_IS_FLUSH_DAEMON_AVAILABLE()` is false. Otherwise it calls
`pgbuf_adjust_quotas()`, then the separate direct-victim backup. The looper is
configured for 100 ms; this is an attempt cadence, not an epoch duration.
Private-list assignment also calls the quota helper, and release calls it when
the association count reaches zero or below after clearing that list's activity.
[daemon entry](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16994-L17009),
[100 ms looper](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17146-L17161),
[foreground callers](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14582-L14623)

The helper's complete admission and reset order is:

1. A null `thread_p` first encounters `assert(thread_p != NULL)`, then the
   release-build fallback obtains the current thread entry. This is not a
   normal early-return branch.
2. Return if private quota is disabled (`P == 0`) or `quota.is_adjusting` is
   already nonzero. This flag is a plain `int` test/store in this function,
   not the LRU mutex or an atomic compare-and-swap claim.
3. Store `is_adjusting = 1`, capture `curr_tick`, and calculate
   `d = tsc_elapsed_utime(curr_tick, last_adjust_time)`.
4. If `d < 1,000`, clear `is_adjusting` and return. No samples or stored tick
   are reset, and `adjust_age` does not advance.
5. Read unfix shards without resetting them. Return, after clearing the flag,
   if `U_read < B / 4` **and** `d < 500,000`. Both divisions/comparisons use
   the source's integer operands.
6. Read the shards again **and reset each to zero**. Set
   `low_overall_activity` when `U_reset < (B / 4) / 100`. This marks policy
   input; it does not reject the epoch.
7. Store `last_adjust_time = curr_tick`, then increment `adjust_age` by one
   using `ATOMIC_INC_32`.
8. Visit every shared/private list, exchange its hit counter with zero,
   normalize the returned hits, and update activities. Calculate and publish
   quotas and thresholds, conditionally adjust zones, advertise candidates,
   set `victim_rich`, then clear `is_adjusting`.

[complete admission through consumption](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14288-L14374),
[remaining update and flag clear](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14376-L14511),
[feature macro](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1071-L1079)

For positive, normally ordered time readings, the admitted condition is
`P > 0`, no active adjustment flag, `d >= 1,000`, and
`(U_read >= B / 4 || d >= 500,000)`. There is no five-minute comparison.
Equality passes the timing gates: exactly 1 ms can pass with sufficient
activity; exactly 500 ms can pass even with zero activity. The source comment's
five-minute description disagrees with these executable comparisons.
[guard/comment comparison](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14304-L14326)

For `B = 32,768`, `B / 4 = 8,192` and `(B / 4) / 100 = 81` after integer
division. At `d = 499,999`, `U_read = 8,191` rejects; `U_read = 8,192`
passes if the 1 ms guard has passed. At `d = 500,000`, even `U_read = 0`
passes. On that accepted pass, `U_reset = 80` is low activity and
`U_reset = 81` is not. These are constructed boundary checks, not an exact
scheduler guarantee.

`adjust_age` is therefore `previous_adjust_age + 1` for each accepted
pass, not `floor(elapsed_time / 100 ms)`, the number of attempted calls, or
the number of differing quotas. The saved tick is the captured tick before
calculation and list work, not a completion timestamp. An accepted pass may
leave every numeric quota unchanged.
[saved tick and age increment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14304-L14330)

### Where the microseconds come from

`tsc_elapsed_utime()` calls `tsc_elapsed_time_usec()`, then returns
`tv_sec * 1,000,000LL + tv_usec` as `UINT64`; the quota helper assigns this
to `INT64 diff_usec`. In TSC mode, an end tick below the start tick returns
zero; otherwise the seconds are `tick_difference / cpu_frequency` and
microseconds are `(tick_difference % cpu_frequency) * 1,000,000 /
cpu_frequency`, using integer division. In the other mode, Linux captures
`CLOCK_REALTIME_COARSE`, divides nanoseconds by 1,000 and subtracts the
timevals with a borrow when the microsecond difference is negative. These are
the pinned timer mechanics; the quota function does not compute a separate
wall-clock epoch number or guarantee exact scheduler spacing.
[timer implementation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/tsc_timer.c#L43-L58),
[tick capture and elapsed conversion](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/tsc_timer.c#L77-L150),
[timer types](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/tsc_timer.h#L42-L57)

### Two kinds of activity counter

The unfix shard increases in the zero-fix-count branch only after the
move-to-bottom alternative is excluded and while there is no blocked
reader/writer; it precedes the zone-specific sampling choices. It is not all
fix calls or all user SQL reads. The shard aggregator sums all managed thread
entries and the separate main entry; its resetting read is separate from the
admission read. Its own comment explicitly accepts lost increments between
plain reads and resetting stores for this coarse heuristic.
[unfix increment context](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6713-L6740),
[aggregator and approximation statement](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L2204-L2244)

`pgbuf_bcb_register_hit_for_lru()` instead asserts current LRU membership and
does the following:

```c
if (bcb->hit_age < pgbuf_Pool.quota.adjust_age)
  {
    pgbuf_Pool.monitor.lru_hits[pgbuf_bcb_get_lru_index (bcb)]++;
    bcb->hit_age = pgbuf_Pool.quota.adjust_age;
  }
```

The index is the BCB's current destination list at registration. One BCB
normally contributes at most one eligible sampled hit during one age value;
repeated fixes/unfixes are suppressed. A same-epoch move between private and
shared does not reset this check. The registration and reset are not an exact
atomic epoch-wide snapshot: the age is incremented before the per-list
exchange loop, and writers plainly increment counters while the reader uses
atomic exchanges. Preserve the VS-21 qualification rather than describing
these samples as exact distinct page accesses.
[registration](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16594-L16610),
[age-before-drain ordering](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14328-L14342)

All direct registration callers at this pin are:

| Caller | Registration moment and exclusion |
| --- | --- |
| `pgbuf_unlatch_bcb_upon_unfix()` LRU1 branch | After retained placement; ignore paths skip it, migration registers elsewhere |
| Same helper, LRU2 branch | After optional boost or retained placement; ignore paths skip it |
| Same helper, LRU3 branch | After boost; ignore paths can attempt a direct offer and skip hit registration |
| `pgbuf_unlatch_void_zone_bcb()` private-top branch | After insertion into current private list; vacuum-specific branch returns earlier |
| Same helper, private-middle branch | After insertion; this is an AOUT-dependent branch |
| Same helper, shared-middle branch | After insertion, provided the vacuum ignore predicate is false |
| `pgbuf_lru_move_from_private_to_shared()` | After removal from private and insertion into shared, so the destination is sampled |

[resident branches](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6742-L6844),
[VOID insertion branches](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6909-L6994),
[migration then registration](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10331-L10353)

`adjust_age`, BCB `hit_age`, hit counters and activities initialize to zero;
enabled `private_pages_ratio` initializes to `1.0f`, and LRU quotas and
thresholds initialize to zero. Thus the ordinary `0 < 0` hit-age check does
not collect a hit before the first accepted age advance. Ordinary BCB reuse
does not visibly reset `hit_age`; signed `adjust_age` wrap has no explicit
handling in this seam. These source findings are not measurements of workload
impact.
[quota initialization](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L13949-L13983),
[initial ratio](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14032-L14038),
[initial monitors](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14089-L14097),
[initial hit age](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5605-L5643),
[initial LRU state](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L5774-L5797),
[all reuse qualifications](../reference/private-lru-domain-hit-age-and-unfix-placement.md#6-evidence-boundaries-and-source-level-anomalies)

## 3. Exact quota formulas in executable order

### Normalize each list, then sum and smooth

With `one = 1,000,000LL` and `ten = 10,000,000LL`, consume each list's
counter and evaluate:

```c
h_i = (int) (one * H_i / d);
```

The multiplication and division use `INT64`, and division happens before the
final cast. Normalize each list individually **before** adding normalized
private/shared rates. For example, at `d = 3,000,000`, three lists with one
sampled hit each have rates `0 + 0 + 0`, whereas normalizing their combined
three hits would give one. That alternative is not the source calculation.
[per-list normalization and accumulation](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14337-L14370)

For each private list only:

```c
if (d >= ten)
  A'_i = h_i;
else
  A'_i = (int) (((ten - d) * A_i + d * h_i) / ten);
```

This activity smoothing is integer arithmetic, not a floating-point moving
average. At 0.5 seconds the old/new weights are 95%/5%; at 5 seconds they are
50%/50%; at 10 seconds or longer the old activity is discarded. It is a
time-dependent interpolation, not a fixed number of preceding epochs.
`A_sum = sum(A'_i)` uses these already-truncated private activities.
`h_private = sum(private h_i)` and `h_shared = sum(shared h_i)` instead use
the unsmoothed normalized rates. Shared activities are not smoothed here.
[private activity formula](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14344-L14370)

### Choose the new private-ratio sample and smooth it separately

```c
if (low_overall_activity)
  r = 0.01f;
else
  {
    h_shared = MAX (1, h_shared);
    r = (float) h_private / (float) (h_private + h_shared);
    r = MIN (0.998f, r);
    r = MAX (0.01f, r);
  }

if (d >= ten)
  R' = r;
else
  R' = ((R * (float) (ten - d) + r * (float) d) / (float) ten);
```

The shared floor of one is applied to the aggregate normalized shared rate,
not each list's rate; it is a denominator guard, not an actual extra shared
access. The low-activity branch bypasses that denominator calculation and
uses the minimum sample. The ratio smoothing uses `float` casts and
operations, unlike activity smoothing. There is no extra clamp after this
smoothing. In particular, a short-interval result can exceed `0.998f` while
mixing an initial `R = 1.0f` with a bounded sample; only the new sample is
clamped. Zero hits do not necessarily immediately eliminate prior activity
or quotas.
[sample bounds and float smoothing](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14376-L14398)

### Total private budget, per-list split and caps

If `A_sum == 0`, set `K = 0` and every private quota and zone threshold to
zero. The already-computed `R'` is not overwritten with zero. Otherwise:

```c
K = (int) ((B - I) * R');
w_i = A'_i > 0 ? (float) A'_i / (float) A_sum : 0.0f;
q_i = (int) (w_i * K);
q_i = MIN (q_i, 5000);
q_i = MIN (q_i, B / 2);
t1_i = (int) (q_i * 0.05f);
t2_i = (int) (q_i * 0.05f);
```

The occupied-frame operand `B - I` converts to float for its product with
`R'`. The per-list ratio and product are also float operations, followed by
separate integer truncation. No loop redistributes either rounding residue
or frames lost to caps. `K` remains the original budget; it is not replaced
by `sum(q_i)`. The two equal private zone thresholds are each about 5% of
quota, and their sum is about 10% of quota, not quota itself.
[zero-activity branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14400-L14429),
[budget, split, caps and private thresholds](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14430-L14474),
[hard-cap constant](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1071-L1077)

### Shared target and thresholds

```c
g = (B - K) / S;
g = MAX (g, 50);
shared_t1 = (int) (g * pgbuf_Pool.ratio_lru1);
shared_t2 = (int) (g * pgbuf_Pool.ratio_lru2);
```

Shared calculation uses **whole pool capacity `B`**, not occupied count `O`,
and subtracts original private budget `K`, not the sum of capped private
quotas. Division is integer; the 50-frame minimum applies afterward. The
helper writes these thresholds to each shared descriptor but does not assign
its `quota` field. Its target is a policy calculation, not a hard allocation
of physical frames, so capped-away private budget and minimum shared targets
are not a conservation equation for exclusive reservations.
[shared calculation/publication](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14477-L14504)

Shared ratios are cached at startup. The default inputs are hot `0.4f` and
buffer `0.05f`. Initialization applies hot minimum `0.05f`, hot maximum
`0.90f`, buffer minimum `0.05f`, then buffer maximum
`1.0f - 0.05f - cached_hot`. Private thresholds always use compiled
`0.05f` in this seam.
[ratio defaults](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/base/system_parameter.c#L3754-L3777),
[startup clamp order](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1731-L1740),
[compiled ratios](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L342-L343)

Candidate advertisement and `victim_rich` are separate outputs. A private
list is advertised when its candidate count is positive and its **entire**
list size `n1 + n2 + n3` exceeds quota; shared lists need only a positive
candidate count. `total_victims` was collected during the earlier hit loop,
before this pass's zone adjustments; the supply hint is
`total_victims >= (int) (0.1 * B)`. It is not a new recount after demotion
or a proof that a particular frame is reusable.
[candidate collection](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14372-L14374),
[advertisement and supply hint](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14457-L14510),
[whole-list versus warmer-zone macros](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1060-L1067)

## 4. Exact zone-adjustment triggers and movement order

After publishing private `q`, `t1`, `t2`, the nonzero-activity quota branch
calls `pgbuf_lru_adjust_zones(..., false)` only when **`n1 + n2 > q`**.
The zero-activity branch calls it when `n1 + n2 > 0`, with zero thresholds.
Shared lists call it when **`n1 + n2 > t1 + t2`**. These checks precede
locking the relevant list mutex; the invoked helper operates under that
mutex. Publication alone does not relabel any BCB.
[private guards and locks](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14400-L14464),
[shared guard and lock](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14477-L14493)

The private trigger `q` and the helper's combined target `t1 + t2` are
different. For example, publishing `q = 100`, `t1 = t2 = 5` while actual
`n1 + n2 = 40` does not call the helper from this quota branch, even though
40 exceeds 10. Publishing the same target while `n1 + n2 = 130` calls it
and reduces warmer membership all the way toward 10, not merely toward 100.
Other operations also adjust zones: new top insertion and a boost from LRU3
use `min_one = true`; a boost from LRU2 adjusts only zone 1; private victim
selection may adjust zones under its list mutex when over quota.
[other top/boost paths](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10173-L10232),
[victim-selection adjustment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9351-L9364)

`pgbuf_lru_adjust_zones()` performs the colder demotions first:

1. Set combined target to `t1 + t2`; only `min_one = true` raises it to
   at least one. Quota adjustment passes false and preserves no minimum.
2. If the combined count already fits, call the zone-1 helper and return.
3. Otherwise begin at `bottom_2` if nonnull, else `bottom_1`, and walk
   `prev_BCB` toward newer entries. Before each fall, save `prev_BCB` because
   the fall helper may remove that BCB through direct assignment.
4. Fall each visited BCB directly into LRU3, or remove it through successful
   direct assignment, until `n1 + n2 <= combined_target`. This exhausts
   the oldest LRU2 entries first. If necessary it continues directly from
   LRU1 into LRU3; an obligatory LRU1-to-LRU2 intermediate transition does
   **not** exist for those entries.
5. Repair `bottom_2`; when LRU2 is empty, clear it and repair or clear
   `bottom_1` according to remaining LRU1 membership.
6. Call `pgbuf_lru_adjust_zone1()`. It walks from `bottom_1` toward newer
   entries and relabels LRU1 to LRU2 until `n1 <= t1`. If LRU2 had been
   empty, its initial bottom is the old `bottom_1`; then repair or clear
   `bottom_1`.

The zone-1 helper also raises its own target to one only with
`min_one = true`. The separate zone-2 helper demotes its oldest LRU2 entries
to LRU3 toward `t2`; it is not called by this combined helper.
[combined algorithm and boundaries](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9984-L10048),
[zone-1 algorithm](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9881-L9932),
[separate zone-2 algorithm](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9934-L9982)

Ordinary demotion changes logical zone membership and boundary pointers,
without moving page bytes or relinking the BCB within the list. Falling to
LRU3 saves the list's `tick_lru3` into the BCB, increments that list tick
with its explicit wrap handling, and calls `pgbuf_bcb_change_zone()`. That
helper uses CAS to preserve concurrent non-zone flags while changing zone
bits, decrements the old zone count and increments the new zone count under
the LRU mutex, and updates candidate count/hint when appropriate. Candidate
counting uses blocking flags rather than final protected fix-count
authorization: `n3` and `count_vict_cand` are different quantities, and
neither alone permits overwriting a page.
[ordinary fall](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10109-L10121),
[zone mutation, synchronization and counts](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15860-L15986),
[candidate hint and count](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15674-L15719)

### Successful direct assignment is a different fall outcome

In SERVER_MODE, the fall helper can first attempt a direct victim offer if
the cheap victimizable check passes and an allocator is waiting. A
to-vacuum BCB falls through to ordinary demotion. Otherwise it takes a
**nonwaiting BCB try-lock** while holding the list mutex, rechecks
victimizability under the BCB mutex, and calls `pgbuf_assign_direct_victim()`.
On success it removes the BCB from this LRU immediately, unlocks the BCB,
calls the AOUT helper and returns without adding it to LRU3. That removal
sets its zone to VOID and updates list links, boundaries and counts. A failed
try-lock, protected check or assignment falls through to ordinary demotion.
[conditional offer/removal](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10059-L10121),
[protected eligibility](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9287-L9312),
[direct assignment and waiter state](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15420-L15484),
[list removal and VOID transition](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10356-L10417)

Consequently, quota adjustment cannot be described as always leaving all
list entries present. Ordinary demotion leaves pages resident and does no
page I/O; successful protected assignment changes list membership and offers
the frame to a waiting allocator. It does not itself overwrite that frame
with a new page. Receiving and reuse have their own validation path. The
separate backup's VS-20 loop anomaly does not disable this producer.
[allocator-side receipt](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15592-L15653),
[independent backup call](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16997-L17008),
[VS-20 status](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations)

## 5. Worked accepted epochs: one private workload becomes busier

This constructed series continues between rows. Let `B = O = 10,000`,
`S = 4`, `P = 4`, default shared zone ratios, and `d = 5,000,000` for each
accepted pass. Only the first two private lists have activity. Before the
series: `adjust_age = 8`, `R = 0.5f`, private activities `[500, 500, 0, 0]`
and quotas `[2,500, 2,500, 0, 0]`. These are prior constructed warm state,
not startup state, where enabled `R` would be one. Each accepted pass has
`U_read = U_reset = 10,000`, above both thresholds `B / 4 = 2,500` and
`(B / 4) / 100 = 25`. There are no concurrent counter updates.

The hit vectors are `[H_private_1, H_private_2, 0, 0]` and the four shared
raw counters shown below. Rates are each raw counter divided by five after
the source's integer normalization.

| Accepted epoch | Private raw hits | Shared raw hits | Private rates | Private activity calculation | Resulting activities | Resulting quotas |
| --- | --- | --- | --- | --- | --- | --- |
| Age 8 to 9 | `[4500, 500, 0, 0]` | `[1250, 1250, 1250, 1250]` | `[900, 100, 0, 0]` | `[(500 + 900)/2, (500 + 100)/2]` | `[700, 300, 0, 0]` | `[3500, 1500, 0, 0]` |
| Age 9 to 10 | Same raw counters | Same raw counters | `[900, 100, 0, 0]` | `[(700 + 900)/2, (300 + 100)/2]` | `[800, 200, 0, 0]` | `[4000, 1000, 0, 0]` |
| Age 10 to 11 | `[4000, 1000, 0, 0]` | Same shared counters | `[800, 200, 0, 0]` | `[(800 + 800)/2, (200 + 200)/2]` | `[800, 200, 0, 0]` | `[4000, 1000, 0, 0]` |

The intermediate ratio/budget calculations on every row are:

```text
h_private = 900 + 100 = 1000  (third row: 800 + 200 = 1000)
h_shared  = 250 + 250 + 250 + 250 = 1000
r = (float)1000 / (float)(1000 + 1000) = 0.5f
R' = (0.5f * 5,000,000 + 0.5f * 5,000,000) / 10,000,000 = 0.5f
K = (int)(10,000 * 0.5f) = 5000
A_sum = 1000
row 1 weights = 700/1000, 300/1000; int products = 3500, 1500
row 2 weights = 800/1000, 200/1000; int products = 4000, 1000
row 3 weights = 800/1000, 200/1000; int products = 4000, 1000
All list caps are inactive: quota <= 5000 and <= B/2 = 5000.
g = (10,000 - 5000) / 4 = 1250
shared_t1 = (int)(1250 * 0.4f) = 500
shared_t2 = (int)(1250 * 0.05f) = 62
```

Private thresholds are `[175, 75, 0, 0]` for each of zones 1 and 2 on row
one, then `[200, 50, 0, 0]` on rows two and three. The first private list
gains target at the expense of the second even though the total private
ratio remains unchanged. The third accepted epoch consumes/reset samples
and advances age with unchanged activities and quotas. Epoch admission
does not require a numeric output difference.

## 6. Independent ratio shift, truncation, caps and quiet cases

Each example below starts independently. None continues the preceding one.

### A shift from shared toward private changes the total budget

Use `B = O = 10,000`, `S = P = 4`, `d = 5,000,000`,
`U_read = U_reset = 3,000`, old `R = 0.5f`, and private activities
`[300, 200, 0, 0]`. Raw private hits `[1000, 500, 0, 0]` give rates
`[200, 100, 0, 0]`; raw shared hits `[125, 125, 125, 125]` give rates
`[25, 25, 25, 25]`.

```text
A'_1 = (300 + 200)/2 = 250
A'_2 = (200 + 100)/2 = 150; A_sum = 400
r = 300/(300 + 100) = 0.75f
R' = (0.5f * 5,000,000 + 0.75f * 5,000,000) / 10,000,000 = 0.625f
K = (int)(10,000 * 0.625f) = 6250
w_1 = 250/400 = 0.625f; q_1 = (int)(0.625f * 6250) = 3906
w_2 = 150/400 = 0.375f; q_2 = (int)(0.375f * 6250) = 2343
sum(q_i) = 6249; the one-frame truncation residue is not redistributed.
Private t1=t2: (int)(3906*0.05f)=195, (int)(2343*0.05f)=117
g = (10,000 - 6250) / 4 = 937  (discard the quotient's .5)
shared_t1 = (int)(937*0.4f)=374; shared_t2=(int)(937*0.05f)=46
```

### The hard cap does not feed a second allocation pass

Use `B = O = 20,000`, `S = P = 4`, `d = 10,000,000`,
`U_read = U_reset = 20,000`. Private raw hits `[9000, 1000, 0, 0]`
give activities/rates `[900, 100, 0, 0]` directly; shared raw hits
`[2500, 2500, 2500, 2500]` give an aggregate rate of 1,000.

```text
r = R' = 1000/(1000+1000) = 0.5f; K=20,000*0.5f=10,000
raw private quotas: (int)(0.9f*10,000)=9000, (int)(0.1f*10,000)=1000
q_1 = MIN(MIN(9000,5000),10,000)=5000
q_2 = MIN(MIN(1000,5000),10,000)=1000
sum(q_i)=6000; capped-away 4000 frames are not redistributed.
g=(20,000-10,000)/4=2500, not (20,000-6000)/4=3500.
Private t1=t2 are 250 and 50; shared_t1=1000, shared_t2=125.
```

### The half-pool cap, upper ratio bound and shared floor

Use `B = O = 6,000`, `S = P = 4`, `d = 10,000,000`,
`U_read = U_reset = 5,000`, private raw hits `[5000, 0, 0, 0]`, and zero
shared hits. This is nonlow activity. `h_private = 500`; the shared
aggregate is guarded from zero to one. `500/501` exceeds `0.998f`, so the
sample is upper-clamped to `0.998f` and replaces the old ratio.

```text
R' = 0.998f; K = (int)(6000*R')=5988
w_1=1; raw q_1=5988
after hard cap:5000; after B/2 cap:3000
t1=t2=(int)(3000*0.05f)=150
integer shared residual target=(6000-5988)/4=3
g=MAX(3,50)=50
shared_t1=(int)(50*0.4f)=20; shared_t2=(int)(50*0.05f)=2
```

The 50-frame floor is policy, not proof of fifty reserved physical frames
for each shared list. Binary32 represents `0.998f` as approximately
`0.998000026`; the compiled arithmetic still produces the integers above.

### Zero current hits with and without retained activity

For `B = O = 10,000`, `S = P = 4`, zero unfix events and zero hits are
admitted at 500 ms. With old `R = 0.5f`, activities `[500, 500, 0, 0]`
and `d = 500,000`:

```text
low=true because 0 < 25; h_i=0 for every list
A'_1=A'_2=(9,500,000*500 + 500,000*0)/10,000,000=475
r=0.01f
R'=(0.5f*9,500,000 + 0.01f*500,000)/10,000,000
  ≈ 0.475499988 in binary32
K=(int)(10,000*R')=4755  (float multiplication rounds before int conversion)
w_1=w_2=0.5f; q_1=q_2=(int)(4755*0.5f)=2377
t1=t2=(int)(2377*0.05f)=118 for each active private list
g=(10,000-4755)/4=1311; shared_t1=524; shared_t2=65
```

Thus zero newly sampled hits do not imply zero quotas on a short interval.
In a fresh independent case with zero hits and `d >= 10,000,000`, all new
private activities become zero. Even though `R' = 0.01f` on the low-activity
pass, the zero-activity branch forces `K = 0`, all private quotas and
thresholds zero, and `g = 10,000/4 = 2500`. Shared thresholds are 1,000
and 125. Do not substitute a private budget of 100 for that explicit branch.

### Occupied frames affect private and shared calculations differently

Use `B = 10,000`, `I = 2,000`, `O = 8,000`, `S = P = 4`,
`d = 10,000,000`, nonlow activity, private raw hits `[2000, 2000, 0, 0]`
and shared raw hits `[1000, 1000, 1000, 1000]`. Both aggregate rates are
400, so `R' = 0.5f`. `K = (int)(8000*0.5f) = 4000`; private quotas
are 2,000 each with thresholds 100 each. Shared target is
`(10,000-4000)/4 = 1500`, not `(8000-4000)/4 = 1000`. Shared
thresholds are 600 and 75. The shared computation still uses pool capacity.

## 7. Worked private and shared target reductions

These independent examples assume no waiting allocator produces a successful
direct assignment and no concurrent list mutation. All initial counts are
actual membership, not targets. A tuple means `(n1, n2, n3)`.

### Private shrink: triggering at quota, reducing to zone targets

Start with a private quota 200 and counts `(80, 50, 70)`. Publish a new
quota `q = 100`, so `t1 = t2 = (int)(100*0.05f) = 5`.

```text
Private trigger: 80+50=130 > q=100, so lock list and adjust.
Combined warmer target:5+5=10.
Start at bottom_2: demote 50 oldest LRU2 entries to LRU3.
Counts:(80,50,70) -> (80,0,120).
Still 80>10: continue backward into LRU1; demote 70 LRU1 entries directly to LRU3.
Counts:(80,0,120) -> (10,0,190).
bottom_2=NULL; bottom_1 points to oldest remaining LRU1 entry.
Zone-1 target:5. Demote 5 oldest remaining LRU1 entries to LRU2.
Counts:(10,0,190) -> (5,5,190).
Set bottom_2 to the first of those zone-1 boundary entries, and repair bottom_1.
Total list size remains200, with no successful direct assignment or eviction.
```

The combined helper has moved 120 entries into LRU3 and then five into
LRU2. It has not produced a physically empty frame. The final entire list
is still above quota (`200 > 100`), so its nonzero eligible candidate
count can support victim-source advertisement. If the same new quota had
been published to a list with counts `(20, 20, 160)`, the private quota
guard would be false (`40 <= 100`): this quota pass would leave those
counts intact despite their warmer-zone total exceeding the ten-frame
threshold sum.

### Shared shrink: triggering directly at combined thresholds

Start with shared computed target `g = 100`, default ratios, thresholds
`t1 = 40`, `t2 = 5`, and counts `(40, 5, 55)`. Independently suppose a
new private budget makes this shared target `g = 50`. New thresholds are
`t1 = 20`, `t2 = 2` after integer conversion.

```text
Shared trigger:40+5=45 > 20+2=22, so lock list and adjust.
Combined warmer target:22.
Demote 5 oldest LRU2 entries:(40,5,55) -> (40,0,60).
Continue backward into LRU1; demote 18 directly:(40,0,60) -> (22,0,78).
Zone-1 target:20; demote 2 remaining LRU1 entries to LRU2.
Final counts:(20,2,78); total list size remains100.
```

Both calculations use the same combined helper; the caller's trigger differs.
When zone targets grow, these helpers do not promote existing LRU3 entries
to fill the larger targets. They only demote excess; subsequent insertions
and access-driven boosts can populate warmer zones.
[demotion-only conditions](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9895-L9931),
[combined fall loop](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9999-L10047)

## 8. Existing wording audit and evidence limits

The existing maintenance HTML correctly distinguishes attempt from accepted
epoch, the private combined-count quota guard from the shared threshold guard,
and metadata changes from protected direct offers. Its initial worked
unchanged-quota trace is schematic: the old quotas and hit/activity inputs
are not sufficient to reproduce the number 60. The arithmetic above supplies
complete reproducible inputs rather than treating that illustration as a
runtime receipt. This paragraph describes the wording at the start of the
research; the chapter-specific additions audited afterward are recorded below.

The canonical private-domain reference states that accepted passes normalize
hits and smooth private activity, but does not give the exact typed arithmetic,
the unredistributed budget remainder, or the combined helper's cold-first
ordering. No contradiction was found in its short explanation. The precise
maintenance additions should clarify these omissions without inventing an
always-sequential `LRU1 -> LRU2 -> LRU3` path or immediate physical eviction.
[current chapter](../en/seminar-3/06-maintenance.html#quota-from-samples),
[canonical epoch explanation](../reference/private-lru-domain-hit-age-and-unfix-placement.md#2-who-advances-adjustage)

Two comment/code conflicts deserve explicit treatment: the quota gate comment
mentions five minutes, while code compares 1 ms and 500 ms; and the monitor
field comment calls `lru_hits` LRU1 hits, while registration callers include
eligible LRU2/3, new insertion and migration paths. The VOID vacuum comment
also says it does not register unfix activity, but the caller increments the
general unfix shard before dispatching into that helper; its skipped
registration refers accurately to the per-list hit sample. Follow executable
control flow and distinguish the two counters.
[monitor comment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L693-L705),
[gate comment](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14313-L14326),
[VOID comment and caller ordering](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6725-L6749),
[VOID vacuum branch](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L6909-L6961)

Neither this static audit nor the arithmetic harness measures lost samples,
wrap behavior, allocator latency, fairness, or production performance. A
100 ms looper plus these gates is not an exact five-call timer. Hit samples
are not SQL read counts, physical I/O counts, a cache-hit percentage or
correctness authorization.

## 9. Standalone arithmetic receipt

The numerical receipt was compiled on x86-64 with GCC 11.5.0, C++17, `-O0`
and `-ffp-contract=off`. This isolates the source's integer/float calculation
order; it is not linked against CUBRID and does not execute its concurrency,
timer or list code. The printed shared rate includes the denominator guard only on nonlow
activity, following the source branch. Use the exact code below to reproduce
the numbers, not a JavaScript double-precision approximation.

```sh
c++ -std=c++17 -O0 -ffp-contract=off maintenance-calculations.cpp -o maintenance-calculations
./maintenance-calculations
```

```cpp
#include <algorithm>
#include <array>
#include <cstdio>
#include <cstdint>
struct State { float ratio; std::array<int,4> activity; };
void step(const char *label, State &s, int B, int invalid, int shared_lists,
          int64_t dt, int unfixes, std::array<int,4> private_hits,
          std::array<int,4> shared_hits) {
  constexpr int64_t one=1000000LL, ten=10000000LL;
  if(dt<1000 || (unfixes<B/4 && dt<500000)) { std::printf("%s rejected\n",label); return; }
  bool low=unfixes<(B/4)/100;
  int hp=0,hs=0,sum=0;
  for(int i=0;i<4;i++) {
    int h=(int)(one*private_hits[i]/dt); hp+=h;
    s.activity[i]=dt>=ten?h:(int)(((ten-dt)*s.activity[i]+dt*h)/ten);
    sum+=s.activity[i];
    hs+=(int)(one*shared_hits[i]/dt);
  }
  float sample;
  if (low) sample=.01f;
  else {
    hs=std::max(1,hs);
    sample=(float)hp/(float)(hp+hs);
    sample=std::min(.998f,sample);
    sample=std::max(.01f,sample);
  }
  s.ratio=dt>=ten?sample:((s.ratio*(float)(ten-dt)+sample*(float)dt)/(float)ten);
  int budget=sum==0?0:(int)((B-invalid)*s.ratio);
  std::printf("%s low=%d hP=%d hS=%d sample=%.9g R=%.9g activities=[",label,low,hp,hs,sample,s.ratio);
  for(int a:s.activity) std::printf("%d ",a);
  std::printf("] budget=%d Q=[",budget);
  for(int a:s.activity) {
    float w=sum>0?(float)a/(float)sum:0.0f;
    int raw=(int)(w*budget), q=std::min(raw,std::min(5000,B/2));
    std::printf("%d(raw=%d;t=%d) ",q,raw,(int)(q*.05f));
  }
  int g=std::max((B-budget)/shared_lists,50);
  std::printf("] G=%d shared_t=[%d %d]\n",g,(int)(g*.4f),(int)(g*.05f));
}
int main() {
 State main{.5f,{500,500,0,0}};
 step("main E1",main,10000,0,4,5000000LL,10000,{4500,500,0,0},{1250,1250,1250,1250});
 step("main E2",main,10000,0,4,5000000LL,10000,{4500,500,0,0},{1250,1250,1250,1250});
 step("main E3",main,10000,0,4,5000000LL,10000,{4000,1000,0,0},{1250,1250,1250,1250});
 State shift{.5f,{300,200,0,0}};
 step("ratio shift",shift,10000,0,4,5000000LL,3000,{1000,500,0,0},{125,125,125,125});
 State cap{.5f,{900,100,0,0}};
 step("cap",cap,20000,0,4,10000000LL,20000,{9000,1000,0,0},{2500,2500,2500,2500});
 State halfcap{.5f,{1000,0,0,0}};
 step("half cap",halfcap,6000,0,4,10000000LL,5000,{5000,0,0,0},{0,0,0,0});
 State zero{.5f,{0,0,0,0}};
 step("zero",zero,10000,0,4,10000000LL,0,{0,0,0,0},{0,0,0,0});
 State low{.5f,{500,500,0,0}};
 step("low short",low,10000,0,4,500000LL,0,{0,0,0,0},{0,0,0,0});
 State occupied{.5f,{500,500,0,0}};
 step("occupied",occupied,10000,2000,4,10000000LL,8000,{2000,2000,0,0},{1000,1000,1000,1000});
 State minshared{.5f,{500,500,0,0}};
 step("50 floor",minshared,10000,0,4,10000000LL,10000,{5000,4990,0,0},{10,0,0,0});
}
```

Captured standalone output:

```text
main E1 low=0 hP=1000 hS=1000 sample=0.5 R=0.5 activities=[700 300 0 0 ] budget=5000 Q=[3500(raw=3500;t=175) 1500(raw=1500;t=75) 0(raw=0;t=0) 0(raw=0;t=0) ] G=1250 shared_t=[500 62]
main E2 low=0 hP=1000 hS=1000 sample=0.5 R=0.5 activities=[800 200 0 0 ] budget=5000 Q=[4000(raw=4000;t=200) 1000(raw=1000;t=50) 0(raw=0;t=0) 0(raw=0;t=0) ] G=1250 shared_t=[500 62]
main E3 low=0 hP=1000 hS=1000 sample=0.5 R=0.5 activities=[800 200 0 0 ] budget=5000 Q=[4000(raw=4000;t=200) 1000(raw=1000;t=50) 0(raw=0;t=0) 0(raw=0;t=0) ] G=1250 shared_t=[500 62]
ratio shift low=0 hP=300 hS=100 sample=0.75 R=0.625 activities=[250 150 0 0 ] budget=6250 Q=[3906(raw=3906;t=195) 2343(raw=2343;t=117) 0(raw=0;t=0) 0(raw=0;t=0) ] G=937 shared_t=[374 46]
cap low=0 hP=1000 hS=1000 sample=0.5 R=0.5 activities=[900 100 0 0 ] budget=10000 Q=[5000(raw=9000;t=250) 1000(raw=1000;t=50) 0(raw=0;t=0) 0(raw=0;t=0) ] G=2500 shared_t=[1000 125]
half cap low=0 hP=500 hS=1 sample=0.998000026 R=0.998000026 activities=[500 0 0 0 ] budget=5988 Q=[3000(raw=5988;t=150) 0(raw=0;t=0) 0(raw=0;t=0) 0(raw=0;t=0) ] G=50 shared_t=[20 2]
zero low=1 hP=0 hS=0 sample=0.00999999978 R=0.00999999978 activities=[0 0 0 0 ] budget=0 Q=[0(raw=0;t=0) 0(raw=0;t=0) 0(raw=0;t=0) 0(raw=0;t=0) ] G=2500 shared_t=[1000 125]
low short low=1 hP=0 hS=0 sample=0.00999999978 R=0.475499988 activities=[475 475 0 0 ] budget=4755 Q=[2377(raw=2377;t=118) 2377(raw=2377;t=118) 0(raw=0;t=0) 0(raw=0;t=0) ] G=1311 shared_t=[524 65]
occupied low=0 hP=400 hS=400 sample=0.5 R=0.5 activities=[200 200 0 0 ] budget=4000 Q=[2000(raw=2000;t=100) 2000(raw=2000;t=100) 0(raw=0;t=0) 0(raw=0;t=0) ] G=1500 shared_t=[600 75]
50 floor low=0 hP=999 hS=1 sample=0.998000026 R=0.998000026 activities=[500 499 0 0 ] budget=9980 Q=[4994(raw=4994;t=249) 4985(raw=4985;t=249) 0(raw=0;t=0) 0(raw=0;t=0) ] G=50 shared_t=[20 2]
```

## 10. Follow-up receipt for the final chapter examples

The chapter uses different small numbers for its quiet and zone examples than
sections 6 and 7 above. The following independent calculations were checked
against the same pinned formulas and compiled arithmetic on 2026-10-13.

### Five-second quiet update

The chapter's quiet case starts at `B = O = 10,000`, `S = P = 4`,
`R = 0.5f`, activities `[500, 500, 0, 0]`, zero raw hits and zero counted
unfixes, with `d = 5,000,000`. It is admitted by time and classified low.
Its new activities are `[250, 250, 0, 0]`, because the old weight is 50%.
The new sample is `0.01f`; source-order ratio smoothing gives binary32
`R' = 0.254999995`. The float product with 10,000 rounds to 2,550 before
the integer cast, so `K = 2550`, private quotas are 1,275 each, and each
private threshold is 63. Shared integer target is
`(10,000 - 2550) / 4 = 1862`, and default thresholds are 744 and 93.
This differs from the separate 500 ms quiet example above only in its
elapsed-time weight and resulting outputs; both calculations are correct.
[time-dependent source formulas](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14323-L14484)

To reproduce using the `step()` helper in section 9, add these lines to its
`main()`:

```cpp
State quiet5{.5f,{500,500,0,0}};
step("chapter quiet 5s",quiet5,10000,0,4,5000000LL,0,
     {0,0,0,0},{0,0,0,0});
```

Captured compiled output:

```text
chapter quiet 5s low=1 hP=0 hS=0 sample=0.00999999978 R=0.254999995 activities=[250 250 0 0 ] budget=2550 Q=[1275(raw=1275;t=63) 1275(raw=1275;t=63) 0(raw=0;t=0) 0(raw=0;t=0) ] G=1862 shared_t=[744 93]
```

### The chapter's post-smoothing cap and minimum-shared-target states

The chapter cap example supplies already-computed stored ratio `0.75f`
and activities `[900, 100, 0, 0]` with 20,000 occupied frames and four
shared lists. It illustrates the split/cap stage, not a complete admitted
sampling epoch. Exact float calculations produce `K = 15000`, raw quotas
`[13500, 1500, 0, 0]`, capped quotas `[5000, 1500, 0, 0]`, shared
target 1,250 and shared thresholds 500/62. The 8,500-frame quota difference
is not redistributed. A separate sole-active-list budget of 5,400 in a
6,000-frame pool yields quota progression `5400 -> 5000 -> 3000`.

The chapter's shared-floor example supplies `B = 20,000`, `K = 19,960`
and `S = 4`: integer quotient ten is raised to fifty, and shared thresholds
are 20/2. This is the correct target-stage arithmetic; the minimum does not
reserve 200 physical frames from the nominal forty-frame remainder.
[split/cap/shared target source](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14432-L14494)

These additional expressions were compiled after the quiet call above:

```cpp
float cap_ratio=.75f;
int cap_budget=(int)(20000*cap_ratio);
float cap_w1=(float)900/(float)(900+100);
float cap_w2=(float)100/(float)(900+100);
int cap_raw1=(int)(cap_w1*cap_budget);
int cap_raw2=(int)(cap_w2*cap_budget);
int cap_q1=std::min(std::min(cap_raw1,5000),20000/2);
int cap_q2=std::min(std::min(cap_raw2,5000),20000/2);
int cap_g=std::max((20000-cap_budget)/4,50);
std::printf("chapter post-smoothing cap K=%d rawQ=[%d %d] Q=[%d %d] G=%d shared_t=[%d %d]\n",
            cap_budget,cap_raw1,cap_raw2,cap_q1,cap_q2,cap_g,
            (int)(cap_g*.4f),(int)(cap_g*.05f));
int chapter_floor=std::max((20000-19960)/4,50);
std::printf("chapter floor rawG=%d G=%d shared_t=[%d %d]\n",
            (20000-19960)/4,chapter_floor,
            (int)(chapter_floor*.4f),(int)(chapter_floor*.05f));
```

Captured compiled output:

```text
chapter post-smoothing cap K=15000 rawQ=[13500 1500] Q=[5000 1500] G=1250 shared_t=[500 62]
chapter floor rawG=10 G=50 shared_t=[20 2]
```

### Smaller private and shared zone tables

The chapter private example starts with quota 100 and counts `(20, 50, 30)`,
then publishes quota 60 and thresholds 3/3. Its private guard passes:
`20 + 50 = 70 > 60`. The combined helper falls 64 entries toward LRU3:
50 from LRU2, then 14 directly from LRU1. Counts become `(6, 0, 94)`;
the zone-1 helper then relabels three entries into LRU2, producing
`(3, 3, 94)`. Total list size remains 100 in the specified no-waiter,
no-concurrent-mutation state. The independent `(20, 10, 70)` case correctly
does not enter this quota branch's helper, since 30 is at most quota 60.

The chapter shared example changes computed target 100 to 60, with default
new thresholds 24/3 and initial counts `(30, 15, 55)`. Its combined guard
passes: `45 > 27`. Fall 18 entries into LRU3, first fifteen from LRU2
then three directly from LRU1; counts become `(27, 0, 73)`. Relabel three
remaining LRU1 entries into LRU2, giving `(24, 3, 73)`. No residency is
lost in this independently reset no-waiter example.
[private/shared caller guards](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14449-L14494),
[combined helper order](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9889-L10047)

The final numbers in these additions agree with pinned source arithmetic.
The audit additionally requested that the author describe an epoch as an
accepted turn, because the age increments before list work completes, and
label the zone-loop pseudocode as a conceptual sketch or show its saved
cursor explicitly: the real loop chooses its initial bottom once, walks
saved `prev_BCB` pointers and repairs bottom fields afterward. The author
also identified the needed admission transcription order: the
disabled/busy return precedes tick calculation. These are explanatory
precision issues, not failures of the displayed numerical tables.
