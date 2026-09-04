  $implement

  CUBRID page-buffer maintainer guide에서 “private-domain page”라는 모호한 표현을 정확하게 설명하도록 canonical Markdown과 EN/KO teaching HTML을 수정해줘.

  핵심 근거는 다음 research note다:

  - .scratch/private-domain-aout-off-placement/research.md
  - 필요하면 .scratch/private-lru-index/research.md도 참고한다.
  - Source baseline은 f799e05d77d5300c6ea5753b4a6cc7caee6d8912다.

  작업 전 요구사항:

  1. 현재 디렉터리의 AGENTS.md, maintainer-guide-notes.md, CONTEXT.md, 관련 ADR을 읽는다.
  2. git status를 확인하고 기존 uncommitted 변경을 사용자 소유로 취급한다.
  3. 특히 이미 존재할 수 있는 `0012b-understand-private-lru-index.html`과 관련 변경을 먼저 검토한다. 내용을 덮어쓰거나 중복 페이지를 만들지 말고 의도에 맞게 통합한다.
  4. research note의 결론을 pinned source에서 필요한 만큼 재확인한다.

  문서에 반드시 설명할 내용:

  - “private-domain page”는 page나 BCB의 고유 속성이 아니다.
  - 정확한 의미는 “새로 load되어 VOID에 있는 BCB를 global fcnt == 0으로 만드는 final-unfix execution context가 enabled private-LRU assignment를 가지고 있다”이다.
  - Session은 private-local index `p`를 할당받고, request worker가 이를 `THREAD_ENTRY.private_lru_index`로 전달받는다.
  - `m_is_private_lru_enabled`가 true이면 final unfix에서 전체 LRU index `S + p`로 변환한다.
  - BCB는 session/transaction owner를 저장하지 않는다. LRU에 배치된 뒤에는 현재 full LRU index와 zone만 저장한다.
  - 여러 session이 같은 private LRU를 공유할 수 있으므로 private LRU는 ownership domain이 아니라 locality/quota domain이다.

  AOUT-off의 현재 first-placement 분기를 명시적으로 보여준다:

  ```text
  newly loaded BCB: VOID
          |
          | first eligible final unfix, global fcnt -> 0
          v
  final-unfix context has enabled private-LRU assignment?
          | yes                              | no
          v                                  v
  private list S+p, LRU1 top          selected shared LRU, LRU2 middle
```

  반드시 바로잡을 오해:

  - AOUT-off 때문에 위 두 경로가 사라진 것이 아니다.
  - private-LRU1-top과 shared-LRU2-middle은 모두 현재 실행되는 경로이며 final-unfix context에 따라 갈린다.
  - AOUT-off로 비활성화된 것은 ghost hit/miss에 따른 세분화된 admission ranking이다.
  - 특히 private context의 AOUT miss를 private LRU2 middle에 넣는 dormant branch는 현재 실행되지 않는다.
  - “admission ranking”은 이미 안전하게 확보하고 load한 BCB의 첫 LRU 위치만 결정한다. 이전 victim을 고르거나, ownership을 증명하거나, frame reuse를 허가하지 않는다.

  First placement와 later movement도 구분한다:

  - 이 설명은 새로 load된 VOID BCB의 첫 placement에 관한 것이다.
  - 이미 private LRU에 있는 BCB는 이후 다른 private domain 또는 private assignment가 없는 context에서 final-unfix되면 shared LRU2 middle로 이동할 수 있다.
  - 이미 shared LRU에 있는 BCB는 private context가 접근했다는 이유만으로 private LRU로 이동하지 않는다.
  - Stand-alone mode 또는 private chains가 비활성화된 경우 ordinary first placement는 shared LRU2 middle만 사용한다.

  문서 구조:

  - private-domain 의미와 일반 first-placement 규칙에는 canonical explanation 하나만 둔다.
  - AOUT 문서는 AOUT-on/off 차이만 설명하고 canonical private-domain 설명을 링크한다.
  - 기존 advanced/replacement-progress.md와 advanced/aout-ghost-history.md의 ownership을 검토해 중복 설명을 피한다.
  - HTML은 paired EN/KO 구조를 유지한다.
  - 영어는 정확한 maintainer prose로, 한국어는 직역체가 아닌 자연스러운 기술 한국어로 작성한다.
  - “private-domain page”는 가급적 “a newly loaded VOID BCB whose final-unfixing context has an enabled private-LRU assignment”처럼 정확한 표현으로 교체한다.
  - 새 HTML lesson은 기존 topology와 현재 uncommitted 작업이 이미 요구할 때만 만든다.

  HTML에 작은 시각적 흐름을 추가하되, 기존 asset이 충분하면 재사용한다. 새 SVG가 꼭 필요할 때만 root assets/에 만들고 EN/KO가 같은 asset을 공유하도록 한다.

  검증:

  - node scripts/check-maintainer-guide.mjs
  - node --test scripts/check-bilingual-teaching-site.test.mjs
  - node scripts/check-bilingual-teaching-site.mjs

  Copyparty URL이 설정되어 있으면 served HTTP/DOM 검사도 실행한다. URL이 없으면 UNAVAILABLE이라고 명시한다. Korean review fingerprint를 자동으로 승인하거나 fabricated receipt
  를 만들지 않는다.

  수정과 검증까지만 수행하고 commit/push하지 마라. 마지막에는:

  - 수정한 파일
  - canonical explanation을 둔 위치
  - 제거한 모호한 표현
  - 실행한 검사와 결과
  - 남은 UNAVAILABLE gate

  를 간단히 보고해줘.

