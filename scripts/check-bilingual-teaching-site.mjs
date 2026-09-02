#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
import path from "node:path";
import process from "node:process";

function parseArguments (argv)
{
  const options = { root: process.cwd (), gate: "all", copypartyUrl: undefined, printFingerprints: false };
  for (let index = 0; index < argv.length; index++)
    {
      const argument = argv[index];
      if (argument === "--print-fingerprints")
        {
          options.printFingerprints = true;
        }
      else if (argument === "--root" || argument === "--gate" || argument === "--copyparty-url")
        {
          const value = argv[++index];
          if (!value)
            {
              throw new Error (`${argument} requires a value`);
            }
          const name = argument === "--copyparty-url" ? "copypartyUrl" : argument.slice (2);
          options[name] = value;
        }
      else
        {
          throw new Error (`unknown argument: ${argument}`);
        }
    }
  return options;
}

async function isFile (target)
{
  try
    {
      return (await stat (target)).isFile ();
    }
  catch
    {
      return false;
    }
}

async function discoverHtml (directory)
{
  if (!(await isFile (path.join (directory, "index.html"))))
    {
      return [];
    }
  const entries = await readdir (directory, { recursive: true, withFileTypes: true });
  return entries
    .filter ((entry) => entry.isFile () && entry.name.endsWith (".html"))
    .map ((entry) => path.relative (directory, path.join (entry.parentPath, entry.name)).split (path.sep).join ("/"))
    .sort ();
}

async function readManifest (root)
{
  return JSON.parse (await readFile (path.join (root, "teaching-pages.json"), "utf8"));
}

function htmlAttribute (attributes, name)
{
  const match = attributes.match (new RegExp (`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? match[1] ?? match[2] ?? match[3] : undefined;
}

function relativeWebPath (fromFile, toFile)
{
  return path.posix.relative (path.posix.dirname (fromFile), toFile) || path.posix.basename (toFile);
}

function anchorTargets (html)
{
  return [...html.matchAll (/<a\b([^>]*)>/gi)].map ((match) => ({
    href: htmlAttribute (match[1], "href"),
    hreflang: htmlAttribute (match[1], "hreflang")
  }));
}

function localReferences (html)
{
  const references = [];
  for (const match of html.matchAll (/<(a|link|script|img|source)\b([^>]*)>/gi))
    {
      const attribute = /^(?:a|link)$/i.test (match[1]) ? "href" : "src";
      const value = htmlAttribute (match[2], attribute);
      if (value)
        {
          references.push ({ element: match[1].toLowerCase (), attribute, value });
        }
    }
  return references;
}

function documentIds (html)
{
  return [...html.matchAll (/<[a-z][^>]*\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .map ((match) => match[1] ?? match[2] ?? match[3]);
}

function markdownIds (markdown)
{
  return [...markdown.matchAll (/^#{1,6}\s+(.+)$/gm)].map ((match) => match[1]
    .replace (/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace (/<[^>]+>|[`*_~]/g, "")
    .toLowerCase ()
    .replace (/[^\p{L}\p{N}\s_-]/gu, "")
    .trim ()
    .replace (/\s+/g, "-"));
}

function splitReference (value)
{
  const hash = value.indexOf ("#");
  return hash < 0 ? { pathname: value, fragment: "" } : {
    pathname: value.slice (0, hash),
    fragment: decodeURIComponent (value.slice (hash + 1))
  };
}

function isExternalReference (value)
{
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test (value);
}

async function validateSvg (root, ownerPath, targetPath, failures)
{
  const relative = path.relative (root, targetPath).split (path.sep).join ("/");
  if (!relative.startsWith ("assets/"))
    {
      failures.push (`${ownerPath}: displayed SVG must resolve inside assets/: ${relative}`);
      return;
    }
  const svg = await readFile (targetPath, "utf8");
  if (!/<svg\b[^>]*\bviewBox\s*=/i.test (svg))
    {
      failures.push (`${relative}: displayed SVG is missing viewBox`);
    }
  if (/<script\b|<foreignObject\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:)?\/\//i.test (svg))
    {
      failures.push (`${relative}: displayed SVG contains active or remote content`);
    }
}

async function validateLinks (root)
{
  const failures = [];
  let manifest;
  try
    {
      manifest = await readManifest (root);
    }
  catch (error)
    {
      return { count: 0, failures: [`teaching-pages.json: ${error.message}`] };
    }

  if (!Number.isInteger (manifest.legacyRedirectMinimumDays) || manifest.legacyRedirectMinimumDays < 90)
    {
      failures.push ("teaching-pages.json: legacy redirects must be retained for at least 90 days");
    }

  for (const page of manifest.pages ?? [])
    {
      if (page.path === "index.html")
        {
          continue;
        }
      const stubPath = path.join (root, page.path);
      if (!(await isFile (stubPath)))
        {
          failures.push (`${page.path}: missing legacy redirect stub`);
          continue;
        }
      const stub = await readFile (stubPath, "utf8");
      const expectedTarget = relativeWebPath (page.path, page.en);
      const refresh = stub.match (/<meta\b([^>]*\bhttp-equiv\s*=\s*(?:"refresh"|'refresh'|refresh)[^>]*)>/i)?.[1];
      const canonical = [...stub.matchAll (/<link\b([^>]*)>/gi)].find ((match) => htmlAttribute (match[1], "rel")?.toLowerCase () === "canonical");
      if (!/\bdata-legacy-redirect(?:\s|=|>)/i.test (stub)
          || !refresh || !new RegExp (`(?:^|[;\\s])url\\s*=\\s*${expectedTarget.replace (/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s\"'])`, "i").test (htmlAttribute (refresh, "content") ?? "")
          || htmlAttribute (canonical?.[1] ?? "", "href") !== expectedTarget
          || !anchorTargets (stub).some ((anchor) => anchor.href === expectedTarget))
        {
          failures.push (`${page.path}: invalid legacy redirect stub; expected ${expectedTarget}`);
        }
    }

  const checkedSvgs = new Set ();
  for (const page of manifest.pages ?? [])
    {
      for (const pagePath of [page.en, page.ko])
        {
          const html = await readFile (path.join (root, pagePath), "utf8");
          const ids = documentIds (html);
          const seenIds = new Set ();
          for (const id of ids)
            {
              if (seenIds.has (id))
                {
                  failures.push (`${pagePath}: duplicate id ${id}`);
                }
              seenIds.add (id);
            }

          for (const reference of localReferences (html))
            {
              if (isExternalReference (reference.value))
                {
                  try
                    {
                      new URL (reference.value, "https://example.invalid/");
                    }
                  catch
                    {
                      failures.push (`${pagePath}: invalid external ${reference.attribute} ${reference.value}`);
                    }
                  continue;
                }
              const { pathname, fragment } = splitReference (reference.value);
              const targetPath = pathname
                ? path.resolve (root, path.posix.dirname (pagePath), decodeURIComponent (pathname))
                : path.join (root, pagePath);
              if (!(await isFile (targetPath)))
                {
                  failures.push (`${pagePath}: unresolved ${reference.attribute} ${reference.value}`);
                  continue;
                }
              if (fragment)
                {
                  const targetText = targetPath === path.join (root, pagePath)
                    ? html
                    : await readFile (targetPath, "utf8");
                  const targets = targetPath.toLowerCase ().endsWith (".md")
                    ? markdownIds (targetText)
                    : documentIds (targetText);
                  if (!targets.includes (fragment))
                    {
                      failures.push (`${pagePath}: unresolved fragment ${reference.value}`);
                    }
                }
              if (reference.element === "img" && pathname.toLowerCase ().endsWith (".svg") && !checkedSvgs.has (targetPath))
                {
                  checkedSvgs.add (targetPath);
                  await validateSvg (root, pagePath, targetPath, failures);
                }
            }
        }
    }
  return { count: Array.isArray (manifest.pages) ? manifest.pages.length : 0, failures };
}

function normalizedText (value)
{
  return value.replace (/\s+/g, " ").trim ();
}

function startTags (html)
{
  const tags = [];
  for (let start = 0; start < html.length; start++)
    {
      if (html[start] !== "<" || !/[A-Za-z]/.test (html[start + 1] ?? ""))
        {
          continue;
        }
      let quote = "";
      for (let end = start + 2; end < html.length; end++)
        {
          const character = html[end];
          if (quote)
            {
              if (character === quote)
                {
                  quote = "";
                }
            }
          else if (character === "\"" || character === "'")
            {
              quote = character;
            }
          else if (character === ">")
            {
              tags.push (html.slice (start, end + 1));
              start = end;
              break;
            }
        }
    }
  return tags;
}

function elementContents (html, names)
{
  const pattern = new RegExp (`<(${names.join ("|")})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
  return [...html.matchAll (pattern)].map ((match) => `${match[1].toLowerCase ()}:${normalizedText (match[2])}`);
}

function attributeMultiset (html, attribute, excludedValues = new Set ())
{
  const values = [];
  const pattern = new RegExp (`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "gi");
  for (const match of html.matchAll (pattern))
    {
      const value = match[1] ?? match[2] ?? match[3];
      if (!excludedValues.has (value))
        {
          values.push (value);
        }
    }
  return values.sort ();
}

function technicalDataAttributes (html)
{
  const values = [];
  for (const tag of startTags (html))
    {
      for (const attribute of tag.matchAll (/\b(data-[a-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))
        {
          const name = attribute[1].toLowerCase ();
          const value = attribute[2] ?? attribute[3] ?? attribute[4];
          if (name === "data-concepts")
            {
              try
                {
                  values.push (`${name}=${JSON.stringify (JSON.parse (value).map ((concept) => concept.terms))}`);
                }
              catch
                {
                  values.push (`${name}=INVALID`);
                }
            }
          else if (!/^data-(?:model|message|label|feedback|prompt)(?:-|$)/.test (name)
                   && !/(?:-message|-label|-template)$/.test (name))
            {
              values.push (`${name}=${value}`);
            }
        }
    }
  return values.sort ();
}

function controlProjection (html)
{
  return [...html.matchAll (/<(form|input|button|select|option|textarea)\b([^>]*)>/gi)].map ((match) =>
  {
    const attributes = ["type", "name", "value", "data-answer", "data-correct", "data-action"]
      .map ((name) => [name, htmlAttribute (match[2], name)])
      .filter (([, value]) => value !== undefined)
      .map (([name, value]) => `${name}=${value}`)
      .join (";");
    return `${match[1].toLowerCase ()}:${attributes}`;
  });
}

function technicalProjection (html)
{
  const externalUrls = localReferences (html).map ((reference) => reference.value)
    .filter (isExternalReference).sort ();
  const sourceAnchors = [...html.matchAll (/\b[A-Za-z0-9_.-]+\.(?:c|h|cc|cpp|hpp):\d+(?:[–-]\d+)?/g)]
    .map ((match) => match[0]).sort ();
  const pinnedHashes = [...html.matchAll (/\b[0-9a-f]{7,40}\b/gi)].map ((match) => match[0]).sort ();
  const scripts = [...html.matchAll (/<script\b([^>]*)>/gi)]
    .map ((match) => htmlAttribute (match[1], "src"))
    .filter (Boolean).map ((value) => path.posix.basename (value)).sort ();
  return {
    code: elementContents (html, ["code", "pre"]),
    externalUrls,
    sourceAnchors,
    pinnedHashes,
    ids: attributeMultiset (html, "id"),
    classes: attributeMultiset (html, "class"),
    data: technicalDataAttributes (html),
    scripts,
    controls: controlProjection (html)
  };
}

async function validateTechnicalParity (root)
{
  const failures = [];
  let manifest;
  try
    {
      manifest = await readManifest (root);
    }
  catch (error)
    {
      return { count: 0, failures: [`teaching-pages.json: ${error.message}`] };
    }
  const labels = {
    code: "code/preformatted content",
    externalUrls: "source URLs",
    sourceAnchors: "source filenames or line anchors",
    pinnedHashes: "pinned hashes",
    ids: "element IDs",
    classes: "element classes",
    data: "technical data attributes",
    scripts: "imported script roster",
    controls: "form/control structure or answer values"
  };
  for (const page of manifest.pages ?? [])
    {
      const en = technicalProjection (await readFile (path.join (root, page.en), "utf8"));
      const ko = technicalProjection (await readFile (path.join (root, page.ko), "utf8"));
      for (const key of Object.keys (labels))
        {
          if (JSON.stringify (en[key]) !== JSON.stringify (ko[key]))
            {
              failures.push (`${page.path}: ${labels[key]} differs between EN and KO`);
            }
        }
    }
  return { count: Array.isArray (manifest.pages) ? manifest.pages.length : 0, failures };
}

function hangulCount (value)
{
  return (value.match (/[\uac00-\ud7a3]/g) ?? []).length;
}

function readerFacingText (html)
{
  return html
    .replace (/<(script|style|code|pre|kbd|samp)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace (/<nav\b[^>]*data-language-switcher[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace (/<[^>]+>/g, " ")
    .replace (/&[a-z0-9#]+;/gi, " ");
}

function localizedAttributeValues (html)
{
  const values = [];
  for (const tag of startTags (html))
    {
      for (const name of ["alt", "aria-label", "placeholder", "title"])
        {
          const value = htmlAttribute (tag, name);
          if (value && /[A-Za-z\uac00-\ud7a3]/.test (value))
            {
              values.push ({ name, value });
            }
        }
      for (const attribute of tag.matchAll (/\b(data-(?:model|message|label|feedback|prompt)[a-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))
        {
          values.push ({ name: attribute[1], value: attribute[2] ?? attribute[3] ?? attribute[4] });
        }
      if (/^<meta\b/i.test (tag) && htmlAttribute (tag, "name")?.toLowerCase () === "description")
        {
          const value = htmlAttribute (tag, "content");
          if (value)
            {
              values.push ({ name: "meta description", value });
            }
        }
    }
  return values;
}

async function validateLanguage (root)
{
  const failures = [];
  let manifest;
  try
    {
      manifest = await readManifest (root);
    }
  catch (error)
    {
      return { count: 0, failures: [`teaching-pages.json: ${error.message}`] };
    }
  for (const page of manifest.pages ?? [])
    {
      const en = await readFile (path.join (root, page.en), "utf8");
      const ko = await readFile (path.join (root, page.ko), "utf8");
      if (hangulCount (readerFacingText (en)) > 0)
        {
          failures.push (`${page.en}: unintended Korean reader-facing prose`);
        }
      if (hangulCount (readerFacingText (ko)) < 20)
        {
          failures.push (`${page.ko}: missing meaningful Korean reader-facing content`);
        }
      const title = ko.match (/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
      if (hangulCount (title) < 2)
        {
          failures.push (`${page.ko}: title is not localized`);
        }
      for (const attribute of localizedAttributeValues (ko))
        {
          if (/[A-Za-z]/.test (attribute.value) && /\s/.test (attribute.value) && hangulCount (attribute.value) === 0)
            {
              failures.push (`${page.ko}: ${attribute.name} is not localized: ${attribute.value}`);
            }
        }
    }

  const assets = path.join (root, "assets");
  try
    {
      for (const entry of await readdir (assets, { recursive: true, withFileTypes: true }))
        {
          if (entry.isFile () && entry.name.endsWith (".svg"))
            {
              const target = path.join (entry.parentPath, entry.name);
              if (hangulCount (await readFile (target, "utf8")) > 0)
                {
                  failures.push (`${path.relative (root, target)}: shared SVG contains Korean text`);
                }
            }
        }
    }
  catch (error)
    {
      if (error.code !== "ENOENT")
        {
          throw error;
        }
    }
  return { count: Array.isArray (manifest.pages) ? manifest.pages.length : 0, failures };
}

function normalizeTagForReview (tag)
{
  if (/^<\//.test (tag) || /^<!/.test (tag))
    {
      return tag.toLowerCase ();
    }
  const name = tag.match (/^<\s*([a-z][a-z0-9-]*)/i)?.[1]?.toLowerCase ();
  if (!name)
    {
      return tag;
    }
  const attributes = [];
  const body = tag.slice (tag.indexOf (name) + name.length, tag.lastIndexOf (">") - (/\/\s*>$/.test (tag) ? 1 : 0));
  for (const match of body.matchAll (/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
    {
      attributes.push ([match[1].toLowerCase (), normalizedText (match[2] ?? match[3] ?? match[4] ?? "")]);
    }
  attributes.sort ((left, right) => left[0].localeCompare (right[0]) || left[1].localeCompare (right[1]));
  const suffix = /\/\s*>$/.test (tag) ? "/" : "";
  return `<${name}${attributes.map (([key, value]) => value ? ` ${key}="${value}"` : ` ${key}`).join ("")}${suffix}>`;
}

function reviewFingerprint (html)
{
  const projection = html
    .replace (/<!--[\s\S]*?-->/g, "")
    .replace (/<[^>]+>/g, normalizeTagForReview)
    .replace (/\s+/g, " ")
    .replace (/\s*(<[^>]+>)\s*/g, "$1")
    .trim ();
  return `sha256:${createHash ("sha256").update (projection).digest ("hex")}`;
}

async function validateReview (root)
{
  const failures = [];
  let manifest;
  try
    {
      manifest = await readManifest (root);
    }
  catch (error)
    {
      return { count: 0, failures: [`teaching-pages.json: ${error.message}`] };
    }
  for (const page of manifest.pages ?? [])
    {
      if (page.review?.state !== "reviewed"
          || typeof page.review?.reviewer !== "string" || !page.review.reviewer.trim ()
          || !/^\d{4}-\d{2}-\d{2}$/.test (page.review?.reviewedAt ?? ""))
        {
          failures.push (`${page.path}: missing Korean review receipt`);
        }
      for (const language of ["en", "ko"])
        {
          const actual = reviewFingerprint (await readFile (path.join (root, page[language]), "utf8"));
          if (page.fingerprints?.[language] !== actual)
            {
              failures.push (`${page.path}: stale review fingerprint for ${language}; current ${actual}`);
            }
        }
    }
  return { count: Array.isArray (manifest.pages) ? manifest.pages.length : 0, failures };
}

async function fingerprintReport (root)
{
  const manifest = await readManifest (root);
  return Promise.all ((manifest.pages ?? []).map (async (page) => ({
    path: page.path,
    en: reviewFingerprint (await readFile (path.join (root, page.en), "utf8")),
    ko: reviewFingerprint (await readFile (path.join (root, page.ko), "utf8"))
  })));
}

function elementsWithMarker (html, marker)
{
  const result = [];
  for (const tag of startTags (html))
    {
      if (new RegExp (`\\b${marker}(?:\\s|=|>)`, "i").test (tag))
        {
          result.push (tag);
        }
    }
  return result;
}

async function validateStaticBehavior (root)
{
  const failures = [];
  let manifest;
  try
    {
      manifest = await readManifest (root);
    }
  catch (error)
    {
      return { count: 0, failures: [`teaching-pages.json: ${error.message}`] };
    }
  const checkedScripts = new Set ();
  const retrievalMessages = ["data-coverage-template", "data-complete-message", "data-revisit-label", "data-model-label"];
  const ledgerMessages = [
    "data-removed-label", "data-reset-message", "data-a-fix-label", "data-b-fix-label",
    "data-a-unfix-label", "data-b-unfix-label", "data-rejected-message", "data-invariant-message", "data-mismatch-message"
  ];
  for (const page of manifest.pages ?? [])
    {
      for (const pagePath of [page.en, page.ko])
        {
          const html = await readFile (path.join (root, pagePath), "utf8");
          for (const opening of elementsWithMarker (html, "data-retrieval"))
            {
              if (retrievalMessages.some ((name) => !htmlAttribute (opening, name)))
                {
                  failures.push (`${pagePath}: retrieval control is missing localized retrieval messages`);
                }
              try
                {
                  const concepts = JSON.parse (htmlAttribute (opening, "data-concepts") ?? "");
                  if (!Array.isArray (concepts) || concepts.length === 0
                      || concepts.some ((concept) => typeof concept.label !== "string" || !Array.isArray (concept.terms) || concept.terms.length === 0))
                    {
                      throw new Error ("concepts must have labels and terms");
                    }
                }
              catch (error)
                {
                  failures.push (`${pagePath}: invalid retrieval concepts: ${error.message}`);
                }
              for (const selector of ["<textarea", "data-check", "data-reveal", "class=\"feedback\""])
                {
                  if (!html.toLowerCase ().includes (selector.toLowerCase ()))
                    {
                      failures.push (`${pagePath}: retrieval control is missing ${selector}`);
                    }
                }
            }

          for (const opening of elementsWithMarker (html, "data-ledger"))
            {
              if (ledgerMessages.some ((name) => !htmlAttribute (opening, name)))
                {
                  failures.push (`${pagePath}: ledger control is missing localized ledger messages`);
                }
              for (const action of ["a-fix", "b-fix", "a-unfix", "b-unfix", "reset"])
                {
                  if (!new RegExp (`data-ledger-action=["']${action}["']`).test (html))
                    {
                      failures.push (`${pagePath}: ledger control is missing ${action}`);
                    }
                }
            }

          for (const match of html.matchAll (/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
            {
              const source = htmlAttribute (match[1], "src");
              const scriptPath = source ? path.resolve (root, path.posix.dirname (pagePath), source) : `${pagePath}:inline`;
              if (checkedScripts.has (scriptPath))
                {
                  continue;
                }
              checkedScripts.add (scriptPath);
              try
                {
                  const code = source ? await readFile (scriptPath, "utf8") : match[2];
                  new Script (code, { filename: String (scriptPath) });
                }
              catch (error)
                {
                  failures.push (`${pagePath}: script does not parse: ${error.message}`);
                }
            }
        }
    }
  return { count: Array.isArray (manifest.pages) ? manifest.pages.length : 0, failures };
}

async function validateServedHttp (root, baseUrl)
{
  if (!baseUrl)
    {
      return { status: "UNAVAILABLE", reason: "provide --copyparty-url", count: 0, failures: [] };
    }
  const failures = [];
  const manifest = await readManifest (root);
  const paths = new Set (["index.html", "teaching-pages.json"]);
  for (const page of manifest.pages ?? [])
    {
      paths.add (page.en);
      paths.add (page.ko);
      if (page.path !== "index.html")
        {
          paths.add (page.path);
        }
      for (const pagePath of [page.en, page.ko])
        {
          const html = await readFile (path.join (root, pagePath), "utf8");
          for (const reference of localReferences (html))
            {
              if (!isExternalReference (reference.value))
                {
                  const pathname = splitReference (reference.value).pathname;
                  if (pathname)
                    {
                      paths.add (path.relative (root, path.resolve (root, path.posix.dirname (pagePath), decodeURIComponent (pathname))).split (path.sep).join ("/"));
                    }
                }
            }
        }
    }
  const base = new URL (baseUrl.endsWith ("/") ? baseUrl : `${baseUrl}/`);
  for (const resource of [...paths].sort ())
    {
      try
        {
          const response = await fetch (new URL (resource.split ("/").map (encodeURIComponent).join ("/"), base));
          if (!response.ok)
            {
              failures.push (`${resource}: HTTP ${response.status}`);
            }
          else
            {
              await response.arrayBuffer ();
            }
        }
      catch (error)
        {
          failures.push (`${resource}: ${error.message}`);
        }
    }
  return { status: "PASS", count: paths.size, failures };
}

function hasCurrentLanguage (html, language)
{
  return [...html.matchAll (/<([a-z][a-z0-9-]*)\b([^>]*\baria-current\s*=\s*(?:"page"|'page'|page)[^>]*)>([\s\S]*?)<\/\1>/gi)].some ((match) =>
    htmlAttribute (match[2], "aria-current") === "page"
      && match[3].replace (/<[^>]+>/g, "").trim () === language.toUpperCase ());
}

async function validateNavigation (root)
{
  const failures = [];
  let manifest;
  try
    {
      manifest = await readManifest (root);
    }
  catch (error)
    {
      return { count: 0, failures: [`teaching-pages.json: ${error.message}`] };
    }

  const selector = await readFile (path.join (root, "index.html"), "utf8");
  if (!/\bdata-language-selector(?:\s|=|>)/i.test (selector))
    {
      failures.push ("index.html: missing data-language-selector");
    }
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test (selector)
      || /\b(?:window\.)?location(?:\.href)?\s*=|\blocation\.(?:assign|replace)\s*\(/i.test (selector))
    {
      failures.push ("index.html: forced locale redirects are not allowed");
    }
  const selectorTargets = anchorTargets (selector);
  for (const language of ["en", "ko"])
    {
      if (!selectorTargets.some ((anchor) => anchor.href === `${language}/index.html` && anchor.hreflang === language))
        {
          failures.push (`index.html: missing ${language}/index.html selector link with hreflang=${language}`);
        }
    }

  for (const page of manifest.pages ?? [])
    {
      for (const language of ["en", "ko"])
        {
          const pagePath = page[language];
          let html;
          try
            {
              html = await readFile (path.join (root, pagePath), "utf8");
            }
          catch (error)
            {
              failures.push (`${pagePath}: ${error.message}`);
              continue;
            }
          const htmlTag = html.match (/<html\b([^>]*)>/i);
          if (!htmlTag || htmlAttribute (htmlTag[1], "lang") !== language)
            {
              failures.push (`${pagePath}: html lang must be ${language}`);
            }
          if (!/\bdata-language-switcher(?:\s|=|>)/i.test (html))
            {
              failures.push (`${pagePath}: missing data-language-switcher`);
            }
          if (!hasCurrentLanguage (html, language))
            {
              failures.push (`${pagePath}: current language must be marked with aria-current=page`);
            }
          const counterpart = language === "en" ? page.ko : page.en;
          const counterpartLanguage = language === "en" ? "ko" : "en";
          const target = relativeWebPath (pagePath, counterpart);
          if (!anchorTargets (html).some ((anchor) => anchor.href === target && anchor.hreflang === counterpartLanguage))
            {
              failures.push (`${pagePath}: missing direct ${counterpartLanguage} counterpart link ${target}`);
            }
        }
    }
  return { count: Array.isArray (manifest.pages) ? manifest.pages.length : 0, failures };
}

function manifestPaths (manifest, failures)
{
  if (manifest.version !== 1)
    {
      failures.push ("teaching-pages.json: version must be 1");
    }
  if (!Number.isInteger (manifest.expectedPageCount) || manifest.expectedPageCount < 1)
    {
      failures.push ("teaching-pages.json: expectedPageCount must be a positive integer");
    }
  if (!Array.isArray (manifest.pages))
    {
      failures.push ("teaching-pages.json: pages must be an array");
      return { en: [], ko: [] };
    }
  if (manifest.pages.length !== manifest.expectedPageCount)
    {
      failures.push (`teaching-pages.json: expected ${manifest.expectedPageCount} entries, found ${manifest.pages.length}`);
    }

  const logical = new Set ();
  const en = new Set ();
  const ko = new Set ();
  for (const [index, page] of manifest.pages.entries ())
    {
      const location = `teaching-pages.json: pages[${index}]`;
      if (!page || typeof page.path !== "string" || typeof page.en !== "string" || typeof page.ko !== "string")
        {
          failures.push (`${location} must define string path, en, and ko fields`);
          continue;
        }
      if (page.en !== `en/${page.path}` || page.ko !== `ko/${page.path}`)
        {
          failures.push (`${location} must pair en/${page.path} with ko/${page.path}`);
        }
      if (logical.has (page.path) || en.has (page.en) || ko.has (page.ko))
        {
          failures.push (`${location} duplicates a page pair`);
        }
      logical.add (page.path);
      en.add (page.en);
      ko.add (page.ko);
    }
  return {
    en: [...en].map ((value) => value.slice (3)).sort (),
    ko: [...ko].map ((value) => value.slice (3)).sort ()
  };
}

function compareInventory (language, expected, actual, failures)
{
  const expectedSet = new Set (expected);
  const actualSet = new Set (actual);
  for (const page of expected)
    {
      if (!actualSet.has (page))
        {
          failures.push (`${language}/${page}: manifest page does not exist`);
        }
    }
  for (const page of actual)
    {
      if (!expectedSet.has (page))
        {
          failures.push (`${language}/${page}: teaching page is not in the manifest`);
        }
    }
}

async function validateInventory (root)
{
  const failures = [];
  if (!(await isFile (path.join (root, "index.html"))))
    {
      failures.push ("index.html: root language selector does not exist");
    }

  let manifest;
  try
    {
      manifest = await readManifest (root);
    }
  catch (error)
    {
      failures.push (`teaching-pages.json: ${error.message}`);
      return { count: 0, failures };
    }

  const expected = manifestPaths (manifest, failures);
  compareInventory ("en", expected.en, await discoverHtml (path.join (root, "en")), failures);
  compareInventory ("ko", expected.ko, await discoverHtml (path.join (root, "ko")), failures);
  return { count: Array.isArray (manifest.pages) ? manifest.pages.length : 0, failures };
}

async function main ()
{
  const options = parseArguments (process.argv.slice (2));
  if (!new Set (["all", "inventory", "navigation", "links", "technical", "language", "review", "static", "served"]).has (options.gate))
    {
      throw new Error (`unknown gate: ${options.gate}`);
    }
  const root = path.resolve (options.root);
  if (options.printFingerprints)
    {
      console.log (JSON.stringify (await fingerprintReport (root), null, 2));
      return;
    }
  const results = [];
  if (options.gate === "all" || options.gate === "inventory")
    {
      results.push (["Inventory and manifest", await validateInventory (root)]);
    }
  if (options.gate === "all" || options.gate === "navigation")
    {
      results.push (["Document identity and navigation", await validateNavigation (root)]);
    }
  if (options.gate === "all" || options.gate === "links")
    {
      results.push (["Link and asset closure", await validateLinks (root)]);
    }
  if (options.gate === "all" || options.gate === "technical")
    {
      results.push (["Technical invariant parity", await validateTechnicalParity (root)]);
    }
  if (options.gate === "all" || options.gate === "language")
    {
      results.push (["Language and accessibility", await validateLanguage (root)]);
    }
  if (options.gate === "all" || options.gate === "review")
    {
      results.push (["Translation review currency", await validateReview (root)]);
    }
  if (options.gate === "all" || options.gate === "static")
    {
      results.push (["Static interaction behavior", await validateStaticBehavior (root)]);
    }
  if (options.gate === "all" || options.gate === "served")
    {
      results.push (["Served HTTP behavior", await validateServedHttp (root, options.copypartyUrl)]);
      results.push (["Live DOM behavior", {
        status: "UNAVAILABLE",
        reason: "browser automation is not configured",
        count: 0,
        failures: []
      }]);
    }
  const failures = results.flatMap (([, result]) => result.failures);
  if (failures.length > 0)
    {
      for (const failure of failures)
        {
          console.error (`FAIL: ${failure}`);
        }
      process.exitCode = 1;
      return;
    }
  for (const [label, result] of results)
    {
      if (result.status === "UNAVAILABLE")
        {
          console.log (`${label}: UNAVAILABLE (${result.reason})`);
        }
      else
        {
          console.log (`${label}: PASS (${result.count} ${label === "Served HTTP behavior" ? "resources" : "pairs"})`);
        }
    }
}

main ().catch ((error) =>
{
  console.error (`FAIL: ${error.message}`);
  process.exitCode = 1;
});
