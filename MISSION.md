# Mission: Defend CUBRID's page-buffer module

## Why
Build a source-level mental model of `src/storage/page_buffer.c/.h` so I can present this maintainer-guide document set to my team, explain the design without hand-waving, and answer difficult follow-up questions with the right evidence boundary.

## Success looks like
- Draw and explain `VPID -> BCB -> frame -> PAGE_PTR`, including global fix accounting and the per-thread holder.
- Trace normal acquisition and release, a representative caller mutation, one flush generation, and safe frame reuse in the pinned source.
- Separate Module guarantees from caller and dependency obligations during design and code-review discussions.
- Navigate the Core, Advanced, playbook, reference, and Question-bank routes according to the team's question.
- Deliver a coherent presentation and defend every strong claim as an Interface contract, Verified mechanism, Implementation policy, Inference, Runtime observation, or Historical evidence.

## Constraints
- Use CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` as the source baseline.
- Keep lessons short, interactive, in English, and grounded in the existing canonical guide pages and pinned source.
- Serve HTML from the remote Linux host over a loopback-only HTTP server reached through SSH port forwarding; no graphical browser is available on the host.
- Preserve concurrent work in this directory; teaching files must not rewrite canonical guide pages or other agents' assets.
- Presentation date, duration, and the learner's current page-buffer depth have not yet been established.

## Out of scope
- Modifying the CUBRID engine while the goal is understanding and presentation mastery.
- Re-teaching general database internals unless they are necessary for a page-buffer mechanism.
- Treating PostgreSQL or InnoDB as normative designs or direct API equivalents for CUBRID.
