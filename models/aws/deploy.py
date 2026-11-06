"""Step 4: one ml.g6e.xlarge endpoint, LMI (djl-inference, vLLM backend) with the 9 LoRA adapters.

Shipped mode (`single`, SV_SM_MODE=adapters): one classic single-model endpoint. The adapters are copied
next to the base weights into s3://<bucket>/base/Qwen3-8B/adapters/<role>/, LMI loads all of them at
startup, and a request selects one with the body field "adapters": "<role>" (no field = prompted base).
No adapter is registered at runtime, so a worker restart comes back with every adapter.

  uv run python -I deploy.py single        # stage adapters, model, config, (re)create endpoint, ~10 min
  uv run python -I deploy.py single --sets v1,v2   # v1 as "<role>" plus v2 as "<role>_v2" (sv2-<role> in the proxy)
  uv run python -I deploy.py single --sets v1,v21  # v1 plus v2.1 as "<role>_v21" (sv21-<role>), v2 unstaged
  uv run python -I deploy.py single --sets v1      # rollback: v1 only, v2/v2.1 staging removed

Adapter sets live in separate S3 prefixes (v1: adapters/, v2: adapters-v2/) and are never overwritten; only
the staged copies under base/Qwen3-8B/adapters/ change. LMI loads adapters only at startup and the quota is one
ml.g6e.xlarge endpoint instance (no blue/green), so switching sets deletes and recreates the endpoint under
the same name: about 10 minutes of downtime, the proxy needs no change.

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


SETS = {"v1": ("adapters", ""), "v2": ("adapters-v2", "_v2"), "v21": ("adapters-v21", "_v21")}  # set -> (S3 prefix, LMI adapter name suffix)


def lmi_env(n_adapters: int = 9):
    return {
        "HF_MODEL_ID": f"s3://{bucket()}/base/Qwen3-8B/",
        "OPTION_ROLLING_BATCH": "vllm",
        "OPTION_DTYPE": "bf16",
        "OPTION_TENSOR_PARALLEL_DEGREE": "1",
        "OPTION_MAX_MODEL_LEN": "6144",
        "OPTION_MAX_ROLLING_BATCH_SIZE": "32",
        "OPTION_GPU_MEMORY_UTILIZATION": "0.88",
        "OPTION_ENABLE_LORA": "true",
        "OPTION_MAX_LORAS": str(max(10, n_adapters)),
        "OPTION_MAX_CPU_LORAS": str(max(16, n_adapters + 2)),
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
    sets = a.sets.split(",")
    for st, (prefix, suffix) in SETS.items():  # stage adapters inside the model prefix: <model_dir>/adapters/<name>/
        for r in ROLES:
            for f in ("adapter_config.json", "adapter_model.safetensors"):
                key = f"base/Qwen3-8B/adapters/{r}{suffix}/{f}"
                if st in sets:
                    s3.copy_object(Bucket=b, Key=key, CopySource={"Bucket": b, "Key": f"{prefix}/{r}/{f}"})
                else:
                    s3.delete_object(Bucket=b, Key=key)
    print("staged sets", sets, "under base/Qwen3-8B/adapters/;", len(ROLES) * len(sets), "adapters")
    # v1-only keeps the original names, so a rollback lands on the exact v1 model and config
    model = SINGLE_MODEL if sets == ["v1"] else f"{SINGLE_MODEL}-{'-'.join(sets)}"
    config = SINGLE_CONFIG if sets == ["v1"] else f"{SINGLE_CONFIG}-{'-'.join(sets)}"
    try:
        c.describe_model(ModelName=model)
        print("model exists", model)
    except ClientError:
        c.create_model(ModelName=model, ExecutionRoleArn=role_arn(), Tags=TAGS,
                       PrimaryContainer={"Image": image("djl-inference", LMI_IMAGE_TAG),
                                         "Environment": lmi_env(len(ROLES) * len(sets))})
        print("model created", model)
    try:
        c.describe_endpoint_config(EndpointConfigName=config)
        print("endpoint config exists", config)
    except ClientError:
        c.create_endpoint_config(EndpointConfigName=config, Tags=TAGS, ProductionVariants=[{
            "VariantName": VARIANT, "ModelName": model, "InstanceType": INSTANCE, "InitialInstanceCount": 1,
            "ModelDataDownloadTimeoutInSeconds": 1800, "ContainerStartupHealthCheckTimeoutInSeconds": 1800}])
        print("endpoint config created", config)
    try:
        d = c.describe_endpoint(EndpointName=ENDPOINT)
    except ClientError:
        d = None
    if d and d["EndpointConfigName"] == config and not a.recreate:
        print("endpoint already on", config, d["EndpointStatus"], "(--recreate reloads the staged adapters)")
        return
    if d:  # quota is one instance, so no blue/green update; delete and recreate under the same name
        if c.list_inference_components(EndpointNameEquals=ENDPOINT)["InferenceComponents"]:
            drop_ic(None)
        else:
            c.delete_endpoint(EndpointName=ENDPOINT)
            print("deleting endpoint", ENDPOINT)
            while True:
                try:
                    c.describe_endpoint(EndpointName=ENDPOINT)
                    time.sleep(10)
                except ClientError:
                    break
    c.create_endpoint(EndpointName=ENDPOINT, EndpointConfigName=config, Tags=TAGS)
    print("endpoint creating on", config, "(about 10 min; deploy.py status)")


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
    p = sub.add_parser("single")
    p.add_argument("--sets", default="v1", help="comma list of adapter sets to load: v1, v2 or v1,v2")
    p.add_argument("--recreate", action="store_true", help="recreate even if the endpoint is on this config")
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
