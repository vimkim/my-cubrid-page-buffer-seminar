# CUBRID Page Buffer Report Run — Declared Scope

## Analysis Topic

이 Report Run은 CUBRID의 `pgbuf_fix()`부터 `pgbuf_unfix()`까지 이어지는 page fix 생명주기를 중심으로, page buffer가 page identity, memory ownership, latch, dirty state, replacement, WAL ordering, physical I/O를 어떻게 하나의 Interface 뒤에 결합하는지 재구성한다.

## Audience and Deliverables

- 대상 독자는 C/C++, 운영체제 동시성, 기본적인 database 개념을 아는 CUBRID 팀원이다.
- 검증 대상 Book은 skill contract에 따른 offline Korean HTML이다.
- 별도 companion은 `notion/page-buffer-guide.md`이며 Mermaid, 표, 발표자 노트, 어려운 예상 질문을 포함한다.
- Mermaid를 사용할 수 없는 offline HTML Book에는 같은 의미의 inline SVG/HTML-CSS diagram과 Korean text alternative를 제공한다.

## Included Module

### Core implementation

- `src/storage/page_buffer.c`와 `page_buffer.h`의 초기화/종료, BCB와 buffer hash, page lookup, `pgbuf_fix*`, latch 획득/대기/실패, holder/fix count, `pgbuf_unfix*`, dirty marking, victim selection, flush, page validation과 오류 정리.
- `PAGE_PTR`, `PGBUF_BCB`, holder/waiter, LRU/victim metadata, page identity(`VPID`), latch mode/condition, page LSA와 dirty/flush state의 ownership 및 lifetime.

### Caller and dependency seams

- Heap: 대표 read/write/ordered-fix 경로, `PGBUF_WATCHER`, scan/record page access, dirty/unfix cleanup.
- B-tree: 대표 search/update 경로, parent/child latch ordering, conditional fix로 dead-latch를 피하는 경로.
- Logging/recovery: page LSA, WAL-before-data ordering, checkpoint/recovery가 page buffer에 요구하는 flush/fix contract.
- Physical I/O: `file_io`, double-write buffer(DWB), TDE가 fix miss와 dirty flush에 연결되는 seam.
- Boot/thread/performance: page buffer startup/shutdown, flush daemon/victim daemon, page-buffer statistics와 관찰 지점.

## Explicit Exclusions

- Heap, B-tree, MVCC, vacuum, logging/recovery 전체 알고리즘의 독립적인 재구현 명세.
- 모든 `pgbuf_fix()` 호출 지점을 한 줄씩 나열하는 catalogue. 대신 호출 지점을 의미론적 caller family로 분류하고 대표 reachable call path를 완전 추적한다.
- ABI, on-disk byte format, exact timing, scheduler interleaving, performance parity, bit-for-bit compatibility 보장.
- PostgreSQL/MySQL 서버 실행. 두 비교 대상은 pinned source evidence만 사용한다.
- 기존 사용자 database/service를 변경하거나 중지하는 실험. 실험은 Report Run이 소유권을 증명할 수 있는 고유 resource만 사용한다.
- source instrumentation은 unmodified runtime, counter, utility, test, debugger evidence로 central gap을 해소하지 못할 때만 별도 안전 transaction으로 고려한다.

## Shared Three-Database Scenario

한 worker가 B-tree를 통해 heap record를 찾고, buffer에 없는 data page를 읽어 shared/read protection 아래 검사한 뒤 release한다. 이어 다른 worker가 같은 page를 write protection 아래 수정하여 dirty로 만들고 release한다. Buffer pressure가 생겨 이 page가 victim 후보가 되고, WAL ordering을 만족한 뒤 physical storage로 flush된다. 이 scenario를 CUBRID, PostgreSQL shared buffers, MySQL InnoDB buffer pool에서 동일한 comparison axes로 추적한다.

## Central Behaviors

1. **fix-lookup-load** — `VPID` lookup에서 hit 또는 miss를 판별하고, miss에서 frame/BCB를 확보하여 DWB/main volume read, validation, hash publication을 거쳐 caller에게 `PAGE_PTR`를 반환하는 흐름.
2. **latch-holder-unfix** — latch mode/condition, wait/retry/timeout/interruption, holder/fix count, conditional failure, `pgbuf_unfix()`의 release/wakeup/replacement eligibility 흐름.
3. **caller-contracts** — heap/B-tree/recovery caller가 page type, old/new semantics, ordered watcher, latch ordering, dirty-before-release, cleanup/error propagation 의무를 어떻게 지키는지.
4. **dirty-wal-flush-replace** — page mutation에서 dirty/page LSA 설정, victim selection, WAL forcing, TDE/DWB/main-volume write, concurrent re-dirty와 flush completion까지의 흐름.

## Questions Every Chapter Must Help Answer

1. Page buffer Module이 숨기는 복잡성은 무엇이며 caller가 반드시 지켜야 하는 Interface contract는 무엇인가?
2. `VPID`, `PGBUF_BCB`, frame, `PAGE_PTR`, holder와 waiter는 누가 만들고 소유하며 언제 재사용되는가?
3. `pgbuf_fix()`의 hit, miss, wait, retry, conditional failure, I/O failure branch는 각각 어떤 state transition을 만드는가?
4. Page latch와 transaction lock은 무엇을 각각 보호하며, 어떤 acquisition/release ordering이 deadlock과 torn in-memory state를 막는가?
5. 성공한 fix는 어떤 경로에서 반드시 unfix되며, dirty update와 error unwind는 어떻게 균형을 유지하는가?
6. Buffer pressure는 victim 선택과 dirty flush를 어떻게 유발하며, 어떤 page가 victim이 될 수 없는가?
7. WAL/page LSA, checkpoint, DWB, TDE는 dirty data page write의 순서와 failure behavior를 어떻게 제한하는가?
8. Startup, steady state, shutdown, interrupt, abort, restart/recovery에서 page-buffer state와 daemon은 어떻게 달라지는가?
9. 어떤 counter/log/debugger landmark가 실제 mechanism을 관찰하며, counter 이름이 의미를 과장하는 곳은 어디인가?
10. PostgreSQL와 InnoDB의 nearest mechanism은 어느 축에서 equivalent, partial analogy, no equivalent인가?
11. 독립 구현자가 source를 다시 열지 않고 이 Declared Scope를 재구성하려면 어떤 Interface, state machine, algorithm, conformance test가 필요한가?
12. 발표 중 팀원이 제기할 수 있는 가장 어려운 반례·실패·trade-off 질문에 어떤 evidence로 답할 수 있는가?

## Coverage Matrix

| Coverage Obligation | Scope treatment | Central behavior(s) |
|---|---|---|
| orientation | covered | all |
| mental-model | covered | all |
| scope-interface-seams | covered | all |
| data-ownership-lifetime | covered | fix-lookup-load, latch-holder-unfix |
| lifecycle-state-machines | covered | all |
| core-workflows | covered | all |
| concurrency | covered | latch-holder-unfix, caller-contracts, dirty-wal-flush-replace |
| storage-durability-recovery | covered | dirty-wal-flush-replace, caller-contracts |
| policies-algorithms | covered | fix-lookup-load, dirty-wal-flush-replace |
| errors-resource-pressure | covered | all |
| performance-observability | covered | all |
| experimental-validation | covered | all |
| postgresql-analysis | covered | all |
| mysql-analysis | covered | all |
| cross-database-comparison | covered | all |
| reimplementation-blueprint | covered | all |
| glossary-evidence-unknowns | covered | all |
| teaching-map | covered | all |

## Scope Change Rule

새 source evidence가 page-buffer Interface의 correctness를 결정하는 이웃 responsibility를 드러내면 범위를 명시적으로 확장할 수 있다. 단순히 흥미롭거나 같은 파일에 있다는 이유로 범위를 확장하지 않는다. 이 문서를 freeze한 뒤에는 verifier 통과를 위해 범위를 축소하지 않는다.
