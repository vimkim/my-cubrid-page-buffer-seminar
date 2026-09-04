왜 handoff를 protect합니까?	A에 대한 stale observation이 detach/rebind 또는 state movement 이후 적용되는 일을 막기 위해서입니다.
I don't understand. Explain in more details.

Why a BCB cannot be a part of private LRU and shared LRU? How do we ensure it? Please mention the code.

Why when a BCB is selected to be a victim, should it be clean and not flushing?

What does No waiters or 'transient claim' mean?

What are the conditions for actually trying to select the victim? Is it when the pool is full of BCB?

What happens if the pool is full and all BCBs are fixed?

lock 전에 모두 clear → observation이 stale일 수 있음 <- what does this mean? Explain in detail

private LRU / shared LRU 의 lifetime 이 궁금하고, 어디에 어떻게 매달려있고, 어느 정도 크기이거나 어떤 형태이고,
quota 가 몇인지 궁금하다.
