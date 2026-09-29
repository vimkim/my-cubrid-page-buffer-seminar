# CUBRID page_buffer.c 기술 노트 — ordered fix / watcher, dealloc·invalidate, VPID 페이지 락

분석 대상: `/home/vimkim/gh/cb/pgbuf-analysis/src/storage/page_buffer.c` (17,535줄), `/home/vimkim/gh/cb/pgbuf-analysis/src/storage/page_buffer.h` (522줄).
이하 `pb.c:NNNN`은 `page_buffer.c:NNNN`, `pb.h:NNNN`은 `page_buffer.h:NNNN`을 뜻합니다.

---

## 0. 요약: 이 서브시스템이 해결하는 문제

CUBRID의 페이지 래치(latch)는 **데드락 탐지기가 없습니다.** 레코드 락(`lock_manager.c`)은 wait-for graph를 유지하고 victim을 고르지만, 페이지 래치는 `pgbuf_timed_sleep`(pb.c:7235)에서 `pgbuf_latch_timeout_msecs`(pb.c:107, `300 * 1000` = 300초)까지 자다가 `ER_LK_PAGE_TIMEOUT`을 내는 것이 전부입니다. 즉 페이지 래치 데드락은 **탐지되지 않고 5분간 서버가 멈춘 뒤 에러**가 됩니다.

따라서 페이지 래치는 데드락을 *탐지*하는 대신 *구조적으로 불가능하게* 만들어야 하며, 그 수단이 **전역 획득 순서(total order)를 강제하는 ordered fix**입니다. 순서는

```
T = (group_id, rank, vpid)     -- group_id NULL은 항상 최후순위
```

이며 `pgbuf_compare_hold_vpid_for_sort`(pb.c:12130-12185)가 이 순서의 유일한 정의입니다.

핵심 통찰 두 가지:

1. **조건부 래치가 성공하면 절대 데드락일 수 없다.** 데드락은 "대기"가 있어야 성립하므로, 대기 없이 얻은 래치는 순서를 위반해도 안전합니다. 그래서 `pgbuf_ordered_fix`는 먼저 조건부로 시도하고(pb.c:12287-12296), 성공하면 재정렬 없이 watcher만 붙이고 빠져나갑니다(pb.c:12327-12333).
2. **조건부가 실패하면 대기해야 하므로, 대기 전에 순서를 위반하는 모든 페이지를 놓는다.** 이것이 unfix-reorder-refix 시퀀스입니다(pb.c:12604-12944). 놓았다가 다시 잡으므로 페이지 내용이 바뀔 수 있고, 그 사실을 호출자에게 알리는 것이 `page_was_unfixed` 플래그(pb.h:241)입니다.

---

## 1. ordered fix가 없을 때의 데드락 시나리오

### 1.1 상황 설정

heap의 `REC_RELOCATION` 레코드를 갱신하는 두 트랜잭션. 같은 heap(HFID의 header page = VPID `(0,50)`)에 속한 두 페이지가 서로 상대의 forward 대상입니다.

| 객체 | home page | forward page |
|---|---|---|
| OID-A | `(0,100)` | `(0,90)` |
| OID-B | `(0,90)` | `(0,100)` |

두 페이지 모두 `PAGE_HEAP`이고 rank는 `PGBUF_ORDERED_HEAP_NORMAL`(pb.h:225)입니다. `heap_prepare_get_context`류 코드는 항상 **home을 먼저 래치하고, 레코드를 읽어 forward OID를 얻은 뒤 forward를 래치**합니다(heap_file.c:7145-7150의 흐름). 즉 래치 순서가 데이터에 의해 결정되므로 스레드마다 다를 수 있습니다.

### 1.2 ordered fix 없이 `pgbuf_fix` 무조건 래치만 쓰는 경우

```
시각   Thread A (OID-A 갱신)                     Thread B (OID-B 갱신)
----   --------------------------------------   --------------------------------------
t1     pgbuf_fix((0,100), WRITE, UNCOND)  → OK
       [holds W (0,100)]
t2                                              pgbuf_fix((0,90), WRITE, UNCOND) → OK
                                                [holds W (0,90)]
t3     spage_get_record((0,100), slot)
       → forward_oid = (0,90,slot')
t4                                              spage_get_record((0,90), slot)
                                                → forward_oid = (0,100,slot'')
t5     pgbuf_fix((0,90), WRITE, UNCOND)
       → pgbuf_latch_bcb_upon_fix (pb.c:6249)
       → pgbuf_block_bcb (pb.c:6998)
       → pgbuf_timed_sleep (pb.c:7235)
       [BLOCKED: B가 W 보유]
t6                                              pgbuf_fix((0,100), WRITE, UNCOND)
                                                → pgbuf_timed_sleep
                                                [BLOCKED: A가 W 보유]
----   ============ DEADLOCK ============
t5+300s  ER_LK_PAGE_TIMEOUT (pgbuf_timed_sleep_error_handling, pb.c:7146)
t6+300s  ER_LK_PAGE_TIMEOUT
```

`pgbuf_latch_timeout_msecs`(pb.c:107)가 300,000ms이므로 **두 워커가 5분간 완전히 멈춥니다.** 그 사이 `(0,90)`, `(0,100)`을 필요로 하는 다른 모든 워커가 연쇄 대기에 빠집니다. 탐지도, 자동 abort도 없습니다.

### 1.3 ordered fix가 이를 어떻게 막는가 (같은 타임라인)

두 스레드 모두 watcher를 `group_id = (0,50)`(HFID header), `rank = NORMAL`로 초기화합니다(`PGBUF_INIT_WATCHER`, pb.h:133-143 / heap_file.c:20044-20045). 전역 순서상 `(0,90) < (0,100)`입니다(같은 group, 같은 rank, `vpid.pageid` 90 < 100 → pb.c:12178).

```
시각   Thread A                                      Thread B
----   ------------------------------------------    -----------------------------------------
t1     pgbuf_ordered_fix((0,100), W, &w_home)
       thrd_hold_list == NULL
         → latch_condition = UNCONDITIONAL (pb.c:12280-12283)
       pgbuf_fix → OK
       add_watch_instance_internal (pb.c:12327)
       [holds W (0,100), watch_count=1]
t2                                                   pgbuf_ordered_fix((0,90), W, &w_home) → OK
                                                     [holds W (0,90)]
t3     pgbuf_ordered_fix((0,90), W, &w_fwd)
       holder list 비어있지 않음
         → latch_condition = CONDITIONAL (pb.c:12287)
       pgbuf_fix(CONDITIONAL) → NULL (B가 보유)
       er_status = NO_ERROR로 초기화 (pb.c:12389)
       ── holder 순회 (pb.c:12398-12602) ──
       held=(0,100): compare(req=(0,90), held=(0,100)) = -1
         → diff < 0 → 반드시 unfix (pb.c:12559-12577)
         → ordered_holders_info[0] 저장
       ── unfix 단계 (pb.c:12606-12671) ──
       register_avoid_deallocation((0,100)) (pb.c:12639)
       fix_count회 pgbuf_unfix (pb.c:12641-12644)
       PGBUF_CLEAR_WATCHER(w_home);
       w_home.page_was_unfixed = true  (pb.c:12663-12664)
       [holds NOTHING]  ←── 여기가 핵심
t4                                                   pgbuf_ordered_fix((0,100), W, &w_fwd)
                                                     CONDITIONAL 시도
                                                     → A가 이미 놓았으므로 즉시 성공
                                                     [holds W (0,90),(0,100)] → 작업 완료
                                                     → 두 페이지 모두 unfix
t5     qsort → [(0,90), (0,100)]  (pb.c:12769)
       refix (0,90) UNCOND → B가 놓을 때까지 대기
         (A는 아무것도 안 들고 있으므로 B를 막지 않음)
       → OK
       refix (0,100) UNCOND → OK
       unregister_avoid_deallocation((0,100)) (pb.c:12883)
       watcher 재연결 (pb.c:12919-12942)
       return NO_ERROR, w_home.page_was_unfixed == true
t6     호출자가 page_was_unfixed 확인 →
       spage_get_record 재실행 (heap_file.c:21351-21365)
```

### 1.4 왜 이것이 일반적으로 안전한가 (증명 스케치)

`pgbuf_ordered_fix` 종료 시점에 스레드가 보유한 래치 집합을 `T` 순서로 나열하면:

- `diff > 0`(요청 페이지가 기존 페이지보다 **뒤**)인 holder는 그대로 유지됩니다(pb.c:12585-12599). 즉 유지되는 페이지는 모두 요청 페이지보다 `T`상 **앞**입니다.
- `diff < 0`인 holder는 전부 unfix되고, 요청 페이지와 함께 `qsort`로 정렬되어(pb.c:12767-12770) `T` 오름차순으로 재획득됩니다(pb.c:12773-12794).

따라서 **모든 스레드는 항상 `T` 오름차순으로만 래치를 대기**하며, 이는 고전적 ordered-resource 데드락 회피 조건입니다. `T`상 최소 페이지를 가진 스레드는 언제나 진행 가능합니다.

### 1.5 프로토콜에서 제외되는 예외 (반드시 인지할 것)

| 제외 대상 | 위치 | 근거/가정 |
|---|---|---|
| `watch_count <= 0`인 holder | pb.c:12402-12408 | watcher 없이는 fix를 복원할 방법이 없음. "이 페이지는 래치 데드락을 유발하지 않는다"고 **가정하고 그냥 무시** |
| `PGBUF_IS_ORDERED_PAGETYPE`이 아닌 페이지 (`ordered_callback`) | pb.c:13065-13072 | `PAGE_HEAP`/`PAGE_OVERFLOW`만 대상(pb.h:166-167). INSERT..SELECT의 query result page 등 |
| `group_id`가 NULL인 watcher | pb.c:12145-12152 | 정렬상 최후순위. `PGBUF_ORDERED_NULL_HFID`(pb.h:95, pb.c:850의 `NULL`)로 초기화된 경우 |

즉 ordered fix는 **heap/overflow 페이지 간의** 데드락만 막습니다. B-tree 페이지, 카탈로그 페이지와 heap 페이지가 섞인 래치 사이클은 이 메커니즘 밖입니다. 실제로 `pgbuf_get_groupid_and_unfix`가 HFID를 얻으려고 카탈로그를 읽기 전에 요청 페이지를 놓는 이유(pb.c:13367-13371 및 주석 pb.c:13369)가 바로 "카탈로그 페이지와의 데드락 회피"입니다.

---

## 2. `pgbuf_ordered_fix` 전체 알고리즘

### 2.1 시그니처와 진입점

```c
/* pb.h:282-288 (debug) / pb.h:332-338 (release) */
#define pgbuf_ordered_fix(thread_p, req_vpid, fetch_mode, requestmode, req_watcher) \
        pgbuf_ordered_fix_debug(..., ARG_FILE_LINE_FUNC)

int pgbuf_ordered_fix_debug   (THREAD_ENTRY *, const VPID *req_vpid, PAGE_FETCH_MODE,
                               const PGBUF_LATCH_MODE, PGBUF_WATCHER *req_watcher,
                               const char *caller_file, int caller_line, const char *caller_func);
int pgbuf_ordered_fix_release (THREAD_ENTRY *, const VPID *, PAGE_FETCH_MODE,
                               const PGBUF_LATCH_MODE, PGBUF_WATCHER *);
```

본체는 pb.c:12204-13001. 결과 페이지는 반환값이 아니라 **`req_watcher->pgptr`로 나갑니다**(pb.c:13519에서 설정).

### 2.2 로컬 상태

| 변수 | 선언 | 역할 |
|---|---|---|
| `ordered_holders_info[PGBUF_MAX_PAGE_FIXED_BY_TRAN]` | pb.c:12222, 크기 64(pb.c:321) | unfix할 holder의 스냅샷 배열. 정렬 대상 |
| `req_page_holder_info` | pb.c:12223 | 요청 페이지를 비교 함수에 넣기 위한 임시 레코드 |
| `saved_pages_cnt` | pb.c:12219 | `ordered_holders_info` 유효 개수. **요청 페이지도 여기에 append됨**(pb.c:12764) |
| `req_page_has_group` | pb.c:12225, 12266 | watcher의 `group_id`가 이미 알려져 있는지 |
| `er_status_get_hfid` | pb.c:12226 | HFID 조회 실패를 지연 보고하기 위한 별도 슬롯 (pb.c:12947-12950에서 병합) |
| `has_dealloc_prevent_flag` | pb.c:12228 | `OLD_PAGE_PREVENT_DEALLOC`이 `OLD_PAGE`로 강등되었음을 기억 |
| `req_page_has_watcher` | pb.c:12224 | 에러 정리 시 `ordered_unfix` vs `unfix` 선택(pb.c:12956-12963) |

`PGBUF_HOLDER_INFO`(pb.c:428-438):

```c
struct pgbuf_holder_info
{
  VPID vpid;                      /* holder가 가리키는 페이지 */
  PGBUF_ORDERED_GROUP group_id;   /* == VPID, heap header의 VPID */
  int rank;                       /* PGBUF_ORDERED_RANK */
  int watch_count;                /* 이 holder의 watcher 수 */
  PGBUF_WATCHER *watcher[PGBUF_MAX_PAGE_WATCHERS];  /* 64개(pb.c:319) */
  PGBUF_LATCH_MODE latch_mode;    /* 모든 watcher의 latch mode 합집합(WRITE 우선) */
  PAGE_TYPE ptype;                /* refix 후 검증용 */
  bool prevent_dealloc;           /* avoid-dealloc 마커를 걸어둔 상태인지 */
};
```

### 2.3 전체 의사코드

```
pgbuf_ordered_fix (thread_p, req_vpid, fetch_mode, request_mode, req_watcher):

  ── [P0] 사전 검증 ─────────────────────────────────────────  pb.c:12236-12254
  assert (req_watcher != NULL)
  assert (req_watcher->magic == PGBUF_WATCHER_MAGIC_NUMBER)   # debug only
  if req_watcher->pgptr != NULL:                              # 재사용 금지
      return ER_FAILED_ASSERTION

  ── [P1] curr_rank 확정 ────────────────────────────────────  pb.c:12256-12264
  # 요청 페이지가 곧 그 heap의 header 페이지이면 rank를 HDR로 "승격"
  if VPID_EQ (&req_watcher->group_id, req_vpid):
      req_watcher->curr_rank = PGBUF_ORDERED_HEAP_HDR          # 0
  else:
      req_watcher->curr_rank = req_watcher->initial_rank       # 호출자가 준 값

  req_page_has_group = !VPID_ISNULL (&req_watcher->group_id)
  if !req_page_has_group:
      VPID_SET_NULL (&req_page_groupid)

  req_page_holder_info = { group_id = req_watcher->group_id,
                           rank     = req_watcher->curr_rank,
                           vpid     = *req_vpid,
                           watch_count = 1,
                           watcher[0]  = req_watcher }         # pb.c:12272-12276

  ── [P2] 래치 조건 결정 ────────────────────────────────────  pb.c:12278-12288
  holder = pgbuf_Pool.thrd_holder_info[thrd_idx].thrd_hold_list
  if holder == NULL
     or (holder->thrd_link == NULL and VPID_EQ (req_vpid, &holder->bufptr->vpid)):
      # 보유 페이지가 아예 없거나, 딱 하나뿐이고 그게 요청 페이지 자신
      latch_condition = PGBUF_UNCONDITIONAL_LATCH
  else:
      latch_condition = PGBUF_CONDITIONAL_LATCH

  ── [P3] 1차 fix 시도 ──────────────────────────────────────  pb.c:12290-12296
  ret_pgptr = pgbuf_fix (req_vpid, fetch_mode, request_mode, latch_condition)

  ── [P4-성공] 재정렬 불필요 ────────────────────────────────  pb.c:12298-12341
  if ret_pgptr != NULL:
      for holder in thrd_hold_list:
          CAST_BFPTR_TO_PGPTR (ret_pgptr, holder->bufptr)     # ★ 아래 2.8 참고
          if VPID_EQ (req_vpid, &holder->bufptr->vpid):
              assert (PGBUF_IS_ORDERED_PAGETYPE (holder->bufptr->...prv.ptype))

              # group_id를 아직 모르는 경우 지금 채운다
              if !req_page_has_group and holder->first_watcher != NULL:
                  # 이미 같은 페이지에 watcher가 있음 → 거기서 group 복사   pb.c:12308-12314
                  VPID_COPY (&req_watcher->group_id, &holder->first_watcher->group_id)
              elif !req_page_has_group and page_ptype == PAGE_HEAP:
                  # 카탈로그를 읽어 HFID 조회. do_unfix=false (이미 잡은 페이지 유지) pb.c:12315-12325
                  pgbuf_get_groupid_and_unfix (req_vpid, &ret_pgptr, &req_page_groupid,
                                               do_unfix = false)
                  VPID_COPY (&req_watcher->group_id, &req_page_groupid)

              pgbuf_add_watch_instance_internal (holder, ret_pgptr, req_watcher,
                                                 request_mode, clear_unfix_flag = true)
              req_page_has_watcher = true
              goto exit                                        # 정상 종료
      assert_release (false); return ER_FAILED_ASSERTION       # pb.c:12337-12340

  ── [P5-실패] 재정렬 가능성 판정 ───────────────────────────  pb.c:12342-12390
  else:
      er_status = er_errid_if_has_error ()
      if er_status in {ER_PB_BAD_PAGEID, ER_INTERRUPTED}:      # 재시도 무의미
          goto exit
      # ★ warning severity라 er_errid_if_has_error()가 못 잡는 케이스   pb.c:12353-12359
      if fetch_mode == OLD_PAGE_MAYBE_DEALLOCATED and er_errid () == ER_PB_BAD_PAGEID:
          er_status = ER_PB_BAD_PAGEID;  goto exit

      wait_msecs = pgbuf_find_current_wait_msecs (thread_p)
      if wait_msecs in {LK_ZERO_WAIT, LK_FORCE_ZERO_WAIT}:
          # 재획득이 CONDITIONAL로 강제되므로 unfix-refix가 실패할 수 있다 → 포기
          if er_status == NO_ERROR: er_status = ER_LK_PAGE_TIMEOUT   # 에러는 set하지 않음
          goto exit
      if latch_condition == PGBUF_UNCONDITIONAL_LATCH:
          # 무조건 대기했는데도 실패 → 재정렬로 해결될 문제가 아님
          er_status = er_errid () or ER_FAILED;  goto exit

      er_status = NO_ERROR    # 이후 진행을 위해 하위 에러를 의도적으로 폐기  pb.c:12388-12389

  ── [P6] PREVENT_DEALLOC 강등 ──────────────────────────────  pb.c:12392-12396
  if fetch_mode == OLD_PAGE_PREVENT_DEALLOC:
      has_dealloc_prevent_flag = true
      fetch_mode = OLD_PAGE

  ── [P7] holder 스냅샷 + unfix 대상 선별 ───────────────────  pb.c:12398-12602
  for holder in thrd_hold_list:
      if holder->watch_count <= 0:  continue                   # 프로토콜 외 페이지 무시
      assert (PGBUF_IS_ORDERED_PAGETYPE (ptype))
      if saved_pages_cnt >= PGBUF_MAX_PAGE_FIXED_BY_TRAN:  → ER_FAILED_ASSERTION
      if VPID_EQ (req_vpid, &holder->bufptr->vpid):            # P3에서 실패했는데 보유 중?
          → 페이지 유효성 확인 후 assert_release(false)         pb.c:12419-12440

      if holder->fix_count != holder->watch_count:              # pb.c:12454-12462
          # watcher 없이 fix된 이력이 있음 → 복원 불가
          → ER_FAILED_ASSERTION

      # holder의 watcher 전부 순회하며 일관성 검사 + 수집        pb.c:12466-12543
      info.latch_mode = PGBUF_LATCH_READ
      page_rank = UNDEFINED;  group_id = NULL
      for w in holder->first_watcher .. :
          assert (w->magic == MAGIC, w->pgptr == pgptr,
                  w->curr_rank < UNDEFINED, !VPID_ISNULL (&w->group_id))
          if page_rank == UNDEFINED: page_rank = w->curr_rank
          elif page_rank != w->curr_rank:
              → ER_PB_ORDERED_INCONSISTENCY (FATAL, "different page ranks:%d,%d")
          if VPID_ISNULL (&group_id): group_id = w->group_id
          elif !VPID_EQ (&group_id, &w->group_id):
              → ER_PB_ORDERED_INCONSISTENCY (FATAL, "different GROUP_ID")
          info.watcher[j++] = w
          if w->latch_mode == PGBUF_LATCH_WRITE: info.latch_mode = PGBUF_LATCH_WRITE
      assert (j == holder->watch_count)

      info.group_id = group_id;  info.rank = page_rank;  info.vpid = holder->bufptr->vpid

      if req_page_has_group:
          diff = pgbuf_compare_hold_vpid_for_sort (&req_page_holder_info, &info)
      else:
          diff = -1        # group을 모르면 무조건 unfix (재조회 필요)   pb.c:12553-12557

      if diff < 0:   info.watch_count = holder->watch_count
                     info.ptype = holder->bufptr->...prv.ptype
                     saved_pages_cnt++                          # unfix 대상 확정
      elif diff == 0: → ER_FAILED_ASSERTION                     # 같은 페이지가 두 번?
      else:          pass                                       # 순서상 앞 → 유지

  ── [P8] 실제 unfix + watcher 무효화 ───────────────────────  pb.c:12604-12671
  holder = thrd_hold_list
  for i in 0 .. saved_pages_cnt-1:
      holder = thrd_hold_list에서 ordered_holders_info[i].vpid 매칭까지 전진
      if holder == NULL: → ER_FAILED_ASSERTION
      holder->watch_count = 0;  first_watcher = last_watcher = NULL   # 통째로 끊음
      holder_fix_cnt = holder->fix_count

      pgbuf_bcb_register_avoid_deallocation (holder->bufptr)     # pb.c:12639 ★
      ordered_holders_info[i].prevent_dealloc = true

      while holder_fix_cnt-- > 0:  pgbuf_unfix (pgptr)           # fix_count회 전부

      for j in 0 .. watch_count-1:
          w = info.watcher[j]
          PGBUF_CLEAR_WATCHER (w)          # next/prev/pgptr = NULL   pb.h:125-131
          w->page_was_unfixed = true       # ★ 호출자 계약            pb.c:12664
          pgbuf_watcher_init_debug (w, caller_file, caller_line, add=true)

  ── [P9] group_id를 몰랐던 경우 재조회 ─────────────────────  pb.c:12673-12724
  # 주석(pb.c:12673-12680)이 설명하는 위험: class OID 삭제 후 HFID 페이지가
  # 일반 페이지로 재할당되면 스레드마다 순서가 달라져 데드락 가능. 감수하는 위험.
  if !req_page_has_group:
      assert (모든 남은 holder의 watch_count == 0)               # debug
      pgptr = pgbuf_fix (req_vpid, fetch_mode, request_mode, UNCONDITIONAL)
      if pgptr != NULL:
          if has_dealloc_prevent_flag:
              pgbuf_bcb_unregister_avoid_deallocation (bufptr)   # pb.c:12702 ★ 2.9 참고
              has_dealloc_prevent_flag = false
          if page_ptype == PAGE_HEAP:
              pgbuf_get_groupid_and_unfix (req_vpid, &pgptr, &req_page_groupid,
                                           do_unfix = true)      # ★ 여기서 페이지를 놓는다
              # 실패해도 er_status_get_hfid에만 담고 계속 (옛 페이지 재래치 위해)
      else:
          er_status_get_hfid = er_errid () or ER_FAILED

  ── [P10] 요청 페이지를 정렬 배열에 추가 ───────────────────  pb.c:12733-12765
  if req_page_has_group or er_status_get_hfid == NO_ERROR:
      info = &ordered_holders_info[saved_pages_cnt]
      info.group_id = req_page_has_group ? req_watcher->group_id : req_page_groupid
      if !req_page_has_group: req_watcher->group_id = req_page_groupid
      info.vpid = *req_vpid
      info.rank = (group_id == req_vpid) ? PGBUF_ORDERED_HEAP_HDR
                                        : req_watcher->curr_rank
      info.prevent_dealloc = false      # 요청 페이지에는 마커 없음
      saved_pages_cnt++

  ── [P11] 정렬 ─────────────────────────────────────────────  pb.c:12767-12770
  if saved_pages_cnt > 1:
      qsort (ordered_holders_info, saved_pages_cnt, sizeof(...),
             pgbuf_compare_hold_vpid_for_sort)

  ── [P12] T 오름차순 재획득 ────────────────────────────────  pb.c:12772-12944
  for i in 0 .. saved_pages_cnt-1:
      if VPID_EQ (req_vpid, &info[i].vpid):
          curr_request_mode = request_mode;  curr_fetch_mode = fetch_mode
      else:
          curr_request_mode = info[i].latch_mode;  curr_fetch_mode = OLD_PAGE

      pgptr = pgbuf_fix (&info[i].vpid, curr_fetch_mode, curr_request_mode, UNCONDITIONAL)
      if pgptr == NULL:
          if er_errid() == ER_INTERRUPTED:  goto exit            # 정상 케이스
          if er_errid() == ER_PB_BAD_PAGEID:
              if 요청페이지 and fetch_mode == OLD_PAGE_MAYBE_DEALLOCATED:
                  er_log_debug (...)                             # 예상됨
              else:
                  assert (false)   # "we told it not to!" pb.c:12816-12819
          if !요청페이지:
              er_status = ER_PB_ORDERED_REFIX_FAILED             # (volid, pageid, prev_err)
          goto exit

      holder = thrd_hold_list에서 info[i].vpid 검색                # pb.c:12833-12841

      if 요청 페이지:
          ret_pgptr = pgptr
          if has_dealloc_prevent_flag:
              pgbuf_bcb_unregister_avoid_deallocation (bufptr)    # pb.c:12850 ★
          pgbuf_add_watch_instance_internal (holder, pgptr, req_watcher,
                                             request_mode, clear_unfix_flag = true)
          req_page_has_watcher = true
      else:
          assert (info[i].prevent_dealloc)
          info[i].prevent_dealloc = false
          pgbuf_bcb_unregister_avoid_deallocation (bufptr)        # pb.c:12883
          pgbuf_check_page_ptype (pgptr, info[i].ptype)           # debug: 타입 불변 확인

          # watcher 개수만큼 fix count 복원 (첫 fix는 위에서 했으므로 1부터)
          for j in 1 .. info[i].watch_count-1:
              pgbuf_fix (&info[i].vpid, curr_fetch_mode, curr_request_mode, UNCONDITIONAL)

          for j in 0 .. info[i].watch_count-1:
              pgbuf_add_watch_instance_internal (holder, pgptr, info[i].watcher[j],
                                                 info[i].watcher[j]->latch_mode,
                                                 clear_unfix_flag = false)   # ★ false!

  ── [P13] exit: 정리 ───────────────────────────────────────  pb.c:12946-13000
exit:
  if er_status_get_hfid != NO_ERROR and er_status == NO_ERROR:
      er_status = er_status_get_hfid
  assert (er_status != NO_ERROR or !VPID_ISNULL (&req_watcher->group_id))

  if ret_pgptr != NULL and er_status != NO_ERROR:
      req_page_has_watcher ? pgbuf_ordered_unfix_and_init (ret_pgptr, req_watcher)
                           : pgbuf_unfix_and_init (ret_pgptr)

  # group을 몰랐고 결과적으로 요청 페이지가 header였음이 밝혀진 경우 rank 보정
  if !req_page_has_group and ret_pgptr != NULL
     and req_watcher->curr_rank != PGBUF_ORDERED_HEAP_HDR
     and VPID_EQ (&req_watcher->group_id, req_vpid):
      req_watcher->curr_rank = PGBUF_ORDERED_HEAP_HDR

  # 아직 걸려있는 avoid-dealloc 마커를 해제 (에러로 중단된 경로)
  for i in 0 .. saved_pages_cnt-1:
      if info[i].prevent_dealloc:
          hash_anchor = &buf_hash_table[PGBUF_HASH_VALUE (&info[i].vpid)]
          bufptr = pgbuf_search_hash_chain (hash_anchor, &info[i].vpid)
          if bufptr == NULL:  assert(false); unlock hash_mutex; continue
          if !pgbuf_bcb_should_avoid_deallocation (bufptr): assert (false)
          else: pgbuf_bcb_unregister_avoid_deallocation (bufptr)
          PGBUF_BCB_UNLOCK (bufptr)
  return er_status
```

### 2.4 흐름도

```
                    pgbuf_ordered_fix (req_vpid, fetch_mode, mode, watcher)
                                        │
                        [P0] watcher->pgptr != NULL? ──yes──▶ ER_FAILED_ASSERTION
                                        │no
                        [P1] curr_rank = (group_id==req_vpid) ? HDR : initial_rank
                                        │
                        [P2] 보유 페이지 0개 또는 (1개 && 그게 req)?
                              ┌─────────┴──────────┐
                            yes                    no
                    UNCONDITIONAL            CONDITIONAL
                              └─────────┬──────────┘
                                        │
                        [P3] pgbuf_fix (…, latch_condition)
                              ┌─────────┴──────────┐
                        != NULL                  == NULL
                              │                    │
              [P4] holder 검색, group_id      [P5] 에러 분류
                   보정, watcher attach            │
                              │            ┌───────┼─────────┬──────────┐
                        return NO_ERROR   BAD_PAGEID  ZERO_WAIT  UNCOND  기타
                                          INTERRUPTED    │        실패    │
                                               │         │         │      │
                                            ◀──┴─────────┴─────────┘   er_status
                                            exit                       = NO_ERROR
                                                                          │
                                        [P6] PREVENT_DEALLOC → OLD_PAGE   │
                                                                          │
                    ┌─────────────────────────────────────────────────────┘
                    │
        [P7] holder 순회: watcher 일관성 검사 → compare(req, held)
                    │                     diff>0 → 유지(무시)
                    │                     diff==0 → assert
                    │                     diff<0 → ordered_holders_info[]에 저장
                    ▼
        [P8] 저장된 각 페이지:
              register_avoid_deallocation → fix_count회 unfix
              → PGBUF_CLEAR_WATCHER + page_was_unfixed = true
                    ▼
        [P9] group_id 미지? ── yes ─▶ UNCOND fix → HFID 조회 → 다시 unfix
                    │no                        (pgbuf_get_groupid_and_unfix, do_unfix=true)
                    ▼
        [P10] 요청 페이지를 ordered_holders_info[saved_pages_cnt]에 append
                    ▼
        [P11] qsort by (group_id, rank, vpid)
                    ▼
        [P12] i = 0 .. n-1:
                pgbuf_fix (info[i].vpid, UNCONDITIONAL)   ← 여기서만 대기
                  실패 → 요청페이지면 원래 에러, 아니면 ER_PB_ORDERED_REFIX_FAILED
                  성공 → unregister_avoid_deallocation
                         요청페이지: watcher attach (clear_unfix_flag=true)
                         복원페이지: watch_count-1회 추가 fix
                                   + watcher 전부 attach (clear_unfix_flag=false)
                    ▼
        [P13] exit: er_status 병합 / 실패 시 ret_pgptr 해제
                    / 남은 prevent_dealloc 마커 해제
```

### 2.5 정렬/비교 결정표 — `pgbuf_compare_hold_vpid_for_sort` (pb.c:12130-12185)

비교 키 우선순위:

| 순위 | 키 | 코드 |
|---|---|---|
| 0 | `group_id == NULL`인 쪽이 **뒤** | pb.c:12145-12152 |
| 1 | `group_id.volid` | pb.c:12154-12158 |
| 2 | `group_id.pageid` | pb.c:12160-12164 |
| 3 | `rank` (`HDR`=0 < `NORMAL`=1 < `OVERFLOW`=2, pb.h:222-229) | pb.c:12166-12170 |
| 4 | `vpid.volid` | pb.c:12172-12176 |
| 5 | `vpid.pageid` | pb.c:12178-12184 |

`diff = compare(req_page, held_page)` 해석:

| `diff` | 의미 | ordered_fix 동작 | 근거 |
|---|---|---|---|
| `< 0` | 요청 페이지가 순서상 **앞** → 보유 페이지가 잘못된 순서로 잡혀 있음 | **unfix 후 재정렬** | pb.c:12559-12577 |
| `== 0` | 동일 페이지 (있을 수 없음) | `ER_FAILED_ASSERTION` | pb.c:12578-12584 |
| `> 0` | 요청 페이지가 순서상 **뒤** → 이미 올바른 순서 | **유지, 무시** | pb.c:12585-12599 |
| — | `req_page_has_group == false` | 강제 `-1` (모두 unfix) | pb.c:12553-12557 |

구체 예 (같은 heap, group = `(0,50)`):

| 요청 페이지 | 보유 페이지 | 판정 | 결과 |
|---|---|---|---|
| `(0,50)` rank=HDR | `(0,100)` rank=NORMAL | rank 0 < 1 → `diff<0` | 보유 페이지 unfix |
| `(0,100)` rank=NORMAL | `(0,50)` rank=HDR | rank 1 > 0 → `diff>0` | header 유지 |
| `(0,90)` NORMAL | `(0,100)` NORMAL | pageid 90 < 100 → `diff<0` | unfix |
| `(0,100)` NORMAL | `(0,90)` NORMAL | `diff>0` | 유지 |
| `(0,200)` OVERFLOW | `(0,100)` NORMAL | rank 2 > 1 → `diff>0` | 유지 |
| `(0,100)` NORMAL | `(0,200)` OVERFLOW | rank 1 < 2 → `diff<0` | overflow unfix |
| group `(0,50)`의 페이지 | group NULL인 페이지 | NULL이 뒤 → `diff<0` | NULL-group 페이지 unfix |

**rank 설계 의도**: heap header는 공간 관리(bestspace)의 병목이므로 항상 가장 먼저 잡습니다. overflow 페이지는 항상 home 페이지 뒤에 잡습니다(heap_file.c:7189-7192 주석: "overflow pages should be always accessed with their home pages latched"). rank가 vpid보다 우선하므로 **pageid 값과 무관하게** 이 계층이 보장됩니다.

### 2.6 `pgbuf_get_condition_for_ordered_fix` (pb.c:13769-13807)

ordered fix를 쓸 수 없는 문맥(vacuum이 오래된 페이지를 놓기 전에 flush해야 하는 경우 — pb.c:13764-13767 주석)에서, 이미 잡은 페이지 기준으로 새 페이지를 조건부/무조건 중 어느 쪽으로 잡아야 하는지를 알려줍니다.

```
pgbuf_get_condition_for_ordered_fix (vpid_new, vpid_fixed, hfid):
    G = { hfid->vfid.volid, hfid->hpgid }
    new.group_id = fixed.group_id = G                            # pb.c:13775-13778
    new.vpid = *vpid_new;  fixed.vpid = *vpid_fixed
    new.rank   = VPID_EQ (&G, vpid_new)   ? HDR : NORMAL         # pb.c:13783-13790
    fixed.rank = VPID_EQ (&G, vpid_fixed) ? HDR : NORMAL         # pb.c:13792-13799
    return compare (new, fixed) < 0 ? PGBUF_CONDITIONAL_LATCH
                                    : PGBUF_UNCONDITIONAL_LATCH  # pb.c:13801-13806
```

결정표 (group은 항상 동일하므로 rank → vpid 순만 유효):

| 새 페이지 | 이미 잡은 페이지 | 비교 | 반환 |
|---|---|---|---|
| header (`== G`) | normal | rank 0 < 1 | `CONDITIONAL` |
| normal | header (`== G`) | rank 1 > 0 | `UNCONDITIONAL` |
| normal, pageid 90 | normal, pageid 100 | 90 < 100 | `CONDITIONAL` |
| normal, pageid 100 | normal, pageid 90 | 100 > 90 | `UNCONDITIONAL` |
| header | header (동일 페이지) | `diff == 0`, `< 0` 아님 | `UNCONDITIONAL` |

**제약 (반드시 인지)**: 이 함수는 rank를 `HDR`/`NORMAL` 둘 중에서만 배정합니다(pb.c:13789, 13798). `PGBUF_ORDERED_HEAP_OVERFLOW`를 표현할 수 없으므로, overflow 페이지가 관여하는 경우 `pgbuf_ordered_fix`의 순서와 **불일치**할 수 있습니다. 또한 두 페이지가 같은 heap에 속함을 호출자가 보장해야 합니다(pb.c:13763).

### 2.7 `page_was_unfixed` 호출자 계약

`PGBUF_WATCHER.page_was_unfixed`는 1비트 필드(pb.h:241)입니다.

| 시점 | 값 | 코드 |
|---|---|---|
| `PGBUF_INIT_WATCHER` | `false` | pb.h:137 / pb.h:156 |
| ordered_fix가 이 페이지를 unfix함 | `true` | pb.c:12664 |
| ordered_callback이 이 페이지를 unfix함 | `true` | pb.c:13193 |
| watcher가 **새로** 붙을 때 (`clear_unfix_flag=true`) | `false`로 리셋 | pb.c:13521-13524 |
| **복원** watcher가 붙을 때 (`clear_unfix_flag=false`) | **유지** (즉 `true` 유지) | pb.c:12926-12928, pb.c:13301-13303 |

계약의 핵심은 이 비대칭입니다. 요청 페이지의 watcher는 `clear_unfix_flag=true`(pb.c:12857-12861)로 붙으므로 플래그가 초기화되지만, unfix되었다 복원된 이전 페이지들의 watcher는 `false`로 붙으므로 `page_was_unfixed == true`가 **호출자에게 그대로 전달**됩니다.

**호출자가 해야 하는 일**: 래치가 끊겼던 동안 다른 트랜잭션이 페이지를 바꿨을 수 있으므로, 그 페이지에서 얻어둔 모든 파생 정보를 **재검증/재취득**해야 합니다. 실제 사례:

- `heap_file.c:21351-21365` — `home_page_watcher_p->page_was_unfixed`이면 `spage_get_record`를 다시 호출. 주석이 이유를 명시: "record may have changed by other transactions (INSID removed by VACUUM, page compact)". 객체 락은 이미 있으므로 크기는 같거나 작아질 뿐.
- `heap_file.c:7154-7171` — `REC_RELOCATION` 처리 중 home이 unfix되었으면 `page_was_unfixed = false`로 리셋하고 `goto try_again`으로 레코드 타입/relocation 링크부터 다시 읽음. 재시도 횟수 초과 시 `ER_PAGE_LATCH_ABORTED`(error_code.h:1077).
- `heap_file.c:7197-7202` — `REC_BIGONE`(overflow)에서는 home unfix가 **예상되지 않으므로** `assert(false)`. rank(OVERFLOW=2 > NORMAL=1)상 overflow는 항상 home보다 뒤이므로 home을 놓을 이유가 없습니다.
- `heap_file.c:3365-3379` — 빈 heap 페이지 제거 후보가 unfix되었으면 `spage_number_of_records > 1`을 재확인해 후보 자격을 재판정.
- `heap_file.c:4273` — `assert (!header_watcher.page_was_unfixed)`: header는 rank 0이므로 절대 unfix되지 않아야 함을 단언.

또한 `ordered_fix`가 에러를 반환한 경우 **일부 페이지만 복원되었을 수 있으므로**, 호출자는 각 watcher의 `pgptr`이 `NULL`인지 확인해야 합니다(pb.c:12196-12198 주석).

### 2.8 구현 관찰 ① — P4의 `ret_pgptr` 덮어쓰기

pb.c:12302:

```c
for (holder = ...thrd_hold_list; holder != NULL; holder = holder->thrd_link)
  {
    CAST_BFPTR_TO_PGPTR (ret_pgptr, holder->bufptr);   /* ★ 매 반복마다 ret_pgptr 갱신 */
    if (VPID_EQ (req_vpid, &(holder->bufptr->vpid)))
      { ... goto exit; }
  }
assert_release (false);
```

`ret_pgptr`은 P3의 `pgbuf_fix` 결과인데, 루프가 매 holder마다 이를 덮어씁니다. 매칭 holder에서 탈출할 때 값은 결국 올바른 페이지 포인터가 되므로 정상 경로에서는 문제가 없지만, 루프를 끝까지 돌아 `assert_release(false)` → `goto exit`로 빠지는 경로에서는 `ret_pgptr`이 **마지막 holder의 페이지**를 가리킨 상태로 exit에 도달합니다. exit(pb.c:12954-12963)은 `ret_pgptr != NULL && er_status != NO_ERROR`이면 그것을 unfix하므로, **엉뚱한 페이지가 unfix될 수 있습니다.** release 빌드에서 `assert_release`가 abort하므로 실질적 노출은 제한되지만, 재구현 시에는 별도 지역 변수를 쓰는 것이 옳습니다.

### 2.9 구현 관찰 ② — `has_dealloc_prevent_flag`의 짝 없는 unregister

`pgbuf_fix_release` 내부에서 `OLD_PAGE_PREVENT_DEALLOC`는 **register와 unregister가 짝을 이룹니다**:

- pb.c:2425-2428 `if (fetch_mode == OLD_PAGE_PREVENT_DEALLOC) pgbuf_bcb_register_avoid_deallocation (bufptr);` — bcb mutex 보유 중, 래치 획득 전
- pb.c:2513-2517 `if (fetch_mode == OLD_PAGE_PREVENT_DEALLOC) pgbuf_bcb_unregister_avoid_deallocation (bufptr);` — 래치 획득 후 (`fast_path` 레이블 뒤)

목적은 "bcb mutex를 놓고 래치를 기다리는 창(window) 동안 페이지가 deallocate되지 않게 하는 것"입니다. 그런데:

1. `pgbuf_ordered_fix`는 P6(pb.c:12392-12396)에서 `fetch_mode`를 `OLD_PAGE`로 강등하므로, 이후의 `pgbuf_fix` 호출은 **register를 하지 않습니다.** 그럼에도 pb.c:12699-12704와 pb.c:12847-12852에서 `pgbuf_bcb_unregister_avoid_deallocation`을 호출합니다.
2. `pgbuf_lockfree_fix_ro`(pb.c:7671-7734)는 `OLD_PAGE_PREVENT_DEALLOC`를 허용하지만(pb.c:7674 assert) **register를 하지 않고** `fast_path`(pb.c:2328)로 점프하므로, pb.c:2516의 unregister가 짝 없이 실행됩니다.

`pgbuf_bcb_unregister_avoid_deallocation`(pb.c:16217-16253)은 하위 16비트가 0이면 CAS 없이 `break`하여 음수화를 막습니다(pb.c:16226-16250). 따라서 카운터가 0일 때는 무해합니다. 그러나 **다른 스레드가 같은 bcb에 마커를 걸어둔 상태라면 그 카운트를 대신 감소시킵니다.** 그 결과 그 스레드가 보호하려던 페이지가 조기에 deallocate 가능해집니다(`pgbuf_has_prevent_dealloc`가 `false`를 반환 → vacuum.c:1850 / heap_file.c:3383의 가드 통과).

이는 코드를 읽어 도출한 **관찰**이며 실제 재현은 확인하지 않았습니다. 재구현 시에는 (a) ordered_fix가 강등 시 스스로 register하거나, (b) `has_dealloc_prevent_flag` 처리를 아예 제거하거나, (c) lockfree 경로에서 `fast_path`를 우회하도록 정리해야 합니다.

### 2.10 `pgbuf_ordered_callback` (pb.c:13019-13336)

"페이지를 모두 놓은 상태에서 콜백을 실행하고, 끝나면 원래대로 복원"하는 함수. `ordered_fix`의 P7~P12와 구조가 같지만 차이가 있습니다.

| 항목 | `pgbuf_ordered_fix` | `pgbuf_ordered_callback` |
|---|---|---|
| 스킵 기준 | `holder->watch_count <= 0` (pb.c:12402) | `!PGBUF_IS_ORDERED_PAGETYPE(ptype)` (pb.c:13065-13072) |
| watcher 없는 ordered 페이지 | 스킵(무시) | `ER_FAILED_ASSERTION`으로 **거부** (pb.c:13074-13083) |
| unfix 대상 | `diff < 0`인 것만 | **전부** (pb.c:13154) |
| unfix 후 상태 | 일부 유지 | `assert (thrd_hold_list == NULL)` (pb.c:13200) |
| 재획득 fetch mode | 요청 페이지는 원래 mode | 전부 `OLD_PAGE` (pb.c:13218/13221) |
| 콜백 후 검증 | — | `assert (thrd_hold_list == NULL)` (pb.c:13206) — 콜백은 페이지를 남기면 안 됨 |
| 반환값 | fix 결과 | 성공 시 `callback_status` (pb.c:13307), 복원 실패 시 그 에러 |

pb.c:13066-13070의 주석이 설계 근거를 명시합니다: ordered 페이지가 아니면 "heap allocation path가 그것을 fix하지 않으므로 콜백 동안 들고 있어도 할당 스레드와 데드락되지 않는다". 반대로 watcher 없는 ordered 페이지는 "이 heap의 header나 last page일 수 있어 할당 스레드가 필요로 하므로, 들고 대기하면 데드락 가능 → 복원 불가한 것을 놓지 않고 거부"합니다(pb.c:13077-13079).

복원 실패 처리(pb.c:13239-13267)는 부분 fix를 되돌린 뒤 `ER_INTERRUPTED`이면 그대로, 아니면 `ER_PB_ORDERED_REFIX_FAILED`로 보고합니다.

---

## 3. watcher 자료구조 관계도

### 3.1 구조체

```c
/* pb.h:233-249 */
struct pgbuf_watcher
{
  PAGE_PTR pgptr;                 /* 이 watcher가 보는 페이지 (NULL = 미보유) */
  PGBUF_WATCHER *next;            /* holder의 watcher 이중 연결 리스트 */
  PGBUF_WATCHER *prev;
  PGBUF_ORDERED_GROUP group_id;   /* VPID. heap header page의 VPID (= HFID{volid,hpgid}) */
  unsigned latch_mode:7;          /* PGBUF_LATCH_READ / WRITE */
  unsigned page_was_unfixed:1;    /* refix가 일어났는가 */
  unsigned initial_rank:4;        /* 호출자가 준 rank */
  unsigned curr_rank:4;           /* fix 후 확정 rank (header면 HDR로 승격) */
#if !defined (NDEBUG)
  unsigned int magic;             /* PGBUF_WATCHER_MAGIC_NUMBER = 0x12345678 (pb.h:94) */
  char watched_at[128];           /* watcher를 붙인 위치 "file:line" */
  char init_at[256];              /* init 이력(누적) */
#endif
};

/* pb.c:462-478 */
struct pgbuf_holder
{
  int fix_count;                  /* 이 스레드가 이 bcb를 fix한 횟수 */
  PGBUF_BCB *bufptr;
  PGBUF_HOLDER *thrd_link;        /* 스레드의 hold list 링크 */
  PGBUF_HOLDER *next_holder;      /* free list 링크 */
  PGBUF_HOLDER_STAT perf_stat;
#if !defined(NDEBUG)
  char fixed_at[64 * 1024];  int fixed_at_size;
#endif
  int watch_count;
  PGBUF_WATCHER *first_watcher;
  PGBUF_WATCHER *last_watcher;
};

/* pb.c:481-490, 정확히 64B 캐시라인 (pb.c:492 static_assert) */
struct pgbuf_holder_anchor
{
  int num_free_cnt, num_hold_cnt;
  PGBUF_HOLDER *thrd_free_list;
  PGBUF_HOLDER *thrd_hold_list;
  char m_pad[...];                /* false sharing 방지 */
};
```

### 3.2 관계도

```
 THREAD_ENTRY
   │ m_holder_anchor  (지연 초기화: pb.c:13624-13627)
   ▼
 pgbuf_Pool.thrd_holder_info[thread index]        ← PGBUF_HOLDER_ANCHOR (pb.c:481-490)
   │ thrd_hold_list
   ▼
 ┌──────────────── PGBUF_HOLDER ─────────────────┐   thrd_link    ┌── PGBUF_HOLDER ──┐
 │ fix_count   = 3                               │ ─────────────▶ │  …               │
 │ watch_count = 3   (ordered 페이지는 항상 같음) │                └──────────────────┘
 │ bufptr ───────────────────────────┐           │
 │ first_watcher ──┐   last_watcher ─┼───┐       │
 └─────────────────┼─────────────────┼───┼───────┘
                   │                 │   │
                   ▼   next          ▼   │        ┌──────── PGBUF_BCB (pb.c:513-545) ───────┐
      ┌── W1 ──┐ ────▶ ┌── W2 ──┐ ────▶ ┌── W3 ──┐│ vpid                                    │
      │ pgptr ─┼──┐    │ pgptr ─┼──┐    │ pgptr ─┼┼▶ atomic_latch {latch_mode,waiter,fcnt}  │
      │ group  │  │    │ group  │  │    │ group  ││  flags (DIRTY/TO_VACUUM/LRU_BOTTOM/…)   │
      │ rank   │  │    │ rank   │  │    │ rank   ││  count_fix_and_avoid_dealloc            │
      │ latch  │  │    │ latch  │  │    │ latch  ││  iopage_buffer ─┐                       │
      │ p_w_u  │  │    │ p_w_u  │  │    │ p_w_u  ││                 │                       │
      └────────┘  │    └────────┘  │    └────────┘└─────────────────┼───────────────────────┘
           ◀──────┴── prev ────────┴── prev ───────                │
                   │                 │            │                ▼
                   └─────────────────┴────────────┘   PGBUF_IOPAGE_BUFFER (pb.c:548-557)
                                     │                  bcb ──▶ (역참조, 자기 BCB)
                                     ▼                  iopage : FILEIO_PAGE
                              동일한 PAGE_PTR              └─ prv { pageid, volid, ptype, pflag, lsa }
                       (= CAST_BFPTR_TO_PGPTR(bufptr))     └─ page[]  ◀── PAGE_PTR가 가리키는 지점
```

포인터 변환 매크로(pb.c:148-169):

- `CAST_PGPTR_TO_BFPTR(bufptr, pgptr)` — `PAGE_PTR`에서 `offsetof(PGBUF_IOPAGE_BUFFER, iopage.page)`를 역산해 BCB를 얻고 `bufptr->iopage_buffer->bcb == bufptr`로 검증(pb.c:152)
- `CAST_BFPTR_TO_PGPTR(pgptr, bufptr)` — 역방향(pb.c:165-169)
- `CAST_PGPTR_TO_IOPGPTR` / `CAST_IOPGPTR_TO_PGPTR` (pb.c:155-163)

### 3.3 불변식

| 불변식 | 검사 위치 |
|---|---|
| ordered 페이지는 `holder->fix_count == holder->watch_count` | pb.c:12454-12462, pb.c:13074-13083, pb.c:13166-13167 |
| `holder->watch_count <= holder->fix_count` (일반) | pb.c:13461 |
| 한 holder의 모든 watcher는 **같은 `curr_rank`** | pb.c:12482-12497 → 위반 시 `ER_PB_ORDERED_INCONSISTENCY`(FATAL) |
| 한 holder의 모든 watcher는 **같은 `group_id`** | pb.c:12499-12514 → 동일 에러 |
| 한 holder의 모든 watcher는 **같은 `pgptr`** | pb.c:12516-12523, pb.c:13108 |
| `watcher->magic == 0x12345678` | pb.c:12243, 12477, 13105, 13431, 13657, 2508, 3064 |
| `holder->watch_count < PGBUF_MAX_PAGE_WATCHERS` (64) | pb.c:12464, 13500 |
| ordered 페이지의 `ptype ∈ {PAGE_HEAP, PAGE_OVERFLOW}` | pb.c:12306, 12410 (`PGBUF_IS_ORDERED_PAGETYPE`, pb.h:166-167) |
| `curr_rank < PGBUF_ORDERED_RANK_UNDEFINED` | pb.c:12479, 12653, 13108 |

### 3.4 watcher 조작 함수

**`pgbuf_add_watch_instance_internal`** (pb.c:13482-13548) — 유일한 watcher 등록 경로.

```
전제: watcher->pgptr == NULL && next == NULL && prev == NULL   (pb.c:13502-13504)
      holder->watch_count < 64                                (pb.c:13500)

리스트 tail에 append:
  if holder->last_watcher == NULL:                            # pb.c:13506-13511
      assert (first_watcher == NULL);  first = last = watcher
  else:                                                        # pb.c:13512-13517
      watcher->prev = holder->last_watcher
      holder->last_watcher->next = watcher
      holder->last_watcher = watcher

watcher->pgptr = pgptr                                         # pb.c:13519
watcher->latch_mode = latch_mode                               # pb.c:13520
if clear_unfix_flag:  watcher->page_was_unfixed = false        # pb.c:13521-13524
holder->watch_count += 1                                       # pb.c:13526
debug: watched_at = "basename(caller_file):caller_line"        # pb.c:13528-13547
```

**`pgbuf_remove_watcher`** (pb.c:13648-13686) — 이중 연결 리스트에서 제거하고 watcher를 리셋.

```
if holder->first_watcher == watcher:  assert(prev==NULL); first = watcher->next
elif watcher->prev != NULL:           watcher->prev->next = watcher->next
if holder->last_watcher == watcher:   assert(next==NULL); last = watcher->prev
elif watcher->next != NULL:           watcher->next->prev = watcher->prev
watcher->{next,prev,pgptr} = NULL
watcher->curr_rank = PGBUF_ORDERED_RANK_UNDEFINED              # pb.c:13684
holder->watch_count -= 1
```

주의: `page_was_unfixed`와 `group_id`, `initial_rank`는 **건드리지 않습니다.** 그래서 `replace_watcher`가 이를 복사해 넘길 수 있습니다.

**`pgbuf_get_holder`** (pb.c:13610-13641) — `PAGE_PTR` → `PGBUF_HOLDER`. `CAST_PGPTR_TO_BFPTR`로 bcb를 얻고 스레드의 `thrd_hold_list`를 선형 탐색. `thread_p->m_holder_anchor`가 비어 있으면 지연 초기화(pb.c:13624-13627).

**`pgbuf_ordered_unfix`** (pb.c:13416-13471)

```
assert (watcher_object->magic == MAGIC)
if watcher_object->pgptr == NULL:  assert_release(false); return   # pb.c:13434-13438
pgptr  = watcher_object->pgptr
holder = pgbuf_get_holder (pgptr);  assert_release (holder != NULL)
# holder의 watcher 리스트에 실제로 있는지 tail부터 확인             # pb.c:13448-13459
watcher = holder->last_watcher;  while (watcher && watcher != watcher_object) watcher = watcher->prev
assert_release (watcher != NULL)
assert (holder->fix_count >= holder->watch_count)                  # pb.c:13461
pgbuf_remove_watcher (holder, watcher_object)                      # pb.c:13463
pgbuf_watcher_init_debug (watcher_object, ..., add=false)           # pb.c:13466
pgbuf_unfix (thread_p, pgptr)                                      # pb.c:13467/13469
```

즉 **watcher 하나 = fix 하나**를 대응 해제합니다. 헤더의 `pgbuf_ordered_unfix_and_init`(pb.h:79-92)은 `pg_watcher != NULL`이면 `ordered_unfix` + `pgptr = NULL`, 아니면 `pgbuf_unfix_and_init`로 폴백합니다.

**`pgbuf_attach_watcher`** (pb.c:13561-13602) — **이미 일반 `pgbuf_fix`로 잡아둔** 페이지에 watcher를 사후 부착.

```
assert (hfid != NULL && !HFID_IS_NULL (hfid))                      # pb.c:13576
header_vpid = { hfid->vfid.volid, hfid->hpgid }
rank = VPID_EQ (&header_vpid, pgbuf_get_vpid_ptr (pgptr))
         ? PGBUF_ORDERED_HEAP_HDR : PGBUF_ORDERED_HEAP_NORMAL      # pb.c:13582-13589
PGBUF_INIT_WATCHER (watcher, rank, hfid)                           # pb.c:13591
watcher->curr_rank = rank                                          # pb.c:13592 (INIT은 UNDEFINED로 두므로 재설정)
holder = pgbuf_get_holder (pgptr);  assert (holder != NULL)
pgbuf_add_watch_instance_internal (holder, pgptr, watcher, latch_mode, true)
```

이 함수는 OVERFLOW rank를 배정할 수 없습니다(`HDR`/`NORMAL`만). overflow 페이지라면 부착 후 `PGBUF_WATCHER_RESET_RANK`(pb.h:119-122)로 보정해야 합니다.

**`pgbuf_replace_watcher`** (pb.c:13696-13736) — 같은 fix를 다른 watcher 객체로 이전. 스코프를 벗어나는 스택 watcher를 상위 스코프 watcher로 넘길 때 씁니다.

```
assert (PGBUF_IS_CLEAN_WATCHER (new_watcher))    # pb.h:163-164: next/prev/pgptr 모두 NULL
assert (old_watcher->pgptr != NULL)
holder = pgbuf_get_holder (old_watcher->pgptr);  assert_release (holder != NULL)
page_ptr   = old_watcher->pgptr
latch_mode = old_watcher->latch_mode
new_watcher->initial_rank = old_watcher->initial_rank              # pb.c:13724
new_watcher->curr_rank    = old_watcher->curr_rank                 # pb.c:13725
new_watcher->group_id     = old_watcher->group_id                  # pb.c:13726
pgbuf_remove_watcher (holder, old_watcher)                         # pb.c:13728
pgbuf_add_watch_instance_internal (holder, page_ptr, new_watcher, latch_mode, true)
```

`clear_unfix_flag = true`이므로 **`page_was_unfixed` 이력은 전달되지 않습니다.** 아직 확인하지 않은 refix 이력이 있다면 replace 전에 소비해야 합니다.

**`pgbuf_ordered_set_dirty_and_free`** (pb.c:13745-13750) — `pgbuf_set_dirty(DONT_FREE)` 후 `pgbuf_ordered_unfix`. 일반 경로의 `pgbuf_set_dirty_and_free`(pb.h:388)는 watcher를 정리하지 않으므로 ordered 페이지에는 반드시 이 함수를 써야 합니다.

**`pgbuf_watcher_init_debug`** (pb.c:13816-13849) — `init_at`에 위치 기록. `add=true`면 **기존 문자열 앞에 붙여 누적**(pb.c:13838-13844, `snprintf_dots_truncate`로 256B에 맞춰 절단), `add=false`면 덮어쓰기(pb.c:13845-13848). refix 이력을 추적하려는 의도이며, unfix 시 `add=true`(pb.c:12667, 13195), 해제 시 `add=false`(pb.c:13466, 13731)입니다.

### 3.5 watcher 초기화 매크로 (pb.h)

```c
#define PGBUF_WATCHER_SET_GROUP(w, hfid)                       /* pb.h:97-109 */
   hfid가 NULL이거나 volid==NULL_VOLID이거나 hpgid==NULL_PAGEID이거나 HFID_IS_NULL
     → VPID_SET_NULL (&w->group_id)          /* group 미지 → ordered_fix가 카탈로그 조회 */
   else
     → group_id = { hfid->vfid.volid, hfid->hpgid }

#define PGBUF_WATCHER_COPY_GROUP(dst, src)                     /* pb.h:111-117 */
   assert (!VPID_ISNULL (&src->group_id));  VPID_COPY (&dst->group_id, &src->group_id)
   /* 사용례: heap_file.c:7149, 7192 — home watcher의 group을 forward watcher로 전파 */

#define PGBUF_WATCHER_RESET_RANK(w, rank)   w->initial_rank = rank   /* pb.h:119-122 */
   /* 사용례: heap_file.c:7191 — REC_BIGONE에서 OVERFLOW rank로 재설정 */

#define PGBUF_CLEAR_WATCHER(w)              /* pb.h:125-131 (debug) / 145-150 */
   w->{next, prev, pgptr} = NULL;  [debug] pgbuf_watcher_init_debug (w, ..., false)

#define PGBUF_INIT_WATCHER(w, rank, hfid)   /* pb.h:133-143 / 152-160 */
   PGBUF_CLEAR_WATCHER (w)
   w->latch_mode       = PGBUF_NO_LATCH
   w->page_was_unfixed = false
   w->initial_rank     = rank
   w->curr_rank        = PGBUF_ORDERED_RANK_UNDEFINED     /* fix 시 확정 */
   PGBUF_WATCHER_SET_GROUP (w, hfid)
   [debug] w->watched_at[0] = '\0';  w->magic = PGBUF_WATCHER_MAGIC_NUMBER
```

`PGBUF_ORDERED_NULL_HFID`(pb.h:95)는 `pgbuf_ordered_null_hfid`(pb.c:850, 값은 `NULL`)로, "group을 모른다"를 표현합니다. 사용례: heap_file.c:6751, 8744, 9516.

---

## 4. dealloc / invalidate 상태 전이와 recovery 의미

### 4.1 "deallocated"의 정의

CUBRID에서 페이지 deallocate는 **`FILEIO_PAGE.prv.ptype`을 `PAGE_UNKNOWN`으로 만드는 것**입니다. 버퍼에서 제거하거나 디스크에서 지우지 않습니다.

`pgbuf_dealloc_page`(pb.c:15119-15173)의 설계 주석(pb.c:15129-15133)이 이유를 밝힙니다: 예전에는 bcb를 invalidate했지만 그러면 디스크 flush + IO write 대기가 필요해 너무 느립니다. 대신 bcb를 LRU 바닥으로 내려 flush thread가 나중에 쓰고 victimize하게 합니다.

따라서 `ptype == PAGE_UNKNOWN`은 **"미할당"과 "해제됨"을 구분하지 않습니다.** `pgbuf_rv_new_page_undo`(pb.c:15104-15110)와 `pgbuf_rv_dealloc_redo`(pb.c:15182-15189)가 정확히 같은 상태를 만드는 것이 그 증거입니다.

### 4.2 `pgbuf_dealloc_page` 상세 (pb.c:15119-15173)

```
전제: get_fcnt (&bcb->atomic_latch) == 1                          # pb.c:15136
      prv->ptype != PAGE_UNKNOWN                                  # pb.c:15139
      (호출자가 WRITE 래치로 정확히 1회 fix한 상태)

1. undo 데이터 캡처 (PGBUF_DEALLOC_UNDO_DATA, pb.c:987-995)        # pb.c:15141-15144
     udata.pageid = prv->pageid   (INT32)
     udata.volid  = prv->volid    (INT16)
     udata.ptype  = prv->ptype    (unsigned char)
     udata.pflag  = prv->pflag    (unsigned char)   ← TDE 암호화 비트 포함
   → 총 8바이트. 주석 pb.c:15126이 "pageid(4)+volid(2)+ptype(1)+pflag(1)"로 명시.
   ※ 이 구조체는 FILEIO_PAGE_RESERVED 안의 필드들을 그대로 복제한 것 (pb.c:987 주석)

2. WAL: log_append_undoredo_data2 (RVPGBUF_DEALLOC, vfid=NULL, page_dealloc,
                                   offset=0, undo_len=sizeof(udata), redo_len=0,
                                   undo_data=&udata, redo_data=NULL)   # pb.c:15146
   → redo는 데이터 없음(ptype만 UNKNOWN으로), undo는 8B로 복원.
   → ★ bcb mutex를 잡기 **전에** 로깅한다.

3. PGBUF_BCB_LOCK (bcb)                                           # pb.c:15148

4. prv.ptype = PAGE_UNKNOWN                                       # pb.c:15159
   prv.pflag = 0            ← TDE 알고리즘 비트를 지운다             # pb.c:15161
   (debug: 암호화 페이지였으면 tde_er_log, pb.c:15150-15156)

5. flags |= PGBUF_BCB_DIRTY_FLAG | PGBUF_BCB_MOVE_TO_LRU_BOTTOM_FLAG   # pb.c:15164

6. holder_status = pgbuf_unlatch_thrd_holder (bcb, NULL)          # pb.c:15166
   [debug] thread_p->get_pgbuf_tracker().decrement (page_dealloc)  # pb.c:15169
   pgbuf_unlatch_bcb_upon_unfix (bcb, holder_status)               # pb.c:15171
   → 이 안에서 bcb mutex가 해제된다.
```

6단계에서 `fcnt`가 0이 되고 `MOVE_TO_LRU_BOTTOM_FLAG`가 켜져 있으므로 `pgbuf_unlatch_bcb_upon_unfix`(pb.c:6672-6675)가 `pgbuf_move_bcb_to_bottom_lru`를 호출합니다. 그 함수(pb.c:10367 이하)는 먼저 플래그를 지우고(pb.c:10375), VOID zone이면 적당한 LRU 바닥에 새로 넣고(pb.c:10377-10387), 이미 LRU에 있으면 해당 리스트 바닥으로 이동시킵니다.

### 4.3 recovery redo/undo 의미

recovery index (recovery.h:175-178): `RVPGBUF_FLUSH_PAGE = 120`, `RVPGBUF_NEW_PAGE = 121`, `RVPGBUF_DEALLOC = 122`, `RVPGBUF_COMPENSATE_DEALLOC = 123`.

| 로그 | redo 핸들러 | undo 핸들러 | 의미 |
|---|---|---|---|
| `RVPGBUF_NEW_PAGE` | `pgbuf_rv_new_page_redo` (pb.c:15070-15095) | `pgbuf_rv_new_page_undo` (pb.c:15104-15110) | 페이지 첫 초기화 |
| `RVPGBUF_DEALLOC` | `pgbuf_rv_dealloc_redo` (pb.c:15182-15189) | `pgbuf_rv_dealloc_undo` (pb.c:15201-15241) — **논리적** | 페이지 해제 |
| `RVPGBUF_COMPENSATE_DEALLOC` | `pgbuf_rv_dealloc_undo_compensate` (pb.c:15251-15276) | (compensate이므로 undo 없음) | dealloc undo의 멱등화 |
| `RVPGBUF_FLUSH_PAGE` | `pgbuf_rv_flush_page` (pb.c:14833-14860) | — | recovery 중 즉시 flush |

**`pgbuf_rv_new_page_redo`** (pb.c:15070-15095):

```
assert (rcv->pgptr != NULL, 0 <= rcv->length <= DB_PAGESIZE)
if rcv->length > 0:  memcpy (rcv->pgptr, rcv->data, rcv->length)   # pb.c:15080
set_page_type = (PAGE_TYPE) rcv->offset          ← offset 필드를 ptype 채널로 재활용
if set_page_type != PAGE_UNKNOWN:  pgbuf_set_page_ptype (rcv->pgptr, set_page_type)
else: assert (false)
pgbuf_set_dirty (rcv->pgptr, DONT_FREE)
```

`pgbuf_log_new_page`(pb.c:15040-15050)가 `log_append_undoredo_data2(RVPGBUF_NEW_PAGE, NULL, page_new, (PGLENGTH) ptype_new, /*undo_len*/0, /*redo_len*/data_size, NULL, page_new)`로 기록하므로 **`offset`이 새 ptype을 실어 나릅니다.** `pgbuf_log_redo_new_page`(pb.c:15052-15061)는 undo 없는 redo-only 버전으로, 파일 할당 자체가 다른 방식으로 되돌려지는 경우에 씁니다.

**`pgbuf_rv_dealloc_undo`** (pb.c:15201-15241) — 유일하게 **논리적(logical) undo**입니다. 함수 주석(pb.c:15198-15199)이 이유를 명시: "deallocate된 페이지는 `OLD_PAGE_DEALLOCATED` fetch mode를 쓰지 않으면 fix할 수 없기 때문". 즉 recovery 프레임워크가 `rcv->pgptr`을 미리 fix해줄 수 없습니다.

```
vpid = { udata->pageid, udata->volid }
assert (rcv->length == sizeof (PGBUF_DEALLOC_UNDO_DATA))            # pb.c:15212
assert (PAGE_UNKNOWN < udata->ptype <= PAGE_LAST)                   # pb.c:15213

page = pgbuf_fix (&vpid, OLD_PAGE_DEALLOCATED, PGBUF_LATCH_WRITE, UNCONDITIONAL)  # pb.c:15216
if page == NULL: assert_release (false); return ER_FAILED
assert (pgbuf_get_page_ptype (page) == PAGE_UNKNOWN)                # pb.c:15222
pgbuf_set_page_ptype (page, udata->ptype)                           # pb.c:15223
iopage->prv.pflag = udata->pflag                                    # pb.c:15226  ← TDE 비트 복원

log_append_compensate_with_undo_nxlsa (RVPGBUF_COMPENSATE_DEALLOC, &vpid, 0, page,
                                       sizeof (udata), udata,
                                       LOG_FIND_CURRENT_TDES (thread_p),
                                       &rcv->reference_lsa)         # pb.c:15236-15238
pgbuf_set_dirty_and_free (page)                                     # pb.c:15239
```

**compensate 로그가 필요한 이유**: 논리적 undo는 페이지를 스스로 fix하므로 그 변경이 WAL에 남지 않으면 undo 중 재크래시 시 다시 실행돼야 하는지 알 수 없습니다. `log_append_compensate_with_undo_nxlsa`는 (a) 물리적 redo 레코드를 남기고 (b) undo 체인의 next-undo-LSA를 `rcv->reference_lsa` 앞으로 밀어 이 undo가 완료되었음을 기록합니다. 그래서 undo 재실행이 없습니다.

**`pgbuf_rv_dealloc_undo_compensate`** (pb.c:15251-15276) — 위 compensate 레코드의 redo. 이때는 recovery가 `rcv->pgptr`을 fix해 줍니다(pb.c:15258 `assert (rcv->pgptr != NULL)`).

```
pgbuf_set_page_ptype (rcv->pgptr, udata->ptype)                     # pb.c:15264
iopage->prv.pflag = udata->pflag                                    # pb.c:15265
```

> **결함 관찰**: pb.c:15255에서 선언된 `VPID vpid;`가 이 함수에서 **한 번도 대입되지 않은 채** pb.c:15271의 `VPID_AS_ARGS (&vpid)`로 읽힙니다. `#if !defined(NDEBUG)` 블록(pb.c:15267-15273) 안이므로 debug 빌드에서만 노출되며, 조건은 `iopage->prv.pflag & FILEIO_PAGE_FLAG_ENCRYPTED_MASK`(TDE 페이지)입니다. 초기화되지 않은 스택 값을 로그에 출력합니다. `pgbuf_rv_dealloc_undo`(pb.c:15209-15210)에서 복사해 온 코드로 보이며, `vpid`를 `udata`에서 채우거나 `rcv->pgptr`의 VPID를 쓰도록 고쳐야 합니다.

### 4.4 상태 전이도

```
                       ┌──────────────────────────────────────────────┐
                       │  (a) 미할당 / 해제됨:  prv.ptype == UNKNOWN   │
                       └───────────┬──────────────────────┬───────────┘
                                   │                      ▲
       파일 관리자가 할당 +          │                      │  pgbuf_dealloc_page (pb.c:15159)
       pgbuf_log_new_page          │                      │    ptype = UNKNOWN, pflag = 0
       (pb.c:15040)                │                      │    flags |= DIRTY|MOVE_TO_LRU_BOTTOM
       또는 rv_new_page_redo       │                      │  또는 rv_dealloc_redo (pb.c:15185)
       (pb.c:15083-15087)          │                      │
                                   ▼                      │
                       ┌──────────────────────────────────────────────┐
                       │  (b) 할당됨:  prv.ptype ∈ {HEAP, OVERFLOW,   │
                       │      BTREE, …},  pflag에 TDE 비트 가능        │
                       └───────────┬──────────────────────▲───────────┘
                                   │                      │
       rv_new_page_undo            │                      │  rv_dealloc_undo (논리적, pb.c:15216-15226)
       (pb.c:15107) ptype=UNKNOWN  │                      │    OLD_PAGE_DEALLOCATED로 fix
                                   ▼                      │    ptype/pflag 복원 + compensate 로그
                              (a)로 복귀                   │  rv_dealloc_undo_compensate (pb.c:15264)


 별도 축 — 버퍼 점유 상태 (ptype과 직교):

    PGBUF_INVALID_ZONE ◀─── put_bcb_into_invalid_list ◀─── invalidate_bcb (pb.c:8688)
        │                                                        ▲
        │ pgbuf_get_bcb_from_invalid_list                        │ latch == NO_LATCH
        ▼                                                        │ && hash에서 제거 성공
    PGBUF_VOID_ZONE ──────▶ PGBUF_LRU_{1,2,3}_ZONE ─────────────┘
        │                              │
        │                              │ victimize_bcb (pb.c:8617-8625)
        │                              ▼   delete_from_hash_chain → vpid = NULL
        │                        latch_mode = PGBUF_LATCH_INVALID, fcnt = 0
        └──────────────────────────────┘
```

### 4.5 `PAGE_FETCH_MODE`와 dealloc 상호작용

`PAGE_FETCH_MODE`(pb.h:172-187)에 따른 `pgbuf_fix_release`의 `ptype == PAGE_UNKNOWN` 처리(pb.c:2523-2561):

| `fetch_mode` | `ptype == PAGE_UNKNOWN`일 때 | 근거 |
|---|---|---|
| `NEW_PAGE` | 정상. 페이지 반환 | pb.c:2528 |
| `OLD_PAGE_DEALLOCATED` | 정상. 페이지 반환 (undo가 사용) | pb.c:2529 |
| `OLD_PAGE_IF_IN_BUFFER` | 정상. 페이지 반환 | pb.c:2530 |
| `RECOVERY_PAGE` | 정상. 페이지 반환 | pb.c:2531 |
| `OLD_PAGE` | `assert(false)` + `ER_PB_BAD_PAGEID` (**ERROR** severity) + unfix + `NULL` | pb.c:2534-2544 |
| `OLD_PAGE_PREVENT_DEALLOC` | 위와 동일 | pb.c:2535 |
| `OLD_PAGE_MAYBE_DEALLOCATED` | `ER_PB_BAD_PAGEID` (**WARNING** severity) + unfix + `NULL`. assert 없음 | pb.c:2545-2553 |

이 severity 차이가 ordered_fix의 특수 처리(pb.c:2353-2359 주석 및 12353-12359)를 낳습니다. `er_errid_if_has_error()`는 WARNING을 에러로 보지 않으므로, `OLD_PAGE_MAYBE_DEALLOCATED`의 실패를 `er_errid()`로 직접 확인해야 합니다.

또한 `OLD_PAGE_MAYBE_DEALLOCATED`는 `pgbuf_check_bcb_page_vpid`의 검증을 완화합니다(pb.c:2401-2402 → pb.c:11189-11205): `maybe_deallocated && log_is_in_crash_recovery_and_not_yet_completes_redo()`이면 `prv.pageid/volid`가 `bcb->vpid`와 달라도 assert가 통과합니다.

`fetch_mode == OLD_PAGE_IF_IN_BUFFER`는 hash에 없으면 디스크를 읽지 않고 즉시 `NULL`을 반환합니다(pb.c:2359-2364).

### 4.6 avoid-dealloc 카운터

`PGBUF_BCB.count_fix_and_avoid_dealloc`(pb.c:535-540)은 `volatile int` 하나를 두 용도로 나눠 씁니다:

```
 비트: 31                    16 15                      0
      ┌───────────────────────┬─────────────────────────┐
      │  fix 카운터 (hot 판정) │  avoid-dealloc 카운터    │
      └───────────────────────┴─────────────────────────┘
        PGBUF_BCB_COUNT_FIX_SHIFT_BITS = 16   (pb.c:268)
        PGBUF_BCB_AVOID_DEALLOC_MASK = 0x0000FFFF  (pb.c:269)
```

주석(pb.c:536-540)이 분리하지 않은 이유를 밝힙니다: avoid-dealloc은 원자적으로 변경해야 하는데 **2바이트 원자 연산은 일반적이지 않기** 때문입니다.

| 함수 | 동작 | 위치 |
|---|---|---|
| `pgbuf_bcb_register_avoid_deallocation` | `assert ((cnt & 0x00008000) == 0)` 후 `ATOMIC_INC_32 (…, 1)` | pb.c:16204-16209 |
| `pgbuf_bcb_unregister_avoid_deallocation` | CAS 루프. 하위 16비트가 0이면 감소하지 않고 `break` + `er_log_debug` | pb.c:16217-16253 |
| `pgbuf_bcb_should_avoid_deallocation` | `(cnt & 0x0000FFFF) != 0` | pb.c:16261-16267 |
| `pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc` | 0이 아니면 경고 로그, 그 뒤 필드 전체를 0 | pb.c:16280-16289 |
| `pgbuf_bcb_register_fix` | 임계치(`64 << 16`) 미달일 때만 `ATOMIC_INC_32 (…, 1 << 16)` | pb.c:16297-16310 |
| `pgbuf_bcb_is_hot` | `cnt >= (PGBUF_FIX_COUNT_THRESHOLD << 16)`, 임계치 64(pb.c:106) | pb.c:16318-16323 |

`0x00008000` assert(pb.c:16207, 16225, 16265)의 의미: avoid-dealloc 카운트가 32,768을 넘어 **fix 카운터 영역으로 자리올림하지 않음**을 보장합니다.

**register 호출자**: `pgbuf_fix_release`의 `OLD_PAGE_PREVENT_DEALLOC`(pb.c:2427), `pgbuf_ordered_fix`의 unfix 직전(pb.c:12639), `pgbuf_ordered_callback`의 unfix 직전(pb.c:13176).

**리셋 호출자**: `pgbuf_delete_from_hash_chain`(pb.c:7921) — bcb가 hash에서 빠질 때(victimize/invalidate), `pgbuf_claim_bcb_for_fix`(pb.c:8438) — bcb를 새 VPID용으로 초기화할 때, `pgbuf_initialize_bcb_table`(pb.c:5588).

**왜 unregister 시 0일 수 있는가** — pb.c:16232-16245의 긴 주석이 정확히 설명합니다:

> `pgbuf_ordered_fix`는 새 페이지를 잡기 위해 보유 페이지 전부를 놓을 수 있다. 새 페이지보다 "작은" 페이지들은 avoid-dealloc 마킹 후 unfix된다. 그 다음 트랜잭션은 새 페이지 래치를 기다리는데, 그 사이 방금 놓은 페이지들이 victimize될 수 있다. `pgbuf_ordered_fix`가 이들을 되잡으면 디스크에서 새로 읽으므로 avoid-dealloc 카운트가 0이다.

주석은 이어서 **의도적으로 감수한 위험**을 밝힙니다: avoid-dealloc은 vacuum worker의 deallocate를 막기 위한 것이므로, 마킹된 bcb를 victimize하는 것은 완전히 안전하지 않습니다. 그러나 실제로 페이지가 deallocate될 확률이 거의 0이고, "마킹된 bcb의 victimize를 금지"하는 대안은 훨씬 복잡하며 카운터 누수 시 bcb가 영구히 victimize 불가가 되는 심각한 위험이 있습니다.

**소비자**: `pgbuf_has_prevent_dealloc`(pb.c:14670-14683)이 `should_avoid_deallocation`을 그대로 노출합니다(SA 빌드는 항상 `false`). 실제 사용:

- `vacuum.c:1850` — 빈 heap 페이지 제거 시도 전 `pgbuf_has_prevent_dealloc (helper.home_page) == false`를 확인
- `heap_file.c:3383` — **모든 래치를 얻은 뒤** 다시 확인(주석: "recheck the dealloc flag after all latches are acquired"). ordered_fix가 중간에 페이지를 놓았을 수 있으므로 그 사이 heap scan이 도달했을 가능성을 재검사
- `pgbuf_peek_stats`(pb.c:14736) — `avoid_dealloc_cnt` 통계

`OLD_PAGE_PREVENT_DEALLOC`로 페이지 체인을 순회하는 heap scan(heap_file.c:7572, 8979, 9375, 14366, 14780, 17478, 18923, 19022, locator_sr.c:12788)이 이 마커의 주된 생산자입니다.

### 4.7 `pgbuf_fix_if_not_deallocated` (pb.c:15292-15343)

"deallocate되었으면 fix하지 않고 성공 반환"하는 래퍼. 일반 fix와 달리 deallocate된 페이지를 발견하는 것이 **정상 시나리오**입니다.

```
*page = NULL
isvalid = disk_is_page_sector_reserved (vpid->volid, vpid->pageid)   # pb.c:15311
if isvalid == DISK_INVALID:  return NO_ERROR       # 섹터 자체가 미예약 → deallocated
if isvalid == DISK_ERROR:    return error
assert (isvalid == DISK_VALID)

*page = pgbuf_fix (vpid, OLD_PAGE_MAYBE_DEALLOCATED, latch_mode, latch_condition)
if *page == NULL and !log_is_in_crash_recovery_and_not_yet_completes_redo ():
    ASSERT_ERROR_AND_SET (error_code)
    if error_code == ER_PB_BAD_PAGEID:
        er_clear ();  error_code = NO_ERROR        # deallocated → 성공으로 간주
return error_code
```

두 단계 검사: (1) 디스크 섹터 예약 여부(파일 수준 해제), (2) `ptype == PAGE_UNKNOWN`(페이지 수준 해제). 주석(pb.c:15307-15310)은 (1)이 성능 문제를 유발할 수 있으니 테이블 락이 있으면 생략하도록 개선해야 한다고 적어 두었습니다.

### 4.8 invalidate 계열

`pgbuf_dealloc_page`와 달리 invalidate는 **bcb를 즉시 invalid list로 되돌립니다.** 헤더 주석(pb.c:3320-3327)은 임시 페이지는 언제든, 영구 페이지는 **커밋 결정 후 postpone 연산으로만** invalidate해야 한다고 명시합니다.

**`pgbuf_invalidate`** (pb.c:3331-3423)

```
[검증] PGBUF_DEBUG_PAGE_VALIDATION_ALL이면 pgbuf_is_valid_page_ptr           # pb.c:3341-3347
CAST_PGPTR_TO_BFPTR (bufptr, pgptr);  assert (!VPID_ISNULL (&bufptr->vpid))
PGBUF_BCB_LOCK (bufptr)                                                      # pb.c:3353

if get_fcnt (&bufptr->atomic_latch) > 1:                                     # pb.c:3360-3376
    # 여러 번 fix된 상태 → invalidate 불가, 그냥 1회 unfix하고 성공 반환
    # (주석 pb.c:3355-3359: 호출자는 WRITE로 fix한 뒤 unfix하고 invalidate해야 함)
    # (pb.c:3368에 "todo: is this really safe?" 의문 주석 존재)
    holder_status = pgbuf_unlatch_thrd_holder (bufptr, NULL)
    pgbuf_unlatch_bcb_upon_unfix (bufptr, holder_status)     # mutex 해제
    return NO_ERROR

# 여기서 fcnt == 1, latch_mode == PGBUF_LATCH_WRITE
pgbuf_bcb_safe_flush_force_lock (bufptr, synchronous = true)                  # pb.c:3380
    → dirty면 디스크에 쓰고 대기. 반환 시 mutex 계속 보유

temp_vpid = bufptr->vpid            # ★ VPID 스냅샷                          # pb.c:3387
holder_status = pgbuf_unlatch_thrd_holder (bufptr, NULL)                      # pb.c:3389
pgbuf_unlatch_bcb_upon_unfix (bufptr, holder_status)   # mutex 해제, fcnt→0    # pb.c:3394

PGBUF_BCB_LOCK (bufptr)             # ★ mutex 재획득                         # pb.c:3401

# ★★ VPID 재검증 패턴 ★★                                                     # pb.c:3404-3409
if VPID_ISNULL (&bufptr->vpid)                 # 이미 victimize됨
   or !VPID_EQ (&temp_vpid, &bufptr->vpid)     # 다른 페이지로 재사용됨
   or get_fcnt (&bufptr->atomic_latch) > 0     # 누가 다시 fix함
   or pgbuf_bcb_avoid_victim (bufptr):         # DIRTY/FLUSHING/VICTIM_DIRECT
    PGBUF_BCB_UNLOCK (bufptr);  return NO_ERROR      # 조용히 포기

pgbuf_invalidate_bcb (bufptr)       # 안에서 mutex 해제                       # pb.c:3416
```

**재검증이 필수인 이유**: pb.c:3394와 pb.c:3401 사이에 bcb mutex가 풀려 있고 `fcnt == 0`이므로, 그 창에서 bcb가 victimize되어 **완전히 다른 VPID에 재할당**될 수 있습니다. `temp_vpid` 비교 없이 진행하면 남의 페이지를 invalidate합니다. `pgbuf_bcb_avoid_victim`(pb.c:16180-16184)은 `PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK`(pb.c:258-262: `DIRTY | FLUSHING_TO_DISK | VICTIM_DIRECT | INVALIDATE_DIRECT_VICTIM`)를 검사합니다.

**`pgbuf_invalidate_all`** (pb.c:3438-3500) — `volid`(또는 `NULL_VOLID` = 전체)에 해당하는 **fix되지 않은** bcb 전부를 invalidate.

```
for bufid in 0 .. num_buffers-1:
    bufptr = PGBUF_FIND_BCB_PTR (bufid)
    # 1차: mutex 없이 싼 필터                                                # pb.c:3453-3456
    if VPID_ISNULL (&bufptr->vpid) or (volid != NULL_VOLID and volid != bufptr->vpid.volid):
        continue
    PGBUF_BCB_LOCK (bufptr)
    # 2차: mutex 잡고 재검사 (+ fcnt)                                        # pb.c:3459-3465
    if VPID_ISNULL or volid 불일치 or get_fcnt > 0:
        PGBUF_BCB_UNLOCK;  continue
    if pgbuf_bcb_is_dirty (bufptr):                                          # pb.c:3467-3482
        temp_vpid = bufptr->vpid                    # ★ 스냅샷
        pgbuf_bcb_safe_flush_force_lock (bufptr, true)
        # ★ flush가 mutex를 풀었을 수 있으므로 3차 재검증
        if VPID_ISNULL or !VPID_EQ (&temp_vpid, &bufptr->vpid)
           or volid 불일치 or get_fcnt > 0:
            PGBUF_BCB_UNLOCK;  continue
    if pgbuf_bcb_avoid_victim (bufptr):  PGBUF_BCB_UNLOCK;  continue          # pb.c:3484-3488
    pgbuf_invalidate_bcb (bufptr)       # mutex 해제                          # pb.c:3495
```

세 겹의 검사(mutex 없이 → mutex 잡고 → flush 후)가 전형적인 재검증 패턴입니다.

**`pgbuf_invalidate_bcb`** (pb.c:8641-8699) — 실제 invalidate. 호출자가 bcb mutex 보유, 반환 시 해제.

```
if get_latch (&bufptr->atomic_latch) == PGBUF_LATCH_INVALID:      # 이미 invalid
    PGBUF_BCB_UNLOCK;  return NO_ERROR                                    # pb.c:8646-8650
if pgbuf_bcb_is_direct_victim (bufptr):                                   # pb.c:8652-8658
    # 이미 direct victim으로 배정됨 → 곧 victimize되므로 invalidate 무의미
    PGBUF_BCB_UNLOCK;  return NO_ERROR
pgbuf_bcb_clear_dirty (bufptr)                                            # pb.c:8660
LSA_SET_NULL (&bufptr->oldest_unflush_lsa)                                # pb.c:8662
switch (pgbuf_bcb_get_zone (bufptr)):                                     # pb.c:8665-8674
    PGBUF_VOID_ZONE: break                       # LRU에 없음
    default: assert (PGBUF_IS_BCB_IN_LRU); pgbuf_lru_remove_bcb (bufptr)
if get_latch (&bufptr->atomic_latch) == PGBUF_NO_LATCH:                   # pb.c:8676-8689
    pgbuf_delete_from_hash_chain (bufptr)        # 실패 시 mutex 이미 해제됨
    pgbuf_put_bcb_into_invalid_list (bufptr)     # 안에서 mutex 해제
else:
    assert (false)                               # "todo: what to do?" pb.c:8692
    set_latch (&bufptr->atomic_latch, PGBUF_NO_LATCH);  PGBUF_BCB_UNLOCK
```

**`pgbuf_victimize_bcb`** (pb.c:8589-8633) — invalidate와 유사하지만 **invalid list로 보내지 않고 호출자에게 재사용시킵니다.**

| | `pgbuf_invalidate_bcb` | `pgbuf_victimize_bcb` |
|---|---|---|
| 사전 조건 검사 | latch != INVALID, !direct_victim | `pgbuf_is_bcb_victimizable (bcb, true)` (pb.c:8603) |
| dirty 처리 | `clear_dirty` + `oldest_unflush_lsa = NULL` | dirty면 victimizable이 아니라 애초에 진입 불가 |
| `TO_VACUUM` 플래그 | 손대지 않음 | **지운다** (pb.c:8610-8613) |
| LRU 제거 | `pgbuf_lru_remove_bcb` | 호출 전에 이미 제거된 상태 (`assert (latch == NO_LATCH)`, pb.c:8614) |
| hash 제거 | 조건부(`latch == NO_LATCH`) | 무조건 `pgbuf_delete_from_hash_chain` (pb.c:8617) |
| 종료 상태 | invalid list, mutex 해제 | `latch_mode = PGBUF_LATCH_INVALID, waiter_exists = false, fcnt = 0` (pb.c:8621-8625), **mutex 계속 보유** |

**`pgbuf_delete_from_hash_chain`** (pb.c:7835-7925) — 두 경로의 공통 하부.

```
호출자가 bcb mutex 보유 (전제: fcnt==0, next_wait_thrd==NULL, latch_mode==NO_LATCH)
hash_anchor = &buf_hash_table[PGBUF_HASH_VALUE (&bufptr->vpid)]
pthread_mutex_lock (&hash_anchor->hash_mutex)                             # pb.c:7859

if pgbuf_bcb_is_flushing (bufptr):                                        # pb.c:7869-7878
    assert (false)
    unlock hash_mutex;  set_latch (NO_LATCH);  PGBUF_BCB_UNLOCK;  return ER_FAILED

chain에서 bufptr 탐색                                                     # pb.c:7881-7893
if 못 찾음:                                                                # pb.c:7895-7906
    assert (false);  unlock hash_mutex
    pgbuf_put_bcb_into_invalid_list (bufptr)     # mutex 해제
    return ER_FAILED

chain에서 unlink                                                          # pb.c:7909-7918
pthread_mutex_unlock (&hash_anchor->hash_mutex)                           # pb.c:7919
VPID_SET_NULL (&bufptr->vpid)                    # ★★ 핵심                # pb.c:7920
pgbuf_bcb_check_and_reset_fix_and_avoid_dealloc (bufptr, ARG_FILE_LINE)   # pb.c:7921
return NO_ERROR      # mutex 계속 보유
```

`VPID_SET_NULL`(pb.c:7920)이 **락 없는 판독자들이 bcb 재사용을 감지하는 유일한 신호**입니다. `pgbuf_search_hash_chain`의 pb.c:7586/7656과 `pgbuf_lockfree_fix_ro`의 pb.c:7690이 mutex/CAS 획득 후 VPID를 재확인해 불일치 시 재시도합니다.

---

## 5. VPID 락 테이블 (buffer lock)

### 5.1 목적

동일 VPID에 대한 **중복 디스크 읽기를 방지**합니다. 페이지가 버퍼에 없으면 여러 스레드가 동시에 "없다"를 관측할 수 있는데, 각자 bcb를 할당해 읽으면 (a) 불필요한 IO가 중복되고 (b) 같은 VPID를 가진 bcb가 hash chain에 둘 이상 생겨 일관성이 깨집니다. VPID 락은 정확히 한 스레드만 읽게 하고 나머지는 재큐잉시킵니다.

### 5.2 자료구조

```c
/* pb.c:564-571 */
struct pgbuf_buffer_lock
{
  VPID vpid;                        /* 이 슬롯이 락을 건 VPID */
  PGBUF_BUFFER_LOCK *lock_next;     /* hash_anchor의 lock chain 링크 */
#if defined(SERVER_MODE)
  THREAD_ENTRY *next_wait_thrd;     /* 이 VPID를 기다리는 스레드 큐 */
#endif
};

/* pb.c:577-584 */
struct pgbuf_buffer_hash
{
  pthread_mutex_t hash_mutex;       /* hash chain + lock chain 양쪽을 보호 */
  PGBUF_BCB *hash_next;             /* buffer hash chain */
  PGBUF_BUFFER_LOCK *lock_next;     /* buffer lock chain */
};

/* pb.c:350 */
enum { PGBUF_LOCK_WAITER = 0, PGBUF_LOCK_HOLDER };
```

`pgbuf_initialize_lock_table`(pb.c:5657-5688):

```
thrd_num_total = thread_num_total_threads ()          # SA 빌드는 1 (pb.c:5666 assert)
buf_lock_table = malloc (thrd_num_total * PGBUF_BUFFER_LOCK_SIZEOF)
각 엔트리: VPID_SET_NULL (&vpid);  lock_next = NULL;  next_wait_thrd = NULL
```

**스레드 개수만큼의 고정 배열**이며, 스레드는 자기 인덱스 슬롯만 씁니다(pb.c:8025 `&pgbuf_Pool.buf_lock_table[cur_thrd_entry->index]`). pb.c:8021-8022 주석이 이 설계를 확인합니다. 즉 **한 스레드는 동시에 최대 하나의 VPID 락만 보유**할 수 있습니다. 페이지 읽기가 짧고 중첩되지 않기에 성립하는 가정입니다.

`hash_mutex` 하나가 hash chain과 lock chain을 모두 보호하므로, "hash에 없음 → 락 획득"이 원자적입니다.

### 5.3 `pgbuf_lock_page` 의사코드 (pb.c:7938-8035)

```
/* 전제: 호출자가 hash_anchor->hash_mutex를 보유한다.
   반환 전에 hash_mutex를 반드시 해제한다.
   페이지가 hash chain에 없을 때만 호출된다. (pb.c:7933-7935) */

pgbuf_lock_page (thread_p, hash_anchor, vpid):

#if !defined (SERVER_MODE)
    /* SA 모드: 경쟁이 없으므로 전체가 no-op (pb.c:7940-8031이 #if SERVER_MODE) */
    perfmon_inc_stat (PSTAT_LK_NUM_ACQUIRED_ON_PAGES)
    return PGBUF_LOCK_HOLDER
#endif

    cur_thrd_entry = thread_p ?: thread_get_thread_entry_info ()      # pb.c:7949-7955
    cur_buffer_lock = hash_anchor->lock_next

    ── (A) lock chain 선형 탐색 ────────────────────────────  pb.c:7959-8019
    while cur_buffer_lock != NULL:
        if VPID_EQ (&cur_buffer_lock->vpid, vpid):
            # 발견: 다른 스레드가 이 VPID를 읽고 있다 → 대기 큐에 push
            cur_thrd_entry->next_wait_thrd = cur_buffer_lock->next_wait_thrd
            cur_buffer_lock->next_wait_thrd = cur_thrd_entry          # pb.c:7964-7965
            pgbuf_sleep (cur_thrd_entry, &hash_anchor->hash_mutex)    # pb.c:7966
            #   ↑ hash_mutex를 풀고 자며, 깨어날 때 다시 잡지 않는다

            ── (A1) 비정상 기상(인터럽트/타임아웃) 처리 ──────  pb.c:7968-8014
            if cur_thrd_entry->resume_status != THREAD_PGBUF_RESUMED:
                pthread_mutex_lock (&hash_anchor->hash_mutex)         # pb.c:7979
                # 대기 큐에서 자신을 직접 제거 (깨워준 사람이 없으므로)
                thrd = cur_buffer_lock->next_wait_thrd;  prev = NULL
                while thrd != NULL:
                    if thrd == cur_thrd_entry:
                        (prev ? prev->next_wait_thrd : cur_buffer_lock->next_wait_thrd)
                            = thrd->next_wait_thrd
                        thrd->next_wait_thrd = NULL
                        pthread_mutex_unlock (&hash_anchor->hash_mutex)
                        perfmon_inc_stat (PSTAT_LK_NUM_WAITED_ON_PAGES)
                        return PGBUF_LOCK_WAITER
                    prev = thrd;  thrd = thrd->next_wait_thrd
                pthread_mutex_unlock (&hash_anchor->hash_mutex)       # pb.c:8013
                # 못 찾음 = 그 사이 unlock_page가 큐에서 빼갔다 → 아래로 진행

            ── (A2) 정상 기상 ────────────────────────────────  pb.c:8015-8016
            perfmon_inc_stat (PSTAT_LK_NUM_WAITED_ON_PAGES)
            return PGBUF_LOCK_WAITER
            #   ↑ ★ 어느 경로든 WAITER를 반환한다. 락을 얻은 것이 아니라
            #     "기다렸으니 hash chain을 다시 뒤져라"는 뜻이다.
        cur_buffer_lock = cur_buffer_lock->lock_next

    ── (B) 미발견 → 자기 슬롯으로 락 획득 ──────────────────  pb.c:8024-8034
    cur_buffer_lock = &pgbuf_Pool.buf_lock_table[cur_thrd_entry->index]
    cur_buffer_lock->vpid = *vpid                                     # pb.c:8026
    cur_buffer_lock->next_wait_thrd = NULL                            # pb.c:8027
    cur_buffer_lock->lock_next = hash_anchor->lock_next               # pb.c:8028
    hash_anchor->lock_next = cur_buffer_lock          # chain head에 push
    pthread_mutex_unlock (&hash_anchor->hash_mutex)                   # pb.c:8030
    perfmon_inc_stat (PSTAT_LK_NUM_ACQUIRED_ON_PAGES)
    return PGBUF_LOCK_HOLDER
```

### 5.4 `pgbuf_unlock_page` 의사코드 (pb.c:8051-8125)

```
/* 페이지를 버퍼로 읽어들이고 bcb를 hash chain에 연결한 뒤에만 호출된다. (pb.c:8044-8045)
   반환 전에 hash_mutex를 해제하고 대기 큐 전원을 깨운다. */

pgbuf_unlock_page (thread_p, hash_anchor, vpid, need_hash_mutex):

#if !defined (SERVER_MODE)
    return NO_ERROR       /* 전체가 #if SERVER_MODE (pb.c:8053-8122) */
#endif

    if need_hash_mutex:                                               # pb.c:8062-8080
        pthread_mutex_lock (&hash_anchor->hash_mutex)
        # (perfmon: PSTAT_PB_NUM_HASH_ANCHOR_WAITS / PSTAT_PB_TIME_HASH_ANCHOR_WAIT)
    # need_hash_mutex == false면 호출자가 이미 hash_mutex를 보유한 상태

    ── lock chain에서 vpid 검색 ────────────────────────────  pb.c:8083-8095
    prev = NULL;  cur = hash_anchor->lock_next
    while cur != NULL and !VPID_EQ (&cur->vpid, vpid):
        prev = cur;  cur = cur->lock_next

    if cur != NULL:
        (prev ? prev->lock_next : hash_anchor->lock_next) = cur->lock_next  # pb.c:8099-8106
        cur->lock_next = NULL                                         # pb.c:8108
        pthread_mutex_unlock (&hash_anchor->hash_mutex)               # pb.c:8109
        #   ↑ ★ 깨우기 전에 hash_mutex를 먼저 놓는다. 깨어난 스레드가
        #     즉시 hash_mutex를 잡으려 하므로 hand-off 지연을 막는다.

        ── 대기자 전원 기상 ─────────────────────────────────  pb.c:8111-8116
        while (t = cur->next_wait_thrd) != NULL:
            cur->next_wait_thrd = t->next_wait_thrd
            t->next_wait_thrd = NULL
            pgbuf_wakeup_uncond (t)         # resume_status = THREAD_PGBUF_RESUMED
    else:
        pthread_mutex_unlock (&hash_anchor->hash_mutex)               # pb.c:8118-8121
        # 락 엔트리가 없음: 에러 경로 등에서 이미 정리된 경우
    return NO_ERROR
```

`cur->vpid`를 `NULL`로 되돌리지 않는 점에 주의하십시오. `lock_next = NULL`로 chain에서 빠지므로 더 이상 탐색되지 않고, 슬롯은 그 스레드가 다음에 `pgbuf_lock_page`를 호출할 때 `vpid`를 덮어씁니다(pb.c:8026).

### 5.5 fix 경로 전체에서의 배치

```
pgbuf_fix_release (pb.c:2213)
  │
  ├─ [빠른 경로] READ + OLD_PAGE류 + UNCOND면 pgbuf_lockfree_fix_ro (pb.c:2311-2330)
  │     mutex 없이 hash 탐색 → atomic_latch CAS로 fcnt++ → fast_path로 점프
  │
  ├─ hash_anchor = &buf_hash_table[PGBUF_HASH_VALUE (vpid)]          pb.c:2332
  ├─ bufptr = pgbuf_search_hash_chain (hash_anchor, vpid)            pb.c:2335
  │     └─ 반환 규약(pb.c:7666-7667):
  │          bufptr != NULL → bcb mutex 보유, hash_mutex 미보유
  │          bufptr == NULL → hash_mutex 보유
  │
  ├─ bufptr != NULL:  히트. (direct victim이면 INVALIDATE 플래그로 전환, pb.c:2336-2340)
  ├─ bufptr == NULL && OLD_PAGE_IF_IN_BUFFER:  hash_mutex 풀고 NULL 반환   pb.c:2359-2364
  └─ bufptr == NULL: 미스
        │
        pgbuf_claim_bcb_for_fix (hash_anchor, ..., &retry)           pb.c:2367 / 8351
          │  (호출 시 hash_mutex 보유)
          ├─ er_errid() == ER_CSS_PTHREAD_MUTEX_TRYLOCK → hash_mutex 풀고 NULL  pb.c:8369-8374
          ├─ pgbuf_lock_page (hash_anchor, vpid)                     pb.c:8378
          │     != PGBUF_LOCK_HOLDER → *try_again = true; return NULL
          │        └─ pgbuf_fix_release가 goto try_again (pb.c:2370-2374)
          │           → hash chain 재탐색. 이제 홀더가 넣어둔 bcb를 찾게 된다.
          │     (hash_mutex는 lock_page 안에서 해제됨)
          ├─ bufptr = pgbuf_allocate_bcb (vpid)                      pb.c:8418
          │     실패 → pgbuf_unlock_page (…, need_hash_mutex=true); NULL   pb.c:8422
          │     성공 → bcb mutex 보유
          ├─ bcb 초기화: vpid, atomic_latch{NO_LATCH,false,0},
          │     ASYNC_FLUSH_REQ 해제, check_and_reset_fix_and_avoid_dealloc,
          │     oldest_unflush_lsa = NULL                            pb.c:8430-8439
          ├─ fetch_mode != NEW_PAGE:
          │     dwb_read_page → 실패 시 fileio_read                  pb.c:8456-8467
          │     IO 실패 → put_bcb_into_invalid_list + unlock_page(true)  pb.c:8469-8490
          │     TDE 페이지면 tde_decrypt_data_page (실패 시 동일 정리)  pb.c:8494-8507
          │     임시 볼륨이면 temp LSA 초기화 + dirty                  pb.c:8515-8523
          └─ fetch_mode == NEW_PAGE: 디스크 읽기 없이 LSA/prv 초기화   pb.c:8545-8578
        │
        buf_lock_acquired = true                                     pb.c:2378
        │
  ├─ pgbuf_bcb_register_fix (bufptr)                                 pb.c:2395
  ├─ pgbuf_set_bcb_page_vpid (bufptr)                                pb.c:2399
  ├─ pgbuf_check_bcb_page_vpid (bufptr, maybe_deallocated)            pb.c:2402
  │     실패 시: buf_lock_acquired면 put_bcb_into_invalid_list
  │              + pgbuf_unlock_page (…, true);  아니면 bcb unlock    pb.c:2404-2422
  ├─ OLD_PAGE_PREVENT_DEALLOC → register_avoid_deallocation           pb.c:2425-2428
  ├─ pgbuf_latch_bcb_upon_fix (…)   ← bcb mutex 해제됨                pb.c:2440
  │     실패 시: buf_lock_acquired면 bcb 재락 + invalid list
  │              + pgbuf_unlock_page (…, true)                       pb.c:2445-2459
  └─ buf_lock_acquired:                                              pb.c:2485-2495
        pgbuf_insert_into_hash_chain (hash_anchor, bufptr)
        #   → hash_mutex를 잡고 chain head에 push하되 ★해제하지 않는다★
        #     (pb.c:7819-7825 주석: 다음 pgbuf_unlock_page가 풀어준다)
        pgbuf_unlock_page (hash_anchor, vpid, need_hash_mutex = false)
        #   → chain에서 락 제거 + hash_mutex 해제 + 대기자 전원 기상
```

### 5.6 락 순서 규율

두 종류의 mutex(hash_mutex, bcb mutex)가 있으므로 순서가 중요합니다.

| 상황 | 규율 | 근거 |
|---|---|---|
| `pgbuf_search_hash_chain` 1단계 | hash_mutex 없이 chain 순회 + bcb **trylock** | pb.c:7557-7596 |
| `pgbuf_search_hash_chain` 2단계 | hash_mutex 보유 → bcb trylock. `EBUSY`면 **hash_mutex를 먼저 풀고** bcb mutex 블로킹 | pb.c:7632-7650 |
| bcb mutex를 잡은 뒤 | VPID 재확인. 불일치면 놓고 재시도 | pb.c:7586-7592, 7656-7661 |
| `pgbuf_insert_into_hash_chain` | 호출자가 bcb mutex를 **보유하지 않은** 상태에서 hash_mutex 획득 (pb.c:7805 주석) | pb.c:7805-7806 |
| `pgbuf_delete_from_hash_chain` | 호출자가 bcb mutex 보유 → hash_mutex 획득 (역순!) | pb.c:7854-7859 |
| `pgbuf_unlock_page` | 대기자 기상 **전에** hash_mutex 해제 | pb.c:8109-8116 |

`delete_from_hash_chain`은 bcb → hash 순으로 잡고, `search_hash_chain`은 hash → bcb 순으로 잡으므로 형식적으로는 역순입니다. 데드락이 안 나는 이유는 `search_hash_chain`이 hash_mutex를 든 채로는 **trylock만** 시도하고 실패하면 hash_mutex를 놓기 때문(pb.c:7646-7649)입니다. 즉 "hash_mutex 보유 중 bcb mutex 블로킹"이 발생하지 않습니다. 재구현 시 반드시 유지해야 하는 불변식입니다.

### 5.7 `pgbuf_lock_page`가 항상 `WAITER`를 반환하는 의미

락이 이미 걸려 있으면 이 함수는 **락을 물려받지 않고** 항상 `PGBUF_LOCK_WAITER`를 반환합니다(pb.c:8008, 8016). 호출자 체인은:

```
pgbuf_lock_page → WAITER
  → pgbuf_claim_bcb_for_fix: *try_again = true; return NULL   (pb.c:8398-8399)
    → pgbuf_fix_release: retry = false; goto try_again        (pb.c:2370-2374)
      → 인터럽트 체크(pb.c:2298-2306) → hash chain 재탐색(pb.c:2335)
        → 이제 홀더가 insert_into_hash_chain으로 넣은 bcb를 발견 → 히트 경로
```

이 구조의 장점: 락 인수인계(hand-off)를 구현하지 않아 소유권 추적이 필요 없고, 인터럽트 처리가 단순합니다(pb.c:2298-2306의 `logtb_is_interrupted` 체크를 매 재시도마다 통과). 단점: 홀더가 읽기에 실패해 bcb를 invalid list로 되돌린 경우, 대기자가 깨어나 hash를 뒤져도 못 찾고 **다시 락 홀더가 되어 자기가 읽기를 시도**합니다. 즉 IO 실패는 자연스럽게 다음 대기자에게 재시도가 넘어갑니다.

---

## 6. 부가 메커니즘

### 6.1 `pgbuf_rv_flush_page` (pb.c:14833-14860)

recovery 중 특정 변경을 **즉시 디스크에 반영**해야 할 때 쓰는 논리적 recovery 함수. recovery 중 재크래시에도 일관성을 유지하기 위한 것입니다(pb.c:14826-14827 주석).

```
assert (rcv->pgptr == NULL)                # 논리적 → 페이지를 미리 fix하지 않음  pb.c:14840
assert (rcv->length == sizeof (VPID))                                            pb.c:14841
VPID_COPY (&vpid_to_flush, (VPID *) rcv->data)

page = pgbuf_fix (&vpid_to_flush, OLD_PAGE_MAYBE_DEALLOCATED,
                  PGBUF_LATCH_WRITE, PGBUF_UNCONDITIONAL_LATCH)                  pb.c:14844
if page == NULL:
    er_clear ();  return NO_ERROR          # 페이지가 이미 없음 → 할 일 없음      pb.c:14846-14851

log_append_empty_record (LOG_DUMMY_GENERIC, &addr)
#   ↑ 로그를 하나 남기지 않으면 논리적 sysop 종료 시 "변경 없음"으로 항의함        pb.c:14853-14854
pgbuf_set_dirty (page, DONT_FREE)                                                pb.c:14855
pgbuf_flush (page, DONT_FREE)                                                    pb.c:14856
pgbuf_unfix (page)                                                               pb.c:14857
```

`pgbuf_rv_flush_page_dump`(pb.c:14870-14879)은 `"Page to flush: %d|%d."` 형식으로 덤프합니다.

### 6.2 `pgbuf_notify_vacuum_follows` (pb.c:16131-16138)

```
CAST_PGPTR_TO_BFPTR (bcb, page)
pgbuf_bcb_update_flags (thread_p, bcb, PGBUF_BCB_TO_VACUUM_FLAG, 0)
```

`PGBUF_BCB_TO_VACUUM_FLAG`(pb.c:239, `0x04000000`)는 "이 페이지가 곧 vacuum에 의해 접근될 것"이라는 힌트입니다.

| 소비 지점 | 동작 | 위치 |
|---|---|---|
| `pgbuf_lru_fall_bcb_to_zone_3` | `TO_VACUUM`이면 bcb mutex trylock 없이 fall-through(= direct victim 배정을 시도하지 않음). `PSTAT_PB_VICTIM_ASSIGN_DIRECT_ADJUST_TO_VACUUM` 카운트 | pb.c:10014-10021 |
| `pgbuf_victimize_bcb` | 플래그 제거 | pb.c:8610-8613 |
| `pgbuf_fix_release` | vacuum worker가 실제로 fix하면 플래그 제거 (역할 종료) | pb.c:2628-2631 |

즉 "vacuum이 곧 올 페이지는 성급히 direct victim으로 내주지 말라"는 힌트입니다. 생산자: `vacuum.c:6662`, `log_manager.c:2235`, `log_manager.c:2367`, `btree.c:28327`.

### 6.3 `pgbuf_mark_page_for_lru_bottom` (pb.c:16151-16158)

```
CAST_PGPTR_TO_BFPTR (bcb, page)
pgbuf_bcb_update_flags (thread_p, bcb, PGBUF_BCB_MOVE_TO_LRU_BOTTOM_FLAG, 0)
```

`pgbuf_dealloc_page`와 **동일한 메커니즘에서 dirty 플래그만 뺀 것**입니다(pb.c:16144-16145 주석). "다시 방문하지 않을 페이지를 working set을 오염시키지 않고 반납"하는 용도입니다.

전이: 다음 unfix에서 `fcnt == 0`이 되면 `pgbuf_unlatch_bcb_upon_unfix`(pb.c:6672-6675)가 `pgbuf_should_be_moved_to_bottom_lru`(pb.c:16118-16122)를 확인해 `pgbuf_move_bcb_to_bottom_lru`를 호출합니다. 그 함수가 먼저 플래그를 지우므로(pb.c:10375) **1회성**입니다.

주의: 이 분기는 `blocked_reader_writer == false` 검사보다 **앞**에 있습니다(pb.c:6672 vs 6676). 즉 대기자가 있어도 LRU 바닥 이동이 우선합니다.

유일한 외부 사용자는 통계 수집 샘플러(`optimizer/histogram/histogram_sampler_sr.cpp:858, 874, 936, 1350, 1366, 1433`)입니다. 그쪽 주석(histogram_sampler_sr.cpp:657)이 의도를 확인합니다.

---

## 7. 재구현 체크리스트

ordered fix 시스템을 재구현할 때 반드시 보존해야 하는 것들:

1. **전역 순서는 `(group_id, rank, vpid)` 단일 함수로만 정의** — `pgbuf_compare_hold_vpid_for_sort`(pb.c:12130). `group_id NULL`은 최후순위. rank가 vpid보다 **우선**해야 heap header/overflow 계층이 성립합니다.
2. **조건부 성공은 순서 위반을 허용** — 대기가 없으면 데드락이 없습니다(pb.c:12287-12341).
3. **`fix_count == watch_count` 불변식** — 위반하면 fix를 복원할 방법이 없으므로 `ER_FAILED_ASSERTION`으로 거부(pb.c:12454-12462, 13074-13083).
4. **unfix 전에 avoid-dealloc 마커** — pb.c:12639/13176에서 register, 재획득 성공 시 unregister(pb.c:12883/13288), 에러 경로에서도 exit에서 반드시 해제(pb.c:12972-12998, 13310-13333).
5. **unregister는 0에서 감소하지 않아야 한다** — victimize로 마커가 사라지는 정상 케이스가 존재(pb.c:16226-16250).
6. **`page_was_unfixed`는 복원 watcher에서 지우지 않는다** — `clear_unfix_flag = false`(pb.c:12926, 13301). 이것이 호출자 재검증 계약의 전달 수단입니다.
7. **`group_id` 미지 시 카탈로그 조회 전에 페이지를 놓는다** — `pgbuf_get_groupid_and_unfix(do_unfix=true)`(pb.c:13367-13371). 카탈로그 페이지와의 데드락 회피.
8. **VPID 재검증 패턴** — bcb mutex를 놓았다 다시 잡는 모든 지점에서 `VPID_ISNULL` + `VPID_EQ(&saved, &current)` + `fcnt` + `avoid_victim`을 재확인(pb.c:3404-3409, 3476-3481).
9. **hash_mutex를 든 채로 bcb mutex를 블로킹하지 않는다** — trylock 후 `EBUSY`면 hash_mutex를 먼저 놓는다(pb.c:7646-7650).
10. **`pgbuf_lock_page`는 소유권을 넘기지 않는다** — 항상 `WAITER`를 돌려주고 호출자가 hash chain을 재탐색한다(pb.c:8008/8016 → pb.c:2370-2374).
11. **dealloc = `ptype = PAGE_UNKNOWN` + `pflag = 0` + `DIRTY|MOVE_TO_LRU_BOTTOM`** — invalidate하지 않는다(pb.c:15159-15164와 설계 주석 pb.c:15129-15133).
12. **dealloc undo는 논리적이고 compensate 로그가 필요하다** — `OLD_PAGE_DEALLOCATED`로 직접 fix하고 `log_append_compensate_with_undo_nxlsa`로 멱등화(pb.c:15216, 15236-15238).

### 수정 후보 (본 분석에서 발견)

| # | 위치 | 내용 | 심각도 |
|---|---|---|---|
| 1 | pb.c:15255 + 15271 | `pgbuf_rv_dealloc_undo_compensate`가 초기화되지 않은 `VPID vpid`를 debug TDE 로그에서 읽음 | debug 빌드 한정, 로그 오염 |
| 2 | pb.c:12699-12704, 12847-12852 | `has_dealloc_prevent_flag` 경로가 register 없이 `unregister_avoid_deallocation` 호출 → 타 스레드의 마커를 감소시킬 수 있음 | 관찰 (미재현). vacuum이 보호 중인 페이지를 조기 해제 가능 |
| 3 | pb.c:2513-2517 + 7671-7734 | `pgbuf_lockfree_fix_ro` 빠른 경로가 register하지 않는데 `fast_path`에서 unregister 실행 | #2와 동일 성질 |
| 4 | pb.c:12302 | P4 루프가 매 반복 `ret_pgptr`을 덮어써, `assert_release(false)` 경로에서 엉뚱한 페이지를 unfix할 수 있음 | release 빌드에서 abort하므로 노출 제한 |
| 5 | pb.c:13789, 13798 | `pgbuf_get_condition_for_ordered_fix`가 `PGBUF_ORDERED_HEAP_OVERFLOW`를 표현 못 함 → `pgbuf_ordered_fix`의 순서와 불일치 가능 | 설계 제약 (문서화 필요) |
| 6 | pb.c:3368 | `pgbuf_invalidate`의 `fcnt > 1` 분기에 `"todo: is this really safe?"` 미해결 의문 | 기존 TODO |
| 7 | pb.c:8692 | `pgbuf_invalidate_bcb`의 `latch != NO_LATCH` 분기가 `assert(false)` + `"todo: what to do?"` | 기존 TODO |
