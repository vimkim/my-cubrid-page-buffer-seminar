# Ticket 05 integrated delivery and acceptance

Status: technical integration under verification; final human acceptance remains open. No actual Korean-naturalness or semantic-review receipts were supplied. Automated and agent reviews cannot supply those receipts.

Base: `e716618` (combined implementation `b87c7d5`). Work item 216 remains main-owned. This ticket owns final routes, presenter itinerary, coverage, acceptance evidence, one served-page integration regression, and a narrow pinned InnoDB source-link correction. No engine changes, pushes, simulator dependency, native experiment, stored participant response, or automated mastery claim was introduced.

## Acceptance mapping

| Requirement | Delivered artifact or open gate |
| --- | --- |
| Complete bilingual entry/resume routes | Both Topic libraries expose the worked example; both syllabi add `replacement-route` with admission, cooling, selection/progress, policy proposal, and final-defense links. Existing lecture URLs and 27-lecture dependency order remain. |
| Presenter guidance | The author-only runbook adds an integrated itinerary with prediction pauses, source tasks, branch starts, return rules and human discussion. |
| Complete trace and source audit | See state/evidence audit below and prerequisite handoffs. Authored histories remain independent where explicitly reset. |
| Canonical explanation ownership | Existing evidence links remain; the only canonical correction narrows the actual InnoDB insertion/caller route and short-list exception. |
| Pairing and parity | 51 pairs remain declared. Four edited pairs (landing, syllabus, worked example, Lecture 18A) retain pending reviews. Agent comparison is technical editorial inspection, not human naturalness acceptance. |
| Aggregate and browser validation | Final executed results will be recorded below. Failed or unavailable gates do not count as passes. |
| Acceptance summary and participant rubric | This record separates technical delivery from human acceptance; the rubric below describes human evidence without grading or storing responses. |
| Scope boundaries | No simulator, engine policy change, runtime result, answer store or mastery score. |

## State and evidence audit

The abstract F1 policies each begin empty with frames F0/F1/F2 and sequence P R P S P R T U P R. FIFO and Clock finish R/U/P; LRU U/P/R; OPT P/R/U. Hits/misses are 3/7 for FIFO/LRU/Clock and 5/5 for OPT. Clock finishes with bits 100 and next hand F1. The independent unseen sequence P R S R T P R gives FIFO/Clock 1/6, LRU 2/5, OPT 3/4. DB-A/B/C reset to P/R/S and add their own pin/dirty assumptions; none inherits a policy terminal state. The CUBRID model carries the workload shape into a separate 32,768-frame snapshot.

The ordinary CUBRID path starts with 30,768 INVALID plus 2,000 resident frames. Admission ends with 30,766 INVALID plus 2,002 resident, private counts 4/48/50 and tick 1002. At S49 combined-zone demotion moves Z48 before zone1 demotion moves P. P's final-unfix age 51 exceeds 25; saved tick 1000 remains. B's domain mismatch moves F42/P sequentially through protected VOID into shared 1 LRU2. It does not duplicate P or add another epoch-10 sample.

After all 30,766 scan admissions, private 30,867 + shared 0's 1,900 + shared 1's P = 32,768; INVALID is zero. Quota adjustment changes thresholds to 250/250 without promoting existing nodes, leaving private counts 50/50/30,767. List tick is 31,769, quota epoch 11, P/R hit_age 10. The first selected helper is private list 32, with C50/Q at the bottom; the checkpoint stops before allocation. Restricted fallback is conditional, not another executed event.

Reuse S resets there: linked/hash counts progress 32,767/32,768 after detach, 32,767/32,767 after Q removal, then 32,767/32,768 after T publication. C50/T is READ, fcnt 1, VOID; stop before final unfix. F42/P remains shared LRU2. R rejection schedules never detach Q. F adds a logged vacuum-worker schedule: clean completion leaves Q linked and clean; re-dirty preserves G+1 DIRTY and oldest LSA (100,30). D restarts F's dirty pre-copy state, collects before A waits, then post-flush reserves Q. Consumption detaches under protection; B's intervening refix revokes the offer and A retries while Q stays linked and B retains its READ fix. No bound on fairness/completion is inferred.

Policy Reset A starts at checkpoint 3: baseline tick 1002 versus hypothetical 1003. Reset B starts at S49: both reach 1052 after A's unfix; B's hypothetical hit adds one extra private tick before both migrate P to shared 1 at shared tick 1/saved tick 0. The fresh ten P,R-pair counterexample yields 20 hits/0 misses in both, ticks 1002 versus 1022. These policy histories never overwrite the ordinary selection baseline. The proposal remains hypothetical and requires its stated lock/identity/zone/progress proof obligations.

Pinned authority is CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`; detailed state/source routes remain owned by [ticket 01](ticket01-handoff.md), [F01](F01-handoff.md), [F02](F02-handoff.md), [ticket 02](ticket02-handoff.md), [ticket 03](ticket03-handoff.md), and [ticket 04](ticket04-handoff.md). Dormant AOUT, VS-19/20/21, G/G+1 notation, DWB boundary and constructed-versus-runtime limitations remain visible. Comparator correction was checked against MySQL `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8`: `buf0lru.cc:855–927` implements insertion, `buf0buf.cc:4960–4975` calls it with old=true; short lists use the head. The old 642–733 route described boundary setup.

## Participant rubric

Human reviewers can accept a defended rejection, narrowed proposal, or conditional adoption. Ask participants to produce:

| Evidence | What the reviewer checks |
| --- | --- |
| Independent hand trace | Correct page/frame distinction, victims, policy metadata and hit/miss totals, including an unseen sequence. |
| Source-backed state prediction | Explicit initial state and event; controlling predicate, owner/guard, conserved counts, and correct after state. |
| Concurrent scenario explanation | Preference versus safe reuse, generation versus current dirty state, reservation versus ownership, explicit reset and a permitted next event. |
| Policy defense | Precisely bounded change, baseline/alternative comparison, preserved invariants, counterexample, synchronization costs and workload limits. |
| Verification plan | Concrete race/failure checks and controlled measurements, with supported and unsupported conclusions stated separately. |

Use the [participant policy-defense model](../../en/reference/lru-worked-example.html#policy-defense) and [Korean counterpart](../../ko/reference/lru-worked-example.html#policy-defense). Individual Completion records stay outside the published site. Page visits and automated checks establish neither participant mastery nor language acceptance.

## Verification and remaining gates

Pending final run and independent Standards/Spec reports. Human Korean-naturalness and EN/KO semantic review against current fingerprints remains required. The pre-existing broad-test and Copyparty Markdown DOM failures will be rechecked explicitly, without unauthorized server repairs.
