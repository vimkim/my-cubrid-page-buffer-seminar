# CUBRID Page Buffer 완전 분석서 — 총론

- 분석 대상: `src/storage/page_buffer.c` (17,535줄) + `src/storage/page_buffer.h` (522줄)
- 기준 커밋: develop `e6ed61e87` (이 워크트리의 page_buffer.c는 develop과 동일)
- 문서 목적: (1) 주니어·시니어 엔지니어에게 동작 원리를 설명할 수 있는 수준의 이해, (2) 코드를 보지 않고 유사한 page buffer를 재구현할 수 있는 수준의 명세 확보 (`prompt.md`의 목표)
- 모든 세부 근거는 각 챕터에 `page_buffer.c:라인번호`로 부착되어 있다.

## 문서 구성과 읽기 경로

| 챕터 | 파일 | 내용 |
|---|---|---|
| 00 | `00-overview.md` (이 문서) | 큰 그림, 핵심 개념, 시나리오, 동시성 규칙·불변식 종합, 재구현 로드맵, 결함 후보 통합 |
| 01 | `01-structures.md` | 자료구조 16종, 비트 인코딩, 메모리 레이아웃(실측), 초기화/종료, 시스템 파라미터 |
| 02 | `02-fix-unfix-latch.md` | pgbuf_fix 전체 경로, atomic latch, holder, lock-free RO 경로, promote, 락 랭킹 |
| 03 | `03-lru-victim-quota.md` | 3-zone LRU, private/shared, quota 수식, victim 선정, direct victim, AOUT |
| 04 | `04-flush-wal-daemons.md` | dirty 생애주기, WAL rule, victim/checkpoint flush, 데몬 4종, DWB |
| 05 | `05-ordered-fix-dealloc.md` | ordered fix/watcher, dealloc/invalidate, recovery, VPID 페이지 락 |
| 06 | `06-misc-observability.md` | TDE, copy buffer, temp 페이지 규칙, 통계/SHOW 19컬럼, 디버그 안전장치 23종, 외부 모듈 계약 |
| 07 | `07-qa-workbook.md` | 질문·모범답안 워크북 (3레벨 24문항, Mermaid 시각자료) — 팀 학습/온보딩용 |
| 08 | `08-page-buffer-new-plan.md` | `page_buffer_new.cpp` 재구현 계획서 (마일스톤 M0~M8, 테스트 전략) |
| 09 | `09-issue-proposals.md` | JIRA 이슈 제안 목록 (P1~P9, 등록 전 초안) |

읽기 경로 제안:
- **주니어(처음 접함)**: 00 전체 → 01 §2(비트 인코딩)·§4(레이아웃) → 02 §1(흐름도) → 03 §2-3(다이어그램) → 04 §1(dirty 생애주기)
- **시니어(리뷰/디버깅 목적)**: 00 §동시성·§불변식 → 02 §3(락 랭킹)·§4(CAS 결정표) → 03 §9(victim 의사코드) → 04 §2(flush_with_wal) → 05 §2(ordered fix) → 00 §결함 후보
- **재구현 목적**: 00 §재구현 로드맵을 따라가며 각 마일스톤에서 해당 챕터를 정독

---

# 1. 큰 그림

## 1.1 page buffer가 하는 일

CUBRID의 page buffer(pgbuf)는 서버 프로세스 내 단일 전역 인스턴스 `pgbuf_Pool`(`:847`)로, 디스크 페이지(16KB)의 메모리 캐시를 관리한다. 상위 모듈(heap, btree, catalog, log recovery...)은 오직 다섯 가지 계약만 사용한다:

1. **fix** — VPID(볼륨+페이지 ID)로 페이지를 요청하면 메모리 포인터(`PAGE_PTR`)를 준다. 없으면 디스크에서 읽어온다. fix된 페이지는 교체되지 않는다.
2. **latch** — fix는 항상 READ 또는 WRITE 래치와 함께 온다. reader 다수 공존, writer 단독.
3. **unfix** — 사용이 끝나면 반납. fix count가 0이 되면 교체 후보가 될 수 있다.
4. **set_dirty / set_lsa** — 페이지를 수정했음을 알린다. WAL 규칙의 근거가 된다.
5. **flush** — 특정 페이지(또는 전체)를 디스크에 반영시킨다. 체크포인트와 victim 확보가 주 고객.

```
        상위 모듈 (heap / btree / catalog / recovery / vacuum)
             │ fix(vpid, latch) / unfix / set_dirty / set_lsa
             ▼
 ┌───────────────────────── pgbuf_Pool ─────────────────────────┐
 │  buf_hash_table (2^20 버킷) : VPID → BCB                     │
 │  buf_lock_table            : VPID 단위 I/O 락 (중복 read 방지)│
 │  BCB_table + iopage_table  : 제어블록 + 실제 16KB 페이지      │
 │  buf_LRU_list[] : shared N개 + private(세션당 1개) M개        │
 │      각 리스트 = zone1(hot) | zone2(완충) | zone3(victim)     │
 │  buf_AOUT_list  : 쫓겨난 VPID의 최근 역사 (2Q의 Aout)         │
 │  buf_invalid_list : 미사용 BCB 프리리스트                     │
 │  direct_victims / flushed_bcbs / lrus_with_victims : LFCQ    │
 │  데몬 4종: flush / post-flush / maintenance / flush-control   │
 └──────┬────────────────────────────┬──────────────────────────┘
        │ fileio_read / dwb_read     │ fileio_write / dwb_add_page
        ▼                            ▼
      데이터 볼륨                DWB → 데이터 볼륨
                                  ▲
        log manager (logpb_flush_log_for_wal) ── WAL rule 보장
```

## 1.2 설계를 지배하는 네 가지 문제의식

1. **fix/unfix는 초당 수백만 번** — 가장 빈번한 경로에서 전역 락과 캐시 미스를 제거한다. 결과물: 64비트 하나에 팩킹된 atomic latch(`PGBUF_ATOMIC_LATCH`, 01 §2.3), READ 전용 lock-free fast path(02 §6), per-thread 통계 샤딩(`pgbuf_fix_req_cnt`), 64B 캐시라인 정렬 holder anchor.
2. **대량 스캔이 캐시를 오염시키면 안 된다** — 세션(트랜잭션)마다 private LRU를 주고 quota로 크기를 제한한다. 스캔이 읽은 페이지는 그 세션의 private 리스트 안에서만 순환하고, 재사용이 증명된 페이지만 shared로 승격한다 (03 §7, §16).
3. **victim 찾기가 fix 경로를 느리게 하면 안 된다** — victim이 고갈되면 스레드는 스핀하지 않고 잠들고, flush 데몬이 flush 완료 페이지를 **잠든 스레드에게 직접 배정**(direct victim)해서 깨운다 (03 §12, 04 §5.2).
4. **WAL 규칙은 단일 관문에서 강제한다** — 어떤 경로로 flush하든 전부 `pgbuf_bcb_flush_with_wal` 하나로 수렴하고, 그 안에서 "페이지 LSA까지의 로그가 디스크에 있어야 페이지를 쓴다"를 보장한다 (04 §2).

---

# 2. 핵심 개념 10 (주니어 브리핑용)

1. **BCB (Buffer Control Block)** — 페이지 1장당 제어블록 1개(144B). VPID, 뮤텍스, atomic latch, flags, LRU 링크, `oldest_unflush_lsa`를 담는다. 실제 페이지 데이터는 별도 배열 `iopage_table`에 있고 서로 포인터로 연결된다. `PAGE_PTR`에서 상수 오프셋 뺄셈만으로 BCB를 찾는다(`CAST_PGPTR_TO_BFPTR`, 01 §1.3).
2. **flags 한 워드의 3중 인코딩** — 32비트 `flags`에 [비트31-25: 상태 플래그 7종][비트19-16: zone][비트15-0: LRU 인덱스]가 함께 산다. zone 이동, dirty 마킹이 전부 이 워드에 대한 CAS다 (01 §2.1).
3. **atomic latch** — `{latch_mode(16b), waiter_exists(16b), fcnt(32b)}`를 64비트 하나로 묶어 CAS. 경합 없는 fix/unfix는 BCB 뮤텍스조차 잡지 않을 수 있다 (01 §2.3, 02 §4).
4. **fix의 3계층 경로** — ① lock-free fast path(READ+OLD_PAGE류+UNCONDITIONAL, 해시 체인을 락 없이 탐색), ② 정상 경로(hash mutex → BCB trylock), ③ 미스 경로(VPID 락 → BCB 확보 → 디스크 read → 해시 삽입) (02 §1-2).
5. **3-zone LRU** — zone1(hot, victim 불가, unfix해도 boost 안 함), zone2(완충, 나이가 차면 top으로 boost), zone3(victim 존, `count_vict_cand` 집계). victim은 항상 bottom부터 zone3만 스캔한다 (03 §2).
6. **private vs shared LRU** — 세션마다 private 리스트 1개. 새로 읽은 페이지는 private에 들어가고, quota를 넘치면 그 세션 것부터 victim이 된다. "다시 찾은" 페이지(AOUT hit, 또는 활동량 기준)만 shared로 이동 (03 §6-7).
7. **quota** — 100ms 주기 maintenance 데몬이 세션별 활동량(EMA)로 private quota를 재계산한다. 활동 많은 세션이 더 큰 몫을 가진다 (03 §8).
8. **dirty와 WAL** — 페이지 수정 시 `set_dirty` + `set_lsa`. `oldest_unflush_lsa`는 "디스크에 아직 없는 가장 오래된 변경"의 LSA. flush 직전에 반드시 `logpb_flush_log_for_wal(페이지 LSA)`로 로그를 먼저 내린다. temp 페이지는 특수 LSA(-2,-2)로 WAL에서 제외 (04 §1-2).
9. **direct victim** — victim 고갈 시 요청 스레드는 대기 큐(high/low priority)에 등록하고 잠든다. flush 데몬 → post-flush 데몬이 flush 완료 BCB에 `VICTIM_DIRECT` 플래그를 세워 스레드별 우편함(`bcb_victims[thread_idx]`)에 넣고 깨운다. 그 사이 다른 스레드가 그 페이지를 fix하면 `INVALIDATE_DIRECT_VICTIM`으로 바꿔 "무효 알림"만 남긴다 (03 §12).
10. **ordered fix** — heap은 페이지 2장(예: 데이터+overflow)을 동시에 잡는 일이 많다. 래치엔 데드락 탐지기가 없으므로(타임아웃 300초뿐) 전역 순서 `(group_id=heap 헤더 VPID, rank, vpid)`를 강제한다. 순서에 어긋난 fix는 조건부로 시도하고, 실패하면 잡은 페이지를 놓고 순서대로 다시 잡는다. 이때 `page_was_unfixed=true`로 표시해 호출자에게 "페이지 내용 재검증"을 계약으로 요구한다 (05 §1-2).

---

# 3. 시나리오 워크스루

## 3.1 읽기 히트 (가장 빈번)

```
pgbuf_fix(vpid, OLD_PAGE, READ, UNCONDITIONAL)
 → 조건 충족 → pgbuf_lockfree_fix_ro                     (:2311-2330)
    → 해시 체인을 hash_mutex 없이 탐색 (search_hash_chain_no_bcb_lock)
    → atomic latch CAS: latch==READ|NO_LATCH && !waiter_exists → fcnt++
    → holder 엔트리 추가 (스레드 로컬, 락 불필요)
 → PAGE_PTR 반환. BCB 뮤텍스·hash 뮤텍스 모두 안 잡음.
unfix → pgbuf_lockfree_unfix_ro: CAS로 fcnt--. 끝.
```
실패(경합/직전 victim화 감지) 시 정상 경로로 폴백한다. 안전성 근거는 02 §6.

## 3.2 읽기 미스 (디스크 read)

```
hash_mutex 락 → 체인에 없음
 → pgbuf_lock_page: buffer lock 체인에 VPID 등록          (05 §5)
    이미 있으면 대기(같은 페이지 중복 read 방지) 후 재탐색
 → pgbuf_allocate_bcb: ① invalid list → ② pgbuf_get_victim(LFCQ)
    → ③ 실패 시 direct victim 대기 큐 등록 + flush 데몬 wakeup + suspend
 → 확보한 BCB에 VPID 기록, fileio_read (DWB 먼저 조회, :8456)
 → TDE면 복호화 → latch 취득 → 해시 체인 삽입 → unlock_page(대기자 기상)
```
`buf_lock_table` 덕에 동일 페이지에 대한 disk read는 정확히 1회만 발생한다.

## 3.3 페이지 수정

```
pgbuf_fix(WRITE) → 수정 → log_append_*(로그 먼저)
 → pgbuf_set_lsa(pgptr, 로그 LSA)   ← oldest_unflush_lsa 최초 1회 기록
 → pgbuf_set_dirty                  ← flags CAS, dirties_cnt++
 → pgbuf_unfix
```
dirty 페이지는 victim이 될 수 없다(`PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK`). zone3의 dirty는 flush 데몬의 수집 대상이 된다.

## 3.4 버퍼 만석 (victim 고갈 → direct victim)

04 §5.2 케이스 A의 전체 시퀀스가 정본이다. 요약:
```
worker: 할당 실패 → waiter 큐 등록 → flush 데몬 깨움 → suspend
flush 데몬: zone3 bottom의 dirty 수집 → qsort(순차 I/O) → flush_with_wal
           → flush 완료 BCB를 flushed_bcbs 큐로 (FLUSHING 유지)
post-flush 데몬: 큐 소비 → 검증 → VICTIM_DIRECT 세우고 worker 우편함에 배정 → 깨움
worker: 기상 → pgbuf_victimize_bcb(해시 제거) → 새 VPID로 재사용
```

## 3.5 체크포인트

```
logpb_checkpoint → pgbuf_flush_checkpoint(flush_upto_lsa = 새 chkpt LSA)
 → 로그를 먼저 상한까지 flush (배치 선행 WAL, :4158)
 → BCB 테이블 전수 스캔: dirty && oldest_unflush_lsa ≤ 상한 && !temp 만 수집
 → (volid,pageid) 정렬 → seq flusher가 rate control(interval 분할+누적 보정)로 flush
 → victim flush 동시 진행 시 최대 1.5초 양보 (is_flushing_victims)
 → 반환 후 fileio_synchronize_all → redo 시작점 전진
```
recovery와의 정확한 관계(smallest_lsa가 사실상 dead code인 이유 포함)는 04 §4.5.

---

# 4. 동시성 규칙 종합

## 4.1 뮤텍스 계층과 락 랭킹 (02 §3이 정본)

| 순위 | 락 | 비고 |
|---|---|---|
| — | `bcb->mutex` → `hash_mutex` | **블로킹 획득은 이 방향만 허용** (`delete_from_hash_chain`) |
| — | `hash_mutex` 보유 중 `bcb->mutex` | **trylock만 허용**, EBUSY면 hash를 먼저 놓고 재시도 (`search_hash_chain :7646`) |
| — | 두 번째 BCB mutex | 항상 trylock (`:16619-16671` bcbmon이 강제) |
| 하위 | `invalid_mutex`, `free_holder_set_mutex`, LRU mutex, `Aout_mutex` | 서로 겹쳐 잡지 않도록 설계됨 |

파생 규칙: BCB mutex를 든 채 `pgbuf_lock_page`(잠들 수 있음) 호출 금지. holder 조작은 BCB mutex 밖에서.

## 4.2 락 없는 상태 기계 두 개

- `bcb->flags` — 모든 전이는 `pgbuf_bcb_update_flags`의 CAS 루프. zone3 진입/이탈과 dirty 전이의 부수효과(`count_vict_cand`, `dirties_cnt`)를 CAS 성공 후 일괄 반영 (04 §1.2).
- `bcb->atomic_latch` — fix/unfix/promote의 판정과 전이가 전부 64비트 CAS. 판정은 idempotent해야 한다(CAS 실패 시 전체 재판정, 02 §4.2).

## 4.3 "놓았다 다시 잡으면 재검증" 패턴

mutex를 놓은 사이 BCB가 victim화되어 다른 페이지가 될 수 있다. 따라서 재획득 후 반드시 `VPID_EQ(&saved, &current)` (+ fcnt, avoid_victim)를 재확인한다. 등장 지점: victim flush(:3998), checkpoint(:4487), invalidate(:3404-3409), neighbor flush(:12095), ordered fix 재획득 경로. victim 후보 리스트가 `bufptr`와 `vpid`를 쌍으로 저장하는 이유가 이것이다.

---

# 5. 불변식 종합 (재구현 시 보존 목록)

각 챕터의 체크리스트(02 §11 13개, 03 §17 11개, 05 §7 12개)의 상위 종합:

1. `oldest_unflush_lsa != NULL ⇒ dirty` (:2353, :6666 assert)
2. dirty | flushing | victim_direct | invalidate_direct ⇒ victim 후보 아님 (마스크 :258)
3. flush 시작 = {FLUSHING↑, DIRTY↓} 원자 전이 → `count_vict_cand` 불변. flush 성공 시에만 후보 +1
4. flush 실패 시 완전 복원: DIRTY 재설정 + `oldest_unflush_lsa` 복원 + FLUSH 대기자 기상
5. 페이지 write 전에 페이지 LSA까지 로그 flush (WAL). temp 페이지(-2,-2 LSA)는 면제
6. zone은 `PGBUF_GET_ZONE()` 후 동등 비교만 (LRU_3_ZONE = 3<<16 = LRU1|LRU2 비트합이므로 비트 검사 금지)
7. latch fix count(atomic_latch.fcnt)와 hot 판정용 카운터(count_fix_and_avoid_dealloc 상위 16비트)는 별개
8. 블로킹 락 순서: bcb→hash만. hash→bcb는 trylock+후퇴
9. mutex 재획득 후 VPID 재검증 (§4.3)
10. `pgbuf_lock_page`는 소유권을 넘기지 않는다 — WAITER로 깨어난 쪽이 해시를 재탐색
11. WRITE 대기자가 있으면 신규 READ도 블록(writer 기아 방지), 단 기존 holder의 재진입은 허용(자기 데드락 방지)
12. `waiter_exists` 정합화: FLUSH 대기자만 남았다 빠지면 반드시 false로 (idle-grant CAS livelock 방지, :10946, :7077)
13. ordered fix 전역 순서 `(group_id, rank, vpid)` 단일 비교 함수. 조건부 성공은 순서 위반 허용(대기가 없으니 데드락 없음)
14. `fix_count == watch_count` (ordered fix holder). `page_was_unfixed`는 복원 시 지우지 않는다(호출자 재검증 계약)
15. dealloc은 invalidate가 아니다: `ptype=PAGE_UNKNOWN` + dirty + MOVE_TO_LRU_BOTTOM. undo는 compensate 로그로 멱등화
16. avoid_dealloc unregister는 0에서 감소 금지 (victim화로 마커가 사라지는 정상 케이스 존재)

---

# 6. 재구현 로드맵 — `page_buffer_new.cpp` 마일스톤 제안

prompt.md의 "병행 유지하며 조금씩" 학습 계획에 맞춘 증분 단계. 각 단계는 이전 단계만으로 동작 가능하다.

| 단계 | 구현 | 검증 아이디어 | 정본 챕터 |
|---|---|---|---|
| M0 | 자료구조 골격: BCB/iopage 쌍, CAST 매크로, 해시 테이블, invalid list | 구조체 크기/오프셋 static_assert (01 §4 실측치와 대조) | 01 |
| M1 | 단일 스레드 fix/unfix: 해시 조회, 미스 시 invalid list 할당 + read, fcnt | 같은 VPID 재fix가 같은 포인터인지; fcnt 회계 | 02 §2 |
| M2 | 래치: atomic latch CAS 9케이스, 대기 큐, block/wakeup, 재진입, promote | 02 §4.2 결정표를 그대로 단위 테스트로 | 02 §4, §7 |
| M3 | VPID 락(buffer lock): 동일 페이지 중복 read 1회 보장 | 동시 미스 N스레드에서 read 횟수 == 1 | 05 §5 |
| M4 | 단일 shared LRU + 3-zone: add/adjust/fall/boost, victim_hint, victim 선정 | zone 카운트 불변식, bottom 스캔 정지 조건 | 03 §4-5, §9-10 |
| M5 | dirty + flush_with_wal + WAL 스텁: mark_is_flushing 전이, 실패 복원 | 불변식 3·4를 고장 주입 테스트로 | 04 §1-2 |
| M6 | flush 데몬 + victim flush + direct victim: 대기 큐, 우편함, post-flush | 버퍼 만석 부하에서 기아 없음; INVALIDATE 경로 | 03 §12, 04 §3·5 |
| M7 | private LRU + quota + AOUT: 세션 배정, EMA quota, 승격 규칙 | 스캔 오염 시나리오에서 shared hit ratio 유지 | 03 §6-8, §13 |
| M8 | ordered fix + dealloc/invalidate + checkpoint | 05 §1 데드락 타임라인 재현→해소; chkpt redo 전진 | 05, 04 §4 |

이후: TDE/DWB/copy buffer/통계는 06을 참조해 선택 장착.

---

# 7. 결함 후보 통합표

6개 챕터 분석에서 발견된 사항의 종합. "확정"은 코드만으로 단정 가능한 것, "관찰"은 재현 미확인.

| # | 위치 (page_buffer.c) | 내용 | 분류 | 상세 |
|---|---|---|---|---|
| 1 | :2311-2330 + :2513-2517 (도달: :12280-12296) | **[3차 판정 확정]** `pgbuf_fix`의 lockfree fast path가 avoid_dealloc register(:2425-2428)를 건너뛴 채 unregister(:2513-2517)를 실행 — 타 스레드(vacuum)의 보호 마커를 훔쳐 감소 가능. 외부의 pgbuf_fix 직접 호출은 0건이지만 **pgbuf_ordered_fix의 1차 시도(:12291-12296)가 원래 fetch_mode를 그대로 전달**하고, 보유 페이지가 없으면 UNCONDITIONAL(:12280-12284)이라 heap 스캔에서 일상적으로 도달. ordered fix의 unregister(:12702, :12850)는 1차 시도가 실패하며 남긴 register +1과 짝인 의도된 정리(정상 경로 한정). **추가 결함 2건**: 등록 도달 전 실패 후 재정렬 성공 시 -1(드묾), 재정렬 중 실패 시 exit 정리(:12972-12998)가 has_dealloc_prevent_flag를 소비하지 않아 **+1 영구 잔존 → vacuum 회수 영구 제외**. 5가지 진입 상황 회계 표는 CBRD-27263 정본 | **관찰(영향 가능)** | EPIC A2, CBRD-27263 (최종 판정) |
| 3 | :10755, :10767 | flush_with_wal의 TDE/DWB 조기 실패 경로가 FLUSHING 플래그 미복구 → 영구 victim 불가 + 동기 flush 요청자 무한 대기(7050의 무한 대기와 결합 시 hang) | 확정(경로 도달 시) | 04 §9.1, §9.7 |
| 4 | :8456-8461 | claim_bcb_for_fix의 dwb_read_page 실패 경로가 BCB mutex를 든 채 return → 릴리스 빌드에서 영구 잠금 | 확정(방어 경로) | 02 §12 |
| 5 | :15255+:15271 | rv_dealloc_undo_compensate가 미초기화 `VPID`를 debug 로그로 출력 | **확정** (debug 한정) | 05 표#1 |
| 6 | :1626 | direct_victims memset이 잘못된 타입 크기(16B vs 24B) — waiter_threads_low_priority 미초기화(현재는 static 0으로 잠재) | 확정(잠재) | 01 §8.1 |
| 7 | :5851+:1980 | Aout_mutex 이중 pthread_mutex_destroy (init 실패 경로) — UB | 확정(경로 도달 시) | 01 §8.2 |
| 8 | :9407→:9497 | panic_assign_direct_victims가 항상 NULL인 prev_BCB를 받아 즉시 0 반환 — 죽은 코드 | 확정 | 03 발견#1 |
| 9 | :9577, :9586 | direct_victims_maintenance의 두 루프가 초기 조건 모순으로 전혀 실행 안 됨 — victim 공급 백업 플랜 무력화 | **확정** | 03 발견#2 |
| 10 | :4546-4551 | checkpoint smallest_lsa 갱신이 assert(false) 뒤에만 존재 — 정상 시 항상 NULL 반환(호출자가 보정) | 확정 | 04 §9.2 |
| 11 | :14446 / :10585 | victim_rich 계산되나 미소비 / remove_private_from_aout_list 미호출 | 확정(죽은 코드) | 03 발견#3 |
| 12 | :13949 | quota 비활성 시 malloc(0) 반환값 의존 | 이식성 | 01 §8.3 |
| 13 | :12302 | ordered fix P4 루프의 ret_pgptr 덮어쓰기 — 에러 경로에서 엉뚱한 unfix 가능(직전 abort로 노출 제한) | 관찰 | 05 표#4 |
| 14 | :13789, :13798 | get_condition_for_ordered_fix가 HEAP_OVERFLOW rank를 표현 못함 — ordered_fix 순서와 불일치 가능 | 설계 제약 | 05 표#5 |
| 15 | :599-601, :3368, :7050, :8692, :12107 | 소스 내 미해결 TODO: victim_hint 논리 오류 의심, invalidate fcnt>1 안전성, FLUSH 무한 대기, invalidate 중 latch, clean neighbor write | 기존 TODO | 각 챕터 |
| 16 | :11349, :11369 | `pgbuf_dump`가 atomic latch/flags 리팩터링 미반영(`bufptr->fcnt` :11349, `bufptr->zone` :11369; :11361은 신 접근자 공존) — **CUBRID_DEBUG 정의 시 컴파일 불가**, finalize 진단 경로 사장 | 확정 | 06 §10 |
| 17 | :10828, :10833 | **[정정]** `num_pages_written`(:10828, SHOW 컬럼)만 DWB 경유 쓰기 누락(사실상 0). `PSTAT_PB_NUM_IOWRITES`(:10833)는 DWB가 자체 집계(double_write_buffer.cpp:2339, :2115, :2150)해 page당 2회 **과다** 집계 — 한쪽 누락 + 한쪽 이중 | 확정(통계 왜곡) | 06 §10, EPIC N8 |
| 18 | :5497-5501 | `pgbuf_is_temporary_volume`이 `LOG_ISRESTARTED()` 이전 항상 false — 복구 중 temp 페이지가 WAL 면제·LRU 억제·DWB 우회를 전혀 받지 못함 | 관찰 | 06 §10 |
| 19 | :17506-17511 | `SHOW PAGE BUFFER STATUS`의 델타 컬럼 8개가 파괴적 읽기 — 동시 모니터링 세션 간 상호 간섭 | 설계 제약 | 06 §10 |
| 20 | 06 §10 전체 | 그 외 미문서화 사용 제약 13건·설계 결합 4건 (copy buffer와 page validation level ≥3 충돌 등) | 목록 | 06 §10 |

이 표는 업스트림 기여(JIRA 이슈화) 후보 목록으로도 쓸 수 있다. 특히 #1은 재현 시나리오를 만들 가치가 있고(vacuum이 보호 중인 페이지의 조기 dealloc 가능성), #16·#17은 수정이 자명해 소규모 PR 후보다.

---

# 8. 자주 받을 질문 (설명 리허설용)

**Q. 왜 buffer pool 전체에 하나의 LRU가 아니라 리스트 수십 개인가?**
단일 리스트는 모든 fix/unfix가 하나의 mutex에 몰린다. shared를 N개로 샤딩해 경합을 나누고, 세션별 private로 스캔 오염까지 격리한다. victim 탐색도 "victim 있는 리스트 인덱스"만 담는 lock-free 큐(LFCQ)로 리스트 선택 자체를 O(1)로 만든다.

**Q. zone1과 zone2를 왜 나누나? zone1/3만으로 안 되나?**
zone1은 unfix 시 아무 것도 하지 않기 위한 구간이다(가장 빈번한 연산의 비용 최소화). zone2는 zone1에서 떨어진 페이지가 "아직 hot한지" 증명할 기회를 주는 완충이다. zone2에서 나이가 찬 뒤 unfix되면 top으로 boost, 아니면 zone3로 강하한다 (:188-196 주석).

**Q. flush가 페이지 래치를 안 잡는데 어떻게 안전한가?**
flush는 BCB mutex 하에서 페이지를 스택 버퍼로 memcpy한 스냅샷을 쓴다. 이후의 수정은 DIRTY를 다시 세우므로 유실되지 않는다. 동시 flush는 FLUSHING 플래그가 차단하고, WRITE latch 보유자와의 충돌은 safe_flush의 판정(내가 holder인 WRITE만 허용)과 ASYNC_FLUSH_REQ 지연 처리로 푼다.

**Q. direct victim이 왜 필요한가? 그냥 깨우고 다시 찾게 하면?**
버퍼가 포화 상태일 때 "깨어나서 다시 탐색"은 수백 스레드가 같은 zone3 bottom을 두드리는 스탬피드가 된다. flush를 끝낸 쪽이 정확히 한 스레드에게 정확히 한 BCB를 건네는 편이 CPU와 공정성 모두에서 이긴다. 그 대가로 "배정 후 재fix" 경합을 INVALIDATE_DIRECT_VICTIM 플래그로 처리하는 복잡성이 생겼다.

**Q. AOUT은 기본으로 켜져 있나?**
아니다. `data_aout_ratio` 기본값이 0.0이라 기본 비활성이다 (01 §9). 켜면 "최근 쫓겨난 페이지의 재참조"가 zone2 대신 zone1 직행으로 바뀐다.

---

# 9. 다음 단계 (prompt.md 계획과의 연결)

1. ~~철저한 분석서~~ ← 본 문서 세트 (00~06)
2. ~~팀 공유용 문답집~~ ← `07-qa-workbook.md` (Mermaid 시각자료 포함, 마크다운 뷰어용)
3. **인터렉티브 재구현 학습** — `08-page-buffer-new-plan.md`의 M0부터 착수
4. **이슈화** — `09-issue-proposals.md`의 P1~P9 중 팀 리뷰로 선별 후 등록
