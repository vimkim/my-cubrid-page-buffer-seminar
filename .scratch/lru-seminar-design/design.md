# LRU worked-example design

Status: confirmed by the user on 2026-09-29 after acceptance of Q1–Q10.

Decision record: [interview](interview.md). Work item: 210.

## Purpose and product

Add one English/Korean worked-example page to the existing audience-facing seminar. It follows a continuous page journey through CUBRID replacement policy, with explicit branches for alternative concurrent schedules. Existing replacement lectures and the final technical defense link to relevant checkpoints through stable anchors. The complete example is independently readable.

The priority is transition prediction, leading into policy rationale, source tracing, safety/progress reasoning, and change defense. Preserve the accepted curriculum, canonical English ownership, Korean live experience, existing URLs, source/evidence ownership, and human language-review requirements. The separate simulator project is not a dependency.

## Example and teaching sequence

Use a source-derived, constructed snapshot of a valid larger pool at CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912. Show a few named frames plus the exact relevant list counts, boundaries, quotas, and metadata. Derive numerical choices from the pinned implementation; validate the consistency of omitted pool state. A constructed snapshot is not a captured runtime observation.

The workload combines repeated access to a small working set, a competing sequential scan, and a second context accessing one of the same pages. Maintain stable BCB/frame names and distinguish them from changing VPIDs and execution contexts.

The proposed authoring sequence, adjustable where source dependencies require it, is:

1. Briefly establish textbook LRU as a comparison and introduce the starting state.
2. Follow acquisition and final unfix into the relevant admission branch.
3. Show repeated accesses, including events that do not move a resident BCB.
4. Derive threshold-driven demotion and later reuse/promotion from explicit state.
5. Continue through another context's access and private/shared migration; explain quota/activity inputs and list selection using the same state.
6. Evaluate candidates and follow protected detach, old-identity removal, and rebinding.
7. Branch from identified checkpoints into dirty/re-dirty, flushing, direct-victim reservation, reacquisition, revocation, and retry. Do not concatenate incompatible alternatives into one history.
8. Revisit the workload under the proposed policy change and defend or reject it.

At each major transition, show the before state, event, prediction question, revealed after state, causal explanation, and short exact pinned-source excerpt. Identify the controlling predicate, changed fields, and synchronization. Link deeper code and canonical explanations; keep surrounding detail expandable.

## Presentation and exercise

Provide deliberate forward/backward stepping and predict/reveal interactions for the fixed trace. Preserve a complete readable trace and native answer disclosures without JavaScript. Reuse existing presentation controls and accessible styles where practical. Any branch switch must state its starting checkpoint so it cannot silently carry state from another branch.

The final exercise evaluates: "Promote every resident hit immediately to LRU1." Precisely define the hypothetical trigger and synchronization before comparing traces. Participants explain changed movement, interactions with private/shared policy, invariants, costs, counterexamples, and measurements required to support a performance claim. The exercise authorizes no engine modification and presupposes no improvement.

## Evidence and completion criteria

- Every constructed transition has enough initial state to predict its result and a checked route through pinned source. Consecutive snapshots and branch entry states agree; represented counts and list boundaries are internally consistent.
- Preserve separate meanings for list-event age, quota-adjustment epoch, and hot-fix history. Keep replacement preference separate from protected reuse eligibility.
- Cover ordinary no-movement events, final-unfix conditions, zone changes, cross-context behavior, candidate rejection, successful rebinding, and progress/revocation branches.
- Keep AOUT dormant in the active baseline and retain uncertainty-registry qualifications. Constructed traces establish neither runtime timing nor fairness nor measured performance.
- Include prediction answers and a policy-defense rubric requiring a before/after argument, source justification, invariants, and verification plan. Human review of participant reasoning supplies learning evidence; the site stores no scores or completion claims.
- Pair English and Korean content and update affected navigation, manifest, curriculum coverage, and presenter guidance. Preserve one canonical explanation per concept and existing source/evidence ownership.
- Run the maintainer-guide and bilingual-site aggregate checks, relevant tests, served-resource checks, and available browser checks for projection, reading, keyboard use, disclosures, branch navigation, and no-JavaScript access. Report unavailable gates explicitly.
- Changed/new bilingual pages require honest human semantic and Korean-naturalness review against current fingerprints under the existing policy; automated checks do not satisfy that gate.

New native experiments are not a delivery prerequisite for this enhancement. This does not remove existing applied-work requirements elsewhere in the curriculum. Numerical setup, exact snippets, file naming, and focused implementation checks are authoring tasks, to be resolved using source evidence and the existing site architecture.

## Next phase

After final shared-understanding confirmation, turn this design into a buildable specification and dependency-ordered implementation tasks. Keep the source-checked trace as the foundation for presentation work and bilingual adaptation.
