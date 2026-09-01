# Page-buffer ownership reference: CUBRID, PostgreSQL, MySQL/InnoDB

> 목적: CUBRID page buffer를 기준으로 PostgreSQL shared buffers와 MySQL/InnoDB buffer pool의
> **replacement protection**, **content protection**, **ownership**, **release lifetime**을 같은 축에서 비교한다.
> 이름이 비슷하다는 이유로 API를 1:1 대응시키지 않고, responsibility와 lifetime이 실제로 어디에 놓이는지 본다.

## Source baseline

| Engine | Pinned revision | Primary files |
|---|---|---|
| CUBRID | `f799e05d77d5300c6ea5753b4a6cc7caee6d8912` | `src/storage/page_buffer.c`, `src/storage/page_buffer.h` |
| PostgreSQL | `fd2b89854d93d70fe8c9a69d5b8fafd5b9302cfc` | `src/backend/storage/buffer/bufmgr.c` |
| MySQL/InnoDB | `06a5c1c99c377fc41b2eba1ea244e8b220bdc3c8` | `storage/innobase/buf/buf0buf.cc`, `storage/innobase/include/buf0buf.ic`, `storage/innobase/mtr/mtr0mtr.cc` |

이 문서는 위 revision의 source behavior를 설명한다. 다른 version에서 구조체, 함수명, line number 또는
release policy가 달라질 수 있다. PostgreSQL과 InnoDB server를 실행한 runtime 비교 결과는 포함하지 않는다.

## 1. 먼저 두 보호를 분리한다

Page를 사용하려면 서로 다른 두 문제가 해결되어야 한다.

| Protection | 막아야 하는 것 | 보호하지 않는 것 |
|---|---|---|
| **Replacement protection** (`fix`, `pin`) | Caller가 frame을 참조하는 동안 그 frame이 eviction되어 다른 page identity로 reuse되는 것 | 다른 worker가 같은 resident page bytes를 동시에 읽거나 수정하는 것 |
| **Content protection** (`latch`, `content lock`) | Page bytes와 page-local metadata를 읽거나 수정하는 동안 incompatible concurrent access가 들어오는 것 | 보호를 해제한 뒤에도 frame이 계속 resident하리라는 보장 |

따라서 다음 두 문장은 모두 틀릴 수 있다.

- “Pin했으므로 page bytes는 바뀌지 않는다.” Pin은 frame identity를 지키지만 concurrent writer를 막지 않을 수 있다.
- “Latch를 풀었으므로 pointer가 즉시 다른 page를 가리킨다.” 별도 pin/fix가 남았다면 frame identity는 유지될 수 있다.

이 구분이 세 엔진의 차이를 읽는 기준이다.

## 2. 한눈에 보는 책임 배치

| Axis | CUBRID | PostgreSQL | MySQL/InnoDB |
|---|---|---|---|
| Shared replacement state | BCB `atomic_latch.fcnt` | Buffer descriptor shared refcount | `buf_page_t::buf_fix_count` |
| Nested/local ownership | Per-thread `PGBUF_HOLDER.fix_count` | Backend-local `PrivateRefCount` | `mtr_t` memo의 page-fix entry |
| Content protection | BCB READ/WRITE page latch | 별도 buffer content lock | `buf_block_t::lock`의 S/SX/X latch |
| Logical owner | Thread holder | Backend + `ResourceOwner` | Mini-transaction (`mtr_t`) |
| Normal acquire shape | `pgbuf_fix()`가 fix와 requested latch를 함께 획득 | Pin한 뒤 필요할 때 `LockBuffer()` | Buffer-fix 후 requested latch를 얻고 typed MTR memo에 기록 |
| Normal release shape | Matching `pgbuf_unfix()`가 holder/fcnt/latch debt를 정리 | Content unlock과 unpin을 독립 수행; combined helper도 존재 | MTR memo release가 latch를 먼저 풀고 `buf_fix_count`를 낮춤 |
| 판정 | 기준 mechanism | Partial analogy | Partial analogy |

세 엔진 모두 “frame을 재사용하지 못하게 하고 bytes를 보호한다”는 responsibility는 공유한다. 그러나
ownership unit과 pin/latch lifetime이 다르므로 완전한 `equivalent`가 아니다.

## 3. CUBRID: thread ownership 안에서 fix와 latch를 결합한다

CUBRID의 정상 `pgbuf_fix()` 성공은 한 번에 다음 debt를 만든다.

1. 요청한 `VPID`가 resident BCB/frame identity에 결속된다.
2. BCB의 global `fcnt`가 이 fix를 반영하여 replacement를 막는다.
3. Current thread의 holder가 BCB와 nested `fix_count`를 기록한다.
4. 요청한 READ/WRITE latch가 grant된다.
5. Caller는 matching `pgbuf_unfix()`까지 유효한 borrowed `PAGE_PTR`를 받는다.

```text
thread
  └─ pgbuf_fix(VPID, latch_mode)
       ├─ BCB fcnt                    # 모든 thread의 fix 합계
       ├─ thread holder.fix_count     # 이 thread의 nested ownership
       └─ READ/WRITE latch            # resident bytes 보호
            ↓
         PAGE_PTR
            ↓
       pgbuf_unfix()
```

`fcnt`와 holder는 중복 장부가 아니다.

- `fcnt`는 “누구든 이 frame을 아직 참조하는가”를 나타내 replacement safety를 제공한다.
- `holder.fix_count`는 “이 thread가 matching unfix를 몇 번 더 해야 하는가”를 나타낸다.
- Holder는 existing-holder reentry, promotion, dirty history와 ownership validation에 쓰인다.

즉 CUBRID에서는 frame lifetime과 content latch가 `pgbuf_fix()`/`pgbuf_unfix()` Interface에 강하게 결합된다.

## 4. PostgreSQL: pin lifetime과 content-lock lifetime을 분리한다

PostgreSQL의 pin은 buffer frame을 replacement에서 제외한다. Content lock은 같은 frame의 page bytes를
shared 또는 exclusive mode로 보호한다. 두 operation은 별도 Interface다.

### 4.1 Shared refcount와 `PrivateRefCount`가 둘 다 필요한 이유

Normal shared-buffer pin path는 다음처럼 동작한다.

1. 이 backend가 buffer를 처음 pin하면 descriptor의 shared refcount를 증가시킨다.
2. 같은 backend가 같은 buffer를 nested pin하면 backend-local `PrivateRefCount`만 증가시킨다.
3. Nested unpin은 local count를 감소시킨다.
4. 마지막 local pin을 놓을 때 shared refcount를 감소시킨다.

이 배치는 두 책임을 나눈다.

- Shared refcount는 다른 backend와 replacement code가 보는 전역 residency barrier다.
- `PrivateRefCount`는 이 backend 내부의 nested pin debt다.
- `ResourceOwner`는 error unwind나 scope cleanup에서 pin 누수를 찾고 정리하는 owner다.

Normal nested pin마다 shared atomic counter를 다시 건드리지 않아도 되므로 shared-state contention도 줄일 수 있다.
이는 source 구조에서 얻는 design consequence이며, 모든 workload의 성능 우위를 보장한다는 주장은 아니다.

### 4.2 Content lock이 별도인 이유

Pin과 content lock은 보호 대상과 필요한 시간이 다르다.

```text
ReadBuffer / PinBuffer
  │ frame identity와 residency 유지
  ├─ LockBuffer(SHARE)
  │    page bytes 읽기
  ├─ UnlockBuffer
  │    frame은 여전히 pinned일 수 있지만 bytes는 다시 변할 수 있음
  └─ ReleaseBuffer
       frame reuse 허용 가능
```

이 분리로 backend는 buffer handle과 frame identity를 유지하면서, bytes를 실제로 읽거나 수정하는 짧은 구간에만
content lock을 잡을 수 있다. Lock을 해제한 뒤 pin만 남았다면 다음은 구분해야 한다.

- **여전히 보장됨:** buffer가 다른 page identity용 frame으로 reuse되지 않는다.
- **더 이상 보장되지 않음:** 이전에 읽은 page bytes와 page-local state가 그대로 유지된다.

`UnlockReleaseBuffer()`는 흔한 “unlock + final unpin” 조합을 한 번에 수행하는 convenience Interface다. 이 helper의
존재는 pin과 content lock이 개념적으로 같은 보호라는 뜻이 아니다.

## 5. MySQL/InnoDB: low-level state는 분리하고 MTR scope로 lifetime을 묶는다

### 5.1 `buf_fix_count`

InnoDB의 `buf_fix_count`는 resident `buf_page_t`에 있는 atomic count다. Page lookup이 성공하면
`buf_block_fix()`가 이를 증가시킨다. Nonzero fix count는 해당 block이 caller에게 사용 중임을 뜻하므로 ordinary
LRU eviction/reuse 후보가 될 수 없다.

`buf_fix_count` 자체는 다음을 알려 주지 않는다.

- 어느 mini-transaction이 fix를 소유하는가
- S/SX/X latch 중 무엇을 소유하는가
- 어느 source caller가 fix를 만들었는가

이 ownership과 release debt는 MTR memo가 보완한다.

### 5.2 MTR은 SQL transaction이 아니다

MTR은 **mini-transaction**이다. InnoDB 내부에서 짧은 page operation의 latch/fix와 redo-producing 변경을
하나의 제한된 lifetime으로 관리한다. 하나의 SQL transaction 안에서 많은 MTR이 시작되고 끝날 수 있다.

MTR memo는 그 `mtr_t`가 획득한 resource를 기록하는 stack이다. Page fetch는 requested latch에 따라 block과
resource type을 memo에 넣는다.

| Memo type | 의미 |
|---|---|
| `MTR_MEMO_BUF_FIX` | Buffer fix만 보유하고 page latch는 없음 |
| `MTR_MEMO_PAGE_S_FIX` | Buffer fix + S latch |
| `MTR_MEMO_PAGE_SX_FIX` | Buffer fix + SX latch |
| `MTR_MEMO_PAGE_X_FIX` | Buffer fix + X latch |

따라서 InnoDB의 low-level replacement count와 page latch는 분리된 state다. `RW_NO_LATCH` fetch도 가능하다.
하지만 일반 page fetch에서는 “어느 block을 어떤 latch mode로 fix했는가”를 typed memo slot 하나에 기록하여
MTR lifetime에 결합한다.

### 5.3 Acquire와 release 순서

Normal resident-hit 흐름을 단순화하면 다음과 같다.

```text
page hash lookup
  → buf_block_fix(block)              # buf_fix_count++
  → read-I/O completion/state 확인
  → requested S/SX/X latch 획득
  → mtr_memo_push(block, FIX_TYPE)    # MTR이 release debt 소유
  → caller가 page bytes 사용
  → MTR memo release
       1. page latch release
       2. buf_block_unfix(block)       # buf_fix_count--
```

Release에서 latch가 먼저인 이유는 latch 해제 동작이 아직 `block`을 참조하기 때문이다. 먼저 unfix해서 replacement를
허용하면 latch release가 reuse된 block을 dereference할 수 있다.

이 때문에 InnoDB의 ownership 주체를 단순히 “current thread”라고만 부르면 부족하다. 실행은 thread가 하지만,
정상 page-resource lifetime과 cleanup 단위는 `mtr_t`와 그 memo다.

## 6. Pin/latch 결합 위치와 ownership 차이

### CUBRID

```text
Owner: thread holder
Acquire: pgbuf_fix = global fix + holder + requested latch
Release: matching pgbuf_unfix
Coupling: 강함
```

동일 thread의 nested fix와 latch reentry/promotion을 holder가 직접 관리한다. Caller가 성공한 fix마다 matching
unfix를 호출해야 한다.

### PostgreSQL

```text
Owner: backend-local PrivateRefCount + ResourceOwner
Acquire: pin, then optional/required content lock
Release: unlock and unpin are independently selectable
Coupling: 약함
```

Pin을 유지한 채 content lock만 짧게 잡을 수 있다. 반대로 page bytes를 안전하게 dereference하려면 pin만으로는
부족하고 operation에 맞는 content lock 규칙을 따라야 한다.

### MySQL/InnoDB

```text
Owner: mtr_t memo
Acquire: buf_fix_count++, requested latch, typed memo push
Release: memo-driven latch release, then unfix
Coupling: low-level state는 분리, normal MTR lifetime에서는 함께 묶임
```

CUBRID와 마찬가지로 normal fetch가 fix와 requested latch를 함께 준비하지만, ownership을 thread holder가 아니라
mini-transaction resource scope가 가진다는 차이가 있다.

## 7. 같은 scenario로 비교하기

한 worker가 B-tree를 따라 data page를 읽고, 이어 page를 수정한다고 가정한다.

| Phase | CUBRID | PostgreSQL | MySQL/InnoDB |
|---|---|---|---|
| Frame 확보 | `pgbuf_fix()`가 `fcnt`와 holder를 함께 만든다 | Read/Buffer API가 pin을 만든다 | Fetch가 `buf_fix_count`를 올린다 |
| Read protection | READ latch가 fix 성공 contract에 포함된다 | 별도 shared content lock을 잡는다 | S latch를 잡고 `MTR_MEMO_PAGE_S_FIX` 기록 |
| Write protection | WRITE fix 또는 promotion | 별도 exclusive content lock | X/SX latch type의 MTR memo entry |
| Nested ownership | Thread holder `fix_count` | Backend `PrivateRefCount` | MTR memo slot/resource lifetime |
| Release | `pgbuf_unfix()` | Unlock과 `ReleaseBuffer()` | MTR memo가 latch→unfix 순서로 release |
| Error cleanup owner | Caller cleanup + thread holder backstop | `ResourceOwner` | MTR cleanup/commit path |

이 표에서 direct equivalent라고 말할 수 있는 것은 좁은 invariant뿐이다.

> Caller가 frame을 사용하는 동안 replacement가 그 frame을 다른 page identity로 reuse해서는 안 되며,
> mutable page bytes에 접근할 때는 engine이 정한 content-protection protocol을 지켜야 한다.

그 invariant를 구현하는 owner, count와 latch API, release scope는 서로 다르다.

## 8. 흔한 오해

### “PostgreSQL pin은 CUBRID fix와 같다”

Replacement protection 축에서는 가깝다. 그러나 CUBRID normal fix는 requested page latch와 thread holder까지 같은
Interface에 결합하고, PostgreSQL pin은 content lock과 분리된다. 따라서 partial analogy다.

### “InnoDB `buf_fix_count`가 page latch다”

아니다. `buf_fix_count`는 replacement protection이고 `buf_block_t::lock`이 content latch다.

### “MTR은 짧은 SQL transaction이다”

아니다. MTR은 InnoDB 내부 resource/logging scope다. 한 SQL transaction이 여러 MTR을 포함할 수 있다.

### “MTR memo가 있으므로 count는 필요 없다”

아니다. Memo는 어느 MTR이 무엇을 release해야 하는지 기록한다. Global buffer-pool replacement code는 각 MTR의
memo를 탐색하지 않고 `buf_fix_count`로 block 사용 여부를 판단한다.

### “Pin/fix가 있으면 latch 없이 page bytes를 읽어도 된다”

일반적으로 아니다. Pin/fix는 frame identity를 지키고 latch/content lock은 byte consistency를 지킨다. Engine과
특수 path가 명시한 별도 invariant가 없는 한 둘을 대체해서는 안 된다.

## 9. Code review 질문

Page-buffer caller를 review할 때 다음 순서로 묻는다.

1. 어떤 logical page identity를 요청하는가.
2. 어느 operation이 frame replacement를 막는가.
3. 어느 object가 nested ownership과 release debt를 기록하는가.
4. 어느 latch/content lock이 bytes를 보호하며 mode는 무엇인가.
5. Pin/fix와 content protection은 같은 lifetime인가, 독립 lifetime인가.
6. Error, restart, early return에서 누가 모든 debt를 정리하는가.
7. Release 순서가 마지막 object dereference보다 앞서지는 않는가.
8. Counter가 0이 되는 것과 page가 clean/durable한 것을 혼동하지 않았는가.

## 10. Source anchors

### CUBRID

- `PGBUF_HOLDER`와 nested `fix_count`: `src/storage/page_buffer.c:460-488`
- `pgbuf_fix_release()` lifecycle: `src/storage/page_buffer.c:2256-2679`
- `pgbuf_unfix()`와 holder/global count release: `src/storage/page_buffer.c:3062-3201`
- Latch grant, reentry와 promotion: `src/storage/page_buffer.c:6277-6634`
- Unfix의 final latch/LRU/wakeup 처리: `src/storage/page_buffer.c:6636-6883`

### PostgreSQL

- `PrivateRefCountData`: `src/backend/storage/buffer/bufmgr.c:98-130`
- `PinBuffer()`: `src/backend/storage/buffer/bufmgr.c:3269-3386`
- `TrackNewBufferPin()`: `src/backend/storage/buffer/bufmgr.c:3535-3554`
- `UnlockReleaseBuffer()`: `src/backend/storage/buffer/bufmgr.c:5620-5682`
- Conditional content lock: `src/backend/storage/buffer/bufmgr.c:6061-6107`

### MySQL/InnoDB

- `buf_block_fix()` / `buf_block_unfix()`: `storage/innobase/include/buf0buf.ic:756-798`
- `Buf_fetch_normal::get()`: `storage/innobase/buf/buf0buf.cc:3696-3745`
- `Buf_fetch<T>::mtr_add_page()`: `storage/innobase/buf/buf0buf.cc:4148-4180`
- `Buf_fetch<T>::single_page()`: `storage/innobase/buf/buf0buf.cc:4294-4443`
- MTR memo types: `storage/innobase/include/mtr0types.h:285-301`
- `mtr_t::memo_push()`: `storage/innobase/include/mtr0mtr.ic:38-53`
- `memo_slot_release()`: `storage/innobase/mtr/mtr0mtr.cc:243-296`

더 넓은 durability, miss publication과 replacement-policy 비교는
[`page-buffer-teaching-material.md` §17](./page-buffer-teaching-material.md#17-postgresqlinnodb와-비교할-때의-안전선)과
[`source-inventory.md`](./source-inventory.md)를 함께 본다.

## 11. 한 문장 model answers

- **PostgreSQL:** Pin은 frame identity/residency를, content lock은 page bytes의 concurrency를 보호하므로 두 lifetime을 분리한다.
- **InnoDB:** `buf_fix_count`는 replacement barrier이고 MTR memo는 이 mini-transaction이 가진 fix/latch resource와 release debt를 기록한다.
- **CUBRID:** `pgbuf_fix()`는 global `fcnt`, per-thread holder와 requested latch를 한 borrowed-`PAGE_PTR` lifetime으로 결합한다.
- **Comparison:** 세 엔진의 safety goal은 비슷하지만 owner와 acquire/release seam이 달라 partial analogy다.
