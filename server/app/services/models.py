from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from .model_repository import ModelRepository
from ..schemas.model import ModelConfig


class ModelStore:
    def __init__(self, repository: ModelRepository):
        self._repository = repository

    @classmethod
    async def create(cls, db_path: Optional[Path] = None) -> 'ModelStore':
        repository = ModelRepository(db_path=db_path)
        return cls(repository)

    async def list_models(self) -> List[ModelConfig]:
        return await self._repository.a_list_models()

    async def get_model(self, model_id: str) -> ModelConfig | None:
        return await self._repository.a_get_model(model_id)

    async def save_model(self, config: ModelConfig) -> ModelConfig:
        return await self._repository.a_save_model(config)

    async def delete_model(self, model_id: str) -> None:
        await self._repository.a_delete_model(model_id)

    async def set_default(self, model_id: str | None) -> ModelConfig | None:
        return await self._repository.a_set_default(model_id)

    async def get_default(self) -> ModelConfig | None:
        return await self._repository.a_get_default()
