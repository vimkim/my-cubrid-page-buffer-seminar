#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guideRoot = path.resolve(scriptDir, "..");
const pagePath = path.join(guideRoot, "learning/01-contract-and-objects.md");
const objectMapPath = path.join(guideRoot, "assets/object-ownership-map.svg");
const stateAxesPath = path.join(guideRoot, "assets/state-axes.svg");
const hangulPattern = /[\u3131-\u318e\u3200-\u321e\u3260-\u327f\ua960-\ua97c\uac00-\ud7a3\ud7b0-\ud7fb]/u;

test("the first lesson leads with the maintainer problem and the conceptual successful-fix postcondition", async () => {
  const markdown = await readFile(pagePath, "utf8");
  const problemAt = markdown.indexOf("## The maintainer problem");
  const postconditionAt = markdown.indexOf("## Successful fix: the conceptual postcondition");

  assert.ok(problemAt > 0, "maintainer problem section");
  assert.ok(postconditionAt > problemAt, "postcondition follows the problem");
  assert.match(markdown, /\*\*Interface contract \(pinned revision\):\*\*/);
  assert.match(markdown, /\*\*Verified mechanism:\*\*/);
  assert.match(markdown, /borrowed.*matching `pgbuf_unfix\(\)`/i);
  assert.match(markdown, /does not prove.*durab/i);

  for (const anchor of [
    "src/storage/page_buffer.h:172-203",
    "src/storage/page_buffer.c:2260-2685",
    "src/storage/page_buffer.c:6277-6634",
    "src/storage/page_buffer.c:3062-3201",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }
});

test("the state model keeps four axes and eight maintenance terms independent", async () => {
  const [markdown, svg] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(stateAxesPath, "utf8"),
  ]);

  assert.match(markdown, /## Four independent state axes/);
  assert.match(markdown, /## Terms that must not collapse/);
  assert.match(
    markdown,
    /!\[Four independent page-buffer state axes\]\(\.\.\/assets\/state-axes\.svg\)/,
  );
  for (const axis of ["Identity / residency", "Ownership", "Concurrency", "Durability / propagation"]) {
    assert.ok(markdown.includes(axis), axis);
  }
  for (const term of ["Fixed", "Resident", "Dirty", "Durable", "Flushed", "Evicted", "Invalidated", "Deallocated"]) {
    assert.ok(markdown.includes(`| **${term}** |`), term);
  }
  for (const distinction of [
    "fixed is not resident",
    "dirty is not durable",
    "unfix is not flush",
    "eviction is not deallocation",
  ]) {
    assert.match(markdown, new RegExp(distinction, "i"));
  }
  for (const anchor of [
    "src/storage/page_buffer.c:499-555",
    "src/storage/page_buffer.c:4921-5096",
    "src/storage/page_buffer.c:8695-8750",
    "src/storage/page_buffer.c:9314-9538",
    "src/storage/page_buffer.c:10723-10962",
    "src/storage/page_buffer.c:15182-15335",
    "src/storage/file_manager.c:6119-6299",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  for (const label of ["1. Identity / residency", "2. Ownership", "3. Concurrency", "4. Durability / propagation"]) {
    assert.ok(svg.includes(label), label);
  }
});

test("the object lesson separates the Module boundary and six object lifetimes", async () => {
  const [markdown, svg] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(objectMapPath, "utf8"),
  ]);

  assert.match(markdown, /## The Module boundary/);
  assert.match(markdown, /## Six objects, six lifetimes/);
  assert.match(
    markdown,
    /!\[Six page-buffer objects and their ownership relationships\]\(\.\.\/assets\/object-ownership-map\.svg\)/,
  );

  for (const term of ["`VPID`", "BCB", "frame", "`PAGE_PTR`", "global `fcnt`", "holder"]) {
    assert.ok(markdown.includes(term), term);
  }
  for (const anchor of [
    "src/compat/dbtype_def.h:956-961",
    "src/storage/storage_common.h:146",
    "src/storage/page_buffer.c:460-555",
    "src/storage/page_buffer.c:5559-5660",
    "src/storage/page_buffer.c:1921-1971",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  for (const label of ["VPID", "BCB", "Frame", "PAGE_PTR", "Global fcnt", "Thread holder"]) {
    assert.ok(svg.includes(label), label);
  }
  assert.match(svg, /Global fcnt = 0 is necessary/);
  assert.match(svg, /not sufficient/);
});

test("the understanding check produces a source-traceable object sketch with an adjacent model answer", async () => {
  const markdown = await readFile(pagePath, "utf8");
  const checkAt = markdown.indexOf("## Understanding check: Predict–Locate–Explain");
  const answerAt = markdown.indexOf("### Model answer");
  const navigationAt = markdown.indexOf("## Learning navigation");

  assert.ok(checkAt > 0, "understanding check");
  assert.ok(answerAt > checkAt, "model answer follows exercise");
  assert.ok(navigationAt > answerAt, "model answer remains adjacent before navigation");
  assert.match(markdown, /### Predict/);
  assert.match(markdown, /### Locate/);
  assert.match(markdown, /### Explain/);
  assert.match(markdown, /object\/lifetime sketch/i);
  assert.match(markdown, /evidence boundary/i);
  assert.match(markdown, /does not establish.*caller correctness/i);

  for (const target of [
    "../page-buffer-teaching-material.md",
    "./02-fix-hold-release.md",
    "../reference/source-map.md",
    "../reference/invariant-index.md",
  ]) {
    assert.ok(markdown.includes(`](${target})`), target);
  }
});
