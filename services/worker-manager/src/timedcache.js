class TimedCache {
  constructor(ttl = 1000 * 3600) {
    this.ttl = ttl;
    this._cache = {};
  }

  set(key, value) {
    this._cache[key] = {
      expires: Date.now() + this.ttl,
      value,
    };
  }

  get(key) {
    const result = this._cache[key];
    if (result === undefined) {
      return undefined;
    }
    if (result.expires > Date.now()) {
      return result.value;
    }
    delete this._cache[key];
    return undefined;
  }
}

module.exports = {
  TimedCache,
};
