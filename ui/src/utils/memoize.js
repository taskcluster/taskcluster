import fastMemoize from 'fast-memoize';
import crypto from 'crypto';

const MAX_SIZE = 10;
const MAX_KEY_LENGTH = 200;

/**
 * A memory-bounded cache implementation with fast lookups using a Map.
 * It evicts the oldest entry when the maximum size is reached.
 */
class BoundedCache {
  /**
   * @param {number} [maxSize]
   */
  constructor(maxSize = MAX_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    return this.cache.get(key);
  }

  /**
   * Adds or updates an item in the cache.
   * If the cache is at its maximum size and the key is new,
   * the oldest item is removed.
   * @param {any} key
   * @param {any} value
   */
  set(key, value) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;

      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

/**
 * Creates an optimized key for memoization
 * It replaces long keys with sha256 hash
 */
const optimizeCacheKey = arg => {
  const key = Array.isArray(arg) ? arg.join(',') : arg;

  if (key.length > MAX_KEY_LENGTH) {
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex');
  }

  return key;
};

/**
 * Memoizes a function using `fast-memoize` with memory-safe defaults.
 * Utilizes `BoundedCache` for caching and an `optimizedSerializer`.
 * The cache instance is exposed on the memoized function
 * for monitoring or manual clearing.
 *
 * @template {(...args: any[]) => any} F The type of the function to memoize.
 * @param {F} fn The function to memoize.
 * @param {object} [options={}]
 * @param {number} [options.maxSize=MAX_SIZE]
 * @param {InstanceType<typeof BoundedCache>} [options.cache]
 * @param {(args: Parameters<F>) => string} [options.serializer]
 * @returns {F & { cache: InstanceType<typeof BoundedCache> }}
 */
export const memoize = (fn, options = {}) => {
  const {
    maxSize = MAX_SIZE,
    cache = new BoundedCache(maxSize),
    serializer,
    ...otherOptions
  } = options;
  const memoized = fastMemoize(fn, {
    cache: {
      create() {
        return cache;
      },
    },
    serializer: (...args) =>
      optimizeCacheKey(serializer ? serializer(...args) : args.join(',')),
    ...otherOptions,
  });

  memoized.cache = cache;

  return memoized;
};

export { BoundedCache };

/**
 * Clears all provided memoization caches.
 * This is useful for global cache invalidation or memory management,
 * for example, when a user logs out.
 *
 * @param {Array<{ cache?: { clear?: () => void } }>} memoizedFunctions
 */
export const clearAllCaches = memoizedFunctions => {
  memoizedFunctions.forEach(fn => {
    if (fn && fn.cache && typeof fn.cache.clear === 'function') {
      fn.cache.clear();
    }
  });
};
