import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const unavailable = chromium ? false : 'UNAVAILABLE: install Playwright or set PLAYWRIGHT_MODULE';
const base = process.env.SEMINAR_URL || 'http://127.0.0.1:3935';
let browser;
before(async () => { if (chromium) browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

for (const language of ['en', 'ko']) {
  test(`${language}: Clock inspection, replacement, reset and presentation preserve request 7`, { skip: unavailable }, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/${language}/lessons/0000-replacement-foundations.html?present=1#clock`);
      assert.equal(await page.locator('[data-presentation-toggle]').getAttribute('aria-pressed'), 'true');
      const current = page.locator('[data-clock-step]:visible');
      const next = page.locator('[data-clock-next]');
      const expected = [
        ['111', 'F0', 'P'], ['011', 'F1', 'P'], ['001', 'F2', 'P'],
        ['000', 'F0', 'P'], ['100', 'F1', 'T'],
      ];
      for (let i = 0; i < expected.length; i++) {
        const [bits, hand, f0] = expected[i];
        assert.equal(await current.count(), 1);
        assert.equal(await current.getAttribute('data-bits'), bits);
        assert.equal(await current.getAttribute('data-hand'), hand);
        assert.equal(await current.locator('.rf-ring-f0 strong').innerText(), f0);
        assert.deepEqual(await current.locator('.rf-ring-frame > span b').allTextContents(), bits.split(''));
        if (i < expected.length - 1) {
          await next.focus();
          await page.keyboard.press('Enter');
        }
      }
      assert.equal(await next.isDisabled(), true);
      await page.locator('[data-clock-previous]').click();
      assert.equal(await current.getAttribute('data-bits'), '000');
      await page.locator('[data-clock-reset]').click();
      assert.equal(await current.getAttribute('data-bits'), '111');
      assert.equal(await next.isEnabled(), true);
      await page.locator('[data-presentation-toggle]').click();
      assert.equal(await page.locator('#visual-capacity').isVisible(), true);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test(`${language}: all diagrams and Clock states are readable without JavaScript on mobile`, { skip: unavailable }, async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.goto(`${base}/${language}/lessons/0000-replacement-foundations.html`);
      assert.equal(await page.locator('.rf-visual:visible').count(), 5);
      assert.equal(await page.locator('[data-clock-step]:visible').count(), 5);
      assert.equal(await page.locator('[data-request-step]:visible').count(), 11);
      assert.equal(await page.locator('[data-request-controls]').isVisible(), false);
      assert.equal(await page.locator('[data-clock-controls]').isVisible(), false);
      assert.equal(await page.locator('#visual-capacity .rf-store .rf-pages').innerText(), 'P\nR\nS\nT');
      assert.equal(await page.locator('#visual-timeline li').count(), 10);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await page.locator('.rf-visual').evaluateAll(figures => figures.every(figure => figure.scrollWidth <= figure.clientWidth)));
    } finally { await context.close(); }
  });
}

for (const language of ['en', 'ko']) {
  test(`${language}: request comparison preserves slots, diverges at T, and supports back/reset`, { skip: unavailable }, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/${language}/lessons/0000-replacement-foundations.html?present=1#policy-comparison`);
      const current = page.locator('[data-request-step]:visible');
      const previous = page.locator('[data-request-previous]');
      const next = page.locator('[data-request-next]');
      assert.equal(await previous.isDisabled(), true);
      for (let i = 1; i <= 10; i++) {
        await next.focus();
        await page.keyboard.press('Enter');
        assert.equal(await current.count(), 1);
        assert.equal(await current.getAttribute('data-request'), String(i));
        if (i === 3) {
          for (const policy of ['fifo', 'lru']) {
            assert.deepEqual(await current.locator(`[data-policy="${policy}"] .rf-frame strong`).allTextContents(), ['P', 'R', '—']);
          }
          assert.equal(await current.locator('[data-policy="fifo"] .rf-order strong').innerText(), 'P → R');
          assert.equal(await current.locator('[data-policy="lru"] .rf-order strong').innerText(), 'R → P');
        }
        if (i === 7) {
          assert.deepEqual(await current.locator('[data-policy="fifo"] .rf-frame strong').allTextContents(), ['T', 'R', 'S']);
          assert.deepEqual(await current.locator('[data-policy="lru"] .rf-frame strong').allTextContents(), ['P', 'R', 'T']);
        }
      }
      assert.equal(await next.isDisabled(), true);
      await previous.click();
      assert.equal(await current.getAttribute('data-request'), '9');
      await page.locator('[data-request-reset]').click();
      assert.equal(await current.getAttribute('data-request'), '0');
      await page.locator('[data-section-next]').click();
      assert.equal(await page.locator('#clock-rules').isVisible(), true);
      await page.locator('[data-section-previous]').click();
      assert.equal(await current.getAttribute('data-request'), '0');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}
