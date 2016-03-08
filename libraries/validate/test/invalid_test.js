suite('Invalid Schema Tests', () => {
  let assert = require('assert');
  let validator = require('../');
  let debug = require('debug')('test');

  test('invalid schema throws error', async (done) => {
    try {
      let validate = await validator({
        folder: 'test/invalid-schemas',
        baseUrl: 'http://localhost:1203/',
      });
      assert(false, 'Bad schema should\'ve thrown an exception!');
    } catch (e) {
      debug('Bad schema has thrown an exception correctly.');
    } finally {
      done();
    }
  });

});
