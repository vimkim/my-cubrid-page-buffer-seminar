import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkTeachingDefinitions, decodeText } from './session-3-definitions.mjs';

export function requiresLegacyRedirect(page) {
  return page.path !== 'index.html'
    && !(page.legacyRedirect === false && page.path.startsWith('seminar-3/'));
}

function links(html, marker) {
  return [...html.matchAll(/<a\b([^>]*)>/g)].filter(m => !marker || m[1].includes(marker))
    .map(m => m[1].match(/href="([^"]+)"/)?.[1]);
}

const visibleTitle = html => decodeText(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export function chapterScreens(html, file) {
  return [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/g)]
    .map(match => ({ href: `${file}#${match[1]}`, title: visibleTitle(match[2]) }));
}
export function checkContentsScreens(html, screens, prefix = '') {
  const maps = [...html.matchAll(/<details\b[^>]*class="screen-map"[^>]*>([\s\S]*?)<\/details>/g)].map(match => match[1]).join('');
  const actual = [...maps.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(match => ({ href: match[1], title: visibleTitle(match[2]) }));
  const wanted = screens.map(screen => ({ ...screen, href: prefix + screen.href }));
  return JSON.stringify(actual) === JSON.stringify(wanted) ? [] : ['screen map must contain every final screen in order with its actual heading'];
}

export function checkSessionChapter(html, chapter, index, route, lang) {
  const failures = [];
  const tokenChapter = chapter.file === '07-flush-control.html';
  const expected = ['data-session-3', 'data-lecture-nav', 'data-presentation-controls', 'id="workload"'];
  if (tokenChapter) {
    const actual = chapterScreens(html, chapter.file).map(screen => screen.href.split('#')[1]);
    if (JSON.stringify(actual) !== JSON.stringify(['workload', 'credit-code-path', 'control-policy', 'control-part-3']))
      failures.push('token chapter must contain the four ordered explanation screens');
  } else {
    expected.push('id="replacement-protocol"', 'id="experiment"');
  }
  for (const marker of expected) if (!html.includes(marker)) failures.push(`missing ${marker}`);
  const nav = html.match(/<nav\b[^>]*data-lecture-nav[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
  if (!links(nav, 'data-session-return').includes('toc.html')) failures.push('return must reach the dedicated TOC');
  for (const [rel, adjacent] of [['prev', route.chapters[index - 1]], ['next', route.chapters[index + 1]]]) {
    const actual = links(nav, `rel="${rel}"`);
    const wanted = adjacent ? [adjacent.file + '#workload'] : [];
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`incorrect ${rel} chapter`);
  }
  const other = lang === 'ko' ? 'en' : 'ko';
  if (!links(html, `hreflang="${other}"`).includes(`../../${other}/seminar-3/${chapter.file}`))
    failures.push('counterpart must be the same dedicated chapter');
  if (links(html).some(href => /reference\/defense-/.test(href))) failures.push('essential route returns to old defense collection');
  if (index === 11 && (!html.includes('id="closure"') || !html.includes('id="diagnosis-start"') || !html.includes('id="diagnosis-limit"')))
    failures.push('final chapter must deliver staged diagnosis and closure');
  return failures;
}

export async function validateSession3(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'teaching-pages.json'), 'utf8'));
  if (!manifest.session3Route) return { count: 0, failures: [] };
  const route = JSON.parse(await readFile(path.join(root, manifest.session3Route), 'utf8'));
  const failures = [];
  let registry;
  try { registry = JSON.parse(await readFile(path.join(root, 'docs/session-3-teaching-labels.json'), 'utf8')); }
  catch (error) { failures.push(`Session 3 teaching-label registry unavailable: ${error.message}`); }
  const product = ['toc.html', ...['en', 'ko'].flatMap(lang => [`${lang}/seminar-3/toc.html`, ...route.chapters.map(c => `${lang}/seminar-3/${c.file}`)])];
  if (registry !== undefined && (!registry || !registry.pages || typeof registry.pages !== 'object' || Array.isArray(registry.pages))) {
    failures.push('teaching-label registry requires a pages object');
    registry = undefined;
  }
  if (registry) {
    if (JSON.stringify(Object.keys(registry.pages).sort()) !== JSON.stringify(product.toSorted()))
      failures.push('teaching-label registry must cover exactly the 27 Session 3 pages');
    for (const file of product) {
      const labels = registry.pages[file];
      if (!Array.isArray(labels) || new Set(labels).size !== labels.length || labels.some(label => typeof label !== 'string' || !label.trim())) {
        failures.push(`${file}: invalid teaching-label registration`); continue;
      }
      const html = await readFile(path.join(root, file), 'utf8');
      const images = {};
      for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+\.svg)"/g)) {
        const asset = path.resolve(root, path.dirname(file), match[1]);
        if (!asset.startsWith(path.join(root, 'assets') + path.sep)) continue;
        const svg = await readFile(asset, 'utf8');
        images[match[1]] = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]*>/g, ' ')).join(' ');
      }
      failures.push(...checkTeachingDefinitions(html, labels, images).map(f => `${file}: ${f}`));
    }
  }
  if (route.chapters.length !== 12 || new Set(route.chapters.map(c => c.file)).size !== 12)
    failures.push('Session 3 requires twelve distinct ordered chapters');
  const screensByLanguage = {};
  for (const lang of ['en', 'ko']) {
    const questions = [], screens = []; let traces = 0;
    for (const [index, chapter] of route.chapters.entries()) {
      const file = `${lang}/seminar-3/${chapter.file}`;
      const html = await readFile(path.join(root, file), 'utf8');
      screens.push(...chapterScreens(html, chapter.file));
      failures.push(...checkSessionChapter(html, chapter, index, route, lang).map(f => `${file}: ${f}`));
      if (!manifest.pages.some(p => p[lang] === file)) failures.push(`${file}: missing manifest pair`);
      questions.push(...[...html.matchAll(/data-question-id="([^"]+)"/g)].map(m => m[1]));
      traces += [...html.matchAll(/\bdata-state-trace(?:\s|=|>)/g)].length;
      for (const pin of [route.cubrid, route.postgres]) if (!html.includes(pin)) failures.push(`${file}: missing pin ${pin}`);
    }
    const omitted = new Set(['D27', 'Q14', 'Q15', 'D28']);
    const wanted = [...Array.from({ length: 24 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`), ...Array.from({ length: 9 }, (_, i) => `D${i + 25}`)].filter(id => !omitted.has(id)).sort();
    if (JSON.stringify(questions.sort()) !== JSON.stringify(wanted)) failures.push(`${lang}: retained questions must each occur once; D27/Q14/Q15/D28 are omitted`);
    if (traces < 24) failures.push(`${lang}: preserve the other traces and the continuous token example`);
    const toc = await readFile(path.join(root, lang, 'seminar-3/toc.html'), 'utf8');
    screensByLanguage[lang] = screens;
    failures.push(...checkContentsScreens(toc, screens).map(f => `${lang}/seminar-3/toc.html: ${f}`));
    const ordered = links(toc, 'data-session-chapter');
    if (JSON.stringify(ordered) !== JSON.stringify(route.chapters.map(c => c.file + '#workload'))
        || links(toc, 'data-session-start')[0] !== route.chapters[0].file + '#workload')
      failures.push(`${lang}: detailed TOC ordering differs from route`);
  }
  const rootToc = await readFile(path.join(root, 'toc.html'), 'utf8');
  failures.push(...checkContentsScreens(rootToc, screensByLanguage.ko, 'ko/seminar-3/').map(f => `toc.html: ${f}`));
  const targets = links(rootToc, 'data-session-chapter');
  if (JSON.stringify(targets) !== JSON.stringify(route.chapters.map(c => 'ko/seminar-3/' + c.file + '#workload'))
      || links(rootToc, 'data-session-start')[0] !== 'ko/seminar-3/' + route.chapters[0].file + '#workload')
    failures.push('toc.html must open actual Korean chapters in session order');
  if (/http-equiv=["']refresh|data-legacy-redirect/.test(rootToc)) failures.push('toc.html must display contents');
  return { count: 27, failures };
}
