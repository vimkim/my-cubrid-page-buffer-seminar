#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../advanced/replacement-progress.md");

test("replacement structures are labelled pinned policy after eligibility", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const term of ["private LRU", "shared LRU", "LRU1", "LRU2", "LRU3", "quota", "candidate queue", "victim hint"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /implementation policy/i);
  assert.match(m, /eligibility.*before/is);
});

test("direct and background progress retain generation and timing boundaries", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /direct victim.*revocation/is);
  assert.match(m, /victim flush.*post-flush/is);
  assert.match(m, /newer dirty generation|G\+1/i);
  assert.match(m, /daemon.*version-sensitive/is);
  for (const anchor of ["src/storage/page_buffer.c:9293-9538", "src/storage/page_buffer.c:15420-15627", "src/storage/page_buffer.c:16972-17298"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
});

test("AOUT and runtime evidence are bounded", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /AOUT.*data structures/is);
  assert.match(m, /disabled.*analyzed.*default/is);
  assert.doesNotMatch(m, /CUBRID (?:currently )?uses 2Q/i);
  assert.match(m, /no-eviction evidence/i);
  assert.match(m, /does not prove.*replacement schedule/is);
  assert.ok(m.includes("](../../../pgbuf-analysis/research/cubrid-lru-victim.md)"));
});
