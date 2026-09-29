# Experiment 1 — cold miss와 warm reuse

- **Behavior / Claim:** `fix-lookup-load` / `CUBRID-C005`.
- **Question:** 정상 재시작 직후 첫 scan과 즉시 반복 scan의 page-buffer read signature가 달라지는가?
- **Hypothesis:** 두 query의 checksum은 같고 첫 scan ioread는 양수이며 second scan ioread는 0에 가까워진다.
- **Setup:** clean detached source에서 만든 sealed CUBRID debug build, 전용 DB `ca_pgbuf_f799e05`, `ca_pb_e1` 10,000행, isolated server start 뒤 실행. SQL runner SHA-256은 manifest에 고정했다.
- **Action:** experiment 디렉터리에서 manifest의 exact `csql -u dba ca_pgbuf_f799e05 -i experiment.sql` argv를 `reportctl`로 1회 실행했다.
- **Observation:** `rebind-exp1`에서 first/second checksum은 각각 `10000 / 50005000 / 8000000`으로 같고 ioreads는 `38 → 0`이었다. [raw stdout](../../evidence/runs/rebind-exp1/stdout.txt)
- **Interpretation:** normal restart는 cold control, 즉시 같은 query는 warm control이다. 이는 OLD-page miss가 resident reuse로 바뀔 수 있다는 source mechanism과 일치한다.
- **Alternative explanations:** OS page cache는 CUBRID miss의 physical latency를 낮출 수 있고 catalog/prefetch/background work가 exact count에 섞인다.
- **Observer effect:** histogram 수집 자체와 single client가 scheduling/cache temperature를 바꿀 수 있다.
- **Limit:** 한 번의 run은 exact VPID, storage-device miss, concurrent duplicate-loader schedule 또는 모든 환경의 second=0을 증명하지 않는다.
- **Cleanup:** 전용 DB만 stop/delete했고 `rebind-cleanup`이 cleanup을 검증했다. Report와 immutable receipts만 남겼다.
