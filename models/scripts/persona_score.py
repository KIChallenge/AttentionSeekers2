"""In-character score: P(institution | text) from the SetFit classifier.

Python:
    from persona_score import Scorer
    s = Scorer()                       # loads models/out/classifier/model once (~1 GB RAM, CPU)
    s.score(text, "medical_chamber")   # -> float in [0, 1], or None if the role is not a classifier class
    s.scores(text)                     # -> {role: probability} over all classifier classes

CLI:
    uv run python -I scripts/persona_score.py --institution medical_chamber "Die ... lehnt ... ab."
    echo "text" | uv run python -I scripts/persona_score.py --institution nursing -

HTTP (stdlib, localhost only by default):
    uv run python -I scripts/persona_score.py --serve --port 8765
    POST /score {"text": "...", "institution": "medical_chamber"}
      -> {"institution", "probability", "predicted", "probs": {role: p}, "known": true}
    POST /score_batch {"items": [{"text", "institution"}, ...]} -> {"results": [...]}
    GET  /health -> {"ok": true, "labels": [...]}

Input is preprocessed exactly like the training data: institution names/abbreviations -> [INSTITUTION],
so a generated utterance cannot score high just by naming its own institution.
Roles are the Role ids of packages/contracts/src/primitives.ts.
"""
from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from institutions import mask_institutions  # noqa: E402

MODEL_DIR = Path(__file__).resolve().parents[1] / "out" / "classifier" / "model"


class Scorer:
    def __init__(self, model_dir: Path | str = MODEL_DIR):
        from setfit import SetFitModel
        self.model = SetFitModel.from_pretrained(str(model_dir))
        meta = json.loads((Path(model_dir) / "persona_labels.json").read_text())
        self.model.model_body.max_seq_length = meta["max_seq_length"]
        self.labels = [str(x) for x in self.model.model_head.classes_]

    def scores_many(self, texts: list[str]) -> list[dict[str, float]]:
        emb = self.model.model_body.encode([mask_institutions(t) for t in texts], batch_size=32)
        P = self.model.model_head.predict_proba(emb)
        return [{l: float(p) for l, p in zip(self.labels, row)} for row in P]

    def scores(self, text: str) -> dict[str, float]:
        return self.scores_many([text])[0]

    def score(self, text: str, institution: str) -> float | None:
        if institution not in self.labels:
            return None
        return self.scores(text)[institution]

    def result(self, text: str, institution: str, probs: dict | None = None) -> dict:
        probs = probs or self.scores(text)
        return {"institution": institution, "known": institution in probs,
                "probability": probs.get(institution), "predicted": max(probs, key=probs.get), "probs": probs}


def serve(scorer: Scorer, host: str, port: int):
    class H(BaseHTTPRequestHandler):
        def _send(self, code, obj):
            b = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, {"ok": True, "labels": scorer.labels})
            self._send(404, {"error": "not found"})

        def do_POST(self):
            try:
                n = int(self.headers.get("Content-Length", 0))
                if n > 2_000_000:
                    return self._send(413, {"error": "too large"})
                req = json.loads(self.rfile.read(n) or b"{}")
                if self.path == "/score":
                    return self._send(200, scorer.result(req["text"], req["institution"]))
                if self.path == "/score_batch":
                    items = req["items"]
                    probs = scorer.scores_many([i["text"] for i in items])
                    return self._send(200, {"results": [scorer.result(i["text"], i["institution"], p)
                                                        for i, p in zip(items, probs)]})
                self._send(404, {"error": "not found"})
            except (KeyError, ValueError, TypeError) as e:
                self._send(400, {"error": f"bad request: {e.__class__.__name__}"})

        def log_message(self, *a):
            pass

    print(f"persona_score on http://{host}:{port} labels={scorer.labels}", flush=True)
    ThreadingHTTPServer((host, port), H).serve_forever()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text", nargs="?", help="text to score, or - for stdin")
    ap.add_argument("--institution", help="role id, e.g. medical_chamber")
    ap.add_argument("--serve", action="store_true")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--model-dir", default=str(MODEL_DIR))
    a = ap.parse_args()
    s = Scorer(a.model_dir)
    if a.serve:
        return serve(s, a.host, a.port)
    if not a.text or not a.institution:
        ap.error("text and --institution required (or --serve)")
    text = sys.stdin.read() if a.text == "-" else a.text
    print(json.dumps(s.result(text, a.institution), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
