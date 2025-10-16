from __future__ import annotations

import json
from typing import Any

from ..core.cache import CacheClient, get_cache
from ..core.config import get_settings


class ExplainCache:
    def __init__(self, client: CacheClient):
        self._client = client

    @classmethod
    async def create(cls) -> 'ExplainCache':
        client = await get_cache()
        return cls(client)

    def _quick_key(self, text: str, profile_id: str | None) -> str:
        return f'quick::{profile_id or "default"}::{ text.strip().lower() }'

    def _deep_key(self, text: str, profile_id: str | None) -> str:
        return f'deep::{profile_id or "default"}::{ text.strip().lower() }'

    async def set_quick(self, text: str, profile_id: str | None, payload: Any) -> None:
        key = self._quick_key(text, profile_id)
        await self._client.set_json(key, json.dumps(payload), get_settings().quick_cache_ttl)

    async def get_quick(self, text: str, profile_id: str | None) -> Any | None:
        key = self._quick_key(text, profile_id)
        value = await self._client.get_json(key)
        return json.loads(value) if value else None

    async def set_deep(self, text: str, profile_id: str | None, payload: Any) -> None:
        key = self._deep_key(text, profile_id)
        await self._client.set_json(key, json.dumps(payload), get_settings().deep_cache_ttl)

    async def get_deep(self, text: str, profile_id: str | None) -> Any | None:
        key = self._deep_key(text, profile_id)
        value = await self._client.get_json(key)
        return json.loads(value) if value else None
