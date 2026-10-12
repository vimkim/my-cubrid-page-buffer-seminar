import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chapterScreens, checkContentsScreens, validateSession3 } from './session-3-contract.mjs';
const chapter = '<section class="section" id="workload"><h2>A missing page needs a frame</h2></section><section class="section" id="new-setup"><h2>Explain the actors &amp; their starting state</h2></section>';
const screens = chapterScreens(chapter, '01-opening.html');
const map = '<details class="screen-map"><summary>Screens</summary><a href="01-opening.html#workload">A missing page needs a frame</a><a href="01-opening.html#new-setup">Explain the actors &amp; their starting state</a></details>';
test('an added setup screen must be reachable from the contents map', () => {
  assert.equal(screens.length, 2);
  assert.deepEqual(checkContentsScreens(map, screens), []);
  assert.ok(checkContentsScreens(map.replace(/<a href="01-opening.html#new-setup">.*?<\/a>/, ''), screens).length);
});
test('stale headings and reordered screens fail even when their anchors still exist', () => {
  assert.ok(checkContentsScreens(map.replace('A missing page needs a frame', 'What remains blocked?'), screens).length);
  assert.ok(checkContentsScreens(map, screens.toReversed()).length);
  assert.deepEqual(checkContentsScreens(map.replaceAll('href="01-', 'href="ko/seminar-3/01-'), screens, 'ko/seminar-3/'), []);
});
test('a null registry cannot silently disable the mandatory product check', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session3-registry-'));
  try {
    for (const file of ['teaching-pages.json', 'session-3-route.json', 'toc.html', 'en', 'ko', 'assets'])
      await fs.symlink(path.join(process.cwd(), file), path.join(root, file));
    await fs.mkdir(path.join(root, 'docs'));
    await fs.writeFile(path.join(root, 'docs/session-3-teaching-labels.json'), 'null');
    assert.ok((await validateSession3(root)).failures.includes('teaching-label registry requires a pages object'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
