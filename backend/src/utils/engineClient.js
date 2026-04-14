const { executionEngineUrl } = require('../config/runtime');

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildEngineUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${executionEngineUrl}${normalizedPath}`;
};

const parseBody = async (response) => {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const createEngineError = (message, extra = {}) => {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
};

const shouldRetryStatus = (status) => RETRYABLE_STATUS_CODES.has(status);
const shouldRetryError = (error) => RETRYABLE_ERROR_CODES.has(error?.code);

async function engineRequest(path, options = {}, retryOptions = {}) {
  const {
    retries = 6,
    initialDelayMs = 1500,
    timeoutMs = 12000,
  } = retryOptions;

  let attempt = 0;
  let delayMs = initialDelayMs;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(buildEngineUrl(path), {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await parseBody(response);
        return { response, data };
      }

      const data = await parseBody(response);
      const details =
        data?.detail ||
        data?.message ||
        (typeof data === 'string' ? data : null) ||
        `Engine returned HTTP ${response.status}`;

      if (shouldRetryStatus(response.status) && attempt < retries) {
        await sleep(delayMs);
        attempt += 1;
        delayMs = Math.min(delayMs * 1.5, 6000);
        continue;
      }

      throw createEngineError('Execution engine request failed', {
        status: response.status,
        details,
      });
    } catch (error) {
      clearTimeout(timeout);

      if (error.name === 'AbortError' || shouldRetryError(error)) {
        if (attempt < retries) {
          await sleep(delayMs);
          attempt += 1;
          delayMs = Math.min(delayMs * 1.5, 6000);
          continue;
        }

        throw createEngineError('Execution engine request timed out', {
          code: error.code || 'TIMEOUT',
          details: error.message,
        });
      }

      throw error;
    }
  }

  throw createEngineError('Execution engine request exhausted retries');
}

async function engineJsonRequest(path, options = {}, retryOptions = {}) {
  return engineRequest(
    path,
    {
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    },
    retryOptions,
  );
}

async function waitForEngineReady() {
  return engineJsonRequest('/health', { method: 'GET' }, { retries: 6, initialDelayMs: 1500, timeoutMs: 8000 });
}

module.exports = {
  buildEngineUrl,
  engineRequest,
  engineJsonRequest,
  waitForEngineReady,
};
