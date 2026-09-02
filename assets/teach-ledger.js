"use strict";

document.addEventListener ("DOMContentLoaded", function ()
{
  document.querySelectorAll ("[data-ledger]").forEach (function (simulator)
  {
    let globalCount = 0;
    let holderA = 0;
    let holderB = 0;
    let eventNumber = 0;

    const globalOutput = simulator.querySelector ("[data-global]");
    const holderAOutput = simulator.querySelector ("[data-holder-a]");
    const holderBOutput = simulator.querySelector ("[data-holder-b]");
    const feedback = simulator.querySelector ("[data-ledger-feedback]");
    const log = simulator.querySelector ("[data-ledger-log]");
    const messages = simulator.dataset;

    function holderLabel (count)
    {
      return count === 0 ? messages.removedLabel : String (count);
    }

    function render ()
    {
      globalOutput.textContent = String (globalCount);
      holderAOutput.textContent = holderLabel (holderA);
      holderBOutput.textContent = holderLabel (holderB);
    }

    function appendEvent (label)
    {
      eventNumber++;
      const row = document.createElement ("tr");
      [String (eventNumber), label, String (globalCount), holderLabel (holderA), holderLabel (holderB)].forEach (function (value)
      {
        const cell = document.createElement ("td");
        cell.textContent = value;
        row.appendChild (cell);
      });
      log.appendChild (row);
    }

    function reset ()
    {
      globalCount = 0;
      holderA = 0;
      holderB = 0;
      eventNumber = 0;
      log.textContent = "";
      feedback.textContent = messages.resetMessage;
      render ();
    }

    simulator.querySelectorAll ("[data-ledger-action]").forEach (function (button)
    {
      button.addEventListener ("click", function ()
      {
        const action = button.dataset.ledgerAction;
        let label = "";

        if (action === "reset")
          {
            reset ();
            return;
          }
        if (action === "a-fix")
          {
            holderA++;
            globalCount++;
            label = messages.aFixLabel;
          }
        else if (action === "b-fix")
          {
            holderB++;
            globalCount++;
            label = messages.bFixLabel;
          }
        else if (action === "a-unfix" && holderA > 0)
          {
            holderA--;
            globalCount--;
            label = messages.aUnfixLabel;
          }
        else if (action === "b-unfix" && holderB > 0)
          {
            holderB--;
            globalCount--;
            label = messages.bUnfixLabel;
          }
        else
          {
            feedback.textContent = messages.rejectedMessage;
            return;
          }

        appendEvent (label);
        render ();
        feedback.textContent = globalCount === holderA + holderB
          ? messages.invariantMessage
          : messages.mismatchMessage;
      });
    });

    reset ();
  });
});
