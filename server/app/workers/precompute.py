from __future__ import annotations

import asyncio
from typing import Iterable

from ..schemas.explain import ExplainRequest
from ..services.cache import ExplainCache
from ..services.openai_client import OpenAIClient


async def precompute_hot_lines(requests: Iterable[ExplainRequest]) -> None:
    cache = await ExplainCache.create()
    client = await OpenAIClient.create()
    try:
        for request in requests:
            if await cache.get_deep(request.subtitleText, request.profileId):
                continue
            response = await client.quick_explain(request)
            await cache.set_quick(request.subtitleText, request.profileId, response.model_dump())
    finally:
        await client.close()


def schedule_precompute(requests: Iterable[ExplainRequest]) -> None:
    asyncio.create_task(precompute_hot_lines(requests))
