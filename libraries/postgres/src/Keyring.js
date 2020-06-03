const assert = require('assert');

class Keyring {
  /**
   * Construct a new keyring from a service's configuration.
   */
  constructor(cfg) {
    this.crypto = new Map();
    this.currentCrypto = undefined;

    // Azure-compatible configuration format
    if (cfg.azure && cfg.azure.cryptoKey) {
      const key = Buffer.from(cfg.azure.cryptoKey, 'base64');
      assert.equal(key.length, 32, "azure.cryptoKey must be 32 bytes in base64");
      this.crypto.set('azure', {algo: 'aes-256', key});
      this.currentCrypto = 'azure';
    }

    // to come: more flexible ways of configuring multiple keys
  }

  /**
   * Get the current key, to be used for encryption. This double
   * checks that the key is built for the given algorithm.  The
   * result is the raw key material.  Throws an exception if no
   * key is available, to avoid accidentally null-encrypting data.
   */
  currentCryptoKey(algo) {
    assert(this.currentCrypto, "no current key is configured");
    const key = this.getCryptoKey(this.currentCrypto, algo);
    if (!key) {
      throw new Error('Current key not found');
    }
    return key;
  }

  /**
   * Get a key by key-id, returning undefined if not found. This
   * also checks the algorithm, failing if there is no match.
   */
  getCryptoKey(kid, algo) {
    const crypto = this.crypto.get(this.currentCrypto);
    if (!crypto) {
      return;
    }
    assert.equal(crypto.algo, algo, `key ${kid}'s algorithm is not ${algo}`);
    return crypto.key;
  }
}

module.exports = Keyring;
