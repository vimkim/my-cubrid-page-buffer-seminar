# Maintenance: private-LRU quotas and LRU zone thresholds

Source-checked on 2026-10-13 at CUBRID
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, after searching the local
`my-cubrid-docs/pgbuf-analysis` knowledge base. Findings are **Verified mechanism**
and revision-bound **Implementation policy**, without runtime measurements.

Maintenance tunes replacement policy within the existing buffer pool. Pool
capacity is initialized from `PRM_ID_PB_NBUFFERS`; quota adjustment uses that
capacity rather than resizing it. [Initialization](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L1713-L1721),
[quota calculation](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14432-L14455).

- **Private quotas:** `quota` belongs to private lists only. Activity from private
  and shared lists determines the private share, then private-list activity
  distributes that share. [Field](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L609-L614),
  [activity and distribution](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14332-L14455).
- **Both domains' zones:** the same function sets private and shared LRU1/LRU2
  thresholds. Calling all maintenance work private-only would omit shared
  policy. [Private thresholds](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14453-L14464),
  [shared thresholds](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L14477-L14494).
- **Replacement effect:** thresholds demote pages toward LRU3; quotas affect
  victim search. They are policy targets, not strict resident-page limits.
  [Demotion](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9984-L10023),
  [quota-sensitive search](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9115-L9155),
  [under-quota fallback](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9230-L9249).

The daemon calls quota adjustment and the intended direct-victim backup, without
writing page images. Preserve [VS-20 and VS-21](../unresolved-or-version-sensitive-findings.md#b-current-pinned-revision-cleanup-and-proof-obligations):
backup loop entry is broken and activity sampling is approximate. [Daemon](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L16994-L17010),
[backup loops](https://github.com/CUBRID/cubrid/blob/f799e05d77d5300c6ea5753b4a6cc7caee6d8912/src/storage/page_buffer.c#L9629-L9645).

## Applied correction

The [English overview](../en/seminar-3/03-daemon-architecture.html#cadence)
now says **Adjust LRU retention targets**; the
[Korean overview](../ko/seminar-3/03-daemon-architecture.html#cadence) says
**LRU의 보존 목표 조정하기**. Both explicitly distinguish private-LRU quotas
from private/shared LRU zone thresholds and state that total frame capacity
stays unchanged. The paired maintenance chapter and
[Korean spoken script](../my-presentation-script-session-3.html#maintenance)
use the same scope. No URLs, section anchors, engine code or policy changed.

The edited pairs retain pending human-review status; only their fingerprints
were refreshed. The full bilingual validation reports the same pre-existing
78 missing human receipts and 96 stale fingerprints as before this correction,
with no additional failures. The maintainer-guide aggregate passes source,
HTTP (114 resources) and live-DOM (43 pages) checks. The separate bilingual
served gate passes HTTP (351 resources) and live-DOM (158 pages) checks.
Focused headless checks of both revised cards pass at 1440px and 390px,
including Presentation mode. The research note passes the Copyparty Markdown
source checker.
