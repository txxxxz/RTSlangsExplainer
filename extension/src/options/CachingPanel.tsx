import React, { useEffect, useState } from 'react';
import {
  CACHE_SETTINGS_KEY,
  DEFAULT_CACHE_SETTINGS,
  type CacheSettings
} from '../shared/cacheSettings.js';

export const CachingPanel: React.FC = () => {
  const [settings, setSettings] = useState<CacheSettings>(DEFAULT_CACHE_SETTINGS);

  useEffect(() => {
    chrome.storage.local.get([CACHE_SETTINGS_KEY], (result) => {
      if (result[CACHE_SETTINGS_KEY]) {
        setSettings(result[CACHE_SETTINGS_KEY]);
      }
    });
  }, []);

  const handleChange =
    (key: keyof CacheSettings) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setSettings((prev) => ({
        ...prev,
        [key]: Number.parseInt(event.target.value, 10)
      }));
    };

  const handleSave = () => {
    chrome.storage.local.set({ [CACHE_SETTINGS_KEY]: settings });
  };

  return (
    <div className="form-stack">
      <div className="form-field">
        <label htmlFor="quickTtl">Quick Explain TTL (minutes)</label>
        <input
          id="quickTtl"
          type="number"
          min={5}
          max={180}
          value={settings.quickTtlMinutes}
          onChange={handleChange('quickTtlMinutes')}
        />
      </div>

      <div className="form-field">
        <label htmlFor="maxEntries">Max Cached Entries</label>
        <input
          id="maxEntries"
          type="number"
          min={50}
          max={1000}
          value={settings.maxEntries}
          onChange={handleChange('maxEntries')}
        />
      </div>

      <button className="primary" type="button" onClick={handleSave}>
        Save Policy
      </button>
    </div>
  );
};
