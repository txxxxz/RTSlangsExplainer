from __future__ import annotations

import pytest

from app.schemas.model import ModelConfig
from app.services.models import ModelStore


def make_config(model_id: str, is_default: bool = False) -> ModelConfig:
    return ModelConfig(
        id=model_id,
        provider='openai',
        model='gpt-4o-mini',
        baseUrl='https://api.openai.com/v1',
        apiKey='sk-test-key',
        temperature=0.7,
        topP=0.9,
        maxTokens=2048,
        formality='formal',
        literalness=0.5,
        glossaryEnabled=True,
        isDefault=is_default,
    )


@pytest.mark.asyncio
async def test_model_store_crud_and_defaults(tmp_path):
    db_path = tmp_path / 'models.db'
    store = await ModelStore.create(db_path=db_path)

    models = await store.list_models()
    assert models == []

    first = await store.save_model(make_config('model-a'))
    assert first.id == 'model-a'
    assert not first.isDefault

    second = await store.save_model(make_config('model-b', is_default=True))
    assert second.isDefault

    models = await store.list_models()
    assert [model.id for model in models] == ['model-b', 'model-a']
    assert models[0].isDefault
    assert not models[1].isDefault

    awaited = await store.set_default('model-a')
    assert awaited is not None
    assert awaited.id == 'model-a'
    assert awaited.isDefault

    models = await store.list_models()
    assert models[0].id == 'model-a'
    assert models[0].isDefault
    assert not models[1].isDefault

    cleared = await store.set_default(None)
    assert cleared is None

    models = await store.list_models()
    assert all(not model.isDefault for model in models)

    await store.delete_model('model-b')
    models = await store.list_models()
    assert [model.id for model in models] == ['model-a']
