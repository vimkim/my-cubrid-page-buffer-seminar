#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "check-maintainer-guide.mjs");

async function write(root, relativePath, contents) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

async function createValidDocumentSet() {
  const fixture = await mkdtemp(path.join(tmpdir(), "maintainer-guide-"));
  const guideRoot = path.join(fixture, "guide");

  await write(
    guideRoot,
    "page-buffer-teaching-material.md",
    [
      "# Guide entry",
      "",
      "[Start learning](./learning/contract.md)",
      "",
      "![A page journey](./assets/page-journey.svg)",
      "",
    ].join("\n"),
  );
  await write(
    guideRoot,
    "learning/contract.md",
    "# Contract\n\n[Use a playbook](../playbooks/change.md)\n",
  );
  await write(
    guideRoot,
    "playbooks/change.md",
    "# Change safely\n\n[Read advanced material](../advanced/concurrency.md)\n",
  );
  await write(
    guideRoot,
    "advanced/concurrency.md",
    "# Concurrency\n\n[Open the source map](../reference/source-map.md)\n",
  );
  await write(
    guideRoot,
    "reference/source-map.md",
    "# Source map\n\n[Evidence](../../evidence.md)\n",
  );
  await write(fixture, "evidence.md", "# Evidence\n");
  await write(
    guideRoot,
    "assets/page-journey.svg",
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">',
      "  <text>Page journey</text>",
      "</svg>",
      "",
    ].join("\n"),
  );

  return guideRoot;
}

async function runValidator(guideRoot, extraArgs = [], options = {}) {
  return execFileAsync(process.execPath, [validator, "--root", guideRoot, ...extraArgs], {
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
}

test("the aggregate command discovers and validates every guide reading mode", async () => {
  const guideRoot = await createValidDocumentSet();
  const result = await runValidator(guideRoot);

  assert.match(result.stdout, /Markdown source: PASS \(5 pages\)/);
  assert.match(result.stdout, /Relative links: PASS/);
  assert.match(result.stdout, /SVG assets: PASS \(1 displayed, 0 orphaned\)/);
  assert.match(result.stdout, /English prose: PASS/);
  assert.match(result.stdout, /Copyparty HTTP: UNAVAILABLE/);
  assert.match(result.stdout, /Live DOM: UNAVAILABLE/);
});

test("the aggregate command rejects a broken reference-style relative link", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "reference/source-map.md",
    "# Source map\n\n[Missing evidence][evidence]\n\n[evidence]: ../../missing.md\n",
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /\.\.\/\.\.\/missing\.md: relative link does not exist/);
    return true;
  });
});

test("the aggregate command rejects a broken shortcut reference link", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "reference/source-map.md",
    "# Source map\n\n[Missing evidence]\n\n[Missing evidence]: ../../missing.md\n",
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /\.\.\/\.\.\/missing\.md: relative link does not exist/);
    return true;
  });
});

test("the aggregate command rejects a missing relative raster image", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    "# Contract\n\n![Missing screenshot](../assets/missing.png)\n",
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /\.\.\/assets\/missing\.png: relative link does not exist/);
    return true;
  });
});

test("the aggregate command rejects a broken raw HTML relative link", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    '# Contract\n\n<a href="../missing.html">Missing evidence</a>\n',
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /\.\.\/missing\.html: relative link does not exist/);
    return true;
  });
});

test("links shown inside code examples are not validated as reader navigation", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    [
      "# Contract",
      "",
      "```markdown",
      "[Example only](../missing-example.md)",
      "```",
      "",
      "Use `[Inline example](../also-missing.md)` when teaching links.",
      "",
    ].join("\n"),
  );

  const result = await runValidator(guideRoot);

  assert.match(result.stdout, /Relative links: PASS/);
});

test("a heading shown inside a code example cannot satisfy a fragment link", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    [
      "# Contract",
      "",
      "[Missing section](#example-heading)",
      "",
      "```markdown",
      "# Example heading",
      "```",
      "",
    ].join("\n"),
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /#example-heading: Markdown heading does not exist/);
    return true;
  });
});

test("an exact hash-pinned legacy file may retain Korean prose during migration", async () => {
  const guideRoot = await createValidDocumentSet();
  const legacyGuide =
    "# Guide entry\n\n이 문서는 아직 migration 중이다.\n\n![A page journey](./assets/page-journey.svg)\n";
  const digest = createHash("sha256").update(legacyGuide).digest("hex");
  await write(guideRoot, "page-buffer-teaching-material.md", legacyGuide);
  await write(
    guideRoot,
    "maintainer-guide-validation.json",
    `${JSON.stringify(
      {
        legacyKoreanSha256: {
          "page-buffer-teaching-material.md": digest,
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runValidator(guideRoot);

  assert.match(result.stdout, /English prose: PASS \(1 hash-pinned legacy exemption\)/);
});

test("the aggregate command requests every page and displayed SVG from Copyparty", async () => {
  const guideRoot = await createValidDocumentSet();
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    const result = await runValidator(guideRoot, [
      "--copyparty-url",
      `http://127.0.0.1:${address.port}/`,
    ]);

    assert.match(result.stdout, /Copyparty HTTP: PASS \(6 resources\)/);
    assert.deepEqual(requests.sort(), [
      "/advanced/concurrency.md?v",
      "/assets/page-journey.svg",
      "/learning/contract.md?v",
      "/page-buffer-teaching-material.md?v",
      "/playbooks/change.md?v",
      "/reference/source-map.md?v",
    ]);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("a nested page may display a root-owned SVG with a fragment", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "page-buffer-teaching-material.md",
    "# Guide entry\n\n[Start learning](./learning/contract.md)\n",
  );
  await write(
    guideRoot,
    "learning/contract.md",
    "# Contract\n\n![A page journey](../assets/page-journey.svg#overview)\n",
  );

  const result = await runValidator(guideRoot);

  assert.match(result.stdout, /SVG assets: PASS \(1 displayed, 0 orphaned\)/);
});

test("every discovered page runs through the configured Markdown source checker", async () => {
  const guideRoot = await createValidDocumentSet();
  const checker = path.join(path.dirname(guideRoot), "checker.py");
  const checkLog = path.join(path.dirname(guideRoot), "checked-pages.txt");
  await writeFile(
    checker,
    [
      "import os",
      "import sys",
      "with open(os.environ['CHECK_LOG'], 'a', encoding='utf-8') as output:",
      "    output.write(sys.argv[1] + '\\n')",
      "",
    ].join("\n"),
    "utf8",
  );

  await runValidator(guideRoot, ["--markdown-checker", checker], {
    env: { CHECK_LOG: checkLog },
  });
  const checkedPages = (await readFile(checkLog, "utf8"))
    .trim()
    .split("\n")
    .map((page) => path.relative(guideRoot, page).split(path.sep).join("/"))
    .sort();

  assert.deepEqual(checkedPages, [
    "advanced/concurrency.md",
    "learning/contract.md",
    "page-buffer-teaching-material.md",
    "playbooks/change.md",
    "reference/source-map.md",
  ]);
});

test("orphan and active SVG assets fail the aggregate command", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "assets/active.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>bad()</script></svg>\n',
  );
  await write(
    guideRoot,
    "assets/orphan.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>\n',
  );
  await write(
    guideRoot,
    "assets/missing-viewbox.svg",
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
  );
  await write(
    guideRoot,
    "learning/contract.md",
    [
      "# Contract",
      "",
      "![Unsafe asset](../assets/active.svg)",
      "",
      "![Unresponsive asset](../assets/missing-viewbox.svg)",
      "",
    ].join("\n"),
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /active\.svg: contains active content/);
    assert.match(error.stderr, /missing-viewbox\.svg: missing SVG root or viewBox/);
    assert.match(error.stderr, /orphan\.svg: orphan SVG/);
    return true;
  });
});

test("an externally hosted displayed SVG fails root asset ownership", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    "# Contract\n\n![External diagram](https://example.com/diagram.svg)\n",
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(
      error.stderr,
      /diagram\.svg: displayed SVG is not owned by the root assets directory/,
    );
    return true;
  });
});

test("inline SVG fails the root asset ownership contract", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    [
      "# Contract",
      "",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
      "",
    ].join("\n"),
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /learning\/contract\.md: inline SVG is outside the root asset seam/);
    return true;
  });
});

test("a raw HTML SVG image still obeys root asset ownership", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    '# Contract\n\n<img src="https://example.com/diagram.svg" alt="External diagram">\n',
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(
      error.stderr,
      /diagram\.svg: displayed SVG is not owned by the root assets directory/,
    );
    return true;
  });
});

test("a displayed SVG may not load remote image content", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "assets/page-journey.svg",
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">',
      '  <image href="https://example.com/pixel.png" width="10" height="10"/>',
      "</svg>",
      "",
    ].join("\n"),
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /page-journey\.svg: contains remote content/);
    return true;
  });
});

test("Korean SVG accessibility text fails the language gate", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "assets/page-journey.svg",
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" aria-label="페이지 여정">',
      "  <title>페이지 버퍼 여정</title>",
      "  <desc>English text elsewhere does not hide Korean accessibility prose.</desc>",
      "</svg>",
      "",
    ].join("\n"),
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /assets\/page-journey\.svg: contains Korean prose/);
    return true;
  });
});

test("a changed hash-pinned legacy file fails the Korean prose gate", async () => {
  const guideRoot = await createValidDocumentSet();
  const legacyGuide =
    "# Guide entry\n\n이 문서는 migration 중이다.\n\n![A page journey](./assets/page-journey.svg)\n";
  await write(guideRoot, "page-buffer-teaching-material.md", legacyGuide);
  await write(
    guideRoot,
    "maintainer-guide-validation.json",
    `${JSON.stringify({
      legacyKoreanSha256: {
        "page-buffer-teaching-material.md": "0".repeat(64),
      },
    })}\n`,
  );

  await assert.rejects(runValidator(guideRoot), (error) => {
    assert.match(error.stderr, /no longer matches its pinned legacy hash/);
    return true;
  });
});

test("Korean inside canonical code identifiers is not treated as prose", async () => {
  const guideRoot = await createValidDocumentSet();
  await write(
    guideRoot,
    "learning/contract.md",
    "# Contract\n\nTrace `페이지_식별자` exactly.\n\n```c\nconst char *페이지_식별자;\n```\n",
  );

  const result = await runValidator(guideRoot);

  assert.match(result.stdout, /English prose: PASS/);
});

test("a failed Copyparty request fails the aggregate command", async () => {
  const guideRoot = await createValidDocumentSet();
  const server = createServer((request, response) => {
    const status = request.url.startsWith("/reference/") ? 404 : 200;
    response.writeHead(status, { "content-type": "text/plain" });
    response.end(status === 200 ? "ok" : "missing");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await assert.rejects(
      runValidator(guideRoot, [
        "--copyparty-url",
        `http://127.0.0.1:${address.port}/`,
      ]),
      (error) => {
        assert.match(error.stderr, /reference\/source-map\.md\?v: Copyparty returned HTTP 404/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
