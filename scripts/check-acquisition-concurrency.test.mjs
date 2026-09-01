#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../advanced/acquisition-concurrency.md");

test("optimized READ and miss serialization preserve the normal contract", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  assert.match(m, /lock-free READ hit.*same caller contract/is);
  assert.match(m, /positive `fcnt`.*excludes.*reuse/is);
  assert.match(m, /memory_order_acq_rel|memory ordering/i);
  assert.match(m, /one resident-identity owner/i);
  assert.match(m, /does not prove.*physical.*I\/O/is);
  for (const anchor of ["src/storage/page_buffer.c:7725-7786", "src/storage/page_buffer.c:7981-8178", "src/storage/page_buffer.c:8392-8634"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
});

test("wait and promotion claims preserve evidence limits", async () => {
  const m = await readFile(page, "utf8");
  for (const term of ["conditional rejection", "timeout", "wakeup", "barging", "blocking promotion", "stale"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /does not establish strict FIFO.*starvation freedom.*exact timeout/is);
  assert.match(m, /`src\/storage\/page_buffer\.c:6277-7582`/);
  assert.match(m, /`src\/storage\/page_buffer\.c:2842-3050`/);
});

test("ordered watchers cover ranking, refix, failure, and revalidation", async () => {
  const m = await readFile(page, "utf8");
  for (const term of ["rank", "group", "conditional acquisition", "release", "sort", "refix", "partial failure", "`page_was_unfixed`", "page-local observations"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /`src\/storage\/page_buffer\.c:12268-13531`/);
  assert.match(m, /`src\/storage\/btree\.c:28365-28393`/);
  assert.match(m, /`src\/storage\/heap_file\.c:20493-20664`/);
  assert.ok(m.includes("](../learning/02-fix-hold-release.md)"));
});
