# CUBRID page-buffer seminar

This repository contains the bilingual audience-facing seminar, the English Maintainer Guide, and the evidence and authoring records that support them. Technical claims remain pinned to CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` unless explicitly labeled otherwise.

- Open [the seminar](index.html), or go directly to [Korean](ko/index.html) or [English](en/index.html).
- Read the [Maintainer Guide](page-buffer-teaching-material.md) for source-oriented maintenance work.
- Consult the [source inventory](source-inventory.md), [uncertainty registry](unresolved-or-version-sensitive-findings.md), and [migration record](docs/migration/README.md) for evidence boundaries.

Page buffer is independently versioned. The user will later add this repository as the `page-buffer` submodule of the multi-topic `my-cubrid-seminar` collection.

## Authoring and checks

Read [AGENTS.md](AGENTS.md), [seminar authoring notes](NOTES.md), and [guide authoring notes](maintainer-guide-notes.md) before editing. Existing personal validation dependencies remain intentional: Node.js, Python, the configured Copyparty Markdown checker, Copyparty, and Playwright with Chromium for browser checks. The checker supports `COPYPARTY_MARKDOWN_CHECKER`; browser checks support `PLAYWRIGHT_MODULE`.

Serve this repository at a Copyparty URL root with the configured Markdown renderer. The browser-test default is `http://127.0.0.1:3935`; set `SEMINAR_URL` to use another URL.

```sh
node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3935
node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3935
SEMINAR_URL=http://127.0.0.1:3935 node --test scripts/*.test.mjs
```

The bilingual aggregate includes a human-review gate. Missing Korean-naturalness or semantic-parity receipts remain open; automated checks and the repository migration do not supply those receipts.
