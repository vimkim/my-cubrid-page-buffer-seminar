#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../learning/06-maintainer-capstone.md");

test("the capstone supplies the complete change-impact template", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const field of ["Behavior", "Owners", "State", "Guards", "Invariants", "Unwind", "Caller impact", "Evidence seam", "Remaining uncertainty"]) assert.ok(m.includes(`**${field}:**`), field);
});

test("both candidate packets route status and name missing proof", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /## Packet A: `VS-11`/);
  assert.match(m, /## Packet B: `VS-12`/);
  assert.match(m, /uncertainty registry.*alone owns `VS-11` status/is);
  assert.match(m, /uncertainty registry.*alone owns `VS-12` status/is);
  assert.doesNotMatch(m, /\*\*Candidate\*\*|Candidate status/i);
  assert.match(m, /holder extension allocation failure/i);
  assert.match(m, /TDE.*DWB-slot.*fault injection/is);
  assert.match(m, /source-grounded argument.*runtime observation/is);
});

test("completion, applied handoff, and peer review gates are explicit", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /either packet.*core completion/is);
  assert.match(m, /both packets.*advanced preparation/is);
  assert.match(m, /controlled caller regression|narrow runtime probe/i);
  assert.match(m, /target revision/i);
  assert.match(m, /another maintainer.*review/is);
  assert.match(m, /### Model answer A/);
  assert.match(m, /### Model answer B/);
});
