#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../advanced/failure-and-proof-obligations.md");

test("every current VS entry routes to a canonical mechanism", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const id of [1,2,3,4,5,6,10,11,12,13,14,15,16].map((n) => `VS-${String(n).padStart(2,"0")}`)) assert.ok(m.includes(`\`${id}\``), id);
  for (const target of ["./acquisition-concurrency.md", "./replacement-progress.md", "./recovery-and-lifecycle.md", "./specialized-interfaces.md", "../learning/04-flush-one-generation.md", "../playbooks/verify-a-change.md"]) assert.ok(m.includes(`](${target})`), target);
});

test("the proof method separates five claim levels", async () => {
  const m = await readFile(page, "utf8");
  for (const term of ["source-visible control flow", "reachability", "surviving state", "production impact", "current-branch status"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /absence of observed failure.*not.*proof/is);
  assert.match(m, /interleaving.*memory-order argument/is);
});

test("ownership and flush ledgers name all postconditions", async () => {
  const m = await readFile(page, "utf8");
  for (const term of ["global count", "latch grant", "holder", "waiters", "identity", "retry postcondition", "DIRTY", "FLUSHING", "saved lower bound", "copied generation", "DWB", "TDE", "I/O ownership"]) assert.match(m, new RegExp(term, "i"), term);
  for (const seam of ["fault injection", "controlled schedule", "controlled pressure", "crash/recovery"]) assert.match(m, new RegExp(seam, "i"), seam);
});

test("status and history remain external and revision bound", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /registry.*sole mutable status source/is);
  assert.match(m, /historical.*revision-bound/is);
  assert.match(m, /does not create.*current ticket/is);
});

test("the five claim levels are drawn as a staircase that stops where the evidence stops", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/claim-levels-ladder.svg"), "utf8");
  const aAt = m.indexOf('## Five claim levels');
  const vAt = m.indexOf('](../assets/claim-levels-ladder.svg)');
  const bAt = m.indexOf('## Route every current `VS-*` entry');
  assert.ok(aAt > 0, '## Five claim levels');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Five claim levels as a staircase, each with the evidence that closes it\]\(\.\.\/assets\/claim-levels-ladder\.svg\)/);
  assert.match(m, /stop where the evidence stops/i);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  assert.doesNotMatch(svg, /defect|Candidate/i);
  for (const label of ["Source-visible", "Reachability", "Surviving state", "Production impact", "Current-branch status", "CLOSED BY", "A proof may stop at any level", "Absence of observed failure is not proof of safety"]) assert.ok(svg.includes(label), label);
});
