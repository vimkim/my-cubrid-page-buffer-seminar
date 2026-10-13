# CUBRID page-buffer seminar

This repository contains the bilingual audience-facing seminar, the English Maintainer Guide, and the evidence and authoring records that support them. Technical claims remain pinned to CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` unless explicitly labeled otherwise.

- Open [the seminar](index.html), or go directly to [Korean](ko/index.html) or [English](en/index.html).
- Read the [Maintainer Guide](page-buffer-teaching-material.md) for source-oriented maintenance work.
- Consult the [source inventory](source-inventory.md), [uncertainty registry](unresolved-or-version-sensitive-findings.md), and [migration record](docs/migration/README.md) for evidence boundaries.

Page buffer is independently versioned. The user will later add this repository as the `page-buffer` submodule of the multi-topic `my-cubrid-seminar` collection.

## Seminar delivery

The live seminar has three sessions: **3 hours + 4 hours + n hours**, with the third and final session's duration flexible.

| Session | Duration | Status |
| --- | --- | --- |
| 1 | 3 hours | Completed |
| 2 | 4 hours | Completed |
| 3 (final) | n hours (flexible) | Remaining |

Together, the first two sessions covered page-buffer basics, Buffer Control Blocks (BCBs), and private/shared LRU organization. The selected remaining session covers page-buffer daemon details. PostgreSQL buffer-management and replacement strategies remain in the broader preparation material.

The delivered sessions and remaining agenda govern current seminar preparation. For the current delivery, the presenter selected **Session 3 chapters 03–07 only**, in that order. Use the [five-chapter Korean speaker script](my-presentation-script-session-3-03-07.html), with all 124 current screens, prerequisite explanations, four daemon data-structure diagrams, and a closing recap after chapter 07. The broader curriculum and Maintainer Guide remain available for deeper study.

The full presentation remains accessible at [Session 3 contents](toc.html), with [Korean detailed contents](ko/seminar-3/toc.html) and [English contents](en/seminar-3/toc.html). Twelve dedicated chapters carry the complete daemon and PostgreSQL argument through the closing defense. The [Session 3 plan](docs/final-session-preparation.md) and [full Korean spoken script](my-presentation-script-session-3.html) remain preparation references.

The earlier seven defense pages remain supporting inputs at their stable URLs. The current presentation owns a dedicated order, 24 retained questions, nine additional defense questions, 25 independent state traces, concrete experiment proposals, and a staged final diagnosis. The [application record](docs/session-3-live-application.md) maps their provenance and exact new anchors.

## Authoring and checks

Read [AGENTS.md](AGENTS.md), [seminar authoring notes](NOTES.md), and [guide authoring notes](maintainer-guide-notes.md) before editing. Existing personal validation dependencies remain intentional: Node.js, Python, the configured Copyparty Markdown checker, Copyparty, and Playwright with Chromium for browser checks. The checker supports `COPYPARTY_MARKDOWN_CHECKER`; browser checks support `PLAYWRIGHT_MODULE`.

Serve this repository at a Copyparty URL root with the configured Markdown renderer. The browser-test default is `http://127.0.0.1:3935`; set `SEMINAR_URL` to use another URL.

```sh
node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3935
node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3935
SEMINAR_URL=http://127.0.0.1:3935 node --test scripts/*.test.mjs
```

The bilingual aggregate includes a human-review gate. Missing Korean-naturalness or semantic-parity receipts remain open; automated checks and the repository migration do not supply those receipts.
