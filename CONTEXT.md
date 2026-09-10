# Page-buffer documentation

This glossary defines the readers and document roles of the Maintainer Guide and the Audience-facing seminar site for CUBRID's page-buffer module.

## Language

**Target maintainer**:
A senior C/C++ systems engineer who understands basic database storage, buffer pools, and WAL, but has no assumed knowledge of CUBRID source structure or page-buffer protocols.
_Avoid_: Page-buffer newcomer, senior engineer

**Seminar participant**:
A Target maintainer who follows the page-buffer seminar live and may return to its audience-facing material afterward for independent reading.
_Avoid_: Listener, learner, student

**Audience-facing seminar site**:
The bilingual page-buffer material used directly with Seminar participants during the live presentation and retained as a self-contained route afterward. It is distinct from the Maintainer Guide and from private presenter preparation.
_Avoid_: Teaching course, learner site, presentation notes

**Seminar curriculum**:
The capability-gated, multi-session route through the Audience-facing seminar site. It has no predetermined total duration: the route continues through Core, Advanced, and applied maintainer work until Seminar participants demonstrate deep Module understanding.
_Avoid_: Live seminar route, fixed-duration course, presentation deck

**Seminar lecture**:
An audience-facing unit in the Seminar curriculum combining explanation, a bounded source trace, participant reasoning, and questions around one coherent mechanism.
_Avoid_: Lesson, slide deck, reading assignment

**Curriculum completion evidence**:
Participant-produced source traces, scenario reasoning, diagnostic work, change-impact analysis, and a final technical defense that together demonstrate deep Module understanding.
_Avoid_: Mastery record, attendance, pages read, keyword coverage

**Completion record**:
A presenter- or team-reviewed record of Curriculum completion evidence maintained outside the Audience-facing seminar site.
_Avoid_: Public progress state, automated mastery score, reading history

**Applied seminar work**:
Reversible source-tracing or runtime-probe work that exercises Module reasoning without requiring a production engine change.
_Avoid_: Homework, mandatory implementation, unrestricted experiment

**Presentation mode**:
The projected view of a Seminar lecture that emphasizes the current explanation while keeping supporting detail available for later reading.
_Avoid_: Slide mode, separate deck, presenter view

**Topic library**:
The complete audience-facing collection of Seminar lectures, deep dives, comparisons, exercises, and reference cards available both within and beyond the Seminar curriculum.
_Avoid_: Course catalog, required lessons, quick access

**Curriculum syllabus**:
The audience-facing map of Seminar lectures, their conceptual dependencies, and their routes into the Topic library. It describes the shared curriculum without recording individual progress.
_Avoid_: Course learning path, current checkpoint, mastery dashboard

**Curriculum phase**:
A conceptual grouping of related Seminar lectures used to make the Curriculum syllabus navigable. It does not assert that a participant has completed or mastered the grouped material.
_Avoid_: Level, stage gate, learner status

**Synthesis workshop**:
An audience-facing exercise that connects several Seminar lectures through one page journey or maintainer scenario and provides an evidence-bounded model explanation without automated scoring.
_Avoid_: Synthesis studio, retrieval checkpoint, automated assessment

**Audience checkpoint**:
An optional pause in the seminar material that asks participants to reason about a transition or scenario before revealing an explanation. It supports discussion and does not score mastery or control progression.
_Avoid_: Teach-back, mastery check, retrieval gate

**Presenter runbook**:
Private preparation material containing timing, transitions, facilitation notes, and likely questions for the person delivering the seminar. It is not part of audience navigation.
_Avoid_: Speaker notes embedded in pages, teaching-agent guidance

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

**Newly allocated page identity**:
A VPID that its file, disk, or recovery owner has already reserved and made valid. It does not yet imply an initialized logical page image.
_Avoid_: New page, when allocation state and initialized content could be confused

**Buffer materialization**:
Establishing resident storage and Module-owned metadata for a logical page identity. It does not by itself allocate that identity or initialize the caller-owned page type and layout.
_Avoid_: Page initialization, when only resident storage and metadata are prepared

**Server-module Interface**:
A caller-visible contract among CUBRID engine modules. It is internal to the server and distinct from an installed SQL, CCI, or application API.
_Avoid_: Public API, unless the exact boundary is named

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

**Question bank**:
A navigable Evidence reference for self-study retrieval and source tracing, with model answers that link back to canonical explanations instead of reproducing a parallel tutorial.
_Avoid_: Quiz, exam, assessment bank

**Core retrieval question**:
A question mapped to the ordered Core learning path that helps a target maintainer rehearse Core completion evidence.
_Avoid_: Beginner question, mandatory question

**Advanced retrieval question**:
An optional question mapped to an Advanced or maintainer-task route for reasoning about mechanism, policy, failure, or proof boundaries beyond Core completion.
_Avoid_: Expert-only question, bonus question

**Applied exercise**:
A source-tracing or controlled-runtime task that asks the reader to produce evidence while preserving the setup, observation, supported conclusion, and unsupported conclusion boundaries.
_Avoid_: Lab, executable quiz

**Question disposition**:
The migration record for one legacy question: retained, merged, rewritten, superseded, or excluded, with its destination and rationale.
_Avoid_: Copy status, import status

**Canonical question**:
A selected, deduplicated, and pinned-source-validated question in the current Question bank, identified independently from every legacy source item that contributed to it.
_Avoid_: Imported question, migrated question

**Canonical question ID**:
The immutable `PGBUF-QB-*` identity of one Canonical question; ordering, route, wording, and legacy provenance may change without reusing the identity for another question.
_Avoid_: Question number, legacy ID

**Retrieval mode**:
The kind of work a Canonical question asks the reader to perform: Explain, Trace, Scenario, or Proof obligation; it describes the evidence artifact rather than rating the reader.
_Avoid_: Difficulty, level, score

**Reader question intake**:
Unedited questions recorded by a guide reader and held as feedback until each is answered, source-validated, and given a Question disposition.
_Avoid_: Question bank, draft answer

**Capstone review**:
A source-grounded change analysis that demonstrates the reader can connect interface behavior, state ownership, invariants, failure cleanup, caller impact, and verification without implementing the change.
_Avoid_: Final exam, capstone project

**Applied path**:
The post-core practice in which a maintainer runs one controlled caller regression or narrow runtime probe on the target revision and records its evidence boundary.
_Avoid_: Runtime lab, practical section
