"""Step 1+2: budget, S3 bucket, SageMaker execution role (idempotent).

  uv run python -I setup_infra.py            # create or update
  uv run python -I setup_infra.py --check    # print what exists, change nothing

Budget: monthly COST budget, account-wide (tag filters need activated cost allocation tags), no
subscribers because no project mail address is configured; check it in the Billing console.
Role: least privilege for this bucket, the SageMaker log groups, metrics in /aws/sagemaker/*, and image
pulls from the AWS Deep Learning Containers registry only.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (BUDGET_NAME, DLC_ACCOUNT, PROJECT, REGION, ROLE_NAME, TAGS, account, bucket,  # noqa: E402
                    session)

BUDGET_USD = "200"


def budget(check: bool):
    b = session().client("budgets", region_name="us-east-1")
    try:
        cur = b.describe_budget(AccountId=account(), BudgetName=BUDGET_NAME)["Budget"]
        print("budget exists:", cur["BudgetLimit"])
        if not check and cur["BudgetLimit"]["Amount"].split(".")[0] != BUDGET_USD:
            cur["BudgetLimit"] = {"Amount": BUDGET_USD, "Unit": "USD"}
            cur.pop("CalculatedSpend", None)
            b.update_budget(AccountId=account(), NewBudget=cur)
            print("budget limit set to", BUDGET_USD)
        return
    except ClientError as e:
        if e.response["Error"]["Code"] != "NotFoundException":
            raise
    if check:
        print("budget: missing")
        return
    b.create_budget(AccountId=account(), Budget={
        "BudgetName": BUDGET_NAME, "BudgetType": "COST", "TimeUnit": "MONTHLY",
        "BudgetLimit": {"Amount": BUDGET_USD, "Unit": "USD"}}, ResourceTags=TAGS)
    print("budget created:", BUDGET_USD, "USD/month (no subscribers)")


def s3(check: bool):
    s = session().client("s3")
    name = bucket()
    try:
        s.head_bucket(Bucket=name)
        print("bucket exists")
        if check:
            return
    except ClientError:
        if check:
            print("bucket: missing")
            return
        s.create_bucket(Bucket=name, CreateBucketConfiguration={"LocationConstraint": REGION})
        print("bucket created")
    s.put_public_access_block(Bucket=name, PublicAccessBlockConfiguration={
        "BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    s.put_bucket_encryption(Bucket=name, ServerSideEncryptionConfiguration={
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}, "BucketKeyEnabled": True}]})
    s.put_bucket_tagging(Bucket=name, Tagging={"TagSet": TAGS})
    s.put_bucket_ownership_controls(Bucket=name, OwnershipControls={"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]})
    s.put_bucket_policy(Bucket=name, Policy=json.dumps({"Version": "2012-10-17", "Statement": [{
        "Sid": "TlsOnly", "Effect": "Deny", "Principal": "*", "Action": "s3:*",
        "Resource": [f"arn:aws:s3:::{name}", f"arn:aws:s3:::{name}/*"],
        "Condition": {"Bool": {"aws:SecureTransport": "false"}}}]}))
    print("bucket: public access blocked, SSE-S3, TLS only, tagged")


def role(check: bool):
    iam = session().client("iam")
    acct, name = account(), bucket()
    trust = {"Version": "2012-10-17", "Statement": [{
        "Effect": "Allow", "Principal": {"Service": "sagemaker.amazonaws.com"}, "Action": "sts:AssumeRole",
        "Condition": {"StringEquals": {"aws:SourceAccount": acct}}}]}
    policy = {"Version": "2012-10-17", "Statement": [
        {"Sid": "BucketList", "Effect": "Allow", "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
         "Resource": f"arn:aws:s3:::{name}"},
        {"Sid": "BucketObjects", "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject",
                                                               "s3:AbortMultipartUpload"],
         "Resource": f"arn:aws:s3:::{name}/*"},
        {"Sid": "Logs", "Effect": "Allow",
         "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
         "Resource": [f"arn:aws:logs:{REGION}:{acct}:log-group:/aws/sagemaker/*",
                      f"arn:aws:logs:{REGION}:{acct}:log-group:/aws/sagemaker/*:log-stream:*"]},
        {"Sid": "Metrics", "Effect": "Allow", "Action": "cloudwatch:PutMetricData", "Resource": "*",
         "Condition": {"StringLike": {"cloudwatch:namespace": ["/aws/sagemaker/*", "aws/sagemaker/*"]}}},
        {"Sid": "EcrToken", "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*"},
        {"Sid": "EcrDlcPull", "Effect": "Allow",
         "Action": ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"],
         "Resource": f"arn:aws:ecr:{REGION}:{DLC_ACCOUNT}:repository/*"},
    ]}
    try:
        iam.get_role(RoleName=ROLE_NAME)
        print("role exists")
    except ClientError:
        if check:
            print("role: missing")
            return
        iam.create_role(RoleName=ROLE_NAME, AssumeRolePolicyDocument=json.dumps(trust), Tags=TAGS,
                        Description=f"{PROJECT}: SageMaker training + hosting of persona LoRA adapters",
                        MaxSessionDuration=3600 * 12)
        print("role created")
    if not check:
        iam.update_assume_role_policy(RoleName=ROLE_NAME, PolicyDocument=json.dumps(trust))
        iam.put_role_policy(RoleName=ROLE_NAME, PolicyName=f"{PROJECT}-least-privilege", PolicyDocument=json.dumps(policy))
        print("role inline policy set")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    budget(a.check)
    s3(a.check)
    role(a.check)


if __name__ == "__main__":
    main()
