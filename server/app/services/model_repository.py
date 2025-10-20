from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path
from time import time
from typing import Iterable, Optional

from ..schemas.model import ModelConfig

DB_DIR = Path(__file__).resolve().parents[3] / 'data'
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / 'profiles.db'


class ModelRepository:
    def __init__(self, db_path: Optional[Path] = None) -> None:
        self._path = Path(db_path or DB_PATH)
        self._ensure_schema()

    def _get_connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._get_connection() as connection:
            connection.execute(
                '''
                CREATE TABLE IF NOT EXISTS model_configs (
                    id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                '''
            )
            connection.execute(
                'CREATE INDEX IF NOT EXISTS idx_model_configs_default ON model_configs(is_default)'
            )

    def _row_to_model(self, row: sqlite3.Row) -> ModelConfig:
        data = json.loads(row['payload'])
        return ModelConfig.model_validate(data)

    def list_models(self) -> list[ModelConfig]:
        with self._get_connection() as connection:
            rows = connection.execute(
                '''
                SELECT payload FROM model_configs
                ORDER BY is_default DESC, updated_at DESC
                '''
            ).fetchall()
        return [self._row_to_model(row) for row in rows]

    def get_model(self, model_id: str) -> ModelConfig | None:
        with self._get_connection() as connection:
            row = connection.execute(
                'SELECT payload FROM model_configs WHERE id = ?',
                (model_id,),
            ).fetchone()
        return self._row_to_model(row) if row else None

    def save_model(self, model: ModelConfig) -> ModelConfig:
        payload = model.model_dump()
        is_default = 1 if model.isDefault else 0
        with self._get_connection() as connection:
            if is_default:
                connection.execute('UPDATE model_configs SET is_default = 0')
                self._clear_default_flag(connection, exclude_ids=[model.id])
            connection.execute(
                '''
                INSERT INTO model_configs (id, payload, is_default, created_at, updated_at)
                VALUES (:id, :payload, :is_default, :created_at, :updated_at)
                ON CONFLICT(id) DO UPDATE SET
                    payload = excluded.payload,
                    is_default = excluded.is_default,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at
                ''',
                {
                    'id': model.id,
                    'payload': json.dumps(payload),
                    'is_default': is_default,
                    'created_at': payload.get('createdAt', int(time() * 1000)),
                    'updated_at': payload.get('updatedAt', int(time() * 1000)),
                },
            )
        return self.get_model(model.id) or model

    def delete_model(self, model_id: str) -> None:
        with self._get_connection() as connection:
            connection.execute('DELETE FROM model_configs WHERE id = ?', (model_id,))

    def set_default(self, model_id: str | None) -> ModelConfig | None:
        now_ms = int(time() * 1000)
        default_model: ModelConfig | None = None
        with self._get_connection() as connection:
            rows = connection.execute(
                'SELECT id, payload FROM model_configs'
            ).fetchall()
            for row in rows:
                payload = json.loads(row['payload'])
                is_default = bool(model_id) and row['id'] == model_id
                payload['isDefault'] = is_default
                if is_default:
                    payload['updatedAt'] = now_ms
                    default_model = ModelConfig.model_validate(payload)
                    updated_at = now_ms
                else:
                    updated_at = payload.get('updatedAt', now_ms)
                connection.execute(
                    '''
                    UPDATE model_configs
                    SET payload = :payload,
                        is_default = :is_default,
                        updated_at = :updated_at
                    WHERE id = :id
                    ''',
                    {
                        'id': row['id'],
                        'payload': json.dumps(payload),
                        'is_default': 1 if is_default else 0,
                        'updated_at': updated_at,
                    },
                )
        return default_model

    def get_default(self) -> ModelConfig | None:
        with self._get_connection() as connection:
            row = connection.execute(
                '''
                SELECT payload FROM model_configs
                WHERE is_default = 1
                ORDER BY updated_at DESC
                LIMIT 1
                '''
            ).fetchone()
        return self._row_to_model(row) if row else None

    def _clear_default_flag(self, connection: sqlite3.Connection, exclude_ids: Iterable[str] | None = None) -> None:
        exclude = set(exclude_ids or [])
        rows = connection.execute('SELECT id, payload FROM model_configs').fetchall()
        for row in rows:
            if row['id'] in exclude:
                continue
            payload = json.loads(row['payload'])
            if payload.get('isDefault'):
                payload['isDefault'] = False
                connection.execute(
                    '''
                    UPDATE model_configs
                    SET payload = :payload,
                        is_default = 0
                    WHERE id = :id
                    ''',
                    {
                        'id': row['id'],
                        'payload': json.dumps(payload),
                    },
                )

    async def a_list_models(self) -> list[ModelConfig]:
        return await asyncio.to_thread(self.list_models)

    async def a_get_model(self, model_id: str) -> ModelConfig | None:
        return await asyncio.to_thread(self.get_model, model_id)

    async def a_save_model(self, model: ModelConfig) -> ModelConfig:
        return await asyncio.to_thread(self.save_model, model)

    async def a_delete_model(self, model_id: str) -> None:
        await asyncio.to_thread(self.delete_model, model_id)

    async def a_set_default(self, model_id: str | None) -> ModelConfig | None:
        return await asyncio.to_thread(self.set_default, model_id)

    async def a_get_default(self) -> ModelConfig | None:
        return await asyncio.to_thread(self.get_default)
