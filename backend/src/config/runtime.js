const ensureUrl = (value) => {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(value)) return `http://${value}`;
  return `https://${value}`;
};

const normalizeUrl = (value, fallback) => ensureUrl(value || fallback).replace(/\/+$/, '');

const normalizeOrigin = (value) => {
  if (!value) return value;
  return ensureUrl(value).replace(/\/+$/, '');
};

const executionEngineUrl = normalizeUrl(
  process.env.EXECUTION_ENGINE_URL,
  'http://127.0.0.1:8000',
);

const getAllowedOrigins = () => {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  // Default dev origins for local runs. In production, set CORS_ALLOWED_ORIGINS.
  return process.env.NODE_ENV === 'production'
    ? []
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ];
};

module.exports = {
  executionEngineUrl,
  allowedOrigins: getAllowedOrigins(),
};
