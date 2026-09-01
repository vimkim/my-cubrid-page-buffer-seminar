#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../advanced/recovery-and-lifecycle.md");

test("checkpoint is selective and crosses ordered durability boundaries", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  assert.match(m, /selective.*not.*flush every page/is);
  for (const term of ["WAL", "selective page-buffer flush", "filesystem synchronization", "checkpoint record", "volume metadata"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /`src\/transaction\/log_page_buffer\.c:6901-7406`/);
});

test("redo preserves page-LSA idempotence and recovery ownership", async () => {
  const m = await readFile(page, "utf8");
  for (const term of ["`RECOVERY_PAGE`", "page LSA", "skip", "apply", "set.*LSA", "dirty", "release"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /idempotence/i);
  for (const anchor of ["src/transaction/log_recovery.c:497-536", "src/transaction/log_recovery.c:6407-6431", "src/transaction/log_recovery_redo.hpp:587-668"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
});

test("lifecycle and allocation owners stay ordered and distinct", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /initialization.*daemon gating.*recovery.*shutdown.*log finalization.*page-buffer finalization/is);
  for (const term of ["Invalidation", "Victimization", "Logical deallocation", "temporary", "recovery-specific", "file/disk", "allocation"]) assert.match(m, new RegExp(term, "i"), term);
  for (const anchor of ["src/transaction/log_tran_table.c:468-512", "src/transaction/boot_sr.c:1974-2801", "src/transaction/boot_sr.c:3055-3113"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
  assert.match(m, /does not prove.*crash|crash.*not proved/is);
});
