import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const base = process.env.SEMINAR_URL || 'http://127.0.0.1:8913';
test('ticket03 admission precedes age/zone rules and survives presentation and no-JS mobile reading', {skip: chromium ? false : 'UNAVAILABLE: Playwright'}, async () => {
 const browser = await chromium.launch({headless:true});
 try {
  for (const lang of ['en','ko']) {
   const path = `${lang}/lessons/0007-replace-one-frame.html`;
   assert.equal(await (await fetch(`${base}/${path}`)).text(),readFileSync(path,'utf8'),'server must serve this worktree');
   const page = await browser.newPage({viewport:{width:1440,height:1000}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${base}/${path}?present=1#admission`);
   assert.equal(await page.locator('#admission').isVisible(),true);
   assert.equal(await page.locator('[data-presentation-toggle]').getAttribute('aria-pressed'),'true');
   await page.locator('#admission > details > summary').focus(); await page.keyboard.press('Enter');
   assert.equal(await page.locator('#admission > details[open]').count(),1);
   await page.locator('[data-section-next]').click();
   assert.equal(await page.locator('#private-shared').isVisible(),true);
   await page.locator('[data-section-previous]').click();
   assert.equal(await page.locator('#admission').isVisible(),true);
   assert.deepEqual(errors,[]);await page.close();
   const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
   const mobile=await context.newPage();await mobile.goto(`${base}/${path}`);
   const order=await mobile.locator('article > section').evaluateAll(nodes=>nodes.map(n=>n.id));
   assert.ok(order.indexOf('admission')<order.indexOf('private-shared'));
   assert.ok(order.indexOf('session-age')<order.indexOf('zones'));
   const answer=mobile.locator('#reuse > details');
   assert.equal(await answer.getAttribute('open'),null);
   await answer.locator('summary').focus();await mobile.keyboard.press('Enter');
   assert.equal(await mobile.locator('#reuse > details[open]').count(),1);
   assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await mobile.locator('body').innerText().then(t=>t.includes('/home/vimkim/temp/volmap')),false);
   await context.close();
  }
 } finally {await browser.close();}
});
