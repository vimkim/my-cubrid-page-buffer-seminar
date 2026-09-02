code-analysis/page-buffer-presentation/learning/02-fix-hold-release.md

Caller intent

VPID
1. fetch knowledge
2. latch mode
3. wait condition

lock BCB -> recheck VPID.

Q. Why recheck VPID?

Q. BCB page header agree? What does this mean?

Q. what is VPID load owner? Why does it prepare BCB?

What do you mean by DWB or data volume for old page?

What is same success postcondition in svg?

Why it says one thread becomes the load owner, not the one who searched for the BCB?

What do you mean owner's provisional BCB?

resident-hit stale-observation boundary. <- stands for?

what do you mean commit debt?

Why do we do identity check twice? Isn't this unnecessary?

If two holders (thread A and thread B) fixes a page, is there a way for us to know that the owner of the BCB (or page) is A and B? That means, is there a back reference (linked list or array) that tells us the thread id or something like that that points to A and B?

So what exactly happens in case of conflict, or UNCONDITIONAL WAIT for write latch?

If 100 threads request a write latch for a single page unconditionally, how it is being handled?

If a page miss happens, what is the step? What are the probable performance issue?

Some say there might be a full of free BCB so there is a infinite wait. Explain these conditions.

If the page buffer module needs to select a victim, what are the conditions for that?

---

These questions must be answered in the document.


