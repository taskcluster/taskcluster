const { Backend } = require('./base');

/**
 * The test backend type is only available when running tests.
 */
class TestBackend extends Backend {
}

module.exports = { TestBackend };
