"""Step 4: one ml.g6e.xlarge endpoint, LMI (djl-inference, vLLM backend) with the 9 LoRA adapters.

Shipped mode (`single`, SV_SM_MODE=adapters): one classic single-model endpoint. The adapters are copied
next to the base weights into s3://<bucket>/base/Qwen3-8B/adapters/<role>/, LMI loads all of them at
startup, and a request selects one with the body field "adapters": "<role>" (no field = prompted base).
No adapter is registered at runtime, so a worker restart comes back with every adapter.

  uv run python -I deploy.py single        # stage adapters, model, config, (re)create endpoint, ~10 min

First attempt, kept for reference (IC mode, SV_SM_MODE=ic): SageMaker multi-adapter inference with a
base inference component plus one adapter component per institution. It served, but under eval load the
lazy runtime registration of adapter components timed out ("Read chunk timeout"), the LMI Python worker
was restarted and came back with adapters missing (HTTP 424 "Adapter ... is not registered").

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
PRICE_HOST = 2.7636  # USD/h, ml.g6e.xlarge eu-north-1 on-demand (Pricing API lists the same rate for training)
MODEL_NAME = f"{PROJECT}-lmi-qwen3-8b"
CONFIG_NAME = f"{PROJECT}-ic-config"
SINGLE_MODEL = f"{PROJECT}-lmi-qwen3-8b-lora"
SINGLE_CONFIG = f"{PROJECT}-single-config"


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


def drop_ic(_a):
    """Delete the IC-mode endpoint (adapter components first, then base, then the endpoint)."""
    c = sm()
    ics = [i["InferenceComponentName"] for i in c.list_inference_components(EndpointNameEquals=ENDPOINT)["InferenceComponents"]]
    def left():
        return [i["InferenceComponentName"] for i in c.list_inference_components(EndpointNameEquals=ENDPOINT)["InferenceComponents"]]
    for ic in ics:
        if ic != BASE_IC:
            try:
                c.delete_inference_component(InferenceComponentName=ic)
            except ClientError as e:
                print(ic, e.response["Error"]["Message"][:120])
    while [n for n in left() if n != BASE_IC]:  # a base component cannot go while adapters reference it
        time.sleep(10)
    if BASE_IC in ics:
        c.delete_inference_component(InferenceComponentName=BASE_IC)
    while left():
        time.sleep(10)
    c.delete_endpoint(EndpointName=ENDPOINT)
    print("deleting IC endpoint")
    while True:
        try:
            c.describe_endpoint(EndpointName=ENDPOINT)
            time.sleep(10)
        except ClientError:
            break
    print("IC endpoint deleted")


def single(a):
    c, s3 = sm(), session().client("s3")
    b = bucket()
    for r in ROLES:  # stage adapters inside the model prefix: <model_dir>/adapters/<role>/
        for f in ("adapter_config.json", "adapter_model.safetensors"):
            s3.copy_object(Bucket=b, Key=f"base/Qwen3-8B/adapters/{r}/{f}",
                           CopySource={"Bucket": b, "Key": f"adapters/{r}/{f}"})
    print("staged", len(ROLES), "adapters under base/Qwen3-8B/adapters/")
    try:
        c.describe_model(ModelName=SINGLE_MODEL)
        print("model exists")
    except ClientError:
        c.create_model(ModelName=SINGLE_MODEL, ExecutionRoleArn=role_arn(), Tags=TAGS,
                       PrimaryContainer={"Image": image("djl-inference", LMI_IMAGE_TAG), "Environment": lmi_env()})
        print("model created")
    try:
        c.describe_endpoint_config(EndpointConfigName=SINGLE_CONFIG)
        print("endpoint config exists")
    except ClientError:
        c.create_endpoint_config(EndpointConfigName=SINGLE_CONFIG, Tags=TAGS, ProductionVariants=[{
            "VariantName": VARIANT, "ModelName": SINGLE_MODEL, "InstanceType": INSTANCE, "InitialInstanceCount": 1,
            "ModelDataDownloadTimeoutInSeconds": 1800, "ContainerStartupHealthCheckTimeoutInSeconds": 1800}])
        print("endpoint config created")
    try:
        d = c.describe_endpoint(EndpointName=ENDPOINT)
    except ClientError:
        d = None
    if d and d["EndpointConfigName"] == SINGLE_CONFIG:
        print("endpoint already on", SINGLE_CONFIG, d["EndpointStatus"])
        return
    if d:  # IC endpoint: the quota allows one instance, so no blue/green update; delete and recreate
        drop_ic(None)
    c.create_endpoint(EndpointName=ENDPOINT, EndpointConfigName=SINGLE_CONFIG, Tags=TAGS)
    print("endpoint creating on", SINGLE_CONFIG)


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
        import datetime as dt  # noqa: PLC0415
        h = (dt.datetime.now(dt.timezone.utc) - d["CreationTime"]).total_seconds() / 3600
        print("endpoint", ENDPOINT, d["EndpointStatus"], d.get("FailureReason", ""),
              f"| up {h:.2f} h, about {h * PRICE_HOST:.2f} USD so far at {PRICE_HOST} USD/h")
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
    print(generate(a.role, msgs, max_tokens=80, temperature=0.3))
    print(f"({time.time() - t:.1f}s)")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("single")
    sub.add_parser("drop-ic")
    sub.add_parser("endpoint")
    sub.add_parser("base")
    p = sub.add_parser("adapters")
    p.add_argument("--roles")
    sub.add_parser("status")
    p = sub.add_parser("smoke")
    p.add_argument("role", nargs="?", default="base")
    a = ap.parse_args()
    {"single": single, "drop-ic": drop_ic, "endpoint": endpoint, "base": base, "adapters": adapters, "status": status, "smoke": smoke}[a.cmd](a)


if __name__ == "__main__":
    main()
