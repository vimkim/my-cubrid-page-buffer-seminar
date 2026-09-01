#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = path.join(root, "learning/05-replace-one-frame.md");
const visual = path.join(root, "assets/victim-eligibility.svg");

test("hard victim predicates precede replacement policy", async () => {
  const markdown = await readFile(page, "utf8");
  assert.doesNotMatch(markdown, /> \*\*Shell status:\*\*/);
  assert.ok(markdown.indexOf("## Hard eligibility") < markdown.indexOf("## Selection and progress are policy"));
  for (const term of ["identity", "`fcnt`", "`DIRTY`", "`FLUSHING`", "waiter", "transient", "final protected revalidation"]) assert.match(markdown, new RegExp(term, "i"), term);
  assert.match(markdown, /`fcnt == 0`.*insufficient/is);
  assert.match(markdown, /`src\/storage\/page_buffer\.c:9293-9538`/);
});

test("policy and lifecycle operations remain distinct", async () => {
  const markdown = await readFile(page, "utf8");
  for (const term of ["private LRU", "shared LRU", "quota", "candidate queue", "direct assignment"]) assert.match(markdown, new RegExp(term, "i"), term);
  assert.match(markdown, /direct-victim assignment.*revocable/is);
  assert.match(markdown, /fixed again.*request another/is);
  for (const operation of ["Victimization", "Invalidation", "Unfix", "Flush", "Logical deallocation"]) assert.ok(markdown.includes(operation), operation);
  assert.match(markdown, /did not force eviction/i);
});

test("the visual gates policy with text-labelled predicates", async () => {
  const [markdown, svg] = await Promise.all([readFile(page, "utf8"), readFile(visual, "utf8")]);
  assert.match(markdown, /!\[Hard victim predicates gating replacement policy\]\(\.\.\/assets\/victim-eligibility\.svg\)/);
  for (const label of ["HARD GATE", "Identity stable", "No fix owner", "Clean and not flushing", "No waiters or transient claim", "FINAL PROTECTED RECHECK", "POLICY CHOICE"]) assert.ok(svg.includes(label), label);
});

test("the exercise produces a predicate versus policy table", async () => {
  const markdown = await readFile(page, "utf8");
  assert.match(markdown, /## Understanding check: predicate or policy/);
  assert.match(markdown, /predicate-versus-policy table/i);
  assert.match(markdown, /### Model answer/);
  for (const target of ["./06-maintainer-capstone.md", "../advanced/replacement-progress.md"]) assert.ok(markdown.includes(`](${target})`), target);
});
