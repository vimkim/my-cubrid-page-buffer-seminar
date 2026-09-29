# page_buffer.c — 자료구조 / 상수 / 메모리 레이아웃 / 초기화·종료

분석 대상: `/home/vimkim/gh/cb/pgbuf-analysis/src/storage/page_buffer.c` (17,535줄), HEAD `e6ed61e87`.
크기·오프셋 수치는 x86-64 / glibc / `SERVER_MODE` / `IO_PAGESIZE = 16K` 기준으로 구조체를 재현해 실측한 값이다(§4.1).

---

## 1. 상수·매크로 카탈로그

### 1.1 풀 규모와 홀더 관련

| 매크로 | 값 | 라인 | 의미 |
|---|---|---|---|
| `PGBUF_MINIMUM_BUFFERS` | `MAX_NTRANS * 10` | `page_buffer.c:84` | 버퍼 프레임 하한. `MAX_NTRANS = css_get_max_conn() + 1` (`src/transaction/log_common_impl.h:51`) |
| `PGBUF_DEFAULT_FIX_COUNT` | 7 | `page_buffer.c:90` | 스레드당 사전 예약되는 free BCB holder 개수 |
| `PGBUF_NUM_ALLOC_HOLDER` | 10 | `page_buffer.c:94` | holder가 고갈됐을 때 한 번에 malloc 하는 `PGBUF_HOLDER_SET` 원소 수 |
| `PGBUF_FIX_COUNT_THRESHOLD` | 64 | `page_buffer.c:106` | hot page 판정 임계치 (누적 fix 횟수) |
| `pgbuf_latch_timeout_msecs` | 300,000 (초기값) | `page_buffer.c:107` | `PRM_ID_PAGE_LATCH_TIMEOUT_IN_MSECS`로 `pgbuf_initialize`에서 덮어씀 (`:1675`) |
| `PGBUF_MAX_PAGE_WATCHERS` | 64 | `page_buffer.c:319` | 한 holder에 붙을 수 있는 watcher 최대 수 |
| `PGBUF_MAX_PAGE_FIXED_BY_TRAN` | 64 | `page_buffer.c:321` | ordered fix가 다루는 동시 고정 페이지 최대 수 |

### 1.2 크기 계산 매크로

| 매크로 | 정의 | 라인 | 실측값 |
|---|---|---|---|
| `SIZEOF_IOPAGE_PAGESIZE_AND_GUARD()` | `IO_PAGESIZE` (+ `sizeof(pgbuf_Guard)` = 8, `CUBRID_DEBUG`) | `:110-114` | 16384 (일반 빌드) |
| `PGBUF_BCB_SIZEOF` | `sizeof (PGBUF_BCB)` | `:117` | **144** |
| `PGBUF_IOPAGE_BUFFER_SIZE` | `offsetof (PGBUF_IOPAGE_BUFFER, iopage) + SIZEOF_IOPAGE_PAGESIZE_AND_GUARD()` | `:118-120` | 8 + 16384 = **16392** |
| `PGBUF_BUFFER_HASH_SIZEOF` | `sizeof (PGBUF_BUFFER_HASH)` | `:122` | **56** |
| `PGBUF_BUFFER_LOCK_SIZEOF` | `sizeof (PGBUF_BUFFER_LOCK)` | `:124` | **24** |
| `PGBUF_LRU_LIST_SIZEOF` | `sizeof (PGBUF_LRU_LIST)` | `:126` | **128** |
| `PGBUF_HOLDER_SIZEOF` | `sizeof (PGBUF_HOLDER)` | `:128` | **56** (NDEBUG) / **65600** (DEBUG) |
| `PGBUF_HOLDER_SET_SIZEOF` | `sizeof (PGBUF_HOLDER_SET)` | `:130` | 10×holder + next 포인터 |
| `PGBUF_HOLDER_ANCHOR_SIZEOF` | `sizeof (PGBUF_HOLDER_ANCHOR)` | `:132` | **64** (`static_assert`로 강제, `:492`) |

`PGBUF_IOPAGE_BUFFER_SIZE`가 `sizeof (PGBUF_IOPAGE_BUFFER)`가 아니라 `offsetof` + 런타임 페이지 크기인 이유는 `FILEIO_PAGE::page`가 `char[1]` 가변 페이로드이기 때문이다(`src/storage/file_io.h:186-193`). 같은 이유로 copy buffer도 `PGBUF_COPY_BUFFER_ALLOC_SIZE`로 동적 계산한다(`page_buffer.c:874-877`).

### 1.3 포인터 변환 매크로 (`:135-169`)

```c
PGBUF_FIND_BCB_PTR(i)     = (char *)&BCB_table[0]    + 144   * i        /* :135 */
PGBUF_FIND_IOPAGE_PTR(i)  = (char *)&iopage_table[0] + 16392 * i        /* :138 */
PGBUF_FIND_IOPAGE_PTR_FROM_EXTERNAL_ALLOCATE(mem, i)                    /* :141  DWB 등 외부 버퍼용 */
PGBUF_FIND_BUFFER_GUARD(bufptr) = &bufptr->iopage_buffer->iopage.page[DB_PAGESIZE]  /* :144 */

CAST_PGPTR_TO_BFPTR(bufptr, pgptr):                                     /* :148 */
    bufptr = ((PGBUF_IOPAGE_BUFFER *)((char *)pgptr - 40))->bcb;        /* 40 = offsetof(...,iopage.page) */
    assert (bufptr == bufptr->iopage_buffer->bcb);
CAST_PGPTR_TO_IOPGPTR(io_pgptr, pgptr): io_pgptr = pgptr - 32           /* :155  32 = offsetof(FILEIO_PAGE,page) */
CAST_IOPGPTR_TO_PGPTR(pgptr, io_pgptr): pgptr = io_pgptr->page          /* :160 */
CAST_BFPTR_TO_PGPTR(pgptr, bufptr):     pgptr = (char *)bufptr->iopage_buffer + 40  /* :165 */
```

핵심: `PAGE_PTR`은 **`FILEIO_PAGE::page`의 시작 주소**다. 따라서 `PAGE_PTR`에서 40바이트를 빼면 `PGBUF_IOPAGE_BUFFER`의 시작이고, 그 첫 8바이트가 소속 `PGBUF_BCB *`이다. BCB 배열 인덱스로부터의 역산이 아니라 **역방향 포인터 1개**로 O(1) 매핑을 한다. 이 덕분에 `pgbuf_copy_buffer`처럼 BCB 테이블 밖에 있는 독립 `<dummy BCB, iopage>` 쌍도 동일한 CAST 매크로를 만족한다(`:862-872`).

BCB → 풀 인덱스는 별도 포인터 산술이다: `pgbuf_bcb_get_pool_index()`는 `bcb - pgbuf_Pool.BCB_table` (`:16192-16196`). 이는 BCB_table이 **연속 배열**이라는 것에 의존한다.

### 1.4 해시 / LRU / 플러시 관련 상수

| 매크로 | 값 | 라인 | 비고 |
|---|---|---|---|
| `HASH_SIZE_BITS` | 20 | `:297` | 고정 |
| `PGBUF_HASH_SIZE` | `1 << 20` = 1,048,576 | `:298` | **풀 크기와 무관하게 고정** |
| `PGBUF_HASH_VALUE(vpid)` | `pgbuf_hash_func_mirror(vpid)` | `:302` | |
| `UINT16MAX` | 65534 | `:300` | **사용처 없음(dead)** |
| `PGBUF_LRU_NBITS` | 16 | `:180` | |
| `PGBUF_LRU_LIST_MAX_COUNT` | 65536 | `:181` | LRU 인덱스 상한 |
| `PGBUF_LRU_INDEX_MASK` | `0x0000FFFF` | `:182` | |
| `PGBUF_LRU_ZONE_MIN_RATIO` / `MAX_RATIO` | 0.05 / 0.90 | `:344-345` | zone1/2 비율 클램프 |
| `PGBUF_PRIVATE_LRU_MIN_COUNT` | 4 | `:1025` | |
| `PGBUF_PRIVATE_LRU_MAX_HARD_QUOTA` | 5000 | `:1026` | |
| `PGBUF_MIN_PAGES_IN_SHARED_LIST` | 1000 | `:1029` | shared LRU 개수 산정에 사용 |
| `PGBUF_MIN_SHARED_LIST_ADJUST_SIZE` | 50 | `:1030` | |
| `PBGUF_BIG_PRIVATE_MIN_SIZE` | 100 | `:1073` | (오타 포함 원문 그대로) |
| `PGBUF_TRAN_THRESHOLD_ACTIVITY` | `num_buffers / 4` | `:276` | private LRU 폐기 판정 |
| `PGBUF_TRAN_MAX_ACTIVITY` | `10 * THRESHOLD` | `:277` | activity 누적 상한 |
| `PGBUF_AOUT_NOT_FOUND` | -2 | `:279` | `PGBUF_AOUT_BUF::lru_idx` 미할당 표식 |
| `AOUT_HASH_DIVIDE_RATIO` | 1000 | `:936` | Aout 해시 테이블 수 = `max_count/1000` |
| `PGBUF_MAX_NEIGHBOR_PAGES` | 32 | `:312` | |
| `PGBUF_FLUSH_VICTIM_BOOST_MULT` | 10 | `:307` | |
| `PGBUF_CHKPT_MAX_FLUSH_RATE` / `MIN` | 1200 / 50 pages/s | `:324-325` | |
| `PGBUF_CHKPT_BURST_PAGES` | 16 | `:328` | |
| `PGBUF_FLUSHED_BCBS_BUFFER_SIZE` | 8192 | `:753` | post-flush 처리 큐 크기 |
| `PGBUF_LRU_VICTIM_LFCQ_FLAG` | `0x80000000` | `:1076` | `PGBUF_LRU_LIST::flags`의 유일한 플래그 |

### 1.5 열거형 (익명 enum)

- 버퍼 락 반환값: `PGBUF_LOCK_WAITER = 0`, `PGBUF_LOCK_HOLDER` (`:348-351`)
- 페이지 내용 상태: `PGBUF_CONTENT_BAD/GOOD/LIKELY_BAD/ERROR` (`:354-360`) — `CUBRID_DEBUG` 검사 코드용

---

## 2. 비트 인코딩 — 이 파일의 핵심 트릭

### 2.1 `PGBUF_BCB::flags` — 플래그 + zone + LRU 인덱스를 한 `int`에

`volatile int flags` 하나에 세 종류 정보가 겹치지 않게 배치된다(`:521`). 32비트 배치:

```
 bit  31 30 29 28 27 26 25 | 24 ... 20 | 19 18 | 17 16 | 15 ......... 0
      D  F  V  I  M  T  A  |  (unused) |  I  V |  L L  |   LRU index
      │  │  │  │  │  │  │                  │ │    │ │
      │  │  │  │  │  │  └ ASYNC_FLUSH_REQ  0x02000000   :241
      │  │  │  │  │  └──── TO_VACUUM       0x04000000   :239
      │  │  │  │  └─────── MOVE_TO_LRU_BOTTOM 0x08000000 :237
      │  │  │  └────────── INVALIDATE_DIRECT_VICTIM 0x10000000 :235
      │  │  └───────────── VICTIM_DIRECT   0x20000000   :234
      │  └──────────────── FLUSHING_TO_DISK 0x40000000  :227
      └─────────────────── DIRTY           0x80000000   :224
                                            │ │    │ │
                                            │ │    └─┴─ LRU zone 필드 (bit 17..16)
                                            └─┴──────── INVALID/VOID zone 필드 (bit 19..18)
```

마스크 값 (`:180-216`, `:244-262`):

| 심볼 | 값 | 라인 |
|---|---|---|
| `PGBUF_LRU_1_ZONE` = `1 << 16` | `0x00010000` | `:197` |
| `PGBUF_LRU_2_ZONE` = `2 << 16` | `0x00020000` | `:198` |
| `PGBUF_LRU_3_ZONE` = `3 << 16` | `0x00030000` | `:199` |
| `PGBUF_LRU_ZONE_MASK` | `0x00030000` | `:201` |
| `PGBUF_INVALID_ZONE` = `1 << 18` | `0x00040000` | `:205` |
| `PGBUF_VOID_ZONE` = `2 << 18` | `0x00080000` | `:206` |
| `PGBUF_ZONE_MASK` | `0x000F0000` | `:211` |
| `PGBUF_LRU_INDEX_MASK` | `0x0000FFFF` | `:182` |
| `PGBUF_BCB_FLAGS_MASK` | `0xFE000000` | `:244-251` |
| `PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK` | `0xF0000000` | `:258-262` |
| `PGBUF_BCB_INIT_FLAGS` | `PGBUF_INVALID_ZONE` = `0x00040000` | `:265` |

주의할 점 세 가지.

1. **`PGBUF_LRU_3_ZONE`은 단일 비트가 아니다.** `3 << 16`이므로 `LRU_1 | LRU_2` 패턴이다. 따라서 zone 비교는 반드시 `PGBUF_GET_ZONE()`으로 4비트 필드를 뽑아 **동등 비교**해야 하고(`:215`), "LRU에 있는가" 판정만 `(zone & PGBUF_LRU_ZONE_MASK) != 0`을 쓴다(`PGBUF_IS_BCB_IN_LRU`, `:1003`). zone 값 하나만 비트 테스트하면 LRU3이 LRU1/LRU2로도 오판된다.
2. **INVALID/VOID zone은 LRU zone과 겹치지 않는 상위 2비트를 쓴다.** 주석대로 "`PGBUF_LRU_ZONE_MASK`가 쓰는 두 비트를 건너뛴" 배치다(`:203-208`). `pgbuf_flags_mask_sanity_check()`가 이 네 가지 비중첩을 부팅 시 강제한다(`:16800-16820`): flags∩zone, flags∩lru_index, zone∩lru_index, `(INVALID|VOID)`∩`LRU_ZONE_MASK` 중 하나라도 겹치면 `PGBUF_ABORT_RELEASE()`.
3. **bit 20~24 (`0x01F00000`)는 미사용**이다. 새 BCB 플래그를 추가할 여유가 5비트 있고, 그 이상 필요하면 `PGBUF_LRU_NBITS`를 줄여야 한다(`:178-179` 주석이 그 계약을 명시).

접근 매크로 (`:214-216`):
```c
PGBUF_MAKE_ZONE(list_id, zone) ((list_id) | (zone))
PGBUF_GET_ZONE(flags)          ((PGBUF_ZONE)((flags) & 0x000F0000))
PGBUF_GET_LRU_INDEX(flags)     ((flags) & 0x0000FFFF)
```

`PGBUF_MAKE_ZONE`은 VOID/INVALID zone일 때 `list_id`가 0이어야 정상이다. `pgbuf_bcb_change_zone()`이 `assert (new_lru_idx == 0 || new_zone은 LRU_x_ZONE)`으로 이를 강제하므로(`:15839-15840`), VOID/INVALID 상태의 BCB는 LRU 인덱스 비트가 항상 0이다. `pgbuf_bcb_get_lru_index()`는 `assert (PGBUF_IS_BCB_IN_LRU (bcb))`를 먼저 확인한다(`:15947`).

**flags 갱신 규약.** flags는 BCB mutex 없이도 변경될 수 있으므로(대표적으로 `pgbuf_set_dirty`) 모든 갱신은 CAS 루프다.
- `pgbuf_bcb_update_flags(thread, bcb, set, clear)` (`:15728-15796`): `set`/`clear`가 `PGBUF_BCB_FLAGS_MASK` 안에 있는지 assert한 뒤 CAS로 flags만 바꾼다. 성공하면 (a) zone이 LRU3였다면 victim 후보 유효성 변화(`INVALID_VICTIM_CANDIDATE_MASK` 진입/이탈)를 LRU victim 카운터/힌트에 반영하고(`:15755-15779`), (b) dirty 비트 변화를 `monitor.dirties_cnt`에 `ATOMIC_INC_64`로 반영한다(`:15781-15793`).
- `pgbuf_bcb_change_zone()` (`:15826-15924`): flags 중 **zone+lru_index만** 교체하는 CAS 루프(`new = (old & FLAGS_MASK) | new_zone_idx`, `:15849`). 성공 후 이전/새 zone의 `count_lru1/2/3`을 조정하는데, 이 카운터들은 **LRU mutex로만 보호**되므로 원자연산 없이 증감한다(`:15819-15824` 주석). shared LRU 진입/이탈은 `monitor.lru_shared_pgs_cnt`를 `ATOMIC_INC_32`로 갱신(`:15871`, `:15901`).
- `pgbuf_bcb_set_dirty()`는 최적화를 위해 `update_flags`를 안 쓰고 전용 CAS 루프를 돈다(`:15969-15997`).

### 2.2 `count_fix_and_avoid_dealloc` — 상위 16비트 fix 카운트, 하위 16비트 avoid-dealloc

```
 bit  31 ................ 16 | 15 ................. 0
      누적 fix 횟수 (hot 판정)  | avoid deallocation 참조 카운트
      PGBUF_BCB_COUNT_FIX_SHIFT_BITS = 16   :268
                                 PGBUF_BCB_AVOID_DEALLOC_MASK = 0x0000FFFF   :269
```

두 필드를 별도 `short` 두 개로 두지 않은 이유가 주석에 있다(`:535-540`): avoid-dealloc 카운트는 **원자적으로** 변경돼야 하는데 2바이트 원자연산은 이식성이 없다. 그래서 하나의 `volatile int`에 넣고 32비트 원자연산으로 각 필드를 독립적으로 증감한다.

| 연산 | 구현 | 라인 |
|---|---|---|
| fix 등록 | `if (count < 64<<16) ATOMIC_INC_32 (&count, 1 << 16)` | `:16297-16310` |
| hot 판정 | `count >= 64 << 16` (= `0x00400000`) | `:16318-16323` |
| avoid-dealloc 등록 | `ATOMIC_INC_32 (&count, 1)` | `:16204-16209` |
| avoid-dealloc 해제 | 하위 16비트가 0이면 skip + 디버그 로그, 아니면 CAS로 `-1` | `:16217-16253` |
| avoid-dealloc 조회 | `(count & 0x0000FFFF) != 0` | `:16261-16267` |
| 전체 리셋 | `count = 0` (BCB 재활용 시) | `:16280-16289` |

세부 사항:

- **`assert ((count & 0x00008000) == 0)`** 이 세 곳에 있다(`:16207`, `:16225`, `:16265`). bit 15가 세워지면 다음 증가가 상위 필드로 캐리되어 fix 카운트를 오염시킨다. 즉 avoid-dealloc의 실사용 상한은 32,767이다.
- fix 카운트는 **감소하지 않는다.** 임계치 도달 후에는 증가도 멈춰 사실상 포화한다(`:16300-16301` 주석: "hot page 감지 목적일 뿐, 임계치 이후로는 셀 필요가 없다"). 임계치 부근에서 동시 증가가 겹치면 약간 초과할 수 있으나 무해하다.
- 이 fix 카운트는 **latch fix count가 아니다.** 실제 latch 참조 수는 `atomic_latch.impl.fcnt`(§2.3)다. 혼동하기 쉬운 지점.
- `pgbuf_bcb_unregister_avoid_deallocation()`의 "카운트가 이미 0" 케이스는 버그가 아니라 **의도된 허용**이다. `pgbuf_ordered_fix`가 페이지를 전부 unfix하고 재정렬하는 동안 avoid-dealloc 표시된 BCB가 victim으로 뽑힐 수 있고, 재fix 시 디스크에서 새로 읽히면 카운트가 0으로 리셋된 상태이기 때문이다(`:16232-16244`의 상세 설명). 즉 avoid-dealloc은 **완벽한 보장이 아닌 힌트**다.
- `flags`가 `int`인 것과 달리 이 필드는 bit 31을 절대 쓰지 않으므로 항상 음이 아니다 (`assert (count >= 0)`, `:16264`, `:16321`).

### 2.3 `union pgbuf_atomic_latch_impl` — latch 상태를 64비트 워드 하나에 (`:501-510`)

```c
union pgbuf_atomic_latch_impl {
  uint64_t raw;
  struct {
    PGBUF_LATCH_MODE latch_mode;  /* enum : uint16_t  → 2 bytes, bit 15..0  */
    uint16_t         waiter_exists;                /* 2 bytes, bit 31..16 */
    int32_t          fcnt;                         /* 4 bytes, bit 63..32 */
  } impl;
};
typedef std::atomic<uint64_t> PGBUF_ATOMIC_LATCH;   /* :367 */
```

`PGBUF_LATCH_MODE`가 `enum : uint16_t`로 선언된 것(`page_buffer.h:190-197`)이 이 union 레이아웃의 전제다. 값: `PGBUF_NO_LATCH=0`, `READ=1`, `WRITE=2`, `FLUSH=3`(블록 모드 전용), `INVALID=4`.

`raw`를 대상으로 CAS 루프를 돌려 세 필드를 원자적으로 함께 갱신하는 헬퍼가 `:1368-1496`에 모여 있다:

| 헬퍼 | 라인 | 동작 |
|---|---|---|
| `set_latch` | `:1394-1406` | latch_mode만 교체 (CAS `compare_exchange_weak`, `acq_rel`/`acquire`) |
| `add_fcnt` | `:1408-1420` | fcnt에 delta 가산 |
| `set_latch_and_fcnt` | `:1422-1435` | latch_mode 교체 + fcnt 절대값 설정 |
| `set_latch_and_add_fcnt` | `:1437-1450` | latch_mode 교체 + fcnt 가산 |
| `set_waiter_exists` | `:1452-1464` | waiter_exists 설정 |
| `get_fcnt` / `get_waiter_exists` / `get_latch` / `get_impl` | `:1466-1496` | `load(memory_order_acquire)` 후 필드 추출 |

`get_impl()`이 세 필드의 **일관된 스냅샷**을 주는 것이 중요하다. `pgbuf_lockfree_fix_ro()`가 이를 이용해 mutex 없이 read latch를 하나 더 얻는다: 스냅샷이 `latch_mode == READ && !waiter_exists && fcnt > 0 && vpid 일치`일 때만 `fcnt++` CAS를 시도한다(`:7685-7697`). 세 필드가 분리돼 있으면 성립하지 않는 최적화다.

`copy_bcb()`는 이 원자 필드를 `store(load())`로 복사한다(`:1375`) — `std::atomic`은 복사 대입이 불가능하기 때문.

---

## 3. 구조체 상세

### 3.1 `PGBUF_BCB` — 버퍼 제어 블록 (`:513-545`)

| 필드 | 타입 | 의미 | 보호 |
|---|---|---|---|
| `mutex` | `pthread_mutex_t` | BCB mutex (SERVER_MODE only) | — |
| `owner_mutex` | `int` | mutex 소유 스레드 인덱스, 미소유 시 `-1` | BCB mutex 자체. `pgbuf_Monitor_locks`일 때만 유효 |
| `vpid` | `VPID` | 상주 페이지의 (volid, pageid) | BCB mutex. 단 lock-free 경로는 `vpid` 재확인으로 검증(`:7656`, `:7690`) |
| `atomic_latch` | `std::atomic<uint64_t>` | latch_mode + waiter_exists + fcnt (§2.3) | 원자 CAS (mutex 없이도 갱신 가능) |
| `flags` | `volatile int` | 플래그 + zone + LRU 인덱스 (§2.1) | 원자 CAS. zone 전이는 추가로 LRU mutex 필요 |
| `next_wait_thrd` | `THREAD_ENTRY *` | 이 BCB의 latch 대기 큐 (단일 연결) | BCB mutex |
| `latch_last_thread` | `THREAD_ENTRY *` | 마지막으로 latch를 얻은 스레드 (진단용) | BCB mutex |
| `hash_next` | `PGBUF_BCB *` | 해시 체인 next | 해당 버킷의 `hash_mutex` |
| `prev_BCB` / `next_BCB` | `PGBUF_BCB *` | LRU 이중 연결. `next_BCB`는 invalid(free) 리스트에서도 재사용 | LRU mutex / `invalid_mutex` |
| `tick_lru_list` | `int` | 리스트에 들어갈 때의 `lru_list->tick_list` 스냅샷. top boost 판단용 | LRU mutex |
| `tick_lru3` | `int` | LRU zone 3 내 위치(작을수록 bottom). victim 힌트 갱신용 | LRU mutex |
| `count_fix_and_avoid_dealloc` | `volatile int` | 이중 용도 카운터 (§2.2) | 원자연산 |
| `hit_age` | `int` | 마지막 hit 시점의 `quota.adjust_age`. LRU별 hit 중복 집계 방지 | 비보호(근사) — `:16561-16565` |
| `oldest_unflush_lsa` | `LOG_LSA` | 디스크에 미반영된 가장 오래된 변경의 LSA (WAL 규약) | BCB mutex |
| `iopage_buffer` | `PGBUF_IOPAGE_BUFFER *` | 짝이 되는 IO 페이지 슬롯 | 초기화 후 불변 |

실측 오프셋(§4.1): `mutex@0, owner_mutex@40, vpid@44, atomic_latch@56, flags@64, next_wait_thrd@72, latch_last_thread@80, hash_next@88, prev_BCB@96, next_BCB@104, tick_lru_list@112, tick_lru3@116, count_fix_and_avoid_dealloc@120, hit_age@124, oldest_unflush_lsa@128, iopage_buffer@136` → **144바이트**.

주목할 점: 144는 64의 배수가 아니므로 BCB는 캐시라인 정렬되지 않고, 인접 BCB가 라인을 공유한다(BCB 4개 = 576B = 정확히 9라인, 주기 4). `PGBUF_HOLDER_ANCHOR`처럼 명시적 패딩이 없다. 반면 `mutex`가 0 오프셋에 있어 `mutex`와 `owner_mutex`·`vpid`·`atomic_latch`는 같은 라인(0~63)에 들어간다 — mutex 획득 직후 접근하는 필드들이 한 라인에 모인 것은 유리하다.

### 3.2 `PGBUF_IOPAGE_BUFFER` (`:548-557`) 와 `FILEIO_PAGE`의 관계

```c
struct pgbuf_iopage_buffer {
  PGBUF_BCB *bcb;          /* 역방향 포인터, offset 0 */
#if (__WORDSIZE == 32)
  int dummy;               /* iopage 8바이트 정렬 보정 */
#elif !defined(LINUX) && !defined(WINDOWS) && !defined(AIX)
#error "you must check that iopage is aligned by 8byte !!"
#endif
  FILEIO_PAGE iopage;      /* offset 8 */
};
```

`FILEIO_PAGE` (`src/storage/file_io.h:186-193`):

```
 offset 0        8    12  14 15 16   20   24        32                    IO_PAGESIZE-8   IO_PAGESIZE
        ┌────────┬────┬───┬──┬──┬────┬────┬────────┬──────────────────────┬──────────────┐
        │prv.lsa │pgid│vid│pt│pf│res1│res2│tde_nonce│  page[DB_PAGESIZE]  │   prv2.lsa   │
        └────────┴────┴───┴──┴──┴────┴────┴────────┴──────────────────────┴──────────────┘
        └────────── FILEIO_PAGE_RESERVED (32B) ─────────────┘                └── 8B ──┘
```

- `sizeof (FILEIO_PAGE_RESERVED)` = **32**, `sizeof (FILEIO_PAGE_WATERMARK)` = **8**
- `RESERVED_SIZE_IN_PAGE` = 40 (`src/storage/storage_common.c:44`)
- `DB_PAGESIZE = IO_PAGESIZE - 40` → 기본 16384 − 40 = **16344** (`storage_common.c:48,74`)
- `prv2`는 `FILEIO_PAGE` 구조체 선언상 `page[1]` 뒤에 오지만 **실제 위치는 페이지 맨 끝**이다. 헤더 주석이 `page_ptr.prv2`로 직접 접근하지 말라고 경고하며(`file_io.h:191`), 실주소는 `fileio_get_page_watermark_pos()`로 계산한다(`file_io.h:195-199`).

**함정 (실제 결함 후보):** `PGBUF_FIND_BUFFER_GUARD(bufptr)` = `&iopage.page[DB_PAGESIZE]` = iopage + 32 + (IO_PAGESIZE−40) = **iopage + IO_PAGESIZE − 8**. 이는 `prv2` 워터마크 LSA와 **바이트 단위로 정확히 겹친다**. `CUBRID_DEBUG` 빌드에서 `memcpy (PGBUF_FIND_BUFFER_GUARD (bufptr), pgbuf_Guard, 8)` (`:5616`)은 워터마크를 파괴한다. `prv2`가 나중에 도입된 필드이고 `CUBRID_DEBUG`는 빌드 시스템에서 정의되지 않으므로(`CMakeLists.txt`/`cmake/`/`build.sh`에 정의 없음) 실사용에서는 죽은 코드지만, 이 가드 코드를 되살리려면 오프셋을 고쳐야 한다. 부수적으로 `SIZEOF_IOPAGE_PAGESIZE_AND_GUARD()`가 확보한 뒤쪽 여유 8바이트는 가드가 실제로 쓰지 않는다.

### 3.3 `PGBUF_BUFFER_HASH` (`:577-584`) 와 `PGBUF_BUFFER_LOCK` (`:564-571`)

| 구조체 | 필드 | 의미 | 보호 |
|---|---|---|---|
| `PGBUF_BUFFER_HASH` (56B) | `hash_mutex` | 해시 체인 **및 버퍼 락 체인**의 무결성 보호 | — |
| | `hash_next` (`PGBUF_BCB *`) | 상주 BCB 체인 앵커 | `hash_mutex` |
| | `lock_next` (`PGBUF_BUFFER_LOCK *`) | "읽는 중" 페이지의 락 체인 앵커 | `hash_mutex` |
| `PGBUF_BUFFER_LOCK` (24B) | `vpid` | 락이 걸린 페이지 | `hash_mutex` |
| | `lock_next` | 같은 버킷 내 다음 락 레코드 | `hash_mutex` |
| | `next_wait_thrd` | 이 VPID를 기다리는 스레드 큐 | `hash_mutex` |

**버퍼 락 테이블의 목적.** 페이지가 버퍼에 없어서 디스크에서 읽어와야 할 때, 여러 스레드가 동시에 같은 VPID를 읽어 BCB 두 개를 만드는 것을 막는다. 흐름:

1. `pgbuf_search_hash_chain()`이 실패하면 호출자는 `hash_mutex`를 **잡은 채로** 반환받는다(`:7666-7667` 주석).
2. `pgbuf_lock_page()` (`:7937-8035`): 락 체인에 같은 VPID가 있으면 자기 `THREAD_ENTRY`를 `next_wait_thrd`에 매달고 `pgbuf_sleep(…, &hash_anchor->hash_mutex)`로 mutex를 넘기며 잠든 뒤 `PGBUF_LOCK_WAITER`를 반환. 없으면 **자기 스레드 인덱스의 슬롯**(`buf_lock_table[thread->index]`, `:8025`)을 체인에 끼우고 `hash_mutex`를 풀고 `PGBUF_LOCK_HOLDER`를 반환.
3. holder가 BCB를 할당해 디스크에서 읽고, `pgbuf_insert_into_hash_chain()`으로 해시 체인에 넣는다. 이 함수는 `hash_mutex`를 잡고 **풀지 않는다**(`:7819-7825`).
4. `pgbuf_unlock_page()` (`:8050-8125`)가 락 레코드를 체인에서 빼고 `hash_mutex`를 풀고 대기자 전원을 `pgbuf_wakeup_uncond`로 깨운다.

따라서 락 테이블 크기가 `thread_num_total_threads()`인 것은 **스레드당 최대 1개의 버퍼 락**만 보유한다는 불변식에서 나온다(`:559-563`, `:8021-8022` 주석). 이 불변식이 깨지면 락 레코드가 조용히 덮어써진다.

### 3.4 `PGBUF_LRU_LIST` (`:587-625`) — 128바이트, 정확히 2 캐시라인

| 필드 | 타입 | 의미 | 보호 |
|---|---|---|---|
| `mutex` | `pthread_mutex_t` | LRU 리스트 무결성 | — |
| `top`, `bottom` | `PGBUF_BCB *` | 리스트 양 끝 | LRU mutex |
| `bottom_1`, `bottom_2` | `PGBUF_BCB *` | zone1 / zone2의 마지막 BCB. 해당 zone이 비면 NULL | LRU mutex |
| `victim_hint` | `PGBUF_BCB *volatile` | victim 탐색 시작점 | **`ATOMIC_CAS_ADDR`** (`:15709`), mutex 없이도 갱신 |
| `count_lru1/2/3` | `int` | zone별 BCB 수 | LRU mutex (원자연산 불필요 — `:15822-15824`) |
| `count_vict_cand` | `int` | victim 후보 수 | 원자연산 (`pgbuf_lru_add/remove_victim_candidate`) |
| `threshold_lru1/2` | `int` | zone1/zone2 목표 크기. init 0, `pgbuf_adjust_quotas`가 설정 | 비보호(근사) |
| `quota` | `int` | private 리스트 목표 크기 (shared는 미사용) | 비보호(근사) |
| `tick_list` | `int` | BCB 추가/boost마다 증가 (aging 기준) | LRU mutex |
| `tick_lru3` | `int` | BCB가 zone3로 떨어질 때마다 증가 | LRU mutex |
| `flags` | `volatile int` | `PGBUF_LRU_VICTIM_LFCQ_FLAG`만 사용 | CAS로 set (`:16345`), **clear는 비원자적** (`:16365`, `:16457` — 주석에 이유와 조건 명시) |
| `index` | `int` | 자기 인덱스 (0..shared−1: shared, 이후 private) | 초기화 후 불변 |

`victim_hint`에 대해 소스 자체가 남긴 미해결 이슈: "TPCC core 분석 중 hint가 victim 가능한 첫 BCB보다 앞에 있는 경우를 봤다. 어딘가 논리 오류가 있다"(`:599-601`).

임계치/쿼터 계산은 `pgbuf_adjust_quotas`에 있다(초기화 관점만 정리): private은 `quota = activity 비율 × all_private_quota`를 `PGBUF_PRIVATE_LRU_MAX_HARD_QUOTA`(5000)와 `num_buffers/2`로 클램프하고 `threshold_lru1 = threshold_lru2 = quota × 0.05`(`:14386-14393`), shared는 `avg_shared_lru_size × ratio_lru1 / ratio_lru2`(`:14416-14424`).

### 3.5 `PGBUF_INVALID_LIST` (`:628-635`)

| 필드 | 의미 | 보호 |
|---|---|---|
| `invalid_mutex` | 리스트 무결성 | — |
| `invalid_top` (`PGBUF_BCB *`) | 스택 top. 연결은 `bcb->next_BCB` 재사용 | `invalid_mutex` |
| `invalid_cnt` (`int`) | 원소 수 | `invalid_mutex` |

단일 연결 LIFO다. `pgbuf_get_bcb_from_invalid_list()`는 **이중 검사**로 mutex 획득을 회피한다: mutex 없이 `invalid_top == NULL`을 먼저 보고(`:8869`), 아니면 mutex를 잡고 다시 확인(`:8877`). 꺼낸 뒤 BCB mutex를 잡고 zone을 `PGBUF_VOID_ZONE`으로 전이(`:8891-8893`).

`pgbuf_put_bcb_into_invalid_list()`는 **BCB mutex를 이미 쥔 상태로 호출**되며, latch를 `PGBUF_LATCH_INVALID`로 설정하고 `assert ((flags & PGBUF_BCB_FLAGS_MASK) == 0)`으로 모든 플래그가 꺼진 상태임을 강제한 뒤(`:8919`) zone을 `PGBUF_INVALID_ZONE`으로 바꾸고 카운터를 리셋한다. 반환 시 **BCB mutex를 풀어준다**(`:8927`) — 호출 규약이 비대칭이라 주의.

### 3.6 `PGBUF_AOUT_LIST` (`:652-668`) / `PGBUF_AOUT_BUF` (`:643-649`)

2Q의 Aout(victim된 페이지의 VPID 이력) 구현. LRU는 BCB 리스트, Aout은 VPID FIFO다(`:637-641` 주석).

| 구조체 | 필드 | 의미 | 보호 |
|---|---|---|---|
| `PGBUF_AOUT_BUF` (32B) | `vpid` | 이력에 남은 페이지 | `Aout_mutex` |
| | `lru_idx` | victim 당시 LRU 인덱스, 미할당은 `PGBUF_AOUT_NOT_FOUND`(−2) | `Aout_mutex` |
| | `next`, `prev` | 이중 연결 (FIFO + free 리스트 겸용) | `Aout_mutex` |
| `PGBUF_AOUT_LIST` | `Aout_mutex` | 리스트 + 해시 무결성 | — |
| | `Aout_top`, `Aout_bottom` | FIFO 양 끝 | `Aout_mutex` |
| | `Aout_free` | free 노드 단일 연결 리스트 | `Aout_mutex` |
| | `bufarray` | 전체 노드를 담은 사전 할당 배열 | 초기화 후 불변 |
| | `num_hashes` | 해시 테이블 개수 | 초기화 후 불변 |
| | `aout_buf_ht` | `MHT_TABLE **`, VPID→노드 빠른 조회 | `Aout_mutex` |
| | `max_count` | Aout 최대 크기. 0이면 기능 비활성 | 초기화 후 불변 |

노드를 사전 할당하는 이유는 "Aout은 크기가 고정이므로 전부 미리 잡는 게 합리적"이라는 것(`:662-663`). 해시를 `num_hashes = max(max_count/1000, 1)`개로 **샤딩**하되(`:5811`) 락은 여전히 단일 `Aout_mutex`이므로, 샤딩 목적은 락 분할이 아니라 `mht` 버킷 체인 길이 단축이다. 인덱스 선택은 `AOUT_HASH_IDX(vpid, list) = vpid->pageid % list->num_hashes` (`:937`).

### 3.7 `PGBUF_SEQ_FLUSHER` (`:676-692`)

1초를 여러 인터벌로 쪼개 인터벌마다 균등한 페이지 수를 flush하고, 초 단위로 오차를 보상하는 flush rate 제어기(`:670-675` 주석).

| 필드 | 의미 |
|---|---|
| `flush_list` (`PGBUF_VICTIM_CANDIDATE_LIST *`) | flush 대상 `<BCB, VPID>` 배열 |
| `flush_upto_lsa` | flush 대상들의 oldest LSA 중 가장 최신 값 |
| `control_intervals_cnt` | 경과 인터벌 수 |
| `control_flushed` | 현재 1초 슈퍼인터벌에서 flush한 페이지 수 |
| `interval_msec` | 인터벌 길이 |
| `flush_max_size` | `flush_list` 용량 (init에서만 설정) |
| `flush_cnt` / `flush_idx` | 현재 원소 수 / 진행 인덱스 |
| `flushed_pages` | 결과 반환용 |
| `flush_rate` | 최대 flush 속도. 음수면 미적용 |
| `burst_mode` | true면 몰아서, false면 한 장씩 대기 |

풀에는 체크포인트 전용 인스턴스 하나(`seq_chkpt_flusher`, `:779`)만 있고, 이는 스레드 로컬로 쓰이는 구조가 아니라 체크포인트 스레드가 단독 사용한다.

### 3.8 `PGBUF_PAGE_QUOTA` (`:718-738`)

| 필드 | 의미 | 보호 |
|---|---|---|
| `num_private_LRU_list` | private LRU 개수. **0이면 quota 기능 전체 비활성** (`PGBUF_PAGE_QUOTA_IS_ENABLED`, `:1032`) | 초기화 후 불변 |
| `lru_victim_flush_priority_per_lru` | `float[PGBUF_TOTAL_LRU_COUNT]`, LRU별 flush 우선순위 | `pgbuf_adjust_quotas` 단독 |
| `private_lru_session_cnt` | `int[PGBUF_PRIVATE_LRU_COUNT]`, private LRU별 활성 세션 수 | 원자연산 (assign/release private lru) |
| `private_pages_ratio` | 전체 BCB 중 private 비율 | `is_adjusting` 게이트 |
| `add_shared_lru_idx` | shared 배치용 라운드로빈 인덱스 (`unsigned int`) | 비보호(근사) |
| `avoid_shared_lru_idx` | 회피할 shared LRU(보통 최대 크기). init `-1` | 비보호(근사) |
| `last_adjust_time` (`TSC_TICKS`) | 마지막 조정 시각 | `is_adjusting` 게이트 |
| `adjust_age` (`INT32`) | 조정 세대 번호. `bcb->hit_age`와 비교해 세대당 hit 1회만 집계 | 원자 증가 |
| `is_adjusting` (`int`) | 조정 중 플래그(단일 진입 보장) | CAS |

`private_lru_session_cnt` 배열만 `PGBUF_PRIVATE_LRU_COUNT` 길이이고 인덱싱은 `PGBUF_PRIVATE_LIST_FROM_LRU_INDEX(i) = i − PGBUF_SHARED_LRU_COUNT`로 변환한다(`:1054`, `:13966`). 나머지 배열은 전체 LRU 길이. 이 비대칭이 오프바이원의 단골이다.

### 3.9 `PGBUF_PAGE_MONITOR` (`:695-715`)

| 필드 | 의미 | 보호 |
|---|---|---|
| `dirties_cnt` (`INT64`) | dirty BCB 수 | `ATOMIC_INC_64` (`:15787`, `:15792`, `:15989`) |
| `lru_hits` (`int *`) | LRU별 LRU1 hit 수 | **비원자적 증가** (`:16563`) — 근사값 |
| `lru_activity` (`int *`) | LRU별 활동 수준 | `pgbuf_adjust_quotas` 단독 |
| `lru_shared_pgs_cnt` (`volatile int`) | 모든 shared LRU의 BCB 합 | `ATOMIC_INC_32` (`:15871`, `:15901`) |
| `lru_victim_req_cnt` (`int`) | 전체 victim 요청 수 | `ATOMIC_INC_32` (`:9037`), `ATOMIC_TAS_32`로 소비 (`:3889`) |
| `bcb_locks` (`PGBUF_MONITOR_BCB_MUTEX *`) | 스레드별 BCB mutex 추적 | 스레드 로컬 슬롯 |
| `victim_rich` (`bool`) | victim이 풍부한지. `pgbuf_adjust_quotas`가 갱신 | 비보호 |

`dirties_cnt`에는 강한 불변식이 걸려 있다: `0 <= dirties_cnt <= num_buffers`를 갱신 지점마다 assert(`:15795`, `:15990`).

page-fix 요청 수와 page-unfix 수는 **이 구조체에 없다.** `THREAD_ENTRY::pgbuf_fix_req_cnt` / `pgbuf_pg_unfix_cnt`로 스레드별 샤딩되어 있고(`src/thread/thread_entry.hpp:219,223`), 필요 시 `pgbuf_monitor_sum_fix_req()` / `pgbuf_monitor_sum_pg_unfix()`가 전체 엔트리를 훑어 합산한다(`:2113-2196`). 이유는 `:705-707` 주석대로 fix마다 증가하는 카운터를 항상 캐시-핫한 라인에 두기 위함이다.

### 3.10 `PGBUF_MONITOR_BCB_MUTEX` (`:940-946`) 와 BCB 락 매크로 (`:952-967`)

```c
struct pgbuf_monitor_bcb_mutex { PGBUF_BCB *bcb; PGBUF_BCB *bcb_second; int line; int line_second; };
```

스레드당 최대 **2개**의 BCB mutex 슬롯. 강제되는 불변식(`:16611-16768`):

- `PGBUF_BCB_LOCK`(무조건 대기)은 이미 하나라도 잡고 있으면 `PGBUF_ABORT_RELEASE()` — **무조건 락은 언제나 첫 번째 BCB mutex여야 한다**(`:16619-16628`).
- 두 번째 BCB mutex는 **`PGBUF_BCB_TRYLOCK`으로만** 얻을 수 있다(`:16667-16671`). 이것이 BCB mutex 간 데드락 방지 규약이다.
- 같은 BCB 재진입 락 금지(`:16629-16633`, `:16662-16666`).
- `PGBUF_BCB_CHECK_MUTEX_LEAKS()`는 두 슬롯이 모두 NULL임을 검사하며(`:16776-16792`), 함수 exit 지점에 배치된다.

`pgbuf_Monitor_locks`는 **디버그 빌드에서 무조건 true**, 릴리스에서는 `PRM_ID_PB_MONITOR_LOCKS`(기본 false)(`:1676-1682`). 즉 이 검증은 디버그 빌드에서 상시 작동한다.

### 3.11 `PGBUF_HOLDER` / `PGBUF_HOLDER_ANCHOR` / `PGBUF_HOLDER_SET`

`PGBUF_HOLDER` (`:463-478`) — 스레드가 특정 BCB를 몇 번 fix했는지 추적하는 스레드 로컬 엔트리.

| 필드 | 의미 |
|---|---|
| `fix_count` | 이 홀더의 fix 횟수 |
| `bufptr` | 대상 BCB |
| `thrd_link` | 스레드의 **hold 리스트** next |
| `next_holder` | 스레드의 **free 리스트** next |
| `perf_stat` (`PGBUF_HOLDER_STAT`) | 4개 1비트 필드: `dirty_before_hold`, `dirtied_by_holder`, `hold_has_write_latch`, `hold_has_read_latch` (`:443-449`) |
| `fixed_at[64*1024]`, `fixed_at_size` | **`!NDEBUG` 전용** fix 위치 문자열 누적 |
| `watch_count`, `first_watcher`, `last_watcher` | ordered fix용 watcher 리스트 |

크기 함정: NDEBUG 56B, **DEBUG 65,600B**. `thrd_reserved_holder` 할당량은 `thrd_num_total * 7 * PGBUF_HOLDER_SIZEOF`(`:5897`)이므로 디버그 빌드에서 스레드 100개면 **약 44 MB**, `max_clients`가 큰 설정이면 GB 단위로 뛴다. 디버그 서버의 RSS를 설명해야 할 때 첫 번째로 볼 곳이다.

`PGBUF_HOLDER_ANCHOR` (`:481-492`) — 스레드당 free/hold 리스트 헤드.

```c
struct pgbuf_holder_anchor {
  int num_free_cnt;  int num_hold_cnt;
  PGBUF_HOLDER *thrd_free_list;  PGBUF_HOLDER *thrd_hold_list;
  char m_pad[64 - 2*sizeof(int) - 2*sizeof(PGBUF_HOLDER *)];   /* = 40 bytes */
};
static_assert (sizeof (PGBUF_HOLDER_ANCHOR) == 64, "...fix m_pad");
```

패딩 의도는 주석에 명시돼 있다(`:487-489`): `num_hold_cnt`/`thrd_hold_list`가 매 fix/unfix마다 기록되므로 패딩이 없으면 인접 스레드 엔트리와 false sharing이 발생한다. `alignof`는 8로 유지되어 일반 `malloc`으로도 유효하다는 점까지 적혀 있다.

다만 **정렬은 완전히 보장되지 않는다.** 배열은 `malloc (thrd_num_total * 64)`로 할당되므로(`:5888`) 베이스가 16바이트 정렬일 수 있다. 베이스가 64로 나눠떨어지지 않으면 각 앵커가 두 캐시라인에 걸치고, 인접 두 앵커가 한 라인을 공유한다 — false sharing이 줄기는 하지만 제거되지는 않는다. 완전 제거를 원하면 `show_status`처럼 `cub_aligned_alloc (64, …)`(`:1848-1850`)을 써야 한다. 스레드 수가 커서 할당이 mmap 임계(보통 128KB, 즉 2048 스레드)를 넘으면 페이지 정렬을 받아 우연히 완전해진다.

`PGBUF_HOLDER_SET` (`:495-499`) — free 홀더가 고갈됐을 때 확장하는 단위. `PGBUF_HOLDER element[10]` + `next_set`. 특징적인 정책이 `:794-802` 주석에 있다: 스레드는 공용 리스트에서 홀더를 **하나씩 가져가지만 절대 반납하지 않는다**. 즉 홀더 메모리는 단조 증가한다.

`pgbuf_allocate_thrd_holder_entry()` (`:5958-…`)는 먼저 스레드 free 리스트를 보고(`:5981-5987`), 비었으면 `free_holder_set_mutex`를 잡고 공용 풀에서 하나 떼거나 새 `PGBUF_HOLDER_SET`을 malloc한다(`:5993-6020`).

### 3.12 `PGBUF_HOLDER_INFO` (`:428-438`) 와 `PGBUF_BATCH_FLUSH_HELPER` (`:453-460`)

`PGBUF_HOLDER_INFO`는 ordered fix가 보유 페이지를 정렬하기 위해 만드는 스냅샷: `vpid`, `group_id`(heap header VPID), `rank`, `watch_count`, `watcher[64]`, 집계된 `latch_mode`, `ptype`(HEAP/OVERFLOW만), `prevent_dealloc`.

`PGBUF_BATCH_FLUSH_HELPER`는 이웃 페이지 배치 flush용 스크래치: `pages_bufptr[2*32-1]`, `vpids[2*32-1]`, `npages`, `fwd_offset`, `back_offset`. **파일 전역 단일 인스턴스** `pgbuf_Flush_helper`(`:848`)로 존재하므로 flush 스레드 하나만 사용한다는 암묵적 전제가 있다. 인덱싱은 중앙 기준 `PGBUF_NEIGHBOR_POS(idx) = PGBUF_NEIGHBOR_PAGES - 1 + idx`(`:316`).

### 3.13 `PGBUF_STATUS` / `PGBUF_STATUS_SNAPSHOT` / `PGBUF_STATUS_OLD`

```c
struct alignas (64) pgbuf_status {          /* :395-404, sizeof = 64 */
  unsigned long long num_hit, num_page_request, num_pages_created, num_pages_written, num_pages_read;  /* 40B */
  unsigned int num_flusher_waiting_threads;  unsigned int dummy;                                       /* 8B  */
};                                                                     /* + 16B 패딩 → 정확히 1 캐시라인 */
```

`alignas(64)` + `dummy`로 한 라인을 채우고, `pgbuf_Pool.show_status`를 `cub_aligned_alloc (64, (thread_num_total_threads()+1) * 64)`로 잡아(`:1848-1850`) **스레드당 전용 캐시라인**을 준다. 인덱싱은 `pgbuf_Pool.show_status[thread_get_entry_index (thread_p)]`(`:2234`, `:8142`, `:8358`, `:10690`) = `thread_p->index`(`src/thread/thread_manager.hpp:552-560`). `+1`은 인덱스 상한 여유분이다. 집계는 `pgbuf_start_scan`에서 `show_status_mutex` 아래 전체를 더한다(`:17386-17398`).

`PGBUF_STATUS_SNAPSHOT` (`:406-416`)는 순간 상태(`free_pages`, `victim_candidate_pages`, `clean/dirty_pages`, index/data/system/temp 페이지 수), `PGBUF_STATUS_OLD` (`:418-426`)는 델타 계산용 이전 누적값 + `print_out_time`. 둘 다 단일 인스턴스로 `show_status_mutex` 보호.

### 3.14 `PGBUF_DIRECT_VICTIM` 과 lock-free 큐 (`:744-754`, `:818-826`)

```c
struct pgbuf_direct_victim {                                  /* SERVER_MODE only */
  PGBUF_BCB **bcb_victims;                                    /* [thread index] → 배정된 victim */
  lockfree::circular_queue<THREAD_ENTRY *> *waiter_threads_high_priority;
  lockfree::circular_queue<THREAD_ENTRY *> *waiter_threads_low_priority;
};
```

목적(`:741-743` 주석): victim을 찾느라 CPU를 태우는 대신, 스레드를 잠들게 하고 다른 스레드가 **BCB를 직접 배정하고 깨우는** 방식. 배정 슬롯은 `bcb_victims[thread_p->index]` — 스레드 인덱스로 주소 지정되므로 슬롯 자체는 경쟁이 없고, `assert (bcb_victims[thread_p->index] == NULL)`로 이중 배정을 막는다(`:8205`).

`PGBUF_BCB_VICTIM_DIRECT_FLAG`와 `PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG`의 관계가 `:228-233` 주석에 있다: 직접 배정된 BCB를 활성 워커가 다시 fix할 수 있는 좁은 윈도우가 있고, 그때 플래그를 `INVALIDATE_DIRECT_VICTIM`으로 **교체**한다. 기다리던 스레드는 이를 보고 "다시 fix됐구나" 판단해 다른 BCB를 요청한다.

풀에 있는 lock-free 큐들(`:818-826`):

| 필드 | 원소 | 용량 | 라인 |
|---|---|---|---|
| `direct_victims.waiter_threads_high_priority` | `THREAD_ENTRY *` | `thread_num_total_threads()` | `:1788-1789` |
| `direct_victims.waiter_threads_low_priority` | `THREAD_ENTRY *` | `2 * thread_num_total_threads()` | `:1798-1799` |
| `flushed_bcbs` | `PGBUF_BCB *` | 8192 | `:1808` |
| `private_lrus_with_victims` | `int` (LRU 인덱스) | `2 * PGBUF_PRIVATE_LRU_COUNT` | `:1820` |
| `big_private_lrus_with_victims` | `int` | `2 * PGBUF_PRIVATE_LRU_COUNT` | `:1829` |
| `shared_lrus_with_victims` | `int` | `2 * PGBUF_SHARED_LRU_COUNT` | `:1839` |

private 큐 2개는 `PGBUF_PAGE_QUOTA_IS_ENABLED`일 때만 생성된다(`:1817-1836`) — 그래서 `pgbuf_lfcq_get_victim_from_private_lru()`가 `private_lrus_with_victims == NULL`을 먼저 확인한다(`:16390-16394`). `shared_lrus_with_victims`는 무조건 생성.

큐 용량을 `2 ×`로 잡은 것과 `produce()` 실패를 정상 경로로 처리하는 것(`:16506-16516`의 "소비자가 오래 선점되면 큐가 가득 찬 것처럼 보일 수 있다")이 짝을 이룬다. 실패 시 리스트는 나중에 `pgbuf_adjust_quotas`가 다시 넣어준다.

`PGBUF_LRU_VICTIM_LFCQ_FLAG`는 "이 리스트가 큐에 들어 있음"을 나타내며 중복 삽입을 막는다. set은 CAS(`:16345`), clear는 비원자적(`:16365`, `:16457`)인데 주석이 그 조건을 명시한다: 플래그가 하나뿐이고 set→clear를 하는 주체가 유일하기 때문. **플래그를 추가하면 이 코드를 반드시 원자연산으로 바꿔야 한다.**

### 3.15 `PGBUF_BUFFER_POOL` (`:757-834`) — 전역 `pgbuf_Pool` (`:847`)

| 그룹 | 필드 | 비고 |
|---|---|---|
| 규모 | `num_buffers` | `PRM_ID_PB_NBUFFERS`, 하한 `PGBUF_MINIMUM_BUFFERS` |
| 핵심 테이블 | `BCB_table`, `iopage_table`, `buf_hash_table`, `buf_lock_table` | 모두 단일 `malloc` 배열 |
| LRU | `num_LRU_list`(shared 개수), `ratio_lru1`, `ratio_lru2`, `buf_LRU_list` | `buf_LRU_list`는 shared 먼저, private 나중 |
| 보조 리스트 | `buf_AOUT_list`, `buf_invalid_list` | 임베드(포인터 아님) |
| flush | `victim_cand_list`(`num_buffers` 원소), `seq_chkpt_flusher` | |
| 통계 | `monitor`, `quota` | 임베드 |
| 홀더 | `thrd_holder_info`, `thrd_reserved_holder`, `free_holder_set_mutex`, `free_holder_set`, `free_index` | |
| 플래그 | `check_for_interrupts` | 로그 매니저가 `TR_TABLE_CS` 아래 set/clear (`:809-810`) |
| | `is_flushing_victims`, `is_checkpoint` | SERVER_MODE only |
| lock-free | `direct_victims`, `flushed_bcbs`, `*_lrus_with_victims` | §3.14 |
| show | `show_status`, `show_status_old`, `show_status_snapshot`, `show_status_mutex` | |

`buf_LRU_list` 주석(`:771-774`)은 "shared → garbage → private" 3구획을 말하지만, **garbage LRU는 현재 코드에 존재하지 않는다.** `PGBUF_TOTAL_LRU_COUNT = PGBUF_SHARED_LRU_COUNT + PGBUF_PRIVATE_LRU_COUNT`(`:1052`)뿐이므로 주석이 낡았다.

### 3.16 `pgbuf_copy_buffer` — CBRD-27041 캐시된 heap scan용 (`:862-934`)

```c
struct pgbuf_copy_buffer {
  PGBUF_BCB dummy_bcb;              /* 실제 BCB 구조체, vpid 필드만 의미 있음 */
  PGBUF_IOPAGE_BUFFER iopage_buf;   /* 가변 페이로드; 실제 크기는 alloc이 결정 */
};
#define PGBUF_COPY_BUFFER_ALLOC_SIZE \
  ((size_t)(offsetof (struct pgbuf_copy_buffer, iopage_buf) + PGBUF_IOPAGE_BUFFER_SIZE))
```

설계 의도(`:862-867`): 실제 BCB 슬롯이 아닌 독립 `<dummy BCB, iopage>` 쌍을 만들어, `pgbuf_copy_buffer_get_page_ptr()`가 돌려주는 `PAGE_PTR`이 **진짜 fix된 페이지와 동일한 `CAST_PGPTR_TO_BFPTR` / `CAST_PGPTR_TO_IOPGPTR` 불변식을 만족**하게 한다. 상류 코드가 페이지 포인터를 구분 없이 다룰 수 있다.

주의 포인트:
- `sizeof (struct pgbuf_copy_buffer)`로 할당하면 **과소 할당**된다(`FILEIO_PAGE::page`가 `char[1]`). 주석이 `CRITICAL:`로 경고(`:874-875`).
- `PGBUF_BCB`가 `std::atomic` 멤버를 가지므로 `memset`이 `-Wclass-memaccess`를 유발한다. 대신 `placement_new (&buf->dummy_bcb)`로 value-initialize(`:888-890`, `src/base/memory_wrapper.hpp:29`).
- 양방향 링크를 손으로 세운다: `iopage_buf.bcb = &dummy_bcb; dummy_bcb.iopage_buffer = &iopage_buf;` (`:891-892`).
- `pgbuf_copy_buffer_free()`는 `handle->dummy_bcb.~pgbuf_bcb()`를 명시 호출한다 — 현재는 no-op이지만 대칭성 유지(`:909-911`).
- `pgbuf_copy_page_for_scan()`은 `IO_PAGESIZE` 전체를 복사하므로 `prv`/`prv2`까지 포함되고, `dummy_bcb.vpid`를 원본 BCB에서 가져온다(`:917-928`).

---

## 4. 메모리 레이아웃

### 4.1 실측 크기 (x86-64, glibc, SERVER_MODE, IO_PAGESIZE=16384)

구조체를 그대로 재현해 컴파일·측정한 결과:

```
sizeof pthread_mutex_t = 40      sizeof LOG_LSA = 8      sizeof VPID = 8
sizeof PGBUF_BCB            = 144
sizeof PGBUF_BUFFER_HASH    =  56
sizeof PGBUF_BUFFER_LOCK    =  24
sizeof PGBUF_LRU_LIST       = 128
sizeof PGBUF_AOUT_BUF       =  32
sizeof PGBUF_HOLDER_ANCHOR  =  64   (static_assert)
sizeof PGBUF_HOLDER         =  56 (NDEBUG) / 65600 (DEBUG)
sizeof PGBUF_STATUS         =  64   (alignas(64))
sizeof FILEIO_PAGE_RESERVED =  32   sizeof FILEIO_PAGE_WATERMARK = 8
offsetof (FILEIO_PAGE, page)                  = 32
offsetof (PGBUF_IOPAGE_BUFFER, iopage)        =  8
offsetof (PGBUF_IOPAGE_BUFFER, iopage.page)   = 40
DB_PAGESIZE = 16384 - 40 = 16344     PGBUF_IOPAGE_BUFFER_SIZE = 16392
```

### 4.2 BCB 배열 ↔ IO 페이지 배열의 병렬 매핑

두 배열은 **별개의 malloc**이며, 인덱스 `i`끼리 상호 포인터로 묶인다(`pgbuf_initialize_bcb_table`, `:5595-5611`).

```
 pgbuf_Pool.BCB_table                          pgbuf_Pool.iopage_table
 (malloc, num_buffers × 144)                   (malloc, num_buffers × 16392)
 ┌──────────────────────────┐                  ┌───────────────────────────────────────────┐
 │ BCB[0]              144B │                  │ IOP[0]                            16392B  │
 │  ├ mutex          @  0   │                  │  ├ bcb ───────────────────────┐    @ 0    │
 │  ├ owner_mutex    @ 40   │                  │  └ iopage (FILEIO_PAGE)       │    @ 8    │
 │  ├ vpid           @ 44   │                  │     ├ prv (32B)               │    @ 8    │
 │  ├ atomic_latch   @ 56   │                  │     ├ page[DB_PAGESIZE] ◄─── PAGE_PTR  @ 40
 │  ├ flags          @ 64   │                  │     └ prv2 (8B, 페이지 끝)     │           │
 │  ├ ... 링크/틱/카운터 ...  │                  ├───────────────────────────────┼───────────┤
 │  └ iopage_buffer  @136 ──┼──────────────────► IOP[1]                        │           │
 ├──────────────────────────┤                  │  ├ bcb ──────────────────┐    │           │
 │ BCB[1]                   │◄─────────────────┼──┘                       │    │           │
 │  └ iopage_buffer ────────┼──────────────────► ...                       │    │           │
 ├──────────────────────────┤                  │                          │    │           │
 │ ...                      │◄─────────────────┴──────────────────────────┘     │           │
 └──────────────────────────┘                  └───────────────────────────────────────────┘
        stride 144                                            stride 16392

 정렬: iopage_table 베이스는 malloc(16B 정렬 이상). stride 16392 = 8×2049 이므로
       모든 IOP[i]와 그 안의 iopage(+8)는 8바이트 정렬을 유지한다.
       (32비트 빌드에서는 PGBUF_IOPAGE_BUFFER에 int dummy를 넣어 이를 보장 — :551-555)

 PAGE_PTR ↔ BCB 왕복:
   pgptr → (char *)pgptr - 40 → PGBUF_IOPAGE_BUFFER* → ->bcb → BCB*      (CAST_PGPTR_TO_BFPTR)
   BCB*  → ->iopage_buffer → (char *)+40 → pgptr                          (CAST_BFPTR_TO_PGPTR)
   BCB*  → bcb - BCB_table → 풀 인덱스                                    (pgbuf_bcb_get_pool_index)
```

BCB 배열과 IO 페이지 배열을 분리한 이유는 크기 비대칭 때문이다. BCB는 144B로 캐시 친화적이라 hot metadata 스캔(victim 탐색, zone 카운팅)이 IO 페이지 본문(16KB)을 캐시에서 밀어내지 않는다. 만약 `<BCB, page>`를 한 구조체로 묶었다면 BCB 하나 읽을 때마다 16KB 스트라이드를 건너뛰어야 한다.

### 4.3 전역 할당 지도

```
pgbuf_Pool  (static, 프로세스당 1개, :847)
│
├─ BCB_table            malloc  num_buffers × 144                    :5527   (32768 → 4.5 MiB)
├─ iopage_table         malloc  num_buffers × 16392                  :5545   (32768 → 512 MiB)
├─ buf_hash_table       malloc  2^20 × 56  = 56 MiB (풀 크기와 무관!) :5634
├─ buf_lock_table       malloc  nthreads × 24                        :5670
├─ buf_LRU_list         malloc  (shared + private) × 128             :5717
├─ thrd_holder_info     malloc  nthreads × 64                        :5888
├─ thrd_reserved_holder malloc  nthreads × 7 × 56 (DEBUG: × 65600)   :5898
├─ free_holder_set      malloc  요구 시 PGBUF_HOLDER_SET 체인 (반납 없음) :5998
├─ victim_cand_list     malloc  num_buffers × 16                     :1750
├─ seq_chkpt_flusher
│   └ flush_list        malloc  min(0.25×num_buffers, 65536) × 16     :14588
├─ buf_AOUT_list
│   ├ bufarray          malloc  max_count × 32                       :5787
│   └ aout_buf_ht       malloc  num_hashes × 8  + mht_create × n      :5814, :5825
├─ quota
│   ├ lru_victim_flush_priority_per_lru  malloc total_lru × 4         :13939
│   └ private_lru_session_cnt            malloc private_lru × 4       :13949
├─ monitor
│   ├ lru_hits          malloc  total_lru × 4                        :14009
│   ├ lru_activity      malloc  total_lru × 4                        :14018
│   └ bcb_locks         calloc  nthreads × 32 (Monitor_locks 시에만)   :14040
├─ direct_victims
│   ├ bcb_victims       malloc  nthreads × 8                         :1778
│   ├ waiter_threads_high_priority   new lfcq(nthreads)              :1788
│   └ waiter_threads_low_priority    new lfcq(2 × nthreads)          :1798
├─ flushed_bcbs         new lfcq(8192)                               :1808
├─ private_lrus_with_victims       new lfcq(2 × private)  [quota 시]  :1820
├─ big_private_lrus_with_victims   new lfcq(2 × private)  [quota 시]  :1829
├─ shared_lrus_with_victims        new lfcq(2 × shared)               :1839
└─ show_status          cub_aligned_alloc(64, (nthreads+1) × 64)      :1848
```

`buf_hash_table`이 `HASH_SIZE_BITS = 20` 고정이라 **버퍼 풀 크기와 무관하게 항상 56 MiB**를 쓴다. 작은 풀(예: 최소값)에서는 해시 테이블이 데이터 버퍼보다 클 수 있고, 큰 풀(수백만 페이지)에서는 반대로 버킷당 체인이 길어진다. 튜닝 가능한 파라미터가 아니다.

### 4.4 LRU 배열 구획

```
 buf_LRU_list[0 .. PGBUF_TOTAL_LRU_COUNT-1]

 ┌─────────────── shared ───────────────┬──────────────── private ─────────────────┐
 │ 0 .. num_LRU_list-1                  │ num_LRU_list .. +num_private_LRU_list-1  │
 │ quota 미사용, threshold는 ratio 기반    │ quota 기반, threshold = quota × 0.05      │
 └──────────────────────────────────────┴──────────────────────────────────────────┘
        PGBUF_IS_SHARED_LRU_INDEX(i)  = i <  num_LRU_list        :1057
        PGBUF_IS_PRIVATE_LRU_INDEX(i) = i >= num_LRU_list        :1058
        PGBUF_LRU_INDEX_FROM_PRIVATE(p)      = num_LRU_list + p  :1055
        PGBUF_PRIVATE_LIST_FROM_LRU_INDEX(i) = i - num_LRU_list  :1054
```

**shared LRU 개수 산정** (`pgbuf_initialize_lru_list`, `:5700-5714`):

```
num_LRU_list = PRM_ID_PB_NUM_LRU_CHAINS          /* num_LRU_chains, 기본 0 = auto */
if (num_LRU_list == 0) {
    num_LRU_list = MAX_NTRANS;                                        /* = max_conn + 1 */
    if (num_buffers / num_LRU_list < 1000)                            /* PGBUF_MIN_PAGES_IN_SHARED_LIST */
        num_LRU_list = num_buffers / 1000;                            /* 리스트당 최소 1000 페이지 확보 */
    num_LRU_list = MAX (num_LRU_list, 4);                             /* 최소 4개 */
}
```

즉 자동 모드는 "트랜잭션 수만큼 잡되, 리스트당 1000 페이지는 확보하고, 절대 4개 미만은 안 됨"이다. 기본 풀 32768 페이지면 `32768/1000 = 32`개.

**private LRU 개수 산정** (`pgbuf_initialize_page_quota_parameters`, `:13898-13921`):

```
SERVER_MODE:
  num_private_LRU_list = PRM_ID_PB_NUM_PRIVATE_CHAINS               /* num_private_chains, 기본 -1 */
  -1 → MAX_NTRANS + VACUUM_MAX_WORKER_COUNT   (VACUUM_MAX_WORKER_COUNT = 50)
   0 → 비활성 (PGBUF_PAGE_QUOTA_IS_ENABLED == false)
  >0 → MAX (값, PGBUF_PRIVATE_LRU_MIN_COUNT=4)
SA_MODE: 0 (항상 비활성)
```

`PGBUF_LRU_LIST_MAX_COUNT`(65536) 초과 여부를 **런타임에 검사하지 않는다.** 파라미터 상한(`num_LRU_chains` ≤ 1000, `num_private_chains` ≤ `CSS_MAX_CLIENT_COUNT`(4000) + 50)으로 총합 ≤ 5050이 되어 우연히 안전하다. 이 상한 중 하나라도 올리면 LRU 인덱스가 zone 비트를 침범한다 — **암묵적 불변식**이므로 주의.

---

## 5. 초기화

### 5.1 `pgbuf_initialize()` 전체 순서 (`:1602-1871`)

```
pgbuf_initialize ()
 0. pgbuf_flags_mask_sanity_check ()                        :1604   /* flags/zone/lru_index 비중첩 강제 */
 1. pgbuf_Pool 전 필드 개별 초기화                            :1607-1664
      - 포인터/카운터 = NULL/0
      - memset: buf_AOUT_list, buf_invalid_list, seq_chkpt_flusher, quota,
                show_status_old, show_status_snapshot        :1618-1623
      - memset direct_victims  ← 크기 인자 오류 (§8.1)        :1626
      - monitor는 "C++ 멤버 때문에" 필드별 대입               :1629-1638
      - free_holder_set_mutex / show_status_mutex = PTHREAD_MUTEX_INITIALIZER :1644, :1663
 2. num_buffers = prm(PB_NBUFFERS);  if (< MAX_NTRANS*10) 상향  :1666-1674
 3. pgbuf_latch_timeout_msecs = prm(PAGE_LATCH_TIMEOUT_IN_MSECS) :1675
 4. pgbuf_Monitor_locks = NDEBUG ? prm(PB_MONITOR_LOCKS) : true  :1676-1682
 5. ratio_lru1/2 결정 + 클램프                                :1685-1693
      ratio_lru1 = clamp (prm(LRU_HOT_RATIO),    0.05, 0.90)
      ratio_lru2 = clamp (prm(LRU_BUFFER_RATIO), 0.05, 1.0 - 0.05 - ratio_lru1)
      assert 0.099 <= ratio_lru1 + ratio_lru2 <= 0.951
 6. pgbuf_initialize_page_quota_parameters ()               :1696   ← "반드시 첫 번째"
 7. pgbuf_initialize_bcb_table ()                           :1701
 8. pgbuf_initialize_hash_table ()                          :1706
 9. pgbuf_initialize_lock_table ()                          :1711
10. pgbuf_initialize_lru_list ()                            :1716
11. pgbuf_initialize_invalid_list ()                        :1721
12. pgbuf_initialize_aout_list ()                           :1726
13. pgbuf_initialize_thrd_holder ()                         :1731
14. pgbuf_initialize_page_quota ()                          :1737   ← "quota 먼저"
15. pgbuf_initialize_page_monitor ()                        :1742
16. victim_cand_list = malloc (num_buffers × 16)            :1749
17. seq_chkpt_flusher: cnt = MIN (0.25 × num_buffers, 65536) :1763-1772
18. [SERVER_MODE] direct_victims.bcb_victims malloc+memset,
    waiter_threads_high(nthreads) / low(2×nthreads), flushed_bcbs(8192)  :1778-1815
19. [quota 활성 시] private_lrus_with_victims,
    big_private_lrus_with_victims (각 2×private)            :1817-1836
20. shared_lrus_with_victims (2×shared)                     :1839
21. show_status = cub_aligned_alloc (64, (nthreads+1)×64) + memset  :1848-1857
22. show_status_old.print_out_time = time (NULL)            :1859
23. pthread_mutex_init (&show_status_mutex)                 :1862

error: pgbuf_finalize (); return ER_FAILED;                 :1867-1870
```

**순서 의존성 (재구현 시 반드시 지켜야 함):**

| 의존 | 이유 |
|---|---|
| 6 → 10 | `PGBUF_TOTAL_LRU_COUNT`가 `quota.num_private_LRU_list`를 읽으므로 LRU 배열 할당 전에 private 개수가 확정돼야 한다 (`:1695` 주석) |
| 7 → 11 | invalid 리스트는 BCB 배열이 만들어 놓은 `next_BCB` 체인을 그대로 쓴다 (`:5866-5867`) |
| 10 → 14, 15 | quota/monitor의 per-LRU 배열 길이가 `PGBUF_TOTAL_LRU_COUNT`이며, 여기에 `num_LRU_list`가 필요 |
| 10 → 19, 20 | LFCQ 용량이 shared/private 개수에 비례 |
| 2 → 7, 16, 17 | `num_buffers` 확정 후 |
| 5 → 이후 전부 | ratio는 `pgbuf_adjust_quotas`가 threshold 계산에 사용 |

**주의:** 6번(`pgbuf_initialize_page_quota_parameters`)이 내부에서 `memset (quota, 0, sizeof (PGBUF_PAGE_QUOTA))`를 다시 수행한다(`:13892`). 1번 단계의 quota memset(`:1621`)과 중복이며, 이 때문에 6번 이전에 quota 필드를 설정하면 지워진다.

### 5.2 각 단계 의사코드

#### `pgbuf_initialize_bcb_table ()` — `:5510-5621`

```
impl = { latch_mode = PGBUF_LATCH_INVALID, waiter_exists = false, fcnt = 0 }   :5517-5519

alloc_size = num_buffers × 144
if (!MEM_SIZE_IS_VALID (alloc_size)) → ER_PRM_BAD_VALUE ("data_buffer_pages")  :5522
BCB_table = malloc (alloc_size)                       → OOM 시 ER_OUT_OF_VIRTUAL_MEMORY

alloc_size = num_buffers × 16392
if (!MEM_SIZE_IS_VALID) → free_and_init (BCB_table); ER_PRM_BAD_VALUE          :5536-5544
iopage_table = malloc (alloc_size)  → OOM 시 free_and_init (BCB_table)         :5545-5554

for i in [0, num_buffers):
    bufptr = PGBUF_FIND_BCB_PTR (i)
    pthread_mutex_init (&bufptr->mutex);  bufptr->owner_mutex = -1
    VPID_SET_NULL (&bufptr->vpid)
    placement_new (&bufptr->atomic_latch, 0);  atomic_latch.store (impl.raw)   :5565-5566
    next_wait_thrd = latch_last_thread = hash_next = prev_BCB = NULL
    next_BCB = (i == num_buffers-1) ? NULL : PGBUF_FIND_BCB_PTR (i+1)          :5578-5585  ← invalid 체인
    flags = PGBUF_BCB_INIT_FLAGS         /* = PGBUF_INVALID_ZONE, lru_idx 0, 플래그 없음 */
    count_fix_and_avoid_dealloc = 0;  hit_age = 0;  LSA_SET_NULL (&oldest_unflush_lsa)
    tick_lru3 = tick_lru_list = 0

    ioptr = PGBUF_FIND_IOPAGE_PTR (i)
    fileio_init_lsa_of_page (&ioptr->iopage, IO_PAGESIZE)      /* prv.lsa + prv2.lsa 동시 초기화 */
    ioptr->iopage.prv.pageid = -1;  prv.volid = -1
    prv.ptype = PAGE_UNKNOWN;  prv.pflag = '\0'
    prv.p_reserve_1 = prv.p_reserve_2 = 0;  prv.tde_nonce = 0
    bufptr->iopage_buffer = ioptr;  ioptr->bcb = bufptr        /* 양방향 결선 */
  [CUBRID_DEBUG] pgbuf_scramble (&iopage);  memcpy (PGBUF_FIND_BUFFER_GUARD (bufptr), pgbuf_Guard, 8)
```

`placement_new (&bufptr->atomic_latch, 0)` (`:5565`)가 필수다. `malloc` 메모리에는 `std::atomic` 객체의 생명주기가 시작되지 않았으므로, 생성 없이 `store()`를 부르는 것은 형식상 UB다.

`MEM_SIZE_IS_VALID` (`src/base/porting.h:87`)는 `size_t`가 64비트면 항상 참이므로, 실질적으로 32비트 빌드에서만 의미가 있다.

#### `pgbuf_initialize_hash_table ()` — `:5628-5650`

```
hashsize = 1 << 20
buf_hash_table = malloc (hashsize × 56)        → OOM 시 ER_OUT_OF_VIRTUAL_MEMORY
for i in [0, hashsize):
    pthread_mutex_init (&buf_hash_table[i].hash_mutex)
    hash_next = NULL;  lock_next = NULL
```

104만 개의 pthread mutex를 초기화한다. 부팅 비용과 56 MiB 상주 메모리를 감수하는 대가로 **버킷당 락**을 얻어 해시 경합을 최소화한 설계다.

#### `pgbuf_initialize_lock_table ()` — `:5657-5688`

```
thrd_num_total = thread_num_total_threads ()          /* SA_MODE에서는 assert (== 1) */
buf_lock_table = malloc (thrd_num_total × 24)
for i: VPID_SET_NULL (&vpid);  lock_next = NULL;  next_wait_thrd = NULL
```

`thread_num_total_threads()` = `cubthread::get_max_thread_count()` = `1 + Manager->m_max_threads`이고, `m_max_threads` 자체도 connection + worker_pool + daemon + 1(PAD)이다(`src/thread/thread_manager.cpp:423-426`, `:556-559`). 즉 인덱스 여유가 이중으로 확보돼 있다.

#### `pgbuf_initialize_lru_list ()` — `:5695-5751`

```
num_LRU_list 결정 (§4.4)
buf_LRU_list = malloc (PGBUF_TOTAL_LRU_COUNT × 128)
for i in [0, PGBUF_TOTAL_LRU_COUNT):
    index = i                                          ← 자기 인덱스를 저장 (역참조 없이 lru_idx 획득)
    pthread_mutex_init (&mutex)
    top = bottom = bottom_1 = bottom_2 = victim_hint = NULL
    count_lru1 = count_lru2 = count_lru3 = count_vict_cand = 0
    tick_list = tick_lru3 = 0
    threshold_lru1 = threshold_lru2 = quota = 0         ← pgbuf_adjust_quotas가 채운다
    flags = 0
```

threshold와 quota가 0으로 시작하므로, 최초 `pgbuf_adjust_quotas` 호출 전에는 모든 리스트가 "zone1/zone2 임계 초과" 상태로 보인다. zone 조정 로직이 이 초기 상태를 견뎌야 한다.

#### `pgbuf_initialize_aout_list ()` — `:5758-5855`

```
aout_ratio = prm (PB_AOUT_RATIO)                       /* 기본 0.0 → 기능 비활성 */
max_count = num_buffers × aout_ratio
Aout_top = Aout_bottom = bufarray = aout_buf_ht = NULL
pthread_mutex_init (&Aout_mutex)                       ← 조기 반환 경로보다 앞
if (aout_ratio <= 0) { max_count = 0; return NO_ERROR; }      /* 비활성 */

max_count = MIN (max_count, 32768)                     /* PGBUF_LIMIT_AOUT_BUFFERS = 512MB 상당 */
bufarray = malloc (max_count × 32)
Aout_free = &bufarray[0]
for i: vpid = NULL; lru_idx = PGBUF_AOUT_NOT_FOUND(-2)
       next = (i == max_count-1) ? NULL : &bufarray[i+1];  prev = NULL      ← free 리스트 체인

num_hashes = MAX (max_count / 1000, 1)
aout_buf_ht = malloc (num_hashes × 8);  memset 0
for i: aout_buf_ht[i] = mht_create ("PGBUF_AOUT_HASH", max_count, pgbuf_hash_vpid, pgbuf_compare_vpid)

error_return:  Aout_free = NULL; free bufarray;
               for (i = 0; aout_buf_ht[i] != NULL; i++) mht_destroy (...);  free aout_buf_ht;
               pthread_mutex_destroy (&Aout_mutex);   ← §8.2 이중 destroy 위험
               return ER_FAILED
```

Aout 해시가 쓰는 함수는 BCB 해시(`pgbuf_hash_func_mirror`)와 **다르다**: `pgbuf_hash_vpid(key, htsize) = (pageid | volid << 24) % htsize` (`:1563-1569`), 비교는 `pgbuf_compare_vpid` (`:1577-1591`).

#### `pgbuf_initialize_invalid_list ()` — `:5862-5870`

```
pthread_mutex_init (&invalid_mutex)
invalid_top = PGBUF_FIND_BCB_PTR (0)        /* BCB 테이블이 이미 next_BCB로 전부 연결해 둠 */
invalid_cnt = num_buffers
```

전체 BCB가 처음부터 invalid 리스트에 들어 있다. 첫 페이지 fix는 victim 탐색 없이 여기서 즉시 BCB를 얻는다.

#### `pgbuf_initialize_thrd_holder ()` — `:5877-5948`

```
thrd_num_total = thread_num_total_threads ()
thrd_holder_info    = malloc (thrd_num_total × 64)                 /* phase 0 */
thrd_reserved_holder = malloc (thrd_num_total × 7 × PGBUF_HOLDER_SIZEOF)  /* phase 1 */

/* phase 2 */
for i in [0, thrd_num_total):
    thrd_holder_info[i].num_hold_cnt  = 0
    thrd_holder_info[i].num_free_cnt  = 7
    thrd_holder_info[i].thrd_hold_list = NULL
    thrd_holder_info[i].thrd_free_list = &thrd_reserved_holder[i × 7]
    for j in [0, 7):
        idx = i×7 + j
        fix_count = 0;  bufptr = NULL;  thrd_link = NULL
        INIT_HOLDER_STAT (&perf_stat)                  /* 4개 비트필드 0 */
        first_watcher = last_watcher = NULL;  watch_count = 0
        next_holder = (j == 6) ? NULL : &thrd_reserved_holder[idx+1]

/* phase 3 */
pthread_mutex_init (&free_holder_set_mutex)
free_holder_set = NULL
free_index = -1                                        /* -1 = 사용 가능한 free holder 없음 */
```

`m_pad`는 초기화하지 않는다(값이 무의미하므로 정상). `free_index = -1`의 sentinel 의미가 `:5945` 주석에 명시돼 있다.

스레드가 자기 앵커를 얻는 경로는 두 곳이다: `pgbuf_thread_variables_init()` (`:1513-1516`)과 `pgbuf_allocate_thrd_holder_entry()`의 지연 초기화(`:5975-5979`). 둘 다 `thread_p->m_holder_anchor = &pgbuf_Pool.thrd_holder_info[thread_p->index]`로 캐시한다. `pgbuf_finalize()`가 `thread_clear_all_holder_anchor()`를 호출하는 이유가 바로 이 캐시된 포인터를 무효화하기 위함이다(`:2066`).

`pgbuf_thread_variables_init()`은 private LRU 사용 가능 여부도 캐시한다(`:1505-1512`): `quota.num_private_LRU_list > 0 && thread_p->private_lru_index != -1` → `m_is_private_lru_enabled = true`.

#### `pgbuf_initialize_page_quota_parameters ()` — `:13887-13924`

```
memset (quota, 0, sizeof (PGBUF_PAGE_QUOTA))
tsc_getticks (&quota->last_adjust_time);  adjust_age = 0;  is_adjusting = 0
num_private_LRU_list 결정 (§4.4)
```

#### `pgbuf_initialize_page_quota ()` — `:13931-13984`

```
lru_victim_flush_priority_per_lru = malloc (PGBUF_TOTAL_LRU_COUNT × sizeof (float))
private_lru_session_cnt          = malloc (PGBUF_PRIVATE_LRU_COUNT × sizeof (int))
for i in [0, PGBUF_TOTAL_LRU_COUNT):
    lru_victim_flush_priority_per_lru[i] = 0
    if (PGBUF_IS_PRIVATE_LRU_INDEX (i))
        private_lru_session_cnt[PGBUF_PRIVATE_LIST_FROM_LRU_INDEX (i)] = 0
private_pages_ratio = PGBUF_PAGE_QUOTA_IS_ENABLED ? 1.0f : 0
add_shared_lru_idx = 0;  avoid_shared_lru_idx = -1
```

quota 비활성(`num_private_LRU_list == 0`)이면 `private_lru_session_cnt = malloc (0)`이 된다. glibc는 유효한 포인터를 돌려주고 루프가 한 번도 안 돌므로 동작하지만, 다른 allocator에서는 NULL을 받아 `error_status = ER_OUT_OF_VIRTUAL_MEMORY`로 초기화가 실패할 수 있다(`:13949-13957`). 이식성 관점의 잠재 함정이다. `private_pages_ratio` 초기값 `1.0f`는 첫 `pgbuf_adjust_quotas`가 실측 비율로 대체한다.

#### `pgbuf_initialize_page_monitor ()` — `:13991-14054`

```
dirties_cnt = 0;  lru_hits = lru_activity = NULL;  bcb_locks = NULL;  victim_rich = false
lru_hits     = malloc (PGBUF_TOTAL_LRU_COUNT × sizeof (int))
lru_activity = malloc (PGBUF_TOTAL_LRU_COUNT × sizeof (int))
for i: lru_hits[i] = lru_activity[i] = 0
lru_victim_req_cnt = 0;  lru_shared_pgs_cnt = 0
[SERVER_MODE] if (pgbuf_Monitor_locks)
    bcb_locks = calloc (thread_num_total_threads (), sizeof (PGBUF_MONITOR_BCB_MUTEX))
victim_rich = false                               /* "no bcb's, no victims" */
```

#### `pgbuf_initialize_seq_flusher ()` — `:14574-14603`

```
memset (seq_flusher, 0, sizeof (*seq_flusher))
flush_max_size = cnt
flush_list = f_list ? f_list : malloc (cnt × sizeof (PGBUF_VICTIM_CANDIDATE_LIST))
flush_cnt = flush_idx = 0
burst_mode = true
control_intervals_cnt = control_flushed = 0
```

`f_list != NULL`이면 외부 배열을 빌려 쓰므로 소유권이 없다 — `pgbuf_finalize`는 `seq_chkpt_flusher.flush_list`를 무조건 free하지만(`:1988-1991`), `pgbuf_initialize`는 항상 `NULL`을 넘겨 자체 할당하게 하므로(`:1768`) 정합성이 유지된다. 다른 곳에서 `f_list`를 넘겨 초기화한 `PGBUF_SEQ_FLUSHER`를 finalize에 넘기면 이중 free가 된다.

### 5.3 해시 함수 `pgbuf_hash_func_mirror ()` — `:1524-1555`

```
volid_lsb = vpid->volid
/* volid 하위 8비트를 뒤집어 상위로 배치 (VOLID_LSB_BITS = 8, HASH_SIZE_BITS = 20) */
reversed_volid_lsb: volid bit0 → hash bit19, bit1 → bit18, ..., bit7 → bit12
hash_val = (vpid->pageid ^ reversed_volid_lsb) & 0x000FFFFF
```

"mirror" 기법의 의도: 볼륨마다 pageid가 0부터 순차 증가하므로, volid를 그냥 더하거나 XOR하면 서로 다른 볼륨의 인접 페이지가 같은 버킷에 몰린다. volid의 하위 비트를 **역순으로 상위 비트에 배치**하면 pageid의 하위 20비트 분포를 보존하면서 볼륨별로 해시 공간을 분리한다.

부작용: pageid ≥ 2^20(약 100만) 페이지인 볼륨은 하위 20비트만 쓰이므로 2^20 주기로 순환하고, 이때 상위 8비트 구간에서 volid 비트와 충돌할 수 있다. 16K 페이지 기준 16GB 볼륨을 넘어서면 발생한다.

---

## 6. 종료 — `pgbuf_finalize ()` (`:1881-2067`)

```
[CUBRID_DEBUG] pgbuf_dump_if_any_fixed ()                              :1888-1890
 1. buf_hash_table   : 2^20개 hash_mutex destroy → free_and_init       :1893-1901
 2. buf_lock_table   : free_and_init                                   :1904-1907
 3. BCB_table        : num_buffers개 bcb->mutex destroy → free_and_init; num_buffers = 0  :1910-1919
 4. iopage_table     : free_and_init                                   :1921-1924
 5. buf_LRU_list     : PGBUF_TOTAL_LRU_COUNT개 mutex destroy → free_and_init  :1927-1934
 6. buf_invalid_list.invalid_mutex destroy  (무조건)                    :1937
 7. thrd_holder_info, thrd_reserved_holder : free_and_init             :1940-1948
 8. free_holder_set_mutex destroy;  free_holder_set 체인 전부 free      :1951-1957
 9. victim_cand_list : free_and_init                                   :1959-1962
10. buf_AOUT_list    : bufarray free; num_hashes개 mht_destroy + ht free;
                       Aout_mutex destroy;  포인터/카운터 리셋           :1964-1986
11. seq_chkpt_flusher.flush_list : free_and_init                       :1988-1991
12. quota.lru_victim_flush_priority_per_lru, private_lru_session_cnt   :1994-2001
13. monitor.lru_hits, lru_activity                                     :2004-2011
14. [SERVER_MODE] monitor.bcb_locks; direct_victims.bcb_victims;
                  waiter_threads_high/low delete; flushed_bcbs delete   :2013-2038
15. private/big_private/shared_lrus_with_victims delete                 :2040-2054
16. show_status : free (posix_memalign 대응) → NULL                     :2056-2060
17. show_status_mutex destroy                                          :2062-2064
18. thread_clear_all_holder_anchor ()                                   :2066
```

중요한 세부:

- **순서 3에서 `num_buffers = 0`으로 만든다.** 이후 단계에서 `num_buffers`에 의존하는 코드가 없어야 한다. 실제로 5번 이후는 `PGBUF_TOTAL_LRU_COUNT`(shared+private, `num_buffers` 무관)만 쓴다.
- **5번은 `PGBUF_TOTAL_LRU_COUNT`를 다시 읽는다.** 즉 `num_LRU_list`와 `quota.num_private_LRU_list`가 그 시점까지 살아 있어야 한다. 12번에서 quota 배열을 free하되 `num_private_LRU_list` 스칼라는 건드리지 않으므로 순서상 안전하지만, finalize 안에서 quota를 memset하면 깨진다.
- **6, 8, 10, 17의 mutex destroy는 NULL 검사 없이 무조건 수행된다.** `pgbuf_initialize`가 `PTHREAD_MUTEX_INITIALIZER`로 미리 값을 넣어두거나(`:1644`, `:1663`) 해당 init 함수가 반드시 mutex를 먼저 초기화하기 때문에 성립한다(예: `pgbuf_initialize_aout_list`가 조기 반환 전에 `Aout_mutex`를 init, `:5775`). `buf_invalid_list.invalid_mutex`는 `:1619`의 memset으로 0이 되고, glibc에서 all-zero pthread mutex는 초기화된 것과 동등하므로 destroy가 통과한다 — **glibc 구현에 의존하는 부분**이다.
- `show_status`만 `free_and_init` 대신 `free()` + 수동 `NULL` 대입이다(`:2058-2059`). `cub_aligned_alloc`은 `posix_memalign` 기반이고 `free()`로 해제하는 것이 맞다(`src/base/memory_cwrapper.h:193-200`).
- `pgbuf_initialize`의 `error:` 레이블이 `pgbuf_finalize()`를 호출하므로(`:1869`), finalize는 **부분 초기화 상태에서도 안전해야 한다**. 대부분 NULL 검사로 처리되지만 §8에 두 개의 예외가 있다.

---

## 7. 불변식 · 설계 의도 · 함정

### 7.1 락 순서 규약

**BCB mutex ↔ hash mutex.** 정해진 순서는 "hash mutex를 먼저, BCB mutex를 나중"이지만, hash mutex를 쥔 채 BCB mutex를 **무조건 대기하지 않는다**. `pgbuf_search_hash_chain()`이 표준 패턴이다(`:7625-7665`):

```
lock (hash_mutex)
찾은 BCB에 대해 PGBUF_BCB_TRYLOCK:
   성공 → unlock (hash_mutex)                            /* 순서 유지, 대기 없음 */
   EBUSY → unlock (hash_mutex);  PGBUF_BCB_LOCK (bcb)    /* 먼저 풀고 나서 무조건 대기 */
          → 깨어난 뒤 VPID 재확인, 다르면 goto try_again  /* BCB가 재활용됐을 수 있음 */
```

hash mutex를 놓았다가 BCB mutex를 잡는 순간 BCB가 victim으로 뽑혀 다른 페이지에 재할당될 수 있으므로 **VPID 재검증이 필수**다(`:7656-7661`). 이 재검증을 빼면 조용한 데이터 손상이 된다.

역방향 순서(BCB mutex를 쥔 채 hash mutex 획득)도 존재한다: `pgbuf_delete_from_hash_chain()`은 "호출자가 `bufptr->mutex`를 쥐고 있다"는 전제 아래 `hash_mutex`를 무조건 잡는다(`:7854-7859`). 즉 **두 순서가 모두 사용된다.** 데드락을 피하는 근거는 순서 통일이 아니라 `pgbuf_search_hash_chain` 쪽이 trylock으로 후퇴한다는 점, 그리고 `pgbuf_delete_from_hash_chain`을 부르는 스레드는 그 BCB를 victim으로 확정해 다른 스레드가 해시 체인에서 그것을 찾아도 VPID 불일치로 물러난다는 점이다. 재구현 시 가장 위험한 지점이다.

**BCB mutex 다중 보유.** 최대 2개, 두 번째는 반드시 trylock (`:16619-16671`). 무조건 락은 항상 첫 번째여야 한다.

**LRU mutex ↔ BCB mutex.** `pgbuf_bcb_change_zone`의 주석(`:15810-15817`)이 케이스를 열거한다. zone 전이의 4가지 경우 중 "LRU zone 조정"(case 4)만 BCB mutex 없이 수행되며, 그때는 LRU mutex를 쥔다. 즉 **같은 BCB에 대한 동시 change_zone은 불가능**하다는 것이 불변식이고, 이것이 `count_lru1/2/3`을 비원자적으로 증감할 수 있는 근거다.

**hash mutex를 넘기는 관용구.** `pgbuf_search_hash_chain` 실패 → 호출자가 hash mutex 보유 → `pgbuf_lock_page`가 소비/해제, 또는 `pgbuf_insert_into_hash_chain`이 잡고 유지 → `pgbuf_unlock_page`가 해제. 이 릴레이가 세 함수에 걸쳐 있고 각 함수 주석이 계약을 명시한다(`:7666-7667`, `:7784-7786`, `:7819-7825`, `:7933-7935`, `:8044-8048`). 함수 하나만 보고 판단하면 안 되는 구조다.

### 7.2 구조적 불변식

| 불변식 | 근거 |
|---|---|
| `bufptr == bufptr->iopage_buffer->bcb` | `CAST_PGPTR_TO_BFPTR`/`CAST_BFPTR_TO_PGPTR`의 assert (`:152`, `:167`) |
| flags/zone/lru_index 마스크 비중첩 | `pgbuf_flags_mask_sanity_check()` (`:16800-16820`), 부팅 시 |
| `sizeof (PGBUF_HOLDER_ANCHOR) == 64` | `static_assert` (`:492`) |
| `0 <= dirties_cnt <= num_buffers` | `:15795`, `:15990` |
| `count_fix_and_avoid_dealloc & 0x00008000 == 0` | `:16207`, `:16225`, `:16265` |
| `count_fix_and_avoid_dealloc >= 0` | `:16264`, `:16321` |
| VOID/INVALID zone인 BCB의 LRU 인덱스는 0 | `pgbuf_bcb_change_zone` assert (`:15839-15840`) |
| invalid 리스트로 들어가는 BCB는 모든 플래그가 꺼져 있음 | `:8919` |
| `victim_hint`는 NULL이거나 LRU3 zone의 BCB | `:15708`, `:15714` |
| 스레드당 버퍼 락 최대 1개 | `buf_lock_table[thread->index]` 단일 슬롯 (`:8025`) |
| 스레드당 direct victim 배정 최대 1개 | `assert (bcb_victims[index] == NULL)` (`:8205`) |
| `PGBUF_TOTAL_LRU_COUNT < 65536` | **런타임 검사 없음.** 파라미터 상한으로만 보장 |
| LRU 리스트 zone 구조 정합성 | `pgbuf_lru_sanity_check()` (`:16828-…`, `!NDEBUG` 전용) |

### 7.3 함정 목록

1. **`PGBUF_LRU_3_ZONE`은 비트 마스크가 아니다** (§2.1). zone 비교는 `PGBUF_GET_ZONE()` 후 동등 비교.
2. **`count_fix_and_avoid_dealloc`의 fix 카운트는 latch fix count가 아니다.** latch는 `atomic_latch.impl.fcnt` (§2.2, §2.3).
3. **`pgbuf_put_bcb_into_invalid_list()`는 BCB mutex를 풀고 반환한다** (`:8927`). 호출 후 BCB mutex를 다시 풀면 안 된다.
4. **hash mutex 소유권이 함수 경계를 넘어 이동한다** (§7.1). 단독으로 읽으면 락 누수/이중 해제로 보인다.
5. **`CUBRID_DEBUG` 가드가 `prv2` 워터마크와 겹친다** (§3.2). 가드 코드를 되살리려면 오프셋 수정 필요.
6. **디버그 빌드에서 `PGBUF_HOLDER`가 65,600바이트** (§3.11). `thrd_reserved_holder` 크기가 스레드 수 × 7 × 65,600.
7. **`PGBUF_HOLDER_ANCHOR` 패딩이 정렬을 보장하지 않는다** (§3.11). `malloc` 베이스가 64로 나눠떨어지지 않으면 false sharing이 남는다.
8. **`buf_hash_table`은 풀 크기와 무관하게 56 MiB 고정** (§4.3).
9. **`buf_LRU_list` 주석의 garbage LRU는 존재하지 않는다** (§3.15).
10. **`UINT16MAX`(`:300`)는 죽은 매크로.**
11. **`PGBUF_LRU_LIST::flags` clear가 비원자적이다** (`:16365`, `:16457`). 플래그를 추가하면 반드시 원자연산으로 전환.
12. **`monitor.lru_hits[]` 증가는 비원자적**이다(`:16563`). `hit_age` 게이트가 빈도만 줄일 뿐이므로 값은 근사치다. 정확한 카운트로 오해하면 안 된다.
13. **`pgbuf_initialize_page_quota_parameters`가 quota를 다시 memset한다** (`:13892`). 그 이전에 quota 필드를 세팅하면 소실.
14. **`avoid deallocation`은 보장이 아니라 힌트다** (`:16232-16244`). ordered fix 경로에서 victim화될 수 있다.

---

## 8. 발견된 결함 후보

### 8.1 `direct_victims` memset 크기 오류 — `page_buffer.c:1626`

```c
memset (&pgbuf_Pool.direct_victims, 0, sizeof (PGBUF_VICTIM_CANDIDATE_LIST));
```

대상은 `PGBUF_DIRECT_VICTIM`(포인터 3개 = 24바이트, `:745-752`)인데 크기는 `PGBUF_VICTIM_CANDIDATE_LIST`(`PGBUF_BCB *` + `VPID` = 16바이트, `:841-845`)를 쓴다. 마지막 8바이트, 즉 `waiter_threads_low_priority`가 **0으로 초기화되지 않는다**.

실피해가 나려면 `pgbuf_initialize`가 `:1798` 이전에 실패해 `error:` → `pgbuf_finalize`로 가고, finalize가 `:2028-2032`에서 쓰레기 포인터를 `delete`해야 한다. `pgbuf_Pool`이 static이라 첫 초기화에서는 0이고, finalize가 매번 NULL로 되돌리므로 현재는 잠재 결함에 머문다. 올바른 수정은 `sizeof (PGBUF_DIRECT_VICTIM)`이다.

### 8.2 `Aout_mutex` 이중 destroy — `page_buffer.c:5851` + `:1980`

`pgbuf_initialize_aout_list()`의 `error_return`이 `pthread_mutex_destroy (&list->Aout_mutex)`를 수행한 뒤 `ER_FAILED`를 반환하고(`:5851-5853`), `pgbuf_initialize`는 `goto error` → `pgbuf_finalize()`를 호출하는데 finalize가 같은 mutex를 다시 destroy한다(`:1980`). 파괴된 pthread mutex의 재파괴는 정의되지 않은 동작이다. 해제 소유권을 한쪽으로 몰아야 한다(초기화 실패 경로에서 destroy를 제거하는 편이 finalize의 무조건 destroy 패턴과 일관된다).

### 8.3 `malloc(0)` 의존 — `page_buffer.c:13949-13957`

quota가 비활성이면 `PGBUF_PRIVATE_LRU_COUNT == 0`이므로 `malloc (0)`이다. glibc는 유효 포인터를 돌려주지만, NULL을 돌려주는 구현에서는 `ER_OUT_OF_VIRTUAL_MEMORY`로 부팅이 실패한다. `num_private_LRU_list == 0`일 때 할당을 건너뛰도록 가드하는 것이 옳다.

### 8.4 `CUBRID_DEBUG` 가드와 `prv2` 겹침 — `page_buffer.c:144-145`, `:5616`

§3.2 참조. 현재 `CUBRID_DEBUG`가 어디에서도 정의되지 않아 죽은 코드다.

---

## 9. 관련 시스템 파라미터

`src/base/system_parameter.c`에서 확인한 값 (기본 / 최소 / 최대):

| 파라미터 이름 | PRM ID | 기본 | 범위 | 플래그 | 정의 | 역할 |
|---|---|---|---|---|---|---|
| `data_buffer_pages` | `PRM_ID_PB_NBUFFERS` | 32768 | 1024 ~ — | `FOR_SERVER｜DEPRECATED｜RELOADABLE` | `:1200-1210` | 버퍼 프레임 수 → `num_buffers` (`page_buffer.c:1666`). `data_buffer_size`(`PRM_ID_PAGE_BUFFER_SIZE`)와 크기 기반 연동(`:5545`) |
| `num_LRU_chains` | `PRM_ID_PB_NUM_LRU_CHAINS` | 0 (auto) | 0 ~ 1000 | `FOR_SERVER｜HIDDEN` | `:1825-1836` | shared LRU 개수. 0이면 §4.4 공식 |
| `num_private_chains` | `PRM_ID_PB_NUM_PRIVATE_CHAINS` | −1 (auto) | −1 ~ 4050 | `FOR_SERVER｜RELOADABLE` | `:4202-4213` | private LRU 개수. −1=auto, 0=비활성 |
| `lru_hot_ratio` | `PRM_ID_PB_LRU_HOT_RATIO` | 0.40 | 0.05 ~ 0.90 | `FOR_SERVER｜RELOADABLE` | `:3785-3796` | `ratio_lru1` — LRU1(hot, victim 불가) 목표 비율 |
| `lru_buffer_ratio` | `PRM_ID_PB_LRU_BUFFER_RATIO` | 0.05 | 0.05 ~ 0.90 | `FOR_SERVER｜RELOADABLE` | `:3797-3808` | `ratio_lru2` — LRU2(완충, victim 불가) 목표 비율. 실효 상한은 `1 − 0.05 − ratio_lru1` (`page_buffer.c:1690`) |
| `data_aout_ratio` | `PRM_ID_PB_AOUT_RATIO` | 0.0 | 0.0 ~ 3.0 | `FOR_SERVER｜RELOADABLE` | `:3494-3505` | Aout 크기 = `num_buffers × ratio`, 상한 32768 노드. 기본값 0이므로 **Aout은 기본 비활성** |
| `page_latch_timeout_in_msecs` | `PRM_ID_PAGE_LATCH_TIMEOUT_IN_MSECS` | 300,000 | 0 ~ 3,000,000 | `FOR_SERVER｜HIDDEN` | `:5340-5351` | `pgbuf_latch_timeout_msecs` (`page_buffer.c:107`, `:1675`) |
| `pgbuf_monitor_locks` | `PRM_ID_PB_MONITOR_LOCKS` | false | — | `FOR_SERVER｜HIDDEN` | `:4214-4225` | BCB mutex 추적. **디버그 빌드는 파라미터 무시하고 항상 true** (`page_buffer.c:1676-1682`) |
| `data_buffer_neighbor_flush_pages` | `PRM_ID_PB_NEIGHBOR_FLUSH_PAGES` | 8 | 0 ~ 32 | `USER_CHANGE｜FOR_SERVER` | `:3984-3995` | 이웃 flush 폭. `PGBUF_MAX_NEIGHBOR_PAGES`(32)가 배열 상한 |
| `data_buffer_neighbor_flush_nondirty` | `PRM_ID_PB_NEIGHBOR_FLUSH_NONDIRTY` | false | — | `USER_CHANGE｜FOR_SERVER` | `:3973-3983` | 이웃 flush 시 non-dirty 포함 여부 |

파라미터가 아닌 파생 상수: `MAX_NTRANS = css_get_max_conn() + 1` (`src/transaction/log_common_impl.h:47-52`), `CSS_MAX_CLIENT_COUNT = 4000` (`src/connection/connection_globals.h:35`), `VACUUM_MAX_WORKER_COUNT = 50` (`src/query/vacuum.h:132`).

기본 설정(16K 페이지, 32768 프레임, `max_clients` 기본값)에서의 대략적 상주 메모리:

```
iopage_table   32768 × 16392 =  512 MiB   ← 압도적 비중
buf_hash_table 2^20  ×    56 =   56 MiB   ← 고정
BCB_table      32768 ×   144 =  4.5 MiB
buf_LRU_list   (32 + ~4051) × 128 ≈ 511 KiB
그 외 (holder, aout, victim_cand, lfcq, show_status) 합계 수 MiB
```
