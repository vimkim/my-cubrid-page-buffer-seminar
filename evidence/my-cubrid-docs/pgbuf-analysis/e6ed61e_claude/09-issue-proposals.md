# Page Buffer 이슈 제안 목록

분석서([총론 §7](./00-overview.md) 결함 후보 표 20건)에서 실제 JIRA 이슈로 올릴 가치가 있는 것을 선별·구체화한 제안이다. **아직 어떤 이슈도 등록하지 않았다** — 각 항목의 제목·본문 초안은 검토 후 등록용이다. 근거 라인은 develop `e6ed61e87`의 `src/storage/page_buffer.c` 기준.

## 우선순위 요약

| # | 제안 제목 (안) | 유형 | 심각도 | 준비 상태 |
|---|---|---|---|---|
| P1 | lock-free fix 경로가 avoid-dealloc 보호 카운터를 등록 없이 감소시킴 | 버그 | **High** | 재현 시나리오 필요 |
| P2 | 페이지 flush 조기 실패 경로에서 FLUSHING 플래그 미복구로 hang 가능 | 버그 | **High** | 코드 근거 확정, 실패 주입으로 검증 가능 |
| P3 | `pgbuf_direct_victims_maintenance`의 루프가 실행되지 않음 (victim 공급 백업 무력화) | 버그 | Medium | 코드 근거 확정 |
| P4 | `pgbuf_dump`가 atomic-latch 리팩터링 미반영으로 CUBRID_DEBUG 빌드 불가 | 버그 | Low | 즉시 PR 가능 |
| P5 | DWB 활성 시 `Num_pages_written`/`PSTAT_PB_NUM_IOWRITES`가 집계되지 않음 | 버그(통계) | Medium | 즉시 PR 가능 |
| P6 | `pgbuf_rv_dealloc_undo_compensate`가 미초기화 VPID를 디버그 로그에 출력 | 버그 | Low | 즉시 PR 가능 |
| P7 | pgbuf 초기화/종료 경로 결함 3종 (memset 크기, mutex 이중 destroy, malloc(0)) | 버그 | Low | 즉시 PR 가능 (일괄) |
| P8 | 복구(restart) 중 temp 볼륨 판정이 항상 false — temp 특수 처리 전면 미적용 | 조사 | Medium | 영향 분석 필요 |
| P9 | page buffer 죽은 코드·낡은 주석 정리 | 개선 | Low | 즉시 PR 가능 |

---

## P1. lock-free fix 경로가 avoid-dealloc 보호 카운터를 등록 없이 감소시킴

- **유형/심각도**: 버그 / High (데이터 정합성 — 보호 중 페이지의 조기 dealloc 가능성)
- **현상** *(3차 판정 확정 — CBRD-27263 문서가 정본)*: `pgbuf_fix`의 lock-free fast path가 카운터 **등록**(`:2425-2428`)을 건너뛴 채 **해제**(`:2513-2517`)를 실행하는 비대칭. 외부의 `pgbuf_fix` 직접 호출은 0건이지만, `pgbuf_ordered_fix`의 **1차 시도**(`:12291-12296`)가 원래 fetch_mode(PREVENT_DEALLOC)를 그대로 전달하고 보유 페이지가 없으면 UNCONDITIONAL(`:12280-12284`)이 되어 fast path 진입 조건(`:2311-2313`)을 충족한다. ordered fix의 해제(`:12702`, `:12850`)는 1차 시도가 조건부 latch에서 실패하며 남긴 등록 +1과 짝인 의도된 정리다(정상 경로 한정). 추가 결함 2건: 등록 도달 전 실패 후 재정렬 성공 시 -1(드묾), 재정렬 중 실패 시 exit 정리(`:12972-12998`)가 `has_dealloc_prevent_flag`를 소비하지 않아 **+1 영구 잔존 → 해당 페이지 vacuum 회수 영구 제외**. 진입 상황 5가지 회계 표는 CBRD-27263 본문이 정본.
- **영향**: 카운터가 0이면 0-방어(`:16241-16251`)가 막지만, **다른 스레드(예: vacuum)가 등록해 둔 보호 카운트가 있으면 그것을 훔쳐 감소**시킨다. 보호가 조기 해제된 페이지는 dealloc될 수 있고, 보호를 믿던 스레드가 dealloc된 페이지에 접근한다.
- **호출 빈도**: `OLD_PAGE_PREVENT_DEALLOC`의 외부 호출부 10곳(heap_file.c 9곳 + locator_sr.c:12788)은 전부 ordered fix 경유지만, 1차 시도가 원래 모드를 보존하므로 fast path는 heap 스캔에서 일상 도달 (17478은 WRITE라 제외).
- **제안 수정 방향** (택1, CBRD-27263 ranked 표 참조): ① fast path 경유 여부를 지역 플래그로 구분해 해제(`:2513-2517`) 스킵(권장), ② fast path 진입 조건에서 PREVENT_DEALLOC 제외, ③ fast path에서도 등록 수행.
- **검증**: 스레드 A가 `OLD_PAGE_PREVENT_DEALLOC`으로 보호 등록 → 스레드 B가 같은 페이지를 lockfree 조건으로 fix/unfix → A의 보호가 풀렸는지 카운터 관측. isolation 테스트(.ctl) 또는 단위 계측.
- **근거 상세**: [챕터 02 §12](./02-fix-unfix-latch.md), [챕터 05 수정 후보 #2-3](./05-ordered-fix-dealloc.md)

## P2. flush 조기 실패 경로에서 FLUSHING 플래그 미복구로 hang 가능

- **유형/심각도**: 버그 / High (가용성 — 특정 페이지 영구 victim 불가 + 동기 flush 요청자 무한 대기)
- **현상**: `pgbuf_bcb_flush_with_wal`은 진입 시 `mark_is_flushing`(`:10741`)으로 {FLUSHING↑, DIRTY↓} 전이를 하는데, 이후 두 조기 실패 경로 — TDE 암호화 실패(`:10755`), `dwb_set_data_on_next_slot` 실패(`:10767`) — 가 `mark_was_not_flushed` 복원 없이 반환한다. 정규 write 실패 경로(`:10848-10863`)는 복원을 수행하므로 비대칭이다. 부수 문제로, `pgbuf_claim_bcb_for_fix`의 `dwb_read_page` 실패 경로(`:8456-8461`)는 BCB mutex를 든 채 반환한다.
- **영향**: 해당 BCB는 영구 FLUSHING → ① victim 후보 불가(`INVALID_VICTIM_CANDIDATE_MASK`), ② `pgbuf_bcb_safe_flush_internal`(synchronous)이 `PGBUF_LATCH_FLUSH`로 대기하는데 이 대기는 **타임아웃이 없어**(`:7050` 주석) 깨워줄 주체 없는 무한 대기가 된다. 체크포인트(`pgbuf_flush_seq_list` → `safe_flush_force_lock(synchronous=true)`)가 그 페이지를 만나면 체크포인트가 멈춘다.
- **제안 수정 방향**: 두 조기 반환을 정규 실패 경로와 동일하게 — `mark_was_not_flushed(was_dirty)` + `oldest_unflush_lsa` 복원 + `wake_flush_waiters`. `dwb_read_page` 실패는 인접 경로처럼 `put_bcb_into_invalid_list` + `unlock_page` 정리. 장기적으로 `PGBUF_LATCH_FLUSH` 대기에 타임아웃 부여 검토.
- **검증**: TDE mock 실패 주입(또는 DWB 비활성화 경합 재현) 후 해당 페이지에 `pgbuf_flush_with_wal` 동기 호출 → hang 재현/해소 확인.
- **근거 상세**: [챕터 04 §9.1, §9.7](./04-flush-wal-daemons.md), [챕터 02 §12(2)](./02-fix-unfix-latch.md)

## P3. `pgbuf_direct_victims_maintenance`의 루프가 실행되지 않음

- **유형/심각도**: 버그 / Medium (성능·기아 — victim 공급 백업 플랜 무력화)
- **현상**: 100ms maintenance 데몬이 호출하는 이 함수의 private/shared 두 루프(`:9577`, `:9586`)가 `for (index = prv_index, ...; ... && index != prv_index && ...)` 형태로, 초기 조건이 첫 평가에서 거짓이라 본문이 한 번도 실행되지 않는다. 같은 계열로 `pgbuf_panic_assign_direct_victims_from_lru`도 호출부(`:9407`)가 직전에 NULL이 된 `prev_BCB`를 전달해 즉시 0을 반환하는 죽은 코드다(`:10349` → `:9497`).
- **영향**: victim 공급이 일시적으로 끊겼을 때 대기 스레드를 구제하는 주기적 백업 경로가 없다. `:8162-8167`의 TODO 주석이 우려한 "대기 스레드 타임아웃" 시나리오에 대한 방어가 실질 부재. 평상시에는 flush 데몬 경로가 커버하므로 증상이 드러나기 어렵다(그래서 오래 잠복했을 것).
- **제안 수정 방향**: 루프를 의도대로(라운드로빈 시작점에서 한 바퀴) 고치고, panic 경로에는 리스트 이탈 **전**의 이웃 포인터를 전달. 수정 후 고부하 victim 고갈 시나리오에서 대기 시간 분포 개선을 측정해 효과를 입증.
- **검증**: 단위 수준 — 루프 진입 여부 계측. 시스템 수준 — 버퍼 포화 스트레스에서 `PSTAT_PB_ALLOC_BCB_COND_WAIT_*` 대기 시간 비교.
- **근거 상세**: [챕터 03 §17 발견 사항](./03-lru-victim-quota.md)

## P4. `pgbuf_dump`가 CUBRID_DEBUG 빌드에서 컴파일되지 않음

- **유형/심각도**: 버그 / Low (진단 도구 사장 — 기능 영향 없음)
- **현상**: `pgbuf_dump`(`:11349`, `:11362-11363`)가 atomic latch/flags 리팩터링 이전의 필드(`bufptr->fcnt`, `bufptr->zone` 등)를 참조하고 오타(`consistenet_str`)도 있어 `CUBRID_DEBUG`를 정의하면 컴파일이 실패한다. `pgbuf_dump_if_any_fixed` 경유의 finalize 진단 경로가 사실상 죽어 있다.
- **제안 수정 방향**: `get_fcnt(&bcb->atomic_latch)` / `pgbuf_bcb_get_zone` 등 현행 접근자로 재작성. CI에 CUBRID_DEBUG 컴파일 체크가 없다면 추가 여부는 별도 논의.
- **검증**: `-DCUBRID_DEBUG` 빌드 통과.
- **근거 상세**: [챕터 06 §10](./06-misc-observability.md)

## P5. DWB 활성 시 페이지 write 통계가 집계되지 않음

- **유형/심각도**: 버그(관측성) / Medium — 운영 모니터링 왜곡
- **현상**: `show_status->num_pages_written`(`:10828`)과 `PSTAT_PB_NUM_IOWRITES`(`:10833`)의 증가가 non-DWB 분기 안에만 있어, DWB(기본 활성) 경유 쓰기는 집계되지 않는다. `SHOW PAGE BUFFER STATUS`의 `Num_pages_written` / `Pages_written_rate`가 사실상 0으로 보인다.
- **제안 수정 방향**: 카운터 증가를 DWB/비DWB 공통 지점(성공 처리부)으로 이동. "실제 데이터 볼륨 도달"과 "pgbuf가 내보낸 페이지"의 의미 구분이 필요하면 카운터를 분리해 문서화.
- **검증**: DWB 활성 상태에서 쓰기 부하 후 SHOW 값 확인.
- **근거 상세**: [챕터 06 §10](./06-misc-observability.md), [챕터 04 §6](./04-flush-wal-daemons.md)

## P6. `pgbuf_rv_dealloc_undo_compensate`가 미초기화 VPID를 로그에 출력

- **유형/심각도**: 버그 / Low (debug 빌드 한정, 로그 오염)
- **현상**: `:15255`에서 선언된 `VPID vpid`가 대입 없이 `:15271`의 TDE 디버그 로그(`VPID_AS_ARGS`)에서 읽힌다. TDE 페이지 + debug 빌드 조합에서 스택 쓰레기 값이 출력된다. `pgbuf_rv_dealloc_undo`(`:15209-15210`)에서 복사해 오며 초기화 코드가 누락된 형태.
- **제안 수정 방향**: `rcv->pgptr`의 VPID로 채우거나 해당 로그 인자를 제거.
- **근거 상세**: [챕터 05 §4 결함 관찰](./05-ordered-fix-dealloc.md)

## P7. 초기화/종료 경로 결함 3종 (일괄 처리 제안)

- **유형/심각도**: 버그 / Low (현재는 잠재적 — 특정 실패 경로에서만 발현)
- **내용**:
  1. `:1626` — `memset (&pgbuf_Pool.direct_victims, 0, sizeof (PGBUF_VICTIM_CANDIDATE_LIST))`: 대상은 24B `PGBUF_DIRECT_VICTIM`인데 16B 타입 크기를 사용 → `waiter_threads_low_priority` 미초기화 (static 전역이라 첫 초기화에서는 우연히 0).
  2. `:5851` + `:1980` — `Aout_mutex`가 init 실패 경로와 finalize에서 이중 `pthread_mutex_destroy` (UB).
  3. `:13949` — quota 비활성 시 `malloc (0)` 반환값 의존 — NULL 반환 allocator에서 부팅 실패.
- **제안 수정 방향**: ① `sizeof (PGBUF_DIRECT_VICTIM)`, ② destroy 소유권을 finalize로 단일화, ③ 개수 0이면 할당 생략. 세 건 모두 초기화/종료 위생이므로 하나의 이슈/PR로 묶는 것을 제안.
- **근거 상세**: [챕터 01 §8](./01-structures.md)

## P8. 복구 중 temp 볼륨 판정이 항상 false — 영향 조사

- **유형/심각도**: 조사 / Medium (정합성 이슈 여부 판단 필요)
- **현상**: `pgbuf_is_temporary_volume`(`:5497-5501`)이 `LOG_ISRESTARTED()` 이전(즉 crash recovery 수행 중)에는 항상 false를 반환한다. 복구 중 temp 페이지가 WAL 면제·LRU 승격 억제·DWB 우회 등 temp 특수 처리를 전혀 받지 못한다.
- **쟁점**: 복구 중 temp 볼륨 접근이 실제로 존재하는가(temp 볼륨은 재기동 시 재생성되는 것이 원칙), 존재한다면 non-temp 취급이 안전 측인가 위험 측인가. 의도된 보수적 동작일 가능성이 높으므로, **결론이 "문제 없음"이라도 주석으로 근거를 남기는 것**이 이슈의 목표.
- **근거 상세**: [챕터 06 §5.2, §10](./06-misc-observability.md)

## P9. 죽은 코드·낡은 주석 정리

- **유형/심각도**: 개선 / Low
- **내용**: ① `monitor.victim_rich` — 계산(`:14446`)되지만 소비처 없음 (`:9046-9053` 주석은 이를 재시도 조건으로 설명 — 주석-코드 불일치), ② `pgbuf_remove_private_from_aout_list`(`:10585`) — 정의만 있고 호출 없음, ③ `UINT16MAX`(`:300`) — 미사용 매크로, ④ `buf_LRU_list` 주석(`:771-774`)의 "garbage LRU" 구획 — 현재 코드에 존재하지 않는 낡은 설명, ⑤ `goto copy_unflushed_lsa`(`:10772`) — 레이블이 바로 다음 줄이라 무의미.
- **비고**: P3(죽은 루프)와 묶을 수도 있으나, P3는 동작 수정이고 이것은 무해 정리이므로 분리 제안. 소스 내 기존 TODO들(`:599-601` victim_hint, `:3368`, `:7050`, `:8692`, `:12107`)은 정리 대상이 아니라 별도 논의 대상으로 남긴다.

---

## 등록 절차 제안

1. 팀 리뷰에서 P1~P3의 우선순위와 담당 확정 (P1은 재현 시나리오 설계부터)
2. P4~P7은 각각 소규모 단독 PR로 처리 가능 — 이슈 등록 후 바로 수정 착수 가능한 수준
3. 이슈 본문은 이 문서의 해당 절 + 분석서 챕터 링크를 근거로 작성 (등록 시 한국어 JIRA 관례에 맞춰 목적/이유/방안 구조로 변환)
