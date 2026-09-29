# Experiment 4 — dirty generation과 synchronous backup boundary

- **Behavior / Claim:** `dirty-wal-flush-replace` / `CUBRID-C008`.
- **Question:** logged update가 controlled resident mutations를 만들고 synchronous backup까지 정상 완료되는가?
- **Hypothesis:** 10,000 rows의 generation은 모두 정확히 1, dirty calls는 양수, commit과 backup은 성공한다.
- **Setup:** sealed debug build, `ca_pb_e4` 10,000행(initial generation 0), fixed payload length. SQL runner가 mutation과 per-session counters를 한 receipt에 캡처했다.
- **Action:** manifest exact csql runner를 1회 실행하고, `backupdb -C -r`을 별도 command로 실행했다.
- **Observation:** `rebind-exp4`는 generation `1/1`, row count 10,000, length violation 0, dirties `58430`을 보였고 `rebind-exp4-backup`이 성공했다. [raw SQL stdout](../../evidence/runs/rebind-exp4/stdout.txt)
- **Interpretation:** data checks는 mutation/commit의 positive control, successful backup은 synchronous checkpoint-like operational boundary다.
- **Alternative explanations:** `rebind-exp4`의 per-session log append, log WAL과 data-page iowrite counters는 0이었다. 이미 durable한 log, clean buffer reuse와 background state가 결과에 영향을 줄 수 있다.
- **Observer effect:** backup 자체가 flush/checkpoint activity를 유발하므로 natural eviction behavior와 동일하지 않다.
- **Limit:** individual page의 WAL-before-data order, DWB slot completion, crash point와 physical victimization은 runtime에서 관찰하지 않았다; 이 부분은 source-only다.
- **Cleanup:** `rebind-cleanup`이 exact owned DB의 registry/process 부재를 검증했고, `rebind-backup-scratch-cleanup`이 owned temporary backup directory를 제거한 뒤 부재를 검증했다.
