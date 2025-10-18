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
  return (
    <div className="lingualens-bubble">
      <header>
        <span>LinguaLens Quick Explain</span>
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
      <section>
        <p className="anchor">{anchorText}</p>
        {loading && <p className="status">Thinking…</p>}
        {!loading && error && <p className="status error">Quick Explain unavailable: {error}</p>}
        {!loading && response && (
          <>
            <p className="literal meaning">
              <strong>Literal:</strong> {response.literal}
            </p>
            <p className="context meaning">
              <strong>Context:</strong> {response.context}
            </p>
          </>
        )}
      </section>
    </div>
  );
};
