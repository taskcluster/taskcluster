const assert = require('assert');

class FakeSecrets {
  constructor() {
    this.secrets = new Map();
  }

  /* helpers */

  reset() {
    this.secrets = new Map();
  }

  addSecret(name, secret, expires) {
    assert(typeof name === "string");
    assert(typeof secret === "string");
    assert(expires instanceof Date);
    this.secrets.set(name, {secret, expires});
  }

  /* fake procs */

  async get_secret(name) {
    if (this.secrets.has(name)) {
      const secret = this.secrets.get(name);
      return [{secret: secret.secret}];
    } else {
      return [];
    }
  }

  async get_secret_with_expires(name) {
    if (this.secrets.has(name)) {
      const secret = this.secrets.get(name);
      return [{secret: secret.secret, expires: secret.expires}];
    } else {
      return [];
    }
  }

  async list_secrets() {
    return [...this.secrets.keys()].map(name => ({name}));
  }

  async list_secrets_with_expires() {
    return [...this.secrets.entries()].map(([name, {expires}]) => ({name, expires}));
  }

  async remove_secret(name) {
    if (this.secrets.has(name)) {
      this.secrets.delete(name);
    }
  }

  async set_secret_with_expires(name, secret, expires) {
    assert(typeof name === "string");
    assert(typeof secret === "string");
    assert(expires instanceof Date);
    this.secrets.set(name, {secret, expires});
  }
}

module.exports = FakeSecrets;
