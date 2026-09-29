# CUBRID Page Buffer 결함 보고서 — pgbuf 분석 세미나 준비 중 발견분

> 기준 소스: CUBRID 11.5.x, commit `5cd4f860e` (branch `pgbuf-analysis`의 세미나용 tracer 커밋 **이전** 상태).
> 아래 모든 `file:line`은 그 시점의 `src/storage/page_buffer.c` 기준이다 (tracer 커밋 이후에는 줄번호가 밀림).
> 발견 경로: 팩트시트 3부(`research/cubrid-*.md`)의 전수 코드 리딩 + `quizzes/` 실측. 각 항목에 재검증 방법을 달았다.
> AI(Claude) 분석 결과이며, 티켓화 전에 사람 검토가 필요하다.

## Summary

| # | 심각도 | 한 줄 요약 | 위치 |
|---|---|---|---|
| D1 | **Medium** | `pgbuf_bcb_flush_with_wal` early return 2곳이 `FLUSHING_TO_DISK` 플래그를 누수 → BCB 영구 victim 불가 + flush 대기자 미기상 | page_buffer.c:10753, :10765 |
| D2 | Low (latent) | `direct_victims` memset이 잘못된 `sizeof` 사용 → 재초기화 시 garbage 포인터 delete 가능 | page_buffer.c:1624 |
| D3 | **Medium** | `pgbuf_direct_victims_maintenance` 루프 조건이 진입 즉시 거짓 → 문서화된 "backup plan"이 전혀 동작 안 함 | page_buffer.c:9574-9588 |
| D4 | Low | `big_private_lrus_with_victims` 큐에 생산자가 없음 → over-quota 스레드의 2단계 victim 탐색이 사실상 무효 | page_buffer.c:16401 |
| D5 | Low (usability) | `double_write_buffer_size`가 `2M` 같은 크기 접미사를 거부하고 **서버 부팅 실패** 유발 | system_parameter.c (dwb size PRM) |
| D6 | Low (observability) | 카운터 의미 불일치 4건 (DWB 이중 집계, flushed 카운터 편향, SHOW victim 정의 상충, NEW_PAGE 히트 집계) | 여러 곳 |
| D7 | Info (doc gap) | "LRU + Aout of 2Q" 주석과 달리 AOUT은 강제 비활성 — 사용자 설정이 조용히 무시됨 | system_parameter.c:9985-9986 |
| D8 | Cosmetic | `pgbuf_peek_stats` 헤더 선언의 파라미터 이름이 정의와 불일치 | page_buffer.h:452-453 |

---

## D1. `pgbuf_bcb_flush_with_wal`의 early return 2곳이 `FLUSHING_TO_DISK` 플래그를 누수 (Medium)

**현상.** `pgbuf_bcb_flush_with_wal()`은 진입부(:10739)에서 `pgbuf_bcb_mark_is_flushing()`을 호출해
`PGBUF_BCB_FLUSHING_TO_DISK_FLAG`를 **세우고 `DIRTY`를 미리 끈다**. 이후 두 실패 경로가
플래그 원복 없이 return한다:

- TDE 페이지 암호화 실패: `:10753`의 `return error;`
- `dwb_set_data_on_next_slot()` 실패: `:10765`의 `return error;`

정상 error 경로(:10846-10861)는 `pgbuf_bcb_mark_was_not_flushed()`로 플래그를 원복하고
`oldest_unflush_lsa`를 복원하며 flush 대기자를 깨우지만, 위 두 경로는 그 어느 것도 하지 않는다.

**영향.**
1. `FLUSHING_TO_DISK`는 `PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK`(:258-262)에 포함되므로
   해당 BCB는 **영구히 victim이 될 수 없다** (풀 1칸 누수).
2. `DIRTY`가 이미 꺼진 상태로 남으므로, 원복되지 않으면 **수정 유실** 가능성이 있다
   (`oldest_unflush_lsa`는 NULL로 초기화된 채).
3. `PGBUF_LATCH_FLUSH`로 이 BCB의 flush 완료를 기다리던 스레드는 **영원히 깨어나지 않는다**.

**발생 조건.** `tde_is_loaded()`가 참인 환경에서 암호화 실패 또는 DWB 슬롯 확보 실패 — 드물지만
발생 시 재기동 전까지 회복 불가.

**부수 발견.** `:10770`의 `goto copy_unflushed_lsa;`는 바로 다음 문장(:10774 라벨)으로 가는
dead goto다.

**제안.** 두 early return을 정상 error 경로와 동일하게 `pgbuf_bcb_mark_was_not_flushed()` +
`oldest_unflush_lsa` 복원 + `pgbuf_wake_flush_waiters()` 처리 후 return하도록 수정.

**재검증.** `research/cubrid-flush-wal-dwb.md` §3.2, §12(fact 19). 코드 흐름은 :10739 → :10744-10765 실패 분기 대조.

---

## D2. `direct_victims` memset의 잘못된 `sizeof` (Low, latent)

**현상.** `pgbuf_initialize()`의 초기화 구간:

```c
/* page_buffer.c:1623-1625 */
#if defined (SERVER_MODE)
  memset (&pgbuf_Pool.direct_victims, 0, sizeof (PGBUF_VICTIM_CANDIDATE_LIST));
#endif
```

대상은 `PGBUF_DIRECT_VICTIM`(포인터 3개, 24B, :743-750)인데 크기는
`PGBUF_VICTIM_CANDIDATE_LIST`(16B, :839-843)를 쓴다. 마지막 멤버
`waiter_threads_low_priority`가 0으로 초기화되지 않는다.

**영향.** `pgbuf_Pool`이 정적 저장소(:845)라 첫 초기화에서는 문제가 가려진다. 그러나
(1) 한 프로세스에서 `pgbuf_initialize`가 두 번 불리는 경우, (2) `:1625`~`:1796`(실제 할당)
사이의 `goto error` → `pgbuf_finalize()`(:1867) 경로에서 `waiter_threads_low_priority`가
garbage인 채 `delete`(:2026-2030)될 수 있다. `sizeof` 자체가 명백히 잘못된 타입이다.

**제안.** `sizeof (PGBUF_DIRECT_VICTIM)`으로 수정 (또는 `sizeof pgbuf_Pool.direct_victims`).

**재검증.** `research/cubrid-structs-fix.md` §1.1.

---

## D3. `pgbuf_direct_victims_maintenance()`의 루프가 진입 즉시 종료 (Medium)

**현상.** 두 루프(:9574-9579, :9583-9588)가 모두 아래 꼴이다:

```c
for (index = prv_index, restarted = false;
     pgbuf_is_any_thread_waiting_for_direct_victim () && index != prv_index && !restarted; ...)
```

`index`를 `prv_index`로 초기화하므로 `index != prv_index`가 **첫 평가부터 거짓**이라
루프 본문이 한 번도 실행되지 않는다.

**영향.** 함수 머리 주석(:9551-9556)이 설명하는 "시스템이 한가할 때 victim 대기 스레드를
먹여 살리는 backup plan"이 전혀 동작하지 않는다. `pgbuf-maintain` 데몬(100ms 주기)이 하는
두 가지 일 중 하나가 통째로 no-op이다. (직접 배급은 다행히 flush/post-flush/unfix 경로의
다른 donor들이 감당하고 있어 시스템이 멈추지는 않는다 — quizzes/09 실측에서 확인.)

**제안.** 의도 확인 후, do-while로 바꾸거나 `restarted` 로직에 맞는 순회 조건으로 수정.
의도적으로 죽인 코드라면 삭제가 낫다.

**재검증.** `research/cubrid-lru-victim.md` §12.4.

---

## D4. `big_private_lrus_with_victims` 큐는 생산자가 없다 (Low)

**현상.** 이 lock-free 큐에 대한 유일한 `produce` 호출은 `:16401`인데, 이는
`pgbuf_lfcq_get_victim_from_private_lru()`가 **같은 큐에서 consume한 뒤** 되넣는 것이다.
외부에서 최초로 넣어주는 곳(`pgbuf_lfcq_add_lru_with_victims`)은 일반 private 큐(:16329)와
shared 큐(:16337)에만 넣는다. 따라서 big 큐는 영원히 비어 있다.

**영향.** quota를 초과해 `restrict_other=true`가 된 스레드는 victim 탐색 2단계에서
"큰 private 리스트만 노린다"는 설계였으나(:16374-16385), 큐가 비어 있어 항상 NULL을 받고
shared 리스트로 직행한다. 설계 의도("폭식 리스트부터 회수")가 무효화된 상태다.

**제안.** `pgbuf_lfcq_add_lru_with_victims`에서 리스트 크기가 `PBGUF_BIG_PRIVATE_MIN_SIZE`(100,
:1071)와 quota 조건을 만족하면 big 큐로 라우팅하거나, big 큐 자체를 제거하고 단순화.

**재검증.** `research/cubrid-lru-victim.md` §12.3 (전체 grep 근거 포함).

---

## D5. `double_write_buffer_size`가 크기 접미사를 거부하고 서버 부팅을 막음 (Low, usability)

**현상 (실측 재현).** `cubrid.conf`에 `double_write_buffer_size=2M`을 쓰면 서버가
부팅 자체를 거부한다:

```
ERROR CODE = -839: "double_write_buffer_size": Unknown system parameter or bad value.
boot_sr.c:2750: Unable to restart/initialize the database server. Could not load system parameter.
```

같은 문법이 `data_buffer_size=16M`에서는 정상 동작한다. 이 비일관성 때문에 이번 세미나 준비 중
퀴즈 서버가 반복적으로 "start timeout"으로 죽는 원인을 찾는 데 상당한 시간이 들었다
(부팅 실패는 조용하고, start 유틸리티는 그냥 기다리기만 한다).

**제안.** dwb 크기 PRM에 크기 단위 파싱(다른 `*_size` 파라미터와 동일)을 허용하거나,
최소한 에러 메시지에 "size suffix not allowed; use bytes"를 명시.

**재검증.** `[@dbname]` 섹션에 `double_write_buffer_size=2M` 기입 후 `cubrid server start`.

---

## D6. 관측 카운터 의미 불일치 4건 (Low, observability)

| 항목 | 내용 | 근거 |
|---|---|---|
| (a) DWB 이중 집계 | DWB on이면 `PSTAT_PB_NUM_IOWRITES`(`Num_data_page_iowrites`)가 페이지당 2회(DWB 파일 쓰기 + 원위치 쓰기) 오른다. 반면 `SHOW PAGE BUFFER STATUS`의 `Num_pages_written`은 non-DWB 분기에서만 증가해 DWB on에서 과소 집계. | flush 시트 §12 fact 5; dwb:2339/:2115/:2150 vs page_buffer.c:10826/:10831. quizzes/11 실측: DWB on +223 vs off +14 |
| (b) flushed 카운터 편향 | `Num_data_page_flushed`(`PSTAT_PB_NUM_FLUSHED`)는 victim flusher(:4113)만 집계 — checkpoint flush는 0. "flush량" 지표로 오독 위험. | quizzes/10 실측: checkpoint +206 iowrites에 flushed +0 |
| (c) SHOW victim 정의 상충 | `SHOW PAGE BUFFER STATUS`의 `Victim_candidate_pages`는 "zone3 ∧ **dirty**"(:17290-17293)인데, 내부 `count_vict_cand`/`Num_data_page_victim_candidate`는 "zone3 ∧ **non-dirty**". 이름이 같고 정의는 정반대. | lru 시트 §12.12 |
| (d) NEW_PAGE 히트 집계 | `NEW_PAGE` fix(디스크 읽기 없음)가 SHOW의 `num_hit`(:8574-8575)로 집계되어 insert-heavy 워크로드의 히트율이 과대. perfmon 쪽 비율(FETCHES vs IOREADS)은 무관. | structs 시트 §5.6 caveat |

---

## D7. "LRU + Aout of 2Q" 주석 vs AOUT 강제 비활성 (Info, doc gap)

`page_buffer.c:635-639`는 교체 정책을 "LRU + Aout of 2Q"로 소개하지만,
`prm_tune_parameters()`가 conf 파싱 **이후** `data_aout_ratio`를 무조건 0으로 덮어쓴다
(`system_parameter.c:9985-9986`, "disable AOUT list until we fix CBRD-20741").
사용자가 conf에 무엇을 적어도 **조용히 무시**된다 (경고 로그 없음 — quizzes/07 실측:
conf `1.0` vs paramdump `0.000000`). 파생 죽은 코드로 `pgbuf_remove_private_from_aout_list`
(:10583, 호출자 없음)가 있다.

**제안.** CBRD-20741 해결 전까지는 (1) 설정 무시 시 경고 로그, (2) 설계 주석에 비활성 사실
명기 중 최소 하나.

---

## D8. `pgbuf_peek_stats` 헤더 선언 파라미터 이름 stale (Cosmetic)

`page_buffer.h:452-453`은 13번째 파라미터를 `alloc_bcb_waiter_low`로 선언하지만 정의
(`page_buffer.c:14687`)의 이름은 `flushed_bcbs_waiting_direct_assign`이다. 타입/인자 수가
일치해 컴파일은 되지만 헤더만 읽는 독자를 오도한다.

---

## 참고 — 이미 알려진 이슈와의 관계

- D7의 근본 원인(CBRD-20741)은 기존 티켓이 있다. 본 보고서의 신규 결함은 D1~D6, D8이다.
- D1, D2는 각각 flush/structs 팩트시트 작성 중 코드 리딩으로, D3, D4는 lru 팩트시트에서,
  D5, D6은 `quizzes/` 실측 중 발견되었다. 모든 팩트시트는 `research/` 디렉터리에 있으며
  주장별 `file:line` 근거를 포함한다.
