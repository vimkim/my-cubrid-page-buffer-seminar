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

const assetDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

test("log-page buffering is separate from BCBs and explains memory, ring, archive, and WAL", async () => {
  const [m, separationSvg, ringsSvg, archiveSvg] = await Promise.all([
    readFile(page, "utf8"),
    readFile(path.join(assetDir, "data-and-log-buffer-separation.svg"), "utf8"),
    readFile(path.join(assetDir, "log-memory-and-active-file-rings.svg"), "utf8"),
    readFile(path.join(assetDir, "log-ring-archive-retention.svg"), "utf8"),
  ]);
  for (const asset of ["data-and-log-buffer-separation.svg", "log-memory-and-active-file-rings.svg", "log-ring-archive-retention.svg"]) assert.ok(m.includes(`](../assets/${asset})`), asset);
  assert.match(m, /does not reuse the data-page BCB pool/i);
  assert.match(m, /logical_pageid % log_Pb\.num_buffers/);
  assert.match(m, /16,384 pages.*256 MiB/is);
  assert.match(m, /1 header page \+ 32,767 active data-log slots/);
  assert.match(m, /background archiving.*not the data-page double-write buffer/is);
  assert.match(m, /LSA.*does not allocate disk space or promise.*bytes.*retained/is);
  assert.match(m, /WAL orders the two writes.*does not copy a data page into the log buffer/is);
  assert.ok(m.includes("](../reference/log-page-buffer-first-principles-audit.md)"));
  for (const svg of [separationSvg, ringsSvg, archiveSvg]) {
    assert.match(svg, /<svg[^>]+viewBox=/);
    assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
    assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
    assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  }
  for (const label of ["PGBUF_BCB", "LOG_BUFFER", "WAL bridge"]) assert.ok(separationSvg.includes(label), label);
  for (const label of ["logical LOG_PAGEID = 12", "index = 12 % 4 = 0", "LOG_HEADER.npages"]) assert.ok(ringsSvg.includes(label), label);
  for (const label of ["append_lsa", "nxio_lsa", "nxarv_pageid", "fpageid", "retention floors"]) assert.ok(archiveSvg.includes(label), label);
});

test("the redo gate visual shows the comparison direction with a worked example", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.join(assetDir, "redo-lsa-gate.svg"), "utf8");
  const aAt = m.indexOf('## Redo: page-LSA idempotence under recovery ownership');
  const vAt = m.indexOf('](../assets/redo-lsa-gate.svg)');
  const bAt = m.indexOf('## Allocation and special fetch modes stay with their owners');
  assert.ok(aAt > 0, '## Redo: page-LSA idempotence under recovery ownership');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Redo page-LSA gate with a worked example from page LSA 140\]\(\.\.\/assets\/redo-lsa-gate\.svg\)/);
  assert.match(m, /less than or equal to the page LSA is treated as already applied/i);
  assert.match(m, /that skip creates no fix debt/i);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  for (const label of ["RECOVERY_PAGE", "Gate: r ≤ page LSA?", "already applied", "apply the redo function", "set page LSA = r", "WORKED EXAMPLE", "r = 170 again", "side-effect free"]) assert.ok(svg.includes(label), label);
});

test("the lifecycle order visual mirrors startup and shutdown around the pool", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.join(assetDir, "lifecycle-order.svg"), "utf8");
  const aAt = m.indexOf('## Lifecycle dependency order');
  const vAt = m.indexOf('](../assets/lifecycle-order.svg)');
  const bAt = m.indexOf('### Initialization and recovery');
  assert.ok(aAt > 0, '## Lifecycle dependency order');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Startup and shutdown order around the page-buffer pool\]\(\.\.\/assets\/lifecycle-order\.svg\)/);
  assert.match(m, /mirror images around the pool/i);
  assert.match(m, /`log_final\(\)` runs while the pool is still alive/);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  for (const label of ["STARTUP", "SHUTDOWN", "pgbuf_initialize()", "pgbuf_daemons_destroy()", "log_final()", "pgbuf_finalize()", "No daemon may touch a pool after pool finalization"]) assert.ok(svg.includes(label), label);
});
