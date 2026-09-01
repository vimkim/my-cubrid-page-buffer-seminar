#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guideRoot = path.resolve(scriptDir, "..");
const pageDirectories = ["learning", "playbooks", "advanced", "reference"];

async function guidePages() {
  const pages = ["page-buffer-teaching-material.md"];
  for (const directory of pageDirectories) {
    for (const entry of await readdir(path.join(guideRoot, directory))) {
      if (entry.endsWith(".md")) pages.push(`${directory}/${entry}`);
    }
  }
  return Promise.all(
    pages.sort().map(async (relativePath) => ({
      relativePath,
      markdown: await readFile(path.join(guideRoot, relativePath), "utf8"),
    })),
  );
}

test("canonical concepts have one heading owner", async () => {
  const pages = await guidePages();
  const owners = {
    "## Successful fix: the conceptual postcondition":
      "learning/01-contract-and-objects.md",
    "## Borrowed pointers end with ownership":
      "learning/02-fix-hold-release.md",
    "## Representative callers": "reference/source-map.md",
    "## Risk-to-test matrix": "playbooks/verify-a-change.md",
    "## Evidence labels": "page-buffer-teaching-material.md",
  };

  for (const [heading, owner] of Object.entries(owners)) {
    const matches = pages
      .filter(({ markdown }) => markdown.includes(heading))
      .map(({ relativePath }) => relativePath);
    assert.deepEqual(matches, [owner], heading);
  }
});

test("guide pages route VS IDs without copying mutable statuses", async () => {
  for (const { relativePath, markdown } of await guidePages()) {
    assert.doesNotMatch(
      markdown,
      /VS-\d+[\s\S]{0,180}(?:status is \*\*Candidate\*\*|remains \*\*Candidate\*\*|Candidate status|remain `VS-\d+` Candidate)/i,
      relativePath,
    );
  }
});

test("the final asset seam contains and displays exactly six canonical visuals", async () => {
  const expected = [
    "durability-chain.svg",
    "fix-contract.svg",
    "object-ownership-map.svg",
    "ownership-ledgers.svg",
    "state-axes.svg",
    "victim-eligibility.svg",
  ];
  const assets = (await readdir(path.join(guideRoot, "assets")))
    .filter((entry) => entry.endsWith(".svg"))
    .sort();
  assert.deepEqual(assets, expected);

  const combined = (await guidePages()).map(({ markdown }) => markdown).join("\n");
  for (const asset of expected) {
    assert.match(combined, new RegExp(`\\.\\./assets/${asset.replace(".", "\\.")}`));
  }
  for (const retired of ["latch-state.svg", "pool-map.svg", "wal-flush.svg"]) {
    assert.doesNotMatch(combined, new RegExp(retired.replace(".", "\\.")));
  }
});

test("the migration audit records content and asset dispositions", async () => {
  const notes = await readFile(
    path.join(guideRoot, "maintainer-guide-notes.md"),
    "utf8",
  );
  for (const formerContent of [
    "Opening and 14-section contents",
    "Start here",
    "Module, Interface, and seams",
    "Source-tree orientation",
    "Core object and state model",
    "Acquisition Interface",
    "Ownership and concurrency",
    "Mutation, durability, and replacement",
    "Maintainer invariants",
    "How to change safely",
    "Debugging playbooks",
    "Verification strategy",
    "Known hazards and evidence boundaries",
    "First-week maintainer path",
    "Compact glossary",
    "Deep references",
    "Symptom-to-source index",
    "Before you close an issue",
    "Legacy pool, latch, and WAL-flush visuals",
  ]) {
    assert.match(notes, new RegExp(formerContent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
