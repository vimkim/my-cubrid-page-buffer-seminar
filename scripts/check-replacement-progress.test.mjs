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
  for (const anchor of ["src/storage/page_buffer.c:9330-9538", "src/storage/page_buffer.c:15420-15627", "src/storage/page_buffer.c:16972-17255"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
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

test("the LRU domain and zone visual precedes the allocation loop and states the search order", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/lru-domains-zones.svg"), "utf8");
  const aAt = m.indexOf('## Pinned implementation policy: domains, zones, and hints');
  const vAt = m.indexOf('](../assets/lru-domains-zones.svg)');
  const bAt = m.indexOf('## No free BCB: the allocation progress loop');
  assert.ok(aAt > 0, '## Pinned implementation policy: domains, zones, and hints');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.ok(bAt > vAt, "visual sits before the next section");
  assert.match(m, /!\[Private and shared LRU domains, three zones per list, and the victim search order\]\(\.\.\/assets\/lru-domains-zones\.svg\)/);
  assert.match(m, /when quota is disabled, only the shared lists are searched/i);
  assert.match(m, /under-quota own list is searched only as a last resort/i);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  for (const label of ["PRIVATE LRU LISTS", "SHARED LRU LISTS", "LRU1 hot", "LRU2 buffer", "LRU3 victim", "VICTIM SEARCH ORDER", "Own private, even under quota", "core eligibility gate"]) assert.ok(svg.includes(label), label);
});

test("replacement quantities, lifecycle, repeated reads, and costs are concrete", async () => {
  const m = await readFile(page, "utf8");
  const lifecycle = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/replacement-lifecycle-quantities.svg"), "utf8");
  const reread = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/repeated-read-lru-effects.svg"), "utf8");
  for (const term of [
    "invalid_top = BCB[0]",
    "invalid_cnt = N",
    "`L = S + P`",
    "O(P)",
    "O(L + D)",
    "at most 1,000 BCB nodes",
    "count_fix_and_avoid_dealloc",
    "per quota-adjustment age",
  ]) assert.ok(m.includes(term), term);
  assert.ok(m.includes("](../assets/replacement-lifecycle-quantities.svg)"));
  assert.ok(m.includes("](../assets/repeated-read-lru-effects.svg)"));
  assert.ok(m.includes("](../reference/replacement-policy-quantities-and-costs.md)"));
  for (const svg of [lifecycle, reread]) {
    assert.match(svg, /<svg[^>]+viewBox=/);
    assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
    assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
    assert.doesNotMatch(svg, /[\uac00-\ud7a3]/u);
  }
  for (const label of ["invalid_top", "invalid list", "scan its LRU3"]) assert.ok(lifecycle.includes(label), label);
  for (const label of ["quota.adjust_age", "young in LRU2", "boost to LRU1 top", "frequency rank"]) assert.ok(reread.includes(label), label);
});
