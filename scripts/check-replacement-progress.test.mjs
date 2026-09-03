#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../advanced/replacement-progress.md");

test("replacement starts with defaults, concrete states, and one BCB lifetime", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const term of ["32,768 BCBs", "MAX_NTRANS = 102", "32 shared LRUs", "152 private LRUs", "184 persistent LRU descriptors", "INVALID", "VOID", "LRU1", "LRU2", "LRU3"]) assert.match(m, new RegExp(term, "i"), term);
  assert.match(m, /VOID only means.*not linked/is);
  assert.match(m, /LRU3 is the victimization zone/);
  for (const visual of ["default-replacement-topology.svg", "bcb-replacement-state-machine.svg", "one-bcb-victim-decision.svg"]) assert.ok(m.includes(`](../assets/${visual})`), visual);
});

test("direct and background progress retain generation and timing boundaries", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /direct-victim.*revoked/is);
  assert.match(m, /dirty LRU3.*flushed.*post-flush/is);
  assert.match(m, /newer dirty generation|G\+1/i);
  assert.match(m, /Daemon timing is version-sensitive/is);
  for (const anchor of ["src/storage/page_buffer.c:8181-8403", "src/storage/page_buffer.c:15420-15652", "src/storage/page_buffer.c:16972-17255"]) assert.ok(m.includes(`\`${anchor}\``), anchor);
});

test("the no-free-BCB allocation loop is visual, bounded, and routed to its questions", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/allocation-progress.svg"), "utf8");
  assert.match(m, /## What happens when every scan fails/);
  assert.match(m, /!\[Allocation progress loop when no free BCB is immediately available\]\(\.\.\/assets\/allocation-progress\.svg\)/);
  for (const term of ["`pgbuf_allocate_bcb()`", "direct-victim waiter queue", "high-priority queue", "`ER_INTERRUPTED`", "`ER_PB_ALL_BUFFERS_DIRTY`", "forgotten waiter"]) assert.ok(m.includes(term), term);
  assert.match(m, /not an open-ended wait/i);
  assert.match(m, /Every path ends in an assignment, a retry, an interrupt, a timeout, or an explicit error/i);
  assert.ok(m.includes("`src/storage/page_buffer.c:8181-8403`"));
  assert.ok(m.includes("](../questions/advanced.md#pgbuf-qb-040-what-happens-when-no-free-bcb-is-immediately-available)"));
  assert.ok(m.includes("](../questions/maintenance-scenarios.md#pgbuf-qb-068-why-can-the-allocator-report-no-victim)"));
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]{20,}<\/desc>/);
  for (const label of ["Invalid (free) list", "Victim search", "direct-victim waiter queue", "Interrupt or shutdown", "Timeout", "ER_PB_ALL_BUFFERS_DIRTY"]) assert.ok(svg.includes(label), label);
});

test("AOUT routes to a separate dormant-design page and runtime evidence stays bounded", async () => {
  const m = await readFile(page, "utf8");
  assert.ok(m.includes("](./aout-ghost-history.md)"));
  assert.match(m, /AOUT.*separate.*inactive design/is);
  assert.doesNotMatch(m, /CUBRID (?:currently )?uses 2Q/i);
  assert.match(m, /no-eviction evidence/i);
  assert.match(m, /does not prove.*replacement schedule/is);
  assert.ok(m.includes("](../../../pgbuf-analysis/research/cubrid-lru-victim.md)"));
  assert.match(m, /Historical evidence.*`5cd4f860e`/is);
});

test("the LRU domain and zone visual states the search order", async () => {
  const m = await readFile(page, "utf8");
  const svg = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/lru-domains-zones.svg"), "utf8");
  const aAt = m.indexOf('## The replacement search from beginning to end');
  const vAt = m.indexOf('](../assets/lru-domains-zones.svg)');
  assert.ok(aAt > 0, '## Pinned implementation policy: domains, zones, and hints');
  assert.ok(vAt > aAt, "visual follows its section heading");
  assert.match(m, /!\[Private and shared LRU domains, three zones per list, and the victim search order\]\(\.\.\/assets\/lru-domains-zones\.svg\)/);
  assert.match(m, /When quota is disabled, only shared lists are searched/i);
  assert.match(m, /under-quota own list.*last fallback/is);
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
    "O(T + L + D)",
    "at most 1,000 BCB nodes",
    "MAX_NTRANS = 102",
    "184 persistent LRU descriptors",
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
