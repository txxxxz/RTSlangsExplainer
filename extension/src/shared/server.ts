const DEFAULT_SERVER_BASE = 'http://127.0.0.1:8000';

const runtimeBase =
  typeof process !== 'undefined' &&
  process.env &&
  typeof process.env.LINGUALENS_SERVER_BASE === 'string'
    ? process.env.LINGUALENS_SERVER_BASE
    : undefined;

export const SERVER_BASE = (runtimeBase ?? DEFAULT_SERVER_BASE).replace(/\/$/, '');

export function resolveServerUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SERVER_BASE}${normalizedPath}`;
}
