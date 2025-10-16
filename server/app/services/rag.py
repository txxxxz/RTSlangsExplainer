from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

try:
    from chromadb import PersistentClient
except ImportError:  # pragma: no cover
    PersistentClient = None  # type: ignore

from ..core.config import get_settings
from ..schemas.explain import SourceReference


@dataclass
class RetrievedDocument:
    text: str
    metadata: dict[str, Any]
    score: float


class RagRetriever:
    def __init__(self, collection_name: str = 'lingualens'):
        self.collection_name = collection_name
        self._client = None
        self._collection = None

    def ensure_collection(self):
        if PersistentClient is None:
            raise RuntimeError('Chroma is not installed.')
        if self._client is None:
            self._client = PersistentClient(path=get_settings().vector_store_path)
        if self._collection is None:
            self._collection = self._client.get_or_create_collection(self.collection_name)
        return self._collection

    def retrieve(self, query: str, top_k: int = 5) -> Sequence[RetrievedDocument]:
        collection = self.ensure_collection()
        results = collection.query(query_texts=[query], n_results=top_k)
        documents = []
        for doc_text, metadata, distance in zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        ):
            documents.append(
                RetrievedDocument(
                    text=doc_text,
                    metadata=metadata or {},
                    score=float(distance)
                )
            )
        return documents


def documents_to_sources(documents: Sequence[RetrievedDocument]) -> list[SourceReference]:
    sources: list[SourceReference] = []
    for doc in documents:
        sources.append(
            SourceReference(
                title=doc.metadata.get('title', 'RAG Source'),
                url=doc.metadata.get('url', ''),
                credibility=doc.metadata.get('credibility', 'medium'),
                excerpt=doc.text[:240]
            )
        )
    return sources
