import * as React from 'react';
const { useCallback, useEffect, useMemo, useRef, useState } = React;
import { getStorageAdapter } from '../../../shared/storageAdapter.js';
import type { DeepExplainResponse, HistoryEntry } from '../../../shared/types.js';
import type { ToastHandler } from '../SettingsModal.js';

interface HistoryTabProps {
  onNotify: ToastHandler;
}

type FlashcardInsight = {
  profile: string;
  analogy: string;
  context?: string;
  notes?: string;
  confidence?: string;
};

type Flashcard = {
  term: string;
  profile: string;
  summary: string;
  backgroundSummary: string;
  backgroundDetail: string;
  highlights: string[];
  insights: FlashcardInsight[];
  reasoningNotes: string;
  createdAt: string;
};

function coerceDeepResponse(data: unknown): Partial<DeepExplainResponse> | null {
  if (!data || typeof data !== 'object') return null;
  return data as Partial<DeepExplainResponse>;
}

function buildFlashcards(entries: HistoryEntry[]): Flashcard[] {
  return entries.map((entry) => {
    const deep = coerceDeepResponse(entry.deepResponse);
    const background = deep?.background ?? null;
    const crossCulture = Array.isArray(deep?.crossCulture) ? deep?.crossCulture : [];
    const summary = entry.resultSummary ?? background?.summary ?? '';
    const backgroundSummary = background?.summary ?? '';
    const backgroundDetail = background?.detail ?? '';
    const highlights = Array.isArray(background?.highlights) ? background?.highlights : [];
    const insights: FlashcardInsight[] = crossCulture
      .filter((item) => item && typeof item === 'object')
      .map((insight) => ({
        profile: insight.profileName || insight.profileId || 'Profile',
        analogy: insight.analogy || '',
        context: insight.context || undefined,
        notes: insight.notes || undefined,
        confidence: insight.confidence || undefined
      }));
    const reasoningNotes = deep?.reasoningNotes ?? '';
    const createdAt = new Date(entry.createdAt).toLocaleString();
    return {
      term: entry.query,
      profile: entry.profileName || entry.profileId || 'Default',
      summary,
      backgroundSummary,
      backgroundDetail,
      highlights,
      insights,
      reasoningNotes,
      createdAt
    };
  });
}

function exportFlashcardsMarkdown(entries: HistoryEntry[]): string {
  const cards = buildFlashcards(entries);
  const lines: string[] = [
    '# LinguaLens Flashcards',
    '',
    `Generated at ${new Date().toISOString()}`,
    ''
  ];

  cards.forEach((card, index) => {
    lines.push(`## ${index + 1}. ${card.term}`);
    lines.push(`- Profile: ${card.profile}`);
    lines.push(`- Added: ${card.createdAt}`);
    if (card.summary) {
      lines.push(`- Summary: ${card.summary}`);
    }
    if (card.backgroundSummary && card.backgroundSummary !== card.summary) {
      lines.push(`- Background: ${card.backgroundSummary}`);
    }
    if (card.backgroundDetail) {
      lines.push('');
      lines.push('  Detail:');
      lines.push(`  ${card.backgroundDetail}`);
    }
    if (card.highlights.length) {
      lines.push('');
      lines.push('  Highlights:');
      card.highlights.forEach((item) => {
        lines.push(`  - ${item}`);
      });
    }
    if (card.insights.length) {
      lines.push('');
      lines.push('  Cross-culture insights:');
      card.insights.forEach((insight) => {
        lines.push(`  - ${insight.profile}: ${insight.analogy}`);
        if (insight.context) lines.push(`    Context: ${insight.context}`);
        if (insight.notes) lines.push(`    Notes: ${insight.notes}`);
        if (insight.confidence) lines.push(`    Confidence: ${insight.confidence}`);
      });
    }
    if (card.reasoningNotes) {
      lines.push('');
      lines.push(`  Reasoning notes: ${card.reasoningNotes}`);
    }
    lines.push('');
  });

  return `${lines.join('\n').trim()}\n`;
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

  const handleExportFlashcards = useCallback(async () => {
      if (!entries.length) {
        onNotify('info', 'No history to export');
        return;
      }
      try {
        const markdown = exportFlashcardsMarkdown(entries);
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lingualens-flashcards-${new Date().toISOString()}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        onNotify('success', 'Flashcards exported as Markdown');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        onNotify('error', `Failed to export flashcards: ${message}`);
      }
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
        <button type="button" className="primary outline" onClick={handleExportFlashcards}>
          Export Markdown
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
        <p className="export-hint">
          Tip: convert the exported Markdown to PDF with your preferred tool (e.g. Pandoc, Typora,
          or Obsidian) to keep fonts and layouts you control.
        </p>
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
