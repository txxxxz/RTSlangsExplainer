import React, { useEffect, useState } from 'react';
import type { ProfileTemplate } from '../shared/types';
import { DEFAULT_OPENAI_API_KEY, DEFAULT_OPENAI_BASE_URL } from '../shared/config';
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from '../shared/storage';
import { normalizeProfileTemplate } from '../shared/profile';
import { CachingPanel } from './CachingPanel';
import { KeyManager } from './KeyManager';
import { ProfileForm } from './ProfileForm';

type KeyState = {
  openaiKey: string;
  langGraphKey?: string;
  openaiBaseUrl?: string;
};

export const App: React.FC = () => {
  const [keys, setKeys] = useState<KeyState>({
    openaiKey: DEFAULT_OPENAI_API_KEY,
    langGraphKey: '',
    openaiBaseUrl: DEFAULT_OPENAI_BASE_URL
  });
  const [profiles, setProfiles] = useState<ProfileTemplate[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadActiveProfile();
  }, []);

  useEffect(() => {
    storageGet<Record<string, KeyState>>([STORAGE_KEYS.apiKeys]).then(({ data }) => {
      const stored = data[STORAGE_KEYS.apiKeys] ?? {};
      setKeys({
        openaiKey: stored.openaiKey ?? DEFAULT_OPENAI_API_KEY,
        langGraphKey: stored.langGraphKey ?? '',
        openaiBaseUrl: stored.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL
      });
    });
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, []);

  function loadActiveProfile() {
    storageGet<Record<string, ProfileTemplate>>([STORAGE_KEYS.activeProfile]).then(({ data }) => {
      const profile = data[STORAGE_KEYS.activeProfile] as ProfileTemplate | undefined;
      setActiveProfileId(profile?.id);
    });
  }

  const sendMessage = <T,>(message: unknown) =>
    new Promise<T>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
        } else {
          resolve(response as T);
        }
      });
    });

  async function refreshProfiles() {
    setLoadingProfiles(true);
    try {
      const response = await sendMessage<{ profiles: ProfileTemplate[] }>({
        type: 'FETCH_PROFILES'
      });
      const normalized = (response?.profiles ?? []).map((profile) =>
        normalizeProfileTemplate(profile)
      );
      setProfiles(normalized);
      loadActiveProfile();
    } catch (error) {
      console.error('Failed to fetch profiles', error);
    } finally {
      setLoadingProfiles(false);
    }
  }

  async function handleSaveKeys(nextKeys: KeyState) {
    setKeys(nextKeys);
    await storageSet({ [STORAGE_KEYS.apiKeys]: nextKeys });
    await sendMessage({
      type: 'STORE_API_KEYS',
      payload: nextKeys
    });
  }

  async function handleUpsertProfile(profile: ProfileTemplate) {
    await sendMessage({
      type: 'UPSERT_PROFILE',
      payload: profile
    });
    await refreshProfiles();
  }

  async function handleDeleteProfile(id: string) {
    await sendMessage({
      type: 'DELETE_PROFILE',
      payload: { id }
    });
    if (id === activeProfileId) {
      await storageRemove(STORAGE_KEYS.activeProfile);
      setActiveProfileId(undefined);
    }
    await refreshProfiles();
  }

  async function handleSetActiveProfile(profile: ProfileTemplate) {
    const normalized = normalizeProfileTemplate(profile);
    await storageSet({ [STORAGE_KEYS.activeProfile]: normalized });
    setActiveProfileId(normalized.id);
  }

  return (
    <div className="page">
      <h1>LinguaLens Control Panel</h1>
      <section>
        <h2>API Keys</h2>
        <KeyManager value={keys} onSave={handleSaveKeys} />
      </section>
      <section>
        <h2>Cultural Profiles</h2>
        {loadingProfiles && <p>Loading profiles…</p>}
        {!loadingProfiles && (
          <ProfileForm
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSave={handleUpsertProfile}
            onDelete={handleDeleteProfile}
            onSetActive={handleSetActiveProfile}
          />
        )}
      </section>
      <section>
        <h2>Caching Policy</h2>
        <CachingPanel />
      </section>
    </div>
  );
};
