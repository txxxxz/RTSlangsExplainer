import React, { useEffect, useMemo, useState } from 'react';
import type { DeepExplainResponse } from '../../shared/types';

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
  const sources = data?.sources ?? [];
  const crossCulture = data?.crossCulture ?? [];
  const overallConfidence = data?.confidence;
  const confidenceNotes = data?.confidenceNotes;
  const reasoningNotes = data?.reasoningNotes;

  useEffect(() => {
    if (open) {
      setTab('Background');
    }
  }, [open]);

  const content = useMemo(() => {
    if (!data) {
      return <p className="status">{loading ? 'Gathering sources…' : 'Waiting for details…'}</p>;
    }
    switch (tab) {
      case 'Background':
        return (
          <div className="background">
            <p className="paragraph">{data.background ?? 'Background loading…'}</p>
            {reasoningNotes && <p className="note">Why it matters: {reasoningNotes}</p>}
          </div>
        );
      case 'Cross-culture':
        if (!crossCulture.length) {
          return (
            <p className="status">
              {loading ? 'Cross-culture insights loading…' : 'No cross-culture variants yet.'}
            </p>
          );
        }
        return (
          <div className="cross-culture-block">
            {overallConfidence && (
              <p className="confidence">
                Overall confidence{' '}
                <span className={`badge badge-${overallConfidence}`}>{overallConfidence}</span>
                {confidenceNotes ? ` — ${confidenceNotes}` : ''}
              </p>
            )}
            <ul className="cross-culture">
              {crossCulture.map((insight) => (
                <li key={insight.profileId}>
                  <div className="entry-header">
                    <span className="profile-name">{insight.profileName}</span>
                    <span className={`badge badge-${insight.confidence}`}>{insight.confidence}</span>
                  </div>
                  <p>{insight.analogy}</p>
                  {insight.notes && <p className="note">{insight.notes}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      case 'Sources':
        if (!sources.length) {
          return (
            <p className="status">
              {loading ? 'Sources on the way…' : 'No sources available.'}
            </p>
          );
        }
        return (
          <div className="sources-block">
            {overallConfidence && (
              <p className="confidence">
                Overall confidence{' '}
                <span className={`badge badge-${overallConfidence}`}>{overallConfidence}</span>
                {confidenceNotes ? ` — ${confidenceNotes}` : ''}
              </p>
            )}
            <ul className="sources">
              {sources.map((source) => (
                <li key={source.url || source.title}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <span className={`badge badge-${source.credibility}`}>{source.credibility}</span>
                  {source.excerpt && <p>{source.excerpt}</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      default:
        return null;
    }
  }, [confidenceNotes, crossCulture, data, loading, overallConfidence, reasoningNotes, sources, tab]);

  if (!open) return null;

  return (
    <div className="lingualens-drawer">
      <header>
        <h3>LinguaLens Deep Explain</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <nav>
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
      <section>
        {content}
      </section>
    </div>
  );
};
