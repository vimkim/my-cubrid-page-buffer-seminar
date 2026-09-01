#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guideRoot = path.resolve(scriptDir, "..");
const guidePath = path.join(guideRoot, "page-buffer-teaching-material.md");

async function guide() {
  return readFile(guidePath, "utf8");
}

test("the stable entry identifies its reader, outcomes, duration, and revision boundary", async () => {
  const markdown = await guide();

  assert.match(markdown, /senior C\/C\+\+ systems engineer/i);
  assert.match(markdown, /## Core completion outcomes/);
  assert.match(markdown, /## Advanced completion outcomes/);
  assert.match(markdown, /half-day Core/i);
  assert.match(markdown, /one-to-two-day Applied path/i);
  assert.match(markdown, /first-week Advanced/i);
  assert.match(markdown, /f799e05d77d5300c6ea5753b4a6cc7caee6d8912/);
  assert.match(markdown, /another revision.*revalidate/i);
});

test("the entry defines all six evidence labels", async () => {
  const markdown = await guide();
  for (const label of [
    "Interface contract",
    "Verified mechanism",
    "Implementation policy",
    "Inference",
    "Runtime observation",
    "Historical evidence",
  ]) {
    assert.match(markdown, new RegExp(`\\*\\*${label}:?\\*\\*`), label);
  }
});

test("all reader routes resolve from the entry", async () => {
  const markdown = await guide();
  const routes = {
    "Learn the module": "./learning/01-contract-and-objects.md",
    "Work on a change": "./playbooks/change-safely.md",
    "Diagnose a symptom": "./playbooks/debug-by-symptom.md",
    "Verify a change": "./playbooks/verify-a-change.md",
    "Find the source": "./reference/source-map.md",
    "Source inventory": "./source-inventory.md",
    "Evidence and uncertainty registry":
      "./unresolved-or-version-sensitive-findings.md",
  };

  for (const [label, target] of Object.entries(routes)) {
    assert.ok(markdown.includes(`[${label}](${target})`), `${label} -> ${target}`);
  }
  for (const target of [
    "./advanced/acquisition-concurrency.md",
    "./advanced/replacement-progress.md",
    "./advanced/recovery-and-lifecycle.md",
    "./advanced/specialized-interfaces.md",
    "./advanced/failure-and-proof-obligations.md",
  ]) {
    assert.ok(markdown.includes(`](${target})`), `Advanced -> ${target}`);
  }
});

test("the entry is a route selector rather than a retained tutorial", async () => {
  const markdown = await guide();

  assert.doesNotMatch(markdown, /> \*\*Shell status:\*\*/);
  assert.doesNotMatch(markdown, /^## Contents$/m);
  assert.doesNotMatch(markdown, /^## \d+\./m);
  assert.doesNotMatch(markdown, /First-week maintainer path/i);
  assert.doesNotMatch(markdown, /Known hazards and evidence boundaries/i);
  assert.doesNotMatch(markdown, /Symptom-to-source index/i);
  assert.ok(markdown.split(/\r?\n/).length < 180, "entry should stay compact");
});
