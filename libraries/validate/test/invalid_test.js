suite('Invalid Schema Tests', () => {
  let assert = require('assert');
  let validator = require('../');
  let debug = require('debug')('test');
  let libUrls = require('taskcluster-lib-urls');

  test('invalid schema throws error', async () => {
    try {
      let validate = await validator({
        folder: 'test/invalid-schemas',
        rootUrl: libUrls.testRootUrl(),
        serviceName: 'whatever',
        version: 'v1',
      });
      return assert(false, 'Bad schema should\'ve thrown an exception!');
    } catch (e) {
      debug('Bad schema has thrown an exception correctly.');
    }
  });

});
