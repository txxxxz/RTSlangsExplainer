from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..schemas.history import HistoryCollection, HistoryCreatePayload, HistoryEntry
from ..schemas.profile import ProfileCollection, ProfileTemplate
from ..schemas.settings import SettingsPayload, SettingsUpdatePayload
from ..services.history import HISTORY_LIMIT, HistoryStore
from ..services.profiles import ProfileStore
from ..services.settings import SettingsStore

router = APIRouter(prefix='/api/v1', tags=['api-v1'])


@router.get('/profiles', response_model=ProfileCollection)
async def list_profiles_v1() -> ProfileCollection:
    store = await ProfileStore.create()
    profiles = await store.list_profiles()
    return ProfileCollection(profiles=profiles)


@router.post('/profiles', response_model=ProfileTemplate)
async def upsert_profile_v1(profile: ProfileTemplate) -> ProfileTemplate:
    store = await ProfileStore.create()
    try:
        saved = await store.upsert(profile)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return saved


@router.delete('/profiles/{profile_id}')
async def delete_profile_v1(profile_id: str):
    store = await ProfileStore.create()
    profiles = await store.list_profiles()
    if not any(profile.id == profile_id for profile in profiles):
        raise HTTPException(status_code=404, detail='Profile not found')
    await store.delete(profile_id)
    return {'ok': True}


@router.get('/history', response_model=HistoryCollection)
async def list_history_v1(limit: int = Query(default=100, ge=1, le=HISTORY_LIMIT)) -> HistoryCollection:
    store = await HistoryStore.create()
    entries = await store.list_history()
    return HistoryCollection(items=entries[:limit])


@router.post('/history', response_model=HistoryEntry)
async def add_history_entry(payload: HistoryCreatePayload) -> HistoryEntry:
    entry = payload.to_entry()
    store = await HistoryStore.create()
    saved = await store.save_entry(entry)
    return saved


@router.delete('/history/{entry_id}')
async def delete_history_entry(entry_id: str):
    store = await HistoryStore.create()
    await store.delete_entry(entry_id)
    return {'ok': True}



@router.get('/settings', response_model=SettingsPayload)
async def get_settings_v1() -> SettingsPayload:
    store = await SettingsStore.create()
    return await store.get_settings()


@router.post('/settings', response_model=SettingsPayload)
async def update_settings_v1(payload: SettingsUpdatePayload) -> SettingsPayload:
    store = await SettingsStore.create()
    return await store.update_settings(payload)
