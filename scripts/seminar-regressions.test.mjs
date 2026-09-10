import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const checker = path.join(root, 'scripts/check-bilingual-teaching-site.mjs');

async function withLectureFixture(filename, change, run) {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'seminar-regression-'));
  try {
    for (const language of ['en', 'ko']) {
      await mkdir(path.join(fixture, language, 'lessons'), { recursive: true });
      const html = await readFile(path.join(root, language, 'lessons', filename), 'utf8');
      await writeFile(path.join(fixture, language, 'lessons', filename), change(html, language));
    }
    await writeFile(path.join(fixture, 'teaching-pages.json'), JSON.stringify({ pages: [{
      path: 'lessons/' + filename, en: 'en/lessons/' + filename, ko: 'ko/lessons/' + filename
    }] }));
    await run(fixture);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

test('audience CLI rejects an inline continuation that contradicts the curriculum', async () => {
  await withLectureFixture('0008-defend-a-safe-change.html', (html, language) =>
    html.replace('</main>', `<p><a href="0009-classify-latch-wait.html">${language === 'en' ? 'Continue to Lecture 9' : '다음 강의 9로 계속'}</a></p></main>`),
  async fixture => {
    await assert.rejects(exec(process.execPath, [checker, '--root', fixture, '--gate', 'audience']),
      error => /en\/lessons\/0008.*continuation route/.test(error.stderr)
        && /ko\/lessons\/0008.*continuation route/.test(error.stderr));
  });
});

test('audience CLI rejects optional labels on required mechanism lectures', async () => {
  await withLectureFixture('0012b-understand-private-lru-index.html', (html, language) =>
    html.replace('</main>', `<a href="0012a-understand-aout-ghost-history.html">${language === 'en' ? 'Optional Lecture 12A' : '선택 강의 12A'}</a></main>`),
  async fixture => {
    await assert.rejects(exec(process.execPath, [checker, '--root', fixture, '--gate', 'audience']),
      error => /required lecture labeled optional/.test(error.stderr));
  });
});

test('audience CLI rejects conditional participation headings for required lectures', async () => {
  await withLectureFixture('0007-replace-one-frame.html', (html, language) =>
    html.replace('</main>', `<h2>${language === 'en' ? 'Continue to the AOUT lecture only when you need ghost history' : 'Ghost history가 필요할 때만 AOUT 강의로 이동하세요'}</h2></main>`),
  async fixture => {
    await assert.rejects(exec(process.execPath, [checker, '--root', fixture, '--gate', 'audience']),
      error => /en\/lessons\/0007.*required lecture framed as conditional/.test(error.stderr)
        && /ko\/lessons\/0007.*required lecture framed as conditional/.test(error.stderr));
  });
});

test('audience CLI rejects one exposed answer even when other checkpoint disclosures remain', async () => {
  await withLectureFixture('0006-flush-one-generation.html', html =>
    html.replace(/<details class="answer-disclosure"><summary>[^<]+<\/summary>([\s\S]*?)<\/details>/,
      '$1'),
  async fixture => {
    await assert.rejects(exec(process.execPath, [checker, '--root', fixture, '--gate', 'audience']),
      error => /exposed checkpoint answer/.test(error.stderr));
  });
});

test('audience CLI requires a disclosure for every checkpoint, not just one per lecture', async () => {
  await withLectureFixture('0006-flush-one-generation.html', html =>
    html.replace('</main>', '<section data-audience-checkpoint><h2>Another scenario</h2><p>Question?</p><p>Exposed answer.</p></section></main>'),
  async fixture => {
    await assert.rejects(exec(process.execPath, [checker, '--root', fixture, '--gate', 'audience']),
      error => /checkpoint without a disclosure/.test(error.stderr));
  });
});

test('audience CLI rejects a checkpoint explanation that starts open', async () => {
  await withLectureFixture('0006-flush-one-generation.html', html =>
    html.replace('<details class="answer-disclosure">', '<details class="answer-disclosure" open>'),
  async fixture => {
    await assert.rejects(exec(process.execPath, [checker, '--root', fixture, '--gate', 'audience']),
      error => /checkpoint explanation starts open/.test(error.stderr));
  });
});

test('audience CLI rejects an exposed model spine outside a disclosure', async () => {
  await withLectureFixture('0012-prove-replacement-progress.html', html =>
    html.replace('</main>', '<p><strong>Model spine:</strong> An exposed model.</p></main>'),
  async fixture => {
    await assert.rejects(exec(process.execPath, [checker, '--root', fixture, '--gate', 'audience']),
      error => /exposed checkpoint model/.test(error.stderr));
  });
});
