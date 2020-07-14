const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  // this version only redefines a method, which is tested in unit tests,
  // so there is nothing to test on upgrade
});
