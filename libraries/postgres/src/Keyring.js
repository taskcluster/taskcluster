const assert = require('assert');

class Keyring {
  /**
   * Construct a new keyring from a service's configuration.
   */
  constructor({keys, kind}) {
    this.kind = kind;
    this.keys = new Map();
    this.current = undefined;

    for (const {id, algo, key} of keys) {
      assert(id, `${this.kind} key is missing 'id'`);
      assert(algo, `${this.kind} key ${id} is missing 'algo'`);
      assert(key, `${this.kind} key ${id} is missing 'key'`);
      this.keys.set(id, {algo, key: this.processKeyConfig({id, algo, key})});
      this.current = id;
    }
  }

  /**
   * Get the current key, to be used for encryption. This double
   * checks that the key is built for the given algorithm.  The
   * result is {id, algo, key}.  Throws an exception if no
   * key is available, to avoid accidentally null-encrypting data.
   */
  currentKey(algo) {
    assert(this.current, `no current ${this.kind} key is configured`);
    const key = this.getKey(this.current, algo);
    return {id: this.current, algo, key};
  }

  /**
   * Get a key by key-id, returning undefined if not found. This
   * also checks the algorithm, failing if there is no match. This
   * returns the raw key material.
   */
  getKey(kid, algo) {
    const k = this.keys.get(kid);
    if (!k) {
      throw new Error(`${this.kind} key not found: \`${kid}\``);
    }
    assert.equal(k.algo, algo, `key ${kid}'s algorithm is not ${algo}`);
    return k.key;
  }
}

class CryptoKeyring extends Keyring {
  constructor({azureCryptoKey, dbCryptoKeys}) {
    super({
      kind: 'crypto',
      keys: [
        // begin with the azure-compatible config..
        ...azureCryptoKey ? [{id: 'azure', key: azureCryptoKey, algo: 'aes-256'}] : [],
        // ..followed by the normal-style config
        ...dbCryptoKeys || [],
      ]});
  }

  processKeyConfig({id, algo, key}) {
    switch (algo) {
      case 'aes-256':
        key = Buffer.from(key, 'base64');
        assert.equal(key.length, 32, `aes-256 key must be 32 bytes in base64 in ${id}`);
        return key;

      default:
        throw new Error(`crypto key ${id} has invalid algo ${algo}`);
    }
  }
}

class SigningKeyring extends Keyring {
  constructor({azureSigningKey, dbSigningKeys}) {
    super({
      kind: 'signing',
      keys: [
        // begin with the azure-compatible config..
        ...azureSigningKey ? [{id: 'azure', key: azureSigningKey, algo: 'hmac-sha512'}] : [],
        // ..followed by the normal-style config
        ...dbSigningKeys || [],
      ]});
  }

  processKeyConfig({id, algo, key}) {
    switch (algo) {
      case 'hmac-sha512':
        assert.equal(typeof key, 'string', 'hmac-sha512 key must be a string');
        return Buffer.from(key, 'utf8');

      default:
        throw new Error(`crypto key ${id} has invalid algo ${algo}`);
    }
  }
}

module.exports = {CryptoKeyring, SigningKeyring};
