# Replacement Policy and Background Progress

**Level:** Advanced
**Prerequisites:** [Flush One Generation](../learning/04-flush-one-generation.md) and [Replace One Frame](../learning/05-replace-one-frame.md)
**Capability gained:** Planned — analyze replacement and background progress policy without weakening the core victim-eligibility contract.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** [Authoring contract](../maintainer-guide-notes.md) only; this shell asserts no page-buffer mechanism.

> **Shell status:** Incomplete. This page reserves the canonical destination and makes no page-buffer implementation claims yet.

## Planned scope

This page will separate replacement eligibility from replacement policy and background progress work. It will route symptoms and proposed changes back through the core flush and victim-selection prerequisites.

## Related routes

- Core prerequisite: [Flush One Generation](../learning/04-flush-one-generation.md)
- Core prerequisite: [Replace One Frame](../learning/05-replace-one-frame.md)
- Investigate a symptom: [Diagnose Page-buffer Symptoms](../playbooks/debug-by-symptom.md)
- Plan validation: [Verify at the Risk Boundary](../playbooks/verify-a-change.md)
