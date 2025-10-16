from fastapi import APIRouter, HTTPException

from ..schemas.collection import CollectionIngestRequest
from ..services.rag import RagRetriever

router = APIRouter(prefix='/collections', tags=['collections'])


@router.post('')
async def ingest_collection(request: CollectionIngestRequest):
    retriever = RagRetriever(collection_name=request.name)
    try:
        collection = retriever.ensure_collection()
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    documents = [doc.text for doc in request.documents]
    metadatas = [doc.metadata for doc in request.documents]
    ids = [doc.id for doc in request.documents]
    collection.add(documents=documents, metadatas=metadatas, ids=ids)
    return {'ok': True, 'count': len(documents)}
