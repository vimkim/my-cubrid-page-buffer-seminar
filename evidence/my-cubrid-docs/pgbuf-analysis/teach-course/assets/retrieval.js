"use strict";

document.addEventListener ("DOMContentLoaded", function ()
{
  document.querySelectorAll ("[data-retrieval]").forEach (function (quiz)
  {
    const answer = quiz.querySelector ("textarea");
    const feedback = quiz.querySelector (".feedback");
    const check = quiz.querySelector ("[data-check]");
    const reveal = quiz.querySelector ("[data-reveal]");
    const concepts = JSON.parse (quiz.dataset.concepts);

    check.addEventListener ("click", function ()
    {
      const text = answer.value.toLowerCase ();
      const found = concepts.filter (function (concept)
      {
        return concept.terms.some (function (term) { return text.includes (term.toLowerCase ()); });
      });
      const missing = concepts.filter (function (concept) { return !found.includes (concept); });
      feedback.innerHTML = "<strong>" + found.length + "/" + concepts.length + " contract elements detected.</strong>" +
        (missing.length === 0
          ? " <span>Good coverage. Now say it aloud in 30 seconds without reading.</span>"
          : "<ul>" + missing.map (function (concept) { return "<li>Check: " + concept.label + "</li>"; }).join ("") + "</ul>");
    });

    reveal.addEventListener ("click", function ()
    {
      feedback.innerHTML = "<strong>Model spine:</strong> logical identity → resident BCB/frame → compatible latch → per-thread holder plus global fix count → valid access until matching unfix. Dirty/WAL belongs to modification and flush, not to the bare act of fixing.";
    });
  });
});
