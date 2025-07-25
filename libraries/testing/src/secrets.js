import _ from 'lodash';
import assert from 'assert';
import taskcluster from '@taskcluster/client';
import debugFactory from 'debug';
const debug = debugFactory('tc-lib-testing:secrets');

class Secrets {
  constructor({ secretName, secrets, load }) {
    this.secretName = Array.isArray(secretName) ? secretName : [secretName];
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
      debug('fetching test secrets');
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
          if (!cfg && this.load) {
            cfg = await this.load('cfg');
          }
          const value = _.get(cfg, secret.cfg);
          if (value !== undefined) {
            secret.value = value;
            debug(`got value for secret ${secret.name} from config`);
            continue;
          }
        }

        // otherwise use an env var, if present (possibly from the secrets service,
        // and thus not already present in cfg)
        if (secret.env) {
          const value = env[secret.env];
          if (value) {
            secret.value = value;
            debug(`got value for secret ${secret.name} from fetched secrets`);
            continue;
          }
        }

        debug(`no value for secret ${secret.name}`);
      }
    }

    // Remove variables from process.env, so that nothing can use them directly. In
    // particular, @taskcluster/client will happiliy use TASKCLUSTER_* from the env,
    // allowing bugs to slip through where the values are not passed explicitly
    for (let name of Object.keys(this.secrets)) {
      for (let secret of this.secrets[name]) {
        if (secret.env) {
          debug(`removing $${secret.env} from environment`);
          delete process.env[secret.env];
        }
      }
    }

    this._setupComplete = true;
  }

  async _fetchSecrets() {
    const secrets = {};

    const client = new taskcluster.Secrets({ rootUrl: process.env.TASKCLUSTER_PROXY_URL });
    for (let secretName of this.secretName) {
      try {
        const res = await client.get(secretName);
        Object.assign(secrets, res.secret);
      } catch (err) {
        debug(`Error fetching secret ${secretName}; ignoring`);
      }
    }

    return secrets;
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

    // if no secrets are required, just run this as a regular suite with no "(real)" suffix
    if (secretList.length === 0) {
      suite(title, function() {
        suiteSetup(async function() {
          if (that.load) {
            that.load.save();
          }
        });

        fn.call(this, false, () => skipping);

        suiteTeardown(function() {
          if (that.load) {
            that.load.restore();
          }
        });
      });
      return;
    }

    if (secretList.some(n => ! this.secrets[n])) {
      throw new Error(`Unknown secrets in ${JSON.stringify(secretList)}`);
    }

    suite(`${title} (mock)`, function() {
      suiteSetup(async function() {
        skipping = false;
        await that.setup();
        if (that.load) {
          that.load.save();

          // update the loader's cfg with `mock` default values
          secretList.forEach(name => {
            that.secrets[name].forEach(secret => {
              if (secret.cfg && secret.mock) {
                that.load.cfg(secret.cfg, secret.mock);
              }
            });
          });
        }
      });

      fn.call(this, true, () => skipping);

      suiteTeardown(function() {
        if (that.load) {
          that.load.restore();
        }
      });
    });

    suite(`${title} (real)`, function() {
      let saveOccured = false;
      suiteSetup(async function() {
        await that.setup();
        const missing = secretList.filter(name => !that.have(name));
        if (missing.length) {
          if (process.env.NO_TEST_SKIP) {
            throw new Error(`secrets missing and NO_TEST_SKIP is set: ${missing.join(' ')}`);
          }
          skipping = true;
          this.skip();
        } else {
          skipping = false;
        }

        if (that.load) {
          that.load.save();
          saveOccured = true;
          // update the loader's cfg for every secret that has a cfg property; this will be restored
          // by the `load.restore()` in suiteTeardown.
          secretList.forEach(name => {
            that.secrets[name].forEach(secret => {
              if (secret.cfg) {
                that.load.cfg(secret.cfg, secret.value);
              }
            });
          });
        }
      });

      fn.call(this, false, () => skipping);

      suiteTeardown(function() {
        if (saveOccured) {
          that.load.restore();
        }
      });
    });
  }
}

export default Secrets;
