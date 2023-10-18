import assert from 'assert';

class Keyring {
  /**
   * Construct a new keyring from a service's configuration.
   */
  constructor({ azureCryptoKey, dbCryptoKeys }) {
    this.crypto = new Map();
    this.currentCrypto = undefined;

    const algos = {
      'aes-256': ({ id, key }) => {
        key = Buffer.from(key, 'base64');
        assert.equal(key.length, 32, `aes-256 key must be 32 bytes in base64 in ${id}`);
        return key;
      },
    };

    // Azure-compatible configuration format
    if (azureCryptoKey) {
      this.crypto.set('azure', { algo: 'aes-256', key: algos['aes-256']({ id: 'azure', key: azureCryptoKey }) });
      this.currentCrypto = 'azure';
    }

    // Our standard postgres keys. Anything in here will be considered more current than azure keys.
    // A key here with the name `azure` will override `azureCryptoKey`.
    if (dbCryptoKeys) {
      for (const { id, algo, key } of dbCryptoKeys) {
        assert(id, 'Keyring crypto keys must have `id`');
        assert(algo, 'Keyring crypto keys must have `algo`');
        assert(key, 'Keyring crypto keys must have `key`');
        if (!Object.keys(algos).includes(algo)) {
          throw new Error(`Keyring crypto keys algo must be in ${Object.keys(algos)}. Got ${algo} for ${id}`);
        }
        this.crypto.set(id, { algo, key: algos[algo]({ id, key }) });
        this.currentCrypto = id;
      }
    }
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
    return { id: this.currentCrypto, key };
  }

  /**
   * Get a key by key-id, returning undefined if not found. This
   * also checks the algorithm, failing if there is no match.
   */
  getCryptoKey(kid, algo) {
    const crypto = this.crypto.get(kid);
    if (!crypto) {
      throw new Error(`Crypto key not found: \`${kid}\``);
    }
    assert.equal(crypto.algo, algo, `key ${kid}'s algorithm is not ${algo}`);
    return crypto.key;
  }
}

export default Keyring;
