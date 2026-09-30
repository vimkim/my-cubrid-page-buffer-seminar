# Serve the site on all IPv4 interfaces without request logging. Requires copyparty on PATH.
# Without a port, use the first free port at or above 3935.
serve port="" host="192.168.4.2":
    #!/usr/bin/env bash
    set -euo pipefail
    port="{{port}}"
    if [ -z "$port" ]; then
        port=$(python3 -c 'import socket
    for p in range(3935, 65536):
        s = socket.socket()
        try:
            s.bind(("0.0.0.0", p))
        except OSError:
            continue
        finally:
            s.close()
        print(p)
        break')
    fi
    echo "Serving on http://{{host}}:$port/"
    echo "  Korean: http://{{host}}:$port/ko/index.html"
    echo "  English: http://{{host}}:$port/en/index.html"
    exec copyparty -i 0.0.0.0 -p "$port" -v .::r --ih -q

# Walk through private LRU reuse and cross-session sharing; press Enter per step.
[positional-arguments]
demo-lru *args:
    ./demos/lru-topology.sh "$@"

# Rehearse against the running database without Enter prompts; writes temporary fixtures.
[positional-arguments]
demo-lru-check *args:
    ./demos/lru-topology.sh --auto "$@"

# Reset the demo's buffer/LRU state, preserving disk data; finish active demos first.
[positional-arguments]
demo-restart-db database="CBRD_27398_pgbuf_":
    #!/usr/bin/env bash
    set -euo pipefail
    source "${LRU_DEMO_ENV:-/home/vimkim/.local/state/cubrid-worktree-guard/worktrees/4a8d6850bca24b59/env.sh}"
    "$CUBRID/bin/cubrid" server restart "$1"
    echo "Database restarted. Reload Volmap, enable observations, then run just demo-lru."

# Serve the demo database with real inspector observations; Ctrl-C stops Volmap.
# Stop an existing Volmap on this address first. Open the printed URL locally.
[positional-arguments]
demo-serve-volmap host="192.168.4.2" port="7777":
    #!/usr/bin/env bash
    set -euo pipefail
    source "${LRU_DEMO_ENV:-/home/vimkim/.local/state/cubrid-worktree-guard/worktrees/4a8d6850bca24b59/env.sh}"
    volmap_bin="${LRU_DEMO_VOLMAP_BIN:-/home/vimkim/temp/volmap/target/x86_64-unknown-linux-musl/debug/volmap}"
    echo "Volmap URL: http://$1:$2/ — click Enable observations, then select LRU topology."
    exec "$volmap_bin" serve \
      --database CBRD_27398_pgbuf_ \
      --databases-file "$CUBRID_DATABASES/databases.txt" \
      --format-profile feat-oos --listen "$1:$2" \
      --runtime-page-buffer \
      --runtime-socket "$CUBRID_TMP/pgbuf-inspector/0625c42f6289420d9c22892621eb61a1.sock"
