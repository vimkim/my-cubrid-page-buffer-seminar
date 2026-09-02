# Define translation review and drift workflow

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

After the initial migration, what event marks a Korean counterpart stale, who or what clears that state, and what evidence is required before parity validation passes again? The recommended starting point is manifest-tracked source fingerprints with an explicit Korean review state, where any material English-content change invalidates the paired review until the Korean page is updated and checked against the translation contract.

## Answer

Make translation currency a verifiable property of an exact reviewed EN/KO pair, not a promise inferred from matching filenames. Each manifest entry records the paired paths, an explicit review state, review-relevant fingerprints for both files, and a review receipt containing the review date and reviewer identity.

The aggregate checker computes each fingerprint from a normalized, review-relevant page projection. That projection includes visible and accessibility prose, titles and search metadata, technical identifiers and evidence anchors, semantic heading/list/table structure, exercise configuration and answer values, and any language-bearing local dependency. It ignores nonsemantic serialization differences such as indentation, insignificant whitespace, and attribute order. Structural and behavior gates from decision 06 still catch changes excluded from the review fingerprint.

Apply this workflow:

1. A pair is `current` only when its state is `reviewed`, both stored fingerprints match the current projections, and the technical parity gates pass.
2. A review-relevant change to either the canonical English page, the Korean page, or a language-bearing dependency makes the pair `stale` automatically. A manually written `reviewed` state cannot override a fingerprint mismatch.
3. Shared behavior scripts must not retain hard-coded reader-facing English. Move those messages to paired, fingerprinted page data or another explicitly paired language resource while keeping common interaction logic language-neutral.
4. To clear staleness, update the Korean counterpart as needed, run automated parity checks, and have a Korean-capable human review the exact pair against decision 05: natural Korean, English jargon, unchanged claims/evidence, equivalent exercise behavior, and localized accessibility text.
5. The reviewer then refreshes both fingerprints and the review receipt in the same change. Automation verifies the receipt but never creates it or claims linguistic approval. The translator may also be the recorded reviewer, although independent review is preferred for substantial semantic changes.
6. Work-in-progress may contain stale pairs, but the complete migration, release/cutover commit, and later publishable mainline state must have all 41 entries current. Validation reports every stale path rather than only a total.

The initial Korean migration follows the same process; copying or generating files does not bootstrap them as reviewed.
