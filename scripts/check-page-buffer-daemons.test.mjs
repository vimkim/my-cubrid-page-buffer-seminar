#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const note = path.join(root, "reference/dirty-page-flush-actors.md");
const registry = path.join(root, "unresolved-or-version-sensitive-findings.md");
const visual = path.join(root, "assets/page-buffer-daemon-control-loops.svg");
const lifecycleNote = path.join(root, "reference/page-buffer-daemon-lifecycle-audit.md");
const hangulPattern = /[\u3131-\u318e\u3200-\u321e\u3260-\u327f\ua960-\ua97c\uac00-\ud7a3\ud7b0-\ud7fb]/u;

test("the daemon reference separates four peer control loops", async () => {
  const markdown = await readFile(note, "utf8");
  for (const name of [
    "`pgbuf-maintain`",
    "`pgbuf-page-flush`",
    "`pgbuf-page-post-flush`",
    "`pgbuf-flush-control`",
  ]) assert.ok(markdown.includes(name), name);
  for (const boundary of [
    "A demand wake guarantees at least one victim-flush iteration",
    "A timer wake can do zero iterations",
    "capacity 8,192",
    "then wake-only",
    "post-write `fileio_compensate_flush()`",
    "O(T + S + P + D)",
  ]) assert.ok(markdown.includes(boundary), boundary);
  assert.match(markdown, /only `pgbuf-page-flush` selects and submits dirty victim candidates/i);
});

test("the maintenance anomaly is routed through one uncertainty owner", async () => {
  const [markdown, findings] = await Promise.all([
    readFile(note, "utf8"),
    readFile(registry, "utf8"),
  ]);
  assert.match(markdown, /index != start_index/);
  assert.match(markdown, /not a strict assignment\s+maximum/);
  assert.match(markdown, /status as `VS-20`/);
  assert.match(findings, /\| `VS-20` \| \*\*Open source anomaly\*\*/);
  assert.match(findings, /both private and shared loop bodies are therefore skipped as written/);
});

test("the daemon visual shows triggers and boundaries without localized text", async () => {
  const [markdown, svg] = await Promise.all([
    readFile(note, "utf8"),
    readFile(visual, "utf8"),
  ]);
  assert.match(markdown, /!\[The trigger, shared state, work, and output of each page-buffer daemon\]\(\.\.\/assets\/page-buffer-daemon-control-loops\.svg\)/);
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  for (const label of [
    "pgbuf-maintain",
    "pgbuf-page-flush",
    "pgbuf-page-post-flush",
    "pgbuf-flush-control",
    "Only daemon that submits a page flush",
    "circular queue, capacity 8,192",
    "post-write soft-pacing budget",
  ]) assert.ok(svg.includes(label), label);
});

test("the lifecycle audit explains generic timing, gating, wake semantics, and all four cadences", async () => {
  const markdown = await readFile(lifecycleNote, "utf8");
  for (const term of [
    "executes its task once immediately after construction",
    "start-to-start period",
    "Fixed 100 ms",
    "1,000 ms by default",
    "1 ms, 10 ms, 100 ms, then wake-only",
    "Fixed 50 ms",
  ]) assert.ok(markdown.includes(term), term);
  assert.match(markdown, /`wakeup\(\)` only\s+changes a waiter that is currently `SLEEPING`/s);
  assert.match(markdown, /Setting the Boolean gate does\s+not itself call each daemon's `wakeup\(\)`/s);
  assert.match(markdown, /stop\s*(?:→|->)\s*wake(?:\s+sleeper)?\s*(?:→|->)\s*join/i);
  for (const asset of ["page-buffer-daemon-lifecycle.svg", "page-buffer-daemon-cadence.svg", "page-flush-post-flush-handoff.svg", "maintenance-and-pacing-control.svg"]) assert.ok(markdown.includes(`](../assets/${asset})`), asset);
});

test("lessons 6A, 6B, and 6C split lifecycle, flush handoff, and control planes with Korean parity", async () => {
  const paths = [
    "0006a-understand-page-buffer-daemons.html",
    "0006b-follow-page-flush-handoff.html",
    "0006c-follow-maintenance-and-pacing.html",
  ];
  const pairs = await Promise.all(paths.map(async name => Promise.all([
    readFile(path.join(root, "en/lessons", name), "utf8"),
    readFile(path.join(root, "ko/lessons", name), "utf8"),
  ])));
  for (const [en, ko] of pairs) {
    for (const term of ["pgbuf-maintain", "pgbuf-page-flush", "pgbuf-page-post-flush", "pgbuf-flush-control"]) {
      if (en.includes(term)) assert.ok(ko.includes(term), term);
    }
  }
  const [aEn, aKo] = pairs[0];
  for (const text of [aEn, aKo]) for (const term of ["start-to-start", "1,000 ms", "1 → 10 → 100 ms", "50 ms", "stop", "wake", "join"]) assert.ok(text.includes(term), term);
  const [bEn, bKo] = pairs[1];
  for (const text of [bEn, bKo]) for (const term of ["327", "3,270", "8,192", "flushed_bcbs", "O(Q + S + F)"]) assert.ok(text.includes(term), term);
  const [cEn, cKo] = pairs[2];
  for (const text of [cEn, cKo]) for (const term of ["8,192", "81", "500 ms", "128", "500 token", "VS-20", "VS-21"]) assert.ok(text.includes(term), term);
});
