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
  assert.match(m, /`src\/storage\/page_buffer\.c:6277-7590`/);
  assert.match(m, /`src\/storage\/page_buffer\.c:2842-3050`/);
});

test("the hundred-writer worked case is visual, bounded, and routed to its question", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/latch-wait-queue.svg"), "utf8");
  assert.match(m, /### Worked case: one hundred unconditional WRITE requests/);
  assert.match(m, /!\[Unconditional WRITE waiters queued on one BCB and granted one zero-crossing at a time\]\(\.\.\/assets\/latch-wait-queue\.svg\)/);
  for (const term of ["`next_wait_thrd`", "`waiter_exists`", "`pgbuf_timed_sleep()`", "`pgbuf_wakeup_reader_writer()`", "`page_latch_timeout_in_msecs`", "reader grouping", "holder re-entry", "`ER_PAGE_LATCH_TIMEDOUT`", "not as an Interface contract"]) assert.ok(m.includes(term), term);
  assert.match(m, /a zero-crossing, the only moment at which the queue is walked/);
  assert.match(m, /one grant per zero-crossing/i);
  for (const anchor of ["src/storage/page_buffer.c:7041-7450", "src/storage/page_buffer.c:7452-7590", "src/base/system_parameter.c:5308-5319"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
  assert.ok(m.includes("](../questions/advanced.md#pgbuf-qb-033-how-are-many-unconditional-write-waiters-handled)"));
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  for (const label of ["W1", "W100", "waiter_exists", "Granted", "Timeout", "Interrupt", "not a fairness theorem"]) assert.ok(svg.includes(label), label);
});

test("ordered watchers cover ranking, refix, failure, and revalidation", async () => {
  const m = await readFile(page, "utf8");
  for (const term of ["rank", "group", "conditional acquisition", "release", "sort", "refix", "partial failure", "`page_was_unfixed`", "page-local observations"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /`src\/storage\/page_buffer\.c:12268-13531`/);
  assert.match(m, /`src\/storage\/btree\.c:28365-28393`/);
  assert.match(m, /`src\/storage\/heap_file\.c:20493-20664`/);
  assert.ok(m.includes("](../learning/02-fix-hold-release.md)"));
});

const assetDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

test("the promotion outcomes are visual and the blocking path is labelled as an unfixed window", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.join(assetDir, "promotion-outcomes.svg"), "utf8");
  const aAt = m.indexOf('## Blocking promotion releases observations');
  const vAt = m.indexOf('](../assets/promotion-outcomes.svg)');
  const bAt = m.indexOf('## Ordered watchers');
  assert.ok(aAt > 0, '## Blocking promotion releases observations');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Four promotion outcomes and the unfixed window of the blocking path\]\(\.\.\/assets\/promotion-outcomes\.svg\)/);
  assert.match(m, /`PGBUF_PROMOTE_ONLY_READER`/);
  assert.match(m, /saved fix count travels with the request/i);
  assert.match(m, /no second debt is created/i);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  for (const label of ["In-place promotion", "Conditional failure: ER_PAGE_LATCH_PROMOTE_FAIL", "Blocking promotion", "Woken with WRITE", "Error or interrupt", "Unfixed window", "no second debt"]) assert.ok(svg.includes(label), label);
});

test("the ordered-fix visual shows the canonical order, the release rule, and the refix", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.join(assetDir, "ordered-watcher-refix.svg"), "utf8");
  const aAt = m.indexOf('## Ordered watchers: multi-page access as an owner protocol');
  const vAt = m.indexOf('](../assets/ordered-watcher-refix.svg)');
  const bAt = m.indexOf('## Review checklist');
  assert.ok(aAt > 0, '## Ordered watchers: multi-page access as an owner protocol');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Ordered fix: conditional attempt, release of pages that sort after the request, refix in canonical order\]\(\.\.\/assets\/ordered-watcher-refix\.svg\)/);
  assert.match(m, /`PGBUF_ORDERED_HEAP_HDR` before `PGBUF_ORDERED_HEAP_NORMAL` before `PGBUF_ORDERED_HEAP_OVERFLOW`/);
  assert.match(m, /sorts after the request is fully unfixed with avoid-deallocation registered/i);
  assert.match(m, /Only those released pages come back with `page_was_unfixed` set/);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  for (const label of ["CANONICAL ORDER", "Conditional fix of R", "keep it fixed", "page_was_unfixed", "Fix R unconditionally", "Refix released pages in order", "Partial failure", "HEAP_HDR"]) assert.ok(svg.includes(label), label);
});
