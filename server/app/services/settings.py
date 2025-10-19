from __future__ import annotations

import json

from ..core.cache import CacheClient, get_cache
from ..schemas.settings import SettingsPayload, SettingsUpdatePayload

SETTINGS_KEY = 'settings::preferences'


class SettingsStore:
    def __init__(self, client: CacheClient):
        self._client = client

    @classmethod
    async def create(cls) -> 'SettingsStore':
        client = await get_cache()
        return cls(client)

    async def get_settings(self) -> SettingsPayload:
        raw = await self._client.get_json(SETTINGS_KEY)
        if not raw:
            return SettingsPayload()
        data = json.loads(raw)
        return SettingsPayload.model_validate(data)

    async def save_settings(self, payload: SettingsPayload) -> SettingsPayload:
        await self._client.set_json(SETTINGS_KEY, json.dumps(payload.model_dump()), ttl=None)
        return payload

    async def update_settings(self, update: SettingsUpdatePayload) -> SettingsPayload:
        current = await self.get_settings()
        next_settings = update.apply(current)
        return await self.save_settings(next_settings)
