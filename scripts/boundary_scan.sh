#!/usr/bin/env bash
# 切片 0.2：产品代码禁止铜炉 / s3_ / vis-timeline 当主面。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set +e
HITS=$(rg -n --glob '*.rs' --glob '*.ts' --glob '*.tsx' --glob '*.js' --glob '*.jsx' --glob '*.py' \
  --glob '!vendor/graphiti/**' --glob '!vendor/EverOS/**' --glob '!vendor/semantica/**' \
  --glob '!vendor/HyperMem/**' --glob '!vendor/TiMem/**' --glob '!vendor/NarrativeNode/**' \
  --glob '!vendor/novalist/**' --glob '!vendor/obsidian-storyline/**' --glob '!vendor/vis-timeline/**' \
  --glob '!vendor/yggsii/**' --glob '!vendor/narra/target/**' \
  -e 'import scribe3' -e 'SCRIBE3_' -e '\bs3_' .)
CODE=$?
set -e
if [[ $CODE -eq 0 ]]; then
  echo "FAIL boundary hits:"
  echo "$HITS"
  exit 1
fi
if [[ $CODE -eq 1 ]]; then
  echo "PASS: no import scribe3 / SCRIBE3_ / s3_ in product code"
  exit 0
fi
echo "rg error $CODE"
exit "$CODE"
