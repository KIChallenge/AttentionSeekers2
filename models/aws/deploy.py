"""Step 4: one ml.g6e.xlarge endpoint, LMI (djl-inference, vLLM backend), SageMaker multi-adapter
inference: one base inference component (Qwen3-8B from S3) plus one adapter inference component per
institution. A request picks the adapter by InferenceComponentName (sv-<role>); sv-base is the prompted
baseline.

  uv run python -I deploy.py endpoint      # endpoint config + endpoint (no model yet), ~5-10 min
  uv run python -I deploy.py base          # LMI model + base inference component (needs base/ in S3)
  uv run python -I deploy.py adapters      # one adapter IC per finished adapters-tar/<role>.tar.gz
  uv run python -I deploy.py status
  uv run python -I deploy.py smoke [role]  # one short generation through the endpoint
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from botocore.exceptions import ClientError

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (BASE_IC, ENDPOINT, INSTANCE, LMI_IMAGE_TAG, PROJECT, ROLES, TAGS, bucket, ic_name,  # noqa: E402
                    image, role_arn, session)

VARIANT = "AllTraffic"
MODEL_NAME = f"{PROJECT}-lmi-qwen3-8b"
CONFIG_NAME = f"{PROJECT}-ic-config"


def sm():
    return session().client("sagemaker")


def lmi_env():
    return {
        "HF_MODEL_ID": f"s3://{bucket()}/base/Qwen3-8B/",
        "OPTION_ROLLING_BATCH": "vllm",
        "OPTION_DTYPE": "bf16",
        "OPTION_TENSOR_PARALLEL_DEGREE": "1",
        "OPTION_MAX_MODEL_LEN": "6144",
        "OPTION_MAX_ROLLING_BATCH_SIZE": "32",
        "OPTION_GPU_MEMORY_UTILIZATION": "0.88",
        "OPTION_ENABLE_LORA": "true",
        "OPTION_MAX_LORAS": "10",
        "OPTION_MAX_CPU_LORAS": "16",
        "OPTION_MAX_LORA_RANK": "16",
        "SERVING_FAIL_FAST": "true",
    }


def endpoint(_a):
    c = sm()
    try:
        c.describe_endpoint_config(EndpointConfigName=CONFIG_NAME)
        print("endpoint config exists")
    except ClientError:
        c.create_endpoint_config(
            EndpointConfigName=CONFIG_NAME, ExecutionRoleArn=role_arn(), Tags=TAGS,
            ProductionVariants=[{
                "VariantName": VARIANT, "InstanceType": INSTANCE, "InitialInstanceCount": 1,
                "ModelDataDownloadTimeoutInSeconds": 1800, "ContainerStartupHealthCheckTimeoutInSeconds": 1800,
                "RoutingConfig": {"RoutingStrategy": "LEAST_OUTSTANDING_REQUESTS"}}])
        print("endpoint config created")
    try:
        d = c.describe_endpoint(EndpointName=ENDPOINT)
        print("endpoint exists:", d["EndpointStatus"])
    except ClientError:
        c.create_endpoint(EndpointName=ENDPOINT, EndpointConfigName=CONFIG_NAME, Tags=TAGS)
        print("endpoint creating:", ENDPOINT)


def base(_a):
    c = sm()
    s3 = session().client("s3")
    try:
        s3.head_object(Bucket=bucket(), Key="base/_READY")
    except ClientError:
        raise SystemExit("base weights not in S3 yet (training job uploads them first)")
    try:
        c.describe_model(ModelName=MODEL_NAME)
        print("model exists")
    except ClientError:
        c.create_model(ModelName=MODEL_NAME, ExecutionRoleArn=role_arn(), Tags=TAGS,
                       PrimaryContainer={"Image": image("djl-inference", LMI_IMAGE_TAG), "Environment": lmi_env()})
        print("model created")
    try:
        d = c.describe_inference_component(InferenceComponentName=BASE_IC)
        print("base IC exists:", d["InferenceComponentStatus"])
    except ClientError:
        c.create_inference_component(
            InferenceComponentName=BASE_IC, EndpointName=ENDPOINT, VariantName=VARIANT, Tags=TAGS,
            Specification={
                "ModelName": MODEL_NAME,
                "StartupParameters": {"ModelDataDownloadTimeoutInSeconds": 1800,
                                      "ContainerStartupHealthCheckTimeoutInSeconds": 1800},
                "ComputeResourceRequirements": {"NumberOfAcceleratorDevicesRequired": 1,
                                              # g6e.xlarge exposes well under its 32 GiB to components
                                              "MinMemoryRequiredInMb": int(os.environ.get("SV_IC_MEM_MB", "2048"))}},
            RuntimeConfig={"CopyCount": 1})
        print("base IC creating:", BASE_IC)


def adapters(a):
    c = sm()
    s3 = session().client("s3")
    for r in (a.roles.split(",") if a.roles else ROLES):
        key = f"adapters-tar/{r}.tar.gz"
        try:
            s3.head_object(Bucket=bucket(), Key=key)
        except ClientError:
            print(f"{r}: adapter not ready")
            continue
        name = ic_name(r)
        try:
            d = c.describe_inference_component(InferenceComponentName=name)
            print(f"{r}: {name} exists ({d['InferenceComponentStatus']})")
            continue
        except ClientError:
            pass
        c.create_inference_component(
            InferenceComponentName=name, EndpointName=ENDPOINT, Tags=TAGS,
            Specification={"BaseInferenceComponentName": BASE_IC, "Container": {"ArtifactUrl": f"s3://{bucket()}/{key}"}})
        print(f"{r}: {name} creating")


def status(_a):
    c = sm()
    try:
        d = c.describe_endpoint(EndpointName=ENDPOINT)
        print("endpoint", ENDPOINT, d["EndpointStatus"], d.get("FailureReason", ""))
    except ClientError:
        print("endpoint: none")
        return
    for ic in c.list_inference_components(EndpointNameEquals=ENDPOINT)["InferenceComponents"]:
        dd = c.describe_inference_component(InferenceComponentName=ic["InferenceComponentName"])
        print(" ", ic["InferenceComponentName"], dd["InferenceComponentStatus"], dd.get("FailureReason", ""))


def smoke(a):
    from proxy import generate  # noqa: PLC0415
    msgs = [{"role": "system", "content": "Antworten Sie in einem Satz."},
            {"role": "user", "content": "Was halten Sie von einer Erhöhung der Rezeptgebühr?"}]
    t = time.time()
    print(generate(BASE_IC if a.role == "base" else ic_name(a.role), msgs, max_tokens=80, temperature=0.3))
    print(f"({time.time() - t:.1f}s)")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("endpoint")
    sub.add_parser("base")
    p = sub.add_parser("adapters")
    p.add_argument("--roles")
    sub.add_parser("status")
    p = sub.add_parser("smoke")
    p.add_argument("role", nargs="?", default="base")
    a = ap.parse_args()
    {"endpoint": endpoint, "base": base, "adapters": adapters, "status": status, "smoke": smoke}[a.cmd](a)


if __name__ == "__main__":
    main()
