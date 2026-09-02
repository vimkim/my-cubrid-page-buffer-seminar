# Choose the cutover and rollback sequence

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

How should the repository switch from the current single-language layout to the validated bilingual layout while keeping review, rollback, and history understandable? The recommended starting point is an atomic content cutover after both complete trees and all gates pass, with compatibility stubs governed by ticket 01 and logically separated commits for structure/tooling, English relocation, Korean content, and final navigation/validation integration.

## Answer

Build the migration as logically reviewable changes for validation/tooling, English relocation and navigation, Korean content/localized interaction messages, and final manifest/review receipts. Intermediate work may exist locally, but do not publish the cutover until the root selector, both complete 41-page trees, redirect stubs, and all mandatory gates pass together.

At cutover:

1. Replace root `index.html` with the nonredirecting language selector.
2. Make `en/index.html` and `ko/index.html` the two course entries and install direct counterpart controls on every manifest page.
3. Leave thin redirect stubs at the former `lessons/*` and `reference/*.html` teaching URLs, targeting their canonical English counterparts. Keep them for at least 90 days after the published cutover and remove them only in a separately reviewed cleanup that first proves no repository-owned link still depends on them.
4. Run the bilingual aggregate checker, its test suite, the canonical Markdown aggregate checker and tests, and the available Copyparty/live-DOM gates. Record any unavailable optional environment gate explicitly.
5. Commit the verified migration on the current branch and push only after the final two-axis review has no unresolved material finding.

Rollback is a normal Git revert of the cutover changes, not an in-place script that deletes or reconstructs content. Because the old content remains recoverable in Git and compatibility files are additive, the revert restores the prior single-language entry and paths without inventing a second backup tree.
