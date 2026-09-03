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
const latchVersusLockPath = path.join(guideRoot, "assets/latch-versus-lock.svg");
const mutationSpinePath = path.join(guideRoot, "assets/mutation-ownership-spine.svg");
const hangulPattern = /[\u3131-\u318e\u3200-\u321e\u3260-\u327f\ua960-\ua97c\uac00-\ud7a3\ud7b0-\ud7fb]/u;

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
    "src/storage/overflow_file.c:146-258",
    "src/transaction/log_manager.c:2194-2226",
    "src/storage/page_buffer.c:4983-5055",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }
  assert.match(markdown, /heap_ovf_insert\(\).*class lock fails.*direct return/is);
  assert.match(markdown, /class lock fails.*direct return/is);
  assert.match(markdown, /transaction.*recovery.*obligation/is);
  assert.match(markdown, /system operation.*outer transaction/is);
  assert.match(markdown, /no.*home-page watcher.*acquired/is);
});

test("the contract ledger separates page-buffer guarantees from caller obligations", async () => {
  const markdown = await readFile(pagePath, "utf8");

  assert.match(markdown, /## Contract ledger from acquisition through durable mutation/);
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

test("the contract ledger shows the page latch and the transaction lock as different protections", async () => {
  const [markdown, svg] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(latchVersusLockPath, "utf8"),
  ]);

  const ledgerAt = markdown.indexOf("## Contract ledger from acquisition through durable mutation");
  const visualAt = markdown.indexOf("](../assets/latch-versus-lock.svg)");
  const traceAt = markdown.indexOf("## One complete caller trace");
  assert.ok(ledgerAt > 0, "contract ledger");
  assert.ok(visualAt > ledgerAt, "visual follows the ledger heading");
  assert.ok(traceAt > visualAt, "visual sits inside the contract ledger");
  assert.match(
    markdown,
    /!\[Page latch and transaction lock protect different objects for different lifetimes\]\(\.\.\/assets\/latch-versus-lock\.svg\)/,
  );
  assert.match(markdown, /neither column is a stronger form of the other/i);

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  for (const label of [
    "PAGE LATCH",
    "TRANSACTION LOCK",
    "resident bytes",
    "logical object",
    "at the matching unfix",
    "under the transaction protocol",
    "heap_insert_logical() holds both",
    "Holding either does not imply holding the other",
  ]) {
    assert.ok(svg.includes(label), label);
  }
});

test("the caller trace opens with the ownership spine and its exit column", async () => {
  const [markdown, svg] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(mutationSpinePath, "utf8"),
  ]);

  const traceAt = markdown.indexOf("## One complete caller trace");
  const visualAt = markdown.indexOf("](../assets/mutation-ownership-spine.svg)");
  const stepOneAt = markdown.indexOf("### 1. Prepare and take the transaction lock");
  assert.ok(traceAt > 0, "caller trace");
  assert.ok(visualAt > traceAt, "visual follows the trace heading");
  assert.ok(stepOneAt > visualAt, "step one follows the visual");
  assert.match(
    markdown,
    /!\[Six heap insert steps, the layer that owns each correctness condition, and what each exit leaves\]\(\.\.\/assets\/mutation-ownership-spine\.svg\)/,
  );
  assert.match(markdown, /shape of the exit ledger/i);

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  for (const label of [
    "SUCCESS SPINE",
    "WHO OWNS THE CONDITION",
    "WHAT AN EXIT HERE LEAVES",
    "Class lock fails: direct return",
    "helper cleanup",
    "goto error",
    "heap_unfix_watchers()",
    "DONT_FREE",
    "advancing the LSA does not itself set DIRTY",
    "Success: debt transferred or consumed",
    "not by the spelling of return or goto error",
  ]) {
    assert.ok(svg.includes(label), label);
  }
});
