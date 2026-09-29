# Pedagogy Plan: CUBRID Page Buffer Presentation

## 1. Purpose and constraints

This packet plans a 50–60 minute Korean Markdown presentation for storage specialists who can read C/C++ but have no page-buffer prerequisites. The final presentation should let a caller choose the correct `page_buffer.h` interface family, use it safely, and explain the internal mechanism and important failure paths. It must not become a declaration-by-declaration phonebook.

The recommended deliverable has two layers:

1. A 52-minute narrative deck plus an 8-minute Q&A/teach-back, organized around one page lifecycle.
2. A reference appendix, not presented linearly, containing compact contract cards for the remaining exported interfaces and macros.

This separation is essential. “Most public APIs” should mean that most exported interface **families** and their choice conditions are taught in the narrative, while individual wrapper/debug/recovery/helper symbols remain discoverable in the appendix. `public` means “exported by `page_buffer.h`”; it does not mean “safe or appropriate for every caller.”

## 2. Material reviewed and how to use it

| Artifact | Pedagogical value to retain | Limits for the new presentation |
|---|---|---|
| `prompt.md` | Audience, Korean final Markdown, visual richness, most public APIs, use conditions/use cases, internals | Requires a substantially broader Interface treatment than the existing companion |
| `analysis/research/scope.md` | Current revision, included Interface families, caller types, failure/ordering/performance obligations | It is the controlling scope for this presentation |
| Same-revision audited `notion/page-buffer-guide.md` | Five-question frame, VPID→BCB→frame→`PAGE_PTR` model, complete fix flow, dirty/WAL/replacement chain, evidence boundaries, difficult questions | Excellent lifecycle briefing, but too narrow for the expanded public-Interface request |
| Older `pgbuf-analysis/e6ed61e_claude/00-overview.md` | Concrete hit/miss/update/full-pool/checkpoint scenarios; strong invariant-first explanations | Older revision; use only as lesson-design input, never as current evidence |
| Older `07-qa-workbook.md` and `pgbuf-grill` log | Progression from vocabulary to mechanism to edge cases and cross-engine trade-offs | The final talk should use prediction questions, not reproduce a 24-question workbook or rapid-fire quiz |
| Older `08-page-buffer-new-plan.md` | Incremental reconstruction order and testable invariants | Reimplementation is a closing synthesis, not the main lecture spine |
| `pgbuf-rebuild-spec/ch02-api-contracts.html` | Useful ten-family API taxonomy, contract subtleties, error categories | Treat as an inventory seed only; every final claim must be rechecked at `f799e05...` |
| `pgbuf-rebuild-spec/ch09-external-contracts.html` | Shows that log/DWB/fileio/TDE/vacuum/session/perfmon are seams, not page-buffer internals | Use only the seam needed to explain a caller obligation; avoid a dependency tour |
| Local PostgreSQL/InnoDB fact sheets | Precise contrast vocabulary for pin/fix, replacement, WAL, and torn-page protection | Current scope excludes a full three-database reconstruction; keep only misconception-preventing contrasts |

The old materials are user-owned teaching references. They must not silently become evidence for the pinned revision. The final presentation should cite the current research packets/claim IDs, and should label any retained old example whose exact behavior changed.

## 3. Learning contract

By the end, the audience should be able to:

1. Explain the difference among VPID, BCB, frame bytes, `PAGE_PTR`, holder, and global fix count.
2. Select a page-acquisition family and its `PAGE_FETCH_MODE`, latch mode, and latch condition from caller intent.
3. State the ownership rule for every successful fix and identify which convenience operations also unfix.
4. Trace hit, miss, duplicate-miss, latch-wait, retry, and failure cleanup paths.
5. Distinguish transaction lock, page latch, VPID-keyed buffer lock, BCB mutex, and LRU protection by the state each protects.
6. Use ordered watchers when multiple heap/overflow pages may be held, and respond correctly to `page_was_unfixed`.
7. Separate mutation, dirty marking, page LSA, WAL durability, data-page write, unfix, eviction, invalidation, and deallocation.
8. Explain why victim eligibility is a safety predicate while LRU/private quota/AOUT are policies.
9. Classify specialized exports as lifecycle, daemon, recovery, vacuum, scan-copy, validation, or observability seams rather than general caller tools.
10. Diagnose a failed call by asking what ownership was acquired, what state changed, what can block/retry, and what cleanup is still owed.

## 4. One narrative spine

Use one scenario throughout instead of unrelated API examples:

> A heap operation needs page P. P is initially absent, the caller acquires it, reads or updates it, may need an overflow page Q, records the change, releases ownership, and later P is flushed and eventually reused as a victim. Recovery and scan code revisit the same responsibilities through specialized Interfaces.

The scenario expands in this order:

```text
VPID P
  -> choose acquisition contract
  -> hit or serialized miss
  -> latch + holder + borrowed PAGE_PTR
  -> optional second page Q / ordered fix
  -> read or mutation + LSA + dirty
  -> unfix
  -> LRU placement / flush pressure
  -> WAL gate + DWB/file I/O
  -> clean victim / invalidation / reuse
```

Every new API family should answer one new need in this scenario. Do not introduce a family before the audience can state the problem it solves.

## 5. Core mental model and terminology

Open with five questions, retained from the audited companion but sharpened as an Interface checklist:

1. **Identity** — Which logical page is requested, and how is identity revalidated after waiting or dropping protection?
2. **Ownership** — What did this thread acquire, for how long, and what exact operation releases it?
3. **Concurrency** — Which synchronization object protects which mutable state, and can this branch wait or retry?
4. **Durability** — Are we discussing resident bytes, durable log, or durable page image?
5. **Release** — Does this operation only unfix, also flush, invalidate the resident mapping, or deallocate the logical page?

Use these terms precisely throughout:

| Preferred term | Exact intended meaning | Avoid or qualify |
|---|---|---|
| **fix** | CUBRID operation that binds a logical page to a resident frame, prevents victim reuse, grants a requested page latch, and records thread ownership | “read the page”; a hit performs no disk read |
| **unfix** | End one unit of borrowed ownership | “free the page”; the frame and logical page usually continue to exist |
| **VPID** | Logical data-page identity `(volid, pageid)` | “pointer” or “frame ID” |
| **BCB** | Buffer Control Block holding control state for the resident identity | “the page” without distinguishing control from bytes |
| **frame** | Resident byte storage paired with a BCB | `PAGE_PTR` as identity |
| **`PAGE_PTR`** | Borrowed view into resident frame bytes, valid only under the ownership contract | Owning pointer or durable handle |
| **holder** | Per-thread accounting for nested ownership/watchers | Global pin count |
| **global fix count / `fcnt`** | Cross-thread count that prevents victim reuse | Holder nesting count |
| **page latch** | Short-lived physical consistency protection for resident page contents | Transaction lock |
| **transaction lock** | Logical transaction conflict/visibility protection | Page latch |
| **VPID-keyed buffer lock** | Serializes concurrent miss/load/publication for one identity | Generic “page lock” |
| **dirty** | Resident bytes are newer than their durable home-page image | Durable or committed |
| **flush** | Attempt to write a page image with WAL ordering | Commit, unfix, or eviction |
| **eviction/victimization** | Remove resident identity and reuse its frame | Deallocation |
| **invalidate** | Remove a resident mapping from the pool | Deallocate logical storage |
| **deallocate** | Mark a logical page as no longer allocated, with recovery semantics | Invalidate |
| **WAL rule** | Required log-before-data ordering | Torn-page protection |
| **DWB** | Double-write path protecting page-image integrity | Replacement for WAL |

On first mention, expand BCB, VPID, LSA, WAL, DWB, LRU, TDE, and TID/OID if used. Keep canonical identifiers and standard English technical terms unchanged inside Korean prose.

## 6. Recommended 60-minute progression

The screen count below is intentionally small: roughly 16 main screens, with appendix contract cards opened only when questions require them.

| Time | Planned final section / screen | Teaching move | Interface families covered | Visual or interaction |
|---:|---|---|---|---|
| 0–4 | Why is `pgbuf_fix()` not a read? | Begin with the heap-page scenario and ask what must be true before a `PAGE_PTR` can be returned | Core acquisition/release | One-sentence thesis; prediction question |
| 4–9 | Six objects that describe one page | Build VPID→hash→BCB↔frame→`PAGE_PTR`, plus thread holder and `fcnt` | Identity/accessor family | Inline SVG object graph and a lifetime strip |
| 9–16 | The caller chooses a contract first | Choose normal fix, retry, not-deallocated, buffer-only, recovery, or temp/simple path from intent; then choose fetch/latch/condition | Acquisition family and modes | Two-stage decision table; first short code pattern |
| 16–24 | Fix hit, miss, wait, and retry | Trace fast hit, normal hit, miss-owner, miss-waiter, I/O failure, latch rejection/timeout | Internal lookup/load/latch path | Mermaid sequence plus failure branches; audience predicts duplicate-miss behavior |
| 24–30 | Holder, `fcnt`, and unfix: two ledgers and one debt | Explain nested ownership, reentry, waiter fairness, exact release obligations, dirty-and-free/unfix-and-init conveniences | Unfix/dirty conveniences, latch queries | Latch decision table and ownership ledger code pattern |
| 30–36 | The moment two pages are held: ordered watcher | Show the A/B deadlock, conditional attempt, release/reorder/refix, stale page-local pointers, promotion semantics | Ordered fix/watcher and promotion family | Mermaid deadlock sequence; watcher state table; second code pattern |
| 36–43 | Mutation is not durability | Separate log append, page LSA, dirty, unfix, WAL force, DWB enqueue/direct write, later persistence, and re-dirty generation | Metadata mutation and flush families | Three-moment durability timeline; flush chooser table; third code pattern |
| 43–48 | Clean does not immediately mean victim | Separate eligibility from selection; explain LRU zones/private quota/direct-victim progress and the lifecycle/daemon owners | Replacement, private LRU, daemon/maintenance family | Victim eligibility gate SVG plus compact policy table |
| 48–52 | Public but not general-purpose | Place remaining families on an owner map: boot/shutdown, log/recovery, vacuum, scan, monitoring, tests/debug | Lifecycle, recovery, validation, scan-copy, observability, interrupt and utility families | “Who owns this Interface?” matrix; do not read symbols aloud |
| 52–56 | What must failure unwind? | Walk four failure cards: conditional no-acquire, timed latch failure, miss I/O cleanup, flush failure/re-dirty; include return/ownership distinctions | Errors across all families | Before/after/failure decision table |
| 56–60 | Retell the complete lifecycle of one page | Audience teach-back: one retry, one failure, one durability boundary, one specialized seam; use remaining time for Q&A | Synthesis | One lifecycle strip and four difficult questions |

If only 50 minutes are available, omit the live reconstruction question at 43–48 minutes and reduce Q&A to 3 minutes. Do not cut the acquisition chooser, ownership/release ledger, ordered-fix contract, or durability separation.

## 7. Interface-family teaching map

### 7.1 Family A — lifecycle and execution context

Representative exports:

`pgbuf_initialize`, `pgbuf_finalize`, `pgbuf_daemons_init`, `pgbuf_daemons_destroy`, `pgbuf_thread_variables_init`, `pgbuf_assign_private_lru`, `pgbuf_release_private_lru`, `pgbuf_adjust_quotas`.

Teach the family as “who creates the world in which normal fix is legal?” Main-deck points:

- Pool initialization/finalization belong to boot/shutdown, not ordinary storage callers.
- Thread-local holder/stat fields must be initialized before page ownership is tracked.
- Private LRU assignment/release belongs to session/vacuum lifecycle; quota adjustment belongs to maintenance.
- Initialization failure and partial teardown deserve one appendix contract card.

Do not narrate allocation order in the main deck. Put exact preconditions, owner, and failure return in the appendix.

### 7.2 Family B — page acquisition

Representative exports:

`pgbuf_fix`, `pgbuf_fix_without_validation`, `pgbuf_fix_with_retry`, `pgbuf_fix_if_not_deallocated`, `pgbuf_simple_fix`.

Teach with an acquisition chooser before explaining internals:

| Caller intent | Preferred family/mode | Key condition | Failure/cleanup lesson |
|---|---|---|---|
| Existing allocated page, load if absent | `pgbuf_fix(..., OLD_PAGE, ...)` | Normal general path | NULL/error means no ownership and therefore no unfix |
| Newly allocated page | `NEW_PAGE` | Allocation has already established the logical page | “New” does not mean the caller may skip type/LSA/dirty obligations |
| Do nothing if nonresident | `OLD_PAGE_IF_IN_BUFFER` | Absence is an expected outcome | NULL can be non-error; distinguish from failure |
| Protect against deallocation | `OLD_PAGE_PREVENT_DEALLOC` or `pgbuf_fix_if_not_deallocated` | Specialized caller understands avoid-dealloc semantics | Teach the extra lifecycle marker and its release path |
| Deallocated/maybe-deallocated/recovery page | Dedicated fetch mode | Recovery/deallocation subsystem only | Do not generalize relaxed validation to ordinary reads |
| Bounded automatic retries | `pgbuf_fix_with_retry` | Caller wants the helper’s retry policy | Retry exhaustion has a different diagnostic meaning from conditional rejection |
| Temporary read-only page, specialized path | `pgbuf_simple_fix` | Temporary volume and the documented `need_fix` contract | Must pair with `pgbuf_simple_unfix`; it is a separate protocol |
| Validation deliberately bypassed | `pgbuf_fix_without_validation` | Narrow trusted internal use only | Place in appendix with a red “not a performance shortcut” warning |

The final deck needs a separate seven-row `PAGE_FETCH_MODE` matrix with these columns: expected allocation state, may read disk, absence/deallocation interpretation, validation behavior, typical owner, and danger if misused. This matrix is more useful than seven prose subsections.

### 7.3 Family C — latch choice, promotion, and wait inspection

Representative exports:

`PGBUF_LATCH_MODE`, `PGBUF_LATCH_CONDITION`, `pgbuf_promote_read_latch`, `pgbuf_has_any_waiters`, `pgbuf_has_any_non_vacuum_waiters`, `pgbuf_get_latch_mode`, `pgbuf_get_fix_count`, `pgbuf_get_hold_count`.

Teach four decisions:

1. READ vs WRITE protects bytes, not transaction semantics.
2. CONDITIONAL means “do not wait”; failure returns without newly acquired ownership.
3. UNCONDITIONAL may still time out, be interrupted, or be internally demoted by transaction policy; verify current-source details before publication.
4. Promotion failure can invalidate/release the old borrowed pointer depending on the promotion path; the caller must follow the exact pointer-to-pointer contract.

Waiter/count accessors are diagnostics or policy probes, not a synchronization substitute. A value observed now is not a durable promise about the next instruction.

### 7.4 Family D — release and mutation

Representative exports/macros:

`pgbuf_unfix`, `pgbuf_unfix_and_init`, `pgbuf_unfix_and_init_after_check`, `pgbuf_unfix_all`, `pgbuf_set_dirty`, `pgbuf_set_dirty_and_free`, `pgbuf_ordered_set_dirty_and_free`, `pgbuf_simple_unfix`, `pgbuf_dealloc_temp_page`.

Teach as an ownership ledger:

| Operation | Requires owned/fixed page? | Mutates dirty state? | Releases one ownership? | Nulls caller variable? |
|---|---:|---:|---:|---:|
| `pgbuf_unfix` | Yes | No | Yes | No |
| `pgbuf_unfix_and_init` | Yes | No | Yes | Yes |
| `pgbuf_set_dirty(..., DONT_FREE)` | Yes, WRITE contract for mutation | Yes | No | No |
| `pgbuf_set_dirty(..., FREE)` | Yes | Yes | Yes | No unless wrapper does it |
| `pgbuf_set_dirty_and_free` | Yes | Yes | Yes | Yes; warn about macro statement hygiene |
| ordered dirty/free helper | Watcher-owned page | Yes | Yes through watcher protocol | Watcher/page state updated as specified |
| simple unfix/temp deallocation | Simple/temp protocol only | Specialized | Protocol-specific | Protocol-specific |

The table must be checked against the current header/macros and implementation. The speaker should say “every successful acquisition creates exactly one release debt,” then immediately show nested fixes as the counterexample to “one pointer equals one debt.”

### 7.5 Family E — ordered multi-page ownership

Representative exports/macros:

`PGBUF_WATCHER`, `PGBUF_INIT_WATCHER`, group/rank macros, `pgbuf_ordered_fix`, `pgbuf_ordered_unfix`, `pgbuf_attach_watcher`, `pgbuf_replace_watcher`, `pgbuf_ordered_callback`, `pgbuf_get_condition_for_ordered_fix`, and debug fixed-page/watcher helpers.

Teach one heap+overflow use case. The audience needs the caller contract, not every watcher field:

- Establish group and rank before acquisition.
- A no-wait attempt may safely violate global order because it cannot form a wait cycle.
- A failed attempt can cause release/reorder/refix.
- `page_was_unfixed` means all cached record slots or pointers into the page must be revalidated.
- Watcher attachment/replacement transfers bookkeeping; it is not another fix.
- Ordered callback exists for work that must run after the ordered protocol has reshaped ownership.

Put macro/debug variants in the appendix and present one safe watcher pattern in the main deck.

### 7.6 Family F — page metadata and encryption attributes

Representative exports:

`pgbuf_get_lsa`, `pgbuf_set_lsa`, `pgbuf_reset_temp_lsa`, `pgbuf_set_lsa_as_temporary`, `pgbuf_is_lsa_temporary`, VPID/page/volume accessors, page-type get/set/check functions, TDE get/set/recovery functions, and `PGBUF_IS_PAGE_CHANGED`.

Teach by question, not by accessor name:

- “Which logical page/frame is this?” → VPID/page/volume accessors.
- “Has content changed since my reference?” → LSA comparison, with limits stated.
- “What recovery/WAL boundary belongs to this page?” → page LSA functions.
- “What kind of on-page structure should this be?” → page type functions.
- “How must its persisted bytes be transformed?” → TDE metadata functions.

Mutation setters require an appropriate ownership/latch context. Getter results tied to resident page memory must not be retained after unfix. Do not imply that an LSA comparison is a general semantic-version test.

### 7.7 Family G — durability and flushing

Representative exports:

`pgbuf_flush`, `pgbuf_flush_with_wal`, `pgbuf_flush_if_requested`, `pgbuf_flush_all`, `pgbuf_flush_all_unfixed`, `pgbuf_flush_all_unfixed_and_set_lsa_as_null`, `pgbuf_flush_victim_candidates`, `pgbuf_flush_checkpoint`, `pgbuf_flush_control_from_dirty_ratio`, and recovery flush callbacks.

Use a flush chooser:

| Need | Interface owner | Caller obligation to emphasize | What it does not imply |
|---|---|---|---|
| Synchronously request one held page’s WAL-aware write and observe failure | Normal/specialized caller via `pgbuf_flush_with_wal` | Required holder/latch and returned pointer/error contract | Commit or eviction |
| Legacy one-page flush convenience | Existing callers via `pgbuf_flush` | Void/error limitation and optional FREE behavior | Confirmed durable success to the caller |
| Honor a deferred flush request at a safe point | Unfix/latch protocol | Page is still in the correct ownership state | General flush scheduling |
| Flush all matching pages | Boot/recovery/volume owner | Choose all vs unfixed-only and volume scope | `fsync` unless the caller performs it |
| Flush and reset LSA in a specialized volume workflow | Log/volume workflow | Exact postcondition and recovery reason | Ordinary maintenance |
| Produce clean victims | Victim flush daemon/standalone maintenance | Ratio, stop control, progress ownership | Checkpoint semantics |
| Advance checkpoint responsibility | Log/checkpoint owner | LSA bounds, outputs, later synchronization | “Flush every dirty page” |
| Feed I/O pacing | Flush-control owner | Approximate dirty-ratio signal | A durability boundary |

The main sequence must show re-dirty during an in-flight flush. Otherwise the audience will incorrectly infer “flush success means the resident BCB is clean now.”

### 7.8 Family H — invalidation, deallocation, and recovery

Representative exports:

`pgbuf_invalidate`, `pgbuf_invalidate_all`, `pgbuf_dealloc_page`, `pgbuf_has_prevent_dealloc`, `pgbuf_log_new_page`, `pgbuf_log_redo_new_page`, new-page/deallocation recovery callbacks, and `pgbuf_fix_if_not_deallocated`.

Teach with a three-column contrast:

| Action | Logical allocation survives? | Resident mapping survives? | Recovery role |
|---|---:|---:|---|
| Unfix | Yes | Usually yes | None by itself |
| Invalidate | Yes unless another subsystem changes it | No | Used by volume/DWB/recovery maintenance |
| Deallocate | No, subject to transactional recovery | May remain resident until naturally removed | Log/undo/redo aware |

This family is where terminology errors are most expensive. The talk should include one deallocate-vs-invalidate counterexample and place detailed recovery callback signatures in the appendix.

### 7.9 Family I — bulk byte copy and scan-copy

Representative exports:

`pgbuf_copy_to_area`, `pgbuf_copy_from_area`, `pgbuf_copy_buffer_alloc`, `pgbuf_copy_page_for_scan`, `pgbuf_copy_buffer_get_page_ptr`, `pgbuf_copy_buffer_free`.

Explain that these are two different families despite similar names:

- Area-copy helpers transfer a byte range to/from a logical page and optionally perform fetching; callers still need exact bounds, mutation, TDE, error, and fetch semantics.
- The opaque scan-copy buffer gives cached heap scans a detached copy whose handle owns the storage; it is not a resident-page fix and must not be fed into APIs that require a live BCB unless explicitly documented.

Use one ownership diagram showing source `PAGE_PTR` lifetime, copy-handle lifetime, and returned copied-page pointer lifetime. Place validation-level interactions and OOM behavior in the appendix.

### 7.10 Family J — validation, observability, and specialized control hooks

Representative exports:

`pgbuf_is_valid_page`, `pgbuf_has_perm_pages_fixed`, `pgbuf_peek_stats`, `pgbuf_daemons_get_stats`, `pgbuf_start_scan`, `pgbuf_get_page_type_for_stat`, debug dump functions, interrupt-check functions, `pgbuf_notify_vacuum_follows`, `pgbuf_is_io_stressful`, and server-only direct-victim helpers.

Teach this family on an owner map:

- **Validation/debug**: assertions, checks, leak/fixed-page diagnosis.
- **Observability**: snapshot scans, counters, daemon stats, SHOW scan entry.
- **Vacuum/session hints**: influence policy but do not confer ownership.
- **Interrupt/progress hooks**: cooperative control in long loops.
- **Daemon callbacks**: internal scheduling seams, not workload APIs.

For every metric shown, state whether it is a gauge, cumulative event, destructive delta, approximate lock-free snapshot, or per-thread aggregation. A counter name is not its proof; the final presentation must use the current-source increment sites.

### 7.11 Family K — exported utilities and build/debug wrappers

Representative items:

VPID hash/compare helpers, null constants, boolean aliases, aligned/resizable buffer types, debug/release wrappers, and SERVER_MODE/CUBRID_DEBUG-gated exports.

Do not spend live time on these. Put them in a final “header surface map” appendix and label each as utility, alias/type, build wrapper, or debug-only. This completes discoverability without pretending each item is a separate page-buffer concept.

## 8. Required decision tables

The final Markdown should contain these tables in the main narrative:

1. **Acquisition chooser**: caller intent → API family → expected absence → may block/retry → ownership on success/failure.
2. **Seven fetch modes**: allocation expectation → disk read → validation/deallocation handling → normal owner → misuse risk.
3. **Latch/condition matrix**: current latch/waiter state → READ/WRITE request → conditional result → blocking result → reentry exception.
4. **Release ledger**: operation → dirty? → flush? → unfix? → null pointer? → remaining debt.
5. **Ordered watcher state**: initial → fixed → released/refixing → fixed-again → cleanup; include `page_was_unfixed` action.
6. **Flush chooser**: one/all/unfixed/checkpoint/victim/deferred → owner → return signal → later synchronization obligation.
7. **Destructive-looking verbs**: unfix vs flush vs invalidate vs deallocate vs victim reuse.
8. **Failure unwind**: point of failure → state already acquired → state to restore → wake/retry behavior → caller-visible result.
9. **Specialized owner map**: API family → heap/B-tree/log/recovery/boot/vacuum/session/daemon/monitor/debug.

Keep table cells causal and short. Do not put source citations in place of the behavior description; put evidence IDs after the explanation.

## 9. Code patterns to show

Use four short patterns in the main deck. Each should fit on one screen and have a “debt created / debt discharged” annotation.

### Pattern 1 — ordinary read

Show `pgbuf_fix(... OLD_PAGE, READ, ...)`, NULL/error handling, read-only access, and `pgbuf_unfix_and_init`. State that the same code may take a hit or miss path without changing the caller contract.

### Pattern 2 — logged mutation

Show the conceptual order: acquire WRITE → append/obtain log LSA through the owning subsystem → mutate → set page LSA as required → mark dirty → unfix. Do not imply that every caller literally invokes the same log helper. Label commit as outside this sequence.

### Pattern 3 — conditional second-page acquisition

Show a caller that already owns page A attempting page B conditionally, checking failure without unfixing B, and choosing restart/reorder. This makes “NULL means no new release debt” concrete.

### Pattern 4 — ordered watcher

Show watcher initialization, ordered fix, checking `page_was_unfixed`, rebuilding any page-local pointer/slot state, and ordered cleanup. Keep rank/group choices visible.

Appendix-only snippets may cover `pgbuf_flush_with_wal`, scan-copy handles, and lifecycle assignment. Avoid source excerpts longer than needed to reveal the contract; use pseudocode when branch completeness matters more than syntax.

## 10. Visual plan and accessibility

Use a visual only when it exposes relationships or state changes that prose hides.

| Visual | Recommended format | What it must show | Text alternative requirement |
|---|---|---|---|
| Object/ownership graph | Inline SVG | VPID, hash, BCB, frame, `PAGE_PTR`, holder, `fcnt`, lifetime boundaries | `role="img"`, Korean-language title/description, and a nearby Korean-language paragraph walking each edge |
| One-page lifecycle strip | Inline SVG | absent→loading→resident fixed→unfixed→dirty/flushing→clean victim→reused | List the same states and guarded transitions in Korean-language prose below it |
| Fix hit/miss flow | Mermaid sequence | fast hit, normal hit, miss owner/waiter, relookup, I/O failure, latch result | A numbered Korean-language step list matching every branch |
| Latch compatibility | Table | compatibility, waiter fairness, reentry, conditional/blocking result | Caption and row/column headers are sufficient; add a one-sentence summary |
| Ordered-fix deadlock | Mermaid sequence | A/B opposite-order wait and the restart seam | Korean-language prose timeline; do not rely on arrow color |
| Dirty/WAL/flush | Mermaid sequence | snapshot generation, WAL force, DWB enqueue/direct write, later persistence, concurrent re-dirty | Ordered Korean-language text alternative including the re-dirty branch |
| Victim eligibility | Inline SVG gate | `fcnt`, zone, dirty/flushing/direct-victim, waiters/revalidation | Korean-language list of each gate and skip reason |
| API owner map | Table, not a dense graph | General callers vs boot/log/recovery/vacuum/scan/daemon/monitor/debug | Table caption and explicit “not general-purpose” labels |

Mermaid rendering often produces weak accessibility metadata. Every Mermaid block therefore needs a visible
"text alternative" paragraph or numbered list immediately after it. Inline SVG must have a stable `viewBox`, readable
font size, high contrast, and no meaning conveyed only by color.

Avoid decorative architecture diagrams, giant function call graphs, source screenshots, and raw tables of 100 symbols. Prefer one stable visual grammar:

- blue = identity/ownership;
- amber = wait/retry;
- red plus text label = failure/invalid transition;
- green = durable boundary;
- gray = policy/diagnostic side path.

Every colored state must also carry a word or shape distinction.

## 11. Speaker-note template

Use visible Markdown callouts compatible with the existing companion:

```markdown
> [!speaker] Speaker notes
> - Prediction: ask one question before revealing the branch.
> - Reveal: trace one state-changing edge at a time.
> - Contract: name ownership created and cleanup owed.
> - Failure: give one retry/reject/unwind branch.
> - Evidence boundary: state what source/runtime evidence proves and does not prove.
> - Transition: name the problem solved by the next Interface family.
```

Every main section should include a note, but not every table. Speaker notes should include expected time and a “skip if behind” marker for nonessential detail. They must never introduce a central fact absent from the visible slide.

## 12. Failure-path pedagogy

Teach failure as part of each protocol, not as a final error-code dump. Use this repeated five-question pattern:

1. What had been acquired before the failure?
2. Which identity/state may have changed while waiting or doing I/O?
3. Which flags, counts, mappings, waiters, or LSA state must be restored?
4. Does the caller receive NULL, an error code, a stale pointer, or a still-owned page?
5. Must the caller unfix, retry, restart a higher-level operation, or do nothing?

The final failure matrix should include at least:

- expected nonresidency with `OLD_PAGE_IF_IN_BUFFER`;
- conditional latch rejection;
- latch timeout/interrupt;
- retry exhaustion;
- no-victim pressure and wait/wakeup;
- read/decrypt/validation failure during miss;
- holder allocation failure or other partial-acquire hazard, if retained as a current confirmed finding;
- promotion failure and pointer state;
- ordered refix with `page_was_unfixed`;
- flush I/O/TDE/DWB failure and dirty/FLUSHING/waiter restoration;
- invalidation/deallocation race;
- copy-buffer allocation failure.

Use exact current behavior, even when it is an undesirable quirk. Separate “current compatibility behavior” from “hardened design recommendation.”

## 13. Q&A design

Reserve four minutes for live Q&A and keep an appendix with concise answers to likely specialist questions. Start with these:

1. What separately prevents duplicate disk reads and duplicate resident publication for the same cold VPID?
2. Why can a buffer hit still block or time out?
3. What bug becomes possible if the global `fcnt` exists but per-thread holder accounting does not, or vice versa?
4. When is NULL an expected result rather than an error, and does the caller owe an unfix?
5. Why may ordered fix temporarily release a page, and what exactly becomes stale?
6. Why are unfix, flush, commit, eviction, invalidation, and deallocation six different events?
7. How can flush complete while the resident page remains dirty?
8. Why can a clean, unfixed page still be ineligible or unselected as a victim?
9. Why does DWB not replace the WAL rule?
10. Which exports are public only because boot, recovery, daemon, scan, or monitoring modules need a seam?
11. What does a page-buffer metric actually count, and where is its increment site?
12. Which current failure behavior should a hardened reimplementation deliberately change?

For the closing teach-back, ask one question only:

> “Trace VPID P from acquisition choice through hit/miss, ownership, optional mutation, release, flush, and eventual victim reuse; include one retry, one failure unwind, and one specialized caller seam.”

## 14. Appendix structure

The final Markdown should append these reference sections after a clear "reference appendix not opened during the
talk" divider:

1. Complete header-surface family index, including build/debug wrappers and macros.
2. One contract card per family with: purpose, normal owner, preconditions, can-wait/retry, success ownership, failure ownership, cleanup, representative use case, current quirks, evidence IDs.
3. Full fetch-mode matrix.
4. Latch and promotion matrix.
5. Flush-family chooser.
6. Error code and caller-action matrix.
7. Lifecycle/daemon/recovery/observability owner map.
8. Source and claim index for Q&A.
9. Evidence boundaries and known unknowns.

Use `<details>` only for noncentral appendix material. Central explanations and failure obligations must remain visible.

## 15. Gaps in the existing Korean companion relative to `prompt.md`

The existing `notion/page-buffer-guide.md` is a strong core-lifecycle presentation, but it does not yet satisfy the expanded prompt in these respects:

1. **No explicit definition of the exported surface.** It does not explain that header-exported APIs include general caller protocols, specialized subsystem hooks, debug wrappers, macros, and server-only callbacks.
2. **Acquisition choice is incomplete.** It mentions fetch modes but does not provide a complete seven-mode decision matrix or compare normal fix, without-validation, retry, not-deallocated, and simple/temp protocols.
3. **Use conditions are not systematic.** Most sections explain mechanism, but do not consistently state precondition, owner, can-block/retry, success ownership, failure ownership, and cleanup.
4. **Release conveniences are incomplete.** `unfix_and_init`, checked unfix, `set_dirty(..., FREE)`, macro hygiene, `unfix_all`, simple unfix, and temp deallocation are not organized as an ownership ledger.
5. **Ordered-watcher breadth is missing.** The companion explains ordered fix well but not attach/replace/callback/group/rank helper use cases or the distinction between bookkeeping transfer and additional ownership.
6. **Metadata APIs are under-covered.** VPID/volume/page accessors, page type validation/mutation, temporary LSA helpers, TDE attributes, fix/hold/latch inspection, and page-change checks need one coherent family map.
7. **Flush selection is under-covered.** The WAL sequence is strong, but callers cannot yet choose among one-page flush, deferred flush, all/unfixed/reset-LSA variants, victim flush, checkpoint flush, flush control, and recovery callbacks.
8. **Lifecycle and background ownership are absent.** Initialization/finalization, per-thread variables, daemon creation/destruction, private LRU lifecycle, quota adjustment, and direct-victim maintenance need an owner-oriented overview.
9. **Invalidation/deallocation/recovery APIs are too compressed.** The semantic contrast appears, but new-page logging, undo/redo callbacks, prevent-dealloc, and volume-wide invalidation are not mapped to callers and failure responsibilities.
10. **Scan and copy families are absent.** Byte-area copy helpers and the opaque scan-copy buffer need separate ownership/lifetime diagrams and use cases.
11. **Validation and observability are incomplete.** Page validity, fixed-page leak checks, daemon stats, SHOW scan entry, page-type statistics, interrupt hooks, vacuum hints, I/O stress probes, and debug dumps are mostly absent.
12. **Error semantics are scattered.** Expected NULL, conditional rejection, timeout, retry exhaustion, partial-acquire cleanup, flush failure, and pointer validity need one caller-action matrix.
13. **The live agenda overallocates comparison and experiments for the new request.** The expanded talk should spend that time on acquisition/flush/family selection; PostgreSQL/InnoDB should remain short misconception-preventing foils, and runtime evidence should support claims rather than become a separate mini-lecture.
14. **The final deck needs presentation-grade text alternatives.** Existing Mermaid and SVG are useful, but every visual in the new Markdown needs a nearby Korean textual equivalent and accessible SVG metadata.
15. **The source references are useful but not a substitute for contracts.** The new version must be understandable with source links closed, while preserving current revision evidence IDs near substantive claims.

## 16. Content to retain, compress, or move

### Retain in the main narrative

- The one-sentence fix thesis.
- The five questions.
- The object graph.
- Complete hit/miss sequence and duplicate-miss retry.
- Global `fcnt` vs per-thread holder.
- Ordered-fix stale-state warning.
- Dirty→WAL→DWB/data→re-dirty sequence.
- Eligibility-vs-policy victim distinction.
- One source/runtime evidence boundary per central behavior.

### Compress

- Three-database comparison to one six-row misconception table or two speaker-note callouts.
- Experiment results to small evidence cards adjacent to the behavior they test.
- Reimplementation checklist to a final invariant/test synthesis.
- Difficult questions from twenty to the twelve Q&A items above.

### Move to appendix

- Long source location list.
- Detailed recovery callback catalog.
- Full observability/counter catalog.
- Build/debug wrapper variants.
- Complete API symbol index.
- Rare configuration and exact constants unless they change a caller decision.

## 17. Quality gate for the final presentation

Before the Korean Markdown is accepted, verify:

- Every exported symbol or macro in the declared header surface appears in exactly one family index row, or is explicitly excluded with a reason.
- Every family has at least one representative use case and one misuse/failure warning.
- Every successful acquisition path states the matching release debt; every failure path states whether any debt exists.
- Every pointer-returning helper states its lifetime and invalidation point.
- Every operation that may wait, retry, release-and-refix, perform I/O, or suppress/transform an error says so visibly.
- The seven fetch modes, latch/condition choice, release ledger, flush chooser, and destructive-verb table are complete.
- General caller APIs and specialized boot/recovery/daemon/debug seams are visually distinguished.
- No table cell, diagram edge, numeric default, or compatibility claim is borrowed solely from an older-revision artifact.
- Every Mermaid/SVG visual has a Korean text alternative.
- Speaker notes fit the time budget and include a skip marker for optional material.
- Main-deck code blocks remain short and preserve all meaningful ownership/failure branches.
- The talk can be delivered in 52 minutes without opening the appendix, leaving 8 minutes for teach-back and questions.

## 18. Recommended final thesis

The presentation should end where it began:

> `pgbuf` is not a page-reading utility. It is a protocol that turns logical page identity into temporary, latched, non-evictable ownership of resident bytes, then coordinates release, durability, and reuse across callers with different responsibilities.

If the audience can use that sentence to choose an Interface family and correctly account for ownership on success, retry, and failure, the presentation has succeeded.
