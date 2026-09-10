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
