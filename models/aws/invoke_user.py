"""Long-lived, invoke-only credentials for the proxy, so the demo does not depend on the 1 h SSO session.

  uv run python -I invoke_user.py --env /path/to/repo/.env

Creates IAM user `sv-ki-challenge-invoke` (tagged) whose only permission is sagemaker:InvokeEndpoint and
sagemaker:InvokeEndpointWithResponseStream on the one persona endpoint ARN, creates ONE access key and
writes it to the given .env as SV_SAGEMAKER_ACCESS_KEY_ID / SV_SAGEMAKER_SECRET_ACCESS_KEY. The key is
never printed. Refuses to create a second key. teardown.sh deletes keys and user.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ENDPOINT, PROJECT, REGION, TAGS, account, session  # noqa: E402

USER = f"{PROJECT}-invoke"
KEYS = ("SV_SAGEMAKER_ACCESS_KEY_ID", "SV_SAGEMAKER_SECRET_ACCESS_KEY")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", required=True, help="the .env file to write the key into (gitignored)")
    a = ap.parse_args()
    env = Path(a.env)
    iam = session().client("iam")
    arn = f"arn:aws:sagemaker:{REGION}:{account()}:endpoint/{ENDPOINT}"
    try:
        iam.get_user(UserName=USER)
        print("user exists")
    except ClientError:
        iam.create_user(UserName=USER, Tags=TAGS)
        print("user created")
    iam.put_user_policy(UserName=USER, PolicyName=f"{PROJECT}-invoke-only", PolicyDocument=json.dumps({
        "Version": "2012-10-17", "Statement": [{
            "Effect": "Allow", "Action": ["sagemaker:InvokeEndpoint", "sagemaker:InvokeEndpointWithResponseStream"],
            "Resource": arn}]}))
    print("inline policy: invoke-only on the persona endpoint")
    if iam.list_access_keys(UserName=USER)["AccessKeyMetadata"]:
        print("user already has an access key; not creating another (delete it first to rotate)")
        return
    k = iam.create_access_key(UserName=USER)["AccessKey"]
    lines = [l for l in (env.read_text().splitlines() if env.exists() else []) if not l.startswith(KEYS)]
    lines += [f"{KEYS[0]}={k['AccessKeyId']}", f"{KEYS[1]}={k['SecretAccessKey']}"]
    env.write_text("\n".join(lines) + "\n")
    env.chmod(0o600)
    print(f"access key written to {env} as {KEYS[0]} / {KEYS[1]} (not printed)")


if __name__ == "__main__":
    main()
