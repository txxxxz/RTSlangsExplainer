from fastapi import APIRouter, HTTPException

from ..schemas.profile import ProfileCollection, ProfileTemplate
from ..services.profiles import ProfileStore

router = APIRouter(prefix='/profiles', tags=['profiles'])


@router.get('', response_model=ProfileCollection)
async def list_profiles() -> ProfileCollection:
    store = await ProfileStore.create()
    profiles = await store.list_profiles()
    return ProfileCollection(profiles=profiles)


@router.put('', response_model=ProfileTemplate)
async def upsert_profile(profile: ProfileTemplate) -> ProfileTemplate:
    store = await ProfileStore.create()
    try:
        await store.upsert(profile)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return profile


@router.delete('/{profile_id}')
async def delete_profile(profile_id: str):
    store = await ProfileStore.create()
    profiles = await store.list_profiles()
    if not any(profile.id == profile_id for profile in profiles):
        raise HTTPException(status_code=404, detail='Profile not found')
    await store.delete(profile_id)
    return {'ok': True}
