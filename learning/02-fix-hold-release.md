# Fix, Hold, and Release: Borrowing a Resident Page

**Level:** Core
**Prerequisites:** [Contract and Objects](./01-contract-and-objects.md)
**Capability gained:** Planned — trace a normal fix and matching release while accounting for global and per-thread ownership debt.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** [Authoring contract](../maintainer-guide-notes.md) only; this shell asserts no page-buffer mechanism.

> **Shell status:** Incomplete. This page reserves the canonical destination and makes no page-buffer implementation claims yet.

## Planned scope

This page will own normal fix/release choices, hit and miss convergence, global and per-thread ownership ledgers, nested debt, and pointer lifetime.

## Learning navigation

**Previous:** [Contract and Objects](./01-contract-and-objects.md)
**Next:** [Caller Completes Correctness](./03-caller-completes-correctness.md)

## Related routes

- [Change the Module Safely](../playbooks/change-safely.md)
- [Source and Caller Map](../reference/source-map.md)
- [Acquisition Concurrency and Multi-page Ownership](../advanced/acquisition-concurrency.md)
