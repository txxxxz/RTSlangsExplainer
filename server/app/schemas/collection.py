from pydantic import BaseModel


class CollectionDocument(BaseModel):
    id: str
    text: str
    metadata: dict[str, str] = {}


class CollectionIngestRequest(BaseModel):
    name: str
    documents: list[CollectionDocument]
