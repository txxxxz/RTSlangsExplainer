const TELEMETRY_KEY = 'lingualens::telemetry';

type QuickOutcome = 'success' | 'failure';

export interface TelemetrySnapshot {
  totalQuickRequests: number;
  quickUnder2s: number;
  quickCacheHits: number;
  quickFailures: number;
  lastUpdated: number;
}

const DEFAULT_SNAPSHOT: TelemetrySnapshot = {
  totalQuickRequests: 0,
  quickUnder2s: 0,
  quickCacheHits: 0,
  quickFailures: 0,
  lastUpdated: 0
};

const inflight: Map<string, number> = new Map();

function loadSnapshot(): Promise<TelemetrySnapshot> {
  return new Promise((resolve) => {
    chrome.storage.local.get([TELEMETRY_KEY], (result) => {
      const raw = result[TELEMETRY_KEY] as TelemetrySnapshot | undefined;
      if (!raw) {
        resolve({ ...DEFAULT_SNAPSHOT });
        return;
      }
      resolve({
        ...DEFAULT_SNAPSHOT,
        ...raw
      });
    });
  });
}

function saveSnapshot(snapshot: TelemetrySnapshot): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TELEMETRY_KEY]: snapshot }, () => resolve());
  });
}

export function recordQuickRequestStart(requestId: string) {
  inflight.set(requestId, Date.now());
}

export async function recordQuickRequestEnd(
  requestId: string,
  outcome: { status: QuickOutcome; fromCache: boolean }
) {
  const startedAt = inflight.get(requestId);
  inflight.delete(requestId);
  const duration = startedAt ? Date.now() - startedAt : 0;
  const snapshot = await loadSnapshot();
  snapshot.totalQuickRequests += 1;
  if (outcome.status === 'failure') {
    snapshot.quickFailures += 1;
  } else if (duration <= 2000) {
    snapshot.quickUnder2s += 1;
  }
  if (outcome.fromCache) {
    snapshot.quickCacheHits += 1;
  }
  snapshot.lastUpdated = Date.now();
  await saveSnapshot(snapshot);
}

export async function getTelemetrySnapshot(): Promise<TelemetrySnapshot> {
  return loadSnapshot();
}
