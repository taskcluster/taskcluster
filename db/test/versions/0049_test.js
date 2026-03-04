import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function() {
  // this version only removes attributes from tables, which is tested in unit tests,
  // so there is nothing to test on upgrade
});
