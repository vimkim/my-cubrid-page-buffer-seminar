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
