# Pedagogy Architecture Packet

## Packet Metadata

- **Role**: Role 5 — Pedagogy Architect
- **Analysis Topic**: CUBRID `pgbuf_fix()`/`pgbuf_unfix()`의 완전한 생명주기를 중심으로 한 page buffer subsystem
- **Declared Scope digest (SHA-256)**: `796828eab6754ed60bd88d65be34913c7d510e61b61d9a06e73f5340faae2d08`
- **CUBRID revision**: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` (`WORKTREE`, dirty)
- **PostgreSQL revision**: `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc` (`WORKTREE`, dirty because of untracked `.omc/`)
- **MySQL revision**: `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8` (`COMMIT`, clean)
- **Timestamp (UTC)**: `2026-08-28T07:28:34Z`
- **Output constraint observed**: 이 packet만 작성했다. Book, Markdown companion, Claim ledger, Experiment, Quiz, `report.json`, source는 수정하지 않았다.

## 1. Pedagogical Verdict

이 주제는 `pgbuf_fix()`를 한 함수로 설명하면 실패한다. 학습자가 최종적으로 재구성해야 하는 것은 다음 인과 사슬이다.

> page identity를 요청한다 → resident frame을 찾거나 만든다 → 요청한 동시성 보호를 얻는다 → caller가 빌린 `PAGE_PTR`를 사용한다 → 변경을 dirty/LSA 상태에 반영한다 → 반드시 unfix한다 → frame이 다시 교체 후보가 될 수 있다 → flush 시 WAL과 physical I/O 순서를 지킨다.

Book과 companion은 모든 장에서 아래 다섯 질문을 반복해야 한다.

1. **Identity** — 지금 추적하는 page와 frame은 무엇으로 식별되는가?
2. **Ownership/Lifetime** — 누가 무엇을 소유하고, caller가 임시로 빌린 것은 무엇이며, 언제 무효가 되는가?
3. **Concurrency** — 어떤 mutable state를 어느 latch/mutex/atomic이 보호하며, 실패하면 wait/retry/reject 중 무엇이 일어나는가?
4. **Durability** — 이 시점의 변경은 memory에만 있는가, log까지 durable한가, data page까지 durable한가?
5. **Release/Progress** — 성공 또는 실패 뒤 어떤 회계가 복구되고, 다음 waiter나 victim 선택이 어떻게 진행되는가?

이 질문을 반복하면 `pgbuf_fix()`를 “disk read 함수”나 “lock 함수”로 축소하는 오류를 막을 수 있다. 학습 순서는 **직관 → 하나의 concrete scenario → object와 state → exact branches → invariants/failures → database comparison → reimplementation**이어야 한다.

## 2. Evidence Boundary for the Writer

이 packet은 설명 구조를 설계한다. 구현 사실의 Evidence가 아니다.

- `/home/vimkim/gh/my-cubrid-docs/pgbuf-rebuild-spec`은 장 구성, 시각화 후보, 재구현 질문을 찾는 secondary context로만 사용했다. 이 Report Run과 revision이 다르므로 Claim 근거로 인용하면 안 된다.
- `/home/vimkim/gh/my-cubrid-docs/cbrd-27198/teach`는 latch 교육의 실패/성공 패턴을 찾는 secondary context로만 사용했다. 특히 “세 화살표”, “locally consistent but wrong contract”, “watchdog is not proof”, “repro proves mechanism, not policy”라는 교수법을 재사용하되, 그 ticket의 결론을 현재 revision의 사실로 가져오면 안 된다.
- 아래에 적은 exact mechanics는 CUBRID/PG/MySQL source tracer가 검증한 Claim에만 연결해야 한다. 현재 `report.json`의 `CUBRID-C001..C008`, `PG-C001..C004`, `MYSQL-C001..C004`, `CMP-C001..C004`는 central-behavior binding으로만 취급한다.
- 문장 끝의 Claim ID는 설명을 대신하지 않는다. 독자는 source link를 닫아도 before state, guard, action, after state, error가 무엇인지 알 수 있어야 한다.

## 3. Audience Calibration and Learning Progression

대상은 C/C++, OS concurrency, introductory database를 아는 CUBRID 팀원이다. buffer manager internals는 모른다고 가정한다. `mutex`, atomic CAS, cache, disk page 정도는 짧게 상기시키고, CUBRID 용어는 반드시 first use에서 정의한다.

### Stage 0 — Diagnostic retrieval

본문을 읽기 전에 5분짜리 진단을 둔다. 답을 먼저 가르치지 않는다.

1. disk page, buffer frame, `PGBUF_BCB`, `PAGE_PTR`를 각각 한 문장으로 구분하라.
2. page fix와 page latch가 같은 말인지 설명하라.
3. `pgbuf_fix()`가 성공한 뒤 caller가 반드시 해야 하는 일을 말하라.
4. dirty page와 durable page가 같은 말인지 설명하라.
5. buffer hit이라면 latch wait도 없다고 볼 수 있는지 예측하라.

오답은 장 순서를 바꾸는 신호다. 특히 2번을 틀리면 Chapter 02의 Interface를 먼저, 4번을 틀리면 Chapter 07의 three-moment durability model을 반복한다.

### Stage 1 — One concrete story

Declared Scope의 shared scenario를 책 전체의 단일 spine으로 사용한다.

> Worker A가 B-tree를 통해 heap record의 `VPID`를 얻어 read fix한다. page가 miss라면 frame을 마련하고 읽는다. Worker B가 같은 page를 write fix하여 수정하고 dirty로 표시한 뒤 unfix한다. 압력 때문에 page가 victim 후보가 되고, WAL 순서를 만족한 다음 storage에 쓰인다.

매 장 첫 문단에서 “지금 이 story의 어느 순간인가?”를 표시한다. 새 예제를 계속 추가하지 않는다. temp page, recovery, ordered fix는 기본 story의 variation으로 붙인다.

### Stage 2 — Separate the nouns before the verbs

`VPID → BCB → frame → PAGE_PTR → holder/waiter`를 먼저 분리한다. 그 다음 `lookup/load → latch/fix → use/dirty → unfix → flush/reuse` 동사를 붙인다. object가 섞인 상태에서 call graph부터 보여 주면 학습자는 disk page, frame, BCB를 모두 “page”라고 부르게 된다.

### Stage 3 — Four central behaviors

1. `fix-lookup-load`: identity와 residency를 해결한다.
2. `latch-holder-unfix`: 접근 권한, accounting, wait/release를 해결한다.
3. `caller-contracts`: heap/B-tree/recovery가 Interface를 올바르게 조합하는 법을 보여 준다.
4. `dirty-wal-flush-replace`: 변경, durability, pressure, reuse를 연결한다.

각 behavior는 아래 순서로 가르친다.

> prediction → happy path → one branching point → failure/retry → invariant → counterexample → teach-back

### Stage 4 — Exact reconstruction

각 central behavior의 마지막에는 다음 형식의 reconstruction sheet가 있어야 한다.

| 항목 | 독자가 source 없이 답해야 하는 내용 |
|---|---|
| Interface | inputs, modes/conditions, preconditions, outputs, ownership, errors |
| State before | identity, residency, fix count, latch, dirty/LSA, replacement membership |
| Guards | hit/miss, compatibility, condition, interrupt/timeout, dirty/fixed/flush state |
| Actions | lock/latch/CAS, allocation, I/O, publication, accounting, wakeup |
| State after | success, retry, conditional failure, I/O failure 각각 |
| Cleanup | 어떤 단계까지 진행했든 되돌려야 하는 bookkeeping과 resource |
| Forbidden interleavings | duplicate residency, use-after-unfix, dirty without required protection, WAL violation 등 |
| Observability | 이 branch를 관찰하는 counter/log/experiment와 그 한계 |

### Stage 5 — Contrast and rebuild

PostgreSQL/MySQL 비교는 CUBRID 학습 뒤에 둔다. 먼저 다른 DB 용어를 주면 familiar name이 false equivalence를 만든다. 마지막에는 Interface-first 구현 순서와 conformance test를 독자가 다시 설계하게 한다.

## 4. Proposed Book and Companion Chapter Map

`report.json`의 네 central chapter path는 그대로 유지한다. 나머지 파일명은 main writer가 coverage binding과 맞춰 확정한다.

| Ch. | 제안 제목 | 핵심 학습 질문 | 필수 시각 자료 | Coverage obligation |
|---:|---|---|---|---|
| 01 | 읽기 지도와 증거 규칙 | 무엇을 배우며 무엇까지 재구현 가능하다고 주장하는가? | V01 reading map, provenance card | orientation |
| 02 | `pgbuf_fix()`는 무엇을 약속하는가 | page buffer Module이 숨기는 일과 caller 의무는 무엇인가? | V02 whole-system boundary, V03 five-question strip | mental-model, scope-interface-seams |
| 03 | Page가 아니라 object graph를 보라 | `VPID`, BCB, frame, `PAGE_PTR`, holder/waiter의 identity·ownership·lifetime은? | V04 ownership diagram, V05 lifetime timeline | data-ownership-lifetime |
| 04 | Lookup, hit, miss, load | 동일 VPID가 hit/miss에서 어떻게 unique resident page가 되는가? | V06 hit/miss sequence, V07 lookup/load state machine | core-workflows, policies, errors |
| 05 | Latch, holder, wait, unfix | resident page의 접근권을 누가 받고, 언제 wait/retry/reject하며, unfix가 무엇을 해제하는가? | V08 latch compatibility table, V09 holder ledger, V10 wait/wakeup sequence | concurrency, lifecycle, errors |
| 06 | Heap, B-tree, recovery caller 계약 | caller마다 fetch/mode/condition/order/dirty/cleanup 의무가 왜 다른가? | V11 caller-family map, V12 ordered multi-page acquisition | Interface seams, core workflows, errors |
| 07 | Dirty에서 WAL, flush, victim reuse까지 | 수정이 언제 memory/log/data storage에 존재하며, flush와 replacement가 어떤 순서를 지키는가? | V13 three-moment durability, V14 flush sequence, V15 replacement decision tree | durability/recovery, policies, performance |
| 08 | 시작, 종료, 압력, 실패 | startup/shutdown/abort/restart에서 pool과 daemon은 어떻게 달라지고 실패는 어디로 전파되는가? | V16 lifecycle timeline, V17 crash/failure matrix | lifecycle, errors/resource pressure, recovery |
| 09 | 관찰과 실험 | counter/log/runtime output이 정확히 무엇을 증명하고 무엇을 증명하지 않는가? | V18 observation-to-claim funnel, experiment cards | performance-observability, experimental-validation |
| 10 | PostgreSQL와 InnoDB 비교 | 같은 scenario의 responsibility가 어디에 있고 어느 축만 닮았는가? | V19 three-lane scenario, semantic-gap matrix | PostgreSQL, MySQL, cross-database |
| 11 | Source 없이 다시 설계하기 | 어떤 order로 Module을 구현하고 어떤 test로 behavior를 잠그는가? | V20 dependency graph, V21 conformance pyramid | reimplementation-blueprint |
| 12 | Glossary, Evidence, Unknowns, Teaching map | 어디까지 Source-confirmed이며 무엇이 남았는가? | V22 evidence/unknown map, mastery map | glossary-evidence-unknowns, teaching-map |

### Chapter writing micro-pattern

모든 장은 아래 리듬을 지킨다.

1. **학습 목표**: 독자가 끝에서 할 수 있는 행위 2–4개.
2. **Concrete moment**: shared scenario의 한 순간과 prediction 질문.
3. **Intuition**: 최대 5문장. analogy를 쓰면 한계도 같은 단락에 쓴다.
4. **Exact mechanism**: object/state/guard/action/result를 Claim ID와 함께 설명한다.
5. **Branch table**: fast/slow/retry/failure를 한눈에 비교한다.
6. **Invariant and counterexample**: 무엇이 깨지면 어떤 observable failure가 되는지.
7. **Visual + text alternative**: 그림 없이도 같은 인과관계를 읽을 수 있게 한다.
8. **30초 recap**: 세 문장 이하.
9. **Retrieval prompt**: 답을 숨기고 한 개의 causal reconstruction을 요구한다.
10. **Transition**: 다음 장이 지금 남은 어느 질문을 해결하는지 밝힌다.

## 5. Four Central Behaviors: Exact Teaching Design

### 5.1 `fix-lookup-load`

#### Memory hook

> `VPID` 요청 → unique resident representation 확보 → 보호된 `PAGE_PTR` 반환

이 세 화살표는 기억 보조일 뿐이다. exact chapter에서는 hit, miss, concurrent miss, retry, I/O/validation failure를 분리한다.

#### Required causal links

- `VPID` lookup 결과와 “page를 안전하게 사용할 권리”를 분리한다. hit는 residency만 해결했을 뿐 latch grant를 자동 보장하지 않는다.
- miss에서 frame/BCB를 마련하는 일과 같은 `VPID`에 대한 duplicate load 방지를 연결한다.
- I/O 전/후에 어떤 identity/state가 provisional인지, 언제 다른 lookup에 보이는지 설명한다. “hash publication”을 말한다면 publication 전후의 invariant를 써야 한다.
- load failure/validation failure에서 reserved frame, identity marker, lock/waiter, error stack이 어떻게 정리되는지 설명한다.
- 반환 시점의 `PAGE_PTR`가 어느 lifetime에 묶이는지 Chapter 03과 Chapter 05로 연결한다.

#### Branch table required

| Branch | Before | Guard | Lock/latch | I/O | Mutation/publication | Result/next |
|---|---|---|---|---|---|---|
| hit fast path | resident candidate | exact predicates TBD by source Claim | TBD | none | accounting | protected pointer or fallback |
| normal hit | resident | compatible/incompatible | TBD | none | holder/fix accounting | return, wait, reject, retry |
| miss owner | absent | miss ownership won | TBD | read/initialize | validate + publish | return or cleanup |
| concurrent miss waiter | absent/in-flight | another loader owns miss | TBD | must not duplicate | wake then retry semantics | hit or repeated failure |
| resource/I/O failure | partial allocation | failure at named step | release in reverse order | failed/partial | undo provisional state | NULL/error |

TBD cell을 그대로 출판하면 안 된다. CUBRID source packet의 validated Claim으로 채워야 한다.

#### Retrieval task

“같은 non-resident `VPID`를 두 worker가 동시에 fix할 때, duplicate resident frame을 만들지 않으면서 둘 다 올바른 결과를 받는 전체 event chain을 설명하라.”

### 5.2 `latch-holder-unfix`

#### Memory hook

> requested mode/condition → grant 또는 queue/reject → holder/fix accounting → unfix/release/wakeup

#### Required causal links

- **latch mode**(read/write compatibility)와 **latch condition**(wait 허용 여부)을 서로 다른 축으로 먼저 가르친다.
- `fix count`, per-thread holder, latch ownership/compatibility가 같은 상태가 아님을 표로 분리한다.
- “unconditional”은 success 보장이 아니라 contention 때 wait path를 허용하는 조건이다. I/O, interrupt, timeout, validation failure까지 지워 버리는 말로 쓰면 안 된다.
- latch wait queue와 buffer-miss serialization을 같은 “wait”로 묶지 않는다. 기다리는 object와 wake 후 행동이 다를 수 있다.
- unfix가 raw pointer lifetime, fix accounting, latch release, waiter wakeup, replacement eligibility에 미치는 영향을 순서대로 설명한다.
- recursive/reentrant fix와 reader/writer fairness, promotion, ordered fix는 source-confirmed 범위만 설명한다. “deadlock이 없다”는 문장은 전체 ordering proof 없이 금지한다.

#### Three-column state ledger

| 관점 | 질문 | 출판 시 필요한 값 |
|---|---|---|
| BCB-global | 현재 latch state와 total fix/accounting은? | source-confirmed fields/transitions |
| Thread-local | 이 thread가 몇 번, 어떤 mode로 보유하는가? | holder lifecycle and nested behavior |
| Waiter | 무엇을 기다리며 wake 후 grant되는가, 재시도하는가? | queue condition, wake policy, error paths |

#### Counterexample

“buffer hit이면 빠르다”는 말에 incompatible write latch를 든다. I/O는 없어도 wait/timeout/conditional rejection은 가능하다. 이 한 예가 residency와 concurrency를 분리한다.

#### Retrieval task

“Worker A가 read fix한 page를 Worker B가 write+conditional과 write+unconditional로 각각 요청할 때, 가능한 결과와 bookkeeping 차이를 설명하고 A의 unfix 이후 무엇이 진행되는지 말하라.”

### 5.3 `caller-contracts`

#### Memory hook

> 목적/page kind → fetch/mode/condition/order 선택 → 사용/변경 → dirty/cleanup 균형

#### Required caller-family table

| Caller family | 대표 operation | page identity를 얻는 경로 | fetch semantics | latch mode/condition | multi-page ordering | dirty/LSA duty | all-exit cleanup |
|---|---|---|---|---|---|---|---|
| Heap read/scan | source packet에서 하나 선택 | Claim | Claim | Claim | N/A 또는 Claim | read-only | every success paired |
| Heap update | 하나 선택 | Claim | Claim | Claim | Claim | mutation rule | error unwind |
| B-tree search | 하나 선택 | Claim | Claim | Claim | parent/child rule | read-only | release order |
| B-tree update/split | 하나 선택 | Claim | Claim | Claim | conditional/ordered rule | mutation rule | partial failure |
| Recovery | 하나 선택 | Claim | Claim | Claim | recovery ordering | LSA/dirty/flush | missing/deallocated case |

“대표 reachable path”만 고르되 호출 전 setup과 모든 exit를 끝까지 추적한다. catalog식 호출 목록은 학습 목표가 아니다.

#### Required causal links

- page buffer Interface가 page type, fetch semantics, latch semantics를 전부 추론해 주지 않는다면 caller obligation임을 명시한다.
- `PGBUF_WATCHER`와 ordered fix를 소개하기 전에 왜 여러 page latch ordering 문제가 생기는지 concrete parent/child scenario를 보여 준다.
- ordered fix가 단순 sort helper인지, release/re-fix와 pointer revalidation까지 포함하는지 source Claim으로 분해한다.
- `goto exit`/cleanup macro를 “스타일”로 설명하지 말고 fix/unfix balance를 보존하는 correctness path로 설명한다.
- “caller cannot retry” 같은 물리 법칙형 문장을 피한다. retry는 가능한 설계일 수 있으나, rollback state와 Interface 비용이 달라지는 선택이다.

#### Retrieval task

“B-tree/heap caller 하나를 골라 `VPID`를 얻기 전부터 모든 exit가 fix balance를 회복할 때까지 trace하라. 각 단계에서 page-buffer 책임과 caller 책임을 분리하라.”

### 5.4 `dirty-wal-flush-replace`

#### Memory hook: three durability moments

1. **memory changed** — frame 내용이 바뀌었다.
2. **log durable enough** — data write에 필요한 WAL 조건을 만족했다.
3. **data page durable** — physical page write/sync 책임이 완료되었다.

이 셋을 한 사건처럼 말하지 않는다. `commit`, `unfix`, `dirty`, `flush`, `checkpoint`가 어느 순간을 보장하는지는 각각 source/runtime Evidence로 한정한다.

#### Required causal links

- write protection 아래 mutation과 dirty/page LSA accounting의 caller contract를 연결한다.
- unfix와 flush를 분리한다. unfix는 대여/동시성 lifetime의 종료이지 곧바로 durability의 증거가 아니다.
- victim selection과 dirty flush를 분리한다. policy가 후보를 고르는 것과 page를 안전하게 재사용 가능한 상태로 만드는 것은 다른 단계다.
- WAL-before-data ordering을 “로그를 먼저 쓴다”에서 끝내지 않는다. 어떤 page LSA를 기준으로 어떤 log flush gate를 통과해야 data write가 가능한지 설명한다.
- TDE, DWB, `file_io`를 화살표 하나로 뭉개지 않는다. 각각 transformation, torn-write protection, physical I/O seam 중 어떤 책임인지 Claim으로 분리한다.
- flush 도중 concurrent re-dirty 가능성이 있다면 snapshot/copy, flags, oldest LSA 복구 또는 second flush가 왜 필요한지 exact state table로 설명한다.
- checkpoint가 page buffer를 호출하는 방향과 page buffer가 log manager를 호출하는 방향을 양방향 seam으로 보여 준다.

#### Required state table

| State | DIRTY | FLUSHING | fix/latch | page LSA / oldest-unflushed marker | victim eligible? | legal next |
|---|---:|---:|---|---|---:|---|
| clean resident | Claim | Claim | variable | Claim | policy-dependent | fix, age, victim |
| modified | Claim | Claim | write-held/released | Claim | no | re-modify, flush request |
| flushing snapshot | Claim | Claim | source-specific | saved/current distinction | no | write path, re-dirty, failure |
| flush completed clean | Claim | Claim | source-specific | Claim | policy-dependent | reuse/retain |
| flush failed/re-dirtied | Claim | Claim | source-specific | restored/new marker | no | retry/degraded/error |

#### Retrieval task

“write-fixed page를 수정한 순간부터 그 frame을 다른 `VPID`에 재사용할 수 있는 순간까지, memory/log/data durability와 concurrency guard를 분리하여 설명하라.”

## 6. Glossary Ordering and First-use Rules

Glossary는 alphabetic order가 아니라 dependency order로 가르친다. 마지막 appendix에는 alphabetic index를 추가할 수 있다.

### Tier A — Physical and identity model (Chapter 02 first use)

1. **data page / disk page** — persistent page identity를 가진 storage 단위.
2. **buffer pool** — resident page frames를 관리하는 Module.
3. **buffer frame** — 한 시점에 특정 page의 bytes를 담는 volatile memory slot.
4. **page identity / `VPID`** — page를 찾는 stable logical/physical key; frame identity와 구분.
5. **resident** — 해당 identity의 bytes가 현재 buffer pool frame에 있음.

### Tier B — Representation and borrowed access (Chapter 03)

6. **`PGBUF_BCB` (Buffer Control Block)** — frame의 identity/state/accounting metadata. frame bytes 자체와 구분.
7. **`PAGE_PTR`** — caller에게 반환되는 page-content pointer; fix lifetime 밖에서 안전한 handle이 아님.
8. **fix / pin** — CUBRID `pgbuf_fix()`의 계약을 generic pin과 혼동하지 말 것. 정확한 residency+latch/accounting 묶음을 source로 정의.
9. **unfix** — caller의 한 fix obligation을 반환하는 operation. flush의 동의어가 아님.
10. **holder / fix count** — thread-local 보유 기록과 global/refcount 성격의 accounting을 분리 정의.

### Tier C — Concurrency (Chapter 05, 일부는 Chapter 02에서 seed)

11. **page latch** — in-memory page consistency를 위한 short-lived synchronization.
12. **transaction lock** — logical database resource의 isolation을 위한 transaction-scoped mechanism. latch와 구분.
13. **latch mode** — read/write compatibility 축.
14. **latch condition** — conflict 시 wait 가능 여부 축.
15. **waiter / wakeup / retry** — 무엇을 기다리고 wake 뒤 누가 grant/retry하는지 함께 정의.
16. **buffer lock / miss serialization** — 이름 때문에 transaction lock과 혼동하기 쉬우므로 목적과 protected invariant를 즉시 명시.
17. **promotion** — read-held access를 write로 바꾸는 protocol; 단순 enum 변경이 아님.
18. **ordered fix / `PGBUF_WATCHER` / rank / group** — multi-page acquisition 문제를 먼저 보여 준 뒤 정의.

### Tier D — Mutation and durability (Chapter 07)

19. **dirty** — resident bytes와 persistent copy가 다를 수 있음을 나타내는 state. “not durable” 전체와 동의어는 아님.
20. **LSA / page LSA / oldest unflushed LSA** — WAL ordering과 checkpoint 판단에 쓰이는 서로 다른 역할을 각각 정의.
21. **WAL (Write-Ahead Logging)** — data page write 전 필요한 log durability ordering.
22. **flush** — 어느 layer의 write인지 명확히 할 것; write call, DWB staging, volume write, sync를 뭉개지 않는다.
23. **checkpoint** — “모든 dirty page를 즉시 clean으로 만드는 사건” 같은 단순 정의를 피하고 exact contract를 source로 정의.
24. **DWB (Double Write Buffer)** — torn-page protection seam의 concrete owner/steps를 source Claim으로 정의.
25. **TDE (Transparent Data Encryption)** — encrypted data-page write transformation seam.

### Tier E — Policy and pressure (Chapter 07)

26. **replacement** — 어떤 resident frame을 재사용할지 결정하는 policy family.
27. **victim / victim candidate / eligibility** — chosen page, candidate set, hard eligibility predicate를 구분.
28. **LRU zone / private/shared list / quota** — 현재 revision의 실제 policy가 검증된 뒤에만 세부 정의.
29. **flush daemon / victim daemon / direct victim** — thread role, input queue, progress guarantee를 연결하여 정의.

### Tier F — Evidence and comparison (Chapters 09–12)

30. **Source-confirmed / Runtime-observed / Inferred / Unknown** — Claim confidence labels.
31. **equivalent / partial analogy / no equivalent** — 이름이 아니라 responsibility·Interface·invariant 축의 mapping.
32. **observer effect / alternative explanation / control** — Experiment 해석 용어.

## 7. Undefined-term and Language Audit

Main writer는 다음 단어를 first-use 정의 없이 쓰지 말아야 한다.

- `page`: disk page, resident frame, page bytes, BCB 중 무엇인지 수식한다.
- `lock`: transaction lock, BCB mutex, buffer/miss lock, page latch 중 하나를 말한다.
- `pin`: CUBRID fix와 동일하다고 가정하지 말고 이번 문맥의 의미를 적는다.
- `free`: memory free인지 unfix인지 frame reuse 가능 상태인지 구분한다.
- `write`: memory mutation, log append/flush, DWB write, data volume write, fsync 중 하나를 말한다.
- `flush`: 대상(log/data/DWB), completion boundary, sync 여부를 함께 쓴다.
- `timeout`: admission-time immediate rejection인지 elapsed timed wait인지 분리한다.
- `unconditional`: “반드시 성공”으로 풀지 않는다.
- `old/new page`: fetch mode의 exact creation/existence semantics를 먼저 정의한다.
- `published`: hash-visible인지, identity가 stable인지, caller-visible인지 source state를 적는다.
- `valid`: VPID range, page header/type, checksum/torn-page sanity, in-pool pointer 중 어떤 검증인지 적는다.
- `hot/cold/old`: policy predicate와 인간의 직관을 구분한다.
- `recovery`: crash redo/undo, restart initialization, recovery caller의 page fix 중 어느 단계인지 적는다.

권장 문장 형식:

> `[주체]`는 `[guard/보호 상태]`에서 `[state]`를 `[before]`에서 `[after]`로 바꾼다. 이 단계가 필요한 이유는 `[invariant]`이다. 실패하면 `[cleanup/retry/error]`가 일어난다. `[Claim IDs]`

금지에 가까운 문장:

> “`pgbuf_fix()`는 `pgbuf_search_hash_chain()`을 호출한다. [CUBRID-C001]”

개선 문장:

> “요청한 `VPID`가 이미 resident인지 판단하기 위해 hash lookup을 수행한다. hit이면 기존 BCB의 identity를 재검증한 뒤 latch/accounting 단계로 넘어가고, miss이면 같은 `VPID`의 중복 I/O를 막는 serialization 경로로 넘어간다. 각 branch의 lock ownership과 retry 지점은 다음 표와 같다. [검증된 Claim IDs]”

## 8. Misconception Register

| ID | 예상 오해 | 왜 생기는가 | 교정 장치 | mastery concept |
|---|---|---|---|---|
| M01 | `pgbuf_fix()`는 disk read 함수다 | 이름과 miss path만 봄 | hit인데 latch wait하는 counterexample | scope, lifecycle |
| M02 | buffer hit이면 절대 block하지 않는다 | residency와 latch compatibility 혼동 | V06 hit branch 뒤 V10 wait branch 연결 | concurrency |
| M03 | fix와 latch는 같은 state 하나다 | API가 두 책임을 묶어 반환 | BCB-global/thread-holder/waiter 3-column ledger | ownership, concurrency |
| M04 | `PAGE_PTR`는 stable handle이다 | C pointer가 평범해 보임 | unfix 전/후 lifetime timeline, use-after-unfix 반례 | ownership |
| M05 | unfix는 page를 disk에 쓴다 | release/free/flush 어휘 혼동 | three durability moments와 separate arrows | durability |
| M06 | dirty는 “아직 log도 안 써짐”을 뜻한다 | persistence 상태를 하나로 압축 | memory/log/data 3-state model | durability |
| M07 | WAL이면 data page가 이미 durable하다 | ordering과 completion 혼동 | WAL gate 이후 DWB/file I/O seam 표시 | durability |
| M08 | victim은 곧 evicted/reusable이다 | selection과 transition 혼동 | eligibility→selection→flush→reassign decision tree | policy |
| M09 | fix count 0이면 항상 victim 가능하다 | eligibility predicate 일부만 기억 | forbidden-state checklist | policy/concurrency |
| M10 | `unconditional`은 실패하지 않는다 | 자연어 의미 과장 | contention semantics와 other failures 분리 | concurrency/failure |
| M11 | wait가 있으면 deadlock detector가 해결한다 | transaction lock mental model 전이 | latch ordering proof와 timeout watchdog 구분 | concurrency |
| M12 | watchdog timeout은 deadlock 부재의 증거다 | 종료 상한을 safety proof로 오인 | “watchdog is not proof” box | concurrency/failure |
| M13 | caller는 fix 실패를 그냥 retry하면 된다 | partial operation state를 무시 | heap/B-tree/recovery unwind table | Interface/failure |
| M14 | caller는 절대로 retry할 수 없다 | 기존 contract를 물리 법칙으로 오인 | retry seam의 비용/rollback design 비교 | Interface/design |
| M15 | ordered fix는 VPID sort 한 번이다 | release/re-fix/pointer lifetime 숨김 | before/during/after pointer-validity timeline | caller/contracts |
| M16 | counter 이름이 실제 event 의미다 | observability label을 신뢰 | increment-site audit + alternative explanations | experiment |
| M17 | reproducible output이 policy correctness를 증명한다 | observation과 specification 혼동 | “mechanism not policy” evidence boundary | experiment |
| M18 | PG/InnoDB에 비슷한 함수명이 있으면 equivalent다 | name matching | responsibility/Interface/invariant axes | comparison |
| M19 | checkpoint는 모든 dirty page를 clean하게 만든다 | textbook simplification | exact checkpoint inputs/outputs and remaining-state matrix | recovery |
| M20 | crash recovery는 page buffer 내부 책임 하나다 | module boundary 무시 | log↔pgbuf 양방향 seam diagram | scope/recovery |

## 9. Visual Registry and Mermaid-to-Offline-SVG Pairing

### Pairing rule

Companion의 모든 Mermaid에는 semantic twin을 둔다.

- `notion/page-buffer-guide.md`: Mermaid source block + 바로 아래 `![한국어 대체 설명](assets/<visual-id>.svg)` fallback.
- Offline HTML Book: Mermaid/JavaScript 금지. 같은 node, edge, guard, failure branch, label을 가진 inline SVG 또는 semantic HTML/CSS diagram을 사용한다.
- 외부 SVG는 companion용 local asset이며 remote URL, font, script를 포함하지 않는다.
- 각 SVG의 `<title>`과 `<desc>`는 한국어로 작성한다. HTML에서는 그림 직후 `.diagram-text-alt` 문단 또는 list로 동일한 causal chain을 제공한다.
- Claim ID는 Mermaid 주석에만 숨기지 말고 caption/text alternative에도 노출한다.
- semantic parity audit: node count보다 **meaningful transitions**를 비교한다. Mermaid에 error edge가 있으면 SVG와 text alternative에도 반드시 있어야 한다.

| ID | Chapter | Companion Mermaid | HTML Book twin | Korean text alternative가 반드시 말할 것 |
|---|---:|---|---|---|
| V01 | 01 | `flowchart LR` reading path | inline SVG map | 기본 경로, 발표 경로, reimplementation 경로 |
| V02 | 02 | system boundary flowchart | inline SVG boundary | heap/B-tree/recovery caller와 log/DWB/fileio dependency seam 방향 |
| V03 | 02 | five-question horizontal strip | semantic HTML cards | identity, ownership, concurrency, durability, release 질문 |
| V04 | 03 | object graph | inline SVG | `VPID`와 BCB/frame/`PAGE_PTR` 관계, owner와 borrower |
| V05 | 03 | `timeline` 또는 flowchart | inline SVG timeline | initialize→resident/fixed→unfix→reuse에서 pointer validity |
| V06 | 04 | `sequenceDiagram` hit/miss | inline SVG swimlane | caller, hash/serialization, BCB/frame, I/O, validation, return; retry/error 포함 |
| V07 | 04 | `stateDiagram-v2` residency | HTML state table + SVG | absent/loading/resident/error/reassigned의 legal transitions |
| V08 | 05 | compatibility matrix (table preferred) | semantic table | read/write와 condition 두 축; grant/wait/reject |
| V09 | 05 | holder/accounting graph | inline SVG | thread holder, global BCB state, nested fixes의 관계 |
| V10 | 05 | wait/unfix sequence | inline SVG sequence | conflict→queue/reject→unfix→wakeup→grant/retry; timeout/interrupt branch |
| V11 | 06 | caller-family flowchart | HTML comparison table | heap/B-tree/recovery의 shared Interface와 다른 obligations |
| V12 | 06 | ordered acquisition sequence | inline SVG | wrong order 발견, release/re-fix 여부, pointer revalidation, cleanup |
| V13 | 07 | three durability moments | inline SVG timeline | memory mutation, log durability gate, data-page completion이 별개임 |
| V14 | 07 | dirty flush `sequenceDiagram` | inline SVG swimlane | caller/BCB/log/TDE/DWB/fileio/daemon, WAL edge, error/re-dirty edge |
| V15 | 07 | replacement decision tree | semantic HTML decision table + SVG | fixed/dirty/flushing/policy predicates와 no-victim progress path |
| V16 | 08 | startup→steady→shutdown/restart | inline SVG timeline | allocation/daemon start, quiesce/flush/finalize, crash/reconstruction boundaries |
| V17 | 08 | crash/failure matrix | semantic table | failure point별 volatile/durable state, cleanup/retry/recovery |
| V18 | 09 | evidence funnel | inline SVG | source fact, runtime observation, inference, unknown의 승격 금지 |
| V19 | 10 | three-database swimlane | inline SVG | same scenario의 responsibility 위치와 split seams |
| V20 | 11 | implementation dependency DAG | inline SVG | Interface/data model→single-thread→concurrency→durability→policy→observability |
| V21 | 11 | conformance pyramid | CSS/HTML layers | state invariant, branch, concurrent, crash, performance tests |
| V22 | 12 | mastery/evidence map | semantic table + SVG | chapters↔Claims↔Experiments↔Quizzes↔eight concepts |

### Visual anti-patterns

- 17,000-line file의 call graph를 한 장에 그리지 않는다. central behavior별로 “branch가 바뀌는 함수”만 남긴다.
- function 이름만 잇고 state mutation을 안 쓰는 그림은 call index일 뿐 mechanism 설명이 아니다.
- happy path만 그린 sequence는 incomplete하다. 적어도 retry와 one failure edge가 있어야 한다.
- latch, mutex, transaction lock을 모두 자물쇠 아이콘 하나로 표현하지 않는다.
- dirty와 durable을 같은 색의 boolean으로 표시하지 않는다. memory/log/data 세 축을 둔다.
- PG/CUBRID/MySQL 이름을 1:1 화살표로 잇지 않는다. responsibility flow와 analogy class를 함께 표시한다.

## 10. Presenter Narrative (50–60 minutes)

### 0–4 min — Opening paradox

화면에는 한 줄만 둔다.

```c
PAGE_PTR page = pgbuf_fix (...);
```

질문: “이 한 줄이 성공하기 전에 engine은 무엇을 증명해야 합니까?”

예상 답을 수집한 뒤 다섯 질문(Identity, Ownership, Concurrency, Durability, Release)을 제시한다. 처음부터 긴 call graph를 보여 주지 않는다.

### 4–10 min — One page, three representations

V04로 `VPID`, BCB, frame, `PAGE_PTR`를 분리한다. 발표자가 강조할 문장:

> `VPID`는 찾는 대상의 identity이고, frame은 현재 bytes가 놓인 자리이며, BCB는 그 자리를 안전하게 공유·재사용하기 위한 상태이고, `PAGE_PTR`는 fix 기간에만 유효한 borrowed pointer다.

“parking spot” analogy를 쓸 수 있으나 즉시 한계를 말한다: 실제 BCB는 parking 표지판보다 훨씬 많은 concurrency/durability state를 가지며, page copy와 frame identity를 혼동시키기 쉽다.

### 10–20 min — `pgbuf_fix()` hit/miss reconstruction

V06을 애니메이션 대신 단계별 static panels로 보여 준다.

1. hit을 먼저 보여 준다.
2. “hit이면 끝인가?” 질문 뒤 latch/accounting branch를 연다.
3. miss owner와 concurrent miss waiter를 나란히 보여 준다.
4. I/O/validation failure에서 cleanup 화살표를 반드시 보여 준다.

발표 중 청중 질문: “same VPID duplicate frame을 막는 exact invariant와 serialization point는?” 답은 검증된 Claim과 state table을 가리킨다.

### 20–30 min — Latch and unfix

V08, V09, V10 순서다. 먼저 mode/condition을 분리하고, 다음에 holder/fix accounting, 마지막에 wait/unfix wakeup을 붙인다.

세 문장 teach-back을 청중에게 요구한다.

> 무엇을 요청했는가 → conflict이면 어떤 branch인가 → unfix 뒤 누가 무엇을 다시 판단하는가

“buffer hit인데도 300초 걸릴 수 있는가?” 같은 질문으로 I/O와 contention을 분리한다. exact timeout 값은 Claim이 확인한 경우만 말한다.

### 30–37 min — Callers make correctness

V11과 V12를 쓴다. heap read, B-tree multi-page path, recovery path를 같은 Interface column으로 맞춘다. 발표 핵심:

> Page buffer가 복잡성을 숨기지만, page type, access intent, ordering, dirty marking, all-exit cleanup까지 모두 자동으로 알아내는 것은 아니다.

여기서 “왜 caller가 그냥 retry하지 않나?”를 토론한다. 기존 동작을 물리 법칙으로 방어하지 말고 partial operation state와 Interface design 비용을 제시한다.

### 37–47 min — Dirty is not durable

V13으로 세 durability moment를 먼저 고정한다. 그 뒤 V14/V15로 WAL, flush, DWB/TDE/fileio, victim/reuse를 연결한다.

발표 중 두 번 멈춘다.

1. dirty 후 unfix: “지금 무엇이 durable합니까?”
2. WAL gate 후 data write 전: “crash하면 무엇으로 복구 가능합니까?”

답은 source/experiment가 보장하는 boundary만 말한다.

### 47–52 min — Comparison without false equivalence

V19를 같은 scenario, 같은 axes로 보여 준다. 각 cell은 `equivalent`, `partial analogy`, `no equivalent` 중 하나와 이유를 가진다. 함수명 비교를 하지 않는다.

### 52–56 min — Experiments and epistemic limits

V18과 Experiment 1–4를 연결한다. 한 counter를 예로 들어 “이름이 아니라 increment site가 oracle 의미를 정한다”를 말한다. 각 실험마다 direct observation 두 개와 not-proven 두 개를 요구한다.

### 56–60 min — Reimplementation and hostile handoff

V20/V21로 구현 order와 conformance tests를 보여 준다. 마지막 질문:

> “Source를 지금 닫는다면, duplicate residency, use-after-unfix, latch-order deadlock, WAL violation, lost re-dirty를 각각 어떤 invariant와 test로 막겠습니까?”

질문 은행은 발표 뒤 Q&A용이며, live mastery grill에서는 답을 먼저 보여 주지 않는다.

## 11. Presenter Notes Template

Companion에서 각 큰 절 끝에 다음 callout을 둔다.

```markdown
> [!speaker] 발표자 노트
> - 한 문장 요점:
> - 먼저 물을 prediction 질문:
> - 그림에서 손으로 따라갈 edge:
> - 반드시 말할 failure branch:
> - 피할 표현/analogy:
> - 근거 Claim/Experiment:
> - 다음 절로 넘기는 문장:
```

`[!speaker]`가 renderer에서 지원되지 않으면 blockquote로도 의미가 남아야 한다. 핵심 설명을 speaker note에만 숨기지 않는다.

발표자 노트의 Claim은 본문과 동일한 evidence를 써야 한다. “팀 내부에서 다 아는 사실”이라는 이유로 source-free guarantee를 추가하면 안 된다.

## 12. Adversarial Teammate Question Bank

아래 질문은 어려운 Q&A 후보이다. companion의 질문 절에는 **질문만** 먼저 둔다. 별도 presenter appendix에는 “강한 답이 포함할 요소”를 둘 수 있다. Live Grill은 이 답 요소를 사용자 응답 전에 노출하지 않는다.

### Responsibility, scope, Interface, seams

1. `pgbuf_fix()`가 residency, pin/accounting, latch를 한 Interface에 묶는 이점과 비용은 무엇인가?
   - 강한 답: caller simplicity, hidden policy, error ambiguity, alternative seam을 함께 말한다.
2. page buffer와 file I/O, log manager, DWB 사이의 책임 경계를 어디에 두었으며, 그 경계가 깨지면 어떤 invariant가 사라지는가?
3. page type/fetch semantics를 caller가 잘못 넘겼을 때 page buffer가 검출할 수 있는 오류와 검출할 수 없는 오류는 무엇인가?
4. “모든 `pgbuf_fix()` caller를 catalog하지 않았다”면 coverage가 완전하다고 어떻게 주장할 수 있는가?
   - 강한 답: semantic caller families, representative reachable paths, negative search limits.

### Ownership and lifetime

5. 같은 `VPID`가 한 frame에서 다른 frame으로 이동할 수 있는데 `PAGE_PTR`의 안전성을 무엇이 보장하는가?
6. BCB와 frame을 분리한 이유는 무엇이며 어느 쪽 identity가 언제 바뀌는가?
7. nested fix가 가능하다면 한 번의 unfix로 충분한지 어떻게 판단하는가?
8. ordered re-fix가 일어나는 동안 이전 `PAGE_PTR`를 계속 써도 되는가? caller는 무엇을 다시 검증해야 하는가?

### Lifecycle and state transitions

9. 두 thread가 같은 non-resident `VPID`를 동시에 요청할 때 duplicate read와 duplicate frame을 각각 무엇이 막는가?
10. load가 끝났지만 hash publication 직전에 I/O validation이 실패하면 어떤 provisional state를 누가 정리하는가?
11. hit path가 miss path보다 항상 간단한가? latch incompatibility와 holder allocation failure를 포함해 반박하라.
12. `pgbuf_unfix()` 직후 page가 즉시 다른 `VPID`로 재사용될 수 있는가? 필요한 모든 guard를 말하라.

### Concurrency and forbidden interleavings

13. page latch와 transaction lock의 deadlock domain이 겹칠 수 있는데 어느 subsystem이 cycle을 검출하는가?
14. conditional request 실패와 timed wait expiration은 caller에게 같은 실패로 보여도 같은 event인가?
15. waiter wakeup 때 latch를 직접 양도하는가, 다시 경쟁시키는가? 그 선택이 fairness와 thundering herd에 어떤 영향을 주는가?
16. recursive fix가 writer starvation을 만들 수 있는가? 현재 정책과 proof gap을 구분하라.
17. ordered fix가 모든 latch deadlock을 없앤다고 말할 수 있는가? 적용되지 않는 caller와 dynamic order를 어떻게 audit했는가?
18. watchdog이 있다면 deadlock safety proof가 불필요한가?

### Durability, recovery, failure

19. dirty bit, current page LSA, oldest unflushed LSA가 서로 다른 질문에 답하는 이유는 무엇인가?
20. dirty page를 flush하기 전에 WAL을 force했는데 data write가 실패하면 어떤 state를 복구해야 retry가 가능한가?
21. flush copy를 만든 뒤 caller가 page를 다시 dirty로 만들면 첫 flush 성공이 새 변경까지 durable하게 만드는가?
22. DWB가 있으면 WAL ordering을 생략해도 되는가? 두 mechanism이 막는 failure class를 분리하라.
23. TDE encryption이 실패한 시점에 FLUSHING/DIRTY accounting이 어떤 상태여야 하는가?
24. checkpoint가 반환하면 어떤 page가 여전히 dirty일 수 있으며 restart redo boundary는 어떻게 정해지는가?
25. temp page와 permanent page의 LSA/WAL contract가 다르다면 generic flush path는 어디서 분기해야 하는가?

### Policy and performance

26. fix count가 0인 clean page를 무조건 victim으로 고르면 안 되는 이유는 무엇인가?
27. dirty ratio가 높을 때 더 공격적으로 flush하면 latency와 write amplification이 어떻게 바뀌는가?
28. private/shared replacement state가 있다면 workload isolation과 global efficiency 사이 trade-off는 무엇인가?
29. 모든 candidate가 dirty 또는 fixed일 때 progress guarantee는 무엇이며, 언제 명시적 failure가 허용되는가?
30. lock-free fast path의 평균 속도가 좋다는 측정이 correctness를 어떻게 검증하지 못하는가?

### Experiment interpretation

31. `Num_data_page_flushed` 같은 counter 이름만 보고 checkpoint flush를 셌다고 결론 내리면 왜 위험한가?
32. SQL experiment가 physical page write를 관찰했다고 주장하려면 어떤 counter increment site와 daemon visibility를 확인해야 하는가?
33. 반복 3회의 동일 output은 scheduler-dependent concurrency invariant를 증명하는가?
34. before/after crash가 사라졌다면 수정된 wait policy가 올바르다고 결론 내릴 수 있는가?
35. Experiment가 관찰한 build/config/input 바깥으로 Claim을 일반화할 때 필요한 Evidence는 무엇인가?

### PostgreSQL/MySQL comparison

36. PostgreSQL `PinBuffer`/content lock과 CUBRID fix/latch를 한 쌍으로 equivalent라 부를 수 있는가? Interface 축별로 답하라.
37. InnoDB buffer-fix/mutex/latch/mini-transaction 책임이 CUBRID의 한 call에 어떻게 나뉘는가?
38. 세 DB의 dirty flush가 모두 WAL 계열 ordering을 지켜도 replacement와 checkpoint policy가 equivalent가 아닌 이유는 무엇인가?
39. 같은 scenario에서 responsibility가 다른 layer에 있으면 “no equivalent”인가 “partial analogy”인가? 판정 기준을 적용하라.

### Reimplementation capstone

40. hash, latch, holder, replacement, WAL을 한 번에 구현하지 않고도 첫 executable tracer bullet을 어떻게 만들 것인가?
41. duplicate residency가 절대 생기지 않음을 어떤 concurrent conformance test로 입증할 것인가?
42. 모든 success fix에 대응하는 unfix가 있음을 runtime에서 어떻게 관찰하거나 assert할 것인가?
43. crash injection 지점 다섯 개를 고르고 각 지점의 expected restart state를 말하라.
44. 성능 parity를 scope에서 제외하면서도 performance-relevant policy를 재구현 가능하다고 어떻게 설명할 것인가?

## 13. Eight Mastery Concepts Mapping

아래 stable concept ID를 `grill/mastery.json`과 teaching map에서 일관되게 쓴다.

| Mastery concept ID | 핵심 장/anchor | Central behavior | Visuals | Quiz/Experiment | Mastery evidence |
|---|---|---|---|---|---|
| `scope-interface-seams` | Ch02, Ch06 `#caller-contracts` | all, 특히 caller-contracts | V02, V11 | quiz-3 / experiment-3 | caller와 Module 책임을 pre/postcondition·error·seam까지 분리 설명 |
| `data-ownership-lifetime` | Ch03, Ch04 `#fix-lookup-load` | fix-lookup-load | V04, V05, V07 | quiz-1 / experiment-1 | `VPID`/BCB/frame/`PAGE_PTR`/holder의 owner와 reclamation을 설명 |
| `lifecycle-state-machines` | Ch04, Ch05 | fix-lookup-load, latch-holder-unfix | V07, V10, V16 | quiz-1, quiz-2 | hit/miss/wait/retry/failure/unfix transitions를 guards와 함께 재구성 |
| `concurrency` | Ch05, Ch06 | latch-holder-unfix, caller-contracts | V08–V12 | quiz-2, quiz-3 / experiment-2 | protected state, order, wait/wakeup, forbidden interleaving, proof gap을 설명 |
| `durability-recovery-failures` | Ch07, Ch08 | dirty-wal-flush-replace, caller-contracts | V13, V14, V16, V17 | quiz-4 / experiment-4 | memory/log/data moments와 flush/re-dirty/crash state를 구분 |
| `policy-performance` | Ch07, Ch09 | dirty-wal-flush-replace, fix-lookup-load | V15, V18 | quiz-4, quiz-1 / experiments 1,4 | victim/flush policy의 costs, pathologies, observability limits를 설명 |
| `experiment-interpretation` | Ch09 | all | V18 | experiments 1–4, quizzes 1–4 | observation, interpretation, alternatives, not-proven을 분리 |
| `cross-database-non-equivalence` | Ch10 | all | V19 | quiz-4 또는 별도 comparison section | same axes로 equivalent/partial/no-equivalent를 Evidence와 함께 판정 |

### Live Grill progression

1. `scope-interface-seams`: “`pgbuf_fix()`가 숨기는 것과 숨기지 않는 caller 의무는?”
2. `data-ownership-lifetime`: 하나의 `VPID`가 `PAGE_PTR`가 되었다가 무효화되는 object story.
3. `lifecycle-state-machines`: concurrent miss 또는 latch wait의 full reconstruction.
4. `concurrency`: forbidden interleaving 하나와 방어 rule, 그리고 남은 proof gap.
5. `durability-recovery-failures`: dirty→WAL→data write→re-dirty/crash chain.
6. `policy-performance`: victim/flush policy change의 correctness와 performance trade-off.
7. `experiment-interpretation`: 실제 Experiment output에서 direct observation과 alternative explanation 구분.
8. `cross-database-non-equivalence`: 같은 scenario를 CUBRID/PG/InnoDB responsibility lanes로 teach-back.
9. `capstone`: 10분 end-to-end 설명. 모든 concept가 `MASTERED`일 때만 묻는다.

한 concept에서 약한 답이 나오면 같은 concept의 더 작은 causal question을 묻는다. 세 번째 실패는 `RETEACH`이며 관련 chapter anchor와 Quiz를 지정한다. 한 user turn에 질문은 정확히 하나만 둔다.

## 14. Missing Causal Links to Audit Before Publication

다음 질문 중 하나라도 Book prose가 source를 다시 열라고 요구하면 readiness를 선언할 수 없다.

### Lookup/load

- same-`VPID` miss owner가 정해지는 exact serialization object와 lock ordering은?
- wakeup된 miss waiter는 무엇을 신뢰하고 어디서 retry하는가?
- frame/BCB claim 뒤 I/O 또는 validation failure가 나면 hash/identity/replacement state는 어떻게 원복되는가?
- fast path에서 holder/accounting allocation 실패 같은 “불가능하다고 가정한” branch의 실제 release-build behavior는?

### Latch/unfix

- latch state와 total fix count를 한 atomic word가 담는지, separate fields인지, 각 전이가 어떤 memory ordering을 요구하는가?
- recursive fix, promotion, conditional rejection, timeout, interrupt가 holder ledger를 어떻게 바꾸는가?
- unfix가 waiter가 있을 때와 없을 때 replacement accounting을 다르게 하는가? 그렇다면 why와 performance effect는?
- latch acquisition order는 Module이 보장하는가 caller가 보장하는가? 예외 path는?

### Caller contracts

- heap/B-tree/recovery 대표 path의 exact all-exit cleanup이 완전한가?
- `FREE`/`DONT_FREE` 식 parameter가 unfix까지 수행하는 API가 있다면 naming trap을 first use에서 경고했는가?
- watcher가 release/re-fix를 숨길 때 caller-visible pointer invalidation을 어떻게 전달하는가?
- conditional fix 실패가 expected contention인지 error인지 caller family마다 어떻게 다른가?

### Dirty/flush/replacement

- dirty set과 page LSA update 순서가 모든 caller family에서 같은가? 예외(temp/recovery/new page)는?
- WAL gate가 어떤 LSA를 보고, log already durable 판단을 어떻게 하며, failure 때 saved state를 어떻게 복구하는가?
- flush가 page copy를 만든 뒤 mutex/latch를 놓는가? 그 사이 re-dirty를 어떻게 구별하는가?
- DWB slot unavailable/destruction, encryption error, physical write error 각각에서 flags/waiters/oldest LSA가 어떻게 끝나는가?
- checkpoint flush, victim flush, explicit flush가 같은 funnel을 쓰더라도 completion/oracle이 어떻게 다른가?
- victim eligibility, candidate policy, dirty flushing, direct victim handoff 사이 exact happens-before는?

### Lifecycle and recovery

- initialize가 hash/BCB/frame/replacement/daemon을 어떤 order로 준비하며 partial init failure를 어떻게 정리하는가?
- shutdown이 새 fix를 막는 시점, daemon quiesce, dirty handling, memory reclamation order는?
- crash 뒤 volatile hash/holder/replacement state는 무엇으로 재구성되고 persistent page/log state는 어느 Module이 맡는가?

## 15. Misleading Analogies and Safe Use

| Analogy | 쓸 수 있는 좁은 목적 | 즉시 밝혀야 할 한계 |
|---|---|---|
| 도서관 책 대출 | fix/unfix의 borrowed lifetime | latch mode, nested fixes, durability, frame reuse를 설명하지 못함 |
| 주차장/주차면 | `VPID`와 reusable frame 구분 | BCB metadata와 concurrent miss serialization을 과도하게 단순화 |
| 문 잠금 | read/write compatibility의 첫 직관 | transaction lock, mutex, latch, buffer lock을 한 종류로 오해시킴 |
| 더러운 접시 | dirty가 “memory copy changed”라는 직관 | log durability, re-dirty, partial write, checkpoint를 설명하지 못함 |
| 대기표 | waiter queue와 wakeup | wake가 grant인지 retry인지, fairness/timeout을 숨김 |
| 일기장 먼저 쓰기 | WAL-before-data ordering | LSA boundary, log flush completion, DWB/torn write를 숨김 |

analogy는 30초를 넘기지 않는다. exact object/transition 이름을 같은 화면에 병기하고, 다음 문단에서 반드시 버린다.

## 16. Citation-is-not-explanation Audit

Draft audit 때 아래 패턴을 검색한다.

- Claim ID 또는 source link 앞 문장이 function call 나열뿐이다.
- diagram edge가 state mutation 없이 함수 이름만 가진다.
- “~을 보장한다” 뒤에 guard, owner, failure가 없다.
- concurrency paragraph가 mutex/latch 이름은 나열하지만 protected state와 order를 쓰지 않는다.
- WAL paragraph가 “log first”만 말하고 page LSA, log durable boundary, data write를 연결하지 않는다.
- error paragraph가 return code만 적고 partial state cleanup을 쓰지 않는다.
- comparison table이 function names만 나란히 놓고 analogy class의 이유가 없다.
- Experiment 결과가 counter 숫자만 보여 주고 increment-site meaning/alternative explanation을 쓰지 않는다.

각 substantive paragraph는 다음 중 최소 세 가지를 담아야 한다.

> **because**(왜) / **before**(이전 상태) / **guard**(분기 조건) / **action**(무엇을 바꿈) / **after**(다음 상태) / **failure**(실패 정리) / **evidence limit**(어디까지 증명)

## 17. Companion-specific Notion-like Design

`notion/page-buffer-guide.md`는 HTML Book의 축약본이 아니라 발표와 회상을 위한 second representation이어야 한다.

권장 구성:

1. **Hero summary** — 한 문장 topic, scope badges, revisions, readiness/unknowns.
2. **Toggle-like TOC** — Markdown details를 쓸 수 있으나 central explanation은 접지 않는다.
3. **Key takeaway callouts** — `[!tip]`, `[!warning]`, `[!evidence]`, `[!speaker]`; renderer가 모르면 blockquote로 읽힘.
4. **One scenario ribbon** — 매 section에 현재 story position 표시.
5. **Mermaid + SVG fallback pair** — V01–V22 pairing rule.
6. **Comparison tables** — horizontal overflow를 피하도록 wide table은 두 개로 분할.
7. **Presenter notes** — 각 central behavior 뒤.
8. **Question bank** — 질문 먼저, presenter crib appendix는 별도.
9. **Experiment cards** — Question/Hypothesis/Observation/Interpretation/Alternatives/Not-proven/Cleanup.
10. **Reimplementation checklist** — state machine, interface, conformance oracle를 checkbox로 제공.

Inline SVG는 raw Markdown renderer에서 제거될 수 있다. 따라서 companion에는 external local SVG image를 canonical fallback으로 두고, inline SVG는 HTML Book에서 canonical로 둔다. 사용자가 실제 Notion에 import할 경우 Mermaid code block이 render되지 않을 수 있으므로 SVG가 정보 손실을 막는다.

## 18. Quiz and Experiment Teaching Alignment

각 central behavior는 Quiz 하나 이상을 가지되 trivia가 아니라 prediction과 causal explanation을 요구한다.

| Quiz | Prediction | Runtime observation | Explain | Variation | Does not prove |
|---|---|---|---|---|---|
| quiz-1 / fix-lookup-load | cold/warm workload에서 read/fix-related observations가 어떻게 달라질까 | experiment-1의 validated oracle | hit/miss와 I/O/caching cause | warm/cold, unique page count | exact internal branch without source/counter binding |
| quiz-2 / latch-holder-unfix | concurrent access에서 허용 invariant는 무엇인가 | experiment-2 | mode/condition, wait/retry, balance | read/read vs read/write, scheduler-independent invariant | one exact schedule, deadlock absence |
| quiz-3 / caller-contracts | representative heap/B-tree operation이 어떤 page-access family를 발화할까 | experiment-3 | caller choice와 cleanup | read vs update or normal vs failure-safe variation | all callers, undocumented intent |
| quiz-4 / dirty-wal-flush-replace | dirty, log, data-write counters/observations가 어느 순서로 변할까 | experiment-4 | three durability moments, flush/replacement | checkpoint/pressure/negative control | universal crash safety or PG/MySQL runtime behavior |

Answer는 output을 재진술하지 말고 causal mechanism, common wrong answers, alternative explanations, Claim/chapter links, not-proven을 포함한다.

## 19. Readiness-oriented Final Teach-back Rubric

최종 teach-back은 8–10분이고 다음 순서를 지켜야 한다.

1. shared scenario와 Module boundary를 30초 안에 제시한다.
2. `VPID`에서 `PAGE_PTR`까지 object ownership을 설명한다.
3. hit/miss/concurrent miss와 one failure branch를 설명한다.
4. latch mode/condition, holder/fix, wait/unfix를 설명한다.
5. heap/B-tree/recovery caller obligation 하나씩을 대조한다.
6. mutation→dirty/LSA→WAL→TDE/DWB/fileio→clean/reuse를 설명한다.
7. forbidden interleaving 두 개와 방어 rule을 말한다.
8. Experiment 하나의 observation과 limitation을 말한다.
9. PostgreSQL/MySQL mapping 하나씩을 analogy class와 함께 설명한다.
10. source 없이 구현할 order와 conformance tests를 제시한다.

평가자는 정확한 function 이름의 개수보다 causal completeness를 본다. “모른다”는 답은 허용하지만 central unknown을 숨긴 채 `MASTERED`로 처리하지 않는다.

## 20. Final Recommendations to the Main Writer

1. Chapter 02–07을 먼저 완성하고 나머지 coverage를 연결한다. central spine이 흔들린 상태에서 비교/quiz를 먼저 쓰지 않는다.
2. 모든 chapter에서 shared scenario의 현재 위치를 반복한다.
3. `page`, `lock`, `write`, `flush`, `free`, `timeout`은 반드시 수식어와 함께 쓴다.
4. 네 central behavior마다 branch table, failure path, reconstruction sheet, retrieval prompt를 둔다.
5. Mermaid는 companion 전용이다. 동일 의미의 offline SVG/HTML table과 Korean text alternative를 Book에 반드시 둔다.
6. secondary context의 줄번호·결함·quirk를 현재 Report Run Claim으로 복사하지 않는다. source tracer가 current revision에서 재검증한 것만 쓴다.
7. 발표 질문과 live grill 질문을 분리한다. Live Grill은 user answer 전에 정답을 노출하지 않고 정확히 한 질문씩 진행한다.
8. “counter가 올랐다”, “crash가 사라졌다”, “watchdog이 있다”를 correctness proof로 과장하지 않는다.
9. comparison은 same scenario/same axes/responsibility flow를 기준으로 쓰고 함수명 symmetry를 피한다.
10. final readiness 문장 직전에 source-closed reconstruction audit를 한다. Interface, ownership, all branches, ordering, recovery, conformance oracle 중 “source를 다시 읽어야 함”이 하나라도 있으면 `READY WITHIN DECLARED SCOPE`를 선언하지 않는다.
