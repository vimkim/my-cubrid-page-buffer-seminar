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
  assert.match(m, /zero-crossing that starts a grant scan/i);
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
  assert.match(m, /`src\/storage\/page_buffer\.c:12186-13063`/);
  assert.match(m, /`src\/storage\/page_buffer\.c:13065-13531`/);
  assert.match(m, /`src\/storage\/btree\.c:28365-28393`/);
  assert.match(m, /`src\/storage\/heap_file\.c:20493-20664`/);
  assert.ok(m.includes("](../learning/02-fix-hold-release.md)"));
});

const assetDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

test("the promotion outcomes are visual and distinguish thread ownership from page-state continuity", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.join(assetDir, "promotion-outcomes.svg"), "utf8");
  const aAt = m.indexOf('## Blocking promotion uses queue priority to preserve page state');
  const vAt = m.indexOf('](../assets/promotion-outcomes.svg)');
  const bAt = m.indexOf('## Ordered fix: release later pages before waiting for an earlier one');
  assert.ok(aAt > 0, '## Blocking promotion uses queue priority to preserve page state');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Four promotion outcomes and the queue-head continuity bridge of the blocking path\]\(\.\.\/assets\/promotion-outcomes\.svg\)/);
  assert.match(m, /`PGBUF_PROMOTE_ONLY_READER`/);
  assert.match(m, /same fix count.*preserves page-byte observations/is);
  assert.match(m, /internal ownership gap/is);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  for (const label of ["In-place promotion", "Conditional failure: ER_PAGE_LATCH_PROMOTE_FAIL", "Blocking promotion", "Woken with WRITE", "Blocking failure", "Internal ownership gap", "no second debt"]) assert.ok(svg.includes(label), label);
});

test("the two promotion conditions have a separate decision visual", async () => {
  const [m, svg] = await Promise.all([
    readFile(page, "utf8"),
    readFile(path.join(assetDir, "promotion-condition-choice.svg"), "utf8"),
  ]);
  assert.match(m, /#### Choosing between the two promotion conditions/);
  assert.match(m, /promotion-condition-choice\.svg/);
  assert.match(m, /PGBUF_PROMOTE_ONLY_READER.*ER_PAGE_LATCH_PROMOTE_FAIL/is);
  assert.match(m, /PGBUF_PROMOTE_SHARED_READER.*queue head.*sleep/is);
  assert.match(m, /condition therefore controls the \*\*contended\*\*\s+path/is);
  for (const label of [
    "PGBUF_PROMOTE_ONLY_READER",
    "PGBUF_PROMOTE_SHARED_READER",
    "Second-promoter rule",
    "in-place success",
    "queue WRITE(k) at the head",
  ]) assert.ok(svg.includes(label), label);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
});

test("ordered fix starts from deadlock, separates its structures, and bounds the reorder work", async () => {
  const [m, deadlockSvg, ledgerSvg, refixSvg, staleSvg] = await Promise.all([
    readFile(page, "utf8"),
    readFile(path.join(assetDir, "ordered-fix-deadlock-break.svg"), "utf8"),
    readFile(path.join(assetDir, "ordered-fix-ledger-layers.svg"), "utf8"),
    readFile(path.join(assetDir, "ordered-watcher-refix.svg"), "utf8"),
    readFile(path.join(assetDir, "ordered-fix-stale-observation.svg"), "utf8"),
  ]);
  const aAt = m.indexOf('## Ordered fix: release later pages before waiting for an earlier one');
  const vAt = m.indexOf('](../assets/ordered-watcher-refix.svg)');
  const bAt = m.indexOf('## Review checklist');
  assert.ok(aAt > 0, 'ordered-fix heading');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  for (const asset of ["ordered-fix-deadlock-break.svg", "ordered-fix-ledger-layers.svg", "ordered-fix-stale-observation.svg"]) assert.ok(m.includes(`](../assets/${asset})`), asset);
  assert.match(m, /holder.*head-inserted singly linked.*position does not represent page rank/is);
  assert.match(m, /conditional first attempt.*avoids the release, sort, and refix/is);
  assert.match(m, /temporary holder array.*capacity of 64.*not a general transaction limit/is);
  assert.match(m, /O\(H \+ W\)/);
  assert.match(m, /O\(\(M\+1\) log\(M\+1\)\)/);
  assert.match(m, /!\[Ordered fix: conditional attempt, release of pages that sort after the request, refix in canonical order\]\(\.\.\/assets\/ordered-watcher-refix\.svg\)/);
  assert.match(m, /`PGBUF_ORDERED_HEAP_HDR=0`.*`PGBUF_ORDERED_HEAP_NORMAL=1`.*`PGBUF_ORDERED_HEAP_OVERFLOW=2`/s);
  assert.match(m, /sorts after the request is fully unfixed with avoid-deallocation registered/i);
  assert.match(m, /Only those released pages come back with `page_was_unfixed` set/);
  for (const svg of [deadlockSvg, ledgerSvg, refixSvg, staleSvg]) {
    assert.match(svg, /<svg[^>]+viewBox=/);
    assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
    assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
    assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  }
  for (const label of ["CANONICAL ORDER", "Conditional fix of R", "keep it fixed", "page_was_unfixed", "Fix R unconditionally", "Refix released pages in order", "Partial failure", "HEAP_HDR"]) assert.ok(refixSvg.includes(label), label);
  for (const label of ["latch cycle", "release B", "wait-for cycle is gone"]) assert.ok(deadlockSvg.includes(label), label);
  for (const label of ["holder for BCB", "watcher H", "temporary PGBUF_HOLDER_INFO array", "qsort"] ) assert.ok(ledgerSvg.includes(label), label);
  for (const label of ["continuously fixed", "fully unfixed window", "Recompute N120", "page_was_unfixed = true"]) assert.ok(staleSvg.includes(label), label);
});
