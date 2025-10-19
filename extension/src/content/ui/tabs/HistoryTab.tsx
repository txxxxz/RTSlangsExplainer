import * as React from 'react';
const { useCallback, useEffect, useMemo, useRef, useState } = React;
import { getStorageAdapter } from '../../../shared/storageAdapter.js';
import type { HistoryEntry } from '../../../shared/types.js';
import type { ToastHandler } from '../SettingsModal.js';

interface HistoryTabProps {
  onNotify: ToastHandler;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ onNotify }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const adapter = useMemo(() => getStorageAdapter(), []);

  const refreshHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await adapter.getHistory();
      setEntries(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onNotify('error', `Failed to load history: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [adapter, onNotify]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const handleClearHistory = useCallback(async () => {
    try {
      await adapter.clearHistory();
      setEntries([]);
      onNotify('success', 'History cleared');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onNotify('error', `Failed to clear history: ${message}`);
    }
  }, [adapter, onNotify]);

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      try {
        await adapter.deleteHistoryEntry(id);
        setEntries((prev) => prev.filter((entry) => entry.id !== id));
        onNotify('success', 'Entry removed');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        onNotify('error', `Failed to remove entry: ${message}`);
      }
    },
    [adapter, onNotify]
  );

  const handleExportHistory = useCallback(() => {
    if (!entries.length) {
      onNotify('info', 'No history to export');
      return;
    }
    const payload = JSON.stringify(entries, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lingualens-history-${new Date().toISOString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('success', 'History exported');
  }, [entries, onNotify]);

  const handleImportHistory = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error('Invalid history file format');
        }
        const mapped: HistoryEntry[] = parsed
          .filter((item) => typeof item === 'object' && item !== null)
          .map((item) => ({
            id: String(item.id ?? crypto.randomUUID()),
            query: String(item.query ?? ''),
            resultSummary: typeof item.resultSummary === 'string' ? item.resultSummary : undefined,
            profileId: typeof item.profileId === 'string' ? item.profileId : undefined,
            profileName: typeof item.profileName === 'string' ? item.profileName : undefined,
            deepResponse: item.deepResponse,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
          }));
        await adapter.importHistory(mapped);
        await refreshHistory();
        onNotify('success', 'History imported');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        onNotify('error', `Failed to import history: ${message}`);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [adapter, onNotify, refreshHistory]
  );

  return (
    <div className="settings-tab history-tab">
      <div className="tab-actions">
        <button type="button" className="primary outline" onClick={handleExportHistory}>
          Export JSON
        </button>
        <button
          type="button"
          className="primary outline"
          onClick={() => fileInputRef.current?.click()}
        >
          Import JSON
        </button>
        <button type="button" className="danger" onClick={handleClearHistory}>
          Clear All
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden-input"
          onChange={handleImportHistory}
        />
      </div>
      {loading && <p className="status">Loading history…</p>}
      {!loading && error && <p className="error">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="status">No history saved yet. Run a Deep Explain to record entries.</p>
      )}
      {!loading && !error && entries.length > 0 && (
        <ul className="history-list">
          {entries.map((entry) => (
            <li key={entry.id} className="history-item">
              <header>
                <span className="query">{entry.query}</span>
                <time>{new Date(entry.createdAt).toLocaleString()}</time>
              </header>
              {entry.profileName && (
                <p className="meta">
                  Profile: <strong>{entry.profileName}</strong>
                </p>
              )}
              {entry.resultSummary && <p className="summary">{entry.resultSummary}</p>}
              <div className="item-actions">
                {entry.deepResponse && (
                  <details>
                    <summary>View JSON</summary>
                    <pre>{JSON.stringify(entry.deepResponse, null, 2)}</pre>
                  </details>
                )}
                <button type="button" className="ghost" onClick={() => handleDeleteEntry(entry.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
