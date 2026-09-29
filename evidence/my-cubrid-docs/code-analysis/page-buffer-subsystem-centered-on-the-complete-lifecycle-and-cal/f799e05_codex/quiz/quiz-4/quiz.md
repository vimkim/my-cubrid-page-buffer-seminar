# Quiz 4 — Dirty WAL flush replacement

먼저 예측을 적고 script를 실행한 뒤 counter 이름이 아닌 causal mechanism으로 설명하세요.

## 재현 계약

- 예상 시간: setup 2분, prediction/실행 8분, 답안 15분 — 총 25분.
- 삭제된 final-state에서 fresh owned DB를 재현하는 exact 절차다.

```bash
direnv exec /home/vimkim/gh/cb/pgbuf-grill /usr/bin/bash /home/vimkim/gh/my-cubrid-docs/code-analysis/page-buffer-subsystem-centered-on-the-complete-lifecycle-and-cal/f799e05_codex/quiz/run-one.sh 4
```

[`run-one.sh`](../run-one.sh)는 registry preflight, create-success ownership flag와 EXIT/INT/TERM cleanup trap을 사용한다. 같은 이름의 pre-existing DB는 절대 setup/run/delete하지 않는다.

Safe runner는 pre-existing DB 거부와 owned flag/trap cleanup을 code로 고정한다.

- 선행 데이터: setup의 `ca_pb_e4` 10,000행, 초기 generation 0.
- 검증 영수증: `rebind-quiz4`은 exit 0, runner SHA-256 `f5c2c3ae...cee74`; 전체 출력은 [`stdout.txt`](../../evidence/runs/rebind-quiz4/stdout.txt).
- 정리: learner runner는 trap으로 소유 DB만 정리한다. Captured author run도 exact owned DB만 삭제한 `rebind-quiz-cleanup`이 exit 0이다.
- 학습 근거: [Ch07 dirty/WAL/flush/replacement](../../chapters/07-dirty-wal-flush-replace.html#dirty-wal-flush-replace), Claims `CUBRID-C004`, `CUBRID-C008`.

1. dirty, page LSA, oldest-unflush-LSA가 답하는 질문을 구분하라.
2. snapshot 뒤 WAL gate의 빈칸과 DWB/direct write 순서를 완성하라.
3. flush 성공 뒤 resident BCB가 dirty일 수 있는 interleaving을 말하라.
4. fcnt=0인 page가 victim이 아닌 반례 세 가지를 들라.
5. PostgreSQL과 InnoDB의 nearest mechanisms를 analogy class와 함께 비교하라.

## 제출 형식

각 답은 before → guard → action → after → failure/limit 순서로 작성합니다. Runtime output만으로 source call stack을 증명하지 마세요.

## 이 실행이 입증하지 않는 것

Commit success와 dirty counters는 WAL force→DWB/datafile의 개별 physical ordering, checkpoint completion, torn-page recovery 또는 actual victim eviction을 직접 입증하지 않습니다.
