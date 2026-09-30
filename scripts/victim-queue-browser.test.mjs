import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const unavailable = chromium ? false : 'UNAVAILABLE: install Playwright or set PLAYWRIGHT_MODULE';
const base = (process.env.SEMINAR_URL || 'http://127.0.0.1:3935').replace(/\/$/, '');
const sections = ['victim-queue-map', 'shared-queue-registration', 'private-queue-stale-index', 'victim-queue-policy'];
const figures = ['victim-list-queue-map', 'shared-victim-queue-registration', 'private-victim-queue-stale-index'];
let browser;
before(async () => { if (chromium) browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

for (const language of ['en', 'ko']) {
  for (const mode of ['reading', 'projection', 'mobile-no-js']) {
    test(`${language} victim queues: ${mode} exposes diagrams, details, and navigation`, { skip: unavailable }, async () => {
      const context = await browser.newContext({
        viewport: mode === 'mobile-no-js' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        javaScriptEnabled: mode !== 'mobile-no-js',
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = `${base}/${language}/lessons/0007-replace-one-frame.html`;
        await page.goto(`${url}${mode === 'projection' ? '?present=1' : ''}#victim-queue-map`);
        for (const id of sections) {
          if (mode === 'projection') await page.goto(`${url}?present=1#${id}`);
          const section = page.locator('#' + id);
          assert.equal(await section.isVisible(), true, id);
          await section.evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
          for (const image of await section.locator('img').all()) {
            await image.evaluate(node => node.decode());
            assert.equal(await image.evaluate(node => node.naturalWidth > 0 && node.naturalHeight > 0), true);
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${id}: horizontal overflow`);
        }
        if (mode === 'projection') await page.goto(`${url}?present=1#private-queue-stale-index`);
        const detail = page.locator('#private-queue-stale-index details');
        assert.equal(await detail.getAttribute('open'), null);
        await detail.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.notEqual(await detail.getAttribute('open'), null);
        if (mode === 'projection') {
          await page.locator('[data-section-next]').click();
          assert.equal(await page.locator('#victim-queue-policy').isVisible(), true);
          await page.locator('[data-section-previous]').click();
          assert.equal(await page.locator('#private-queue-stale-index').isVisible(), true);
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}

test('victim queue SVG labels stay inside each viewBox', { skip: unavailable }, async () => {
  const page = await browser.newPage();
  try {
    for (const name of figures) {
      const response = await page.goto(`${base}/assets/${name}.svg`);
      assert.equal(response.status(), 200);
      const clipped = await page.evaluate(() => {
        const view = document.documentElement.viewBox.baseVal;
        return [...document.querySelectorAll('text')].filter(node => {
          const bounds = node.getBBox();
          return bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > view.width || bounds.y + bounds.height > view.height;
        }).map(node => node.textContent);
      });
      assert.deepEqual(clipped, [], name);
    }
  } finally { await page.close(); }
});
