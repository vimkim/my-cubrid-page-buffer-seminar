# LRU demo verification — 2026-09-30

**Runtime observation:** two persistent client-server CSQL sessions on the real
`CBRD_27398_pgbuf_` database, using the existing inspector-enabled Debug install.
The sample database server and Volmap remained running after verification.

The producer source checkout inspected was `6bf4753eaa136fb87a4632deac44dc403ad0538e`;
the Volmap checkout was `c9ed4ccaae4310fad380384a5808ee1e14e8d14c`. The running
[artifact hashes](artifact-identities.json) identify the actual binaries. This
verification did not rebuild them or independently establish their exact build
provenance. It is not a runtime receipt for the guide's `f799e05` baseline.

## Accepted paced run

Invoked `just demo-lru --output /tmp/lru-demo-paced-1790735226717`, supplied one
newline per prompt, and waited two seconds between SQL steps while headless
Chromium displayed the emitted sector URL with observations and LRU topology
enabled. No HTTP responses or inspector observations were mocked.

[Session metadata](run.json) records CSQL A PID `2284312` and B PID `2284313`
(the authoritative PIDs are those in that file). Both clients used the same
runtime and stayed connected throughout the demonstration. Their full
[session A](csql-A.log) and [session B](csql-B.log) transcripts show the actual
SQL (committed transcript copies trim trailing whitespace; original logs remain
in the run directory). [Terminal output](terminal.log) and [native captures](observations.jsonl)
record the completed steps and cleanup.

| Step | Target VPID | Kind-local list | Zone |
|---|---|---|---|
| Selected candidate | 1:3137 | private 57 | LRU3 |
| After filler | 1:3137 | private 57 | LRU3 |
| A read 1 | 1:3137 | private 57 | LRU1 |
| A read 2 | 1:3137 | private 57 | LRU1 |
| A read 3 | 1:3137 | private 57 | LRU1 |
| B first read | 1:3137 | shared 11 | LRU2 |
| B second read | 1:3137 | shared 11 | LRU1 |

All accepted native scans completed without truncation. Seven recycled,
already-shared candidate pages were skipped before selecting the private target.
This matters on a database reused across demonstrations.

[Browser checks](browser-check.json) passed resident/private rendering through
A's steps and resident/shared rendering after B, with no page errors. Browser
polls are independent samples: they showed private LRU3/shared LRU2 at the
recorded moments, while the native terminal captures caught the LRU1 promotions.
The browser check does **not** claim to show every zone transition. An earlier
check requiring the browser to catch private LRU1 failed; its local evidence is
`/tmp/lru-demo-paced-1790735089872`. The run guide discloses this sampling limit.

## Other checks

- `just demo-lru-check --output /tmp/lru-demo-final-247` passed with the full sequence: private LRU1 → private
  LRU3 → private LRU1 → shared LRU2 → shared LRU1.
- Enter-driven early `q` at the second prompt returned exit 130, dropped that
  run's fixture tables, and left neither recorded CSQL PID alive. Local receipt:
  `/tmp/lru-demo-quit-2298533`.
- A deliberate SQL error closed the failed client, propagated the failure, and
  left the second original client usable; both exited afterward. Local receipt:
  `/home/vimkim/tmp/lru-error-check-kxq2ns7x`.
- A catalog query after completed and cancelled rehearsals found zero remaining
  `lru_demo_%` or `lru_fill_%` tables.
- Python compilation, shell syntax, `just --list`, `just demo-lru --help`, and
  `git diff --check` passed.
- [Aggregate guide checks](guide-checks.txt) passed Markdown/link/asset checks,
  Copyparty HTTP for 114 resources, and headless live DOM for 43 guide pages.

The demo modifies only unique fixture tables, but those writes and reads affect
the shared buffer pool, logs, and volume allocation. These receipts establish
this controlled demonstration; they do not guarantee exact zones under a
concurrent workload or prove the complete internal event order between samples.
