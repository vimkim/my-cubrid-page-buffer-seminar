#!/usr/bin/env bash
set -euo pipefail

db_name=ca_pgbuf_f799e05
registry="${CUBRID_DATABASES}/databases.txt"

awk -v db="${db_name}" '$1 == db { found = 1 } END { exit(found ? 0 : 1) }' "${registry}"
cubrid server stop "${db_name}" || true
mapfile -t owned_pids < <(ps -eo pid=,args= | awk -v db="${db_name}" '$2 == "cub_server" && $3 == db && NF == 3 { print $1 }')
if (( ${#owned_pids[@]} > 1 )); then
  echo "ambiguous owned server process" >&2
  exit 1
fi
if (( ${#owned_pids[@]} == 1 )); then
  kill -TERM "${owned_pids[0]}"
  attempt=0
  while kill -0 "${owned_pids[0]}" 2>/dev/null
  do
    attempt=$((attempt + 1))
    if (( attempt >= 30 )); then
      echo "owned server did not stop" >&2
      exit 1
    fi
    sleep 1
  done
fi
cubrid deletedb "${db_name}"

if awk -v db="${db_name}" '$1 == db { found = 1 } END { exit(found ? 0 : 1) }' "${registry}"
then
  echo "registry entry survived cleanup" >&2
  exit 1
fi

echo "cleaned owned database: ${db_name}"
