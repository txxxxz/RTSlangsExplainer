from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path
from typing import List, Optional

from ..schemas.profile import ProfileTemplate

DB_DIR = Path(__file__).resolve().parents[3] / 'data'
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / 'profiles.db'


class ProfileRepository:
    def __init__(self, db_path: Optional[Path] = None) -> None:
        self._path = Path(db_path or DB_PATH)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _get_connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._get_connection() as connection:
            connection.execute(
                '''
                CREATE TABLE IF NOT EXISTS profiles (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                '''
            )

    def _row_to_profile(self, row: sqlite3.Row) -> ProfileTemplate:
        data = json.loads(row['payload'])
        # 转换回驼峰式命名
        if 'created_at' in data:
            data['createdAt'] = data.pop('created_at')
        if 'updated_at' in data:
            data['updatedAt'] = data.pop('updated_at')
        return ProfileTemplate.model_validate(data)

    def list_profiles(self) -> List[ProfileTemplate]:
        with self._get_connection() as connection:
            rows = connection.execute(
                'SELECT payload FROM profiles ORDER BY updated_at DESC'
            ).fetchall()
        return [self._row_to_profile(row) for row in rows]

    def save_profile(self, profile: ProfileTemplate) -> ProfileTemplate:
        profile_dict = profile.model_dump()
        # 转换字段名
        profile_dict['created_at'] = profile_dict.pop('createdAt')
        profile_dict['updated_at'] = profile_dict.pop('updatedAt')
        
        payload = json.dumps(profile_dict)
        with self._get_connection() as connection:
            connection.execute(
                '''
                INSERT INTO profiles (id, payload, created_at, updated_at)
                VALUES (:id, :payload, :created_at, :updated_at)
                ON CONFLICT(id) DO UPDATE SET
                    payload = excluded.payload,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at
                ''',
                {
                    'id': profile.id,
                    'payload': payload,
                    'created_at': profile_dict['created_at'],
                    'updated_at': profile_dict['updated_at'],
                },
            )
        return profile

    def delete_profile(self, profile_id: str) -> None:
        with self._get_connection() as connection:
            connection.execute('DELETE FROM profiles WHERE id = ?', (profile_id,))

    async def a_list_profiles(self) -> List[ProfileTemplate]:
        return await asyncio.to_thread(self.list_profiles)

    async def a_save_profile(self, profile: ProfileTemplate) -> ProfileTemplate:
        return await asyncio.to_thread(self.save_profile, profile)

    async def a_delete_profile(self, profile_id: str) -> None:
        await asyncio.to_thread(self.delete_profile, profile_id)
