# Quiz 3 — Heap B-tree recovery caller

먼저 예측을 적고 script를 실행한 뒤 counter 이름이 아닌 causal mechanism으로 설명하세요.

## 재현 계약

- 예상 시간: setup 2분, prediction/실행 8분, 답안 15분 — 총 25분.
- 삭제된 final-state에서 fresh owned DB를 재현하는 exact 절차다.

```bash
direnv exec /home/vimkim/gh/cb/pgbuf-grill /usr/bin/bash /home/vimkim/gh/my-cubrid-docs/code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/run-one.sh 3
```

[`run-one.sh`](../run-one.sh)는 registry preflight, create-success ownership flag와 EXIT/INT/TERM cleanup trap을 사용한다. 같은 이름의 pre-existing DB는 절대 setup/run/delete하지 않는다.

Safe runner는 pre-existing DB 거부와 owned flag/trap cleanup을 code로 고정한다.

- 선행 데이터: setup의 PK와 payload를 가진 `ca_pb_e3` 10,000행.
- 검증 영수증: `rebind-quiz3`은 exit 0, runner SHA-256 `4cba0c7e...ffa596`; 전체 출력은 [`stdout.txt`](../../evidence/runs/rebind-quiz3/stdout.txt).
- 정리: learner runner는 trap으로 소유 DB만 정리한다. Captured author run도 exact owned DB만 삭제한 `rebind-quiz-cleanup`이 exit 0이다.
- 학습 근거: [Ch06 caller contracts](../../chapters/06-caller-contracts.html#caller-contracts), Claims `CUBRID-C003`, `CUBRID-C007`.

1. Covered와 noncovered PK query가 heap fixes에서 다른 이유를 설명하라.
2. parent/child/heap page success fixes의 all-exit cleanup 표를 작성하라.
3. ordered refix 뒤 page_was_unfixed가 true면 무엇을 재검증해야 하나?
4. redo가 RECOVERY_PAGE와 page LSA를 쓰는 이유는?

## 제출 형식

각 답은 before → guard → action → after → failure/limit 순서로 작성합니다. Runtime output만으로 source call stack을 증명하지 마세요.

## 이 실행이 입증하지 않는 것

두 SELECT의 counter 차이만으로 모든 heap/B-tree caller cleanup, ordered refix interleaving 또는 recovery redo path를 실행했다고 주장할 수 없습니다.
