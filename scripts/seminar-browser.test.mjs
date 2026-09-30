import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const unavailable = chromium ? false : 'UNAVAILABLE: install Playwright or set PLAYWRIGHT_MODULE';
const base = (process.env.SEMINAR_URL || 'http://127.0.0.1:3935') + '/';
let browser;
before(async () => { if (chromium) browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

test('main lecture compares exact LRU with CUBRID through keyboard prediction and source-trace navigation', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(base + language + '/lessons/0012-prove-replacement-progress.html?present=1#lru-hit-comparison');
      assert.equal(await page.locator('#lru-hit-comparison').count(), 1);
      assert.equal(await page.locator('[data-presentation-toggle]').getAttribute('aria-pressed'), 'true');
      await page.locator('#lru-hit-comparison').waitFor({ state: 'visible' });
      const answer = page.locator('#lru-hit-comparison > details');
      assert.equal(await answer.getAttribute('open'), null);
      await answer.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.notEqual(await answer.getAttribute('open'), null);
      const rows = await answer.locator('tbody tr').allTextContents();
      assert.equal(rows.length, 3);
      assert.match(rows[1], /P → R → H1 → H2/);
      assert.match(rows[1], /R → P → H1 → H2/);
      await page.locator('[data-section-next]').click();
      await page.locator('#lru-conditional-movement').waitFor({ state: 'visible' });
      await page.locator('[data-section-previous]').click();
      await page.locator('#lru-hit-comparison').waitFor({ state: 'visible' });
      const trace = page.locator('#lru-hit-comparison a[href="../reference/lru-worked-example.html#hit-p"]');
      await trace.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/lru-worked-example.html#hit-p');
      assert.equal(await page.locator('#hit-p').isVisible(), true);
    } finally { await page.close(); }
  }
});

test('syllabus reaches the main LRU comparison and its native answer without scripts on mobile', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/reference/course-learning-path.html#replacement-route');
      const link = page.locator('#replacement-route a[href="../lessons/0012-prove-replacement-progress.html#textbook-vs-cubrid"]');
      assert.equal(await link.count(), 1);
      await link.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/0012-prove-replacement-progress.html#textbook-vs-cubrid');
      for (const id of ['textbook-vs-cubrid', 'lru-hit-comparison', 'lru-conditional-movement', 'lru-policy-layers', 'lru-tradeoffs']) {
        assert.equal(await page.locator('#' + id).isVisible(), true);
      }
      await page.locator('#lru-hit-comparison > details > summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#lru-hit-comparison > details[open]').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  } finally { await context.close(); }
});

test('integrated replacement route is reachable from library and syllabus without JavaScript', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/index.html#library');
      const entry = page.locator('#library a[href="reference/lru-worked-example.html#snapshot"]');
      assert.equal(await entry.count(), 1, 'topic library exposes the complete worked example');
      await entry.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/lru-worked-example.html#snapshot');
      assert.equal(await page.locator('#policy-defense').isVisible(), true);
      await page.locator('#policy-defense > details > summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#policy-defense > details[open]').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(base + language + '/reference/course-learning-path.html#replacement-route');
      const resume = page.locator('#replacement-route a[href="lru-worked-example.html#selection-baseline"]');
      await resume.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/lru-worked-example.html#selection-baseline');
      assert.equal(await page.locator('#reuse-safe').isVisible(), true);
    }
  } finally { await context.close(); }
});

test('reuse schedules reset answers across branch switches and forward/backward navigation', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(base + language + '/reference/lru-worked-example.html?present=1#reuse-reject');
      await page.locator('#reuse-reject > details > summary').click();
      assert.match(await page.locator('#reuse-reject > details').innerText(), /C50\/Q/);
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#reuse-safe');
      await page.locator('[data-section-previous]').click();
      assert.equal(await page.locator('#reuse-reject > details').getAttribute('open'), null);
      await page.locator('#reuse-reject a[href="#reuse-direct"]').click();
      await page.locator('#reuse-direct').waitFor({ state: 'visible' });
      await page.locator('#reuse-direct > details > summary').focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#reuse-direct > details').innerText(), /INVALIDATE_DIRECT_VICTIM/);
      await page.locator('#reuse-direct a[href="#selection-baseline"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**#selection-baseline');
      assert.equal(new URL(page.url()).hash, '#selection-baseline');
      await page.goBack();
      await page.waitForURL('**#reuse-direct');
      await page.locator('#reuse-direct').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).hash, '#reuse-direct');
      assert.equal(await page.locator('#reuse-direct > details').getAttribute('open'), null);
    } finally { await page.close(); }
  }
});

test('reuse alternatives retain all histories and native answers without JavaScript', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/reference/lru-worked-example.html#reuse-flush');
      for (const id of ['reuse-reject', 'reuse-safe', 'reuse-flush', 'reuse-direct']) {
        assert.equal(await page.locator('#' + id).isVisible(), true);
        await page.locator('#' + id + ' > details > summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#' + id + ' > details').getAttribute('open'), '');
      }
      assert.match(await page.locator('#reuse-flush > details').innerText(), /F-redirty:[\s\S]*DIRTY=1/);
      assert.match(await page.locator('#reuse-safe > details').innerText(), /C50\/T/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#reuse-direct a[href="#selection-baseline"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**#selection-baseline');
      assert.equal(new URL(page.url()).hash, '#selection-baseline');
    }
  } finally { await context.close(); }
});

test('policy defense reveals a reset comparison and returns to the final defense route', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(base + language + '/reference/lru-worked-example.html?present=1#policy-compare');
      assert.equal(await page.locator('#policy-compare').isVisible(), true);
      const answer = page.locator('#policy-compare > details');
      assert.equal(await answer.getAttribute('open'), null);
      await answer.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.match(await answer.innerText(), /F42\/P → F43\/R → H1 → H2/);
      assert.match(await answer.innerText(), /1003/);
      await page.locator('[data-section-previous]').click();
      assert.equal(new URL(page.url()).hash, '#policy-proposal');
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#policy-compare');
      await page.keyboard.press('Escape');
      await page.locator('#policy-defense a[href="../lessons/0017-defend-the-module-live.html#policy-review"]').click();
      await page.waitForURL('**/0017-defend-the-module-live.html#policy-review');
      await page.locator('#policy-review a[href="../reference/lru-worked-example.html#policy-proposal"]').click();
      await page.waitForURL('**/lru-worked-example.html#policy-proposal');
      await page.locator('[data-language-switcher] a').click();
      assert.match(page.url(), new RegExp('/' + (language === 'en' ? 'ko' : 'en') + '/reference/lru-worked-example.html'));
    } finally { await page.close(); }
  }
});

test('policy counterexample and human rubric are reachable without scripts on mobile', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/reference/presentation-rehearsal-card.html#policy-review');
      await page.locator('#policy-review a[href="lru-worked-example.html#policy-defense"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/lru-worked-example.html#policy-defense');
      const answer = page.locator('#policy-defense > details');
      assert.equal(await answer.getAttribute('open'), null);
      await answer.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.match(await answer.innerText(), /1022/);
      assert.equal(await page.locator('#policy-defense table tbody tr').count(), 5);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#policy-defense a[href="#policy-proposal"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(new URL(page.url()).hash, '#policy-proposal');
      assert.equal(await page.locator('#policy-proposal').isVisible(), true);
    }
  } finally { await context.close(); }
});

test('LRU continuation reveals cooling and preserves the route into migration', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(base + language + '/reference/lru-worked-example.html?present=1#cooling');
      assert.equal(await page.locator('#cooling').isVisible(), true);
      const answer = page.locator('#cooling > details');
      assert.equal(await answer.getAttribute('open'), null);
      await answer.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.match(await answer.innerText(), /50 \/ 50 \/ 51/);
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#cooled-reuse');
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#cross-context');
      await page.locator('[data-section-previous]').click();
      assert.equal(new URL(page.url()).hash, '#cooled-reuse');
      await page.keyboard.press('Escape');
      await page.locator('[data-language-switcher] a').click();
      assert.match(page.url(), new RegExp('/' + (language === 'en' ? 'ko' : 'en') + '/reference/lru-worked-example.html'));
    } finally { await page.close(); }
  }
});

test('LRU pressure baseline and selection answers remain readable without scripts', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/reference/lru-worked-example.html#exhaust-invalid');
      for (const id of ['exhaust-invalid', 'quota-epoch', 'select-list']) {
        assert.equal(await page.locator('#' + id).isVisible(), true);
        await page.locator('#' + id + ' > details > summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#' + id + ' > details').getAttribute('open'), '');
      }
      assert.match(await page.locator('#exhaust-invalid > details').innerText(), /INVALID = 0/);
      assert.match(await page.locator('#select-list > details').innerText(), /30867 > 5000/);
      assert.equal(await page.locator('#selection-baseline').isVisible(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#selection-baseline a[href="../lessons/0012b-understand-private-lru-index.html#victim-search"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL('**/0012b-understand-private-lru-index.html#victim-search');
      assert.equal(new URL(page.url()).hash, '#victim-search');
    }
  } finally { await context.close(); }
});

test('database bridge preserves branch starts, reveals safety reasoning, and connects the required route', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      const response = await page.goto(base + language + '/lessons/0000a-database-bridge.html?present=1#pinned');
      assert.equal(response.status(), 200);
      const answer = page.locator('#pinned > details');
      assert.equal(await answer.getAttribute('open'), null);
      await answer.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.match(await answer.innerText(), /P \/ T \/ S/);
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#dirty');
      await page.locator('[data-section-previous]').click();
      assert.equal(new URL(page.url()).hash, '#pinned');
      await page.keyboard.press('Escape');
      await page.locator('[data-lecture-nav] a[rel="next"]').click();
      assert.match(page.url(), /0001-present-the-page-journey.html$/);
      await page.locator('[data-lecture-nav] a[rel="prev"]').click();
      assert.match(page.url(), /0000a-database-bridge.html$/);
      await page.locator('[data-language-switcher] a').click();
      assert.match(page.url(), new RegExp('/' + (language === 'en' ? 'ko' : 'en') + '/lessons/0000a-database-bridge.html'));
    } finally { await page.close(); }
  }
});

test('database bridge resets remain readable without scripts at mobile width', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/lessons/0000a-database-bridge.html');
      for (const id of ['pinned', 'dirty', 'progress']) {
        assert.equal(await page.locator('#' + id).isVisible(), true);
        await page.locator('#' + id + ' > details > summary').click();
        assert.equal(await page.locator('#' + id + ' > details').getAttribute('open'), '');
      }
      assert.match(await page.locator('#dirty > details').innerText(), /T \/ R \/ S/);
      assert.match(await page.locator('#progress > details').innerText(), /P \/ R \/ S/);
      assert.equal(await page.locator('#cubrid').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#cubrid > details > summary').click();
      await page.locator('#cubrid a[href="../reference/lru-worked-example.html#snapshot"]').first().click();
      assert.equal(await page.locator('#snapshot').isVisible(), true);
    }
  } finally { await context.close(); }
});

test('replacement foundations supports prediction, deliberate steps, and language transfer', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage();
    try {
      const response = await page.goto(base + language + '/lessons/0000-replacement-foundations.html?present=1#fifo');
      assert.equal(response.status(), 200);
      const answer = page.locator('#fifo > details');
      assert.equal(await answer.getAttribute('open'), null);
      await answer.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await answer.getAttribute('open'), '');
      assert.match(await answer.innerText(), /R \/ U \/ P/);
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#lru');
      await page.locator('[data-section-previous]').click();
      assert.equal(new URL(page.url()).hash, '#fifo');
      await page.keyboard.press('Escape');
      await page.locator('[data-language-switcher] a').click();
      assert.match(page.url(), new RegExp('/' + (language === 'en' ? 'ko' : 'en') + '/lessons/0000-replacement-foundations.html'));
    } finally { await page.close(); }
  }
});

test('replacement foundations retains every trace and exercise without scripts at mobile width', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      await page.goto(base + language + '/lessons/0000-replacement-foundations.html');
      assert.equal(await page.locator('[data-presentation-controls]').isVisible(), false);
      assert.equal(await page.locator('#memory').isVisible(), true);
      assert.equal(await page.locator('#handoff').isVisible(), true);
      for (const policy of ['fifo', 'opt', 'lru', 'clock']) {
        await page.locator('#' + policy + ' > details > summary').click();
        assert.equal(await page.locator('#' + policy + ' tbody tr').count(), 10);
      }
      await page.locator('#exercise > details > summary').click();
      assert.equal(await page.locator('#exercise pre').count(), 4);
      assert.match(await page.locator('#exercise pre').nth(2).innerText(), /7 R H — T\/R\/P/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('[data-lecture-nav] a[rel="next"]').click();
      await page.locator('[data-lecture-nav] a[rel="prev"]').click();
      assert.match(page.url(), /0000-replacement-foundations\.html$/);
    }
  } finally { await context.close(); }
});

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

test('ticket01 bounded opening preserves objects, projection exits and script cues', { skip: unavailable }, async () => {
  for (const language of ['en', 'ko']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(base + language + '/lessons/0001-present-the-page-journey.html?present=1#session-request');
      assert.equal(await page.locator('#session-request').isVisible(), true);
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#session-opening-end');
      await page.locator('#session-opening-end a').click();
      await page.locator('#session-objects').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#session-objects tbody tr').count(), 3);
      const detail = page.locator('#session-objects details');
      await detail.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.notEqual(await detail.getAttribute('open'), null);
      await page.locator('[data-presentation-toggle]').click();
      await page.goto(base + language + '/lessons/0002-separate-objects-from-state.html?present=1#session-objects');
      await page.locator('[data-section-next]').click();
      assert.equal(new URL(page.url()).hash, '#session-objects-end');
      assert.match(await page.locator('#session-objects-end').innerText(), /P → H1/);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#why-bcb').isVisible(), true);
    } finally { await page.close(); }
  }
});

test('ticket01 opening is complete in mobile no-script reading', { skip: unavailable }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    for (const language of ['en', 'ko']) {
      for (const [file, entry, exit] of [
        ['0001-present-the-page-journey.html', 'session-request', 'session-opening-end'],
        ['0002-separate-objects-from-state.html', 'session-objects', 'session-objects-end']
      ]) {
        await page.goto(base + language + '/lessons/' + file);
        assert.equal(await page.locator('#' + entry).isVisible(), true);
        assert.equal(await page.locator('#' + exit).isVisible(), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    }
    await page.goto(base + 'my-presentation-script.html');
    const cues = await page.locator('a[href^="ko/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    for (const href of cues.filter(href => !href.includes('0004-'))) {
      await page.goto(base + href);
      assert.equal(await page.locator(new URL(page.url()).hash).count(), 1, href);
    }
  } finally { await context.close(); }
});

test('ticket02 concurrent-use assumptions precede concealed keyboard answers in both languages', { skip: unavailable }, async () => {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled, viewport: javaScriptEnabled ? { width: 1440, height: 1000 } : { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const language of ['en', 'ko']) {
        await page.goto(base + language + '/lessons/0004-repay-fix-debt.html' + (javaScriptEnabled ? '?present=1' : '') + '#session-readers');
        const section = page.locator('#session-readers');
        assert.equal(await section.isVisible(), true);
        const answer = section.locator('[data-session-answer]');
        assert.equal(await answer.getAttribute('open'), null);
        assert.equal(await answer.locator('p').isVisible(), false);
        assert.match(await section.locator(':scope > p').first().textContent(), /fcnt = 1/);
        await answer.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await answer.locator('p').isVisible(), true);
        assert.match(await answer.textContent(), /fcnt = 2/);
        if (javaScriptEnabled) {
          await page.locator('[data-section-next]').click();
          assert.equal(await page.locator('#session-writer').isVisible(), true);
        }
        const writer = page.locator('#session-writer [data-session-answer]');
        assert.equal(await writer.getAttribute('open'), null);
        await writer.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await writer.locator('p').isVisible(), true);
        assert.equal(await page.locator('#session-release-boundary a[href="0007-replace-one-frame.html#first-principles"]').count(), 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
      }
    } finally { await context.close(); }
  }
});
