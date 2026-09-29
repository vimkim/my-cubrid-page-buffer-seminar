# page_buffer.c 기술 노트 — 부가 기능 · 경계 통합 지점 · 관측성 · 디버깅

분석 대상: `/home/vimkim/gh/cb/pgbuf-analysis/src/storage/page_buffer.c` (17,535줄). 이하 모든 라인 번호는 이 파일 기준이며, 다른 파일은 경로를 명시한다.

---

## 1. TDE (Transparent Data Encryption) 통합

### 1.1 설계 요지

pgbuf는 **암호화 알고리즘을 페이지 헤더 비트로만 기억**하고, 실제 암복호화는 `tde` 모듈에 위임한다. 상태 저장소는 `FILEIO_PAGE.prv.pflag`의 `FILEIO_PAGE_FLAG_ENCRYPTED_AES` / `FILEIO_PAGE_FLAG_ENCRYPTED_ARIA` 비트다 (5085-5099행). BCB에는 TDE 관련 필드가 전혀 없다 (`struct pgbuf_bcb`, 513-544행) — 즉 TDE 상태는 **BCB 메타가 아니라 페이지 내용의 일부**이며, 따라서 페이지와 함께 자동으로 디스크에 저장/복구된다.

핵심 불변식: **버퍼 풀 안의 페이지는 항상 평문(plaintext)이다.** 암호문은 read 직후 곧바로 복호화되고(8491-8506행), write 직전에 별도 스택 버퍼로 암호화 복사된다(10748-10757행). BCB의 iopage 자체는 절대 암호문을 담지 않는다.

### 1.2 `pgbuf_set_tde_algorithm` (5057-5100행)

```
pgbuf_set_tde_algorithm (thread_p, pgptr, tde_algo, skip_logging):
  assert (tde_is_loaded () || tde_algo == TDE_ALGORITHM_NONE)   /* 5062 */
  prev = pgbuf_get_tde_algorithm (pgptr)
  if prev == tde_algo: return                    /* 5066-5069: 무변경 조기 반환 */
  CAST_PGPTR_TO_IOPGPTR (iopage, pgptr)
  tde_er_log (...)                               /* 5073 */
  if !skip_logging:
      log_append_undoredo_data2 (RVPGBUF_SET_TDE_ALGORITHM, ...,
                                 undo=&prev, redo=&tde_algo)    /* 5078-5079 */
  iopage->prv.pflag &= ~FILEIO_PAGE_FLAG_ENCRYPTED_MASK          /* 5082 */
  switch (tde_algo): AES -> |= _AES; ARIA -> |= _ARIA; NONE -> nop
  pgbuf_set_dirty (thread_p, pgptr, DONT_FREE)                   /* 5099 */
```

주목할 점:

- **조기 반환(5066-5069행)이 로깅까지 건너뛴다.** 이는 의도적이다 — 값이 안 바뀌면 undo/redo 데이터가 동일해 로그가 무의미하고, 불필요한 dirty 마킹도 피한다.
- `skip_logging = true`로 부르는 호출자는 세 부류다: (a) 복구 경로 `pgbuf_rv_set_tde_algorithm` (5118행), (b) `pgbuf_rv_dealloc_redo` (15186행), (c) `pgbuf_copy_from_area` (4843행 — 이 함수는 애초에 `log_skip_logging`으로 로깅 자체를 억제한다, 4851행).
- undo/redo 데이터가 각각 `sizeof (TDE_ALGORITHM)`짜리 열거값이므로, `pgbuf_rv_set_tde_algorithm`은 undo/redo 양쪽에서 동일 함수로 처리된다 (5110-5121행). `rcv->data`를 `TDE_ALGORITHM *`로 캐스팅하고 길이만 assert (5114-5116행).
- 레코드 타입 `RVPGBUF_SET_TDE_ALGORITHM = 127` (`src/transaction/recovery.h:184`), 디스패치 등록은 `src/transaction/recovery.c:826-827`.

### 1.3 `pgbuf_get_tde_algorithm` (5130-5157행)

pflag 비트를 읽어 열거값으로 환산하는 순수 함수. 배타성 검사가 assert로 걸려 있다 (5137-5138행):

```c
assert (!((iopage->prv.pflag & FILEIO_PAGE_FLAG_ENCRYPTED_AES) &&
          (iopage->prv.pflag & FILEIO_PAGE_FLAG_ENCRYPTED_ARIA)));
```

BCB 뮤텍스도, 페이지 유효성 검사도 하지 않는다. **고정된(fixed) 페이지 포인터를 전제**로 하며, `pgbuf_bcb_flush_with_wal`처럼 BCB 뮤텍스만 잡고 latch는 없는 상태에서도 호출된다 (10748행) — pflag은 latch 보유자만 바꾸므로 flush 시점의 읽기는 안전하다는 암묵적 계약이다.

### 1.4 read 경로 복호화 — `pgbuf_claim_bcb_for_fix` (8491-8506행)

```
read 경로 (fetch_mode != NEW_PAGE):
  dwb_read_page ()   ->  DWB 슬롯에 있으면 그대로 복사              /* 8455-8465 */
  else fileio_read () ->  실패 시 BCB를 invalid list로 반납 + unlock_page /* 8466-8489 */
  CAST_IOPGPTR_TO_PGPTR (pgptr, &bufptr->iopage_buffer->iopage)     /* 8491 */
  tde_algo = pgbuf_get_tde_algorithm (pgptr)                        /* 8492 */
  if tde_algo != NONE:
      tde_decrypt_data_page (src=&iopage, tde_algo,
                             is_temp=pgbuf_is_temporary_volume (vpid->volid),
                             dest=&iopage)          /* in-place, 8497-8499 */
      실패 시: pgbuf_put_bcb_into_invalid_list + pgbuf_unlock_page + return NULL
```

네 가지 계약이 드러난다:

1. **복호화는 in-place**다 (src == dest == `&bufptr->iopage_buffer->iopage`, 8498-8499행). `tde` 모듈이 in-place를 허용해야 한다.
2. **`is_temp` 인자를 넘긴다** — temp 볼륨은 nonce/키 파생 방식이 다르다는 뜻이며, 이 판정은 `xdisk_get_purpose`에 의존한다 (5502행).
3. **복호화 실패 시 BCB를 오염 상태로 두지 않는다** — read 실패와 동일한 경로(invalid list 반납 + buffer lock 해제)를 탄다 (8501-8505행). 이는 8474-8481행의 read 실패 처리와 정확히 대칭이다.
4. **복호화가 `pgbuf_check_bcb_page_vpid` 검증보다 앞선다** — 평문의 `prv.volid/pageid`를 봐야 하므로 순서가 강제된다.

### 1.5 flush 경로 암호화 — `pgbuf_bcb_flush_with_wal` (10744-10762행)

```
start_copy_page:                                          /* 10744 */
  iopage = PTR_ALIGN (page_buf, MAX_ALIGNMENT)   /* 스택 버퍼 char[IO_MAX_PAGE_SIZE + MAX_ALIGNMENT] */
  CAST_BFPTR_TO_PGPTR (pgptr, bufptr)
  tde_algo = pgbuf_get_tde_algorithm (pgptr)              /* 10748 */
  if tde_algo != NONE:
      tde_encrypt_data_page (src=&bufptr->iopage_buffer->iopage,
                             tde_algo, is_temp, dest=iopage)   /* 10751 */
      실패 시 즉시 return error  (BCB 뮤텍스는 여전히 보유 — *is_bcb_locked == true)
  else:
      memcpy (iopage, &bufptr->iopage_buffer->iopage, IO_PAGESIZE)  /* 10760 */
```

핵심 설계:

- **암호화는 out-of-place**다 (dest = 스택 버퍼, 10751행). read의 in-place와 비대칭인 이유는 명확하다 — 버퍼 풀에 남는 사본은 평문이어야 하고, 디스크로 나가는 사본만 암호문이어야 한다.
- 암호화 분기와 비암호화 `memcpy` 분기가 **정확히 같은 스택 버퍼를 채운다** (10751 vs 10760행). 이후 DWB/fileio 경로는 TDE 여부를 전혀 모른다 — pgbuf가 경계를 완전히 흡수한다.
- `is_temp = pgbuf_is_temporary_volume (bufptr->vpid.volid)`는 함수 진입부에서 한 번 계산되어 (10688행) 암호화(10751행)와 DWB 판정(10743행)에 재사용된다.
- **암호화 실패 시 `pgbuf_bcb_mark_was_not_flushed`를 호출하지 않고 그냥 `return error`한다** (10752-10757행). 그런데 바로 위 10741행에서 이미 `was_dirty = pgbuf_bcb_mark_is_flushing (...)`으로 FLUSHING 플래그를 세운 상태다. 즉 **암호화 실패는 BCB를 "flushing 중" 상태로 영구히 남긴다.** IO 실패 경로(10845-10857행)는 `pgbuf_bcb_mark_was_not_flushed`로 되돌리고 flush waiter를 깨우는데, 암호화 실패 경로는 그렇지 않다. `tde_encrypt_data_page` 실패는 실질적으로 치명적 오류로 취급된다는 뜻이지만, 대칭성 관점에서는 결함이다.
- `start_copy_page` 레이블은 DWB가 도중에 비활성화됐을 때 재진입 지점이다 (10820-10826행). 재진입 시 **암호화가 다시 수행된다** — `tde_encrypt_data_page`가 멱등(idempotent, 평문 소스에서 매번 새로 암호화)이어야 한다는 계약.

### 1.6 dealloc 시 TDE 비트 정리

`pgbuf_dealloc_page` (15135-15173행)는 페이지 해제 시 `prv.pflag`를 통째로 0으로 밀어 TDE 비트를 지운다 (15162행), 단 **원래 pflag을 undo 데이터에 저장해 둔다** (15144행 `udata.pflag = prv->pflag`). 복구 경로:

| 함수 | 라인 | pflag 처리 |
|---|---|---|
| `pgbuf_dealloc_page` | 15144, 15162 | `udata.pflag` 저장 후 `prv.pflag = 0` |
| `pgbuf_rv_dealloc_redo` | 15186 | `pgbuf_set_tde_algorithm (..., NONE, true)` — 비트만 지움 |
| `pgbuf_rv_dealloc_undo` | 15225 | `iopage->prv.pflag = udata->pflag` — 원본 복원 |
| `pgbuf_rv_dealloc_undo_compensate` | 15265 | `iopage->prv.pflag = udata->pflag` — 원본 복원 |

`!NDEBUG`에서만 동작하는 `tde_er_log` 진단이 각 지점에 붙어 있다 (15151-15156, 15227-15234, 15266-15273행).

> **발견된 결함**: `pgbuf_rv_dealloc_undo_compensate` (15251-15277행)에서 `VPID vpid;`가 선언만 되고 (15256행) 초기화 없이 `VPID_AS_ARGS (&vpid)`로 로그에 쓰인다 (15271행). `pgbuf_rv_dealloc_undo`(15206-15211행)에서는 `udata`로부터 채우는데 compensate 버전에는 그 코드가 없다. `!NDEBUG` 빌드에서 페이지가 암호화된 경우에만 발현되는 미초기화 읽기다.

---

## 2. Copy buffer — 캐시드 힙 스캔용 사본 버퍼 (CBRD-27041)

### 2.1 목적과 설계 (861-934행)

파일 상단 주석(861-866행)이 설계 의도를 정확히 밝힌다:

> The copy buffer is not a real BCB slot: it is a stand-alone `<dummy BCB, iopage>` pair, private to this file, so that the `PAGE_PTR` returned by `pgbuf_copy_buffer_get_page_ptr ()` satisfies the same `CAST_PGPTR_TO_BFPTR` / `CAST_PGPTR_TO_IOPGPTR` invariants as a real fixed page.

즉 **CAST 매크로 호환성을 위해 더미 BCB를 함께 할당하는 것**이 이 설계의 전부다. 왜 필요한가는 매크로를 보면 명확하다 (147-152행):

```c
#define CAST_PGPTR_TO_BFPTR(bufptr, pgptr) \
  do { \
    (bufptr) = ((PGBUF_BCB *) ((PGBUF_IOPAGE_BUFFER *) \
      ((char *) pgptr - offsetof (PGBUF_IOPAGE_BUFFER, iopage.page)))->bcb); \
    assert ((bufptr) == (bufptr)->iopage_buffer->bcb); \
  } while (0)
```

`PAGE_PTR`에서 고정 오프셋을 빼서 `PGBUF_IOPAGE_BUFFER`를 얻고, 그 `->bcb` 포인터를 역참조한다. 그리고 **`bufptr == bufptr->iopage_buffer->bcb` 순환 참조를 assert한다.** 따라서 생짜 `malloc(IO_PAGESIZE)` 버퍼를 `PAGE_PTR`로 흘려보내면 `CAST_PGPTR_TO_BFPTR`가 쓰레기 포인터를 읽고 assert에 걸린다. `spage_*` / `heap_*` 코드가 `PAGE_PTR`을 받아 내부에서 이 매크로를 쓸 수 있으므로, 사본 버퍼도 같은 레이아웃을 흉내내야 한다.

### 2.2 구조체와 할당 크기

```c
struct pgbuf_copy_buffer                       /* 868-872행 */
{
  PGBUF_BCB dummy_bcb;                 /* real BCB struct, only vpid field meaningful */
  PGBUF_IOPAGE_BUFFER iopage_buf;      /* flexible-payload; actual size determined by alloc */
};

/* 874-877행 */
#define PGBUF_COPY_BUFFER_ALLOC_SIZE \
  ((size_t) (offsetof (struct pgbuf_copy_buffer, iopage_buf) + PGBUF_IOPAGE_BUFFER_SIZE))
```

`sizeof (struct pgbuf_copy_buffer)`를 쓰면 **과소 할당**된다는 경고가 명시돼 있다 (874-875행): `FILEIO_PAGE.page`가 `char[1]`인 flexible-array 흉내이므로 컴파일러가 계산한 `sizeof`는 페이지 1바이트만 잡는다. 따라서 `PGBUF_IOPAGE_BUFFER_SIZE`로 동적 크기를 계산한다. 그 매크로는 (118-120행):

```c
#define PGBUF_IOPAGE_BUFFER_SIZE \
  ((size_t)(offsetof (PGBUF_IOPAGE_BUFFER, iopage) + SIZEOF_IOPAGE_PAGESIZE_AND_GUARD()))
```

그리고 `SIZEOF_IOPAGE_PAGESIZE_AND_GUARD()`는 `CUBRID_DEBUG`에서 `IO_PAGESIZE + sizeof (pgbuf_Guard)`, 아니면 `IO_PAGESIZE` (111-113행). **즉 copy buffer도 실제 BCB 슬롯과 동일하게 가드 바이트 공간을 포함해 할당된다** — 디버그 빌드에서 가드 검사 로직과 호환되도록.

### 2.3 `pgbuf_copy_buffer_alloc` (879-902행)

```
buf = malloc (PGBUF_COPY_BUFFER_ALLOC_SIZE)
if buf == NULL: return NULL            /* 884-887: OOM은 호출자가 graceful degradation */
placement_new (&buf->dummy_bcb)        /* 890: memset 대신 value-init */
buf->iopage_buf.bcb = &buf->dummy_bcb  /* 891: 순환 링크 절반 */
buf->dummy_bcb.iopage_buffer = &buf->iopage_buf  /* 892: 순환 링크 나머지 절반 */
VPID_SET_NULL (&buf->dummy_bcb.vpid)   /* 893 */
#if CUBRID_DEBUG
  memcpy (&buf->iopage_buf.iopage.page[DB_PAGESIZE], pgbuf_Guard, 8)  /* 896 */
#endif
er_log_debug ("cached scan buffer allocated")  /* 899 */
```

세부 사항:

- **`memset` 대신 `placement_new`** — 주석(888-889행)이 이유를 설명한다: `PGBUF_BCB`가 `std::atomic` 멤버(`atomic_latch`)를 품고 있어 raw `memset`이 `-Wclass-memaccess`를 유발한다. 값 초기화 효과는 동일.
- 891-892행의 **양방향 링크**가 `CAST_PGPTR_TO_BFPTR`의 assert를 통과시키는 핵심이다.
- 896행 가드 초기화는 `PGBUF_FIND_BUFFER_GUARD(bufptr)` = `&bufptr->iopage_buffer->iopage.page[DB_PAGESIZE]` (144-145행)과 정확히 같은 주소를 쓴다 (주석이 명시).
- OOM은 에러가 아니라 `NULL` 반환 → 호출자가 비캐시드 경로로 폴백. `heap_file.c:6455`에서 `scan_cache->local_cache_handle = pgbuf_copy_buffer_alloc ()`로 받고, `NULL`이면 캐시드 스캔을 쓰지 않는다.

### 2.4 `pgbuf_copy_buffer_free` (904-914행)

```
if handle != NULL:
    handle->dummy_bcb. ~ pgbuf_bcb ();   /* 910: placement new와 대칭인 명시적 소멸 */
free_and_init (handle);                  /* 912 */
```

주석(907-908행)이 "currently a no-op, but keeps construction/destruction symmetric if PGBUF_BCB members change"라고 밝힌다. `free_and_init`는 `NULL` 핸들에도 안전하므로 `if` 밖에 있다.

### 2.5 `pgbuf_copy_page_for_scan` (916-928행)

```
CAST_PGPTR_TO_IOPGPTR (src_iopage, src_pgptr)   /* 923: src는 fixed 상태여야 함 */
memcpy (&handle->iopage_buf.iopage, src_iopage, IO_PAGESIZE)   /* 924 */
CAST_PGPTR_TO_BFPTR (src_bcb, src_pgptr)        /* 927 */
handle->dummy_bcb.vpid = src_bcb->vpid          /* 928 */
```

`IO_PAGESIZE` 전체를 복사하므로 **`prv` 헤더(LSA, volid, pageid, ptype, pflag)까지 포함**된다. 그래서 사본 위에서 `pgbuf_get_page_ptype` / `pgbuf_get_lsa` / `pgbuf_get_tde_algorithm`이 정상 동작한다. 더미 BCB의 `vpid`도 별도로 동기화하므로 `pgbuf_get_vpid` / `pgbuf_get_page_id` / `pgbuf_get_volume_id`도 동작한다 (이 셋은 BCB의 `vpid`를 읽는다, 5161-5185, 5239-5251, 5289-5305행).

### 2.6 `pgbuf_copy_buffer_get_page_ptr` (930-934행)

```c
return (PAGE_PTR) handle->iopage_buf.iopage.page;
```

`CAST_BFPTR_TO_PGPTR`(165-169행)와 동일한 주소를 반환한다.

### 2.7 사본 버퍼에서 **동작하지 않는** API — 중요한 경계

더미 BCB는 `flags = 0`, `atomic_latch`의 `fcnt = 0`, hash/LRU 링크 전부 `NULL`이다. 따라서:

| API | 사본 버퍼에서 | 근거 |
|---|---|---|
| `pgbuf_get_vpid` / `_ptr`, `pgbuf_get_page_id`, `pgbuf_get_volume_id` | 동작 (단, 아래 주의) | BCB `vpid`만 읽음 (5161, 5191, 5239, 5289행) |
| `pgbuf_get_page_ptype`, `pgbuf_get_lsa`, `pgbuf_get_tde_algorithm` | 동작 | `prv` 헤더만 읽음 (5257, 4915, 5130행) |
| `pgbuf_get_fix_count` | 항상 0 반환 | `get_fcnt (&bufptr->atomic_latch)` (14981-14990행) |
| `pgbuf_get_latch_mode` | `PGBUF_NO_LATCH` 반환 | 5215-5228행 |
| `pgbuf_unfix`, `pgbuf_set_dirty`, `pgbuf_set_lsa`, `pgbuf_flush*` | **금지** | holder 리스트/LRU/hash 조작을 시도 |
| `pgbuf_is_valid_page_ptr` | **항상 false + ER_PB_UNKNOWN_PAGEPTR 치명 오류 + assert** | BCB 테이블 선형 탐색(11055-11081행)에서 못 찾음 → 11085-11089행 |

마지막 항이 실전에서 위험하다. `pgbuf_get_vpid` / `pgbuf_get_vpid_ptr` / `pgbuf_get_latch_mode` / `pgbuf_get_page_ptype` / `pgbuf_get_volume_id` / `pgbuf_get_lsa` / `pgbuf_set_page_ptype` / `pgbuf_set_dirty`는 모두 진입부에서 `pgbuf_get_check_page_validation_level (PGBUF_DEBUG_PAGE_VALIDATION_ALL)`을 검사하고, 참이면 `pgbuf_is_valid_page_ptr`를 호출한다 (5165-5172, 5195, 5219, 5262, 5293, 4919, 5439, 4881행). 따라서 **`PRM_ID_PB_DEBUG_PAGE_VALIDATION_LEVEL >= PGBUF_DEBUG_PAGE_VALIDATION_ALL` (=3)로 설정한 디버그 빌드에서 사본 버퍼 `PAGE_PTR`에 이 접근자들을 쓰면 `assert (false)` + `ER_PB_UNKNOWN_PAGEPTR`로 죽는다.** 기본값에서는 문제없고, 릴리스 빌드에서는 `pgbuf_get_check_page_validation_level`이 무조건 `false`이므로(10994-11001행) 무해하다. 사본 버퍼 API 계약으로 명문화될 가치가 있는 제약이다.

### 2.8 소비자 측 계약 (`heap_file.c`)

- 핸들은 `HEAP_SCANCACHE::local_cache_handle`에 살고 (`src/storage/heap_file.h:160`), 캐시드 스캔이 아니면 `NULL`.
- 캐시 히트 판정은 `VPID_EQ (&vpid, &scan_cache->local_cache_vpid)` (`heap_file.c:7562`) — 이때 **fix을 완전히 건너뛴다** (`goto slot_walk`, `heap_file.c:7565`). 이것이 CBRD-27041의 성능 이득 원천이다.
- 캐시 미스면 정상 fix → `pgbuf_copy_page_for_scan` → `local_cache_vpid` 갱신 (`heap_file.c:7636-7640`).
- **중요한 안전 계약**: 사본을 만든 뒤에도 원본 페이지의 watcher를 살려 둔다. `heap_file.c:7633-7635` 주석이 명시한다 — "Keep the live page fixed until a visible record is returned or traversal moves to another page, **so vacuum cannot deallocate the page while slots from the local copy are still being inspected**." 즉 사본 버퍼는 latch를 대체하지 않고, **fix 횟수만 줄이는 최적화**다. 사본이 가리키는 슬롯 오프셋이 여전히 유효하려면 페이지가 해제되지 않아야 한다.
- record-info 스캔(`get_rec_info`)은 캐시드 스캔을 쓰지 않는다 — `heap_get_record_info ()`가 `scan_cache->page_watcher`를 직접 역참조하며 살아 있는 fixed 페이지를 요구한다 (`heap_file.c:7556-7557` 주석).
- `PEEK` 모드 `recdes`가 사본 버퍼 메모리를 가리키는 것이 정당함을 별도 주석으로 보증한다 (`heap_file.c:25396-25399`).

---

## 3. 영역 복사 API

### 3.1 `pgbuf_copy_to_area` (4652-4755행)

페이지의 일부 구간만 사용자 버퍼로 복사한다. 흐름:

```
if logtb_get_check_interrupt ():                              /* 4657 */
    if logtb_is_interrupted (thread_p, true, &pgbuf_Pool.check_for_interrupts):
        er_set (ER_INTERRUPTED); return NULL                  /* 4659-4663 */
#if CUBRID_DEBUG
    범위 검사: start_offset < 0 || start_offset+length > DB_PAGESIZE -> ER_GENERIC_ERROR /* 4666-4676 */
#endif
hash_anchor = &buf_hash_table[PGBUF_HASH_VALUE (vpid)]
bufptr = pgbuf_search_hash_chain (thread_p, hash_anchor, vpid)   /* 4680 */
if bufptr == NULL:                    /* 비레지던트 */
    unlock hash_mutex                                          /* 4685 */
    if er_errid () == ER_CSS_PTHREAD_MUTEX_TRYLOCK: return NULL /* 4687-4690 */
    if do_fetch:
        pgptr = pgbuf_fix (OLD_PAGE, READ, UNCONDITIONAL)      /* 4695 */
        pgbuf_check_page_ptype (PAGE_AREA)   [!NDEBUG]         /* 4699 */
        memcpy (area, pgptr + start_offset, length); unfix     /* 4702-4703 */
    /* else 분기는 ENABLE_UNUSED_FUNCTION 안에 봉인 (4710-4733) */
else:                                 /* 레지던트: BCB 뮤텍스만 보유 */
    CAST_BFPTR_TO_PGPTR (pgptr, bufptr)                        /* 4739 */
    pgbuf_check_page_ptype (PAGE_AREA)   [!NDEBUG]             /* 4742 */
    memcpy (area, pgptr + start_offset, length)                /* 4745 */
    if thread_get_sort_stats_active (): PSTAT_SORT_NUM_DATA_PAGES++  /* 4747-4750 */
    PGBUF_BCB_UNLOCK (bufptr)                                  /* 4753 */
```

**가장 특이한 점**: 레지던트 경로에서 **latch를 전혀 잡지 않는다.** `pgbuf_search_hash_chain`이 BCB 뮤텍스를 잡은 채 반환하고, 그 뮤텍스 하나만으로 `memcpy`를 수행한 뒤 뮤텍스를 놓는다 (4739-4753행). BCB 뮤텍스는 페이지 내용 변경을 막지 않는다 (쓰기는 WRITE latch 보유자가 뮤텍스 없이 수행). 따라서 이 API는 **찢어진(torn) 읽기가 가능하다.** `PAGE_AREA` 타입 전용이라는 점 (4699, 4742행의 `pgbuf_check_page_ptype (PAGE_AREA)`)이 이를 정당화한다 — `PAGE_AREA`는 `pgbuf_copy_from_area`가 `NEW_PAGE`로 한 번 쓰고 로깅 없이 봉인하는 페이지 타입이므로, 동시 쓰기가 없다는 전제다.

- `ENABLE_UNUSED_FUNCTION` 안의 `do_fetch == false` 경로(4710-4733행)는 `fileio_read_user_area`로 버퍼 풀을 우회해 디스크에서 직접 읽는다. 현재 빌드에서 비활성.
- 함수 헤더 주석(4642-4645행)의 "it is only buffered when the value of `do_fetch` is false"는 **오기**다. 코드는 `do_fetch == true`일 때 버퍼링한다 (4693-4707행). 주석과 코드가 반대.

### 3.2 `pgbuf_copy_from_area` (4784-4859행)

시그니처: `(thread_p, vpid, start_offset, length, area, do_fetch, tde_algo)`.

```
assert (start_offset >= 0 && start_offset + length <= DB_PAGESIZE)   /* 4792 */
#if ENABLE_UNUSED_FUNCTION
    ... do_fetch == false 시 fileio_write_user_area로 직접 쓰기 (4794-4837) ...
#endif
pgptr = pgbuf_fix (vpid, NEW_PAGE, PGBUF_LATCH_WRITE, UNCONDITIONAL)  /* 4839 */
if pgptr != NULL:
    pgbuf_set_page_ptype (thread_p, pgptr, PAGE_AREA)                 /* 4842 */
    pgbuf_set_tde_algorithm (thread_p, pgptr, tde_algo, true)         /* 4843: skip_logging */
    memcpy (pgptr + start_offset, area, length)                       /* 4845 */
    addr = {vfid=NULL, pgptr=pgptr, offset=0}
    log_skip_logging (thread_p, &addr)                                /* 4851 */
    pgbuf_set_dirty (thread_p, pgptr, FREE)                           /* 4852 */
```

특징:

- `ENABLE_UNUSED_FUNCTION` 블록이 비활성이므로 **실효 동작은 `do_fetch` 인자를 완전히 무시**한다. 항상 `NEW_PAGE`로 fix하고, 항상 버퍼 풀을 경유한다.
- `NEW_PAGE`로 fix하므로 **디스크에서 읽지 않는다** — `start_offset` 앞뒤 영역은 초기화 상태(`pgbuf_claim_bcb_for_fix`의 NEW_PAGE 분기, 8548-8570행)로 남는다. 부분 갱신이 아니라 **전체 재작성** 의미론.
- `log_skip_logging` (4851행)으로 로깅을 명시적으로 억제한다. 함수 헤더의 경고(4779-4781행)가 이유를 밝힌다: "If you do not buffer the page, not header recovery information is copied along with the write of the page. In this case, the page may not be able to be recovered. **DO NOT USE THIS FEATURE IF YOU LOGGED ANYTHING RELATED TO THIS PAGE.**"
- TDE 설정도 `skip_logging = true`로 넘긴다 (4843행) — 페이지 자체가 로깅되지 않으므로 TDE 비트 변경도 로깅할 이유가 없다. 일관성 있는 선택.
- `pgbuf_set_dirty (..., FREE)`로 unfix까지 처리 (4852행).

---

## 4. 페이지 메타 접근자

### 4.1 공통 패턴

거의 모든 접근자가 동일한 3단 구조를 가진다:

```
1) if pgbuf_get_check_page_validation_level (PGBUF_DEBUG_PAGE_VALIDATION_ALL):
       if !pgbuf_is_valid_page_ptr (pgptr): return <실패값>
2) /* NOTE: Does not need to hold mutex since the page is fixed */
3) CAST_PGPTR_TO_BFPTR 또는 CAST_PGPTR_TO_IOPGPTR 후 필드 읽기
```

2단계 주석 — "**페이지가 fixed 상태이므로 뮤텍스가 불필요하다**" — 이 이 그룹 전체의 핵심 계약이다 (4923, 4964, 5177, 5203, 5227, 5251, 5271, 5301, 5319행에 반복 등장). fix 카운트가 양수인 동안 BCB는 재사용/victim 대상이 아니므로 `vpid`, `iopage_buffer` 포인터, `prv` 헤더가 안정적이다.

실패값은 반환형에 따라 다르다:

| 함수 | 라인 | 실패값 | 읽는 위치 |
|---|---|---|---|
| `pgbuf_get_lsa` | 4915-4931 | `NULL` | `iopage->prv.lsa` (주소 반환) |
| `pgbuf_get_vpid` | 5161-5178 | `VPID_SET_NULL(out)` | `bufptr->vpid` (복사) |
| `pgbuf_get_vpid_ptr` | 5191-5207 | `NULL` | `&bufptr->vpid` (주소) |
| `pgbuf_get_latch_mode` | 5215-5229 | `PGBUF_LATCH_INVALID` | `get_latch (&bufptr->atomic_latch)` |
| `pgbuf_get_page_id` | 5239-5251 | (검사 없음) | `bufptr->vpid.pageid` |
| `pgbuf_get_page_ptype` | 5257-5281 | `PAGE_UNKNOWN` | `bufptr->iopage_buffer->iopage.prv.ptype` |
| `pgbuf_get_volume_id` | 5289-5306 | `NULL_VOLID` | `bufptr->vpid.volid` |
| `pgbuf_get_volume_label` | 5313-5324 | (검사 없음) | `fileio_get_volume_label (volid, PEEK)` |

`pgbuf_get_vpid_ptr`의 주석(5186-5189행)은 수명 위험을 경고한다: "Once the buffer is freed, the content of the vpid pointer may be updated by the page buffer manager... Once the page is freed, the vpid pointer should not be used any longer." **호출자가 unfix 이후 이 포인터를 쓰면 다른 페이지의 VPID를 보게 된다.**

`pgbuf_get_page_id`(5239-5251행)와 `pgbuf_get_volume_label`(5313-5324행)만 유효성 검사 진입부가 없고, 대신 `assert (pgbuf_check_bcb_page_vpid (bufptr, false) == true)` (5246행) 또는 `assert (!VPID_ISNULL (&bufptr->vpid))` (5321행)를 쓴다. `pgbuf_get_page_ptype`은 둘 다 한다 — 검증 레벨 검사(5262행) + `assert_release (pgbuf_check_bcb_page_vpid (...))` (5273행) + ptype 범위 assert (5277-5278행).

### 4.2 `pgbuf_set_lsa` (4943-5033행) — 가장 복잡한 setter

```
검증 레벨 검사 -> pgbuf_is_valid_page_ptr                          /* 4952-4958 */
assert (lsa_ptr != NULL)                                            /* 4960 */
CAST_PGPTR_TO_BFPTR (bufptr, pgptr)

/* [규칙 1] temp LSA 또는 auxiliary 볼륨이면 LSA 변경 자체를 거부 */
if pgbuf_is_temp_lsa (bufptr->...prv.lsa) || PGBUF_IS_AUXILIARY_VOLUME (vpid.volid):
    return NULL                                                     /* 4971-4975 */

/* [규칙 2] temp 볼륨이면 LSA를 강제로 temp LSA로 되돌림 */
if pgbuf_is_temporary_volume (bufptr->vpid.volid):
    pgbuf_init_temp_page_lsa (&...iopage, IO_PAGESIZE)               /* 4983 */
    if logtb_is_current_active (thread_p): return NULL               /* 4984-4987 */

fileio_set_page_lsa (&...iopage, lsa_ptr, IO_PAGESIZE)               /* 4990 */

/* [규칙 3] oldest_unflush_lsa 최초 설정 + 체크포인트 역행 검사 */
if LSA_ISNULL (&bufptr->oldest_unflush_lsa):
    if LSA_LT (lsa_ptr, &log_Gl.chkpt_redo_lsa):
        chkpt_lsa_lock 하에 chkpt_redo_lsa 재확인                    /* 5004-5006 */
        if LSA_LT (lsa_ptr, &chkpt_redo_lsa):
            er_stack_push/pop로 ER_LOG_CHECKPOINT_SKIP_INVALID_PAGE  /* 5010-5016 */
            assert (false)                                           /* 5018 */
    LSA_COPY (&bufptr->oldest_unflush_lsa, lsa_ptr)                  /* 5022 */

#if defined (NDEBUG)
    pgbuf_set_dirty_buffer_ptr (thread_p, bufptr)                    /* 5030 */
#endif
```

두 가지 주목할 설계:

1. **규칙 3의 `oldest_unflush_lsa` 지연 설정** (5016-5022행 주변 주석): "If this is the first time the page is set dirty, record the new LSA of the page as the `oldest_unflush_lsa`... We could have placed these feature when the page is set dirty, unfortunately, **some pages are set dirty before an LSA is set**." — dirty 마킹 시점이 아니라 LSA 설정 시점에 처리하는 이유.
2. **`#if defined (NDEBUG)`로 감싼 `pgbuf_set_dirty_buffer_ptr`** (5024-5031행): 주석이 의도를 정확히 말한다 — "We expect the page was or will be set as dirty before unfix. However, there might be a missing case... **It is correct to set dirty here. But we also want to find missing cases and fix them. Make everything sure for release builds.**" 즉 **릴리스는 자동 보정, 디버그는 누락 노출**이라는 비대칭 안전장치. 디버그 빌드에서 LSA만 설정하고 dirty를 안 걸면 별도 assert에 걸리게 된다.
3. 함수 헤더(4939행): "This function is **for the exclusive use of the log and recovery manager**."

### 4.3 `pgbuf_set_page_ptype` (5433-5464행)

```
assert (pgptr != NULL)
검증 레벨 검사 -> pgbuf_is_valid_page_ptr; 실패 시 assert(false) + return   /* 5439-5446 */
CAST_PGPTR_TO_BFPTR; assert (!VPID_ISNULL (&bufptr->vpid))
pgbuf_set_bcb_page_vpid (bufptr)                     /* 5452: prv 헤더 최초 초기화 */
if pgbuf_check_bcb_page_vpid (bufptr, false) != true: assert(false); return  /* 5454-5458 */
bufptr->iopage_buffer->iopage.prv.ptype = (unsigned char) ptype        /* 5460 */
assert_release (bufptr->...prv.ptype == ptype)        /* 5462 */
```

`pgbuf_set_bcb_page_vpid` 선행 호출(5452행)이 핵심이다 — `NEW_PAGE`로 fix한 페이지는 `prv.volid/pageid`가 `-1`이므로(8563-8568행), ptype을 설정하기 전에 먼저 BCB의 `vpid`를 `prv`로 밀어 넣어야 이후 `pgbuf_check_bcb_page_vpid`가 통과한다.

`assert_release`(5462행)는 릴리스 빌드에서도 살아 있는 assert다 — `unsigned char`로의 좁힘 변환이 값을 훼손했는지 검사.

### 4.4 `pgbuf_set_bcb_page_vpid` (5389-5430행)

```
if bufptr == NULL || VPID_ISNULL (&bufptr->vpid): assert 2회 + return   /* 5392-5397 */
if bufptr->vpid.volid > NULL_VOLID:      /* perm 볼륨만 */
    if prv.pageid == NULL_PAGEID && prv.volid == NULL_VOLID:   /* 최초 */
        prv.pageid = vpid.pageid; prv.volid = vpid.volid       /* 5406-5407 */
        prv.ptype = PAGE_UNKNOWN
        prv.p_reserve_1 = 0; prv.p_reserve_2 = 0; prv.tde_nonce = 0   /* 5410-5413 */
    else:
        /* values not reset upon page deallocation */
        assert (prv.volid == vpid.volid); assert (prv.pageid == vpid.pageid)  /* 5418-5419 */
```

**`prv.tde_nonce = 0`을 여기서 초기화한다** (5413행) — TDE nonce는 `prv` 헤더의 일부이고, 페이지 신원 확정 시점에 리셋된다. 같은 초기화가 BCB 테이블 생성 시(5608행)와 `pgbuf_scramble`(11244행)에도 있다.

else 분기의 주석 "values not reset upon page deallocation" (5417행)은 dealloc이 `prv.volid/pageid`를 지우지 않는다는 사실을 근거로 두 번째 이후 호출에서 값이 일치해야 함을 assert한다. 실제로 `pgbuf_dealloc_page`는 `ptype`과 `pflag`만 지운다 (15159-15162행).

### 4.5 `pgbuf_check_page_ptype` 계열 (11100-11178행)

```
pgbuf_check_page_ptype (thread_p, pgptr, ptype)
    -> pgbuf_check_page_ptype_internal (pgptr, ptype, no_error = false)   /* 11108 */
pgbuf_check_page_type_no_error (thread_p, pgptr, ptype)
    -> pgbuf_check_page_ptype_internal (pgptr, ptype, no_error = true)    /* 11124 */
```

`pgbuf_check_page_ptype_internal` (11136-11178행):

```
if pgptr == NULL: assert(false); return false                       /* 11140-11144 */
#if defined (NDEBUG)
    if log_is_in_crash_recovery (): return true                      /* 11148-11152: 복구 중 무조건 통과 */
#endif
검증 레벨 검사 -> pgbuf_is_valid_page_ptr                            /* 11154-11160 */
CAST_PGPTR_TO_BFPTR; assert (!VPID_ISNULL (&bufptr->vpid))
if pgbuf_check_bcb_page_vpid (bufptr, false):
    if prv.ptype != PAGE_UNKNOWN && prv.ptype != ptype:
        assert_release (no_error); return false                       /* 11167-11168 */
else:
    assert_release (false); return false                              /* 11172-11173 */
return true
```

세 가지 관용(tolerance):

1. **`PAGE_UNKNOWN`은 항상 통과** (11166행) — 아직 타입이 설정되지 않은 새 페이지/해제된 페이지.
2. **릴리스 빌드에서 크래시 복구 중이면 무조건 통과** (11146-11152행). `/* TODO - do not delete me */` 주석(11145행)이 붙어 있다. 복구 중에는 ptype이 일시적으로 불일치할 수 있다는 인정.
3. `no_error = true`면 `assert_release (true)`가 되어 assert가 발동하지 않고 `false`만 반환한다 (11167행). 이것이 `_no_error` 변형의 유일한 차이다 — 영리한 구현이다.

### 4.6 `pgbuf_get_fix_count` / `pgbuf_get_hold_count`

- `pgbuf_get_fix_count` (14981-14990행): `get_fcnt (&bufptr->atomic_latch)`. **페이지 전역 fix 카운트** (모든 스레드 합).
- `pgbuf_get_hold_count` (14999-15003행): `pgbuf_Pool.thrd_holder_info[thread_get_entry_index (thread_p)].num_hold_cnt`. **현재 스레드가 잡고 있는 서로 다른 페이지 개수**. 완전히 다른 축이다.

### 4.7 `pgbuf_has_any_waiters` / `pgbuf_has_any_non_vacuum_waiters` / `pgbuf_has_prevent_dealloc`

세 함수 모두 `SERVER_MODE`가 아니면 `false`를 반환한다 (14627, 14659, 14678행).

`pgbuf_has_any_waiters` (14606-14629행):

```
CAST_PGPTR_TO_BFPTR (bufptr, pgptr)
PGBUF_BCB_LOCK (bufptr)                                  /* 14622: 뮤텍스 취득 */
has_waiter = pgbuf_is_exist_blocked_reader_writer (bufptr)
PGBUF_BCB_UNLOCK (bufptr)
```

주석 "/* note: we rule out flush waiters here */" (14615행) — flush 대기자는 세지 않는다. `pgbuf_is_exist_blocked_reader_writer`가 latch 대기 큐만 훑는다.

`pgbuf_has_any_non_vacuum_waiters` (14633-14661행)는 **뮤텍스를 잡지 않고** `bufptr->next_wait_thrd` 링크드 리스트를 순회하며 `thread_entry_p->type != TT_VACUUM_WORKER`를 찾는다 (14648-14656행). 락 없는 리스트 순회이므로 근본적으로 경합에 노출된 근사값이다 — 이름이 `has_any_*`인 만큼 힌트로만 쓰인다는 계약. 두 함수의 동기화 강도 차이(하나는 뮤텍스, 하나는 없음)는 문서화되지 않은 비대칭이다.

`pgbuf_has_prevent_dealloc` (14670-14684행)은 `pgbuf_bcb_should_avoid_deallocation (bufptr)` 위임. 함수 헤더 주석(14665행)이 "Quick check if page has any **scanners**"라고 하는데 반환 설명은 "True if page has any **waiters**"로 되어 있다 — 주석 복붙 오류.

---

## 5. Temp 페이지 특수 규칙

### 5.1 두 개의 독립적인 "temp" 판정 축

| 축 | 함수 | 판정 근거 | 라인 |
|---|---|---|---|
| **볼륨 목적** | `pgbuf_is_temporary_volume (volid)` | `xdisk_get_purpose (NULL, volid) == DB_TEMPORARY_DATA_PURPOSE` | 5493-5504 |
| **페이지 LSA 마커** | `pgbuf_is_temp_lsa (lsa)` | `lsa == PGBUF_TEMP_LSA` | 17260-17264 |

`PGBUF_TEMP_LSA`는 헤더에 정의된 상수 `{NULL_LOG_PAGEID - 1, NULL_LOG_OFFSET - 1}` (`page_buffer.h:260`) — 즉 `{-2, -2}`. `pgbuf_reset_temp_lsa`의 주석(5036행)이 "(-2,-2)"로 명시한다.

`pgbuf_is_lsa_temporary` (5471-5484행)는 **둘 중 하나라도 참이면 참**:

```c
if (pgbuf_is_temp_lsa (bufptr->iopage_buffer->iopage.prv.lsa)
    || pgbuf_is_temporary_volume (bufptr->vpid.volid) == true)
  return true;
```

두 축이 필요한 이유: 영구 볼륨에 사는 페이지도 LSA 마커로 "복구 불가"를 선언할 수 있다 (`pgbuf_set_lsa_as_temporary`, 5372-5384행). 반대로 temp 볼륨의 페이지는 볼륨 자체로 판정된다.

### 5.2 `pgbuf_is_temporary_volume`의 부팅 시점 예외 (5493-5504행)

```c
STATIC_INLINE bool
pgbuf_is_temporary_volume (VOLID volid)
{
  /* TODO: I don't know why page buffer should care about temporary files and what this does, but it is really
   * annoying. until database is loaded and restarted, I will return false always. */
  if (!LOG_ISRESTARTED ())
    {
      return false;
    }
  return xdisk_get_purpose (NULL, volid) == DB_TEMPORARY_DATA_PURPOSE;
}
```

**부팅/복구 중에는 모든 볼륨이 non-temp로 보인다.** 이는 광범위한 파급 효과를 갖는다 — 복구 중에는 temp 페이지가 WAL 규칙, LRU 승격 억제, DWB 우회, temp LSA 강제 등 모든 특수 처리를 받지 못하고 일반 페이지로 취급된다. 주석의 어조("it is really annoying")가 이것이 설계라기보다 실용적 회피임을 시사한다. `xdisk_get_purpose`가 부팅 초기에 카탈로그/볼륨 헤더를 필요로 하므로 재귀적 fix 위험을 피하려는 조치로 보인다.

또한 이 함수는 `INLINE ... ALWAYS_INLINE` (1092행)로 선언됐지만 매 호출마다 `xdisk_get_purpose`를 부른다 — 캐시가 없다. `PGBUF_SHOULD_IGNORE_UNFIX`(291-292행)를 통해 **모든 unfix의 핫 패스에서 호출**되므로, `xdisk_get_purpose`의 비용이 pgbuf 성능에 직결된다.

### 5.3 `PGBUF_TEMP_LSA` 설정 지점 — `pgbuf_init_temp_page_lsa` (17266-17273행)

```c
static void
pgbuf_init_temp_page_lsa (FILEIO_PAGE * io_page, PGLENGTH page_size)
{
  io_page->prv.lsa = PGBUF_TEMP_LSA;
  FILEIO_PAGE_WATERMARK *prv2 = fileio_get_page_watermark_pos (io_page, page_size);
  prv2->lsa = PGBUF_TEMP_LSA;
}
```

**LSA를 두 곳에 쓴다** — 헤더의 `prv.lsa`와 페이지 끝의 워터마크 `prv2->lsa`. 워터마크는 fileio의 부분 쓰기(torn page) 검출 메커니즘이므로, temp 마커도 양쪽 일관성을 유지해야 한다. 이 이중 쓰기가 `fileio_init_lsa_of_page`(일반 페이지용)와 대응된다.

### 5.4 temp 페이지가 다르게 취급되는 모든 지점

| # | 지점 | 라인 | 동작 |
|---|---|---|---|
| 1 | **read 후 최초 접근** | 8515-8522 | temp 볼륨인데 LSA가 temp LSA가 아니면 `pgbuf_init_temp_page_lsa` + `pgbuf_set_dirty_buffer_ptr`. "Check if the first time to access" |
| 2 | **NEW_PAGE 초기화** | 8554-8561 | temp 볼륨이면 `pgbuf_init_temp_page_lsa`, 아니면 `fileio_init_lsa_of_page` |
| 3 | **`pgbuf_set_lsa` 거부** | 4971-4975 | temp LSA거나 auxiliary 볼륨이면 LSA 변경 자체를 거부하고 `NULL` 반환 |
| 4 | **`pgbuf_set_lsa` 강제 복원** | 4981-4987 | temp 볼륨이면 LSA를 temp LSA로 되돌림. 활성 트랜잭션이면 그 자리에서 `NULL` 반환 |
| 5 | **LRU 승격 억제 (`PGBUF_SHOULD_IGNORE_UNFIX`)** | 291-292, 6705, 6734, 6769 | LRU 1/2/3 존 모두에서 boost/private→shared 이동을 건너뜀 |
| 6 | **DWB 우회** | 10743 | `uses_dwb = dwb_is_created () && !is_temp` — temp 페이지는 이중 쓰기 버퍼를 쓰지 않음 |
| 7 | **WAL 미로깅 경고 억제** | 10790-10797 | `oldest_unflush_lsa`가 NULL인데 flush할 때, temp가 아니면 `er_log_debug` 경고. temp면 침묵 |
| 8 | **체크포인트 flush 제외** | 4202-4208 | `pgbuf_flush_chkpt_seq_list`에서 `pgbuf_is_temporary_volume`이면 `continue` |
| 9 | **TDE nonce/키 파생** | 8498, 10751 | `tde_(de|en)crypt_data_page`에 `is_temp` 인자 전달 |
| 10 | **latchless 전용 API** | 2659, 2751 | `pgbuf_simple_fix`는 `assert (pgbuf_is_temporary_volume (vpid->volid))`로 temp 전용임을 강제 |
| 11 | **`pgbuf_dealloc_temp_page`** | 2765-2790 | invalidate 없이 ptype/pflag 초기화 + dirty 해제 + fcnt-- |
| 12 | **`pgbuf_unfix` 미로깅 경고 제외** | 3079-3081 | `CUBRID_DEBUG`에서 dirty인데 미로깅 경고를 낼 때 temp LSA와 auxiliary 볼륨은 제외 |
| 13 | **snapshot 통계 분류** | 17317-17325 | temp 볼륨 페이지는 `num_temp_pages`로만 세고 index/data/system 분류를 하지 않음 |

### 5.5 `PGBUF_SHOULD_IGNORE_UNFIX` — LRU 승격 억제 (285-295행)

```c
#if defined (SERVER_MODE)
/* vacuum workers, checkpoint thread and temp pages should not contribute to promoting a bcb as active/hot */
#define PGBUF_SHOULD_IGNORE_UNFIX(th, buf) \
  (VACUUM_IS_THREAD_VACUUM_WORKER (th) || pgbuf_is_temporary_volume (buf->vpid.volid))
#else
#define PGBUF_SHOULD_IGNORE_UNFIX(th, buf) false
#endif
```

**vacuum 워커와 temp 페이지를 동일하게 취급한다** — 둘 다 "이 페이지가 뜨겁다"는 신호를 만들지 않아야 한다. 근거는 다르다: vacuum은 사용자 워크로드를 대표하지 않고, temp 페이지는 짧은 수명이라 캐시에 오래 남을 이유가 없다.

별도로 `PGBUF_VACUUM_SHOULD_IGNORE_UNFIX(th)` (283-287행)가 vacuum만 검사하는 변형으로 존재한다. 두 매크로의 사용처가 갈린다 — void 존 처리(`pgbuf_unlatch_void_zone_bcb`)는 vacuum 전용 변형을 쓰고, LRU 1/2/3 존은 temp까지 포함하는 변형을 쓴다.

`pgbuf_unlatch_bcb_upon_unfix`의 존별 처리 (6693-6800행):

```
zone = pgbuf_bcb_get_zone (bufptr)
switch (zone):
  PGBUF_VOID_ZONE:    pgbuf_unlatch_void_zone_bcb ()                    /* 6700 */
  PGBUF_LRU_1_ZONE:   if PGBUF_SHOULD_IGNORE_UNFIX: PSTAT_PB_UNFIX_LRU_ONE_KEEP_VAC++; break  /* 6705-6712 */
                      ... private->shared 이동 또는 hit 등록
  PGBUF_LRU_2_ZONE:   if PGBUF_SHOULD_IGNORE_UNFIX: PSTAT_PB_UNFIX_LRU_TWO_KEEP_VAC++; break  /* 6734-6741 */
                      ... boost (충분히 오래됐으면)
  PGBUF_LRU_3_ZONE:   if PGBUF_SHOULD_IGNORE_UNFIX:                     /* 6769 */
                          victim 가능하면 pgbuf_assign_direct_victim ()  /* 6771-6779 */
                          -> PSTAT_PB_VICTIM_ASSIGN_DIRECT_VACUUM_LRU
                          else PSTAT_PB_UNFIX_LRU_THREE_KEEP_VAC++
                      ... boost
```

**LRU 3 존이 특별하다** (6769-6784행): 승격을 억제하는 것에 그치지 않고 **즉시 direct victim으로 넘긴다.** temp 페이지/vacuum 페이지가 이미 LRU 바닥에 있다면 재사용을 기다릴 이유가 없다는 판단. 통계 이름이 `*_VAC` 접미사인데 temp 페이지도 같은 카운터를 증가시킨다 — 통계 이름이 실제 의미보다 좁다.

### 5.6 temp 전용 latchless API — `pgbuf_simple_fix` / `pgbuf_simple_unfix` (2651-2760행)

`pgbuf_simple_fix` 헤더 경고(2643-2649행):

> WARNING: This is only for reading temporary file. if bcb is on buffer, only fcnt++. **it is latchless and LRU mutexless.** Even if it is a temporary file, it can be a problem if there is a write operation. **Cannot be mixed with general FIX(LATCH).**

`assert (pgbuf_is_temporary_volume (vpid->volid))` (2659행)로 오용을 막는다.

동작:

```
hash 탐색 -> 미스면 pgbuf_lock_page + pgbuf_claim_bcb_for_fix + insert + unlock_page
            add_fcnt (&bufptr->atomic_latch, 1)                        /* 2687 */
            LRU에 신규 추가 (private면 top, 아니면 shared middle)      /* 2691-2700 */
       -> 히트면 direct victim 상태 조정 후 add_fcnt (..., 1)          /* 2718-2732 */
```

`add_fcnt`만 하고 **latch mode를 전혀 설정하지 않으며 holder 엔트리도 만들지 않는다.** 따라서:

- `pgbuf_get_hold_count`에 반영되지 않는다.
- `pgbuf_unfix`로 해제할 수 없다 (holder를 찾지 못함) — 반드시 `pgbuf_simple_unfix`를 써야 한다.
- `pgbuf_tracker`에 등록되지 않으므로 누출 검출 대상이 아니다.
- "Cannot be mixed with general FIX(LATCH)" 계약이 이 모든 것의 요약이다.

`pgbuf_simple_unfix` (2745-2757행)는 BCB 뮤텍스만 잡고 `add_fcnt (..., -1)`.

`pgbuf_dealloc_temp_page` (2765-2790행):

```
PGBUF_BCB_LOCK (bufptr)
prv.ptype = PAGE_UNKNOWN                                   /* 2777 */
prv.pflag = 0                    /* TDE 비트도 함께 소거 */  /* 2779 */
pgbuf_bcb_clear_dirty (thread_p, bufptr)                   /* 2782 */
if need_free: add_fcnt (..., -1); assert (get_fcnt (...) == 0)   /* 2786-2788 */
PGBUF_BCB_UNLOCK (bufptr)
```

일반 `pgbuf_dealloc_page`(15135-15173행)와 대조하면 차이가 명확하다: **로깅 없음, undo 데이터 저장 없음, LRU 바닥 이동 없음, dirty 설정이 아니라 dirty 해제.** temp 페이지는 복구 대상이 아니므로 디스크에 쓸 필요조차 없다는 것.

---

## 6. 관측성 (Observability)

### 6.1 세 계층 구조

pgbuf의 통계는 **세 개의 독립된 계층**으로 나뉜다:

| 계층 | 저장소 | 수집 방식 | 노출 경로 |
|---|---|---|---|
| **PGBUF_STATUS** (per-thread) | `pgbuf_Pool.show_status[]` | 스레드별 슬롯에 원자성 없이 증가 | `SHOW PAGE BUFFER STATUS` |
| **PGBUF_STATUS_SNAPSHOT** | `pgbuf_Pool.show_status_snapshot` | BCB 테이블 전수 스캔 (락 없음) | `SHOW PAGE BUFFER STATUS` |
| **perfmon (PSTAT_PB_\*)** | perf_monitor 모듈 | `perfmon_inc_stat` 등 | `SHOW EXEC STATISTICS`, `cubrid statdump` |

추가로 `pgbuf_peek_stats`(14686-14783행)와 `pgbuf_daemons_get_stats`(17215-17243행)가 perfmon의 pull 방식 게이지 소스로 존재한다.

### 6.2 `PGBUF_STATUS` — 64바이트 정렬 per-thread 샤딩 (395-404행)

```c
struct alignas (64) pgbuf_status
{
  unsigned long long num_hit;
  unsigned long long num_page_request;
  unsigned long long num_pages_created;
  unsigned long long num_pages_written;
  unsigned long long num_pages_read;
  unsigned int num_flusher_waiting_threads;
  unsigned int dummy;
};
```

필드 합은 40 + 8 = 48바이트인데 `alignas (64)`로 `sizeof`가 64로 올라간다. `dummy`는 명시적 패딩. 할당부(1847-1857행):

```c
/* cache-line aligned so each per-thread slot owns its own line (no false sharing) */
pgbuf_Pool.show_status =
  (PGBUF_STATUS *) cub_aligned_alloc (64, sizeof (PGBUF_STATUS) * (thread_num_total_threads () + 1),
                                      __FILE__, __LINE__);
memset (pgbuf_Pool.show_status, 0, sizeof (PGBUF_STATUS) * (thread_num_total_threads () + 1));
```

**한 스레드 슬롯 = 정확히 한 캐시 라인.** 배열 시작 주소도 64로 정렬되므로 슬롯 경계가 라인 경계와 일치한다. `+1`은 시스템/메인 스레드 슬롯.

인덱싱은 전부 `pgbuf_Pool.show_status[thread_get_entry_index (thread_p)]`로, 함수 진입부에서 한 번 계산해 로컬 포인터에 담는다 (2234, 8142, 8358, 10690행). 원자 연산이 전혀 없다 — **단일 작성자 샤딩**이므로 필요 없다.

증가 지점:

| 필드 | 라인 | 조건 |
|---|---|---|
| `num_page_request` | 2569 | 모든 `pgbuf_fix` 성공 경로 |
| `num_hit` | 2327, 2348 | 버퍼에서 발견 (2개 경로) |
| `num_hit` | 8577 | **NEW_PAGE 생성도 hit으로 계산** |
| `num_pages_created` | 8576 | NEW_PAGE |
| `num_pages_read` | 8445 | `fetch_mode != NEW_PAGE`, 실제 IO 시도 전 |
| `num_pages_written` | 10828 | **비-DWB 경로에서만** |
| `num_flusher_waiting_threads` | 8254 / 8258 | victim 대기 진입/이탈 (게이지) |

두 가지 관측성 공백이 있다:

1. **`num_pages_read`는 실제 디스크 IO 수가 아니다** (8445행). `dwb_read_page`로 DWB에서 복사해 온 경우도 세고, `fileio_read` 실패 시에도 이미 증가한 상태다. 반면 같은 위치의 `PSTAT_PB_NUM_IOREADS`(8444행)도 동일한 문제를 공유한다.
2. **`num_pages_written`은 DWB 경유 쓰기를 누락한다** (10828행). `uses_dwb == true`면 `dwb_add_page` 분기(10817-10827행)로 가고 `show_status->num_pages_written++`는 `else` 분기(10826-10838행)에만 있다. 즉 **DWB가 켜져 있으면 `Num_pages_written`과 `Pages_written_rate`가 0에 가깝게 나온다.** `PSTAT_PB_NUM_IOWRITES`(10833행)도 동일하게 누락된다.

### 6.3 `PGBUF_STATUS_SNAPSHOT` — 락 없는 전수 스캔 (406-416, 17276-17352행)

```c
struct pgbuf_status_snapshot
{
  unsigned int free_pages, victim_candidate_pages, clean_pages, dirty_pages;
  unsigned int num_index_pages, num_data_pages, num_system_pages, num_temp_pages;
};
```

`pgbuf_scan_bcb_table` (17279-17352행) 의사코드:

```
memset (show_status_snapshot, 0, sizeof (...))            /* 17288 */
for bufid in 0 .. num_buffers-1:
    bufptr = PGBUF_FIND_BCB_PTR (bufid)
    page_type = bufptr->iopage_buffer->iopage.prv.ptype    /* 락 없음 */
    vpid = bufptr->vpid
    flags = bufptr->flags                                  /* volatile int 단일 읽기 */

    dirty_pages++ 또는 clean_pages++                       /* 17296-17304 */
    if flags & PGBUF_INVALID_ZONE: free_pages++; continue  /* 17306-17310 */
    if GET_ZONE (flags) == LRU_3 && (flags & DIRTY): victim_candidate_pages++  /* 17312-17315 */

    if pgbuf_is_temporary_volume (vpid.volid):
        num_temp_pages++
        assert (page_type in {UNKNOWN, AREA, QRESULT, EHASH, VOLHEADER, VOLBITMAP, FTAB})  /* 17322-17325 */
    else:
        switch page_type:
          BTREE                          -> num_index_pages++
          OVERFLOW, HEAP                 -> num_data_pages++
          CATALOG, VOLBITMAP, VOLHEADER,
          FTAB, EHASH, VACUUM_DATA,
          DROPPED_FILES                  -> num_system_pages++
          default                        -> assert (page_type == PAGE_UNKNOWN)  /* 17352 */
```

함수 이름 자체가 계약을 밝힌다: "scan bcb table to count snapshot data **with no bcb mutex**" (17277행). `flags`를 로컬 변수에 한 번만 읽어(17293행) 같은 반복 안에서 일관된 값을 쓰는 것이 유일한 방어다. `bufptr->flags`가 `volatile int` (522행)이므로 최적화로 재읽기가 발생하지 않는다.

세 가지 분류 정의가 특이하다:

- **`dirty_pages` + `clean_pages`가 invalid 존까지 포함한다** (17296-17304행이 `continue`보다 앞). 따라서 `dirty + clean == num_buffers`이고, `free_pages`는 그중 일부와 중복 계산된다. `Clean_pages`를 "사용 가능한 깨끗한 페이지"로 읽으면 틀린다.
- **`victim_candidate_pages`는 "LRU 3 존 && dirty"** (17312행). 이는 pgbuf 내부의 실제 victim 후보 정의(`pgbuf_is_bcb_victimizable`, 9239행 이하)와 다르다. 내부 정의는 clean이어야 victim이 되는데, 여기서는 dirty를 센다. 실제 의미는 "flush되어야 victim이 될 수 있는 페이지 수"에 가깝다. 실제 후보 수는 `pgbuf_peek_stats`가 `lru_list[i].count_vict_cand` 합으로 별도 제공한다 (14753-14757행).
- temp 페이지에 대한 assert(17322-17325행)는 페이지 타입 화이트리스트다. temp 볼륨에 예상 외 타입이 나타나면 디버그 빌드가 죽는다. 주석이 각 타입이 왜 허용되는지 설명한다 (dealloc 페이지는 `PAGE_UNKNOWN`, `AREA`/`QRESULT`는 순수 temp, `EHASH`/`VOLHEADER`/`VOLBITMAP`/`FTAB`은 temp일 수도 perm일 수도).

### 6.4 `SHOW PAGE BUFFER STATUS` — 노출 컬럼 전체 (19개)

컬럼 정의는 `src/parser/show_meta.c:691-723`, 값 생성은 `pgbuf_start_scan` (17367-17535행). `only_for_dba = true` (`show_meta.c:720`) — **DBA 전용**. 정렬은 1번 컬럼 오름차순.

| # | 컬럼 | 타입 | 값 출처 | 의미 |
|---|---|---|---|---|
| 1 | `Hit_rate` | `numeric(13,10)` | 17425-17427 | `(Δnum_hit / Δnum_page_request) * 100`. **마지막 SHOW 이후의 구간 히트율** |
| 2 | `Num_hit` | `bigint` | 17438 | Δ (마지막 SHOW 이후 증가분) |
| 3 | `Num_page_request` | `bigint` | 17442 | Δ |
| 4 | `Pool_size` | `int` | 17445 | `pgbuf_Pool.num_buffers` (누적값 아님) |
| 5 | `Page_size` | `int` | 17448 | `PGBUF_IOPAGE_BUFFER_SIZE` — **`IO_PAGESIZE`가 아니라 BCB iopage 슬롯 크기** (헤더 + `CUBRID_DEBUG` 가드 포함) |
| 6 | `Free_pages` | `int` | 17451 | snapshot: invalid 존 BCB 수 |
| 7 | `Victim_candidate_pages` | `int` | 17454 | snapshot: LRU 3 존 && dirty |
| 8 | `Clean_pages` | `int` | 17457 | snapshot: `!DIRTY_FLAG` (invalid 포함) |
| 9 | `Dirty_pages` | `int` | 17460 | snapshot: `DIRTY_FLAG` (invalid 포함) |
| 10 | `Num_index_pages` | `int` | 17463 | snapshot: perm 볼륨의 `PAGE_BTREE` |
| 11 | `Num_data_pages` | `int` | 17466 | snapshot: perm 볼륨의 `PAGE_HEAP` + `PAGE_OVERFLOW` |
| 12 | `Num_system_pages` | `int` | 17469 | snapshot: perm 볼륨의 catalog/volbitmap/volheader/ftab/ehash/vacuum_data/dropped_files |
| 13 | `Num_temp_pages` | `int` | 17472 | snapshot: temp 볼륨 페이지 전체 |
| 14 | `Num_pages_created` | `bigint` | 17475 | Δ (NEW_PAGE fix 횟수) |
| 15 | `Num_pages_written` | `bigint` | 17479 | Δ. **DWB 경유 쓰기 누락** |
| 16 | `Pages_written_rate` | `numeric(20,10)` | 17482 | `Δnum_pages_written / time_delta` (초당) |
| 17 | `Num_pages_read` | `bigint` | 17490 | Δ |
| 18 | `Pages_read_rate` | `numeric(20,10)` | 17493 | `Δnum_pages_read / time_delta` |
| 19 | `Num_flusher_waiting_threads` | `int` | 17501 | **Δ가 아닌 현재 게이지** — victim을 기다리는 스레드 수 |

`pgbuf_start_scan` 흐름:

```
pthread_mutex_lock (&pgbuf_Pool.show_status_mutex)      [SERVER_MODE]   /* 17386 */
pgbuf_scan_bcb_table ()                                                 /* 17389 */
for i in 0 .. thread_num_total_threads():                               /* 17391 */
    status_accumulated.<6개 필드> += show_status[i].<필드>               /* 17393-17398 */
ctx = showstmt_alloc_array_context (thread_p, 1, 19)
vals = showstmt_alloc_tuple_in_context (thread_p, ctx)
cur_time = time (NULL)
time_delta = difftime (cur_time, status_old->print_out_time) + 0.0001    /* 17417: 0 나눗셈 방지 */
... 19개 컬럼 채우기 ...
assert (idx == num_cols)                                                /* 17503 */
status_old->{5개 카운터} = status_accumulated.{...}; status_old->print_out_time = cur_time  /* 17506-17511 */
*ptr = ctx
pthread_mutex_unlock (&show_status_mutex)
```

설계상 중요한 점:

- **`show_status_mutex`(1862행 초기화)는 `status_old` 갱신을 직렬화하는 목적**이다. per-thread 샤드 읽기를 보호하지는 않는다 (샤드는 여전히 경합 상태로 읽힌다). 두 세션이 동시에 SHOW를 실행하면 delta가 왜곡되므로 이 뮤텍스가 필수다.
- **모든 델타 컬럼은 "마지막 SHOW 이후"를 의미한다.** 즉 **SHOW 자체가 카운터를 리셋하는 파괴적 읽기(destructive read)**다 (17506-17511행). 두 명의 관리자가 동시에 모니터링하면 서로의 값을 갉아먹는다. 이는 문서화되어야 할 중대한 사용 제약이다.
- `time_delta`에 `+ 0.0001` (17417행), 히트율 분모에 `+ 0.0000000000001` (17426행)로 0 나눗셈을 회피한다. 서버 기동 직후 SHOW를 두 번 빠르게 실행하면 rate 값이 폭발할 수 있다.
- **에러 경로에서 `status_old`를 갱신하지 않는다.** `exit_on_error`(17520-17533행)는 컨텍스트를 해제하고 뮤텍스만 풀므로, 실패한 SHOW는 delta를 소비하지 않는다 — 올바른 동작.
- `numeric_db_value_coerce_to_num` 실패는 `goto exit_on_error`로 처리하되, **`idx++`가 검사보다 먼저** 실행된다 (17431-17436, 17484-17488, 17495-17499행). 실패해도 `idx`는 증가한 상태로 빠져나가므로 부작용은 없다(컨텍스트가 해제됨).

### 6.5 `pgbuf_peek_stats` (14686-14783행) — perfmon 게이지 소스

16개 출력 파라미터를 채운다. 전부 락 없이 BCB 테이블/LRU 리스트/lock-free 큐를 훑는다.

```
for i in 0 .. num_buffers-1:
    if get_fcnt (&bufptr->atomic_latch) > 0: (*fixed_cnt)++        /* 14712-14715 */
    bcb_flags = bufptr->flags   /* "we do not lock the bcb and we can be affected by concurrent changes." 14717 */
    if bcb_flags & PGBUF_BCB_DIRTY_FLAG: (*dirty_cnt)++
    zone = PGBUF_GET_ZONE (bcb_flags)
    LRU_1/2/3 별로 lru1_cnt / lru2_cnt / lru3_cnt 증가             /* 14721-14734 */
    if pgbuf_bcb_should_avoid_deallocation (bufptr): (*avoid_dealloc_cnt)++   /* 14736-14739 */
    if bcb_flags & PGBUF_BCB_FLUSHING_TO_DISK_FLAG: (*avoid_victim_cnt)++     /* 14741-14744 */
    if (zone & PGBUF_LRU_ZONE_MASK) && PGBUF_IS_PRIVATE_LRU_INDEX (...): (*private_cnt)++  /* 14746-14752 */

for i in 0 .. PGBUF_TOTAL_LRU_COUNT-1:
    *victim_candidates += buf_LRU_list[i].count_vict_cand          /* 14754-14757 */

*private_quota = quota.private_pages_ratio * num_buffers           /* 14759 */
[SERVER_MODE]
  *alloc_bcb_waiter_high = direct_victims.waiter_threads_high_priority->size ()   /* 14762 */
  *alloc_bcb_waiter_med  = direct_victims.waiter_threads_low_priority->size ()    /* 14763 */
  *flushed_bcbs_waiting_direct_assign = flushed_bcbs->size ()                     /* 14764 */
[!SERVER_MODE] 위 세 개 모두 0
*lfcq_big_prv_num = big_private_lrus_with_victims->size ()   (NULL 아니면)        /* 14771-14774 */
*lfcq_prv_num     = private_lrus_with_victims->size ()       (NULL 아니면)        /* 14776-14779 */
*lfcq_shr_num     = shared_lrus_with_victims->size ()        (NULL 검사 없음)     /* 14782 */
```

주목할 점:

- 14717행 주석이 경합을 명시적으로 인정한다: "copy flags. we do not lock the bcb and we can be affected by concurrent changes."
- **초기화가 불완전하다.** 함수 진입부(14695-14703행)에서 `fixed_cnt`, `dirty_cnt`, `lru1/2/3_cnt`, `avoid_dealloc_cnt`, `avoid_victim_cnt`, `private_cnt`, `victim_candidates`만 0으로 초기화한다. `private_quota`, `alloc_bcb_waiter_*`, `flushed_bcbs_*`는 무조건 대입되므로 괜찮지만, **`lfcq_big_prv_num`과 `lfcq_prv_num`은 큐 포인터가 `NULL`이면 대입 자체가 일어나지 않는다** (14771-14779행). 호출자가 초기화하지 않으면 미초기화 값을 읽는다. `shared_lrus_with_victims`는 NULL 검사 없이 역참조하므로(14782행) 항상 존재한다고 가정 — 실제로 `pgbuf_initialize`에서 무조건 생성된다 (1839행).
- `avoid_victim_cnt`가 세는 것은 `PGBUF_BCB_FLUSHING_TO_DISK_FLAG`뿐이다 (14741행). 이름과 달리 `pgbuf_bcb_avoid_victim`의 전체 조건을 반영하지 않는다.

### 6.6 `pgbuf_daemons_get_stats` (17215-17243행)

```c
UINT64 *statsp = stats_out;
if (pgbuf_Page_flush_daemon != NULL) pgbuf_Page_flush_daemon->get_stats (statsp);
statsp += cubthread::daemon::get_stats_value_count ();
... post_flush, flush_control, page_maintenance 순서로 반복 ...
```

**고정 순서 · 고정 스트라이드 레이아웃**이다: `page_flush`, `page_post_flush`, `flush_control`, `page_maintenance` 순서로 각각 `cubthread::daemon::get_stats_value_count ()`개 슬롯. 데몬이 `NULL`이면 슬롯을 건너뛰지만 **버퍼를 0으로 채우지 않는다** — 호출자가 사전에 0 초기화해야 한다는 암묵적 계약. 마지막 데몬(`page_maintenance`) 뒤에는 `statsp` 전진이 없다 (17242행).

`SERVER_MODE`가 아니면 함수 전체가 no-op이다 (17217, 17242행의 `#if defined (SERVER_MODE)`). `// *INDENT-ON*` (17244행)이 바로 뒤에 오는 것으로 보아 이 블록은 GNU indent에서 제외된 C++ 영역이다.

### 6.7 `pgbuf_monitor_sum_fix_req` / `pgbuf_monitor_sum_pg_unfix` — 의도적 데이터 경합 (2119-2196행)

두 함수가 구조적으로 동일하다. `pgbuf_monitor_sum_fix_req` (2119-2153행):

```
mgr = cubthread::get_manager (); if mgr == NULL: return 0        /* 2123-2127 */
all_entries = mgr->get_all_entries ()
n = mgr->get_max_thread_count ()                                  /* 2133 */
for i in 0 .. n-1:
    total += all_entries[i].pgbuf_fix_req_cnt
    if reset: all_entries[i].pgbuf_fix_req_cnt = 0                 /* 2137-2142 */
main_entry = cubthread::get_main_entry ()
if main_entry != NULL:
    total += main_entry->pgbuf_fix_req_cnt
    if reset: main_entry->pgbuf_fix_req_cnt = 0                    /* 2146-2152 */
return total
```

**주석이 세 가지 설계 결정을 명문화한다:**

1. **데이터 경합의 의도적 수용** (2113-2118행):
   > "Feeds only a coarse LRU-quota heuristic, so the data race with the owner-thread writers is accepted by design: **a plain int read/write does not tear on our targets**, and the few increments that may be lost between the read and the reset store are negligible against millions of fixes."

   즉 (a) 소비자가 휴리스틱뿐이고, (b) 대상 플랫폼에서 `int` 접근이 원자적(찢어지지 않음)이며, (c) read-then-reset 사이에 유실되는 증가분이 무시할 수준이라는 3중 논거. `std::atomic`을 쓰지 않는 이유가 성능이다 — 작성자 측(`thread_p->pgbuf_fix_req_cnt++`, 2253행)이 모든 `pgbuf_fix`의 핫 패스에 있다.

2. **배열 경계의 미묘함** (2129-2132행):
   > "Bound by the managed-entry array size (`manager::get_max_thread_count == m_max_threads`), **NOT** the free `thread_num_total_threads()` which adds +1 for the separate system thread (`Main_entry_p`) that is not part of `m_all_entries` — iterating that far would read/write **one element past the array**."

   `thread_num_total_threads()`를 쓰면 배열 밖 1요소를 건드리는 버그가 된다는 명시적 경고. `pgbuf_Pool.show_status`가 `thread_num_total_threads() + 1`로 할당되는 것(1849행)과 대조하면 두 배열의 인덱싱 규칙이 다르다는 것이 드러난다.

3. **SA_MODE 대응** (2143-2145행):
   > "Also include the main/system thread entry: it lives outside `m_all_entries` and is **the ONLY writer in SA_MODE** (where the managed array is empty), so omitting it would zero out the heuristic for standalone utilities."

   SA_MODE에서는 `m_max_threads == 0`이라 루프가 아예 돌지 않고, 메인 엔트리만이 카운터를 갖는다. 이것을 빼면 standalone 유틸리티에서 휴리스틱이 항상 0이 된다.

작성자 측 코드(2249-2254행)에도 대응 주석이 있다:

> "Bump this thread's own fix-request shard — **a cache-hot field in THREAD_ENTRY (thread_p is dereferenced throughout the fix path), avoiding the per-fix cache miss of a global counter line.** Single-writer, no atomic."

즉 `THREAD_ENTRY`가 fix 경로 전반에서 이미 역참조되므로 그 안의 필드는 캐시에 이미 올라와 있고, 전역 카운터를 쓰면 매 fix마다 캐시 미스 + 캐시 라인 핑퐁이 발생한다는 최적화 논거. unfix 측 카운터는 6681행(`thread_p->pgbuf_pg_unfix_cnt++`).

소비자는 `pgbuf_adjust_quotas` (LRU private/shared 쿼터 조정)다 — `reset = true`로 호출해 구간 활동량을 얻는다.

### 6.8 perfmon 카운터 (PSTAT_PB_\*) — 카테고리별 정리

총 52개 `perfmon_inc_stat` 호출과 다수의 시간 추적기가 있다. 카테고리별로:

**기본 IO / fetch** — 항상 활성:

| 카운터 | 라인 | 의미 |
|---|---|---|
| `PSTAT_PB_NUM_FETCHES` | 2576 | `pgbuf_fix` 호출 |
| `PSTAT_PB_NUM_IOREADS` | 4727, 8444 | 디스크 read 시도 (DWB 히트 포함) |
| `PSTAT_PB_NUM_IOWRITES` | 4824, 10833 | 디스크 write (**DWB 경유 누락**) |
| `PSTAT_PB_NUM_DIRTIES` | 11612 | dirty 마킹 |
| `PSTAT_PB_NUM_FLUSHED` | 4118 | flush 완료 |

**flush / victim 스킵 사유** — 진단 가치가 높음:

| 카운터 | 라인 |
|---|---|
| `PSTAT_PB_NUM_SKIPPED_FLUSH` | 4061 |
| `PSTAT_PB_NUM_SKIPPED_NEED_WAL` | 4064 |
| `PSTAT_PB_NUM_SKIPPED_FIXED_OR_HOT` | 4065 |
| `PSTAT_PB_NUM_SKIPPED_ALREADY_FLUSHED` | 4066 |
| `PSTAT_PB_FLUSH_COLLECT` / `_PER_PAGE` | 3937 / 3977 |
| `PSTAT_PB_FLUSH_FLUSH` / `_PER_PAGE` | 4072 / 4075 |
| `PSTAT_PB_FLUSH_PAGE_FLUSHED` | 10896 |
| `PSTAT_PB_FLUSH_SEND_DIRTY_TO_POST_FLUSH` | 10876 |
| `PSTAT_PB_FLUSH_SLEEP` | 17012 (데몬 태스크) |

**BCB 할당 / victim 대기**:

| 카운터 | 라인 |
|---|---|
| `PSTAT_PB_ALLOC_BCB` | 8334 |
| `PSTAT_PB_ALLOC_BCB_SEARCH_VICTIM` | 8188 |
| `PSTAT_PB_ALLOC_BCB_COND_WAIT_HIGH_PRIO` / `_LOW_PRIO` | 8220 / 8246 |
| `PSTAT_PB_ALLOC_BCB_PRIORITIZE_VACUUM` | 8212 |
| `PSTAT_PB_ASSIGN_DIRECT_BCB` | 15413 |

**victim 탐색 결과** — `PERFMON_ACTIVATION_FLAG_PB_VICTIMIZATION` 게이트:

| 카운터 | 라인 |
|---|---|
| `PSTAT_PB_VICTIM_GET_FROM_LRU` / `_FAIL` / `_BAD_HINT` / `_LIST_WAS_EMPTY` | 9288 / 9454 / 9458 / 9293 |
| `PSTAT_PB_VICTIM_ALL_LRU_FAIL` | 9174 |
| `PSTAT_PB_VICTIM_SEARCH_OWN_PRIVATE_LISTS` / `_OTHERS_PRIVATE_LISTS` | 9082 / 9122 |
| `PSTAT_PB_OWN_VICTIM_PRIVATE_LRU_SUCCESS` | 9079 |
| `PSTAT_PB_VICTIM_OWN_PRIVATE_LRU_FAIL` / `_OTHER_PRIVATE_LRU_FAIL` | 9087 / 16431 |
| `PSTAT_PB_VICTIM_ASSIGN_DIRECT_*` (`VACUUM_LRU`, `VACUUM_VOID`, `ADJUST`, `ADJUST_TO_VACUUM`, `FLUSH`, `PANIC`, `SEARCH_FOR_FLUSH`) | 6776, 6878, 10034, 10018, 15472, 9543, 3792 |

**unfix 시 LRU 결정** — 존 × 사유 매트릭스:

| 존 | 카운터 | 라인 |
|---|---|---|
| VOID | `PSTAT_PB_UNFIX_VOID_AOUT_FOUND` / `_NOT_FOUND` (+ `_VAC` 변형) | 6900, 6896, 6869, 6865 |
| VOID | `PSTAT_PB_UNFIX_VOID_TO_PRIVATE_TOP` / `_MID` / `_TOP_VAC` / `TO_SHARED_MID` | 6918, 6927, 6910, 6936 |
| LRU 1 | `PSTAT_PB_UNFIX_LRU_ONE_KEEP_VAC` / `_PRV_KEEP` / `_SHR_KEEP` / `_PRV_TO_SHR_MID` | 6709, 6722, 6726, 6716 |
| LRU 2 | `PSTAT_PB_UNFIX_LRU_TWO_KEEP_VAC` / `_PRV_KEEP` / `_SHR_KEEP` / `_PRV_TO_SHR_MID` / `_SHR_TO_TOP` | 6738, 6758, 6762, 6745, 10106 |
| LRU 3 | `PSTAT_PB_UNFIX_LRU_THREE_KEEP_VAC` / `_PRV_TO_SHR_MID` / `_SHR_TO_TOP` | 6781, 6789, 10112 |

**lock-free victim 큐 (LFCQ)**:

| 카운터 | 라인 |
|---|---|
| `PSTAT_PB_LFCQ_LRU_PRV_GET_CALLS` / `_GET_BIG` / `_GET_EMPTY` | 16399 / 16400 / 16412 |
| `PSTAT_PB_LFCQ_LRU_SHR_GET_CALLS` / `_GET_EMPTY` | 16481 / 16486 |

**hash anchor 경합** — `PERFMON_ACTIVATION_FLAG_PB_HASH_ANCHOR` 게이트:

| 카운터 | 라인 |
|---|---|
| `PSTAT_PB_NUM_HASH_ANCHOR_WAITS` | 7621 |
| `PSTAT_PB_TIME_HASH_ANCHOR_WAIT` | 7622 |

**latch 시간 추적**:

| 카운터 | 라인 |
|---|---|
| `PSTAT_PB_PAGE_FIX_ACQUIRE_TIME_10USEC` | 2623 |

**pbx 상세 통계** — 페이지 타입 × latch 모드 × 조건의 다차원 히스토그램:

| 함수 | 라인 | 차원 |
|---|---|---|
| `perfmon_pbx_fix` | 2608 | page_type × page_found × latch_mode × cond_type |
| `perfmon_pbx_fix_acquire_time` | 2621 | 위 + 시간 |
| `perfmon_pbx_lock_acquire_time` | 2611 | 동일 |
| `perfmon_pbx_hold_acquire_time` | 2594 | 동일 |
| `perfmon_pbx_unfix` | 3137 | page_type × dirty_before_hold × dirtied_by_holder × holder_latch |
| `perfmon_pbx_promote` | 3000 | page_type × promote_cond × holder_latch × success |

**lock manager 통계 (pgbuf가 대신 증가)**:

| 카운터 | 라인 |
|---|---|
| `PSTAT_LK_NUM_WAITED_ON_PAGES` | 8007 |
| `PSTAT_LK_NUM_ACQUIRED_ON_PAGES` | 8033 |

**sort 통계 (pgbuf가 대신 증가)**:

| 카운터 | 라인 | 조건 |
|---|---|---|
| `PSTAT_SORT_NUM_DATA_PAGES` | 4748, 8573 | `thread_get_sort_stats_active (thread_p)` |
| `PSTAT_SORT_NUM_IO_PAGES` | 8542 | 동일 |

### 6.9 perfmon 활성화 게이트 패턴

세 가지 강도의 게이트가 쓰인다:

```c
/* 1) 무조건 */
perfmon_inc_stat (thread_p, PSTAT_PB_NUM_FETCHES);                     /* 2576 */

/* 2) 전역 추적 여부만 */
is_perf_tracking = perfmon_is_perf_tracking ();                        /* 2288, 2850, 3110 */

/* 3) 플래그별 세분화 */
detailed_perf = perfmon_is_perf_tracking_and_active (PERFMON_ACTIVATION_FLAG_PB_VICTIMIZATION);  /* 3843, 9284 */
#define PERF(id) if (detailed_perf) perfmon_inc_stat (thread_p, id)     /* 9024, 9272 */
```

`PERF(id)` 매크로 정의가 두 함수에서 지역적으로 반복된다 (9024행 `#define PERF(id)`, 9272행 `#define PERF(pstatid)`) — 동일 목적의 매크로가 다른 파라미터 이름으로 두 번 정의된다. 각각 해당 함수 끝에서 `#undef` 되는 지역 매크로 패턴이다.

사용되는 활성화 플래그:

| 플래그 | 게이트 대상 |
|---|---|
| `PERFMON_ACTIVATION_FLAG_PB_VICTIMIZATION` | victim 탐색/할당 세부 통계 |
| `PERFMON_ACTIVATION_FLAG_PB_HASH_ANCHOR` | hash anchor 대기 시간 |
| `PERFMON_ACTIVATION_FLAG_DETAILED_BTREE_PAGE` | `pgbuf_get_page_type_for_stat`의 B-tree 세분화 |

### 6.10 `pgbuf_get_page_type_for_stat` (15012-15029행)

```c
CAST_PGPTR_TO_IOPGPTR (io_pgptr, pgptr);
if ((io_pgptr->prv.ptype == PAGE_BTREE)
    && (perfmon_get_activation_flag () & PERFMON_ACTIVATION_FLAG_DETAILED_BTREE_PAGE))
  perf_page_type = btree_get_perf_btree_page_type (thread_p, pgptr);
else
  perf_page_type = (PERF_PAGE_TYPE) io_pgptr->prv.ptype;
```

`PAGE_TYPE` → `PERF_PAGE_TYPE`을 **직접 캐스팅**한다 (15025행) — 두 열거형이 값 대응을 유지해야 하는 숨은 결합이다. B-tree 페이지만 `PERFMON_ACTIVATION_FLAG_DETAILED_BTREE_PAGE`가 켜졌을 때 `btree_get_perf_btree_page_type`을 호출해 root/non-leaf/leaf/overflow로 세분화한다 (btree 모듈로의 상향 호출). 호출자는 `pgbuf_fix`(2574행), `pgbuf_unfix`(3115행), `pgbuf_promote_read_latch`.

---

## 7. 디버깅 · 검증 장치

### 7.1 빌드 매크로 계층

pgbuf의 디버그 장치는 **세 단계 게이트**로 나뉜다:

| 게이트 | 활성 조건 | 성격 |
|---|---|---|
| `!defined (NDEBUG)` | 디버그 빌드 | 상시 assert, `fixed_at` 추적, `pgbuf_tracker`, `pgbuf_lru_sanity_check` |
| `defined (CUBRID_DEBUG)` | **별도로 명시해야 함** (기본 꺼짐) | `pgbuf_Guard`, `pgbuf_scramble`, `pgbuf_dump`, `pgbuf_is_consistent` |
| `PRM_ID_PB_DEBUG_PAGE_VALIDATION_LEVEL` | 런타임 파라미터 + `!NDEBUG` | `pgbuf_is_valid_page*` 호출 |

`CUBRID_DEBUG`는 `NDEBUG`와 독립적이며 통상적인 디버그 빌드에서도 켜지지 않는다. 이 사실이 아래 7.7절의 코드 부패(bit-rot)를 설명한다.

### 7.2 `pgbuf_get_check_page_validation_level` (10993-11001행)

```c
STATIC_INLINE bool
pgbuf_get_check_page_validation_level (int page_validation_level)
{
#if !defined(NDEBUG)
  return prm_get_integer_value (PRM_ID_PB_DEBUG_PAGE_VALIDATION_LEVEL) >= page_validation_level;
#else /* NDEBUG */
  return false;
#endif /* NDEBUG */
}
```

레벨은 4단계 (`page_buffer.h:211-217`):

| 값 | 상수 | 활성화되는 검사 |
|---|---|---|
| 0 | `PGBUF_DEBUG_NO_PAGE_VALIDATION` | 없음 |
| 1 | `PGBUF_DEBUG_PAGE_VALIDATION_FETCH` | `pgbuf_fix` 진입 시 `pgbuf_is_valid_page` (2257-2265행) |
| 2 | `PGBUF_DEBUG_PAGE_VALIDATION_FREE` | + promote/unfix 시 `pgbuf_is_valid_page_ptr` (2829, 3049행) |
| 3 | `PGBUF_DEBUG_PAGE_VALIDATION_ALL` | + 모든 메타 접근자, flush, set_dirty, copy_to/from_area (약 15개 지점) |

레벨 1은 `fetch_mode != RECOVERY_PAGE`일 때만 적용된다 (2257행) — 복구 중 페이지는 아직 할당 검증을 통과하지 못할 수 있다.

**레벨 3의 비용이 극단적이다.** `pgbuf_is_valid_page_ptr`가 BCB 테이블 전체를 선형 탐색하며 **각 BCB의 뮤텍스를 잡고 놓는다** (11055-11081행). `num_buffers`가 수십만인 환경에서 `pgbuf_get_lsa` 한 번이 수십만 번의 뮤텍스 왕복을 유발한다. 실질적으로 소규모 재현 테스트 전용이다.

### 7.3 `pgbuf_is_valid_page` (11015-11036행) — 디스크 할당 검증

```
if fileio_get_volume_label (vpid->volid, PEEK) == NULL || VPID_ISNULL (vpid):
    assert (no_error); return DISK_INVALID                          /* 11019-11024 */
valid = disk_is_page_sector_reserved_with_debug_crash (thread_p, vpid->volid, vpid->pageid, !no_error)  /* 11027 */
if valid == DISK_INVALID && !no_error:
    er_set (ER_FATAL_ERROR_SEVERITY, ER_PB_BAD_PAGEID, pageid, volume_label)   /* 11030-11031 */
    assert (false)                                                  /* 11033 */
return valid
```

`disk_isvalid_page` 호출이 주석 처리되고(11026행) `disk_is_page_sector_reserved_with_debug_crash`로 대체됐다 — 후자는 섹터 예약 비트맵을 확인하며 디버그 빌드에서 위반 시 크래시한다. `no_error` 인자가 (a) `assert` 발동 여부, (b) `er_set` 여부, (c) disk 모듈로 넘기는 crash 플래그를 **모두** 제어한다.

호출자는 `pgbuf_fix`(2261행, `no_error = (fetch_mode == OLD_PAGE_IF_IN_BUFFER)`), `pgbuf_copy_to_area`(4720행), `pgbuf_copy_from_area`(4817행), `pgbuf_ordered_fix`(12422행).

### 7.4 `pgbuf_is_valid_page_ptr` (11048-11092행) — 포인터 소유권 검증

```
assert (pgptr != NULL)
for bufid in 0 .. num_buffers-1:
    bufptr = PGBUF_FIND_BCB_PTR (bufid)
    PGBUF_BCB_LOCK (bufptr)
    if (PAGE_PTR) &bufptr->iopage_buffer->iopage.page[0] == pgptr:
        if get_fcnt (&bufptr->atomic_latch) <= 0:
            assert (false)
            er_set (ER_FATAL_ERROR_SEVERITY, ER_PB_UNFIXED_PAGEPTR, pgptr, pageid, volume_label)  /* 11068-11069 */
            PGBUF_BCB_UNLOCK; return false
        else:
            PGBUF_BCB_UNLOCK; return true
    PGBUF_BCB_UNLOCK
er_set (ER_FATAL_ERROR_SEVERITY, ER_PB_UNKNOWN_PAGEPTR, pgptr)      /* 11085 */
assert (false)
return false
```

두 가지 오류를 구분한다: **`ER_PB_UNFIXED_PAGEPTR`** (BCB 테이블에 있지만 fix되지 않음 — use-after-unfix) vs **`ER_PB_UNKNOWN_PAGEPTR`** (BCB 테이블에 아예 없음 — 잘못된 포인터). 후자가 2.7절의 copy buffer 문제의 원인이다.

### 7.5 `pgbuf_check_bcb_page_vpid` (11190-11217행) — `prv` 헤더 일관성

```
if bufptr == NULL || VPID_ISNULL (&bufptr->vpid): assert 2회; return false   /* 11192-11197 */
if bufptr->vpid.volid > NULL_VOLID:      /* perm 볼륨만 검사 */
    assert ((maybe_deallocated && log_is_in_crash_recovery_and_not_yet_completes_redo ())
            || (bufptr->vpid.pageid == prv.pageid && bufptr->vpid.volid == prv.volid))   /* 11203-11206 */
    assert (prv.p_reserve_1 == 0)                                    /* 11208 */
    assert (prv.p_reserve_2 == 0)                                    /* 11209 */
    return (vpid.pageid == prv.pageid && vpid.volid == prv.volid)     /* 11211-11212 */
else:
    return true    /* nop — temp/auxiliary 볼륨은 검사 생략 */          /* 11216 */
```

**`maybe_deallocated` 인자의 정확한 의미**: `maybe_deallocated == true` **그리고** redo 미완료 크래시 복구 중일 때만 불일치를 assert에서 면제한다 (11205행). 즉 "해제 가능"만으로는 부족하고 복구 컨텍스트가 함께 필요하다. 그런데 **assert만 면제되고 반환값은 여전히 엄격하다** (11211-11212행) — 불일치면 `false`를 반환한다. 호출자에 따라 결과가 갈린다:

| 호출자 | 라인 | `maybe_deallocated` | `false` 처리 |
|---|---|---|---|
| `pgbuf_fix` | 2402 | 계산된 값 | 실패 처리 |
| `pgbuf_get_page_id` | 5246 | `false` | `assert`만 |
| `pgbuf_get_page_ptype` | 5273 | `false` | `assert_release` (릴리스에서도 발동) |
| `pgbuf_set_page_ptype` | 5454 | `false` | `assert(false)` + return |
| `pgbuf_check_page_ptype_internal` | 11163 | `false` | `assert_release(false)` + return false |
| `pgbuf_unlatch_bcb_upon_unfix` | 6622 | `false` | `assert`만 |
| `pgbuf_bcb_flush_with_wal` | 10735 | `false` | `assert(false)` + `return ER_FAILED` |

`p_reserve_1` / `p_reserve_2`가 0인지 검사하는 것(11208-11209행)은 `FILEIO_PAGE.prv` 레이아웃이 예약 필드를 오염시키지 않았음을 확인하는 카나리아 역할이다.

### 7.6 `pgbuf_Guard` — 버퍼 오버런 검출 (`CUBRID_DEBUG` 전용)

```c
#if defined(CUBRID_DEBUG)
static char pgbuf_Guard[8] = { MEM_REGION_GUARD_MARK × 8 };     /* 852-859행 */
#endif

#define PGBUF_FIND_BUFFER_GUARD(bufptr) \
  (&bufptr->iopage_buffer->iopage.page[DB_PAGESIZE])              /* 144-145행 */

#if defined (CUBRID_DEBUG)
#define SIZEOF_IOPAGE_PAGESIZE_AND_GUARD() (IO_PAGESIZE + sizeof (pgbuf_Guard))  /* 111행 */
#else
#define SIZEOF_IOPAGE_PAGESIZE_AND_GUARD() (IO_PAGESIZE)                         /* 113행 */
#endif
```

가드는 페이지 페이로드 바로 뒤 8바이트다. `CUBRID_DEBUG`에서 `PGBUF_IOPAGE_BUFFER_SIZE`가 8바이트 늘어나 모든 BCB 슬롯이 가드 공간을 갖는다.

| 지점 | 라인 | 동작 |
|---|---|---|
| BCB 테이블 생성 | 5616 | 각 BCB에 가드 기록 |
| copy buffer 생성 | 896 | 사본 버퍼에도 동일하게 기록 |
| `pgbuf_unfix` | 3096-3100 | 불일치 시 `er_log_debug` 경고 후 **가드를 다시 써서 복구** |
| `pgbuf_is_consistent` | 11413-11418 | 불일치 시 즉시 `PGBUF_CONTENT_BAD` 반환 |

`pgbuf_unfix`가 가드를 복구하는 것(3100행)은 경고 폭주를 막기 위한 것이지만, 오버런 자체는 이미 발생했으므로 진단 가치가 감소한다.

### 7.7 `pgbuf_scramble` / `pgbuf_dump` / `pgbuf_is_consistent` — 코드 부패 확인됨

세 함수 모두 `#if defined(CUBRID_DEBUG)` 블록(11220-11487행) 안에 있다.

**`pgbuf_scramble` (11231-11246행)**: `MEM_REGION_INIT`로 페이지를 스크램블 마크로 채우고, `fileio_init_lsa_of_page` 후 `prv`의 모든 필드를 무효값으로 설정 (`pageid = -1`, `volid = -1`, `ptype = PAGE_UNKNOWN`, `pflag = 0`, `p_reserve_1/2 = 0`, `tde_nonce = 0`). 목적은 주석(11225-11228행)에 명시: "make sure that a user of a buffer does not assume that buffers are initialized to zero. For safety reasons, the buffers are initialized to zero, instead of scrambled, when running in production mode." 호출 지점: BCB 테이블 초기화(5615행), `pgbuf_unfix`(3213행), `pgbuf_invalidate`(3412행), `pgbuf_flush`(3491행), `pgbuf_claim_bcb_for_fix` NEW_PAGE(8550행).

**`pgbuf_is_consistent` (11406-11487행)** — 일관성 규칙이 주석(11393-11404행)에 정의된다:

> If memory page is dirty, the content of page **should be different** to the content of the page on disk, otherwise, page is considered inconsistent (누군가 갱신 없이 dirty를 걸었다). If memory page is not dirty, the content **should be identical**, otherwise inconsistent (누군가 dirty를 걸지 않고 갱신했다).

```
가드 검사 -> 불일치면 PGBUF_CONTENT_BAD                              /* 11413-11418 */
if !VPID_ISNULL (&bufptr->vpid):
    malloc_io_pgptr = malloc (IO_PAGESIZE); OOM이면 consistent 그대로 반환  /* 11422-11426 */
    fileio_read (NULL, fd, malloc_io_pgptr, pageid, IO_PAGESIZE)
        실패 -> PGBUF_CONTENT_BAD                                    /* 11429-11434 */
    if LSA 다름 || memcmp (page, page, DB_PAGESIZE) != 0:            /* 11438-11439 */
        consistent = dirty ? GOOD : BAD
        if consistent == BAD && fcnt > likely_bad_after_fixcnt: consistent = LIKELY_BAD  /* 11444-11448 */
    else:
        consistent = dirty ? LIKELY_BAD : GOOD                       /* 11452 */
    if consistent != GOOD:
        fileio_page_check_corruption () -> 손상됐으면 BAD             /* 11457-11462 */
    free_and_init (malloc_io_pgptr)
else:   /* VPID NULL: 스크램블 상태여야 함 */
    if fcnt <= 0 && 검증레벨 ALL:
        DB_PAGESIZE 전체가 MEM_REGION_SCRAMBLE_MARK인지 확인 -> 아니면 BAD  /* 11469-11480 */
```

`likely_bad_after_fixcnt` 인자의 의미: fix 카운트가 이 값을 넘으면 "확실히 나쁨"이라고 단정하지 않고 `PGBUF_CONTENT_LIKELY_BAD`로 완화한다 — 다른 스레드가 동시에 갱신 중일 수 있으므로. 모든 호출자가 `0`을 넘긴다 (3173, 3283, 11281, 11360행).

11485행 주석: "The I/O executed for `pgbuf_is_consistent` is not recorded..." — 이 함수의 `fileio_read`는 perfmon에 반영되지 않는다.

**`pgbuf_dump` (11303-11380행)와 `pgbuf_dump_if_any_fixed` (11258-11294행)** — `pgbuf_dump_if_any_fixed`는 모든 BCB를 순회하며 (a) latch가 있고 fcnt > 0이면 즉시 덤프, (b) `pgbuf_is_consistent`가 `BAD`면 루프 탈출 후 덤프. `pgbuf_finalize`에서 호출된다 (1889행).

**`pgbuf_dump`는 현재 컴파일되지 않는 상태다.** `CUBRID_DEBUG`를 켜면 다음 오류들이 드러난다:

| 라인 | 문제 |
|---|---|
| 11349 | `bufptr->fcnt` — `struct pgbuf_bcb`(513-544행)에 `fcnt` 필드가 없다. 현재는 `atomic_latch` 내부의 `impl.fcnt`이며 `get_fcnt()` 접근자로 읽는다 |
| 11362 | `pgbuf_latch_mode_str (bufptr->zone)` — `zone` 필드가 없다 (`flags`에 인코딩되며 `pgbuf_bcb_get_zone()`으로 읽는다). 게다가 zone 문자열에 `pgbuf_zone_str`이 아니라 `pgbuf_latch_mode_str`를 쓴다 |
| 11363 | `consistenet_str = ...` — 선언은 `consistent_str`(11308행). **오타로 미선언 식별자** |

`pgbuf_unfix_all` (3239-3302행)의 `!NDEBUG` 경로에도 동일한 `consistenet_str` 오타가 있다 (3284행) — 단 이쪽은 `#if defined(CUBRID_DEBUG)` 안이므로(3282-3286행) 일반 디버그 빌드는 `consistent_str = "UNKNOWN"` 분기(3285행)를 타서 컴파일된다.

**결론: `pgbuf_dump` / `pgbuf_dump_if_any_fixed` / `pgbuf_is_consistent` 계열은 최근 리팩터링(atomic latch 도입, flags 기반 zone 인코딩)을 반영하지 않아 현재 사용 불가능하다.** 디버그 도구로 신뢰할 수 없다.

### 7.8 `fixed_at` 추적 — `pgbuf_add_fixed_at` (11492-11530행)

`PGBUF_HOLDER`에 `!NDEBUG` 전용 필드가 있다 (470-473행):

```c
#if !defined(NDEBUG)
  char fixed_at[64 * 1024];
  int fixed_at_size;
#endif
```

**holder 하나당 64KB.** holder는 스레드×페이지 조합마다 존재하므로 디버그 빌드의 메모리 부담이 상당하다.

```
pgbuf_add_fixed_at (holder, caller_file, caller_line, reset):
    p = caller_file 끝에서 역방향으로 '/' 또는 '\\'를 찾아 basename 추출   /* 11497-11511 */
    if reset:
        sprintf (holder->fixed_at, "%s:%d ", p, caller_line)               /* 11516 */
        holder->fixed_at_size = strlen (...)
    else:
        sprintf (buf, "%s:%d ", p, caller_line)
        if strstr (holder->fixed_at, buf) == NULL:      /* 중복 제거 */     /* 11522 */
            strcat (holder->fixed_at, buf)
            holder->fixed_at_size += strlen (buf)
            assert (holder->fixed_at_size < 64 * 1024)                     /* 11526 */
```

세 가지 특징:

1. **중복 억제** (11522행) — 같은 `file:line`이 이미 있으면 추가하지 않는다. 반복 fix로 버퍼가 폭발하는 것을 막는다.
2. **`assert`가 오버플로 *후*에 온다** (11524-11526행). `strcat`이 이미 실행됐으므로 assert가 비활성화된 상황에서는 오버런이 된다. 검사가 `strcat` 앞에 있어야 옳다.
3. `sprintf`를 `buf[256]`(11494행)에 쓰므로 매우 긴 경로에서는 지역 배열 오버런 가능성이 있다 (`snprintf` 미사용).

호출 지점: `pgbuf_fix` 히트 경로(2320행, `reset = !had_holder`), `pgbuf_fix` 신규 경로(2466행), `pgbuf_promote_read_latch`(2979행, `reset = true`).

소비 지점은 ordered fix의 진단 로그다 — `holder->fixed_at`을 `er_log_debug`에 출력한다 (12538, 12871, 12896, 12940행). ordered fix 재정렬 실패를 추적할 때 "이 페이지를 누가 어디서 잡았나"를 알려주는 유일한 수단이다.

### 7.9 `pgbuf_tracker` — 리소스 누출 검출

`THREAD_ENTRY`가 `cubbase::pgbuf_tracker`를 보유한다 (`src/thread/thread_entry.hpp:392`, 접근자 `get_pgbuf_tracker()`는 347-350행). 타입은 `resource_tracker<const char *>` (`thread_entry.hpp:69`), 생성 파라미터는 `("Page Buffer", ENABLE_TRACKERS, 1024, ...)` (`thread_entry.cpp:157`, 상수는 55, 69, 71행).

pgbuf 측 호출 지점 (모두 `!NDEBUG`):

| 호출 | 라인 | 시점 |
|---|---|---|
| `.increment (caller_file, caller_line, pgptr)` | 2520 | `pgbuf_fix` 성공 |
| `.decrement (pgptr)` | 3149 | `pgbuf_unfix` |
| `.decrement (pgptr)` | 3365, 3392 | `pgbuf_invalidate` (2개 경로) |
| `.decrement (pgptr)` | 7773 | `pgbuf_lockfree_unfix_ro` |
| `.decrement (page_dealloc)` | 15169 | `pgbuf_dealloc_page` |

`increment`만 `caller_file`/`caller_line`을 받는다 — 누출 보고 시 "어디서 잡았는지"를 출력하기 위함. `decrement`는 포인터만 필요하다. `resource_tracker`가 트랜잭션/요청 경계에서 `push_track`/`pop_track`(`thread_entry.cpp:416, 429`)으로 스코프를 관리하고, 스코프 종료 시 잔존 항목을 누출로 보고한다. `clear_all`(402행)은 강제 정리.

`fixed_at`(7.8절)과 역할이 겹치지만 다르다: `fixed_at`은 **holder 엔트리에 붙어 ordered fix 진단에 쓰이고**, `pgbuf_tracker`는 **스레드에 붙어 fix/unfix 균형을 검증한다.**

### 7.10 `pgbuf_Monitor_locks` / `pgbuf_bcbmon_*` — BCB 뮤텍스 누출 및 오용 검출

**활성화** (1676-1682행):

```c
#if defined (SERVER_MODE)
#if defined (NDEBUG)
  pgbuf_Monitor_locks = prm_get_bool_value (PRM_ID_PB_MONITOR_LOCKS);
#else /* !NDEBUG */
  pgbuf_Monitor_locks = true;
#endif
#endif
```

**디버그 빌드에서는 무조건 켜지고, 릴리스에서는 `PRM_ID_PB_MONITOR_LOCKS`로 선택 가능하다.** 릴리스에서도 쓸 수 있게 만든 것이 특이한데, 오버헤드가 뮤텍스 연산당 몇 개의 정수 비교뿐이라 감당 가능하다는 판단이다.

**디스패치** (951-959행):

```c
#define PGBUF_BCB_LOCK(bcb) \
  (pgbuf_Monitor_locks ? pgbuf_bcbmon_lock (bcb, __LINE__) : (void) pthread_mutex_lock (&(bcb)->mutex))
#define PGBUF_BCB_TRYLOCK(bcb) \
  (pgbuf_Monitor_locks ? pgbuf_bcbmon_trylock (bcb, __LINE__) : pthread_mutex_trylock (&(bcb)->mutex))
#define PGBUF_BCB_UNLOCK(bcb) \
  (pgbuf_Monitor_locks ? pgbuf_bcbmon_unlock (bcb) : (void) pthread_mutex_unlock (&(bcb)->mutex))
#define PGBUF_BCB_CHECK_OWN(bcb) if (pgbuf_Monitor_locks) pgbuf_bcbmon_check_own (bcb)
#define PGBUF_BCB_CHECK_MUTEX_LEAKS() if (pgbuf_Monitor_locks) pgbuf_bcbmon_check_mutex_leaks ()
```

`__LINE__`을 매크로 확장 지점에서 캡처하므로 **호출자 라인이 기록된다** — 별도 파라미터 없이 획득 위치를 추적하는 영리한 방식.

**상태 저장소** — 스레드당 최대 2개 뮤텍스 (940-946, 710행):

```c
struct pgbuf_monitor_bcb_mutex
{
  PGBUF_BCB *bcb;
  PGBUF_BCB *bcb_second;
  int line;
  int line_second;
};
/* pgbuf_Pool.monitor.bcb_locks[thread_index] */
```

`bcb->owner_mutex` 필드(517행)가 소유 스레드 인덱스를 담고, 미소유 시 `-1`. 할당은 `pgbuf_initialize_page_monitor`에서 `calloc (count_threads, sizeof (PGBUF_MONITOR_BCB_MUTEX))` (14040행).

**검출하는 위반 목록:**

| 함수 | 라인 | 검출 대상 |
|---|---|---|
| `pgbuf_bcbmon_lock` | 16619-16623 | 이미 첫 번째 BCB 뮤텍스 보유 중 (일반 lock으로 두 번째 획득 금지 — trylock만 허용) |
| | 16624-16628 | 이미 두 번째 BCB 뮤텍스 보유 중 |
| | 16629-16633 | 자신이 이미 이 BCB를 소유 (재귀 락 = 데드락) |
| | 16636-16640 | 락 획득 후 `owner_mutex >= 0` (다른 스레드가 소유 표시를 남김 = 상태 손상) |
| `pgbuf_bcbmon_trylock` | 16662-16666 | 자기 재귀 락 |
| | 16667-16671 | 이미 2개 보유 (한도 초과) |
| | 16672-16676 | 같은 BCB 중복 |
| `pgbuf_bcbmon_unlock` | 16716-16720 | `owner_mutex != index` (내가 잡지 않은 것을 해제) |
| | 16730-16737 | 모니터에 등록되지 않은 BCB 해제 |
| `pgbuf_bcbmon_check_own` | 16758-16762 | 소유하지 않음 |
| | 16763-16767 | 소유하지만 모니터 미등록 |
| `pgbuf_bcbmon_check_mutex_leaks` | 16783-16791 | 종료 지점에서 BCB 뮤텍스 잔존 (**누출**) |

**핵심 정책: 락 서열이 "일반 lock은 1개까지, trylock으로만 2개까지"로 강제된다.** `pgbuf_bcbmon_lock`은 이미 아무 BCB 뮤텍스를 보유한 상태면 즉시 중단하고(16619-16628행), `pgbuf_bcbmon_trylock`만 두 번째 슬롯(`bcb_second`)을 채운다(16688-16693행). 이것이 BCB 뮤텍스 간 데드락을 구조적으로 배제하는 규칙이다 — 두 개를 잡아야 하는 경우(예: neighbor flush) 두 번째는 반드시 실패 가능한 trylock이어야 한다.

`pgbuf_bcbmon_check_mutex_leaks`의 호출 지점은 함수의 **정상/오류 반환 경계**들이다: `pgbuf_claim_bcb_for_fix` read 실패(8487행), 복호화 실패(8503행), `pgbuf_unfix`(3151행), `pgbuf_flush_if_requested`(3605행) 등. "이 지점에서는 어떤 BCB 뮤텍스도 잡혀 있지 않아야 한다"는 사후 조건을 코드로 표현한 것이다.

모든 위반은 `PGBUF_ABORT_RELEASE()`로 처리된다.

### 7.11 `PGBUF_ABORT_RELEASE` (1077-1088행)

```c
#if defined (NDEBUG)
/* note: release bugs can be hard to debug due to compile optimization. the crash call-stack may point to a
 *       completely different code than the one that caused the crash. my workaround is to save the line of code
 *       in this global variable pgbuf_Abort_release_line.
 *
 *       careful about overusing this. the code may not be fully optimized when using it. */
static int pgbuf_Abort_release_line = 0;
#define PGBUF_ABORT_RELEASE() do { pgbuf_Abort_release_line = __LINE__; abort (); } while (false)
#else /* DEBUG */
#define PGBUF_ABORT_RELEASE() assert (false)
#endif /* DEBUG */
```

릴리스 빌드에서 `abort()` 전에 **전역 변수에 라인 번호를 남긴다.** 주석이 이유를 밝힌다 — 최적화된 코드의 크래시 콜스택은 신뢰할 수 없으므로, 코어 덤프에서 `pgbuf_Abort_release_line`을 읽어 실제 위치를 특정한다. 부작용도 인정한다: "the code may not be fully optimized when using it" (전역 쓰기가 최적화를 방해).

디버그 빌드에서는 단순 `assert (false)`로, 콜스택이 신뢰 가능하므로 라인 저장이 불필요하다.

사용 지점 (18곳): `pgbuf_bcbmon_*` 전체(16622-16790행)와 `pgbuf_flags_mask_sanity_check`(16806-16818행). **둘 다 "절대 일어나면 안 되는 내부 불변식 위반"** 범주다.

### 7.12 `pgbuf_flags_mask_sanity_check` (16800-16821행)

`pgbuf_initialize` **최초 문장**에서 호출된다 (1604행) — 어떤 초기화보다 먼저.

```c
if (PGBUF_BCB_FLAGS_MASK & PGBUF_ZONE_MASK)          PGBUF_ABORT_RELEASE ();  /* 16804-16807 */
if (PGBUF_BCB_FLAGS_MASK & PGBUF_LRU_INDEX_MASK)     PGBUF_ABORT_RELEASE ();  /* 16808-16811 */
if (PGBUF_ZONE_MASK & PGBUF_LRU_INDEX_MASK)          PGBUF_ABORT_RELEASE ();  /* 16812-16815 */
if ((PGBUF_INVALID_ZONE | PGBUF_VOID_ZONE) & PGBUF_LRU_ZONE_MASK) PGBUF_ABORT_RELEASE ();  /* 16816-16819 */
```

`bufptr->flags`는 단일 `volatile int`에 **BCB 플래그 + zone + LRU 인덱스를 패킹**한다 (`PGBUF_LRU_NBITS 16`, 200행 주변: "(bcb flags + zone = 2 bytes) + (lru index = 2 bytes)"). 마스크가 겹치면 조용히 데이터가 손상되므로 기동 시점에 즉시 검출한다. 주석(16801-16802행): "this should be immediately caught, so abort the server whenever happens."

네 번째 검사는 `INVALID_ZONE`과 `VOID_ZONE`이 LRU zone 마스크와 구별되는지 확인한다 — 이 둘은 LRU 리스트에 속하지 않는 특수 zone이다.

컴파일 타임 `static_assert`로 표현할 수 있었을 검사를 런타임 함수로 둔 것은 아쉬운 점이지만, `PGBUF_ABORT_RELEASE`로 즉시 중단하므로 실질적 안전성은 확보된다.

### 7.13 `pgbuf_lru_sanity_check` (16829행 이하)

`#if !defined (NDEBUG)` 내부가 전부이므로 릴리스에서 빈 함수다. LRU 리스트의 구조적 불변식을 검사한다:

```
if lru->top == NULL:   /* 빈 리스트 */
    assert (count_lru1 == 0 && count_lru2 == 0 && count_lru3 == 0
            && bottom == NULL && bottom_1 == NULL && bottom_2 == NULL)   /* 16834-16836 */
    return
assert (bottom != NULL)                                                   /* 16840 */
assert (count_lru1 != 0 || count_lru2 != 0 || count_lru3 != 0)            /* 16841 */

/* zone 1 */
assert ((count_lru1 == 0) == (bottom_1 == NULL))                          /* 16844 */
if bottom_1 != NULL:
    assert (zone (bottom_1) == LRU_1_ZONE)                                /* 16847 */
    assert (zone (top) == LRU_1_ZONE)                                     /* 16848 */
    if bottom_1->next_BCB != NULL:
        LRU_1이면 assert(false)   /* 경계 위반 */                          /* 16851-16854 */
        LRU_2면 assert (count_lru2 != 0 && bottom_2 != NULL)              /* 16855-16858 */
        else (LRU_3) assert (count_lru3 != 0)
    else:
        assert (count_lru2 == 0 && count_lru3 == 0 && bottom_2 == NULL && bottom == bottom_1)
/* zone 2, zone 3 대해 유사 검사 반복 */
```

검사 강도가 매우 높다: **카운터 ↔ 경계 포인터 ↔ 실제 BCB zone 태그의 3중 정합성**을 확인한다. `(count_lruN == 0) == (bottom_N == NULL)` 형태의 동치 검사가 반복된다.

호출 지점 (10개): `pgbuf_get_victim_from_lru_list`(9991행), `pgbuf_lru_adjust_zone1/2`(10135, 10166, 10171행), `pgbuf_lru_adjust_zones`(10199, 10204행), `pgbuf_lru_fall_bcb_to_zone_3`(10239행), `pgbuf_lru_boost_bcb`(10267행). **LRU 구조를 변경하는 모든 함수의 진입/이탈에 배치**되어 어느 연산이 불변식을 깼는지 좁혀준다.

### 7.14 디버그 빌드 전용 안전장치 — 통합 목록

| # | 장치 | 게이트 | 라인 | 검출 대상 |
|---|---|---|---|---|
| 1 | `pgbuf_flags_mask_sanity_check` | **항상** (release 포함) | 16800-16821, 호출 1604 | flags/zone/LRU-index 마스크 중첩 |
| 2 | `pgbuf_Monitor_locks` + `pgbuf_bcbmon_*` | `!NDEBUG` 무조건, `NDEBUG`는 `PRM_ID_PB_MONITOR_LOCKS` | 16612-16793 | BCB 뮤텍스 재귀/누출/서열 위반/미소유 해제 |
| 3 | `PGBUF_ABORT_RELEASE` + `pgbuf_Abort_release_line` | 릴리스에서 라인 저장, 디버그에서 assert | 1077-1088 | 최적화 콜스택 손실 보완 |
| 4 | `pgbuf_lru_sanity_check` | `!NDEBUG` | 16829~ | LRU 카운터/경계/zone 태그 3중 정합성 |
| 5 | `pgbuf_tracker` (`resource_tracker`) | `!NDEBUG` (+ `ENABLE_TRACKERS`) | 2520, 3149, 3365, 3392, 7773, 15169 | fix/unfix 불균형 (페이지 누출) |
| 6 | `PGBUF_HOLDER::fixed_at[64K]` + `pgbuf_add_fixed_at` | `!NDEBUG` | 470-473, 11492-11530 | fix 호출 지점 이력 (ordered fix 진단) |
| 7 | `pgbuf_get_check_page_validation_level` 게이트 검사 | `!NDEBUG` + 런타임 파라미터 | 10993-11001 | 3단계 페이지 검증 활성화 |
| 8 | `pgbuf_is_valid_page` | 위 게이트 (레벨 1+) | 11015-11036 | 미할당 페이지 fix (`ER_PB_BAD_PAGEID`) |
| 9 | `pgbuf_is_valid_page_ptr` | 위 게이트 (레벨 2/3) | 11048-11092 | unfix된/알 수 없는 `PAGE_PTR` |
| 10 | `pgbuf_check_bcb_page_vpid` | assert 상시, 반환값 상시 | 11190-11217 | BCB vpid ↔ `prv` 헤더 불일치, `p_reserve` 오염 |
| 11 | `pgbuf_check_page_ptype` / `_no_error` | assert_release (릴리스 포함) | 11100-11178 | 페이지 타입 오용 |
| 12 | `pgbuf_set_lsa`의 `#if NDEBUG` dirty 보정 | 릴리스에만 보정, 디버그는 노출 | 5024-5031 | LSA 설정 후 dirty 누락 |
| 13 | `pgbuf_Guard` (8바이트) | `CUBRID_DEBUG` | 852-859, 3096, 5616, 896, 11413 | 페이지 버퍼 오버런 |
| 14 | `pgbuf_scramble` | `CUBRID_DEBUG` | 11231-11246 | "0으로 초기화됨" 가정 코드 |
| 15 | `pgbuf_is_consistent` | `CUBRID_DEBUG` | 11406-11487 | dirty/내용 불일치 (**현재 부패**) |
| 16 | `pgbuf_dump` / `_if_any_fixed` | `CUBRID_DEBUG` | 11258-11380 | 미해제 페이지 덤프 (**컴파일 불가**) |
| 17 | `pgbuf_copy_to_area` 범위 검사 | `CUBRID_DEBUG` | 4666-4676 | 페이지 경계 초과 복사 |
| 18 | `pgbuf_unfix` 미로깅 dirty 경고 | `CUBRID_DEBUG` | 3072-3092 | 로깅 없이 dirty (복구 불가 위험) |
| 19 | `pgbuf_unfix_all`의 `assert (false)` + 상세 로그 | `!NDEBUG` | 3264, 3275-3298 | 요청 종료 시 잔존 fix |
| 20 | `disk_volheader_check_magic` in `pgbuf_set_dirty` | `SERVER_MODE && !NDEBUG` | 4890-4895 | `pageid == 0` 페이지의 볼륨 헤더 매직 |
| 21 | `pgbuf_bcb_flush_with_wal`의 WRITE latch 소유자 확인 | `!NDEBUG && SERVER_MODE` | 10700-10719 | flush 시 latch 소유자 불일치 |
| 22 | `pgbuf_dealloc_page` TDE 로그 | `!NDEBUG` | 15151-15156, 15227-15234, 15266-15273 | TDE 비트 소거/복원 추적 |
| 23 | watcher magic 검사 | `!NDEBUG` | 3062, `page_buffer.h:246` | `PGBUF_WATCHER` 구조 손상 |

### 7.15 `pgbuf_unfix_all` (3239-3302행) — 진단 전용 함수

```
thrd_index = thread_get_entry_index (thread_p)
thrd_holder_info = &pgbuf_Pool.thrd_holder_info[thrd_index]
if thrd_holder_info->num_hold_cnt > 0:
    holder = thrd_holder_info->thrd_hold_list
    while holder != NULL:
        assert (false)                                    /* 3264: 무조건 발동! */
        CAST_BFPTR_TO_PGPTR (pgptr, holder->bufptr)
#if defined(NDEBUG)
        pgbuf_unfix_and_init (thread_p, pgptr)            /* 3268: 실제 해제 */
        holder = thrd_holder_info->thrd_hold_list         /* 3272: 리스트 재읽기 */
#else
        ... 상세 er_log_debug 출력 ...                     /* 3286-3296 */
        holder = holder->thrd_link                        /* 3298: 해제하지 않고 다음으로 */
#endif
```

**디버그와 릴리스의 동작이 정반대다:**

- 릴리스: 실제로 unfix하고, `pgbuf_unfix`가 holder를 리스트에서 제거하므로 리스트 헤드를 다시 읽어 진행한다 (3270-3272행 주석이 설명).
- 디버그: **unfix하지 않고** 각 holder의 상태를 로그로 출력하며 링크를 따라간다 (3298행).

`assert (false)` (3264행)가 루프 첫 문장이므로 디버그 빌드에서는 첫 holder에서 즉시 중단된다. 즉 **디버그 빌드의 로그 출력 코드는 사실상 도달 불가능**하다 (assert 비활성 시에만 도달).

함수 헤더 주석(3230-3237행)이 상황을 솔직히 인정한다: "At the time of request termination, there must be no buffers that were fixed by the thread. In current CUBRID system, however, **above situation has occurred**. In some later time, our system **must be corrected** to prevent above situation from occurring."

즉 이것은 **릴리스 빌드의 방어적 정리 장치이자 디버그 빌드의 버그 검출 장치**다.

### 7.16 `pgbuf_has_perm_pages_fixed` (11650-11668행)

```c
int thrd_idx = thread_get_entry_index (thread_p);
if (pgbuf_Pool.thrd_holder_info[thrd_idx].num_hold_cnt == 0) return false;
for (holder = ...thrd_hold_list; holder != NULL; holder = holder->thrd_link)
  {
    if (holder->bufptr->iopage_buffer->iopage.prv.ptype != PAGE_QRESULT)
      return true;
  }
return false;
```

**"영구 페이지"의 판정 기준이 `ptype != PAGE_QRESULT` 하나다.** 볼륨 목적(`pgbuf_is_temporary_volume`)이나 LSA 마커를 보지 않는다. `PAGE_QRESULT`(질의 결과 임시 페이지)만 예외로 두고 나머지는 전부 영구 취급하는 극히 보수적인 정의다.

반환형이 `bool`인데 헤더 주석(11645행)은 "The number of pages fixed by the thread"라고 잘못 적혀 있다.

용도: 스레드가 영구 페이지를 잡은 상태에서 블로킹 가능한 작업(예: 로그 flush 대기, 클라이언트 통신)을 하면 안 되는 상황을 판정한다. 형제 함수 `pgbuf_is_thread_high_priority`(11678-11720행)는 같은 holder 리스트를 훑되 다른 기준을 쓴다 — `holder->bufptr->next_wait_thrd != NULL` (누가 나를 기다림, 11692행) 또는 `ptype == PAGE_VOLHEADER` 등 핫 페이지 보유 (11698행). 둘 다 락 없이 holder 리스트를 순회하는데, holder 리스트는 스레드 소유이므로 안전하다.

---

## 8. 인터럽트 처리

### 8.1 `pgbuf_Pool.check_for_interrupts` 플래그

`pgbuf_initialize`에서 `false`로 초기화 (1650행).

**설정** — `pgbuf_force_to_check_for_interrupts` (5332-5335행):

```c
void
pgbuf_force_to_check_for_interrupts (void)
{
  pgbuf_Pool.check_for_interrupts = true;
}
```

원자성도, 뮤텍스도 없는 `bool` 쓰기다. **최적화 힌트 플래그**이므로 즉각적 가시성이 필요 없다는 설계 — 늦게 보이면 다음 fix에서 검사될 뿐이다.

**소비** — 세 지점 모두 동일 패턴:

```c
if (logtb_get_check_interrupt (thread_p) == true)
  {
    if (logtb_is_interrupted (thread_p, true, &pgbuf_Pool.check_for_interrupts) == true)
      { er_set (ER_ERROR_SEVERITY, ARG_FILE_LINE, ER_INTERRUPTED, 0); ... }
  }
```

| 위치 | 라인 | 실패 시 |
|---|---|---|
| `pgbuf_fix` `try_again:` 직후 | 2296-2298 | 에러 반환 |
| `pgbuf_copy_to_area` 진입부 | 4657-4664 | `return NULL` |
| `pgbuf_is_log_check_for_interrupts` | 5346-5356 | `return true` |

**플래그가 `logtb_is_interrupted`의 3번째 인자로 넘어가는 것이 핵심**이다. 즉 `logtb_is_interrupted`가 이 포인터를 통해 **플래그를 다시 `false`로 내릴 수 있다.** 더 이상 인터럽트된 트랜잭션이 없으면 pgbuf가 매 fix마다 `logtb_get_check_interrupt`/`logtb_is_interrupted`를 부르는 비용을 없애는 자동 해제 메커니즘이다.

두 단계 게이트인 이유: `logtb_get_check_interrupt (thread_p)`는 **이 스레드가 인터럽트 검사를 원하는지** (스레드 로컬), `pgbuf_Pool.check_for_interrupts`는 **시스템에 인터럽트가 존재하는지** (전역). 둘 다 참이어야 실제 판정 함수를 호출한다.

`pgbuf_fix`의 검사가 `try_again:` 레이블 바로 뒤에 있다는 점(2294-2298행)이 중요하다 — latch 대기로 재시도할 때마다 인터럽트를 재검사하므로, 대기 중에 도착한 인터럽트에 반응한다.

### 8.2 `pgbuf_is_log_check_for_interrupts` (5344-5357행)

```c
bool
pgbuf_is_log_check_for_interrupts (THREAD_ENTRY * thread_p)
{
  if (pgbuf_Pool.check_for_interrupts == true
      && logtb_is_interrupted (thread_p, true, &pgbuf_Pool.check_for_interrupts) == true)
    {
      er_set (ER_ERROR_SEVERITY, ARG_FILE_LINE, ER_INTERRUPTED, 0);
      return true;
    }
  else
    return false;
}
```

`pgbuf_fix` / `pgbuf_copy_to_area`와 달리 `logtb_get_check_interrupt`를 먼저 부르지 않는다 — 전역 플래그만 확인하고 바로 `logtb_is_interrupted`로 간다. **이 함수는 pgbuf 외부(로그 매니저 등)가 인터럽트를 검사하는 진입점**이며, 호출자가 스레드 수준 게이트를 이미 확인했다고 가정한다.

함수 이름과 주석("Force the page buffer manager to check for possible interrupts when pages are fetched", 5339행)이 `pgbuf_force_to_check_for_interrupts`의 것을 복사한 것으로 보인다 — 이 함수는 강제하지 않고 조회한다.

---

## 9. 외부 모듈 의존성 표

| 모듈 | pgbuf가 사용하는 함수/타입 | pgbuf가 기대하는 계약 | 근거 라인 |
|---|---|---|---|
| **fileio** (`file_io.h`) | `fileio_read (thread_p, fd, iopage, pageid, IO_PAGESIZE)` | 성공 시 non-NULL. 실패 시 `er_set` 완료 + 버퍼 내용은 신뢰 불가 → pgbuf가 BCB를 invalid list로 반납 | 8466-8489, 11429 |
| | `fileio_write (thread_p, fd, iopage, pageid, IO_PAGESIZE, write_mode)` | `write_mode`는 DWB 활성 시 `FILEIO_WRITE_NO_COMPENSATE_WRITE`, 아니면 `FILEIO_WRITE_DEFAULT_WRITE`. 실패 시 NULL | 10829-10836 |
| | `fileio_get_volume_descriptor (volid)` | 볼륨 fd 반환. 유효성 검증은 pgbuf가 사전 수행 | 8466, 10834, 11429 |
| | `fileio_get_volume_label (volid, PEEK)` | `PEEK` 모드는 복사 없이 내부 문자열 포인터 반환. `NULL`이면 볼륨 미존재 | 11019, 5322, 다수 |
| | `fileio_init_lsa_of_page (iopage, IO_PAGESIZE)` | 일반 페이지 LSA를 NULL LSA로 초기화 (헤더 + 워터마크 양쪽) | 3640, 5598, 8560, 11234 |
| | `fileio_set_page_lsa (iopage, lsa, IO_PAGESIZE)` | LSA를 헤더와 워터마크 양쪽에 기록 | 4990 |
| | `fileio_get_page_watermark_pos (io_page, page_size)` | 페이지 끝 워터마크 구조체 주소 반환 — temp LSA 이중 기록에 필요 | 17271 |
| | `fileio_page_check_corruption (thread_p, iopage, &is_corrupted)` | 체크섬/워터마크 기반 손상 판정. `pgbuf_is_consistent`가 불일치의 원인 구분에 사용 | 11457-11459 |
| | `fileio_flush_control_initialize / _add_tokens / _finalize` | flush control 데몬이 토큰 버킷 기반 IO 스로틀링을 위임. `_initialize` 실패 시 데몬 생성을 포기 | 17065, 17089, 17096, 17176-17181 |
| | `fileio_read_user_area` / `fileio_write_user_area` | 버퍼 풀 우회 부분 IO. **`ENABLE_UNUSED_FUNCTION`으로 봉인, 현재 미사용** | 4726, 4824 |
| **dwb** (`double_write_buffer.hpp`) | `dwb_is_created ()` | pgbuf가 매 flush마다 확인. **flush 도중 값이 바뀔 수 있음**을 pgbuf가 처리 (`start_copy_page` 재진입) | 10743, 10831, 10820-10826 |
| | `dwb_read_page (thread_p, vpid, iopage, &success)` | 반환 `NO_ERROR` + `success == true`면 DWB에서 복사 완료. `NO_ERROR`가 아니면 pgbuf가 `assert(false)` — **절대 실패하지 않아야 함** | 8455-8462 |
| | `dwb_set_data_on_next_slot (thread_p, iopage, false, false, &dwb_slot)` | 슬롯 확보 성공 시 `dwb_slot != NULL`. `NULL`이면 DWB가 비활성화됨 | 10763-10774 |
| | `dwb_add_page (thread_p, iopage, vpid, false, &dwb_slot)` | `NO_ERROR` + `dwb_slot == NULL`이면 DWB가 도중에 꺼진 것 → pgbuf가 비-DWB 경로로 재시도 | 10817-10827 |
| | **암묵적 계약** | pgbuf가 넘기는 `iopage`는 **이미 TDE 암호화된 상태**. DWB는 TDE를 모른다 | 10748-10761 |
| | **암묵적 계약** | temp 볼륨 페이지는 DWB를 거치지 않는다 (`uses_dwb = dwb_is_created () && !is_temp`) | 10743 |
| **tde** (`tde.h`) | `tde_is_loaded ()` | `pgbuf_set_tde_algorithm`이 `NONE`이 아닌 값 설정 시 assert로 강제 | 5062 |
| | `tde_decrypt_data_page (src, algo, is_temp, dest)` | **in-place 허용** (src == dest). 실패 시 `er_set` 완료 | 8497-8499 |
| | `tde_encrypt_data_page (src, algo, is_temp, dest)` | out-of-place. **멱등해야 함** (DWB 재시도 시 재호출) | 10751 |
| | `tde_get_algorithm_name (algo)` | 진단 로그용 문자열 | 5074, 15154 |
| | `tde_er_log (fmt, ...)` | TDE 전용 진단 로그 매크로 | 5073, 15153, 15231, 15270 |
| | **암묵적 계약** | 알고리즘 상태는 `FILEIO_PAGE.prv.pflag` 비트에 저장, nonce는 `prv.tde_nonce`. pgbuf가 페이지 신원 확정/스크램블 시 nonce를 0으로 리셋 | 5413, 5608, 11244 |
| **log manager** (`log_manager.h`, `log_append.hpp`, `log_impl.h`) | `logpb_flush_log_for_wal (thread_p, &lsa)` | **WAL 규칙의 핵심** — 페이지 LSA까지의 로그가 디스크에 도달함을 보장. `oldest_unflush_lsa`가 NULL이 아닐 때만 호출 | 10786 |
| | `log_Gl.chkpt_redo_lsa`, `log_Gl.chkpt_lsa_lock` | pgbuf가 **직접 전역 구조체를 읽고 뮤텍스를 잡는다** (캡슐화 위반). `oldest_unflush_lsa` 최초 설정 시 역행 검증 | 4998-5007 |
| | `log_append_undoredo_data2 (..., RVPGBUF_*, ...)` | TDE 설정(127), dealloc, new page 로깅 | 5078, 15146, 15046 |
| | `log_append_redo_data2` | redo-only new page 로깅 | 15063 |
| | `log_append_compensate_with_undo_nxlsa` | dealloc undo 보상 로깅 | 15237-15239 |
| | `log_skip_logging (thread_p, &addr)` | `pgbuf_copy_from_area`가 페이지 로깅을 명시적으로 억제 | 4851 |
| | `log_is_in_crash_recovery ()` | `pgbuf_check_page_ptype_internal`이 릴리스 빌드에서 무조건 통과할지 판정 | 11148 |
| | `log_is_in_crash_recovery_and_not_yet_completes_redo ()` | `pgbuf_check_bcb_page_vpid`의 `maybe_deallocated` 면제 조건 | 11205 |
| | `LOG_ISRESTARTED ()` | `pgbuf_is_temporary_volume`이 부팅 중 무조건 `false` 반환 | 5498 |
| | `log_wakeup_log_flush_daemon ()` | flush 전 로그 flush 촉진 | (2곳) |
| | `logtb_get_check_interrupt (thread_p)` | 스레드 수준 인터럽트 검사 희망 여부 | 2294, 4657 |
| | `logtb_is_interrupted (thread_p, true, &pgbuf_Pool.check_for_interrupts)` | **3번째 인자를 통해 pgbuf의 전역 플래그를 자동 해제할 수 있음** | 2296, 4659, 5347 |
| | `logtb_is_current_active (thread_p)` | temp 볼륨 LSA 설정 거부 조건 | 4984 |
| | `logtb_set_check_interrupt` | latch 대기 전후 인터럽트 검사 억제/복원 | (2곳) |
| | `logtb_find_client_name_host_pid` | latch 타임아웃 에러 메시지 구성 | (3곳) |
| | `LOG_FIND_CURRENT_TDES (thread_p)` | 보상 로그의 트랜잭션 기술자 | 15238 |
| **perf_monitor** (`perf_monitor.h`) | `perfmon_inc_stat (thread_p, PSTAT_*)` | 52개 지점. 카운터 등록/집계는 perfmon 책임 | 다수 |
| | `perfmon_add_stat`, `perfmon_time_stat`, `perfmon_time_bulk_stat` | 누적/시간 통계 | (10, 2, 2곳) |
| | `perfmon_is_perf_tracking ()` | 전역 추적 활성 여부. pgbuf가 비싼 통계 수집을 게이트 | 2288, 2850, 3110, 17015 |
| | `perfmon_is_perf_tracking_and_active (FLAG)` | 플래그별 세분화 게이트 | 3843, 9284, 다수 |
| | `perfmon_get_activation_flag ()` | 비트마스크 직접 확인 (hash anchor, detailed btree) | 7797, 8064, 15019 |
| | `perfmon_pbx_fix / _unfix / _promote / _*_acquire_time` | 다차원 히스토그램. pgbuf가 page_type/latch_mode/cond_type 축을 제공 | 2594-2623, 3000, 3137 |
| | `perfmon_diff_timeval` | flush control 데몬의 경과 시간 계산 | 17086 |
| | `PERF_UTIME_TRACKER_*` 매크로 | 시간 추적기 시작/종료/재시작 | 17010-17022, 8260 |
| | **암묵적 계약** | `PAGE_TYPE` → `PERF_PAGE_TYPE` **직접 캐스팅 가능** (값 대응 유지) | 15025 |
| **thread manager** (`thread_manager.hpp`, `thread_daemon.hpp`, `thread_looper.hpp`, `thread_entry_task.hpp`) | `cubthread::get_manager ()` | `NULL` 가능 (`pgbuf_monitor_sum_*`가 방어) | 2122, 17110 |
| | `mgr->get_all_entries ()`, `mgr->get_max_thread_count ()` | 관리 엔트리 배열. **`thread_num_total_threads ()`와 다름** — 후자는 +1 | 2128-2133 |
| | `cubthread::get_main_entry ()` | 관리 배열 밖의 시스템 스레드. SA_MODE에서 유일한 작성자 | 2145 |
| | `mgr->create_daemon (looper, task, name)` | 4개 데몬 생성: `pgbuf-maintain`(100ms), `pgbuf-page-flush`(가변), `pgbuf-page-post-flush`(1/10/100ms 계단), `pgbuf-flush-control`(50ms) | 17117, 17137, 17163, 17186 |
| | `mgr->destroy_daemon (daemon)` | 종료 시 4개 모두 파괴 | 17206-17209 |
| | `daemon->get_stats (statsp)`, `cubthread::daemon::get_stats_value_count ()` | 고정 스트라이드 통계 레이아웃 | 17222-17242 |
| | `daemon->was_woken_up ()`, `->reset_looper ()` | flush 데몬이 강제 1회 실행 판정, post-flush가 루퍼 리셋 | 16991, 17037 |
| | `cubthread::looper` (고정 간격 / 함수 / `std::array<delta_time,3>` 계단) | post-flush는 3단 계단 백오프 | 17153-17161 |
| | `thread_get_entry_index (thread_p)` | `show_status[]`, `thrd_holder_info[]` 인덱싱. 0 .. `thread_num_total_threads()` 범위 보장 | 2234, 8142, 10690, 15000 |
| | `thread_get_current_entry_index ()` | `bcbmon`이 `monitor.bcb_locks[]` 인덱싱 | 16614, 16659 |
| | `thread_num_total_threads ()` | `show_status` / `bcb_locks` 배열 크기 (+1 포함) | 1849, 14040 |
| | `thread_suspend_wakeup_and_unlock_entry` / `_timeout_` | victim/latch 대기. `THREAD_ALLOC_BCB_SUSPENDED` / `THREAD_PGBUF_SUSPENDED` 상태 사용 | 8256, (2곳) |
| | `thread_lock_entry` / `thread_unlock_entry` / `thread_wakeup_already_had_mutex` | latch 대기 큐 조작 | 다수 |
| | `thread_get_sort_stats_active (thread_p)` | sort 통계를 pgbuf가 대신 증가할지 | 4747, 8540, 8571 |
| | `THREAD_ENTRY::pgbuf_fix_req_cnt` / `pgbuf_pg_unfix_cnt` | **pgbuf가 THREAD_ENTRY에 필드를 소유** (역방향 결합). 단일 작성자, 비원자적 | 2253, 6681, 2136, 2182 |
| | `THREAD_ENTRY::get_pgbuf_tracker ()` | 누출 검출기. `!NDEBUG` 전용 | 2520, 3149, 15169 |
| | `THREAD_ENTRY::next_wait_thrd`, `type`, `resume_status`, `request_fix_count` | latch 대기 큐 노드로 THREAD_ENTRY를 직접 사용 | 14646-14655, 8264, 7193 |
| | `VACUUM_IS_THREAD_VACUUM_WORKER (th)`, `TT_VACUUM_WORKER` | vacuum 스레드 식별 | 285, 291, 14650 |
| **lockfree** (`lockfree_circular_queue.hpp`) | `lockfree::circular_queue<THREAD_ENTRY *>` × 2 | victim 대기 스레드 (high/low priority). 크기 `N` / `2N` | 749-750, 1789, 1799 |
| | `lockfree::circular_queue<PGBUF_BCB *>` | post-flush 처리 대기 BCB. 크기 `PGBUF_FLUSHED_BCBS_BUFFER_SIZE` | 821, 1808 |
| | `lockfree::circular_queue<int>` × 3 | victim 보유 LRU 인덱스 (private / big private / shared). 크기 `2 × 리스트 수` | 823-825, 1820-1839 |
| | `->produce (v)` / `->consume (v)` | **실패 가능** (`bool` 반환). pgbuf가 모든 호출에서 실패를 처리 — 큐 만석/공백은 정상 상태 | 8214, 15443, 16351, 16396 |
| | `->size ()` | 근사 게이지 (`pgbuf_peek_stats`) | 14762-14782 |
| | **암묵적 계약** | `produce` 실패 시 pgbuf가 대체 경로를 갖는다 (예: 16506행 재삽입 시도, 주석 "temporarily creating the impression that queue is full") | 16506-16513 |
| **disk_manager** | `xdisk_get_purpose (NULL, volid) == DB_TEMPORARY_DATA_PURPOSE` | temp 볼륨 판정. **`thread_p`를 `NULL`로 넘김** — 재귀 fix 회피. `LOG_ISRESTARTED()` 이후에만 호출 | 5502 |
| | `disk_is_page_sector_reserved_with_debug_crash (thread_p, volid, pageid, crash)` | 섹터 예약 비트맵 확인. `crash` 인자로 디버그 크래시 제어 | 11027 |
| | `disk_volheader_check_magic (thread_p, pgptr)` | `pageid == 0` 페이지 dirty 마킹 시 매직 검증 (`SERVER_MODE && !NDEBUG`) | 4892 |
| **vacuum** | `VACUUM_IS_THREAD_VACUUM_WORKER (th)` | `PGBUF_SHOULD_IGNORE_UNFIX` / `PGBUF_VACUUM_SHOULD_IGNORE_UNFIX`의 핵심 판정 | 285, 291 |
| | `TT_VACUUM_WORKER` (스레드 타입) | `pgbuf_has_any_non_vacuum_waiters`가 대기 큐에서 제외 | 14650 |
| | `VACUUM_MAX_WORKER_COUNT` | private LRU 인덱스 배분 | (1곳) |
| | **역방향 계약** | vacuum이 페이지를 해제할 수 있으므로 캐시드 힙 스캔이 원본 페이지 watcher를 유지해야 함 | `heap_file.c:7633-7635` |
| | **역방향 계약** | vacuum 워커의 unfix는 LRU 승격에 기여하지 않고, LRU 3 존에서는 즉시 direct victim이 된다 | 6769-6784 |
| **boot_sr** | `BO_IS_FLUSH_DAEMON_AVAILABLE ()` | 4개 데몬 태스크 전부 진입부에서 확인 후 즉시 반환 | 16954, 16988, 17026, 17051 |
| **query_manager** | `qmgr_get_current_query_id (thread_p)` | SystemTap IO 프로브에 query id 부착 (`ENABLE_SYSTEMTAP`) | 8449, 10800 |
| **btree** | `btree_get_perf_btree_page_type (thread_p, pgptr)` | B-tree 페이지 세분화 (root/non-leaf/leaf/overflow). `PERFMON_ACTIVATION_FLAG_DETAILED_BTREE_PAGE` 게이트 | 15021 |
| **show_scan / showstmt** | `showstmt_alloc_array_context (thread_p, 1, 19)`, `showstmt_alloc_tuple_in_context`, `showstmt_free_array_context` | `SHOW PAGE BUFFER STATUS` 결과 컨텍스트. `pgbuf_start_scan`이 `show_Requests[SHOWSTMT_PAGE_BUFFER_STATUS].start_func`로 등록 (`src/query/show_scan.c:233-235`) | 17410, 17418, 17524 |
| **numeric_opfunc / dbtype** | `numeric_db_value_coerce_to_num`, `db_make_double/bigint/int`, `db_value_domain_init` | `numeric(13,10)` / `numeric(20,10)` 컬럼 생성 | 17429, 17438, 17486 |
| **system_parameter** | `PRM_ID_PB_NBUFFERS`, `_PB_LRU_HOT_RATIO`, `_PB_BUFFER_FLUSH_RATIO`, `_PAGE_BG_FLUSH_INTERVAL_MSECS`, `_PB_DEBUG_PAGE_VALIDATION_LEVEL`, `_PB_MONITOR_LOCKS` | 기동 시 읽기 + flush 데몬은 매 주기 재읽기 | 1667-1685, 10996, 16932, 16999 |
| **memory_alloc** | `cub_aligned_alloc (64, size, __FILE__, __LINE__)` | `show_status` 배열의 캐시 라인 정렬 | 1848-1850 |
| | `free_and_init (ptr)` | 프로젝트 표준 (bare `free` 금지). copy buffer도 사용 | 912, 2016, 11482 |
| | `placement_new (&obj)` | `std::atomic` 멤버를 가진 `PGBUF_BCB`의 값 초기화 (`memset` 대체) | 890 |
| **resource_tracker** (`resource_tracker.hpp`) | `cubbase::pgbuf_tracker` = `resource_tracker<const char *>` | fix/unfix 균형 검증. `increment (file, line, ptr)` / `decrement (ptr)` | 2520, 3149 |
| **scope_exit** (`scope_exit.hpp`) | RAII 스코프 정리 | C++ 영역 한정 (엔진 C 코드에서 RAII 금지 규칙의 예외) | include 69 |
| **SystemTap probes** (`probes.h`) | `CUBRID_IO_READ_START/END`, `CUBRID_IO_WRITE_START/END` | `ENABLE_SYSTEMTAP` 전용. read/write 구간에 query id + 크기 + 에러 여부 부착 | 8452, 8462, 8508, 10804, 10841 |

---

## 10. 요약: 발견된 문제점

정독 과정에서 확인된, 코드 자체의 문제 또는 문서화되지 않은 위험을 정리한다.

### 10.1 확실한 결함

| # | 위치 | 문제 |
|---|---|---|
| 1 | 11349, 11362, 11363행 | `pgbuf_dump`가 **컴파일 불가**: `bufptr->fcnt` / `bufptr->zone` 필드 부재(현재는 `atomic_latch` / `flags` 인코딩), `consistenet_str` 오타. `CUBRID_DEBUG`가 기본 꺼짐이라 발견되지 않았다. `pgbuf_dump_if_any_fixed`(→`pgbuf_finalize`)와 `pgbuf_unfix`, `pgbuf_invalidate`의 진단 경로가 모두 무효 |
| 2 | 3284행 | `pgbuf_unfix_all`의 `consistenet_str` 동일 오타 (`CUBRID_DEBUG` 내부이므로 일반 빌드는 컴파일됨) |
| 3 | 15256, 15271행 | `pgbuf_rv_dealloc_undo_compensate`가 초기화되지 않은 `VPID vpid`를 `tde_er_log`에 전달. `!NDEBUG` + 암호화 페이지 조건에서 미초기화 읽기 |
| 4 | 10752-10757행 | `tde_encrypt_data_page` 실패 시 `pgbuf_bcb_mark_was_not_flushed`를 호출하지 않아 BCB가 `FLUSHING_TO_DISK` 상태로 영구히 남고 flush waiter도 깨어나지 않음. IO 실패 경로(10845-10857행)와 비대칭 |
| 5 | 10828, 10833행 | `show_status->num_pages_written`과 `PSTAT_PB_NUM_IOWRITES`가 **DWB 경유 쓰기를 세지 않음**. DWB 활성 시 `Num_pages_written` / `Pages_written_rate` / `PB_NUM_IOWRITES`가 사실상 0 |
| 6 | 11524-11526행 | `pgbuf_add_fixed_at`의 오버플로 `assert`가 `strcat` **이후**에 위치. 검사가 무의미 |
| 7 | 14771-14779행 | `pgbuf_peek_stats`가 `lfcq_big_prv_num` / `lfcq_prv_num`을 큐 `NULL`일 때 대입하지 않음. 진입부 초기화 목록(14695-14703행)에도 없어 미초기화 출력 가능 |

### 10.2 문서화 오류

| # | 위치 | 문제 |
|---|---|---|
| 8 | 4642-4645행 | `pgbuf_copy_to_area` 주석 "it is only buffered when the value of `do_fetch` is **false**" — 코드는 `true`일 때 버퍼링 (4693행). 정반대 |
| 9 | 11645행 | `pgbuf_has_perm_pages_fixed` 반환 설명 "The number of pages fixed" — 실제 반환형은 `bool` |
| 10 | 14665-14666행 | `pgbuf_has_prevent_dealloc` 주석이 "scanners"와 "waiters"를 혼용 |
| 11 | 5339행 | `pgbuf_is_log_check_for_interrupts` 주석이 `pgbuf_force_to_check_for_interrupts`의 것("Force the page buffer manager to...")을 복사. 이 함수는 강제하지 않고 조회 |

### 10.3 문서화되지 않은 사용 제약

| # | 대상 | 제약 |
|---|---|---|
| 12 | copy buffer (861-934행) | `PRM_ID_PB_DEBUG_PAGE_VALIDATION_LEVEL >= 3`인 디버그 빌드에서 사본 `PAGE_PTR`에 `pgbuf_get_vpid` / `_vpid_ptr` / `_latch_mode` / `_page_ptype` / `_volume_id` / `_lsa` / `pgbuf_set_page_ptype` / `pgbuf_set_dirty`를 호출하면 `pgbuf_is_valid_page_ptr`가 `ER_PB_UNKNOWN_PAGEPTR` + `assert(false)`로 중단 (11085-11089행) |
| 13 | `SHOW PAGE BUFFER STATUS` | **파괴적 읽기**. 모든 델타 컬럼(1,2,3,14,15,16,17,18)이 "마지막 SHOW 이후"를 의미하며 SHOW가 `status_old`를 갱신한다 (17506-17511행). 동시 모니터링 시 상호 간섭 |
| 14 | `Clean_pages` / `Dirty_pages` | invalid 존 BCB까지 포함하므로 합이 `Pool_size`와 같고, `Free_pages`와 중복 계산됨 (17296-17310행) |
| 15 | `Victim_candidate_pages` | "LRU 3 존 && dirty" 정의 (17312행)로, pgbuf 내부의 실제 victim 후보(clean 필요)와 다르다. 실제 후보 수는 `lru_list[i].count_vict_cand` |
| 16 | `Page_size` 컬럼 | `IO_PAGESIZE`가 아니라 `PGBUF_IOPAGE_BUFFER_SIZE` (BCB 슬롯 크기, `CUBRID_DEBUG`에서 가드 8바이트 포함) (17448행) |
| 17 | `pgbuf_copy_to_area` 레지던트 경로 | BCB 뮤텍스만으로 `memcpy` — latch 없음 (4739-4753행). 찢어진 읽기 가능. `PAGE_AREA` 전용 전제에 의존 |
| 18 | `pgbuf_copy_from_area` | `ENABLE_UNUSED_FUNCTION` 봉인으로 `do_fetch` 인자가 **완전히 무시**되며, 항상 `NEW_PAGE`로 fix하므로 `start_offset` 밖 영역이 초기화 상태가 됨 (4839행) |
| 19 | `pgbuf_is_temporary_volume` | `LOG_ISRESTARTED()` 이전에는 항상 `false` (5497-5501행). 부팅/복구 중 temp 페이지가 WAL·LRU 억제·DWB 우회·temp LSA 강제 등 **모든 특수 처리를 받지 못한다** |
| 20 | `pgbuf_simple_fix` / `_unfix` | latch 없음, holder 없음, tracker 없음. `pgbuf_unfix`로 해제 불가. 일반 fix와 혼용 금지 (2643-2649행 경고) |
| 21 | `pgbuf_get_vpid_ptr` | unfix 이후 포인터 사용 금지 — 다른 페이지의 VPID를 보게 됨 (5186-5189행) |
| 22 | `pgbuf_has_any_waiters` vs `_non_vacuum_waiters` | 전자는 BCB 뮤텍스 보유, 후자는 락 없는 리스트 순회 (14622 vs 14646). 동기화 강도 비대칭이 문서화되지 않음 |
| 23 | `pgbuf_daemons_get_stats` | 데몬이 `NULL`이면 해당 슬롯을 채우지 않으므로 호출자가 사전 0 초기화 필요 (17222-17242행) |
| 24 | `pgbuf_is_temporary_volume`의 호출 빈도 | `PGBUF_SHOULD_IGNORE_UNFIX`(291행)를 통해 **모든 unfix 핫 패스**에서 `xdisk_get_purpose`를 호출. 캐싱 없음 |

### 10.4 설계상 주목할 결합

| # | 결합 | 설명 |
|---|---|---|
| 25 | pgbuf → `log_Gl` 직접 접근 | `pgbuf_set_lsa`가 `log_Gl.chkpt_redo_lsa`를 읽고 `log_Gl.chkpt_lsa_lock`을 직접 잡는다 (4998-5007행). 로그 매니저의 내부 상태에 대한 캡슐화 위반 |
| 26 | pgbuf → `THREAD_ENTRY` 필드 소유 | `pgbuf_fix_req_cnt` / `pgbuf_pg_unfix_cnt`가 `THREAD_ENTRY`에 산다 (2253, 6681행). 성능을 위한 의도적 역방향 결합이며 주석으로 정당화됨 |
| 27 | `PAGE_TYPE` ↔ `PERF_PAGE_TYPE` | `pgbuf_get_page_type_for_stat`의 직접 캐스팅(15025행)이 두 열거형의 값 대응을 요구. 컴파일 타임 검증 없음 |
| 28 | `pgbuf_flags_mask_sanity_check` | 컴파일 타임 `static_assert`로 표현 가능한 검사를 런타임 함수로 둠 (16800-16821행). 다만 `PGBUF_ABORT_RELEASE`로 기동 즉시 중단하므로 안전성은 확보 |

