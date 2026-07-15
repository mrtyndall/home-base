#!/bin/sh
set -eu

# Railway volumes are mounted as root at runtime. Correct ownership before
# dropping privileges so each worker can persist its independent Codex login.
mkdir -p /data/codex
chown -R homebase:homebase /data/codex

exec gosu homebase "$@"
