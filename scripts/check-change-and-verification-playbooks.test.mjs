#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("change-safely covers behavior, ownership, early exits, and change class", async () => {
  const m = await readFile(path.join(root, "playbooks/change-safely.md"), "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const term of ["caller-visible behavior", "interface family", "owners", "state", "guards", "dropped protection", "dependency seam", "success debt", "retry behavior", "failure unwind"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /every early return/i);
  assert.match(m, /contract change.*policy change/is);
});

test("change-safely preserves CUBRID source and negative-path rules", async () => {
  const m = await readFile(path.join(root, "playbooks/change-safely.md"), "utf8");
  assert.match(m, /preserve.*indentation/i);
  assert.match(m, /\/\* \*INDENT-OFF\* \*\/.*\/\* \*INDENT-ON\* \*\//s);
  for (const failure of ["expected absence", "conditional rejection", "timeout", "interrupt", "loader retry", "allocation failure", "read/decrypt/validation failure", "WAL/DWB/write failure", "partial refix", "lifecycle context"]) assert.match(m, new RegExp(failure, "i"), failure);
});

test("verification maps risk to evidence and records probe boundaries", async () => {
  const m = await readFile(path.join(root, "playbooks/verify-a-change.md"), "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const evidence of ["focused unit", "representative caller", "concurrency", "fault injection", "controlled pressure", "crash/recovery"]) assert.match(m, new RegExp(evidence, "i"), evidence);
  for (const field of ["Revision", "Build", "Configuration", "Workload", "Observer effects", "Observed boundary", "Untested boundary"]) assert.ok(m.includes(`**${field}:**`), field);
  assert.match(m, /CMake/);
  assert.match(m, /`ctest`/);
  assert.doesNotMatch(m, /`just (?:build|test)/);
});
