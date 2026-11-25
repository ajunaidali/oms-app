/**
 * In-flight deduplication plus short-lived TTL cache for expensive list endpoints.
 */

const DEFAULT_TTL_MS = 3 * 60 * 1000;

function now() {
  return Date.now();
}

export function createCachedFetcher(fetcher, { ttlMs = DEFAULT_TTL_MS, key = 'default' } = {}) {
  let cache = null;
  let cachedAt = 0;
  let inFlight = null;

  const load = async (force = false) => {
    if (!force && cache != null && now() - cachedAt < ttlMs) {
      return cache;
    }
    if (inFlight) {
      return inFlight;
    }
    inFlight = (async () => {
      try {
        const fresh = await fetcher();
        cache = fresh;
        cachedAt = now();
        return fresh;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const peek = () => (cache != null && now() - cachedAt < ttlMs ? cache : null);

  const invalidate = () => {
    cache = null;
    cachedAt = 0;
  };

  return { load, peek, invalidate, key };
}

const stores = new Map();

export function getCachedResource(name, factory) {
  if (!stores.has(name)) {
    stores.set(name, factory());
  }
  return stores.get(name);
}

export function invalidateAllFetchCaches() {
  stores.forEach(store => {
    if (typeof store.invalidate === 'function') store.invalidate();
  });
}