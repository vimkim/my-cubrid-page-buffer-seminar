#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../playbooks/debug-by-symptom.md");

test("diagnosis begins with wait and owner classification", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const wait of ["transaction lock", "page latch", "cold-load serialization", "victim pressure", "flush wait"]) assert.match(m, new RegExp(wait, "i"), wait);
});

test("all required symptom families route to state and evidence", async () => {
  const m = await readFile(page, "utf8");
  for (const heading of ["Fix or holder leak", "Residency or identity corruption", "No victim under pressure", "Persistent dirty or flush failure", "Ordered-access stale pointer", "Misleading metric or SHOW value"]) assert.ok(m.includes(heading), heading);
  for (const term of ["nested debt", "promotion", "request-end", "publication", "provisional cleanup", "bypass I/O", "actual pressure evidence", "re-dirty", "lower-bound restoration", "home-page/fsync", "page_was_unfixed", "increment site", "approximate snapshot"]) assert.match(m, new RegExp(term, "i"), term);
});

test("symptoms route to canonical, source, verification, and status owners", async () => {
  const m = await readFile(page, "utf8");
  for (const target of ["../reference/source-map.md", "./verify-a-change.md", "../unresolved-or-version-sensitive-findings.md"]) assert.ok(m.includes(`](${target})`), target);
  for (const id of ["`VS-04`", "`VS-05`", "`VS-10`", "`VS-11`", "`VS-12`", "`VS-13`", "`VS-14`"]) assert.ok(m.includes(id), id);
  assert.match(m, /registry.*sole status owner/is);
});
