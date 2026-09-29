# Experiment and Quiz Designer Packet

- **Role**: Experiment and Quiz Designer (read-only planning)
- **Topic**: CUBRID `pgbuf_fix()` 중심 page-buffer 생명주기 — lookup/load, latch/holder/unfix, caller contract, dirty/WAL/flush/replacement
- **Declared Scope digest**: `sha256:796828eab6754ed60bd88d65be34913c7d510e61b61d9a06e73f5340faae2d08`
- **Active CUBRID verification root / revision**: `/home/vimkim/gh/cb/pgbuf-grill` / `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`
- **Source provenance**: active replay는 clean detached worktree와 sealed build를 사용했다. 이 packet은 원래 read-only 설계안으로 작성되었고 source를 수정하지 않았다.
- **Packet timestamp (UTC)**: `2026-08-28T07:31:43Z`
- **Contract**: 이 문서는 실행 전 설계안이다. build, database/service, Experiment, Quiz를 실행하지 않았고 source/final Book/report를 수정하지 않았다. 실제 `experiments/`와 `quiz/` directory도 만들지 않았다.

## 1. 결론과 관측 경계

네 Experiment 모두 source instrumentation 없이 현행 CUBRID counter와 SQL-visible invariant를 사용하도록 설계했다. mandatory observation은 verifier schema v1이 인정하는 하나의 hashed SQL file을 sealed `csql -i` argv로 직접 실행한다. utility setup/cleanup과 `statdump`/`backupdb`는 별도 captured run이다.

Runtime으로 강하게 판별할 수 있는 범위는 다음과 같다.

1. 같은 logical workload의 cold first scan과 warm second scan이 서로 다른 `OLD_*`/`OLD_PAGE_IN_PB` fix 분포와 physical read delta를 보이는가.
2. read-only와 write workload가 `READ` 대 `WRITE`/`MIXED`, `HOLDER_NON_DIRTY` 대 `HOLDER_DIRTY` unfix 분포를 다르게 만드는가. 단일 writer promotion이 실패 없이 일어나는가.
3. covered index scan, non-covered index scan, heap update가 각각 B-tree-only, B-tree→heap, dirty heap caller family의 서로 다른 관측 signature를 보이는가.
4. update가 dirty/log activity를 만들고, watcher가 붙은 동기 backup/checkpoint window에서 physical data-page write activity가 증가하며 restart 후 data invariant가 유지되는가.

다음 사실은 이 계획의 SQL/counter evidence만으로 runtime-confirmed라고 쓰면 안 된다.

- 정확히 어느 `VPID`가 어느 BCB/frame에 들어갔는지, DWB와 main-volume 중 miss read가 어느 쪽에서 왔는지;
- 실제 두 thread 사이 latch wait/wakeup interleaving, timeout/interrupt/conditional-failure branch;
- 한 data page의 WAL write가 그 page의 data write보다 먼저 완료된 개별 I/O 순서;
- 특정 page의 victim selection/re-dirty/replacement state transition;
- fix/unfix counter의 동수만으로 모든 error-unwind path에 leak이 없다는 일반 명제.

이 항목은 pinned source Claim과 runtime activity Claim을 분리해야 한다. 네 runtime Claim link는 각각 `CUBRID-C005`, `CUBRID-C006`, `CUBRID-C007`, `CUBRID-C008`이다.

## 2. 공통 build/runtime gate와 소유권

### 2.1 Mandatory identity gate

Main agent가 실제 artifact를 만들 때 다음 순서를 먼저 수행한다.

1. pinned CUBRID root에서 `reportctl.py record`로 literal `just build`를 `runtime-baseline-build`에 capture한다. live `cub_*` process 때문에 install gate가 실패하면 사용자 service를 임의로 중지하지 말고 hard stop한다. 실패한 run ID는 재사용하지 않는다.
2. 성공 build에 대해 `runtime-snapshot --id baseline --build-run-id runtime-baseline-build`를 실행해 absolute `$CUBRID`, `csql`, `cubrid`, `cub_server`, `cubrid_rel`과 hash를 seal한다.
3. 아래 `<SNAPSHOT_CSQL>`과 `<SNAPSHOT_CUBRID>`를 snapshot의 absolute path로 치환한다. observation timestamp는 snapshot보다 뒤여야 한다.
4. 모든 mandatory Experiment run은 Experiment directory를 cwd로 사용하고 `--runtime-tools-snapshot evidence/runtime-tools-baseline.json -- <SNAPSHOT_CSQL> ... -i experiment.sql`을 직접 실행한다. wrapper가 내부에서 `csql`을 실행하는 방식은 금지한다.

### 2.2 Shared owned runtime

네 Experiment는 생성 비용을 줄이기 위해 하나의 suite-owned DB를 공유하되 table과 backup directory는 각 Experiment가 별도로 소유한다.

| Resource | Proposed identity | Ownership/preflight |
|---|---|---|
| DB | `ca_pgbuf_f799e05` | `$CUBRID_DATABASES/databases.txt` 첫 field의 exact match가 이미 있으면 adopt/delete하지 않고 hard stop |
| runtime root | `mktemp -d`로 얻은 `/tmp/ca-pgbuf-f799e05.XXXXXXXX` | 생성 즉시 mode 0700, scope hash/commit/random nonce/realpath를 receipt에 기록 |
| DB data/log | runtime root 아래 `data/`, `log/` | `createdb` registry entry의 realpath가 owned root 안인지 검증 |
| owner table | `ca_pb_owner` | scope digest, commit, nonce가 정확히 한 row; destructive cleanup 직전 재검증 |
| workload tables | `ca_pb_e1`, `ca_pb_e2`, `ca_pb_e3`, `ca_pb_e4` | DB가 새로 생성된 뒤에만 만들고 각 Experiment receipt에 DDL/hash 저장 |
| stat watcher | Experiment 4만의 absolute output path와 process-group receipt | PID뿐 아니라 PGID, `/proc/.../starttime`, exact argv/output path를 검증한 뒤 그 group만 종료 |
| backup | Experiment 4 runtime root 아래 `backup-r1..r3` | 매 반복 전에 directory 부재 확인; report/worktree 밖의 exact owned path |

공통 setup은 exact DB만 `createdb`/`server start`한다. 전역 `cubrid service stop/start`, 기존 DB, broad process match, broad directory delete는 금지한다. 각 table cleanup은 owner row가 일치할 때 exact `DROP TABLE ca_pb_eN`만 수행한다. 최종 suite cleanup은 owner row, registry line, data/log realpath, server PID를 재검증한 뒤 exact DB만 stop/delete한다. directory cleanup은 receipt에 열거된 파일과 빈 directory만 대상으로 한다.

### 2.3 Safety flags

| Flag | Value | Meaning |
|---|---|---|
| `cubrid_runtime_only` | `true` | PostgreSQL/MySQL server는 필요 없다. |
| `source_instrumentation` | `false` | baseline source/binary를 그대로 사용한다. |
| `touches_user_database` | `false` | exact preflight로 새 suite-owned DB만 사용한다. |
| `stops_user_service` | `false` | suite-owned DB server만 stop/start한다. 다른 live process가 build gate를 막으면 authorization 없이는 중지하지 않는다. |
| `forced_crash_or_fault_injection` | `false` | kill -9, volume rename/chmod, disk-full, assertion을 사용하지 않는다. |
| `shared_config_mutation` | `false` | `cubrid.conf`의 `stats_on`, buffer size 등을 바꾸지 않는다. watcher를 먼저 붙인다. |
| `unsafe_if_ownership_unknown` | `true` | nonce/registry/realpath/process receipt 중 하나라도 불명확하면 삭제·kill 대신 hard stop한다. |

## 3. Proposed counter audit — 이름이 아니라 increment site로 정의

아래 counter만 hard/soft oracle 후보로 사용한다. 모든 위치는 pinned revision 기준이다.

| Printed name / complex family | Increment or derivation site | Verified meaning and limit |
|---|---|---|
| `Num_data_page_fetches` | `src/storage/page_buffer.c:2625` | 성공한 `pgbuf_fix()` fast path가 page type/latch/condition을 분류할 때 1 증가한다. SQL row 수나 unique page 수가 아니다. |
| `Num_data_page_ioreads` | `src/storage/page_buffer.c:8497` (fix miss load), `:4776` (현재 unused direct-copy branch) | 일반 fix miss에서 BCB 할당 후 DWB/main-volume read 시도 전에 증가한다. 성공 read만 세는 counter가 아니며 DWB hit/main-volume을 구분하지 않는다. 이 build에서 runtime experiment의 relevant site는 `:8497`이다. |
| `Num_data_page_fix_ext` | call `src/storage/page_buffer.c:2657`; add `src/base/perf_monitor.c:1183`; labels `perf_monitor.c:2353-2390` | successful fix를 module/page-type/`OLD_*` 또는 `OLD_PAGE_IN_PB`/latch/conditionality로 분류한다. `OLD_WAIT`은 BCB page-lock coordination mode이고 모든 latch-holder wait를 뜻하지 않는다. |
| `Num_data_page_unfix_ext` | call `src/storage/page_buffer.c:3186`; add `src/base/perf_monitor.c:1239`; labels `perf_monitor.c:2580-2619` | `pgbuf_unfix()` 시점의 buffer dirty-before-hold, holder-dirtied, READ/WRITE/MIXED를 분류한다. waiter wake 여부나 victimization 완료를 직접 세지 않는다. |
| `Data_page_total_promote_success/fail` and `Num_data_page_promote_ext` | call `src/storage/page_buffer.c:3049`; add `src/base/perf_monitor.c:1210-1211`; derived totals `perf_monitor.c:1933-1971` | `pgbuf_promote_read_latch()` 결과를 집계한다. single-session success는 contention wait를 증명하지 않는다. 현 call site는 detailed page type을 채우지 않아 `PAGE_UNKNOWN`으로 보일 수 있으므로 page-type oracle로 사용하지 않는다. |
| `Num_data_page_dirties` | `src/storage/page_buffer.c:11674` in `pgbuf_set_dirty_buffer_ptr()` | dirty-setting call마다 증가한다. unique dirty page 수가 아니다. |
| `Num_btree_covered` | `src/query/scan_manager.c:6757` | covered index row를 list tuple로 fetch한 횟수다. BCB fix 수가 아니다. |
| `Num_btree_noncovered` | `src/query/scan_manager.c:6693` | index OID에서 heap lookup으로 넘어가는 non-covered row 횟수다. `scan_next_index_lookup_heap()` 호출 직전에 증가한다. |
| `Num_query_iscans` | `src/query/query_executor.c:7615,7632,7647,7887` | executor가 index scan을 여는/수행하는 branch의 count다. 어떤 page latch mode인지는 말하지 않는다. |
| `Num_heap_home_updates` | `src/storage/heap_file.c:22823` | heap update가 HOME-record update case를 완료할 때 증가한다. 모든 update가 HOME이라고 보장하지 않으므로 positive이면 caller-family evidence, 0이면 실패 단정 금지. |
| `Num_log_append_records` | `src/transaction/log_page_buffer.c:4214` in `logpb_start_append()` | log record header append 시작마다 증가한다. durable flush 완료 수가 아니다. |
| `Num_log_wals` | `src/transaction/log_page_buffer.c:4166` in `logpb_flush_log_for_wal()` | supplied page LSA가 아직 WAL을 필요로 할 때만 증가한다. 0은 WAL rule 부재가 아니라 log가 이미 flush된 경우일 수 있다. |
| `Num_log_page_iowrites` | `src/transaction/log_page_buffer.c:2339`, `:3546` | single log write와 flush batch page 수를 집계한다. data-page ordering을 개별 pairing하지 않는다. |
| `Num_data_page_iowrites` | non-DWB `src/storage/page_buffer.c:10893`; DWB home writes `src/storage/double_write_buffer.cpp:2115,2150,2339`; other direct paths `page_buffer.c:4873` | physical data-page writes의 activity. DWB 때문에 한 logical page와 1:1이 아니며 backup archive bytes는 아니다. 부호(delta > 0)만 hard oracle로 쓴다. |
| `Num_data_page_flushed` | only `src/storage/page_buffer.c:4167` at end of `pgbuf_flush_victim_candidates()` | **victim-candidate flush만** 세며 checkpoint/backup/all-unfixed flush의 보편 counter가 아니다. hard oracle에서 제외한다. |
| `Num_data_page_writes` | `src/storage/page_buffer.c:10958`, only when PB-victimization activation flag is active | successful `pgbuf_bcb_flush_with_wal()` completion activity지만 activation-dependent다. context/soft evidence만 사용한다. |

`Data_page_buffer_hit_ratio`는 `Num_data_page_fetches`와 `Num_data_page_ioreads`에서 계산된다 (`src/base/perf_monitor.c:1912-1915`). 복합 workload 전체 평균이라 first/second scan의 단독 오라클로 쓰지 않고, 각 `.x_hist` section의 두 원 counter를 직접 판정한다.

## 4. Experiment 1 — `fix-lookup-load` / `CUBRID-C005`

### Question → Hypothesis

**Question**: server restart로 page buffer를 cold하게 만든 뒤 같은 heap table을 같은 `csql` session에서 두 번 full scan하면, 첫 scan의 miss/load와 두 번째 scan의 resident hit를 counter signature로 구별할 수 있는가?

**Hypothesis**:

- first section은 `Num_data_page_ioreads > 0`이고 `Num_data_page_fix_ext`에 `OLD_NO_WAIT` 또는 `OLD_WAIT`가 나타난다.
- second section은 동일 checksum을 반환하고 `OLD_PAGE_IN_PB` count가 first보다 크며, `Num_data_page_ioreads(second) < Num_data_page_ioreads(first)`다.
- 충분히 작은 20–40 MiB table을 현재 pool에 유지한다면 second ioreads는 0에 가까워야 하지만, hard oracle은 정확한 0이 아니라 strict decrease다.

### Setup

1. suite owner row를 확인한다.
2. `ca_pb_e1(id INT PRIMARY KEY, payload VARCHAR(1000))`를 만들고 20,000 rows를 fixed payload로 넣어 commit한다. exact row count와 `SUM(id)`, payload-length violation 0을 capture한다.
3. setup DB activity를 disk에 내리기 위해 Experiment-owned scratch backup을 한 번 수행한 뒤 제거하거나 exact DB를 정상 stop/start한다.
4. **cold boundary는 suite-owned `ca_pgbuf_f799e05` server만 정상 stop/start**하고 readiness를 bounded poll하여 만든다. global service는 건드리지 않는다. 다른 DB server는 중지하지 않는다.

### Mandatory SQL runner concept

Runner path: `experiments/experiment-1/experiment.sql`

```sql
;set communication_histogram=yes
;.hist on
SELECT 'E1_FIRST' AS phase,
       COUNT(*) AS n,
       SUM(id) AS id_sum,
       SUM(LENGTH(payload)) AS payload_sum
  FROM ca_pb_e1;
;.x_hist

SELECT 'E1_SECOND' AS phase,
       COUNT(*) AS n,
       SUM(id) AS id_sum,
       SUM(LENGTH(payload)) AS payload_sum
  FROM ca_pb_e1;
;.dump_hist
```

Manifest `runner_argv` after snapshot substitution:

```text
["<SNAPSHOT_CSQL>", "-u", "dba", "ca_pgbuf_f799e05", "-i", "experiment.sql"]
```

The runner is executed directly three times, but each repetition gets a fresh exact DB stop/start before the runner so “first” remains cold. Proposed IDs: `exp1-fix-lookup-load-r1..r3`.

### Action

For each repetition: verify owner → normal stop/start exact DB → wait ready → direct runner → parse two histogram sections → capture `SHOW PAGE BUFFER STATUS` as context.

### Observation

Raw observation consists of the two checksums, `Num_data_page_ioreads`, `Num_data_page_fetches`, and `Num_data_page_fix_ext` mode totals.

### Controls

- **Positive**: first cold scan must have positive `Num_data_page_ioreads` and exact checksum.
- **Negative/warm**: immediately repeated scan must return the same checksum with lower ioreads and a resident-hit signature.
- Table size is recorded against `SHOW PAGE BUFFER STATUS`/configured buffer context; if it cannot remain resident, lower strict-decrease assumption is invalid and the dataset must be resized before accepting the Experiment.

### Stable oracle

For all 3 repetitions:

1. `n=20000`, `id_sum=200010000`, `payload_sum=20000000` in both sections.
2. `first_ioreads > 0`.
3. `second_ioreads < first_ioreads`.
4. second `OLD_PAGE_IN_PB` fix total is positive and greater than first's corresponding total.
5. direct `csql` exits 0; no error diagnostics.

Do not require an exact count: catalog pages, query plan, prefetch, DWB and background activity vary.

### Interpretation

The result supports a source+runtime Claim that the same SQL path exercises the miss/load and resident-hit halves of the existing fix interface. Source ties the relevant transitions to hash lookup (`page_buffer.c:2383`), miss BCB claim (`:2416`), disk/DWB read counter (`:8497`), and successful fix classification (`:2625-2657`). It does not reveal exact frame identity or prove every error/retry branch.

### Alternative explanations

- OS page cache may make the physical device fast, but `Num_data_page_ioreads` still identifies CUBRID buffer miss read attempts, not device latency.
- optimizer/catalog work contributes counters; identical query and per-section clear bound this, not eliminate it.
- pages may be prefetched or evicted between scans. Strict decrease across 3 repetitions is the invariant; exact hit ratio is not.
- DWB may satisfy a read before main volume. Counter cannot distinguish it, so Claim says “DWB/main-volume load seam.”

### Cleanup

After all repetitions, exact owner check then `DROP TABLE ca_pb_e1`; confirm class absence. Do not delete shared DB until Experiment 4 completes. `unsafe=false`, `user_service_stop=false`, `instrumentation=false` under the ownership preconditions above.

## 5. Experiment 2 — `latch-holder-unfix` / `CUBRID-C006`

### Question → Hypothesis

**Question**: read-only scan과 single-writer B-tree insert workload가 holder/unfix와 read→write promotion counter에서 서로 다른, 반복 가능한 signature를 만드는가?

**Hypothesis**:

- read control에는 `Data_page_total_promote_success=0`, `...fail=0`이고 `Num_data_page_unfix_ext`의 PAGE_HEAP/BTREE READ + HOLDER_NON_DIRTY rows가 양수다.
- monotonic primary-key INSERT에는 promotion success가 양수이고 fail은 0이며, WRITE 또는 MIXED + HOLDER_DIRTY unfix rows가 양수다.
- statement/commit boundary 뒤 section별 `sum(Num_data_page_fix_ext) == sum(Num_data_page_unfix_ext)`가 smoke run에서 성립하면 balance oracle로 승격한다. 성립하지 않으면 retained/system-page reason을 조사하고 **동수를 억지 hard oracle로 두지 않는다**.

### Setup

`ca_pb_e2(id INT PRIMARY KEY, payload VARCHAR(200))`를 빈 table로 만든다. read control은 `db_root` constant query가 아니라 이 table의 explicit read를 사용한다. 각 repetition은 table을 새로 비우는 대신 non-overlapping ID range를 써 동일 runner hash를 유지하도록 `ca_pb_e2_runseq` owner state를 둘 수 있지만, 가장 단순하고 deterministic한 artifact는 Experiment-owned DB/table을 repetition마다 exact drop/recreate하는 captured setup이다.

### Mandatory SQL runner concept

Runner path: `experiments/experiment-2/experiment.sql`

```sql
;set communication_histogram=yes
;.hist on
SELECT 'E2_READ' AS phase, COUNT(*), COALESCE(SUM(id), 0)
  FROM ca_pb_e2;
;.x_hist

INSERT INTO ca_pb_e2
SELECT LEVEL, REPEAT('p', 160)
  FROM db_root
CONNECT BY LEVEL <= 20000;
COMMIT WORK;
SELECT 'E2_WRITE_CHECK' AS phase, COUNT(*), SUM(id)
  FROM ca_pb_e2;
;.dump_hist
```

Manifest `runner_argv`:

```text
["<SNAPSHOT_CSQL>", "-u", "dba", "ca_pgbuf_f799e05", "-i", "experiment.sql"]
```

Three direct repetitions use a fresh empty `ca_pb_e2`; proposed IDs `exp2-latch-holder-unfix-r1..r3`.

### Action

Parse each `.x_hist` section separately. The playbook reports 20,000 monotonic PK inserts as a fast deterministic source of many successful promotions in a single session; the oracle uses only positive magnitude and fail=0, never the exact ~88k count.

### Observation

Observe `Num_data_page_promote_ext`, derived promote success/fail, `Num_data_page_fix_ext`, `Num_data_page_unfix_ext`, `Num_data_page_dirties`, exact row count/sum, and any errors.

### Controls

- **Negative**: empty-table read has no promotion and PAGE_HEAP/BTREE access remains READ + HOLDER_NON_DIRTY. Unrelated PAGE_QRESULT/system activity is recorded rather than generalized away.
- **Positive**: PK insert produces promotion success and dirty write/mixed unfix.
- **No concurrency claim**: one session deliberately removes competing readers; therefore fail=0 is expected and is not proof that contention handling is correct.

### Stable oracle

For all 3 repetitions:

1. final `COUNT(*)=20000`, `SUM(id)=200010000`.
2. read section promotion success/fail both 0; PAGE_HEAP/BTREE READ + HOLDER_NON_DIRTY unfix total > 0.
3. write section promotion success > 0, promotion fail = 0.
4. write section has `Num_data_page_dirties > 0` and at least one WRITE or MIXED + HOLDER_DIRTY unfix category.
5. Optional balance oracle only after smoke validation: successful fix-ext total equals unfix-ext total after statement/commit completion. Preserve raw mismatch rather than normalizing it away.

### Interpretation

The observation ties SQL activity to actual holder metadata captured at `pgbuf_unfix()` and to successful read-latch promotion. Source supplies the causal mechanism: a sole holder can atomically change latch mode to WRITE (`page_buffer.c:2904-2922`); competing holders cause fail or block depending on condition (`:2924-2999`); unfix records holder dirty/latch state (`:3157-3188`), decrements global fix count, changes zero-count latch to `NO_LATCH`, makes LRU placement decisions, and wakes waiters (`:6650-6898`). Runtime does not exercise the competing-reader branch.

### Alternative explanations

- Promotion counter is dominated by B-tree implementation choices, not one promotion per SQL row; exact count is meaningless.
- An unfix row marked `BUF_DIRTY` may have inherited dirty state before this holder. `HOLDER_DIRTY` is the narrower indication that this holder dirtied it.
- READ/MIXED/WRITE describes a holder's history at unfix, not continuous ownership of a single latch mode.
- Equal aggregate fix/unfix counts in one session cannot rule out compensated leaks elsewhere or failed-fix branches that never returned a page.

### Cleanup

Verify owner and exact row invariant, drop only `ca_pb_e2`, confirm absence. No concurrent helper processes. `unsafe=false`, `user_service_stop=false`, `instrumentation=false` under ownership preconditions.

## 6. Experiment 3 — `caller-contracts` / `CUBRID-C007`

### Question → Hypothesis

**Question**: 같은 B-tree index에 대해 covered read, non-covered read, heap update를 순서대로 실행하면 caller가 요구한 page families와 dirty/release obligations가 서로 다른 counter signature로 드러나는가?

**Hypothesis**:

- covered range query: `Num_query_iscans > 0`, `Num_btree_covered > 0`, `Num_btree_noncovered = 0`, BTREE page fix/unfix가 관찰된다.
- non-covered range query: `Num_query_iscans > 0`, `Num_btree_noncovered > 0`, BTREE와 HEAP page fix/unfix가 모두 관찰된다.
- UPDATE: write/mixed + HOLDER_DIRTY HEAP unfix와 `Num_data_page_dirties > 0`; affected-row/data checksum exact.

### Setup

```sql
CREATE TABLE ca_pb_e3 (
  id INT NOT NULL,
  payload VARCHAR(200) NOT NULL,
  generation INT NOT NULL,
  CONSTRAINT pk_ca_pb_e3 PRIMARY KEY (id)
);
INSERT INTO ca_pb_e3
SELECT LEVEL, REPEAT('q', 160), 0
  FROM db_root
CONNECT BY LEVEL <= 20000;
COMMIT WORK;
```

Capture plan output once to prove both read queries use `pk_ca_pb_e3`. If this pinned optimizer does not choose it, add CUBRID's validated `USING INDEX pk_ca_pb_e3` syntax to both queries before hashing; never accept a sequential-scan run while labeling it an index caller experiment.

### Mandatory SQL runner concept

Runner path: `experiments/experiment-3/experiment.sql`

```sql
;set communication_histogram=yes
;.hist on
SELECT 'E3_COVERED' AS phase, SUM(id)
  FROM ca_pb_e3
 WHERE id BETWEEN 1001 AND 1100;
;.x_hist

SELECT 'E3_NONCOVERED' AS phase, SUM(LENGTH(payload))
  FROM ca_pb_e3
 WHERE id BETWEEN 1001 AND 1100;
;.x_hist

UPDATE ca_pb_e3
   SET generation = generation + 1,
       payload = REPEAT('r', 160)
 WHERE id BETWEEN 1001 AND 1100;
COMMIT WORK;
SELECT 'E3_UPDATE_CHECK' AS phase,
       COUNT(*), SUM(generation),
       SUM(CASE WHEN LENGTH(payload) = 160 THEN 0 ELSE 1 END)
  FROM ca_pb_e3
 WHERE id BETWEEN 1001 AND 1100;
;.dump_hist
```

Manifest `runner_argv`:

```text
["<SNAPSHOT_CSQL>", "-u", "dba", "ca_pgbuf_f799e05", "-i", "experiment.sql"]
```

Each of 3 repetitions recreates `ca_pb_e3`; proposed IDs `exp3-caller-contracts-r1..r3`.

### Action

Run direct SQL and split three histogram sections. Record query plans as separate captured setup evidence, not as the mandatory observation runner.

### Observation

Extract index/covered/noncovered counters and aggregate `Num_data_page_fix_ext`/`unfix_ext` by PAGE_BTREE_* and PAGE_HEAP.

### Controls

- **Within-run negative pair**: covered query must not increment non-covered counter; non-covered query must increment it.
- **Read/write pair**: both read phases should have no holder-dirtied page caused by the query; update must show positive dirty/write-holder activity.
- Exact row ranges and payload length prevent result equivalence from hiding the wrong access path.

### Stable oracle

For all 3 repetitions:

1. covered result `SUM(id)=105050`; `Num_query_iscans > 0`, `Num_btree_covered > 0`, `Num_btree_noncovered=0`.
2. non-covered result payload sum `16000`; `Num_query_iscans > 0`, `Num_btree_noncovered > 0`, and both BTREE and HEAP successful fix/unfix totals > 0.
3. update check returns 100 rows, generation sum 100, length-violation 0.
4. update section `Num_data_page_dirties > 0` and HEAP WRITE or MIXED + HOLDER_DIRTY unfix > 0.
5. plans identify `pk_ca_pb_e3`; otherwise run is rejected rather than reinterpreted.

### Interpretation

This supports the runtime half of `CUBRID-C007`: different storage callers use the same `pgbuf_*` interface but demand different page families and release/dirty behavior. `scan_manager.c:6693` is direct evidence that a non-covered index row crosses into `scan_next_index_lookup_heap()`, while `:6757` stays covered. The extended fix/unfix arrays then show the page-buffer side of those caller families. Runtime does not establish every heap/B-tree error cleanup path, `PGBUF_WATCHER` rank ordering, or conditional child-fix deadlock avoidance; those remain source obligations.

### Alternative explanations

- optimizer changes can switch to sequential scan. Captured plan is therefore a precondition, not a decorative artifact.
- PAGE_HEAP counters can include catalog/MVCC-related heap access; the covered/noncovered pair and section clearing bound attribution but do not identify each `VPID`.
- `Num_heap_home_updates` may remain 0 if record form is not HOME; it is context only, not a hard oracle.
- `HOLDER_DIRTY` proves the holder invoked dirty marking, not that logging/page-LSA order was correct.

### Cleanup

Verify row invariant and owner, drop exact `ca_pb_e3`, confirm absence. `unsafe=false`, `user_service_stop=false`, `instrumentation=false` under ownership preconditions.

## 7. Experiment 4 — `dirty-wal-flush-replace` / `CUBRID-C008`

### Question → Hypothesis

**Question**: owned DB의 logged UPDATE가 dirty/log activity를 만든 뒤 `backupdb -C`가 요구하는 synchronous checkpoint/flush window를 완료하면, watcher가 붙은 상태에서 physical data-page writes와 restart 후 data invariant를 반복 관찰할 수 있는가?

**Hypothesis**:

- mandatory csql phase는 `Num_data_page_dirties > 0`, `Num_log_append_records > 0`, exact generation/checksum을 남긴다.
- workload 전에 attach한 global interval `statdump` watcher는 `backupdb -D <scratch> -C -r <db>`가 return한 active window에서 `Num_data_page_iowrites(after) > before`를 보인다.
- exact DB 정상 stop/start 뒤 generation/checksum은 유지된다.
- `Num_data_page_flushed`는 0이어도 실패가 아니다. 이 counter는 victim flush 전용이다.

### Setup

Create `ca_pb_e4(id INT PRIMARY KEY, payload VARCHAR(1000), generation INT)` with 20,000 rows, generation 0, fixed 800-byte payload; commit and perform a control backup to drain setup dirties. Create Experiment-owned `backup-r1..r3` only after absence checks. Start one `cubrid statdump -i 1 -c -o <absolute-owned-path> ca_pgbuf_f799e05` watcher in a dedicated process group before each workload window.

Watcher ownership receipt must record wrapper and real child cmdlines. On cleanup, exact output path + DB + install-root + PGID + `/proc` starttime must all match. If wrapper exits but a child survives, locate only the receipt-owned process and stop it; ambiguous ownership is a hard stop.

### Mandatory SQL runner concept

Runner path: `experiments/experiment-4/experiment.sql`

```sql
;set communication_histogram=yes
;.hist on
UPDATE ca_pb_e4
   SET generation = generation + 1,
       payload = REPEAT(CHR(65 + MOD(id, 20)), 800);
COMMIT WORK;
SELECT 'E4_CHECK' AS phase,
       COUNT(*) AS n,
       MIN(generation) AS min_gen,
       MAX(generation) AS max_gen,
       SUM(CASE WHEN LENGTH(payload) = 800 THEN 0 ELSE 1 END) AS violations
  FROM ca_pb_e4;
;.dump_hist
```

Manifest `runner_argv`:

```text
["<SNAPSHOT_CSQL>", "-u", "dba", "ca_pgbuf_f799e05", "-i", "experiment.sql"]
```

Because the same runner increments generation, it runs 3 times on the same table. Expected generation for repetition `r` is `r`; proposed IDs `exp4-dirty-wal-flush-r1..r3`.

### Action

For each repetition:

1. verify owner and current generation `r-1`;
2. start owned watcher and prove it is actively sampling before workload;
3. take cumulative/global before snapshot;
4. direct mandatory `csql` runner;
5. run separately captured synchronous trigger:

```text
["<SNAPSHOT_CUBRID>", "backupdb", "-D", "<ABS_OWNED_BACKUP_RN>", "-C", "-r", "ca_pgbuf_f799e05"]
```

6. take after snapshot, stop the exact watcher, verify no owned watcher remains;
7. direct read-only verifier checks generation/checksum;
8. after r3, normally stop/start exact DB and repeat verifier.

Use distinct setup/backup/watcher/verify run IDs. Only the three direct `experiment.sql` runs belong in the Experiment manifest `run_ids`; ancillary captured evidence is referenced from `experiment.md`/Claim evidence without pretending its argv equals `runner_argv`.

### Observation

For each repetition preserve the mandatory histogram, watcher samples bracketing the backup window, backup exit/output, generation verifier output, and final restart verifier. Parse only deltas from the same watcher lifetime.

### Controls

- **Negative control**: after the initial control backup and before each update, a bounded idle watcher interval is captured. Background I/O may be nonzero, so hard control is “no generation change,” not “all counters zero.”
- **Positive control**: generation advances exactly once per mandatory runner; dirty and log-append counters are positive.
- **Counter-semantic control**: record `Num_data_page_flushed` but explicitly allow zero while requiring positive `Num_data_page_iowrites` delta.
- **Durability control**: clean restart readability after r3. This is not crash-recovery proof.

### Stable oracle

1. For repetition `r`, `n=20000`, `min_gen=max_gen=r`, violations 0.
2. Each mandatory histogram has `Num_data_page_dirties > 0` and `Num_log_append_records > 0`.
3. Each watcher-backed backup window has positive `Num_data_page_iowrites` delta after subtracting/recording the immediately preceding cumulative snapshot; exact magnitude is not asserted.
4. `backupdb` returns exit 0 and expected owned backup artifacts exist inside the receipt-bound directory.
5. After normal exact-DB restart, `n=20000`, generation 3, violations 0.
6. watcher/process/backup cleanup is exact; no Experiment-owned process remains.

`Num_log_wals` and `Num_log_page_iowrites` are explanatory context. Either may be 0 in a particular per-transaction section because log flushing can happen in daemon/system context or already be current. They are never required to establish WAL correctness.

### Interpretation

The result supports a narrow source+runtime Claim: logged mutation creates dirty/log activity and a synchronous CUBRID-owned flush trigger produces physical data-page write activity while preserving data across clean restart. Source establishes the ordering that the counters cannot: first dirty transition captures `oldest_unflush_lsa` in `pgbuf_set_lsa()` (`page_buffer.c:5043-5070`); `pgbuf_bcb_flush_with_wal()` copies page/LSA, releases BCB mutex, calls `logpb_flush_log_for_wal()` before DWB/direct data write (`:10786-10898`); WAL flush itself rechecks need under log CS (`log_page_buffer.c:4155-4180`). Victim flush separately refuses fixed/hot pages and initially skips pages needing WAL (`page_buffer.c:4054-4077`).

Replacement is only indirectly covered by source and optional counters in this safe baseline. Do not claim that this run observed a specific BCB eviction or `EVICTED` transition. Deterministically forcing replacement would require resizing shared buffer configuration or a potentially very large workload; neither is a stable/safe default.

### Alternative explanations

- DWB may count multiple physical writes per logical page. Only positive activity is asserted.
- checkpoint/backup may flush system/volume-header pages in addition to table pages. Exact table attribution comes from source reachability + exclusive owned DB activity, not a VPID trace.
- page flush daemon may write before `backupdb`; before/after snapshots and idle window bound but cannot perfectly separate it.
- normal restart only proves readable committed state, not crash recovery or individual WAL-before-data order.
- positive `Num_data_page_iowrites` says physical writes occurred; it does not say a page was later selected/reused as a replacement victim.

### Cleanup

Stop receipt-owned watcher first; verify none remain. Verify `ca_pb_owner`, generation/checksum, and exact backup directory ownership. Drop exact `ca_pb_e4`; stop/delete exact suite DB; remove only enumerated backup files and empty owned directories. Confirm registry entry, DB server process, watcher group, and owned runtime paths are absent. `unsafe=false`, `user_service_stop=false`, `instrumentation=false` only after those ownership checks.

## 8. Korean mechanism Quiz plans

각 Quiz는 `quiz.md`, `answer.md`, 최소 한 개의 runnable SQL을 갖는다. 실제 작성 시 Korean prose를 유지하고 answer를 question/script comment/filename에 노출하지 않는다. CUBRID runtime만 필요하며, PostgreSQL/MySQL 비교 문제는 Book evidence로 추론하게 하고 두 서버를 요구하지 않는다.

### Quiz 1 — cold miss와 warm hit를 counter로 구별하라

- **Behavior / Claim**: `fix-lookup-load` / `CUBRID-C005`
- **Directory**: `quiz/quiz-1/`
- **Learning objective**: `VPID → hash lookup → hit/miss → BCB/frame claim → DWB/main-volume read → successful fix`의 원인 사슬을 counter 한계와 함께 설명한다.
- **Prerequisites / time**: chapter `04-fix-lookup-load#fix-lookup-load`, Experiment 1 raw output; 25분.
- **Runnable artifact**: Experiment 1보다 작은 owned table을 두 번 scan하는 `quiz.sql`; exact DB restart는 supplied safe `run.sh`가 ownership 확인 후 quiz-owned DB에만 수행한다.

`quiz.md`에 넣을 문제 순서:

1. 실행 전 두 scan의 `Num_data_page_ioreads`, `OLD_PAGE_IN_PB`, checksum이 어떻게 달라질지 방향만 예측하라.
2. raw histogram에서 first/second section을 나누고 `miss`, `hit`, “successful fix”에 대응하는 counter를 골라라.
3. first scan의 ioreads가 row 수보다 훨씬 작고 second가 정확히 0이 아닐 수 있는 이유를 page granularity, catalog access, prefetch/eviction으로 설명하라.
4. `Num_data_page_ioreads` 하나만으로 DWB hit와 main-volume read를 구별할 수 있는가? source의 increment 위치를 근거로 답하라.
5. 설계 문제: 두 thread가 동시에 같은 cold `VPID`를 요청할 때 중복 frame publication을 막기 위한 최소 state/lock/retry protocol을 그려라.
6. 발표용 heavy question: “OS page cache가 warm이면 이것은 miss가 아닌 것 아닌가?”에 CUBRID buffer miss와 device latency의 계층 차이로 답하라.

`answer.md` 핵심:

- first positive ioreads + miss mode, second resident mode 증가라는 방향과 checksum 동일성을 설명한다.
- `pgbuf_search_hash_chain`/`pgbuf_claim_bcb_for_fix`/`pgbuf_lock_page`의 역할을 분리한다.
- common misconception: hit ratio=physical disk cache hit ratio, one ioread=one SQL row, restart=OS cache cold를 반박한다.
- does-not-prove: exact `VPID`, exact read source, I/O latency, miss error path.
- teach-back: “`pgbuf_fix()`가 return하기 전 caller가 얻은 것과 아직 소유하지 않는 것”을 90초 설명하게 한다.

### Quiz 2 — holder가 무엇을 기억하고 unfix가 무엇을 바꾸는가

- **Behavior / Claim**: `latch-holder-unfix` / `CUBRID-C006`
- **Directory**: `quiz/quiz-2/`
- **Learning objective**: BCB global `fcnt`와 thread holder `fix_count`, latch mode, dirty-before/holder-dirty, zero-fcnt wake/LRU eligibility를 구분한다.
- **Prerequisites / time**: chapter `05-latch-holder-unfix#latch-holder-unfix`, Experiment 2 output; 35분.
- **Runnable artifact**: read control + monotonic PK insert의 `quiz.sql`; optional second script는 실행하지 않고 source-based concurrency trace를 완성하는 worksheet로 둔다.

`quiz.md` 문제:

1. read section과 insert section에서 어떤 unfix tuple(`READ/WRITE/MIXED`, `HOLDER_NON_DIRTY/HOLDER_DIRTY`)이 나타날지 예측하라.
2. promotion success가 많아도 “latch contention이 심했다”라고 말할 수 없는 이유를 설명하라.
3. holder의 `fix_count=2`, BCB `fcnt=3`, 다른 reader 1명, writer waiter 1명인 상태에서 현재 thread가 한 번 unfix할 때와 마지막 unfix할 때 가능한 state를 각각 그려라.
4. `PGBUF_CONDITIONAL_LATCH` 실패 시 caller가 unfix해야 하는가? 성공적으로 얻은 `PAGE_PTR`가 없다는 Interface 관점에서 답하라.
5. 두 reader가 동시에 promote를 시도할 때 둘 다 기존 page identity/content를 유지한 채 기다리게 하면 왜 deadlock 또는 stale-page 위험이 생기는지 설명하라.
6. heavy question: transaction lock이 이미 있는데 page latch가 왜 별도로 필요하며, unfix가 transaction commit과 동의어가 아닌 이유는 무엇인가?

`answer.md` 핵심:

- sole holder는 in-place promotion; competing reader와 condition에 따라 fail 또는 holder를 내려놓고 block/reacquire한다.
- unfix는 per-holder metadata를 집계하고 BCB fcnt를 낮춘다. 마지막 fix가 사라지면 latch `NO_LATCH`, LRU policy/wakeup이 가능하지만 dirty page가 곧바로 clean/evicted되는 것은 아니다.
- common misconception: fcnt=transaction lock count, unfix=commit, BUF_DIRTY=현재 holder가 dirty함, promotion success=counted wait.
- does-not-prove: Experiment 2는 actual waiter, timeout, interrupt, fail branch를 실행하지 않는다.

### Quiz 3 — covered index, non-covered index, heap update caller contract

- **Behavior / Claim**: `caller-contracts` / `CUBRID-C007`
- **Directory**: `quiz/quiz-3/`
- **Learning objective**: SQL access path에서 B-tree/heap caller가 page buffer에 요구하는 page type, latch, dirty, cleanup 의무를 역추적한다.
- **Prerequisites / time**: chapter `06-caller-contracts#caller-contracts`, query plan 읽기; 40분.
- **Runnable artifact**: Experiment 3과 같은 세 phase의 `quiz.sql`, plan capture helper.

`quiz.md` 문제:

1. covered query와 non-covered query가 같은 PK range인데 PAGE_HEAP fix가 달라질 이유를 먼저 예측하라.
2. plan과 `Num_btree_covered/noncovered`, fix-ext page family를 조합해 실제 caller chain을 써라.
3. update error unwind에서 성공한 fix 셋 `{B-tree parent, leaf, heap page}` 각각에 대해 dirty 여부와 unfix 의무를 표로 작성하라. “모두 dirty”는 허용하지 않는다.
4. parent→child ordering 중 unconditional child WRITE fix가 dead-latch를 만들 수 있는 scenario를 그리고 conditional fix/retry가 Interface seam이 되는 이유를 설명하라.
5. `PGBUF_WATCHER`가 단순 nullable `PAGE_PTR`보다 추가로 보존해야 하는 ordering/group/rank state는 무엇인가?
6. redesign: raw `PAGE_PTR` API를 작은 deep module로 감싼다면 read handle/write handle/dirty-release API가 어떤 misuse를 compile-time 또는 debug-time에 막아야 하는가?
7. heavy question: counter에서 BTREE와 HEAP이 보였다는 사실만으로 exact call stack을 증명했다고 말할 수 없는 이유는 무엇인가?

`answer.md` 핵심:

- covered는 index tuple에서 값을 만들고, non-covered는 OID를 얻은 뒤 heap lookup을 호출한다 (`scan_manager.c:6693`, `:6757`).
- page latch는 physical consistency, object/transaction lock은 logical visibility/serialization을 담당한다.
- success-only cleanup, dirty-before-release, conditional failure has no acquired page, ordered watcher bookkeeping을 분리한다.
- does-not-prove: 모든 caller, 모든 error branch, exact page identity/order, watcher deadlock freedom.

### Quiz 4 — dirty에서 WAL, flush, replacement eligibility까지

- **Behavior / Claim**: `dirty-wal-flush-replace` / `CUBRID-C008`
- **Directory**: `quiz/quiz-4/`
- **Learning objective**: dirty bit, page LSA/`oldest_unflush_lsa`, WAL force, copied page image, TDE/DWB/home write, concurrent re-dirty, victim eligibility를 하나의 state machine으로 재구성한다.
- **Prerequisites / time**: chapter `07-dirty-wal-flush-replace#dirty-wal-flush-replace`, Experiment 4 output; 45분.
- **Runnable artifact**: one update/check `quiz.sql`, owned watcher/backup runner, read-only verify SQL. No crash/fault injection.

`quiz.md` 문제:

1. update 후 `Num_data_page_dirties`, `Num_log_append_records`, `Num_data_page_iowrites`, `Num_data_page_flushed`가 각각 언제/어디서 움직일지 예측하라. 이름만 보고 `flushed`를 고르면 감점한다.
2. 실제 output에서 backup window에 `iowrites>0`, `flushed=0`이 나왔다고 가정할 때 모순인지 설명하라.
3. 다음 순서를 완성하라: writer modifies → log append/page LSA → dirty/oldest-unflush-LSA → unfix → candidate/flush copy → ___ → DWB/direct write → flush completion/re-dirty handling.
4. flush가 BCB mutex를 놓고 I/O하는 동안 다른 writer가 page를 다시 dirty하게 만들면 “방금 쓴 copy는 성공”과 “BCB는 여전히 dirty”가 동시에 참일 수 있는 이유를 설명하라.
5. fixed page, hot page, `FLUSHING_TO_DISK` page가 victim/replacement에 각각 어떤 제약을 주는지 state diagram으로 그려라.
6. failure question: data write가 실패했을 때 dirty와 `oldest_unflush_lsa`를 복구하지 않으면 다음 checkpoint/recovery에서 어떤 잘못된 결론이 가능한가?
7. comparison question: PostgreSQL shared buffer와 InnoDB buffer pool의 nearest mechanism을 “같은 이름”이 아니라 pin/refcount, content latch, dirty tracking, WAL/redo ordering, double-write/torn-page protection 축으로 비교하라.
8. heavy question: clean restart에서 데이터가 보였다는 관찰이 WAL-before-data를 증명하지 못하는 이유와, 이를 더 강하게 입증하려면 어떤 safe evidence 또는 fault model이 필요한가?

`answer.md` 핵심:

- `Num_data_page_flushed`의 victim-only increment site와 `Num_data_page_iowrites` DWB multiplicity를 정확히 설명한다.
- `pgbuf_bcb_flush_with_wal()`이 copy/LSA capture 뒤 WAL force, then DWB/direct write를 수행하고 실패 시 dirty/oldest LSA를 복구한다.
- re-dirty는 snapshot write success와 resident BCB dirty state를 분리한다.
- common misconception: dirty=durable, unfix=flush, checkpoint request=synchronous completion, iowrites=unique pages, backup success=crash recovery proof.
- does-not-prove: exact victim/replacement execution, per-page I/O ordering, crash branch, TDE/DWB correctness 전체.

## 9. Live-grill seed questions (Book 완료 후 한 turn에 하나만 사용)

아래는 static Quiz와 별개인 후보 bank다. 실제 live grill에서는 answer를 먼저 보이지 않고 정확히 한 Korean question만 묻는다.

1. “`pgbuf_fix()`가 같은 `VPID`의 `PAGE_PTR`를 반환했다”는 말에 포함된 보장과 포함되지 않은 보장을 latch, holder, transaction lock, durability 축으로 나누어 설명해 보세요.
2. 두 thread가 같은 cold page를 miss했을 때 두 frame이 hash에 동시에 publish되지 않도록 하는 coordination을 `pgbuf_lock_page()`와 retry 관점에서 설명해 보세요.
3. BCB `fcnt`가 0이 되는 순간 page가 즉시 victim으로 재사용될 수 없는 반례를 dirty, hot/LRU, flushing flag 관점에서 세 가지 들어 보세요.
4. `Num_data_page_ioreads`와 `Num_data_page_fetches`만 보고 hit ratio를 계산했을 때 어떤 semantic loss가 생기나요?
5. `BUF_DIRTY,HOLDER_NON_DIRTY,READ` unfix row가 나타날 수 있는 causal history를 만들어 보세요.
6. heap update가 page latch를 잘 지켰지만 transaction lock을 잘못 썼을 때 가능한 logical anomaly와, 그 반대의 physical corruption 가능성을 각각 설명해 보세요.
7. conditional child fix가 실패한 뒤 parent latch를 놓고 retry하는 설계가 correctness와 liveness를 동시에 지키려면 caller가 어떤 state를 재검증해야 하나요?
8. page LSA가 이미 durable log보다 작을 때 `Num_log_wals=0`이어도 WAL rule이 지켜졌다고 말할 수 있는 이유는 무엇인가요?
9. DWB가 켜진 환경에서 `Num_data_page_iowrites=200`을 “200개 page flush”라고 발표하면 왜 틀릴 수 있나요?
10. flush copy가 성공적으로 disk에 써진 직후 resident BCB가 dirty일 수 있는 interleaving을 시간순으로 설명해 보세요.
11. Experiment 3의 covered/non-covered 결과가 plan drift 때문에 무효가 되는 신호는 무엇이고, 왜 counter만으로 이를 보정하면 안 되나요?
12. 지금까지의 네 Experiment가 replacement를 직접 증명하지 못합니다. shared config 변경이나 거대한 dataset 없이 이를 더 강하게 관찰할 수 있는 최소 안전 extension을 설계해 보세요.

## 10. Unknowns, validation tasks, and risks

1. **CSQL syntax smoke check required**: `REPEAT`, `CHR`, `MOD`, `COALESCE`, `CASE`, `CONNECT BY`, `COMMIT WORK`, `.x_hist`가 pinned build에서 batch runner로 동작하는지 main agent가 setup smoke run으로 확인해야 한다. 실패하면 runner hash 전에 equivalent CUBRID syntax로 고친다.
2. **Histogram section parser**: complex arrays omit zero rows. Parser must treat absent row as zero and sum only lines inside the correct `.x_hist` section. Human eyeballing만으로 manifest oracle를 승인하지 않는다.
3. **Fix/unfix balance**: Experiment 2의 aggregate equality는 plausible하지만 retained result/system page lifetime에 따라 어긋날 수 있다. 한 번 관측 후 원인을 source로 설명할 수 있을 때만 hard oracle로 승격한다.
4. **Cold/warm sizing**: Experiment 1 table이 pool보다 너무 크면 warm strict decrease가 약해질 수 있다. `SHOW PAGE BUFFER STATUS`와 dataset page count를 기록하고, exact count 주장 없이 충분히 resident한 크기를 선택한다.
5. **Optimizer plan stability**: Experiment 3은 captured plan에서 `pk_ca_pb_e3`를 확인해야 한다. hint syntax는 pinned manual/source로 검증 후 hash한다.
6. **Daemon visibility**: per-transaction histogram은 daemon writes를 볼 수 없다. Experiment 4에서 watcher attach가 workload/backup보다 반드시 먼저여야 한다. `stats_on=yes` shared config 변경은 하지 않는다.
7. **Synchronous trigger terminology**: `;checkpoint`는 asynchronous request라 hard trigger로 쓰지 않는다. `backupdb -C` completion을 사용하되, Book에는 “backup 경로가 동기적으로 요구한 checkpoint/flush window”라고 정확히 표현하고 checkpoint daemon timing과 혼동하지 않는다.
8. **Replacement evidence gap**: safe baseline은 replacement eligibility/source path를 설명하지만 actual eviction을 식별하지 않는다. `CUBRID-C008`의 runtime portion을 좁게 쓰고 source+runtime evidence type으로 ledger에 기록한다.
9. **Existing branch tracer**: pinned branch에는 `CUBRID_PGBUF_TRACE_VPID` lab tracer가 있으나 per-event file open observer effect, VPID discovery, environment propagation, process ownership 문제가 있다 (`page_buffer.c:850-897`). 네 mandatory Experiment에는 사용하지 않는다. 필요하면 optional teaching evidence로 별도 설계하고 counter oracle을 대체하지 않는다.
10. **Build gate/user service**: 현재 worktree의 dirty provenance와 live service 상태는 별개다. existing untracked/modified files를 지우거나 restore하지 않는다. build install이 user-owned live process에 막히면 authorization 없이 중지하지 않는다.
11. **No performance claim**: 3 repetitions are procedural reproducibility, not statistically independent benchmarking. elapsed time/hit ratio magnitude로 PostgreSQL/MySQL 성능 우열을 주장하지 않는다.
12. **Cleanup hard stop**: DB name collision, owner-row mismatch, registry realpath escape, watcher cmdline/starttime mismatch, failed exact DB stop/delete, residual process 중 하나라도 있으면 cleanup success를 self-attest하지 않는다.

## 11. Manifest link summary for main agent

| Experiment | `behavior_ids` | `claim_ids` | repetitions | mandatory runner | Oracle scope |
|---|---|---|---:|---|---|
| `experiment-1` | `["fix-lookup-load"]` | `["CUBRID-C005"]` | 3 | direct sealed `csql ... -i experiment.sql` | cold ioreads positive, warm decrease/resident modes, same checksum |
| `experiment-2` | `["latch-holder-unfix"]` | `["CUBRID-C006"]` | 3 | direct sealed `csql ... -i experiment.sql` | read vs promoted/dirty holder-unfix signature; no contention claim |
| `experiment-3` | `["caller-contracts"]` | `["CUBRID-C007"]` | 3 | direct sealed `csql ... -i experiment.sql` | covered vs noncovered vs heap update signature with plan gate |
| `experiment-4` | `["dirty-wal-flush-replace"]` | `["CUBRID-C008"]` | 3 | direct sealed `csql ... -i experiment.sql` | dirty/log append + watcher-backed physical writes + clean restart; replacement source-only |

Each future `manifest.json` must contain the real runner SHA-256, exact absolute `runner_argv`, exact successful run IDs, `runtime_tools_snapshot`, Korean oracle/controls/alternatives, and verified cleanup result. This packet intentionally contains no manufactured hash, run receipt, or cleanup claim.
