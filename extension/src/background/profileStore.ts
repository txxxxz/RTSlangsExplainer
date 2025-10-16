import type { ProfileTemplate } from '../shared/types';
import { STORAGE_KEYS } from '../shared/storage';
import { normalizeProfileTemplate } from '../shared/profile';

export async function getActiveProfile(): Promise<ProfileTemplate | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEYS.activeProfile], (result) => {
      const stored = result[STORAGE_KEYS.activeProfile] as ProfileTemplate | undefined;
      resolve(stored ? normalizeProfileTemplate(stored) : null);
    });
  });
}
