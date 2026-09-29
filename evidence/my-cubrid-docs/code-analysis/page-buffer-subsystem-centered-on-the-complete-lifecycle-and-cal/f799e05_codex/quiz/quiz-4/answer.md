# Answer 4 — Dirty WAL flush replacement

## Question-by-question model answers

### Q1. Dirty와 두 LSA

**Model/recommended answer:** DIRTY는 current resident generation이 data volume보다 새롭다는 뜻이다. Page LSA는 그 image에 반영된 log position이며 WAL gate의 상한을 준다. `oldest_unflush_lsa`는 이 BCB가 언제부터 unflushed였는지 나타내 checkpoint/flush 우선순위에 쓰인다.

### Q2. WAL gate와 write 순서

**Model/recommended answer:** BCB mutex 아래 stable copy를 만들고 FLUSHING을 세우며 old DIRTY를 clear한 뒤 mutex를 놓는다. Copied image의 page LSA까지 `logpb_flush_log_for_wal()`로 먼저 durable하게 하고, 그 다음 DWB slot 또는 direct data-volume write를 제출하고 completion state를 처리한다.

### Q3. Flush success와 current DIRTY

**Model/recommended answer:** flusher가 generation G를 snapshot한 뒤 writer가 resident page를 G+1로 수정하고 DIRTY를 다시 세울 수 있다. G의 write가 성공해도 completion은 FLUSHING만 지우고 G+1의 DIRTY를 보존한다. 이것은 lost update가 아니라 두 generation의 분리다.

### Q4. `fcnt=0`인데 victim이 아닌 반례

**Model/recommended answer:** `fcnt=0`이고 clean이어도 LRU1/2처럼 zone3 밖이거나, latch waiter/비-NO_LATCH state가 있거나, FLUSHING/direct-victim invalid-candidate flag가 있으면 ordinary victim이 아니다. Avoid-deallocation count는 vacuum deallocation을 막지만 victimization 자체를 막지는 않는다.

### Q5. PostgreSQL/InnoDB nearest mechanisms

**Model/recommended answer:** CUBRID fix/latch와 PostgreSQL pin/content lock, InnoDB buf-fix/page latch+MTR memo는 모두 **partial analogy**다. WAL-before-data도 CUBRID `logpb_flush_log_for_wal`, PostgreSQL `XLogFlush`, InnoDB log write가 같은 responsibility를 가지지만 interface는 다르다. Replacement의 LRU zones, clock sweep, midpoint LRU도 **partial analogy**다. CUBRID DWB와 InnoDB doublewrite는 torn-page defense의 partial analogy지만 PostgreSQL WAL full-page image는 같은 stage의 직접 equivalent가 아니므로 **no direct equivalent**로 말한다.

답안 근거는 [Ch07 dirty/WAL/flush/replacement](../../chapters/07-dirty-wal-flush-replace.html#dirty-wal-flush-replace), [Ch09 comparison](../../chapters/09-comparison.html#cross-database-comparison), Claims `CUBRID-C004`, `CUBRID-C008`, `CMP-C002`, `CMP-C004`, `CMP-C006`, `CMP-C007`이다. `rebind-quiz4`은 mutation/commit을 재현하지만 WAL gate, DWB completion과 victimization의 physical trace는 아니다.

## 흔한 오답

- unfix를 flush/commit/eviction과 동일시한다.
- counter 한 번을 exact VPID 또는 모든 schedule의 proof로 일반화한다.
- pin/fix와 content latch, transaction lock을 한 종류의 lock으로 부른다.

## Teach-back

90초 동안 그림 없이 핵심 invariant, failure branch 하나와 experiment limitation 하나를 설명하세요.
