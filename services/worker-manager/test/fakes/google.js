import { FakeCloud } from './fake.js';
import { strict as assert } from 'assert';
import slugid from 'slugid';
import google from '@googleapis/compute';
import gcpIam from '@googleapis/iam';

const WORKER_SERVICE_ACCOUNT_ID = '12345';
const PROJECT = 'testy';

/**
 * Fake the Google SDK.
 *
 * This fakes `google.auth`, `google.compute`, where `google` is imported from the
 * `@googleapis/compute` package.  The results of the fake `google.compute()` and
 * `gcpIam.iam()` calls are `fake.compute` and `fake.iam`.
 *
 * The `google.auth.OAuth2` class is defined by the `FakeOAuth2` class below, and
 * the instance returned from the constructor is available at `fake.oauth2`.
 */
export class FakeGoogle extends FakeCloud {
  constructor() {
    super();
  }

  _patch() {
    this.sinon.stub(google, 'auth');
    google.auth.fromJSON = creds => {
      assert.equal(creds.client_id, 'fake-creds');
      return { fake: true };
    };

    // OAuth2 must be a constructor, so we have to use `function` here, but
    // we want to refer to the FakeGoogle instance.
    const self = this;
    google.auth.OAuth2 = function() {
      return self.oauth2;
    };

    this.sinon.stub(google, 'compute').callsFake(({ version, auth }) => {
      assert.equal(version, 'v1');
      assert(auth.fake);
      assert.deepEqual(auth.scopes, [
        'https://www.googleapis.com/auth/compute',
        'https://www.googleapis.com/auth/iam',
      ]);
      return this.compute;
    });

    this.sinon.stub(gcpIam, 'iam').callsFake(({ version, auth }) => {
      assert.equal(version, 'v1');
      assert(auth.fake);
      assert.deepEqual(auth.scopes, [
        'https://www.googleapis.com/auth/compute',
        'https://www.googleapis.com/auth/iam',
      ]);
      return this.iam;
    });

    this._reset();
  }

  _reset() {
    this.oauth2 = new FakeOAuth2();

    this.compute = {
      instances: new Instances(this),
      globalOperations: new Operations(this, 'global'),
      regionOperations: new Operations(this, 'region'),
      zoneOperations: new Operations(this, 'zone'),
    };

    this.iam = {
      projects: {
        serviceAccounts: new ServiceAccounts(this),
      },
    };
  }

  makeError(message, code) {
    const err = new Error(message);
    err.code = code;
    err.status = code;
    err.response = {
      data: {
        error: {
          code,
          message,
          errors: [{ message, code }],
        },
      },
    };
    err.errors = err.response.data.error.errors;
    return err;
  }
}

class FakeOAuth2 {
  verifyIdToken({ idToken, audience }) {
    if (!idToken || !audience) {
      throw new Error('Must provide both idToken and audience');
    }
    if (idToken === 'invalid') {
      throw new Error('Invalid Token');
    }
    const sub = idToken !== 'wrongSub' ? WORKER_SERVICE_ACCOUNT_ID : 'bad';
    const project_id = idToken !== 'wrongProject' ? PROJECT : 'bad';
    const instance_id = idToken !== 'wrongId' ? 'abc123' : 'bad';
    return {
      payload: {
        sub,
        google: {
          compute_engine: {
            project_id,
            instance_id,
          },
        },
      },
    };
  }
}

/**
 * The google `instances` API.
 *
 * Parameters passed to `insert` are stored in the array `insertCalls`.
 *
 * Set failFakeInsertWith to an error instance to have the next insert() call fail
 */
export class Instances {
  constructor(fake) {
    this.fake = fake;
    this.getCalls = 0;
    this.insertCalls = [];
    this.instances = new Map();
  }

  async get({ project, zone, instance }) {
    assert.equal(project, PROJECT);
    const key = `${zone}/${instance}`;
    const data = this.instances.get(key);
    if (!data) {
      throw this.fake.makeError('no such instance', 404);
    }
    return { data };
  }

  async insert(parameters) {
    this.fake.validate(parameters, 'google-instance.yml');
    assert.equal(parameters.project, PROJECT);
    this.insertCalls.push(parameters);
    if (this.failFakeInsertWith) {
      const err = this.failFakeInsertWith;
      this.failFakeInsertWith = undefined;
      throw err;
    }
    return {
      data: {
        // workerIds have a max length of 38
        targetId: `i-${parameters.requestBody.name}`.substring(0, 38),
        ...this.fake.compute.zoneOperations.fakeOperation({
          zone: parameters.zone,
          status: 'RUNNING',
        }),
      },
    };
  }

  async delete({ project, zone, instance }) {
    assert.equal(project, PROJECT);
    assert(zone);
    assert(instance);
    this.delete_called = true;
    const key = `${zone}/${instance}`;
    if (!this.instances.has(key)) {
      throw this.fake.makeError('no such instance', 404);
    }
    this.instances.delete(key);
    return {}; // provider ignores the return value
  }

  // fake utilities

  /**
   * Set an instance's status (creating it in the process)
   */
  setFakeInstanceStatus(project, zone, instance, status) {
    assert.equal(project, PROJECT);
    const key = `${zone}/${instance}`;
    this.instances.set(key, { status });
  }
}

export class ServiceAccounts {
  constructor(fake) {
    this.fake = fake;
  }

  async get({ name }) {
    const [_, proj, acct] = /^projects\/([^\/]*)\/serviceAccounts\/([^\/]*)$/.exec(name);
    return { data: { email: `${proj}-${acct}@example.com` } };
  }
}

export class Operations {
  constructor(fake, scope) {
    this.fake = fake;
    this.scope = scope;
    this.ops = new Map();
  }

  _key(options, name) {
    switch (this.scope) {
      case 'region':
        assert(options.region);
        assert(!options.zone);
        return `${options.region}-${name}`;
      case 'zone':
        assert(!options.region);
        assert(options.zone);
        return `${options.zone}-${name}`;
      case 'global':
        assert(!options.region);
        assert(!options.zone);
        return `${name}`;
    }
  }

  // https://cloud.google.com/compute/docs/reference/rest/v1/regionOperations
  async get({ project, operation, ...rest }) {
    assert.equal(project, PROJECT);
    const key = this._key(rest, operation);

    if (!this.ops.has(key)) {
      throw this.fake.makeError('not found', 404);
    }

    return { data: this.ops.get(key) };
  }

  // fake utilities

  /**
   * Create a fake operation.  Pass the appropriate one of zone, region, or
   * neither depending on the operation scope (zonal, regional, global).  This
   * will overwrite an existing operation.  This returns the operation.
   */
  fakeOperation({ zone, region, error, status = 'RUNNING' }) {
    const name = slugid.nice();
    const key = this._key({ zone, region }, name);

    if (error) {
      assert(Array.isArray(error.errors));
    }

    this.ops.set(key, { name, zone, status, error });

    return { name, zone };
  }

  /**
   * Return true if the given operation exists
   */
  fakeOperationExists({ zone, region, name }) {
    const key = this._key({ zone, region }, name);

    return this.ops.has(key);
  }
}
