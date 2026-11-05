"""Shared names for the SageMaker path. Nothing account-specific is stored in the repo: the account id
is resolved at runtime from STS, the region from SV_AWS_REGION (default eu-north-1)."""
from __future__ import annotations

import functools
import os

import boto3

REGION = os.environ.get("SV_AWS_REGION", "eu-north-1")
PROJECT = "sv-ki-challenge"
TAGS = [{"Key": "Project", "Value": PROJECT}]
ROLE_NAME = os.environ.get("SV_SM_ROLE", "sv-ki-challenge-sagemaker")
BUDGET_NAME = PROJECT
INSTANCE = "ml.g6e.xlarge"  # the only instance type this project may use (training and hosting)
DLC_ACCOUNT = "763104351884"  # AWS Deep Learning Containers registry
TRAIN_IMAGE_TAG = os.environ.get(
    "SV_TRAIN_IMAGE_TAG", "2.8.0-transformers4.56.2-gpu-py312-cu129-ubuntu22.04")
LMI_IMAGE_TAG = os.environ.get("SV_LMI_IMAGE_TAG", "0.36.0-lmi24.0.0-cu129")
BASE_MODEL = "Qwen/Qwen3-8B"
ENDPOINT = os.environ.get("SV_SM_ENDPOINT", "sv-ki-challenge-personas")
BASE_IC = "sv-base"
ROLES = ["patients", "ministry_finance", "chamber_commerce", "medical_chamber", "hospitals", "nursing",
         "chamber_labour", "social_insurance", "laender"]


def ic_name(role: str) -> str:
    return "sv-" + role.replace("_", "-")


@functools.cache
def session():
    return boto3.Session(region_name=REGION)


@functools.cache
def account() -> str:
    return session().client("sts").get_caller_identity()["Account"]


def bucket() -> str:
    return os.environ.get("SV_SM_BUCKET") or f"{PROJECT}-{account()}-{REGION}"


def role_arn() -> str:
    return f"arn:aws:iam::{account()}:role/{ROLE_NAME}"


def image(repo: str, tag: str) -> str:
    return f"{DLC_ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/{repo}:{tag}"
