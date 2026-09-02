# CUBRID Page-buffer Question Bank

**Level:** Question bank — route selector
**Prerequisites:** [Maintainer-guide reader contract](../page-buffer-teaching-material.md)
**Capability gained:** Select a retrieval route, attempt questions without exposed answers, and compare the result against evidence-aware model answers.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** Interface contract, Verified mechanism, Implementation policy, Inference, Runtime observation, and Historical evidence as defined by the [authoring contract](../maintainer-guide-notes.md)

This Question bank is an optional Evidence reference for self-study retrieval and source tracing. It does not replace the ordered [Learning path](../learning/01-contract-and-objects.md), and completing it is neither a score nor evidence of production readiness.

## Retrieval loop

1. Open a prompt route without opening its companion answers.
2. Write the requested artifact from your current model.
3. Inspect the named pinned-source regions or exact evidence artifacts.
4. Revise the artifact and state what the evidence does not establish.
5. Compare it with the matching answer by immutable `PGBUF-QB-*` ID.
6. Follow the linked Canonical explanation when your reasoning differs.

## Routes

| Need | Prompts | Companion answers |
|---|---|---|
| Rehearse the six-page Core path | [Core retrieval](./core.md) | [Core answers](./core-answers.md) |
| Extend Core through optional mechanisms | [Advanced retrieval](./advanced.md) | [Advanced answers](./advanced-answers.md) |
| Practice review, diagnosis, and verification decisions | [Maintenance scenarios](./maintenance-scenarios.md) | [Scenario answers](./maintenance-scenarios-answers.md) |
| Work from executed same-revision quiz evidence | [Applied exercises](./applied-exercises.md) | [Applied answers](./applied-exercises-answers.md) |

Documentation maintainers can inspect the [Question-bank migration audit](./migration-audit.md). It records what happened to every legacy, planned, executed, live-grill, and Reader question without making that provenance part of the retrieval surface.

## Canonical item format

Prompts use this field contract:

```markdown
### PGBUF-QB-NNN — Question title

- **Route:** Core | Advanced | Maintenance scenario | Applied exercise
- **Retrieval mode:** Explain | Trace | Scenario | Proof obligation
- **Prerequisite:** linked guide prerequisite
- **Capability tested:** one reviewable artifact
- **Inspect:** exact source ranges or evidence artifacts

**Question:** The prompt.
```

Answers use the same ID and title with Evidence, Canonical guide, Source anchors, Confidence/limit, Model answer, and Why fields. Canonical IDs are durable identities, not question numbers; route order may change without renumbering them.

## Navigation

- Return to the [maintainer-guide entry](../page-buffer-teaching-material.md).
- Locate source regions through the [Source and Caller Map](../reference/source-map.md).
- Check mutable candidate status only in the [evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md).
