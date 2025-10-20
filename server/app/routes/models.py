from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas.model import ModelCollection, ModelConfig, SetDefaultModelPayload
from ..services.models import ModelStore

router = APIRouter(prefix='/models', tags=['models'])


@router.get('', response_model=ModelCollection)
async def list_models() -> ModelCollection:
    store = await ModelStore.create()
    models = await store.list_models()
    return ModelCollection(models=models)


@router.post('', response_model=ModelConfig)
async def upsert_model(payload: ModelConfig) -> ModelConfig:
    store = await ModelStore.create()
    saved = await store.save_model(payload)
    return saved


@router.delete('/{model_id}')
async def delete_model(model_id: str):
    store = await ModelStore.create()
    existing = await store.get_model(model_id)
    if existing is None:
        raise HTTPException(status_code=404, detail='Model config not found')
    await store.delete_model(model_id)
    return {'ok': True}


@router.post('/default', response_model=ModelConfig | None)
async def set_default_model(payload: SetDefaultModelPayload) -> ModelConfig | None:
    store = await ModelStore.create()
    if payload.modelId:
        existing = await store.get_model(payload.modelId)
        if existing is None:
            raise HTTPException(status_code=404, detail='Model config not found')
    updated = await store.set_default(payload.modelId)
    return updated
