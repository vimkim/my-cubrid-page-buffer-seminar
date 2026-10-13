/* Open optional speaker detail when a saved link targets a heading inside it. */
(() => {
  function revealTarget() {
    let id;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch {
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    let parent = target.parentElement;
    while (parent) {
      if (parent.tagName === 'DETAILS') parent.open = true;
      parent = parent.parentElement;
    }
    target.scrollIntoView();
  }
  window.addEventListener('hashchange', revealTarget);
  revealTarget();
})();
