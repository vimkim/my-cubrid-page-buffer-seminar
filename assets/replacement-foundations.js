// Enhance authored states; without scripts the entire explanation stays readable.
for (const kind of ['clock', 'request']) {
  for (const demo of document.querySelectorAll(`[data-${kind}-demo]`)) {
    const steps = [...demo.querySelectorAll(`[data-${kind}-step]`)];
    const controls = demo.querySelector(`[data-${kind}-controls]`);
    const previous = controls.querySelector(`[data-${kind}-previous]`);
    const next = controls.querySelector(`[data-${kind}-next]`);
    const reset = controls.querySelector(`[data-${kind}-reset]`);
    const status = controls.querySelector('output');
    let index = 0;
    function render() {
      steps.forEach((step, i) => { step.hidden = i !== index; });
      previous.disabled = index === 0;
      next.disabled = index === steps.length - 1;
      status.textContent = steps[index].querySelector('h3').textContent;
    }
    previous.addEventListener('click', () => { index = Math.max(0, index - 1); render(); });
    next.addEventListener('click', () => { index = Math.min(steps.length - 1, index + 1); render(); });
    reset.addEventListener('click', () => { index = 0; render(); });
    demo.classList.add('rf-enhanced');
    render();
    controls.hidden = false;
  }
}
