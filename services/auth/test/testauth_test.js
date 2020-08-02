const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

const credentials = {
  clientId: 'tester',
  accessToken: 'no-secret',
};

const badcreds = {
  clientId: 'tester',
  accessToken: 'wrong',
};

suite(testing.suiteName(), function() {
  helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
    helper.withDb(mock, skipping);
    helper.withCfg(mock, skipping);
    helper.withPulse(mock, skipping);
    helper.withServers(mock, skipping);
    helper.resetTables(mock, skipping);

    let testAuth = (name, {config, requiredScopes, clientScopes, errorCode}) => {
      test(name, async () => {
        let auth = new helper.AuthClient(config);
        await auth.testAuthenticate({requiredScopes, clientScopes}).then(() => {
          assert(!errorCode, 'Request was successful, but expected an error ' +
                             'with code: ' + errorCode);
        }, err => {
          assert(errorCode, 'Request failed!');
          assert(err.code === errorCode, 'Expected error with code: ' +
                                         errorCode + ' but got: ' + err.code);
        });
      });
    };

    testAuth('valid creds', {
      config: {rootUrl: helper.rootUrl, credentials},
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:test'],
    });

    testAuth('valid creds (star scope)', {
      config: {rootUrl: helper.rootUrl, credentials},
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:*'],
    });

    testAuth('valid creds (scope subset)', {
      config: {rootUrl: helper.rootUrl, credentials},
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:test1', 'test-scope:test2'],
    });

    testAuth('invalid creds (scope subset)', {
      config: {rootUrl: helper.rootUrl, credentials},
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:test1', 'test-scope:test2'],
    });

    testAuth('invalid creds', {
      config: {rootUrl: helper.rootUrl, credentials: badcreds},
      requiredScopes: ['test-scope'],
      clientScopes: ['test-scope'],
      errorCode: 'AuthenticationFailed',
    });

    testAuth('insufficientScopes', {
      config: {rootUrl: helper.rootUrl, credentials},
      requiredScopes: ['test-scope:*'],
      clientScopes: ['test-scope'],
      errorCode: 'InsufficientScopes',
    });

    testAuth('authorizedScopes', {
      config: {rootUrl: helper.rootUrl, credentials, authorizedScopes: ['test-scope:test']},
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:*'],
    });

    testAuth('authorizedScopes InsufficientScopes', {
      config: {rootUrl: helper.rootUrl, credentials, authorizedScopes: ['test-scope:test1']},
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:*'],
      errorCode: 'InsufficientScopes',
    });

    testAuth('authorizedScopes over-scoped', {
      config: {rootUrl: helper.rootUrl, credentials, authorizedScopes: ['test-scope:*']},
      requiredScopes: ['test-scope:test2'],
      clientScopes: ['test-scope:test2'],
      errorCode: 'AuthenticationFailed',
    });

    testAuth('authorizedScopes badcreds', {
      config: {rootUrl: helper.rootUrl, credentials: badcreds, authorizedScopes: ['test-scope:test']},
      requiredScopes: ['test-scope:test'],
      clientScopes: ['test-scope:*'],
      errorCode: 'AuthenticationFailed',
    });
  });

  helper.secrets.mockSuite('testAuthGet', ['azure', 'gcp'], function(mock, skipping) {
    helper.withDb(mock, skipping);
    helper.withCfg(mock, skipping);
    helper.withPulse(mock, skipping);
    helper.withServers(mock, skipping);
    helper.resetTables(mock, skipping);

    let testAuthGet = (name, {config, errorCode}) => {
      test(name, async () => {
        let auth = new helper.AuthClient(config);
        await auth.testAuthenticateGet().then(() => {
          assert(!errorCode, 'Request was successful, but expected an error ' +
                             'with code: ' + errorCode);
        }, err => {
          assert(errorCode, 'Request failed!');
          assert(err.code === errorCode, 'Expected error with code: ' +
                                         errorCode + ' but got: ' + err.code);
        });
      });
    };

    testAuthGet('valid creds', {
      config: {rootUrl: helper.rootUrl, credentials},
    });

    testAuthGet('invalid creds', {
      config: {rootUrl: helper.rootUrl, credentials: badcreds},
      errorCode: 'AuthenticationFailed',
    });

    testAuthGet('authorizedScopes', {
      config: {
        rootUrl: helper.rootUrl,
        credentials,
        authorizedScopes: ['test:scopes-abc'],
      },
      errorCode: 'InsufficientScopes',
    });
  });
});
