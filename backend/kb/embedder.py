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
        torch.set_num_threads(os.cpu_count() or 4)
        from sentence_transformers import SentenceTransformer
        print(f"[embedder] loading {EMBED_MODEL} (first run downloads ~130MB)...")
        _model = SentenceTransformer(EMBED_MODEL)
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
