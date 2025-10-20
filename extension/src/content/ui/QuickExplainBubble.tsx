import * as React from 'react';
import type { QuickExplainResponse } from '../../shared/types.js';

interface QuickExplainBubbleProps {
  anchorText: string;
  loading: boolean;
  response?: QuickExplainResponse;
  error?: string | null;
  onDeepExplain(): void;
  onClose?(): void;
}

export const QuickExplainBubble: React.FC<QuickExplainBubbleProps> = ({
  anchorText,
  loading,
  response,
  error,
  onDeepExplain,
  onClose
}) => {
  const languageDisplay = response
    ? response.languages.secondary
      ? `${response.languages.primary.toUpperCase()} → ${response.languages.secondary.toUpperCase()}`
      : response.languages.primary.toUpperCase()
    : null;

  const expiryDisplay = response
    ? new Date(response.expiresAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="lingualens-bubble">
      <header className="bubble-header">
        <div className="bubble-title">
          <span className="bubble-eyebrow">Quick explain</span>
          <h4>LinguaLens Snapshot</h4>
          <p className="bubble-subtitle">Fast cultural sense-making for highlighted slang.</p>
        </div>
        <div className="actions">
          <button 
            type="button" 
            className="primary" 
            onClick={onDeepExplain} 
            disabled={loading || !response || !!error}
          >
            Deep Explain
          </button>
          {onClose && (
            <button
              type="button"
              className="ghost"
              onClick={onClose}
              aria-label="Close quick explanation"
            >
              ×
            </button>
          )}
        </div>
      </header>
      <section className="bubble-content">
        <div className="anchor-card">
          <span className="anchor-label">Selected text</span>
          <p className="anchor-text">{anchorText}</p>
        </div>
        <div className="bubble-body">
          {loading && <p className="bubble-status">Thinking…</p>}
          {!loading && error && <p className="bubble-status error">Quick Explain unavailable: {error}</p>}
          {!loading && response && (
            <>
              <dl className="meaning-grid">
                <div className="meaning-card">
                  <dt>Literal meaning</dt>
                  <dd>{response.literal || 'Unavailable'}</dd>
                </div>
                <div className="meaning-card">
                  <dt>Everyday context</dt>
                  <dd>{response.context || 'No context provided.'}</dd>
                </div>
              </dl>
              <div className="bubble-meta">
                {languageDisplay && (
                  <div>
                    <span className="meta-label">Language lane</span>
                    <span className="meta-value">{languageDisplay}</span>
                  </div>
                )}
                {expiryDisplay && (
                  <div>
                    <span className="meta-label">Cache expires</span>
                    <span className="meta-value">≈ {expiryDisplay}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
