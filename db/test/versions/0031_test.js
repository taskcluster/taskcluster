import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  // this version only adds/redefines methods, which is tested in unit tests,
  // so there is nothing to test on upgrade
});
