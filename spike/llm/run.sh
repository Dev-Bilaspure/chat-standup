#!/bin/zsh
# Runs the extraction test through headless Claude Code in several configurations, in parallel.
# Usage: spike/llm/run.sh            → results in spike/llm/out/, summary via report.ts
cd "${0:A:h}"
mkdir -p out
SYSTEM="$(cat system.txt)"
SCHEMA="$(cat schema.json)"
LEAN=(--system-prompt "$SYSTEM" --tools "" --strict-mcp-config --setting-sources "")

run() {
  local name=$1; shift
  local start=$(perl -MTime::HiRes=time -e 'printf "%.0f", time*1000')
  claude -p --output-format json --no-session-persistence --json-schema "$SCHEMA" "$@" < input.txt > "out/$name.json" 2> "out/$name.err"
  local code=$?
  local end=$(perl -MTime::HiRes=time -e 'printf "%.0f", time*1000')
  echo "{\"wall_ms\": $((end - start)), \"exit\": $code}" > "out/$name.meta.json"
}

run default --append-system-prompt "$SYSTEM" &
run lean-sonnet --model sonnet "${LEAN[@]}" &
run lean-haiku --model haiku "${LEAN[@]}" &
wait
npx tsx report.ts
