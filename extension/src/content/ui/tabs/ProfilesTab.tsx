import * as React from 'react';
const { useCallback, useEffect, useState } = React;
import { ProfileForm } from '../../../options/ProfileForm.js';
import { normalizeProfileTemplate } from '../../../shared/profile.js';
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from '../../../shared/storage.js';
import type { ProfileTemplate } from '../../../shared/types.js';
import type { ToastHandler } from '../SettingsModal.js';

interface ProfilesTabProps {
  onNotify: ToastHandler;
  view?: 'list' | 'edit';
  onViewChange?: (view: 'list' | 'edit') => void;
}

export const ProfilesTab: React.FC<ProfilesTabProps> = ({ onNotify, view, onViewChange }) => {
  const [profiles, setProfiles] = useState<ProfileTemplate[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined;

  const sendMessage = useCallback(
    <T,>(message: unknown) =>
      new Promise<T>((resolve, reject) => {
        if (!runtime?.sendMessage) {
          reject(new Error('Extension runtime unavailable'));
          return;
        }
        runtime.sendMessage(message, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
          } else {
            resolve(response as T);
          }
        });
      }),
    [runtime]
  );

  const loadActiveProfile = useCallback(async () => {
    try {
      const { data } = await storageGet<Record<string, ProfileTemplate>>([STORAGE_KEYS.activeProfile]);
      const stored = data[STORAGE_KEYS.activeProfile] as ProfileTemplate | undefined;
      setActiveProfileId(stored?.id);
    } catch (err) {
      console.warn('[LinguaLens] Failed to load active profile', err);
    }
  }, []);

  const refreshProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sendMessage<{ profiles: ProfileTemplate[] }>({
        type: 'FETCH_PROFILES'
      });
      const normalized = (response?.profiles ?? []).map((profile) => normalizeProfileTemplate(profile));
      setProfiles(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onNotify('error', `Failed to load profiles: ${message}`);
    } finally {
      setLoading(false);
      await loadActiveProfile();
    }
  }, [loadActiveProfile, onNotify, sendMessage]);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const handleSave = useCallback(
    async (profile: ProfileTemplate) => {
      try {
        setStatus(null);
        setError(null);
        const payload = normalizeProfileTemplate(profile);
        const savedProfile = await sendMessage<ProfileTemplate>({
          type: 'UPSERT_PROFILE',
          payload
        });
        const normalized = normalizeProfileTemplate(savedProfile ?? payload);
        await refreshProfiles();
        setStatus('Profile saved');
        onNotify('success', 'Profile saved');
        return normalized;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        onNotify('error', `Failed to save profile: ${message}`);
        throw err;
      }
    },
    [onNotify, refreshProfiles, sendMessage]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        setStatus(null);
        setError(null);
        await sendMessage({
          type: 'DELETE_PROFILE',
          payload: { id }
        });
        if (id === activeProfileId) {
          await storageRemove(STORAGE_KEYS.activeProfile);
          setActiveProfileId(undefined);
        }
        await refreshProfiles();
        setStatus('Profile deleted');
        onNotify('success', 'Profile deleted');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        onNotify('error', `Failed to delete profile: ${message}`);
      }
    },
    [activeProfileId, onNotify, refreshProfiles, sendMessage]
  );

  const handleSetActive = useCallback(async (profile: ProfileTemplate) => {
    try {
      const normalized = normalizeProfileTemplate(profile);
      await storageSet({ [STORAGE_KEYS.activeProfile]: normalized });
      setActiveProfileId(normalized.id);
      setStatus(`${normalized.name} is now active`);
      onNotify('success', `${normalized.name} set as active`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onNotify('error', `Failed to activate profile: ${message}`);
    }
  }, [onNotify]);

  return (
    <div className="settings-tab profiles-tab">
      {loading && <p className="status">Loading profiles…</p>}
      {error && <p className="error">{error}</p>}
      {status && !loading && !error && <p className="status success">{status}</p>}
      <ProfileForm
        profiles={profiles}
        activeProfileId={activeProfileId}
        onSave={handleSave}
        onDelete={handleDelete}
        onSetActive={handleSetActive}
        onRefreshProfiles={refreshProfiles}
        externalView={view}
        onExternalViewChange={onViewChange}
      />
    </div>
  );
};
