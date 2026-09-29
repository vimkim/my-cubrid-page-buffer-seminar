# Lecture 6A: derive four daemon responsibilities

On 2026-09-30 the user accepted rewriting all of Lecture 6A, with no requirement
to fit the former 25-minute daemon allocation. The audience remains teammates
with basic programming knowledge. English and Korean are revised together.
This expanded lecture is not evidence that the older three-hour route still
fits its original timetable; the presenter must allow more time for this topic.

## Accepted explanation structure

Start with a missing page E and occupied frames. Separate selection preference
from reuse safety. Derive each responsibility through a concrete question,
stepwise explanation, consequences of absence, and a short verified source path:

1. Page-flush prepares cold dirty candidates ahead of frame demand.
2. Post-flush finishes delegated BCB work after submission.
3. Maintenance adapts retention targets and zones to sampled activity.
4. Flush-control refreshes credits for post-write soft pacing.

Finish with four prediction scenarios and native answer disclosures. Preserve
existing anchors, lifecycle/cadence detail, source routes and presentation controls.
Core explanations stay visible without JavaScript. The overview uses four
independent responsibility cards, not a four-stage page-processing pipeline.

## Terminology and boundaries

Define frame, foreground/background, daemon, BCB, quota, zone and credit at first
use. These are general implementation concepts rather than new document-domain
roles, so the existing CONTEXT.md glossary does not gain implementation entries.
This is a reversible editorial choice and does not require a new ADR.

“Without a daemon” is ambiguous: distinguish a design with inline/bypass paths
from a failed consumer or credit supplier in an otherwise unchanged protocol.
Do not equate flush with eviction or DWB submission with a completed home-page
write. Post-flush rechecks current state; it does not write another copy.
Maintenance has other quota callers and adjustment admission conditions. Its
VS-20 backup remains an uncertainty-reference concern, not a progress promise.

## Evidence

The source baseline is CUBRID f799e05d77d5300c6ea5753b4a6cc7caee6d8912.
The source inventory, uncertainty registry, dirty-page flush-actor reference and
lifecycle audit retain ownership of technical claims. Rechecked task functions,
non-neighbor candidate flush branch, inline/delegated BCB completion, post-flush
rechecks, private-LRU quota callers and token waits against that local checkout.
Examples are constructed explanations, not runtime measurements.

Human EN/KO review remains pending in teaching-pages.json; no receipt is created.
Verification results are recorded in daemon-first-principles-checks.md.
