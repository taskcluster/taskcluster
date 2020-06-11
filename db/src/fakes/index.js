const assert = require('assert').strict;
const fs = require('fs');
const {WRITE} = require('taskcluster-lib-postgres');
const crypto = require('crypto');

const COMPONENT_CLASSES = [];

fs.readdirSync(`${__dirname}/`).forEach(file => {
  if (file !== 'index.js' && file.match(/\.js$/)) {
    const name = file.slice(0, -3);
    const cls = require(`./${file}`);
    COMPONENT_CLASSES.push({name, cls});
  }
});

/**
 * A FakeDatabase has working `db.fns.<name>` methods that do not actually
 * access a database, making it possible to test most of Taskcluster without a
 * DB.
 *
 * An instance of each of the component classes is available as an instance property,
 * providing access to various helpers like `db.secrets.makeSecret`.
 */
class FakeDatabase {
  constructor({schema, serviceName, keyring}) {
    const allMethods = schema.allMethods();
    this.keyring = keyring;
    this.fns = {};
    this.deprecatedFns = {};

    COMPONENT_CLASSES.forEach(({name, cls}) => {
      const instance = new cls({schema, serviceName});
      this[name] = instance;

      allMethods.forEach(({ name: methodName, mode, serviceName: fnServiceName, deprecated }) => {
        if (instance[methodName]) {
          let collection = this.fns;
          if (deprecated) {
            collection = this.deprecatedFns;
          }
          collection[methodName] = async (...args) => {
            if (serviceName !== fnServiceName && mode === WRITE) {
              throw new Error(
                `${serviceName} is not allowed to call any methods that do not belong to this service and which have mode=WRITE`,
              );
            }
            return instance[methodName].apply(instance, args);
          };
        }
      });
    });
  }

  encrypt({value}) {
    assert(value instanceof Buffer, 'Encrypted values must be Buffers');
    const {id, key} = this.keyring.currentCryptoKey('aes-256');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const c1 = cipher.update(value);
    const c2 = cipher.final();

    return {
      kid: id,
      v: 0,
      __bufchunks_val: 1,
      __buf0_val: Buffer.concat([iv, c1, c2]).toString('base64'),
    };
  }

  decrypt({value}) {
    const key = this.keyring.getCryptoKey(value.kid, 'aes-256');

    const n = value['__bufchunks_val'];
    const chunks = [];
    for (let i = 0; i < n; i++) {
      chunks[i] = Buffer.from(value['__buf' + i + '_val'], 'base64');
    }
    const buffer = Buffer.concat(chunks);

    const iv = buffer.slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const b1 = decipher.update(buffer.slice(16));
    const b2 = decipher.final();

    return Buffer.concat([b1, b2]);
  }

  async close() {
  }
}

module.exports = {FakeDatabase};
