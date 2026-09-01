#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the source map routes by region, caller, interface, and symptom", async () => {
  const m = await readFile(path.join(root, "reference/source-map.md"), "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const heading of ["## Broad source regions", "## Representative callers", "## Interface-family routing", "## Symptom-to-source lookup"]) assert.ok(m.includes(heading), heading);
  for (const caller of ["heap_file.c", "btree.c", "file_manager.c", "log_manager.c", "log_page_buffer.c", "log_recovery", "boot_cl.c"]) assert.match(m, new RegExp(caller.replace(".", "\\."), "i"), caller);
  assert.match(m, /bounded trace.*learning/is);
});

test("the invariant index is a stable routing table, not a second tutorial", async () => {
  const m = await readFile(path.join(root, "reference/invariant-index.md"), "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  assert.match(m, /\| Stable name \| One-sentence statement \| Canonical explanation \| Playbook \| Verification risk \|/);
  for (const name of ["IDENTITY-ONE", "FIX-DEBT", "CALLER-COMPLETES", "WAL-BEFORE-DATA", "GENERATION-SPLIT", "VICTIM-RECHECK", "UNWIND-BALANCE"]) assert.ok(m.includes(`**${name}**`), name);
  assert.match(m, /does not reproduce.*argument|routing index/i);
});

test("evidence and status ownership route outward", async () => {
  for (const file of ["reference/source-map.md", "reference/invariant-index.md"]) {
    const m = await readFile(path.join(root, file), "utf8");
    assert.ok(m.includes("../source-inventory.md"), `${file} provenance`);
    assert.ok(m.includes("../unresolved-or-version-sensitive-findings.md"), `${file} status`);
    assert.match(m, /provenance.*source inventory/is);
    assert.match(m, /status.*uncertainty registry/is);
  }
});
