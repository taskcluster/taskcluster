const assume = require('assume');
const errors = require('../lib/errors');

suite('errors', () => {
  test('should be able to create an error', () => {
    let error = new errors.InvalidProvider('errMsg', {prop1: 123});
    assume(error).has.property('code', 'InvalidProvider');
    assume(error.message).equals('errMsg');
    assume(error).has.property('prop1', 123);
    assume(error).has.property('stack');
    assume(error.constructor.name).equals('InvalidProvider');
    assume(() => {
      throw error;
    }).throws(errors.InvalidProvider);
  });
});
