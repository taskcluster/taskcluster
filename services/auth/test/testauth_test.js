import assert from 'node:assert';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

const credentials = {
  clientId: 'tester',
  accessToken: 'no-secret',
};

const badcreds = {
  clientId: 'tester',
  accessToken: 'wrong',
};

suite(testing.suiteName(), () => {
  helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], (mock, skipping) => {
    helper.withDb(mock, skipping);
    helper.withCfg(mock, skipping);
    helper.withPulse(skipping);
    helper.withServers(skipping);
    helper.resetTables();

    const testAuth = (name, { config, requiredScopes, clientScopes, errorCode }) => {
      test(name, async () => {
        // helper.rootUrl is assigned in withServers suiteSetup; read it at test time
        const auth = new helper.AuthClient({ ...config, rootUrl: helper.rootUrl });
        await auth.testAuthenticate({ requiredScopes, clientScopes }).then(
          () => {
            assert(!errorCode, `Request was successful, but expected an error with code: ${errorCode}`);
          },
          err => {
            assert(errorCode, 'Request failed!');
            assert(err.code === errorCode, `Expected error with code: ${errorCode} but got: ${err.code}`);
          }
        );
      });
    };

    testAuth('valid creds', {
      config: { credentials },
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:test'],
    });

    testAuth('valid creds (star scope)', {
      config: { credentials },
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:*'],
    });

    testAuth('valid creds (scope subset)', {
      config: { credentials },
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:test1', 'test-scope:test2'],
    });

    testAuth('invalid creds (scope subset)', {
      config: { credentials },
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:test1', 'test-scope:test2'],
    });

    testAuth('invalid creds', {
      config: { credentials: badcreds },
      requiredScopes: ['test-scope'],
      clientScopes: ['test-scope'],
      errorCode: 'AuthenticationFailed',
    });

    testAuth('insufficientScopes', {
      config: { credentials },
      requiredScopes: ['test-scope:*'],
      clientScopes: ['test-scope'],
      errorCode: 'InsufficientScopes',
    });

    testAuth('authorizedScopes', {
      config: { credentials, authorizedScopes: ['test-scope:test'] },
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:*'],
    });

    testAuth('authorizedScopes InsufficientScopes', {
      config: { credentials, authorizedScopes: ['test-scope:test1'] },
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:*'],
      errorCode: 'InsufficientScopes',
    });

    testAuth('authorizedScopes over-scoped', {
      config: { credentials, authorizedScopes: ['test-scope:*'] },
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:test2'],
      errorCode: 'AuthenticationFailed',
    });

    testAuth('authorizedScopes badcreds', {
      config: { credentials: badcreds, authorizedScopes: ['test-scope:test'] },
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:*'],
      errorCode: 'AuthenticationFailed',
    });
  });

  helper.secrets.mockSuite('testAuthGet', ['azure', 'gcp'], (mock, skipping) => {
    helper.withDb(mock, skipping);
    helper.withCfg(mock, skipping);
    helper.withPulse(skipping);
    helper.withServers(skipping);
    helper.resetTables();

    const testAuthGet = (name, { config, errorCode }) => {
      test(name, async () => {
        const auth = new helper.AuthClient({ ...config, rootUrl: helper.rootUrl });
        await auth.testAuthenticateGet().then(
          () => {
            assert(!errorCode, `Request was successful, but expected an error with code: ${errorCode}`);
          },
          err => {
            assert(errorCode, 'Request failed!');
            assert(err.code === errorCode, `Expected error with code: ${errorCode} but got: ${err.code}`);
          }
        );
      });
    };

    testAuthGet('valid creds', {
      config: { credentials },
    });

    testAuthGet('invalid creds', {
      config: { credentials: badcreds },
      errorCode: 'AuthenticationFailed',
    });

    testAuthGet('authorizedScopes', {
      config: {
        credentials,
        authorizedScopes: ['test:scopes-abc'],
      },
      errorCode: 'InsufficientScopes',
    });
  });
});
