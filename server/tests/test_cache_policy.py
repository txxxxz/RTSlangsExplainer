import json
from typing import Any

import pytest

from app.services.cache import ExplainCache


class FakeCacheClient:
    def __init__(self):
        self.store: dict[str, tuple[Any, int]] = {}

    async def set_json(self, key: str, value: Any, ttl: int | None):
        self.store[key] = (json.loads(value), ttl)

    async def get_json(self, key: str) -> Any:
        value = self.store.get(key)
        if value:
            return json.dumps(value[0])
        return None


@pytest.mark.asyncio
async def test_explain_cache_distinguishes_quick_and_deep():
    cache = ExplainCache(FakeCacheClient())  # type: ignore[arg-type]
    text = 'Never gonna give you up'

    await cache.set_quick(text, None, {'literal': 'literal', 'context': 'context'})
    await cache.set_deep(text, None, {'background': 'bg'})

    quick = await cache.get_quick(text, None)
    deep = await cache.get_deep(text, None)

    assert quick['literal'] == 'literal'
    assert deep['background'] == 'bg'
