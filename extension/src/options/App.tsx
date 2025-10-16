import React, { useEffect, useState } from 'react';
import type { ProfileTemplate } from '../shared/types';
import { STORAGE_KEYS } from '../shared/storage';
import { normalizeProfileTemplate } from '../shared/profile';
import { CachingPanel } from './CachingPanel';
import { KeyManager } from './KeyManager';
import { ProfileForm } from './ProfileForm';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

type KeyState = {
  openaiKey: string;
  langGraphKey?: string;
  openaiBaseUrl?: string;
};

export const App: React.FC = () => {
  const [keys, setKeys] = useState<KeyState>({
    openaiKey: '',
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
    chrome.storage.sync.get([STORAGE_KEYS.apiKeys], (result) => {
      const stored = result[STORAGE_KEYS.apiKeys] ?? {};
      setKeys({
        openaiKey: stored.openaiKey ?? '',
        langGraphKey: stored.langGraphKey ?? '',
        openaiBaseUrl: stored.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL
      });
    });
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, []);

  function loadActiveProfile() {
    chrome.storage.sync.get([STORAGE_KEYS.activeProfile], (result) => {
      const profile = result[STORAGE_KEYS.activeProfile] as ProfileTemplate | undefined;
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
    chrome.storage.sync.set({ [STORAGE_KEYS.apiKeys]: nextKeys });
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
      chrome.storage.sync.remove(STORAGE_KEYS.activeProfile, () => {
        setActiveProfileId(undefined);
      });
    }
    await refreshProfiles();
  }

  async function handleSetActiveProfile(profile: ProfileTemplate) {
    const normalized = normalizeProfileTemplate(profile);
    chrome.storage.sync.set({ [STORAGE_KEYS.activeProfile]: normalized }, () => {
      setActiveProfileId(normalized.id);
    });
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
