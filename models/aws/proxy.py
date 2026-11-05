"""Local OpenAI-compatible proxy for the SageMaker persona endpoint (step 5).

  cd models/aws && uv run python -I proxy.py            # http://127.0.0.1:8790/v1
  OPENAI base URL: http://127.0.0.1:8790/v1, any API key (not checked; bound to localhost only)

Model ids: sv-<role> (e.g. sv-medical_chamber, sv-social_insurance) select the institution adapter;
sv-base (alias Qwen/Qwen3-8B) is the prompted base model. Each call is signed with SigV4 by boto3 using
the default AWS profile (SSO) and sent to InvokeEndpoint with InferenceComponentName.

Qwen3 runs in non-thinking mode, as in training: the proxy renders the Qwen3 chat template with an empty
think block itself and sends the LMI `inputs`/`parameters` schema. `stream: true` is answered as SSE
with one content chunk (the endpoint itself is not streamed).
Endpoints: GET /v1/models, POST /v1/chat/completions, GET /health.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from botocore.config import Config

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE_IC, BASE_MODEL, ENDPOINT, ROLES, ic_name, session  # noqa: E402

MODELS = {f"sv-{r}": ic_name(r) for r in ROLES} | {"sv-base": BASE_IC, BASE_MODEL: BASE_IC}
_rt = None


def runtime():
    global _rt
    if _rt is None:
        _rt = session().client("sagemaker-runtime", config=Config(
            read_timeout=180, connect_timeout=10, retries={"max_attempts": 4, "mode": "adaptive"},
            max_pool_connections=32))
    return _rt


def render(messages: list[dict]) -> str:
    """Qwen3 chat template, enable_thinking=False (same string the tokenizer renders in training)."""
    out = []
    for m in messages:
        c = m.get("content") or ""
        if isinstance(c, list):  # OpenAI content parts
            c = "".join(p.get("text", "") for p in c if isinstance(p, dict))
        role = m.get("role", "user")
        role = "system" if role == "developer" else role
        out.append(f"<|im_start|>{role}\n{c}<|im_end|>\n")
    return "".join(out) + "<|im_start|>assistant\n<think>\n\n</think>\n\n"


def generate(component: str, messages: list[dict], max_tokens: int = 600, temperature: float = 0.7,
             top_p: float = 0.9) -> str:
    params = {"max_new_tokens": int(max_tokens), "temperature": float(temperature), "top_p": float(top_p)}
    if params["temperature"] <= 0:
        params["temperature"] = 0.01
    r = runtime().invoke_endpoint(EndpointName=ENDPOINT, InferenceComponentName=component,
                                  ContentType="application/json", Accept="application/json",
                                  Body=json.dumps({"inputs": render(messages), "parameters": params}))
    body = json.loads(r["Body"].read())
    if isinstance(body, list):
        body = body[0]
    text = body.get("generated_text", "") if isinstance(body, dict) else str(body)
    return text.split("<|im_end|>")[0].strip()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj, ctype="application/json"):
        data = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write(time.strftime("%H:%M:%S ") + fmt % args + "\n")

    def do_GET(self):
        if self.path.rstrip("/") in ("/v1/models", "/models"):
            self._send(200, {"object": "list", "data": [
                {"id": k, "object": "model", "created": 0, "owned_by": "sv-ki-challenge"} for k in MODELS]})
        elif self.path == "/health":
            self._send(200, {"ok": True, "endpoint": ENDPOINT, "models": list(MODELS)})
        else:
            self._send(404, {"error": {"message": "not found"}})

    def do_POST(self):
        if self.path.rstrip("/") not in ("/v1/chat/completions", "/chat/completions"):
            return self._send(404, {"error": {"message": "not found"}})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except json.JSONDecodeError:
            return self._send(400, {"error": {"message": "invalid JSON"}})
        model = req.get("model", "")
        comp = MODELS.get(model)
        if comp is None:
            return self._send(404, {"error": {"message": f"unknown model {model!r}; known: {sorted(MODELS)}",
                                              "type": "invalid_request_error"}})
        t0 = time.time()
        try:
            text = generate(comp, req.get("messages", []),
                            max_tokens=req.get("max_tokens") or req.get("max_completion_tokens") or 600,
                            temperature=req.get("temperature", 0.7), top_p=req.get("top_p", 0.9))
        except Exception as e:  # noqa: BLE001
            return self._send(502, {"error": {"message": f"{e.__class__.__name__}: {str(e)[:400]}",
                                              "type": "upstream_error"}})
        cid, now = f"chatcmpl-{uuid.uuid4().hex[:24]}", int(time.time())
        usage = {"prompt_tokens": 0, "completion_tokens": max(1, len(text) // 4), "total_tokens": max(1, len(text) // 4)}
        if req.get("stream"):
            chunks = [
                {"id": cid, "object": "chat.completion.chunk", "created": now, "model": model,
                 "choices": [{"index": 0, "delta": {"role": "assistant", "content": text}, "finish_reason": None}]},
                {"id": cid, "object": "chat.completion.chunk", "created": now, "model": model,
                 "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}], "usage": usage},
            ]
            data = "".join(f"data: {json.dumps(c, ensure_ascii=False)}\n\n" for c in chunks) + "data: [DONE]\n\n"
            return self._send(200, data.encode(), "text/event-stream")
        self._send(200, {"id": cid, "object": "chat.completion", "created": now, "model": model,
                         "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                                      "finish_reason": "stop"}], "usage": usage,
                         "x_latency_s": round(time.time() - t0, 2)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8790)
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"proxy on http://{a.host}:{a.port}/v1 -> SageMaker endpoint {ENDPOINT}; models: {', '.join(MODELS)}",
          flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
