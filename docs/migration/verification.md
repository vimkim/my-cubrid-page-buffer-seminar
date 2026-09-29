# Migration verification

Verified on 2026-09-29 against the extracted baseline `4bb23b1` and the migration changes. Source provenance is `my-cubrid-docs@d84433fded947507f51b01cad99174f29744ba93`.

## Preserved content

- All 385 tracked topic files are present; the [topic-file manifest](topic-file-manifest.json) records source and migrated digests.
- All 154 topic HTML files and `teaching-pages.json` are byte-identical to the extracted baseline. Human-review receipts were not manufactured or refreshed.
- The extraction retains 96 commits, including relevant merge structure and the confirmed migration design. The [commit map](history-commit-map.txt) preserves correspondence to original commit identities.
- All 318 imported evidence files are accounted for by the [evidence manifest](evidence-manifest.json), distinguishing 151 tracked files from 167 locally ignored runtime snapshots.

## Automated results

| Check | Result |
| --- | --- |
| Maintainer aggregate source checks | PASS: 43 pages, relative links, English prose, 60 displayed SVGs, no orphan SVGs |
| Maintainer served checks | PASS: 103 HTTP resources, 43 live-DOM pages |
| Bilingual audience, inventory, navigation, links, technical parity, language/accessibility, static behavior | PASS: 51 pairs per gate |
| Bilingual served checks | PASS: 253 HTTP resources, 103 live-DOM pages |
| Complete Node test suite | PASS: 188 tests, zero failures or skips |
| Topic and imported-evidence local file links | PASS: resolved local targets remain inside the topic repository |
| Imported-evidence HTTP | PASS: all 318 files requested successfully |
| Fresh GitHub clone | PASS: all 385 topic and 318 evidence hashes match the published import manifests |

Served checks used a Copyparty root at `http://127.0.0.1:3935` with the existing Markdown renderer and the configured Playwright override. Tests exercised desktop and mobile navigation, presentation controls, disclosures, and reading with JavaScript disabled. These results establish document behavior, not a rerun of historical CUBRID experiments.

The complete test run exposed three stale assertions also reproducible in the source repository: the `file_manager.c` range, the reference-page inventory, and the Lecture 12B titles. Their expectations were aligned with existing documents; no lecture wording or source claim changed. The source-baseline reproduction and final run are retained under [logs](logs/).

## Human-review gap carried forward

The bilingual aggregate remains nonzero because its human-review gate reports 153 existing findings: one missing review receipt and two fingerprint findings for each of 51 page pairs. Comparing the complete failure set before and after migration found zero introduced findings. Work item 55 retains this separate review obligation. Passing technical migration checks does not establish human Korean-naturalness or semantic-parity acceptance.

## Publication and retirement

The public [topic repository](https://github.com/vimkim/my-cubrid-page-buffer-seminar) received the verified import at `08dc195a1991debe6d92833d820e223d19a4b101`. A fresh GitHub clone verified every topic and evidence digest before source retirement.

The [source retirement commit](https://github.com/vimkim/my-cubrid-docs/commit/3486b8ca85e681696d02feb3022e44cc47292be2) replaces the old directory with a relocation README and retains the original evidence outside it. The final documentation commit records completion and updates the topic manifest for the completed design record. The parent collection remains untouched.
