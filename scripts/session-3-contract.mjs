import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function requiresLegacyRedirect(page) {
  return page.path !== 'index.html'
    && !(page.legacyRedirect === false && page.path.startsWith('seminar-3/'));
}

function links(html, marker) {
  return [...html.matchAll(/<a\b([^>]*)>/g)].filter(m => !marker || m[1].includes(marker))
    .map(m => m[1].match(/href="([^"]+)"/)?.[1]);
}

export function checkSessionChapter(html, chapter, index, route, lang) {
  const failures = [];
  const expected = ['data-session-3', 'data-lecture-nav', 'data-presentation-controls',
    'id="workload"', 'id="replacement-protocol"', 'id="experiment"'];
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
  if (route.chapters.length !== 12 || new Set(route.chapters.map(c => c.file)).size !== 12)
    failures.push('Session 3 requires twelve distinct ordered chapters');
  for (const lang of ['en', 'ko']) {
    const questions = []; let traces = 0;
    for (const [index, chapter] of route.chapters.entries()) {
      const file = `${lang}/seminar-3/${chapter.file}`;
      const html = await readFile(path.join(root, file), 'utf8');
      failures.push(...checkSessionChapter(html, chapter, index, route, lang).map(f => `${file}: ${f}`));
      if (!manifest.pages.some(p => p[lang] === file)) failures.push(`${file}: missing manifest pair`);
      questions.push(...[...html.matchAll(/data-question-id="([^"]+)"/g)].map(m => m[1]));
      traces += [...html.matchAll(/\bdata-state-trace(?:\s|=|>)/g)].length;
      for (const pin of [route.cubrid, route.postgres]) if (!html.includes(pin)) failures.push(`${file}: missing pin ${pin}`);
    }
    const wanted = [...Array.from({ length: 24 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`), ...Array.from({ length: 9 }, (_, i) => `D${i + 25}`)].sort();
    if (JSON.stringify(questions.sort()) !== JSON.stringify(wanted)) failures.push(`${lang}: Q01-Q24/D25-D33 must each occur once`);
    if (traces < 25) failures.push(`${lang}: preserve 22 traces and the three new cases`);
    const toc = await readFile(path.join(root, lang, 'seminar-3/toc.html'), 'utf8');
    const ordered = links(toc, 'data-session-chapter');
    if (JSON.stringify(ordered) !== JSON.stringify(route.chapters.map(c => c.file + '#workload'))
        || links(toc, 'data-session-start')[0] !== route.chapters[0].file + '#workload')
      failures.push(`${lang}: detailed TOC ordering differs from route`);
  }
  const rootToc = await readFile(path.join(root, 'toc.html'), 'utf8');
  const targets = links(rootToc, 'data-session-chapter');
  if (JSON.stringify(targets) !== JSON.stringify(route.chapters.map(c => 'ko/seminar-3/' + c.file + '#workload'))
      || links(rootToc, 'data-session-start')[0] !== 'ko/seminar-3/' + route.chapters[0].file + '#workload')
    failures.push('toc.html must open actual Korean chapters in session order');
  if (/http-equiv=["']refresh|data-legacy-redirect/.test(rootToc)) failures.push('toc.html must display contents');
  return { count: 27, failures };
}
