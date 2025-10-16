import pytest

from app.schemas.profile import ProfileTemplate
from app.services.profiles import ProfileStore


class FakeCacheClient:
    def __init__(self):
        self.value = None

    async def get_json(self, key: str):
        return self.value

    async def set_json(self, key: str, value: str, ttl: int | None):
        self.value = value


@pytest.mark.asyncio
async def test_profile_store_upsert_and_delete():
    store = ProfileStore(FakeCacheClient())  # type: ignore[arg-type]

    profile_a = ProfileTemplate(
        id='a',
        name='A',
        description='desc A',
        primaryLanguage='en',
        cultures=['US'],
        demographics={
            'ageRange': '18-25',
            'region': 'US',
            'occupation': 'Student'
        },
        tone='Casual comparisons with sports references.',
        createdAt=1,
        updatedAt=1
    )
    profile_b = ProfileTemplate(
        id='b',
        name='B',
        description='desc B',
        primaryLanguage='zh',
        cultures=['CN'],
        demographics={
            'ageRange': '26-35',
            'region': 'CN',
            'occupation': 'Engineer',
            'gender': 'F'
        },
        tone='Direct tone with historical context.',
        createdAt=1,
        updatedAt=1
    )

    await store.upsert(profile_a)
    await store.upsert(profile_b)

    profiles = await store.list_profiles()
    assert {profile.id for profile in profiles} == {'a', 'b'}

    await store.delete('a')
    profiles = await store.list_profiles()
    assert [profile.id for profile in profiles] == ['b']


@pytest.mark.asyncio
async def test_profile_store_limits_to_three_profiles():
    store = ProfileStore(FakeCacheClient())  # type: ignore[arg-type]

    for idx in range(3):
        await store.upsert(
            ProfileTemplate(
                id=f'id-{idx}',
                name=f'P{idx}',
                description='demo',
                primaryLanguage='en',
                cultures=['US'],
                demographics={
                    'ageRange': '18-25',
                    'region': 'US',
                    'occupation': 'Student'
                },
                tone='Neutral tone.',
                createdAt=idx,
                updatedAt=idx
            )
        )

    with pytest.raises(ValueError):
        await store.upsert(
            ProfileTemplate(
                id='id-3',
                name='overflow',
                description='overflow',
                primaryLanguage='en',
                cultures=['US'],
                demographics={
                    'ageRange': '18-25',
                    'region': 'US',
                    'occupation': 'Student'
                },
                tone='Neutral tone.',
                createdAt=4,
                updatedAt=4
            )
        )
