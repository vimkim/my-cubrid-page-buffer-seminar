# Seminar critique from a first-time participant

**Historical author record.** Preserved from commit `c421d40` on the former `docs/seminar-critique` branch. These proposals describe the earlier baseline below, not a current defect list or observed participant feedback. The [accepted revision design](docs/first-time-participant-revision-design.md) records the selected scope; the [integration checks](docs/first-time-participant-revision-checks.md) record subsequent implementation and remaining acceptance gates. The original critique follows unchanged.

Reviewed against repository commit `c793ee6` on 2026-09-30.

I assume basic programming and arrays/linked lists, but no database, buffer-pool, WAL, or CUBRID knowledge. This is a simulated participant reading of the material, not feedback from an observed seminar. I examined the first-principles route, its foundations, structures, replacement, daemon and comparison lectures, the database bridge, and the presenter script. Korean is the live-language focus; English supplies supporting wording. I did not conduct a complete bilingual parity audit, run engine experiments, or observe delivery/projector readability.

The central problem is **uneven scaffolding**. Some sections patiently derive one idea; adjacent sections expect me to understand several mechanisms at once. There is substantial information here, but its presence somewhere in the collection does not ensure that I encounter it before needing it. The presentation sometimes feels like an explanation expanded in response to expert review comments rather than one continuously rehearsed introduction.

The existing page/frame distinction, FIFO/LRU stepping, Clock walkthrough, invalid-versus-unfixed explanation, protected-recheck race, and separation of daemon responsibilities are useful. Preserve them. The criticisms below target the remaining gaps, not an imagined earlier version without these explanations.

## Priority and scope

| Priority | Finding | What becomes difficult for a newcomer |
| --- | --- | --- |
| High | 1. Prerequisite route gaps | Following the advertised route without silently needing another lecture |
| High | 2. No concrete database operation at entry | Connecting abstract page requests to work a database actually does |
| High | 3. Policy story lacks a continuous outcome trace | Predicting whether the motivating hot pages survive |
| High | 4. Fix, latch and metadata protection arrive unevenly | Explaining concurrency rather than memorizing prohibitions |
| High | 5. Zone rules arrive before their complete setup | Deriving a transition from a specified starting state |
| High | 6. Dirty/flush story needs a crash-and-concurrency timeline | Understanding why logging and copied generations are necessary |
| Medium | 7. Socratic form sometimes gives away the answer | Distinguishing independent reasoning from recognition |
| Medium | 8. Question-shaped headings hide unequal section sizes | Sustaining attention and knowing when a concept is complete |
| Medium | 9. Expert-review residue interrupts participant voice | Knowing which information belongs to the current explanation |
| Medium | 10. Korean register changes abruptly | Understanding prose without mentally translating its grammar |
| Medium | 11. Daemon fallback cases need a unified execution picture | Distinguishing absent, idle, blocked and failed workers |
| Medium | 12. Cross-engine comparison needs stronger transfer exercises | Applying differences to a new workload |
| Medium | 13. Experiment result can invite the wrong inference | Separating capacity constraints from policy-specific misses |
| Medium | 14. Closing recall needs diagnostic transfer | Choosing what to inspect when a real request is slow |

These priorities concern explanatory dependency, not a demand to fit the curriculum into a fixed duration. The current route explicitly allows expansion across sessions.

## 1. The short route bypasses explanations its later steps need

**Where:** [First-principles route](ko/reference/first-principles-route.html), [database bridge](ko/lessons/0000a-database-bridge.html), [flush generations](ko/lessons/0006-flush-one-generation.html), and [daemon introduction](ko/lessons/0006a-understand-page-buffer-daemons.html).

The first-principles route lists page buffer, structures, textbook replacement, CUBRID replacement, daemons, comparison, and synthesis. The database bridge and full flush-generation lecture are not explicit steps. Yet the daemon material asks me to interpret WAL, a stable copy, DWB submission, newer dirty changes and safe reuse. Brief local definitions help, but do not construct the complete model.

The full curriculum can supply this background. The problem is the shorter route's apparent self-sufficiency. Its order also differs from the foundations-first full curriculum. A presenter may bridge these gaps orally; the audience-facing route does not make that dependency obvious.

**Repair:** Put a small, explicit prerequisite checkpoint before daemon work. Either route through the bridge and a minimal generation example, or include their necessary causal explanation locally. State which route the session is following.

**Socratic questions**

1. What must I already be able to explain before “WAL-ordered cleaning” is meaningful?
2. If I follow only the numbered route, where do I learn how committed changes survive when their data page has not been written?
3. Which daemon statement would I misunderstand if I thought a flush always wrote the current in-memory bytes?
4. What short prediction would demonstrate readiness to proceed beyond replacement safety?
5. If the full curriculum and the first-principles route order topics differently, which prerequisite does each order satisfy?
6. Can the speaker identify the exact explanation that a participant missing the previous session should revisit?

## 2. I meet page names before a concrete reason to request a page

**Where:** [Page journey](ko/lessons/0001-present-the-page-journey.html) and [structures](ko/lessons/0002-separate-objects-from-state.html).

P and Q are excellent identity labels. However, “a thread requests P” begins below the level of a database novice's understanding. I can learn that a page is a fixed-size block and still not know whether it contains a row, many rows, an index, or something else. The frame/BCB explanation is more developed than the connection from a familiar operation to those objects.

**Repair:** Start with one explicitly simplified operation: locating a record requires accessing a storage page; the storage component asks for that page; the buffer manager supplies protected access to its bytes. Show which part of that story this seminar owns. Avoid pretending one SQL statement necessarily touches only one page.

**Socratic questions**

7. When an application asks for one record, why might the engine request a whole page?
8. Could two different record requests need the same page, and what would the buffer manager see?
9. Does a page identifier tell us which logical record is inside it?
10. Which component decides what the page's bytes mean, and which decides whether its frame may be reused?
11. If the operating system also caches file contents, what database-specific obligations remain here?
12. What changes in the story when the engine creates a page rather than reads an existing one?

## 3. The motivating workload does not yet yield one continuous policy outcome

**Where:** [Foundations](ko/lessons/0000-replacement-foundations.html), [Lecture 7](ko/lessons/0007-replace-one-frame.html#first-principles), and [worked example](ko/reference/lru-worked-example.html).

The textbook trace follows P/R and S/T/U. Lecture 7 resets to H1/H2, S1/S2/S3 and private domains PA/PB. It explicitly labels its examples as excerpts from a larger pool, which is good. But it moves between independent snapshots: 100+100 protected entries, a 4,000-page list with quota 2,000, a three-candidate safety scan, and native results with 4,096 frames.

I can explain individual rules without being able to answer the opening question: **under one specified schedule, do H1 and H2 actually survive B's scan, and why?** This is not a request to claim guaranteed scan resistance. It is a request to finish one conditional example. A linked detailed example helps reference reading but does not finish the live narrative automatically.

**Repair:** Maintain one visible state ledger for the main story. Label each reset as an independent counterexample. End the main trace with its actual residency outcome and the assumptions on which that outcome depends.

**Socratic questions**

13. At this point in the story, which pages are resident, fixed, dirty and eligible?
14. Which event changes the zone boundary, rather than merely requesting a page?
15. What exact sequence would cause H1 to survive, and what small change would make it leave?
16. Are PA and PB distinct because the example stipulates it, or because every session necessarily receives a unique list?
17. Which numbers carry forward from the previous diagram, and which are freshly assumed?
18. Can we finish B's request and show the resulting state before introducing another exception?

## 4. The concurrency vocabulary needs a smaller executable mental model

**Where:** [Structures](ko/lessons/0002-separate-objects-from-state.html), [Lecture 7 recheck](ko/lessons/0007-replace-one-frame.html#handoff-details), and [ownership](ko/lessons/0004-repay-fix-debt.html).

The material correctly separates fix count, latch state and dirty state. Later it adds the LRU mutex, BCB mutex, try-lock, waiters and lock-order concerns. A novice may hear all of these as variants of “lock the page.” Saying their purposes differ is necessary, but a two-thread execution showing the differences is more memorable.

The first-principles route does not take the full acquisition/ownership sequence before replacement. The existing ownership demonstration should be deliberately reused or summarized at this seam.

**Repair:** Show two readers, then a writer, then a replacing allocator. Keep four separate columns: outstanding uses, access to bytes, BCB metadata protection, and list protection. Explain the relevant protection before presenting its lock-order consequence.

**Socratic questions**

19. Can two threads both have a successful READ fix? What prevents replacement while either still uses the page?
20. If residency is protected, what could still go wrong when a writer changes the bytes?
21. When one thread fixes the same page twice, does one unfix end all its obligations?
22. Which fact does the LRU mutex stabilize that the page latch does not establish?
23. Between observing a candidate and claiming it, what exact action by another thread invalidates the observation?
24. Can we draw the two waits that would make blocking on the BCB under the list lock dangerous?

## 5. The zone explanation starts reasoning before all its premises are established

**Where:** [Lecture 7 zones](ko/lessons/0007-replace-one-frame.html#zones), [admission](ko/lessons/0007-replace-one-frame.html#admission), [reuse](ko/lessons/0007-replace-one-frame.html#reuse), and [quota](ko/lessons/0007-replace-one-frame.html#quota).

The LRU1-versus-LRU2 comparison is now concrete and acknowledges valid alternative designs. However, it relies on “ordinary final unfix,” the age condition, and protected thresholds before the subsequent sections fully establish admission, final unfix, tick age, and quota. This creates forward dependencies inside the central lecture.

The result can feel like: “Accept these rules now; later I will explain the terms needed to understand them.” A novice might also mistake “protect” for a safety guarantee rather than a policy preference, despite later qualifications.

**Repair:** Introduce an ordinary admission and final-unfix event first. Define the age quantity with one numerical example. Then contrast the zone rules, and only afterward expand quota computation and exceptions.

**Socratic questions**

25. Does “protected” mean impossible to evict, or outside the currently searched candidate region?
26. What makes an unfix final, and why is that event useful for this policy decision?
27. What advances list age, and what apparently relevant event does not?
28. If H1 has never been reused, can it still be in LRU1? What does that reveal about the label “hot”?
29. If a quota changes while list length stays constant, which boundary or membership facts can change?
30. Could we replace the three-zone policy with another policy while retaining the same safety protocol?

## 6. The durability explanation needs one failure timeline, not only distinctions

**Where:** [Database bridge](ko/lessons/0000a-database-bridge.html), [flush-generation lecture](ko/lessons/0006-flush-one-generation.html), and [flush handoff](ko/lessons/0006b-follow-page-flush-handoff.html).

The bridge already defines durability and WAL; the detailed lecture exists. The gap is bringing their causal model into the presentation route. “Unfix is not commit,” “flush is not eviction,” and “submission is not universal durability” can become a list of negations unless I can follow a changed value through memory, log, copied image and storage.

DWB adds another boundary just as I am learning the first one. Its acronym expansion does not itself explain the failure it addresses. A newcomer needs a small positive account of what each completed event establishes.

**Repair:** Use one value changing from 10 to 11, then to 12 during an older flush. Show a crash at a few chosen boundaries. Keep transaction completion, log durability, submitted image and current dirty state separate. Teach the direct-write case before adding DWB's distinct role.

**Socratic questions**

31. After changing 10 to 11 in memory, which copies contain 10 and which contain 11?
32. If the page reaches storage before its explaining log, what information could recovery lack?
33. If commit is acknowledged before the data page is written, what must make the promise recoverable?
34. If the flusher copies 11 and a caller changes memory to 12, what does completion of the copied write establish?
35. What would go wrong if that completion unconditionally cleared the current dirty state?
36. What failure motivates DWB, and why is that a different problem from ordering log and page writes?

## 7. Several questions test agreement more than reasoning

**Where:** [Lecture 7 candidate safety](ko/lessons/0007-replace-one-frame.html#gate), [recheck](ko/lessons/0007-replace-one-frame.html#handoff-details), and [daemon checkpoints](ko/lessons/0006a-understand-page-buffer-daemons.html).

The question-and-disclosure format is useful. But some visible diagrams already state the outcome: the recheck diagram says to reject S3, and the daemon introduction's table marks occupied candidates unavailable before asking whether one can be overwritten. These are good explained examples; they provide weaker evidence that I can solve the next case.

Repeated prompts such as “does this guarantee...?” also teach a response pattern: answer no and name a caveat. A genuinely diagnostic question should sometimes have a qualified yes, require a state calculation, or admit multiple justified designs.

**Repair:** Separate worked examples from unseen transfer questions. Hide the outcome, not the assumptions needed to derive it. Ask for a counterexample or the smallest condition that changes an answer.

**Socratic questions**

37. Which facts do I need to predict the result, and which visible sentence already reveals it?
38. What single change would make this previously unsafe candidate safe?
39. Can you construct a case where a clean, unfixed page still cannot be reused?
40. Which answer would reveal a specific misconception rather than merely imperfect terminology?
41. Can two different replacement choices both be safe? How would we compare them?
42. If I answer correctly, what follow-up would distinguish understanding from repeating the previous paragraph?

## 8. The central lecture has an uneven rhythm

**Where:** [Lecture 7](ko/lessons/0007-replace-one-frame.html), especially its zone and admission sections, and [comparison lecture](ko/lessons/0018a-compare-replacement-policies.html).

Lecture 7 has questions 1–19 plus 4a, comparative tables, source routes, extended complexity discussion and AOUT material. A heading can introduce either one short thought or a substantial cluster of subtopics. The zone section includes alternatives and costs; admission includes private/shared differences and the volmap aside. The listener cannot infer the conceptual workload from the heading alone.

No fixed total duration is required. Even with unlimited meetings, the material needs clear stopping points and short recaps that allow a participant to rebuild the current model.

**Repair:** Group the narrative into admission, retention, selection, safety and progress. At each boundary, summarize one newly answerable question and run one fresh scenario. Use progressive disclosure to separate the ordinary rule from the first exception worth studying.

**Socratic questions**

43. What one capability should I gain from this section?
44. Where can the group stop without leaving a half-explained dependency?
45. Which detail is necessary to predict the next event, and which can wait until that prediction is secure?
46. Could I draw the state model from memory after the admission section?
47. Which exception changes the ordinary answer we just derived, and which belongs to a later branch?
48. If participants struggle, what smaller example would we return to?

## 9. The participant narrative contains residue from author-side review

**Where:** [Lecture 7 admission](ko/lessons/0007-replace-one-frame.html#admission), [native-result section](ko/lessons/0007-replace-one-frame.html#replacement-lab-route), and [presenter script](my-presentation-script.html).

The volmap subsection discusses what “the reader reported,” cites `/home/vimkim/temp/volmap/docs/runtime-overlay.md`, and says the reader's exact capture was not reproduced. This is a review receipt embedded in a participant explanation. A new attendee does not know who that reader is, what volmap is, or how to access that local path.

Similarly, “no new engine experiment was run for this explanation” describes the authoring process more than the mechanism. Evidence limits matter, but should accompany an understandable observation. The separate presenter script also assumes prior transaction-lock teaching and starts at Lesson 02; it cannot be used unchanged for this zero-prerequisite audience.

**Repair:** Move author-specific receipts into evidence notes. If volmap is part of the seminar, introduce it and provide a portable, annotated capture with its conditions. Update the chosen spoken route so it does not assume an earlier lock-manager seminar.

**Socratic questions**

49. Who is “the reader” in a page written for all participants?
50. What could I infer from the volmap display without having seen the original conversation?
51. Can I access the evidence from the published seminar, or only on the author's machine?
52. Which uncertainty affects my interpretation of this diagram right now?
53. If I missed the lock-manager seminar, which sentence in the presenter script stops being sufficient?
54. Does this paragraph explain the system or explain how the document was reviewed?

## 10. Korean prose switches between explanation and untranslated working notes

**Where:** [Structures](ko/lessons/0002-separate-objects-from-state.html), [Lecture 7 cost details](ko/lessons/0007-replace-one-frame.html#structures-cost), and [comparison](ko/lessons/0018a-compare-replacement-policies.html).

The opening Korean prose often reads naturally. Dense details shift toward constructions such as “Higher-level policy는 caller의 private LRU...” and “Source shape만으로 winner를 고를 수 없다.” Exact identifiers and familiar technical nouns should stay intact. The difficulty is English sentence structure and general-purpose English words carrying the explanation itself.

Terms such as debt, owner, claim, submission and protection also have specialized meanings here. Without consistent Korean explanations, I may import everyday meanings or treat several different ownership relations as one.

**Repair:** Retain code names; write the surrounding causal sentences in natural Korean. Define a term once with a concrete event. Review spoken flow, not only whether the two languages contain matching keywords. This critique is not a formal human-language review receipt.

**Socratic questions**

55. Can this sentence be spoken naturally without mentally translating its English grammar?
56. Does “owner” mean the current caller, the storage allocator, or the replacement-policy domain here?
57. What precisely is owed when we call a fix an ownership debt?
58. Can “submission” be explained as a named transfer to a named destination?
59. Which English words are searchable source identifiers, and which are replaceable prose?
60. Would a participant explain the mechanism in their own Korean, or only repeat its English labels?

## 11. Daemon explanations need one shared execution timeline

**Where:** [Four daemon roles](ko/lessons/0006a-understand-page-buffer-daemons.html), [handoff](ko/lessons/0006b-follow-page-flush-handoff.html), and [maintenance/pacing](ko/lessons/0006c-follow-maintenance-and-pacing.html).

The material explicitly says the four daemons are not four consecutive stages, and carefully distinguishes inline completion from a stranded queue. Those are strengths. However, their implications are spread over several sections, timers, boot conditions, fallback paths and source limitations. I may memorize four names without knowing who can actually make my waiting request progress.

**Repair:** Follow one waiting allocator with parallel lanes for the requester, page-flush, post-flush and the writer/pacing path. Overlay maintenance as a policy update. Branch once into inline completion. Separately contrast “worker absent from startup” with “worker stopped after accepting work.”

**Socratic questions**

61. Which thread is waiting for a frame, and which event could make one available?
62. What exactly crosses the post-flush queue, and what remains elsewhere?
63. If delegation fails, who still owes completion work?
64. Why is a stopped consumer with queued work different from a configuration that never starts that consumer?
65. If all frames are fixed but clean, which background activity cannot solve the immediate obstacle?
66. If credits are checked after a successful write, what future progress can a credit shortage delay?

## 12. The comparison explains three mechanisms better than it tests transfer

**Where:** [Engine replacement comparison](ko/lessons/0018a-compare-replacement-policies.html).

The expanded lecture introduces PostgreSQL and InnoDB and gives concrete snapshots, advantages, disadvantages and a conclusion. It is no longer just a table of engine names. However, parts of each explanation recur in introductions, traces, detailed summaries and final comparisons. The concluding audience question is broad enough to answer by restating the summary.

The harder question is whether I can transfer the common workload across different notions of age and reuse without equating them. A single apples-to-apples hit-count race would be misleading; a common decision worksheet would help.

**Repair:** Use one workload change and ask separately what each engine observes, what metadata changes, and what remains unknown. Keep one canonical recap per engine. End with a falsifiable hypothesis rather than merely “there is no universal winner.”

**Socratic questions**

67. What counts as aging in each engine: elapsed time, a clock visit, or a list-position event?
68. If a scan revisits a page immediately, which mechanisms might interpret that as reuse and which filter it?
69. What changes if the scan revisits slowly instead?
70. If the hot set changes completely, which retained history can temporarily favor the old workload?
71. What observation would refute the hypothesis that scan interference is our dominant cost?
72. What must we control before comparing latency across engines with different page layouts and effective pool capacities?

## 13. The striking native result needs an explicit inference checkpoint

**Where:** [Lecture 7 native-result summary](ko/lessons/0007-replace-one-frame.html#replacement-lab-route) and [replacement lab](ko/reference/replacement-lab.html#native).

The 4,097-page cycle over 4,096 frames is memorable. The material properly limits the result to a controlled debug-server setup and distinguishes engine reads from physical-device misses. But placing the result immediately after “no policy can retain more than capacity” risks a stronger inference: that an oversized working set necessarily causes every request to miss under any policy.

The recorded all-miss outcome and the capacity limit are different claims. The lab's alternative-policy cases help, but the distinction deserves a local question where the result is first emphasized.

**Repair:** Ask which conclusion follows from capacity alone and which follows from this measured sequence and policy. Show an alternative outcome from the existing educational model without claiming it would be a production improvement.

**Socratic questions**

73. Does failure to fit all pages imply that no requests can hit?
74. Which part of this result is a capacity constraint, and which part depends on the replacement decisions?
75. Why does the fitting control strengthen the experiment without establishing general SQL performance?
76. What exactly was counted as a miss in the recorded experiment?
77. What would change if maintenance ran under different conditions or requests were concurrent?
78. What new experiment would be required before claiming that an alternative policy improves useful application work?

## 14. The ending should ask me to diagnose, not only recite

**Where:** [Route takeaways](ko/reference/first-principles-route.html), [whole-request checkpoint](ko/lessons/0007-replace-one-frame.html#retrieval), and [synthesis workshop](ko/reference/core-synthesis-studio.html).

The route's five misconceptions and whole-request reconstruction are sensible summaries. The wider curriculum also provides synthesis and technical-defense work. For the presentation route itself, the missing final experience is a bounded operational puzzle: “the request is slow; what evidence do we need next?”

Without that transfer step, I may leave able to say that safety and progress differ while still treating every slow allocation as an LRU problem. The repair does not require changing the engine or adding a benchmark project.

**Repair:** End with three small evidence cards: repeated buffer misses, mostly fixed candidates, and dirty candidates awaiting progress. Ask participants to choose their next observation and state what would disprove their initial explanation. Supply model reasoning afterward.

**Socratic questions**

79. A request is slow despite many buffer hits. What competing explanations remain?
80. If candidates are clean but fixed, why would increasing page-flush activity fail to address the immediate cause?
81. If a candidate scan visits few entries, can the total allocation still take a long time? Where might the time go?
82. What observation distinguishes poor retention from insufficient reusable-frame supply?
83. Which counter or trace would you inspect first, and what result would change your diagnosis?
84. What can you now predict from a fresh state snapshot that you could not predict at the beginning?

## Suggested revision order

1. Make the chosen route's prerequisites explicit, including the minimum database-safety and generation explanation.
2. Finish one continuous hot-set-plus-scan story with a visible state ledger and a conditional outcome.
3. Introduce admission/final-unfix/age before asking participants to compare the zone rules.
4. Add one concurrency schedule and one crash/flush timeline at the points that need them.
5. Move the volmap review receipt and author-process commentary out of the participant narrative.
6. Replace selected recognition questions with unseen state predictions and counterexamples; retain the worked examples as instruction.
7. Rehearse the Korean spoken route with a person unfamiliar with buffer pools, recording the first term or transition where they cannot continue.
8. Finish with the small diagnosis exercise and use the result to decide what to revisit.

Do not respond to this critique by adding all 84 questions to the live presentation. They are an editorial and rehearsal bank. Choose a few that expose the most important missing prerequisites, and use the rest to challenge the explanations during revision.
