const { chromium, firefox } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const reports=[];
for (const [engine, launcher] of [['chromium',chromium],['firefox',firefox]]) {
for (const lang of ['en','ko']) {
const url = `${process.env.SEMINAR_URL || 'http://127.0.0.1:3936'}/${lang}/reference/replacement-lab.html`;
const browser = await launcher.launch({headless:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1050}});
page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(url);
const native=JSON.parse(await readFile(new URL('../experiments/replacement/summary.json',import.meta.url),'utf8'));
const rows=await page.locator('#native tbody tr').allTextContents();
assert.equal(rows.length,native.length);
for(let i=0;i<native.length;i++){
 const cells=await page.locator('#native tbody tr').nth(i).locator('td').allTextContents();
 assert.deepEqual(cells,[String(native[i].setup.pages),...native[i].passes.map(p=>`${p.hits} / ${p.misses}`)]);
}


// Independent oracle: enumerate every possible eviction at each miss.
// It does not use recency order or OPT's next-use choice.
function minimumMisses(seq,capacity){
 const memo=new Map();
 function visit(i,resident){
  if(i===seq.length)return 0;
  const key=`${i}|${[...resident].sort().join(',')}`;
  if(memo.has(key))return memo.get(key);
  const p=seq[i];let result;
  if(resident.has(p))result=visit(i+1,resident);
  else if(resident.size<capacity)result=1+visit(i+1,new Set([...resident,p]));
  else result=1+Math.min(...[...resident].map(v=>visit(i+1,new Set([...resident].filter(x=>x!==v).concat(p)))));
  memo.set(key,result);return result;
 }
 return visit(0,new Set());
}
const expected={cycle:{LRU:[12,9],MRU:[6,3],OPT:[6,3]},locality:{LRU:[4,1],MRU:[12,9],OPT:[4,1]},hot_scan:{LRU:[6,3],MRU:[8,5],OPT:[6,3]},fits:{LRU:[3,0],MRU:[3,0],OPT:[3,0]}};
const model=await page.evaluate(()=>Object.fromEntries(Object.entries(PBLab.scenarios).map(([name,s])=>[name,{seq:s.seq,capacities:Object.fromEntries([2,3,4].map(c=>[c,Object.fromEntries(['LRU','MRU','OPT'].map(p=>[p,PBLab.simulate(s.seq,c,p)]))]))}])));
for(const [name,entry]of Object.entries(model)){
 for(const [capacity,timelines]of Object.entries(entry.capacities)){
  const minimum=minimumMisses(entry.seq,Number(capacity));
  assert.equal(timelines.OPT.at(-1).misses,minimum,`${name}/${capacity}: independent minimum`);
  for(const [policy,timeline]of Object.entries(timelines)){
   for(let i=1;i<timeline.length;i++){
    const prev=timeline[i-1],s=timeline[i];
    assert.equal(s.hit,prev.buffer.includes(entry.seq[i-1]));
    assert.equal(s.buffer.length,Math.min(Number(capacity),new Set(entry.seq.slice(0,i)).size));
    assert.equal(new Set(s.buffer).size,s.buffer.length);
    assert.ok(s.buffer.includes(entry.seq[i-1]));
    assert.equal(s.misses-prev.misses,s.hit?0:1);
    if(s.victim){assert.ok(prev.buffer.includes(s.victim));assert.ok(!s.buffer.includes(s.victim));}
   }
   assert.ok(timeline.at(-1).misses>=minimum);
   if(Number(capacity)===3)assert.deepEqual([timeline.at(-1).misses,timeline.at(-1).replacements],expected[name][policy]);
  }
 }
}
await page.locator('#next').click();
assert.equal(await page.locator('#progress').textContent(),'1 / 12');
await page.locator('#last').click();
assert.deepEqual(await page.locator('.miss-count').allTextContents(),['12','6','6']);
await page.locator('#prev').click();
assert.equal(await page.locator('#progress').textContent(),'11 / 12');
await page.locator('#step').fill('4');await page.locator('#step').dispatchEvent('input');
assert.equal(await page.locator('#progress').textContent(),'4 / 12');
await page.locator('#scenario').selectOption('locality');await page.locator('#last').click();
assert.deepEqual(await page.locator('.miss-count').allTextContents(),['4','12','4']);
await page.locator('#capacity').selectOption('4');await page.locator('#last').click();
assert.deepEqual(await page.locator('.miss-count').allTextContents(),['4','4','4']);
for(let i=0;i<3;i++)await page.locator('#zone-next').click();
assert.equal(await page.locator('#zone-boundary').textContent(),'bottom_1 = A / bottom_2 = C / bottom = F');
assert.equal(await page.locator('#zone-next').isDisabled(),true);
const checks=[];
for(const colorScheme of ['light','dark']){
 await page.emulateMedia({colorScheme,reducedMotion:'reduce'});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1050});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}/${colorScheme}`);
  const broken=await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.querySelector(a.getAttribute('href'))).map(a=>a.href));
  assert.deepEqual(broken,[]);
  checks.push(`${width}/${colorScheme}`);
 }
}
await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:1440,height:1050});
await page.locator('#scenario').selectOption('cycle');await page.locator('#capacity').selectOption('3');await page.locator('#step').fill('5');await page.locator('#step').dispatchEvent('input');
await page.evaluate(()=>scrollTo(0,0));
await page.screenshot({path:'/tmp/page-buffer-replacement-lab-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/page-buffer-replacement-lab-mobile.png',fullPage:true});
const noJs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
await noJs.goto(url);assert.ok(await noJs.locator('noscript').isVisible());assert.equal(await noJs.locator('#results tbody tr').count(),4);
assert.equal(await noJs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.deepEqual(errors,[]);
const report={engine,language:lang,artifact:url,oracleCases:12,policyTraces:36,ui:'pass',viewports:checks,noJavaScript:'static results visible',consoleErrors:errors,scope:'Educational replacement model and rendered explanation; no CUBRID engine runtime experiment.'};
reports.push(report);
console.log(JSON.stringify(report,null,2));
await browser.close();

}}
await writeFile(new URL('../experiments/replacement/browser-checks.json',import.meta.url),JSON.stringify(reports,null,2)+'\n');
