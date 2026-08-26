"""Local sentence-transformers embeddings — no API key, works offline.

BGE models expect an instruction prefix on the *query* side only; using it on
documents degrades retrieval, so the two paths are kept separate.
"""
from __future__ import annotations
import numpy as np

from backend.config import EMBED_MODEL

_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
_model = None


def get_model():
    global _model
    if _model is None:
        import os
        import torch
        # Use PHYSICAL cores, not logical. os.cpu_count() reports hyperthreads,
        # and oversubscribing them measurably slows embedding down: on this
        # machine 16 threads gave 10.4 chunks/s against 11.4 at 8. Override with
        # EMBED_THREADS if the heuristic is wrong for your CPU.
        env = os.getenv("EMBED_THREADS")
        n = int(env) if env else max(4, (os.cpu_count() or 8) // 2)
        torch.set_num_threads(n)

        # A GPU turns the index build from ~90 minutes into a couple of minutes.
        # EMBED_DEVICE forces a choice; otherwise CUDA is used when present.
        device = os.getenv("EMBED_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
        if device.startswith("cuda"):
            print(f"[embedder] device: {device} ({torch.cuda.get_device_name(0)})")
        else:
            print(f"[embedder] device: cpu ({n} threads)")
        from sentence_transformers import SentenceTransformer
        print(f"[embedder] loading {EMBED_MODEL} (first run downloads ~130MB)...")
        _model = SentenceTransformer(EMBED_MODEL, device=device)
    return _model


# Measured on this corpus: smaller batches beat larger ones, because padding
# waste dominates when chunk lengths vary. sentence-transformers length-sorts
# within a single encode() call, so pass everything at once rather than slicing.
def encode_docs(texts: list[str], batch_size: int = 32,
                show_progress: bool = False) -> np.ndarray:
    m = get_model()
    v = m.encode(texts, batch_size=batch_size, convert_to_numpy=True,
                 normalize_embeddings=True, show_progress_bar=show_progress)
    return v.astype("float32")


def encode_query(text: str) -> np.ndarray:
    m = get_model()
    v = m.encode([_QUERY_PREFIX + text], convert_to_numpy=True,
                 normalize_embeddings=True)
    return v.astype("float32")
