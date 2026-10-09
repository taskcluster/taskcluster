import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  // The new function is exercised in db/test/fns/worker_manager_test.js
  // (`get_worker_manager_launch_config` cases).
  // No schema migration in this version — function-add only.
});
