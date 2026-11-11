import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  // The redefined function is exercised in db/test/fns/worker_manager_test.js
  // (`collect_launch_configs_if_exist` cases).
  // No schema migration in this version — function change only.
});
