# Ticket 06 route and integration contract

Both languages use `lessons/0018a-compare-replacement-policies.html`. Entry: `#first-principles`; exit: `#session-page-journey`. Preserve the existing full-curriculum previous/next navigation. Stop at the closing callout; `#primary-reading` is optional reference material, not another current-session lesson.

Included order: `#first-principles`, `#cubrid`, `#postgres-model`, `#postgres-credit`, `#postgres-ring`, `#postgres-first-trace`, `#postgresql`, `#innodb-model`, `#innodb-promotion`, `#innodb-first-trace`, `#innodb`, `#dirty`, `#postgres-tradeoffs`, `#innodb-tradeoffs`, `#map`, `#misreadings`, `#retrieval`, `#session-capacity`, `#conclusion`, `#session-page-journey`. The `#postgresql` and `#innodb` stops retain a concise independent takeaway and optional source checklists, so section stepping does not encounter an unexplained pointer. Their detailed rules need not be read aloud twice.

The complete spoken segment is [06-script.html](06-script.html). It supplies narration, transitions, diagram cues and prediction/reveal pauses. Ticket07 must move its sections into the one current script, rewrite its relative link prefixes for that destination, and retain it as a scoped contribution rather than a second whole-session companion. The five script sections are comparison-entry, postgres, innodb, tradeoffs, closing (each ID has `script-` prefix).

## Closing recap for the route owner

English: A caller requests pages needed for a record operation; the buffer resolves or loads them into frames tracked by BCBs. Fix protects use lifetime; latch compatibility controls byte access. Matching unfixes repay debt; ordinary final unfix may update replacement policy. Candidate choice still needs protected revalidation, preservation of dirty data and old mapping removal before the same frame can carry another identity. H1/H2 retention depends on the established schedule and policy state. Other engines remember reuse differently; no measured winner follows. End this session here; detailed durability ordering and recovery follow next session.

Korean: 호출자가 레코드 작업에 필요한 페이지를 요청하면 버퍼는 BCB가 관리하는 프레임에서 찾거나 적재합니다. Fix는 사용 기간을 보호하고 latch의 호환성은 바이트 접근을 조정합니다. 대응하는 unfix로 빚을 갚고, 일반적인 마지막 unfix에서 교체 정책이 갱신될 수 있습니다. 후보를 골라도 보호 아래 재검사하고 dirty 데이터를 보존해야 하며, 이전 매핑을 없앤 뒤에야 같은 프레임에 다른 ID를 담을 수 있습니다. H1/H2의 생존은 확인한 요청 순서와 정책 상태에 달려 있습니다. 다른 엔진은 재사용을 다르게 기억하지만 측정 없이 우열을 정하지 않습니다. 이번 세션은 여기서 마치고 상세한 durability 순서와 recovery는 다음 세션으로 넘깁니다.

## Delivered dependency reconciliation

Read ticket04's actual `docs/first-time-participant-revision-trace.md` in its checkout before finalizing. Same full-pool checkpoint: 32,768 resident, INVALID0, private32 shared by A/B, quota5000 and 250/250/32268 zones; H1 tail3, H2 head1. Only changed input is A resuming H1/H2 before B scans S1/S2. Retention ends with both hot pages; paused branch ends with H1 replaced by S1 and H2 resident. Comparison and script explicitly repeat the timing difference and bounded shared-domain conclusion, without general scan isolation or permanent retention claims. The comparison does not duplicate the producer's detailed transition ledger.

No new cross-engine transition claim or runtime measurement is introduced. Existing source pins, ring eligibility, nested-pin credit, promotion-time qualifications, dirty-state revalidation, original anchors and lab result links remain. New capacity question reuses the lab's existing finite traces: LRU12/MRU6/OPT6 for `(A B C D) × 3`, and LRU4/MRU12 for `A B (C D) × 5`, with the original three-empty-frame clean demand-loading assumptions. A/B here are explicitly textbook page names, not execution contexts.
