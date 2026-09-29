import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const unavailable = chromium ? false : 'UNAVAILABLE: install Playwright or set PLAYWRIGHT_MODULE';
const base = (process.env.SEMINAR_URL || 'http://127.0.0.1:3923/code-analysis/page-buffer-presentation') + '/';
let browser;
before(async () => { if (chromium) browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

test('LRU trace lets participants predict admission and revisit an unchanged resident position', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage();
    try {
      const response = await page.goto(base + language + '/reference/lru-worked-example.html');
      assert.equal(response.status(), 200);
      await page.getByRole('button', { name: /^(Presentation mode|발표 모드)$/ }).click();
      await page.keyboard.press('PageDown');
      assert.equal(new URL(page.url()).hash, '#load-p');
      const answer = page.locator('#load-p details');
      assert.equal(await answer.getAttribute('open'), null);
      await answer.locator('summary').click();
      assert.match(await answer.innerText(), /30,767/);
      await page.keyboard.press('PageDown');
      assert.equal(new URL(page.url()).hash, '#admit-p');
      await page.keyboard.press('PageDown');
      assert.equal(new URL(page.url()).hash, '#admit-r');
      await page.keyboard.press('PageDown');
      assert.equal(new URL(page.url()).hash, '#hit-p');
      await page.locator('#hit-p > details > summary').click();
      assert.match(await page.locator('#hit-p > details').innerText(), /F43.*F42.*H1.*H2/s);
      await page.keyboard.press('PageDown');
      assert.equal(new URL(page.url()).hash, '#unfix-p');
      await page.locator('#unfix-p > details > summary').click();
      assert.match(await page.locator('#unfix-p > details').innerText(), /F43.*F42.*H1.*H2/s);
      await page.keyboard.press('PageUp');
      assert.equal(new URL(page.url()).hash, '#hit-p');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('section.section[hidden]').count(), 0);
      await page.goto(base + language + '/reference/lru-worked-example.html?present=1#admit-p');
      assert.equal(await page.locator('#admit-p').isVisible(), true);
      assert.equal(await page.locator('#load-p').isVisible(), false);
    } finally { await page.close(); }
  }
});

test('LRU trace remains readable without JavaScript and links to its language counterpart', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/reference/lru-worked-example.html');
      assert.equal(await page.locator('[data-presentation-controls]').isVisible(), false);
      assert.equal(await page.locator('#snapshot').isVisible(), true);
      assert.equal(await page.locator('#carry-forward').isVisible(), true);
      await page.locator('#unfix-p > details > summary').click();
      assert.equal(await page.locator('#unfix-p > details > pre').first().isVisible(), true);
      await page.locator('#unfix-p details details summary').click();
      assert.match(await page.locator('#unfix-p details details').innerText(), /case PGBUF_LRU_1_ZONE/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('[data-language-switcher] a').click();
      assert.match(page.url(), new RegExp('/' + (language === 'en' ? 'ko' : 'en') + '/reference/lru-worked-example.html$'));
    }
  } finally { await context.close(); }
});

test('all Lecture 8 continuation links lead to the next integration lecture', { skip: unavailable }, async () => {
  const page = await browser.newPage();
  try {
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/lessons/0008-defend-a-safe-change.html');
      const links = page.getByRole('link', { name: /Continue|Next:|계속|다음:/i });
      assert.ok(await links.count() >= 2, 'both inline and rail continuation routes are present');
      for (const link of await links.all()) {
        const href = await link.getAttribute('href');
        assert.equal(href, '0017-defend-the-module-live.html');
      }
      await links.first().click();
      assert.match(page.url(), /\/0017-defend-the-module-live\.html$/);
    }
  } finally { await page.close(); }
});

test('presentation shortcuts work after a real toolbar click in both languages', { skip: unavailable }, async () => {
  const page = await browser.newPage();
  try {
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/lessons/0006-flush-one-generation.html');
      await page.getByRole('button', { name: /^(Presentation mode|발표 모드)$/ }).click();
      await page.keyboard.press('PageDown');
      assert.match(page.url(), /#flush-actors$/, 'PageDown advances from the focused toggle');
      await page.getByRole('button', { name: /^(Previous section|이전 절)$/ }).click();
      assert.match(page.url(), /#flush-purpose$/);
      await page.getByRole('button', { name: /^(Reading mode|읽기 모드)$/ }).focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: /^(Presentation mode|발표 모드)$/ }).getAttribute('aria-pressed'), 'false');
      assert.equal(new URL(page.url()).searchParams.has('present'), false);
    }
  } finally { await page.close(); }
});

test('each quick-checkpoint answer is hidden until its own disclosure is opened', { skip: unavailable }, async () => {
  const page = await browser.newPage();
  try {
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/lessons/0006-flush-one-generation.html');
      const rows = page.locator('#failure tbody tr');
      assert.equal(await rows.count(), 3);
      for (const row of await rows.all()) {
        const answerCell = row.locator('td').nth(1);
        const answer = answerCell.locator('p');
        assert.equal(await answerCell.locator('details:not([open])').count(), 1,
          'every answer, not just the later main checkpoint, starts collapsed');
        assert.equal(await answer.isVisible(), false);
        await answerCell.locator('summary').click();
        assert.equal(await answer.isVisible(), true);
        assert.ok((await answer.innerText()).length > 30, 'the explanation is retained');
      }
    }
  } finally { await page.close(); }
});
