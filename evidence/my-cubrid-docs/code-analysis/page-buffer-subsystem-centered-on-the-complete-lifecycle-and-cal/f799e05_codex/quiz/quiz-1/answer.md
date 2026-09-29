# Answer 1 — Cold miss와 warm hit

## Question-by-question model answers

### Q1. Cold/Warm 방향

**Model/recommended answer:** isolated server start 뒤 첫 scan은 같은 checksum을 만들면서 positive ioreads와 `OLD_NO_WAIT` fix가 우세하고, 즉시 반복 scan은 resident `OLD_PAGE_IN_PB` fix와 ioreads 0을 예상한다. 실제 `rebind-exp1`은 `38 → 0`이었다. 단, 두 번째 값 0은 이 실행의 관찰이지 보편 상수가 아니다.

### Q2. row 수와 ioread 수

**Model/recommended answer:** 한 page가 여러 row를 담으므로 10,000 rows가 10,000 page reads를 뜻하지 않는다. 반대로 catalog/prefetch/background activity와 eviction은 exact count에 섞여 second scan도 다른 환경에서는 0이 아닐 수 있다.

### Q3. Concurrent cold miss

**Model/recommended answer:** 두 thread 모두 hash miss를 볼 수 있지만 VPID-keyed buffer lock의 owner 하나만 provisional BCB를 claim하고 read/init한다. Owner가 latch/holder를 얻은 뒤 hash mapping을 publish하고 lock을 풀면 waiter는 BCB를 직접 넘겨받지 않고 lookup부터 재시도한다. 이 protocol이 duplicate published residency를 막는다.

### Q4. OS cache와 CUBRID miss

**Model/recommended answer:** OS page cache는 storage read latency를 줄이는 아래 계층이다. CUBRID hash에 VPID→BCB mapping이 없으면 CUBRID 관점에서는 miss이며 ioread attempt가 기록될 수 있다. 따라서 CUBRID miss와 physical-device miss는 같은 명제가 아니다.

답안 근거는 [Ch04의 branch reconstruction](../../chapters/04-fix-lookup-load.html#core-workflows)과 Claims `CUBRID-C001`, `CUBRID-C005`다. `rebind-quiz1`은 SQL이 재현 가능함을 보이지만 concurrent cold loaders를 실행하지 않았으므로 duplicate-publication invariant는 source evidence로 방어해야 한다.

## 흔한 오답

- unfix를 flush/commit/eviction과 동일시한다.
- counter 한 번을 exact VPID 또는 모든 schedule의 proof로 일반화한다.
- pin/fix와 content latch, transaction lock을 한 종류의 lock으로 부른다.

## Teach-back

90초 동안 그림 없이 핵심 invariant, failure branch 하나와 experiment limitation 하나를 설명하세요.
