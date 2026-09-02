#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const page = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../learning/06-maintainer-capstone.md");
const visual = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/exceptional-return-gaps.svg");
const hangulPattern = /[\u3131-\u318e\u3200-\u321e\u3260-\u327f\ua960-\ua97c\uac00-\ud7a3\ud7b0-\ud7fb]/u;

test("the capstone supplies the complete change-impact template", async () => {
  const m = await readFile(page, "utf8");
  assert.doesNotMatch(m, /> \*\*Shell status:\*\*/);
  for (const field of ["Behavior", "Owners", "State", "Guards", "Invariants", "Unwind", "Caller impact", "Evidence seam", "Remaining uncertainty"]) assert.ok(m.includes(`**${field}:**`), field);
});

test("both candidate packets route status and name missing proof", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /## Packet A: `VS-11`/);
  assert.match(m, /## Packet B: `VS-12`/);
  assert.match(m, /uncertainty registry.*alone owns `VS-11` status/is);
  assert.match(m, /uncertainty registry.*alone owns `VS-12` status/is);
  assert.doesNotMatch(m, /\*\*Candidate\*\*|Candidate status/i);
  assert.match(m, /holder extension allocation failure/i);
  assert.match(m, /TDE.*DWB-slot.*fault injection/is);
  assert.match(m, /source-grounded argument.*runtime observation/is);
});

test("completion, applied handoff, and peer review gates are explicit", async () => {
  const m = await readFile(page, "utf8");
  assert.match(m, /either packet.*core completion/is);
  assert.match(m, /both packets.*advanced preparation/is);
  assert.match(m, /controlled caller regression|narrow runtime probe/i);
  assert.match(m, /target revision/i);
  assert.match(m, /another maintainer.*review/is);
  assert.match(m, /### Model answer A/);
  assert.match(m, /### Model answer B/);
});

test("the shared packet shape is shown before the packets and stays a map, not a defect claim", async () => {
  const [m, svg] = await Promise.all([readFile(page, "utf8"), readFile(visual, "utf8")]);
  const shapeAt = m.indexOf("## The shape both packets share");
  const visualAt = m.indexOf("](../assets/exceptional-return-gaps.svg)");
  const packetAAt = m.indexOf("## Packet A: `VS-11`");
  assert.ok(shapeAt > 0, "shared shape section");
  assert.ok(visualAt > shapeAt, "visual follows the shape heading");
  assert.ok(packetAAt > visualAt, "packet A follows the visual");
  assert.match(
    m,
    /!\[Shared shape of the two capstone packets: state changed, fallible callee, early return before ordinary cleanup\]\(\.\.\/assets\/exceptional-return-gaps\.svg\)/,
  );
  assert.match(m, /not a defect claim/i);
  assert.match(m, /asserts in a debug build/i);

  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
  assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
  assert.doesNotMatch(svg, hangulPattern);
  assert.doesNotMatch(svg, /defect|Candidate/i);
  for (const label of [
    "PACKET A",
    "VS-11",
    "PACKET B",
    "VS-12",
    "State changed first",
    "Fallible callee",
    "Visible early return",
    "fault injection",
    "uncertainty registry",
  ]) {
    assert.ok(svg.includes(label), label);
  }
});
