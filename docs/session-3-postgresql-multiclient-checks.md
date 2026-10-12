# Session 3: PostgreSQL multi-client question

Research and verification date: 2026-10-13. This change answers the recurring claim that PostgreSQL's simple Clock policy and shared pin count ignore concurrent clients. The [research note](research/postgresql-multiclient-buffers.md) records the primary sources and qualifications; no runtime benchmark was executed.

The task branch is `docs/postgres-multiclient`, based on local `main` at `821198c`. Local integration requires the user's approval. Only documentation, existing HTML and their review fingerprints changed; engine source, shared presentation code and validation code did not change.

## Delivered explanations

Eight screens were added in both languages, preserving every original screen anchor, question and trace snapshot:

| Chapter | New explanation |
| --- | --- |
| [8](../en/seminar-3/08-postgresql-buffers.html#multiclient-faq) | Per-descriptor shared pins versus backend-private nesting; concurrency guards; advisory backend pin budget |
| [9](../en/seminar-3/09-clock-sweep.html#concurrent-clock-hand) | Concurrent allocators, atomic hand and candidate claim; contention remains a measurement question |
| [10](../en/seminar-3/10-strategy-rings.html#ring-other-backend) | Another backend's normal access raises credit and makes a scan ring seek another candidate |
| [11](../en/seminar-3/11-writeback-and-reuse.html#domains-versus-credit) | Explicit CUBRID capacity domains; domain migration versus zone boost; a testable performance comparison |

The paired TOCs, root Session 3 contents, [Korean script](../my-presentation-script-session-3.html) and [preparation plan](final-session-preparation.md) include the new route. The pin-count schedule now explicitly excludes in-progress I/O. Shared reference counts can include an AIO lifetime pin; `pinning_backends` is therefore not always a literal client census.

CUBRID mechanisms remain pinned to `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. Detailed PostgreSQL traces remain pinned to `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`, identified as 20devel. The research separately verifies the central pin, credit and ring mechanisms at PostgreSQL 18.0 without carrying newer locking details into that release.

## Verification

| Check | Result |
| --- | --- |
| Maintainer Guide aggregate, with Copyparty | PASS: 43 Markdown pages, 71 displayed SVGs, no orphaned SVGs, 114 HTTP resources, 43 live-DOM pages |
| Bilingual technical gates | PASS: 78 pairs for inventory, navigation, links/assets, technical parity, language/accessibility, static interactions and audience contract; 27-page Session 3 route |
| Bilingual served gates | PASS: 349 HTTP resources, 158 live-DOM pages |
| Existing Session 3 route and trace tests | PASS: 24 tests, no failures or skips, with headless Chromium |
| New-screen browser checks | PASS: 16 language/screen combinations at 1920×1080; every new section fits within the viewport; 390px and 320px reading without horizontal overflow; no console/page errors |
| Source and link closure | PASS: 91 unique pinned source ranges and 769 local references across the edited chapters, script, preparation plan and research note |
| Author Markdown and diff whitespace | PASS |

Browser tests also cover native disclosure, section controls, counterpart links, the complete TOC-to-closure route, trace independence and no-JavaScript access. Source-range closure checks that a target exists; it is not a mechanical proof of every prose claim. Decisive pin, AIO, ring, hand and CUBRID migration/boost paths were separately read.

The full bilingual aggregate remains nonzero solely for the existing human-review gate: 78 missing Korean review receipts and 112 inherited stale fingerprints. The starting checkout had the same 78 missing receipts and 122 stale fingerprints. This task refreshes the five edited page pairs' normalized fingerprints and leaves their review state pending. Automated parity and browser checks do not supply human translation acceptance or measured performance superiority.
