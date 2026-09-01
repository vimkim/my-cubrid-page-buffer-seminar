#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guideRoot = path.resolve(scriptDir, "..");
const pagePath = path.join(
  guideRoot,
  "learning/03-caller-completes-correctness.md",
);

test("the heap insert trace covers the entire caller-completed mutation", async () => {
  const markdown = await readFile(pagePath, "utf8");

  assert.doesNotMatch(markdown, /> \*\*Shell status:\*\*/);
  assert.match(markdown, /## One complete caller trace: `heap_insert_logical\(\)`/);
  for (const stage of [
    "1. Prepare and take the transaction lock",
    "2. Acquire and validate the destination",
    "3. Mutate the page",
    "4. Append recovery logging and advance the page LSA",
    "5. Mark the generation dirty",
    "6. Transfer or release every watcher",
  ]) {
    assert.ok(markdown.includes(stage), stage);
  }
  for (const anchor of [
    "src/storage/heap_file.c:20469-20486",
    "src/storage/heap_file.c:20493-20664",
    "src/storage/heap_file.c:20821-20939",
    "src/storage/heap_file.c:23120-23324",
    "src/storage/heap_file.c:23217-23220",
    "src/transaction/log_manager.c:2194-2226",
    "src/storage/page_buffer.c:4983-5055",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }
  assert.match(markdown, /heap_ovf_insert\(\).*class lock fails.*direct return/is);
  assert.match(markdown, /class lock fails.*direct return/is);
  assert.match(markdown, /transaction.*recovery.*obligation/is);
  assert.match(markdown, /no.*home-page watcher.*acquired/is);
});

test("the contract ledger separates page-buffer guarantees from caller obligations", async () => {
  const markdown = await readFile(pagePath, "utf8");

  assert.match(markdown, /## Contract ledger: acquisition is necessary, not sufficient/);
  assert.match(markdown, /\| Page-buffer or log-layer guarantee \| Caller obligation \|/);
  for (const obligation of [
    "page type",
    "on-page layout",
    "record validity",
    "logging semantics",
    "higher-level retry",
  ]) {
    assert.match(markdown, new RegExp(obligation, "i"), obligation);
  }
  assert.match(markdown, /page latch.*transaction lock.*different state/is);
  assert.match(markdown, /latch.*in-memory page bytes/is);
  assert.match(markdown, /transaction lock.*logical database object/is);
});

test("NEW_PAGE and the B-tree contrast stay on the core-page boundary", async () => {
  const markdown = await readFile(pagePath, "utf8");

  assert.match(markdown, /## `NEW_PAGE` means materialize after allocation/);
  assert.match(markdown, /allocation.*before.*`pgbuf_fix\(.*NEW_PAGE/is);
  assert.doesNotMatch(markdown, /`NEW_PAGE` allocates/i);
  assert.match(markdown, /`src\/storage\/file_manager\.c:5420-5590`/);

  assert.match(markdown, /## B-tree contrast: failed promotion can mean restart/);
  assert.match(markdown, /conditional acquisition/i);
  assert.match(markdown, /promotion.*restart/is);
  assert.match(markdown, /`src\/storage\/btree\.c:28365-28393`/);
  assert.match(markdown, /`src\/storage\/btree\.c:28638-28696`/);
  assert.match(markdown, /advanced.*acquisition-concurrency\.md/is);
});

test("the exercise audits every successful and failing ownership exit", async () => {
  const markdown = await readFile(pagePath, "utf8");
  const checkAt = markdown.indexOf("## Understanding check: audit every exit");
  const answerAt = markdown.indexOf("### Model answer");
  const navigationAt = markdown.indexOf("## Learning navigation");

  assert.ok(checkAt > 0, "understanding check");
  assert.ok(answerAt > checkAt, "adjacent model answer");
  assert.ok(navigationAt > answerAt, "navigation follows answer");
  assert.match(markdown, /every `return` and `goto error`/i);
  assert.match(markdown, /watcher transfer/i);
  assert.match(markdown, /fix success stops being sufficient evidence/i);
  assert.match(markdown, /overflow.*already created.*higher-layer/is);
  for (const target of [
    "./02-fix-hold-release.md",
    "./04-flush-one-generation.md",
    "../advanced/acquisition-concurrency.md",
    "../advanced/recovery-and-lifecycle.md",
  ]) {
    assert.ok(markdown.includes(`](${target})`), target);
  }
});
