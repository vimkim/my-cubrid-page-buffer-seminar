# Answer 3 — Heap B-tree recovery caller

## Question-by-question model answers

### Q1. Covered vs noncovered

**Model/recommended answer:** covered scan은 필요한 값을 index tuple/list tuple에서 만들므로 qualifying row마다 heap lookup이 필요 없다. Noncovered scan은 index OID를 `scan_next_index_lookup_heap()`에 넘겨 heap record를 읽는다. `covered/noncovered` counters는 이 row transition을 세며 BCB fix 수 자체가 아니다.

### Q2. All-exit cleanup

**Model/recommended answer:** parent, child, heap page 각각은 successful fix 뒤 정확히 한 plain/ordered unfix ownership을 가진다. Child fix 실패 시 이미 가진 parent/previous page를 error exit에서 풀고, mutation page는 logging/dirty를 끝낸 뒤 unfix한다. NULL fix에는 unfix가 없고 ordered watcher는 watcher cleanup path를 사용한다.

### Q3. `page_was_unfixed`

**Model/recommended answer:** ordered fix가 lock order를 맞추려고 기존 page를 unfix/refix하면 같은 logical VPID라도 old `PAGE_PTR`, record pointer, slot id와 header-derived state가 stale할 수 있다. `page_was_unfixed=true`이면 current VPID/page type과 slot/record lookup을 다시 검증한다.

### Q4. Recovery fetch와 LSA

**Model/recommended answer:** redo는 allocation/deallocation metadata가 아직 재생 중인 page도 다뤄야 하므로 `RECOVERY_PAGE/WRITE`를 사용하고, page LSA가 record LSA 이상이면 이미 적용된 redo를 건너뛴다. Physical undo는 기존 image를 `OLD_PAGE/WRITE`로 fix하고 보상 기록/cleanup과 짝을 이룬다.

답안 근거는 [Ch06 caller contracts](../../chapters/06-caller-contracts.html#caller-contracts)와 Claims `CUBRID-C003`, `CUBRID-C007`다. `rebind-quiz3`은 query shape의 차이를 재현하지만 every-exit cleanup과 redo semantics는 source call-path evidence로 설명한다.

## 흔한 오답

- unfix를 flush/commit/eviction과 동일시한다.
- counter 한 번을 exact VPID 또는 모든 schedule의 proof로 일반화한다.
- pin/fix와 content latch, transaction lock을 한 종류의 lock으로 부른다.

## Teach-back

90초 동안 그림 없이 핵심 invariant, failure branch 하나와 experiment limitation 하나를 설명하세요.
