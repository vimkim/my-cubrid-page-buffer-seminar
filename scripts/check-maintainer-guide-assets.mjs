#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const guide = path.resolve(
  process.argv[2] ?? "page-buffer-teaching-material.md",
);
const guideDir = path.dirname(guide);
const markdown = fs.readFileSync(guide, "utf8");
const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const images = [...markdown.matchAll(imagePattern)].map((match) => match[1]);
const svgImages = images.filter((target) => target.endsWith(".svg"));
const failures = [];

if (svgImages.length === 0) {
  failures.push("guide contains no SVG images");
}

for (const target of svgImages) {
  if (!target.startsWith("./assets/")) {
    failures.push(`${target}: SVG is not owned by ./assets/`);
    continue;
  }

  const assetPath = path.resolve(guideDir, target);
  if (!fs.existsSync(assetPath)) {
    failures.push(`${target}: file does not exist`);
    continue;
  }

  const svg = fs.readFileSync(assetPath, "utf8");
  if (!/<svg\b/.test(svg) || !/\bviewBox=/.test(svg)) {
    failures.push(`${target}: missing svg root or viewBox`);
  }
  if (/<script\b|javascript:|\son[a-z]+\s*=/i.test(svg)) {
    failures.push(`${target}: contains active content`);
  }
}

if (failures.length > 0) {
  console.error("FAIL: maintainer-guide SVG contract");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `OK: ${svgImages.length} SVG image(s) are local, present, responsive, and inactive`,
);
