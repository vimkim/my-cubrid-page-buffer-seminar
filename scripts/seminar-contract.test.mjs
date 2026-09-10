import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { checkAudiencePage, validateAudience, lectureOrder } from './seminar-contract.mjs';

const filename = 'en/lessons/' + lectureOrder[1];
const page = await readFile(new URL('../' + filename, import.meta.url), 'utf8');

test('all paired audience pages satisfy the source contract', async () => {
  assert.deepEqual((await validateAudience(new URL('..', import.meta.url).pathname)).failures, []);
});
test('retired answer entry and coaching are rejected', () => {
  const failures = checkAudiencePage(page + '<textarea></textarea><p>Ask the teaching agent.</p>', filename);
  assert.ok(failures.some(x => x.includes('coaching')));
  assert.ok(failures.some(x => x.includes('answer-entry')));
});
test('a wrong next lecture fails even when the target exists', () => {
  assert.ok(checkAudiencePage(page.replace(/rel="next" href="[^"]+"/, `rel="next" href="${lectureOrder[0]}"`), filename)
    .some(x => x.includes('incorrect next')));
});
test('missing disclosures and visible nonfunctional presentation controls fail', () => {
  assert.ok(checkAudiencePage(page.replaceAll('answer-disclosure', 'removed'), filename)
    .some(x => x.includes('checkpoint explanation')));
  assert.ok(checkAudiencePage(page.replace(' hidden aria-label="Presentation controls"', ' aria-label="Presentation controls"'), filename)
    .some(x => x.includes('hidden until')));
});
test('author-only navigation is rejected, while maintainer directions remain valid', () => {
  assert.deepEqual(checkAudiencePage(page + '<p>Check the invariant before changing the code.</p>', filename), []);
  assert.ok(checkAudiencePage(page + '<a href="../../presenter-runbook.md">Runbook</a>', filename)
    .some(x => x.includes('author-only')));
});
