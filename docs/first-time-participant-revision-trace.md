# First-session replacement branch evidence

Constructed trace, not a runtime capture, benchmark, simulator, or guarantee. All implementation evidence below is from `git show f799e05d77d5300c6ea5753b4a6cc7caee6d8912:src/storage/page_buffer.c`. The existing P/R/F42 example is a separate history and is unchanged. The [participant checkpoint](../en/reference/lru-worked-example.html#session-branch-checkpoint) resets all its state.

## Common checkpoint and the only changed input

A and B are execution contexts serving two already assigned sessions. Both carry private-local index 0, full LRU index 32. This is deliberately the domain-sharing case, not the earlier separate-domain illustration. The assignment algorithm prefers a zero-session list but falls back to an existing least-active list when all lists are occupied (14510–14602). A prior assignment can therefore produce session counts `[2,1,1,1]`; the three other sessions now remain idle. Current activity need not equal activity at assignment. No assignment/release or quota adjustment occurs during either schedule.

| Input | Identical checkpoint in both branches |
| --- | --- |
| Pool | Server mode; 32,768 frames, 32 shared lists, 4 private lists; quota enabled, AOUT disabled |
| Occupancy | INVALID 0; all 32,768 pages in private list 32; all other lists empty; no VOID frames |
| Quota | Prior accepted pass: private_pages_ratio 0.5; nonzero smoothed private activity only in list 32; all_private_quota = 32,768 × 0.5 = 16,384; list quota = min(16,384, **5,000**, 16,384) = **5,000** |
| Thresholds | Private LRU1/LRU2: floor(5,000 × 0.05) = 250 each; other private quotas/thresholds zero. Shared target floor((32,768 − 16,384)/32) = 512; ratios0.4/0.05 give204/25. The shared formula uses the aggregate before per-list caps. |
| Full chain, top to bottom | LRU1: H2, X1…X249; LRU2: Y1…Y250; LRU3: C1…C32267, H1 |
| Boundaries/counts | bottom_1=X249; bottom_2=Y250; bottom=H1; 250 / 250 / 32,268; victim_hint=H1; count_vict_cand=32,268 |
| Identities | H1/H2/S1/S2 are page identities. FH1/FH2 and FC1…FC32267 are fixed frame/BCB aliases. Initially FH1 represents H1, FH2 represents H2, FCj represents Cj. X/Y labels similarly denote the page and its unique resident BCB. |
| List age | tick_list=40,000; H1 saved tick=1,000, H2=39,999; other saved ticks arbitrary earlier nonwrapping values, never queried here. tick_lru3=40,000; Cj.tick_lru3=40,000−j; H1.tick_lru3=7,732. |
| Activity epoch | adjust_age=10; every BCB hit_age=10; lru_hits[32]=32,768 (one sample per frame earlier this epoch); other samples0. No new epoch; repeat samples and reusing these BCBs add no sample. |
| Eligibility | Every page clean, fcnt0, NO_LATCH; no flushing, reservation, avoidance/move-bottom/vacuum hint, holder debt or waiters. H1/H2 general-fix counters below63; neither becomes hot. No direct-victim waiter; BCB/list try-locks succeed. |
| Scheduling | No background/quota pass, dirtying, failure, other fix, or allocation intervenes. Both S1 and S2 are absent valid disk pages and successful OLD_PAGE READ misses. Every described fix is immediately final-unfixed before the next event. |

Quota/cap evidence: constants1052–1077 and adjustment14400–14505. Carrying more pages than quota is allowed; quota is a selection policy, not an admission cap. The snapshot is possible after earlier admission and cooling. It does not assert this highly concentrated state is typical.

**Only changed workload input: foreground reuse resumes during this scan window.** Retention: A completes READ-fix/final-unfix H1 and then H2 before B scans S1 then S2. Displacement: A stays paused throughout the same S1/S2 window. Pool, domains, scan order/length, thresholds, eligibility, and daemon schedule are identical. Stop before any later H1 request; a later reload is not part of the endpoint.

## Independently derived transition ledger

The ordinary LRU3 final-unfix branch boosts H1 (6830–6846); same private index and non-hot state exclude migration (6996–7038). The boost removes the node, inserts it at top, and adjusts combined zones before zone1 (10122–10199, 9985–10052). It preserves the saved admission tick. LRU1 H2 reuse keeps its position (6752–6783). Neither is exact-LRU movement on every hit.

| Branch/event completed | Counts LRU1/2/3 | tick_list | bottom_1 / bottom_2 / bottom | Responsible transition |
| --- | --- | --- | --- | --- |
| Common checkpoint | 250/250/32268 | 40000 | X249 / Y250 / H1 | 32768 resident, INVALID0 |
| Retention: A H1 final unfix | 250/250/32268 | 40001 | X248 / Y249 / C32267 | Remove H1 from3; insert top; Y250 falls2→3, X249 falls1→2; top H1,H2 |
| Retention: A H2 final unfix | 250/250/32268 | 40001 | X248 / Y249 / C32267 | LRU1 keep; no tick increment |
| Retention: B S1 final unfix | 250/250/32268 | 40002 | X247 / Y248 / C32266 | FC32267 retires C32267, becomes S1; Y249 falls2→3, X248 falls1→2 |
| Retention: B S2 final unfix | 250/250/32268 | 40003 | X246 / Y247 / C32265 | FC32266 becomes S2; Y248 falls2→3, X247 falls1→2; top S2,S1,H1,H2 |
| Reset; displacement: B S1 final unfix | 250/250/32268 | 40001 | X248 / Y249 / C32267 | FH1 retires H1, becomes S1; Y250 falls2→3, X249 falls1→2 |
| Displacement: B S2 final unfix | 250/250/32268 | 40002 | X247 / Y248 / C32266 | FC32267 becomes S2; Y249 falls2→3, X248 falls1→2; top S2,S1,H2 |

Each selection uses own private32: total32768>quota5000 and candidates>0 (9116–9138); protected total500 is not over quota, so the pre-scan quota adjustment does not run (9340–9370). The clean bottom resets the hint to bottom (9375–9390); each candidate passes BCB try-lock and current-state recheck and is detached (9391–9485). No queue-dependent other-list selection or max-depth ambiguity determines these endpoints: the first bottom candidate succeeds. Other LRU3 candidates exist but are not reached. H2 remains far from the boundary. No claim of a globally oldest candidate is made.

A removal yields250/250/32267 (32767 linked plus one detached BCB); completed S admission inserts into1, then demotes one2→3 and one1→2, restoring32768. INVALID stays0 throughout. While a new page is successfully fixed its BCB is VOID; it rejoins the LRU at final unfix (6946–6974,10207–10232). Old hash removal precedes new mapping publication; no new frame allocation or disk-page deletion occurs (8638–8693,8392–8634). Transient missing mappings must not be counted as a lost physical frame.

Each2→3 fall records the old tick_lru3 then increments it (10054–10116): retention ends40003, displacement40002. Original surviving C nodes keep their ticks. H1's saved list tick1000 remains after its boost. H2 stays39999. Reused frames admitted as S receive the pre-insertion list tick: retention S1=40001/S2=40002; displacement S1=40000/S2=40001. No branch executes the LRU2 age predicate; it would compare difference with current count_lru2/2, not threshold/2 or wall time. hit_age sampling uses the retained BCB field, not a count of page requests (16594–16610).

**Endpoint:** retention has resident H1 and H2; displacement has H2 resident and H1 absent (FH1 now S1). This is a bounded causal example of reuse timing with shared-domain pressure, not universal scan resistance, measured performance, or proof that private/shared policy guarantees isolation.

## Independent protected-recheck reset

The live race is a separate local reset, not an unannounced third input to the two residency branches. S3 is an initially clean, unfixed LRU3 page. The allocator holds the list mutex and observes fcnt0. Before it takes the BCB mutex, A successfully fixes S3 and retains READ/fcnt1; it need not relink the BCB to obtain this use. The allocator either fails conditional BCB acquisition or obtains it after A releases the mutex and rejects current fcnt1 (9399–9478,9265–9325). The old resident hash mapping remains; S3 is not overwritten. No allocator completion bound follows.

Alternative reset: nobody fixes S3; all safety predicates still hold. Conditional lock and protected recheck succeed, detach returns the BCB still locked, victimization removes S3's hash mapping, and the successful miss binds/loads/publishes S4 before its final-unfix admission. Successful detach alone is not the old-hash removal. Dirty preservation remains necessary but no durability protocol is taught here.

## Review boundaries

Ticket03 independently flagged the hard quota cap before authoring; the provisional16384 per-list idea was discarded. This committed ledger uses5000. Ticket03 policy reconciliation and root arithmetic review are tracked in the ticket contribution receipt. Source-derived construction is distinct from runtime evidence. Existing uncertainty findings remain owned by the [registry](../unresolved-or-version-sensitive-findings.md); no experiment, daemon fairness claim, or repair is introduced.
