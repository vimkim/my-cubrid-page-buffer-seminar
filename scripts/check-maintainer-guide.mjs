#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalizeHeadingSlug } from "./markdown-heading-slug.mjs";
import { validateQuestionBank } from "./question-bank-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");
const defaultMarkdownChecker =
  "/home/vimkim/.agents/skills/markdown-write/scripts/check_copyparty_markdown.py";
const guideEntry = "page-buffer-teaching-material.md";
const readingModeDirectories = [
  "learning",
  "playbooks",
  "advanced",
  "reference",
  "questions",
];
const hangulPattern = /[\uac00-\ud7a3]/u;
const validationConfigName = "maintainer-guide-validation.json";

function parseArguments(argv) {
  const options = {
    root: defaultRoot,
    markdownChecker:
      process.env.COPYPARTY_MARKDOWN_CHECKER ?? defaultMarkdownChecker,
    copypartyUrl: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--root" && value) {
      options.root = path.resolve(value);
      index += 1;
    } else if (argument === "--markdown-checker" && value) {
      options.markdownChecker = path.resolve(value);
      index += 1;
    } else if (argument === "--copyparty-url" && value) {
      options.copypartyUrl = value;
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${argument}`);
    }
  }

  return options;
}

function walkMarkdown(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkMarkdown(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
    });
}

function discoverPages(root, failures) {
  const entryPath = path.join(root, guideEntry);
  if (!fs.existsSync(entryPath)) {
    failures.push(`${guideEntry}: guide entry does not exist`);
  }

  return [
    ...(fs.existsSync(entryPath) ? [entryPath] : []),
    ...readingModeDirectories.flatMap((directory) =>
      walkMarkdown(path.join(root, directory)),
    ),
  ];
}

function markdownOutsideFences(markdown) {
  const visibleLines = [];
  let fenceCharacter = "";
  let fenceLength = 0;

  for (const line of markdown.split(/\r?\n/)) {
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fenceCharacter && opening) {
      fenceCharacter = opening[1][0];
      fenceLength = opening[1].length;
      visibleLines.push("");
      continue;
    }
    if (fenceCharacter) {
      const closing = line.trimStart().match(/^(`+|~+)\s*$/);
      if (
        closing &&
        closing[1][0] === fenceCharacter &&
        closing[1].length >= fenceLength
      ) {
        fenceCharacter = "";
        fenceLength = 0;
      }
      visibleLines.push("");
      continue;
    }

    visibleLines.push(line);
  }

  return visibleLines.join("\n");
}

function markdownOutsideCode(markdown) {
  return markdownOutsideFences(markdown)
    .split("\n")
    .map((line) => line.replace(/(`+)(.*?)\1/g, ""))
    .join("\n");
}

function htmlAttribute(attributes, name) {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function extractMarkdownTargets(markdown) {
  const visibleMarkdown = markdownOutsideCode(markdown);
  const inlinePattern =
    /(!?)\[([^\]]*)]\((<[^>]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g;
  const targets = [...visibleMarkdown.matchAll(inlinePattern)].map((match) => ({
    image: match[1] === "!",
    alt: match[2],
    target: match[3].replace(/^<|>$/g, ""),
  }));

  const definitions = new Map(
    [...visibleMarkdown.matchAll(/^ {0,3}\[([^\]]+)]:\s*(<[^>]+>|\S+)/gm)].map(
      (match) => [
        match[1].trim().toLowerCase(),
        match[2].replace(/^<|>$/g, ""),
      ],
    ),
  );
  const referencePattern = /(!?)\[([^\]]+)]\[([^\]]*)]/g;
  for (const match of visibleMarkdown.matchAll(referencePattern)) {
    const label = (match[3] || match[2]).trim().toLowerCase();
    const target = definitions.get(label);
    if (target) {
      targets.push({ image: match[1] === "!", alt: match[2], target });
    }
  }

  const shortcutPattern = /(!?)\[([^\]]+)](?![\[(:])/g;
  for (const match of visibleMarkdown.matchAll(shortcutPattern)) {
    if (match.index > 0 && visibleMarkdown[match.index - 1] === "]") {
      continue;
    }
    const target = definitions.get(match[2].trim().toLowerCase());
    if (target) {
      targets.push({ image: match[1] === "!", alt: match[2], target });
    }
  }

  for (const match of visibleMarkdown.matchAll(/<img\b([^>]*)>/gi)) {
    const attributes = match[1];
    const source = htmlAttribute(attributes, "src");
    if (!source) {
      continue;
    }
    targets.push({
      image: true,
      alt: htmlAttribute(attributes, "alt") ?? "",
      target: source,
    });
  }

  for (const match of visibleMarkdown.matchAll(/<a\b([^>]*)>/gi)) {
    const target = htmlAttribute(match[1], "href");
    if (target) {
      targets.push({ image: false, alt: "", target });
    }
  }

  return targets;
}

function isExternalTarget(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
}

function splitTarget(target) {
  const hashIndex = target.indexOf("#");
  const pathAndQuery = hashIndex < 0 ? target : target.slice(0, hashIndex);
  const queryIndex = pathAndQuery.indexOf("?");
  return {
    pathname:
      queryIndex < 0 ? pathAndQuery : pathAndQuery.slice(0, queryIndex),
    fragment: hashIndex < 0 ? "" : target.slice(hashIndex + 1),
  };
}

function headingSlugs(markdown) {
  const counts = new Map();
  const slugs = new Set();

  for (const line of markdownOutsideFences(markdown).split(/\r?\n/)) {
    const match = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) {
      continue;
    }

    const base = normalizeHeadingSlug(match[1]);
    const duplicateIndex = counts.get(base) ?? 0;
    counts.set(base, duplicateIndex + 1);
    slugs.add(duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`);
  }

  return slugs;
}

function resolvedRelativeTarget(page, rawTarget) {
  let decodedTarget;
  try {
    decodedTarget = decodeURIComponent(rawTarget);
  } catch {
    decodedTarget = rawTarget;
  }
  const { pathname, fragment } = splitTarget(decodedTarget);
  return {
    targetPath: pathname
      ? path.resolve(path.dirname(page), pathname)
      : page,
    fragment,
  };
}

function validateLinks(pages, pageMarkdown, failures) {
  for (const page of pages) {
    for (const link of extractMarkdownTargets(pageMarkdown.get(page))) {
      if (isExternalTarget(link.target)) {
        continue;
      }

      const { targetPath, fragment } = resolvedRelativeTarget(page, link.target);
      if (!fs.existsSync(targetPath)) {
        failures.push(
          `${path.relative(path.dirname(page), page)} -> ${
            link.target
          }: relative link does not exist`,
        );
        continue;
      }

      if (fragment && fs.statSync(targetPath).isFile() && targetPath.endsWith(".md")) {
        const targetMarkdown = fs.readFileSync(targetPath, "utf8");
        if (!headingSlugs(targetMarkdown).has(fragment)) {
          failures.push(`${link.target}: Markdown heading does not exist`);
        }
      }
    }
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function validateAssets(root, pages, pageMarkdown, failures) {
  const assetRoot = path.resolve(root, "assets");
  const displayedAssets = new Set();

  for (const page of pages) {
    if (/<svg\b/i.test(markdownOutsideCode(pageMarkdown.get(page)))) {
      failures.push(
        `${path.relative(root, page)}: inline SVG is outside the root asset seam`,
      );
    }
    for (const image of extractMarkdownTargets(pageMarkdown.get(page))) {
      if (!image.image) {
        continue;
      }

      const svgTarget =
        splitTarget(image.target).pathname.toLowerCase().endsWith(".svg") ||
        image.target.toLowerCase().startsWith("data:image/svg+xml");
      if (!svgTarget) {
        continue;
      }
      if (isExternalTarget(image.target)) {
        failures.push(
          `${image.target}: displayed SVG is not owned by the root assets directory`,
        );
        continue;
      }

      const { targetPath } = resolvedRelativeTarget(page, image.target);
      if (!isInside(assetRoot, targetPath)) {
        failures.push(`${image.target}: displayed SVG is outside the root assets directory`);
        continue;
      }
      if (!fs.existsSync(targetPath)) {
        failures.push(`${image.target}: displayed SVG does not exist`);
        continue;
      }

      const realAssetRoot = fs.realpathSync(assetRoot);
      const realTarget = fs.realpathSync(targetPath);
      if (!isInside(realAssetRoot, realTarget)) {
        failures.push(`${image.target}: displayed SVG resolves outside the root assets directory`);
        continue;
      }

      displayedAssets.add(realTarget);
      const svg = fs.readFileSync(realTarget, "utf8");
      if (!/<svg\b/i.test(svg) || !/\bviewBox\s*=/i.test(svg)) {
        failures.push(`${image.target}: missing SVG root or viewBox`);
      }
      if (/<script\b|<foreignObject\b|javascript:|\son[a-z]+\s*=/i.test(svg)) {
        failures.push(`${image.target}: contains active content`);
      }
      if (
        /<(?:image|use)\b[^>]*(?:href|xlink:href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(
          svg,
        ) ||
        /(?:@import|url\()\s*["']?\s*(?:https?:)?\/\//i.test(svg)
      ) {
        failures.push(`${image.target}: contains remote content`);
      }
    }
  }

  const ownedAssets = fs.existsSync(assetRoot)
    ? fs
        .readdirSync(assetRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
        .map((entry) => fs.realpathSync(path.join(assetRoot, entry.name)))
    : [];
  const orphanAssets = ownedAssets.filter((asset) => !displayedAssets.has(asset));
  for (const orphan of orphanAssets) {
    failures.push(`${path.relative(root, orphan)}: orphan SVG is not displayed by a guide page`);
  }

  return {
    displayed: displayedAssets.size,
    displayedAssets: [...displayedAssets],
    orphaned: orphanAssets.length,
  };
}

function proseOnly(markdown) {
  return markdownOutsideCode(markdown)
    .replace(/\[[^\]]*]\((?:<[^>]+>|[^)]+)\)/g, (link) =>
      link.replace(/\]\([\s\S]*$/, "]"),
    );
}

function svgText(svg) {
  const elementText = [
    ...svg.matchAll(/<(text|title|desc)\b[^>]*>([\s\S]*?)<\/\1>/gi),
  ].map((match) => match[2].replace(/<[^>]*>/g, " "));
  const attributeText = [
    ...svg.matchAll(/\b(?:aria-label|title)\s*=\s*(["'])([\s\S]*?)\1/gi),
  ].map((match) => match[2]);

  return [...elementText, ...attributeText]
    .join(" ")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) =>
      String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)),
    );
}

function loadValidationConfig(root, failures) {
  const configPath = path.join(root, validationConfigName);
  if (!fs.existsSync(configPath)) {
    return { legacyKoreanSha256: {} };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      legacyKoreanSha256: config.legacyKoreanSha256 ?? {},
      readerQuestionIntakeSha256:
        config.readerQuestionIntakeSha256 ?? {},
    };
  } catch (error) {
    failures.push(`${validationConfigName}: invalid JSON: ${error.message}`);
    return { legacyKoreanSha256: {}, readerQuestionIntakeSha256: {} };
  }
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function validateLanguage(root, pages, pageMarkdown, config, failures) {
  let exemptions = 0;

  const validateProse = (file, contents, prose) => {
    if (!hangulPattern.test(prose)) {
      return;
    }

    const relativePath = path.relative(root, file).split(path.sep).join("/");
    const expectedDigest = config.legacyKoreanSha256[relativePath];
    if (expectedDigest && sha256(contents) === expectedDigest) {
      exemptions += 1;
      return;
    }
    failures.push(
      `${relativePath}: contains Korean prose${
        expectedDigest ? " and no longer matches its pinned legacy hash" : ""
      }`,
    );
  };

  for (const page of pages) {
    const markdown = pageMarkdown.get(page);
    validateProse(page, markdown, proseOnly(markdown));
  }

  const assetRoot = path.join(root, "assets");
  if (fs.existsSync(assetRoot)) {
    for (const entry of fs.readdirSync(assetRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".svg")) {
        continue;
      }
      const asset = path.join(assetRoot, entry.name);
      const svg = fs.readFileSync(asset, "utf8");
      validateProse(asset, svg, svgText(svg));
    }
  }

  return exemptions;
}

function validateMarkdownSource(pages, checker, failures) {
  if (!fs.existsSync(checker)) {
    failures.push(`${checker}: Copyparty Markdown checker does not exist`);
    return;
  }

  for (const page of pages) {
    const result = spawnSync("python", [checker, page], { encoding: "utf8" });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout).trim();
      failures.push(`${page}: Copyparty Markdown check failed${detail ? `: ${detail}` : ""}`);
    }
  }
}

async function validateCopypartyHttp(root, pages, assets, baseUrl, failures) {
  if (!baseUrl) {
    return { available: false, resources: 0 };
  }

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const resources = [
    ...pages.map((page) => ({ file: page, viewer: true })),
    ...assets.map((asset) => ({ file: asset, viewer: false })),
  ];

  await Promise.all(
    resources.map(async ({ file, viewer }) => {
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      const resourceUrl = new URL(relativePath, normalizedBaseUrl);
      if (viewer) {
        resourceUrl.search = "v";
      }

      try {
        const response = await fetch(resourceUrl, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          failures.push(
            `${resourceUrl.href}: Copyparty returned HTTP ${response.status}`,
          );
        }
      } catch (error) {
        failures.push(`${resourceUrl.href}: Copyparty request failed: ${error.message}`);
      }
    }),
  );

  return { available: true, resources: resources.length };
}

async function validateLiveDom(root, pages, pageMarkdown, baseUrl, failures) {
  if (!baseUrl) {
    return { available: false, reason: "no --copyparty-url", pages: 0 };
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    return { available: false, reason: "Playwright is not installed", pages: 0 };
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    return {
      available: false,
      reason: `browser could not launch: ${error.message}`,
      pages: 0,
    };
  }

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  try {
    const context = await browser.newContext();
    for (const pagePath of pages) {
      const relativePath = path.relative(root, pagePath).split(path.sep).join("/");
      const viewerUrl = new URL(relativePath, normalizedBaseUrl);
      viewerUrl.search = "v";
      const renderErrors = [];
      const browserPage = await context.newPage();
      browserPage.on("pageerror", (error) => renderErrors.push(error.message));
      browserPage.on("console", (message) => {
        if (message.type() === "error") {
          renderErrors.push(message.text());
        }
      });

      try {
        const response = await browserPage.goto(viewerUrl.href, {
          waitUntil: "networkidle",
          timeout: 15000,
        });
        if (!response?.ok()) {
          failures.push(
            `${relativePath}: rendered page returned HTTP ${response?.status() ?? "unknown"}`,
          );
          continue;
        }

        const expectedImages = extractMarkdownTargets(
          pageMarkdown.get(pagePath),
        )
          .filter((target) => target.image)
          .map((target) => new URL(target.target, viewerUrl).href);
        const renderedImages = await browserPage.locator("img").evaluateAll((images) =>
          images.map((image) => ({
            complete: image.complete,
            naturalHeight: image.naturalHeight,
            naturalWidth: image.naturalWidth,
            source: image.currentSrc || image.src,
          })),
        );
        const unmatchedRenderedSources = renderedImages.map((image) => image.source);
        for (const expectedImage of expectedImages) {
          const matchIndex = unmatchedRenderedSources.indexOf(expectedImage);
          if (matchIndex < 0) {
            failures.push(
              `${relativePath}: expected image did not render: ${expectedImage}`,
            );
          } else {
            unmatchedRenderedSources.splice(matchIndex, 1);
          }
        }
        for (const image of renderedImages) {
          if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
            failures.push(
              `${relativePath}: rendered image has zero natural dimensions: ${image.source}`,
            );
          }
        }

        const errorMarkers = await browserPage
          .locator(
            "#copyparty-render-error, [data-render-error], .markdown-error, .render-error",
          )
          .count();
        if (errorMarkers > 0) {
          renderErrors.push(`${errorMarkers} render-error marker(s) in the page`);
        }
        for (const error of renderErrors) {
          failures.push(`${relativePath}: render error: ${error}`);
        }
      } catch (error) {
        failures.push(`${relativePath}: live-DOM validation failed: ${error.message}`);
      } finally {
        await browserPage.close();
      }
    }
  } finally {
    await browser.close();
  }

  return { available: true, pages: pages.length };
}

function passOrFail(failureCount) {
  return failureCount === 0 ? "PASS" : "FAIL";
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const failures = [];
  const discoveryFailureStart = failures.length;
  const config = loadValidationConfig(options.root, failures);
  const pages = discoverPages(options.root, failures);
  const pageMarkdown = new Map(
    pages.map((page) => [page, fs.readFileSync(page, "utf8")]),
  );

  validateQuestionBank(options.root, pageMarkdown, config, failures);

  const markdownFailureStart = failures.length;
  validateMarkdownSource(pages, options.markdownChecker, failures);
  const markdownFailures = failures.length - markdownFailureStart;
  const linkFailureStart = failures.length;
  validateLinks(pages, pageMarkdown, failures);
  const linkFailures = failures.length - linkFailureStart;
  const assetFailureStart = failures.length;
  const assets = validateAssets(options.root, pages, pageMarkdown, failures);
  const assetFailures = failures.length - assetFailureStart;
  const languageFailureStart = failures.length;
  const languageExemptions = validateLanguage(
    options.root,
    pages,
    pageMarkdown,
    config,
    failures,
  );
  const languageFailures = failures.length - languageFailureStart;
  const copypartyFailureStart = failures.length;
  const copyparty = await validateCopypartyHttp(
    options.root,
    pages,
    assets.displayedAssets,
    options.copypartyUrl,
    failures,
  );
  const copypartyFailures = failures.length - copypartyFailureStart;
  const liveDomFailureStart = failures.length;
  const liveDom = await validateLiveDom(
    options.root,
    pages,
    pageMarkdown,
    options.copypartyUrl,
    failures,
  );
  const liveDomFailures = failures.length - liveDomFailureStart;
  const discoveryFailures = markdownFailureStart - discoveryFailureStart;

  console.log(
    `Markdown source: ${passOrFail(discoveryFailures + markdownFailures)} (${pages.length} ${
      pages.length === 1 ? "page" : "pages"
    })`,
  );
  console.log(`Relative links: ${passOrFail(linkFailures)}`);
  console.log(
    `SVG assets: ${passOrFail(assetFailures)} (${assets.displayed} displayed, ${
      assets.orphaned
    } orphaned)`,
  );
  console.log(
    `English prose: ${passOrFail(languageFailures)}${
      languageExemptions === 0
        ? ""
        : ` (${languageExemptions} hash-pinned legacy exemption${
            languageExemptions === 1 ? "" : "s"
          })`
    }`,
  );
  console.log(
    copyparty.available
      ? `Copyparty HTTP: ${passOrFail(copypartyFailures)} (${copyparty.resources} resources)`
      : "Copyparty HTTP: UNAVAILABLE (no --copyparty-url)",
  );
  console.log(
    liveDom.available
      ? `Live DOM: ${passOrFail(liveDomFailures)} (${liveDom.pages} ${
          liveDom.pages === 1 ? "page" : "pages"
        })`
      : `Live DOM: UNAVAILABLE (${liveDom.reason})`,
  );

  if (failures.length > 0) {
    console.error("FAIL: maintainer-guide document-set contract");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
