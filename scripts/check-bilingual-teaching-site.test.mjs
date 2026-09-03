import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
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

test ("the inventory gate requires the 47-page course", async () =>
{
  await withFixture (async (root) =>
  {
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "inventory"]),
      (error) => /expectedPageCount must be exactly 47/.test (error.stderr));
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

test ("the links gate rejects duplicate IDs and unresolved fragments", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "en/index.html"), '<!doctype html><html lang="en"><body><h1 id="same">A</h1><p id="same">B</p><a href="#missing">Jump</a></body></html>\n');
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "links"]),
      (error) => /duplicate id same/.test (error.stderr) && /unresolved fragment #missing/.test (error.stderr));
  });
});

test ("the links gate rejects active displayed SVGs", async () =>
{
  await withFixture (async (root) =>
  {
    await mkdir (path.join (root, "assets"), { recursive: true });
    await writeFile (path.join (root, "assets/active.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>\n');
    await writeFile (path.join (root, "en/index.html"), '<!doctype html><html lang="en"><body><img src="../assets/active.svg" alt="Map"></body></html>\n');
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "links"]),
      (error) => /displayed SVG contains active or remote content/.test (error.stderr));
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

test ("the technical gate rejects answer-term drift", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "en/index.html"), '<!doctype html><html lang="en"><body><div data-concepts=\'[{"label":"Ownership","terms":["debt"]}]\'></div></body></html>\n');
    await writeFile (path.join (root, "ko/index.html"), '<!doctype html><html lang="ko"><body><div data-concepts=\'[{"label":"Ownership","terms":["borrow"]}]\'>자연스러운 한국어 설명을 충분히 작성한 학습 페이지입니다.</div></body></html>\n');
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "technical"]),
      (error) => /technical data attributes differs/.test (error.stderr));
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

test ("the language gate rejects an unlocalized accessibility label", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "ko/index.html"), '<!doctype html><html lang="ko"><head><title>한국어 학습</title></head><body><p>자연스러운 한국어 설명을 충분히 제공하여 독자가 내용을 이해할 수 있습니다.</p><textarea aria-label="Write your complete answer"></textarea></body></html>\n');
    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "language"]),
      (error) => /aria-label is not localized: Write your complete answer/.test (error.stderr));
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

test ("the static behavior gate reports a script exception raised at runtime", async () =>
{
  await withFixture (async (root) =>
  {
    await mkdir (path.join (root, "assets"), { recursive: true });
    await writeFile (path.join (root, "assets/runtime.js"), 'document.addEventListener ("DOMContentLoaded", function () { throw new Error ("runtime boom"); });\n');
    await writeFile (path.join (root, "en/index.html"), '<!doctype html><html lang="en"><body><script defer src="../assets/runtime.js"></script></body></html>\n');

    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "static"]),
      (error) => /script execution failed: runtime boom/.test (error.stderr));
  });
});

test ("the static behavior gate exercises retrieval controls", async () =>
{
  await withFixture (async (root) =>
  {
    await mkdir (path.join (root, "assets"), { recursive: true });
    await writeFile (path.join (root, "assets/retrieval.js"), `document.addEventListener ("DOMContentLoaded", function () {
document.querySelectorAll ("[data-retrieval]").forEach (function (quiz) {
quiz.querySelector ("[data-check]").addEventListener ("click", function () { throw new Error ("retrieval click boom"); });
});
});\n`);
    await writeFile (path.join (root, "en/index.html"), `<!doctype html><html lang="en"><body>
<div data-retrieval data-concepts='[{"label":"ownership","terms":["debt"]}]'
 data-coverage-template="{found}/{total} checked" data-complete-message="Complete"
 data-revisit-label="Revisit" data-model-label="Model"><textarea></textarea>
<button data-check>Check</button><button data-reveal>Reveal</button><div class="feedback"></div></div>
<script defer src="../assets/retrieval.js"></script></body></html>\n`);

    await assert.rejects (
      execFileAsync (process.execPath, [checker, "--root", root, "--gate", "static"]),
      (error) => /script execution failed: retrieval click boom/.test (error.stderr));
  });
});

test ("the static behavior gate executes the shared retrieval and ledger contracts", async () =>
{
  await withFixture (async (root) =>
  {
    await mkdir (path.join (root, "assets"), { recursive: true });
    await writeFile (path.join (root, "assets/teach-retrieval.js"), await readFile (path.resolve ("assets/teach-retrieval.js"), "utf8"));
    await writeFile (path.join (root, "assets/teach-ledger.js"), await readFile (path.resolve ("assets/teach-ledger.js"), "utf8"));
    await writeFile (path.join (root, "en/index.html"), `<!doctype html><html lang="en"><body>
<div data-retrieval data-concepts='[{"label":"ownership","terms":["debt"]}]'
 data-coverage-template="{found}/{total} checked" data-complete-message="Complete"
 data-revisit-label="Revisit" data-model-label="Model" data-model="Debt is repaid.">
<textarea></textarea><button data-check>Check</button><button data-reveal>Reveal</button><div class="feedback"></div></div>
<div data-ledger data-removed-label="removed" data-reset-message="Reset" data-a-fix-label="A fix"
 data-b-fix-label="B fix" data-a-unfix-label="A unfix" data-b-unfix-label="B unfix"
 data-rejected-message="Rejected" data-invariant-message="Invariant" data-mismatch-message="Mismatch">
<output data-global></output><output data-holder-a></output><output data-holder-b></output>
<button data-ledger-action="a-fix"></button><button data-ledger-action="b-fix"></button>
<button data-ledger-action="a-unfix"></button><button data-ledger-action="b-unfix"></button>
<button data-ledger-action="reset"></button><p data-ledger-feedback></p><tbody data-ledger-log></tbody></div>
<script defer src="../assets/teach-retrieval.js"></script><script defer src="../assets/teach-ledger.js"></script>
</body></html>\n`);
    const result = await execFileAsync (process.execPath, [checker, "--root", root, "--gate", "static"]);
    assert.match (result.stdout, /Static interaction behavior: PASS \(1 pairs\)/);
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

test ("the served gate rejects a failed page request", async () =>
{
  await withFixture (async (root) =>
  {
    const server = createServer ((request, response) =>
    {
      response.statusCode = request.url === "/ko/index.html" ? 404 : 200;
      response.end ("fixture");
    });
    await new Promise ((resolve) => server.listen (0, "127.0.0.1", resolve));
    try
      {
        const address = server.address ();
        await assert.rejects (
          execFileAsync (process.execPath, [checker, "--root", root, "--gate", "served", "--copyparty-url", `http://127.0.0.1:${address.port}/`]),
          (error) => /ko\/index.html: HTTP 404/.test (error.stderr));
      }
    finally
      {
        await new Promise ((resolve, reject) => server.close ((error) => error ? reject (error) : resolve ()));
      }
  });
});

test ("review fingerprints ignore attribute order even when values contain arrows", async () =>
{
  await withFixture (async (root) =>
  {
    await writeFile (path.join (root, "en/index.html"), '<!doctype html><html lang="en"><body><div data-model="a -> b" class="quiz" id="q">Model</div></body></html>\n');
    const before = JSON.parse ((await execFileAsync (process.execPath, [checker, "--root", root, "--print-fingerprints"])).stdout)[0].en;
    await writeFile (path.join (root, "en/index.html"), '<!doctype html><html lang="en"><body><div id="q" class="quiz" data-model="a -> b">Model</div></body></html>\n');
    const after = JSON.parse ((await execFileAsync (process.execPath, [checker, "--root", root, "--print-fingerprints"])).stdout)[0].en;
    assert.equal (after, before);
  });
});
