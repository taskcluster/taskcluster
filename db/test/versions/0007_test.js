const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  // this version only redefines methods, which were tested in unit tests,
  // until taskcluster-lib-entities was dropped, so there is nothing to test
  // on upgrade
});
