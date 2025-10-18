import type { ProfileTemplate } from '../shared/types.js';
import { STORAGE_KEYS, storageGet } from '../shared/storage.js';
import { normalizeProfileTemplate } from '../shared/profile.js';

export async function getActiveProfile(): Promise<ProfileTemplate | null> {
  const { data } = await storageGet<Record<string, ProfileTemplate>>([STORAGE_KEYS.activeProfile]);
  const stored = data[STORAGE_KEYS.activeProfile] as ProfileTemplate | undefined;
  return stored ? normalizeProfileTemplate(stored) : null;
}
