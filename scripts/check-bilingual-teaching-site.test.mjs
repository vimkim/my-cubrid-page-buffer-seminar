import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify (execFile);
const checker = path.resolve ("scripts/check-bilingual-teaching-site.mjs");

async function withFixture (callback)
{
  const root = await mkdtemp (path.join (os.tmpdir (), "page-buffer-bilingual-"));
  try
    {
      await mkdir (path.join (root, "en"), { recursive: true });
      await mkdir (path.join (root, "ko"), { recursive: true });
      await writeFile (path.join (root, "index.html"), "<!doctype html><html><body></body></html>\n");
      await writeFile (path.join (root, "en/index.html"), "<!doctype html><html lang=\"en\"><body></body></html>\n");
      await writeFile (path.join (root, "ko/index.html"), "<!doctype html><html lang=\"ko\"><body>한국어</body></html>\n");
      await writeFile (path.join (root, "teaching-pages.json"), JSON.stringify ({
        version: 1,
        expectedPageCount: 1,
        legacyRedirectMinimumDays: 90,
        pages: [{ path: "index.html", en: "en/index.html", ko: "ko/index.html" }]
      }, null, 2));
      await callback (root);
    }
  finally
    {
      await rm (root, { recursive: true, force: true });
    }
}

test ("the inventory gate accepts one complete manifest pair", async () =>
{
  await withFixture (async (root) =>
  {
    const result = await execFileAsync (process.execPath, [checker, "--root", root, "--gate", "inventory"]);
    assert.match (result.stdout, /Inventory and manifest: PASS \(1 pairs\)/);
  });
});

test ("the navigation gate accepts direct accessible counterpart links", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "index.html"), `<!doctype html>
<html lang="en"><body><main data-language-selector>
<a href="en/index.html" hreflang="en">English</a>
<a href="ko/index.html" hreflang="ko" lang="ko">한국어</a>
</main></body></html>\n`);
    await writeFile (path.join (root, "en/index.html"), `<!doctype html>
<html lang="en"><body><nav data-language-switcher aria-label="Language">
<span aria-current="page">EN</span><a href="../ko/index.html" hreflang="ko">KO</a>
</nav></body></html>\n`);
    await writeFile (path.join (root, "ko/index.html"), `<!doctype html>
<html lang="ko"><body><nav data-language-switcher aria-label="언어">
<a href="../en/index.html" hreflang="en">EN</a><span aria-current="page">KO</span>
</nav><p>자연스러운 한국어 설명입니다.</p></body></html>\n`);

    const result = await execFileAsync (process.execPath, [checker, "--root", root, "--gate", "navigation"]);
    assert.match (result.stdout, /Document identity and navigation: PASS \(1 pairs\)/);
  });
});

test ("the links gate resolves local dependencies and safe displayed SVGs", async () =>
{
  await withFixture (async (root) =>
  {
    await mkdir (path.join (root, "assets"), { recursive: true });
    await mkdir (path.join (root, "reference"), { recursive: true });
    await writeFile (path.join (root, "assets/course.css"), "body { color: #123; }\n");
    await writeFile (path.join (root, "assets/course.js"), "document.body.dataset.ready = 'true';\n");
    await writeFile (path.join (root, "assets/map.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>English diagram</title></svg>\n');
    await writeFile (path.join (root, "reference/evidence.md"), "# Evidence\n");
    for (const language of ["en", "ko"])
      {
        await writeFile (path.join (root, `${language}/index.html`), `<!doctype html>
<html lang="${language}"><head><link rel="stylesheet" href="../assets/course.css"></head>
<body><h1 id="start">${language === "ko" ? "시작" : "Start"}</h1>
<a href="#start">Jump</a><a href="../reference/evidence.md">Evidence</a>
<img src="../assets/map.svg" alt="${language === "ko" ? "구조도" : "Map"}">
<script src="../assets/course.js"></script></body></html>\n`);
      }

    const result = await execFileAsync (process.execPath, [checker, "--root", root, "--gate", "links"]);
    assert.match (result.stdout, /Link and asset closure: PASS \(1 pairs\)/);
  });
});

test ("the technical gate rejects translated source identifiers", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "en/index.html"), '<!doctype html><html lang="en"><body><code>PGBUF_LATCH_READ</code><pre>pgbuf_fix ();</pre></body></html>\n');
    await writeFile (path.join (root, "ko/index.html"), '<!doctype html><html lang="ko"><body><code>PGBUF_LATCH_WRITE</code><pre>pgbuf_fix ();</pre><p>설명</p></body></html>\n');

    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "technical"]),
      (error) => /code\/preformatted content differs/.test (error.stderr));
  });
});

test ("the language gate rejects a Korean page without meaningful Korean", async () =>
{
  await withFixture (async (root) =>
  {
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "language"]),
      (error) => /meaningful Korean reader-facing content/.test (error.stderr));
  });
});

test ("the review gate rejects stale reviewed fingerprints", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "teaching-pages.json"), JSON.stringify ({
      version: 1,
      expectedPageCount: 1,
      legacyRedirectMinimumDays: 90,
      pages: [{
        path: "index.html",
        en: "en/index.html",
        ko: "ko/index.html",
        review: { state: "reviewed", reviewedAt: "2026-09-03", reviewer: "reviewer@example.com" },
        fingerprints: { en: "sha256:stale", ko: "sha256:stale" }
      }]
    }, null, 2));

    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "review"]),
      (error) => /stale review fingerprint/.test (error.stderr));
  });
});

test ("the links gate enforces the legacy redirect retention policy", async () =>
{
  await withFixture (async (root) =>
  {
    const manifest = JSON.parse (await readFile (path.join (root, "teaching-pages.json"), "utf8"));
    manifest.legacyRedirectMinimumDays = 30;
    await writeFile (path.join (root, "teaching-pages.json"), JSON.stringify (manifest, null, 2));
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "links"]),
      (error) => /at least 90 days/.test (error.stderr));
  });
});

test ("the static behavior gate rejects incomplete retrieval wiring", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "en/index.html"), `<!doctype html><html lang="en"><body>
<div data-retrieval data-concepts='[{"label":"ownership","terms":["debt"]}]'>
<textarea></textarea><button data-check>Check</button><button data-reveal>Reveal</button><div class="feedback"></div>
</div></body></html>\n`);
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "static"]),
      (error) => /localized retrieval messages/.test (error.stderr));
  });
});

test ("the served gate reports unavailable without a Copyparty URL", async () =>
{
  await withFixture (async (root) =>
  {
    const result = await execFileAsync (process.execPath, [checker, "--root", root, "--gate", "served"]);
    assert.match (result.stdout, /Served HTTP behavior: UNAVAILABLE/);
    assert.doesNotMatch (result.stdout, /Served HTTP behavior: PASS/);
  });
});
