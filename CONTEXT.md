# Page-buffer Maintainer Guide

This context defines the reader roles and documentation paths used when designing the internal guide for engineers who maintain CUBRID's page-buffer module.

## Language

**Target maintainer**:
A senior C/C++ systems engineer who understands basic database storage, buffer pools, and WAL, but has no assumed knowledge of CUBRID source structure or page-buffer protocols.
_Avoid_: Page-buffer newcomer, senior engineer

**Core maintainer**:
A target maintainer who can trace ordinary acquisition and release through a real caller, reason about the governing invariants, review failure cleanup, and choose evidence appropriate to a routine change.
_Avoid_: Beginner, basic reader

**Advanced maintainer**:
A core maintainer who can investigate ordered access, replacement pressure, flush generations, recovery, lifecycle, specialized interfaces, and fault-injected failures.
_Avoid_: Expert reader, module expert

**Learning path**:
The finite, ordered route that builds core maintainer capability before optional advanced mechanisms.
_Avoid_: Main document, linear guide

**Maintainer playbook**:
A task- or symptom-oriented route used during review, modification, debugging, and verification work.
_Avoid_: Tutorial, troubleshooting appendix

**Evidence reference**:
Searchable provenance, source maps, implementation catalogs, runtime receipts, historical findings, and unresolved claims that support but do not interrupt the learning path.
_Avoid_: Deep dive, appendix

**Page journey**:
The core learning narrative that follows one logical page from caller intent through acquisition, use or mutation, release, generation flush, victim eligibility, and frame reuse.
_Avoid_: Page lifecycle, complete lifecycle

**Core completion evidence**:
The reader-produced object map, source traces, scenario reasoning, and change-impact plan that demonstrate core maintainer capability.
_Avoid_: Completion checklist, quiz score

**Guide entry**:
The stable `page-buffer-teaching-material.md` landing page that routes readers into learning, maintenance, and diagnosis without teaching the module itself.
_Avoid_: Main guide, welcome guide

**Canonical explanation**:
The single page that owns the mental model and representative source path for a concept; playbooks and references link to it instead of reproducing it.
_Avoid_: Primary copy, authoritative section

## Evidence language

**Interface contract**:
A caller-visible guarantee or obligation established for the pinned source revision.
_Avoid_: API behavior, contract when only internal behavior is known

**Verified mechanism**:
Internal behavior directly established by the pinned source but not promised as a stable caller interface.
_Avoid_: Implementation detail, contract

**Implementation policy**:
A replaceable or tunable internal choice that may change while interface contracts remain intact.
_Avoid_: Mechanism, invariant

**Inference**:
A defensible explanation suggested by source structure but not established as a guarantee or runtime fact.
_Avoid_: Likely behavior, apparent contract

**Runtime observation**:
An event observed under one recorded revision, build, configuration, and workload.
_Avoid_: Runtime proof, benchmark result

**Historical evidence**:
Evidence from another revision or an earlier investigation that requires revalidation before describing current behavior.
_Avoid_: Known behavior, current defect

## Learning evidence

**Understanding check**:
A learning-page exercise that asks the reader to predict behavior, locate its source transition, and explain the governing invariant in a small reviewable artifact.
_Avoid_: Quiz, knowledge check

**Capstone review**:
A source-grounded change analysis that demonstrates the reader can connect interface behavior, state ownership, invariants, failure cleanup, caller impact, and verification without implementing the change.
_Avoid_: Final exam, capstone project

**Applied path**:
The post-core practice in which a maintainer runs one controlled caller regression or narrow runtime probe on the target revision and records its evidence boundary.
_Avoid_: Runtime lab, practical section
