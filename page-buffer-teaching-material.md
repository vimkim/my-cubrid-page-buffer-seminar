# CUBRID Page Buffer Maintainer Guide

**Level:** Guide entry
**Prerequisites:** [Target-reader baseline](./CONTEXT.md#language)
**Capability gained:** Select the learning or operational route that matches a maintenance task and identify where its evidence status is owned.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
**Evidence used:** The six canonical labels—Interface contract, Verified mechanism, Implementation policy, Inference, Runtime observation, and Historical evidence—as defined by the [authoring contract](./maintainer-guide-notes.md), [source inventory](./source-inventory.md), and [evidence and uncertainty registry](./unresolved-or-version-sensitive-findings.md)

This guide is for a senior C/C++ systems engineer who understands basic database storage, buffer pools, and WAL, but does not yet know CUBRID's source structure or page-buffer protocols. It is a route selector: use the learning path to build the model, or enter through a playbook when a maintenance task already defines your question.

All source claims are pinned to CUBRID commit `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. Before applying an anchor or mechanism claim to another revision, diff the cited symbols and control flow, revalidate representative callers, and check the uncertainty registry.

## Maintainer routes

| Your immediate need | Route | What it gives you |
|---|---|---|
| Build a coherent mental model | [Learn the module](./learning/01-contract-and-objects.md) | Six ordered Core pages following one page journey |
| Review or modify code | [Work on a change](./playbooks/change-safely.md) | Impact analysis, invariant review, and safe close-out |
| Investigate a failure or performance symptom | [Diagnose a symptom](./playbooks/debug-by-symptom.md) | Symptom-to-owner routing and discriminating probes |
| Choose evidence proportional to risk | [Verify a change](./playbooks/verify-a-change.md) | Compile, regression, concurrency, pressure, fault, and recovery seams |
| Locate the owning implementation or caller | [Find the source](./reference/source-map.md) | Compact source and caller map |
| Check provenance or current claim status | [Check evidence and uncertainty](./source-inventory.md) | [Source inventory](./source-inventory.md) plus the sole mutable [Evidence and uncertainty registry](./unresolved-or-version-sensitive-findings.md) |
| Extend Core reasoning | [Continue to Advanced work](./advanced/acquisition-concurrency.md) | Concurrency, progress, recovery, specialized interfaces, and proof obligations |

## Core completion outcomes

The ordered path is designed for a half-day Core reading and source-tracing session. Completing it means you can:

1. draw and explain `VPID → BCB → frame → PAGE_PTR`, including the global fix count and per-thread holder;
2. trace one successful fix and matching release in the pinned source;
3. trace a representative caller and separate Module guarantees from caller obligations;
4. reason about dirty generations, WAL ordering, victim eligibility, and frame reuse; and
5. produce a change-impact plan naming the Interface family, state owner, invariant, failure unwind, caller impact, and verification seam.

Reading alone is not production readiness. The one-to-two-day Applied path adds a controlled caller regression or narrow runtime probe on the revision being changed, with another maintainer reviewing the change-impact plan and evidence boundary.

## Advanced completion outcomes

Treat the first-week Advanced route as task-selected study after Core, not as a second mandatory linear course:

- [Acquisition Concurrency and Multi-page Ownership](./advanced/acquisition-concurrency.md)
- [Replacement Policy and Background Progress](./advanced/replacement-progress.md)
- [Recovery, Allocation State, and Module Lifecycle](./advanced/recovery-and-lifecycle.md)
- [Specialized Interfaces and Approximate Observability](./advanced/specialized-interfaces.md)
- [Failure Unwind and Open Proof Obligations](./advanced/failure-and-proof-obligations.md)

Advanced completion means you can extend the Core invariants through ordered access, replacement pressure, recovery and lifecycle, narrow owner protocols, and fault- or schedule-sensitive proof obligations without turning an observation or source candidate into an unsupported defect claim.

## Evidence labels

Use the strongest label the available evidence supports:

| Label | Meaning |
|---|---|
| **Interface contract** | A caller-visible guarantee or obligation established for the pinned revision |
| **Verified mechanism** | Internal behavior directly established by pinned source, but not promised as a stable Interface |
| **Implementation policy** | A replaceable or tunable choice that may change while Interface contracts remain intact |
| **Inference** | A defensible explanation suggested by source structure, but not established as a guarantee or runtime fact |
| **Runtime observation** | An event observed under one recorded revision, build, configuration, and workload |
| **Historical evidence** | Evidence from another revision or earlier investigation that requires revalidation |

Exact definitions and authoring vocabulary live in [CONTEXT.md](./CONTEXT.md#evidence-language). Broad source routing belongs in the [source map](./reference/source-map.md); provenance and reconciliation belong in the [source inventory](./source-inventory.md); mutable candidate and historical status belongs only in the [evidence and uncertainty registry](./unresolved-or-version-sensitive-findings.md).

## Learning order

1. [Contract and Objects](./learning/01-contract-and-objects.md)
2. [Fix, Hold, and Release](./learning/02-fix-hold-release.md)
3. [Caller Completes Correctness](./learning/03-caller-completes-correctness.md)
4. [Flush One Generation](./learning/04-flush-one-generation.md)
5. [Replace One Frame](./learning/05-replace-one-frame.md)
6. [Maintainer Capstone](./learning/06-maintainer-capstone.md)

Each page states its prerequisite, evidence boundary, capability, understanding check, and next route. Start at page 1 unless you can already produce the earlier page's evidence artifact.
