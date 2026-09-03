# Maintainer guide authoring notes

This file records the document contract for the page-buffer maintainer-guide set. It is for people or agents maintaining the documentation, not for page-buffer newcomers.

## Document contract

- Audience: a Target maintainer is a senior C/C++ systems engineer who understands basic database storage, buffer pools, and WAL but has no assumed knowledge of CUBRID source structure or page-buffer protocols.
- Language: English explanatory prose with canonical English source identifiers and systems terms.
- Baseline: CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`.
- Guide entry: `page-buffer-teaching-material.md` states the audience, outcomes, evidence vocabulary, and reader routes without teaching the Module again.
- Core maintainer path: ordered pages under `learning/` build the object model, normal ownership contract, caller responsibilities, durability reasoning, replacement reasoning, and change-impact capability.
- Advanced maintainer path: pages under `advanced/` extend the core invariants through concurrency, replacement progress, recovery/lifecycle, specialized interfaces, and failure proof obligations.
- Maintainer playbook path: pages under `playbooks/` support change, symptom diagnosis, and risk-matched verification during real work.
- Evidence reference path: pages under `reference/`, plus `source-inventory.md` and `unresolved-or-version-sensitive-findings.md`, own source routing, invariant lookup, provenance, receipts, and mutable uncertainty status.
- Question-bank path: pages under `questions/` provide optional Core retrieval, Advanced retrieval, maintainer scenarios, and Applied exercises with prompts separated from evidence-aware answers; they link Canonical explanations instead of reproducing them.
- Canonical ownership: each concept has one canonical explanation. Playbooks provide decisions and actions, while references provide routing and evidence; both link to the explanation instead of copying it.
- Primary use: finite linear onboarding followed by task- and symptom-driven lookup during maintenance.

Use the canonical vocabulary in [`CONTEXT.md`](./CONTEXT.md) and respect the decisions under [`docs/adr/`](./docs/adr/).

## Sources of truth

Use evidence in this order:

1. Pinned CUBRID source through `git show f799e05:<path>` or a clean matching worktree.
2. [`source-inventory.md`](./source-inventory.md) for provenance, accepted runtime receipts, conflict resolution, and source routing.
3. Same-revision packets under `../../pgbuf-analysis/f799e05_claude/`.
4. The audited lifecycle report under `../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/`.
5. Historical `e6ed61e` and `5cd4f860e` material only when explicitly labeled revision-bound.

Never use an older defect summary as proof of a current defect. Carry candidates through
[`unresolved-or-version-sensitive-findings.md`](./unresolved-or-version-sensitive-findings.md).

## Evidence contract

Use the strongest label the evidence actually supports:

| Label | Meaning |
|---|---|
| **Interface contract** | Caller-visible guarantee or obligation established for the pinned revision |
| **Verified mechanism** | Internal behavior directly established by pinned source but not promised as a stable Interface |
| **Implementation policy** | Replaceable or tunable internal choice that may change while Interface contracts remain intact |
| **Inference** | Defensible explanation suggested by source structure but not established as a guarantee or runtime fact |
| **Runtime observation** | Event observed under one recorded revision, build, configuration, and workload |
| **Historical evidence** | Evidence from another revision or earlier investigation that requires revalidation |

- Put exact source anchors near implementation-specific claims.
- Keep broad source catalogs in the Source map and provenance/conflict resolution in `source-inventory.md`.
- Change candidate or historical status only in `unresolved-or-version-sensitive-findings.md`; other pages route by ID.
- Runtime evidence cards state the setup, observation, supported conclusion, unsupported conclusion, and accepted receipt.
- Use PostgreSQL and InnoDB only as brief, late contrasts after the corresponding CUBRID mechanism is understood.

## Asset contract

Every SVG displayed anywhere in the document set is owned by [`assets/`](./assets/).

- The Guide entry links with `./assets/<name>.svg`; pages one directory below link with `../assets/<name>.svg`.
- Validation resolves each target and requires it to remain inside the root asset seam.
- Each SVG has a `viewBox`, contains no active content, and communicates meaning without depending on color alone.
- Reused visuals are copied into this directory so the guide remains self-contained.
- Keep only visuals the document set actually displays.
- If a source visual changes, update the local copy intentionally and review its wording against the current evidence boundary.
- Visuals show object relationships, independent axes, converging flows, dual ledgers, durability timing, eligibility gates, protection-gap timelines, load-handoff timelines, layered caller ownership with its exits, wait queues, progress loops, replacement lifetimes/quantities, or zone-dependent reuse; prose and source exercises own line anchors and catalogs.
- Advanced pages display a visual when a mechanism's state transitions or ownership relationships are materially harder to follow in prose, whether a reader question exposed that or an authoring pass did; the visual still belongs to the root asset seam and to exactly one owning page.

## Writing rules

- Lead each page or section with the maintainer problem it solves.
- Explain the concept before the CUBRID symbol.
- Prefer continuous prose, compact tables, and task-oriented checklists.
- Use a visual only when relationships or state transitions are materially harder to understand in prose.
- Keep exhaustive API inventories and experiment logs in linked Evidence references. Maintain the selected Canonical Question bank under `questions/`; keep historical banks as linked migration evidence.
- Treat `questions/README.md` as the sole Question-bank route selector. Core is the expected retrieval route; Advanced, Maintenance scenarios, and Applied exercises are optional and task-selected.
- Keep prompts and answers on companion pages joined by immutable `PGBUF-QB-*` IDs. Migration provenance belongs only in `questions/migration-audit.md`.
- Use `Module`, `Interface`, `Implementation`, and `seam` consistently with `CONTEXT.md`.
- Use one Predict–Locate–Explain Understanding check and an adjacent evidence-aware model answer on each Learning page.
- Remove presentation timing, speaker notes, slide language, audience-performance prompts, and day-by-day calendar framing. Retain the confirmed guide-entry duration expectations.

## Reader question intake loop

Reader questions recorded against a draft (for example `questions-b4179ee/questions.md`) are Reader question intake: keep the file unedited and digest-pinned in `maintainer-guide-validation.json`. Name the directory after the commit the reader read (`questions-<commit>/`), and give it an `AGENTS.md` that says who recorded it; a pass recorded by an agent standing in for the reader must say so. Each new intake becomes one source population in `questions/migration-audit.md` and in `scripts/question-bank-contract.mjs`. Handle each question twice.

1. Give it a Question disposition in `questions/migration-audit.md` that maps to a Canonical question with an evidence-aware answer.
2. Ask what made the reader stumble in the Canonical explanation itself. An undefined term (DWB, load owner, provisional BCB, page header identity), a label in a visual, or a mechanism deferred without a summary is a guide defect. Fix it on the owning page, add or reword a visual only when the state transitions are materially harder in prose, and link the page's Related routes to the Canonical questions that rehearse the point.

The Question bank answers the question; the Learning or Advanced page removes the reason it was asked.

## Updating to another CUBRID revision

1. Record the new commit.
2. Diff `page_buffer.h` and every source-map region cited by the guide.
3. Recheck representative heap, B-tree, file, recovery, checkpoint, and boot callers.
4. Re-run known-hazard symbol and control-flow searches.
5. Regenerate line anchors.
6. Keep old runtime counts historical unless the exact harness is rerun.
7. Update the uncertainty registry before strengthening any claim.
8. Re-run the complete document-set validation.

## Validation contract

Validation exposes one aggregate entry point and discovers the Guide entry plus every Markdown page under `learning/`, `playbooks/`, `advanced/`, `reference/`, and `questions/`. The discovered page set is the one source of truth for lower-level checks.

Run `node scripts/check-maintainer-guide.mjs` from this directory for deterministic source validation. When this directory is mounted at the Copyparty URL root, add `--copyparty-url <base-url>` to request the complete discovered page/asset set and run live-DOM checks when Playwright is available. `UNAVAILABLE` reports a gate that was not run; it is not evidence that the gate passed.

`maintainer-guide-validation.json` contains no legacy-language exemptions after the English cutover. Any future exception must be explicit, digest-pinned, temporary, and removed with the migration that retires its target.

The aggregate validation must:

1. run the Copyparty Markdown checker on every discovered page;
2. resolve every relative link, including linked Evidence references outside this directory;
3. require every displayed SVG to resolve inside `assets/`, exist, contain a `viewBox`, and contain no active content;
4. reject SVGs that no document-set page displays;
5. detect unintended Korean prose in authored Markdown and SVG text;
6. request every page and displayed SVG through the local Copyparty server;
7. when browser automation is available, require nonzero image natural dimensions and no relevant render error;
8. report live-DOM validation as unavailable when browser automation cannot run.

Question-bank validation additionally enforces the approved ten-page topology, prompt/answer schemas and pairing, globally unique Canonical IDs, complete source-population dispositions, preserved Reader-intake digest, and contextual route links from every Learning, Advanced, and playbook page.

## Bilingual teaching HTML

ADR 0002 continues to govern the canonical Markdown maintainer guide. ADR 0004 separately governs the interactive teaching HTML:

- `en/` contains the canonical 47-page HTML course and `ko/` contains a structurally paired natural-Korean translation.
- Root `index.html` is a language selector. Every paired page links directly to its counterpart with a visible `EN | KO` control.
- Korean prose keeps established database/CUBRID jargon, evidence labels, code, and source identifiers in English. It translates meaning naturally rather than mirroring English sentence structure.
- CSS, language-neutral JavaScript behavior, and English SVGs stay in the root `assets/` seam. Reader-facing interaction messages are supplied by fingerprinted language content rather than hard-coded in shared behavior scripts.
- `teaching-pages.json` owns page pairing and review receipts. The bilingual aggregate checker owns inventory, topology, local links/assets, technical invariants, language/accessibility, interaction behavior, and available served-DOM gates.
- Former `lessons/*.html` and `reference/*.html` locations are temporary English redirects; canonical Markdown under `reference/` does not move.

Run the bilingual gates with:

```sh
node --test scripts/check-bilingual-teaching-site.test.mjs
node scripts/check-bilingual-teaching-site.mjs
node scripts/check-bilingual-teaching-site.mjs --copyparty-url <base-url>
```

The final command adds served-resource checks. HTTP or live-DOM output marked `UNAVAILABLE` is a disclosure, not a pass. `--print-fingerprints` prints the exact normalized EN/KO fingerprints for a Korean-capable reviewer to record; automation must not write or claim the review receipt.

## Retired presentation material

The previous 52-minute narrative and 55-question appendix remain available as source material at
[`CUBRID_PAGE_BUFFER_PRESENTATION_KO.md`](../../pgbuf-analysis/f799e05_claude/CUBRID_PAGE_BUFFER_PRESENTATION_KO.md).
Do not merge that deck back into the maintainer guide wholesale. Pull only evidence or explanations that directly help a maintainer locate, change, debug, or verify the Module.

## Monolith migration audit

The stable entry was cut over only after each former section had a complete canonical destination. This table is the durable disposition record; retired wording remains available in Git history.

| Former content | Final disposition |
|---|---|
| Opening and 14-section contents | Rewritten as the compact guide entry, reader outcomes, evidence legend, and intent routes |
| Start here | Successful-fix contract moved to Core page 1; evidence vocabulary moved to the guide entry |
| Module, Interface, and seams | Boundary model condensed in Core page 1; seam audit moved to the change playbook; families moved to the source map |
| Source-tree orientation | Bounded traces distributed through learning exercises; broad ranges and callers moved to the source map |
| Core object and state model | Rewritten in Core page 1 before pool topology |
| Acquisition Interface | Normal contract moved to Core page 2; fast and unusual paths moved to advanced acquisition |
| Ownership and concurrency | Ledgers and pointer lifetime moved to Core page 2; promotion, queues, and ordered access moved to advanced acquisition |
| Mutation, durability, and replacement | Split among Core pages 3, 4, and 5 |
| Maintainer invariants | Introduced in their canonical learning pages and indexed compactly in the invariant reference |
| How to change safely | Consolidated in the change playbook |
| Debugging playbooks | Consolidated in the symptom playbook with links to canonical explanations |
| Verification strategy | Consolidated in the verification playbook; bounded observations remain in evidence cards and references |
| Known hazards and evidence boundaries | Proof method moved to the advanced failure page; copied statuses removed in favor of registry IDs |
| First-week maintainer path | Calendar framing removed; practice embedded in learning checks, capstone, and duration guidance in the entry |
| Compact glossary | Page-buffer objects taught in Core page 1; durable authoring terms retained in `CONTEXT.md` |
| Deep references | Flat list replaced by intent routes and the source map |
| Symptom-to-source index | Owned by the symptom playbook and source map |
| Before you close an issue | Owned by the change and verification playbooks plus the capstone rubric |
| Legacy pool, latch, and WAL-flush visuals | Useful relationships absorbed by the canonical English visuals (six at cutover; three more added from Reader question intake; five more added by the Learning-path visual pass; seven more added by the Advanced visual pass; two replacement-quantity/reuse visuals added from the quantitative reader follow-up; two private-domain/final-unfix visuals added from the next replacement follow-up); obsolete files and language exemptions removed |

Exhaustive catalogs, raw receipts, historical question banks, and full comparison material remain linked evidence. No parallel legacy monolith is maintained.
