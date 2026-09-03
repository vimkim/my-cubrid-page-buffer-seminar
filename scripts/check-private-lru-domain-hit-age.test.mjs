#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relative) {
  return readFile(path.join(root, relative), "utf8");
}

test("private LRU counts, index namespaces, lifetimes, and victim order have a focused lesson", async () => {
  const [research, en, ko] = await Promise.all([
    read(".scratch/private-lru-index/research.md"),
    read("en/lessons/0012b-understand-private-lru-index.html"),
    read("ko/lessons/0012b-understand-private-lru-index.html"),
  ]);

  assert.ok(research.includes("f799e05d77d5300c6ea5753b4a6cc7caee6d8912"));
  assert.match(research, /transaction start[\s\S]{0,30}not[\s\S]{0,30}create 152/i);
  assert.match(research, /eligible own private,[\s\S]*advertised other private,[\s\S]*advertised shared,[\s\S]*own private/i);
  assert.match(en, /102 \+ 50 = 152/is);
  assert.match(en, /starting a transaction does not create 152/is);
  assert.match(en, /session creation.*(?:borrow|associate)|session.*borrow.*(?:id|index)/is);
  assert.match(en, /p = 0.*32.*p = 151.*183/is);
  assert.match(en, /own private.*other.private.*shared.*own private.*(?:fallback|last)/is);
  assert.match(en, /direct victim.*later/is);
  for (const term of ["152", "transaction", "session", "tran_index", "S + p", "session_cnt[p]", "own private", "other-private", "shared list", "Direct victim"]) {
    assert.ok(ko.includes(term), term);
  }
  assert.match(en, /data-descriptor-lifetime="page-buffer"/);
  assert.match(en, /data-assignment-lifetime="session"/);
  assert.match(en, /data-search-order="own-over-quota,other-private,shared,own-fallback"/);
});

test("private LRU is taught as an assignment and policy domain, not page ownership", async () => {
  const [markdown, en, ko, visual] = await Promise.all([
    read("advanced/replacement-progress.md"),
    read("en/lessons/0012b-understand-private-lru-index.html"),
    read("ko/lessons/0012b-understand-private-lru-index.html"),
    read("assets/private-lru-domain.svg"),
  ]);

  for (const text of [markdown, en]) {
    assert.match(text, /not.*(?:owner|ownership).*BCB|BCB.*not.*owner/is);
    assert.match(text, /multiple (?:sessions|contexts).*same private (?:LRU|list)/is);
    assert.match(text, /release.*does not.*(?:empty|move).*BCB/is);
    assert.match(text, /thread.*private_lru_index/is);
  }
  for (const term of ["소유권", "같은 private LRU", "private_lru_index", "세션이 해제", "BCB"]) {
    assert.ok(ko.includes(term), term);
  }
  assert.ok(markdown.includes("](../assets/private-lru-domain.svg)"));
  assert.ok(en.includes('src="../../assets/private-lru-domain.svg"'));
  assert.ok(ko.includes('src="../../assets/private-lru-domain.svg"'));
  assert.match(visual, /<svg[^>]+viewBox=/);
  assert.match(visual, /SESSION OR WORKER/);
  assert.match(visual, /THREAD ENTRY/);
  assert.match(visual, /PRIVATE LRU DOMAIN/);
  assert.match(visual, /BCB MEMBERSHIP/);
  assert.doesNotMatch(visual, /[\uac00-\ud7a3]/u);
});

test("adjust_age has an explicit producer, gate, sampling purpose, and cost", async () => {
  const [markdown, en, ko] = await Promise.all([
    read("advanced/replacement-progress.md"),
    read("en/lessons/0012b-understand-private-lru-index.html"),
    read("ko/lessons/0012b-understand-private-lru-index.html"),
  ]);

  for (const text of [markdown, en]) {
    assert.match(text, /only .*pgbuf_adjust_quotas\(\).*increments.*adjust_age|only .*accepted.*pgbuf_adjust_quotas\(\).*increments/is);
    assert.match(text, /100 ms.*does not.*increment|does not increment.*100 ms/is);
    assert.match(text, /one.*BCB.*one.*hit.*epoch/is);
    assert.match(text, /O\(T \+ L \+ D\)/);
    assert.match(text, /ATOMIC_TAS_32.*(?:list|LRU).*hits|lru_hits.*ATOMIC_TAS_32/is);
  }
  for (const term of ["pgbuf_adjust_quotas()", "adjust_age", "100 ms", "epoch", "O(T + L + D)"]) {
    assert.ok(ko.includes(term), term);
  }
});

test("zero-crossing unfix placement and private-to-shared movement are visual and costed", async () => {
  const [markdown, en, ko, visual] = await Promise.all([
    read("advanced/replacement-progress.md"),
    read("en/lessons/0012b-understand-private-lru-index.html"),
    read("ko/lessons/0012b-understand-private-lru-index.html"),
    read("assets/unfix-lru-placement.svg"),
  ]);

  for (const text of [markdown, en]) {
    assert.match(text, /movement.*only.*fcnt.*zero|fcnt.*zero.*movement/is);
    assert.match(text, /private.*(?:differs|different).*shared LRU2 middle/is);
    assert.match(text, /private.*VOID.*shared/is);
    assert.match(text, /BCB mutex.*held.*between|between.*held.*BCB mutex/is);
    assert.match(text, /O\(1 \+ D\)/);
    assert.match(text, /amortized O\(1\).*periodic O\(S\)/is);
    assert.match(text, /periodic O\(S \+ D\)/);
    for (const fn of ["pgbuf_bcb_register_hit_for_lru()", "pgbuf_should_move_private_to_shared()", "pgbuf_get_shared_lru_index_for_add()"] ) {
      assert.ok(text.includes(fn), fn);
    }
  }
  for (const term of ["fcnt", "0", "private", "VOID", "shared LRU2", "BCB mutex", "O(1 + D)"]) {
    assert.ok(ko.includes(term), term);
  }
  assert.ok(markdown.includes("](../assets/unfix-lru-placement.svg)"));
  for (const html of [en, ko]) assert.ok(html.includes('src="../../assets/unfix-lru-placement.svg"'));
  assert.match(visual, /<svg[^>]+viewBox=/);
  for (const label of ["Final unfix", "VOID page", "Private membership", "Shared membership", "LRU2 middle"]) {
    assert.ok(visual.includes(label), label);
  }
  assert.doesNotMatch(visual, /[\uac00-\ud7a3]/u);
});
