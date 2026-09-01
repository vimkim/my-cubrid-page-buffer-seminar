# Maintainer Invariant Index

**Level:** Reference
**Prerequisites:** [Target-reader baseline](../page-buffer-teaching-material.md); canonical explanations provide context
**Capability gained:** Find a stable invariant name, canonical explanation, related playbook, and verification risk without duplicating the proof.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** [Source inventory](../source-inventory.md) for provenance and the linked canonical explanations.

This is a routing index. It does not reproduce the full argument or representative source trace behind an invariant.

## Invariants

| Stable name | One-sentence statement | Canonical explanation | Playbook | Verification risk |
|---|---|---|---|---|
| **IDENTITY-ONE** | A VPID has at most one authoritative resident BCB mapping, and identity is revalidated across stale-observation windows. | [Contract and Objects](../learning/01-contract-and-objects.md) | [Diagnose](../playbooks/debug-by-symptom.md) | Concurrent miss/load and rebind schedule |
| **FIX-DEBT** | Every successful acquisition creates exactly one caller-visible release debt, including nested fixes of the same pointer. | [Fix, Hold, and Release](../learning/02-fix-hold-release.md) | [Change safely](../playbooks/change-safely.md) | Success, error, restart, and transfer exits |
| **BORROW-LIFETIME** | Page-derived pointers are usable only while the owning fix remains valid, unless copied into caller-owned storage. | [Fix, Hold, and Release](../learning/02-fix-hold-release.md) | [Diagnose](../playbooks/debug-by-symptom.md) | Use-after-unfix and refix identity |
| **CALLER-COMPLETES** | Fix grants protected page access; the caller still owns logical locking, format validation, mutation, logging meaning, dirtying, retry, and cleanup. | [Caller Completes Correctness](../learning/03-caller-completes-correctness.md) | [Change safely](../playbooks/change-safely.md) | Representative caller plus every cleanup exit |
| **WAL-BEFORE-DATA** | Logged page images cross their WAL gate before copied data-page submission. | [Flush One Generation](../learning/04-flush-one-generation.md) | [Verify](../playbooks/verify-a-change.md) | Per-page ordering at the configured I/O boundary |
| **GENERATION-SPLIT** | Completion of snapshot G must not erase a concurrent resident G+1 dirty generation. | [Flush One Generation](../learning/04-flush-one-generation.md) | [Verify](../playbooks/verify-a-change.md) | Controlled re-dirty and failure schedules |
| **VICTIM-RECHECK** | A frame is rebound only after all hard eligibility predicates pass a final protected revalidation. | [Replace One Frame](../learning/05-replace-one-frame.md) | [Diagnose](../playbooks/debug-by-symptom.md) | Pressure, waiters, dirty/flush, and direct revocation |
| **UNWIND-BALANCE** | Each acquired owner/state transition has an explicit success, retry, transfer, and failure disposition. | [Maintainer Capstone](../learning/06-maintainer-capstone.md) | [Change safely](../playbooks/change-safely.md) | Fault injection at the highest fallible seam |

## Evidence ownership

Invariant provenance and reconciliation remain in the [source inventory](../source-inventory.md). Candidate and historical status remain in the [uncertainty registry](../unresolved-or-version-sensitive-findings.md); this index does not copy or update status.

## Related routes

- [Contract and Objects](../learning/01-contract-and-objects.md)
- [Change the Module Safely](../playbooks/change-safely.md)
- [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- [Evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md)
