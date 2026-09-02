import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const questionPagePaths = [
  "questions/README.md",
  "questions/advanced-answers.md",
  "questions/advanced.md",
  "questions/applied-exercises-answers.md",
  "questions/applied-exercises.md",
  "questions/core-answers.md",
  "questions/core.md",
  "questions/maintenance-scenarios-answers.md",
  "questions/maintenance-scenarios.md",
  "questions/migration-audit.md",
].sort();

const routePairs = [
  ["questions/core.md", "questions/core-answers.md"],
  ["questions/advanced.md", "questions/advanced-answers.md"],
  [
    "questions/maintenance-scenarios.md",
    "questions/maintenance-scenarios-answers.md",
  ],
  ["questions/applied-exercises.md", "questions/applied-exercises-answers.md"],
];
const routes = new Set([
  "Core",
  "Advanced",
  "Maintenance scenario",
  "Applied exercise",
]);
const retrievalModes = new Set([
  "Explain",
  "Trace",
  "Scenario",
  "Proof obligation",
]);
const evidenceLabels = [
  "Interface contract",
  "Verified mechanism",
  "Implementation policy",
  "Inference",
  "Runtime observation",
  "Historical evidence",
];
function sequentialLegacyIds(prefix, count, width = 2) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(width, "0")}`,
  );
}

const sourceLegacyItems = {
  TEACH: sequentialLegacyIds("TEACH-", 38),
  ADV: sequentialLegacyIds("PGBUF-Q", 55, 3),
  HIST: sequentialLegacyIds("HIST-", 24),
  PLAN: sequentialLegacyIds("PLAN-", 27),
  EXEC: sequentialLegacyIds("EXEC-", 17),
  GRILL: sequentialLegacyIds("GRILL-", 12),
  READER: sequentialLegacyIds("READER-", 16),
};
const sourceCounts = Object.fromEntries(
  Object.entries(sourceLegacyItems).map(([source, items]) => [source, items.length]),
);
const sourceLegacySets = Object.fromEntries(
  Object.entries(sourceLegacyItems).map(([source, items]) => [source, new Set(items)]),
);
const dispositions = new Set([
  "Retained",
  "Merged",
  "Rewritten",
  "Superseded",
  "Excluded",
]);

function slash(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function headingSlug(text) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function sections(markdown) {
  const matches = [...markdown.matchAll(/^### (PGBUF-QB-[0-9]{3}) — (.+)$/gm)];
  return matches.map((match, index) => ({
    id: match[1],
    title: match[2].trim(),
    body: markdown.slice(
      match.index,
      matches[index + 1]?.index ?? markdown.length,
    ),
  }));
}

function field(body, name) {
  return body.match(new RegExp(`^- \\*\\*${name}:\\*\\* (.+)$`, "m"))?.[1].trim();
}

function validatePrompt(relativePath, item, failures) {
  const route = field(item.body, "Route");
  const mode = field(item.body, "Retrieval mode");
  for (const required of ["Prerequisite", "Capability tested", "Inspect"]) {
    if (!field(item.body, required)) {
      failures.push(`${relativePath}#${item.id}: missing ${required} field`);
    }
  }
  if (!routes.has(route)) {
    failures.push(`${relativePath}#${item.id}: unrecognized Route: ${route ?? "missing"}`);
  }
  if (!retrievalModes.has(mode)) {
    failures.push(
      `${relativePath}#${item.id}: unrecognized Retrieval mode: ${mode ?? "missing"}`,
    );
  }
  if (!/^\*\*Question:\*\*\s+\S/m.test(item.body)) {
    failures.push(`${relativePath}#${item.id}: missing Question field`);
  }
}

function validateAnswer(relativePath, item, failures) {
  const evidence = field(item.body, "Evidence");
  for (const required of [
    "Canonical guide",
    "Source anchors",
    "Confidence/limit",
    "Prompt",
  ]) {
    if (!field(item.body, required)) {
      failures.push(`${relativePath}#${item.id}: missing ${required} field`);
    }
  }
  if (!evidenceLabels.some((label) => evidence?.includes(label))) {
    failures.push(`${relativePath}#${item.id}: missing canonical Evidence label`);
  }
  for (const required of ["Model answer", "Why"]) {
    if (!new RegExp(`^\\*\\*${required}:\\*\\*\\s+\\S`, "m").test(item.body)) {
      failures.push(`${relativePath}#${item.id}: missing ${required} field`);
    }
  }
}

function validateAudit(markdown, canonicalIds, failures) {
  const status = markdown.match(/^\*\*Migration status:\*\* (.+)$/m)?.[1];
  if (status !== "Complete") return;

  const rows = markdown
    .split(/\r?\n/)
    .filter((line) =>
      /^\|\s*`(?:TEACH|ADV|HIST|PLAN|EXEC|GRILL|READER|NEW)`\s*\|\s*`[^`]+`\s*\|/.test(
        line,
      ),
    )
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, "")));
  const seenLegacy = new Set();
  const counts = new Map();
  const mappedCanonical = new Set();

  for (const row of rows) {
    if (row.length !== 6) {
      failures.push("questions/migration-audit.md: migration row must have six fields");
      continue;
    }
    const [source, legacy, topic, disposition, destination, rationale] = row;
    const legacyKey = `${source}:${legacy}`;
    if (seenLegacy.has(legacyKey)) {
      failures.push(`questions/migration-audit.md: duplicate legacy item ${legacyKey}`);
    }
    seenLegacy.add(legacyKey);
    counts.set(source, (counts.get(source) ?? 0) + 1);
    if (source !== "NEW" && !sourceLegacySets[source]?.has(legacy)) {
      failures.push(`questions/migration-audit.md: unexpected legacy item ${legacyKey}`);
    }
    if (!dispositions.has(disposition)) {
      failures.push(`questions/migration-audit.md: invalid disposition ${disposition}`);
    }
    if (!topic || !rationale) {
      failures.push(`questions/migration-audit.md: ${legacyKey} lacks topic or rationale`);
    }
    for (const id of destination.match(/PGBUF-QB-[0-9]{3}/g) ?? []) {
      mappedCanonical.add(id);
      if (!canonicalIds.has(id)) {
        failures.push(`questions/migration-audit.md: unknown canonical destination ${id}`);
      }
    }
    if (source === "READER" && destination === "—") {
      failures.push(`questions/migration-audit.md: ${legacyKey} must map to an answer`);
    }
  }

  for (const [source, expected] of Object.entries(sourceCounts)) {
    if ((counts.get(source) ?? 0) !== expected) {
      failures.push(
        `questions/migration-audit.md: ${source} population is ${counts.get(source) ?? 0}, expected ${expected}`,
      );
    }
    for (const legacy of sourceLegacyItems[source]) {
      if (!seenLegacy.has(`${source}:${legacy}`)) {
        failures.push(`questions/migration-audit.md: missing legacy item ${source}:${legacy}`);
      }
    }
  }
  for (const id of canonicalIds) {
    if (!mappedCanonical.has(id) && !rows.some((row) => row[0] === "NEW" && row[4].includes(id))) {
      failures.push(`questions/migration-audit.md: ${id} has no source disposition`);
    }
  }
}

function validateNavigation(root, pageMarkdown, failures) {
  const required = [
    ["page-buffer-teaching-material.md", "./questions/README.md"],
    ...fs
      .readdirSync(path.join(root, "learning"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => [`learning/${name}`, "../questions/core.md#"]),
    ...fs
      .readdirSync(path.join(root, "advanced"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => [`advanced/${name}`, "../questions/advanced.md#"]),
    ...fs
      .readdirSync(path.join(root, "playbooks"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => [
        `playbooks/${name}`,
        "../questions/maintenance-scenarios.md#",
      ]),
  ];
  for (const [relativePath, target] of required) {
    const markdown = pageMarkdown.get(path.join(root, relativePath));
    if (markdown && !markdown.includes(target)) {
      failures.push(`${relativePath}: missing Question-bank navigation ${target}`);
    }
  }
}

export function validateQuestionBank(root, pageMarkdown, config, failures) {
  const actual = [...pageMarkdown.keys()]
    .map((file) => slash(path.relative(root, file)))
    .filter((relativePath) =>
      relativePath.startsWith("questions/") && relativePath.endsWith(".md"),
    )
    .sort();
  for (const expected of questionPagePaths) {
    if (!actual.includes(expected)) {
      failures.push(`${expected}: approved Question-bank page does not exist`);
    }
  }
  for (const unexpected of actual.filter((file) => !questionPagePaths.includes(file))) {
    failures.push(`${unexpected}: outside the approved Question-bank page set`);
  }
  if (actual.length !== questionPagePaths.length) return;

  const globalPrompts = new Map();
  for (const [promptPath, answerPath] of routePairs) {
    const prompts = sections(pageMarkdown.get(path.join(root, promptPath)) ?? "");
    const answers = sections(pageMarkdown.get(path.join(root, answerPath)) ?? "");
    const promptMap = new Map(prompts.map((item) => [item.id, item]));
    const answerMap = new Map(answers.map((item) => [item.id, item]));

    for (const item of prompts) {
      validatePrompt(promptPath, item, failures);
      if (globalPrompts.has(item.id)) {
        failures.push(`${promptPath}: duplicate canonical ID ${item.id}`);
      }
      globalPrompts.set(item.id, item.title);
    }
    for (const item of answers) validateAnswer(answerPath, item, failures);
    for (const [id, item] of promptMap) {
      if (!answerMap.has(id)) failures.push(`${promptPath}: ${id} has no paired answer`);
      else if (answerMap.get(id).title !== item.title) {
        failures.push(`${promptPath}: ${id} prompt/answer titles differ`);
      } else if (
        !field(answerMap.get(id).body, "Prompt")?.includes(
          `./${path.basename(promptPath)}#${headingSlug(`${id} — ${item.title}`)}`,
        )
      ) {
        failures.push(`${answerPath}: ${id} does not link its exact prompt anchor`);
      }
    }
    for (const id of answerMap.keys()) {
      if (!promptMap.has(id)) failures.push(`${answerPath}: ${id} has no paired prompt`);
    }
  }

  const questionMarkdown = routePairs
    .flat()
    .map((relativePath) => pageMarkdown.get(path.join(root, relativePath)) ?? "")
    .join("\n");
  if (/\bPGBUF-Q[0-9]{3}\b/.test(questionMarkdown)) {
    failures.push("questions/: legacy PGBUF-QNNN ID appears in a canonical route");
  }
  if (/\b(?:PostgreSQL|MySQL|InnoDB)\b/.test(questionMarkdown)) {
    failures.push("questions/: cross-database material appears in a canonical route");
  }
  if (/\/(?:home|Users)\/|\bjustfile\b|\bruntime proof\b/i.test(questionMarkdown)) {
    failures.push("questions/: forbidden personal path, workflow, or evidence vocabulary");
  }

  const audit = pageMarkdown.get(path.join(root, "questions/migration-audit.md")) ?? "";
  validateAudit(audit, new Set(globalPrompts.keys()), failures);
  if (/^\*\*Migration status:\*\* Complete$/m.test(audit)) {
    validateNavigation(root, pageMarkdown, failures);
  }

  for (const [relativePath, expectedDigest] of Object.entries(
    config.readerQuestionIntakeSha256 ?? {},
  )) {
    const intake = path.join(root, relativePath);
    if (!fs.existsSync(intake)) {
      failures.push(`${relativePath}: Reader question intake does not exist`);
      continue;
    }
    const digest = createHash("sha256")
      .update(fs.readFileSync(intake))
      .digest("hex");
    if (digest !== expectedDigest) {
      failures.push(`${relativePath}: Reader question intake digest changed`);
    }
  }
}
