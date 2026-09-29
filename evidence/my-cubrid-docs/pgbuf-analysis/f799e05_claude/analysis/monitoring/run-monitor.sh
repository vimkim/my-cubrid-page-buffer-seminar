#!/usr/bin/env bash
# run-monitor.sh — whole-pool page-buffer path monitoring for simple SQLs.
#
# Requires:
#   - CUBRID_SRC: path to a cubrid worktree on branch page-buffer-survey-with-tracers
#     (provides quizzes/lib/common.sh and the instrumented page_buffer.c source check)
#   - the instrumented build of that branch installed, with the quiz harness
#     environment loaded ($CUBRID, $CUBRID_DATABASES)
#
# The server is started with CUBRID_PGBUF_TRACE_VPID=all so every traced page-buffer event of
# every page is appended to trace-all.log with a monotonic timestamp and thread index. Shell
# markers split the log into per-step sections that analysis can attribute to individual SQL
# statements.
#
# Output: ./trace-all.log (raw), plus a per-section event-count summary on stdout.
set -eu
cd "$(dirname "$0")"
: "${CUBRID_SRC:?set CUBRID_SRC to a cubrid worktree on branch page-buffer-survey-with-tracers}"
source "$CUBRID_SRC/quizzes/lib/common.sh"

TRACE_FILE="$(pwd)/trace-all.log"

mark () { echo "== MARK $* ==" >> "$TRACE_FILE"; quiz_note "MARK $*"; }

quiz_msg "0) instrumented build check"
if ! grep -q 'pgbuf_quiz_trace_all' "$CUBRID_SRC/src/storage/page_buffer.c"; then
  echo "ERROR: whole-pool tracer not in $CUBRID_SRC — check out branch page-buffer-survey-with-tracers." >&2
  exit 1
fi

quiz_msg "1) prepare db and conf (tracer still off)"
quiz_set_db_params data_buffer_size=64M checkpoint_interval=1min
if ! quiz_db_exists; then
  quiz_recreate_db
fi
quiz_start
quiz_sql_quiet "drop table if exists t_mon"
quiz_stop

quiz_msg "2) enable whole-pool tracer and boot"
rm -f "$TRACE_FILE"
export CUBRID_PGBUF_TRACE_VPID="all"
export CUBRID_PGBUF_TRACE_FILE="$TRACE_FILE"
mark "boot-1 (server start, recovery, daemons)"
quiz_start

quiz_msg "3) DDL/DML with tracer on"
mark "create-table (create table t_mon: catalog + file allocation)"
quiz_sql_quiet "create table t_mon (id int primary key, val varchar(64))"

mark "insert-one (insert a single row, autocommit)"
quiz_sql_quiet "insert into t_mon values (1, md5(1))"

mark "insert-200 (insert 200 rows in one statement, autocommit)"
quiz_sql_quiet "insert into t_mon
                select rownum + 1, md5(rownum) from db_class a, db_class b limit 200"

quiz_msg "4) restart so reads start cold"
mark "shutdown-1 (server stop: shutdown flush of dirty pages)"
quiz_stop
mark "boot-2 (second boot: clean restart)"
quiz_start

quiz_msg "5) read/update paths"
mark "connect-only (csql connects, runs 'select 1', disconnects — session baseline)"
quiz_sql_quiet "select 1"

mark "select-full-cold (first full scan after restart)"
quiz_sql_quiet "select sum(char_length(val)) from t_mon"

mark "select-full-hot (same full scan again)"
quiz_sql_quiet "select sum(char_length(val)) from t_mon"

mark "select-pk (select ... where id = 42 via primary-key b-tree)"
quiz_sql_quiet "select val from t_mon where id = 42"

mark "update-one (update one row via primary key, autocommit)"
quiz_sql_quiet "update t_mon set val = md5(id + 999) where id = 42"

quiz_msg "6) wait for checkpoint daemon (checkpoint_interval=1min)"
mark "checkpoint-wait (idle until checkpoint daemon flushes)"
quiz_watch_start
end0=$(cubrid statdump "$QUIZ_DB" 2>/dev/null | grep -E '^Num_log_end_checkpoints' | awk -F'=' '{print $2+0}')
for i in $(seq 1 36); do
  sleep 5
  endN=$(cubrid statdump "$QUIZ_DB" 2>/dev/null | grep -E '^Num_log_end_checkpoints' | awk -F'=' '{print $2+0}')
  if [ "${endN:-0}" -gt "${end0:-0}" ]; then
    quiz_note "checkpoint completed after ~$((i * 5))s"
    break
  fi
done
quiz_watch_stop

mark "shutdown-2 (final server stop)"
quiz_stop

quiz_msg "7) restore conf, restart without tracer"
unset CUBRID_PGBUF_TRACE_VPID CUBRID_PGBUF_TRACE_FILE
quiz_set_db_params data_buffer_size=64M
quiz_start

quiz_msg "8) per-section event summary"
awk '
  /^== MARK / { sec = $3; order[++n] = sec; next }
  sec != "" && $4 != "" { cnt[sec "|" $4]++; tot[sec]++ }
  END {
    for (i = 1; i <= n; i++) {
      s = order[i];
      printf "\n--- %s  (total %d events)\n", s, tot[s] + 0;
      for (k in cnt) {
        split (k, a, "|");
        if (a[1] == s) printf "    %-24s %6d\n", a[2], cnt[k];
      }
    }
  }' "$TRACE_FILE"
quiz_note "raw log: $TRACE_FILE"
