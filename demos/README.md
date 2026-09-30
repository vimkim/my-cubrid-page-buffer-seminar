# Two-session LRU topology demo

Run from the seminar task worktree:

```sh
just demo-lru
```

Keep the terminal and Volmap browser visible side by side. The script prints a
sector URL and a page-detail URL after setup. Open the sector URL locally, click
**Enable observations**, and select **LRU topology**. Press **Enter** in the
terminal for each step; `q`, Ctrl-C, or EOF stops the demo and attempts cleanup.
It never opens a browser on the remote server.

The launcher selects the existing inspector-enabled worktree database
`CBRD_27398_pgbuf_`, which contains the demodb sample data. CUBRID and Volmap must
already be running. It connects two persistent `csql -C` processes as DBA, using
auto-commit so B can see A's committed fixture. Committing does not reconnect
the sessions. Sample tables are not modified.

## What each Enter does

| Step | Action | What to watch |
|---|---|---|
| 1 | A creates a one-row fixture; B stays connected and idle. | A verified private heap-header page; its exact VPID is printed. |
| 2 | A inserts 4,096 rows into a separate filler table (about 8 MiB of payload). | The target ages toward private LRU3 as other pages are admitted. |
| 3 | A reads the target row. | The old private page can boost to LRU1. |
| 4–5 | A repeats the same read. | Private membership remains; an LRU1 hit normally stays LRU1. |
| 6 | B executes the same read while A remains connected. | The same VPID changes from private to shared membership, normally shared LRU2. |
| 7 | B reads again. | Shared membership remains; the rehearsal observed shared LRU1. |
| 8 | Finish after inspecting the final display. | The script drops its fixture tables and closes both clients. |

Every observation prints the list kind, kind-local index, zone, current fix
count, and the difference from the previous sample. `P1/P2/P3` in Volmap means
private membership; `S1/S2/S3` means shared membership. The list indices have
meaning only within the same server incarnation.

The watched VPID is the table's **heap-header page**, resolved by `SHOW HEAP
HEADER`. It is not the `Next_vpid` page: that successor need not be accessed by
the one-row query. SQL can fix several pages and can fix a page more than once;
one Enter is one SQL step, not exactly one native fix call. The sampled
`fix_count=0` after SQL completion is expected and is not a cumulative hit count.

The script verifies that the inspector's primary-volume device/inode match the
selected SQL database. It rejects a server restart, unavailable/ambiguous target
observation, early loss of private membership, and missing sharing. A run that
misses the private-zone promotion is reported as incomplete. Observations are
non-atomic diagnostic samples; background quota maintenance can change zones
between Enter presses and browser polls. They do not expose exact linked-list
positions, an event history, or disk/memory correspondence.

## Rehearsal and cleanup

```sh
just demo-lru-check
```

This executes the same real SQL without waiting for Enter. Both commands write
client transcripts, per-session CSQL diagnostic files, session PIDs, and native
inspector receipts into a new `/tmp/lru-demo-*` directory. They leave the existing
database server and Volmap running.

Fixtures have unique `lru_demo_<run>_*` and `lru_fill_<run>` names. Recycled pages
may already belong to shared lists, so setup retains unsuitable candidate tables
until a private target is found, then removes all of them at exit. It tries at
most 16 candidates by default; repeated rehearsals can require a larger bound:

```sh
just demo-lru --max-candidates 32
```

If no private target is available, the script stops rather than mislabeling a
shared page. Cleanup failures print the exact remaining `DROP TABLE` commands.
A forced kill or machine failure can leave fixtures behind; use the saved CSQL
transcripts to identify this run's tables before removing them. Normal cleanup
does not shrink database volumes or erase the workload's buffer-pool effects.

## Selecting another setup

The shell launcher contains this machine's current runtime environment and
socket paths. Override the environment file and explicit command arguments
when using another initialized inspector runtime:

```sh
LRU_DEMO_ENV=/absolute/path/to/env.sh just demo-lru \
  --database my_worktree_database \
  --socket /actual/pgbuf-inspector/database.sock \
  --url http://127.0.0.1:7777 \
  --volmap-root /absolute/path/to/volmap
```

The Python implementation uses the selected Volmap checkout's
`examples/pgbuf_socket.py` protocol client and Python's standard library. It
requires Linux, the inspector v1 protocol, a local same-UID socket, and a DBA
connection without a password prompt. The URL must point to Volmap serving the
same database with runtime observations enabled. Neither launcher starts or
restarts a database, changes server parameters, or starts synthetic observations.

## Evidence and source scope

The [verification receipt](verification/README.md) records the actual producer,
consumer, and observed states. This is a runtime demonstration on the installed
inspector build, separate from the guide's pinned `f799e05` baseline.

The canonical [private-domain and final-unfix explanation](../advanced/replacement-progress.md#how-a-private-lru-index-is-assigned)
and its [source derivation](../reference/private-lru-domain-hit-age-and-unfix-placement.md)
explain the policy. The current inspector source was checked for the same
private-domain mismatch predicate in `pgbuf_should_move_private_to_shared`, the
LRU-zone branches of `pgbuf_unlatch_bcb_upon_unfix`, and private-to-shared middle
insertion in `pgbuf_lru_move_from_private_to_shared`. Two different sessions are
not an unconditional guarantee of different private domains; the demo checks
the observed result.
