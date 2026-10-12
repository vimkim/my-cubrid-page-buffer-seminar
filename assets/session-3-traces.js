// Select authored snapshots. This does not execute or simulate an engine.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-state-trace]').forEach(trace => {
    const ko = document.documentElement.lang === 'ko';
    const steps = [...trace.querySelectorAll('.trace-steps > li')];
    const controls = trace.querySelector('.trace-controls');
    const previous = controls.querySelector('[data-trace-previous]');
    const next = controls.querySelector('[data-trace-next]');
    const all = controls.querySelector('[data-trace-all]');
    const status = controls.querySelector('output');
    let index = 0;
    let showAll = false;
    function render() {
      steps.forEach((step, i) => { step.hidden = !showAll && i !== index; });
      previous.disabled = showAll || index === 0;
      next.disabled = showAll || index === steps.length - 1;
      all.setAttribute('aria-pressed', String(showAll));
      all.textContent = showAll ? (ko ? '한 단계씩 보기' : 'One step at a time') : (ko ? '전체 단계 보기' : 'Show all steps');
      status.textContent = showAll
        ? (ko ? `전체 ${steps.length}단계` : `All ${steps.length} steps`)
        : `${index + 1} / ${steps.length} · ${steps[index].querySelector('h4').textContent} · ${steps[index].querySelector('.trace-change').textContent}`;
    }
    previous.addEventListener('click', () => { index = Math.max(0, index - 1); render(); });
    next.addEventListener('click', () => { index = Math.min(steps.length - 1, index + 1); render(); });
    controls.querySelector('[data-trace-reset]').addEventListener('click', () => {
      index = 0; showAll = false;
      trace.querySelectorAll('details[open]').forEach(answer => { answer.open = false; });
      render();
    });
    all.addEventListener('click', () => { showAll = !showAll; render(); });
    controls.hidden = false;
    render();
  });
});
