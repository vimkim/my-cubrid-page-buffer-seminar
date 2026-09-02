# Question-bank Migration Audit

**Level:** Question bank — Migration reference
**Prerequisites:** None; this page is for documentation maintainers
**Capability gained:** Trace every source prompt to a Canonical question or a deliberate, evidence-aware exclusion.
**Source baseline:** `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, with older material explicitly revision-bound
**Evidence used:** Verified mechanism, Runtime observation, and Historical evidence from the [source inventory](../source-inventory.md) and linked source banks

**Migration status:** In progress

This audit owns migration provenance; reader-facing prompts and answers do not repeat it. A Retained, Merged, or Rewritten item maps to a Canonical question. Superseded identifies a stronger descendant. Excluded requires a scope, duplication, or evidence rationale.

## Source populations

| Source set | Input | Expected items |
|---|---|---:|
| `TEACH` | [Progressive teaching bank](../../../pgbuf-analysis/teach-course/reference/pgbuf-question-bank.md) | 38 |
| `ADV` | [Adversarial questions](../../../pgbuf-analysis/f799e05_claude/analysis/research/qa-questions.md) and [paired answers](../../../pgbuf-analysis/f799e05_claude/analysis/research/qa-answers.md) | 55 |
| `HIST` | [Historical workbook](../../../pgbuf-analysis/e6ed61e_claude/07-qa-workbook.md) | 24 |
| `PLAN` | [Experiment and quiz design packet](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/research/packets/experiments-and-quizzes.md) | 27 |
| `EXEC` | [Executed quiz tree](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/) | 17 |
| `GRILL` | [Live-grill seeds](../../page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/research/packets/experiments-and-quizzes.md) | 12 |
| `READER` | [Unedited Reader question intake](../questions-b4179ee/questions.md) | 16 |

## Disposition ledger

| Source set | Legacy item | Short topic | Disposition | Canonical destination | Rationale/evidence action |
|---|---|---|---|---|---|

## Authoring navigation

- Review the [Question-bank entry](./README.md).
- Apply the evidence vocabulary from [CONTEXT.md](../CONTEXT.md#evidence-language).
- Resolve mutable status only through the [evidence and uncertainty registry](../unresolved-or-version-sensitive-findings.md).
