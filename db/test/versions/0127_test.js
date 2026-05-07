import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function() {
  // The new keyset-paginated function is exercised in
  // db/test/fns/auth_test.js (`get_clients_after` cases).
  // No schema migration in this version — function-add only.
});
