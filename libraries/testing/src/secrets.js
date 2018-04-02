const _ = require('lodash');
const assert = require('assert');
const taskcluster = require('taskcluster-client');

class Secrets {
  constructor({secretName, secrets}) {
    this.secretName = secretName;
    this.secrets = secrets;
  }

  async setup(cfg) {
    let env = Object.assign({}, process.env);
    if (process.env.TASK_ID) {
      Object.assign(env, await this._fetchSecrets());
    }
    Object.keys(this.secrets).forEach(name => {
      this.secrets[name].forEach(secret => {
        if (!secret.name) {
          secret.name = secret.env;
        }
        assert(secret.name, `secret ${JSON.stringify(secret)} has no name`);

        // prefer to use a value already in cfg
        if (secret.cfg) {
          const value = _.get(cfg, secret.cfg);
          if (value) {
            secret.value = value;
            return;
          }
        }

        // otherwise use an env var, if present (possibly from the secrets service)
        if (secret.env) {
          const value = env[secret.env];
          if (value) {
            secret.value = value;
            // update that value in cfg, too.
            if (secret.cfg) {
              _.set(cfg, secret.cfg, value);
            }
            return;
          }
        }
      });
    });
  }

  async _fetchSecrets() {
    const secretsService = new taskcluster.Secrets({
      baseUrl: 'http://taskcluster/secrets.taskcluster.net/v1',
    });
    return (await secretsService.get(this.secretName)).secrets;
  }

  have(secret) {
    if (!this.secrets[secret]) {
      throw new Error(`no such secret ${secret}`);
    }
    const secrets = this.secrets[secret];
    return secrets.every(secret => !!secret.value);
  }

  get(secret) {
    if (!this.secrets[secret]) {
      throw new Error(`no such secret ${secret}`);
    }
    const secrets = this.secrets[secret];
    const result = {};

    secrets.forEach(secret => {
      if (!secret.value) {
        throw new Error(`no value found for secret ${secret.name}`);
      }
      result[secret.name] = secret.value;
    });

    return result;
  }

  mockSuite(title, secretList, fn) {
    const that = this;

    suite(`${title} (mock)`, function() {
      fn(true);
    });

    suite(`${title} (real)`, function() {
      suiteSetup(function() {
        if (!secretList.every(name => that.have(name))) {
          if (process.env.NO_SKIP_TESTS) {
            throw new Error(`secrets missing and NO_SKIP_TESTS is set: ${secretList.join(' ')}`);
          }
          this.skip();
        }
      });

      fn(false);
    });
  }
}

module.exports = Secrets;
