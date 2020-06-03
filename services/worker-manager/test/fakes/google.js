const {FakeCloud} = require('./fake');
const assert = require('assert').strict;
const {google} = require('googleapis');

const WORKER_SERVICE_ACCOUNT_ID = '12345';
const PROJECT = 'testy';

/**
 * Fake the Google SDK.
 *
 * This fakes `google.auth`, `google.compute`, where `google` is imported from the
 * `googleapis` package.  The results of the fake `google.compute()` and
 * `google.iam()` calls are `fake.compute` and `fake.iam`.
 *
 * The `google.auth.OAuth2` class is defined by the `FakeOAuth2` class below, and
 * the instance returned from the constructor is available at `fake.oauth2`.
 */
class FakeGoogle extends FakeCloud {
  constructor() {
    super();
  }

  _patch() {
    this.sinon.stub(google, 'auth');
    google.auth.fromJSON = creds => {
      assert.equal(creds.client_id, 'fake-creds');
      return {fake: true};
    };

    // OAuth2 must be a constructor, so we have to use `function` here, but
    // we want to refer to the FakeGoogle instance.
    const self = this;
    google.auth.OAuth2 = function() {
      return self.oauth2;
    };

    this.sinon.stub(google, 'compute').callsFake(({version, auth}) => {
      assert.equal(version, 'v1');
      assert(auth.fake);
      assert.deepEqual(auth.scopes, [
        'https://www.googleapis.com/auth/compute',
        'https://www.googleapis.com/auth/iam',
      ]);
      return this.compute;
    });

    this.sinon.stub(google, 'iam').callsFake(({version, auth}) => {
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
}

class FakeOAuth2 {
  verifyIdToken({idToken, audience}) {
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

const makeError = (message, code) => {
  const err = new Error(message);
  err.code = code;
  err.errors = [{message}];
  return err;
};

class Instances {
  constructor(fake) {
    this.fake = fake;
    this.getCalls = 0;
    this.insertCalls = 0;
  }

  async get() {
    switch (this.getCalls++) {
      case 0:
        return {
          data: {
            status: 'RUNNING',
          },
        };
      case 1:
        return {
          data: {
            status: 'STOPPED',
          },
        };
    }
  }

  async insert() {
    // TODO: validate input
    switch (this.insertCalls++) {
      case 0:
        return {
          data: {
            targetId: '123', // This is the instanceId
            name: 'foo',
            zone: 'whatever/a',
          },
        };
      case 1:
        throw makeError('something went wrong');
      case 2:
        throw makeError('whatever', 403);
      case 3:
        return {
          data: {
            targetId: '456', // This is the instanceId
            name: 'foo',
            zone: 'whatever/a',
          },
        };
    }
  }

  async delete() {
    this.delete_called = true;
    return {
      // TODO: no data:?
      name: 'bar',
      zone: 'whatever/a',
    };
  }
}

class ServiceAccounts {
  constructor(fake) {
    this.fake = fake;
  }

  async get({name}) {
    // TODO: more
    return {data: 12345};
  }
}

class Operations {
  constructor(fake, scope) {
    this.fake = fake;
    this.scope = scope;
  }

  // TODO: apparently not tested?
}

exports.FakeGoogle = FakeGoogle;
