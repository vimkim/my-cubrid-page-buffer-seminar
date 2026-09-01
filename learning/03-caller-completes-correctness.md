# Caller Completes Correctness: From Access to Logged Mutation

**Level:** Core
**Prerequisites:** [Fix, Hold, and Release](./02-fix-hold-release.md)
**Capability gained:** Planned — separate successful acquisition guarantees from the validation, logging, dirtying, and cleanup obligations of a mutating caller.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** [Authoring contract](../maintainer-guide-notes.md) only; this shell asserts no page-buffer mechanism.

> **Shell status:** Incomplete. This page reserves the canonical destination and makes no page-buffer implementation claims yet.

## Planned scope

This page will own one representative caller journey from acquisition through validation, mutation, logging, dirtying, release, and failure cleanup.

## Learning navigation

**Previous:** [Fix, Hold, and Release](./02-fix-hold-release.md)
**Next:** [Flush One Generation](./04-flush-one-generation.md)

## Related routes

- [Change the Module Safely](../playbooks/change-safely.md)
- [Source and Caller Map](../reference/source-map.md)
- [Acquisition Concurrency and Multi-page Ownership](../advanced/acquisition-concurrency.md)
- [Recovery, Allocation State, and Module Lifecycle](../advanced/recovery-and-lifecycle.md)
