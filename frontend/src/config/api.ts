const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const ensureUrl = (value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(value)) return `http://${value}`;
  return `https://${value}`;
};

const getDefaultApiBaseUrl = () => {
  if (typeof window === 'undefined') return '';

  const host = window.location.hostname;
  const isLoopback =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1';

  if (!isLoopback) {
    // Production-friendly default: same-origin routing (proxy/reverse-proxy).
    return '';
  }

  return `${window.location.protocol}//localhost:5000`;
};

const configuredApiBase = (import.meta.env.VITE_CHAT_API_URL || '').trim();
const configuredEngineBase = (import.meta.env.VITE_EXECUTION_ENGINE_URL || '').trim();

export const CHAT_API_BASE_URL = configuredApiBase
  ? trimTrailingSlash(ensureUrl(configuredApiBase))
  : getDefaultApiBaseUrl();

const getDefaultEngineBaseUrl = () => {
  if (typeof window === 'undefined') return '';

  const host = window.location.hostname;
  const isLoopback =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1';

  if (!isLoopback) {
    return '';
  }

  return 'http://localhost:8000';
};

export const ENGINE_BASE_URL = configuredEngineBase
  ? trimTrailingSlash(ensureUrl(configuredEngineBase))
  : getDefaultEngineBaseUrl();

export const buildApiUrl = (path: string) => {
  if (!path.startsWith('/')) return `${CHAT_API_BASE_URL}/${path}`;
  return `${CHAT_API_BASE_URL}${path}`;
};

export const buildEngineUrl = (path: string) => {
  if (!ENGINE_BASE_URL) return '';
  if (!path.startsWith('/')) return `${ENGINE_BASE_URL}/${path}`;
  return `${ENGINE_BASE_URL}${path}`;
};
