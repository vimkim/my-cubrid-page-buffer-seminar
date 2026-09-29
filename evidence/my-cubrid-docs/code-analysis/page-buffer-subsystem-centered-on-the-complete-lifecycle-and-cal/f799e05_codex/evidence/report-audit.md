# Independent Report Audit — Render-fix Round

- Reviewer: `/root/pgbuf_renderfix_audit`
- Phase: `report`
- Isolation: fresh read-only reviewer over the exact `reportctl materials --phase report` set
- Reviewed files: 258
- Deterministic materials digest: `e32f7b7972e238aa58660cc01d313ba9e2ba8f9ac12327b10c4b79307243341b`
- Verdict: `APPROVED`

## Review summary

고정 scope와 provenance, 30개 claim의 114개 pinned source reference, 11개 HTML 장, Notion companion, 네 실험과 raw receipt, 네 퀴즈·model answer, clean source/build/cleanup 상태를 독립적으로 대조했다. 18개 coverage obligation은 모두 충족되며 substantive finding은 없다.

사용자가 요청한 **Surprising moment — `ioreads` ≠ physical disk I/O** 카드는 counter 증가(`page_buffer.c:8497`)가 `dwb_read_page()`보다 먼저 일어나며 DWB error/hit/miss와 이후 `fileio_read()` source를 aggregate 값만으로 구분하지 못한다는 사실을 정확히 설명한다. Exact VPID, OS cache/device service와 continuous residency도 과장해 추론하지 않는다.

Copyparty static checker가 통과했고, viewer와 같은 vendored Mermaid bundle에서 8개 block 모두 parse됐다. 기존 sequence message 안의 세미콜론은 호환되는 comma/text로 교정됐다. 의도된 MathJax equation은 없다. Browser-capable tool이 없어 live DOM/console 검증은 수행하지 않았으며 이를 통과했다고 주장하지 않는다.

이전 감사에서 발견한 `fcnt` 회계, normal/lock-free holder-allocation failure, question/answer numbering, avoid-deallocation semantics, exact counter increment sites, orientation, cross-database evidence와 E1/E2 수치 문제를 현재 재료에서 다시 확인했다. 특히 blocked waiter grant는 `pgbuf_wakeup_reader_writer()`의 latch/`fcnt` commit과 awakened holder allocation으로 닫혔고, avoid-deallocation은 vacuum deallocation만 보호하며 victimization을 막지 않는다는 경로가 claim/source index에 포함된다.

PostgreSQL/MySQL 비교는 publication, ownership, latch/release, index-to-row, WAL/redo, torn-page defense, replacement, dirty generation, checkpoint, recovery뿐 아니라 error/resource pressure, configuration/observability, performance trade-offs까지 13개 동일 축에서 pinned evidence와 함께 다룬다.

Runtime receipt는 E1 `38→0`, E2 detailed promotion `689`와 oracle에서 제외한 derived `69589.00`, E3 `100/0` 대 `0/100`, E4 generation `1/1`, dirties `58430`, backup success와 일치한다. Owned database와 temporary backup directory는 부재한다.

감사 직전 verifier는 이전 seal 불일치 한 건만 보고했고 provenance와 quiz/grill structural error는 없었다. JSON seal은 감사자가 승인한 258개 파일의 exact hash map을 기록한다. `isolated_reviewer=true`는 host task boundary의 선언이며 cryptographic independence proof는 아니다.

VERDICT: APPROVED
