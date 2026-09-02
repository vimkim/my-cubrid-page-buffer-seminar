#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("the scan cap is one selected LRU3 walk, not a private-list limit", async () => {
  const [core, advanced, evidence, visual] = await Promise.all([
    read("learning/05-replace-one-frame.md"),
    read("advanced/replacement-progress.md"),
    read("reference/victim-scan-cap-and-aout-evidence.md"),
    read("assets/lru-scan-depth-vs-list-count.svg"),
  ]);

  for (const page of [core, advanced, evidence]) {
    assert.match(page, /LRU3|zone[ -]3/i);
    assert.match(page, /prev_BCB/);
  }
  assert.match(core, /one list that has already been selected/i);
  assert.match(advanced, /one selected-list visit budget/i);
  assert.match(evidence, /one selected LRU list/i);
  assert.match(core, /at most 1,000 candidate-position visits inside one selected LRU3/i);
  assert.match(advanced, /at most 1,000 BCB (?:positions|nodes)/i);
  assert.match(evidence, /at most 1,000 BCB nodes/i);
  assert.match(core, /O\(`M \+ K`\)/);
  assert.match(evidence, /O\(M \+ min\(Z, 1000\)\)/);
  assert.match(evidence, /demotion loop is not\s+covered by `MAX_DEPTH`/is);
  assert.match(evidence, /does not\s+inspect 1,000 LRU lists/i);
  assert.match(advanced, /private-list count.*4,050/is);
  assert.match(advanced, /automatic formula.*not clamped.*1,000.*4,050/is);
  assert.match(evidence, /PGBUF_MIN_PAGES_IN_SHARED_LIST/);
  assert.match(evidence, /num_LRU_chains/);

  assert.match(visual, /<svg[^>]+viewBox=/);
  assert.match(visual, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(visual, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(visual, /[\uac00-\ud7a3]/u);
  for (const label of ["P private LRU descriptors", "Candidate-index queue", "Only selected LRU j", "P = MAX_NTRANS + 50", "K ≤ min(reachable Z3, 1,000)"]) {
    assert.ok(visual.includes(label), label);
  }
});

test("AOUT is documented as dormant ghost metadata with bounded evidence", async () => {
  const [advanced, evidence, inventory, uncertain, visual] = await Promise.all([
    read("advanced/replacement-progress.md"),
    read("reference/victim-scan-cap-and-aout-evidence.md"),
    read("source-inventory.md"),
    read("unresolved-or-version-sensitive-findings.md"),
    read("assets/aout-ghost-admission.svg"),
  ]);

  for (const page of [advanced, evidence, inventory, uncertain]) {
    assert.match(page, /CBRD-20741/);
    assert.match(page, /CBRD-21135/);
    assert.match(page, /unknown (?:root )?cause|(?:root )?cause was (?:not known|unknown)/i);
    assert.match(page, /forc(?:e|ibly|es).*zero|overwrites.*zero/is);
  }
  for (const page of [advanced, evidence]) {
    assert.match(page, /ghost/i);
    assert.match(page, /VPID/);
    assert.match(page, /lru_idx/);
    assert.match(page, /32,?768/);
    assert.match(page, /same.*private/is);
    assert.match(page, /different|another|other-private/is);
    assert.match(page, /global.*Aout_mutex/is);
    assert.match(page, /not (?:retain|the).*frame|no BCB.*frame/is);
  }
  assert.match(evidence, /d3554deee3a5e2e6d2030113db550eaea42a5fa4/);
  assert.match(evidence, /Removing the forced-zero line alone is not a complete fix/);
  assert.match(advanced, /benefits.*not measured performance claims/is);
  assert.match(uncertain, /do not claim the dormant pinned code reproduces/i);

  assert.match(visual, /<svg[^>]+viewBox=/);
  assert.match(visual, /<title[^>]*>[^<]{10,}<\/title>/);
  assert.match(visual, /<desc[^>]*>[^<]{20,}<\/desc>/);
  assert.doesNotMatch(visual, /[\uac00-\ud7a3]/u);
  for (const label of ["AOUT remembers an evicted identity, not the page", "{ VPID, former lru_idx }", "AOUT ON · miss", "CBRD-20741", "CBRD-21135", "unknown root cause"]) {
    assert.ok(visual.includes(label), label);
  }
});

test("English and Korean HTML carry the same Q10 mechanisms", async () => {
  const lessons = await Promise.all([
    read("en/lessons/0007-replace-one-frame.html"),
    read("ko/lessons/0007-replace-one-frame.html"),
  ]);
  const cards = await Promise.all([
    read("en/reference/replacement-progress-card.html"),
    read("ko/reference/replacement-progress-card.html"),
  ]);

  for (const html of lessons) {
    for (const term of ["MAX_DEPTH", "prev_BCB", "MAX_NTRANS", "4,050", "AOUT", "CBRD-20741", "CBRD-21135", "Aout_mutex"]) {
      assert.ok(html.includes(term), term);
    }
    assert.match(html, /32,?768/);
    assert.match(html, /lru-scan-depth-vs-list-count\.svg/);
    assert.match(html, /aout-ghost-admission\.svg/);
  }
  for (const html of cards) {
    for (const term of ["MAX_NTRANS", "4,050", "AOUT", "CBRD-20741", "CBRD-21135", "Aout_mutex"]) {
      assert.ok(html.includes(term), term);
    }
    assert.match(html, /lru-scan-depth-vs-list-count\.svg/);
    assert.match(html, /aout-ghost-admission\.svg/);
  }
});
