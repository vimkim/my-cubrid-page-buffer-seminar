#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { canonicalVisualOwners } from "./canonical-visuals.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guideRoot = path.resolve(scriptDir, "..");
const evidenceLabels = [
  "Interface contract",
  "Verified mechanism",
  "Implementation policy",
  "Inference",
  "Runtime observation",
  "Historical evidence",
];

async function discoveredGuidePages() {
  const pages = ["page-buffer-teaching-material.md"];
  for (const directory of ["learning", "playbooks", "advanced", "reference"]) {
    for (const entry of await readdir(path.join(guideRoot, directory))) {
      if (entry.endsWith(".md")) pages.push(`${directory}/${entry}`);
    }
  }
  return pages.sort();
}

test("all six Core pages contain one Predict-Locate-Explain check and a model answer", async () => {
  const files = (await readdir(path.join(guideRoot, "learning")))
    .filter((entry) => entry.endsWith(".md"))
    .sort();
  assert.equal(files.length, 6);

  for (const file of files) {
    const markdown = await readFile(path.join(guideRoot, "learning", file), "utf8");
    assert.equal((markdown.match(/^## Understanding check:/gm) ?? []).length, 1, file);
    for (const heading of ["Predict", "Locate", "Explain", "Model answer"]) {
      assert.match(markdown, new RegExp(`^### ${heading}`, "m"), `${file}: ${heading}`);
    }
  }
});

test("runtime and historical evidence retain their boundaries", async () => {
  const flush = await readFile(
    path.join(guideRoot, "learning/04-flush-one-generation.md"),
    "utf8",
  );
  for (const field of [
    "Setup",
    "Observation",
    "Supported conclusion",
    "Unsupported conclusion",
    "Receipt",
  ]) {
    assert.ok(flush.includes(`**${field}:**`), field);
  }
  assert.match(flush, /\*\*Setup:\*\* \*\*Revision\/build\/configuration\/workload:\*\*/i);
  assert.match(flush, /f799e05d77d5300c6ea5753b4a6cc7caee6d8912/);
  assert.match(flush, /debug build/i);
  assert.match(flush, /ca_pgbuf_f799e05/);

  const proof = await readFile(
    path.join(guideRoot, "advanced/failure-and-proof-obligations.md"),
    "utf8",
  );
  assert.match(proof, /Historical findings are revision-bound/i);
  assert.match(proof, /does not create a current ticket/i);
});

test("every page declares canonical evidence labels and avoids deprecated vocabulary", async () => {
  for (const relativePath of await discoveredGuidePages()) {
    const markdown = await readFile(path.join(guideRoot, relativePath), "utf8");
    const evidenceLine = markdown.match(/^\*\*Evidence used:\*\* (.+)$/m)?.[1] ?? "";
    assert.ok(
      evidenceLabels.some((label) => evidenceLine.includes(label)),
      `${relativePath}: evidence label`,
    );
    assert.doesNotMatch(markdown, /\bruntime proof\b/i, relativePath);
    assert.doesNotMatch(markdown, /\*\*Interface invariant:\*\*/i, relativePath);
  }
});

test("every canonical visual exposes text-labelled accessible relationships on its owning page", async () => {
  const owners = canonicalVisualOwners;

  for (const [asset, owner] of Object.entries(owners)) {
    const [svg, markdown] = await Promise.all([
      readFile(path.join(guideRoot, "assets", asset), "utf8"),
      readFile(path.join(guideRoot, owner), "utf8"),
    ]);
    assert.match(svg, /<svg\b[^>]*role="img"[^>]*aria-labelledby=/i, asset);
    assert.match(svg, /<title\b[^>]*>[^<]{10,}<\/title>/i, asset);
    assert.match(svg, /<desc\b[^>]*>[^<]{20,}<\/desc>/i, asset);
    assert.match(svg, /<text\b/i, `${asset}: text-labelled meaning`);
    assert.match(
      markdown,
      new RegExp(`!\\[[^\\]]{12,}\\]\\(\\.\\./assets/${asset.replace(".", "\\.")}\\)`),
      `${owner} -> ${asset}`,
    );
  }
});

test("organization-facing verification uses standard project concepts", async () => {
  const verification = await readFile(
    path.join(guideRoot, "playbooks/verify-a-change.md"),
    "utf8",
  );
  assert.match(verification, /CMake/);
  assert.match(verification, /`ctest`/);
  assert.match(verification, /project-provided test/i);

  const guideMarkdown = [];
  for (const directory of ["learning", "playbooks", "advanced", "reference"]) {
    for (const entry of await readdir(path.join(guideRoot, directory))) {
      if (entry.endsWith(".md")) {
        guideMarkdown.push(
          await readFile(path.join(guideRoot, directory, entry), "utf8"),
        );
      }
    }
  }
  assert.doesNotMatch(
    verification + guideMarkdown.join("\n"),
    /`just(?:\s+[^`]+)?`|\bjustfile\b/i,
  );
});

test("the completion report records deterministic, HTTP, DOM, migration, and scope gates", async () => {
  const report = await readFile(
    path.join(guideRoot, "docs/completion-report.md"),
    "utf8",
  );
  for (const expected of [
    "node --test scripts/*.test.mjs",
    "node scripts/check-maintainer-guide.mjs",
    "--copyparty-url http://127.0.0.1:39497/",
    "27 pages",
    "9 displayed",
    "36 resources",
    "Playwright is not installed",
    "Migration audit",
    "be16718",
    "b4179ee",
    "74 immutable paired Canonical IDs",
    "189 verified source items",
    "Standards: PASS",
    "Spec: PASS",
    "No CUBRID engine build",
  ]) {
    assert.match(report, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
