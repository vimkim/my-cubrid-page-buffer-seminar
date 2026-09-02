code-analysis/page-buffer-presentation/learning/02-fix-hold-release.md (revised at 4fe4e7e)
code-analysis/page-buffer-presentation/advanced/acquisition-concurrency.md
code-analysis/page-buffer-presentation/advanced/replacement-progress.md

Q. "hash anchor" appears three times (the load lock row, step 1, the stall list) but is never defined. Is it just the hash bucket head? Why does it have its own mutex and two chains?

Q. What is the "invalid list"? Is invalid the same as free? Who puts a BCB there and who takes it out?

Q. "VPID load lock", "buffer lock", "load owner": are these the same mechanism? Which name do I grep for in page_buffer.c?

Q. Step 2 says a victimizer may have unlinked the BCB from the hash chain while I was still walking it. If it was unlinked, why is it safe for me to lock and read that BCB? Could that memory be freed under me?

Q. The Advanced replacement page says the victim scan "starts in the victim zone" and the new allocation section says "vacuum unfix in the LRU3 zone". Which zone is the victim zone? LRU3?

Q. The hundred-writer case says "one grant per zero-crossing". Zero-crossing of what?

Q. "Who holds this BCB?" says a diagnostic must scan every thread's holder list, "which is what the debug dump routines do". Which routine? Does pgbuf_dump actually print holder threads? Also, what is a "holder anchor"?

---

These must be answered in the document. This pass was done by an agent standing in for the reader.
