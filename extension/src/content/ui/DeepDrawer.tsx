import * as React from 'react';
const { useEffect, useMemo, useState } = React;
import type { DeepExplainResponse } from '../../shared/types.js';
import { SettingsModal } from './SettingsModal.js';

const TAB_KEYS = ['Background', 'Cross-culture', 'Sources'] as const;
type TabKey = (typeof TAB_KEYS)[number];

interface DeepDrawerProps {
  open: boolean;
  loading: boolean;
  data?: Partial<DeepExplainResponse>;
  onClose(): void;
}

export const DeepDrawer: React.FC<DeepDrawerProps> = ({ open, loading, data, onClose }) => {
  const [tab, setTab] = useState<TabKey>('Background');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sources = data?.sources ?? [];
  const crossCulture = data?.crossCulture ?? [];
  const background = data?.background;
  const overallConfidence = data?.confidence?.level;
  const confidenceNotes = data?.confidence?.notes;
  const reasoningNotes = data?.reasoningNotes;
  const drawerLanguage = data?.language;
  const generatedDisplay = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  useEffect(() => {
    if (open) {
      setTab('Background');
      setSettingsOpen(false);
    }
  }, [open]);

  const content = useMemo(() => {
    if (!data) {
      return (
        <div className="drawer-panel">
          <p className="drawer-status">{loading ? 'Gathering sources…' : 'Waiting for details…'}</p>
        </div>
      );
    }
    switch (tab) {
      case 'Background':
        if (!background) {
          return (
            <div className="drawer-panel">
              <p className="drawer-status">{loading ? 'Background loading…' : 'No background available.'}</p>
            </div>
          );
        }
        return (
          <div className="drawer-panel background-panel">
            <p className="paragraph">{normalizeField(background.summary)}</p>
            {background.detail && <p className="paragraph detail">{normalizeField(background.detail)}</p>}
            {!!background.highlights?.length && (
              <ul className="highlights">
                {background.highlights.map((point, index) => (
                  <li key={index}>{normalizeField(point)}</li>
                ))}
              </ul>
            )}
            {reasoningNotes && <p className="note">Why it matters: {normalizeField(reasoningNotes)}</p>}
          </div>
        );
      case 'Cross-culture':
        if (!crossCulture.length) {
          return (
            <div className="drawer-panel">
              <p className="drawer-status">
                {loading ? 'Cross-culture insights loading…' : 'No cross-culture variants yet.'}
              </p>
            </div>
          );
        }
        return (
          <div className="drawer-panel cross-culture-panel">
            {overallConfidence && (
              <p className="confidence">
                Overall confidence <span className={`badge badge-${overallConfidence}`}>{overallConfidence}</span>
                {confidenceNotes ? ` — ${confidenceNotes}` : ''}
              </p>
            )}
            <ul className="cross-culture">
              {crossCulture.map((insight) => (
                <li key={insight.profileId} className="insight-card">
                  <div className="entry-header">
                    <span className="profile-name">{normalizeField(insight.profileName)}</span>
                    <span className={`badge badge-${insight.confidence}`}>{normalizeField(insight.confidence)}</span>
                  </div>
                  {insight.headline && <p className="headline">{normalizeField(insight.headline)}</p>}
                  <p>{normalizeField(insight.analogy)}</p>
                  {insight.context && <p className="context">{normalizeField(insight.context)}</p>}
                  {insight.notes && <p className="note">{normalizeField(insight.notes)}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      case 'Sources':
        if (!sources.length) {
          return (
            <div className="drawer-panel">
              <p className="drawer-status">{loading ? 'Sources on the way…' : 'No sources available.'}</p>
            </div>
          );
        }
        return (
          <div className="drawer-panel sources-panel">
            {overallConfidence && (
              <p className="confidence">
                Overall confidence <span className={`badge badge-${overallConfidence}`}>{normalizeField(overallConfidence)}</span>
                {confidenceNotes ? ` — ${normalizeField(confidenceNotes)}` : ''}
              </p>
            )}
            <ul className="sources">
              {sources.map((source) => (
                <li key={source.url || source.title} className="source-card">
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {normalizeField(source.title)}
                  </a>
                  <span className={`badge badge-${source.credibility}`}>{normalizeField(source.credibility)}</span>
                  {source.excerpt && <p>{normalizeField(source.excerpt)}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      default:
        return null;
    }
  }, [background, confidenceNotes, crossCulture, data, loading, overallConfidence, reasoningNotes, sources, tab]);

  if (!open) return null;

  return (
    <div className="lingualens-drawer" role="dialog" aria-label="LinguaLens deep explain">
      <header className="drawer-header">
        <div className="drawer-title">
          <span className="drawer-eyebrow">Deep explain</span>
          <h3>LinguaLens Insight Deck</h3>
          <p className="drawer-subtitle">
            {drawerLanguage
              ? `Surface language: ${drawerLanguage.toUpperCase()}${generatedDisplay ? ` · refreshed ${generatedDisplay}` : ''}`
              : generatedDisplay
                ? `Generated around ${generatedDisplay}`
                : 'Layered cultural context with sources and variants.'}
          </p>
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close deep explain panel">
          ×
        </button>
      </header>
      <nav className="drawer-tab-switcher" aria-label="Deep explain sections">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {key}
          </button>
        ))}
      </nav>
      <section className="drawer-content">{content}</section>
      <footer className="drawer-footer">
        <button type="button" className="profile-button" onClick={() => setSettingsOpen(true)}>
          Settings ⚙️
        </button>
      </footer>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

function normalizeField(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    try {
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'string') {
          return parsed;
        }
        if (Array.isArray(parsed)) {
          return parsed.map((item) => normalizeField(item)).filter(Boolean).join('；');
        }
        if (parsed && typeof parsed === 'object') {
          return Object.entries(parsed)
            .map(([key, val]) => `${key}: ${normalizeField(val)}`)
            .join('；');
        }
      }
    } catch {
      // ignore parse errors, fall back to raw string
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeField(item)).filter(Boolean).join('；');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${normalizeField(val)}`)
      .join('；');
  }
  return String(value);
}
