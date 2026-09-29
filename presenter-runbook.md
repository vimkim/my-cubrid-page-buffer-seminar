# Presenter runbook

Author-only facilitation notes for the [seminar curriculum](docs/seminar-curriculum-design.md). This file is deliberately absent from participant navigation, but is not protected from direct access.

Use Korean as the default live edition. Begin in reading mode to show the lecture's scope, then use presentation mode when focusing a section. PageUp/PageDown move between sections; Escape returns to reading. Open a model explanation after participants have considered the scenario. No participant responses are stored by the site.

A provisional meeting can allocate roughly 60 minutes to mechanisms and source traces, 20 to a worked scenario, and 10 to questions. These are planning aids, not limits. Split a dense lecture across meetings and revisit prerequisites whenever an ownership, guard, lifetime, or evidence boundary remains unclear. Continue until teammates can explain the causal path and handle counterexamples, even if the series exceeds a college semester.

Ask participants to distinguish what the source establishes from what requires a runtime experiment. Route unresolved claims to the uncertainty registry rather than settling them by confidence. Use the synthesis workshop and technical-defense rubric for shared reasoning, not a personal scorecard or a gate enforced by page visits.

Before presenting, open the exact served URL and check the intended viewport, diagrams, disclosure controls, source links, and language switch. Keep reading mode available if a projected section needs more context. Consult the coverage audit for remaining editorial or human language-review work.

## F01 replacement foundations

Begin with basic programming and array/linked-list knowledge only. Follow F01 with the required F02 database bridge before Lecture 1. No fixed total meeting duration is imposed.

Ask why a full cache cannot simultaneously retain P/R/S and load T under fixed capacity. The instructor explanation is conditional: replacement creates a reusable slot; bypass, waiting/refusal, or growth require a different permitted outcome. A clean cached copy can leave while its backing copy survives. Neither crash nor data loss follows just from being full.

For the common P R P S P R T U P R trace, ask for physical frames and metadata separately. At request 7, FIFO and Clock evict P; LRU and OPT evict S. At request 8, LRU loses P while OPT preserves P/R. Thus identical FIFO/LRU/Clock totals (3 hits, 7 misses) hide different histories. Clock's first full sweep clears all three bits before replacing F0; a reference bit is not a last-access timestamp. OPT's 5 misses meet the five-distinct-page lower bound only under this model.

Use the independent counterexample P R S P T R to challenge “LRU always wins”: FIFO has 2 hits/4 misses; LRU has 1 hit/5 misses. Have participants explain the recent-use assumption and metadata cost rather than infer throughput from hit counts.

The unseen exercise P R S R T P R uses a fresh empty cache. Instructor totals: FIFO/Clock 1 hit/6 misses, LRU 2 hits/5 misses, OPT 3 hits/4 misses. Request 6 distinguishes FIFO's eviction of R from LRU's eviction of S, explaining the final R miss versus hit. Use the full answer ledgers in native disclosures only after prediction. Ask for reasoning and state transitions, not an automated score. These checks do not establish participant mastery or replace human language review.

## F02 database bridge

Use the systems table to ask what the cached unit is, who controls placement, and which candidates are legal. A CPU line is not a database page; a set restricts candidates. An application may discard a recomputable value but cannot infer the same contract for pending writes. Introduce pin versus latch, dirty versus clean, durability and WAL before the dirty checkpoint. A page flush is neither eviction nor transaction commit.

DB-A, DB-B, and DB-C each restart at P/R/S; they are not successive rows or F01 terminal states. Ask participants to name the reset and explain the assumptions before opening each disclosure. Instructor explanation for DB-A: FIFO prefers pinned P, but R is oldest eligible, so T replaces R in F1, giving P/T/S and FIFO P→S→T. The atomic eligibility/reuse step is an explicit teaching-model premise.

DB-B has dirty unpinned P and clean pinned R/S. Successful WAL-ordered writeback with no concurrent change leaves P/R/S and clean P; only subsequent protected reuse gives T/R/S. Its alternative re-dirty schedule restarts at DB-B and does not inherit that successful ending. DB-C has all three pinned: no recency improvement frees a frame. Progress needs another event, such as release; waiting is not itself a guarantee. Ask for permitted next actions and unsupported fairness claims separately.

PostgreSQL's ring and InnoDB's delayed promotion motivate scan handling without predicting a winner. Keep detailed comparator control flow in Lecture 18A. Before entering Lecture 1, state that ticket 01 starts a different 32,768-frame constructed model, first uses INVALID frames, and keeps F42/F43 distinct from toy F0/F1. Repeating P can leave its LRU1 position unchanged under the preserved example's assumptions. Later ticket 02 extends that source-derived state; do not improvise three-frame cooling thresholds. Use human-reviewed reasoning as learning evidence, with language review still pending.
