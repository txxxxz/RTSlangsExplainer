#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from pathlib import Path

from chromadb import PersistentClient
from sentence_transformers import SentenceTransformer

from app.core.config import get_settings


def build_index(input_path: Path, collection_name: str) -> None:
    settings = get_settings()
    client = PersistentClient(path=settings.vector_store_path)
    collection = client.get_or_create_collection(collection_name)
    model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

    with input_path.open('r', encoding='utf-8') as handle:
        records = json.load(handle)

    documents = [item['text'] for item in records]
    metadatas = [item.get('metadata', {}) for item in records]
    ids = [item['id'] for item in records]
    embeddings = model.encode(documents).tolist()

    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings
    )

    print(f'Indexed {len(documents)} documents into {collection_name}.')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Build LinguaLens RAG index from JSON.')
    parser.add_argument('input', type=Path, help='Path to JSON dataset.')
    parser.add_argument('--collection', default='lingualens', help='Collection name.')
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    build_index(args.input, args.collection)
