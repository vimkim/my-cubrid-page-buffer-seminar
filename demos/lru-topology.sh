#!/usr/bin/env bash
# Local seminar launcher. Override LRU_DEMO_ENV to select another ready runtime.
set -euo pipefail
source "${LRU_DEMO_ENV:-/home/vimkim/.local/state/cubrid-worktree-guard/worktrees/4a8d6850bca24b59/env.sh}"
exec python3 "$(dirname -- "${BASH_SOURCE[0]}")/lru-topology.py" \
  --database CBRD_27398_pgbuf_ \
  --socket /home/vimkim/.cub/runtime/4a8d6850/tmp/pgbuf-inspector/0625c42f6289420d9c22892621eb61a1.sock \
  "$@"
