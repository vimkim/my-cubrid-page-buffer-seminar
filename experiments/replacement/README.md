# Native replacement evidence

The experiment calls the actual CUBRID `pgbuf_fix/unfix` implementation at
`f799e05d77d5300c6ea5753b4a6cc7caee6d8912`, plus the isolated experiment patch
stored alongside this record. It is module-level behavioral evidence, not a
SQL benchmark, a physical-device I/O measurement, or a customer-workload claim.

## Setup and observation boundary

Use a private disposable database, a debug SERVER_MODE build, 64 MiB data buffer
(4096 actual 16 KiB frames), and 16 MiB log buffer. The program allocates real
permanent-file pages and flushes their initialized images. It enables cleaning,
allows normal maintenance to run for 600 ms, then freezes maintenance under a
mutex that waits for an in-progress callback to finish. Flush daemons remain
running. It invalidates the pool and requests READ fix/unfix in three ordered
passes over 2048 pages (fits) or 4097 pages (cycle).

The freeze controls quota timing; it does not alter replacement ordering or the
victim eligibility checks. Setup scheduling can change the initial frozen quota,
so receipts record it. The callback mutex, trace calls and output add overhead:
none of these traces establishes uninstrumented execution time. There is one
requesting context and no client SQL or competing application workload. This
experiment does not test concurrent flush/latch interleavings.

Existing pinned trace sites emit FIX_HIT, READ_FROM_DISK, EVICTED and movement
records. A thread-local request number scopes events to the experiment caller.
The request's VPID identifies target traffic; debug volume validation can generate
additional reads and hits for other VPIDs. The analyzer checks target residency
transitions against events, exact request/pass counts, cold first access,
quota-derived thresholds, AOUT capacity, and all-hit fitting repeats. It does not
assert that the cyclic result must be all misses. Process exit zero is separately
required: a complete-looking prefix from a failed process is not accepted.

## Reproduction

Apply `native-experiment.patch` to a clean worktree at the baseline. The patch
contains the executable, observation seam, CMake target and experiment config.
Follow `experiments/seminar-replacement/README.md` in that patched worktree for
standard CMake build/install and disposable-database commands. Run the two cases
serially and retain stdout only after both processes exit zero. Compress without
a timestamp for stable archival:

```sh
gzip -n -c fits.jsonl > fits.jsonl.gz
gzip -n -c cycle.jsonl > cycle.jsonl.gz
python3 analyze.py fits.jsonl.gz cycle.jsonl.gz > summary.json
```

`summary.json` records raw artifact SHA-256 values, per-pass outcomes and the
initial/final list snapshots. `provenance.json` records source/build identity,
configuration and execution exits. The browser receipt belongs to the separate
educational model, not to native-engine verification.

## Development trials excluded from final evidence

An initial observer incorrectly treated a private-relative index as a whole-LRU
index; it was corrected to use the engine conversion macro. An installation also
restored the default 512 MiB buffer; the final branch pins 64 MiB in its config.
A stopped-daemon prototype completed reads but could exhaust clean frames during
rollback. Recreating daemons then exposed the pinned debug flush-thread identity
assertion. The final fixture keeps daemon identities intact and freezes only
maintenance. Failed/obsolete trials are excluded from the accepted receipts;
these fixture failures are not claimed as newly discovered production defects.

## Interpretation

Read the measured result in `summary.json` alongside the paired seminar lab.
AOUT is zero at this pin. Zone ratios derive from quota, actual list length,
rounding and update timing. Neither the observed ratio nor the cyclic all-miss
behavior is a claim about every CUBRID workload or every revision. The experiment
adds no alternate policy and measures no performance improvement. YCSB/sysbench
benchmarking, statistical test design and a general fix/unfix framework remain
separate projects.
