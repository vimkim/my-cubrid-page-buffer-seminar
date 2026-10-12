# 3회차 발표 대본 한국어 편집 검토

이번 편집은 마지막 세션의 기술적 구분과 사례 전제를 유지하면서, 발표자가 그대로 읽어도 자연스럽게 이어지는 한국어 문장으로 대본을 다듬는 데 목적이 있습니다. 12개 설명 블록과 화면 안내, 질문, 예시 답을 검토하고 수정했습니다. 진행 범위와 화면 경로는 [준비 계획](docs/final-session-preparation.md)을 따릅니다.

이 문서는 **발표자·작성자용 편집 보고서**입니다. 검토자는 한국어 편집을 맡은 **Codex 에이전트**이며, 사람이 수행한 구두 전달 검토나 EN/KO 의미 일치 검토의 승인 기록을 대신하지 않습니다. 참가자 탐색 경로와 영어 Maintainer Guide의 문서 구성에는 등록하지 않았습니다.

## 검토 대상 식별

| 항목 | 정확한 식별값 |
| --- | --- |
| 준비 기준 커밋 | `38749d1d3920894e544be7102602201fad417ccb` |
| 준비 기준 대본 SHA-256 | `8825c97e33d97d3e4fb97b5ee2dbe052fe9831834e788f0fbd6a15ce761becc9` |
| 편집 입력 커밋 | CSS 적용 커밋 `328ee39d1b258cf7caed984f7b7ced4ff4247274` |
| 편집 입력 대본 SHA-256 | `b70d1673e9786ede67ae9662b39b2e0675d60abe9a5fa792e1c168d55f360445` |
| 후속 명확화 검토 기준 커밋 | `d2181f519eccaae4e9426a6da52f6acd432f8f65` |
| 후속 명확화 검토 기준 대본 SHA-256 | `9b9cb0c504838fca6cdb6a8bc88f4b8c84e1d39575283043e782712840c0fb33` |
| 편집 후 검토 대본 | [my-presentation-script-session-3.html](my-presentation-script-session-3.html) |
| 편집 후 대본 SHA-256 | `c2bf881dbdbd1891efbfe2c825b2a7b7837e2d7cda057efab0aac97f49ed4ef3` |
| 기술 기준 | CUBRID `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, PostgreSQL `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc` |
| 검토일 | 2026-10-12 |

SHA-256은 각 HTML 파일의 전체 바이트를 기준으로 합니다. 입력 커밋의 본문은 준비 기준과 동일하고, CSS 연결과 루트 class가 적용된 상태였습니다. 이 보고서의 수정 예시는 해당 입력 본문과 편집 후 대본을 비교합니다.

## 우선순위별 발견 사항과 처리

P1은 설명을 듣는 동안 의미를 놓치거나 증거 수준을 오해할 수 있는 표현입니다. P2는 뜻은 전달되지만 발표의 호흡과 용어 일관성을 떨어뜨리는 표현입니다. 아래 항목은 모두 대본에 반영했습니다.

| 우선순위 | 위치 | 발견 사항 | 반영한 처리 |
| --- | --- | --- | --- |
| P1 · 언어 | [세대 설명](my-presentation-script-session-3.html#generation), [마지막 연결](my-presentation-script-session-3.html#closing) | `resident 저장`, `전달 의무`, `dirty 작업`처럼 상태·공간·남은 작업을 한꺼번에 압축한 명사구가 들으면서 이해하기 어려움. | 메모리 공간, 이미지 전달, 남아 있는 dirty 상태를 문장 안에서 구분함. G/G+1은 설명용 세대 이름임을 먼저 정의함. |
| P1 · 언어·수업 | [Post-flush](my-presentation-script-session-3.html#post-flush), [마지막 사례 A](my-presentation-script-session-3.html#final-cubrid) | `완료 상태와 flush waiters를 정리`라는 표현이 flag 처리와 대기자 깨우기를 같은 동작으로 들리게 함. | FLUSHING 해제와 flush 대기자 깨우기를 각각 말하고, allocator가 기다리는 frame 배정과 구분함. |
| P1 · 기술 표현 | [Page-flush](my-presentation-script-session-3.html#page-flush) | `관측된 demand wake`가 소스 조건인지 실제 실행 관찰인지 불분명함. | Boot gate를 통과한 실행에서 daemon이 wakeup을 확인하는 조건으로 서술하고 소스 근거임을 명시함. 아래 기술 명확화 항목에서 별도로 기록함. |
| P1 · 기술 표현 | [Post-flush 인계 조건](my-presentation-script-session-3.html#post-flush) | 인계 조건이 맞지 않을 때의 완료 주체를 page-flush thread로만 서술하면, 다른 제출 caller도 들어오는 공통 flush 경로를 놓침. | 완료 처리의 주체를 `이미지를 제출한 thread`로 바로잡음. |
| P2 · 언어 | [Daemon](my-presentation-script-session-3.html#daemons), [Maintenance](my-presentation-script-session-3.html#maintenance), [Flush-control](my-presentation-script-session-3.html#pacing) | `accepted pass`, `allowance`, `guard`, `task 시도` 등이 한국어 서술 중 잦은 용어 전환을 만듦. | 갱신 조건을 통과한 실행, token 예산, 검사 조건, 작업 시도로 풀어 씀. 소스 식별자와 필요한 전문 용어는 유지함. |
| P2 · 수업 | [Maintenance](my-presentation-script-session-3.html#maintenance) | `epoch`가 한 번 등장하지만 그 자리에서 뜻을 설명하지 않음. | `갱신 회차를 나타내는 epoch`라는 짧은 정의를 붙임. |
| P2 · 언어 | [PostgreSQL 모델](my-presentation-script-session-3.html#postgres-model), [Clock](my-presentation-script-session-3.html#postgres-clock), [Ring](my-presentation-script-session-3.html#postgres-ring) | `bounded reuse credit`, `zero credit`, `teaching model`, `reset` 같은 설명구가 정의보다 먼저 나오거나 문장 흐름을 끊음. | Credit의 뜻을 먼저 설명하고 0·상한·초기 상태를 직접 서술함. Pin, descriptor, clock, ring, refcount는 유지함. |
| P2 · 언어·수업 | [Writeback](my-presentation-script-session-3.html#postgres-writeback), [마지막 사례 B](my-presentation-script-session-3.html#final-postgres) | `permanent dirty`를 그대로 옮긴 표현은 페이지 범주와 현재 dirty 상태를 혼동시킬 수 있음. | `dirty 상태인 permanent 페이지`로 분리하고, 마지막 사례에서 `BM_PERMANENT`로 구분하는 범주임을 밝힘. |
| P2 · 언어 | [마무리](my-presentation-script-session-3.html#closing) 및 각 블록의 전환 | `설명하지 않겠습니다`, `말하겠습니다`가 반복되어 메커니즘보다 발표 방식에 주의가 쏠림. | 필요한 제한을 사실 문장으로 말하고, 다음 질문으로 이어지는 짧은 인과 문장을 사용함. 질문과 요청은 일관된 전문적 구어체로 정리함. |

## 대표 수정 예시와 이유

원문은 편집 입력 대본에서 발췌했습니다. 수정문은 위에서 식별한 편집 후 대본과 일치합니다.

| 위치 | 원문 | 수정문 | 이유 |
| --- | --- | --- | --- |
| [도입](my-presentation-script-session-3.html#opening) | 우선 기억을 하나씩 복원해 보겠습니다. | 먼저 앞서 배운 내용을 하나씩 떠올려 보겠습니다. | 복원이라는 추상적 표현을 실제 회상 동작으로 바꿈. |
| [세대 설명](my-presentation-script-session-3.html#generation) | 메모리에서 11로 바꾸면 저장된 이미지와 메모리 사이에 간격이 생깁니다. | 메모리에서 11로 바꾸면 저장된 이미지와 메모리의 이미지가 달라집니다. | 간격이 시간인지 값의 차이인지 모호한 점을 없애고 비교 대상을 맞춤. |
| [세대 정의](my-presentation-script-session-3.html#generation) | 이 이름은 설명용이며 저장된 generation 번호라는 뜻은 아닙니다. | 여기서 세대, 즉 generation은 설명을 위한 이름입니다. 실제로 저장된 세대 번호나 카운터를 뜻하지는 않습니다. | 한국어 이름을 먼저 정의하고, G/G+1이 저장 필드처럼 들리지 않게 함. |
| [Post-flush](my-presentation-script-session-3.html#post-flush) | Queued pointer가 만들어진 시점보다 지금의 보호 상태가 우선합니다. | Queue에 포인터를 넣었을 때의 상태가 아니라, 지금의 보호 상태를 기준으로 판단합니다. | 포인터 자체의 생성 시각에서 검사하려는 상태의 관찰 시각으로 초점을 맞춤. |
| [Maintenance](my-presentation-script-session-3.html#maintenance) | Accepted pass에서만 epoch가 진행되고 샘플과 quota를 처리합니다. | 이런 조건을 통과한 갱신에서만 샘플과 quota를 처리하고, 갱신 회차를 나타내는 epoch를 진행시킵니다. | 앞서 설명한 조건을 다시 연결하고, epoch의 의미를 바로 풀어 인과관계를 따라가게 함. |
| [Flush-control](my-presentation-script-session-3.html#pacing) | 50 ms 목표 주기로 새 allowance를 계산하고 기존 token 값을 교체하며 writer들을 깨웁니다. | 50 ms 목표 주기로 새 token 예산을 계산하고 기존 값을 교체한 뒤 writer를 깨웁니다. | Allowance의 역할을 드러내고, 누적이 아닌 교체라는 동작을 유지함. |
| [Ring](my-presentation-script-session-3.html#postgres-ring) | Ring의 backend-local이라는 말은 그 frame을 다른 backend가 못 쓴다는 뜻이 아닙니다. | Ring 객체는 backend에 속하지만, 참조하는 frame은 다른 backend도 사용할 수 있습니다. | 부정문 해석보다 객체와 참조 대상의 관계를 바로 설명함. |
| [마지막 질문](my-presentation-script-session-3.html#closing) | 각각 시작 상태, 한 사건, 그 이후 상태, controlling predicate, 다음에 볼 증거를 적어 주세요. | 각 사례에서 시작 상태, 사건 하나, 그 이후 상태를 적어 주세요. 이어서 전이를 결정하는 조건과 다음에 확인할 증거를 적어 주세요. | 과제 요소를 두 문장으로 나누어 구두 요청의 부담을 줄임. |

`frame`, `BCB`, `fix/unfix`, `latch`, `daemon`, `quota`, `pin`, `descriptor`, `clock`, `ring`, `credit`, `refcount`는 기존 설명과 소스를 연결하는 데 유용하므로 유지했습니다. 일반 서술까지 모두 번역하거나, 반대로 영어 단어를 문장마다 반복하는 방식은 피했습니다.

## 소스 확인을 거친 기술적 명확화

다음 다섯 항목은 문체 수정과 별개로 확인했습니다. 메커니즘을 새로 정의하거나 실행 결과를 추가한 것이 아니라, 기존 설명의 적용 조건과 검사 대상, 완료 처리의 주체를 분명히 한 것입니다. 기준 설명과 [소스 목록](source-inventory.md), [불확실성 목록](unresolved-or-version-sensitive-findings.md)을 먼저 확인하고 고정 소스의 해당 분기를 읽었습니다.

| 항목 | 명확하게 한 내용 | 기준 설명과 고정 소스 |
| --- | --- | --- |
| [WAL](my-presentation-script-session-3.html#generation) | 로그 선행 순서에 `로그가 필요한 영구 페이지`라는 범위를 붙임. 임시 페이지나 로그가 필요 없는 경로까지 동일한 WAL 강제를 한다는 인상을 줄임. | [Flush 기준 설명](learning/04-flush-one-generation.md#one-flush-generation-timeline), CUBRID [`pgbuf_bcb_flush_with_wal`](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10723-L10855) |
| [Wakeup 처리](my-presentation-script-session-3.html#page-flush) | Boot gate 이후 `was_woken_up()`으로 확인된 wakeup은 최소 한 번의 후보 flush 호출을 유도한다고 서술함. 소스에서 확인한 동작이며 runtime 관찰이라고 부르지 않음. | [Daemon 실행 경계 분석](reference/page-buffer-daemon-lifecycle-audit.md), CUBRID [page-flush 작업](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L17012-L17067) |
| [Post-flush 검사](my-presentation-script-session-3.html#post-flush) | 후보 자격을 막는 flag 검사에 DIRTY가 포함됨을 명시함. Fix 검사와 별도로 새 dirty 상태가 배정을 막는다는 설명을 드러냄. | [Flush 기준 설명](learning/04-flush-one-generation.md#concurrent-re-dirty-is-generation-g1), CUBRID [후보 mask](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L258-L265)와 [queue 소비자](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L15487-L15556) |
| [인계하지 않을 때의 완료 주체](my-presentation-script-session-3.html#post-flush) | 네 인계 조건 중 하나라도 맞지 않으면 이미지를 제출한 caller thread가 BCB를 다시 잠그고 완료 처리함. 제출 주체가 page-flush가 아닌 경우에도 이 일반 분기를 사용하므로 완료 주체를 page-flush로 한정하지 않음. | [공통 flush 완료 설명](learning/04-flush-one-generation.md#one-flush-generation-timeline), CUBRID [인계 조건과 일반 완료 분기](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L10925-L10952) |
| [Usage credit 상한](my-presentation-script-session-3.html#postgres-model) | 기본 strategy의 해당 backend 첫 pin에서 credit은 상한 5에 도달하지 않았을 때 증가한다고 명시함. 중첩 pin은 private refcount만 늘리는 구분을 유지함. | [PostgreSQL pin·교체 설명](reference/cross-database-replacement-policy-comparison.md#hit-and-eviction-behavior), PostgreSQL [`PinBuffer`](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L3295-L3386) |

PostgreSQL의 permanent 표현은 [기존 후보 거절 분기](https://github.com/postgres/postgres/blob/fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc/src/backend/storage/buffer/bufmgr.c#L2616-L2633)에 있는 `BM_PERMANENT` 조건을 유지한 용어 정리입니다. 모든 디스크 기반 페이지로 범위를 넓히지 않았습니다.

Maintenance의 epoch 정의는 [기존 quota epoch 설명](reference/page-buffer-daemon-lifecycle-audit.md)과 [갱신 시 `adjust_age` 증가](https://github.com/CUBRID/CUBRID/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14322-L14333)를 확인한 뒤 붙인 짧은 수업용 설명입니다. 실제 경과 시간을 나타내는 타이머 주기로 해석하지 않습니다.

## 적용 범위와 보존한 사항

12개 블록의 설명·전환·화면 안내·질문·예시 답을 편집했습니다. 문장 길이를 줄이고, 수행 주체와 검사 시점을 드러내며, 질문의 지시와 메커니즘의 설명을 구분했습니다. 소스 함수·상수·commit 식별자와 모든 기존 링크의 목적지는 보존했습니다.

G/G+1, clock의 두 독립 시작 상태, 두 slot의 ring 모델, 마지막 두 사례의 전제와 결과를 유지했습니다. 구성 사례가 실행 캡처가 아니라는 표시, DWB 수락과 home-volume write의 차이, post-write 대기의 위치, VS-20/VS-21의 미확정 영향, 성능 순위를 주장하지 않는 한계를 유지했습니다. 마지막 세션의 유연한 n시간 진행과 세미나 종료도 보존했습니다.

CSS 커밋의 외부 stylesheet 연결과 루트 class, 기존 ID, 화면 안내 목적지, native `details/summary` 동작을 유지했습니다. 편집 보고서는 영어 가이드의 새 설명 페이지나 참가자용 탐색 경로를 만들지 않습니다.

## 남아 있는 수업·기술 질문

| 구분 | 확인할 질문 | 후속 처리 |
| --- | --- | --- |
| 한국어 구두 전달 | 발표자가 실제로 읽었을 때 `frame`, `credit`, `quota`의 발음과 한국어 조사 연결이 편한가? 질문을 듣고 생각할 시간과 문장 호흡이 충분한가? | 한국어를 사용하는 사람이 현재 대본 해시에 맞춰 리허설을 검토해야 함. 에이전트 편집으로 승인 처리하지 않음. |
| 수업 설계 | 참가자가 G의 FLUSHING 해제와 G+1의 DIRTY 유지, flush 대기자와 allocation 대기자를 스스로 구분할 수 있는가? | [세대 질문](my-presentation-script-session-3.html#generation)과 [마지막 사례 A](my-presentation-script-session-3.html#final-cubrid)에서 설명을 들어 확인함. 자동 검사나 페이지 열람으로 이해도를 판정하지 않음. |
| 수업 설계 | Clock의 credit 감소 방문과 실제 선택 방문, ring 객체와 공유 frame의 관계를 새 사례에도 적용할 수 있는가? | 독립된 시작 상태를 다시 확인한 뒤 예측과 이유를 받음. 두 clock 사례를 이어서 실행한 것으로 다루지 않음. |
| 기술 증거 | Wakeup 지연의 경계나 VS-20의 allocator 영향이 실제 지원 구성에서 어떻게 나타나는가? | 기존 불확실성 목록의 열린 질문으로 유지함. 이번 편집은 새로운 runtime 실험이나 진행 보장을 제공하지 않음. |
| 기술 증거 | 어떤 workload와 저장 조건에서 두 엔진의 메타데이터 비용·writeback 지연이 실질적인 차이를 만드는가? | 메커니즘 비교까지만 말함. 성능 결론에는 별도의 통제된 측정이 필요하며 이번 편집 범위에는 포함하지 않음. |

이번 검토에서 새로 미해결된 메커니즘 결함은 발견하지 않았습니다. 기존 불확실성 항목을 해결했다고 판단하지도 않았습니다. 참가자용 EN/KO 페이지의 기존 사람 검토 대기 상태는 이번 대본 편집과 별개로 유지됩니다.

## 검증 기록과 한계

소스·링크·served 바이트 검사는 편집 후 위 SHA-256의 대본을 기준으로 수행했습니다. 아래 headless DOM 검사는 후속 명확화 직전의 `d2181f5` 대본에 대한 기록입니다. 이번 후속 수정에서는 인계하지 않을 때의 주체만 바로잡았으며, 최종 통합 화면은 주 작업자가 확인합니다. 언어 검토는 에이전트가 문장과 인과관계를 읽은 결과이며, 사람의 구두 수용성 검토는 열린 상태입니다. 엔진 runtime 실험, 참가자 관찰, 교차 엔진 benchmark는 수행하지 않았습니다.

- Copyparty Markdown 소스 검사를 통과했습니다. 대본과 보고서의 상대 파일·fragment 링크 109개가 해석되며, 고정 GitHub 소스 참조 25개의 파일·리비전·줄 범위가 로컬 고정 소스와 일치합니다.
- CSS 입력본과 비교해 모든 기존 ID와 링크 목적지·순서, head의 stylesheet 연결, section 및 details 속성이 유지됩니다. 12개 설명 블록과 14개 답 disclosure가 있고, 답은 모두 처음에 닫혀 있습니다.
- 로컬 Copyparty에서 받은 대본의 바이트와 파일이 정확히 일치하며, SHA-256은 위의 편집 후 식별값과 같습니다.
- Headless Chromium에서 1440 px와 390 px 너비로 JavaScript를 끄고 확인했습니다. 가로 방향 본문 유실이 없고, 키보드로 답을 열고 닫을 수 있으며, 마지막 절로 이동합니다. 관련 console/page 오류는 없었습니다.
- `feedback.md?v`가 Copyparty에서 표와 본문으로 렌더링되고, render-error 표시와 관련 console/page 오류가 없음을 확인했습니다. `git diff --check`도 통과했습니다.

위 결과는 담당 파일의 집중 검사입니다. 전체 가이드·이중언어 사이트의 통합 검증과 최종 화면 증거는 주 작업자가 합친 결과를 대상으로 수행합니다. 이 검사 기록은 사람의 한국어 구두 전달 승인이나 참가자 이해도 확인을 의미하지 않습니다.
