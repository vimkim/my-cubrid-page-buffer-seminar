import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Stable filenames, ordered by conceptual dependency rather than numeric ID.
export const lectureOrder = [
  '0001-present-the-page-journey', '0002-separate-objects-from-state',
  '0003-trace-fix-convergence', '0004-repay-fix-debt', '0004a-understand-holder-anchor',
  '0005-audit-a-logged-mutation', '0006-flush-one-generation',
  '0006a-understand-page-buffer-daemons', '0006b-follow-page-flush-handoff',
  '0006c-follow-maintenance-and-pacing', '0007-replace-one-frame',
  '0012-prove-replacement-progress', '0012b-understand-private-lru-index',
  '0012a-understand-aout-ghost-history', '0009-classify-latch-wait',
  '0010-revalidate-after-promotion', '0011-rebuild-after-ordered-refix',
  '0013-gate-redo-by-page-lsa', '0014-preserve-lifecycle-order',
  '0015-route-a-specialized-interface', '0016-close-a-failure-proof',
  '0008-defend-a-safe-change', '0017-defend-the-module-live',
  '0018-compare-three-buffer-pools', '0018a-compare-replacement-policies'
].map(name => name + '.html');

export function checkAudiencePage(html, filename) {
  const failures = [];
  const outsideDisclosures = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, '');
  if (/<strong>\s*(?:Model (?:spine|answer)|모범 답안|모델 답안)\s*:/i.test(outsideDisclosures))
    failures.push('exposed checkpoint model');
  for (const checkpoint of html.matchAll(/<(section|div|article)\b[^>]*(?:data-audience-checkpoint|class="(?:quiz|question-card)")[^>]*>([\s\S]*?)<\/\1>/gi)) {
    if (/<details\b[^>]*\sopen(?:\s|=|>)/i.test(checkpoint[2]))
      failures.push('checkpoint explanation starts open');
    if (!/<details\b[^>]*>\s*<summary\b[^>]*>[^<]+<\/summary>[\s\S]+?<\/details>/i.test(checkpoint[2]))
      failures.push('checkpoint without a disclosure');
  }
  for (const section of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)) {
    if (!/data-audience-checkpoint|Quick checkpoint|빠른 확인/.test(section[0])) continue;
    for (const table of section[2].matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
      if (!/<th>\s*(?:Answer|답|정답)\s*<\/th>/i.test(table[1])) continue;
      const withoutAnswers = table[1].replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, '');
      for (const row of withoutAnswers.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
        if (cells[1]?.[1].replace(/<[^>]+>/g, '').trim()) failures.push('exposed checkpoint answer in table');
      }
    }
  }
  const visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (/teaching agent|teach-back|teach it back|paste.{0,40}chat|you reported reading|keyword.{0,20}mastery|채팅.{0,20}붙여|학습 기록/i.test(visible))
    failures.push('instructor-only or personal-coaching wording');
  if (/<textarea\b|\bdata-retrieval\b|teach-retrieval\.js/i.test(html))
    failures.push('retired answer-entry or keyword-scoring workflow');
  for (const marker of ['data-seminar', 'data-curriculum-link', 'data-library-link'])
    if (!html.includes(marker)) failures.push(`missing ${marker}`);
  const audienceNavigation = html.replace(/<nav\b[^>]*data-language-switcher[^>]*>[\s\S]*?<\/nav>/g, '');
  if (/href=["'][^"']*(?:presenter-runbook|NOTES\.md|MISSION\.md|curriculum-coverage\.md|course-coverage-matrix\.html)/i.test(audienceNavigation))
    failures.push('author-only artifact in participant navigation');
  const index = lectureOrder.indexOf(path.posix.basename(filename));
  if (filename.includes('/lessons/') && index < 0) failures.push('lecture missing from dependency order');
  if (index >= 0) {
    for (const heading of html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
      const label = heading[1].replace(/<[^>]+>/g, ' ');
      if (/\blecture\b|강의/i.test(label) && /only when you need|필요할 때만/i.test(label))
        failures.push(`required lecture framed as conditional: ${label}`);
    }
    for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const target = path.posix.basename(anchor[1].split(/[?#]/)[0]);
      if (!lectureOrder.includes(target)) continue;
      const label = anchor[2].replace(/<[^>]+>/g, ' ').trim();
      if (/\boptional\b|선택\s*(?:강의|학습|사항)/i.test(label))
        failures.push(`required lecture labeled optional: ${label}`);
      const direction = /\b(?:next|continue|proceed)\b|다음|이어서|계속/i.test(label) ? 1
        : /\b(?:previous|return to|back to)\b|이전|돌아가기|^←/i.test(label) ? -1 : 0;
      if (direction && target !== lectureOrder[index + direction])
        failures.push(`conflicting continuation route: ${label} -> ${target}`);
    }
    for (const marker of ['data-lecture-nav', 'data-presentation-toggle', 'data-section-previous', 'data-section-next'])
      if (!html.includes(marker)) failures.push(`missing ${marker}`);
    if (!/<details\b[^>]*class="answer-disclosure"[^>]*>\s*<summary>[^<]+<\/summary>[\s\S]+?<\/details>/.test(html))
      failures.push('missing native checkpoint explanation');
    if (!/<nav\b[^>]*data-presentation-controls[^>]*\bhidden\b/.test(html))
      failures.push('presentation controls must be hidden until JavaScript initializes');
    const nav = html.match(/<nav\b[^>]*data-lecture-nav[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
    for (const [rel, expected] of [['prev', lectureOrder[index - 1]], ['next', lectureOrder[index + 1]]]) {
      const target = nav.match(new RegExp(`<a\\b[^>]*rel="${rel}"[^>]*href="([^"]+)"`))?.[1];
      if (target !== expected) failures.push(`incorrect ${rel} lecture: ${target} (expected ${expected})`);
    }
  }
  return failures;
}

export async function validateAudience(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'teaching-pages.json'), 'utf8'));
  const failures = [];
  for (const page of manifest.pages) for (const filename of [page.en, page.ko]) {
    const html = await readFile(path.join(root, filename), 'utf8');
    failures.push(...checkAudiencePage(html, filename).map(message => `${filename}: ${message}`));
    if (/^(en|ko)\/(index.html|reference\/course-learning-path.html)$/.test(filename)) {
      const phases = [...html.matchAll(/<section\b[^>]*class="curriculum-phase"[^>]*>([\s\S]*?)<\/section>/g)];
      const links = phases.flatMap(match => [...match[1].matchAll(/href="[^"#]*\/([^"/]+\.html)"/g)].map(m => m[1]));
      if (phases.length !== 8 || JSON.stringify(links) !== JSON.stringify(lectureOrder))
        failures.push(`${filename}: syllabus must expose all 25 lectures in the eight-phase dependency order`);
    }
  }
  return { count: manifest.pages.length, failures };
}

// Runs inside Chromium, once for every served HTML page. No simulated layout.
export function checkPresentationDom() {
  const failures = [];
  if (!document.querySelector('[data-lecture-nav]')) return failures;
  const sections = [...document.querySelectorAll('.lesson-main > section.section')];
  const toggle = document.querySelector('[data-presentation-toggle]');
  const bar = document.querySelector('[data-presentation-controls]');
  if (!sections.length || !toggle || bar.hidden) return ['presentation did not initialize'];
  window.scrollTo(0, 0);
  toggle.click();
  if (sections.filter(e => !e.hidden).length !== 1 || toggle.getAttribute('aria-pressed') !== 'true')
    failures.push('presentation must focus exactly one section');
  const next = document.querySelector('[data-section-next]');
  if (sections.length > 1) {
    next.click();
    if (sections[1].hidden || !sections[0].hidden) failures.push('next-section navigation failed');
    document.querySelector('[data-section-previous]').click();
    if (sections[0].hidden) failures.push('previous-section navigation failed');
  }
  toggle.click();
  if (sections.some(e => e.hidden) || new URL(location.href).searchParams.has('present'))
    failures.push('reading mode did not restore the complete document');
  for (const details of document.querySelectorAll('[data-audience-checkpoint] details, .question-card details, details.answer-disclosure')) {
    if (details.open) failures.push('checkpoint explanation starts open');
    details.querySelector('summary').click();
    if (!details.open) failures.push('native answer disclosure did not open');
    details.querySelector('summary').click();
  }
  return failures;
}

// Use real browser input: DOM .click() does not reproduce toolbar focus.
export async function checkPresentationKeyboard(page) {
  if (!await page.locator('[data-lecture-nav]').count()) return [];
  const failures = [];
  const ids = await page.locator('.lesson-main > section.section').evaluateAll(sections => sections.map(s => s.id));
  const toggle = page.locator('[data-presentation-toggle]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await toggle.click();
  if (ids.length > 1) {
    await page.keyboard.press('PageDown');
    if (new URL(page.url()).hash !== '#' + ids[1]) failures.push('PageDown failed after toolbar click');
    await page.locator('[data-section-next]').focus();
    await page.keyboard.press('PageUp');
    if (new URL(page.url()).hash !== '#' + ids[0]) failures.push('PageUp failed with toolbar focus');
  }
  await toggle.focus();
  await page.keyboard.press('Escape');
  if (await toggle.getAttribute('aria-pressed') !== 'false') {
    failures.push('Escape failed with toolbar focus');
    await toggle.click();
  }
  return failures;
}
