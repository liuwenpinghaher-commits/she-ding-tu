#!/bin/zsh
# Narra 本地预览（CLI，没有浏览器界面）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$HOME/.cargo/env"
export NARRA_DATA_PATH="$ROOT/demos/narra-preview/.narra"
NARRA="$ROOT/vendor/narra/target/debug/narra"
if [[ ! -x "$NARRA" ]]; then
  echo "先编译: cd $ROOT/vendor/narra && cargo build" >&2
  exit 1
fi
exec "$NARRA" "$@"
