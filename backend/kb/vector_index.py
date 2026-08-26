"""FAISS vector index over standard chunks.

Vectors are L2-normalised, so an inner-product index yields cosine similarity
in [-1, 1]. Scores feed the confidence calculation, so they must stay comparable
across runs — never mix normalised and unnormalised vectors here.
"""
from __future__ import annotations
import json
from pathlib import Path

import numpy as np

from backend.config import EMBED_DIM, INDEX_DIR


class VectorIndex:
    def __init__(self, dim: int = EMBED_DIM):
        import faiss
        self.faiss = faiss
        self.dim = dim
        self.index = faiss.IndexFlatIP(dim)
        self.ids: list[str] = []

    def add(self, ids: list[str], vecs: np.ndarray) -> None:
        assert vecs.shape[0] == len(ids), "ids/vectors length mismatch"
        assert vecs.shape[1] == self.dim, f"expected dim {self.dim}, got {vecs.shape[1]}"
        self.index.add(vecs)
        self.ids.extend(ids)

    def search(self, qvec: np.ndarray, k: int = 10) -> list[tuple[str, float]]:
        if self.index.ntotal == 0:
            return []
        k = min(k, self.index.ntotal)
        scores, idx = self.index.search(qvec, k)
        out = []
        for s, i in zip(scores[0], idx[0]):
            if 0 <= i < len(self.ids):
                out.append((self.ids[i], float(s)))
        return out

    def save(self, path: Path | str = INDEX_DIR) -> None:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        self.faiss.write_index(self.index, str(p / "chunks.faiss"))
        (p / "chunk_ids.json").write_text(json.dumps(self.ids), encoding="utf-8")

    @classmethod
    def load(cls, path: Path | str = INDEX_DIR) -> "VectorIndex":
        import faiss
        p = Path(path)
        obj = cls.__new__(cls)
        obj.faiss = faiss
        obj.index = faiss.read_index(str(p / "chunks.faiss"))
        obj.ids = json.loads((p / "chunk_ids.json").read_text(encoding="utf-8"))
        obj.dim = obj.index.d
        return obj

    def __len__(self) -> int:
        return self.index.ntotal
