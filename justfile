# Serve the site on all IPv4 interfaces without request logging. Requires copyparty on PATH.
serve port="3935":
    copyparty -i 0.0.0.0 -p "{{port}}" -v .::r --ih -q
