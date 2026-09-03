#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("bilingual Lesson 2 gives the six objects concrete runtime shapes and defaults", async () => {
  const pages = await Promise.all([
    readFile(path.join(root, "en/lessons/0002-separate-objects-from-state.html"), "utf8"),
    readFile(path.join(root, "ko/lessons/0002-separate-objects-from-state.html"), "utf8"),
  ]);

  for (const page of pages) {
    assert.match(page, /<section class="section" id="runtime-shapes">/);
    assert.ok(page.includes('href="#runtime-shapes"'), "lesson-map route");
    assert.ok(page.includes('href="../../learning/01-contract-and-objects.md#six-objects-six-lifetimes"'), "canonical explanation route");

    for (const term of [
      "struct vpid",
      "int32_t pageid",
      "short volid",
      "PGBUF_BCB",
      "BCB_table",
      "PGBUF_IOPAGE_BUFFER",
      "iopage_table",
      "typedef char *PAGE_PTR",
      "int32_t fcnt",
      "PGBUF_HOLDER",
      "32,768",
      "16 KiB",
      "512 MiB",
      "64-byte",
      "7 reserved",
      "blocks of 10",
      "ABI",
      "NDEBUG",
    ]) assert.ok(page.includes(term), term);
  }
});
