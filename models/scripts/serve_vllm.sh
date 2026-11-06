#!/usr/bin/env bash
# Multi-LoRA serving of all trained persona adapters on one base model (GPU VM).
# Each adapter is addressable as model=<role> on the OpenAI-compatible endpoint; model=<base> is the
# prompted baseline. Non-thinking mode is forced per request by the engine/eval via
#   extra_body={"chat_template_kwargs": {"enable_thinking": false}}
# Usage: scripts/serve_vllm.sh [base_model] [port]
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-Qwen/Qwen3-8B}"
PORT="${2:-8000}"
mods=()
for d in out/lora/*/; do
  [ -f "$d/adapter_config.json" ] || continue
  mods+=("$(basename "$d")=$(realpath "$d")")
done
[ ${#mods[@]} -gt 0 ] || { echo "no adapters in out/lora/"; exit 1; }
echo "serving ${#mods[@]} adapters on $BASE: ${mods[*]}"
exec vllm serve "$BASE" --port "$PORT" --host 127.0.0.1 \
  --enable-lora --max-loras "${#mods[@]}" --max-lora-rank 16 --max-cpu-loras 16 \
  --max-model-len 4096 --gpu-memory-utilization 0.90 \
  --lora-modules "${mods[@]}"
