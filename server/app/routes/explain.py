from __future__ import annotations

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..core.config import get_settings
from ..schemas.explain import (
    DeepExplainResponse,
    ExplainRequest,
    QuickExplainResponse,
    SourceReference
)
from ..services.cache import ExplainCache
from ..services.merge import merge_sources, rank_sources
from ..services.online import fetch_urban_dictionary, fetch_wikipedia_summary
from ..services.openai_client import OpenAIClient
from ..services.rag import RagRetriever, documents_to_sources

router = APIRouter(prefix='/explain', tags=['explain'])


def _extract_openai_credentials(req: Request) -> tuple[str | None, str | None]:
    key = req.headers.get('x-openai-key')
    if not key:
        key = req.headers.get('X-OpenAI-Key')
    if key:
        key = key.strip()
    auth_header = req.headers.get('authorization') or req.headers.get('Authorization')
    if (not key) and auth_header and auth_header.lower().startswith('bearer '):
        key = auth_header[7:].strip()
    base_url = req.headers.get('x-openai-base') or req.headers.get('X-OpenAI-Base')
    if base_url:
        base_url = base_url.strip()
    return key or None, base_url or None


@router.post('/quick', response_model=QuickExplainResponse)
async def post_quick_explain(request: ExplainRequest, http_request: Request) -> QuickExplainResponse:
    cache = await ExplainCache.create()
    cached = await cache.get_quick(request.subtitleText, request.profileId)
    if cached:
        return QuickExplainResponse.model_validate(cached)

    api_key, base_url = _extract_openai_credentials(http_request)
    client = await OpenAIClient.create(api_key=api_key, base_url=base_url)
    try:
        response = await client.quick_explain(request)
    finally:
        await client.close()
    await cache.set_quick(request.subtitleText, request.profileId, response.model_dump())
    return response


def _sse(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode('utf-8')


@router.post('/deep')
async def post_deep_explain(request: ExplainRequest, http_request: Request) -> StreamingResponse:
    cache = await ExplainCache.create()
    cached = await cache.get_deep(request.subtitleText, request.profileId)
    if cached:
        cached_response = DeepExplainResponse.model_validate(cached)

        async def replay_cached() -> AsyncGenerator[bytes, None]:
            yield _sse('background', {
                'requestId': cached_response.requestId,
                'background': cached_response.background.model_dump(),
                'reasoningNotes': cached_response.reasoningNotes
            })
            yield _sse('crossCulture', {
                'requestId': cached_response.requestId,
                'crossCulture': [item.model_dump() for item in cached_response.crossCulture],
                'confidence': cached_response.confidence.model_dump(),
                'reasoningNotes': cached_response.reasoningNotes
            })
            yield _sse('sources', {
                'requestId': cached_response.requestId,
                'sources': [source.model_dump() for source in cached_response.sources]
            })
            yield _sse('complete', cached_response.model_dump())

        return StreamingResponse(
            replay_cached(),
            media_type='text/event-stream',
            headers={'Cache-Control': 'no-cache'}
        )

    api_key, base_url = _extract_openai_credentials(http_request)

    knowledge_sections = []
    rag_sources = []
    retriever = RagRetriever()
    try:
        docs = retriever.retrieve(request.subtitleText, top_k=5)
        for idx, doc in enumerate(docs, start=1):
            knowledge_sections.append(f'[{idx}] {doc.text}')
        rag_sources = documents_to_sources(docs)
    except Exception:
        knowledge_sections.append('No RAG documents available.')

    online_sources = []
    settings = get_settings()
    if settings.enable_online_sources:
        try:
            urban_sources = await fetch_urban_dictionary(request.subtitleText)
            online_sources.extend(urban_sources)
        except Exception:
            pass
        try:
            wiki_sources = await fetch_wikipedia_summary(request.subtitleText)
            online_sources.extend(wiki_sources)
        except Exception:
            pass

    merged_sources = rank_sources(merge_sources(rag_sources, online_sources))
    if not merged_sources:
        merged_sources.append(
            SourceReference(
                title='LinguaLens Knowledge Base',
                url='',
                credibility='low',
                excerpt='No external sources retrieved.'
            )
        )

    knowledge_base = '\n'.join(knowledge_sections) or 'No knowledge base entries.'

    async def stream_deep_explain() -> AsyncGenerator[bytes, None]:
        try:
            if merged_sources:
                yield _sse('sources', {
                    'requestId': request.requestId,
                    'sources': [source.model_dump() for source in merged_sources]
                })

            client = await OpenAIClient.create(api_key=api_key, base_url=base_url)
            try:
                response = await client.deep_explain(request, knowledge_base, merged_sources)
            finally:
                await client.close()

            await cache.set_deep(
                request.subtitleText,
                request.profileId,
                response.model_dump()
            )

            yield _sse('background', {
                'requestId': response.requestId,
                'background': response.background.model_dump(),
                'reasoningNotes': response.reasoningNotes
            })
            yield _sse('crossCulture', {
                'requestId': response.requestId,
                'crossCulture': [item.model_dump() for item in response.crossCulture],
                'confidence': response.confidence.model_dump(),
                'reasoningNotes': response.reasoningNotes
            })
            yield _sse('complete', response.model_dump())
        except Exception as exc:  # pragma: no cover - surface error to client
            yield _sse('error', {
                'requestId': request.requestId,
                'reason': str(exc)
            })

    return StreamingResponse(
        stream_deep_explain(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache'}
    )
