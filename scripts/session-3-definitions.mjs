// A bounded authoring check, not a test of comprehension. Definitions are real
// HTML text; the registry only selects the teaching notation to inspect.
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', plus: '+', minus: '−' };
export function decodeText(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (entity[0] === '#') {
      const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return point <= 0x10ffff ? String.fromCodePoint(point) : all;
    }
    return entities[entity] ?? all;
  });
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m => [m[1].toLowerCase(), decodeText(m[2] ?? m[3] ?? m[4] ?? '')]));
}
export function teachingTextEvents(html, images = {}) {
  const stack = [], events = [], definitions = [];
  let screen = 'page';
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/gi)) {
    const value = token[0];
    if (value.startsWith('<!--') || value.startsWith('<!')) continue;
    if (value.startsWith('</')) {
      const name = value.match(/^<\/([\w-]+)/)?.[1].toLowerCase();
      const index = stack.findLastIndex(n => n.name === name);
      if (index >= 0) stack.splice(index);
      const section = stack.findLast(n => n.name === 'section');
      screen = section ? section.attrs.id || 'unnamed-section' : 'page';
      continue;
    }
    if (value.startsWith('<')) {
      const name = value.match(/^<([\w-]+)/)?.[1].toLowerCase();
      const attrs = attributes(value.slice(name.length + 1, -1));
      if (name === 'section') screen = attrs.id || 'unnamed-section';
      const blocked = stack.some(n => n.blocked) || ['head', 'script', 'style', 'template'].includes(name)
        || 'hidden' in attrs || attrs['aria-hidden'] === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style || '');
      const disclosed = name === 'details' || stack.some(n => n.name === 'details');
      const inactiveTrace = stack.some(n => n.name === 'li' && 'data-trace-step' in n.attrs && 'hidden' in n.attrs);
      const node = { name, attrs, blocked, disclosed, inactiveTrace };
      if ('data-teaching-def' in attrs) definitions.push({ node, screen, text: '', position: token.index });
      if (name === 'img' && !blocked && !disclosed) {
        events.push({ screen, text: [attrs.alt, images[attrs.src]].filter(Boolean).join(' '), names: ['figcaption'], defs: [], position: token.index });
      }
      if (!voidTags.has(name) && !value.endsWith('/>')) stack.push(node);
      continue;
    }
    const text = decodeText(value);
    if (stack.some(n => n.blocked)) continue;
    // Summary is visible when a native disclosure is closed; its answer is not.
    if (stack.some(n => n.name === 'details') && !stack.some(n => n.name === 'summary')) continue;
    for (const def of definitions) if (stack.includes(def.node)) def.text += text;
    events.push({ screen, text, names: stack.map(n => n.name),
      screenCounter: stack.some(n => n.attrs.class?.split(/\s+/).includes('eyebrow') || 'data-presentation-controls' in n.attrs),
      defs: stack.filter(n => 'data-teaching-def' in n.attrs && !n.disclosed).flatMap(n => n.attrs['data-teaching-def'].split(/\s+/)), position: token.index });
  }
  return { events, definitions };
}
function contains(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Korean case particles attach naturally to Latin teaching names (S3를).
  // ASCII identifier boundaries still exclude names inside source identifiers.
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_]|\\+\\d)`, 'u').test(text);
}
export function checkTeachingDefinitions(html, labels, images = {}, { allowInactiveTraceDefinitions = false } = {}) {
  const { events, definitions } = teachingTextEvents(html, images);
  const failures = [], seen = new Map(), used = new Set();
  for (const def of definitions) {
    for (const label of def.node.attrs['data-teaching-def'].split(/\s+/).filter(Boolean)) {
      if (!labels.includes(label)) failures.push(`${def.screen}: unregistered definition ${label}`);
      if (allowInactiveTraceDefinitions && def.node.inactiveTrace) continue;
      if (def.node.blocked || def.node.disclosed) failures.push(`${def.screen}: definition ${label} is hidden or inside a disclosure`);
      if (!contains(def.text, label) || def.text.trim().length <= label.length + 8)
        failures.push(`${def.screen}: definition ${label} needs visible explanatory text containing the label`);
    }
  }
  for (const event of events) {
    if (!seen.has(event.screen)) seen.set(event.screen, new Set());
    const current = seen.get(event.screen);
    for (const label of event.defs) current.add(label);
    for (const label of labels) {
      // A frame ID can equal the number of screens. Navigation counters do
      // not introduce that frame; its explanatory uses remain checked.
      if (/^\d+$/.test(label) && event.screenCounter) continue;
      // One-letter names also occur as ordinary prose (notably the article A).
      // Inspect them in code, tables, trace lanes, captions and marked definitions.
      if (label.length === 1 && !event.names.some(n => ['code', 'td', 'th', 'dt', 'dd', 'figcaption', 'output'].includes(n)) && !event.defs.includes(label)) continue;
      // In a prose cell/caption, "A copied image" is an article. Raw A is
      // inspected only as a standalone/punctuated name; code and definitions
      // remain unambiguous. Editorial review owns unmarked prose actor names.
      if (label === 'A' && !event.names.includes('code') && !event.names.includes('output') && !event.defs.includes('A')
          && !/(?:^|[^A-Za-z0-9_])A(?=$|\s*[:/;,)=]|\s+(?:and|or)\b|\p{Script=Hangul})/u.test(event.text)) continue;
      if (!contains(event.text, label)) continue;
      used.add(label);
      if (!current.has(label)) failures.push(`${event.screen}: ${label} used before a visible local definition`);
    }
  }
  for (const label of labels) if (!used.has(label)
      && !(allowInactiveTraceDefinitions && definitions.some(def => def.node.inactiveTrace && def.node.attrs['data-teaching-def'].split(/\s+/).includes(label))))
    failures.push(`registered label ${label} has no inspected use`);
  return [...new Set(failures)];
}
