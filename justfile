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
