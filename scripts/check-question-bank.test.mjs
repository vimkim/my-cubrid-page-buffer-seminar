#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  questionPagePaths,
  validateQuestionBank,
} from "./question-bank-contract.mjs";

async function write(root, relativePath, contents) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
  return destination;
}

function prompt(id = "PGBUF-QB-001", title = "Trace one fix") {
  return [
    `### ${id} — ${title}`,
    "",
    "- **Route:** Core",
    "- **Retrieval mode:** Trace",
    "- **Prerequisite:** [Contract](../learning/contract.md)",
    "- **Capability tested:** Produce one source trace.",
    "- **Inspect:** `src/storage/page_buffer.c:2260-2685`",
    "",
    "**Question:** Where do hit and miss converge?",
    "",
  ].join("\n");
}

function answer(id = "PGBUF-QB-001", title = "Trace one fix") {
  return [
    `### ${id} — ${title}`,
    "",
    "- **Evidence:** Verified mechanism",
    "- **Canonical guide:** [Contract](../learning/contract.md)",
    "- **Source anchors:** `src/storage/page_buffer.c:2260-2685`",
    "- **Confidence/limit:** Establishes the pinned path, not every caller.",
    `- **Prompt:** [Attempt this question](./core.md#${id.toLowerCase()}-trace-one-fix)`,
    "",
    "**Model answer:** Both paths return only after identity and ownership converge.",
    "",
    "**Why:** Preparation differs, while the successful contract is shared.",
    "",
  ].join("\n");
}

function migrationRows() {
  const counts = {
    TEACH: 38,
    ADV: 55,
    HIST: 24,
    PLAN: 27,
    EXEC: 17,
    GRILL: 12,
    READER: 16,
    READER2: 7,
  };
  const rows = [];
  for (const [source, count] of Object.entries(counts)) {
    for (let index = 1; index <= count; index += 1) {
      const legacy =
        source === "ADV"
          ? `PGBUF-Q${String(index).padStart(3, "0")}`
          : `${source}-${String(index).padStart(2, "0")}`;
      const retained = source === "TEACH" && index === 1;
      const reader = source.startsWith("READER");
      rows.push(
        `| \`${source}\` | \`${legacy}\` | Topic ${index} | ${
          retained ? "Retained" : reader ? "Merged" : "Excluded"
        } | ${retained || reader ? "PGBUF-QB-001" : "—"} | Fixture rationale |`,
      );
    }
  }
  return rows.join("\n");
}

async function createCompleteFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "question-bank-contract-"));
  const contents = {
    "questions/README.md": "# Question bank\n",
    "questions/core.md": `# Core prompts\n\n${prompt()}`,
    "questions/core-answers.md": `# Core answers\n\n${answer()}`,
    "questions/advanced.md": "# Advanced prompts\n",
    "questions/advanced-answers.md": "# Advanced answers\n",
    "questions/maintenance-scenarios.md": "# Maintenance scenarios\n",
    "questions/maintenance-scenarios-answers.md": "# Maintenance answers\n",
    "questions/applied-exercises.md": "# Applied exercises\n",
    "questions/applied-exercises-answers.md": "# Applied answers\n",
    "questions/migration-audit.md": [
      "# Migration audit",
      "",
      "**Migration status:** Complete",
      "",
      "| Source set | Input | Expected items |",
      "|---|---|---:|",
      "| `TEACH` | [Source](../legacy.md) | 38 |",
      "",
      "| Source set | Legacy item | Short topic | Disposition | Canonical destination | Rationale/evidence action |",
      "|---|---|---|---|---|---|",
      migrationRows(),
      "",
    ].join("\n"),
    "page-buffer-teaching-material.md": "# Entry\n\n[Questions](./questions/README.md)\n",
    "learning/contract.md": "# Contract\n\n[Practice](../questions/core.md#practice)\n",
    "advanced/concurrency.md": "# Concurrency\n\n[Practice](../questions/advanced.md#practice)\n",
    "playbooks/change.md": "# Change\n\n[Practice](../questions/maintenance-scenarios.md#practice)\n",
  };
  const pageMarkdown = new Map();
  for (const [relativePath, markdown] of Object.entries(contents)) {
    const destination = await write(root, relativePath, markdown);
    pageMarkdown.set(destination, markdown);
  }
  return { root, pageMarkdown };
}

test("the approved Question-bank topology and complete contract validate", async () => {
  const { root, pageMarkdown } = await createCompleteFixture();
  const failures = [];

  validateQuestionBank(root, pageMarkdown, {}, failures);

  assert.deepEqual(failures, []);
  assert.equal(questionPagePaths.length, 10);
});

test("prompt and answer schema, pairing, and global IDs are enforced", async () => {
  const { root, pageMarkdown } = await createCompleteFixture();
  const advancedPath = path.join(root, "questions/advanced.md");
  const advancedAnswerPath = path.join(root, "questions/advanced-answers.md");
  const malformed = prompt().replace("- **Capability tested:** Produce one source trace.\n", "");
  await writeFile(advancedPath, `# Advanced prompts\n\n${malformed}`, "utf8");
  await writeFile(advancedAnswerPath, `# Advanced answers\n\n${answer()}`, "utf8");
  pageMarkdown.set(advancedPath, await readFile(advancedPath, "utf8"));
  pageMarkdown.set(advancedAnswerPath, await readFile(advancedAnswerPath, "utf8"));
  const failures = [];

  validateQuestionBank(root, pageMarkdown, {}, failures);

  assert.ok(failures.some((failure) => failure.includes("missing Capability tested")));
  assert.ok(failures.some((failure) => failure.includes("duplicate canonical ID")));
});

test("each answer must link its own exact prompt anchor", async () => {
  const { root, pageMarkdown } = await createCompleteFixture();
  const answerPath = path.join(root, "questions/core-answers.md");
  const wrongAnchor = (await readFile(answerPath, "utf8")).replace(
    "#pgbuf-qb-001-trace-one-fix",
    "#another-valid-prompt",
  );
  await writeFile(answerPath, wrongAnchor, "utf8");
  pageMarkdown.set(answerPath, wrongAnchor);
  const failures = [];

  validateQuestionBank(root, pageMarkdown, {}, failures);

  assert.ok(
    failures.some((failure) =>
      failure.includes("PGBUF-QB-001 does not link its exact prompt anchor"),
    ),
  );
});

test("the complete migration audit enforces source populations", async () => {
  const { root, pageMarkdown } = await createCompleteFixture();
  const auditPath = path.join(root, "questions/migration-audit.md");
  const audit = (await readFile(auditPath, "utf8")).replace(
    /^\| `READER` \| `READER-16` .*\n/m,
    "",
  );
  await writeFile(auditPath, audit, "utf8");
  pageMarkdown.set(auditPath, audit);
  const failures = [];

  validateQuestionBank(root, pageMarkdown, {}, failures);

  assert.ok(
    failures.some((failure) => failure.includes("READER population is 15, expected 16")),
  );
});

test("the complete migration audit enforces stable legacy identities", async () => {
  const { root, pageMarkdown } = await createCompleteFixture();
  const auditPath = path.join(root, "questions/migration-audit.md");
  const audit = (await readFile(auditPath, "utf8")).replace(
    "`PGBUF-Q055`",
    "`ADV-55`",
  );
  await writeFile(auditPath, audit, "utf8");
  pageMarkdown.set(auditPath, audit);
  const failures = [];

  validateQuestionBank(root, pageMarkdown, {}, failures);

  assert.ok(
    failures.some((failure) => failure.includes("unexpected legacy item ADV:ADV-55")),
  );
  assert.ok(
    failures.some((failure) => failure.includes("missing legacy item ADV:PGBUF-Q055")),
  );
});

test("Reader question intake is digest-pinned", async () => {
  const { root, pageMarkdown } = await createCompleteFixture();
  await write(root, "questions-b4179ee/questions.md", "Reader questions\n");
  const failures = [];

  validateQuestionBank(
    root,
    pageMarkdown,
    {
      readerQuestionIntakeSha256: {
        "questions-b4179ee/questions.md": "0".repeat(64),
      },
    },
    failures,
  );

  assert.ok(failures.some((failure) => failure.includes("intake digest changed")));
});
