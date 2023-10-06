import assert from 'assert';
import { APIBuilder } from '../';
import testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  test('middleware is exported', function() {
    assert(APIBuilder.middleware);
  });
});
