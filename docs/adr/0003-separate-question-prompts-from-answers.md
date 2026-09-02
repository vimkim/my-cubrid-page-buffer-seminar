# Separate canonical question prompts from answers

Build the CUBRID-only Question bank as a landing page plus Core, Advanced, maintenance-scenario, and applied-exercise routes, with prompt and companion answer pages joined by fresh immutable `PGBUF-QB-*` identifiers. This adds navigation pages but preserves retrieval practice, keeps central answers visible and linkable, avoids inheriting the older adversarial bank's ordering, and lets the migration audit retain legacy IDs without reusing them for changed meanings; cross-database questions and unedited Reader question intake remain linked provenance rather than canonical bank content.

## Consequences

Every Canonical question records its route, Retrieval mode, prerequisite, capability, prompt, and inspection leads; every companion answer records the matching ID, evidence-aware answer, reasoning, exact anchors, confidence boundary, and canonical guide links. The aggregate validator discovers the complete Question bank, pairs prompts with answers, rejects duplicate or legacy canonical IDs, validates required fields and controlled vocabulary, and requires a Question disposition for every audited legacy or reader-intake item. Four executed quiz families become English Applied exercise cards linked to their existing evidence artifacts; executable runners and receipts do not move into the guide.
