http://192.168.4.2:8002/ko/lessons/0012-prove-replacement-progress.html <- this 12 is very important.

It tells about the victimization policy.

Yet, all explanations are vague, hard to understand and they do not have precise numbers or quantities.

Rewrite the file to be more understandable.

I wanna know, what are the quotas,
How does LRU look like,
who makes it
how does it look like in the beginning
how does it like in heavy load.
What is the time & space complexity of each operation.


Q.
If victims are scanned from other's private LRU,
if there are many threads (transactions) open,
they must scan all other many 2000 transactions' private LRU,
which might be a burdensome job. Is this a probable performance bottleneck?

Q.
If a BCB page is read twice, is there some statistics that make it less victimized?
What are the algorithm behind?
