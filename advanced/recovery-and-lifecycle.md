# Recovery, Allocation State, and Module Lifecycle

**Level:** Advanced
**Prerequisites:** [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) and [Flush One Generation](../learning/04-flush-one-generation.md)
**Capability gained:** Connect checkpoint, redo, allocation state, and module lifetime to caller ownership, generation, identity, and idempotence invariants.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Verified mechanism, Implementation policy, and Runtime observation from the [pinned-source inventory](../source-inventory.md), exact source ranges below, and the [same-revision caller survey](../../../pgbuf-analysis/f799e05_claude/analysis/research/caller-use-cases.md).

## Checkpoint is selective coordination

Checkpoint is a selective page-buffer flush plus ordered log, filesystem, and metadata boundaries—not “flush every page.” The pinned `logpb_checkpoint()` path:

1. flushes append-log state and appends a start-checkpoint marker;
2. invokes selective page-buffer flush up to a checkpoint boundary, receiving the remaining redo floor;
3. performs filesystem synchronization;
4. records active transaction/system-operation state in the end-checkpoint record and persists log/header state;
5. records checkpoint metadata in permanent volume headers and synchronizes through the configured DWB boundary.

The page-buffer step chooses qualifying dirty pages and reports what remains; other layers own WAL, filesystem synchronization, checkpoint records, and volume metadata. Source: `src/transaction/log_page_buffer.c:6901-7406`.

## Redo: page-LSA idempotence under recovery ownership

The generic synchronous path preserves this sequence:

1. Fix with `RECOVERY_PAGE`, WRITE, unconditional. Recovery-specific fetch accepts allocation states that ordinary `OLD_PAGE` validation may reject.
2. Compare the record LSA with the page LSA. If already applied, unfix and skip.
3. Apply the selected recovery function under the fixed page’s protection.
4. Set the page LSA to the record LSA, mark the result dirty as the recovery callback/protocol requires, and release on every exit through scope cleanup.

This page-LSA gate is the idempotence argument: reprocessing an already represented log record does not apply its page change twice. It is not a general promise that arbitrary recovery callbacks are side-effect free.

Source: gate at `src/transaction/log_recovery.c:497-536`; fetch semantics at `src/transaction/log_recovery.c:6407-6431`; apply/LSA/cleanup at `src/transaction/log_recovery_redo.hpp:587-668`.

## Allocation and special fetch modes stay with their owners

Page buffer materializes an identity supplied by a caller; it does not decide logical allocation. File/disk callers allocate or deallocate identities and choose `NEW_PAGE`, ordinary modes, or bypass-I/O coherence steps. Recovery callers choose recovery-specific modes such as `RECOVERY_PAGE`, `OLD_PAGE_DEALLOCATED`, or `OLD_PAGE_MAYBE_DEALLOCATED` because they own redo/undo knowledge.

Temporary modes and temporary LSAs likewise belong to file/disk/log owner protocols. Do not generalize their relaxed logging/validation behavior to ordinary permanent pages.

Representative allocation ordering: `src/storage/file_manager.c:5420-5590`. Recovery-specific page callbacks: `src/storage/page_buffer.c:14896-14921,15133-15303`.

## Invalidation and deallocation ownership

Use the canonical [victimization, invalidation, unfix, flush, and logical-deallocation distinctions](../learning/05-replace-one-frame.md#similar-verbs-different-operations) before tracing this lifecycle route. This page extends only the owner boundary: file/disk/recovery code decides logical allocation state, while page-buffer invalidation is the required coherence consequence for a resident mapping.

For Logical deallocation, review the file/disk/recovery decision first and then the page-buffer coherence consequence; do not reconstruct those operation definitions here.

Raw/bypass writes require coherence: cached pages must not silently survive an external reset. File/disk protocols flush/invalidate as applicable before raw overwrite. See `src/storage/disk_manager.c:721-811` and the [core identity contract](../learning/01-contract-and-objects.md).

## Lifecycle dependency order

The pinned dependency chain is initialization → daemon gating → recovery → shutdown → log finalization → page-buffer finalization.

### Initialization and recovery

Transaction-table setup initializes the lock manager, then `pgbuf_initialize()`, then file management. Boot invokes that setup before database mounting/recovery. During restart, DWB recovery and module metadata become ready before page-buffer/DWB daemons are created; their tasks remain gated. Only after log recovery completes does boot enable flush daemons.

Source: `src/transaction/log_tran_table.c:468-512`, `src/transaction/boot_sr.c:1974-2801`, and daemon gates at `src/storage/page_buffer.c:16996-17136`.

### Shutdown and failure cleanup

Normal shutdown stops vacuum/background ownership, destroys page-buffer daemons, calls `log_final()` while the pool still exists, then tears down DWB/pool dependencies. Transaction-table teardown later calls `pgbuf_finalize()` before file-manager finalization. Restart-error cleanup disables work before destroying daemon/DWB owners and finalizing logging.

Source: `src/transaction/boot_sr.c:3055-3113`, restart cleanup within `src/transaction/boot_sr.c:2740-2800`, page-buffer daemon destruction at `src/storage/page_buffer.c:17244-17255`, and transaction-table teardown at `src/transaction/log_tran_table.c:580-594`.

The ordering rule is structural: no daemon may touch a pool after pool finalization, and log finalization that propagates pages needs the page buffer alive.

## Crash and persistence evidence boundary

Existing checkpoint/backup-like observations are bounded evidence. This evidence does not prove crash redo, per-page WAL ordering, DWB recovery, torn-page handling, or home-page persistence. Source tracing establishes intended gates and cleanup; a Runtime observation requires controlled crash points and post-restart state validation at the claimed boundary. Use [Verify at the Risk Boundary](../playbooks/verify-a-change.md).

## Related routes

- Practice: [special fetch and metadata ownership](../questions/advanced.md#pgbuf-qb-044-who-owns-special-fetch-and-metadata-mutation-protocols)
- Core prerequisite: [Caller Completes Correctness](../learning/03-caller-completes-correctness.md)
- Core prerequisite: [Flush One Generation](../learning/04-flush-one-generation.md)
- Identity contract: [Contract and Objects](../learning/01-contract-and-objects.md)
- Plan validation: [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- Locate symbols and callers: [Source and Caller Map](../reference/source-map.md)
