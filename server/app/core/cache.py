from __future__ import annotations

import asyncio
from typing import Any

import redis.asyncio as redis

from .config import get_settings


class CacheClient:
    def __init__(self, client: redis.Redis):
        self._client = client

    @classmethod
    async def create(cls) -> 'CacheClient':
        settings = get_settings()
        try:
            client = redis.from_url(settings.redis_url, decode_responses=True)
            await client.ping()
            print(f"Successfully connected to Redis at {settings.redis_url}")
            return cls(client)
        except Exception as e:
            print(f"Failed to connect to Redis: {e}")
            raise

    async def close(self) -> None:
        await self._client.close()

    async def set_json(self, key: str, value: Any, ttl: int | None) -> None:
        if ttl:
            await self._client.set(key, value, ex=ttl)
        else:
            await self._client.set(key, value)

    async def get_json(self, key: str) -> Any:
        return await self._client.get(key)

    async def set_hash(self, key: str, mapping: dict[str, Any], ttl: int | None = None) -> None:
        await self._client.hset(key, mapping=mapping)
        if ttl:
            await self._client.expire(key, ttl)

    async def get_hash(self, key: str) -> dict[str, str]:
        return await self._client.hgetall(key)


cache_client: CacheClient | None = None
cache_lock = asyncio.Lock()


async def get_cache() -> CacheClient:
    global cache_client
    async with cache_lock:
        if cache_client is None:
            cache_client = await CacheClient.create()
    return cache_client
