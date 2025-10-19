from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from .profile_repository import ProfileRepository
from ..schemas.profile import ProfileTemplate

MAX_PROFILES = 3


class ProfileStore:
    def __init__(self, repository: ProfileRepository):
        self._repository = repository

    @classmethod
    async def create(cls, db_path: Optional[Path] = None) -> 'ProfileStore':
        repository = ProfileRepository(db_path=db_path)
        return cls(repository)

    async def list_profiles(self) -> List[ProfileTemplate]:
        return await self._repository.a_list_profiles()

    async def upsert(self, profile: ProfileTemplate) -> ProfileTemplate:
        profiles = await self.list_profiles()
        existing_ids = {item.id for item in profiles}

        if profile.id not in existing_ids and len(profiles) >= MAX_PROFILES:
            raise ValueError(f'Maximum number of profiles reached ({MAX_PROFILES}).')

        return await self._repository.a_save_profile(profile)

    async def delete(self, profile_id: str) -> None:
        await self._repository.a_delete_profile(profile_id)
