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
  assert.match(m, /LRU3 is the victimization zone/);
  assert.ok(m.includes("`src/storage/page_buffer.c:185-200`"));
});

test("direct and background progress retain generation and timing boundaries", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /direct victim.*revocation/is);
  assert.match(m, /victim flush.*post-flush/is);
  assert.match(m, /newer dirty generation|G\+1/i);
  assert.match(m, /daemon.*version-sensitive/is);
  for (const anchor of ["src/storage/page_buffer.c:9293-9538", "src/storage/page_buffer.c:15420-15627", "src/storage/page_buffer.c:16972-17298"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
});

test("the no-free-BCB allocation loop is visual, bounded, and routed to its questions", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/allocation-progress.svg"), "utf8");
  assert.match(m, /## No free BCB: the allocation progress loop/);
  assert.match(m, /!\[Allocation progress loop when no free BCB is immediately available\]\(\.\.\/assets\/allocation-progress\.svg\)/);
  for (const term of ["`pgbuf_allocate_bcb()`", "`pgbuf_get_victim()`", "invalid (free) list", "direct-victim waiter queue", "high priority", "`ER_INTERRUPTED`", "`ER_PB_ALL_BUFFERS_DIRTY`", "forgotten waiter", "Implementation policy"]) assert.ok(m.includes(term), term);
  assert.match(m, /not an open-ended wait/i);
  assert.match(m, /every path ends in an assignment, a retry, an interrupt, a timeout, or an explicit error/i);
  for (const anchor of ["src/storage/page_buffer.c:8181-8403", "src/storage/page_buffer.c:9067-9265"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
  assert.ok(m.includes("](../questions/advanced.md#pgbuf-qb-040-what-happens-when-no-free-bcb-is-immediately-available)"));
  assert.ok(m.includes("](../questions/maintenance-scenarios.md#pgbuf-qb-068-why-can-the-allocator-report-no-victim)"));
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  for (const label of ["Invalid (free) list", "Victim search", "direct-victim waiter queue", "Interrupt or shutdown", "Timeout", "ER_PB_ALL_BUFFERS_DIRTY"]) assert.ok(svg.includes(label), label);
});

test("AOUT and runtime evidence are bounded", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /AOUT.*data structures/is);
  assert.match(m, /disabled.*analyzed.*default/is);
  assert.doesNotMatch(m, /CUBRID (?:currently )?uses 2Q/i);
  assert.match(m, /no-eviction evidence/i);
  assert.match(m, /does not prove.*replacement schedule/is);
  assert.ok(m.includes("](../../../pgbuf-analysis/research/cubrid-lru-victim.md)"));
  assert.match(m, /Historical evidence.*`5cd4f860e`/is);
});
