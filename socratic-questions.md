# 마지막 세션의 소크라테스식 질문 경로

이 문서는 발표자가 참가자의 전제와 추론을 살펴보기 위한 작성자용 질문 경로입니다. [최종 한글 대본](./my-presentation-script-session-3.html#route)을 독립적으로 읽은 뒤 작성했습니다. 진행 범위와 소스 경로는 [세션 준비 계획](./docs/final-session-preparation.md?v)이 정합니다.

- 작성자: Codex 질문 작성 에이전트. 사람의 한국어 검토나 실제 참가자 토론을 수행한 기록은 아닙니다.
- 검토한 대본 커밋: `ecf60bb3d31cba309f9730676523e7a9463b0c62`.
- 검토한 HTML의 SHA-256: `c2bf881dbdbd1891efbfe2c825b2a7b7837e2d7cda057efab0aac97f49ed4ef3`.
- 기술 기준: CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, PostgreSQL `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc`.

Q01–Q24는 이 문서 안에서만 사용하는 질문 번호입니다. 각 사례는 대본의 기존 문답 이후에 적용할 수 있도록 새로 구성한 추론 사례이며, 실제 실행 관찰이나 성능 측정이 아닙니다. 각 질문의 시작 상태는 서로 독립적입니다. 별도 사건이 적혀 있지 않으면 동시 변경을 추가하지 않습니다. LSA와 LSN의 숫자는 순서만 나타내는 설명용 값입니다.

주질문을 하나씩 제시하고 참가자의 설명을 들은 뒤, 필요할 때만 선택 후속 질문을 사용합니다. 모든 질문을 한 번에 묻거나 참가자의 답을 정해진 문장으로 맞출 필요는 없습니다. 이 문서에는 모범 답이나 진행을 강제하는 평가 기준을 두지 않습니다.

## 대본을 따라가는 순서

| 대본 구간 | 질문 | 살펴볼 추론 |
| --- | --- | --- |
| [앞선 두 세션 연결](./my-presentation-script-session-3.html#opening) | Q01 | 재사용 승인 규칙의 전제 |
| [한 페이지, 두 세대](./my-presentation-script-session-3.html#generation) | Q02–Q04 | 사본의 WAL 기준, 같은 값의 다른 변경 이력, 저장 경계 |
| [서로 다른 네 daemon](./my-presentation-script-session-3.html#daemons) | Q05–Q06 | 실행 알림과 boot gate, 종료 시 자원 수명 |
| [Page-flush](./my-presentation-script-session-3.html#page-flush) | Q07–Q08 | 같은 identity의 상태 변화, 호출과 제출 사이의 진행 |
| [Post-flush](./my-presentation-script-session-3.html#post-flush) | Q09–Q11 | 인계 실패, 정책 변화, 배정 후 재검사 |
| [Maintenance](./my-presentation-script-session-3.html#maintenance) | Q12–Q13 | 허용된 갱신 회차, 소스상 이상 징후와 운영 영향 |
| [Flush-control](./my-presentation-script-session-3.html#pacing) | Q14–Q15 | 예산 교체, 호출자별 대기 경로 |
| [PostgreSQL의 객체와 pin](./my-presentation-script-session-3.html#postgres-model) | Q16–Q17 | 중첩 pin의 기록, 인터페이스의 보호 책임 |
| [Clock sweep](./my-presentation-script-session-3.html#postgres-clock) | Q18 | 관찰한 후보와 원자적으로 확보한 후보 |
| [Access-strategy ring](./my-presentation-script-session-3.html#postgres-ring) | Q19–Q20 | 공유 buffer ID, strategy별 거절 조건 |
| [Writeback과 비교](./my-presentation-script-session-3.html#postgres-writeback) | Q21–Q22 | 현재 dirty 상태, writeback 주체의 목적 |
| [마지막 종합과 종료](./my-presentation-script-session-3.html#closing) | Q23–Q24 | 다음 관찰의 선택, 다른 인터페이스로의 전이 |

## Q01 · 재사용 승인 규칙

대본: [앞선 두 세션 연결](./my-presentation-script-session-3.html#opening).

**시작 전제:** 유지보수자가 마지막 unfix 직후 `fcnt == 0`이면 외부에 `reusable = true`를 알리는 변경을 제안했습니다. 이 알림을 받은 allocator는 다른 상태를 확인하지 않고 frame의 identity를 바꿉니다. 다른 기존 검사는 이 알림 경로에는 없습니다.

**주질문:** 이 승인 규칙을 검토할 수 있는 가장 작은 반례는 어떤 실행 순서일까요?

**선택 후속 질문:** 그 반례에서 사용을 끝내는 사건과 보존 의무를 끝내는 사건은 각각 무엇인가요?

## Q02 · 사본의 로그 기준

대본: [한 페이지, 두 세대](./my-presentation-script-session-3.html#generation).

**시작 전제:** 로그가 필요한 영구 페이지에서 안정된 사본 G와 그 페이지 LSA 120을 함께 확보했습니다. 이후 resident 페이지의 LSA는 180이 됐습니다. 지금 영속화된 WAL은 140까지입니다. 아직 G를 제출하지 않았습니다.

**주질문:** G의 제출에 필요한 WAL 순서를 판단할 때 세 LSA 중 무엇을 기준으로 삼아야 할까요?

**선택 후속 질문:** 같은 시점의 resident LSA를 기준으로 삼는 변경은 제출할 이미지와 로그 작업의 관계를 어떻게 바꾸나요?

## Q03 · 값이 다시 같아진 페이지

대본: [한 페이지, 두 세대](./my-presentation-script-session-3.html#generation).

**시작 전제:** G의 사본에는 값 40과 페이지 LSA 120이 들어 있습니다. G가 진행되는 동안 writer가 같은 필드를 41로 바꾼 뒤 다시 40으로 바꿨고, 두 변경을 기록해 현재 페이지 LSA는 180입니다. 현재 DIRTY는 설정돼 있습니다. 이제 G의 제출이 성공했습니다.

**주질문:** 값이 40으로 같다는 관찰은 현재 DIRTY를 정리할 근거로 어디까지 사용할 수 있을까요?

**선택 후속 질문:** 필요한 보존 작업을 설명하려면 필드 값 외에 어떤 이력을 함께 남겨야 하나요?

## Q04 · 완료 기록의 범위

대본: [한 페이지, 두 세대의 DWB 경계](./my-presentation-script-session-3.html#generation).

**시작 전제:** 구성한 로그에는 G의 DWB 인수 성공과 BCB의 FLUSHING 해제만 있습니다. 그 뒤 새 변경은 없습니다. Home volume의 write와 fsync, 재시작 결과는 기록하지 않았습니다.

**주질문:** 이 기록으로 작성할 수 있는 가장 강한 완료 주장은 무엇인가요?

**선택 후속 질문:** Home volume의 영속화까지 포함하는 주장으로 넓히려면 어떤 추가 증거가 필요한가요?

## Q05 · 실행 알림의 순서

대본: [네 daemon의 실행과 boot gate](./my-presentation-script-session-3.html#daemons).

**시작 전제:** Page-flush의 타이머 주기는 0입니다. Recovery 중 실행된 작업은 닫힌 boot gate를 보고 반환했습니다. 다음 대기에 들어가기 직전 waiter는 아직 RUNNING입니다. 이때 gate가 열리고 다른 thread가 wakeup을 호출한 뒤 daemon이 대기에 들어갑니다. 이후 신호는 아직 기록되지 않았습니다.

**주질문:** 이 기록에서 다음 작업 진입이 이어진다고 설명하려면 어떤 사건을 더 확인해야 할까요?

**선택 후속 질문:** 이 실행 순서에 유한한 타이머를 추가하면 다음 진입을 설명하는 근거가 어떻게 달라지나요?

## Q06 · 종료와 자원 수명

대본: [네 daemon의 시작과 종료](./my-presentation-script-session-3.html#daemons).

**시작 전제:** 종료 절차 변경안은 stop 표시 직후 BCB와 queue 저장 공간을 해제하고, 그다음 wake와 join을 수행합니다. Stop을 표시할 때 daemon이 작업 본문 안에 있는지는 확인하지 않습니다.

**주질문:** 이 자원 해제 시점이 안전하다고 승인하려면 어떤 사실을 증명해야 할까요?

**선택 후속 질문:** 작업 중인 daemon과 대기 중인 daemon에 같은 종료 절차를 적용할 때 검토할 사건은 어떻게 달라지나요?

## Q07 · Identity만 다시 보는 최적화

대본: [Page-flush의 후보 수집과 재검사](./my-presentation-script-session-3.html#page-flush).

**시작 전제:** 후보 수집 당시 P는 dirty, LRU3, `fcnt == 0`, FLUSHING 해제 상태입니다. List lock을 놓은 뒤 BCB를 잠글 때까지 VPID는 P로 유지됩니다. 변경안은 VPID 일치만 확인하고 나머지 수집 당시 상태를 그대로 사용합니다.

**주질문:** 이 최적화의 안전성을 검토할 반례를 어떤 중간 사건으로 구성할 수 있을까요?

**선택 후속 질문:** 그 사건을 놓치지 않는 재검사는 어느 보호 구간에서 수행해야 하나요?

## Q08 · 호출 이후의 진행

대본: [Page-flush의 실행 조건과 WAL](./my-presentation-script-session-3.html#page-flush).

**시작 전제:** Boot gate가 열린 서버에서 allocator가 기다리고 있습니다. SLEEPING 상태의 page-flush를 깨운 뒤 `pgbuf_flush_victim_candidates()` 진입을 한 번 기록했습니다. 선택하려는 사본에는 LSA 300까지의 변경이 있고 WAL은 250까지 영속화됐습니다. 추적 구간은 helper가 반환하기 전에 끝났으며, 그 구간의 페이지 제출 횟수는 0입니다.

**주질문:** 이 호출이 allocator의 진행에 기여하는지 판단하기 위해 다음으로 어느 주체의 어떤 사건을 추적하겠습니까?

**선택 후속 질문:** 이 기록만으로 page-flush가 할 일을 마쳤다고 보고하려면 무엇이 부족한가요?

## Q09 · Queue 인계 실패

대본: [Post-flush의 인계 조건](./my-presentation-script-session-3.html#post-flush).

**시작 전제:** Page-flush thread가 G를 성공적으로 제출했습니다. Post-flush daemon과 direct-victim 대기자는 모두 있지만 queue가 가득 차 포인터 삽입에 실패했습니다. G의 FLUSHING 상태와 flush 대기자는 아직 남아 있습니다.

**주질문:** 이 실행에서 G의 BCB 완료 처리를 책임지는 주체는 누구인가요?

**선택 후속 질문:** 같은 이미지를 checkpoint thread가 제출했다면 완료 처리 주체를 결정하는 근거는 어떻게 달라지나요?

## Q10 · 소비 전의 정책 변화

대본: [Post-flush의 현재 상태 검사](./my-presentation-script-session-3.html#post-flush).

**시작 전제:** Private LRU의 P가 G 제출을 마치고 queue에 들어갔습니다. 소비자가 실행될 때 P는 clean, LRU3이며, fix와 BCB에 연결된 page-latch 대기 thread가 없는 상태입니다. 해당 list의 크기는 80입니다. 그 사이 quota가 60에서 100으로 바뀌었고 allocator는 계속 기다립니다. 다른 배정 방해 flag는 없습니다.

**주질문:** 소비자가 P의 처리 결과를 결정할 때 새 quota는 어떤 판단에 참여하나요?

**선택 후속 질문:** 이 결과를 기록할 때 G의 완료 처리와 allocator의 frame 배정을 어떤 사건으로 구분하겠습니까?

## Q11 · Direct-victim 제안 이후

대본: [Post-flush와 allocator의 재검사](./my-presentation-script-session-3.html#post-flush).

**시작 전제:** 소비자가 clean 상태인 P의 BCB를 allocator B에게 direct victim으로 배정했습니다. B가 실제로 재사용하기 전에 reader A가 P를 정상적으로 fix했습니다. A의 fix는 아직 남아 있고 B는 이제 실행 기회를 얻었습니다.

**주질문:** B가 frame 재사용을 결정하기 위해 새로 확인해야 할 상태는 무엇인가요?

**선택 후속 질문:** A가 나중에 unfix한 사건만으로 B의 다음 성공을 설명하려면 어떤 추가 전제가 필요한가요?

## Q12 · 갱신 회차의 기록

대본: [Maintenance의 quota 갱신](./my-presentation-script-session-3.html#maintenance).

**시작 전제:** Epoch는 조건을 통과한 quota 갱신 회차를 나타냅니다. 초기 `adjust_age`는 8입니다. 서로 다른 여섯 차례의 호출 중 네 차례는 조기 반환했고, 두 차례만 갱신 본문에 진입해 끝까지 수행했습니다. 두 갱신 뒤에도 특정 private list의 quota 숫자는 이전과 같습니다.

**주질문:** 이 기록에서 마지막 갱신 회차를 어떻게 설명하겠습니까?

**선택 후속 질문:** Quota 숫자만 관찰한 기록에서는 이번 호출의 경로에 관해 어떤 정보가 빠지나요?

## Q13 · 소스상 이상 징후의 영향

대본: [Maintenance의 소스상 한계](./my-presentation-script-session-3.html#maintenance). 상태 기준: [불확실성 목록의 VS-20](./unresolved-or-version-sensitive-findings.md?v#b-current-pinned-revision-cleanup-and-proof-obligations).

**시작 전제:** Pinned source에서 maintenance 보조 반복문의 본문이 실행되지 않는 조건을 확인했습니다. 운영자가 낮은 활동량에서 allocator 지연을 보고했습니다. 같은 시간의 다른 direct-victim 공급자 실행과 배정 기록은 아직 없습니다.

**주질문:** 두 사실의 인과관계를 검토하는 관찰은 어떻게 설계하겠습니까?

**선택 후속 질문:** 보조 반복문이 실행되지 않는 상황에서도 allocator가 진행하는 실행은 어떤 증거를 남기면 반례로 사용할 수 있나요?

## Q14 · 새 Token 예산

대본: [Flush-control의 예산 갱신](./my-presentation-script-session-3.html#pacing).

**시작 전제:** Token 예산이 7로 갱신된 뒤 일부가 소비돼 3이 남았습니다. 다음 갱신은 새 예산을 5로 계산했습니다. 갱신 도중 token 소비는 없다고 가정합니다.

**주질문:** 갱신 직후 예산을 설명할 때 남은 3과 새로 계산한 5의 관계를 어떻게 해석해야 할까요?

**선택 후속 질문:** 예산 갱신 기록을 실제 write 양의 엄격한 상한으로 사용하려면 어떤 경로들을 추가로 설명해야 하나요?

## Q15 · 서로 다른 Caller의 대기

대본: [Flush-control의 호출자별 경계](./my-presentation-script-session-3.html#pacing).

**시작 전제:** 일반 writer A와 로그 critical section을 보유한 writer B가 각각 OS write에 성공한 뒤 token compensation 경로에 도달했습니다. 둘 다 token 부족을 만났습니다. Critical section 보유 상태는 이후에도 유지되며, 추가 갱신은 아직 없습니다.

**주질문:** 두 caller의 이후 진행을 비교할 때 어느 분기 조건을 판단 기준으로 삼아야 할까요?

**선택 후속 질문:** 이 차이를 포함해 속도 조절 기능의 역할을 어떤 계약으로 표현하면 좋을까요?

## Q16 · 중첩 Pin의 기록

대본: [PostgreSQL의 pin과 usage credit](./my-presentation-script-session-3.html#postgres-model).

**시작 전제:** 공유 descriptor D는 유효한 clean 페이지를 나타내며, 공유 refcount와 usage credit은 모두 0입니다. 기본 strategy를 사용합니다. Backend A가 D를 연속 세 번 pin한 상태에서 B가 D를 처음 pin합니다. 이후 A만 자신의 세 pin을 모두 반납합니다. Clock 방문이나 다른 변경은 없습니다.

**주질문:** 이 사건들의 순서에 따라 공유 refcount, A의 private refcount, usage credit을 어떻게 기록하겠습니까?

**선택 후속 질문:** 최종 공유 refcount만 보았을 때 복원할 수 없는 호출 이력은 무엇인가요?

## Q17 · 다른 인터페이스의 보호 책임

대본: [PostgreSQL의 pin과 content 보호](./my-presentation-script-session-3.html#postgres-model).

**시작 전제:** CUBRID READ fix를 사용하던 호출자를 PostgreSQL용 wrapper로 옮기는 설계입니다. Wrapper는 기존 identity의 buffer를 pin해 주소만 반환합니다. Caller는 반환 즉시 페이지 바이트를 읽습니다. 같은 페이지를 pin한 B가 content 변경을 위한 보호를 보유하고 있으며 변경 중입니다.

**주질문:** 이 wrapper가 caller의 읽기를 지원하려면 어떤 보호 책임을 인터페이스에 명시해야 할까요?

**선택 후속 질문:** 그 책임을 wrapper와 caller 중 누가 수행하게 할지 결정할 때 반환 계약을 어떻게 적겠습니까?

## Q18 · Clock 후보의 동시 변경

대본: [Clock sweep의 선택 경계](./my-presentation-script-session-3.html#postgres-clock).

**시작 전제:** Hand가 D의 credit을 1에서 0으로 낮추고 다음 descriptor로 갔습니다. 다시 D를 방문한 A는 refcount 0과 credit 0을 읽었습니다. A가 그 상태를 기대한 CAS로 자기 pin을 얻기 전에 B의 정상적인 첫 pin이 성공했고, B는 pin을 유지합니다. 다른 변화는 없습니다.

**주질문:** 이 순서에서 A가 D를 반환할 수 있는지를 결정하는 사건은 무엇인가요?

**선택 후속 질문:** 동시 변경이 없는 경우에도 credit을 0으로 낮춘 방문과 후보를 반환하는 방문을 하나로 합친 추적은 어떤 정책 차이를 만들까요?

## Q19 · 두 Ring의 같은 Buffer ID

대본: [Ring의 참조와 공유 frame](./my-presentation-script-session-3.html#postgres-ring).

**시작 전제:** 서로 다른 backend A와 B의 ring slot이 같은 공유 buffer ID F를 저장합니다. F는 처음에 R을 나타냈습니다. A가 필요한 보호 절차를 거쳐 F의 identity를 S로 바꾸고 pin을 반납했습니다. B의 ring 배열에는 변경이 없었으며, B는 이제 그 slot을 방문하려고 합니다. F는 clean, refcount 0, credit 1입니다.

**주질문:** B의 slot 값이 유지됐다는 기록으로 다음 방문의 페이지 identity에 대해 어디까지 설명할 수 있을까요?

**선택 후속 질문:** 이 소유 관계를 CUBRID private LRU의 소유 관계와 비교할 때 기준으로 삼을 객체는 무엇인가요?

## Q20 · Strategy를 바꾼 같은 후보

대본: [Strategy 종류](./my-presentation-script-session-3.html#postgres-ring) · [Bulk-read 종합 사례](./my-presentation-script-session-3.html#final-postgres).

**시작 전제:** 각각 독립된 세 실행에서 BULKREAD, BULKWRITE, VACUUM strategy의 ring으로 같은 조건의 후보를 선택했습니다. 후보는 `BM_PERMANENT`인 dirty 페이지이며, 필요한 content lock을 대기 없이 얻었습니다. 페이지 LSN까지 WAL flush가 필요합니다. 선택 전 refcount는 0, credit은 1이고 다른 backend의 개입은 없습니다.

**주질문:** 같은 후보의 이후 처리는 세 strategy에서 어떻게 달라질 수 있나요?

**선택 후속 질문:** 작은 공유 pool에서 ring의 실제 크기를 설명하려면 factory 기본값 외에 어느 계산과 caller 입력을 확인해야 하나요?

## Q21 · 다른 사용자가 떠난 뒤

대본: [PostgreSQL의 identity 제거 전 재검사](./my-presentation-script-session-3.html#postgres-writeback).

**시작 전제:** Backend A가 선택한 dirty victim을 flush한 뒤 자신의 pin을 유지합니다. 그 사이 B가 기존 identity를 pin하고, 필요한 content 보호 아래 새 변경을 만든 다음 보호와 pin을 모두 반납했습니다. A가 identity 제거를 검사할 때 공유 refcount는 1이고 현재 DIRTY는 설정돼 있습니다.

**주질문:** 공유 refcount가 다시 1이 됐다는 관찰은 A의 재사용 승인 근거로 어디까지 사용할 수 있을까요?

**선택 후속 질문:** A의 이전 write와 B의 이후 변경을 구분하는 관측 기록에는 어떤 순서 정보가 필요한가요?

## Q22 · Writeback 주체의 목적

대본: [PostgreSQL의 writeback 주체와 비교](./my-presentation-script-session-3.html#postgres-writeback).

**시작 전제:** 서로 다른 dirty 페이지 P와 Q가 있습니다. 둘 다 현재 pin은 없습니다. P의 credit은 3이고 이번 checkpoint가 처리해야 할 대상입니다. Q의 credit은 0입니다. 운영 변경안은 background writer가 돌고 있다는 이유로 이번 checkpoint의 페이지 처리를 생략하려고 합니다.

**주질문:** 이 변경을 검토할 때 두 주체가 완료해야 할 일을 어떤 기준으로 구분하겠습니까?

**선택 후속 질문:** 두 엔진의 writeback 구조만 읽고 지연 시간의 우위를 주장하려면 어떤 측정 근거가 더 필요한가요?

## Q23 · 다음 관찰 하나를 선택하기

대본: [마지막 종합 구간](./my-presentation-script-session-3.html#closing) · [CUBRID 진단 사례](./my-presentation-script-session-3.html#final-cubrid).

**시작 전제:** 새로운 CUBRID 운영 사례에서 invalid frame은 없고 allocator 하나가 기다립니다. 관찰 구간의 flush 제출 성공 횟수는 20 늘었고 token 예산도 갱신됐습니다. 개별 BCB의 완료 경로, 현재 상태, 배정 기록은 없습니다. 제출 주체도 구분하지 않았습니다.

**주질문:** 다음 관찰을 하나만 추가할 수 있다면 무엇을 선택하겠습니까?

**선택 후속 질문:** 선택한 관찰의 서로 다른 두 결과는 원인 후보를 각각 어떻게 바꾸나요?

## Q24 · 이름이 다른 모듈의 검토

대본: [페이지 여정의 마지막 연결과 종료](./my-presentation-script-session-3.html#closing).

**시작 전제:** 설명용 모듈의 문서에는 `Acquire(P) → Use → Release(P)`와 `SubmitImage(P) → Complete(ticket) → Offer(frame) → Retag(frame, Q)`라는 두 경로가 적혀 있습니다. Submit은 사본을 전달하고 ticket을 반환합니다. Complete와 Offer의 보장 범위, Retag가 현재 상태를 검사하는지는 아직 정의하지 않았습니다. 이는 실제 엔진 API가 아닌 인터페이스 검토 사례입니다.

**주질문:** 이 문서로 한 페이지의 안전한 재사용을 설명하려면 어떤 전이 계약을 먼저 명확하게 해야 할까요?

**선택 후속 질문:** 앞서 검토한 CUBRID와 PostgreSQL에서 그 계약의 근거를 찾는 방법은 어떻게 달랐나요?
