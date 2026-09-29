// Enhance the authored Clock states; without scripts every state remains readable.
for (const demo of document.querySelectorAll('[data-clock-demo]')) {
  const steps = [...demo.querySelectorAll('[data-clock-step]')];
  const controls = demo.querySelector('[data-clock-controls]');
  const next = demo.querySelector('[data-clock-next]');
  const reset = demo.querySelector('[data-clock-reset]');
  const status = demo.querySelector('[data-clock-status]');
  let index = 0;
  function render() {
    steps.forEach((step, i) => { step.hidden = i !== index; });
    next.disabled = index === steps.length - 1;
    status.textContent = steps[index].querySelector('h3').textContent;
  }
  next.addEventListener('click', () => {
    index = Math.min(index + 1, steps.length - 1);
    render();
  });
  reset.addEventListener('click', () => { index = 0; render(); });
  demo.classList.add('rf-enhanced');
  render();
  controls.hidden = false;
}
