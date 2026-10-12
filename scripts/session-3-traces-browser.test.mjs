import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import fs from 'node:fs/promises';

let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const unavailable = chromium ? false : 'UNAVAILABLE: set PLAYWRIGHT_MODULE';
const base = process.env.SEMINAR_URL || 'http://127.0.0.1:3935';
const lectures = ['0001-present-the-page-journey', '0006-flush-one-generation',
  '0006a-understand-page-buffer-daemons', '0006b-follow-page-flush-handoff',
  '0006c-follow-maintenance-and-pacing', '0018a-compare-replacement-policies'];
let browser;
async function activate(locator, page) { await locator.focus(); await page.keyboard.press('Enter'); }
before(async () => { if (chromium) browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

for (const lang of ['en', 'ko']) {
  test(`${lang}: all 24 questions and authored traces are delivered and keyboard reversible`, { skip: unavailable }, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const questions = [];
    let traceCount = 0;
    try {
      for (const lecture of lectures) {
        const file = `${lang}/lessons/${lecture}.html`;
        const response = await fetch(`${base}/${file}`);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(file), 'exact served HTML');
        await page.goto(`${base}/${file}`);
        questions.push(...await page.locator('[data-question-id]').evaluateAll(nodes => nodes.map(node => node.dataset.questionId)));
        assert.equal(await page.locator('.session-question details[open]').count(), 0);
        for (const question of await page.locator('.session-question').all()) {
          assert.equal(await question.evaluate(node => Boolean(node.closest('details'))), false, 'prediction visible before disclosure');
          const summary = question.locator('summary');
          await summary.focus(); await page.keyboard.press('Enter');
          assert.equal(await question.locator('details').getAttribute('open'), '');
          await page.keyboard.press('Enter');
          assert.equal(await question.locator('details').getAttribute('open'), null);
        }
        for (const trace of await page.locator('[data-state-trace]').all()) {
          traceCount++;
          assert.equal(await trace.evaluate(node => Boolean(node.closest('details'))), false, 'state trace visible');
          const steps = trace.locator('.trace-steps > li');
          const count = await steps.count();
          const next = trace.locator('[data-trace-next]');
          const initial = await steps.first().innerText();
          const laneOrder = await steps.first().locator('dt').allTextContents();
          assert.equal(await trace.locator('li:visible').count(), 1);
          for (let i = 1; i < count; i++) {
            await next.focus(); await page.keyboard.press('Enter');
            assert.equal(await trace.locator('li:visible').getAttribute('data-trace-step'), String(i));
            assert.deepEqual(await steps.nth(i).locator('dt').allTextContents(), laneOrder, 'stable lanes');
            assert.ok(await steps.nth(i).locator('.trace-change').innerText());
            assert.ok(await steps.nth(i).locator('.trace-guard').innerText());
          }
          assert.equal(await next.isDisabled(), true);
          await activate(trace.locator('[data-trace-previous]'), page);
          assert.equal(await trace.locator('li:visible').getAttribute('data-trace-step'), String(count - 2));
          await activate(trace.locator('[data-trace-all]'), page);
          assert.equal(await trace.locator('li:visible').count(), count);
          await activate(trace.locator('[data-trace-reset]'), page);
          assert.equal(await trace.locator('li:visible').innerText(), initial);
        }
      }
      assert.deepEqual(questions.sort(), Array.from({ length: 24 }, (_, i) => `Q${String(i + 1).padStart(2, '0')}`));
      assert.equal(traceCount, 15);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test(`${lang}: generation, clock, ring and completion outcomes preserve source boundaries`, { skip: unavailable }, async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${base}/${lang}/lessons/0006-flush-one-generation.html?present=1#flush-state-trace`);
      const flush = page.locator('#flush-state-trace');
      await activate(flush.locator('[data-trace-all]'), page);
      assert.deepEqual(await flush.locator('li').last().locator('dd').allTextContents(),
        ['40 / 180', '40 / 120', '1 / 0 / 160', 'durable WAL=140; DWB=G accepted; home=unobserved']);
      assert.equal(await page.locator('[data-presentation-toggle]').getAttribute('aria-pressed'), 'true');
      await page.goto(`${base}/${lang}/lessons/0006b-follow-page-flush-handoff.html`);
      assert.deepEqual(await page.locator('#post-flush-state-trace li').last().locator('dd').allTextContents(),
        ['DIRTY=1; FLUSHING=0; fcnt=1; LRU3', 'empty; G completion done', 'woken for G', 'still waiting; no offer']);
      assert.match(await page.locator('#queue-full-state-trace li').last().innerText(), /local completion done/);
      await page.goto(`${base}/${lang}/lessons/0018a-compare-replacement-policies.html?present=1#postgres-first-trace`);
      const clock = page.locator('#clock-state-trace');
      const alternative = page.locator('#clock-alternative-trace');
      await activate(clock.locator('[data-trace-all]'), page);
      assert.deepEqual(await clock.locator('li').last().locator('dd').allTextContents(), ['H1 / 0 / 1', 'S1 / 1 / 0', 'S2 / 0 / 0', 'S3 / 1 / 0']);
      assert.deepEqual(await alternative.locator('li:visible dd').allTextContents(), ['H1 / 0 / 2', 'S1 / 1 / 0', 'S2 / 0 / 1', 'S3 / 0 / 1'], 'independent reset');
      await activate(alternative.locator('[data-trace-all]'), page);
      assert.deepEqual(await alternative.locator('li').last().locator('dd').allTextContents(), ['H1 / 0 / 0', 'S1 / 1 / 0', 'S2 / 1 / 0', 'S3 / 0 / 0']);
      await activate(clock.locator('[data-trace-reset]'), page);
      assert.equal(await alternative.locator('li:visible').count(), 4, 'reset only its own scenario');
      await page.goto(`${base}/${lang}/lessons/0018a-compare-replacement-policies.html#ring-state-trace`);
      assert.deepEqual(await page.locator('#ring-state-trace li').last().locator('dd').allTextContents(), ['F4 / F6', '0 / 1 / S', '0 / 2 / T', '1 / 0 / U']);
      assert.match(await page.locator('#ring-wal-trace li').nth(1).innerText(), /InvalidBuffer \/ shared R remains dirty/);
      assert.match(await page.locator('#invalidation-state-trace li').last().innerText(), /R mapping retained; no retag/);
    } finally { await page.close(); }
  });

  for (const width of [390, 320]) {
    test(`${lang}: ${width}px no-JavaScript reading exposes all snapshots and native answers`, { skip: unavailable }, async () => {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 } });
      try {
        const page = await context.newPage();
        for (const lecture of lectures) {
          await page.goto(`${base}/${lang}/lessons/${lecture}.html`);
          assert.equal(await page.locator('.trace-steps > li:visible').count(), await page.locator('.trace-steps > li').count());
          assert.equal(await page.locator('.trace-controls:visible').count(), 0);
          assert.equal(await page.locator('.session-question details[open]').count(), 0);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), lecture);
          assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)));
        }
      } finally { await context.close(); }
    });
  }
}
