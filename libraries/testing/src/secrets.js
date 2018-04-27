const _ = require('lodash');
const assert = require('assert');
const taskcluster = require('taskcluster-client');

class Secrets {
  constructor({secretName, secrets, load}) {
    this.secretName = secretName;
    this.secrets = secrets;
    this.load = load;
  }

  async setup() {
    if (this._setupComplete) {
      return;
    }
    let cfg;

    // load secrets, if running in a task
    let env = Object.assign({}, process.env);
    if (process.env.TASK_ID) {
      Object.assign(env, await this._fetchSecrets());
    }

    // find a value for each secret
    for (let name of Object.keys(this.secrets)) {
      for (let secret of this.secrets[name]) {
        if (!secret.name) {
          secret.name = secret.env;
        }
        assert(secret.name, `secret ${JSON.stringify(secret)} has no name`);

        // prefer to use a value already in cfg
        if (secret.cfg) {
          // delay loading cfg until we know we need it (allowing this to work with
          // loaders that do not have a `cfg` component); note that this also ensures
          // later calls to load.cfg(..) will work.
          if (!cfg) {
            cfg = await this.load('cfg');
          }
          const value = _.get(cfg, secret.cfg);
          if (value !== undefined) {
            secret.value = value;
            continue;
          }
        }

        // otherwise use an env var, if present (possibly from the secrets service,
        // and thus not already present in cfg)
        if (secret.env) {
          const value = env[secret.env];
          if (value) {
            secret.value = value;
            continue;
          }
        }
      }
    }

    this._setupComplete = true;
  }

  async _fetchSecrets() {
    const secretsService = new taskcluster.Secrets({
      baseUrl: 'http://taskcluster/secrets.taskcluster.net/v1',
    });
    return (await secretsService.get(this.secretName)).secrets;
  }

  have(secret) {
    assert(this._setupComplete, 'must call secrets.setup() in a setup function first, or use mockSuite');
    assert(this.secrets[secret], `no such secret ${secret}`);
    const secrets = this.secrets[secret];
    return secrets.every(secret => 'value' in secret);
  }

  get(secret) {
    assert(this._setupComplete, 'must call secrets.setup() in a setup function first, or use mockSuite');
    assert(this.secrets[secret], `no such secret ${secret}`);
    const secrets = this.secrets[secret];
    const result = {};

    secrets.forEach(secret => {
      assert('value' in secret, `no value found for secret ${secret.name}`);
      result[secret.name] = secret.value;
    });

    return result;
  }

  mockSuite(title, secretList, fn) {
    const that = this;
    let skipping = false;

    suite(`${title} (mock)`, function() {
      suiteSetup(async function() {
        skipping = false;
        await that.setup();
        that.load.save();
      });

      fn.call(this, true, () => skipping);

      suiteTeardown(function() {
        that.load.restore();
      });
    });

    suite(`${title} (real)`, function() {
      suiteSetup(async function() {
        await that.setup();
        that.load.save();

        if (!secretList.every(name => that.have(name))) {
          if (process.env.NO_TEST_SKIP) {
            throw new Error(`secrets missing and NO_TEST_SKIP is set: ${secretList.join(' ')}`);
          }
          skipping = true;
          this.skip();
        } else {
          skipping = false;
        }

        // update the loader's cfg for every secret that has a cfg property; this will be restored
        // by the `load.restore()` in suiteTeardown.
        secretList.forEach(name => {
          that.secrets[name].forEach(secret => {
            if (secret.cfg) {
              that.load.cfg(secret.cfg, secret.value);
            }
          });
        });
      });

      fn.call(this, false, () => skipping);

      suiteTeardown(function() {
        that.load.restore();
      });
    });
  }
}

module.exports = Secrets;
