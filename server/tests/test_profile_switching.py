import pytest
from pathlib import Path

from app.schemas.profile import ProfileTemplate
from app.services.profiles import ProfileStore
from app.services.profile_repository import ProfileRepository


@pytest.mark.asyncio
async def test_profile_store_upsert_and_delete(tmp_path: Path):
    db_path = tmp_path / 'profiles.db'
    repository = ProfileRepository(db_path=db_path)
    store = ProfileStore(repository)

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
        personalPreference='Use playful analogies and princess metaphors.',
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
        personalPreference='Keep explanations precise with historical nods.',
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
async def test_profile_store_limits_to_three_profiles(tmp_path: Path):
    db_path = tmp_path / 'profiles.db'
    repository = ProfileRepository(db_path=db_path)
    store = ProfileStore(repository)

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
                personalPreference='Explain with clear classroom examples.',
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
                personalPreference='Explain with clear classroom examples.',
                tone='Neutral tone.',
                createdAt=4,
                updatedAt=4
            )
        )
