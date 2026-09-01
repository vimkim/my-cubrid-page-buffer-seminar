# Flush One Generation: WAL, DWB, and Concurrent Re-dirty

**Level:** Core
**Prerequisites:** [Caller Completes Correctness](./03-caller-completes-correctness.md)
**Capability gained:** Planned — explain one dirty generation from stable copy through WAL gating, write completion, concurrent re-dirty, and rollback.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** [Authoring contract](../maintainer-guide-notes.md) only; this shell asserts no page-buffer mechanism.

> **Shell status:** Incomplete. This page reserves the canonical destination and makes no page-buffer implementation claims yet.

## Planned scope

This page will own the single-generation durability model, stable copy, WAL gate, submission boundaries, concurrent re-dirty, completion, and rollback.

## Learning navigation

**Previous:** [Caller Completes Correctness](./03-caller-completes-correctness.md)
**Next:** [Replace One Frame](./05-replace-one-frame.md)

## Related routes

- [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
- [Evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md)
- [Recovery, Allocation State, and Module Lifecycle](../advanced/recovery-and-lifecycle.md)
