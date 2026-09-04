What is the hashing algorithm (VPID -> BCB) looks like?

What happens when a lookup could not find the BCB entry so that it should create a new one?
Is creating new BCB even a term? are BCB fixed in numbers and they get initialized at server startup?

What happens if BCB is full (that is, the loaded, resident pages are near the data page size limit)? What is the victimization algorithm?

What is private LRU and shared LRU? What are their limits and numbers and quotas? How do they acutally work in detail?

How do fix and unfix work?

How many page buffer daemons exist? What do they do? How often do they do the jobs?

Are there any other important data structures I must know?

If I wanna change the replacement algorithm, what should I be aware of?

How do I monitor the replacement algorithm?

How do I know the priority to be replaced (victimized)?
