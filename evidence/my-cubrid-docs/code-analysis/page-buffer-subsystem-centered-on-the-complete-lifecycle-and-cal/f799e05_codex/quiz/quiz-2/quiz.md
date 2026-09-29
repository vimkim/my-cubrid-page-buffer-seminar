# Quiz 2 — Holder와 unfix

먼저 예측을 적고 script를 실행한 뒤 counter 이름이 아닌 causal mechanism으로 설명하세요.

## 재현 계약

- 예상 시간: setup 2분, prediction/실행 8분, 답안 12분 — 총 22분.
- 삭제된 final-state에서 fresh owned DB를 재현하는 exact 절차다.

```bash
direnv exec /home/vimkim/gh/cb/pgbuf-grill /usr/bin/bash /home/vimkim/gh/my-cubrid-docs/code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/run-one.sh 2
```

[`run-one.sh`](../run-one.sh)는 registry preflight, create-success ownership flag와 EXIT/INT/TERM cleanup trap을 사용한다. 같은 이름의 pre-existing DB는 절대 setup/run/delete하지 않는다.

Safe runner는 pre-existing DB 거부와 owned flag/trap cleanup을 code로 고정한다.

- 선행 데이터: setup이 빈 `ca_pb_e2`를 만들고 runner가 10행을 삽입해 payload를 실제 변경한다.
- 검증 영수증: `rebind-quiz2`은 exit 0, runner SHA-256 `b69cc817...a6619`; 전체 출력은 [`stdout.txt`](../../evidence/runs/rebind-quiz2/stdout.txt).
- 정리: learner runner는 trap으로 소유 DB만 정리한다. Captured author run도 exact owned DB만 삭제한 `rebind-quiz-cleanup`이 exit 0이다.
- 학습 근거: [Ch05 latch/holder/unfix](../../chapters/05-latch-holder-unfix.html#latch-holder-unfix), Claims `CUBRID-C002`, `CUBRID-C006`.

1. READ와 INSERT phase의 READ/WRITE/MIXED, HOLDER_DIRTY 조합을 예측하라.
2. BCB fcnt=3, 내 holder fix_count=2일 때 한 번과 마지막 unfix의 차이를 그려라.
3. conditional fix 실패 후 unfix가 필요 없는 이유는?
4. transaction lock과 page latch를 protected state로 구분하라.

## 제출 형식

각 답은 before → guard → action → after → failure/limit 순서로 작성합니다. Runtime output만으로 source call stack을 증명하지 마세요.

## 이 실행이 입증하지 않는 것

Histogram의 HOLDER_DIRTY는 특정 BCB의 holder ledger나 latch waiter queue를 직접 보여주지 않으며 transaction lock과 page latch의 동치를 입증하지 않습니다.
