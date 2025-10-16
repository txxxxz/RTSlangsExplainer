import type {
  DeepExplainPartial,
  DeepExplainResponse,
  ExplainMode,
  ExplainRequestPayload,
  ProfileTemplate,
  QuickExplainResponse
} from './types';

export type BackgroundMessage =
  | {
      type: 'EXPLAIN_REQUEST';
      payload: ExplainRequestPayload;
    }
  | {
      type: 'STORE_API_KEYS';
      payload: { openaiKey: string; langGraphKey?: string; openaiBaseUrl?: string };
    }
  | {
      type: 'FETCH_PROFILES';
    }
  | {
      type: 'UPSERT_PROFILE';
      payload: ProfileTemplate;
    }
  | {
      type: 'DELETE_PROFILE';
      payload: { id: string };
    };

export type ContentMessage =
  | {
      type: 'QUICK_EXPLAIN_READY';
      payload: QuickExplainResponse;
    }
  | {
      type: 'DEEP_EXPLAIN_READY';
      payload: DeepExplainResponse;
    }
  | {
      type: 'DEEP_EXPLAIN_PROGRESS';
      payload: DeepExplainPartial;
    }
  | {
      type: 'REQUEST_FAILED';
      payload: {
        requestId: string;
        mode: ExplainMode;
        reason: string;
      };
    };
