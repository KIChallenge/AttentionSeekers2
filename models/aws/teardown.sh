#!/usr/bin/env bash
# Delete every AWS resource of the SageMaker persona path (Project=sv-ki-challenge):
#   running training jobs (stopped), inference components, endpoint, endpoint configs, models,
#   S3 bucket contents and bucket, IAM execution role, budget.
# Default is a DRY RUN that only prints what it would delete. Pass --execute to delete.
#   models/aws/teardown.sh             # dry run
#   models/aws/teardown.sh --execute   # really delete (irreversible: adapters in S3 are gone too)
# Download adapters first if you want to keep them:
#   aws s3 sync s3://<bucket>/adapters/ models/out/lora-sagemaker/
set -euo pipefail

REGION="${SV_AWS_REGION:-eu-north-1}"
PROJECT="sv-ki-challenge"
ENDPOINT="${SV_SM_ENDPOINT:-sv-ki-challenge-personas}"
ROLE="${SV_SM_ROLE:-sv-ki-challenge-sagemaker}"
DRY=1
[ "${1:-}" = "--execute" ] && DRY=0

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${SV_SM_BUCKET:-$PROJECT-$ACCOUNT-$REGION}"
SM=(aws sagemaker --region "$REGION")

run() {
  if [ "$DRY" = 1 ]; then echo "[dry-run] $*"; else echo "+ $*"; "$@" || echo "  (failed, continuing)"; fi
}

echo "region=$REGION endpoint=$ENDPOINT bucket=$BUCKET role=$ROLE mode=$([ "$DRY" = 1 ] && echo dry-run || echo EXECUTE)"

# 1. training jobs still running
for job in $("${SM[@]}" list-training-jobs --status-equals InProgress --name-contains "$PROJECT" \
    --query 'TrainingJobSummaries[].TrainingJobName' --output text); do
  run "${SM[@]}" stop-training-job --training-job-name "$job"
done

# 2. inference components (adapters first, base last), then the endpoint
ics="$("${SM[@]}" list-inference-components --endpoint-name-equals "$ENDPOINT" \
    --query 'InferenceComponents[].InferenceComponentName' --output text 2>/dev/null || true)"
for ic in $ics; do
  [ "$ic" = "sv-base" ] && continue
  run "${SM[@]}" delete-inference-component --inference-component-name "$ic"
done
for ic in $ics; do
  [ "$ic" = "sv-base" ] || continue
  if [ "$DRY" = 0 ]; then sleep 20; fi
  run "${SM[@]}" delete-inference-component --inference-component-name "$ic"
done
if "${SM[@]}" describe-endpoint --endpoint-name "$ENDPOINT" >/dev/null 2>&1; then
  if [ "$DRY" = 0 ] && [ -n "$ics" ]; then
    echo "waiting for inference components to disappear"
    for _ in $(seq 60); do
      left="$("${SM[@]}" list-inference-components --endpoint-name-equals "$ENDPOINT" \
          --query 'length(InferenceComponents)' --output text)"
      [ "$left" = "0" ] && break
      sleep 10
    done
  fi
  run "${SM[@]}" delete-endpoint --endpoint-name "$ENDPOINT"
else
  echo "endpoint $ENDPOINT: not found"
fi

# 3. endpoint configs and models with the project prefix
for cfg in $("${SM[@]}" list-endpoint-configs --name-contains "$PROJECT" \
    --query 'EndpointConfigs[].EndpointConfigName' --output text); do
  run "${SM[@]}" delete-endpoint-config --endpoint-config-name "$cfg"
done
for m in $("${SM[@]}" list-models --name-contains "$PROJECT" --query 'Models[].ModelName' --output text); do
  run "${SM[@]}" delete-model --model-name "$m"
done

# 4. bucket contents and bucket
if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
  if [ "$DRY" = 1 ]; then
    echo "[dry-run] aws s3 rm s3://$BUCKET --recursive   ($(aws s3 ls "s3://$BUCKET" --recursive --summarize \
        --region "$REGION" | tail -2 | tr '\n' ' '))"
  else
    run aws s3 rm "s3://$BUCKET" --recursive --region "$REGION" --only-show-errors
  fi
  run aws s3api delete-bucket --bucket "$BUCKET" --region "$REGION"
else
  echo "bucket $BUCKET: not found"
fi

# 5. IAM role (inline policies first)
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  for p in $(aws iam list-role-policies --role-name "$ROLE" --query 'PolicyNames' --output text); do
    run aws iam delete-role-policy --role-name "$ROLE" --policy-name "$p"
  done
  run aws iam delete-role --role-name "$ROLE"
else
  echo "role $ROLE: not found"
fi

# 6. budget
if aws budgets describe-budget --account-id "$ACCOUNT" --budget-name "$PROJECT" --region us-east-1 >/dev/null 2>&1; then
  run aws budgets delete-budget --account-id "$ACCOUNT" --budget-name "$PROJECT" --region us-east-1
else
  echo "budget $PROJECT: not found"
fi

# CloudWatch log groups (/aws/sagemaker/TrainingJobs, /aws/sagemaker/Endpoints/$ENDPOINT) are kept for the
# record; they cost cents. Delete with: aws logs delete-log-group --log-group-name /aws/sagemaker/Endpoints/$ENDPOINT
echo "done ($([ "$DRY" = 1 ] && echo 'dry run, nothing deleted' || echo 'deleted'))"
