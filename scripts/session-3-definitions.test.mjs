import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTeachingDefinitions } from './session-3-definitions.mjs';
const labels = ['S3', 'S4'];
const setup = '<p data-teaching-def="S3 S4">S3 is the requested absent scan page; S4 is an unused dirty resident replacement candidate.</p>';
const use = '<p>A request needs S3 and may first write S4 safely.</p>';
test('the extracted S3/S4 example without setup fails', () => {
  assert.equal(checkTeachingDefinitions(`<section id="why-background">${use}</section>`, labels).length, 2);
});
test('a later definition cannot explain an earlier use', () => {
  assert.match(checkTeachingDefinitions(`<section id="workload">${use}${setup}</section>`, labels).join(' '), /used before/);
});
test('setup hidden inside the prediction answer fails', () => {
  assert.match(checkTeachingDefinitions(`<section id="prediction">${use}<details><summary>Answer</summary>${setup}</details></section>`, labels).join(' '), /hidden or inside a disclosure/);
});
test('a visible definition before the example passes', () => {
  assert.deepEqual(checkTeachingDefinitions(`<section id="workload">${setup}${use}</section>`, labels), []);
});
test('a direct-link section must carry its own prerequisites', () => {
  assert.match(checkTeachingDefinitions(`<section id="workload">${setup}${use}</section><section id="why-background">${use}</section>`, labels).join(' '), /why-background/);
});
test('tables, captions, image labels and visible disclosure summaries count as uses', () => {
  for (const content of ['<table><tr><td>S3</td><td>S4</td></tr></table>', '<figcaption>S3 and S4</figcaption>', '<img src="a.svg" alt="Scan pages"/>', '<details><summary>S3 / S4 result</summary><p>Answer</p></details>']) {
    const images = { 'a.svg': 'S3 absent; S4 dirty' };
    assert.match(checkTeachingDefinitions(`<section>${content}${setup}</section>`, labels, images).join(' '), /used before/);
    assert.deepEqual(checkTeachingDefinitions(`<section>${setup}${content}</section>`, labels, images), []);
  }
});
test('attributes, comments and scripts cannot manufacture a definition', () => {
  assert.ok(checkTeachingDefinitions(`<section><!-- ${setup} --><script>${setup}</script><p title="S3 S4">${use}</p></section>`, labels).length);
  assert.ok(checkTeachingDefinitions(`<section><p data-teaching-def="S3 S4" hidden>S3 and S4 are pages.</p>${use}</section>`, labels).length);
  assert.ok(checkTeachingDefinitions(`<section><p data-teaching-def="S3 S4"><span hidden>S3 S4</span> are the requested and candidate pages.</p>${use}</section>`, labels).length);
});
test('nested inline text and escaped notation are inspected without source-identifier collisions', () => {
  assert.deepEqual(checkTeachingDefinitions('<section><p data-teaching-def="G G+1"><code>G</code> is the copied page image; <code>G+1</code> is the newer resident image.</p><p>G+1 stays dirty; use pgbuf_G_counter.</p></section>', ['G', 'G+1']), []);
});
test('ordinary article A in table prose is not treated as actor notation', () => {
  const definition = '<p data-teaching-def="A">A is the request thread that currently holds a page pin.</p>';
  assert.deepEqual(checkTeachingDefinitions(`<section>${definition}<table><tr><td>A copied image needs WAL.</td></tr></table></section>`, ['A']), []);
  assert.match(checkTeachingDefinitions(`<section><table><tr><td>A</td></tr></table>${definition}</section>`, ['A']).join(' '), /used before/);
});
test('generated status text cannot use a label before its active-snapshot definition', () => {
  const definition = '<p data-teaching-def="S3 S4">S3 is absent; S4 is the unused dirty resident candidate.</p>';
  const status = '<div class="trace-controls"><output>S3 must wait for S4 preparation.</output></div>';
  const bad = `<section>${status}<ol><li data-trace-step="1">${definition}</li></ol></section>`;
  assert.match(checkTeachingDefinitions(bad, labels).join(' '), /used before/);
  assert.deepEqual(checkTeachingDefinitions(`<section>${definition}${status}</section>`, labels), []);
  const actors = '<p data-teaching-def="A B">A is the ordinary writer; B owns the log critical section.</p>';
  assert.match(checkTeachingDefinitions(`<section><output>A may wait; B continues.</output>${actors}</section>`, ['A', 'B']).join(' '), /used before/);
});
test('live step inspection skips inactive snapshots but still rejects premature status labels', () => {
  const inactive = `<ol><li data-trace-step="1" hidden>${setup}${use}</li></ol>`;
  const options = { allowInactiveTraceDefinitions: true };
  assert.deepEqual(checkTeachingDefinitions(`<section>${inactive}</section>`, labels, {}, options), []);
  assert.match(checkTeachingDefinitions(`<section><output>S3 / S4</output>${inactive}</section>`, labels, {}, options).join(' '), /used before/);
});
test('natural Korean particles do not hide Latin teaching names or force incorrect spacing', () => {
  const definition = '<p data-teaching-def="S3 S4">S3는 요청한 부재 페이지이고 S4는 사용하지 않는 dirty 후보입니다.</p>';
  assert.deepEqual(checkTeachingDefinitions(`<section>${definition}<p>S3를 읽으려면 S4의 변경을 보존해야 합니다.</p></section>`, labels), []);
  assert.match(checkTeachingDefinitions(`<section><p>S3를 읽으려면 S4의 변경을 보존해야 합니다.</p>${definition}</section>`, labels).join(' '), /used before/);
});
test('a numeric frame ID is distinct from section and presentation counters', () => {
  const definition = '<p data-teaching-def="17">17 is the ID of a shared frame held in the local ring slot.</p>';
  assert.deepEqual(checkTeachingDefinitions(`<section><div class="eyebrow">10 · 1 / 17</div>${definition}<p>Frame 17 holds a page.</p></section><nav data-presentation-controls><output>1 / 17</output></nav>`, ['17']), []);
  assert.match(checkTeachingDefinitions(`<section><p>Frame 17 holds a page.</p>${definition}</section>`, ['17']).join(' '), /used before/);
});
