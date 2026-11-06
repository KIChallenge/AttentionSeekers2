#!/usr/bin/env bash
# Download the nine persona LoRA adapters from the SageMaker bucket into models/out/lora-sagemaker/<role>/
# (gitignored), the input of models/hf/publish.py. Run this BEFORE models/aws/teardown.sh --execute,
# which deletes the bucket.
#
#   aws sso login            # the CLI session (SSO) expires after about an hour
#   models/hf/fetch_adapters.sh
#
# Bucket: sv-ki-challenge-<account>-eu-north-1 (account from STS), override with SV_SM_BUCKET.
# Only adapter_config.json and adapter_model.safetensors are fetched: no training data, no
# train_meta.json, no tarballs. Each adapter_config.json already names Qwen/Qwen3-8B as base.
set -euo pipefail

REGION="${SV_AWS_REGION:-eu-north-1}"
PROJECT="sv-ki-challenge"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="${SV_ADAPTER_PREFIX:-adapters}"   # adapters-v2 for the v2 set (then pass out/lora-sagemaker-v2)
OUT="${1:-$HERE/../out/lora-sagemaker}"
ROLES=(laender social_insurance chamber_labour nursing hospitals ministry_finance chamber_commerce medical_chamber patients)

if ! ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "AWS credentials missing or expired. Run: aws sso login" >&2
  exit 1
fi
BUCKET="${SV_SM_BUCKET:-$PROJECT-$ACCOUNT-$REGION}"
mkdir -p "$OUT"
echo "bucket=$BUCKET out=$OUT"

for role in "${ROLES[@]}"; do
  aws s3 sync --region "$REGION" "s3://$BUCKET/$PREFIX/$role/" "$OUT/$role/" \
    --exclude "*" --include "adapter_config.json" --include "adapter_model.safetensors"
  for f in adapter_config.json adapter_model.safetensors; do
    [ -s "$OUT/$role/$f" ] || { echo "missing $role/$f" >&2; exit 1; }
  done
  echo "ok $role ($(du -h "$OUT/$role/adapter_model.safetensors" | cut -f1))"
done
echo "done. Next: python -I models/hf/publish.py   (dry run), then --execute"
