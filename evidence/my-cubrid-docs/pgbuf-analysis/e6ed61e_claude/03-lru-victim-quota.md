# CUBRID page_buffer.c — LRU 교체 정책 / victim 선정 / private-shared LRU / quota / AOUT 상세 기술 노트

모든 라인 번호는 `/home/vimkim/gh/cb/pgbuf-analysis/src/storage/page_buffer.c` (17,535줄) 기준.

---

## 1. 자료구조 기반

### 1.1 `PGBUF_LRU_LIST` (587-625행)

```c
struct pgbuf_lru_list {
  pthread_mutex_t mutex;        /* 589 : 리스트 무결성 보호 */
  PGBUF_BCB *top;               /* 591 : 가장 hot (zone1 머리) */
  PGBUF_BCB *bottom;            /* 592 : 가장 cold (zone3 꼬리) */
  PGBUF_BCB *bottom_1;          /* 593 : zone1의 마지막. zone1 비면 NULL */
  PGBUF_BCB *bottom_2;          /* 594 : zone2의 마지막. zone2 비면 NULL */
  PGBUF_BCB *volatile victim_hint; /* 595-596 : victim 탐색 시작점 */
  int count_lru1, count_lru2, count_lru3;  /* 604-606 */
  int count_vict_cand;          /* 609 : zone3 && 무효화 플래그 없는 BCB 수 */
  int threshold_lru1, threshold_lru2;      /* 612-613 : 목표 zone 크기 */
  int quota;                    /* 616 : private 리스트만 사용 */
  int tick_list;                /* 619 : top/middle 삽입 때마다 ++ */
  int tick_lru3;                /* 620 : zone3로 강하할 때마다 ++ */
  volatile int flags;           /* 622 : PGBUF_LRU_VICTIM_LFCQ_FLAG */
  int index;                    /* 624 */
};
```

리스트 링크 방향이 중요하다. `top`의 `prev_BCB == NULL`, `bottom`의 `next_BCB == NULL`이다 (9651-9671, 9787-9812행). 따라서 **`prev_BCB`를 따라가면 bottom→top 방향(cold→hot)으로 올라간다.** victim 탐색은 전부 이 방향이다.

리스트 배열 레이아웃 (771-774행, 1052-1058행):

```
buf_LRU_list[0 .. num_LRU_list-1]                    → shared LRU
buf_LRU_list[num_LRU_list .. TOTAL_LRU_COUNT-1]      → private LRU

PGBUF_SHARED_LRU_COUNT           = pgbuf_Pool.num_LRU_list          (1048)
PGBUF_PRIVATE_LRU_COUNT          = quota.num_private_LRU_list       (1049)
PGBUF_LRU_INDEX_FROM_PRIVATE(p)  = SHARED_LRU_COUNT + p             (1053)
PGBUF_IS_PRIVATE_LRU_INDEX(i)    = (i >= SHARED_LRU_COUNT)          (1058)
```

주석(771-774행)은 아직 "garbage LRU"를 언급하지만 그 개념은 코드에 남아있지 않다 — shared + private 두 종류뿐이다.

### 1.2 zone 인코딩 — `bcb->flags` 하나에 3종 정보 (183-215, 227-262행)

`bcb->flags`(int 32비트)는 **플래그 + zone + lru index**를 동시에 담는다.

```
 31                     24        18   16              0
 ┌──────────────────────┬─────────┬────┬───────────────┐
 │  BCB flags (7종)     │  zone   │    │  lru index    │
 └──────────────────────┴─────────┴────┴───────────────┘
   0x80000000 DIRTY                    16비트 = 최대 64k 리스트
   0x40000000 FLUSHING_TO_DISK         (PGBUF_LRU_NBITS=16, 180-182행)
   0x20000000 VICTIM_DIRECT
   0x10000000 INVALIDATE_DIRECT_VICTIM
   0x08000000 MOVE_TO_LRU_BOTTOM
   0x04000000 TO_VACUUM
   0x02000000 ASYNC_FLUSH_REQ
```

zone 값 (197-212행):

| zone | 값 | 의미 |
|---|---|---|
| `PGBUF_LRU_1_ZONE` | `1<<16` | 가장 hot. **boost 안 함, victim 불가** |
| `PGBUF_LRU_2_ZONE` | `2<<16` | 완충 지대. boost 가능(나이 조건), victim 불가 |
| `PGBUF_LRU_3_ZONE` | `3<<16` | victim 지대. boost 가능, victim 가능 |
| `PGBUF_INVALID_ZONE` | `1<<18` | invalid list 소속 |
| `PGBUF_VOID_ZONE` | `2<<18` | 과도 상태 (디스크 read 후 LRU 삽입 전, 또는 LRU 이탈 후 victim화 전) |

zone 값이 `1<<18` 이상으로 점프하는 이유는 LRU zone 마스크 2비트를 건드리지 않기 위함이다(206-207행 주석).

이 인코딩 덕분에 `pgbuf_bcb_change_zone()`(15826행)과 `pgbuf_bcb_update_flags()`(15733행)가 **단일 CAS로 zone 이동과 플래그 변경을 원자적으로** 처리할 수 있다. `pgbuf_set_dirty`는 LRU mutex 없이 호출될 수 있으므로(15855-15859행 주석) 이 원자성이 필수다.

### 1.3 victim 후보 무효화 마스크 (255-262행)

```c
#define PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK \
  (PGBUF_BCB_DIRTY_FLAG              /* dirty는 victim 불가 */    \
   | PGBUF_BCB_FLUSHING_TO_DISK_FLAG /* flush 중 — 반드시 성공해야 함 */ \
   | PGBUF_BCB_VICTIM_DIRECT_FLAG    /* 이미 다른 스레드에 할당됨 */ \
   | PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG)
```

`pgbuf_bcb_avoid_victim()`(16182행)이 이 마스크만 검사하고, `pgbuf_is_bcb_victimizable()`(9240행)이 여기에 `fcnt == 0 && next_wait_thrd == NULL` 조건을 더한다.

> **중요한 비대칭**: `count_vict_cand`는 **플래그만** 본다(15903-15907, 15834행). fcnt가 양수인 clean zone3 BCB도 후보로 계산된다. 그래서 `count_vict_cand > 0`이어도 실제 victim을 못 찾는 경우가 정상적으로 발생하며, `pgbuf_get_victim_from_lru_list`가 "후보는 세었지만 지금 쓸 수 없음"을 별도로 추적한다(`bufptr_victimizable`, 9362-9385행).

### 1.4 hot 판정 — `count_fix_and_avoid_dealloc` (369-375, 264-266행)

int 하나를 상하위 2바이트로 쪼개 쓴다:

```
 31            16 15             0
 ┌──────────────┬───────────────┐
 │  fix count   │ avoid dealloc │
 └──────────────┴───────────────┘
   PGBUF_BCB_COUNT_FIX_SHIFT_BITS = 16   (265)
   PGBUF_BCB_AVOID_DEALLOC_MASK = 0xFFFF (266)
```

2바이트 원자 연산이 흔하지 않기 때문에 이렇게 합쳤다(371-375행 주석).

- `pgbuf_bcb_register_fix()` (16292행): `PGBUF_FIX_COUNT_THRESHOLD(=64, 106행)`에 도달하기 전까지만 `1<<16` 증가. 임계치 도달 후에는 원자 연산조차 생략 — hot 판정에만 쓰이므로 더 셀 필요가 없다.
- `pgbuf_bcb_is_hot()` (16313행): `count_fix_and_avoid_dealloc >= (64 << 16)`.

---

## 2. 3-zone LRU + private/shared 구조 다이어그램

```
                     ┌───────── 하나의 PGBUF_LRU_LIST ─────────┐

  top ──▶ [B]◀─▶[B]◀─▶[B]◀─▶[B]◀─▶[B]◀─▶[B]◀─▶[B]◀─▶[B] ◀── bottom
          └──── ZONE 1 ────┘└─ ZONE 2 ─┘└──── ZONE 3 ─────┘
                       ▲            ▲                    ▲
                   bottom_1     bottom_2            victim_hint
                                                    (이 아래는 전부 dirty라고 가정)

  count_lru1 = 4      count_lru2 = 2    count_lru3 = 2
  threshold_lru1      threshold_lru2    (threshold 없음 — 나머지 전부)

  zone1 : boost 안 함 ·  victim 불가  ·  가장 hot
  zone2 : boost 가능(나이 조건) · victim 불가 · 완충
  zone3 : boost 항상   ·  victim 가능       ·  count_vict_cand 집계 대상

  탐색 방향:  bottom ──prev_BCB──▶ top    (cold → hot)
  강하 방향:  top    ──next_BCB──▶ bottom (hot → cold)
```

전체 풀:

```
 ┌─────────────────────────── pgbuf_Pool ───────────────────────────┐
 │                                                                  │
 │  buf_invalid_list  (single-linked, next_BCB, invalid_cnt)         │
 │     ┌───┐  기동 시 전체 BCB가 여기 있음 (5862-5869행)             │
 │     │inv│──▶ ... ──▶ NULL                                        │
 │     └───┘                                                        │
 │                                                                  │
 │  buf_LRU_list[]                                                  │
 │  ┌── SHARED (0 .. num_LRU_list-1) ────────────────────────────┐  │
 │  │ LRU 0 : [z1|z2|z3]   threshold = avg_shared × ratio_lru1/2 │  │
 │  │ LRU 1 : [z1|z2|z3]   quota 미사용                          │  │
 │  │  ...            ▲ round-robin 삽입                         │  │
 │  │                 pgbuf_get_shared_lru_index_for_add (8940)  │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │  ┌── PRIVATE (num_LRU_list .. TOTAL-1) ───────────────────────┐  │
 │  │ LRU N   : 세션/vacuum worker 1:1, quota 있음               │  │
 │  │ LRU N+1 : threshold_lru1 = threshold_lru2 = quota × 0.05   │  │
 │  │  ...      ⇒ zone1+zone2 ≤ 10%, zone3가 90% (스캔 격리)     │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  buf_AOUT_list  (VPID만 담는 FIFO + hash, 2Q의 Aout)             │
 │     Aout_top ──▶ ... ──▶ Aout_bottom     max_count 고정 배열     │
 │                                                                  │
 │  LFCQ (victim 있는 리스트 인덱스 큐)                             │
 │     big_private_lrus_with_victims   ┐                            │
 │     private_lrus_with_victims       ├ lockfree::circular_queue   │
 │     shared_lrus_with_victims        ┘                            │
 │                                                                  │
 │  direct_victims                                                  │
 │     bcb_victims[thread_idx]                (스레드별 우편함)     │
 │     waiter_threads_high_priority  (size = n_threads)             │
 │     waiter_threads_low_priority   (size = 2 × n_threads)         │
 │  flushed_bcbs  (8k) : flush 완료 BCB → post-flush 스레드         │
 └──────────────────────────────────────────────────────────────────┘
```

큐 크기는 1778-1845행에서 할당된다: `private/big_private = 2 × PRIVATE_COUNT`, `shared = 2 × SHARED_COUNT`, `flushed_bcbs = PGBUF_FLUSHED_BCBS_BUFFER_SIZE(8k, 759행)`.

---

## 3. BCB 생애주기 상태 전이도

```
                        ┌──────────────────────────────────────┐
                        │           INVALID_ZONE               │
                        │  (buf_invalid_list, vpid = NULL)     │
                        │  초기 상태: 전체 num_buffers 개      │
                        └───────────┬──────────────────────────┘
        pgbuf_put_bcb_into_invalid_list      pgbuf_get_bcb_from_invalid_list
        (8910) ─ pgbuf_invalidate_bcb 경유   (8861) ─ 최우선 할당 경로
                        ▲           │
                        │           ▼
    ┌───────────────────┴──────────────────────────────────────────────┐
    │                        VOID_ZONE                                  │
    │  · 디스크 read 직후, LRU 삽입 전 (8351 pgbuf_claim_bcb_for_fix)   │
    │  · LRU 이탈 직후, victim화 전   (10355 remove_from_lru_list)      │
    │  · direct victim 수령 직후      (15556 pgbuf_get_direct_victim)   │
    └───────────────────┬──────────────────────────────────────────────┘
                        │
              unfix (fcnt→0) 시 pgbuf_unlatch_void_zone_bcb (6847)
                        │
      ┌─────────────────┼─────────────────┬───────────────────────┐
      │ AOUT hit &&     │ AOUT miss       │ AOUT hit but          │
      │ 같은 private    │ (신규 페이지)   │ 다른 리스트 소속      │
      │ 또는 AOUT off   │                 │                       │
      ▼                 ▼                 ▼                       │
 private TOP       private MIDDLE     shared MIDDLE                │
 (add_new_to_top)  (add_new_to_middle) (add_new_to_middle)          │
 = ZONE 1          = ZONE 2            = ZONE 2                    │
      │                 │                 │                        │
      └────────┬────────┴─────────────────┘                        │
               ▼                                                   │
    ┌──────────────────┐  boost (unfix, 나이 조건)                 │
    │    LRU_1_ZONE    │◀───────────────────────┐                  │
    │  victim 불가     │                        │                  │
    └────────┬─────────┘                        │                  │
             │ zone1 초과 → adjust_zone1 (9836) │                  │
             │  bcb_change_zone(→2)             │                  │
             ▼                                  │                  │
    ┌──────────────────┐                        │                  │
    │    LRU_2_ZONE    │──── boost_bcb (10075) ─┤                  │
    │  victim 불가     │     조건: OLD_ENOUGH   │                  │
    └────────┬─────────┘                        │                  │
             │ zone1+2 초과 → adjust_zone2/zones│                  │
             │  pgbuf_lru_fall_bcb_to_zone_3 (10005)               │
             │  ★ 이 지점에서 direct victim 즉시 할당 시도         │
             ▼                                  │                  │
    ┌──────────────────┐                        │                  │
    │    LRU_3_ZONE    │──── boost_bcb (무조건) ┘                  │
    │  victim 가능     │                                           │
    │  count_vict_cand │◀── add_bcb_to_bottom (9787)               │
    │  victim_hint 대상│    · dealloc 예정 페이지                  │
    └────────┬─────────┘    · pgbuf_mark_page_for_lru_bottom       │
             │                                                     │
    ┌────────┴──────────────┬──────────────────┐                   │
    │ pgbuf_get_victim      │ direct victim    │ private→shared    │
    │ _from_lru_list (9270) │ 할당             │ 이동 ─────────────┘
    ▼                       ▼                  (pgbuf_lru_move_from_private_to_shared, 10281
 remove_from_lru_list   assign_direct_victim     → shared MIDDLE 재삽입)
 → VOID_ZONE            (15367)
    │                       │
    │  pgbuf_add_vpid_to_aout_list (10331) ─── VPID를 AOUT에 기록
    ▼                       ▼
 ┌────────────────────────────────────┐
 │   pgbuf_victimize_bcb (8589)        │
 │   hash chain 삭제, latch = INVALID  │
 │   → 새 VPID로 재사용                │
 └────────────────────────────────────┘
                │
                │  AOUT 경유 재승격 경로
                ▼
   같은 페이지 재fix → pgbuf_claim_bcb_for_fix → VOID_ZONE
                     → unfix 시 pgbuf_remove_vpid_from_aout_list가
                       AOUT hit 반환 → private TOP (zone1) 직행
                       ※ AOUT 없으면 MIDDLE(zone2)이었을 것
```

**AOUT 재승격의 핵심**: AOUT은 BCB가 아니라 **VPID만** 기억한다(651-666행). 페이지가 victim된 뒤 다시 읽히면, "이 페이지는 최근에 여기서 쫓겨났다"는 사실로 zone2 대신 zone1로 바로 승격된다 — 2Q의 Aout 역할 그대로다(637-641행 주석).

---

## 4. zone 카운트 / threshold 관리

### 4.1 threshold 설정 (14392-14421행)

```
private LRU:  threshold_lru1 = threshold_lru2 = (int)(quota × PGBUF_LRU_ZONE_MIN_RATIO)
                                              = (int)(quota × 0.05)         (14392-14393)

shared LRU:   avg_shared_lru_size = MAX((num_buffers - all_private_quota) / num_LRU_list,
                                        PGBUF_MIN_SHARED_LIST_ADJUST_SIZE=50)   (14416-14417)
              threshold_lru1 = (int)(avg_shared_lru_size × ratio_lru1)      (14418)
              threshold_lru2 = (int)(avg_shared_lru_size × ratio_lru2)      (14419)
```

`ratio_lru1`/`ratio_lru2`는 `PRM_ID_PB_LRU_HOT_RATIO` / `PRM_ID_PB_LRU_BUFFER_RATIO`에서 오고 1685-1693행에서 클램핑된다:

```
ratio_lru1 ∈ [0.05, 0.90]                                    (1687-1688)
ratio_lru2 ∈ [0.05, 1 - 0.05 - ratio_lru1]                   (1689-1690)
⇒ 0.099 ≤ ratio_lru1 + ratio_lru2 ≤ 0.951                    (1692-1693)
```

**설계 대비**: shared는 사용자 파라미터 비율을 쓰지만 **private은 무조건 quota의 5%+5%**다. 즉 private 리스트는 구조적으로 zone3가 90%를 차지한다. 이것이 스캔 오염 방지의 핵심 메커니즘이다 (§13 참조).

### 4.2 zone 판정 매크로 (1013-1022행)

```c
PGBUF_LRU_ZONE_ONE_TWO_COUNT(l)              = count_lru1 + count_lru2
PGBUF_LRU_LIST_COUNT(l)                      = count_lru1 + count_lru2 + count_lru3
PGBUF_LRU_VICTIM_ZONE_COUNT(l)               = count_lru3
PGBUF_LRU_IS_ZONE_ONE_OVER_THRESHOLD(l)      = threshold_lru1 < count_lru1
PGBUF_LRU_IS_ZONE_TWO_OVER_THRESHOLD(l)      = threshold_lru2 < count_lru2
PGBUF_LRU_ARE_ZONES_ONE_TWO_OVER_THRESHOLD(l)= threshold_lru1+threshold_lru2 < count_lru1+count_lru2
```

### 4.3 `pgbuf_lru_adjust_zone1` (9836-9884행)

```
threshold = min_one ? MAX(1, threshold_lru1) : threshold_lru1
if threshold >= count_lru1: return                          (9846-9850)

if bottom_2 == NULL: bottom_2 = bottom_1                    (9857-9861)
for (b = bottom_1; threshold < count_lru1; b = b->prev_BCB)
    pgbuf_bcb_change_zone(b, index, PGBUF_LRU_2_ZONE)       (9863-9866)
bottom_1 = (count_lru1 == 0) ? NULL : b                     (9869-9878)
```

`count_lru1`은 `pgbuf_bcb_change_zone` 내부에서 감소하므로(15883-15885행) 루프 조건이 자동으로 종료된다. BCB 링크는 건드리지 않고 **zone 라벨만 바꾼다** — 이것이 3-zone 설계의 저비용 핵심이다.

### 4.4 `pgbuf_lru_adjust_zone2` (9889-9936행)

동일 패턴이지만 `pgbuf_lru_fall_bcb_to_zone_3()`를 호출한다(9920행). `bcb_prev`를 미리 저장하는데(9917행), fall 함수가 BCB를 리스트에서 제거할 수 있기 때문이다(direct victim 할당 시).

### 4.5 `pgbuf_lru_adjust_zones` (9939-10002행) — 2단 캐스케이드

```
1) threshold = min_one ? MAX(1, thr1+thr2) : thr1+thr2
   if threshold >= count_lru1+count_lru2:
       → adjust_zone1만 실행하고 return                     (9950-9956)
2) b = (bottom_2 ?: bottom_1) 에서 시작해 zone1+2 합이 threshold까지
   내려갈 때까지 fall_bcb_to_zone_3                         (9961-9971)
3) bottom_1 / bottom_2 갱신                                 (9973-9987)
4) adjust_zone1 재실행 (zone1→zone2 승계)                   (9991)
```

2단계에서 zone2가 소진되면 zone1 BCB가 **zone2를 건너뛰고 바로 zone3로** 강하한다(9967행 assert가 `!= LRU_3_ZONE`만 확인).

### 4.6 `pgbuf_lru_fall_bcb_to_zone_3` (10005-10065행)

```
if SERVER_MODE && is_bcb_victimizable(bcb, false) && 대기 스레드 존재:      (10011)
    if bcb_is_to_vacuum(bcb):  → fall through (vacuum 예정 페이지는 직접 할당 안 함) (10013-10020)
    else if PGBUF_BCB_TRYLOCK(bcb) == 0:                                    (10027)
        if is_bcb_victimizable(bcb, true) && assign_direct_victim(bcb):      (10030)
            remove_from_lru_list(bcb)      ← 이미 두 mutex 보유 중이므로 즉시 처리
            add_vpid_to_aout_list(vpid_copy, index)                          (10042)
            return                          ← zone3에 들어가지도 않음
    else: fall through   /* "don't try too hard" */                          (10052)

bcb->tick_lru3 = lru_list->tick_lru3;  lru_list->tick_lru3++  (wrap at INT32_MAX) (10058-10062)
pgbuf_bcb_change_zone(bcb, index, PGBUF_LRU_3_ZONE)                          (10064)
```

여기서 `vpid_copy`를 미리 떠 두는 것(10029행)이 중요하다 — `remove_from_lru_list` 후 BCB unlock하면 다른 스레드가 vpid를 바꿀 수 있다.

TRYLOCK을 쓰는 이유는 lock 순서 역전 방지다: 정상 순서는 BCB → list인데, 여기서는 이미 list mutex를 들고 있다(10021-10026행 주석).

### 4.7 tick 의미 정리

| 필드 | 증가 시점 | 용도 |
|---|---|---|
| `lru_list->tick_list` | `add_bcb_to_top`(9682), `add_bcb_to_middle`(9765) | BCB 나이 계산 (boost 여부) |
| `bcb->tick_lru_list` | 신규 삽입 시 `= lru_list->tick_list` (10158, 10193, 10228) | 삽입 당시 리스트 나이 |
| `lru_list->tick_lru3` | `fall_bcb_to_zone_3`(10060) | zone3 내 순서 |
| `bcb->tick_lru3` | fall 시 `= lru_list->tick_lru3`(10058); bottom 삽입 시 `bottom->tick_lru3 - 1`(9814-9816) | victim_hint 우선순위 |

`add_bcb_to_bottom`은 `tick_list`를 증가시키지 않는다 — 새 hot BCB가 아니기 때문이다. 또한 `tick_lru3`를 현재 bottom보다 **작게** 설정해 "가장 오래됨"으로 만든다(9814-9822행, 음수면 `+= DB_INT32_MAX`).

나이 계산 (1004-1011행):

```c
PGBUF_AGE_DIFF(bcb_age, list_age) =
    (list_age >= bcb_age) ? (list_age - bcb_age)
                          : (DB_INT32_MAX - (bcb_age - list_age))   /* wrap 처리 */

PGBUF_IS_BCB_OLD_ENOUGH(bcb, l) =
    PGBUF_AGE_DIFF(bcb->tick_lru_list, l->tick_list) >= (l->count_lru2 / 2)
```

임계치가 **zone2 크기의 절반**이라는 점이 영리하다. zone2가 작으면 금방 "늙은" 것으로 판정되고, zone2가 크면 오래 기다려야 한다 — 완충 지대를 절반쯤 통과했으면 재평가할 만하다는 의미다. `count_lru2 == 0`이면 임계치 0이므로 항상 통과한다.

---

## 5. 리스트 조작 프리미티브

### 5.1 `pgbuf_lru_add_bcb_to_top` (9649-9688행)

`bcb->prev_BCB = NULL; bcb->next_BCB = top;` 후 top 갱신. `bottom_1 == NULL`(zone1 공백)이면 `bottom_1 = bcb`로 설정(9673-9679). `tick_list++` 후 `change_zone(→ZONE 1)`.

### 5.2 `pgbuf_lru_add_bcb_to_middle` (9699-9772행)

zone1/zone2 **경계**(= `bottom_1` 직후)에 삽입해 ZONE 2가 된다.

- `bottom_1 == NULL` (zone1 공백):
  - 리스트 자체가 비었으면 top=bottom=bcb (9707-9716)
  - 아니면 top 앞에 삽입하고 top 갱신 (9719-9734). `assert(zone(top) != LRU_1_ZONE)`로 정합성 확인.
- `bottom_1 != NULL`: `bottom_1` 다음에 삽입. `bottom_1->next_BCB == NULL`이면 bottom도 갱신 (9752-9758).
- `bottom_2 == NULL`이면 `bottom_2 = bcb` (9761-9765).
- `tick_list++`, `change_zone(→ZONE 2)`.

### 5.3 `pgbuf_lru_add_bcb_to_bottom` (9787-9833행)

bottom 뒤에 붙이고 ZONE 3. `tick_lru3`를 현재 bottom보다 작게 잡아 victim 우선순위 최상위로 만든다.

### 5.4 `pgbuf_lru_add_new_bcb_to_{top,middle,bottom}` (10150, 10186, 10218행)

VOID_ZONE BCB용 래퍼. 공통 동작: `assert(!PGBUF_IS_BCB_IN_LRU(bcb))` → list mutex lock → `bcb->tick_lru_list = lru_list->tick_list` → add → zone 조정 → unlock.

zone 조정 범위가 다르다:
- `to_top`: `adjust_zones(min_one=true)` — zone1이 커졌으니 전체 캐스케이드 (10166)
- `to_middle`: `adjust_zone2(min_one=true)` — zone2만 (10197)
- `to_bottom`: **조정 없음**. 대신 진입 시 `is_bcb_victimizable && assign_direct_victim` 먼저 시도하고 성공하면 리스트에 넣지도 않고 return (10224-10229)

### 5.5 `pgbuf_remove_from_lru_list` (10312-10358행) — LRU mutex 필수

top/bottom/bottom_1/bottom_2 각각 갱신 후 링크 재연결. `bottom_2` 처리가 특수하다(10331-10341):

```c
if (lru_list->bottom_2 == bufptr) {
    if (bufptr->prev_BCB != NULL && zone(bufptr->prev_BCB) == PGBUF_LRU_2_ZONE)
        lru_list->bottom_2 = bufptr->prev_BCB;
    else {
        assert (lru_list->count_lru2 == 1);
        lru_list->bottom_2 = NULL;
    }
}
```

`bottom_1`은 무조건 `prev_BCB`로 밀지만(10327-10330) `bottom_2`는 zone 확인이 필요하다 — zone2가 1개뿐이면 이전 BCB는 zone1이기 때문이다.

마지막에 `pgbuf_lru_advance_victim_hint(prev_hint=bufptr, new_hint=bcb_prev, was_updated=false)`(10355) 후 `change_zone(0, PGBUF_VOID_ZONE)`(10358). **hint 갱신은 링크 해제 후에** 해야 하는데, 그렇지 않으면 다른 스레드가 이 BCB를 다시 hint로 지정할 수 있다(10350-10353행 주석).

### 5.6 `pgbuf_lru_boost_bcb` (10075-10139행)

```
zone = get_zone(bcb);  assert(zone != PGBUF_LRU_1_ZONE)      (10100)
perfmon: zone2면 UNFIX_LRU_TWO_{PRV,SHR}_TO_TOP
         zone3면 UNFIX_LRU_THREE_{PRV,SHR}_TO_TOP            (10103-10113)
lock(list)
  remove_from_lru_list(bcb)     ← 여기서 zone이 VOID로 바뀜
  add_bcb_to_top(bcb)           ← 다시 ZONE 1
  if zone == LRU_2_ZONE: adjust_zone1(min_one=true)          (10123-10127)
  else:                  adjust_zones(min_one=true)          (10129-10132)
unlock(list)
```

조정 범위가 다른 이유: zone2→top이면 zone1이 +1, zone2가 -1이므로 zone1만 넘칠 수 있다. zone3→top이면 zone1 +1, zone3 -1이므로 zone1→zone2→zone3 전체 캐스케이드가 필요하다.

10084-10098행의 boost 규칙 주석이 설계 의도를 명시한다:
1. zone1은 절대 boost 안 함 — 가장 뜨거운 구간이고 victim 위험이 없으므로 mutex 잡을 이유가 없다.
2. 새롭고 차가운 BCB는 boost 회피 — "많은 연산이 페이지를 최소 두 번 fix한다(읽기 1회 + 쓰기 1회). 두 번째 unfix에서 boost하는 것을 피하고 싶다." → `PGBUF_IS_BCB_OLD_ENOUGH`가 이 필터다.
3. zone3는 충분히 늙었으므로 항상 boost.

### 5.7 `pgbuf_lru_move_from_private_to_shared` (10281-10298행)

```
assert(IS_PRIVATE_LRU_INDEX(get_lru_index(bcb)))
pgbuf_lru_remove_bcb(bcb)                                    (10290)
pgbuf_lru_add_new_bcb_to_middle(bcb, pgbuf_get_shared_lru_index_for_add())  (10293)
pgbuf_bcb_register_hit_for_lru(bcb)                          (10295)
```

**TOP이 아니라 MIDDLE**에 삽입한다. shared 리스트에서는 아직 검증되지 않았다는 의미다. 통계 분석 결과 private→shared 이동이 매우 드물기 때문에 inline하지 않았다(10286행 주석).

### 5.8 `pgbuf_move_bcb_to_bottom_lru` (10365-10409행)

`PGBUF_BCB_MOVE_TO_LRU_BOTTOM_FLAG`를 세운 뒤:
- VOID_ZONE: 스레드의 private(또는 shared round-robin) 리스트 bottom에 신규 삽입 — flush 스레드가 찾을 수 있게 하려는 목적 (10375-10386)
- LRU zone: 이미 bottom이면 early out, 아니면 remove → add_to_bottom (10388-10402)

호출자는 `pgbuf_dealloc_page` 계열과 `pgbuf_mark_page_for_lru_bottom()`(16158-16167행, CBRD-27041 통계 수집용 스캔)이다.

---

## 6. unfix 시 zone 결정 — `pgbuf_unlatch_bcb_upon_unfix` (6608-6828행)

fcnt를 CAS 루프로 감소시키고(6627-6653), `fcnt == 0`이 되었을 때만 zone 로직이 돌아간다.

```
if (is_zero_fcnt):
  if bcb_should_be_moved_to_bottom_lru(bcb):                  (6670)
      pgbuf_move_bcb_to_bottom_lru(bcb)          ← dealloc/스캔 경로 최우선
  elif blocked_reader_writer == false:                        (6673)
      thread_p->pgbuf_pg_unfix_cnt++             ← per-thread 샤딩, atomic 없음 (6676-6679)
      th_lru_idx = HAS_PRIVATE_LRU ? LRU_INDEX_FROM_PRIVATE(...) : -1  (6681-6688)

      switch (get_zone(bcb)):

      VOID_ZONE:  pgbuf_unlatch_void_zone_bcb(bcb, th_lru_idx)   (6695)
                  /* 주석 6691-6694: "거의 안 쓰이거나 히트율이 매우 낮을 때
                     몇 % 정도. 최적화 필요 없으니 inline하지 않았다" */

      LRU_1_ZONE: if SHOULD_IGNORE_UNFIX: 통계만, 아무것도 안 함  (6705-6711)
                  if should_move_private_to_shared: → shared MIDDLE (6712-6718)
                  else: 이동 없음 + register_hit_for_lru          (6720-6730)
                  /* 6698-6699: "가장 자주 실행되는 코드, 고도로 최적화 필요" */

      LRU_2_ZONE: if SHOULD_IGNORE_UNFIX: 통계만                 (6734-6740)
                  if should_move_private_to_shared: → shared MIDDLE (6741-6747)
                  if PGBUF_IS_BCB_OLD_ENOUGH: boost_bcb           (6748-6752)
                  else: 유지 (아직 boost 자격 판단 불가)          (6753-6763)
                  register_hit_for_lru                            (6765)

      LRU_3_ZONE: if SHOULD_IGNORE_UNFIX:                         (6769)
                      if !avoid_victim && assign_direct_victim: 즉시 victim 공급 (6771-6778)
                      else: 유지                                  (6780-6783)
                  if should_move_private_to_shared: → shared MIDDLE (6785-6791)
                  boost_bcb (무조건)                              (6793)
                  register_hit_for_lru                            (6794)
  pgbuf_wakeup_reader_writer(bcb)                              (6803)

if bcb_is_async_flush_request(bcb):
    pgbuf_bcb_safe_flush_force_unlock(bcb, false)              (6819)
else:
    PGBUF_BCB_UNLOCK(bcb)                                      (6825)
```

`blocked_reader_writer == true`면 zone 로직 전체를 건너뛴다 — 대기자가 있으니 곧 다시 fix될 것이고, 그 스레드가 처리하게 한다.

### 6.1 `PGBUF_SHOULD_IGNORE_UNFIX` (288-294행)

```c
#define PGBUF_SHOULD_IGNORE_UNFIX(th, buf) \
  (VACUUM_IS_THREAD_VACUUM_WORKER (th) || pgbuf_is_temporary_volume (buf->vpid.volid))
```

vacuum worker와 temp 볼륨 페이지는 **BCB를 hot으로 승격시키지 못한다.** CS_MODE/SA_MODE에서는 `false`로 컴파일된다(293-294행).

`PGBUF_VACUUM_SHOULD_IGNORE_UNFIX` (281-285행)는 vacuum만 검사하며, `pgbuf_unlatch_void_zone_bcb`에서만 쓰인다 — VOID zone에서는 temp 볼륨 판정을 하지 않는다.

이 두 매크로가 vacuum을 차별하는 이유는 명시적이다: "vacuum workers and checkpoint thread should not contribute to promoting a bcb as active/hot"(280행). vacuum은 전체 힙을 훑기 때문에, 이를 hit으로 세면 vacuum이 지나간 모든 페이지가 hot으로 오인되어 실제 워크로드의 working set을 밀어낸다.

### 6.2 `pgbuf_unlatch_void_zone_bcb` (6847-6945행) — 신규 페이지 배치 규칙

```
aout_enabled = (buf_AOUT_list.max_count > 0)
aout_list_id = pgbuf_remove_vpid_from_aout_list(bcb->vpid)   ← AOUT에서 제거하고 원래 LRU idx 회수 (6856-6858)

if VACUUM_SHOULD_IGNORE_UNFIX:                               (6860)
    perfmon: UNFIX_VOID_AOUT_{FOUND,NOT_FOUND}_VAC
    if !avoid_victim && assign_direct_victim(bcb):           (6874)
        add_vpid_to_aout_list(vpid, aout_list_id)            (6883-6886)
        return                    ← vacuum이 읽은 페이지는 즉시 victim으로 재활용
    aout_list_id = PGBUF_AOUT_NOT_FOUND    ← 강제 리셋 (6891)
else:
    perfmon: UNFIX_VOID_AOUT_{FOUND,NOT_FOUND}

if th_lru_idx != -1:                    /* 스레드가 private 리스트를 가짐 */
    if VACUUM_SHOULD_IGNORE_UNFIX:
        add_new_bcb_to_top(private)      ← register_hit 없음 (6906-6911)
        return
    if !aout_enabled || th_lru_idx == aout_list_id:
        add_new_bcb_to_top(private) + register_hit           (6913-6920)
        ★ AOUT에서 "내 리스트에서 쫓겨났던 페이지"로 확인 → 즉시 ZONE 1
    if aout_list_id == PGBUF_AOUT_NOT_FOUND:
        add_new_bcb_to_middle(private) + register_hit         (6922-6929)
        ★ 이력 없는 신규 페이지 → ZONE 2 (검증 대기)
    /* AOUT에 있지만 다른 리스트 소속 → fall through */

add_new_bcb_to_middle(shared, get_shared_lru_index_for_add())  (6934-6935)
if !VACUUM_SHOULD_IGNORE_UNFIX: register_hit_for_lru           (6937-6940)
```

AOUT이 비활성(`aout_ratio <= 0`)이면 `!aout_enabled`가 참이 되어 **모든 페이지가 private TOP으로** 간다. 즉 AOUT이 꺼지면 correlated reference 판별 능력을 잃고 낙관적 정책으로 후퇴한다.

"AOUT에 있지만 다른 private 리스트 소속"이 shared로 가는 것이 2Q + private 조합의 정수다: 두 개 이상의 트랜잭션이 이 페이지를 만졌다는 증거이므로 공유 페이지로 분류한다.

### 6.3 `pgbuf_should_move_private_to_shared` (6953-6990행)

```c
bcb_lru_idx = get_lru_index(bcb);
if (IS_SHARED_LRU_INDEX(bcb_lru_idx))  return false;   /* private 아님 */   (6957-6961)

/* 조건 1: 다른 트랜잭션이 fix했다 */
if (thread_private_lru_index != bcb_lru_idx)  return true;                  (6968-6971)

/* 조건 2: 매우 hot하고 충분히 늙었다 */
if (!pgbuf_bcb_is_hot(bcb))                          return false;          (6973-6977)
if (!PGBUF_IS_BCB_OLD_ENOUGH(bcb, GET_LRU_LIST(bcb_lru_idx))) return false; (6978-6982);
return true;
```

조건 1이 즉발이라는 점이 중요하다. private 리스트는 "한 트랜잭션 전용"이라는 불변식을 유지해야 하므로, 다른 스레드가 이 BCB를 unfix하는 순간 소유권 위반이 확인되고 즉시 shared로 이동한다. 조건 2는 같은 스레드가 계속 쓰는 페이지라도 64회 이상 fix되고 늙었으면 공유 자원으로 승격시킨다 — B-tree root, heap header 같은 페이지가 여기 해당한다.

---

## 7. private vs shared LRU

### 7.1 private 리스트 개수 (13897-13921행)

```
SERVER_MODE:
  num_private_LRU_list = PRM_ID_PB_NUM_PRIVATE_CHAINS
  == -1 → MAX_NTRANS + VACUUM_MAX_WORKER_COUNT   (자동)      (13900-13904)
  == 0  → 비활성                                             (13905-13908)
  기타  → MAX(값, PGBUF_PRIVATE_LRU_MIN_COUNT=4)             (13910-13916)
SA_MODE: 0 (항상 비활성)                                     (13918-13920)

PGBUF_PAGE_QUOTA_IS_ENABLED = (num_private_LRU_list > 0)     (1032)
```

### 7.2 shared 리스트 개수 (5695-5750행)

```
num_LRU_list = PRM_ID_PB_NUM_LRU_CHAINS
if == 0:
    num_LRU_list = MAX_NTRANS
    if num_buffers / num_LRU_list < PGBUF_MIN_PAGES_IN_SHARED_LIST(1000):
        num_LRU_list = num_buffers / 1000                    (5707-5710)
    num_LRU_list = MAX(num_LRU_list, 4)                      (5713)
```

리스트당 최소 1000 페이지를 보장한다 — 너무 잘게 쪼개면 각 리스트가 작아져 zone 구분이 무의미해지고 victim 탐색이 비효율적이 된다.

### 7.3 private 리스트 할당 — `pgbuf_assign_private_lru` (14457-14539행)

우선순위(14480-14482행 주석):
1. **세션 0개이면서 페이지 수가 가장 적은** 리스트
2. 없으면 **activity가 가장 낮은** 리스트

```
retry:
  for i in [SHARED_LRU_COUNT, TOTAL_LRU_COUNT):
      if private_lru_session_cnt[private_id(i)] == 0:
          if LRU_LIST_COUNT(i) < min_bcbs:
              min_bcbs = ...; lru_cand_zero_sessions = i
              if min_bcbs <= 0: break          ← 완전히 빈 리스트 즉시 채택
      if lru_activity[i] < min_activity:
          min_activity = ...; lru_cand_idx = i
  if lru_cand_zero_sessions != -1: lru_cand_idx = lru_cand_zero_sessions

  if 무세션 후보였다면:
      if ATOMIC_INC_32(&session_cnt[private_idx], 1) > 1:    ← 경쟁 탐지
          if retry_cnt++ < 5: 되돌리고 goto retry            (14521-14529)
  else: ATOMIC_INC_32(&session_cnt[private_idx], 1)

pgbuf_adjust_quotas(thread_p)                                (14538)
return private_idx
```

`min_activity` 초기값이 `PGBUF_TRAN_MAX_ACTIVITY`(277행)라서 모든 리스트가 최대 활동 중이면 `lru_cand_idx == -1`이 되고 14515행 assert가 걸린다 — 실제로는 무세션 후보가 거의 항상 존재한다.

호출자: `session.c:740` (세션 생성), `vacuum.c:1270` (vacuum worker 초기화). 해제는 `session.c:406`.

### 7.4 스레드 → private 인덱스 매핑 (1035-1046행)

```c
#define PGBUF_PRIVATE_LRU_FROM_THREAD(thread_p) \
  ((thread_p) != NULL) ? ((thread_p)->private_lru_index) : (0)

static bool PGBUF_THREAD_HAS_PRIVATE_LRU (THREAD_ENTRY *thread_p)
{ return thread_p != NULL && thread_p->m_is_private_lru_enabled; }
```

`private_lru_index`는 `server_support.c:2081`에서 세션으로부터 스레드에 복사되고, `m_is_private_lru_enabled`가 별도 게이트다. 즉 인덱스가 있어도 비활성화될 수 있다.

### 7.5 `pgbuf_release_private_lru` (14550-14563행)

session_cnt를 감소시키고 0 이하가 되면 `lru_activity[]`를 0으로 리셋한 뒤 `pgbuf_adjust_quotas`를 호출한다 — 다음 adjust에서 이 리스트의 quota가 0으로 떨어지고 모든 BCB가 over-quota가 되어 victim 대상이 된다.

### 7.6 shared 삽입 인덱스 — `pgbuf_get_shared_lru_index_for_add` (8940-9010행)

라운드로빈 + 최대 리스트 회피:

```
lru_idx = ATOMIC_INC_32(&quota.add_shared_lru_idx, 1)
PAGE_ADD_REFRESH_STAT = MAX(2 × num_buffers / SHARED_LRU_COUNT, 10000)      (8946-8947)

if lru_idx % PAGE_ADD_REFRESH_STAT == 0:      /* 주기적 재계산 */
    전체 shared 리스트 스캔 → sum, max_bcb, min_bcb, lru_idx_with_max
    if sum > num_buffers/10 && (max_bcb > 1.3 × sum/SHARED_COUNT || max_bcb > 2 × min_bcb):
        avoid_shared_lru_idx = lru_idx_with_max                              (8984-8989)
    else:
        if avoid_idx == -1 || COUNT(avoid_idx) < sum/SHARED_COUNT:
            avoid_shared_lru_idx = -1     /* 불균형 해소 */                  (8991-8999)

lru_idx %= SHARED_LRU_COUNT
if avoid_shared_lru_idx == lru_idx:  lru_idx = (++add_shared_lru_idx) % SHARED_LRU_COUNT  (9004-9008)
```

회피 리스트는 victim화를 통해 자연히 줄어든다(736-738행 주석).

### 7.7 activity 지표 (274-277행)

```c
#define PGBUF_TRAN_THRESHOLD_ACTIVITY (pgbuf_Pool.num_buffers / 4)
#define PGBUF_TRAN_MAX_ACTIVITY (10 * PGBUF_TRAN_THRESHOLD_ACTIVITY)  /* = num_buffers × 2.5 */
```

268-273행 주석: "각 LRU의 활동이 탐지되고 누적된다. 긴 이력 누적 효과를 피하려고 활동 지표에 상한을 둔다. 비활동 임계치가 정의되어 있다: 이 임계치 아래로 떨어지는 private LRU는 파괴되고 BCB들이 victim화된다."

실제 코드에서 `PGBUF_TRAN_MAX_ACTIVITY`는 `pgbuf_assign_private_lru`의 `min_activity` 초기값으로만 쓰이고(14486행), `PGBUF_TRAN_THRESHOLD_ACTIVITY`는 `pgbuf_adjust_quotas`의 조정 트리거로만 쓰인다(14256, 14261행). 주석이 설명하는 "파괴" 동작은 quota→0을 통해 간접적으로만 구현되어 있다.

---

## 8. Quota 계산 수식

### 8.1 `PGBUF_PAGE_QUOTA` (718-738행)

```c
struct pgbuf_page_quota {
  int num_private_LRU_list;                    /* 720 */
  float *lru_victim_flush_priority_per_lru;    /* 723 : LRU별 flush 우선순위 */
  int *private_lru_session_cnt;                /* 725 : private만 */
  float private_pages_ratio;                   /* 726 : 전체 BCB 중 private 비율 */
  unsigned int add_shared_lru_idx;             /* 729 : shared 라운드로빈 */
  int avoid_shared_lru_idx;                    /* 730-733 : 최대 리스트 회피 */
  TSC_TICKS last_adjust_time;                  /* 735 */
  INT32 adjust_age;                            /* 736 : hit 중복 카운트 방지 세대 */
  int is_adjusting;                            /* 737 : 재진입 방지 */
};
```

### 8.2 조정 주기 (14198-14262행 + 17106-17117행)

`pgbuf-maintain` 데몬이 **100ms 주기**로 `pgbuf_page_maintenance_execute`(16953행)를 실행하고, 이것이 `pgbuf_adjust_quotas`를 호출한다(16961행). 추가로 `pgbuf_assign_private_lru`(14538행)와 `pgbuf_release_private_lru`(14559행)에서도 호출된다.

조기 반환 조건:

```
if !PAGE_QUOTA_IS_ENABLED || is_adjusting:                     return   (14232-14235)
is_adjusting = 1
diff_usec = elapsed(now, last_adjust_time)
if diff_usec < 1000:                                           return   (14241-14246)
if sum_pg_unfix(reset=false) < THRESHOLD_ACTIVITY && diff_usec < 500000: return (14256-14260)
if sum_pg_unfix(reset=true)  < THRESHOLD_ACTIVITY / 100:  low_overall_activity = true (14261-14264)
last_adjust_time = now;  adjust_age++
```

즉 실제 조정 조건은 **(unfix 수 ≥ num_buffers/4) OR (500ms 경과)** 이며 최소 간격 1ms이다.

### 8.3 hit / activity 수식 (14272-14314행)

각 리스트 i에 대해:

```
h_i = 10^6 × ATOMIC_TAS(lru_hits[i], 0) / Δt_μs      [hits/sec]
```

private 리스트의 activity는 **10초 창 지수 이동 평균**:

```
             ⎧ h_i                                                    , Δt ≥ 10^7 μs
a_i  ←       ⎨
             ⎩ ((10^7 − Δt) × a_i^old + Δt × h_i) / 10^7              , Δt < 10^7 μs
```

(14286-14297행. 상수 `tensec_usec = 10 × 10^6`)

집계:

```
A     = Σ_{i ∈ private} a_i
H_prv = Σ_{i ∈ private} h_i
H_shr = Σ_{i ∈ shared}  h_i
V_tot = Σ_{i ∈ all} count_vict_cand_i          (14313)
```

### 8.4 private 비율 (14316-14343행)

```
        ⎧ 0.01  (= MIN_PRIVATE_RATIO)                                  , low_overall_activity
r =     ⎨
        ⎩ clamp( H_prv / (H_prv + max(1, H_shr)),  0.01,  0.998 )      , otherwise
```

(`MAX_PRIVATE_RATIO = 0.998`, `MIN_PRIVATE_RATIO = 0.01`, 14200-14201행)

`private_pages_ratio` 역시 10초 EMA:

```
        ⎧ r                                                  , Δt ≥ 10^7
ρ  ←    ⎨
        ⎩ (ρ^old × (10^7 − Δt) + r × Δt) / 10^7              , Δt < 10^7
```

(14335-14343행). 초기값은 quota 활성 시 `1.0f`(13968-13975행).

### 8.5 private quota 배분 (14345-14411행)

**A) `A == 0` (private 활동 전무)** — 모든 private quota를 0으로:

```
quota_i = 0,   thr1_i = thr2_i = 0                (14351-14354)
```

이후 `count_lru1 + count_lru2 > 0`이면 `adjust_zones(min_one=false)`로 zone1/2를 완전히 비워 전부 zone3로 강하시킨다(14355-14361). `min_one=false`가 핵심 — zone1/2에 1개도 남기지 않는다.

**B) `A > 0`:**

```
Q_all   = floor( (num_buffers − invalid_cnt) × ρ )                        (14367-14368)

quota_i = min( floor( (a_i / A) × Q_all ),  5000,  num_buffers / 2 )      (14373-14389)
          ↑ PGBUF_PRIVATE_LRU_MAX_HARD_QUOTA = 5000 (1026행)

thr1_i  = thr2_i = floor( quota_i × 0.05 )                                (14392-14393)
```

`a_i == 0`이면 `new_lru_ratio = 0` → quota 0 (14375-14383).

**공통 후처리** (양쪽 분기 모두):
```
if PGBUF_LRU_LIST_IS_ONE_TWO_OVER_QUOTA(list):  adjust_zones(false)      (14395-14401)
if count_vict_cand > 0 && PGBUF_LRU_LIST_IS_OVER_QUOTA(list):
    pgbuf_lfcq_add_lru_with_victims(list)      ← LFCQ 누락 복구           (14403-14410)
```

이 LFCQ 재등록이 `pgbuf_lru_remove_victim_candidate`의 "큐에서 못 지운다" 문제와 LFCQ produce 실패를 보정하는 안전망이다(16450-16452, 16522-16524행 주석: "the list will be added by pgbuf_adjust_quotas eventually").

### 8.6 shared threshold (14413-14442행)

```
S̄        = max( (num_buffers − Q_all) / num_LRU_list,  50 )
thr1_shr = floor( S̄ × ratio_lru1 )
thr2_shr = floor( S̄ × ratio_lru2 )
```

모든 shared 리스트가 **동일한** threshold를 받는다. `PGBUF_LRU_ARE_ZONES_ONE_TWO_OVER_THRESHOLD`면 `adjust_zones(false)`, `count_vict_cand > 0`이면 무조건 LFCQ 등록(quota 조건 없음 — shared는 quota 개념이 없다).

### 8.7 victim_rich (14444-14448행)

```
victim_rich = ( V_tot ≥ floor(0.1 × num_buffers) )
```

주석: "victim 개수가 페이지 버퍼의 10% 이상이면 참으로 간주한다. 기준을 좀 더 낮출 수도 있겠다." 이 플래그는 `pgbuf_get_victim` 주석(9052-9053행)에서 재시도 루프 제어용으로 언급되지만 **현재 코드에는 그 루프가 없다** — 주석만 남은 상태다.

### 8.8 over-quota 판정 매크로 (1060-1073행)

```c
PGBUF_LRU_LIST_IS_OVER_QUOTA(l)          = LRU_LIST_COUNT(l) > l->quota          /* 1060 */
PGBUF_LRU_LIST_IS_ONE_TWO_OVER_QUOTA(l)  = ZONE_ONE_TWO_COUNT(l) > l->quota      /* 1061 */
PGBUF_LRU_LIST_OVER_QUOTA_COUNT(l)       = LRU_LIST_COUNT(l) - l->quota          /* 1062 */
PGBUF_IS_PRIVATE_LRU_OVER_QUOTA(i)       = IS_PRIVATE(i) && IS_OVER_QUOTA(...)   /* 1064-1065 */
PGBUF_IS_PRIVATE_LRU_ONE_TWO_OVER_QUOTA(i)= IS_PRIVATE(i) && IS_ONE_TWO_OVER(...)/* 1066-1067 */
PGBUF_OVER_QUOTA_BUFFER(q)               = MAX(10, (int)(q × 0.01f))             /* 1069 */
PGBUF_LRU_LIST_IS_OVER_QUOTA_WITH_BUFFER(l)= LRU_LIST_COUNT(l) > l->quota
                                              + PGBUF_OVER_QUOTA_BUFFER(l->quota)/* 1070-1071 */
PBGUF_BIG_PRIVATE_MIN_SIZE               = 100                                   /* 1073 */
```

`ONE_TWO_OVER_QUOTA`가 별도로 있는 이유: zone1+zone2만으로 quota를 초과했다면 이 리스트는 **victim 불가 영역**이 quota를 다 먹었다는 뜻이므로 훨씬 심각한 위반이다.

### 8.9 flush 우선순위 — `pgbuf_compute_lru_vict_target` (14064-14184행)

`pgbuf_flush_victim_candidates`(3812행)가 매번 호출한다.

```
ρ_real = 1 − lru_shared_pgs_cnt / num_buffers
δ      = ρ − ρ_real
f_prv  = min( 1,  ρ_real × (1 − δ) )
f_shr  = 1 − f_prv
```

(14092-14096, 14143행)

private 리스트별 flush 타깃 — **quota의 90%를 넘는 BCB, 단 zone3 크기 상한**:

```
t_i = min( LRU_LIST_COUNT_i − floor(0.9 × quota_i),  count_lru3_i )
T   = Σ_i max(0, t_i)
```

(14103-14111, 14166-14171행)

```
                ⎧ f_shr / SHARED_LRU_COUNT           , i ∈ shared           (14149)
priority_i =    ⎨ f_prv × (t_i / T)                  , i ∈ private, t_i > 0 (14172-14175)
                ⎩ 0                                  , otherwise
```

"90%"라는 여유를 두는 이유가 14100-14103행 주석에 있다: over-quota 리스트만 노리면 "모든 quota가 리스트 크기와 딱 맞으면서(바로 아래) shared는 최소 크기 미달인" 상황에서 flush가 아무것도 못 찾는다.

`T == 0`이고 shared도 너무 작으면 백업 해킹 경로가 있다(14112-14141행): `invalid_cnt > 0`이면 그냥 return(invalid list에서 BCB를 얻을 수 있으므로 flush 불필요), 아니면 `assert(false)` 후 `use_prv_size = true`, `f_prv = 1.0`, `T = (num_buffers - shared_cnt) × (1 - 2×0.05)`로 강제. 저자 본인이 "backup hack, I don't like to rely on it"라고 적었다.

### 8.10 `pgbuf_get_victim_candidates_from_lru` (3739-3809행)

flush 스레드가 dirty victim 후보를 수집한다.

```
for lru_idx in [0, TOTAL_LRU_COUNT):
    p = lru_victim_flush_priority_per_lru[lru_idx]
    if p <= 0: continue
    check_count_this_lru = MAX(1, (int)(p × check_count / lru_sum_flush_priority))   (3766-3767)
    lock(list)
    for (b = bottom; b && IS_BCB_IN_LRU_VICTIM_ZONE(b) && i > 0; b = b->prev_BCB, i--):
        if bcb_is_dirty(b):
            victim_cand_list[n++] = {b, b->vpid}         ← flush 대상 수집       (3775-3781)
        elif try_direct_assign && 대기 스레드 존재 && victimizable && TRYLOCK ok:
            if victimizable(true) && assign_direct_victim(b):
                try_direct_assign = false               ← 반복당 1개만            (3783-3796)
    unlock(list)
```

3746-3748행 주석: "victim이 충분한데도 direct victim 대기자가 드물게 존재하는 희귀 케이스 처리로, flush 스레드가 반복당 BCB 하나를 직접 할당한다. 일반적으로 약간의 오버헤드만 추가된다."

---

## 9. Victim 선정 알고리즘 — 전체 의사코드

### 9.1 `pgbuf_allocate_bcb` (8136-8332행) — 최상위 진입점

```
pgbuf_allocate_bcb(thread_p, src_vpid):
    # 1) invalid list 최우선
    bcb = pgbuf_get_bcb_from_invalid_list()                      # 8173
    if bcb: return bcb            # victimize 없이 즉시 반환 (VOID_ZONE, mutex 보유)

    # 2) LRU 탐색
    bcb = pgbuf_get_victim(thread_p)                             # 8186
    if bcb: goto end

    # 3) 실패
    if SERVER_MODE and flush daemon 사용 가능:
      retry:
        high_priority |= VACUUM_IS_THREAD_VACUUM(th)
                      || pgbuf_is_thread_high_priority(th)       # 8198
        thread_lock_entry(th)
        assert(direct_victims.bcb_victims[th->index] == NULL)
        if high_priority:
            waiter_threads_high_priority.produce(th)              # 8207-8213
        else:
            if !waiter_threads_low_priority.produce(th):           # 8224
                # 소비자가 93ms나 선점된 실제 사례 있음 (8225-8233 주석)
                waiter_threads_high_priority.produce(th)  # 해킹적 폴백
        pgbuf_wakeup_page_flush_daemon(th)                        # 8252
        r = thread_suspend_timeout_wakeup_and_unlock_entry(th, to=300s,
                                                  THREAD_ALLOC_BCB_SUSPENDED)  # 8258
        if r == NO_ERROR and th->resume_status == THREAD_ALLOC_BCB_RESUMED:
            bcb = pgbuf_get_direct_victim(th)                     # 8268
            if bcb == NULL:            # 그 사이 누군가 다시 fix함
                high_priority = true; goto retry                  # 8271-8274
            goto end
        elif 인터럽트:
            # 할당받은 BCB를 "미할당"으로 되돌림
            update_flags(bcb_victims[idx], 0,
                         VICTIM_DIRECT_FLAG | INVALIDATE_DIRECT_VICTIM_FLAG)  # 8285-8288
            bcb_victims[idx] = NULL
            er_set(ER_INTERRUPTED)
    else:   # SA_MODE 또는 복구 중
        pgbuf_wakeup_page_flush_daemon(th)                        # 8303
        bcb = pgbuf_get_victim(th)                                # 8306
        assert(bcb != NULL)

  end:
    if bcb: pgbuf_victimize_bcb(th, bcb)                          # 8315
    else:   er_set(ER_PB_ALL_BUFFERS_DIRTY)                       # 8324
    return bcb
```

### 9.2 `pgbuf_get_victim` (9022-9196행) — 탐색 순서

9038-9058행의 설계 주석을 그대로 따른다:

```
pgbuf_get_victim(thread_p):
    ATOMIC_INC_32(&monitor.lru_victim_req_cnt, 1)                 # 9036
    restrict_other = false;  searched_own = false

    # ─── 1단계: 자기 private 리스트 ───────────────────────────
    if PGBUF_THREAD_HAS_PRIVATE_LRU(thread_p):                    # 9061
        idx = LRU_INDEX_FROM_PRIVATE(PRIVATE_LRU_FROM_THREAD(th))
        list = GET_LRU_LIST(idx)
        # quota 미달이면 자기 리스트에서 뺏지 않는다
        if IS_ONE_TWO_OVER_QUOTA(list)
           or (IS_OVER_QUOTA(list) and list->count_vict_cand > 0):   # 9069-9070
            victim = pgbuf_get_victim_from_lru_list(th, idx)
            if victim: return victim                              # 9074-9083
            # 실패: 다른 리스트 탐색 허용 여부 결정
            if !VACUUM_SHOULD_IGNORE_UNFIX(th):                    # 9093
                restrict_other = IS_OVER_QUOTA_WITH_BUFFER(list)   # 9100
                # ★ quota를 (quota + MAX(10, 1%)) 이상 넘긴 스레드는
                #   다른 private 리스트에서 훔칠 권한 상실 → 대기해야 함
                #   신규 트랜잭션(quota 없음)에는 약간의 여유를 준다
            searched_own = true                                   # 9102

    # ─── 2단계: 다른 private 리스트 (LFCQ) ────────────────────
    if PGBUF_PAGE_QUOTA_IS_ENABLED and has_flush_thread:           # 9111
        victim = pgbuf_lfcq_get_victim_from_private_lru(th, restricted=restrict_other)
        if victim: return victim                                  # 9118-9125

    # ─── 3단계: shared 리스트 (LFCQ) ─ 루프 ───────────────────
    initial_cursor = shared_lrus_with_victims.get_consumer_cursor()  # 9148
    do:
        victim = pgbuf_lfcq_get_victim_from_shared_lru(th, multi_threaded=has_flush_thread)
        if victim: return victim                                  # 9152-9159
        current_cursor = shared_lrus_with_victims.get_consumer_cursor()
    while (!has_flush_thread                                       # 9163
           and !shared_lrus_with_victims.is_empty()
           and (current_cursor - initial_cursor) <= num_LRU_list
           and ++nloops <= num_LRU_list)
    # flush 스레드가 있으면 1회만 시도 (대기 시스템이 받아줌)
    # 없으면(SA_MODE) 최대 num_LRU_list 회 재시도

    PERF(PSTAT_PB_VICTIM_ALL_LRU_FAIL)                            # 9172

    # ─── 4단계: 자기 private, quota 미달이어도 강행 ───────────
    if PGBUF_THREAD_HAS_PRIVATE_LRU(th) and !searched_own:         # 9174
        victim = pgbuf_get_victim_from_lru_list(th, own_idx)
        if victim: return victim                                  # 9180-9185
        # 9054-9057 주석: "모든 private 리스트가 quota와 딱 맞고(바로 아래),
        #  shared는 zone3가 없어서 아무것도 victim/flush 못 하는
        #  괴상한 케이스를 발견했다"

    return NULL
```

`restrict_other`의 semantics가 정책의 핵심이다: quota를 초과한 스레드는 자기 리스트에서만 victim을 구해야 하고, 실패하면 **다른 스레드의 private 페이지를 훔치지 않고 대기**한다. 단 `big_private_lrus_with_victims`(2배 이상 over-quota인 큰 리스트)에서는 여전히 가져올 수 있다(16404-16410행). vacuum 스레드는 quota가 없으므로 이 제약에서 제외된다(9092-9094행).

### 9.3 `pgbuf_get_victim_from_lru_list` (9270-9481행) — 실제 탐색 루프

```
pgbuf_get_victim_from_lru_list(thread_p, lru_idx):
    MAX_DEPTH = 1000
    list = &buf_LRU_list[lru_idx]

    # lock 없는 조기 이탈
    if list->count_vict_cand == 0: return NULL                    # 9291-9295

    lock(list->mutex)
    if list->bottom == NULL or !IS_BCB_IN_LRU_VICTIM_ZONE(list->bottom):
        unlock; return NULL          # zone3 없음                  # 9298-9304

    if PGBUF_IS_PRIVATE_LRU_ONE_TWO_OVER_QUOTA(lru_idx):
        pgbuf_lru_adjust_zones(th, list, min_one=false)            # 9306-9310
        # ★ 탐색 전에 강제로 zone1/2를 밀어내 zone3를 만든다

    lru_victim_cnt = list->count_vict_cand
    if lru_victim_cnt <= 0: unlock; return NULL                    # 9313-9320

    # hint 동기화: bottom이 clean인데 hint가 bottom이 아니면 바로잡는다
    if !bcb_is_dirty(list->bottom) and list->victim_hint != list->bottom:
        ATOMIC_TAS_ADDR(&list->victim_hint, list->bottom)          # 9322-9335

    victim_hint = list->victim_hint
    start = victim_hint ?: list->bottom                           # 9342-9350
    bufptr_victimizable = NULL;  found_victim_cnt = 0

    for (b = start; b && IS_BCB_IN_LRU_VICTIM_ZONE(b) && search_cnt < MAX_DEPTH;
         b = b->prev_BCB, search_cnt++):

        if pgbuf_bcb_avoid_victim(b):      continue    # dirty/flushing/direct  # 9355-9359

        if pgbuf_is_bcb_fixed_by_any(b, false):        # 유효 후보지만 지금 못 씀
            if bufptr_victimizable == NULL:
                bufptr_victimizable = b
                CAS(&list->victim_hint, victim_hint, b)   # hint 전진          # 9366-9377
            found_victim_cnt++
            if found_victim_cnt >= lru_victim_cnt: break   # 조기 이탈         # 9381-9386
            continue

        if PGBUF_BCB_TRYLOCK(b) == 0:                                          # 9390
            if pgbuf_is_bcb_victimizable(b, true):
                if bufptr_victimizable == NULL:
                    pgbuf_lru_advance_victim_hint(th, list, victim_hint,
                                                  b->prev_BCB, false)          # 9398
                pgbuf_remove_from_lru_list(th, b, list)     # → VOID_ZONE      # 9400

                # panic 경로 (아래 §9.5 참조 — 현재 무효)
                if waiter_threads_low_priority.size() >= 5 + n_threads/20:     # 9404
                    pgbuf_panic_assign_direct_victims_from_lru(th, list, b->prev_BCB)

                if list->bottom && bcb_is_dirty(list->bottom)
                   and flush daemon 사용 가능:
                    pgbuf_wakeup_page_flush_daemon(th)   # 새 bottom이 dirty   # 9411-9416
                unlock(list)
                pgbuf_add_vpid_to_aout_list(th, &b->vpid, lru_idx)             # 9419
                return b        # ★ BCB mutex 보유 상태로 반환
            else:
                PGBUF_BCB_UNLOCK(b)
        else:
            assert(flush daemon 사용 가능)   # 단일 스레드에서 trylock 실패 불가
            if bufptr_victimizable == NULL:
                bufptr_victimizable = b
                CAS(&list->victim_hint, victim_hint, b)                        # 9432-9443
            found_victim_cnt++
            if found_victim_cnt >= lru_victim_cnt: break

    # 실패 처리
    PERF(PSTAT_PB_VICTIM_GET_FROM_LRU_FAIL)
    if bufptr_victimizable == NULL and victim_hint != NULL:
        PERF(PSTAT_PB_VICTIM_GET_FROM_LRU_BAD_HINT)   # hint가 나빴다          # 9455-9457
        if list->count_vict_cand > 0 and IS_BCB_IN_LRU_VICTIM_ZONE(list->bottom):
            CAS(&list->victim_hint, victim_hint, list->bottom)   # bottom으로 리셋
        else:
            CAS(&list->victim_hint, victim_hint, NULL)
    unlock(list)
    pgbuf_wakeup_page_flush_daemon(th)     # victim이 더 필요하다              # 9474
    return NULL
```

`MAX_DEPTH = 1000`(9273행)이 탐색 시간을 상한한다. `found_victim_cnt >= lru_victim_cnt` 조기 이탈은 "카운터가 말하는 후보를 다 봤으니 더 볼 게 없다"는 판단이다.

### 9.4 victim 후보 조건 요약

| 조건 | 검사 위치 | 비고 |
|---|---|---|
| zone == `PGBUF_LRU_3_ZONE` | 9349, 9514 루프 조건 | zone1/2는 절대 불가 |
| `!DIRTY` | `avoid_victim`, 16182 | |
| `!FLUSHING_TO_DISK` | 동일 | flush는 반드시 성공해야 함 |
| `!VICTIM_DIRECT` | 동일 | 이미 다른 스레드 소유 |
| `!INVALIDATE_DIRECT_VICTIM` | 동일 | |
| `fcnt == 0` | `is_bcb_fixed_by_any`, 9226 | |
| `next_wait_thrd == NULL` | 동일 | 대기자 있으면 곧 fix됨 |
| `latch_mode == NO_LATCH` | 동일 (mutex 없을 때만) | |
| **`avoid_dealloc`은 검사하지 않음** | 16250-16260행 주석 | 의도적 |

`avoid_dealloc`을 무시하는 이유가 16250-16260행에 명확히 적혀 있다: "avoid deallocation count는 vacuum worker가 이 페이지를 dealloc하지 못하게 막는 용도다. 그래서 avoid deallocation이 표시된 BCB를 victim화하는 것은 완벽히 안전하지는 않다. 하지만 페이지가 실제로 dealloc될 가능성은 거의 0이다. 대안(avoid dealloc 표시된 BCB의 victim화를 회피)은 훨씬 복잡하고 심각한 위험을 야기한다(카운터가 누출되어 BCB가 영구히 victim화되지 못하면?). 그래서 기존 위험을 선호한다." — `pgbuf_ordered_fix`가 페이지를 일시 unfix하는 과정에서 실제로 발생하는 케이스다(16240-16249행).

### 9.5 panic 경로 — `pgbuf_panic_assign_direct_victims_from_lru` (9487-9548행)

```
if bcb_start == NULL: return 0                                    # 9497-9500
assert(get_lru_index(bcb_start) == lru_list->index)

for (b = bcb_start; b && IS_BCB_IN_LRU_VICTIM_ZONE(b)
                    && lru_list->count_vict_cand > 0 && count < 1000;
     b = b->prev_BCB, count++):
    if !is_bcb_victimizable(b, false): continue
    if PGBUF_BCB_TRYLOCK(b) != 0:      continue
    if !is_bcb_victimizable(b, true):  unlock; continue
    if !pgbuf_assign_direct_victim(th, b):
        unlock; break                  # 대기 스레드 소진 → 종료   # 9531-9536
    unlock
    PERF(PSTAT_PB_VICTIM_ASSIGN_DIRECT_PANIC)
    n_assigned++
return n_assigned
```

주석 9502행: "statistics shows not useful". 저자 자신이 효용이 없다고 기록해 두었다.

> **⚠ 발견한 결함 1**: `pgbuf_get_victim_from_lru_list`의 9407행이 이 함수에 `bufptr->prev_BCB`를 넘기는데, 바로 앞 9400행의 `pgbuf_remove_from_lru_list`가 10349행에서 `bufptr->prev_BCB = NULL`로 만든다. 따라서 **항상 `NULL`이 전달되어 9497-9500행에서 즉시 0을 반환한다.** 이 panic 경로는 죽은 코드다. 원래 의도는 방금 뽑아낸 victim 위쪽의 BCB들을 대기 스레드에게 나눠주는 것이었을 것이다(9401행 `/* todo: this is a hack */`).

`pgbuf_lfcq_assign_direct_victims`(9605-9645행)를 통한 호출은 `victim_hint`를 넘기므로 정상 동작한다.

### 9.6 `pgbuf_victimize_bcb` (8589-8632행)

`pgbuf_allocate_bcb`가 BCB를 얻은 뒤 마지막에 호출한다. BCB mutex 보유 상태.

```
if !pgbuf_is_bcb_victimizable(bufptr, true):
    assert(false); unlock; return ER_FAILED                       # 8602-8607
if pgbuf_bcb_is_to_vacuum(bufptr):
    update_flags(0, PGBUF_BCB_TO_VACUUM_FLAG)   # 플래그 청소      # 8609-8612
assert(get_latch == PGBUF_NO_LATCH)
if pgbuf_delete_from_hash_chain(bufptr) != NO_ERROR: return ER_FAILED  # 8616-8619
latch_mode = PGBUF_LATCH_INVALID; waiter_exists = false; fcnt = 0      # 8620-8624
return NO_ERROR      # mutex 계속 보유
```

zone 변경은 하지 않는다 — 이미 `remove_from_lru_list` 또는 `get_bcb_from_invalid_list`/`get_direct_victim`에서 `VOID_ZONE`이 되어 있다.

---

## 10. `victim_hint` 관리

hint의 계약(595-596행): "victim 탐색을 시작할 hint. hint 아래는 전부 dirty여야 한다. 단 hint가 항상 victim 가능한 첫 BCB는 아니다." 597-599행에 저자의 자백이 있다: "TPCC 코어 파일 조사 중, hint가 때때로 victim 가능한 첫 BCB보다 앞에 있는 것을 발견했다. 어딘가에 로직 오류가 있다는 뜻이다. 어디인지는 모르지만 분명히 있다."

### 10.1 `pgbuf_lru_add_victim_candidate` (15612-15660행) — LRU mutex 없음

```
do:
    old = lru_list->victim_hint
    list_tick = lru_list->tick_lru3
    if old != NULL and IS_BCB_IN_LRU_VICTIM_ZONE(old)
       and AGE_DIFF(old->tick_lru3, list_tick) > AGE_DIFF(bcb->tick_lru3, list_tick):
        break        # 현재 hint가 더 오래됨 → 유지                # 15631-15640
while (!ATOMIC_CAS_ADDR(&lru_list->victim_hint, old, bcb))          # 15644

ATOMIC_INC_32(&lru_list->count_vict_cand, 1)                        # 15648
if IS_SHARED_LRU_INDEX(index) or LRU_LIST_IS_OVER_QUOTA(list):
    pgbuf_lfcq_add_lru_with_victims(list)                           # 15649-15657
```

`AGE_DIFF`가 클수록 오래됨 = 리스트 아래쪽이므로, **hint는 항상 가장 오래된(가장 아래) 후보**로 수렴한다. LRU mutex 없이 동작하므로 15618-15626행에 순서 규약이 명시되어 있다: (1) hint 읽기 → (2) old가 여전히 LRU3이고 더 오래됐으면 중단 → (3) 원자적으로 교체.

**private 리스트가 quota 미달이면 LFCQ에 등록하지 않는다**(15649행) — 다른 스레드가 이 리스트를 발견해서 훔쳐가지 못하게 하는 quota 보호의 두 번째 층이다.

### 10.2 `pgbuf_lru_remove_victim_candidate` (15666-15675행)

```c
if (ATOMIC_INC_32 (&lru_list->count_vict_cand, -1) == 0)
  {
    /* we cannot remove an entry from lock-free circular queue easily. we just hope that this does not happen too
     * often. do nothing here. */
  }
```

카운터만 감소하고 LFCQ에서 제거하지 않는다. 그래서 후보 0인 리스트가 큐에 남아 있을 수 있고, 소비자가 그것을 뽑으면 `pgbuf_get_victim_from_lru_list`가 9291행에서 즉시 NULL 반환하며 `PGBUF_LRU_VICTIM_LFCQ_FLAG`를 정리한다(16456, 16528행).

### 10.3 `pgbuf_lru_advance_victim_hint` (15689-15716행) — LRU mutex 필수

```
new = (bcb_new_hint && IS_BCB_IN_LRU_VICTIM_ZONE(bcb_new_hint)) ? bcb_new_hint : NULL   # 15698
# hint가 NULL이 될 상황인데 후보가 남아 있으면 bottom부터 재시작
new = (new == NULL && count_vict_cand > (was_vict_count_updated ? 0 : 1))
      ? lru_list->bottom : new                                       # 15701-15702
new = (new && IS_BCB_IN_LRU_VICTIM_ZONE(new)) ? new : NULL            # 15704-15705
CAS(&lru_list->victim_hint, bcb_prev_hint, new)                       # 15709
```

`was_vict_count_updated`가 임계값을 바꾼다: false면 `bcb_prev_hint`가 아직 후보로 계산되고 있으므로 "그것 말고도 남아 있는가"를 확인하려면 `> 1`이어야 한다. `pgbuf_remove_from_lru_list`는 항상 `false`로 호출한다(10355행) — `change_zone`이 아직 실행되지 않았기 때문이다.

### 10.4 hint 리셋 지점 정리

| 위치 | 동작 |
|---|---|
| 9322-9335 | bottom이 clean인데 hint≠bottom → `TAS(hint, bottom)` |
| 9366-9377, 9432-9443 | 첫 "후보지만 사용 불가" BCB로 전진 (CAS) |
| 9398 | 성공적 victim의 `prev_BCB`로 전진 |
| 9455-9470 | 후보를 전혀 못 찾음 → bottom 또는 NULL로 리셋 (`BAD_HINT` 통계) |
| 9617-9629 | `lfcq_assign_direct_victims`가 hint로 0개 할당 → bottom 리셋 후 재시도 |
| 10355 | `remove_from_lru_list` 시 전진 |
| 15644 | 더 오래된 후보 등장 시 하향 조정 |

---

## 11. LFCQ 기반 victim 탐색

### 11.1 `pgbuf_lfcq_add_lru_with_victims` (16334-16374행)

```
old_flags = lru_list->flags
if old_flags & PGBUF_LRU_VICTIM_LFCQ_FLAG: return false      # 이미 등록됨   # 16338-16342
if CAS(&lru_list->flags, old_flags, old_flags | PGBUF_LRU_VICTIM_LFCQ_FLAG):
    if IS_PRIVATE_LRU_INDEX(index):
        if private_lrus_with_victims.produce(index): return true            # 16350-16356
    else:
        if shared_lrus_with_victims.produce(index): return true             # 16359-16364
    lru_list->flags &= ~PGBUF_LRU_VICTIM_LFCQ_FLAG    # produce 실패 롤백    # 16367
return false
```

`PGBUF_LRU_VICTIM_LFCQ_FLAG`(1076행, `0x80000000`)가 **중복 등록 방지 뮤텍스 역할**을 한다. CAS를 쓰는 이유는 두 스레드가 같은 리스트를 동시에 넣지 못하게 하려는 것(16344행). 플래그 해제는 원자 연산 없이 하는데(16453-16455, 16525-16527행) "유일한 플래그이고 set→clear를 바꾸는 다른 주체가 없음이 확실하기" 때문이다 — 플래그가 추가되면 원자 연산으로 바꿔야 한다고 경고를 남겨두었다.

### 11.2 `pgbuf_lfcq_get_victim_from_private_lru` (16380-16465행)

```
if private_lrus_with_victims == NULL: return NULL             # quota 비활성  # 16391-16394

# big 우선
if big_private_lrus_with_victims.consume(lru_idx):
    PERF(LFCQ_LRU_PRV_GET_BIG)                                              # 16397-16402
else:
    if restricted: return NULL     # ★ over-quota 스레드는 big만 허용        # 16405-16408
    if !private_lrus_with_victims.consume(lru_idx):
        PERF(LFCQ_LRU_PRV_GET_EMPTY); return NULL                            # 16411-16416

list = GET_LRU_LIST(lru_idx)
# big 판정: 100개 초과 && quota 2배 초과 && 후보 2개 이상
if LRU_LIST_COUNT(list) > PBGUF_BIG_PRIVATE_MIN_SIZE(100)
   and LRU_LIST_COUNT(list) > 2 × list->quota
   and list->count_vict_cand > 1:
    if big_private_lrus_with_victims.produce(lru_idx): added_back = true      # 16419-16427

victim = pgbuf_get_victim_from_lru_list(th, lru_idx)                          # 16430
if added_back: return victim

if list->count_vict_cand > 0 and LRU_LIST_IS_OVER_QUOTA(list):
    if private_lrus_with_victims.produce(lru_idx): return victim              # 16437-16443

lru_list->flags &= ~PGBUF_LRU_VICTIM_LFCQ_FLAG    # 큐에 안 넣음 → 플래그 해제 # 16456
return victim
```

세 큐의 역할 분담:

```
big_private_lrus_with_victims  : 2× quota 초과 + 100개 초과 + 후보 2개 이상
                                 → 소비 즉시 재삽입(공격적 재활용 대상)
                                 → restricted 스레드도 접근 가능
private_lrus_with_victims      : over-quota private
                                 → restricted 스레드 접근 불가
shared_lrus_with_victims       : quota 무관, count_vict_cand > 0이면 등록
```

리스트가 큐에 남는 조건이 **`count_vict_cand > 0 && over-quota`**라는 점이 정책의 핵심이다. quota 이하로 내려간 private 리스트는 큐에서 사라져 다른 스레드의 표적에서 벗어난다.

### 11.3 `pgbuf_lfcq_get_victim_from_shared_lru` (16472-16536행)

```
if !shared_lrus_with_victims.consume(lru_idx):
    PERF(LFCQ_LRU_SHR_GET_EMPTY); return NULL                                # 16487-16492
list = GET_LRU_LIST(lru_idx)
victim = pgbuf_get_victim_from_lru_list(th, lru_idx)                          # 16496

# 단일 스레드(SA_MODE)에서 flush가 돌았을 수 있으니 한 번 더
if victim == NULL and multi_threaded == false and list->count_vict_cand > 0:
    victim = pgbuf_get_victim_from_lru_list(th, lru_idx)                      # 16500-16504

if (multi_threaded or victim != NULL) and list->count_vict_cand > 0:
    if shared_lrus_with_victims.produce(lru_idx): return victim               # 16506-16512
    # produce 실패: 소비자가 오래 선점되어 큐가 꽉 찬 것처럼 보일 수 있다 (16514-16520)
lru_list->flags &= ~PGBUF_LRU_VICTIM_LFCQ_FLAG                                # 16528
return victim
```

`multi_threaded == false`일 때만 재삽입 조건에 `victim != NULL`을 요구한다 — 단일 스레드에서 실패한 리스트를 다시 넣으면 무한 루프에 빠진다.

---

## 12. Direct victim 메커니즘 시퀀스

### 12.1 자료구조 (741-759행)

```c
struct pgbuf_direct_victim {
  PGBUF_BCB **bcb_victims;                                    /* 747 : 스레드별 우편함 */
  lockfree::circular_queue<THREAD_ENTRY *> *waiter_threads_high_priority;  /* 749 */
  lockfree::circular_queue<THREAD_ENTRY *> *waiter_threads_low_priority;   /* 750 */
};
```

741-743행 주석: "victim 할당을 탐색과 무의미한 CPU 소모 없이 최적화하려고 쓰는 시스템. 스레드들이 직접 victim을 할당받고 깨워지기를 기다린다."

### 12.2 전체 시퀀스

```
 대기 스레드 W                      공급자 P                     상태
 ────────────────────────────────────────────────────────────────────────
 pgbuf_allocate_bcb (8136)
   invalid list 비었음
   pgbuf_get_victim → NULL
   │
   ├─ high_priority 판정 (8198)
   │    VACUUM_IS_THREAD_VACUUM
   │    || pgbuf_is_thread_high_priority (11679)
   │       · 자기 페이지를 누군가 기다림
   │       · PAGE_VOLHEADER 보유
   │       · PAGE_FTAB (파일 헤더) 보유
   │       · B-tree ROOT 보유
   │       · heap header 보유
   │
   ├─ thread_lock_entry(W)
   ├─ waiter_threads_{high,low}_priority.produce(W)   (8207/8224)
   ├─ pgbuf_wakeup_page_flush_daemon()                (8252)
   └─ thread_suspend_timeout_wakeup_and_unlock_entry(
        W, 300s, THREAD_ALLOC_BCB_SUSPENDED)          (8258)
        ══════════ SUSPENDED ═══════════
                                    │
                                    │ 공급 경로 (5가지, 모두
                                    │ pgbuf_assign_direct_victim, 15367)
                                    │
                                    │ ① flush 완료 후
                                    │    pgbuf_bcb_flush_with_wal (10868-10870)
                                    │      flushed_bcbs.produce(bcb)
                                    │      post_flush_daemon->wakeup()
                                    │    → pgbuf_assign_flushed_pages (15428)
                                    │
                                    │ ② zone2→zone3 강하 시
                                    │    pgbuf_lru_fall_bcb_to_zone_3 (10011-10050)
                                    │
                                    │ ③ vacuum/zone3 unfix 시
                                    │    unlatch_bcb_upon_unfix (6771, 6874)
                                    │
                                    │ ④ flush 후보 수집 중 (반복당 1개)
                                    │    get_victim_candidates_from_lru (3783-3796)
                                    │
                                    │ ⑤ 유지보수 데몬 (100ms)
                                    │    pgbuf_direct_victims_maintenance (9563)
                                    │      → pgbuf_lfcq_assign_direct_victims (9605)
                                    │      → panic_assign_direct_victims_from_lru
                                    ▼
                       pgbuf_assign_direct_victim(P, bcb)   [BCB mutex 보유]
                         assert(!direct_victim && !invalid_direct && !dirty
                                && !fixed_by_any)            (15379-15382)
                         while pgbuf_get_thread_waiting_for_direct_victim(W):  (15393)
                             thread_lock_entry(W)
                             if W->resume_status != THREAD_ALLOC_BCB_SUSPENDED:
                                 unlock; continue    # 더 이상 기다리지 않음   (15399-15404)
                             thread_wakeup_already_had_mutex(W,
                                        THREAD_ALLOC_BCB_RESUMED)             (15407)
                             update_flags(bcb, +VICTIM_DIRECT_FLAG,
                                               -FLUSHING_TO_DISK_FLAG)        (15410)
                             bcb_victims[W->index] = bcb                      (15412)
                             thread_unlock_entry(W)
                             return true
                         return false     # 대기자 없음
        ══════════ RESUMED ═════════════
   │
   ├─ pgbuf_get_direct_victim(W)  (15514)
   │    bcb = ATOMIC_TAS_ADDR(&bcb_victims[W->index], NULL)   (15517)
   │    PGBUF_BCB_LOCK(bcb)
   │    if pgbuf_bcb_is_invalid_direct_victim(bcb):
   │        update_flags(0, INVALIDATE_DIRECT_VICTIM_FLAG)
   │        unlock; return NULL     ← 누군가 다시 fix했다      (15523-15530)
   │    update_flags(0, VICTIM_DIRECT_FLAG)    # 플래그 해제   (15535)
   │    if !is_bcb_victimizable(bcb, true): assert(false); return NULL (15537-15543)
   │    switch (get_zone(bcb)):
   │        VOID_ZONE:    break                                (15547-15548)
   │        INVALID_ZONE: assert(false)                        (15549-15552)
   │        default(LRU): pgbuf_lru_remove_bcb(bcb)            (15558)
   │                      pgbuf_add_vpid_to_aout_list(vpid, lru_idx) (15561)
   │    assert(get_zone(bcb) == PGBUF_VOID_ZONE)
   │    return bcb
   │
   ├─ if bcb == NULL: high_priority = true; goto retry         (8271-8274)
   └─ pgbuf_victimize_bcb(bcb)                                 (8315)
```

### 12.3 `PGBUF_BCB_VICTIM_DIRECT_FLAG` ↔ `INVALIDATE` 흐름 (232-239행)

주석: "victim으로 직접 할당되었음을 표시하는 플래그. victim화가 실패하는 특정 상황이 있을 수 있다. 그러면 스레드는 잠들어 다른 스레드가 깨워주고 BCB를 직접 할당해 주기를 기다린다. 그런 공급자는 여럿일 수 있다. **활성 워커가 이 BCB를 fix할 작은 기회의 창이 있다.** direct victim을 fix할 때 플래그를 `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG`로 교체해야 한다. 이 BCB를 victim화해서 다시 fix하는 것은 의미가 없다. BCB를 기다리던 스레드는 그것이 다시 fix되었음을 알고 다른 BCB를 요청할 것이다."

```
  P: assign → VICTIM_DIRECT_FLAG 설정, bcb_victims[W] = bcb
     ┌──── 기회의 창 ────┐
  X: fix 시도 → VICTIM_DIRECT_FLAG 를 INVALIDATE_DIRECT_VICTIM_FLAG 로 교체
     └───────────────────┘
  W: get_direct_victim → is_invalid_direct_victim 참
       → INVALIDATE 플래그 해제, NULL 반환
  W: high_priority = true 로 승격 후 retry (8272-8273)
```

인터럽트 케이스도 대칭적으로 처리된다(8283-8290행): 두 플래그를 모두 해제하고 `bcb_victims[]`를 NULL로 만든다.

### 12.4 대기 큐 선택 — `pgbuf_get_thread_waiting_for_direct_victim` (15499-15507행)

```c
static INT64 count = 0;
INT64 my_count = ATOMIC_INC_64 (&count, 1);
if (my_count % 4 == 0)         /* 4회마다 저우선순위 강제 소비 → starvation 방지 */
  if (waiter_threads_low_priority->consume (out))  return true;
if (waiter_threads_high_priority->consume (out))   return true;
if (waiter_threads_low_priority->consume (out))    return true;
return false;
```

고우선순위 큐를 계속 비우다 보면 저우선순위가 굶으므로 4회마다 한 번은 저우선순위를 먼저 본다.

### 12.5 `pgbuf_assign_flushed_pages` (15428-15490행) — post-flush 데몬

`invalidate_flag = INVALID_VICTIM_CANDIDATE_MASK & ~FLUSHING_TO_DISK_FLAG`(15435행) — flush 직후이므로 FLUSHING 플래그는 당연히 켜져 있고, 이것만 예외 처리한다.

```
while flushed_bcbs.consume(bcb):
    PGBUF_BCB_LOCK(bcb)
    if (bcb->flags & invalidate_flag) != 0:      pass  # 다시 dirty        # 15443-15446
    elif pgbuf_is_bcb_fixed_by_any(bcb, true):   pass  # fix됨             # 15447-15450
    elif !PGBUF_IS_BCB_IN_LRU_VICTIM_ZONE(bcb):  pass  # hot해졌다         # 15451-15454
    elif IS_PRIVATE_LRU_INDEX(get_lru_index(bcb))
         and !LRU_LIST_IS_OVER_QUOTA(list):      pass  # quota 미달 → 기회 부여 # 15455-15459
    elif pgbuf_assign_direct_victim(th, bcb):
        PERF(PSTAT_PB_VICTIM_ASSIGN_DIRECT_FLUSH)                          # 15460-15467
    pgbuf_bcb_mark_was_flushed(bcb)              # FLUSHING 해제            # 15476
    if bcb->next_wait_thrd: pgbuf_wake_flush_waiters(bcb)                  # 15478-15482
    PGBUF_BCB_UNLOCK(bcb)
```

네 번째 조건이 quota 정책의 세 번째 층이다: flush를 마친 BCB라도 quota 미달 private 리스트 소속이면 victim으로 뽑지 않고 원 소유자에게 돌려준다.

### 12.6 `pgbuf_direct_victims_maintenance` (9563-9601행)

```c
static int prv_index = 0;
static int shr_index = 0;
for (index = prv_index, restarted = false;
     pgbuf_is_any_thread_waiting_for_direct_victim () && nassigns > 0
     && index != prv_index && !restarted;
     (index == PGBUF_PRIVATE_LRU_COUNT - 1) ? index = 0, restarted = true : index++)
  pgbuf_lfcq_assign_direct_victims (thread_p, PGBUF_LRU_INDEX_FROM_PRIVATE (index), &nassigns);
prv_index = index;
```

> **⚠ 발견한 결함 2**: 초기화가 `index = prv_index`이므로 루프 조건의 `index != prv_index`가 **첫 평가에서 이미 false**다. 본체가 한 번도 실행되지 않는다. shared 루프(9584-9590행)도 `index != shr_index`로 동일하다. 즉 **`pgbuf_direct_victims_maintenance`는 100ms마다 호출되지만 실질적으로 no-op**이다. 함수 헤더 주석(9552-9556행)이 "시스템 활동이 매우 낮아 BCB가 대기 스레드에 할당되지 못하는 상황에서도 victim이 반드시 할당되게 하는 백업 플랜"이라고 명시한 안전망이 작동하지 않는다는 뜻이다. 이는 `pgbuf_allocate_bcb`의 TODO(8162-8167행)가 우려한 "어떤 이유로든 아무도 대기 스레드에게 victim을 공급하지 않으면 어떻게 되는가"와 직결된다.

의도된 코드는 `index != prv_index`가 아니라 `restarted → index != prv_index` 형태(재시작 후에만 시작점 비교)였을 것이다. 다만 `restarted` 자체가 종료 조건에 이미 포함되어 있어서, 두 번째 항을 제거하는 것만으로도 "한 바퀴 순회 후 종료"가 성립한다.

### 12.7 보조 판정 함수

```c
pgbuf_is_any_thread_waiting_for_direct_victim ()   /* 15589-15594 */
  = !high_priority->is_empty() || !low_priority->is_empty()

pgbuf_is_io_stressful ()                           /* 16574-16582 */
  = !low_priority->is_empty()      /* 저우선순위 대기자 존재 = IO 압박 */

pgbuf_is_hit_ratio_low ()                          /* 16590-16601 */
  = lru_victim_req_cnt > 10
    && lru_victim_req_cnt × 1000 > pgbuf_monitor_sum_fix_req(false)
    /* 목표 히트율 99.9% */

pgbuf_keep_victim_flush_thread_running ()           /* 15351-15355 */
  = pgbuf_is_any_thread_waiting_for_direct_victim () || pgbuf_is_hit_ratio_low ()
```

---

## 13. AOUT 리스트

### 13.1 목적 (637-641행)

> "페이지 교체 알고리즘은 LRU + 2Q의 Aout이다. 이 알고리즘은 두 개의 연결 리스트를 쓴다: LRU list는 BCB를 LRU 큐로 관리하고, Aout list는 VPID를 FIFO 큐로 관리한다. LRU list는 'hot' 페이지를 관리하고, Aout list는 victim화된 페이지의 단기 이력을 담는다."

2Q 원논문의 A1out에 해당한다. 핵심 통찰: **BCB(8KB+)를 유지하는 것은 비싸지만 VPID(8바이트)를 유지하는 것은 싸다.** 최근 쫓겨난 페이지의 신원만 기억해 두면, 그 페이지가 돌아왔을 때 "이건 correlated reference가 아니라 진짜 재참조"라고 판정해 MIDDLE(zone2) 대신 TOP(zone1)으로 승격할 수 있다.

### 13.2 구조 (643-666행)

```c
struct pgbuf_aout_buf {                      /* 644-651 */
  VPID vpid;
  int lru_idx;                 /* 쫓겨난 원래 LRU 인덱스 — private 판별용 */
  PGBUF_AOUT_BUF *next, *prev;
};

struct pgbuf_aout_list {                     /* 653-672 */
  pthread_mutex_t Aout_mutex;  /* 단일 글로벌 mutex */
  PGBUF_AOUT_BUF *Aout_top;    /* FIFO 머리 */
  PGBUF_AOUT_BUF *Aout_bottom; /* FIFO 꼬리 — 여기서 축출 */
  PGBUF_AOUT_BUF *Aout_free;   /* free 노드 단일 연결 리스트 */
  PGBUF_AOUT_BUF *bufarray;    /* 전체 노드 사전 할당 배열 */
  int num_hashes;
  MHT_TABLE **aout_buf_ht;     /* 빠른 조회용 해시 (샤딩) */
  int max_count;
};
```

`lru_idx`를 저장하는 것이 CUBRID의 확장이다. 원래 2Q에는 없는 필드로, private LRU 소유권 판정에 쓰인다(6913행).

### 13.3 `pgbuf_initialize_aout_list` (5758-5852행) — max_count 산정

```
aout_ratio = PRM_ID_PB_AOUT_RATIO
max_count = (int)(num_buffers × aout_ratio)                      # 5769
if aout_ratio <= 0: max_count = 0; return   (AOUT 미사용)        # 5779-5784
max_count = MIN(max_count, PGBUF_LIMIT_AOUT_BUFFERS = 32768)     # 5786
    /* 5759 주석: "Aout 크기를 512M 상당으로 제한" — 8KB × 32768 = 256MB
       (16KB 페이지 기준 512MB) */
bufarray = malloc(max_count × sizeof(PGBUF_AOUT_BUF))            # 5789
Aout_free = &bufarray[0]  (전체를 next로 연결)                    # 5796-5811
num_hashes = MAX(max_count / AOUT_HASH_DIVIDE_RATIO(1000), 1)    # 5813
aout_buf_ht[i] = mht_create("PGBUF_AOUT_HASH", max_count,
                            pgbuf_hash_vpid, pgbuf_compare_vpid) # 5825-5832
```

해시 샤딩: `AOUT_HASH_IDX(vpid, list) = vpid->pageid % list->num_hashes`(934행). 1000 엔트리당 해시 테이블 하나. 다만 각 테이블이 `max_count` 크기로 생성되므로 메모리를 다소 낭비한다.

### 13.4 `pgbuf_add_vpid_to_aout_list` (10416-10496행)

```
if max_count <= 0: return                                        # 10425-10428
lock(Aout_mutex)
if Aout_free == NULL:                    # 가득 참 → FIFO 축출
    aout_buf = Aout_bottom                                       # 10436
    Aout_bottom = Aout_bottom->prev; Aout_bottom->next = NULL     # 10441-10442
    mht_rem(aout_buf_ht[AOUT_HASH_IDX(&aout_buf->vpid)], &vpid)   # 10445-10446
else:
    aout_buf = Aout_free; Aout_free = Aout_free->next             # 10449-10453
aout_buf->lru_idx = lru_idx;  VPID_COPY(&aout_buf->vpid, vpid)    # 10457-10458
mht_put(aout_buf_ht[hash_idx], &aout_buf->vpid, aout_buf)         # 10461-10462
Aout_top에 삽입                                                  # 10464-10482
unlock
```

호출 지점: 성공적 victim(9419), zone3 강하 중 direct 할당(10042), direct victim 수령(15561), vacuum void unfix(6884).

### 13.5 `pgbuf_remove_vpid_from_aout_list` (10505-10576행)

반환값이 곧 정보다: `lru_idx`(0 이상) 또는 `PGBUF_AOUT_NOT_FOUND(-2, 278행)`.

```
if max_count <= 0: return PGBUF_AOUT_NOT_FOUND                   # 10516-10520
hash_idx = AOUT_HASH_IDX(vpid, list)
lock(Aout_mutex)
aout_buf = mht_get(aout_buf_ht[hash_idx], vpid)
if aout_buf == NULL: unlock; return PGBUF_AOUT_NOT_FOUND         # 10525-10530
aout_list_id = aout_buf->lru_idx                                 # 10535
FIFO에서 링크 해제 (top/bottom 특수 처리)                        # 10536-10559
mht_rem(...)                                                     # 10561-10562
VPID_SET_NULL(&aout_buf->vpid); lru_idx = PGBUF_AOUT_NOT_FOUND
Aout_free에 반환                                                 # 10564-10571
unlock
return aout_list_id
```

10532-10534행 주석: "mutex 획득 전과 동일한 VPID를 여전히 갖고 있으면 aout_buf가 우리가 찾는 것이라고 가정할 수 있다. mutex를 잡고 있는 동안 아무도 바꿀 수 없기 때문이다."

### 13.6 `pgbuf_remove_private_from_aout_list` (10585-10659행)

특정 `lru_idx`에 속한 모든 엔트리를 제거하고 개수를 반환한다. FIFO 전체를 O(n) 순회한다. private 리스트가 해제/재할당될 때 이전 소유자의 이력이 새 소유자에게 잘못 적용되는 것을 막는 용도지만, **현재 이 파일 내에서 호출되지 않는다** (grep 결과 정의만 존재).

---

## 14. Invalid list

### 14.1 초기화 (5862-5869행)

```c
pgbuf_Pool.buf_invalid_list.invalid_top = PGBUF_FIND_BCB_PTR (0);
pgbuf_Pool.buf_invalid_list.invalid_cnt = pgbuf_Pool.num_buffers;
```

BCB 테이블 전체가 초기에 invalid list다. `next_BCB`로 연결된 단일 연결 리스트(5576행에서 `prev_BCB = NULL`).

### 14.2 `pgbuf_get_bcb_from_invalid_list` (8861-8905행)

```
if invalid_top == NULL: return NULL           # lock 없는 1차 확인   # 8871-8875
lock(invalid_mutex)
if invalid_top == NULL: unlock; return NULL    # 2차 확인             # 8878-8884
bufptr = invalid_top; invalid_top = bufptr->next_BCB; invalid_cnt--   # 8888-8891
unlock
PGBUF_BCB_LOCK(bufptr)
bufptr->next_BCB = NULL
pgbuf_bcb_change_zone(bufptr, 0, PGBUF_VOID_ZONE)                     # 8895
PERF(PSTAT_PB_VICTIM_USE_INVALID_BCB)
return bufptr                                  # BCB mutex 보유 상태
```

double-check 패턴(8871, 8878행)으로 흔한 빈 케이스에서 mutex 획득을 피한다.

### 14.3 `pgbuf_put_bcb_into_invalid_list` (8910-8935행)

```
VPID_SET_NULL(&bufptr->vpid)                                         # 8919
set_latch(&bufptr->atomic_latch, PGBUF_LATCH_INVALID)                # 8920
assert((bufptr->flags & PGBUF_BCB_FLAGS_MASK) == 0)   # 모든 플래그 청소됨 # 8921
pgbuf_bcb_change_zone(bufptr, 0, PGBUF_INVALID_ZONE)                 # 8922
pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc(bufptr, ARG_FILE_LINE) # 8923
lock(invalid_mutex)
bufptr->next_BCB = invalid_top; invalid_top = bufptr; invalid_cnt++  # 8926-8928
PGBUF_BCB_UNLOCK(bufptr)                       # BCB mutex 여기서 해제
unlock(invalid_mutex)
```

호출자: `pgbuf_invalidate_bcb`(8690행), read 실패 시(8467행). `pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc`(16267-16277행)은 `avoid_dealloc != 0`이면 crash가 아니라 `er_log_debug` 경고만 남긴다 — `pgbuf_ordered_fix` 때문에 정상적으로 발생 가능하기 때문이다.

`invalid_cnt`는 quota 계산에서 `Q_all = (num_buffers - invalid_cnt) × ρ`로 쓰인다(14367-14368행) — 아직 사용되지 않은 버퍼는 private quota 계산에서 제외된다.

---

## 15. Monitor — hit / activity 추적

### 15.1 `PGBUF_PAGE_MONITOR` (695-715행)

```c
struct pgbuf_page_monitor {
  INT64 dirties_cnt;                /* 697 : 전역 dirty 개수 */
  int *lru_hits;                    /* 699 : LRU별 zone1 hit (조정 주기마다 리셋) */
  int *lru_activity;                /* 700 : LRU별 활동 수준 (10초 EMA) */
  volatile int lru_shared_pgs_cnt;  /* 703 : 모든 shared LRU의 BCB 합 */
  int lru_victim_req_cnt;           /* 704 : 전체 victim 요청 수 */
  /* 705-707: fix/unfix 카운터는 THREAD_ENTRY에 샤딩 */
  PGBUF_MONITOR_BCB_MUTEX *bcb_locks;  /* 710 */
  bool victim_rich;                 /* 713-714 */
};
```

### 15.2 `pgbuf_bcb_register_hit_for_lru` (16549-16566행)

```c
if (bcb->hit_age < pgbuf_Pool.quota.adjust_age)
  {
    pgbuf_Pool.monitor.lru_hits[pgbuf_bcb_get_lru_index (bcb)]++;
    bcb->hit_age = pgbuf_Pool.quota.adjust_age;
  }
```

`adjust_age`(736행)는 조정 회차마다 증가하는 세대 번호다(14268행). 이 가드로 **같은 조정 구간 내에서 한 BCB는 hit을 한 번만 기여**한다. 그래서 `lru_hits[i]`는 "이 구간에 접근된 서로 다른 페이지 수"에 가깝고, "총 fix 횟수"가 아니다. 뜨거운 페이지 몇 개를 반복 fix하는 워크로드가 activity를 부풀리지 않게 하는 정규화다.

증가는 원자 연산이 아니다 — 통계 정확도보다 fix 경로 성능이 중요하다.

호출 지점: zone1/2/3 unfix 유지(6730, 6765, 6794), void→private/shared(6919, 6928, 6938), private→shared 이동(10295).

### 15.3 `lru_shared_pgs_cnt` 유지 (15869-15872, 15895-15898행)

`pgbuf_bcb_change_zone`에서 shared 리스트를 떠날 때 `-1`, 들어올 때 `+1`. `pgbuf_compute_lru_vict_target`의 `ρ_real` 계산에 쓰인다(14093행).

### 15.4 `lru_victim_req_cnt`

`pgbuf_get_victim` 진입 시 증가(9036행), `pgbuf_flush_victim_candidates`에서 `ATOMIC_TAS_32(..., 0)`로 읽고 리셋(3889행). `pgbuf_is_hit_ratio_low`(16597행)와 flush 비율 동적 조정(`lru_miss_rate`, 3892-3899행)에 쓰인다.

플러시 과부하 배수는 `PGBUF_FLUSH_VICTIM_BOOST_MULT = 10`(315-317행): "최대 overboost flush 배수: miss rate(victim_request/fix_request)가 증가할 때 설정된 flush 비율에 적용할 최대 계수를 제어한다."

### 15.5 `pgbuf_lru_sanity_check` (16829-16897행, `!NDEBUG` 전용)

호출: `adjust_zones`(9989), `boost_bcb`(10133), `add_new_bcb_to_*`(10162/10166/10199/10203/10232), `lru_remove_bcb`(10272), `add_bcb_to_top/middle` 직후.

검증 불변식:
- 빈 리스트: 세 카운터 모두 0, top/bottom/bottom_1/bottom_2 전부 NULL (16833-16839)
- `(count_lru1 == 0) ⟺ (bottom_1 == NULL)` (16846)
- `bottom_1 != NULL` → `zone(bottom_1) == LRU_1_ZONE` 이고 `zone(top) == LRU_1_ZONE` (16849-16850)
- `bottom_1->next_BCB`는 zone1일 수 없다 (16853-16856)
- `(count_lru2 == 0) ⟺ (bottom_2 == NULL)` (16873)
- `bottom_2->next_BCB`는 zone1/zone2일 수 없고, 존재하면 `count_lru3 != 0` (16879-16891)

---

## 16. 설계 의도 분석

### 16.1 왜 3-zone인가?

**zone1 — 락 회피**. 197-200행: "가장 뜨거운 지대이고 대부분의 fix/unfix된 BCB가 여기서 발견된다. unfix 복잡도를 최소로 유지하고 싶으므로 top으로의 boost를 하지 않는다. 이 지대의 BCB는 victim화될 수 없다."

핵심은 **unfix 경로에서 LRU mutex를 아예 잡지 않는 것**이다. 순수 LRU라면 모든 unfix가 리스트 mutex를 잡고 노드를 top으로 옮겨야 하는데, 이는 hot page 경합에서 치명적이다. 6698-6699행이 이 지점을 "가장 자주 실행되는 코드, 고도로 최적화 필요"로 명시한다. zone1 unfix는 `perfmon_inc_stat` + `register_hit_for_lru`뿐이다(6720-6730행).

**zone2 — 이력 관측 창**. 201-204행: "hot lru 1 지대와 victim화 lru 3 지대 사이의 완충. 완충 지대는 첫 지대에서 떨어진 BCB에게 (여전히 뜨겁다면) top으로 다시 boost될 기회를 준다. victim화는 여전히 허용되지 않는다."

zone2가 하는 일은 **correlated reference 필터링**이다. `PGBUF_IS_BCB_OLD_ENOUGH`가 `count_lru2/2`를 임계치로 쓰는 것과 결합해, "한 연산 내에서 읽기+쓰기로 두 번 fix되는" 패턴(10093-10096행)을 boost 대상에서 제외한다. 순수 LRU는 이 두 번째 fix로 페이지를 top에 고정시켜 버린다.

**zone3 — victim 후보 풀**. 205-207행: "세 번째 지대는 victim화 지대다. BCB는 fix/unfix되면 여전히 boost될 수 있지만, 공격적으로 victim화하는 시스템에서는 non-dirty BCB가 여기서 살아남는 일이 드물다."

zone3만 `count_vict_cand`와 `victim_hint`를 관리하므로, victim 탐색은 리스트 전체가 아니라 **꼬리 구역만** 본다. 또한 zone1/zone2에서 victim화가 금지되어 있으므로 hot page가 절대 뽑히지 않는다는 강한 보장이 생긴다 — CLOCK이나 순수 LRU에서 필요한 "referenced 비트 재검사" 같은 것이 불필요하다.

**zone 이동의 비용이 0에 가깝다**는 점도 결정적이다. `pgbuf_bcb_change_zone`은 링크를 건드리지 않고 `bcb->flags`의 zone 비트만 CAS로 바꾼다(15875-15939행). `bottom_1`/`bottom_2` 두 포인터가 논리적 경계를 표시하므로, 수백 개 BCB의 zone 강하가 포인터 두 개 갱신 + N번의 CAS로 끝난다.

### 16.2 왜 private LRU인가? (스캔 오염 방지)

문제: 큰 테이블 풀스캔 하나가 공유 LRU를 전부 채워 다른 트랜잭션의 working set을 축출한다.

CUBRID의 해법은 **각 세션/vacuum worker에게 전용 LRU 리스트와 quota를 부여**하는 것이다.

```
 순수 shared LRU:
   스캔 트랜잭션 T1이 100만 페이지 읽음
   → shared LRU 전체가 T1 페이지로 덮임
   → OLTP 트랜잭션 T2의 인덱스 페이지가 전부 축출됨
   → T2 히트율 붕괴

 private LRU + quota:
   T1은 private LRU N을 씀. quota_N = (a_N / A) × Q_all
   T1이 quota를 넘으면:
     · PGBUF_LRU_LIST_IS_OVER_QUOTA(N) 참
     · pgbuf_get_victim 1단계에서 자기 리스트에서만 victim 획득 (9069-9070)
     · restrict_other = IS_OVER_QUOTA_WITH_BUFFER(N) → 다른 private 접근 차단 (9100)
     · LFCQ에 등록되어 다른 스레드도 N에서 victim을 가져감 (15649)
     · big_private 큐에 들어가 공격적으로 회수됨 (16419-16427)
   → T1은 자기 페이지를 순환시키며 스캔을 계속하고, T2 페이지는 건드리지 않음
```

**private 리스트의 zone 비율이 5%/5%로 고정된 것**(14392-14393행)이 두 번째 방어선이다. private 리스트의 90%가 zone3(victim 가능)이므로, 스캔 트랜잭션이 읽은 페이지는 구조적으로 즉시 회수 가능한 상태에 놓인다. shared 리스트는 사용자 지정 `ratio_lru1`/`ratio_lru2`(기본적으로 훨씬 큼)를 쓰므로 대비가 극명하다.

세 번째 방어선은 **activity 기반 quota**다. 스캔은 각 페이지를 한 번만 읽으므로 `lru_hits`(중복 제거된 접근 페이지 수)가 많아 보일 수 있지만, `register_hit_for_lru`의 `adjust_age` 가드가 같은 페이지 반복 접근을 1회로 세기 때문에 OLTP의 반복 접근이 오히려 유리하게 계산된다.

네 번째는 **vacuum 차별**이다. `PGBUF_SHOULD_IGNORE_UNFIX`(288-294행)로 vacuum worker와 temp 볼륨 페이지는 boost도 hit 등록도 하지 못하고, zone3에서 unfix되면 즉시 direct victim으로 공급된다(6769-6784행). vacuum은 전체 힙을 훑는 최악의 스캐너이므로 별도 처리가 필요하다.

### 16.3 AOUT 효과

AOUT이 해결하는 문제: **버퍼가 작을 때 순환 스캔에서 LRU가 0% 히트율을 낸다.** 버퍼 크기 N, 순환 스캔 길이 N+1이면 순수 LRU는 매번 다음에 필요한 페이지를 직전에 축출한다.

AOUT은 이를 두 방향으로 완화한다:

1. **재참조 증거 기반 승격** (6913-6920행): AOUT에서 발견되고 원래 소유 리스트가 내 private 리스트면 → 즉시 zone1. AOUT 없으면 zone2(중간)에 들어가 다음 강하에 다시 축출될 위험이 있다.
2. **공유 페이지 식별** (6931-6935행): AOUT에 있지만 다른 private 리스트 소속이면 → shared 리스트 중간. 두 트랜잭션이 만진 페이지는 어느 한쪽 private에 두면 안 된다.

VPID만 저장하므로 비용이 극히 낮다: `num_buffers × aout_ratio` 노드, 최대 32768개 × `sizeof(PGBUF_AOUT_BUF)`(≈24바이트) ≈ 786KB로, `PGBUF_LIMIT_AOUT_BUFFERS` 주석이 말하는 "512M 상당"의 이력을 이 정도로 커버한다.

한계: 단일 `Aout_mutex`(655행)가 모든 접근을 직렬화한다. 해시는 샤딩되어 있지만(`num_hashes`) mutex는 하나다. 그래서 `pgbuf_unlatch_void_zone_bcb`가 VOID zone unfix에서만 호출되고(6695행 주석: "거의 안 쓰이거나 히트율이 매우 낮을 때 몇 % 정도"), inline되지 않았다.

### 16.4 hot page 판정

두 개의 독립적인 "hot" 개념이 있다:

| 개념 | 지표 | 임계치 | 용도 |
|---|---|---|---|
| **fix 횟수 기반 hot** | `count_fix_and_avoid_dealloc >> 16` | `PGBUF_FIX_COUNT_THRESHOLD = 64` (106행) | `pgbuf_bcb_is_hot`(16313) → private→shared 이동 조건 2 (6973-6977) |
| **나이 기반 old enough** | `AGE_DIFF(bcb->tick_lru_list, list->tick_list)` | `count_lru2 / 2` (1010-1011행) | zone2 boost 조건(6748), private→shared 조건 2(6978) |

두 개념이 **AND로 결합**되는 것이 `pgbuf_should_move_private_to_shared`의 조건 2다(6973-6989행). "64회 이상 fix됐고 + 충분히 늙었다" — 짧은 시간에 64회 fix된 것(연산 내부 반복)과 오랜 기간에 걸쳐 64회 fix된 것(진짜 공유 hot page)을 구별한다. B-tree root, heap header, 볼륨 헤더가 후자에 해당하고, 이들은 shared LRU로 이동해야 한다.

`pgbuf_bcb_is_hot`은 `pgbuf_assign_flushed_pages`에서도 간접적으로 쓰인다 — 정확히는 `!PGBUF_IS_BCB_IN_LRU_VICTIM_ZONE(bcb)`을 "hot해졌다"로 해석한다(15451-15454행).

`pgbuf_is_thread_high_priority`(11679-11724행)는 페이지 타입 기반의 세 번째 hot 개념이다: `PAGE_VOLHEADER`, `PAGE_FTAB`, B-tree ROOT, heap header 중 하나를 보유하거나 자기 페이지를 누군가 기다리고 있으면 고우선순위 대기 큐로 간다. 이런 스레드가 victim을 못 받고 잠들면 시스템 전체가 그 뒤에 줄을 서게 되기 때문이다.

### 16.5 flush와 victim의 협업 구조

```
                      pgbuf_compute_lru_vict_target (14064)
                        priority_i = f(quota 초과분, zone3 크기)
                                     │
                                     ▼
    pgbuf-page-flush ──▶ pgbuf_flush_victim_candidates (3812)
    (PRM_ID_PAGE_BG_FLUSH_INTERVAL_MSECS)   │
                                     ├─ get_victim_candidates_from_lru (3739)
                                     │    priority 비례로 리스트별 check_count 배분
                                     │    dirty BCB 수집 + 반복당 1개 direct 할당
                                     └─ flush 실행
                                          │
                                          ├─ 압박 시: flushed_bcbs.produce (10870)
                                          │      ▼
                                          │   pgbuf-page-post-flush (1/10/100ms 가변)
                                          │      pgbuf_assign_flushed_pages (15428)
                                          │        → assign_direct_victim
                                          └─ 평시: mark_was_flushed
                                                   → DIRTY 해제 → count_vict_cand++
                                                   → LFCQ 등록 → 탐색자가 발견

    pgbuf-maintain (100ms) ──▶ pgbuf_adjust_quotas (14198)     ← quota 재계산 + LFCQ 복구
                          └──▶ pgbuf_direct_victims_maintenance (9563)  ← ⚠ 현재 no-op
    pgbuf-flush-control (50ms)
```

flush가 dirty를 지우는 순간 `pgbuf_bcb_update_flags`(15762-15784행)가 zone3에 있는 BCB를 victim 후보로 등록하고 hint까지 갱신한다. 즉 **flush 완료가 곧 victim 공급**이며, `pgbuf_wakeup_page_flush_daemon`이 victim 부족 지점마다 흩어져 있다(9412-9415, 9474, 8252, 8303행).

---

## 17. 재구현 시 주의할 미묘한 지점

1. **`count_vict_cand`는 fcnt를 반영하지 않는다.** 후보 카운터와 실제 획득 가능성이 다르므로, `count_vict_cand > 0`을 성공 보장으로 쓰면 무한 루프에 빠진다. `bufptr_victimizable` 추적과 `found_victim_cnt >= lru_victim_cnt` 조기 이탈이 이를 처리한다.

2. **`victim_hint`는 LRU mutex 없이 갱신된다** (`pgbuf_lru_add_victim_candidate`, 15612행). 반드시 CAS 루프 + "새 hint BCB를 먼저 LRU3로 만든 뒤 hint를 바꾼다"는 순서 규약(15618-15626행)을 지켜야 한다. 코드 주석 자체가 이 불변식이 어딘가에서 깨진다고 인정하고 있다(597-599행).

3. **락 순서는 BCB → LRU list**다. 역순이 필요한 곳(`fall_bcb_to_zone_3` 10027행, `get_victim_from_lru_list` 9390행, `panic_assign` 9519행, `get_victim_candidates_from_lru` 3785행)은 예외 없이 `PGBUF_BCB_TRYLOCK`을 쓰고 실패하면 포기한다.

4. **`bcb->flags` 단일 워드에 플래그+zone+lru_index**를 담는 설계 때문에 `pgbuf_bcb_change_zone`과 `pgbuf_bcb_update_flags`가 서로의 갱신을 잃지 않는다. 두 필드로 분리하면 `pgbuf_set_dirty`(LRU mutex 없이 호출됨)와 zone 이동이 경쟁한다.

5. **`min_one` 파라미터**의 의미: `pgbuf_lru_adjust_zone*(min_one=true)`는 zone1(또는 zone1+2)에 최소 1개를 남긴다. unfix/boost 경로는 항상 `true`(10125, 10131, 10166, 10197), quota 조정과 victim 탐색 전 강제 조정은 `false`(9308, 14359, 14397, 14424)를 쓴다. `false`가 리스트를 완전히 zone3로 밀어낼 수 있다.

6. **`pgbuf_lru_add_bcb_to_bottom`은 `tick_list`를 올리지 않는다.** 올리면 리스트의 다른 BCB들이 인위적으로 "늙어" 보여 boost 판정이 왜곡된다.

7. **`pgbuf_get_direct_victim`은 zone에 따라 다르게 처리한다** (15545-15563행). VOID_ZONE(flush 경로에서 이미 리스트 밖) / LRU zone(리스트에서 제거 + AOUT 등록) / INVALID_ZONE(불가능). 반환 시 반드시 VOID_ZONE이어야 한다.

8. **`pgbuf_assign_direct_victim`은 `FLUSHING_TO_DISK_FLAG`를 허용하고 해제한다** (15410행). flush 경로에서 호출되기 때문이다(15383-15385행 주석). 다른 무효화 플래그는 assert로 배제한다.

9. **발견한 두 죽은 코드**:
   - `page_buffer.c:9407` — `pgbuf_remove_from_lru_list`(9400)가 `bufptr->prev_BCB`를 NULL로 만든 뒤 그것을 `pgbuf_panic_assign_direct_victims_from_lru`에 전달. 항상 즉시 0 반환.
   - `page_buffer.c:9577`, `page_buffer.c:9586` — `for (index = prv_index, ...; ... && index != prv_index && ...)`의 초기 조건이 false여서 `pgbuf_direct_victims_maintenance`의 두 루프가 전혀 실행되지 않음. 8162-8167행 TODO가 우려한 "victim 공급 누락" 백업 플랜이 무력화된 상태.

10. **`pgbuf_remove_private_from_aout_list`(10591행)는 정의만 있고 호출되지 않는다.** private 리스트가 재할당될 때 이전 소유자의 AOUT 이력이 남아, 새 소유자가 자기 것이 아닌 페이지를 zone1로 승격시킬 수 있다(6913행 `th_lru_idx == aout_list_id` 조건이 잘못 참이 됨). 영향은 제한적(잘못된 승격 몇 건)이지만 원래 의도된 정리 동작은 빠져 있다.

11. **`victim_rich`(713-714, 14446행)는 계산되지만 소비되지 않는다.** `pgbuf_get_victim`의 9046-9053행 주석이 "`victim_rich`가 참인 동안 세 탐색을 반복한다"고 설명하지만 실제 루프는 shared 단계에만 있고 조건도 `victim_rich`가 아니다. 주석과 코드의 불일치.
