#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guideRoot = path.resolve(scriptDir, "..");
const pagePath = path.join(guideRoot, "learning/02-fix-hold-release.md");
const fixContractPath = path.join(guideRoot, "assets/fix-contract.svg");
const ownershipLedgersPath = path.join(guideRoot, "assets/ownership-ledgers.svg");
const hangulPattern = /[\u3131-\u318e\u3200-\u321e\u3260-\u327f\ua960-\ua97c\uac00-\ud7a3\ud7b0-\ud7fb]/u;

test("the acquisition lesson separates fetch intent, latch mode, and wait condition", async () => {
  const markdown = await readFile(pagePath, "utf8");
  const problemAt = markdown.indexOf("## The maintainer problem");
  const choicesAt = markdown.indexOf("## Start with caller intent: three separate choices");

  assert.ok(problemAt > 0, "maintainer problem");
  assert.ok(choicesAt > problemAt, "caller choices follow the problem");
  assert.match(markdown, /fetch intent.*caller knowledge/i);
  assert.match(markdown, /latch mode.*wait condition.*independent/i);
  assert.match(markdown, /`OLD_PAGE_IF_IN_BUFFER`.*non-acquisition/is);
  assert.match(markdown, /returns `NULL`.*no release debt/is);

  for (const choice of [
    "`PAGE_FETCH_MODE`",
    "`PGBUF_LATCH_MODE`",
    "`PGBUF_LATCH_CONDITION`",
  ]) {
    assert.ok(markdown.includes(choice), choice);
  }
  for (const anchor of [
    "src/storage/page_buffer.h:172-203",
    "src/storage/page_buffer.c:2260-2332",
    "src/storage/page_buffer.c:2408-2413",
    "src/storage/page_buffer.c:6560-6594",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }
});

test("the lesson balances nested fixes through global and per-thread debt ledgers", async () => {
  const [markdown, svg] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(ownershipLedgersPath, "utf8"),
  ]);

  assert.match(markdown, /## Two ledgers, one debt per acquisition/);
  assert.match(markdown, /## Release variants: consume debt at the owning protocol/);
  assert.match(markdown, /## Borrowed pointers end with ownership/);
  assert.match(
    markdown,
    /!\[Global replacement exclusion and per-thread release debt ledgers\]\(\.\.\/assets\/ownership-ledgers\.svg\)/,
  );
  assert.match(markdown, /global `fcnt`.*all threads/is);
  assert.match(markdown, /holder.*current thread.*nested/is);
  assert.match(markdown, /same `PAGE_PTR`.*separate.*debt/is);
  assert.match(markdown, /every successful acquisition creates exactly one release debt/i);
  assert.match(markdown, /address equality.*does not/i);

  for (const release of [
    "`pgbuf_unfix()`",
    "`pgbuf_unfix_and_init()`",
    "`pgbuf_unfix_and_init_after_check()`",
    "`pgbuf_ordered_unfix()`",
    "`pgbuf_unfix_all()`",
  ]) {
    assert.ok(markdown.includes(release), release);
  }
  for (const anchor of [
    "src/storage/page_buffer.h:64-92",
    "src/storage/page_buffer.c:460-488",
    "src/storage/page_buffer.c:6128-6184",
    "src/storage/page_buffer.c:6277-6634",
    "src/storage/page_buffer.c:6636-6883",
    "src/storage/page_buffer.c:3276-3354",
    "src/storage/page_buffer.c:13471-13531",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  for (const label of [
    "BCB global fcnt = 3",
    "Replacement exclusion",
    "Thread A holder fix_count = 2",
    "Thread B holder fix_count = 1",
    "Current-thread debt",
    "One unfix consumes one",
    "Pointer equality does not merge debts",
  ]) {
    assert.ok(svg.includes(label), label);
  }
});

test("the normal resident hit and cold miss converge after explicit identity rechecks", async () => {
  const [markdown, svg] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(fixContractPath, "utf8"),
  ]);

  assert.match(markdown, /## One trace, two preparation paths, one postcondition/);
  assert.match(
    markdown,
    /!\[Normal resident hit and cold miss converging on one fix contract\]\(\.\.\/assets\/fix-contract\.svg\)/,
  );
  assert.match(markdown, /normal resident hit/i);
  assert.match(markdown, /cold miss/i);
  assert.match(markdown, /waiter.*retries lookup/i);
  assert.match(markdown, /ownership debt.*committed/i);
  for (const marker of [
    "Identity recheck 1",
    "Identity recheck 2",
    "Identity recheck 3",
  ]) {
    assert.ok(markdown.includes(marker), marker);
  }
  for (const anchor of [
    "src/storage/page_buffer.c:2342-2546",
    "src/storage/page_buffer.c:7594-7722",
    "src/storage/page_buffer.c:7981-8178",
    "src/storage/page_buffer.c:8392-8634",
    "src/storage/page_buffer.c:6670-6703",
  ]) {
    assert.ok(markdown.includes(`\`${anchor}\``), anchor);
  }

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  assert.doesNotMatch(svg, /lock-free/i);
  for (const label of [
    "Resident hit",
    "Cold miss",
    "Retry lookup",
    "Identity confirmed",
    "Debt commit",
    "Same success postcondition",
  ]) {
    assert.ok(svg.includes(label), label);
  }
});

test("the understanding check yields an annotated call path and balanced debt ledger", async () => {
  const markdown = await readFile(pagePath, "utf8");
  const deferredAt = markdown.indexOf("## Advanced mechanisms deliberately deferred");
  const checkAt = markdown.indexOf("## Understanding check: Predict–Locate–Explain");
  const answerAt = markdown.indexOf("### Model answer");
  const navigationAt = markdown.indexOf("## Learning navigation");

  assert.ok(deferredAt > 0, "advanced boundary");
  assert.ok(checkAt > deferredAt, "understanding check follows lesson");
  assert.ok(answerAt > checkAt, "model answer follows exercise");
  assert.ok(navigationAt > answerAt, "model answer stays adjacent before navigation");
  for (const mechanism of [
    "lock-free READ hit",
    "blocking promotion",
    "ordered watchers",
  ]) {
    assert.ok(markdown.includes(mechanism), mechanism);
  }
  assert.match(markdown, /### Predict/);
  assert.match(markdown, /### Locate/);
  assert.match(markdown, /### Explain/);
  assert.match(markdown, /annotated call path/i);
  assert.match(markdown, /debt ledger/i);
  assert.match(markdown, /global `fcnt`.*1.*2.*3/is);
  assert.match(markdown, /evidence boundary/i);
  assert.match(markdown, /does not prove.*victim/is);

  for (const target of [
    "./01-contract-and-objects.md",
    "./03-caller-completes-correctness.md",
    "../advanced/acquisition-concurrency.md",
  ]) {
    assert.ok(markdown.includes(`](${target})`), target);
  }
});
