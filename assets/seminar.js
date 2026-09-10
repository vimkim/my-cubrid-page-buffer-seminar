// Presentation is a view of the document. No participant records are stored.
document.addEventListener('DOMContentLoaded', () => {
  const bar = document.querySelector('[data-presentation-controls]');
  if (!bar) return;
  const toggle = bar.querySelector('[data-presentation-toggle]');
  const previous = bar.querySelector('[data-section-previous]');
  const next = bar.querySelector('[data-section-next]');
  const status = bar.querySelector('output');
  const scope = document.querySelector('.lesson-main') || document.querySelector('.course-shell');
  // Curriculum and lookup pages retain their continuous overview layout.
  if (!document.querySelector('[data-lecture-nav]')) return;
  const sections = [...scope.querySelectorAll('section.section')].filter(e => !e.parentElement.closest('section.section'));
  if (!sections.length) return;
  sections.forEach((e, i) => { if (!e.id) e.id = `seminar-section-${i + 1}`; });
  let active = new URLSearchParams(location.search).get('present') === '1';
  let index = 0;
  function locateHash() {
    let target;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { return; }
    const found = sections.findIndex(e => e === target || e.contains(target));
    if (found >= 0) index = found;
    for (let e = target; e; e = e.parentElement) if (e.tagName === 'DETAILS') e.open = true;
  }
  function render() {
    document.body.classList.toggle('presentation-mode', active);
    sections.forEach((e, i) => { e.hidden = active && i !== index; });
    toggle.setAttribute('aria-pressed', String(active));
    toggle.textContent = active ? bar.dataset.readLabel : bar.dataset.presentLabel;
    previous.hidden = next.hidden = status.hidden = !active;
    previous.disabled = index === 0;
    next.disabled = index === sections.length - 1;
    status.textContent = `${index + 1} / ${sections.length}`;
    const url = new URL(location.href);
    if (active) url.searchParams.set('present', '1'); else url.searchParams.delete('present');
    history.replaceState(null, '', url);
    for (const link of document.querySelectorAll('[data-lecture-nav] a')) {
      const dest = new URL(link.href);
      if (active) dest.searchParams.set('present', '1'); else dest.searchParams.delete('present');
      link.href = dest.href;
    }
  }
  function move(delta) {
    index = Math.max(0, Math.min(sections.length - 1, index + delta));
    history.replaceState(null, '', '#' + sections[index].id);
    render();
    sections[index].tabIndex = -1;
    sections[index].focus({preventScroll: true});
    window.scrollTo(0, 0);
  }
  toggle.addEventListener('click', () => {
    if (!active) {
      const visible = sections.findIndex(e => e.getBoundingClientRect().bottom > 100);
      if (visible >= 0) index = visible;
    }
    active = !active;
    history.replaceState(null, '', '#' + sections[index].id);
    render();
    sections[index].scrollIntoView();
  });
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  window.addEventListener('hashchange', () => { locateHash(); render(); });
  document.addEventListener('keydown', e => {
    if (!active || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); active = false; render(); toggle.focus(); return; }
    if (e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); move(e.key === 'PageDown' ? 1 : -1); }
  });
  locateHash();
  bar.hidden = false;
  render();
});
