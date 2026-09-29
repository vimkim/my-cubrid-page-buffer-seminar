# Quiz 1 — Cold miss와 warm hit

먼저 예측을 적고 script를 실행한 뒤 counter 이름이 아닌 causal mechanism으로 설명하세요.

## 재현 계약

- 예상 시간: setup 2분, prediction/실행 8분, 답안 12분 — 총 22분.
- 아래 명령은 삭제된 final-state에서 전용 DB를 새로 만들고 standalone setup/run/cleanup까지 완결한다. 각 quiz는 fresh DB로 시작한다.

```bash
direnv exec /home/vimkim/gh/cb/pgbuf-grill /usr/bin/bash /home/vimkim/gh/my-cubrid-docs/code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/run-one.sh 1
```

[`run-one.sh`](../run-one.sh)는 `set -euo pipefail`로 실행하며 registry에서 exact DB name 부재를 먼저 증명한다. `createdb` 성공 뒤에만 ownership flag를 세우고 EXIT/INT/TERM trap이 그 owned DB만 삭제한다. Pre-existing DB가 있으면 setup 전에 즉시 거부한다.

Safe runner는 pre-existing DB 거부와 owned flag/trap cleanup을 code로 고정한다.

- 선행 데이터: [`experiments/setup.sql`](../../experiments/setup.sql)의 `ca_pb_e1` 10,000행. 전용 DB 외에는 건드리지 않는다.
- 검증 영수증: `rebind-quiz1`은 exit 0, runner SHA-256 `73a6d453...f69f43`; 전체 출력은 [`stdout.txt`](../../evidence/runs/rebind-quiz1/stdout.txt).
- 정리: learner runner는 trap으로 소유 DB만 정리한다. Captured author run도 [`cleanup-suite.sh`](../../experiments/cleanup-suite.sh)로 exact DB만 삭제했고 `rebind-quiz-cleanup`이 exit 0이다.
- 학습 근거: [Ch04 fix lookup/load](../../chapters/04-fix-lookup-load.html#core-workflows), Claims `CUBRID-C001`, `CUBRID-C005`.

1. 같은 table을 cold restart 뒤 두 번 읽기 전에 ioreads와 OLD_PAGE_IN_PB의 방향을 예측하라.
2. first ioreads가 row 수보다 작은 이유와 second가 항상 0은 아닌 이유를 설명하라.
3. 두 thread가 같은 cold VPID를 fix할 때 duplicate publication을 막는 protocol을 그려라.
4. OS cache가 warm인데도 CUBRID buffer miss라고 부를 수 있는 이유는?

## 제출 형식

각 답은 before → guard → action → after → failure/limit 순서로 작성합니다. Runtime output만으로 source call stack을 증명하지 마세요.

## 이 실행이 입증하지 않는 것

한 번의 standalone run은 두 동시 loader schedule, 정확한 VPID, OS cache miss, latch wait 또는 모든 future run의 second-scan ioread=0을 입증하지 않습니다.
