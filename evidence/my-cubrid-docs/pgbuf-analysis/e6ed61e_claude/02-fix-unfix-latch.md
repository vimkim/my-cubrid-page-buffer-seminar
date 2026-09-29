# 페이지 fix/unfix 전체 경로와 래치(latch) 시스템

대상: `src/storage/page_buffer.c` (17,535줄). 이하 모든 라인 번호는 이 파일 기준이며, 다른 파일은 파일명을 명시한다.

---

## 0. 선행 자료구조

### 0.1 `PGBUF_ATOMIC_LATCH` — 래치 상태를 64비트 원자값 하나에 팩킹

`page_buffer.c:367`에서 `PGBUF_ATOMIC_LATCH`는 그냥 `std::atomic<uint64_t>`이고, 그 안의 논리적 필드 배치는 `page_buffer.c:507-516`의 union이 정의한다.

```c
union pgbuf_atomic_latch_impl            /* page_buffer.c:507-516 */
{
  uint64_t raw;
  struct
  {
    PGBUF_LATCH_MODE latch_mode;   /* bit 0-15  : enum:uint16_t  (page_buffer.h:191) */
    uint16_t waiter_exists;        /* bit 16-31 : 대기자 존재 플래그 */
    int32_t fcnt;                  /* bit 32-63 : fix count       */
  } impl;
};
```

`PGBUF_LATCH_MODE`가 `page_buffer.h:190-197`에서 `enum:uint16_t`로 선언된 것이 이 팩킹의 전제다 (`NO_LATCH=0, READ=1, WRITE=2, FLUSH=3, INVALID=4`). 이 세 필드를 한 워드에 넣은 이유는 **"READ 래치이고 대기자가 없고 fcnt>0"이라는 복합 조건을 단 한 번의 CAS로 원자적으로 검증·갱신**할 수 있게 만들기 위함이다. 이 성질이 6절의 lock-free RO 경로 전체를 떠받친다.

헬퍼는 `page_buffer.c:1355-1496`에 있고, 전부 동일한 패턴(load-modify-CAS 재시도 루프)이다:

| 헬퍼 | 라인 | 동작 |
|---|---|---|
| `set_latch` | 1394-1407 | `latch_mode`만 교체, 나머지 보존 |
| `add_fcnt` | 1408-1421 | `fcnt += cnt` |
| `set_latch_and_fcnt` | 1422-1436 | `latch_mode` 교체 + `fcnt = cnt` |
| `set_latch_and_add_fcnt` | 1437-1451 | `latch_mode` 교체 + `fcnt += cnt` |
| `set_waiter_exists` | 1452-1465 | `waiter_exists`만 교체 |
| `get_fcnt` / `get_waiter_exists` / `get_latch` | 1466-1488 | 단일 필드 load |
| `get_impl` | 1490-1496 | 워드 전체를 union으로 snapshot |

메모리 순서는 전부 `load: acquire`, `CAS: acq_rel / acquire`다. 주의할 점: **`get_impl`로 snapshot을 뜨고 여러 필드를 검사한 뒤 CAS로 원자성을 보장하는 패턴**이 이 파일의 관용구다 (`compare_exchange`가 실패하면 snapshot을 다시 떠서 판정을 처음부터 반복). `pgbuf_latch_bcb_upon_fix`(6287-6403), `pgbuf_unlatch_bcb_upon_unfix`(6627-6654), `pgbuf_promote_read_latch`(2846-2911), `pgbuf_wakeup_reader_writer`(7459-7504)가 모두 이 구조다.

주의: 개별 헬퍼(`set_latch`, `add_fcnt` 등)를 연달아 호출하면 **원자성이 깨진다**. 그래서 복합 전이가 필요한 지점은 반드시 `get_impl` + 직접 `compare_exchange_*`를 쓴다.

### 0.2 `PGBUF_BCB` (`page_buffer.c:519-556`)

fix/unfix에 직접 관여하는 필드만 추린다.

```c
struct pgbuf_bcb
{
  pthread_mutex_t mutex;              /* 519: BCB mutex (SERVER_MODE) */
  int owner_mutex;                    /* 520 */
  VPID vpid;                          /* 521: 상주 페이지 식별자 */
  PGBUF_ATOMIC_LATCH atomic_latch;    /* 522: 0.1절 */
  volatile int flags;                 /* 523: 플래그 + zone + lru index 합성 */
  THREAD_ENTRY *next_wait_thrd;       /* 525: BCB 대기 큐 (단일 연결 리스트) */
  THREAD_ENTRY *latch_last_thread;    /* 528: 마지막 래치 획득 스레드(디버그) */
  PGBUF_BCB *hash_next;               /* 530: 해시 체인 */
  PGBUF_BCB *prev_BCB, *next_BCB;     /* 531-532: LRU/invalid 체인 */
  volatile int count_fix_and_avoid_dealloc; /* 535: 0.5절 */
  LOG_LSA oldest_unflush_lsa;         /* 544 */
  PGBUF_IOPAGE_BUFFER *iopage_buffer; /* 545: 실제 페이지 버퍼 */
};
```

BCB mutex 접근은 매크로로 감싸져 있다 (`page_buffer.c:951-966`). `pgbuf_Monitor_locks`가 켜지면 leak 추적 버전으로 우회한다:

```c
#define PGBUF_BCB_LOCK(bcb)     /* 952 */
#define PGBUF_BCB_TRYLOCK(bcb)  /* 954: pthread_mutex_trylock, 0 또는 EBUSY */
#define PGBUF_BCB_UNLOCK(bcb)   /* 956 */
#define PGBUF_BCB_CHECK_MUTEX_LEAKS()  /* 959 */
```

**SA_MODE에서는 이 매크로 전부가 no-op이다** (`page_buffer.c:961-966`). 즉 단일 스레드 빌드에서 BCB mutex는 존재조차 하지 않는다.

`CAST_PGPTR_TO_BFPTR` / `CAST_BFPTR_TO_PGPTR`로 `PAGE_PTR ↔ PGBUF_BCB *`가 상수 시간 변환된다. `PAGE_PTR`은 `bcb->iopage_buffer->iopage.page`를 가리키므로, BCB는 페이지 포인터에서 포인터 산술로 역산 가능하다 (`assert (bufptr == bufptr->iopage_buffer->bcb)`, 2475).

### 0.3 holder 관리: thread별 anchor

한 스레드가 어떤 페이지를 몇 번 fix했는지는 **BCB 쪽이 아니라 스레드 쪽**에 기록한다. 이것이 재진입 fix 판정의 기반이다.

```c
struct pgbuf_holder                    /* page_buffer.c:461-478 */
{
  int fix_count;                       /* 이 holder(=스레드)의 fix 횟수 */
  PGBUF_BCB *bufptr;
  PGBUF_HOLDER *thrd_link;             /* 스레드 hold 리스트의 next */
  PGBUF_HOLDER *next_holder;           /* 스레드 free 리스트의 next */
  PGBUF_HOLDER_STAT perf_stat;
#if !defined(NDEBUG)
  char fixed_at[64 * 1024];            /* fix 위치 문자열 누적 (디버그 빌드 전용, 64KB!) */
  int fixed_at_size;
#endif
  int watch_count;
  PGBUF_WATCHER *first_watcher, *last_watcher;
};

struct pgbuf_holder_anchor             /* page_buffer.c:481-491 */
{
  int num_free_cnt;
  int num_hold_cnt;
  PGBUF_HOLDER *thrd_free_list;
  PGBUF_HOLDER *thrd_hold_list;
  char m_pad[64 - 2*sizeof(int) - 2*sizeof(PGBUF_HOLDER *)];  /* 캐시라인 패딩 */
};
static_assert (sizeof (PGBUF_HOLDER_ANCHOR) == 64, ...);   /* page_buffer.c:493 */
```

패딩의 이유가 `page_buffer.c:486-487` 주석에 명시돼 있다: `num_hold_cnt`/`thrd_hold_list`는 **모든 fix/unfix마다 write**되므로, 패딩이 없으면 인접 스레드의 anchor와 false sharing이 발생한다. anchor 배열은 `pgbuf_Pool.thrd_holder_info`로 `page_buffer.c:5888`에서 스레드 수만큼 malloc된다.

**핫패스 최적화**: `thread_p->m_holder_anchor` 캐시 포인터. `thread_get_entry_index()` → 배열 인덱싱을 매번 하는 대신, 스레드 엔트리에 자기 anchor 포인터를 lazy 캐싱한다. 이 lazy 초기화 패턴이 5곳에 중복돼 있다: `pgbuf_thread_variables_init`(1513-1516), `pgbuf_allocate_thrd_holder_entry`(5975-5979), `pgbuf_find_thrd_holder`(6058-6062), `pgbuf_remove_thrd_holder`(6169-6173), `pgbuf_get_holder`(13624-13628).

holder 엔트리 3단 할당 (`pgbuf_allocate_thrd_holder_entry`, 5958-6037):

```
1) thrd_free_list 에서 pop            (5981-5987)  — mutex 불필요, 스레드 로컬
2) 비었으면 pgbuf_Pool.free_holder_set 에서 슬라이스
     -> pgbuf_Pool.free_holder_set_mutex 획득 (5993)
     -> free_index == -1 이면 PGBUF_HOLDER_SET(=10개 배열, page_buffer.c:94) malloc (5998)
     -> element[free_index++] 반환, 10개 소진 시 free_index = -1 (6011-6019)
     -> mutex 해제 (6020)
3) 어느 경로든: hold_list 헤드에 삽입, num_hold_cnt++ (6029-6032)
```

즉 **정상 경로에서 holder 할당은 전역 뮤텍스를 전혀 건드리지 않는다.** 전역 뮤텍스는 스레드가 처음으로 10개 이상의 동시 fix를 시도할 때만 잡힌다. holder는 free 리스트로 반환되며 **절대 free되지 않는다** (`pgbuf_remove_thrd_holder`, 6146-6216).

### 0.4 해시 앵커와 buffer lock 체인

```c
struct pgbuf_buffer_hash               /* page_buffer.c:584-591 */
{
  pthread_mutex_t hash_mutex;          /* 해시 체인 + buffer lock 체인 둘 다 보호 */
  PGBUF_BCB *hash_next;                /* 해시 체인 앵커 */
  PGBUF_BUFFER_LOCK *lock_next;        /* buffer lock 체인 앵커 */
};

struct pgbuf_buffer_lock               /* page_buffer.c:571-578 */
{
  VPID vpid;
  PGBUF_BUFFER_LOCK *lock_next;
  THREAD_ENTRY *next_wait_thrd;        /* 이 VPID를 기다리는 스레드 큐 */
};
```

핵심 설계: **`hash_mutex` 하나가 해시 체인과 buffer lock 체인을 동시에 보호한다.** buffer lock은 "이 VPID를 디스크에서 읽는 중"이라는 I/O 락이며, 락 레코드는 **스레드당 1개 고정 배열**(`pgbuf_Pool.buf_lock_table[thread->index]`, 8025)이다. 한 스레드는 동시에 하나의 VPID만 읽을 수 있으므로 이 배치가 성립한다.

해시 함수 `pgbuf_hash_func_mirror` (1524-1555):

```c
volid_lsb = vpid->volid;
/* volid 하위 8비트를 비트 역순으로 뒤집어 hash 공간의 최상위에 배치 */
for (i = 8; i > 0; i--) {
    if (volid_lsb & lsb_mask) reversed_volid_lsb |= reverse_mask;
    reverse_mask >>= 1;  lsb_mask <<= 1;
}
hash_val = vpid->pageid ^ reversed_volid_lsb;
hash_val &= (1 << HASH_SIZE_BITS) - 1;     /* HASH_SIZE_BITS = 20, page_buffer.c:297 */
```

`HASH_SIZE_BITS=20` → 버킷 1,048,576개 (`PGBUF_HASH_SIZE`, 298). 의도: `pageid`는 하위 비트가 조밀하게 증가하므로 그대로 쓰고, `volid`는 **역순으로 뒤집어 상위 비트에 얹어** 서로 다른 볼륨의 동일 `pageid`가 충돌하지 않게 한다. 볼륨 수가 적어도 상위 비트 공간이 골고루 갈라진다. `pgbuf_hash_vpid`(1564-1570)는 별개 함수로, fix 경로가 아니라 일반 해시 테이블 유틸리티용이다.

### 0.5 `count_fix_and_avoid_dealloc` — 하나의 int에 두 카운터

```c
#define PGBUF_BCB_COUNT_FIX_SHIFT_BITS  16          /* page_buffer.c:268 */
#define PGBUF_BCB_AVOID_DEALLOC_MASK    0x0000FFFF  /* page_buffer.c:269 */
#define PGBUF_FIX_COUNT_THRESHOLD       64          /* page_buffer.c:106 */
```

하위 16비트 = avoid-dealloc 카운터, 상위 16비트 = fix 누적 카운터. `page_buffer.c:535-539` 주석이 이유를 밝힌다: **avoid-dealloc은 원자적으로 갱신돼야 하는데 2바이트 원자 연산은 이식성이 낮으므로**, 두 short 대신 한 int로 합쳐 32비트 원자 연산을 쓴다.

| 함수 | 라인 | 동작 |
|---|---|---|
| `pgbuf_bcb_register_fix` | 16296-16311 | 임계치 미달일 때만 `+= 1<<16`. hot 페이지 감지 목적이므로 임계치 도달 후엔 갱신 생략 |
| `pgbuf_bcb_is_hot` | 16317-16322 | `>= 64<<16` |
| `pgbuf_bcb_register_avoid_deallocation` | 16204-16209 | `ATOMIC_INC_32(+1)` |
| `pgbuf_bcb_unregister_avoid_deallocation` | 16217-16253 | CAS 루프로 `-1`. **하위 16비트가 0이면 감소하지 않고 debug log만 남기고 탈출** (16241-16251) |
| `pgbuf_bcb_should_avoid_deallocation` | 16261-16267 | `(cnt & 0xFFFF) != 0` |
| `pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc` | 16278-16289 | 필드 전체를 0으로. avoid-dealloc이 남아 있으면 경고 로그 |

`unregister`의 0-방어 로직에 `page_buffer.c:16228-16250`의 긴 주석이 붙어 있다: `pgbuf_ordered_fix`가 보유 페이지 전부를 unfix하고 재fix하는 과정에서 중간에 BCB가 victim이 될 수 있어, 재fix 시점에 카운터가 0인 상황이 **정상적으로** 발생한다는 설명이다.

---

## 1. `pgbuf_fix` 전체 흐름도

진입점은 디버그/릴리스 두 갈래다 (`page_buffer.c:2208-2214`). 디버그 빌드는 `caller_file/line/func`을 추가로 받아 `holder->fixed_at`에 누적한다. 본체 로직은 완전히 동일하다.

```
pgbuf_fix (thread_p, vpid, fetch_mode, request_mode, condition)   [2209 / 2213]
   |
   +-- (A) 진입 검증  [2238-2293]
   |     request_mode in {READ, WRITE} 아니면 assert_release + NULL       [2239-2243]
   |     condition   in {UNCOND, COND} 아니면 assert_release + NULL       [2244-2248]
   |     thread_p->pgbuf_fix_req_cnt++       (per-thread shard, 원자 아님) [2252-2255]
   |     페이지 유효성 검사 (fetch_mode != RECOVERY_PAGE 일 때만)          [2257-2265]
   |     vpid->pageid < 0  ->  ER_PB_BAD_PAGEID(FATAL) + NULL             [2268-2273]
   |     ┌ condition == UNCOND && tran wait_msecs == ZERO_WAIT
   |     └   ->  condition = CONDITIONAL_LATCH 로 강등                    [2275-2285]
   |
   v
try_again:                                                              [2295]
   |
   +-- (B) 인터럽트 체크 -> ER_INTERRUPTED + NULL                        [2297-2306]
   |
   +-- (C) === LOCK-FREE RO FAST PATH ===                               [2311-2330]
   |     조건: request_mode == PGBUF_LATCH_READ
   |        && fetch_mode in {OLD_PAGE, OLD_PAGE_PREVENT_DEALLOC,
   |                          OLD_PAGE_MAYBE_DEALLOCATED}
   |        && condition == PGBUF_UNCONDITIONAL_LATCH
   |     pgptr = pgbuf_lockfree_fix_ro()                        [2315]
   |        |
   |        +-- hash 체인 walk (뮤텍스 0개)              [7737-7751]
   |        +-- atomic_latch CAS: {READ, !waiter, fcnt>0} 확인 후 fcnt++  [7685-7697]
   |        +-- holder 갱신/할당                                [7700-7730]
   |        |
   |     성공 --> goto fast_path  (뮤텍스를 단 하나도 잡지 않음!)  [2328]
   |     실패 --> 아래 일반 경로로 폴백
   |
   v
   +-- (D) 해시 조회                                                     [2332-2340]
   |     hash_anchor = &buf_hash_table[PGBUF_HASH_VALUE(vpid)]           [2332]
   |     bufptr = pgbuf_search_hash_chain(hash_anchor, vpid)             [2335]
   |         반환 규약:  bufptr != NULL -> BCB mutex 보유, hash_mutex 해제
   |                    bufptr == NULL -> hash_mutex 보유
   |     bufptr != NULL && is_direct_victim(bufptr):
   |         VICTIM_DIRECT 플래그 -> INVALIDATE_DIRECT_VICTIM 로 교체     [2336-2340]
   |         (victim을 기다리는 스레드에게 "이 BCB 못 쓴다"고 통보)
   |
   +---------+-----------------------------+----------------------------+
   | HIT     | MISS & OLD_PAGE_IF_IN_BUFFER| MISS & 그 외               |
   | [2341]  | [2359]                      | [2365]                     |
   |         |                             |                            |
   | num_hit++|  unlock(hash_mutex)        | pgbuf_claim_bcb_for_fix()  |
   | NEW_PAGE |  return NULL (에러 없음)   |   [2367]                   |
   | 이면 dirty|                            |   |                        |
   | assert   |                            |   +- lock_page(VPID I/O락) |
   |         |                             |   |    [7937-8034]         |
   |         |                             |   |   WAITER면 *retry=true |
   |         |                             |   |   -> goto try_again    |
   |         |                             |   +- allocate_bcb()        |
   |         |                             |   |    [8135-8329]         |
   |         |                             |   |   (invalid list ->     |
   |         |                             |   |    get_victim ->       |
   |         |                             |   |    direct victim 대기) |
   |         |                             |   +- 디스크 read           |
   |         |                             |   |   dwb_read_page ->     |
   |         |                             |   |   fileio_read ->       |
   |         |                             |   |   TDE 복호화           |
   |         |                             |   |    [8449-8508]         |
   |         |                             |   +- NEW_PAGE면 read 생략, |
   |         |                             |       LSA/prv 초기화       |
   |         |                             |        [8545-8578]         |
   |         |                             |   buf_lock_acquired = true |
   +---------+-----------------------------+----------------------------+
                        |
                        v   (여기서부터 BCB mutex 보유)
   +-- (E) 공통 전처리                                                  [2391-2428]
   |     assert (!is_direct_victim(bufptr))                              [2391]
   |     pgbuf_bcb_register_fix(bufptr)             (hot 감지 카운터)    [2395]
   |     pgbuf_set_bcb_page_vpid(bufptr)                                 [2399]
   |     pgbuf_check_bcb_page_vpid(bufptr, maybe_dealloc) 실패시:        [2402-2423]
   |         buf_lock_acquired ? (invalid list 반납 + unlock_page(true))
   |                           : PGBUF_BCB_UNLOCK
   |         return NULL
   |     fetch_mode == OLD_PAGE_PREVENT_DEALLOC:
   |         pgbuf_bcb_register_avoid_deallocation(bufptr)               [2425-2428]
   |
   v
   +-- (F) === LATCH PASS ===  pgbuf_latch_bcb_upon_fix()               [2440]
   |     [6248-6584]  이 함수는 어떤 경로로든 BCB mutex를 해제한다
   |        |
   |        +-- waiter_exists 위생 검사/치유 (idle BCB인데 대기자 큐 빔)  [6272-6284]
   |        +-- CAS 결정 루프 (4절 표 참조)                     [6287-6403]
   |        |
   |        +-- is_page_idle  -> 즉시 획득, holder 신규 할당      [6408-6443]
   |        +-- can_latch     -> 즉시 획득, holder 증가 또는 신규 [6445-6488]
   |        +-- promote_needed -> READ 반납 후 아래로            [6490-6505]
   |        +-- CONDITIONAL   -> 실패. ZERO_WAIT면 ER_LK_PAGE_TIMEOUT [6511-6545]
   |        +-- UNCONDITIONAL -> pgbuf_block_bcb() 로 블록        [6547-6583]
   |                              |
   |                              +-- 대기 큐 삽입 (promoter는 head) [7020-7046]
   |                              +-- pgbuf_timed_sleep()            [7104]
   |                                    thread_lock_entry
   |                                    -> PGBUF_BCB_UNLOCK
   |                                    -> thread_suspend_timeout_...
   |                              +-- 기상 후 holder 신규 할당,
   |                                  *is_latch_wait = true
   |     실패시: buf_lock_acquired 이면 BCB 재락 -> invalid list 반납
   |             -> unlock_page(true);  return NULL                      [2443-2463]
   |
   v   (BCB mutex 해제됨. 래치 보유 상태)
   +-- (G) 해시 체인 연결 (미스 경로만)                                  [2485-2496]
   |     buf_lock_acquired:
   |         pgbuf_insert_into_hash_chain()   -> hash_mutex 획득 후 유지  [2487]
   |         pgbuf_unlock_page(need_hash_mutex = false)                   [2494]
   |             -> lock 레코드 제거, hash_mutex 해제,
   |                buffer-lock 대기자 전원 기상
   |     CAST_BFPTR_TO_PGPTR (pgptr, bufptr)                             [2497]
   |
   v
fast_path:                                                              [2498]
   |     (디버그) holder != NULL, watcher magic 검증                     [2499-2511]
   |     fetch_mode == OLD_PAGE_PREVENT_DEALLOC:
   |         pgbuf_bcb_unregister_avoid_deallocation()  <-- 12절 참조    [2513-2517]
   |     ptype == PAGE_UNKNOWN (deallocated 페이지)?                     [2523-2560]
   |         NEW_PAGE / OLD_PAGE_DEALLOCATED /
   |         OLD_PAGE_IF_IN_BUFFER / RECOVERY_PAGE   -> 그대로 반환
   |         OLD_PAGE / OLD_PAGE_PREVENT_DEALLOC     -> assert(false),
   |                     ER_PB_BAD_PAGEID(ERROR), unfix, NULL
   |         OLD_PAGE_MAYBE_DEALLOCATED              -> ER_PB_BAD_PAGEID
   |                     (WARNING), unfix, NULL
   |     show_status->num_page_request++                                 [2565]
   |     perf 집계 (PSTAT_PB_NUM_FETCHES 등)                             [2568-2632]
   |     vacuum worker면 TO_VACUUM 플래그 clear                          [2634-2637]
   |     return pgptr
```

**재시도(`goto try_again`)가 발생하는 유일한 지점**은 2370-2374이다. `pgbuf_claim_bcb_for_fix`가 `*try_again = true`를 세팅하는 경우, 즉 `pgbuf_lock_page`가 `PGBUF_LOCK_WAITER`를 반환했을 때다 (8391-8412). 의미: **다른 스레드가 같은 VPID를 이미 디스크에서 읽고 있었고, 우리는 그 완료를 기다렸다가 깨어났다.** 이제 그 페이지는 버퍼에 있을 것이므로 처음부터 다시 시도하면 (D)의 해시 HIT로 끝난다. 재시도 시 `retry = false`로 리셋하는 것(2372)을 잊으면 안 된다.

---

## 2. 단계별 의사코드 (뮤텍스 획득/해제 시점 명시)

### 2.1 `pgbuf_search_hash_chain` (7546-7666) — 2단계 조회

이 함수의 반환 규약이 호출자 전체를 지배한다:

```
성공(bufptr != NULL):  BCB mutex 보유,   hash_mutex 미보유
실패(bufptr == NULL):  BCB mutex 미보유, hash_mutex 보유       [7663-7664 주석]
```

```
one_phase:                                        /* 7557: hash_mutex 없이 시도 */
    for (bufptr = hash_anchor->hash_next; bufptr; bufptr = bufptr->hash_next)
        if (VPID_EQ (bufptr->vpid, vpid))
            rv = PGBUF_BCB_TRYLOCK (bufptr)                      /* 7566 */
            if rv == 0:            /* 획득 */
            elif rv != EBUSY:      goto two_phase                /* 7576 */
            else:                  PGBUF_BCB_LOCK (bufptr)       /* 7581, 블로킹 */
            if (!VPID_EQ (bufptr->vpid, vpid)):                  /* 7586 */
                PGBUF_BCB_UNLOCK (bufptr); goto one_phase        /* 재검증 실패 = 교체됨 */
            break
    if bufptr != NULL: return bufptr                             /* 7597-7600 */

two_phase:                                        /* 7605: hash_mutex 보유 */
try_again:                                        /* 7608 */
    LOCK   hash_anchor->hash_mutex                               /* 7614 */
    for (bufptr = hash_anchor->hash_next; bufptr; bufptr = bufptr->hash_next)
        if (VPID_EQ (bufptr->vpid, vpid))
            rv = PGBUF_BCB_TRYLOCK (bufptr)                      /* 7629 */
            if rv == 0:
                UNLOCK hash_mutex                                /* 7632 */
            elif rv != EBUSY:
                ER_CSS_PTHREAD_MUTEX_TRYLOCK(FATAL); return NULL /* 7638 */
            else:  /* EBUSY */
                UNLOCK hash_mutex                                /* 7646  <-- 순서 핵심 */
                PGBUF_BCB_LOCK (bufptr)                          /* 7647  블로킹 */
            if (!VPID_EQ (bufptr->vpid, vpid)):
                PGBUF_BCB_UNLOCK (bufptr); goto try_again        /* 7655-7660 */
            break
    return bufptr      /* NULL이면 hash_mutex를 그대로 들고 나감 */
```

세 가지 설계 포인트:

1. **one_phase는 `hash_mutex`를 전혀 잡지 않는다.** 체인 walk 중 다른 스레드가 `hash_next`를 바꿔도 BCB는 프리얼로케이트된 배열(`pgbuf_Pool.BCB_table`)의 원소라 절대 free되지 않으므로 dangling read가 없다. 최악의 결과는 "있는 페이지를 못 찾음"이고, 그러면 two_phase로 넘어가 뮤텍스 하에서 다시 찾는다.
2. **`hash_mutex`를 들고 BCB mutex를 블로킹 획득하지 않는다.** `TRYLOCK`이 `EBUSY`면 반드시 `hash_mutex`를 먼저 내려놓고(7646) 블로킹 락을 잡는다. 이것이 3절 락 랭킹 규칙의 강제 지점이다.
3. **BCB mutex 획득 후 반드시 VPID 재검증** (7586, 7655). 뮤텍스를 잡는 사이에 그 BCB가 victim이 되어 다른 페이지를 담았을 수 있다.

한편 lock-free 버전 `pgbuf_search_hash_chain_no_bcb_lock` (7736-7751)은 one_phase의 walk만 남기고 **BCB mutex를 아예 잡지 않으며 VPID 재검증도 여기서 하지 않는다.** 재검증은 호출자인 `pgbuf_lockfree_fix_ro`가 CAS 루프 안에서 수행한다.

### 2.2 `pgbuf_lockfree_fix_ro` (7671-7734)

```
bufptr = pgbuf_search_hash_chain_no_bcb_lock (&buf_hash_table[HASH(vpid)], vpid)   /* 7677 */
if bufptr == NULL: return NULL

do {                                                              /* 7685 */
    impl = get_impl (&bufptr->atomic_latch)                       /* 7687 */
    new_impl = impl
    if (impl.latch_mode != PGBUF_LATCH_READ                       /* 7689 */
        || impl.waiter_exists
        || impl.fcnt == 0
        || bufptr->vpid.pageid != vpid->pageid                    /* 7690 */
        || bufptr->vpid.volid  != vpid->volid)
        return NULL                     /* 폴백: 일반 경로로 */
    new_impl.fcnt++
} while (!atomic_latch.compare_exchange_weak (impl.raw, new_impl.raw,
                                              acq_rel, acquire))  /* 7696 */

/* 이 시점: READ 래치 획득 완료. 뮤텍스는 하나도 잡지 않았다. */
holder = pgbuf_find_thrd_holder (thread_p, bufptr)                /* 7700 */
if holder: holder->fix_count++;  holder->perf_stat.hold_has_read_latch = 1   /* 7704-7707 */
else:      holder = pgbuf_allocate_thrd_holder_entry();  fix_count = 1  ...  /* 7714-7728 */
CAST_BFPTR_TO_PGPTR (pgptr, bufptr);  return pgptr
```

네 가지 거부 조건이 각각 무엇을 막는지가 이 함수의 정당성 전부다 → 6절.

### 2.3 `pgbuf_lock_page` (7937-8034) — VPID I/O 락

목적: **같은 VPID를 두 스레드가 동시에 디스크에서 읽어 BCB 두 개에 중복 상주시키는 것을 막는다.** 호출 시 `hash_mutex` 보유가 전제이고, 어떤 경로로든 `hash_mutex`를 해제하고 반환한다 (7930-7932 주석).

```
/* 진입: hash_mutex 보유 */
for (cur = hash_anchor->lock_next; cur; cur = cur->lock_next)     /* 7960 */
    if (VPID_EQ (cur->vpid, vpid))
        /* 누가 이미 이 VPID를 읽는 중 -> 대기자로 등록 */
        thread_p->next_wait_thrd = cur->next_wait_thrd            /* 7964 */
        cur->next_wait_thrd = thread_p
        pgbuf_sleep (thread_p, &hash_anchor->hash_mutex)          /* 7966 */
            |  pgbuf_sleep [11535-11543]:
            |     thread_lock_entry (thread_p)
            |     pthread_mutex_unlock (hash_mutex)   <-- 여기서 hash_mutex 해제
            |     thread_suspend_wakeup_and_unlock_entry (THREAD_PGBUF_SUSPENDED)
        /* 기상 */
        if (resume_status != THREAD_PGBUF_RESUMED)   /* 인터럽트 */
            LOCK hash_mutex; 큐에서 자기 자신 제거; UNLOCK hash_mutex   /* 7972-8013 */
        PSTAT_LK_NUM_WAITED_ON_PAGES++
        return PGBUF_LOCK_WAITER                                  /* 8016 */

/* 체인에 없음 -> 내가 읽기 담당 */
cur = &pgbuf_Pool.buf_lock_table[thread_p->index]                 /* 8025 */
cur->vpid = *vpid;  cur->next_wait_thrd = NULL
cur->lock_next = hash_anchor->lock_next;  hash_anchor->lock_next = cur   /* 8028-8029 */
UNLOCK hash_mutex                                                 /* 8030 */
PSTAT_LK_NUM_ACQUIRED_ON_PAGES++
return PGBUF_LOCK_HOLDER
```

주의: `pgbuf_sleep`은 **무한 대기**다 (timed_sleep 아님). VPID lock holder가 어떤 경로로 실패하더라도 반드시 `pgbuf_unlock_page`를 호출해야 하는 이유가 여기 있다. `pgbuf_claim_bcb_for_fix`의 모든 실패 경로(8398, 8462, 8503)와 `pgbuf_fix`의 실패 경로(2414, 2458)가 예외 없이 `pgbuf_unlock_page(..., true)`를 호출하는 것이 이 계약이다.

### 2.4 `pgbuf_unlock_page` (8050-8125)

```
if (need_hash_mutex): LOCK hash_mutex                             /* 8073 */
/* buffer lock 체인에서 vpid 찾기 */
for (cur = hash_anchor->lock_next; cur; prev = cur, cur = cur->lock_next)
    if (VPID_EQ (cur->vpid, vpid)) break                          /* 8085-8096 */
if (cur != NULL):
    체인에서 cur 분리                                             /* 8100-8109 */
    UNLOCK hash_mutex                                             /* 8111  <-- 기상 전에 해제 */
    while ((t = cur->next_wait_thrd) != NULL):                    /* 8113 */
        cur->next_wait_thrd = t->next_wait_thrd; t->next_wait_thrd = NULL
        pgbuf_wakeup_uncond (t)          /* 무조건 기상 [11572-11591] */
else:
    UNLOCK hash_mutex                                             /* 8121 */
```

`need_hash_mutex` 파라미터의 의미:
- `true`: 호출자가 `hash_mutex`를 안 들고 있음 → 여기서 잡아서 해제. 실패 경로 전부가 이쪽 (2414, 2458, 8398, 8462, 8503).
- `false`: 호출자가 이미 `pgbuf_insert_into_hash_chain`에서 잡아둠 → 여기서 해제만. 성공 경로 (2494).

이 비대칭이 성공 경로의 원자성을 보장한다: **"해시 체인 삽입 → buffer lock 해제"가 `hash_mutex` 하나의 임계구역 안에서 일어난다.** 그래서 대기자가 깨어나 재시도하면 페이지가 반드시 해시에 보인다. `pgbuf_insert_into_hash_chain`(7788-7826)이 일부러 `hash_mutex`를 잡은 채로 반환하는 이유가 이것이고, 7783-7785 주석에 명시돼 있다.

### 2.5 `pgbuf_allocate_bcb` (8135-8329) — victim 확보

`page_buffer.c:8151-8169`의 주석이 3단 전략을 정리해 두었다.

```
1) bufptr = pgbuf_get_bcb_from_invalid_list()                     /* 8173 */
       [8860-8898] 이중 검사(락 없이 top 확인 -> invalid_mutex -> 재확인)
       성공 시 BCB mutex 보유 + zone = VOID 로 변경 후 즉시 반환   /* 8177-8180 */
2) bufptr = pgbuf_get_victim (thread_p)         /* LRU 탐색 */     /* 8186 */
       성공 -> goto end
3) 실패 시 모드별 분기:
   [SERVER_MODE && page_flush_daemon 사용 가능]                    /* 8193 */
   retry:                                                         /* 8195 */
       high_priority = high_priority
                    || VACUUM_IS_THREAD_VACUUM(thread_p)
                    || pgbuf_is_thread_high_priority(thread_p)     /* 8196 */
       pgbuf_make_latch_timeout (&to, pgbuf_latch_timeout_msecs)   /* 8199 */
       thread_lock_entry (thread_p)                                /* 8201 */
       assert (direct_victims.bcb_victims[thread_p->index] == NULL)
       high ? waiter_threads_high_priority->produce (thread_p)     /* 8210 */
            : waiter_threads_low_priority->produce (thread_p)      /* 8222 */
              (low 큐 produce 실패 시 high 큐로 폴백 — 8224-8244 주석의 hack)
       pgbuf_wakeup_page_flush_daemon (thread_p)                   /* 8253 */
       show_status->num_flusher_waiting_threads++
       r = thread_suspend_timeout_wakeup_and_unlock_entry (&to,
                                       THREAD_ALLOC_BCB_SUSPENDED) /* 8257 */
       show_status->num_flusher_waiting_threads--
       if r == NO_ERROR && resume_status == THREAD_ALLOC_BCB_RESUMED:
           bufptr = pgbuf_get_direct_victim (thread_p)             /* 8267 */
           if bufptr == NULL:      /* BCB가 다시 fix됐다 */
               high_priority = true;  goto retry                   /* 8270-8271 */
           goto end
       elif 인터럽트/셧다운:
           bcb_victims[index]에 이미 배정된 BCB가 있으면
               VICTIM_DIRECT | INVALIDATE_DIRECT_VICTIM 둘 다 clear /* 8281-8285 */
           ER_INTERRUPTED
   [SA_MODE 또는 flush daemon 미가용]                              /* 8301 */
       pgbuf_wakeup_page_flush_daemon();  bufptr = pgbuf_get_victim()
       assert (bufptr != NULL)                                     /* 8309 */
end:                                                              /* 8312 */
    if bufptr: pgbuf_victimize_bcb (bufptr)   /* 실패 시 bufptr = NULL */ /* 8316 */
    else:      ER_PB_ALL_BUFFERS_DIRTY                             /* 8325 */
    return bufptr    /* != NULL 이면 BCB mutex 보유 */
```

**direct victim 대기 흐름**은 producer/consumer 구조다. 대기 스레드는 자기 `THREAD_ENTRY *`를 두 개의 lock-free 큐 중 하나에 넣고 잠든다. 반대편에서 `pgbuf_assign_direct_victim`(15366-15423)이 이 큐에서 스레드를 하나 꺼내:

```
while (pgbuf_get_thread_waiting_for_direct_victim (waiter_thread))    /* 15473 */
    thread_lock_entry (waiter_thread)
    if (waiter_thread->resume_status != THREAD_ALLOC_BCB_SUSPENDED)
        thread_unlock_entry; continue      /* 더 이상 기다리지 않음 */  /* 15479-15484 */
    thread_wakeup_already_had_mutex (waiter_thread, THREAD_ALLOC_BCB_RESUMED)  /* 15487 */
    pgbuf_bcb_update_flags (bcb, PGBUF_BCB_VICTIM_DIRECT_FLAG,
                                 PGBUF_BCB_FLUSHING_TO_DISK_FLAG)    /* 15490 */
    direct_victims.bcb_victims[waiter_thread->index] = bcb           /* 15492 */
    thread_unlock_entry (waiter_thread);  return true
```

`pgbuf_get_thread_waiting_for_direct_victim`(15501-15525)은 **4번마다 1번은 low priority 큐를 먼저 소비**해서 (`my_count % 4 == 0`, 15509) low priority 스레드의 기아를 막는다.

배정된 BCB를 수령하는 쪽은 `pgbuf_get_direct_victim`(15535-15587):

```
bcb = ATOMIC_TAS_ADDR (&direct_victims.bcb_victims[thread_p->index], NULL)  /* 15538 */
PGBUF_BCB_LOCK (bcb)                                              /* 15543 */
if (pgbuf_bcb_is_invalid_direct_victim (bcb))       /* 누가 다시 fix했다 */
    INVALIDATE_DIRECT_VICTIM clear;  UNLOCK;  return NULL         /* 15545-15551 */
VICTIM_DIRECT clear                                               /* 15556 */
if (!pgbuf_is_bcb_victimizable (bcb, true)): assert(false); UNLOCK; NULL /* 15558 */
zone별로 LRU에서 제거 + AOUT 리스트에 VPID 추가                    /* 15564-15583 */
return bcb     /* zone == VOID, BCB mutex 보유 */
```

**`VICTIM_DIRECT` ↔ `INVALIDATE_DIRECT_VICTIM` 프로토콜**이 fix 경로와 직결된다. victim으로 배정된 BCB를 누가 fix하면 (2336-2340, 또는 `pgbuf_simple_fix`의 2706-2711), `VICTIM_DIRECT`를 지우고 `INVALIDATE_DIRECT_VICTIM`을 세운다. 잠에서 깬 대기 스레드는 이 플래그를 보고 "내 victim이 회수됐다"를 알아채고 `goto retry`로 다시 줄을 선다 (8270-8271). `page_buffer.c:275-282` 주석이 이 윈도우를 설명한다.

### 2.6 `pgbuf_claim_bcb_for_fix` (8350-8582) — 미스 처리 통합

```
/* 진입: hash_mutex 보유 (already_locked=false인 경우) */
assert (fetch_mode != OLD_PAGE_IF_IN_BUFFER)                      /* 8366 */
if (er_errid () == ER_CSS_PTHREAD_MUTEX_TRYLOCK):                 /* 8369 */
    UNLOCK hash_mutex;  return NULL       /* search_hash_chain의 치명적 trylock 실패 전파 */

if (!already_locked && pgbuf_lock_page(...) != PGBUF_LOCK_HOLDER): /* 8377 */
    perf.perf_page_found = NEW_LOCK_WAIT / OLD_LOCK_WAIT
    *try_again = true;  return NULL       /* -> 호출자가 goto try_again */
/* 이 시점: 뮤텍스 0개. VPID I/O 락만 보유 */

bufptr = pgbuf_allocate_bcb (thread_p, vpid)                      /* 8411 */
if bufptr == NULL: pgbuf_unlock_page (..., true);  return NULL     /* 8412-8418 */
/* 이 시점: BCB mutex 보유 */

/* BCB 초기화 — 여기서 atomic_latch 를 통째로 store (CAS 아님!) */
bufptr->vpid = *vpid                                              /* 8423 */
impl = get_impl (&bufptr->atomic_latch)
impl.latch_mode = PGBUF_NO_LATCH;  impl.waiter_exists = false;  impl.fcnt = 0
bufptr->atomic_latch.store (impl.raw)                             /* 8425-8429 */
pgbuf_bcb_update_flags (bufptr, 0, PGBUF_BCB_ASYNC_FLUSH_REQ)     /* 8430 */
pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc (bufptr, ...)     /* 8431 */
LSA_SET_NULL (&bufptr->oldest_unflush_lsa)                        /* 8432 */

if (fetch_mode != NEW_PAGE):        /* === 디스크 읽기 === */      /* 8434 */
    PSTAT_PB_NUM_IOREADS++;  show_status->num_pages_read++
    if (dwb_read_page (vpid, &iopage, &success) != NO_ERROR):      /* 8449 */
        assert(false); return NULL       /* 주의: BCB mutex 누수 (12절) */
    elif (success):  /* DWB에서 복사됨 */
    elif (fileio_read (...) == NULL):                              /* 8457 */
        pgbuf_put_bcb_into_invalid_list (bufptr)   /* BCB mutex 해제됨 */ /* 8462 */
        pgbuf_unlock_page (..., true);  return NULL
    tde_algo = pgbuf_get_tde_algorithm (pgptr)                     /* 8479 */
    if (tde_algo != TDE_ALGORITHM_NONE):
        tde_decrypt_data_page(...) 실패 시 invalid list + unlock_page + NULL /* 8481-8506 */
    if (temporary volume && !is_temp_lsa):
        pgbuf_init_temp_page_lsa; pgbuf_set_dirty_buffer_ptr       /* 8515-8523 */
else:                              /* === NEW_PAGE: 읽지 않음 === */ /* 8545 */
    temporary ? pgbuf_init_temp_page_lsa : fileio_init_lsa_of_page  /* 8552-8559 */
    perm volume 이면 prv.pageid = -1, prv.volid = -1                /* 8562-8566 */
    show_status->num_pages_created++;  show_status->num_hit++       /* 8574-8575 */
return bufptr    /* BCB mutex 보유 */
```

**디스크 I/O가 BCB mutex를 들고 수행된다.** 이것이 허용되는 이유: 이 BCB는 방금 victim으로 확보돼 해시 체인에 아직 없고 (삽입은 (G)단계), 같은 VPID를 원하는 다른 스레드는 VPID I/O 락에 걸려 `pgbuf_sleep`으로 자고 있다. 즉 이 BCB mutex에는 사실상 경합자가 없다.

`already_locked` 파라미터는 `pgbuf_simple_fix`(2673-2678)만 `true`로 넘긴다. 그쪽은 `pgbuf_lock_page`를 직접 호출해 `PGBUF_LOCK_WAITER`면 자체 `goto retry`를 하기 때문이다.

### 2.7 `pgbuf_delete_from_hash_chain` (7834-7924)

fix가 아니라 victim화 경로(`pgbuf_victimize_bcb` → 7929 부근에서 호출)에서 쓰이지만, **뮤텍스 순서가 fix 경로와 반대**라서 3절에 필수다.

```
/* 진입: BCB mutex 보유 (7841 주석) */
hash_anchor = &buf_hash_table[PGBUF_HASH_VALUE (&bufptr->vpid)]   /* 7853 */
LOCK hash_anchor->hash_mutex          /* BCB mutex 보유 상태에서 블로킹 획득! */ /* 7854 */
if (pgbuf_bcb_is_flushing (bufptr)):
    assert(false); UNLOCK hash_mutex; set_latch(NO_LATCH); BCB UNLOCK; ER_FAILED  /* 7866-7873 */
체인에서 bufptr 탐색 -> 없으면 assert(false) + invalid list 반납   /* 7877-7898 */
체인에서 분리; curr->hash_next = NULL                             /* 7901-7910 */
UNLOCK hash_mutex                                                 /* 7911 */
VPID_SET_NULL (&bufptr->vpid)                                     /* 7912 */
pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc (bufptr, ...)     /* 7913 */
```

---

## 3. 뮤텍스 순서 규칙 (락 랭킹)

fix/unfix 경로에 등장하는 뮤텍스는 4종이다.

| 뮤텍스 | 보호 대상 | 정의 |
|---|---|---|
| `hash_anchor->hash_mutex` | 해시 체인 + buffer lock 체인 | 586 |
| `bcb->mutex` | BCB 필드 (`atomic_latch` 복합 전이, `next_wait_thrd`, `vpid`, iopage) | 519 |
| `buf_invalid_list.invalid_mutex` | invalid BCB 리스트 | `pgbuf_invalid_list` 구조체 |
| `pgbuf_Pool.free_holder_set_mutex` | 전역 holder set 배열 | 5993 |

**핵심 규칙 — 블로킹 획득 순서는 `bcb->mutex` → `hash_mutex` 방향만 허용한다.**

- `pgbuf_delete_from_hash_chain`(7854): BCB mutex 보유 상태에서 `hash_mutex`를 **블로킹** 획득한다.
- 반대 방향(`hash_mutex` 보유 상태에서 BCB mutex 획득)은 **`TRYLOCK`으로만** 허용된다. `pgbuf_search_hash_chain`은 `EBUSY`를 받으면 반드시 `hash_mutex`를 먼저 해제하고(7646) 그 다음에 블로킹 락을 잡는다.

이 규칙을 깨면 `search_hash_chain`(hash→bcb)과 `delete_from_hash_chain`(bcb→hash)이 즉시 데드락한다. **재구현 시 이 한 줄이 가장 중요하다.**

파생 규칙들:

1. **BCB mutex를 들고 `pgbuf_lock_page`를 부르지 않는다.** `pgbuf_lock_page`는 `hash_mutex`를 들고 진입해 `pgbuf_sleep`으로 무한 대기할 수 있다. BCB mutex를 든 채 잠들면 그 BCB에 대한 모든 접근이 정지한다. 실제 코드에서 `pgbuf_lock_page` 호출 시점(8377, 2673)은 항상 BCB mutex 미보유 상태다.
2. **`invalid_mutex`는 BCB mutex 하위**다. `pgbuf_put_bcb_into_invalid_list`(8909-8931)는 BCB mutex 보유 상태로 진입해 `invalid_mutex`를 잡고, **BCB mutex를 먼저 해제한 뒤**(8927) `invalid_mutex`를 해제한다(8928). `pgbuf_get_bcb_from_invalid_list`(8860-8898)는 `invalid_mutex`를 해제한 뒤(8888)에 BCB mutex를 잡는다(8890) — 즉 두 뮤텍스를 겹쳐 잡지 않는다.
3. **`pgbuf_latch_bcb_upon_fix`는 어떤 경로로든 BCB mutex를 해제하고 반환한다.** 이를 `scope_exit unlock_BCB` (6259-6263)로 보장하고, 명시적으로 해제한 경로에서는 `unlock_BCB.release()`를 호출해 이중 해제를 막는다 (6411, 6448, 6528, 6540, 6549). C++ RAII를 엔진 C 코드에서 쓴 드문 예이며 `/* *INDENT-OFF* */`로 감싸져 있다.
4. **holder 조작은 BCB mutex 밖에서 한다.** `pgbuf_allocate_thrd_holder_entry` 호출은 전부 `PGBUF_BCB_UNLOCK` 이후다 (6410-6416, 6447-6467, 6557-6558). holder 리스트는 스레드 로컬이라 BCB mutex가 보호할 대상이 아니고, 전역 `free_holder_set_mutex`를 BCB mutex 안에서 잡으면 랭킹이 하나 더 생긴다.

---

## 4. 래치 시스템

### 4.1 래치 호환성

| 보유 래치 \ 요청 | READ | WRITE |
|---|---|---|
| `PGBUF_NO_LATCH` (fcnt=0) | 즉시 허용 | 즉시 허용 |
| `PGBUF_LATCH_READ`, 대기자 없음 | **즉시 허용** (fcnt++) | 조건부: 내 fix_count == 전체 fcnt 이면 in-place 승격, 아니면 블록 |
| `PGBUF_LATCH_READ`, 대기자 있음 | 내가 holder면 허용, 아니면 **블록** | 위와 동일 판정 후 블록 |
| `PGBUF_LATCH_WRITE`, 내가 holder | 허용 (fcnt++, 모드 유지 = WRITE) | 허용 (fcnt++) |
| `PGBUF_LATCH_WRITE`, 남이 holder | 블록 | 블록 |

`PGBUF_LATCH_FLUSH`는 **블록 모드로만** 존재한다. `page_buffer.h:194` 주석: "this is only used as block mode. page can never be fixed with flush latch mode." 즉 `atomic_latch.latch_mode`가 FLUSH가 되는 일은 없고, 대기 큐 엔트리의 `request_latch_mode`만 FLUSH일 수 있다. `pgbuf_unlatch_bcb_upon_unfix`의 `assert (get_latch (...) != PGBUF_LATCH_FLUSH)` (6808)가 이를 검증한다.

**"대기자 있으면 READ도 블록"이 writer 기아 방지의 핵심이다** (6335-6344). WRITE 대기자가 큐에 있는데 신규 READ를 계속 허용하면 writer가 영구 대기한다. 단, **이미 holder인 스레드는 예외적으로 허용**한다(6345-6351) — 그러지 않으면 자기 자신과 데드락한다 (8절).

### 4.2 `pgbuf_latch_bcb_upon_fix` CAS 결정 표

CAS 루프(6287-6403)는 매 반복마다 `promote_needed / is_page_idle / can_latch / request_fcnt`를 리셋하고 처음부터 판정한다. `compare_exchange_strong` 실패 시 재판정하므로 판정 자체가 idempotent해야 한다.

| # | 진입 조건 | 결정 플래그 | `new_impl` 전이 | 라인 |
|---|---|---|---|---|
| 0 | `buf_lock_acquired \|\| latch_mode == NO_LATCH` | `is_page_idle` | `old`를 `{NO_LATCH, false, 0}`으로 **강제 지정**, `new = {request_mode, false, 1}` | 6295-6319 |
| 1 | `request == READ && latch == READ && !waiter_exists` | `can_latch` | `fcnt++` | 6330-6334 |
| 2 | `request == READ && latch == READ && waiter_exists && holder != NULL` | `can_latch` | `fcnt++` | 6345-6351 |
| 3 | `request == READ && latch == READ && waiter_exists && holder == NULL` | 블록 | `waiter_exists` 이미 true | 6337-6344 |
| 4 | `holder != NULL && latch == WRITE` | `can_latch` | `fcnt++` (모드 불변) | 6357-6362 |
| 5 | `holder != NULL && latch == READ && fcnt == holder->fix_count` | `can_latch` | `{WRITE, ·, 1}` — **in-place 승격** | 6363-6372 |
| 6 | `holder != NULL && latch == READ && fcnt > holder->fix_count && COND` | 블록(실패) | `waiter_exists = true` | 6376-6382 |
| 7 | `holder != NULL && latch == READ && fcnt > holder->fix_count && UNCOND` | `promote_needed` | `fcnt -= holder->fix_count`, `waiter_exists = true` | 6383-6390 |
| 8 | `holder == NULL` (그 외 전부) | 블록 | `waiter_exists = true` | 6392-6397 |

#0의 `is_page_idle` 처리(6312-6319)가 특이하다. CAS의 **expected 값을 관측값이 아니라 `{NO_LATCH, false, 0}`으로 덮어쓴다**:

```c
if (is_page_idle == true)
  {
    old_impl.impl.waiter_exists = false;
    old_impl.impl.latch_mode = PGBUF_NO_LATCH;
    old_impl.impl.fcnt = 0;
    new_impl = old_impl;
    new_impl.impl.latch_mode = request_mode;
    new_impl.impl.fcnt = 1;
  }
```

즉 "래치 워드가 정확히 idle 상태여야만 성공"을 요구한다. 이 강제 지정 때문에 **idle BCB에 `waiter_exists`가 잘못 남아 있으면 CAS가 영원히 실패하며 BCB mutex를 든 채로 무한 스핀한다.** 그래서 함수 진입부(6272-6284)에 방어 코드가 있다:

```c
PGBUF_ATOMIC_LATCH_IMPL impl_snapshot = get_impl (&bufptr->atomic_latch);
if (impl_snapshot.impl.latch_mode == PGBUF_NO_LATCH && impl_snapshot.impl.waiter_exists
    && bufptr->next_wait_thrd == NULL)
  {
    assert (false);   /* diag 빌드에서 최초 발생 시점을 잡는다 */
    er_log_debug (... "healed stranded waiter_exists on idle bcb %d|%d" ...);
    set_waiter_exists (&bufptr->atomic_latch, false);
  }
```

6270-6275 주석이 "fail-closed safety net"이라 명시한다. BCB mutex를 보유한 상태이고 모든 `waiter_exists` 전이가 BCB mutex로 보호되므로 이 검사는 race-free다. 실제 재발 방지 코드는 `pgbuf_wake_flush_waiters`(10948-10956)와 `pgbuf_block_bcb`(7077-7081)의 `waiter_exists` 정합화이며, 10943-10947 주석에 이 누수가 **bulk-build CREATE INDEX livelock**을 일으켰던 사례가 기록돼 있다.

### 4.3 대기 큐와 기상 메커니즘

큐는 `bcb->next_wait_thrd`를 head로 하는 `THREAD_ENTRY::next_wait_thrd` 단일 연결 리스트다. 각 엔트리는 두 필드로 자기 요청을 표현한다:

- `thread_p->request_latch_mode`: READ / WRITE / FLUSH, 그리고 **`PGBUF_NO_LATCH` = "타임아웃/인터럽트로 포기함"**
- `thread_p->request_fix_count`: 깨어날 때 반영할 fcnt 증가분 (promote 시 이전 fix_count를 되찾기 위해 필요, 7017 `SPECIAL_NOTE`)

#### `pgbuf_block_bcb` (6997-7113) — 큐 삽입 후 블록

```
/* 진입: BCB mutex 보유. assert (get_waiter_exists (&atomic_latch) == true)  [7003] */
cur->request_latch_mode = request_mode                            /* 7016 */
cur->request_fix_count  = request_fcnt                            /* 7017 */

if (as_promote):                    /* promoter는 큐 head */       /* 7019 */
    assert (next_wait_thrd == NULL || !next_wait_thrd->wait_for_latch_promote)  /* 7024 */
    cur->next_wait_thrd = bufptr->next_wait_thrd
    bufptr->next_wait_thrd = cur                                  /* 7027 */
else:                               /* 나머지는 tail append (FIFO) */
    큐 끝까지 순회해 append                                        /* 7032-7046 */

if (request_mode == PGBUF_LATCH_FLUSH):                           /* 7048 */
    thread_lock_entry (cur)                                       /* 7051 */
    PGBUF_BCB_UNLOCK (bufptr)                                     /* 7052 */
    thread_suspend_wakeup_and_unlock_entry (cur, THREAD_PGBUF_SUSPENDED)  /* 무한 대기 */
    if (resume_status != THREAD_PGBUF_RESUMED):    /* 인터럽트 */
        PGBUF_BCB_LOCK; 큐에서 자기 제거;
        if (!pgbuf_is_exist_blocked_reader_writer (bufptr)):
            set_waiter_exists (false)          /* 7077-7081 정합화 */
        PGBUF_BCB_UNLOCK;  return ER_FAILED
else:
    if (pgbuf_timed_sleep (cur, bufptr) != NO_ERROR): return ER_FAILED  /* 7104 */
    assert (0 < get_fcnt (&bufptr->atomic_latch))                 /* 7109 */
bufptr->latch_last_thread = thread_p                              /* 7112 */
```

READ/WRITE는 **timed sleep**, FLUSH는 **무한 sleep**이다. 7092-7099 주석이 이유를 밝힌다: *"We do not guarantee that there is no deadlock between page latches."* 즉 CUBRID는 페이지 래치에 대해 데드락 탐지를 하지 않고, **타임아웃을 데드락 해소 수단으로 사용**한다.

#### `pgbuf_timed_sleep` (7234-7398)

```
thread_lock_entry (thread_p)                                      /* 7249 */
PGBUF_BCB_UNLOCK (bufptr)                                         /* 7250  <-- 순서 중요 */
old_wait_msecs = wait_msecs = pgbuf_find_current_wait_msecs (thread_p)   /* 7252 */
wait_msecs = (ZERO_WAIT류) ? 0 : pgbuf_latch_timeout_msecs        /* 7257-7264 */
                                  /* 기본 300,000 ms = 300초, page_buffer.c:107
                                     PRM_ID_PAGE_LATCH_TIMEOUT_IN_MSECS 로 조정, 1675 */
try_again:                                                        /* 7266 */
    pgbuf_make_latch_timeout (&to, wait_msecs)
    TT_WORKER 면 logtb_set_check_interrupt (true) 임시 설정         /* 7269-7272 */
    thread_p->resume_status = THREAD_PGBUF_SUSPENDED
    r = thread_suspend_timeout_wakeup_and_unlock_entry (&to, THREAD_PGBUF_SUSPENDED)  /* 7275 */

    r == NO_ERROR (누가 깨웠다):                                   /* 7282 */
        thread_lock_entry
        resume_status == THREAD_PGBUF_RESUMED -> unlock; return NO_ERROR  /* 7286-7290 */
        /* 인터럽트 */
        request_latch_mode = PGBUF_NO_LATCH;  thread_unlock_entry  /* 7293-7294 */
        pgbuf_timed_sleep_error_handling(...)  == NO_ERROR 이면 PGBUF_BCB_UNLOCK  /* 7296-7299 */
        ER_INTERRUPTED;  return ER_FAILED
    r == ER_CSS_PTHREAD_COND_TIMEDOUT:                            /* 7303 */
        resume_status == THREAD_PGBUF_RESUMED -> unlock; NO_ERROR   /* 경합 승리 */
        !logtb_is_current_active (thread_p) -> goto try_again       /* 7312-7315: 롤백 중이면 계속 대기 */
        save_request_latch_mode = request_latch_mode
        request_latch_mode = PGBUF_NO_LATCH   /* <-- mutex 해제 전에 반드시 */ /* 7322-7323 */
        thread_unlock_entry
        pgbuf_timed_sleep_error_handling(...) == NO_ERROR -> goto er_set_return
        return ER_FAILED
    그 외: ER_CSS_PTHREAD_COND_TIMEDWAIT;  return ER_FAILED         /* 7333-7338 */

er_set_return:                                                    /* 7341 */
    old_wait_msecs == LK_INFINITE_WAIT:
        ER_PAGE_LATCH_TIMEDOUT;  assert (0)  /* 7350: "FIXME: 디버깅용 임시" */
        PGBUF_BCB_UNLOCK
        활성 트랜잭션이면 ER_LK_UNILATERALLY_ABORTED (강제 abort)   /* 7364-7365 */
    old_wait_msecs > 0:
        ER_PAGE_LATCH_TIMEDOUT;  PGBUF_BCB_UNLOCK;  ER_LK_PAGE_TIMEOUT  /* 7380-7391 */
    else: PGBUF_BCB_UNLOCK
    return ER_FAILED
```

7318-7321 주석의 "following order of execution is important"가 이 함수의 핵심 race 방어다. `request_latch_mode = PGBUF_NO_LATCH`를 **`thread_unlock_entry` 전에** 세팅해야, 동시에 `pgbuf_wakeup_reader_writer`가 이 엔트리를 보고 "포기한 스레드"로 판정해 그냥 큐에서 제거한다 (7436-7448, 7467-7482). 순서가 뒤바뀌면 이미 포기한 스레드에 래치를 부여하고 fcnt를 올려 **영구 누수**가 발생한다.

`LK_INFINITE_WAIT` 분기에 `assert (0)`(7350)이 살아 있다. 즉 **무한 대기 트랜잭션이 페이지 래치 타임아웃에 걸리는 것은 디버그 빌드에서 크래시로 취급**된다 — 정상 상황에서 발생하지 않아야 한다는 의도다.

#### `pgbuf_timed_sleep_error_handling` (7145-7223)

타임아웃/인터럽트로 포기한 스레드가 자기 자신을 큐에서 빼는 함수다. **반환 시 BCB mutex를 계속 보유한다** (호출자가 해제) — 단 case 1/2는 예외 없이 보유 상태로 `return NO_ERROR`한다.

```
PGBUF_BCB_LOCK (bufptr)                                           /* 7155 */
case 1: next_wait_thrd == NULL -> 이미 누가 뺐다. return NO_ERROR  /* 7158-7163 */
case 2: 첫 대기자 != 나 -> 링크 순회해서 자기 제거. return NO_ERROR /* 7166-7180 */
case 3: 첫 대기자 == 나:                                          /* 7183 */
    bufptr->next_wait_thrd = 내 next;  내 next = NULL
    /* 내가 head였으므로, 내 뒤의 READ 대기자들을 대신 깨워준다 */
    while (bufptr->next_wait_thrd != NULL):
        curr = bufptr->next_wait_thrd
        do {                                                      /* 7189 */
            can_grant = false
            impl = get_impl (&atomic_latch)
            if (impl.latch_mode == READ && curr->request_latch_mode == READ):
                can_grant = true;  impl_new.fcnt += curr->request_fix_count
        } while (!compare_exchange_weak (...))                    /* 7198 */
        if (can_grant && curr->request_latch_mode == READ):
            thread_lock_entry (curr)
            큐에서 curr 제거;  pgbuf_wakeup (curr)                /* 7208-7211 */
        else: thread_unlock_entry (curr); break
```

case 3의 연쇄 기상이 없으면 **head가 포기했을 때 그 뒤의 READ 대기자들이 아무도 깨우지 않아 영구 대기**한다. 정상 unfix 경로(`pgbuf_wakeup_reader_writer`)는 fcnt가 0이 될 때만 호출되므로, "이미 READ 래치가 걸린 상태에서 head 대기자만 사라진" 상황을 커버하지 못한다.

한 가지 주의: 7189-7198의 CAS 루프에서 `can_grant`가 false인 경우 `impl_new == impl`이므로 CAS가 즉시 성공한다(no-op write). 무한 루프가 되지 않는 이유다.

#### `pgbuf_wakeup_reader_writer` (7405-7534)

`pgbuf_unlatch_bcb_upon_unfix`에서 fcnt가 0이 됐을 때만 호출된다 (6805). 진입 시 `assert (latch_mode == NO_LATCH && fcnt == 0)` (7415).

7420-7428 주석이 4종 대기자 처리를 정리한다:

| 대기자 `request_latch_mode` | 처리 | 라인 |
|---|---|---|
| `PGBUF_NO_LATCH` | 포기한 스레드. 큐에서 제거만, 기상 안 함 | 7436-7448 |
| `PGBUF_LATCH_FLUSH` | 래치가 아님. 큐에 남기고 통과. `assert(async_flush_request \|\| is_flushing)` | 7450-7457 |
| `PGBUF_LATCH_READ` | 큐 head 연속 구간의 READ 전부 동시 기상 | 7459-7534 |
| `PGBUF_LATCH_WRITE` | 첫 대기자 하나만 기상, 이후 `should_stop`으로 루프 종료 | 7492-7497 |

```
for (thrd = bufptr->next_wait_thrd; thrd; thrd = next_thrd):
    next_thrd = thrd->next_wait_thrd
    (NO_LATCH / FLUSH 처리 — 위 표)
    do {                                                          /* 7459 */
        can_grant = false;  impl = get_impl (&atomic_latch);  impl_new = impl
        if (impl.latch_mode == NO_LATCH
            || (impl.latch_mode == READ && thrd->request_latch_mode == READ)):
            thread_lock_entry (thrd)             /* CAS 루프 안에서 락! */  /* 7467 */
            if (thrd->request_latch_mode == PGBUF_NO_LATCH):
                /* 락 잡는 사이 포기했다 */
                can_grant = false; 큐에서 제거; thread_unlock_entry; break  /* 7468-7482 */
            can_grant = true
            impl_new.fcnt += thrd->request_fix_count                /* 7484 */
            impl_new.latch_mode = (PGBUF_LATCH_MODE)(uint16_t) thrd->request_latch_mode /* 7485 */
        elif (impl.latch_mode == READ):   /* 요청은 WRITE */
            prev_thrd = thrd; break       /* 다음 READ 대기자 찾기 */    /* 7488-7491 */
        else:  /* impl.latch_mode == WRITE */
            should_stop = true; break                              /* 7493-7497 */
    } while (!compare_exchange_strong (...))                       /* 7500 */
    if (should_stop) break
    if (can_grant):
        큐에서 thrd 제거;  pgbuf_wakeup (thrd)                     /* 7507-7526 */

if (!pgbuf_is_exist_blocked_reader_writer (bufptr)):
    set_waiter_exists (&atomic_latch, false)                       /* 7529-7532 */
```

**중요: 깨우는 쪽이 fcnt와 latch_mode를 미리 올려준다** (7484-7485). 깨어난 스레드는 `pgbuf_block_bcb` → `pgbuf_latch_bcb_upon_fix`(6553-6583)로 복귀해 **holder 엔트리만 새로 만들고 원자 래치는 건드리지 않는다.** 7505 주석 "do not handle BCB holder entry, at here. refer pgbuf_latch_bcb_upon_fix()"가 이 분업을 명시한다. 이 규약이 깨지면 fcnt가 이중 증가한다.

`thread_lock_entry`를 CAS 루프 **안에서** 잡는 것(7467)은 위험해 보이지만 필요하다: `request_latch_mode`가 `NO_LATCH`로 바뀌는지 확인하는 것과 fcnt를 올리는 것이 원자적으로 묶여야 한다. CAS 실패 시 재시도하면서 `thread_lock_entry`가 중복 호출될 수 있는데, `can_grant` 경로에서는 CAS 성공 후 `pgbuf_wakeup`(7526)이 내부에서 `thread_unlock_entry`를 호출하므로(11566) 균형이 맞다.

마지막 `set_waiter_exists(false)` (7529-7532)를 빠뜨리면 4.2절의 idle-grant CAS 무한 스핀으로 직결된다.

#### 기상 primitive (11534-11592)

| 함수 | 라인 | 동작 |
|---|---|---|
| `pgbuf_sleep` | 11535-11543 | `thread_lock_entry` → 인자 mutex unlock → 무한 suspend. buffer lock 대기용 |
| `pgbuf_wakeup` | 11545-11570 | `request_latch_mode != NO_LATCH`일 때만 `resume_status = THREAD_PGBUF_RESUMED` + `cond_signal`. 포기한 스레드면 debug log만. 끝에 `thread_unlock_entry` |
| `pgbuf_wakeup_uncond` | 11572-11591 | `thread_lock_entry` → 무조건 RESUMED + signal → unlock. buffer lock 해제용 |

`pgbuf_wakeup`은 **호출자가 `thread_lock_entry`를 이미 잡았다고 가정**하고 자기가 해제한다. `pgbuf_wakeup_uncond`는 자기가 잡고 자기가 해제한다. 이 비대칭이 호출 지점(7211, 7526 vs 8117, 10943)을 결정한다.

---

## 5. unfix 경로

### 5.1 `pgbuf_unfix` (3021-3226)

```
CAST_PGPTR_TO_BFPTR (bufptr, pgptr)                               /* 3043 */
assert (!VPID_ISNULL (&bufptr->vpid))                             /* 3044 */
(디버그) pgbuf_get_holder != NULL, watcher magic 검증              /* 3057-3066 */
(릴리스) pgptr == NULL 이면 그냥 return                            /* 3067-3072 */
is_perf_tracking ? perf_page_type = ...                            /* 3112-3116 */
INIT_HOLDER_STAT (&holder_perf_stat)                              /* 3117 */
holder_status = pgbuf_unlatch_thrd_holder (bufptr, &holder_perf_stat)  /* 3118 */
   |  [6085-6135]:
   |    holder = pgbuf_find_thrd_holder (bufptr)
   |    holder == NULL -> assert(false), ER_PB_UNFIXED_PAGEPTR
   |    *holder_perf_stat_p = holder->perf_stat
   |    holder->fix_count--
   |    if (holder->fix_count == 0): pgbuf_remove_thrd_holder (holder)
assert (hold_has_write_latch == 1 || hold_has_read_latch == 1)     /* 3120 */
perf 집계 (perfmon_pbx_unfix)                                      /* 3122-3139 */

if (pgbuf_lockfree_unfix_ro (thread_p, bufptr)):  return           /* 3141-3144 */

PGBUF_BCB_LOCK (bufptr)                                           /* 3146 */
(디버그) pgbuf_tracker.decrement (pgptr)                           /* 3148-3150 */
pgbuf_unlatch_bcb_upon_unfix (bufptr, holder_status)  /* BCB mutex 해제됨 */ /* 3151 */
```

**순서가 중요하다: holder 정리(3118)가 lockfree 시도(3141)보다 먼저다.** 즉 스레드 로컬 회계는 어느 경로를 타든 이미 끝나 있고, 이후는 BCB 측 원자 래치 갱신만 남는다. 이 덕분에 `pgbuf_lockfree_unfix_ro`는 holder를 전혀 몰라도 된다.

### 5.2 `pgbuf_lockfree_unfix_ro` (7753-7776)

```
do {
    impl = get_impl (&bufptr->atomic_latch)                        /* 7759 */
    if (impl.latch_mode != PGBUF_LATCH_READ || impl.waiter_exists || impl.fcnt == 1)
        return false                     /* 슬로우 경로로 폴백 */  /* 7761-7764 */
    new_impl = impl;  new_impl.fcnt--
} while (!compare_exchange_weak (impl.raw, new_impl.raw, acq_rel, acquire))  /* 7768 */
(디버그) pgbuf_tracker.decrement (pgptr)                           /* 7770-7774 */
return true
```

거부 조건 3가지:
- `latch_mode != READ`: WRITE 래치는 fcnt가 0이 되면 반드시 모드 리셋 + 기상이 필요.
- `waiter_exists`: 대기자가 있으면 기상 판정을 해야 하므로 BCB mutex 필요.
- **`fcnt == 1`**: 내가 마지막 holder면 fcnt가 0이 되고, 그때는 `latch_mode = NO_LATCH` 설정 + LRU zone 이동/boost + 대기자 기상 + async flush 처리가 전부 필요하다. 이 무거운 작업 전부가 BCB mutex를 요구한다.

즉 **"READ 래치를 여러 스레드가 공유 중이고 대기자가 없는 상태에서의 중간 unfix"만 lock-free로 처리한다.** 이것이 read-heavy 워크로드의 지배적 케이스다.

### 5.3 `pgbuf_unlatch_bcb_upon_unfix` (6607-6835)

```
/* 진입: BCB mutex 보유 */
assert (holder_status == NO_ERROR)                                /* 6617 */
assert (!VPID_ISNULL (&bufptr->vpid))                             /* 6620 */
assert (pgbuf_check_bcb_page_vpid (bufptr, false) == true)         /* 6621 */

do {                                                              /* 6627 */
    blocked_reader_writer = false;  is_zero_fcnt = false
    impl_orig = get_impl (&atomic_latch);  impl_new = impl_orig
    impl_new.fcnt--                                               /* 6633 */
    blocked_reader_writer = impl_orig.waiter_exists                /* 6634 */
    if (impl_new.fcnt == 0):
        is_zero_fcnt = true;  impl_new.latch_mode = PGBUF_NO_LATCH /* 6635-6639 */
    if (impl_new.fcnt < 0):        /* 발생해서는 안 됨 */
        assert (false);  ER_PB_UNFIXED_PAGEPTR
        impl_new = {NO_LATCH, false, 0};  is_zero_fcnt = true;  break  /* 6640-6650 */
} while (!compare_exchange_weak (...))                            /* 6653 */

if (is_zero_fcnt):                                                /* 6664 */
    assert (LSA_ISNULL (&oldest_unflush_lsa) || pgbuf_bcb_is_dirty (bufptr))  /* 6667 */
    if (pgbuf_bcb_should_be_moved_to_bottom_lru (bufptr)):        /* 6672 */
        pgbuf_move_bcb_to_bottom_lru (bufptr)         /* 방금 dealloc된 페이지 */
    elif (blocked_reader_writer == false):                        /* 6676 */
        thread_p->pgbuf_pg_unfix_cnt++                            /* 6680-6683 */
        th_lru_idx = 스레드 private LRU 인덱스 또는 -1             /* 6684-6691 */
        switch (pgbuf_bcb_get_zone (bufptr))       /* 아래 표 */    /* 6694-6803 */
    /* SERVER_MODE */
    pgbuf_wakeup_reader_writer (thread_p, bufptr)                 /* 6805 */

assert (get_latch (&atomic_latch) != PGBUF_LATCH_FLUSH)           /* 6808 */
if (pgbuf_bcb_is_async_flush_request (bufptr)):                   /* 6811 */
    error_code = pgbuf_bcb_safe_flush_force_unlock (bufptr, false) /* BCB mutex 해제 */ /* 6822 */
    실패해도 er_clear() 하고 NO_ERROR                              /* 6824-6828 */
else:
    PGBUF_BCB_UNLOCK (bufptr)                                     /* 6830 */
return NO_ERROR
```

**LRU 이동/boost 결정 지점** (상세 LRU 로직은 다른 담당 영역이므로 결정 조건만 정리):

| 사전 조건 | zone | 동작 | 라인 |
|---|---|---|---|
| `should_be_moved_to_bottom_lru` | — | `pgbuf_move_bcb_to_bottom_lru` (dealloc된 페이지, 우선 처리) | 6672-6675 |
| `blocked_reader_writer == true` | — | **아무것도 안 함**. 곧 다른 스레드가 fix할 것이므로 LRU 조작이 무의미 | 6676 |
| — | `VOID` | `pgbuf_unlatch_void_zone_bcb` (AOUT 조회 → private top / private mid / shared mid) | 6696-6701 |
| `SHOULD_IGNORE_UNFIX` | `LRU_1` | 아무것도 안 함 (`PSTAT_PB_UNFIX_LRU_ONE_KEEP_VAC`) | 6705-6711 |
| `should_move_private_to_shared` | `LRU_1` | `pgbuf_lru_move_from_private_to_shared` | 6712-6717 |
| 그 외 | `LRU_1` | 이동/boost 없음. `pgbuf_bcb_register_hit_for_lru`만 | 6719-6729 |
| `SHOULD_IGNORE_UNFIX` | `LRU_2` | 아무것도 안 함 | 6734-6740 |
| `should_move_private_to_shared` | `LRU_2` | private → shared | 6741-6746 |
| `IS_BCB_OLD_ENOUGH` | `LRU_2` | **`pgbuf_lru_boost_bcb`** | 6747-6751 |
| 나이 부족 | `LRU_2` | keep + `register_hit_for_lru` | 6752-6765 |
| `SHOULD_IGNORE_UNFIX` | `LRU_3` | `!avoid_victim`이면 `pgbuf_assign_direct_victim` 시도 | 6769-6784 |
| `should_move_private_to_shared` | `LRU_3` | private → shared | 6785-6790 |
| 그 외 | `LRU_3` | **무조건 boost** + `register_hit_for_lru` | 6792-6794 |

`PGBUF_SHOULD_IGNORE_UNFIX(th, buf)` = `VACUUM_IS_THREAD_VACUUM_WORKER(th) || pgbuf_is_temporary_volume(buf->vpid.volid)` (289-294). vacuum 워커와 임시 볼륨 페이지는 hot 판정에 기여하지 않는다.

핵심 원칙: **`LRU_1`에서는 boost하지 않는다** (6669-6671 주석: "When the page buffer in LRU_1_Zone, do not move the page buffer into the top of LRU. This is an intention for performance"). 이미 가장 뜨거운 zone이므로 리스트 뮤텍스를 잡을 가치가 없다. `LRU_2`는 나이 조건부, `LRU_3`은 무조건 boost.

### 5.4 `pgbuf_unfix_all` (3238-3300)

요청 종료 시 남은 fix를 회수한다. 그런데 루프 첫 줄이 `assert (false)` (3260)다 — **정상 동작에서는 남은 fix가 없어야 한다**는 뜻이고, 3229-3236 주석이 "In current CUBRID system, however, above situation has occurred"라고 인정한다. 릴리스 빌드는 `pgbuf_unfix_and_init`으로 실제 회수하고(3265), 디버그 빌드는 회수하지 않고 상세 진단 로그만 남기고 다음 holder로 넘어간다(3271-3295).

---

## 6. lock-free RO 최적화의 안전성 근거

`pgbuf_lockfree_fix_ro`(7671-7734) / `pgbuf_lockfree_unfix_ro`(7753-7776)는 **뮤텍스를 단 하나도 잡지 않는다.** 정당성을 항목별로 정리한다.

### 6.1 해시 체인 walk가 안전한 이유

`pgbuf_search_hash_chain_no_bcb_lock`(7736-7751)은 `hash_mutex` 없이 `hash_next`를 따라간다.

- **BCB는 절대 free되지 않는다.** `pgbuf_Pool.BCB_table`이라는 프리얼로케이트 배열의 원소이므로 dangling pointer가 없다. 최악의 경우 stale 포인터를 읽지만 유효한 BCB를 가리킨다.
- **동시 삽입** (`pgbuf_insert_into_hash_chain`, 7817-7818): `bufptr->hash_next = hash_anchor->hash_next; hash_anchor->hash_next = bufptr;` — head 삽입이므로 walker는 신규 BCB를 못 보거나(→ 폴백, 무해) 보거나(→ 정상) 둘 중 하나다.
- **동시 삭제** (`pgbuf_delete_from_hash_chain`, 7901-7910): 분리 후 `curr_bufptr->hash_next = NULL` (7910). walker가 삭제 중인 BCB를 지나던 중이면 체인이 조기 종료돼 뒤쪽 BCB를 놓친다 → 못 찾음 → 일반 경로 폴백. **무해하다.**
- 잘못된 BCB를 찾는 false positive는 `VPID_EQ` 비교로 걸러진다. 다만 그 비교 자체가 원자적이지 않으므로 6.2의 CAS가 최종 방어선이다.

### 6.2 원자 래치 CAS가 보장하는 것 — 네 거부 조건

```c
if (impl.impl.latch_mode != PGBUF_LATCH_READ || impl.impl.waiter_exists || impl.impl.fcnt == 0
    || bufptr->vpid.pageid != vpid->pageid || bufptr->vpid.volid != vpid->volid)
  return NULL;                                                  /* 7689-7692 */
```

| 조건 | 막는 것 |
|---|---|
| `latch_mode == PGBUF_LATCH_READ` | WRITE 보유자와의 충돌, `NO_LATCH`/`INVALID` 상태 BCB 접근. **READ 래치가 이미 걸려 있다 = 페이지가 확정적으로 상주하고 내용이 안정적이다.** |
| `!waiter_exists` | writer 기아. 대기자가 있으면 (특히 WRITE 대기자) lock-free 무단 통과가 writer를 영구 대기시킨다. 4.1절 규칙과 일치. |
| `fcnt != 0` | **direct victim / 미상주 BCB.** `pgbuf_assign_direct_victim`은 `assert (!pgbuf_is_bcb_fixed_by_any (bcb, true))` (15461)를 요구하고, `pgbuf_is_bcb_fixed_by_any`(9210-9229)는 `get_fcnt > 0`을 fix로 본다. 따라서 `fcnt > 0`인 BCB는 victim으로 배정될 수 없다. → 일반 경로의 `pgbuf_bcb_is_direct_victim` 명시적 재확인(2336-2340)을 이 조건 하나가 대체한다. |
| `VPID_EQ` | 체인 walk가 잘못 짚은 BCB, 또는 victim화로 다른 페이지를 담게 된 BCB |

그리고 **이 네 조건 중 앞 세 개는 하나의 64비트 워드에 있으므로 CAS가 원자적으로 재검증한다.** 판정 시점의 관측이 CAS 시점까지 유효했음이 보장된다. 이것이 0.1절 팩킹의 존재 이유다.

`fcnt`를 1 늘리는 데 성공한 순간부터, 이 BCB는:
- victim이 될 수 없다 (`pgbuf_is_bcb_victimizable`이 `fixed_by_any`를 확인)
- deallocate될 수 없다 (`pgbuf_dealloc_page`가 `assert (get_fcnt (&bcb->atomic_latch) == 1)`, 15137 — 즉 자기 하나만 fix한 상태를 요구)
- WRITE 래치로 넘어갈 수 없다 (`latch_mode`가 READ이고, 승격은 4.2절 #5/#7 판정을 통과해야 함)

### 6.3 남는 이론적 창 — ABA

`bufptr->vpid` 읽기(7690-7691)는 원자 래치 워드 밖이고 CAS **이전**에 일어난다. 원리적으로 다음 시퀀스가 성립한다:

```
t0: R이 latch = {READ, false, fcnt=1} snapshot   (BCB B는 VPID X 보유)
t1: R이 B->vpid == X 확인
    ...  마지막 holder unfix -> {NO_LATCH, false, 0}
    ...  B victim화 -> vpid = NULL -> VPID Y 배정 -> 디스크 read
    ...  누군가 READ fix -> {READ, false, 1}       <-- raw 값이 t0와 동일
t2: R의 CAS 성공. R은 X를 fix했다고 믿지만 B는 Y를 담고 있다
```

두 인접 명령 사이에 victim화 + 디스크 I/O + 재fix가 완료돼야 하므로 현실적 발생 가능성은 사실상 없다. 다만 코드에 이 창을 닫는 장치(CAS **이후** vpid 재검증 + 불일치 시 fcnt 되돌리기, 또는 세대 카운터)는 없다. 재구현 시 CAS 성공 후 vpid를 한 번 더 확인하고 불일치하면 `fcnt--` 후 폴백하는 편이 안전하다.

### 6.4 lock-free 경로가 건너뛰는 부수 작업

`goto fast_path` (2328)로 (D)~(G)를 전부 뛰므로 다음이 생략된다:

| 생략 항목 | 라인 | 영향 |
|---|---|---|
| `pgbuf_bcb_register_fix` | 2395 | hot 페이지 카운터 미갱신 → `pgbuf_bcb_is_hot` 판정이 lock-free fix를 반영하지 않음. LRU 승급 heuristic이 보수적으로 동작 |
| `pgbuf_set_bcb_page_vpid` / `pgbuf_check_bcb_page_vpid` | 2399, 2402 | 이미 상주·검증된 페이지이므로 무해 |
| direct victim 무효화 | 2336-2340 | 6.2의 `fcnt != 0` 조건이 대체 |
| `pgbuf_bcb_register_avoid_deallocation` | 2425-2428 | **12절의 비대칭 참조** |
| `perf.perf_page_found` 갱신 | 8400 등 | 초기값 `PERF_PAGE_MODE_OLD_IN_BUFFER`(2236)가 그대로 쓰이므로 의미상 정확 |

수행되는 것: `show_status->num_hit++` (2327), 디버그 빌드의 `pgbuf_add_fixed_at` (2320), 그리고 `fast_path` 이후 전부 (perf 집계, PAGE_UNKNOWN 처리, vacuum 플래그 clear).

---

## 7. latch promote

두 경로가 있다.

### 7.1 fix 중 암묵 승격 — `pgbuf_latch_bcb_upon_fix`

READ 래치 보유 중 `pgbuf_fix(..., PGBUF_LATCH_WRITE, ...)`를 다시 호출하면 4.2절 #5 / #6 / #7이 처리한다.

- **#5 in-place 승격** (6366-6372): `impl.fcnt == holder->fix_count`, 즉 **내가 유일한 reader**. `{WRITE, ·, 1}`로 CAS. 대기 없음, holder 재생성 없음. 단 `fcnt`가 **1로 리셋**되고(6371) `holder->fix_count`는 `can_latch` 처리에서 `holder->fix_count++`(6452)된다 — 원래 fix_count가 1이었어야 정합하며, 그것이 #5의 진입 조건이 보장하는 바다.
- **#6 conditional 실패** (6376-6382): 다른 reader가 있고 `PGBUF_CONDITIONAL_LATCH`. `waiter_exists = true`만 세우고 6511의 conditional 거부로 간다.

  주의: 여기서 `waiter_exists = true`를 세우고도 실제로는 큐에 넣지 않고 실패 반환한다. 이 stale 비트가 4.2절 방어 코드(6272-6284)와 `pgbuf_wake_flush_waiters`(10948-10956) 정합화가 필요한 원인 중 하나다.
- **#7 promote_needed** (6383-6390, 6490-6505): 다른 reader가 있고 `PGBUF_UNCONDITIONAL_LATCH`.
  ```
  CAS: fcnt -= holder->fix_count;  waiter_exists = true            /* 6385-6388 */
  이후 (6490-6505):
      request_fcnt += holder->fix_count      /* 되찾을 fcnt 기억 */  /* 6493 */
      holder->fix_count = 0
      INIT_HOLDER_STAT (&holder->perf_stat)
      pgbuf_remove_thrd_holder (holder)      /* 페이지를 완전히 놓았다 */ /* 6499 */
  -> 6547-6583 의 pgbuf_block_bcb (as_promote = false) 로 진행
  ```
  즉 **자기 READ 래치를 완전히 반납하고 일반 대기자로 큐 tail에 붙는다.** `as_promote=false`이므로 promoter 특권(head 삽입)이 없다.

### 7.2 명시적 승격 — `pgbuf_promote_read_latch` (2799-3013)

`pgbuf_promote_read_latch_debug` / `_release`가 진입점. `PGBUF_PROMOTE_ONLY_READER` / `PGBUF_PROMOTE_SHARED_READER` 조건을 받는다 (`page_buffer.h:205-209`).

```
CAST_PGPTR_TO_BFPTR (bufptr, *pgptr_p)                            /* 2841 */
PGBUF_BCB_LOCK (bufptr)                                           /* 2842 */
holder = pgbuf_find_thrd_holder (bufptr);  assert_release (holder != NULL)  /* 2843-2844 */
do {                                                              /* 2845 */
    need_block = false
    impl = get_impl (&atomic_latch);  impl_new = impl
    if (holder->fix_count == impl.fcnt):        /* 내가 유일한 reader */  /* 2851 */
        if (impl.waiter_exists && next_wait_thrd && next_wait_thrd->wait_for_latch_promote):
            /* 다른 promoter가 큐 head — 둘 다 같은 페이지를 봤다고 보장 못 함 */
            PGBUF_BCB_UNLOCK;  rv = ER_PAGE_LATCH_PROMOTE_FAIL;  goto end  /* 2853-2862 */
        else:
            impl_new.latch_mode = PGBUF_LATCH_WRITE     /* in-place 승격 */ /* 2866 */
            holder->perf_stat.hold_has_write_latch = 1
            /* 2868 주석: 대기하지 않으므로 promoted 플래그 불필요 */
    else:                                        /* 다른 reader 존재 */
        if (condition == PGBUF_PROMOTE_ONLY_READER
            || (next_wait_thrd && next_wait_thrd->wait_for_latch_promote)):
            PGBUF_BCB_UNLOCK;  rv = ER_PAGE_LATCH_PROMOTE_FAIL;  goto end  /* 2874-2891 */
        else:
            fix_count = holder->fix_count;  perf_stat = holder->perf_stat  /* 2895-2896 */
            if (impl.fcnt == holder->fix_count): continue   /* 재판정 */    /* 2897-2900 */
            impl_new.fcnt -= fix_count
            impl_new.waiter_exists = true
            need_block = true                                     /* 2901-2903 */
} while (!compare_exchange_strong (impl.raw, impl_new.raw, acq_rel, acquire))  /* 2907 */

if (!need_block): PGBUF_BCB_UNLOCK (bufptr)                       /* 2909-2912 */
else:
    holder->fix_count = 0
    pgbuf_remove_thrd_holder (holder) 실패 -> *pgptr_p = NULL; UNLOCK; ER_FAILED  /* 2916-2926 */
    holder = NULL      /* 이 시점에서 페이지는 unfix 상태 */        /* 2927 */
    thread_p->wait_for_latch_promote = true                       /* 2931 */
    pgbuf_block_bcb (bufptr, PGBUF_LATCH_WRITE, fix_count, true /* as_promote */)  /* 2934 */
        실패 -> *pgptr_p = NULL;  wait_for_latch_promote = false;  ER_FAILED
    /* BCB mutex 미보유 */
    thread_p->wait_for_latch_promote = false                       /* 2943 */
    assert (pgbuf_find_thrd_holder (bufptr) == NULL)               /* 2946 */
    holder = pgbuf_allocate_thrd_holder_entry (thread_p)           /* 2947 */
    holder->fix_count = fix_count;  holder->bufptr = bufptr;  holder->perf_stat = perf_stat
    실제 획득한 latch_mode에 맞춰 perf_stat 갱신                    /* 2957-2964 */
end:
    perf 집계 (perfmon_pbx_promote)                                /* 2971-2989 */
    return rv    /* NO_ERROR 또는 ER_PAGE_LATCH_PROMOTE_FAIL */
```

7.1의 #7과 결정적으로 다른 점: **`as_promote = true`로 큐 head에 삽입**한다 (7019-7028). `pgbuf_block_bcb`가 `assert (next_wait_thrd == NULL || !next_wait_thrd->wait_for_latch_promote)` (7024)로 **promoter는 동시에 하나만** 존재함을 강제한다. 그래서 이미 promoter가 대기 중이면 승격을 즉시 포기한다 (2853-2862, 2874-2891).

**포기 이유가 2879-2885 주석에 있다**: promoter는 승격 대기 중 페이지를 놓는다(2916-2927). 두 promoter가 동시에 대기하면 둘 다 "내가 처음 fix했던 그 페이지 내용"을 보장받지 못한다. 그래서 두 번째 promoter는 `ER_PAGE_LATCH_PROMOTE_FAIL`로 물러나고, 호출자가 페이지를 놓고 처음부터 재시도해야 한다.

`SA_MODE`에서는 전체가 `set_latch (&bufptr->atomic_latch, PGBUF_LATCH_WRITE); return NO_ERROR;` 한 줄로 축약된다 (3009-3011).

승격 실패는 `ER_NOTIFICATION_SEVERITY`로만 기록되며 디버그 빌드에서만 er_set한다 (2858-2860, 2887-2889). 즉 **정상적으로 발생 가능한 결과**이고 호출자가 반드시 처리해야 한다.

---

## 8. 엣지 케이스

### 8.1 재진입 fix (같은 스레드가 같은 페이지 재fix)

판정 기준은 `pgbuf_find_thrd_holder(thread_p, bufptr) != NULL` (6270). BCB에는 "누가 잡고 있는지" 정보가 없고, **스레드 로컬 holder 리스트를 선형 탐색**해서 판정한다 (6046-6072). 리스트가 짧다는 가정(`PGBUF_MAX_PAGE_FIXED_BY_TRAN = 64`, 320)에 기반한다.

| 상황 | 처리 | 라인 |
|---|---|---|
| WRITE 보유 + WRITE 재요청 | 즉시 허용, `fcnt++`, `holder->fix_count++` | #4, 6357-6362 |
| WRITE 보유 + READ 재요청 | 즉시 허용, **`latch_mode`는 WRITE 유지** (강한 래치 유지) | #4 |
| READ 보유 + READ 재요청, 대기자 없음 | 즉시 허용 | #1 |
| READ 보유 + READ 재요청, **대기자 있음** | **holder이므로 예외 허용** | #2, 6345-6351 |
| READ 보유(유일) + WRITE 재요청 | in-place 승격 | #5 |
| READ 보유(공유) + WRITE 재요청 | 자기 READ 반납 후 블록 | #7 |

**#2가 자기 데드락 방지의 핵심이다.** 대기자가 있을 때 신규 READ를 막는 규칙(#3)을 holder에게도 적용하면, 이미 READ를 잡은 스레드가 자기가 놓지 않으면 절대 사라지지 않는 대기자 때문에 무한 대기한다.

`fcnt`와 `holder->fix_count`의 관계: `fcnt` = 모든 스레드의 fix 총합, `holder->fix_count` = 내 몫. `fcnt == holder->fix_count`가 "내가 유일한 holder"의 판정식이다 (#5, 2851).

`PGBUF_MAX_PAGE_WATCHERS = 64` (318)는 동일 페이지에 대한 동시 fix 상한이고, `PGBUF_MAX_PAGE_FIXED_BY_TRAN = 64` (320)는 한 스레드의 동시 fix 페이지 수 상한이다.

### 8.2 conditional latch

`PGBUF_CONDITIONAL_LATCH`는 대기를 절대 하지 않는다. 처리 흐름 (6511-6545):

```
tran_index = LOG_FIND_THREAD_TRAN_INDEX (thread_p)
wait_msec = logtb_find_wait_msecs (tran_index)
if (wait_msec == LK_ZERO_WAIT):
    unlock_BCB.release ();  PGBUF_BCB_UNLOCK (bufptr)
    logtb_find_client_name_host_pid (...)
    er_set (ER_ERROR_SEVERITY, ..., ER_LK_PAGE_TIMEOUT, 8, tran_index, user, host, pid,
            (request_mode == READ ? "READ" : "WRITE"), volid, pageid, NULL)   /* 6534-6536 */
else:
    unlock_BCB.release ();  PGBUF_BCB_UNLOCK (bufptr)   /* 에러 설정 없음! */
return ER_FAILED
```

**`wait_msec != LK_ZERO_WAIT`이면 에러를 설정하지 않고 실패한다.** 호출자가 `er_errid()`로 실패 원인을 알 수 없으므로, "래치를 못 얻었다"를 반환값(NULL)으로만 판단해야 한다.

또 하나의 함정: **`PGBUF_UNCONDITIONAL_LATCH`를 넘겨도 conditional로 강등될 수 있다** (2275-2285). 트랜잭션의 `wait_msecs`가 `LK_ZERO_WAIT` 또는 `LK_FORCE_ZERO_WAIT`면 강등된다. 따라서 UNCONDITIONAL을 넘긴 호출자도 NULL 반환을 반드시 처리해야 한다.

`pgbuf_fix_with_retry`(2077-2109)가 이 재시도를 감싼 편의 함수다:

```
while ((pgptr = pgbuf_fix (..., PGBUF_UNCONDITIONAL_LATCH)) == NULL)
    switch (er_errid ()):
        NO_ERROR (인터럽트) / ER_INTERRUPTED:                 -> i 증가 없이 재시도
        ER_LK_UNILATERALLY_ABORTED / ER_LK_PAGE_TIMEOUT /
        ER_PAGE_LATCH_TIMEDOUT:                               -> i++
        default:                                              -> noretry = true
    if (noretry || i > retry):
        er_set (..., ER_PAGE_LATCH_ABORTED, 2, volid, pageid);  break
```

`NO_ERROR`/`ER_INTERRUPTED`는 카운터를 올리지 않으므로 **인터럽트가 지속되면 무한 루프**가 될 수 있다.

### 8.3 데드락 / 기아 회피

**페이지 래치 데드락 탐지는 없다.** 7092-7099 주석이 명시적으로 인정한다. 대체 수단은:

1. **타임아웃 = 데드락 희생자 선택.** `pgbuf_latch_timeout_msecs` 기본 300초(107, `PRM_ID_PAGE_LATCH_TIMEOUT_IN_MSECS`로 조정, 1675). 만료 시 `ER_PAGE_LATCH_TIMEDOUT` + `ER_LK_PAGE_TIMEOUT`, 무한 대기 트랜잭션이면 `ER_LK_UNILATERALLY_ABORTED`로 강제 abort (7364-7365).
2. **락 순서 프로토콜을 상위 계층에 위임.** `pgbuf_ordered_fix`(별도 담당 영역)가 VPID 순서로 정렬 fix를 강제해 사이클 자체를 예방한다. 필요 시 보유 페이지 전부를 unfix하고 재획득하며, 이때 `OLD_PAGE_PREVENT_DEALLOC`으로 재fix 대상을 보호한다 (16228-16250 주석).
3. **writer 기아 방지**: `waiter_exists`가 세워지면 신규 READ를 차단 (#3). 단 holder는 예외 (#2).
4. **reader 기아 방지**: `pgbuf_wakeup_reader_writer`가 큐 head의 연속 READ 구간을 **동시에 전부** 깨운다 (7459-7491).
5. **포기한 대기자의 뒷사람 구제**: `pgbuf_timed_sleep_error_handling` case 3이 자기 뒤의 READ 대기자를 대신 깨운다 (7183-7215).
6. **direct victim 대기자 기아 방지**: `pgbuf_get_thread_waiting_for_direct_victim`이 4회마다 1회 low priority 큐를 우선 소비 (15509). 그리고 8161-8167 주석이 "we have one big vulnerability with waiting threads"라며 아무도 victim을 공급하지 않는 시나리오를 TODO로 남겨두었다.
7. **VPID I/O 락 중복 읽기 방지**: `pgbuf_lock_page`로 같은 VPID를 두 번 읽는 것을 차단. 대기자는 무한 대기하므로 holder의 `pgbuf_unlock_page` 호출이 절대적 계약이다.

**보고 가치가 있는 기아 시나리오** — WRITE 대기자가 있는 상태(`waiter_exists = true`)에서:
- 일반 경로의 신규 READ는 #3으로 블록된다.
- lock-free 경로도 `waiter_exists` 조건으로 폴백한다 (7689).
- 따라서 lock-free 경로가 writer 기아를 새로 만들지는 않는다. 이 두 조건의 일관성이 설계상 필수이며, 한쪽만 고치면 즉시 기아가 발생한다.

### 8.4 `is_page_idle`의 `buf_lock_acquired` 단축

`buf_lock_acquired == true`면 래치 상태를 보지 않고 무조건 `is_page_idle = true`로 간다 (6295-6298). 근거: 이 BCB는 방금 victim으로 확보돼 해시 체인에 아직 없으므로(삽입은 (G)단계) 다른 스레드가 찾을 수 없다. 그래서 `{NO_LATCH, false, 0}` expected가 반드시 성립한다.

### 8.5 SA_MODE 전용 위생 검사

`page_buffer.c:6300-6310`:

```c
#if defined (SA_MODE)
  else
    {
      holder = pgbuf_find_thrd_holder (thread_p, bufptr);
      if (holder == NULL)
        {
          /* bufptr->latch_mode was leaked by the previous holder */
          assert (0);
          is_page_idle = true;
        }
    }
#endif
```

단일 스레드에서 래치가 걸려 있는데 내가 holder가 아니면 이전 holder가 래치를 누수한 것이므로, `assert(0)` 후 idle로 간주해 강제 회복한다. 같은 취지로 6507-6509의 `#if defined (SA_MODE) assert (0); #endif`는 "SA_MODE에서 블록에 도달하면 안 된다"를 표현한다.

---

## 9. `PAGE_FETCH_MODE`별 동작 차이

정의는 `page_buffer.h:172-187`.

| fetch_mode | 유효성 검사 (2257) | 해시 미스 시 | 디스크 read | lock-free RO 가능 (2311-2313) | `ptype == PAGE_UNKNOWN` 시 (2523-2560) | 기타 |
|---|---|---|---|---|---|---|
| `OLD_PAGE` | 수행 | BCB 확보 + read | O | **O** | `assert(false)` + `ER_PB_BAD_PAGEID`(ERROR) + unfix + NULL | 기본 모드 |
| `NEW_PAGE` | 수행 | BCB 확보, read 생략 | X | X | 허용, 그대로 반환 | 히트 시 `assert (LSA_ISNULL(oldest_unflush_lsa) \|\| is_dirty)` (2354). LSA/prv 초기화, `prv.pageid/volid = -1` (8562-8566). `num_pages_created++`, `num_hit++` (8574-8575) |
| `OLD_PAGE_IF_IN_BUFFER` | 수행, **에러 억제** (2261의 3번째 인자 true) | **`hash_mutex` 해제 후 NULL 반환** (2359-2364). BCB 확보 안 함 | — | X | 허용, 그대로 반환 | `pgbuf_claim_bcb_for_fix`에 `assert (fetch_mode != OLD_PAGE_IF_IN_BUFFER)` (8366) |
| `OLD_PAGE_PREVENT_DEALLOC` | 수행 | BCB 확보 + read | O | **O** | `assert(false)` + `ER_PB_BAD_PAGEID`(ERROR) + unfix + NULL | 래치 전 `register_avoid_deallocation` (2425-2428), 래치 후 `unregister` (2513-2517). **12절 비대칭 주의** |
| `OLD_PAGE_DEALLOCATED` | 수행 | BCB 확보 + read | O | X | 허용, 그대로 반환 | `pgbuf_rv_dealloc_undo`(15216)가 유일 사용처. dealloc undo가 `ptype`을 복원하려면 dealloc된 페이지를 fix할 수 있어야 한다 |
| `OLD_PAGE_MAYBE_DEALLOCATED` | 수행 | BCB 확보 + read | O | **O** | `ER_PB_BAD_PAGEID`(**WARNING**) + unfix + NULL | `maybe_deallocated = true` → `pgbuf_check_bcb_page_vpid`의 assert 완화 (2401, 11205-11207). `pgbuf_fix_if_not_deallocated_with_caller`가 사용 |
| `RECOVERY_PAGE` | **건너뜀** (2257) | BCB 확보 + read | O | X | 허용, 그대로 반환 | 복구 중에는 신규/dealloc/정상 무엇이든 가능 (`page_buffer.h:185-186`) |

`PAGE_UNKNOWN` 처리 위치에 대한 설계 메모가 2554-2559에 있다: 더 이른 단계에서 검사할 수도 있었지만 훨씬 복잡해지고, `OLD_PAGE_MAYBE_DEALLOCATED`조차 대부분의 페이지는 dealloc되지 않으므로 성능 손실이 무의미하며, **래치를 쥔 상태에서 검사하는 것이 동시 deallocation을 막아 더 안전**하다는 판단이다.

`pgbuf_check_bcb_page_vpid`(11189-11217)는 `iopage.prv.pageid/volid`가 `bcb->vpid`와 일치하는지 확인한다. `maybe_deallocated && log_is_in_crash_recovery_and_not_yet_completes_redo()`면 assert를 완화한다 (11205-11207). 영구 볼륨(`volid > NULL_VOLID`)만 검사하고 임시 볼륨은 항상 true다 (11214-11216).

---

## 10. 부가 API

### 10.1 `pgbuf_simple_fix` / `pgbuf_simple_unfix` / `pgbuf_dealloc_temp_page`

**임시 파일 읽기 전용의 래치 없는 fix.** 2637-2650 주석의 경고가 강하다: "if bcb is on buffer, only fcnt++. it is latchless and LRU mutexless. Even if it is a temporary file, it can be a problem if there is a write operation. **Cannot be mixed with general FIX(LATCH).**"

`pgbuf_simple_fix` (2650-2731):
```
assert (pgbuf_is_temporary_volume (vpid->volid))                  /* 2659 */
retry:                                                            /* 2661 */
    hash_anchor = &buf_hash_table[PGBUF_HASH_VALUE (vpid)]
    bufptr = pgbuf_search_hash_chain (hash_anchor, vpid)           /* 2663 */
    if (bufptr == NULL):
        if (!need_fix || er_errid () == ER_CSS_PTHREAD_MUTEX_TRYLOCK):
            UNLOCK hash_mutex;  return NULL                       /* 2667-2671 */
        if (pgbuf_lock_page (...) != PGBUF_LOCK_HOLDER): goto retry /* 2673-2677 */
        bufptr = pgbuf_claim_bcb_for_fix (vpid, OLD_PAGE, hash_anchor,
                                          NULL, &retry, true /* already_locked */)  /* 2678 */
        실패 -> pgbuf_unlock_page (..., true);  return NULL
        pgbuf_insert_into_hash_chain (hash_anchor, bufptr)         /* 2684 */
        pgbuf_unlock_page (..., false)                            /* 2685 */
        add_fcnt (&bufptr->atomic_latch, 1)     /* latch_mode 안 건드림! */ /* 2687 */
        LRU 추가: private면 add_new_bcb_to_top, 아니면 add_new_bcb_to_middle  /* 2691-2699 */
        PGBUF_BCB_UNLOCK (bufptr)                                 /* 2700 */
    else:
        if (need_fix):
            direct victim이면 INVALIDATE_DIRECT_VICTIM 로 교체     /* 2706-2711 */
        else:
            direct victim이면 UNLOCK 후 NULL 반환 ("없는 것으로 취급") /* 2715-2721 */
        add_fcnt (&bufptr->atomic_latch, 1)                       /* 2726 */
        PGBUF_BCB_UNLOCK (bufptr)                                 /* 2728 */
    return pgptr
```

핵심: **`latch_mode`를 전혀 건드리지 않고 `fcnt`만 올린다.** 그래서 이 BCB는 victim/dealloc 대상에서 제외되지만(`fcnt > 0`), 래치 호환성 검사는 아무것도 하지 않는다. `need_fix == false`이면 상주 여부만 조회하는 peek 모드다.

`pgbuf_simple_unfix` (2744-2757): `PGBUF_BCB_LOCK` → `add_fcnt(-1)` → `PGBUF_BCB_UNLOCK`. **`pgbuf_unlatch_bcb_upon_unfix`를 호출하지 않으므로 LRU 이동/대기자 기상/async flush 처리가 전혀 없다.** 임시 파일 페이지라 정당하다.

`pgbuf_dealloc_temp_page` (2764-2787): BCB mutex 하에서 `prv.ptype = PAGE_UNKNOWN`, `prv.pflag = 0`, `pgbuf_bcb_clear_dirty`, `need_free`면 `add_fcnt(-1)` + `assert (get_fcnt == 0)`.

주의: `pgbuf_simple_fix`의 `add_fcnt(1)`은 `latch_mode`를 `NO_LATCH`로 남긴다. 이 상태에서 6.2절의 lock-free 조건(`latch_mode == READ`)은 성립하지 않으므로 lock-free 경로가 이 BCB를 집지 않는다. 반대로 `pgbuf_latch_bcb_upon_fix`가 이 BCB를 만나면 `latch_mode == NO_LATCH`이므로 `is_page_idle = true`로 판정하고(6295) expected를 `{NO_LATCH, false, 0}`로 강제하는데 실제 `fcnt`는 1 이상이라 **CAS가 영원히 실패하며 BCB mutex를 든 채 무한 스핀한다.** 이것이 2649 "Cannot be mixed with general FIX(LATCH)"의 구체적 의미다.

### 10.2 `pgbuf_fix_if_not_deallocated_with_caller` (15292-15342)

```
isvalid = disk_is_page_sector_reserved (vpid->volid, vpid->pageid)  /* 15311 */
DISK_INVALID -> *page = NULL;  return NO_ERROR    /* dealloc됨, 에러 아님 */ /* 15312-15316 */
DISK_ERROR   -> ASSERT_ERROR_AND_SET;  return error
assert (isvalid == DISK_VALID)
*page = pgbuf_fix (vpid, OLD_PAGE_MAYBE_DEALLOCATED, latch_mode, latch_condition)  /* 15326-15331 */
if (*page == NULL && !log_is_in_crash_recovery_and_not_yet_completes_redo ()):
    ASSERT_ERROR_AND_SET (error_code)
    if (error_code == ER_PB_BAD_PAGEID):
        er_clear ();  error_code = NO_ERROR       /* dealloc됨 → 정상 */ /* 15336-15340 */
return error_code
```

2단 검사다: 먼저 디스크 섹터 예약 여부로 값싸게 걸러내고(15305-15308 주석이 성능 우려를 남긴다), 통과하면 `OLD_PAGE_MAYBE_DEALLOCATED`로 fix하고 `ER_PB_BAD_PAGEID`를 "dealloc됨"으로 번역해 삼킨다. 결과: `error == NO_ERROR && *page == NULL`이 "정상적으로 dealloc된 페이지"를 의미한다.

---

## 11. 재구현 체크리스트 — 불변식과 계약

1. **반환 시 뮤텍스 상태 계약을 함수마다 고정한다.**
   - `pgbuf_search_hash_chain`: 성공 → BCB mutex 보유 / 실패 → `hash_mutex` 보유 (7663-7664)
   - `pgbuf_latch_bcb_upon_fix`: 성공·실패 무관 BCB mutex **해제** (`scope_exit`, 6259)
   - `pgbuf_unlatch_bcb_upon_unfix`: BCB mutex **해제** (6830 또는 `safe_flush_force_unlock` 내부)
   - `pgbuf_lock_page` / `pgbuf_unlock_page`: `hash_mutex` **해제**
   - `pgbuf_insert_into_hash_chain`: `hash_mutex` **보유 유지** (7783-7785) — 유일한 예외
   - `pgbuf_put_bcb_into_invalid_list`: BCB mutex **해제** (8927)
   - `pgbuf_allocate_bcb` / `pgbuf_claim_bcb_for_fix`: 성공 → BCB mutex **보유**

2. **블로킹 락 순서는 `bcb->mutex` → `hash_mutex`만.** 역방향은 `TRYLOCK`만, `EBUSY`면 `hash_mutex` 선해제.

3. **복합 래치 전이는 반드시 단일 CAS로.** `get_impl` snapshot → 여러 필드 판정 → `compare_exchange`. 헬퍼를 연달아 부르면 안 된다.

4. **`waiter_exists`는 절대 누수시키지 않는다.** 대기 큐에서 스레드가 빠지는 **모든** 경로에서 `pgbuf_is_exist_blocked_reader_writer`를 확인해 정합화한다: `pgbuf_wakeup_reader_writer` 종료부(7529-7532), `pgbuf_wake_flush_waiters` 종료부(10948-10956), `pgbuf_block_bcb` FLUSH 인터럽트(7077-7081). 누수 시 idle-grant CAS 무한 스핀 (BCB mutex 보유 상태 livelock).

5. **깨우는 쪽이 `fcnt`/`latch_mode`를 갱신하고, 깨어난 쪽은 holder만 만든다.** (7484-7485 ↔ 6553-6583)

6. **`request_latch_mode = PGBUF_NO_LATCH`는 `thread_unlock_entry` 전에 세팅한다.** (7318-7323)

7. **holder는 스레드 로컬. BCB mutex 밖에서 조작한다.** 재진입 판정은 `pgbuf_find_thrd_holder`.

8. **`fcnt == holder->fix_count`가 "내가 유일한 holder"의 판정식.**

9. **디스크 I/O는 BCB mutex 하에서만 안전하다** — 그 BCB가 아직 해시 체인에 없고 VPID I/O 락으로 보호되는 동안에만.

10. **VPID I/O 락 holder는 성공/실패 무관하게 반드시 `pgbuf_unlock_page`를 호출한다.** 대기자가 무한 대기 중이다.

11. **`pgbuf_bcb_register_avoid_deallocation` / `unregister`는 짝을 맞춘다.** 모든 fix 경로에서.

12. **`pgbuf_fix` 실패 경로는 `buf_lock_acquired`에 따라 회수 방식이 다르다.** true면 `PGBUF_BCB_LOCK` → `put_bcb_into_invalid_list` → `unlock_page(true)`, false면 `PGBUF_BCB_UNLOCK`만.

13. **`SA_MODE`에서는 BCB mutex 매크로 전체가 no-op** (961-966). 뮤텍스에 의미를 부여하는 로직을 SA_MODE에서 테스트하면 통과해 버린다.

---

## 12. 코드 정독 중 발견한 사항 2건

> **[3차 판정 확정]** §12.1의 결함 본체는 이 절의 서술대로 **lock-free fast path의 비대칭이 맞다**. 단 도달 경로가 정정되었다: 외부에서 `OLD_PAGE_PREVENT_DEALLOC`을 `pgbuf_fix`에 직접 넘기는 호출부는 0건이지만, `pgbuf_ordered_fix`의 1차 시도(`:12291-12296`)가 원래 fetch_mode를 그대로 전달하고 보유 페이지가 없으면 UNCONDITIONAL(`:12280-12284`)이 되어 fast path에 도달한다 — heap 스캔의 일상 경로. 한편 ordered fix 자체의 요청 페이지 해제(`:12702`, `:12850`)는 1차 시도가 조건부 latch에서 실패하며 남긴 등록 +1과 짝인 의도된 정리로, 별도 결함이 아니다. 정본은 `00-overview.md` §7 표 #1과 CBRD-27263 이슈 문서.

### 12.1 lock-free 경로에서 `avoid_deallocation` 카운터 비대칭 (실제 영향 가능 — ordered fix 1차 시도 경유로 도달)

`pgbuf_fix`는 `OLD_PAGE_PREVENT_DEALLOC`에 대해 **register(2425-2428)와 unregister(2513-2517)를 짝지어** 호출한다. 그런데 lock-free RO fast path는 2311-2313에서 `OLD_PAGE_PREVENT_DEALLOC`을 **허용**하고, 성공 시 2328에서 `goto fast_path`로 register 지점(2425)을 건너뛴 뒤 unregister 지점(2513)에 도달한다.

```c
/* 2311-2313: lock-free 진입 조건에 OLD_PAGE_PREVENT_DEALLOC 포함 */
if (request_mode == PGBUF_LATCH_READ
    && (fetch_mode == OLD_PAGE || fetch_mode == OLD_PAGE_PREVENT_DEALLOC
        || fetch_mode == OLD_PAGE_MAYBE_DEALLOCATED)
    && condition == PGBUF_UNCONDITIONAL_LATCH)
  {
    pgptr = pgbuf_lockfree_fix_ro (thread_p, vpid, fetch_mode);   /* register 없음 */
    if (pgptr != NULL)
      { ...  goto fast_path; }                                    /* 2328: 2425 를 건너뜀 */
  }
...
fast_path:                                                        /* 2498 */
  if (fetch_mode == OLD_PAGE_PREVENT_DEALLOC)
    {
      pgbuf_bcb_unregister_avoid_deallocation (bufptr);            /* 2516: 짝 없는 감소 */
    }
```

`pgbuf_lockfree_fix_ro`(7671-7734) 전체에 `register_avoid_deallocation` 호출이 없음을 확인했다.

- **카운터가 0인 경우**: `pgbuf_bcb_unregister_avoid_deallocation`의 0-방어(16241-16251)가 감소를 막고 `er_log_debug`만 남긴다. 값 손상은 없으나 핫패스에서 debug 로그가 반복 발생한다.
- **다른 스레드의 register가 pending인 경우**: 감소가 **그 스레드의 보호를 훔친다.** 시나리오 — T1이 일반 경로로 `OLD_PAGE_PREVENT_DEALLOC` fix를 시작해 2427에서 카운터를 1로 올리고 래치 대기에 들어간다(래치 미보유 = 보호가 실제로 필요한 구간). T2가 같은 페이지를 lock-free 경로로 fix하고 2516에서 카운터를 0으로 내린다. 이후 vacuum 워커의 `pgbuf_bcb_should_avoid_deallocation`(16261-16267)이 false를 반환하고, T1이 기대한 dealloc 보호가 사라진다.

이 조합은 이론적 조합이 아니다. `heap_file.c:7572, 7726, 9375, 14366, 14780, 18923, 19022`가 `OLD_PAGE_PREVENT_DEALLOC + PGBUF_LATCH_READ`로 호출하고, `heap_scan_pb_latch_and_fetch`(`heap_file.c:932`)는 watcher가 없으면 `pgbuf_fix_release(..., PGBUF_UNCONDITIONAL_LATCH)`를 직접 호출한다 — lock-free 진입 조건 3개를 모두 만족한다. 즉 **일반 heap 스캔 경로에서 상시 실행된다.**

수정 방향 두 가지:
- (a) `fast_path` 도달 방식을 구분해, lock-free로 왔으면 2513의 unregister를 건너뛴다 (플래그 하나 추가).
- (b) 2311-2313의 lock-free 진입 조건에서 `OLD_PAGE_PREVENT_DEALLOC`을 제외한다. 단 heap 스캔이 lock-free 이득을 잃는다.

(a)가 성능 손실 없이 대칭을 복원한다. lock-free 경로는 래치를 이미 획득하므로 avoid-dealloc 마커가 애초에 필요하지 않다는 점에서 의미상으로도 (a)가 맞다.

### 12.2 `dwb_read_page` 실패 시 BCB mutex 및 VPID 락 누수 (방어 코드 경로)

`pgbuf_claim_bcb_for_fix` (8449-8455):

```c
if (dwb_read_page (thread_p, vpid, &bufptr->iopage_buffer->iopage, &success) != NO_ERROR)
  {
    /* Should not happen */
    assert (false);
    return NULL;
  }
```

같은 함수의 인접 실패 경로(`fileio_read` 실패, 8457-8476; TDE 복호화 실패, 8499-8506)는 모두 `pgbuf_put_bcb_into_invalid_list` + `pgbuf_unlock_page(..., true)`로 정리하는데, 이 경로만 **BCB mutex를 보유한 채 반환하고 VPID I/O 락도 해제하지 않는다.**

결과: 해당 BCB mutex가 영구 잠금되고, 같은 VPID를 기다리는 스레드는 `pgbuf_sleep`(무한 대기)에서 절대 깨어나지 않는다. `assert (false)`가 있으므로 디버그 빌드는 즉시 abort하지만, **릴리스 빌드에서는 조용히 데드락한다.**

수정: 인접 경로와 동일하게

```c
pgbuf_put_bcb_into_invalid_list (thread_p, bufptr);
(void) pgbuf_unlock_page (thread_p, hash_anchor, vpid, true);
PGBUF_BCB_CHECK_MUTEX_LEAKS ();
return NULL;
```

`dwb_read_page`가 실제로 실패할 수 있는지는 별도 확인이 필요하나, 방어 코드로서 정리 누락은 그 자체로 결함이다.
