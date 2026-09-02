"use strict";

document.addEventListener ("DOMContentLoaded", function ()
{
  document.querySelectorAll ("[data-retrieval]").forEach (function (quiz)
  {
    const answer = quiz.querySelector ("textarea");
    const feedback = quiz.querySelector (".feedback");
    const concepts = JSON.parse (quiz.dataset.concepts);
    const coverageTemplate = quiz.dataset.coverageTemplate;
    const completeMessage = quiz.dataset.completeMessage;
    const revisitLabel = quiz.dataset.revisitLabel;
    const modelLabel = quiz.dataset.modelLabel;

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

      const coverage = coverageTemplate
        .replace ("{found}", String (found.length))
        .replace ("{total}", String (concepts.length));
      feedback.innerHTML = "<strong>" + coverage + "</strong>" +
        (missing.length === 0
          ? " <span>" + completeMessage + "</span>"
          : "<ul>" + missing.map (function (concept) { return "<li>" + revisitLabel + " " + concept.label + "</li>"; }).join ("") + "</ul>");
    });

    quiz.querySelector ("[data-reveal]").addEventListener ("click", function ()
    {
      const model = quiz.dataset.model;
      feedback.innerHTML = "<strong>" + modelLabel + "</strong> " + model;
    });
  });
});
