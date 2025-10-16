import React from 'react';
import type { QuickExplainResponse } from '../../shared/types';

interface QuickExplainBubbleProps {
  anchorText: string;
  loading: boolean;
  response?: QuickExplainResponse;
  onDeepExplain(): void;
  onClose?(): void;
}

export const QuickExplainBubble: React.FC<QuickExplainBubbleProps> = ({
  anchorText,
  loading,
  response,
  onDeepExplain,
  onClose
}) => {
  return (
    <div className="lingualens-bubble">
      <header>
        <span>LinguaLens Quick Explain</span>
        <div className="actions">
          <button type="button" className="primary" onClick={onDeepExplain} disabled={loading}>
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
      <section>
        <p className="anchor">{anchorText}</p>
        {loading && <p className="status">Thinking…</p>}
        {!loading && response && (
          <>
            <p className="literal">
              <strong>Literal:</strong> {response.literal}
            </p>
            <p className="context">
              <strong>Context:</strong> {response.context}
            </p>
          </>
        )}
      </section>
    </div>
  );
};
