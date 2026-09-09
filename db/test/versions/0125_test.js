import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  // The new keyset-paginated function is exercised in
  // db/test/fns/worker_manager_test.js
  // (`get_non_stopped_workers_with_launch_config_scanner_after` cases).
  // No schema migration in this version — function-add only.
});
