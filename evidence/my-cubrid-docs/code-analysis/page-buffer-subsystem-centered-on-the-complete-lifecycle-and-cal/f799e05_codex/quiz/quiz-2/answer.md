# Answer 2 — Holder와 unfix

## Question-by-question model answers

### Q1. READ와 INSERT signature

**Model/recommended answer:** empty read는 주로 non-dirty READ holder이고 promotion은 0이다. INSERT는 WRITE 또는 READ→WRITE MIXED holder가 bytes를 바꾸고 dirty를 설정하므로 HOLDER_DIRTY가 나타난다. Counts는 rows/unique pages가 아니라 calls와 holder histories다.

### Q2. `fcnt=3`, 내 `fix_count=2`

**Model/recommended answer:** 모든 successful unfix가 holder `fix_count`와 global `fcnt`를 각각 1씩 낮춘다. 따라서 `2/3 → 1/2 → 0/1`이고 두 번째 unfix에서 내 holder만 제거된다. 다른 holder가 마지막 global fix를 풀어 `fcnt 1→0`이 될 때 비로소 `NO_LATCH`/LRU/wakeup 경로가 열린다.

### Q3. Conditional failure cleanup

**Model/recommended answer:** conditional conflict는 PAGE_PTR를 반환하지 않고 holder/fix ownership도 caller에게 만들지 않는다. 소유하지 않은 fix를 unfix하면 오히려 다른 holder/global accounting을 훼손하므로 호출자는 unfix하지 않는다.

### Q4. Transaction lock vs page latch

**Model/recommended answer:** transaction lock은 logical row/key/schema resource와 transaction 간 충돌·격리를 보호한다. Page latch는 짧은 critical section 동안 resident page bytes와 page-local structure의 동시 접근을 보호한다. Commit lifetime과 fix lifetime도 다르다.

답안 근거는 [Ch05 latch/holder/unfix](../../chapters/05-latch-holder-unfix.html#latch-holder-unfix)와 Claims `CUBRID-C002`, `CUBRID-C006`다. `rebind-quiz2`의 mutation은 dirty activity를 관찰하지만 exact holder chain과 waiter ordering은 source-derived contract다.

## 흔한 오답

- unfix를 flush/commit/eviction과 동일시한다.
- counter 한 번을 exact VPID 또는 모든 schedule의 proof로 일반화한다.
- pin/fix와 content latch, transaction lock을 한 종류의 lock으로 부른다.

## Teach-back

90초 동안 그림 없이 핵심 invariant, failure branch 하나와 experiment limitation 하나를 설명하세요.
