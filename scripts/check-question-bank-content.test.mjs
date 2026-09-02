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

test("Advanced retrieval has twenty-five paired questions in mechanism order", async () => {
  const [prompts, answers] = await Promise.all([
    readFile(path.join(root, "questions/advanced.md"), "utf8"),
    readFile(path.join(root, "questions/advanced-answers.md"), "utf8"),
  ]);
  const expected = Array.from(
    { length: 25 },
    (_, index) => `PGBUF-QB-${String(index + 31).padStart(3, "0")}`,
  );

  assert.deepEqual(ids(prompts), expected);
  assert.deepEqual(ids(answers), expected);
  for (const heading of [
    "Acquisition concurrency",
    "Replacement progress",
    "Recovery and lifecycle",
    "Specialized interfaces and observability",
    "Failure and proof obligations",
  ]) {
    assert.match(prompts, new RegExp(`^## ${heading}$`, "m"), heading);
    assert.match(answers, new RegExp(`^## ${heading}$`, "m"), heading);
  }
  for (const page of [
    "acquisition-concurrency.md",
    "replacement-progress.md",
    "recovery-and-lifecycle.md",
    "specialized-interfaces.md",
    "failure-and-proof-obligations.md",
  ]) {
    assert.ok(prompts.includes(`../advanced/${page}`), page);
  }
});

test("Maintenance scenarios pair fifteen task packets with status-safe answers", async () => {
  const [prompts, answers] = await Promise.all([
    readFile(path.join(root, "questions/maintenance-scenarios.md"), "utf8"),
    readFile(
      path.join(root, "questions/maintenance-scenarios-answers.md"),
      "utf8",
    ),
  ]);
  const expected = Array.from(
    { length: 15 },
    (_, index) => `PGBUF-QB-${String(index + 56).padStart(3, "0")}`,
  );

  assert.deepEqual(ids(prompts), expected);
  assert.deepEqual(ids(answers), expected);
  for (const heading of [
    "Change safely",
    "Diagnose by symptom",
    "Verify at the risk boundary",
  ]) {
    assert.match(prompts, new RegExp(`^## ${heading}$`, "m"), heading);
    assert.match(answers, new RegExp(`^## ${heading}$`, "m"), heading);
  }
  for (let number = 10; number <= 16; number += 1) {
    assert.match(prompts, new RegExp(`VS-${number}`), `VS-${number}`);
  }
  assert.match(
    answers,
    /The registry owns current status|status remains in the registry/,
  );
});

test("Applied route pairs four cards with exact retained evidence artifacts", async () => {
  const [prompts, answers] = await Promise.all([
    readFile(path.join(root, "questions/applied-exercises.md"), "utf8"),
    readFile(
      path.join(root, "questions/applied-exercises-answers.md"),
      "utf8",
    ),
  ]);
  const expected = [
    "PGBUF-QB-071",
    "PGBUF-QB-072",
    "PGBUF-QB-073",
    "PGBUF-QB-074",
  ];

  assert.deepEqual(ids(prompts), expected);
  assert.deepEqual(ids(answers), expected);
  for (let number = 1; number <= 4; number += 1) {
    const rootPath = `f799e05_codex/quiz/quiz-${number}/`;
    for (const artifact of ["quiz.md", "answer.md", "quiz.sql", "quiz.json"]) {
      assert.ok(answers.includes(`${rootPath}${artifact}`), `${number}/${artifact}`);
    }
    assert.ok(
      answers.includes(`evidence/runs/rebind-quiz${number}/meta.json`),
      `rebind-quiz${number}`,
    );
  }
  assert.doesNotMatch(`${prompts}\n${answers}`, /run-one\.sh|\/home\//);
});
