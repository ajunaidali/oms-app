import { API_BASE_URL, API_ENDPOINTS } from './apiConfig.js';
import { invalidateAllFetchCaches } from '../utils/fetchCache.js';

const memoryAuth = {
  authToken: null,
  refreshToken: null,
};

let persistHandler = null;

export function hydrateAuthMemory(tokens = {}) {
  memoryAuth.authToken = tokens.authToken || null;
  memoryAuth.refreshToken = tokens.refreshToken || null;
}

export function readAuthMemory() {
  return {
    authToken: memoryAuth.authToken,
    refreshToken: memoryAuth.refreshToken,
  };
}

export function setAuthPersistHandler(handler) {
  persistHandler = handler;
}

function notifyAuthPersist() {
  if (typeof persistHandler !== 'function') return;
  try {
    const result = persistHandler(readAuthMemory());
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch {
    // Persistence must never break an API call.
  }
}


function extractErrorMessage(text, fallback = 'An error occurred') {
  if (!text) return fallback;

  const trimmed = text.trim();
  const preMatch = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch?.[1]) {
    return preMatch[1].trim();
  }

  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return fallback;
  }

  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}

function isAuthEndpoint(endpoint) {
  return (
    endpoint === API_ENDPOINTS.AUTH.LOGIN ||
    endpoint === API_ENDPOINTS.AUTH.REFRESH
  );
}

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.onSessionExpired = null;
    this.refreshPromise = null;
  }

  setSessionExpiredHandler(handler) {
    this.onSessionExpired = handler;
  }

  getAuthToken() {
    return memoryAuth.authToken;
  }

  setAuthToken(token) {
    memoryAuth.authToken = token || null;
    notifyAuthPersist();
  }

  getRefreshToken() {
    return memoryAuth.refreshToken;
  }

  setRefreshToken(token) {
    memoryAuth.refreshToken = token || null;
    notifyAuthPersist();
  }

  clearTokens() {
    memoryAuth.authToken = null;
    memoryAuth.refreshToken = null;
    notifyAuthPersist();
  }

  handleSessionExpired() {
    this.clearTokens();
    if (this.onSessionExpired) {
      this.onSessionExpired();
    }
  }

  async refreshAccessToken() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseURL}${API_ENDPOINTS.AUTH.REFRESH}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        const contentType = response.headers.get('content-type') || '';
        let data = null;

        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = text ? JSON.parse(text) : null;
        }

        if (!response.ok) {
          return false;
        }

        const token = data?.data?.token || data?.token;
        const nextRefreshToken = data?.data?.refreshToken || data?.refreshToken;

        if (!token) {
          return false;
        }

        this.setAuthToken(token);
        if (nextRefreshToken) {
          this.setRefreshToken(nextRefreshToken);
        }

        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const isFormData = options.body instanceof FormData;
    const headers = {
      ...options.headers,
    };

    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const token = this.getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const config = {
      method: options.method || 'GET',
      headers,
      ...options,
    };

    if (options.body instanceof FormData) {
      config.body = options.body;
      delete config.headers['Content-Type'];
    } else if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);
      const contentType = response.headers.get('content-type') || '';
      let data = null;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        if (!response.ok) {
          throw {
            status: response.status,
            message: extractErrorMessage(text, response.statusText),
            data: null,
          };
        }

        if (!text.trim()) {
          data = null;
        } else {
          try {
            data = JSON.parse(text);
          } catch {
            data = { message: text.trim() };
          }
        }
      }

      if (!response.ok) {
        if (
          response.status === 401 &&
          !options._retry &&
          !isAuthEndpoint(endpoint)
        ) {
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            return this.request(endpoint, { ...options, _retry: true });
          }

          this.handleSessionExpired();
        }

        throw {
          status: response.status,
          message: data?.message || 'An error occurred',
          data,
        };
      }

      return data;
    } catch (error) {
      if (error?.status) {
        throw error;
      }

      throw {
        status: 0,
        message: error?.message || 'Network error',
        data: null,
      };
    }
  }

  async get(endpoint, options) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async download(endpoint, options = {}) {
    const { params, _retry, ...fetchOptions } = options;
    let url = `${this.baseURL}${endpoint}`;

    if (params && typeof params === 'object') {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '') {
          search.append(key, String(value));
        }
      });
      const queryString = search.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers = { ...fetchOptions.headers };
    const token = this.getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { method: 'GET', headers, ...fetchOptions });

      if (!response.ok) {
        if (
          response.status === 401 &&
          !_retry &&
          !isAuthEndpoint(endpoint)
        ) {
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            return this.download(endpoint, { ...options, _retry: true });
          }
          this.handleSessionExpired();
        }

        const contentType = response.headers.get('content-type') || '';
        let message = response.statusText || 'Download failed';

        if (contentType.includes('application/json')) {
          const data = await response.json();
          message = data?.message || message;
        } else {
          const text = await response.text();
          message = extractErrorMessage(text, message);
        }

        throw {
          status: response.status,
          message,
          data: null,
        };
      }

      const blob = await response.blob();
      return {
        blob,
        filename: response.headers.get('content-disposition') || '',
        contentType: response.headers.get('content-type') || blob.type,
      };
    } catch (error) {
      if (error?.status) {
        throw error;
      }

      throw {
        status: 0,
        message: error?.message || 'Network error',
        data: null,
      };
    }
  }

  async post(endpoint, body, options) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  async postFormData(endpoint, formData, options) {
    return this.request(endpoint, { ...options, method: 'POST', body: formData });
  }

  async put(endpoint, body, options) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  async patch(endpoint, body, options) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  }

  async delete(endpoint, body, options) {
    return this.request(endpoint, { ...options, method: 'DELETE', body });
  }
}

export default new ApiClient();
