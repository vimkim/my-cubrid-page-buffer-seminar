#!/usr/bin/env bash
set -euo pipefail

db_name=ca_pgbuf_f799e05
cubrid server stop "${db_name}"
cubrid server start "${db_name}" </dev/null >/dev/null 2>&1

attempt=0
while ! cubrid server status | grep -F "Server ${db_name} " >/dev/null
do
  attempt=$((attempt + 1))
  if (( attempt >= 30 )); then
    echo "suite database did not become ready" >&2
    exit 1
  fi
  sleep 1
done

echo "restarted owned database: ${db_name}"
