const { Backend } = require('./base');

/**
 * The test backend type is only available when running tests.
 */
class TestBackend extends Backend {
  getDetails(name) {
    return {
      protocol: 'HTTP:GET',
      details: {
        url: 'https://google.ca',
      },
    };
  }
}

module.exports = { TestBackend };
