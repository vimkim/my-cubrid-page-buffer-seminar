# Textbook-first replacement curriculum interview

Status: design confirmed; design work item 215 complete. Implementation explicitly authorized and tracked as 216. Started 2026-09-29.

## New direction supplied by the user

The team leader wants the seminar to begin with page-buffer LRU fundamentals, explained at approximately college-sophomore level. Cover what replacement is, why it is needed, what happens without it, basic algorithms, examples from other databases and other areas of CS, and then the CUBRID case. The user explicitly invoked grill-with-docs.

This supersedes the assumption that a brief textbook-LRU reminder is sufficient for the seminar entry. It does not yet decide whether the final maintainer capability, Markdown-guide audience, or entire curriculum structure should change. Preserve the completed bilingual admission/reuse example from commit 45435a9 as later CUBRID material. Do not continue implementing remaining LRU tickets while their prerequisite teaching route is under design.

Retain bilingual delivery, source provenance, constructed-versus-runtime distinctions, and existing human-review requirements unless the user changes them. The separate simulator remains independent; no instruction to resume it was given.

## Existing decisions to reconcile

CONTEXT defines Seminar participant as a Target maintainer who already understands buffer pools and WAL. The accepted curriculum places cross-engine comparisons late. A foundational seminar entry and early conceptual comparisons need an explicit scoped revision rather than silently changing the canonical English guide's reader contract.

General cache replacement is the transferable concept. OS virtual-memory pages, database pages, CPU cache lines, and application-cache objects are different units with different management and safety constraints. The teaching material should not imply that every CS system uses page replacement or that every cache can choose an arbitrary victim.

"Without replacement" needs an explicit premise: with fixed capacity, a full cache, and a request for an absent item, reuse requires space. Depending on the system contract, alternatives include bypass, refusal/waiting, or additional capacity. No universal crash or data-loss conclusion follows. Dirty data and in-use protection will later constrain legal reuse.

## Primary reading selected

- [OSTEP, Beyond Physical Memory: Policies](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys-policy.pdf): cache-management framing, reference strings, hit/miss cost, OPT/FIFO/LRU, locality and approximations. Use as conceptual authority and inspiration; author original examples rather than copying chapter text/figures.
- [CMU 15-445, Buffer Pool Management](https://15445.courses.cs.cmu.edu/spring2026/slides/04-bufferpool.pdf): bridge from general cache policy to database buffer-pool management. Source is an introductory database course; version-specific engine claims still need pinned first-party evidence.
- Existing replacement-policy comparison lecture and evidence note already cover CUBRID/PostgreSQL/InnoDB internals at pinned revisions. They need a conceptual introduction before their detailed comparison can serve this new audience.

## Proposed teaching route, not yet accepted

1. Finite fast storage and larger slower storage; page/frame, locality, hit/miss, and the cost of misses.
2. Fill a tiny cache and request a fourth page; expose the need for an explicit capacity-handling choice before naming a replacement algorithm.
3. Trace several policies on the same access sequence and compare outcomes/costs; include a counterexample to the idea that LRU always wins.
4. Transfer the model to OS memory, CPU caches, application caches, and database buffer pools, explicitly marking differences.
5. Introduce database constraints: in-use pages, dirty pages, writeback, scans, and policy-maintenance/concurrency costs. Give a conceptual PostgreSQL/InnoDB orientation before CUBRID; retain detailed source comparisons later.
6. Build the CUBRID model and then use the existing source-linked worked example and planned deeper exercises.

## Decision tree and Round 1 frontier

- Q1, entry assumptions and destination: recommend basic programming/arrays/linked lists only at entry, explain cache/paging/database terms from scratch, and retain the eventual CUBRID maintainer goal. Keep the English Maintainer Guide audience unchanged; revise Seminar participant separately if accepted. Alternative: redesign the entire course around a lasting undergraduate rather than maintainer endpoint.
- Q2, algorithm depth: recommend full hand traces for FIFO, OPT/MIN, exact LRU, and Clock/second chance; introduce Random and LFU as shorter contrasts. More advanced scan-resistant policies belong in the database bridge, not the initial policy list.
- Q3, transfer breadth: recommend short OS/CPU/application-cache examples and a deeper database bridge using PostgreSQL and InnoDB; detailed source-level comparisons remain after the CUBRID foundation. Alternative: equally deep algorithm/implementation treatment across all domains.

After this round, settle original examples/exercises, the foundational module boundaries and transition into existing material, and concrete completion evidence. Record only accepted choices in glossary/ADRs; do not infer agreement from recommendations.

## Round 1 accepted

The user answered "1. yes 2. yes 3. yes", accepting all three recommendations:

- Start with basic programming and arrays/linked lists, teach cache/paging/database concepts from scratch, and retain the CUBRID maintainer-level destination. The separate English Maintainer Guide reader contract stays unchanged.
- Hand-trace FIFO, OPT/MIN, exact LRU, and Clock/second chance. Random and LFU receive shorter contrasts; advanced policies follow in the database bridge.
- Provide concise OS/CPU/application-cache examples and a deeper PostgreSQL/InnoDB bridge, with detailed source-level database comparison after CUBRID foundations.

## Round 2 frontier, accepted

The user's subsequent "yes" accepts the three recommendations below. A further explicit "yes" confirmed the consolidated design, and the user subsequently authorized dependency-ordered implementation with one dedicated subagent per ticket.

- Q4, worked-example continuity: recommend one recurring story (a small hot working set plus a scan), initially represented by three frames and a common reference string for the four policies. Extend it in explicit phases for pinning and dirty pages, then map the same workload shape to the existing faithful CUBRID snapshot. The toy state is not claimed to be a literal CUBRID configuration. Allow short labeled counterexamples when the main trace cannot establish a limitation.
- Q5, curriculum integration: recommend a required foundations block before current Lecture 1, followed by a database-constraints bridge into the existing source-based path. Preserve existing lecture URLs and completed ticket01; adjust prerequisites, navigation, and introductions rather than rewriting the whole seminar or changing the Maintainer Guide.
- Q6, teaching evidence: recommend low-stakes predict-before-reveal checkpoints, with separate instructor answers and a transfer exercise using an unseen request sequence. Require explanations of misses, victims, metadata, safe reuse versus progress, and policy tradeoffs, not only hit-count arithmetic. Retain the final source-linked CUBRID policy defense. These are learning checks, not a formal graded certification.

After these decisions, consolidate the revised design and request confirmation of shared understanding before implementation. Routine example strings, page layout, and wording can be authored and verified without additional preference rounds.

## Read-only local audit

The delegated audit found no existing introductory shared reference-string comparison for FIFO/OPT/LRU/Clock. Lecture 1 begins with VPID/BCB/latches/fix debt (English page line 25); Lecture 7 explains finite-slot reuse and eligibility (lines 24 and 161), but does not first establish hierarchy/locality/hit/miss. Lecture 18A has a useful engine comparison (line 24) that can supply the later detailed route. The new worked example begins with large-pool topology and quotas (line 11), so it should remain a later CUBRID destination. No participant pages were modified during this audit.

Two decisions require explicit reconciliation: the current participant prerequisite of buffer pools/WAL, and the late-only cross-engine comparison rule. Q1 and Q3 address these. No broad change to the Maintainer Guide is inferred.
