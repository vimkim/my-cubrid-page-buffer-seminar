#!/usr/bin/env bash
set -euo pipefail

quiz_number=${1:?usage: run-one.sh <1|2|3|4>}
case "${quiz_number}" in
  1|2|3|4) ;;
  *) echo "quiz number must be 1, 2, 3, or 4" >&2; exit 2 ;;
esac

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
report_dir=$(cd "${script_dir}/.." && pwd)
db_name=ca_pgbuf_f799e05
registry=${CUBRID_DATABASES:?CUBRID_DATABASES must come from the pinned worktree environment}/databases.txt
cubrid_bin=${CUBRID:?CUBRID must come from the pinned worktree environment}/bin/cubrid
csql_bin=${CUBRID}/bin/csql
owned=0

if awk -v db="${db_name}" '$1 == db { found = 1 } END { exit(found ? 0 : 1) }' "${registry}"
then
  echo "refusing to use pre-existing database: ${db_name}" >&2
  exit 3
fi

cleanup_owned_db ()
{
  if (( owned == 0 )); then
    return
  fi
  "${cubrid_bin}" deletedb "${db_name}"
  owned=0
  if awk -v db="${db_name}" '$1 == db { found = 1 } END { exit(found ? 0 : 1) }' "${registry}"
  then
    echo "owned quiz database survived cleanup: ${db_name}" >&2
    exit 4
  fi
}
trap cleanup_owned_db EXIT INT TERM

cd "${report_dir}/experiments"
"${cubrid_bin}" createdb "${db_name}" en_US
owned=1
"${csql_bin}" -S -u dba "${db_name}" -i setup.sql

cd "${script_dir}/quiz-${quiz_number}"
"${csql_bin}" -S -u dba "${db_name}" -i quiz.sql

echo "quiz-${quiz_number} completed; owned database will now be deleted"
