#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const guideRoot = path.resolve(scriptDir, "..");

const expectedPages = {
  advanced: [
    "acquisition-concurrency.md",
    "failure-and-proof-obligations.md",
    "recovery-and-lifecycle.md",
    "replacement-progress.md",
    "specialized-interfaces.md",
  ],
  learning: [
    "01-contract-and-objects.md",
    "02-fix-hold-release.md",
    "03-caller-completes-correctness.md",
    "04-flush-one-generation.md",
    "05-replace-one-frame.md",
    "06-maintainer-capstone.md",
  ],
  playbooks: [
    "change-safely.md",
    "debug-by-symptom.md",
    "verify-a-change.md",
  ],
  reference: ["invariant-index.md", "source-map.md"],
};

const pageContracts = {
  "page-buffer-teaching-material.md": {
    level: "Guide entry",
    title: "CUBRID Page Buffer Maintainer Guide",
  },
  "advanced/acquisition-concurrency.md": {
    level: "Advanced",
    title: "Acquisition Concurrency and Multi-page Ownership",
  },
  "advanced/failure-and-proof-obligations.md": {
    level: "Advanced",
    title: "Failure Unwind and Open Proof Obligations",
  },
  "advanced/recovery-and-lifecycle.md": {
    level: "Advanced",
    title: "Recovery, Allocation State, and Module Lifecycle",
  },
  "advanced/replacement-progress.md": {
    level: "Advanced",
    title: "Replacement Policy and Background Progress",
  },
  "advanced/specialized-interfaces.md": {
    level: "Advanced",
    title: "Specialized Interfaces and Approximate Observability",
  },
  "learning/01-contract-and-objects.md": {
    level: "Core",
    title: "Contract and Objects: What a Fix Actually Gives You",
  },
  "learning/02-fix-hold-release.md": {
    level: "Core",
    title: "Fix, Hold, and Release: Borrowing a Resident Page",
  },
  "learning/03-caller-completes-correctness.md": {
    level: "Core",
    title: "Caller Completes Correctness: From Access to Logged Mutation",
  },
  "learning/04-flush-one-generation.md": {
    level: "Core",
    title: "Flush One Generation: WAL, DWB, and Concurrent Re-dirty",
  },
  "learning/05-replace-one-frame.md": {
    level: "Core",
    title: "Replace One Frame: Eligibility Before Policy",
  },
  "learning/06-maintainer-capstone.md": {
    level: "Core",
    title: "Maintainer Capstone: Defend a Safe Change",
  },
  "playbooks/change-safely.md": {
    level: "Playbook",
    title: "Change the Module Safely",
  },
  "playbooks/debug-by-symptom.md": {
    level: "Playbook",
    title: "Diagnose Page-buffer Symptoms",
  },
  "playbooks/verify-a-change.md": {
    level: "Playbook",
    title: "Verify at the Risk Boundary",
  },
  "reference/invariant-index.md": {
    level: "Reference",
    title: "Maintainer Invariant Index",
  },
  "reference/source-map.md": {
    level: "Reference",
    title: "Source and Caller Map",
  },
};

const learningOrder = expectedPages.learning.map((page) => `learning/${page}`);
const learningRelatedCrossLinks = {
  "learning/01-contract-and-objects.md": [
    "../reference/source-map.md",
    "../reference/invariant-index.md",
  ],
  "learning/02-fix-hold-release.md": [
    "../advanced/acquisition-concurrency.md",
  ],
  "learning/03-caller-completes-correctness.md": [
    "../advanced/acquisition-concurrency.md",
    "../advanced/recovery-and-lifecycle.md",
  ],
  "learning/04-flush-one-generation.md": [
    "../advanced/recovery-and-lifecycle.md",
    "../unresolved-or-version-sensitive-findings.md",
  ],
  "learning/05-replace-one-frame.md": [
    "../advanced/replacement-progress.md",
  ],
  "learning/06-maintainer-capstone.md": [
    "../advanced/failure-and-proof-obligations.md",
    "../source-inventory.md",
  ],
};
const advancedPrerequisites = {
  "advanced/acquisition-concurrency.md": [
    "../learning/02-fix-hold-release.md",
  ],
  "advanced/failure-and-proof-obligations.md": [
    "../learning/01-contract-and-objects.md",
    "../learning/02-fix-hold-release.md",
    "../learning/03-caller-completes-correctness.md",
    "../learning/04-flush-one-generation.md",
    "../learning/05-replace-one-frame.md",
    "../learning/06-maintainer-capstone.md",
    "./acquisition-concurrency.md",
    "./recovery-and-lifecycle.md",
    "./replacement-progress.md",
    "./specialized-interfaces.md",
  ],
  "advanced/recovery-and-lifecycle.md": [
    "../learning/03-caller-completes-correctness.md",
    "../learning/04-flush-one-generation.md",
  ],
  "advanced/replacement-progress.md": [
    "../learning/04-flush-one-generation.md",
    "../learning/05-replace-one-frame.md",
  ],
  "advanced/specialized-interfaces.md": [
    "../learning/01-contract-and-objects.md",
    "../learning/02-fix-hold-release.md",
  ],
};

const advancedCrossLinks = {
  "advanced/acquisition-concurrency.md": [
    "../learning/02-fix-hold-release.md",
    "../playbooks/change-safely.md",
    "../playbooks/debug-by-symptom.md",
    "../reference/source-map.md",
  ],
  "advanced/failure-and-proof-obligations.md": [
    "../learning/06-maintainer-capstone.md",
    "../playbooks/verify-a-change.md",
    "../source-inventory.md",
    "../unresolved-or-version-sensitive-findings.md",
  ],
  "advanced/recovery-and-lifecycle.md": [
    "../learning/03-caller-completes-correctness.md",
    "../learning/04-flush-one-generation.md",
    "../playbooks/verify-a-change.md",
    "../reference/source-map.md",
  ],
  "advanced/replacement-progress.md": [
    "../learning/04-flush-one-generation.md",
    "../learning/05-replace-one-frame.md",
    "../playbooks/debug-by-symptom.md",
    "../playbooks/verify-a-change.md",
  ],
  "advanced/specialized-interfaces.md": [
    "../learning/01-contract-and-objects.md",
    "../learning/02-fix-hold-release.md",
    "../playbooks/debug-by-symptom.md",
    "../reference/source-map.md",
  ],
};

const operationalCrossLinks = {
  "playbooks/change-safely.md": [
    "../learning/01-contract-and-objects.md",
    "../learning/02-fix-hold-release.md",
    "../reference/invariant-index.md",
    "../reference/source-map.md",
    "./verify-a-change.md",
  ],
  "playbooks/debug-by-symptom.md": [
    "../learning/02-fix-hold-release.md",
    "../reference/source-map.md",
    "../unresolved-or-version-sensitive-findings.md",
    "./verify-a-change.md",
  ],
  "playbooks/verify-a-change.md": [
    "../advanced/failure-and-proof-obligations.md",
    "../source-inventory.md",
    "../unresolved-or-version-sensitive-findings.md",
    "./change-safely.md",
  ],
  "reference/invariant-index.md": [
    "../learning/01-contract-and-objects.md",
    "../playbooks/change-safely.md",
    "../playbooks/verify-a-change.md",
  ],
  "reference/source-map.md": [
    "../learning/01-contract-and-objects.md",
    "../playbooks/debug-by-symptom.md",
    "../source-inventory.md",
    "../unresolved-or-version-sensitive-findings.md",
  ],
};

const guideRoutes = {
  "Check evidence and uncertainty": "./source-inventory.md",
  "Continue to Advanced work": "./advanced/acquisition-concurrency.md",
  "Diagnose a symptom": "./playbooks/debug-by-symptom.md",
  "Find the source": "./reference/source-map.md",
  "Learn the module": "./learning/01-contract-and-objects.md",
  "Verify a change": "./playbooks/verify-a-change.md",
  "Work on a change": "./playbooks/change-safely.md",
};

async function markdownFiles(directory) {
  try {
    return (await readdir(path.join(guideRoot, directory)))
      .filter((entry) => entry.endsWith(".md"))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

test("the document set exposes exactly the approved page boundaries", async () => {
  for (const [directory, expected] of Object.entries(expectedPages)) {
    assert.deepEqual(await markdownFiles(directory), expected, directory);
  }
});

test("every page starts with its approved reader contract and incomplete status", async () => {
  for (const [relativePath, contract] of Object.entries(pageContracts)) {
    const markdown = await readFile(path.join(guideRoot, relativePath), "utf8");
    const escapedTitle = contract.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const opening = new RegExp(
      [
        `^# ${escapedTitle}`,
        "",
        `\\*\\*Level:\\*\\* ${contract.level}`,
        "\\*\\*Prerequisites:\\*\\* .+",
        "\\*\\*Capability gained:\\*\\* .+",
        "\\*\\*Source baseline:\\*\\* `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`",
        "\\*\\*Evidence used:\\*\\* .+",
      ].join("\\n"),
      "m",
    );

    assert.match(markdown, opening, relativePath);
    if (relativePath === "page-buffer-teaching-material.md") {
      assert.match(
        markdown,
        /> \*\*Shell status:\*\* Incomplete\. The document-set destinations remain shells;/,
        relativePath,
      );
    } else {
      assert.match(markdown, /> \*\*Shell status:\*\* Incomplete\./, relativePath);
    }
  }
});

test("learning navigation and advanced prerequisites preserve the approved dependency graph", async () => {
  for (const [index, relativePath] of learningOrder.entries()) {
    const markdown = await readFile(path.join(guideRoot, relativePath), "utf8");
    const previousTarget =
      index === 0
        ? "../page-buffer-teaching-material.md"
        : `./${path.basename(learningOrder[index - 1])}`;

    assert.ok(markdown.includes(`](${previousTarget})`), `${relativePath} previous`);
    if (index < learningOrder.length - 1) {
      const nextTarget = `./${path.basename(learningOrder[index + 1])}`;
      assert.ok(markdown.includes(`](${nextTarget})`), `${relativePath} next`);
    } else {
      assert.match(markdown, /\.\.\/playbooks\/change-safely\.md/);
      assert.match(markdown, /\.\.\/advanced\/acquisition-concurrency\.md/);
    }
    assert.match(markdown, /## Related routes/);
    assert.match(markdown, /\.\.\/playbooks\//);
    assert.match(markdown, /\.\.\/(?:reference\/|source-inventory\.md|unresolved-or-version-sensitive-findings\.md)/);
  }

  for (const [relativePath, prerequisites] of Object.entries(
    advancedPrerequisites,
  )) {
    const markdown = await readFile(path.join(guideRoot, relativePath), "utf8");
    for (const prerequisite of prerequisites) {
      assert.ok(markdown.includes(`](${prerequisite})`), `${relativePath} -> ${prerequisite}`);
    }
  }

  for (const [relativePath, targets] of Object.entries(
    learningRelatedCrossLinks,
  )) {
    const markdown = await readFile(path.join(guideRoot, relativePath), "utf8");
    for (const target of targets) {
      assert.ok(markdown.includes(`](${target})`), `${relativePath} -> ${target}`);
    }
  }
});

test("playbooks and compact references route outward without duplicating explanations", async () => {
  for (const [relativePath, targets] of Object.entries(operationalCrossLinks)) {
    const markdown = await readFile(path.join(guideRoot, relativePath), "utf8");
    assert.match(markdown, /## Planned scope/, relativePath);
    assert.match(markdown, /## Related routes/, relativePath);
    for (const target of targets) {
      assert.ok(markdown.includes(`](${target})`), `${relativePath} -> ${target}`);
    }
  }
});

test("advanced shells expose their approved prerequisites and return routes", async () => {
  for (const [relativePath, targets] of Object.entries(advancedCrossLinks)) {
    const markdown = await readFile(path.join(guideRoot, relativePath), "utf8");
    assert.match(markdown, /## Planned scope/, relativePath);
    assert.match(markdown, /## Related routes/, relativePath);
    for (const target of targets) {
      assert.ok(markdown.includes(`](${target})`), `${relativePath} -> ${target}`);
    }
  }
});

test("the guide entry exposes every route while retaining the usable monolith", async () => {
  const markdown = await readFile(
    path.join(guideRoot, "page-buffer-teaching-material.md"),
    "utf8",
  );

  assert.match(markdown, /## Maintainer routes/);
  assert.match(markdown, /^# CUBRID Page Buffer Maintainer Guide$/m);
  for (const [label, target] of Object.entries(guideRoutes)) {
    assert.ok(markdown.includes(`[${label}](${target})`), `${label} -> ${target}`);
  }
  assert.ok(
    markdown.includes(
      "[Evidence and uncertainty registry](./unresolved-or-version-sensitive-findings.md)",
    ),
  );
  assert.ok(markdown.indexOf("## Maintainer routes") < markdown.indexOf("## Contents"));
  assert.match(markdown, /## 1\. Start here/);
});
