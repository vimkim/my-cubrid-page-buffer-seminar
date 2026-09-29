# CUBRID page_buffer.c — dirty 관리 / flush / WAL / 체크포인트 / 백그라운드 데몬 기술 노트

분석 대상: `/home/vimkim/gh/cb/pgbuf-analysis/src/storage/page_buffer.c` (17,535줄)
모든 라인 번호는 `page_buffer.c:N` 형식이며, 다른 파일은 파일명을 명시합니다.

---

## 0. 전체 구조 요약

flush 서브시스템은 네 개의 독립적인 진입점을 가지며, 모두 최종적으로 단일 함수 `pgbuf_bcb_flush_with_wal()` (`page_buffer.c:10673`)로 수렴합니다.

| 진입점 | 주 호출자 | 목적 | 경유 함수 |
|---|---|---|---|
| victim flush | `pgbuf_Page_flush_daemon` | 교체 후보(victim) 확보 | `pgbuf_flush_victim_candidates` (3821) |
| checkpoint flush | `logpb_checkpoint` | recovery redo 시작점 전진 | `pgbuf_flush_checkpoint` (4136) |
| 개별 동기 flush | 임의 워커 | 특정 페이지 디스크 반영 보장 | `pgbuf_bcb_safe_flush_*` (8711/8734/8767) |
| 전량 flush | 볼륨 백업/복사/종료 | 볼륨 전체 정리 | `pgbuf_flush_all_helper` (3614) |

핵심 상태는 BCB의 `volatile int flags` 한 필드에 비트로 packing되어 있고 (`page_buffer.c:521`), 여기에 dirty·flushing·direct victim·async flush 요청·zone·LRU index가 모두 들어갑니다. 따라서 모든 상태 변경은 CAS 루프를 통과합니다 (`pgbuf_bcb_update_flags`, 15729).

WAL 관련 상태는 BCB의 `oldest_unflush_lsa` (`page_buffer.c:543`) 하나이며, "이 페이지의 아직 디스크에 반영되지 않은 변경 중 가장 오래된 것의 LSA"를 의미합니다.

---

## 1. dirty 페이지 생애주기 상태 전이

### 1.1 플래그 정의와 victim 후보 무효화 마스크

```
PGBUF_BCB_DIRTY_FLAG                    0x80000000   page_buffer.c:224
PGBUF_BCB_FLUSHING_TO_DISK_FLAG         0x40000000   page_buffer.c:227
PGBUF_BCB_VICTIM_DIRECT_FLAG            0x20000000   page_buffer.c:234
PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG 0x10000000   page_buffer.c:235
PGBUF_BCB_MOVE_TO_LRU_BOTTOM_FLAG       0x08000000   page_buffer.c:237
PGBUF_BCB_TO_VACUUM_FLAG                0x04000000   page_buffer.c:239
PGBUF_BCB_ASYNC_FLUSH_REQ               0x02000000   page_buffer.c:241
```

victim 후보 자격을 무효화하는 마스크는 `page_buffer.c:258-262`:

```c
#define PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK \
  (PGBUF_BCB_DIRTY_FLAG | PGBUF_BCB_FLUSHING_TO_DISK_FLAG
   | PGBUF_BCB_VICTIM_DIRECT_FLAG | PGBUF_BCB_INVALIDATE_DIRECT_VICTIM_FLAG)
```

주의할 설계 포인트: **`FLUSHING_TO_DISK`도 후보 무효화 플래그**입니다. 즉 flush 시작 시 `DIRTY`를 내리고 `FLUSHING`을 올리므로 (동시 CAS), LRU list의 `count_vict_cand` 카운터는 **변하지 않습니다**. flush가 성공적으로 끝나 `FLUSHING`이 내려가는 순간에만 후보 수가 +1 됩니다. 이 규칙 덕분에 "flush 중인 페이지를 victim으로 뽑아서 내용이 반쯤 쓰인 페이지를 재사용"하는 사고가 구조적으로 차단됩니다 (`page_buffer.c:253-257` 주석).

### 1.2 상태 전이도

```
                     ┌────────────────────────────────────────────────────────┐
                     │                                                        │
  [CLEAN / zone3]    │  pgbuf_bcb_set_dirty (15970)                           │
  vict_cand = yes ───┼──────────────────────────────────► [DIRTY]             │
        ▲            │  · dirties_cnt++            (15989)  vict_cand = no    │
        │            │  · lru_remove_victim_candidate(15995)      │           │
        │            │  · oldest_unflush_lsa 는 pgbuf_set_lsa 가   │           │
        │            │    최초 1회만 기록 (4998-5022)             │           │
        │            └────────────────────────────────────────────┼───────────┘
        │                                                         │
        │                             pgbuf_bcb_mark_is_flushing (16021)
        │                             set FLUSHING, clear DIRTY|ASYNC_FLUSH_REQ
        │                             (후보 수 변화 없음: 둘 다 무효화 플래그)
        │                                                         ▼
        │                                                  [FLUSHING_TO_DISK]
        │                                                  vict_cand = no
        │                                                         │
        │                                        ┌────────────────┴──────────────────┐
        │                                        │                                   │
        │                          write 성공                                write 실패
        │                                        │                                   │
        │            ┌───────────────────────────┴────────────┐                      ▼
        │            │                                        │      pgbuf_bcb_mark_was_not_flushed(16058)
        │      (a) post-flush 큐 경로                   (b) 즉시 경로       set DIRTY(was_dirty), clear FLUSHING
        │      flushed_bcbs->produce(bufptr)      PGBUF_BCB_LOCK            oldest_unflush_lsa 복원 (10853)
        │      (10870), FLUSHING 유지             mark_was_flushed          → [DIRTY] 로 되돌림
        │            │                            (10884)                           │
        │            ▼                                  │                           │
        │   pgbuf_assign_flushed_pages (15434)           │                           │
        │   ┌───────────────────────────────┐            │                           │
        │   │ 조건 검사 (15450-15466):       │            │                           │
        │   │  · invalidate_flag 있으면 skip │            │                           │
        │   │  · fixed 이면 skip            │            │                           │
        │   │  · zone3 아니면 skip          │            │                           │
        │   │  · private & 쿼터 미달이면 skip│            │                           │
        │   └──────────────┬────────────────┘            │                           │
        │                  │ 통과                        │                           │
        │                  ▼                             │                           │
        │      pgbuf_assign_direct_victim (15367)         │                           │
        │      set VICTIM_DIRECT, clear FLUSHING (15407)  │                           │
        │      bcb_victims[waiter->index] = bcb (15409)   │                           │
        │                  │                             │                           │
        │                  ▼                             ▼                           │
        │        [VICTIM_DIRECT]                  mark_was_flushed (15483)            │
        │        대기 스레드가 pgbuf_get_direct_victim   clear FLUSHING                │
        │        으로 수령 → pgbuf_victimize_bcb (8589)  → vict_cand = yes ────────────┘
        │                  │                             (zone3 이고 다른 무효화 플래그 없을 때)
        │                  ▼                                    │
        │           hash chain 제거, latch=INVALID               │
        │           새 VPID 로 재사용                            │
        └───────────────────────────────────────────────────────┘
```

`pgbuf_bcb_update_flags` (15729)가 이 전이의 부수효과를 일괄 처리합니다:
- CAS 루프로 flags 갱신 (15741-15753), 변화 없으면 조기 반환 (15747-15751)
- zone3인 경우 무효화 마스크 진입/탈출을 감지해 `pgbuf_lru_add_victim_candidate` / `pgbuf_lru_remove_victim_candidate` 호출 (15755-15779)
- dirty 비트 전이를 감지해 `pgbuf_Pool.monitor.dirties_cnt`를 ±1 (15781-15793)

`pgbuf_bcb_set_dirty` (15970)만 예외적으로 `update_flags`를 쓰지 않고 자체 CAS 루프를 씁니다 — "가장 빈번한 경로이므로 최적화" (15973-15974 주석). 이미 dirty면 CAS 없이 반환 (15980-15984).

### 1.3 dirty 마킹 진입점

`pgbuf_set_dirty` (4876, debug판 4872) → `pgbuf_set_dirty_buffer_ptr` (11595) → `pgbuf_bcb_set_dirty` (11601). `pgbuf_set_dirty_buffer_ptr`는 dirty 마킹 외에 holder의 `perf_stat.dirtied_by_holder`를 세우고 (11606-11609) `PSTAT_PB_NUM_DIRTIES`를 증가시킵니다 (11612). WRITE latch 보유를 assert합니다 (11604).

`pgbuf_set_dirty_buffer_ptr`의 다른 호출 지점:
- `pgbuf_set_lsa` 내 release 빌드 경로 (5029) — "dirty를 빠뜨린 케이스를 릴리스에서 보정" (5025-5028 주석)
- `pgbuf_set_lsa_as_temporary` (5380)
- `pgbuf_claim_bcb_for_fix`에서 temp 볼륨 페이지를 처음 읽었을 때 (8521)

### 1.4 `oldest_unflush_lsa` 관리

이 필드는 `pgbuf_set_lsa` (4947)에서만 **최초 1회** 기록됩니다 (4998-5022):

```c
if (LSA_ISNULL (&bufptr->oldest_unflush_lsa))
  {
    /* chkpt_redo_lsa 보다 과거 LSA 로 dirty 되는 것은 recovery 불가 → 검증 */
    if (LSA_LT (lsa_ptr, &log_Gl.chkpt_redo_lsa)) { ... ER_LOG_CHECKPOINT_SKIP_INVALID_PAGE ... assert(false); }
    LSA_COPY (&bufptr->oldest_unflush_lsa, lsa_ptr);
  }
```

`pgbuf_set_lsa`의 주석(4992-4997)이 왜 dirty 마킹 시점이 아니라 LSA 설정 시점에 기록하는지 설명합니다: 일부 페이지는 LSA가 설정되기 전에 dirty로 마킹되기 때문입니다.

`oldest_unflush_lsa`가 NULL로 되는 지점:
- `pgbuf_initialize_bcb_table` 초기화 (5590)
- `pgbuf_claim_bcb_for_fix`에서 BCB를 새 VPID에 배정할 때 (8439)
- `pgbuf_invalidate_bcb` (8662) — `pgbuf_bcb_clear_dirty` (8660)와 함께
- `pgbuf_bcb_flush_with_wal` (10779) — flush 직전에 지역 변수로 저장하고 NULL로 밀어냄. write 실패 시 복원 (10853)

불변식은 `NDEBUG`가 아닌 빌드에서 두 곳에서 assert됩니다: `pgbuf_fix_release` (2353), `pgbuf_unlatch_bcb_upon_unfix` (6666-6667) — "`oldest_unflush_lsa`가 설정되어 있으면 dirty도 설정되어 있어야 한다".

### 1.5 temp 페이지의 WAL 제외 메커니즘

temp 페이지는 recovery 대상이 아니므로 WAL 규칙에서 제외됩니다. 구현은 "특수 LSA 값" 방식입니다:

```c
/* page_buffer.h:260 */
const log_lsa PGBUF_TEMP_LSA = { NULL_LOG_PAGEID - 1, NULL_LOG_OFFSET - 1 };   /* = (-2, -2) */
```

- `pgbuf_is_temp_lsa` (17261): `lsa == PGBUF_TEMP_LSA`
- `pgbuf_init_temp_page_lsa` (17267): `iopage->prv.lsa`와 페이지 말미의 watermark(`fileio_get_page_watermark_pos`) 양쪽에 TEMP_LSA를 심음 — 두 위치를 함께 갱신하는 것이 중요 (torn-page 검출용 watermark와의 일관성)
- `pgbuf_reset_temp_lsa` (5041): 공개 API, `pgbuf_init_temp_page_lsa` 래퍼
- `pgbuf_set_lsa_as_temporary` (5372): TEMP_LSA 설정 + dirty 마킹
- `pgbuf_is_lsa_temporary` (5471): TEMP_LSA이거나 temp 볼륨이면 true

`pgbuf_set_lsa`의 방어 로직 (4967-4988):
1. 이미 TEMP_LSA이거나 auxiliary 볼륨이면 **LSA 변경 자체를 거부**하고 NULL 반환 (4971-4975)
2. temp 볼륨인데 LSA가 어떤 이유로 바뀌었으면 TEMP_LSA로 되돌리고, 현재 트랜잭션이 active면 NULL 반환 (4981-4988)

결과적으로 temp 페이지는 `oldest_unflush_lsa`가 영원히 NULL로 남고, `pgbuf_bcb_flush_with_wal`의 WAL 강제 블록(10784-10789)을 건너뜁니다. 또한:
- `uses_dwb = dwb_is_created () && !is_temp` (10743) — temp 페이지는 DWB를 쓰지 않음
- `pgbuf_flush_checkpoint`는 temp 볼륨 페이지를 flush 목록에서 아예 배제 (4204)
- `tde_encrypt_data_page`에 `is_temp`를 전달 (10751) — temp 페이지는 별도 nonce 처리

---

## 2. `pgbuf_bcb_flush_with_wal` 의사코드

`page_buffer.c:10673-10900`. 전체 flush 경로의 단일 관문입니다. 진입 전제: **호출자가 bcb mutex를 보유**, latch mode는 `PGBUF_NO_LATCH`/`READ`/`WRITE` 중 하나 (10698-10699). WRITE latch인 경우 디버그 빌드에서 "내가 그 holder인지"를 holder 리스트를 순회해 검증합니다 (10700-10719) — 남의 WRITE latch 하에서 flush하면 반쯤 수정된 페이지를 쓰게 되므로.

```
pgbuf_bcb_flush_with_wal (thread_p, bufptr, is_page_flush_thread, OUT is_bcb_locked):

  # ── 진입: bcb mutex 보유 ──
  char page_buf[IO_MAX_PAGE_SIZE + MAX_ALIGNMENT]   # 스택 상의 복사 버퍼 (10675)
  is_temp = pgbuf_is_temporary_volume (bufptr->vpid.volid)                  # 10688
  *is_bcb_locked = true                                                     # 10696

  if pgbuf_check_bcb_page_vpid (bufptr, false) != true:                      # 10735
      assert(false); return ER_FAILED        # bcb 헤더의 VPID 와 iopage 헤더 불일치

  was_dirty = pgbuf_bcb_mark_is_flushing (bufptr)                            # 10741
      # set FLUSHING, clear DIRTY|ASYNC_FLUSH_REQ. 반환값 = 직전 dirty 여부.
      # 이 시점 이후 다른 스레드가 페이지를 수정하면 DIRTY 가 다시 올라가고,
      # 그 변경은 "이번 write 에 포함되지 않은 변경" 으로 정확히 추적된다.

  uses_dwb = dwb_is_created () && !is_temp                                   # 10743

start_copy_page:                                                            # 10745
  iopage = PTR_ALIGN (page_buf, MAX_ALIGNMENT)
  tde_algo = pgbuf_get_tde_algorithm (pgptr)                                 # 10748
  if tde_algo != NONE:
      tde_encrypt_data_page (&bcb->iopage, tde_algo, is_temp, iopage)        # 10751
          # 실패 시 return error  ← ⚠ FLUSHING 플래그 미복구 (§9.1 참조)
  else:
      memcpy (iopage, &bcb->iopage_buffer->iopage, IO_PAGESIZE)              # 10760
      # ★ 스냅샷 지점: 이후 페이지 수정은 이번 write 에 반영되지 않는다.
      #   mutex 를 아직 들고 있으므로 복사는 원자적이다.

  if uses_dwb:
      dwb_set_data_on_next_slot (thread_p, iopage, false, false, &dwb_slot)  # 10764
      if dwb_slot != NULL:
          iopage = NULL          # 데이터는 이미 DWB 슬롯에 복사됨
          goto copy_unflushed_lsa

copy_unflushed_lsa:                                                         # 10776
  lsa                = bcb->iopage_buffer->iopage.prv.lsa                    # 10777 (페이지 LSA)
  oldest_unflush_lsa = bcb->oldest_unflush_lsa                               # 10778 (지역 저장)
  bcb->oldest_unflush_lsa = NULL                                             # 10779

  PGBUF_BCB_UNLOCK (bufptr);  *is_bcb_locked = false                         # 10781-10782
  # ── 여기서부터 bcb mutex 없음. 긴 I/O 구간을 mutex 밖에서 수행 ──

  # ★★ WAL RULE 준수 지점 ★★
  if !LSA_ISNULL (oldest_unflush_lsa):                                       # 10784
      logpb_flush_log_for_wal (thread_p, &lsa)                               # 10788
      # 페이지 LSA 까지의 로그가 디스크에 있음을 보장. 내부적으로
      # logpb_need_wal(lsa) 재확인 → LOG_CS_ENTER → logpb_flush_pages_direct
      # (log_page_buffer.c:4162-4189). double-check 패턴으로 불필요한 CS 진입 회피.
  else:
      # 로그 없이 변경된 페이지 (드물지만 발생). temp 볼륨이 아니면 debug 로그.
      er_log_debug ("flushing page %d|%d to disk without logging")            # 10795

  # ── 실제 write ──
  if uses_dwb:
      dwb_add_page (thread_p, iopage, &bufptr->vpid, false, &dwb_slot)       # 10813
      if error == NO_ERROR && dwb_slot == NULL:
          # 도중에 DWB 가 비활성화됨 → mutex 재획득 후 non-DWB 경로로 재시도
          uses_dwb = false
          PGBUF_BCB_LOCK (bufptr); *is_bcb_locked = true                     # 10820-10821
          goto start_copy_page                                               # 10822
  else:
      show_status->num_pages_written++                                        # 10828
      write_mode = dwb_is_created () ? FILEIO_WRITE_NO_COMPENSATE_WRITE
                                     : FILEIO_WRITE_DEFAULT_WRITE            # 10831
      perfmon_inc_stat (PSTAT_PB_NUM_IOWRITES)                                # 10833
      if fileio_write (vol_fd, iopage, pageid, IO_PAGESIZE, write_mode) == NULL:
          error = ER_FAILED                                                   # 10837

  # ── 실패 처리: "revert" ──
  if error != NO_ERROR:                                                       # 10848
      PGBUF_BCB_LOCK (bufptr); *is_bcb_locked = true
      pgbuf_bcb_mark_was_not_flushed (bufptr, was_dirty)                      # 10852
          # set DIRTY (was_dirty 였다면), clear FLUSHING
      bcb->oldest_unflush_lsa = oldest_unflush_lsa      # 복원               # 10853
      if bcb->next_wait_thrd != NULL: pgbuf_wake_flush_waiters (bcb)          # 10858
      return ER_FAILED

  assert (get_latch (&bcb->atomic_latch) != PGBUF_LATCH_FLUSH)                # 10865

  # ── 성공 처리: 두 갈래 ──
  if is_page_flush_thread                                                     # 10869
     && pgbuf_Page_post_flush_daemon != NULL
     && pgbuf_is_any_thread_waiting_for_direct_victim ()
     && pgbuf_Pool.flushed_bcbs->produce (bufptr):
      # (a) 부하 이관 경로: post-flush 데몬이 직접 victim 배정까지 담당.
      #     FLUSHING 플래그는 여기서 내리지 않고 유지 → post-flush 가 내린다.
      #     bcb mutex 를 다시 잡지 않으므로 flush thread 는 즉시 다음 페이지로.
      pgbuf_Page_post_flush_daemon->wakeup ()                                  # 10873
      perfmon_inc_stat (PSTAT_PB_FLUSH_SEND_DIRTY_TO_POST_FLUSH)               # 10876
      # *is_bcb_locked 는 false 로 유지
  else:
      # (b) 즉시 경로
      PGBUF_BCB_LOCK (bufptr); *is_bcb_locked = true                           # 10882-10883
      pgbuf_bcb_mark_was_flushed (bufptr)      # clear FLUSHING → victim 후보  # 10884
      if bcb->next_wait_thrd != NULL: pgbuf_wake_flush_waiters (bcb)           # 10889

  perfmon_inc_stat (PSTAT_PB_FLUSH_PAGE_FLUSHED)                               # 10896
  return NO_ERROR
```

### 2.1 `is_page_flush_thread` 분기의 의미

`true`로 넘어오는 호출자는 세 곳뿐입니다:
- `pgbuf_flush_victim_candidates` (4039)
- `pgbuf_flush_neighbor_safe` (12108) — neighbor flush 역시 flush 데몬에서만 호출
- (`pgbuf_bcb_safe_flush_internal`은 `false`를 넘김, 8825)

`true`일 때만 `flushed_bcbs` 큐로 우회할 수 있고, 조건이 하나 더 붙습니다: `pgbuf_is_any_thread_waiting_for_direct_victim()`. 즉 victim을 기다리는 스레드가 실제로 있을 때만 post-flush로 넘깁니다. 대기자가 없다면 큐를 경유하는 오버헤드가 낭비이므로 즉시 경로 (b)를 씁니다. `flushed_bcbs->produce()`가 실패(큐 만석)해도 (b)로 fallthrough하므로 안전합니다.

### 2.2 checksum / TDE / 암호화

`page_buffer.c` 안에는 **checksum 계산 코드가 없습니다**. 페이지 무결성 검증은 `fileio_write`/`dwb_add_page` 하위 계층과 페이지 말미 watermark(`prv2->lsa`, `pgbuf_init_temp_page_lsa` 17271-17272 참조) 비교로 처리됩니다. page buffer 계층이 담당하는 것은 TDE 암호화뿐입니다:
- flush 시 암호화: `tde_encrypt_data_page` (10751) — 평문 원본은 buffer에 남고, 암호문은 스택 복사본 `iopage`에만 존재
- fix 시 복호화: `tde_decrypt_data_page` (8497-8499), in-place
- 알고리즘은 페이지 헤더의 `prv.pflag`에 저장되며 `pgbuf_set_tde_algorithm` (5057) / `pgbuf_get_tde_algorithm` (5130)로 접근. 알고리즘 변경 자체가 로깅됩니다 (5079) — recovery 시 `pgbuf_rv_set_tde_algorithm` (5110)

### 2.3 flush 중 latch 상태

flush는 latch를 취득하지 **않습니다**. `PGBUF_LATCH_FLUSH`는 latch mode가 아니라 "flush 완료를 기다리는 대기 상태"를 나타내는 의사 모드입니다 (`page_buffer.c:7425-7426` 주석). `pgbuf_bcb_flush_with_wal`은:
- 진입 시 latch가 `NO_LATCH`/`READ`/`WRITE(자기 소유)`임을 assert (10698)
- 페이지 복사 구간에서만 bcb mutex를 보유하고, I/O 구간에서는 mutex도 해제
- 완료 시 `get_latch() != PGBUF_LATCH_FLUSH`를 assert (10865)

동시성 안전성의 근거는 latch가 아니라 `FLUSHING_TO_DISK` 플래그입니다. `pgbuf_bcb_safe_flush_internal`이 이 플래그를 보고 중복 flush를 차단하고 (8802-8817), `pgbuf_flush_victim_candidates`도 `pgbuf_bcb_is_flushing`으로 skip합니다 (3999).

### 2.4 `PGBUF_BCB_ASYNC_FLUSH_REQ` 처리

WRITE latch를 잡은 스레드가 있으면 flush를 즉시 수행할 수 없습니다. 이때 flush 요청자는 `ASYNC_FLUSH_REQ` 플래그만 세우고 물러납니다 (`pgbuf_bcb_safe_flush_internal`, 8831). 이후:

- **unfix 시 처리**: `pgbuf_unlatch_bcb_upon_unfix` 말미 (6811-6827)에서 플래그를 확인해 `pgbuf_bcb_safe_flush_force_unlock(..., synchronous=false)`를 호출. flush 실패 시 에러를 삼킵니다 (6822-6826).
- **영구 latch 페이지의 자발적 처리**: `pgbuf_flush_if_requested` (3580). 체크포인트 등이 요청한 flush를 latch를 계속 들고 있는 스레드가 주기적으로 확인해 처리하는 용도. WRITE latch 보유를 assert (3599).
- **소비**: `pgbuf_bcb_mark_is_flushing`이 `FLUSHING`을 세울 때 `ASYNC_FLUSH_REQ`를 함께 클리어 (16027, 16032).
- **BCB 재사용 시 클리어**: `pgbuf_claim_bcb_for_fix` (8437) — 코드에 `/* todo: why this?? */` 주석이 달려 있습니다.
- **대기자 wakeup 억제**: `pgbuf_wakeup_reader_writer`는 `PGBUF_LATCH_FLUSH` 대기자를 만나면 깨우지 않고 리스트에 남겨두며, `ASYNC_FLUSH_REQ || FLUSHING` 중 하나는 반드시 참임을 assert합니다 (7451-7459).

### 2.5 `pgbuf_wake_flush_waiters`

`page_buffer.c:10910-10959`. bcb mutex 보유 하에서 대기 리스트를 순회해 `request_latch_mode == PGBUF_LATCH_FLUSH`인 항목만 dequeue + `pgbuf_wakeup_uncond` (10922-10945). READ/WRITE 대기자는 건드리지 않습니다.

마지막에 atomic latch의 `waiter_exists` 비트를 정합화하는 로직이 있습니다 (10946-10955). 주석이 상세한데, 요지는: FLUSH 대기자를 모두 뺀 뒤 남은 reader/writer 대기자가 없으면 `waiter_exists`를 반드시 false로 내려야 한다는 것입니다. 그러지 않으면 `pgbuf_latch_bcb_upon_fix`의 idle-grant CAS가 `waiter_exists == false`를 강제 기대하는데 `latch_mode == PGBUF_NO_LATCH`에서는 enqueue도 하지 않아, 다음 fix가 bcb mutex를 들고 영구 스핀합니다 (bulk-build CREATE INDEX livelock). `pgbuf_block_bcb`의 인터럽트 경로에도 동일한 정합화가 있습니다 (7077-7082).

---

## 3. `pgbuf_flush_victim_candidates` 전체 알고리즘

`page_buffer.c:3821-4121`.

### 3.1 flush 목표량 계산

```
lru_victim_req_cnt = ATOMIC_TAS_32 (&monitor.lru_victim_req_cnt, 0)       # 3889 (읽고 0으로 리셋)
fix_req_cnt        = pgbuf_monitor_sum_fix_req (true)                     # 3890 (per-thread 샤드 합산 후 리셋)

lru_miss_rate = (fix_req_cnt > lru_victim_req_cnt)
                ? (float) lru_victim_req_cnt / fix_req_cnt : 0            # 3892-3900

cfg_check_cnt = num_buffers * flush_ratio                                 # 3902
                # flush_ratio = PRM_ID_PB_BUFFER_FLUSH_RATIO (데몬이 전달, 16999)

if !is_checkpoint:                                                        # 3909
    lru_dynamic_flush_adj = MAX (1.0, 1 + (PGBUF_FLUSH_VICTIM_BOOST_MULT - 1) * lru_miss_rate)
    lru_dynamic_flush_adj = MIN (PGBUF_FLUSH_VICTIM_BOOST_MULT, lru_dynamic_flush_adj)
else:
    lru_dynamic_flush_adj = 1.0        # 체크포인트 중엔 boost 금지

check_count_lru = cfg_check_cnt * lru_dynamic_flush_adj                   # 3920
check_count_lru = MIN (check_count_lru, (200 MB) / DB_PAGESIZE)            # 3922
```

`PGBUF_FLUSH_VICTIM_BOOST_MULT = 10` (`page_buffer.c:307`). miss rate가 0이면 배수 1, miss rate가 1이면 배수 10. 체크포인트 중 boost를 끄는 이유는 3907-3909 주석에 있습니다: 체크포인트가 이미 페이지를 쓰고 있으므로 victim 후보 중 상당수가 이미 flush되었을 것이라 예상되기 때문입니다.

### 3.2 `pgbuf_compute_lru_vict_target` — LRU별 우선순위

`page_buffer.c:14065-14187`. 결과는 `pgbuf_Pool.quota.lru_victim_flush_priority_per_lru[]` (`page_buffer.c:723`)에 기록되고 합계가 out 파라미터로 반환됩니다.

```
prv_quota      = quota.private_pages_ratio                                # 14086
prv_real_ratio = 1.0 - (monitor.lru_shared_pgs_cnt / num_buffers)         # 14090
diff           = prv_quota - prv_real_ratio                               # 14091
prv_flush_ratio = MIN (1.0, prv_real_ratio * (1.0 - diff))                # 14093-14094
      # private 실제 점유율이 쿼터보다 크면 (diff<0) 1-diff>1 → private flush 가중,
      # 반대면 감쇠. 즉 쿼터 초과 private 리스트를 우선 회수.

# private 리스트별 목표: 쿼터의 90% 를 넘는 분량, 단 zone3 크기로 상한
for each private lru:                                                     # 14096-14110
    this_prv_target = PGBUF_LRU_LIST_COUNT(lru) - (int)(lru->quota * 0.9)
    this_prv_target = MIN (this_prv_target, lru->count_lru3)
    if > 0: total_prv_target += this_prv_target

if total_prv_target == 0:                                                 # 14111
    # shared 에서도 victim 을 못 뽑는 상황인지 확인
    if lru_shared_pgs_cnt <= num_LRU_list * PGBUF_MIN_SHARED_LIST_ADJUST_SIZE * (ratio_lru1+ratio_lru2):
        if invalid_cnt > 0: return          # invalid list 에서 할당 가능 → flush 불필요  # 14124-14131
        assert (false)                       # 계산상 도달 불가로 간주               # 14133
        use_prv_size = true; prv_flush_ratio = 1.0                                    # 14134-14135
        total_prv_target = (num_buffers - shared_cnt) * (1 - 2*PGBUF_LRU_ZONE_MIN_RATIO)

shared_flush_ratio = 1.0 - prv_flush_ratio                                # 14142

for i in all LRU lists:                                                   # 14144-14186
    if shared:  priority[i] = shared_flush_ratio / PGBUF_SHARED_LRU_COUNT
    elif private:
        priority[i] = (prv_flush_ratio == 0) ? 0
                    : prv_flush_ratio * (this_prv_target / total_prv_target)
    else:       priority[i] = 0        # garbage LRU
    *lru_sum_flush_priority += priority[i]
```

주석 14100-14103이 설계 의도를 밝힙니다: 쿼터 초과 리스트만 겨냥하면 "쿼터와 리스트 크기가 같은데 shared는 최소 크기 미달"인 상황에서 flush가 아무것도 찾지 못하는 병리적 케이스가 생기므로, 쿼터의 90%부터 목표에 포함시킵니다.

### 3.3 후보 수집 — `pgbuf_get_victim_candidates_from_lru`

`page_buffer.c:3740-3809`.

```
for lru_idx in 0 .. PGBUF_TOTAL_LRU_COUNT-1:
    prio = quota.lru_victim_flush_priority_per_lru[lru_idx]
    if prio <= 0: continue                                                # 3758-3763

    check_count_this_lru = MAX (1, prio * check_count / lru_sum_flush_priority)   # 3766-3767

    pthread_mutex_lock (&buf_LRU_list[lru_idx].mutex)                      # 3771
    for bufptr = lru->bottom;                                             # 3773
        bufptr != NULL && PGBUF_IS_BCB_IN_LRU_VICTIM_ZONE (bufptr) && i > 0;
        bufptr = bufptr->prev_BCB, i--:
        if pgbuf_bcb_is_dirty (bufptr):
            victim_cand_list[n].bufptr = bufptr                           # 3779
            victim_cand_list[n].vpid   = bufptr->vpid                     # 3780
            n++
        elif try_direct_assign && 대기자 있음 && victimizable && TRYLOCK 성공:
            # 드문 케이스 보정: victim 이 충분한데도 대기자가 생긴 상황.
            # iteration 당 최대 1개만 직접 배정 (3749-3751 주석)
            pgbuf_assign_direct_victim (bufptr)                           # 3787
            try_direct_assign = false
            perfmon_inc_stat (PSTAT_PB_VICTIM_ASSIGN_DIRECT_SEARCH_FOR_FLUSH)  # 3792
    pthread_mutex_unlock (&buf_LRU_list[lru_idx].mutex)
return n
```

`PGBUF_IS_BCB_IN_LRU_VICTIM_ZONE(bcb)` = `pgbuf_bcb_get_zone(bcb) == PGBUF_LRU_3_ZONE` (`page_buffer.c:1002`). 즉 zone3만 스캔하며, bottom부터 위로 올라가다 zone3을 벗어나면 즉시 중단합니다.

이 루프는 **LRU mutex만** 보유하고 bcb mutex는 잡지 않습니다. 따라서 저장한 `vpid`는 그 순간의 스냅샷이며, 실제 flush 직전에 `VPID_EQ` 재검증이 필수입니다 (3998).

### 3.4 flush 실행 루프

```
pgbuf_flush_victim_candidates (thread_p, flush_ratio, perf_tracker, OUT stop):

  *stop = false
  pgbuf_compute_lru_vict_target (&lru_sum_flush_priority)                 # 3881
  ... check_count_lru 계산 (§3.1) ...

  if check_count_lru > 0 && lru_sum_flush_priority > 0:
      victim_count = pgbuf_get_victim_candidates_from_lru (...)           # 3931-3932

  if victim_count == 0:                                                   # 3934
      PERF_UTIME_TRACKER_TIME_AND_RESTART (PSTAT_PB_FLUSH_COLLECT)
      *stop = (check_count_lru > 0 && lru_sum_flush_priority > 0)          # 3940
          # 목표는 있었는데 후보가 없다 = 이미 충분히 flush 했다.
          # victim 탐색 스레드에게 기회를 주기 위해 루프 중단 힌트.
      goto end

  # 로그를 미리 밀어둔다 (WAL 선행)
  if log_is_log_flush_daemon_available (): log_wakeup_log_flush_daemon ()  # 3946-3949
  else:                                    logpb_force_flush_pages ()      # 3953

  if PRM_ID_PB_SEQUENTIAL_VICTIM_FLUSH:                                   # 3956
      qsort (victim_cand_list, victim_count, pgbuf_compare_victim_list)    # 3958
      # (volid, pageid) 오름차순 → 순차 I/O 유도 (pgbuf_compare_victim_list, 3712)

  pgbuf_Pool.is_flushing_victims = true                                    # 3962
      # 체크포인트가 이 플래그를 보고 대기한다 (4334)

repeat:                                                                   # 3982
  count_need_wal = 0
  for i in 0 .. victim_count-1:
      bufptr = victim_cand_list[i].bufptr
      PGBUF_BCB_LOCK (bufptr)                                             # 3994

      # (1) VPID 변경 / 이미 clean / 이미 flush 중
      if !VPID_EQ(bufptr->vpid, cand[i].vpid) || !is_dirty || is_flushing: # 3998-3999
          UNLOCK; ++num_skipped_already_flushed; continue

      # (2) fix 되었거나 hot 해짐 (zone3 이탈)
      if !PGBUF_IS_BCB_IN_LRU_VICTIM_ZONE || pgbuf_is_bcb_fixed_by_any:    # 4007
          UNLOCK; ++num_skipped_fixed_or_hot; continue

      # (3) ★ WAL 미충족 → 이번 회차 skip (동기 로그 flush 를 피한다)
      if logpb_need_wal (&bufptr->iopage.prv.lsa):                         # 4015
          count_need_wal++
          lsa_need_wal = MAX (lsa_need_wal, page LSA)                      # 4020-4023
          UNLOCK; ++num_skipped_need_wal
          log_wakeup_log_flush_daemon ()                                   # 4027
          continue

      # (4) flush 실행
      if PGBUF_NEIGHBOR_PAGES > 1:                                        # 4032
          pgbuf_flush_page_and_neighbors_fb (bufptr, &flushed_pages)       # 4034
          # 이 함수가 bcb mutex 를 해제한다
      else:
          pgbuf_bcb_flush_with_wal (bufptr, is_page_flush_thread=true, &is_bcb_locked)  # 4039
          if is_bcb_locked: UNLOCK
          flushed_pages = 1
      if error: goto end                                                   # 4046-4054
      total_flushed_count += flushed_pages

  ... perf 통계 기록 (4058-4078) ...

end:                                                                      # 4080
  # 모든 후보가 WAL 미충족으로 skip 되었고 대기자가 있으면 → 로그를 강제로 밀고 1회 재시도
  if pgbuf_is_any_thread_waiting_for_direct_victim ()
     && victim_count != 0 && count_need_wal == victim_count:               # 4083
      if repeated:
          assert (LSA_LT (&save_lsa_need_wal, &lsa_need_wal))              # 4090
      else:
          repeated = true; save_lsa_need_wal = lsa_need_wal
          logpb_flush_log_for_wal (thread_p, &lsa_need_wal)                # 4096
          goto repeat                                                      # 4097

  pgbuf_Pool.is_flushing_victims = false                                   # 4101
  er_set (ER_NOTIFICATION_SEVERITY, ER_LOG_FLUSH_VICTIM_FINISHED, ...)     # 4116
  perfmon_add_stat (PSTAT_PB_NUM_FLUSHED, total_flushed_count)             # 4118
  return error
```

WAL 처리 전략이 두 층입니다. 정상 경로는 **로그 flush 데몬을 깨우고 skip** — 페이지 flush 데몬이 로그 I/O를 동기 대기하는 것을 피합니다. 모든 후보가 WAL 때문에 막혔고 victim 대기자가 있는 극단적 상황에서만 `logpb_flush_log_for_wal`로 직접 동기 flush하고 1회 재시도합니다 (4083-4098).

디버그 빌드에는 "flush 스레드는 하나뿐"이라는 전제가 `static THREAD_ENTRY *page_flush_thread` assert로 박혀 있습니다 (3839, 3864-3875).

### 3.5 neighbor flush

`PGBUF_NEIGHBOR_PAGES = PRM_ID_PB_NEIGHBOR_FLUSH_PAGES` (`page_buffer.c:313-314`), 상한 `PGBUF_MAX_NEIGHBOR_PAGES = 32` (312). 목적은 인접 pageid를 한 번에 써서 순차 I/O를 만드는 것입니다.

`PGBUF_BATCH_FLUSH_HELPER` (`page_buffer.c:451-460`)는 `2*32-1 = 63` 슬롯 배열이며, 인덱스 0이 중앙(원본 페이지)이 되도록 `PGBUF_NEIGHBOR_POS(idx) = PGBUF_NEIGHBOR_PAGES - 1 + idx` (316)로 매핑합니다. 전역 단일 인스턴스 `pgbuf_Flush_helper` (848) — flush 데몬이 유일한 사용자라는 전제입니다.

`pgbuf_flush_page_and_neighbors_fb` (11753-12038):

```
helper 초기화 (npages=0, fwd_offset=0, back_offset=0)                      # 11785-11787
pgbuf_add_bufptr_to_batch (bufptr, 0)                                     # 11790  중앙 등록
first_vpid = bufptr->vpid
log_newest_oldest_unflush_lsa = bufptr->oldest_unflush_lsa                 # 11792
PGBUF_BCB_UNLOCK (bufptr)                                                 # 11793

forward = true; search_nondirty = false
for i = 1; i < PGBUF_NEIGHBOR_PAGES; :                                    # 11801
    vpid.pageid = forward ? first + fwd_offset + 1 : first - back_offset - 1
        (PAGEID_MAX / 0 경계 시 NEIGHBOR_ABORT_RANGE 로 종료)              # 11805-11831
    bufptr = pgbuf_search_hash_chain (hash_anchor, &vpid)   # bcb mutex 획득  # 11836

    ┌ 아래 세 조건 중 하나라도 걸리면 "방향 전환 → nondirty 탐색 전환 → abort" 3단 폴백
    │  · 페이지 미적재 (bufptr == NULL)                       # 11837-11873
    │  · is_flushing 이거나 latch > READ                      # 11876-11911
    │  · !is_dirty 이고 search_nondirty == false             # 11913-11931
    └   (PGBUF_NEIGHBOR_FLUSH_NONDIRTY = PRM_ID_PB_NEIGHBOR_FLUSH_NONDIRTY, 309-310)

    if !is_dirty && prev_page_dirty == false:
        abort NEIGHBOR_ABORT_TWO_CONSECTIVE_NONDIRTIES     # 연속 2개 clean → 중단  # 11937
    if is_dirty:
        log_newest_oldest_unflush_lsa = MAX(..., bufptr->oldest_unflush_lsa)  # 11943-11945
        dirty_pages_cnt++

    if npages > 4 && 2*dirty_pages_cnt < npages:
        abort NEIGHBOR_ABORT_TOO_MANY_NONDIRTIES           # clean 이 절반 초과 → 중단  # 11950-11957

    pgbuf_add_bufptr_to_batch (bufptr, vpid.pageid - first_vpid.pageid)    # 11962
    PGBUF_BCB_UNLOCK (bufptr); i++

# 양 끝단이 clean 이면 배치에서 제거 (경계 낭비 write 방지)                 # 11967-11980
if npages <= 1:
    pgbuf_flush_neighbor_safe (중앙 1개만)                                 # 11988
    return

# ★ 배치 전체에 대한 단일 WAL 강제: 최댓값 LSA 하나로 처리
logpb_flush_log_for_wal (thread_p, &log_newest_oldest_unflush_lsa)         # 12002

for pos = POS(-back_offset) .. POS(fwd_offset):                            # 12005
    pgbuf_flush_neighbor_safe (bufptr, &helper->vpids[pos], &was_flushed)  # 12009
    # 개별 실패는 기록만 하고 계속 (save_first_error)                       # 12013-12017
*flushed_pages = written_pages; helper->npages = 0
```

배치 WAL 최적화가 핵심입니다: 63개 페이지 각각에 대해 `logpb_flush_log_for_wal`을 부르는 대신, 수집 중 최댓값 `oldest_unflush_lsa` 하나로 한 번만 호출합니다 (12002). 이후 각 페이지의 `pgbuf_bcb_flush_with_wal` 내부 WAL 호출(10788)은 `logpb_need_wal`이 이미 false이므로 즉시 반환합니다.

`pgbuf_flush_neighbor_safe` (12083-12122)는 두 가지만 재검증합니다: (1) VPID가 그대로인가 (12095), (2) `is_flushing` 아니고 latch ≤ READ인가 (12101). dirty가 아니어도 flush하며 `/* flush even if it is not dirty. todo: is this necessary? */` (12107) 주석이 붙어 있습니다.

abort 사유는 enum으로 정의되어 있고 (`page_buffer.c:11727-11740`) `PRM_ID_LOG_PGBUF_VICTIM_FLUSH` 활성 시 로깅됩니다 (12025-12031).

---

## 4. 체크포인트 flush와 recovery 관계

### 4.1 `PGBUF_SEQ_FLUSHER` 구조

`page_buffer.c:670-692`. 구조체 위 주석(670-675)이 rate control 모델을 설명합니다: 1초를 여러 interval로 쪼개고 각 interval에서 동일한 페이지 수를 flush하며, 1초 super-interval 전체에 걸쳐 보정(compensation)합니다.

| 필드 | 라인 | 의미 |
|---|---|---|
| `flush_list` | 678 | `PGBUF_VICTIM_CANDIDATE_LIST` 배열 (bufptr + vpid) |
| `flush_upto_lsa` | 679 | 이번 배치에 포함될 페이지들의 `oldest_unflush_lsa` 상한 |
| `control_intervals_cnt` | 681 | 현재 super-interval에서 경과한 interval 수 |
| `control_flushed` | 682 | 현재 super-interval에서 누적 flush한 페이지 수 |
| `interval_msec` | 684 | 1 interval 길이 |
| `flush_max_size` | 685 | `flush_list` 용량 (init 시 고정) |
| `flush_cnt` / `flush_idx` | 686-687 | 현재 배치 크기 / 진행 인덱스 |
| `flushed_pages` | 688 | 반환용 flush 페이지 수 |
| `flush_rate` | 689 | 목표 pages/sec (음수면 미사용) |
| `burst_mode` | 691 | true=가능한 빨리, false=페이지마다 sleep |

인스턴스는 `pgbuf_Pool.seq_chkpt_flusher` 하나뿐 (`page_buffer.c:779`). `pgbuf_initialize`에서 `flush_max_size = MIN(0.25 * num_buffers, 65536)`, `burst_mode = true`로 초기화 (1763-1772, `pgbuf_initialize_seq_flusher` 14574-14603). 해제는 1988-1991.

rate 상수 (`page_buffer.c:323-328`):
```
PGBUF_CHKPT_MAX_FLUSH_RATE  1200    # pages/sec 상한 (sleep 하한 계산용)
PGBUF_CHKPT_MIN_FLUSH_RATE    50    # pages/sec 하한 (interval 당 최소량)
PGBUF_CHKPT_BURST_PAGES       16    # interval 당 기본 burst 페이지 수
```

### 4.2 `pgbuf_flush_checkpoint` 의사코드

`page_buffer.c:4136-4266`.

```
pgbuf_flush_checkpoint (thread_p, flush_upto_lsa, prev_chkpt_redo_lsa,
                        OUT smallest_lsa, OUT flushed_page_cnt):

  *flushed_page_cnt = -1                                                  # 4154
  logpb_flush_log_for_wal (thread_p, flush_upto_lsa)                      # 4158
      # ★ 배치 전체에 대한 선행 WAL. 이후 개별 페이지 flush 는 로그 대기 없음.
  LSA_SET_NULL (smallest_lsa)                                             # 4159

  seq_flusher = &pgbuf_Pool.seq_chkpt_flusher
  seq_flusher->flush_upto_lsa = *flush_upto_lsa                           # 4164
  collected_bcbs = 0
  pgbuf_Pool.is_checkpoint = true                                         # 4171
      # → pgbuf_flush_victim_candidates 가 boost 를 끈다 (3909)

  for bufid in 0 .. num_buffers-1:                                        # 4174
      if collected_bcbs >= seq_flusher->flush_max_size:                   # 4176
          seq_flusher->flush_cnt = collected_bcbs; flush_idx = 0
          qsort (f_list, flush_cnt, pgbuf_compare_victim_list)            # 4182  (volid,pageid) 정렬
          pgbuf_flush_chkpt_seq_list (seq_flusher, prev_chkpt_redo_lsa, smallest_lsa)   # 4184
          flushed_page_cnt_local += seq_flusher->flushed_pages
          collected_bcbs = 0

      bufptr = PGBUF_FIND_BCB_PTR (bufid); PGBUF_BCB_LOCK (bufptr)        # 4198-4199

      # 배제 조건 3가지                                                    # 4202-4208
      if !pgbuf_bcb_is_dirty (bufptr)
         || (oldest_unflush_lsa != NULL && oldest_unflush_lsa > flush_upto_lsa)
         || pgbuf_is_temporary_volume (bufptr->vpid.volid):
          UNLOCK; continue
          # 2번째 조건: 체크포인트 시작 이후 dirty 된 페이지는 이번 대상이 아니다.
          # 3번째 조건: temp 페이지는 recovery 대상이 아니므로 제외.

      # ★ recovery 무결성 검증                                             # 4210-4222
      if oldest_unflush_lsa != NULL && prev_chkpt_redo_lsa 유효
         && oldest_unflush_lsa < prev_chkpt_redo_lsa:
          er_set (ER_LOG_CHECKPOINT_SKIP_INVALID_PAGE, ...)
          assert (false)
          # 이전 체크포인트가 이미 flush 했어야 하는 페이지가 여전히 dirty.
          # 이는 redo 로그가 이미 잘려나갔을 수 있는 변경이 디스크에 없다는 뜻 →
          # crash 시 recovery 불가. 개발 빌드에서 즉시 abort.

      f_list[collected_bcbs] = { bufptr, bufptr->vpid }                   # 4225-4226
      PGBUF_BCB_UNLOCK (bufptr); collected_bcbs++

      if thread_p->shutdown: is_checkpoint = false; return ER_FAILED       # 4232-4237

  if collected_bcbs > 0:                                                  # 4240
      qsort + pgbuf_flush_chkpt_seq_list (마지막 배치)                     # 4246-4249

  pgbuf_Pool.is_checkpoint = false                                        # 4253
  *flushed_page_cnt = flushed_page_cnt_local
  return error
```

### 4.3 `pgbuf_flush_chkpt_seq_list` — interval 분할과 victim 양보

`page_buffer.c:4278-4364`.

```
sleep_msecs = PRM_ID_LOG_CHECKPOINT_SLEEP_MSECS                           # 4295
chkpt_flush_rate = sleep_msecs > 0 ? 1000.0 / sleep_msecs : 1000.0        # 4296-4303
flush_interval   = 1000 * PGBUF_CHKPT_BURST_PAGES / chkpt_flush_rate      # 4305
seq_flusher->interval_msec = flush_interval                                # 4306

control_flushed = 0; control_intervals_cnt = 0                            # 4310-4311
while flush_idx < flush_cnt:                                              # 4312
    if thread_p->shutdown: return ER_FAILED                               # 4315-4319
    limit_time = now + flush_interval                                     # 4321-4324
    seq_flusher->flush_rate = chkpt_flush_rate                            # 4326

    # ★ victim flush 와의 I/O 간섭 회피: 최대 1500ms 대기
    wait_victims = 0
    while pgbuf_Pool.is_flushing_victims && wait_victims < 1500:          # 4334
        thread_sleep (0.1); wait_victims += 0.1                           # 4337-4338

    pgbuf_flush_seq_list (seq_flusher, &limit_time, prev_chkpt_redo_lsa,
                          chkpt_smallest_lsa, &time_rem)                  # 4342
    total_flushed += seq_flusher->flushed_pages

    if time_rem > 0: thread_sleep (time_rem)     # interval 잔여 시간 소진 # 4353-4356

seq_flusher->flushed_pages = total_flushed
```

`is_flushing_victims` 대기(4334-4339)가 중요합니다. victim flush와 체크포인트 flush가 동시에 디스크를 때리면 양쪽의 순차성(qsort로 애써 만든)이 I/O 스케줄러 레벨에서 서로 깨집니다. 체크포인트는 상대적으로 급하지 않으므로 양보하되, 1500ms 상한을 둬서 기아를 막습니다.

### 4.4 `pgbuf_flush_seq_list` — 1 interval 실행

`page_buffer.c:4386-4630`.

```
# ── interval 당 flush 할 페이지 수 (보정 포함) ──
if limit_time != NULL:                                                    # 4421
    avail_time_msec = limit_time - now
    control_total_cnt_intervals = round (1000 / interval_msec)            # 4426
    if control_intervals_cnt > 0:                                         # 4428
        control_est_flush_total = flush_rate * (control_intervals_cnt+1) / control_total_cnt_intervals
        flush_per_interval = control_est_flush_total - control_flushed     # 4434
            # ★ 누적 보정: 지금까지 뒤처진 만큼 이번에 더 쓴다
    else:
        flush_per_interval = flush_rate / control_total_cnt_intervals      # 4438
        if control_intervals_cnt < 0: flush_per_interval -= control_flushed
else:
    avail_time_msec = -1; flush_per_interval = flush_cnt                   # 4448-4449 (전량)

flush_per_interval = MAX (flush_per_interval,
                          PGBUF_CHKPT_MIN_FLUSH_RATE * interval_msec / 1000)  # 4452-4453

# ── flush 루프 ──
for ; flush_idx < flush_cnt && flushed_pages < flush_per_interval; flush_idx++:  # 4470
    bufptr = f_list[flush_idx].bufptr

    # 순차성 우선 판단: 다음 pageid 가 연속이 아니거나 마지막이면
    # "이미 flush 된 페이지를 또 쓸 이유가 없다"
    flush_if_already_flushed = (flush_idx+1 < flush_cnt
                                && f_list[flush_idx].vpid.pageid + 1
                                   == f_list[flush_idx+1].vpid.pageid)     # 4477-4482

    PGBUF_BCB_LOCK (bufptr)
    if !VPID_EQ (bufptr->vpid, f_list[flush_idx].vpid) || !is_dirty
       || (!flush_if_already_flushed && oldest_unflush_lsa > flush_upto_lsa):  # 4487-4489
        UNLOCK; dropped_pages++; continue

    done_flush = false
    if pgbuf_bcb_safe_flush_force_lock (bufptr, synchronous=true) == NO_ERROR:  # 4497
        if oldest_unflush_lsa != NULL && oldest_unflush_lsa <= flush_upto_lsa:  # 4499-4500
            # flush 중에 다시 수정되어, 새 oldest_unflush_lsa 가 여전히
            # flush_upto_lsa 이하 → 보수적으로 한 번 더 flush (4502-4505 주석)
            pgbuf_bcb_safe_flush_internal (bufptr, true, &locked_bcb)      # 4509
            assert (oldest_unflush_lsa == NULL || > flush_upto_lsa)         # 4512-4513
            done_flush = true
        else:
            done_flush = true                                              # 4523

    if done_flush: flushed_pages++
    else:
        assert (false)
        # ★ smallest_lsa 갱신은 이 실패 경로에만 존재
        if oldest_unflush_lsa != NULL
           && (*chkpt_smallest_lsa == NULL || oldest_unflush_lsa < *chkpt_smallest_lsa):
            *chkpt_smallest_lsa = oldest_unflush_lsa                        # 4547-4551
    UNLOCK

    # ── 시간 제한 / rate 조절 ──
    if limit_time != NULL && now >= limit_time: *time_rem = -1; break       # 4561-4570
    if !burst_mode && flush_rate > 0 && flushed_pages < flush_per_interval: # 4572
        sleep_msecs = (limit_time != NULL)
                      ? time_rem_msec / (flush_per_interval - flushed_pages)
                      : 1000.0 / flush_rate                                 # 4575-4583
        if sleep_msecs > 1000.0 / PGBUF_CHKPT_MAX_FLUSH_RATE:               # 4585
            thread_sleep (sleep_msecs)
    if thread_p->shutdown: return ER_FAILED                                 # 4591-4594

# ── super-interval 회계 ──
if limit_time != NULL:                                                      # 4600
    *time_rem = limit_time - now
    control_intervals_cnt++
    if control_intervals_cnt >= control_total_cnt_intervals: control_intervals_cnt = 0  # 4606-4609
    control_flushed = (control_intervals_cnt == 0) ? 0
                      : control_flushed + flushed_pages                     # 4611-4618
```

### 4.5 `flush_upto_lsa` / `prev_chkpt_redo_lsa` / `smallest_lsa`의 recovery 의미

호출자는 `logpb_checkpoint` (`src/transaction/log_page_buffer.c:7011`):

```c
pgbuf_flush_checkpoint (thread_p, &newchkpt_lsa, &chkpt_redo_lsa,
                        &tmp_chkpt.redo_lsa, &flushed_page_cnt)
```

| 파라미터 | 실인자 | recovery 의미 |
|---|---|---|
| `flush_upto_lsa` | `newchkpt_lsa` — 이번 체크포인트의 `LOG_START_CHKPT` 레코드 LSA (log_page_buffer.c:6995) | "이 LSA 이전의 모든 변경은 디스크에 반영시킨다"는 목표선. 이보다 나중에 dirty된 페이지는 대상 외 (4203) |
| `prev_chkpt_redo_lsa` | `log_Gl.chkpt_redo_lsa` — 이전 체크포인트가 정한 redo 시작점 (log_page_buffer.c:6982) | **검증 전용.** 이보다 오래된 `oldest_unflush_lsa`를 가진 dirty 페이지가 남아 있으면 recovery 불가 상태 → `ER_LOG_CHECKPOINT_SKIP_INVALID_PAGE` + `assert(false)` (4215-4220) |
| `smallest_lsa` (out) | `tmp_chkpt.redo_lsa` | flush하지 **못한** dirty 페이지 중 최소 `oldest_unflush_lsa`. 다음 recovery의 redo 시작점 하한 |

`smallest_lsa`의 실제 동작에 주의가 필요합니다. `pgbuf_flush_seq_list`에서 이 값이 갱신되는 유일한 지점은 `done_flush == false` 분기(4546-4551)이고, 그 분기는 바로 앞에 `assert (false)` (4538)가 있습니다. 즉 **정상 동작 시 `smallest_lsa`는 NULL로 반환**됩니다. 호출자는 이를 예상하고 처리합니다 (log_page_buffer.c:7024-7029):

```c
if (LSA_ISNULL (&tmp_chkpt.redo_lsa))
  LSA_COPY (&tmp_chkpt.redo_lsa, &newchkpt_lsa);
assert (LSA_LE (&tmp_chkpt.redo_lsa, &newchkpt_lsa));
```

따라서 정상 경로에서는 redo 시작점이 `newchkpt_lsa`까지 전진하고, 그 이전 로그는 회수 가능해집니다. `pgbuf_flush_checkpoint` 반환 후 `fileio_synchronize_all` (log_page_buffer.c:7016)로 실제 디스크 sync가 이뤄져야 이 전진이 안전해집니다.

체크포인트 flush의 다른 호출 지점: `log_page_buffer.c:6277`, `log_page_buffer.c:10814` (양쪽 모두 `prev_chkpt_redo_lsa = NULL`로 검증 생략).

---

## 5. 데몬 4종

### 5.1 역할 표

전역 포인터는 `page_buffer.c:1344-1351`. 생성/파괴는 `pgbuf_daemons_init` (17191) / `pgbuf_daemons_destroy` (17205). 모두 `#if defined (SERVER_MODE)` 하에만 존재하며 `BO_IS_FLUSH_DAEMON_AVAILABLE()` 가드로 매 실행마다 조기 반환합니다.

| 데몬 | 이름 | 주기 (looper) | 태스크 | 깨우는 조건 |
|---|---|---|---|---|
| `pgbuf_Page_maintenance_daemon` | `pgbuf-maintain` | 고정 100 ms (17113) | `pgbuf_adjust_quotas` (14198) + `pgbuf_direct_victims_maintenance` (16964) | 주기적만. 외부 wakeup 없음 |
| `pgbuf_Page_flush_daemon` | `pgbuf-page-flush` | `pgbuf_get_page_flush_interval` (16931): `PRM_ID_PAGE_BG_FLUSH_INTERVAL_MSECS`>0이면 그 값, 0이면 **무한 대기** (16946) | `pgbuf_flush_victim_candidates(PRM_ID_PB_BUFFER_FLUSH_RATIO)` 루프 (16997-17006) | `pgbuf_wakeup_page_flush_daemon` (11622) ← `pgbuf_allocate_bcb` (8252, 8307) |
| `pgbuf_Page_post_flush_daemon` | `pgbuf-page-post-flush` | 증가형 3단계 `{1ms, 10ms, 100ms}` (17149-17155) | `pgbuf_assign_flushed_pages` (15434); 큐가 비어있지 않았으면 `reset_looper()` (17036-17040) | `pgbuf_bcb_flush_with_wal` (10873) |
| `pgbuf_Flush_control_daemon` | `pgbuf-flush-control` | 고정 50 ms (17181) | `fileio_flush_control_add_tokens(경과 usec)` (17089) | 주기적만 |

각 데몬의 세부 동작:

**page flush 데몬** (`pgbuf_page_flush_daemon_task`, 16974-17023). 실행마다:
```c
bool force_one_run = pgbuf_Page_flush_daemon->was_woken_up ();   // 16993
while (force_one_run || pgbuf_keep_victim_flush_thread_running ())  // 16997
  {
    pgbuf_flush_victim_candidates (..., &stop);
    force_one_run = false;
    if (stop) break;                                              // 17002-17005
  }
```
`was_woken_up()`으로 "타임아웃이 아니라 누군가 깨웠다"를 판별해 최소 1회 실행을 보장합니다. `stop`은 `pgbuf_flush_victim_candidates`가 "후보가 없다 = 이미 충분히 flush했다"고 판단할 때 세워집니다 (3940).

`pgbuf_keep_victim_flush_thread_running` (15352-15355):
```c
return (pgbuf_is_any_thread_waiting_for_direct_victim () || pgbuf_is_hit_ratio_low ());
```
`pgbuf_is_hit_ratio_low` (16590-16598)는 victim 요청이 10건 초과이고 `victim_req_cnt * 1000 > fix_req_cnt`, 즉 hit ratio 99.9% 미달일 때 true.

`m_perf_track`을 태스크 멤버로 들고 있어 sleep 시간을 `PSTAT_PB_FLUSH_SLEEP`으로 계측합니다 (17012).

**post-flush 데몬**의 looper가 3단계 증가형인 것이 요점입니다. `pgbuf_assign_flushed_pages`가 큐에서 무언가 꺼냈으면 `reset_looper()`를 호출해 1ms 단계로 되돌아갑니다 (17036-17040). 즉 flush가 활발할 때는 1ms 폴링, 한가해지면 자동으로 100ms까지 늘어납니다.

**flush control 데몬**은 첫 실행에서 시각만 기록하고 반환 (17075-17080), 이후 매 50ms마다 경과 usec을 `fileio_flush_control_add_tokens`에 전달합니다. `retire()`에서 `fileio_flush_control_finalize` (17096).

`pgbuf_daemons_get_stats` (17215-17243)가 네 데몬의 통계를 순서대로(`flush → post_flush → flush_control → maintenance`) 채웁니다 — 순서가 호출자 규약입니다.

### 5.2 상호작용 시퀀스 다이어그램

**케이스 A: victim 고갈 → flush → 직접 배정**

```
 worker            page-flush          post-flush       direct-victim       LRU/BCB
 (fix miss)         daemon              daemon           queues              table
    │                  │                   │                │                  │
    │ pgbuf_fix → pgbuf_claim_bcb_for_fix (8351)            │                  │
    │ pgbuf_allocate_bcb (8136)                             │                  │
    │  ├ invalid list 조회 (8174) → 실패                     │                  │
    │  ├ pgbuf_get_victim (8187) → NULL                     │                  │
    │  ├ waiter_threads_{high,low}_priority->produce ──────────►│                │
    │  │   (8214 / 8224)  high 판정: VACUUM ||               │                  │
    │  │   pgbuf_is_thread_high_priority (11679, 8198)       │                  │
    │  ├ pgbuf_wakeup_page_flush_daemon (8252) ─────►│       │                  │
    │  │        └ pgbuf_Page_flush_daemon->wakeup() (11627)  │                  │
    │  └ thread_suspend_timeout_wakeup_and_unlock_entry (8256)                  │
    │  [SUSPENDED: THREAD_ALLOC_BCB_SUSPENDED]              │                  │
    │                  │                   │                │                  │
    │                  │ execute() (16985) │                │                  │
    │                  │ force_one_run = was_woken_up() = true                  │
    │                  │ pgbuf_flush_victim_candidates (3821)                   │
    │                  │  ├ pgbuf_compute_lru_vict_target (3881) ──────────────►│
    │                  │  │    priority[] 계산 (14144-14186)                    │
    │                  │  ├ pgbuf_get_victim_candidates_from_lru (3932) ───────►│
    │                  │  │    LRU mutex 하 zone3 bottom→up 스캔 (3773)         │
    │                  │  │    dirty → victim_cand_list 적재 (3779)             │
    │                  │  ├ log_wakeup_log_flush_daemon (3948)                  │
    │                  │  ├ qsort (volid,pageid) (3958)                         │
    │                  │  ├ is_flushing_victims = true (3962)                   │
    │                  │  └ for each cand:                                      │
    │                  │      · VPID/dirty/flushing 검증 (3998) ───────────────►│
    │                  │      · zone3/fixed 검증 (4007)                         │
    │                  │      · logpb_need_wal? → skip + log wakeup (4015-4029) │
    │                  │      · pgbuf_bcb_flush_with_wal(is_page_flush_thread=true)
    │                  │          ├ mark_is_flushing (10741) ──────────────────►│
    │                  │          │    set FLUSHING, clear DIRTY                │
    │                  │          ├ memcpy 페이지 스냅샷 (10760)                │
    │                  │          ├ BCB_UNLOCK (10781)                          │
    │                  │          ├ logpb_flush_log_for_wal(page LSA) (10788)   │
    │                  │          ├ fileio_write / dwb_add_page (10813/10834)   │
    │                  │          └ 대기자 있음 → flushed_bcbs->produce (10870) │
    │                  │             post_flush_daemon->wakeup() (10873) ──►│    │
    │                  │             (FLUSHING 플래그 유지!)                │    │
    │                  │  is_flushing_victims = false (4101)                │    │
    │                  │                   │ execute() (17028)             │    │
    │                  │                   │ pgbuf_assign_flushed_pages (15434)  │
    │                  │                   │  while flushed_bcbs->consume: │    │
    │                  │                   │   BCB_LOCK (15448) ───────────────►│
    │                  │                   │   조건 검사 (15450-15466):    │    │
    │                  │                   │    invalidate_flag / fixed /  │    │
    │                  │                   │    !zone3 / private 쿼터 미달  │    │
    │                  │                   │   pgbuf_assign_direct_victim ─►│    │
    │                  │                   │    (15467 → 15367)            │    │
    │                  │                   │    ├ waiter 큐에서 소비 (15390)│    │
    │                  │                   │    │   pgbuf_get_thread_waiting_for_direct_victim
    │                  │                   │    │   (15503) — 4회마다 low 우선 (15510)
    │                  │                   │    ├ thread_wakeup_already_had_mutex (15404)
    │◄─────────────────┼───────────────────┼────┤   THREAD_ALLOC_BCB_RESUMED  │
    │                  │                   │    ├ set VICTIM_DIRECT,        │    │
    │                  │                   │    │ clear FLUSHING (15407) ────────►│
    │                  │                   │    └ bcb_victims[idx] = bcb (15409)  │
    │                  │                   │   mark_was_flushed (15483)     │    │
    │                  │                   │   wake_flush_waiters (15488)    │    │
    │                  │                   │   BCB_UNLOCK (15491)           │    │
    │                  │                   │  not_empty → reset_looper (17039)   │
    │ resume: pgbuf_get_direct_victim (8266)                                     │
    │  └ NULL 이면 (재fix됨) high_priority=true; goto retry (8270-8271)           │
    │ pgbuf_victimize_bcb (8320 → 8589) ────────────────────────────────────────►│
    │  └ hash chain 제거 (8617), latch=INVALID (8622)                            │
    │ BCB 를 새 VPID 로 초기화 (8430-8439), ASYNC_FLUSH_REQ 클리어 (8437)          │
```

**케이스 B: 즉시 경로 (victim 대기자 없음)**

```
 page-flush daemon                                    BCB
       │                                               │
       │ pgbuf_bcb_flush_with_wal(is_page_flush_thread=true)
       │  ├ mark_is_flushing ──────────────────────────►│ FLUSHING=1, DIRTY=0
       │  ├ memcpy / BCB_UNLOCK / WAL / write           │
       │  └ 대기자 없음 (10869 조건 실패) → else 분기    │
       │      BCB_LOCK (10882) ───────────────────────►│
       │      mark_was_flushed (10884) ────────────────►│ FLUSHING=0
       │                                               │ → zone3 이고 다른 무효화
       │                                               │   플래그 없으면
       │                                               │   count_vict_cand++ (15768)
       │      wake_flush_waiters (10889)                │
       │  caller 가 BCB_UNLOCK (4042)                   │
```

**케이스 C: 동기 flush 요청이 WRITE latch에 막히는 경우**

```
 requester                writer (latch 보유)              BCB
     │                          │                            │
     │ pgbuf_flush_with_wal (3540)                            │
     │  BCB_LOCK (3559)                                       │
     │  pgbuf_bcb_safe_flush_force_unlock (3562 → 8711)        │
     │   pgbuf_bcb_safe_flush_internal (8767)                  │
     │    ├ !is_dirty → 즉시 반환 (8779-8783)                  │
     │    ├ CAS 루프로 즉시 flush 가능성 판정 (8795-8820):      │
     │    │   가능 조건: !is_flushing &&                        │
     │    │     (NO_LATCH || READ || (WRITE && 내가 holder))    │
     │    │   불가 && synchronous → block=true,                 │
     │    │     impl_new.waiter_exists = true (8815)            │
     │    ├ 즉시 가능 → pgbuf_bcb_flush_with_wal(false) (8825)  │
     │    └ 불가:                                              │
     │        if !is_flushing:                                 │
     │          set ASYNC_FLUSH_REQ (8831) ──────────────────►│ ASYNC_FLUSH_REQ=1
     │        if block:                                        │
     │          pgbuf_block_bcb (bufptr, PGBUF_LATCH_FLUSH, 0, false) (8838)
     │            ├ 대기 큐에 append (7031-7045)               │
     │            ├ request_latch_mode = PGBUF_LATCH_FLUSH (7016)
     │            └ FLUSH 분기 (7048-7092):                    │
     │               thread_lock_entry; BCB_UNLOCK;            │
     │               thread_suspend_wakeup_and_unlock_entry    │
     │               (THREAD_PGBUF_SUSPENDED) — **무한 대기**    │
     │  [SUSPENDED]              │                            │
     │                           │ pgbuf_unfix (3026)          │
     │                           │  pgbuf_unlatch_bcb_upon_unfix (6608)
     │                           │   ... zone 처리 ...          │
     │                           │   pgbuf_wakeup_reader_writer (6805)
     │                           │    └ FLUSH 대기자는 건너뜀 (7451-7459)
     │                           │       assert(ASYNC_FLUSH_REQ || FLUSHING)
     │                           │   is_async_flush_request? (6811) → yes
     │                           │   pgbuf_bcb_safe_flush_force_unlock
     │                           │     (synchronous=false) (6820)
     │                           │    → pgbuf_bcb_flush_with_wal(is_page_flush_thread=false)
     │                           │       ├ mark_is_flushing (ASYNC_FLUSH_REQ 도 클리어)
     │                           │       ├ write
     │                           │       └ BCB_LOCK; mark_was_flushed;
     │◄──────────────────────────┼─────────  pgbuf_wake_flush_waiters (10889)
     │  resume (THREAD_PGBUF_RESUMED)                          │
     │  return NO_ERROR                                        │
```

`PGBUF_LATCH_FLUSH` 대기가 **timed sleep이 아니라 무한 대기**임에 주의해야 합니다 (7050 주석 `/* is it safe to use infinite wait instead of timed sleep? */`). 인터럽트로 깨면 스스로 대기 큐에서 자신을 제거하고 `waiter_exists`를 정합화한 뒤 `ER_FAILED`를 반환합니다 (7055-7091).

**케이스 D: flush control 토큰 피드백 루프**

```
 flush-control daemon (50ms)          fileio                  page buffer
        │                               │                          │
        │ fileio_flush_control_add_tokens (17089)                   │
        │   (file_io.c:849)             │                          │
        │   ├ token_consumed 회수, PSTAT_FC_* 기록 (file_io.c:869-872)
        │   ├ if PRM_ID_ADAPTIVE_FLUSH_CONTROL:                     │
        │   │   fileio_flush_control_get_desired_rate (file_io.c:908)│
        │   │     └ dirty_rate = pgbuf_flush_control_from_dirty_ratio () ──►│
        │   │            (page_buffer.c:14791)                      │
        │   │            crt = monitor.dirties_cnt (14794)          │
        │   │            desired = num_buffers / 2 (14795)          │
        │   │            if crt > desired:                          │
        │   │              above = crt - desired                    │
        │   │              rate = above² / (num_buffers - desired)  │ (14806)
        │   │            if crt > prev:                             │
        │   │              rate += (crt-prev) * crt / num_buffers   │ (14817)
        │   │     └ tokens>0 && dirty_rate>0 → 현 rate 유지         │
        │   │       tokens>0 && dirty_rate==0 → DROP_RATE 감쇠      │
        │   │       tokens==0 → MAX(dirty_rate, GROW_RATE) 증가     │
        │   ├ else: PRM_ID_MAX_FLUSH_PAGES_PER_SECOND 고정          │
        │   └ tb->tokens = gen_tokens; cond_broadcast (file_io.c:895-899)
        │                               │                          │
        │                        fileio_write 가 토큰을 소비 →      │
        │                        토큰 소진 시 대기 → flush I/O 속도 제한
```

`pgbuf_flush_control_from_dirty_ratio` (14791-14823)의 목표 dirty 수준은 버퍼 풀의 절반 (14795)입니다. 두 항의 합으로 rate를 제안합니다: (1) 초과분의 **제곱**에 비례하는 항 (14806) — 초과가 커질수록 급격히 가속, (2) dirty **증가 속도**에 dirty 비율을 가중한 항 (14817) — 아직 목표에 도달하지 않았어도 급증을 미리 억제. `prev_dirties_cnt`가 함수 로컬 static이므로 (14793) 이 함수는 flush control 데몬만 호출해야 정확합니다.

---

## 6. DWB (Double Write Buffer) 연동 지점

`page_buffer.c` 안의 DWB 접점은 총 5곳입니다.

| 라인 | 호출 | 역할 |
|---|---|---|
| 10743 | `dwb_is_created () && !is_temp` | DWB 사용 여부 결정. **temp 볼륨은 DWB 제외** (recovery 대상이 아니므로 torn page 보호 불필요) |
| 10764 | `dwb_set_data_on_next_slot (thread_p, iopage, false, false, &dwb_slot)` | 스택 복사본 `iopage`를 DWB 슬롯으로 복사. 성공(`dwb_slot != NULL`) 시 `iopage = NULL`로 무효화하고 (10771) 이후 로컬 버퍼를 참조하지 않음 |
| 10813 | `dwb_add_page (thread_p, iopage, &bufptr->vpid, false, &dwb_slot)` | 슬롯을 DWB에 등록. 반환 후 `dwb_slot == NULL`이면 도중에 DWB가 비활성화된 것 → `uses_dwb = false`, BCB 재락, `goto start_copy_page`로 non-DWB 재시도 (10816-10823) |
| 10831 | `write_mode = dwb_is_created () ? FILEIO_WRITE_NO_COMPENSATE_WRITE : FILEIO_WRITE_DEFAULT_WRITE` | non-DWB 경로에서도 DWB가 살아 있으면 compensate write를 끔. DWB가 별도로 write를 보상하므로 이중 보상 방지 |
| 8456 | `dwb_read_page (thread_p, vpid, &bufptr->iopage, &success)` | **읽기 경로.** fix 시 먼저 DWB에서 찾고, 없으면 `fileio_read` (8466). DWB에 있는 페이지는 아직 데이터 볼륨에 안 갔을 수 있으므로 이 순서가 필수 |

DWB 경로에서 `fileio_write`는 호출되지 않으며 (10811-10825의 if/else 구조), 따라서 `show_status->num_pages_written` (10828)과 `PSTAT_PB_NUM_IOWRITES` (10833)는 **non-DWB 경로에서만 증가**합니다. DWB 사용 시 이 통계는 실제 write를 반영하지 않으므로 해석에 주의해야 합니다.

`DWB_SLOT *dwb_slot`은 두 호출 사이(`dwb_set_data_on_next_slot` → `dwb_add_page`)를 잇는 핸들이며, 그 중간에 bcb mutex 해제(10781)와 WAL flush(10788)가 끼어 있습니다. 즉 DWB 슬롯 점유가 WAL 대기 구간 전체에 걸쳐 유지됩니다.

DWB 자체의 flush(디스크 sync 후 데이터 볼륨으로 배치 쓰기)는 `page_buffer.c` 밖(`double_write_buffer.c`)에서 처리되며, 체크포인트의 `fileio_synchronize_all` (log_page_buffer.c:7016)이 그 완료를 보장하는 지점입니다.

---

## 7. safe flush 계열과 공개 API

### 7.1 3단 래퍼 구조

```
pgbuf_bcb_safe_flush_force_unlock (8711)   ─┐
   → internal; locked 면 UNLOCK                │
                                              ├→ pgbuf_bcb_safe_flush_internal (8767)
pgbuf_bcb_safe_flush_force_lock (8734)     ─┘      → pgbuf_bcb_flush_with_wal (10673)
   → internal; 에러면 UNLOCK 후 반환,                 또는 pgbuf_block_bcb (FLUSH)
     성공했는데 unlocked 면 다시 LOCK
```

`force_lock` 판은 호출 후에도 BCB 상태를 이어서 검사해야 하는 곳에서 씁니다: `pgbuf_flush_seq_list` (4497, 이후 `oldest_unflush_lsa` 재검사), `pgbuf_invalidate` (3380), `pgbuf_invalidate_all` (3470).

`force_unlock` 판은 flush 후 BCB를 볼 필요가 없는 곳: `pgbuf_flush_with_wal` (3562), `pgbuf_flush_if_requested` (3604), `pgbuf_flush_all_helper` (3644), `pgbuf_unlatch_bcb_upon_unfix` (6820), 디버그 unfix 경로 (3188).

### 7.2 `pgbuf_bcb_safe_flush_internal`의 즉시 flush 판정

`page_buffer.c:8795-8820`의 CAS 루프가 핵심입니다. 즉시 flush 가능 조건:

```c
!is_flushing && (latch_mode == PGBUF_NO_LATCH
                 || latch_mode == PGBUF_LATCH_READ
                 || (latch_mode == PGBUF_LATCH_WRITE
                     && pgbuf_find_thrd_holder (thread_p, bufptr) != NULL))
```

즉 (a) 아무도 flush 중이 아니고, (b) latch가 없거나 READ이거나, WRITE인데 **내가 그 holder**여야 합니다. 8785-8793 주석이 두 불가 사유를 명시합니다: WRITE latch 보유자는 언제 수정을 완료할지 알 수 없고, 동시 flush는 디스크 쓰기 순서를 보장할 수 없어 옛 버전이 새 버전을 덮어쓸 수 있습니다.

불가한데 `synchronous == false`면 `ASYNC_FLUSH_REQ`만 세우고 즉시 반환 (8846-8847). `synchronous == true`면 `waiter_exists`를 CAS로 세운 뒤 (8815) `pgbuf_block_bcb(PGBUF_LATCH_FLUSH)`로 무한 대기 (8838).

### 7.3 공개 flush API

| 함수 | 라인 | 특징 |
|---|---|---|
| `pgbuf_flush (pgptr, free_page)` | 3517 | `pgbuf_flush_with_wal` 래퍼. 주석에 `/* I recommend against using it */` (3519-3520) — 실패를 무시하기 때문 |
| `pgbuf_flush_with_wal (pgptr)` | 3540 | fix된 페이지에 대한 동기 flush. WRITE latch + holder 보유 assert (3558) |
| `pgbuf_flush_if_requested (page)` | 3580 | `ASYNC_FLUSH_REQ`가 있을 때만 비동기 flush. 영구 latch 페이지용 |
| `pgbuf_flush_all (volid)` | 3667 | `helper(volid, is_unfixed_only=false, is_set_lsa_as_null=false)` |
| `pgbuf_flush_all_unfixed (volid)` | 3683 | `helper(volid, true, false)`. 호출자: `log_manager.c:5470`, `log_page_buffer.c:7517/9454` |
| `pgbuf_flush_all_unfixed_and_set_lsa_as_null (volid)` | 3700 | `helper(volid, true, true)`. DB 복사/백업용 — `log_page_buffer.c:9482/9830` (LOG_DBCOPY_VOLID) |
| `pgbuf_rv_flush_page (rcv)` | 14834 | recovery 중 즉시 flush. `LOG_DUMMY_GENERIC` 로그를 붙여 논리 시스템 오퍼레이션 종료 검사를 통과시킴 (14854) |

`pgbuf_flush_all_helper` (3614-3654)는 BCB 테이블 전체를 순회하며 lock 없이 dirty/volid를 먼저 걸러내고 (3623), lock 후 재검증합니다 (3630). `is_set_lsa_as_null`이면 `fileio_init_lsa_of_page`로 LSA를 NULL로 만든 뒤 flush (3637-3641) — 복사된 볼륨이 원본의 로그 히스토리를 참조하지 않게 하는 조치입니다.

---

## 8. 통계 (`PERF_UTIME_TRACKER` / perfmon) 사용처 요약

| 통계 ID | 기록 지점 | 의미 |
|---|---|---|
| `PSTAT_PB_FLUSH_COLLECT` / `_PER_PAGE` | 3937, 3974-3977 | victim 후보 수집 시간 (전체 / 페이지당) |
| `PSTAT_PB_FLUSH_FLUSH` / `_PER_PAGE` | 4072-4075 | 실제 flush 시간 |
| `PSTAT_PB_FLUSH_SLEEP` | 17012 | flush 데몬 sleep 시간 (태스크 멤버 `m_perf_track`으로 누적) |
| `PSTAT_PB_NUM_FLUSHED` | 4118 | flush한 페이지 수 |
| `PSTAT_PB_NUM_SKIPPED_FLUSH` | 4061 | skip 총합 |
| `PSTAT_PB_NUM_SKIPPED_NEED_WAL` / `_FIXED_OR_HOT` / `_ALREADY_FLUSHED` | 4064-4066 | skip 사유별 (detailed perf만) |
| `PSTAT_PB_NUM_IOWRITES` | 10833 | non-DWB write 횟수 |
| `PSTAT_PB_FLUSH_PAGE_FLUSHED` | 10896 | flush 성공 (victimization 플래그 활성 시) |
| `PSTAT_PB_FLUSH_SEND_DIRTY_TO_POST_FLUSH` | 10876 | post-flush 큐로 이관한 건수 |
| `PSTAT_PB_WAKE_FLUSH_WAITER` | 10957 | FLUSH 대기자 wakeup 소요 시간 |
| `PSTAT_PB_ASSIGN_DIRECT_BCB` | 15413, 15418 | direct victim 배정 시간 (성공/실패 양쪽 기록) |
| `PSTAT_PB_VICTIM_ASSIGN_DIRECT_FLUSH` | 15472 | post-flush 경유 배정 |
| `PSTAT_PB_VICTIM_ASSIGN_DIRECT_SEARCH_FOR_FLUSH` | 3792 | 후보 수집 중 부수적 직접 배정 |
| `PSTAT_PB_ALLOC_BCB` / `_SEARCH_VICTIM` / `_COND_WAIT_{HIGH,LOW}_PRIO` | 8334, 8188/8311, 8260 | BCB 할당 단계별 시간 |
| `PSTAT_PB_NUM_DIRTIES` | 11612 | dirty 마킹 횟수 |
| `PSTAT_FC_NUM_PAGES` / `_NUM_LOG_PAGES` / `_TOKENS` | file_io.c:870-872 | flush control 토큰 회계 |

`PERF_UTIME_TRACKER`는 두 방식으로 쓰입니다: (a) 지역 변수 + `PERF_UTIME_TRACKER_START`/`_TIME` 쌍 (8139-8140, 10916-10918, 15372-15374), (b) 호출자가 소유하고 파라미터로 전달 — `pgbuf_flush_victim_candidates`의 `perf_tracker` (3821). (b)의 경우 데몬 태스크가 멤버로 들고 있어 iteration 간 시간이 이어집니다.

per-thread 샤딩된 카운터도 있습니다: `pgbuf_fix_req_cnt` / `pgbuf_pg_unfix_cnt`는 `THREAD_ENTRY`에 있고 `pgbuf_monitor_sum_fix_req` (2120) / `pgbuf_monitor_sum_pg_unfix` (2166)로 합산합니다 (`page_buffer.c:705-707` 주석). `dirties_cnt`는 `PGBUF_PAGE_MONITOR`의 `INT64` 하나로 `ATOMIC_INC_64`됩니다 (697, 15787/15792/15989).

`PGBUF_STATUS` (395-404)는 `alignas(64)`로 per-thread 배열이며 (`show_status[thread_get_entry_index()]`, 10690), `num_pages_written` (10828), `num_flusher_waiting_threads` (8254/8258)를 기록합니다. `pgbuf_scan_bcb_table` (17279)이 mutex 없이 전체 BCB를 훑어 dirty/clean 스냅샷을 만듭니다 (17297-17304).

---

## 9. 구현 시 주의할 관찰 사항 / 결함 후보

재구현 시 반드시 다르게 처리해야 하거나, 현 코드의 함정으로 보이는 지점들입니다.

**9.1 `pgbuf_bcb_flush_with_wal`의 조기 반환 경로에서 `FLUSHING_TO_DISK` 플래그 누수**

`page_buffer.c:10741`에서 `mark_is_flushing`으로 `FLUSHING`을 세우고 `DIRTY`를 내린 뒤, 아래 두 경로가 `mark_was_not_flushed` 없이 반환합니다:
- TDE 암호화 실패: `return error` (10755)
- `dwb_set_data_on_next_slot` 실패: `return error` (10767)

이 경우 BCB는 영구히 `FLUSHING == true`, `DIRTY == false`, `oldest_unflush_lsa`는 원래 값 유지 상태로 남습니다. 결과: 이 BCB는 (a) `PGBUF_BCB_INVALID_VICTIM_CANDIDATE_MASK`에 걸려 절대 victim이 되지 못하고, (b) `pgbuf_bcb_safe_flush_internal`이 `is_flushing`을 보고 즉시 flush를 거부하며 `synchronous == true` 호출자는 `pgbuf_block_bcb(PGBUF_LATCH_FLUSH)`로 **깨워줄 주체 없이 무한 대기**합니다. 실패 경로(10848-10863)는 정확히 이 복구를 수행하므로, 두 조기 반환도 동일하게 `mark_was_not_flushed(was_dirty)` + `oldest_unflush_lsa` 복원 + `wake_flush_waiters`를 거쳐야 합니다.

**9.2 체크포인트 `smallest_lsa`가 실질적으로 dead code**

§4.5에서 설명한 대로 `chkpt_smallest_lsa` 갱신은 `assert(false)` 뒤 분기(4538-4551)에만 있어 릴리스 빌드에서만 도달 가능합니다. 재구현 시 "flush에 실패한 dirty 페이지의 최소 LSA"를 정말 필요로 한다면, drop된 페이지(4491-4494, `dropped_pages++`)와 배제된 페이지(4202-4208)도 후보에 넣어야 의미가 생깁니다. 현 코드는 그 경로에서 `smallest_lsa`를 갱신하지 않습니다.

**9.3 후보 리스트의 stale VPID**

`pgbuf_get_victim_candidates_from_lru` (3780)는 LRU mutex만 들고 `bufptr->vpid`를 읽습니다. bcb mutex가 없으므로 그 사이 BCB가 victim화되어 다른 VPID로 재사용될 수 있습니다. 이는 3998의 `VPID_EQ` 재검증과 4487의 동일 검증으로 방어되며, `PGBUF_VICTIM_CANDIDATE_LIST`가 `bufptr`뿐 아니라 `vpid`를 같이 저장하는 (841-845) 유일한 이유입니다. 재구현 시 이 쌍을 분리하면 안 됩니다.

**9.4 전역 `pgbuf_Flush_helper` 단일 인스턴스**

`page_buffer.c:848`의 `pgbuf_Flush_helper`는 전역 하나이고 `pgbuf_add_bufptr_to_batch` (12046)가 락 없이 갱신합니다. 이는 neighbor flush 호출자가 page flush 데몬 하나뿐이라는 전제에 완전히 의존합니다 (`pgbuf_flush_victim_candidates`의 `static page_flush_thread` assert, 3839/3873와 같은 전제). flush 스레드를 다중화하려면 이 구조체를 스레드 로컬로 바꿔야 합니다.

**9.5 `flush_if_already_flushed`의 반전된 네이밍**

`page_buffer.c:4477-4482`에서 이 변수는 "다음 pageid가 연속일 때 true"입니다. 그리고 `false`일 때만 `oldest_unflush_lsa > flush_upto_lsa` 검사를 적용합니다 (4488-4489). 즉 실제 의미는 "순차성을 지키기 위해 불필요한 flush도 감수한다"이며, 4475-4476 주석이 그 의도를 설명합니다. 이름만 읽으면 조건이 반대로 읽힙니다.

**9.6 `goto copy_unflushed_lsa` (10772)는 무의미**

레이블 `copy_unflushed_lsa:` (10776)가 바로 다음 줄이라 fallthrough와 동일합니다. DWB 슬롯 획득 성공 시 non-DWB `memcpy`를 건너뛰려는 의도였을 가능성이 있는데, 실제로는 `memcpy`가 이미 위(10760)에서 실행된 뒤입니다.

**9.7 `PGBUF_LATCH_FLUSH` 대기의 무한 대기**

`page_buffer.c:7050`에 `/* is it safe to use infinite wait instead of timed sleep? */`라는 미해결 주석이 있습니다. READ/WRITE 대기는 `pgbuf_timed_sleep` (7103)으로 타임아웃이 있는데 FLUSH만 없습니다. 9.1의 플래그 누수와 결합되면 복구 불가능한 hang이 됩니다.

**9.8 `pgbuf_flush_neighbor_safe`는 clean 페이지도 write**

`page_buffer.c:12107`의 `/* flush even if it is not dirty. todo: is this necessary? */`. `PGBUF_NEIGHBOR_FLUSH_NONDIRTY`가 켜져 있을 때 배치에 포함된 clean 페이지에 대해서도 실제 `fileio_write`가 발생합니다. 순차성 이득과 불필요한 write 비용의 트레이드오프이며, `NEIGHBOR_ABORT_TWO_CONSECTIVE_NONDIRTIES` (11937)와 `_TOO_MANY_NONDIRTIES` (11950-11957)가 그 비용의 상한선 역할을 합니다.
