"""Step 3: upload the masked SFT splits and launch ONE SageMaker training job (ml.g6e.xlarge, 3 h cap)
that trains the 9 institution adapters sequentially.

  uv run python -I train_job.py launch [--epochs 3]
  uv run python -I train_job.py status [job]       # status, billable seconds, last log lines
  uv run python -I train_job.py cost               # billable seconds x price of every project job
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import tarfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import INSTANCE, PROJECT, REGION, ROLES, TAGS, TRAIN_IMAGE_TAG, bucket, image, role_arn, session  # noqa: E402

HERE = Path(__file__).resolve().parent
SFT = Path(os.environ.get("SV_SFT_DIR", HERE.parent / "data" / "sft"))  # gitignored; point at the main checkout
PRICE_TRAIN = 2.76  # USD/h, ml.g6e.xlarge training, eu-north-1 (on-demand)


def upload_data(s3):
    n = 0
    for r in ROLES:
        for split in ("train", "heldout"):
            p = SFT / f"{r}.{split}.jsonl"
            if not p.exists():
                raise SystemExit(f"missing {p}")
            s3.upload_file(str(p), bucket(), f"data/sft/{p.name}")
            n += 1
    print(f"uploaded {n} SFT files to s3://<bucket>/data/sft/")


def upload_code(s3) -> str:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for f in ("sm_train.py", "requirements.txt"):
            t.add(HERE / "train" / f, arcname=f)
    key = f"code/sourcedir-{int(time.time())}.tar.gz"
    s3.put_object(Bucket=bucket(), Key=key, Body=buf.getvalue())
    return f"s3://{bucket()}/{key}"


def launch(a):
    sm, s3 = session().client("sagemaker"), session().client("s3")
    running = sm.list_training_jobs(StatusEquals="InProgress", NameContains=PROJECT)["TrainingJobSummaries"]
    if running:
        raise SystemExit(f"a project job is already running: {running[0]['TrainingJobName']}")
    upload_data(s3)
    code = upload_code(s3)
    name = f"{PROJECT}-lora-{time.strftime('%m%d-%H%M%S')}"
    hp = {"roles": ",".join(ROLES), "bucket": bucket(), "epochs": str(a.epochs), "rank": "16", "max-len": "2048",
          "upload-base": "1" if a.upload_base else "0"}
    hp = {k: json.dumps(v) for k, v in hp.items()}
    hp.update({"sagemaker_program": json.dumps("sm_train.py"), "sagemaker_submit_directory": json.dumps(code),
               "sagemaker_region": json.dumps(REGION)})
    sm.create_training_job(
        TrainingJobName=name, RoleArn=role_arn(), HyperParameters=hp,
        AlgorithmSpecification={"TrainingImage": image("huggingface-pytorch-training", TRAIN_IMAGE_TAG),
                                "TrainingInputMode": "File", "EnableSageMakerMetricsTimeSeries": False},
        InputDataConfig=[{"ChannelName": "sft", "DataSource": {"S3DataSource": {
            "S3DataType": "S3Prefix", "S3Uri": f"s3://{bucket()}/data/sft/", "S3DataDistributionType": "FullyReplicated"}}}],
        OutputDataConfig={"S3OutputPath": f"s3://{bucket()}/jobs/"},
        ResourceConfig={"InstanceType": INSTANCE, "InstanceCount": 1, "VolumeSizeInGB": 120},
        StoppingCondition={"MaxRuntimeInSeconds": 3 * 3600},
        Environment={"HF_HUB_DISABLE_PROGRESS_BARS": "1", "TOKENIZERS_PARALLELISM": "false",
                     "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"},
        Tags=TAGS)
    print("launched", name)


def status(a):
    sm = session().client("sagemaker")
    name = a.job or sm.list_training_jobs(NameContains=PROJECT, SortBy="CreationTime", SortOrder="Descending",
                                          MaxResults=1)["TrainingJobSummaries"][0]["TrainingJobName"]
    d = sm.describe_training_job(TrainingJobName=name)
    print(name, d["TrainingJobStatus"], d.get("SecondaryStatus"), "billable_s:", d.get("BillableTimeInSeconds"),
          d.get("FailureReason", ""))
    logs = session().client("logs")
    try:
        streams = logs.describe_log_streams(logGroupName="/aws/sagemaker/TrainingJobs", logStreamNamePrefix=name)["logStreams"]
        for st in streams:
            ev = logs.get_log_events(logGroupName="/aws/sagemaker/TrainingJobs", logStreamName=st["logStreamName"],
                                     limit=a.lines, startFromHead=False)["events"]
            for e in ev:
                print("  ", e["message"][:300])
    except Exception as e:  # noqa: BLE001
        print("  (no logs yet)", e.__class__.__name__)


def cost(_a):
    sm = session().client("sagemaker")
    tot = 0.0
    for j in sm.list_training_jobs(NameContains=PROJECT, MaxResults=50)["TrainingJobSummaries"]:
        d = sm.describe_training_job(TrainingJobName=j["TrainingJobName"])
        s = d.get("BillableTimeInSeconds") or 0
        tot += s / 3600 * PRICE_TRAIN
        print(f"{j['TrainingJobName']} {d['TrainingJobStatus']} billable={s}s usd={s / 3600 * PRICE_TRAIN:.2f}")
    print(f"training total: {tot:.2f} USD")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("launch")
    p.add_argument("--epochs", type=float, default=3)
    p.add_argument("--no-upload-base", dest="upload_base", action="store_false")
    p = sub.add_parser("status")
    p.add_argument("job", nargs="?")
    p.add_argument("--lines", type=int, default=25)
    sub.add_parser("cost")
    a = ap.parse_args()
    {"launch": launch, "status": status, "cost": cost}[a.cmd](a)


if __name__ == "__main__":
    main()
