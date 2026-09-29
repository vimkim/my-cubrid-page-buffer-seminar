# Experiment 2 — holder, latch promotion과 dirty unfix

- **Behavior / Claim:** `latch-holder-unfix` / `CUBRID-C006`.
- **Question:** 빈 table read와 insert phase가 holder/latch/dirty counters에서 구분되는가?
- **Hypothesis:** empty read의 promotion은 0이고 insert는 positive promotion, dirty calls와 HOLDER_DIRTY WRITE/MIXED unfix를 만든다.
- **Setup:** sealed debug build와 전용 DB의 빈 `ca_pb_e2`; runner가 data creation과 commit을 함께 수행한다.
- **Action:** experiment 디렉터리에서 manifest exact argv로 runner를 1회 실행했다.
- **Observation:** `rebind-exp2`에서 empty-read promotion `0`, insert의 detailed `Num_data_page_promote_ext` success `689`, dirties `102125`, HOLDER_DIRTY의 WRITE/MIXED 활동이 관찰됐다. 같은 write section의 derived `Data_page_total_promote_success`는 `69589.00`을 출력했다. [raw stdout](../../evidence/runs/rebind-exp2/stdout.txt)
- **Interpretation:** 동일 session의 empty-read가 negative control, mutation phase가 positive control이다. Direction은 holder/latch/dirty source sites와 맞는다.
- **Alternative explanations:** promotion/dirties는 row 수가 아니며 index/catalog/system pages도 포함할 수 있다.
- **Observer effect:** histogram과 large insert가 natural workload보다 더 많은 metadata/page traffic을 만든다.
- **Limit:** actual latch contention, waiter order, 특정 BCB의 holder chain 또는 unfix 직후 durability는 증명하지 않는다. 반복 snapshot의 derived-field semantics는 이 실험의 oracle이 아니므로 source increment site에 직접 연결된 detailed count만 사용한다.
- **Cleanup:** exact owned DB만 삭제했고 `rebind-cleanup` receipt를 보존했다.
