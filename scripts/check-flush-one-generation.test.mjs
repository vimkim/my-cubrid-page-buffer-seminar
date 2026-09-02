#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = path.join(root, "learning/04-flush-one-generation.md");
const visual = path.join(root, "assets/durability-chain.svg");
const lsaVisual = path.join(root, "assets/two-lsa-timeline.svg");
const hangulPattern = /[\u3131-\u318e\u3200-\u321e\u3260-\u327f\ua960-\ua97c\uac00-\ud7a3\ud7b0-\ud7fb]/u;

test("the lesson separates four durability moments and the two LSAs", async () => {
  const markdown = await readFile(page, "utf8");
  assert.doesNotMatch(markdown, /> \*\*Shell status:\*\*/);
  for (const label of [
    "Write permission",
    "Recoverability",
    "Transaction durability",
    "Page propagation",
    "page LSA",
    "`oldest_unflush_lsa`",
  ]) assert.ok(markdown.includes(label), label);
  assert.match(markdown, /worked example/i);
});

test("the generation timeline preserves re-dirty and ordinary rollback", async () => {
  const markdown = await readFile(page, "utf8");
  for (const marker of [
    "stable snapshot",
    "clear `DIRTY`",
    "set `FLUSHING`",
    "release BCB protection",
    "force WAL",
    "submit the copied image",
    "generation G\\+1",
    "restores `DIRTY`",
    "restores.*`oldest_unflush_lsa`",
  ]) assert.match(markdown, new RegExp(marker, "i"), marker);
  for (const anchor of [
    "src/storage/page_buffer.c:10723-10962",
    "src/storage/page_buffer.c:16077-16126",
    "src/transaction/log_page_buffer.c:4150-4189",
  ]) assert.ok(markdown.includes(`\`${anchor}\``), anchor);
});

test("the persistence boundary and evidence cards do not overclaim", async () => {
  const markdown = await readFile(page, "utf8");
  for (const term of ["TDE", "DWB", "direct-write", "home-page persistence"]) {
    assert.match(markdown, new RegExp(term, "i"), term);
  }
  for (const field of ["Setup", "Observation", "Supported conclusion", "Unsupported conclusion", "Receipt"]) {
    assert.ok(markdown.includes(`**${field}:**`), field);
  }
  assert.match(markdown, /`VS-12`.*sole status owner/is);
  assert.doesNotMatch(markdown, /`VS-12`.*\*\*Candidate\*\*/is);
  assert.match(markdown, /fault injection/i);
});

test("the visual and exercise teach the same generation model", async () => {
  const [markdown, svg] = await Promise.all([readFile(page, "utf8"), readFile(visual, "utf8")]);
  assert.match(markdown, /!\[Durability responsibilities and concurrent re-dirty timeline\]\(\.\.\/assets\/durability-chain\.svg\)/);
  for (const label of ["WRITE PERMISSION", "RECOVERABILITY", "TRANSACTION DURABILITY", "PAGE PROPAGATION", "Generation G", "Re-dirty G+1", "G+1 stays DIRTY"]) {
    assert.ok(svg.includes(label), label);
  }
  assert.match(markdown, /## Understanding check: build the generation timeline/);
  assert.match(markdown, /### Model answer/);
  assert.match(markdown, /supported by source.*runtime evidence/is);
});

test("the two-LSA timeline extends the worked example into generation G+1", async () => {
  const [markdown, svg] = await Promise.all([readFile(page, "utf8"), readFile(lsaVisual, "utf8")]);
  const lsaAt = markdown.indexOf("## Two LSAs, two questions");
  const visualAt = markdown.indexOf("](../assets/two-lsa-timeline.svg)");
  const timelineAt = markdown.indexOf("## One flush-generation timeline");
  assert.ok(lsaAt > 0, "two-LSA section");
  assert.ok(visualAt > lsaAt, "visual follows the two-LSA heading");
  assert.ok(timelineAt > visualAt, "visual sits inside the two-LSA section");
  assert.match(
    markdown,
    /!\[Page LSA and oldest_unflush_lsa across two mutations, one flush, and a concurrent re-dirty\]\(\.\.\/assets\/two-lsa-timeline\.svg\)/,
  );
  assert.match(markdown, /new `oldest_unflush_lsa` of 170 for generation G\+1/);

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  for (const label of [
    "page LSA",
    "oldest_unflush_lsa",
    "Flush G starts",
    "140 copied",
    "as the WAL target",
    "100 copied",
    "checkpoint",
    "new bound for G+1",
    "FLUSHING + DIRTY",
    "Completing G clears only FLUSHING",
  ]) {
    assert.ok(svg.includes(label), label);
  }
});
