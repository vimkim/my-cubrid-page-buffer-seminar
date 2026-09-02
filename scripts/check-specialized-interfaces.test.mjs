#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../advanced/specialized-interfaces.md");

test("simple and scan-copy protocols are not ordinary fixed pages", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  assert.match(m, /simple fix.*temporary.*no page-content latch.*no holder/is);
  assert.match(m, /not.*interchangeable.*`pgbuf_fix\(\)`/is);
  assert.match(m, /scan-copy.*caller-owned snapshot/is);
  assert.match(m, /not.*resident fixed page/is);
  for (const anchor of ["src/storage/page_buffer.c:2688-2811", "src/storage/page_buffer.c:910-981", "src/storage/heap_file.c:6439-6465,6787-6829,7556-7645,7923-7984"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
});

test("area-copy and dead interfaces preserve their warnings", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /`VS-02`.*`pgbuf_copy_to_area\(\)`/is);
  assert.match(m, /`VS-03`.*`pgbuf_copy_from_area\(\)`/is);
  assert.match(m, /documentation.*executable|comment.*code/is);
  assert.match(m, /`VS-01`.*dead\/incomplete.*never.*optimization/is);
});

test("owner groups and approximate diagnostics route outward", async () => {
  const m = await readFile(page, "utf8");
  for (const owner of ["Recovery owner", "Invalidation/deallocation owner", "Daemon owner", "Diagnostic owner"]) assert.ok(m.includes(`**${owner}**`), owner);
  for (const term of ["SHOW", "statistics", "validation", "lock-free snapshot", "approximate", "increment site"]) assert.match(m, new RegExp(term, "i"), term);
  assert.ok(m.includes("](../../../pgbuf-analysis/f799e05_claude/analysis/research/api-inventory.md)"));
  assert.ok(m.includes("](../learning/01-contract-and-objects.md)"));
  assert.ok(m.includes("](../learning/02-fix-hold-release.md)"));
});

test("the three access forms are compared visually against the objects each touches", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/access-forms-compared.svg"), "utf8");
  const aAt = m.indexOf('## Scan-copy: caller-owned snapshot, not residency');
  const vAt = m.indexOf('](../assets/access-forms-compared.svg)');
  const bAt = m.indexOf('## Area-copy helpers: existing owner only');
  assert.ok(aAt > 0, '## Scan-copy: caller-owned snapshot, not residency');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Normal fix, simple fix, and scan-copy compared against the page-buffer objects each touches\]\(\.\.\/assets\/access-forms-compared\.svg\)/);
  assert.match(m, /Neither is a lighter form of the general Interface/);
  assert.match(m, /must never be passed to `pgbuf_unfix\(\)`/);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  for (const label of ["Normal pgbuf_fix()", "Simple fix", "Scan-copy handle", "latchless", "pgbuf_simple_unfix()", "pgbuf_copy_buffer_free()", "never pgbuf_unfix()", "Only the first column is the general Interface"]) assert.ok(svg.includes(label), label);
});
