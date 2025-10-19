from __future__ import annotations

import json
from typing import List

from ..core.cache import CacheClient, get_cache
from ..schemas.history import HistoryEntry

HISTORY_KEY = 'history::entries'
HISTORY_LIMIT = 300


class HistoryStore:
    def __init__(self, client: CacheClient):
        self._client = client

    @classmethod
    async def create(cls) -> 'HistoryStore':
        client = await get_cache()
        return cls(client)

    async def list_history(self) -> List[HistoryEntry]:
        raw = await self._client.get_json(HISTORY_KEY)
        if not raw:
            return []
        data = json.loads(raw)
        entries = [HistoryEntry.model_validate(item) for item in data]
        entries.sort(key=lambda item: item.createdAt, reverse=True)
        return entries

    async def save_entry(self, entry: HistoryEntry) -> HistoryEntry:
        entries = await self.list_history()
        filtered = [item for item in entries if item.id != entry.id]
        updated = [entry, *filtered][:HISTORY_LIMIT]
        payload = json.dumps([item.model_dump() for item in updated])
        await self._client.set_json(HISTORY_KEY, payload, ttl=None)
        return entry

    async def delete_entry(self, entry_id: str) -> None:
        entries = [item for item in await self.list_history() if item.id != entry_id]
        payload = json.dumps([item.model_dump() for item in entries])
        await self._client.set_json(HISTORY_KEY, payload, ttl=None)

    async def clear(self) -> None:
        await self._client.set_json(HISTORY_KEY, '[]', ttl=None)
