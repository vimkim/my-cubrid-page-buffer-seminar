"use strict";

document.addEventListener ("DOMContentLoaded", function ()
{
  document.querySelectorAll ("[data-retrieval]").forEach (function (quiz)
  {
    const answer = quiz.querySelector ("textarea");
    const feedback = quiz.querySelector (".feedback");
    const concepts = JSON.parse (quiz.dataset.concepts);

    quiz.querySelector ("[data-check]").addEventListener ("click", function ()
    {
      const text = answer.value.toLowerCase ();
      const found = concepts.filter (function (concept)
      {
        return concept.terms.some (function (term)
        {
          return text.includes (term.toLowerCase ());
        });
      });
      const missing = concepts.filter (function (concept)
      {
        return !found.includes (concept);
      });

      feedback.innerHTML = "<strong>" + found.length + "/" + concepts.length + " presentation moves detected.</strong>" +
        (missing.length === 0
          ? " <span>Good coverage. Now deliver it aloud without reading.</span>"
          : "<ul>" + missing.map (function (concept) { return "<li>Revisit: " + concept.label + "</li>"; }).join ("") + "</ul>");
    });

    quiz.querySelector ("[data-reveal]").addEventListener ("click", function ()
    {
      const model = quiz.dataset.model || "boundary -> six objects -> fix/release debt -> caller completes correctness -> flush one generation -> eligibility before replacement policy -> evidence label before every strong claim.";
      feedback.innerHTML = "<strong>Model spine:</strong> " + model;
    });
  });
});
