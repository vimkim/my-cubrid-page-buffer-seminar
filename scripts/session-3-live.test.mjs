import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkSessionChapter, validateSession3, requiresLegacyRedirect } from './session-3-contract.mjs';

const route = JSON.parse(await fs.readFile('session-3-route.json', 'utf8'));
const dispositions = JSON.parse(await fs.readFile('docs/session-3-live-dispositions.json', 'utf8'));

test('the real dedicated product delivers all questions, traces and the closed route', async () => {
  assert.deepEqual(await validateSession3(process.cwd()), { count: 27, failures: [] });
  assert.equal(requiresLegacyRedirect({ path: 'lessons/0006-flush-one-generation.html', legacyRedirect: false }), true,
    'existing migrated routes retain source and served redirect checks');
  assert.equal(requiresLegacyRedirect({ path: 'seminar-3/02-flush-generations.html', legacyRedirect: false }), false);
});

test('a wrong next chapter, old-library return, wrong counterpart and missing closure are rejected', async () => {
  const first = route.chapters[0];
  const html = await fs.readFile('ko/seminar-3/' + first.file, 'utf8');
  assert.ok(checkSessionChapter(html.replace('rel="next" href="02-flush-generations.html#workload"',
    'rel="next" href="03-daemon-architecture.html#workload"'), first, 0, route, 'ko').includes('incorrect next chapter'));
  assert.ok(checkSessionChapter(html.replace('data-session-return href="toc.html"',
    'data-session-return href="../reference/defense-generations.html"'), first, 0, route, 'ko').length);
  assert.ok(checkSessionChapter(html.replace('../../en/seminar-3/01-opening.html',
    '../../en/seminar-3/02-flush-generations.html'), first, 0, route, 'ko').length);
  const last = await fs.readFile('en/seminar-3/12-final-defense.html', 'utf8');
  assert.ok(checkSessionChapter(last.replace('id="closure"', 'id="missing"'), route.chapters[11], 11, route, 'en').length);
});

let chromium, browser;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const unavailable = chromium ? false : 'UNAVAILABLE: set PLAYWRIGHT_MODULE';
const base = process.env.SEMINAR_URL || 'http://127.0.0.1:3935';
before(async () => { if (chromium) browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });
async function activate(locator, page) { await locator.focus(); await page.keyboard.press('Enter'); }

test('root TOC opens the entire Korean journey and reaches closure', { skip: unavailable }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base + '/toc.html');
    assert.equal(await page.locator('[data-session-chapter]').count(), 12);
    await activate(page.locator('[data-session-start]'), page);
    await page.waitForURL('**/ko/seminar-3/01-opening.html#workload');
    for (const [i, chapter] of route.chapters.entries()) {
      assert.equal(new URL(page.url()).pathname, '/ko/seminar-3/' + chapter.file);
      assert.equal(await page.locator('#workload').isVisible(), true);
      if (i < 11) {
        await activate(page.locator('[data-lecture-nav] [rel="next"]'), page);
        await page.waitForURL('**/ko/seminar-3/' + route.chapters[i + 1].file + '#workload');
      }
    }
    assert.ok(await page.locator('#closure').innerText());
    assert.equal(await page.locator('[data-lecture-nav] [rel="next"]').count(), 0);
    await activate(page.locator('[data-session-return]'), page);
    await page.waitForURL('**/ko/seminar-3/toc.html');
    assert.equal(new URL(page.url()).pathname, '/ko/seminar-3/toc.html');
  } finally { await page.close(); }
});

for (const lang of ['en', 'ko']) {
  test(`${lang}: deep trace entry starts at its screen top and staged evidence resets`, { skip: unavailable }, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(`${base}/${lang}/seminar-3/05-post-flush.html?present=1#post-flush-state-trace`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await page.locator('#post-flush-state-trace').isVisible(), true);
      await page.goto(`${base}/${lang}/seminar-3/12-final-defense.html?present=1#diagnosis-current`);
      await activate(page.locator('#diagnosis-current summary'), page);
      await page.keyboard.press('PageDown'); await page.keyboard.press('PageUp');
      assert.equal(await page.locator('#diagnosis-current details').getAttribute('open'), null);
    } finally { await page.close(); }
  });
  test(`${lang}: every new page renders, pairs, reveals answers and steps by keyboard`, { skip: unavailable }, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      for (const file of ['toc.html', ...route.chapters.map(c => c.file)]) {
        const relative = `${lang}/seminar-3/${file}`;
        const response = await fetch(base + '/' + relative);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(relative));
        await page.goto(base + '/' + relative);
        assert.ok(await page.locator('img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0 && i.naturalHeight > 0)));
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), relative + ' at ' + width);
        }
        if (file === 'toc.html') continue;
        for (const answer of await page.locator('.answer-disclosure').all()) {
          assert.equal(await answer.getAttribute('open'), null);
          await activate(answer.locator('summary').first(), page);
          assert.equal(await answer.getAttribute('open'), '');
          await page.keyboard.press('Enter');
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.evaluate(() => scrollTo(0, 0));
        await activate(page.locator('[data-presentation-toggle]'), page);
        const ids = await page.locator('.lesson-main > section').evaluateAll(nodes => nodes.map(n => n.id));
        assert.equal(await page.locator('section.section:visible').count(), 1);
        for (let i = 1; i < ids.length; i++) {
          await page.keyboard.press('PageDown');
          assert.equal(await page.locator('section.section:visible').getAttribute('id'), ids[i]);
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('section.section:visible').count(), ids.length);
        const other = lang === 'en' ? 'ko' : 'en';
        assert.equal(await page.locator(`[data-language-switcher] a[hreflang="${other}"]`).getAttribute('href'), `../../${other}/seminar-3/${file}`);
      }
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test(`${lang}: all 25 relocated/new traces retain outcomes and independent keyboard reset`, { skip: unavailable }, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    try {
      const grouped = Map.groupBy(dispositions.filter(d => d.language === lang && d.kind === 'trace'), d => d.target.split('#')[0]);
      for (const [file, traces] of grouped) {
        await page.goto(base + '/' + file);
        for (const record of traces) {
          const trace = page.locator('#' + record.key); const steps = trace.locator('.trace-steps > li');
          const first = await steps.first().innerText();
          const lanes = await steps.first().locator('dt').allTextContents();
          for (let i = 1; i < await steps.count(); i++) {
            await activate(trace.locator('[data-trace-next]'), page);
            assert.equal(await trace.locator('li:visible').getAttribute('data-trace-step'), String(i));
            assert.deepEqual(await steps.nth(i).locator('dt').allTextContents(), lanes);
          }
          assert.deepEqual(await trace.locator('li:visible dd').allTextContents(), record.terminal);
          await activate(trace.locator('[data-trace-previous]'), page);
          await activate(trace.locator('[data-trace-all]'), page);
          const otherStates = await page.locator('[data-state-trace]').evaluateAll(nodes => nodes.map(n => [n.id, n.querySelector('output').textContent]));
          await activate(trace.locator('[data-trace-reset]'), page);
          assert.equal(await trace.locator('li:visible').innerText(), first);
          for (const [id, state] of otherStates) if (id !== record.key) assert.equal(await page.locator('#' + id + ' output').innerText(), state);
        }
      }
    } finally { await page.close(); }
  });

  test(`${lang}: no-JavaScript mobile access exposes all screens/snapshots and native evidence`, { skip: unavailable }, async () => {
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      for (const chapter of route.chapters) {
        await page.goto(`${base}/${lang}/seminar-3/${chapter.file}`);
        assert.equal(await page.locator('.lesson-main > section:visible').count(), await page.locator('.lesson-main > section').count());
        assert.equal(await page.locator('.trace-steps > li:visible').count(), await page.locator('.trace-steps > li').count());
        assert.equal(await page.locator('.trace-controls:visible').count(), 0);
        assert.equal(await page.locator('[data-presentation-controls]:visible').count(), 0);
        for (const answer of await page.locator('.answer-disclosure').all()) {
          await activate(answer.locator('summary').first(), page);
          assert.equal(await answer.getAttribute('open'), '');
        }
      }
    } finally { await page.close(); }
  });
}

test('all Korean spoken screen cues resolve to the exact served chapter/anchor', { skip: unavailable }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base + '/my-presentation-script-session-3.html');
    assert.equal(await page.locator('section.run-sheet').count(), 12);
    const cues = await page.locator('.cue a[href*="seminar-3"], .screen-cues a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
    for (const [file, group] of Map.groupBy(cues, href => href.split('#')[0])) {
      await page.goto(base + '/' + file);
      for (const cue of group) assert.equal(await page.locator('[id="' + cue.split('#')[1] + '"]').count(), 1, cue);
    }
  } finally { await page.close(); }
});
