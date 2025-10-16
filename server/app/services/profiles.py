from __future__ import annotations

import json
from typing import List

from ..core.cache import CacheClient, get_cache
from ..schemas.profile import ProfileTemplate

PROFILES_KEY = 'profiles::templates'


class ProfileStore:
    def __init__(self, client: CacheClient):
        self._client = client

    @classmethod
    async def create(cls) -> 'ProfileStore':
        client = await get_cache()
        return cls(client)

    async def list_profiles(self) -> List[ProfileTemplate]:
        raw = await self._client.get_json(PROFILES_KEY)
        if not raw:
            return []
        data = json.loads(raw)
        return [ProfileTemplate.model_validate(item) for item in data]

    async def save_profiles(self, profiles: List[ProfileTemplate]) -> None:
        payload = json.dumps([profile.model_dump() for profile in profiles])
        await self._client.set_json(PROFILES_KEY, payload, ttl=None)

    async def upsert(self, profile: ProfileTemplate) -> None:
        profiles = await self.list_profiles()
        existing_ids = {item.id for item in profiles}
        if profile.id in existing_ids:
            updated = [
                profile if item.id == profile.id else item
                for item in profiles
            ]
        else:
            if len(profiles) >= 3:
                raise ValueError('Maximum number of profiles reached (3).')
            updated = [*profiles, profile]
        await self.save_profiles(updated)

    async def delete(self, profile_id: str) -> None:
        profiles = [profile for profile in await self.list_profiles() if profile.id != profile_id]
        await self.save_profiles(profiles)
