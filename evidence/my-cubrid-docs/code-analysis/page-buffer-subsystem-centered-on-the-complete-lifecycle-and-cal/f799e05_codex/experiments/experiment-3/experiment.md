# Experiment 3 — B-tree covered/noncovered와 heap caller

- **Behavior / Claim:** `caller-contracts` / `CUBRID-C007`.
- **Question:** 같은 PK range라도 index-covered result와 payload result가 heap access signature를 달리하는가?
- **Hypothesis:** covered query는 covered 100/noncovered 0, payload query는 noncovered 100, update는 정확히 100 rows와 dirty heap-holder activity를 보인다.
- **Setup:** sealed debug build, PK/payload/generation을 가진 `ca_pb_e3` 10,000행, 동일 key range 100개.
- **Action:** manifest exact csql argv로 covered SELECT, payload SELECT, UPDATE를 한 runner에서 1회 실행했다.
- **Observation:** `rebind-exp3`에서 covered `100/0`, payload noncovered `100`, update 100 rows와 dirties `300`을 관찰했다. [raw stdout](../../evidence/runs/rebind-exp3/stdout.txt)
- **Interpretation:** 동일 range와 result checksum은 주요 control이고, direction은 B-tree→heap handoff 및 write caller contract와 일치한다.
- **Alternative explanations:** optimizer drift, catalog heap access, prefetch와 internal index pages가 counters에 섞일 수 있다.
- **Observer effect:** back-to-back queries가 later phase의 cache를 데우며 instrumentation 없이 aggregate counters만 읽는다.
- **Limit:** exact C call stack, every-exit unfix, ordered refix interleaving과 recovery fetch mode를 runtime에서 증명하지 않는다.
- **Cleanup:** exact owned DB만 삭제했고 `rebind-cleanup` receipt를 보존했다.
