#!/bin/sh
set -eu

DATA_FILE_PATH="${DATA_FILE:-/app/data/accounts.json}"
DATA_DIR="$(dirname "$DATA_FILE_PATH")"

mkdir -p "$DATA_DIR" /app/logs
chown -R node:node "$DATA_DIR" /app/logs

exec su-exec node "$@"
