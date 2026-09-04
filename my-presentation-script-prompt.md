$ask-matt

여기 있는 html 자료들을 토대로 발표를 할거야. $ask-matt

발표 스크립트를 만들어줘. $implement

presentation-script.md 파일로 만들어줘.

각각의 페이지별로 간단하게 갈거야 내가 발표하면서 보면서 트래킹할 수 있도록 (출력해서 볼거야)

우선 lesson 02 에서 VPID, .. 등 6개의 개념을 설명할 거야.

그 다음 pgbuf fix 를 할 때 필요한 4가지 인자들에 대해 설명할 거야 vpid latchmode, wait condition, fetch mode 등

이건 아마 lesson 03 에서 설명해야 하나?

그 다음에 BCB lookup miss 가 발생했을 때 어떻게 하는지 설명할거야.
cold miss 에 대해서 설명.

그리고 계속 VPID 를 계속 recheck 하는 이유에 대해 설명할거야. lock 없이 hash entry 에만 mutex 를 걸구 접근하구 확인하고, 그 다음에 lock 걸고 다시 확인해야 해 왜냐면 다른 친구들이 변경했을 수 있으니까.

그 다음에 동시에 두 thread 가 hash lookup 을 했을 때 cold miss 일 경우 어떻게 되는지 설명할 거야.
A, B 동시에 들어와서 A 는 load owner가 되고 B는 waiter 로 들어가.
A가 하는 역할을 설명하고 그 다음 B를 깨워.

그 다음에 맨 처음에 어떻게 bcb 를 allocate 하는지 설명할 거야.
invalid list 에서 요청을 하고
replacement zone 을 INVALID -> VOID 로 바꾸고
읽어오고 등등..

그 다음에 identity check 가 
hash entry vpid == BCB vpid
BCB vpid == header vpid

이렇게 다르기 때문에 이 친구들의 identity check를 해줘야 한다는 걸 알려줄거야.

---

lesson 4

I will teach the concept of global fcnt and thread holder fix_count 

I'll try the 04 simulation feedback 

fix 한번에 무조건 unfix 한번을 해줘야 한다는 사실을 강조할거야. 

--- 

lesson 4a

now this thread hold list and entry seems like a performance bottleneck. 

This is just a simple linked list that has a search feature.

If a thread fixes multiple pages and unfixes, 

it always search through the whole list.

initial numbers are 7, which means the developer thought the max fix counts maybe 7. 

그 다음 page buffer 가 끝날 때까지 page holder entry 갯수는 계속 늘어나고 줄어들지 않는다는데 이친구가 메모리 누수 위험이 있는지 검증해봐야해 $research

I'll continue explaining the lookup scenario... skip this part.

Then I'll at 05 section
global fcnt protects the residency, while holder identifies who is the owner.

I'm not sure if this is necessary. I've done some research but I could not find a rationale for this. I'll mention this to the audience.

I'll say maybe we should consider redesigning this holder entry later. I'll keep an eye on it. The useful case is the simple fix, adapted to the temporary pages. If this is not crucial feature, we might use the simple fix approach for normal page fixes, if possible.

I'll mention that, if the pgbuf holder unfixes and the count goes to zero, the list goes back to the free list.

I heard this is also a possible bottleneck for repeated fix and unfix.

Therefore for repeated use cases, some say fixing it twice and fix and unfix even better.

I'll also mention that this zero crossing behavior might cause some unnecessary bottleneck for repeated fix and unfix. This is an improvement point.

A simple way is to queue these and make this async.

---

--- 

05 is just a recap for known lock manager and latch.

It recaps the difference btw lock and latch. 

This has already been covered in the team on lock manager seminar so I'll keep it brief.

I must mention about pgbuf fix debt in detail.

There are certain things pgbuf fix guarantees, but there are some debts that user must obey.

If write latch, for every modification, it must append a log for that, and set it dirty, and unfix this.

log ensures durability.
dirty and unfix ensures that it will be flushed and reused later.
etc.

---

06 flushing 

I'll explain 4 daemons (not in detail)

but pgbuf-page-flush daemon does the flush and post flush does the post job.

I'll mention that daemon is just one of the flush path.
checkpoint might flush due to oldest unflush lsa page

I'll show the flush visuals (two lsas, two questions)

I'll show the checkpoint boundary visual

I'll show two boundaries answer two different questions

I'll explain the two risks if invariants not hold

I'll show the DWB

---

07 search bcb

I'll explain that invalid list briefly (or say this will be mentioned later)

I'll explain that LRU search is O(M + K), what is M btw? K is coded 1000. I'll say I don't know why 1000.
If possible research the reason.

I'll say 1000 is limit for shared LRU.
private LRU max is P (MAX_NTRANS + 50)

I'll say it does 4 checks

- user
- dirty flushing
- waiter
- mutex protect and recheck

I'll explain search candidate race.
LRU mutex -> check -> BCB try and skip immediately -> check -> try and lock -> remove from LRU
I'll explain why check twice.

--- 

08 I'll skip this lesson as this looks unnecessary

--- 

09 I'll say this is more in depth.

When found resident BCB 

I'll say there are 5 outcomes.

I'll explain the wait queue. This is used when the latch request mode is UNCONDITIONAL (says I can unconditionally wait for the latch)

I'll say NO_LATCH <- this is an initialization state or fail state, or unfixed state.

I'll explain the latch conflict and wait state.

I'll explain the Pinned-source anomaly <- maybe the implementor missed the condition that, if the reader is the write requestor himself, the write latch can be granted to the holder. The fix count is there for Rn + W1, but the implementer fixed it to 1, thinking that the write latch must be granted only after all other fixes are unfixed.

I'll explain that if waiter queue is long, the insert is O(waiter),

In fact, 100 waiter means 4950 waiter queue check. <- I'll check if this is correct. Why no tail waiter? I have no idea.
Why not a doubly linked list?

I should also look for timed out waiters, how long it takes.

This is too much detail so I skipped.

I'll say if many write waiter, it waits for zero crossing with visuals.

I'll say the all readers get granted once a waiter queue ... 

In the long term, this might cause 100 waiters in the front, and readers coming at the back, and the search keeps O(Wn + Rn)

timeout and interrupt <- this is too much detail so not too deep dived.
It says it removes itself and I wonder how it does. It might need a bcb lock? I need further research.

---

for advanced concept
lesson 0010, I'll say the reason for latch promotion existence.

Instead of this latch conditional wait and unconditional etc,

it wants to give the option to select promote only reader
and promote shared reader.

promote only reader fails immediately if there are other readers.

바로 unfix 를 여러번 해버리고 write(k) 를 queue한다. 

write(k) 한다는게, k번 write 요청을 한다는건지, 아니면 횟수를 지정할 수 있는건지 궁금하다.
좀 더 조사해봐야 한다.

근데 이것만 봐서는 latch promotion 을 사용할 필요성이 안 느껴진다. 이미 비슷한 매커니즘이 도입되었기 때문에, 지워도 되지 않을까? 하는 생각이 든다.

It is easy to prove that I'm the sole owner. holder entry fix_count == fcnt.

and I think this is the only reason we have holder entry fix_count. We might want to remove it and it might be faster, and have some std::unordered_set or something more efficient to check (multiset?) the ownership.

---

for lesson 11 <- I'm just introducing the need, concept of ordered fix.

This is how heap module prevents dead lock with VPID ordered fix.
I'll make this simple and quick.

---

for lesson 12, one of the most important slide.

I'll say by default there will be 184 LRU descriptors and 32,768개 BCB.

I'll say BCB has 5 states.

I'll explain the BCB travel log.
startup -> fix, VOID -> unfix -> (private LRU1 / shared LRU2)

continuously reduced from LRU1 -> LRU2 -> LRU3

fix -> LRU1

victim -> VOID

continue the pass

now the question is, when does it get continuously reduced?
and what differentiates private / shared?
and what are the queue sizes or selection for private and shared for a thread when in need?

direct-victim flag <- I don't know what this is. If you know add it, or not I'll skip it.

---















