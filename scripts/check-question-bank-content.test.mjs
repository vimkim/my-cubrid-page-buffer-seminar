#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ids(markdown) {
  return [...markdown.matchAll(/^### (PGBUF-QB-[0-9]{3}) —/gm)].map(
    (match) => match[1],
  );
}

test("Core retrieval has thirty paired immutable questions in Learning order", async () => {
  const [prompts, answers] = await Promise.all([
    readFile(path.join(root, "questions/core.md"), "utf8"),
    readFile(path.join(root, "questions/core-answers.md"), "utf8"),
  ]);
  const expected = Array.from(
    { length: 30 },
    (_, index) => `PGBUF-QB-${String(index + 1).padStart(3, "0")}`,
  );

  assert.deepEqual(ids(prompts), expected);
  assert.deepEqual(ids(answers), expected);
  for (const heading of [
    "Contract and objects",
    "Fix, hold, and release",
    "Caller completes correctness",
    "Flush one generation",
    "Replace one frame",
    "Maintainer capstone",
  ]) {
    assert.match(prompts, new RegExp(`^## ${heading}$`, "m"), heading);
    assert.match(answers, new RegExp(`^## ${heading}$`, "m"), heading);
  }
  for (const page of [
    "01-contract-and-objects.md",
    "02-fix-hold-release.md",
    "03-caller-completes-correctness.md",
    "04-flush-one-generation.md",
    "05-replace-one-frame.md",
    "06-maintainer-capstone.md",
  ]) {
    assert.ok(prompts.includes(`../learning/${page}`), page);
  }
});

test("Core retrieval answers the current Reader-intake concepts", async () => {
  const [prompts, answers, audit, intake, configText] = await Promise.all([
    readFile(path.join(root, "questions/core.md"), "utf8"),
    readFile(path.join(root, "questions/core-answers.md"), "utf8"),
    readFile(path.join(root, "questions/migration-audit.md"), "utf8"),
    readFile(path.join(root, "questions-b4179ee/questions.md")),
    readFile(path.join(root, "maintainer-guide-validation.json"), "utf8"),
  ]);
  const combined = `${prompts}\n${answers}`;
  for (const concept of [
    "shared successful-fix postcondition",
    "load owner",
    "provisional BCB",
    "checked more than once",
    "BCB and page-header agreement",
    "per-thread holders",
    "fix debt",
    "DWB-versus-data-volume",
    "victimize",
  ]) {
    assert.match(combined, new RegExp(concept, "i"), concept);
  }

  const readerRows = audit
    .split(/\r?\n/)
    .filter((line) => /^\| `READER` \| `READER-[0-9]{2}` \|/.test(line));
  assert.equal(readerRows.length, 16);
  assert.ok(readerRows.every((line) => /PGBUF-QB-[0-9]{3}/.test(line)));
  const configured = JSON.parse(configText).readerQuestionIntakeSha256[
    "questions-b4179ee/questions.md"
  ];
  assert.equal(createHash("sha256").update(intake).digest("hex"), configured);
});
