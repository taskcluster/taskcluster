import { strict as assert } from 'assert';
import helper from './helper/index.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withMiddleware(mock, skipping, [
    { 'middlewareType': 'test', startDownload: { intercept: 'dl' } },
    { 'middlewareType': 'test', download: { intercept: 'simple' } },
  ]);

  test('calls middleware for startDownloadRequest', async function() {
    const middleware = await helper.load('middleware');

    let reply;
    const res = { reply: x => reply = x };
    const object = { name: 'dl/intercept' };

    assert(!(await middleware.startDownloadRequest({}, res, object, 'meth', {})));
    assert.deepEqual(reply, { method: 'simple', url: 'http://intercepted' });
  });

  test('calls middleware for downloadRequest', async function() {
    const middleware = await helper.load('middleware');

    let redirect;
    const res = { redirect: (x, y) => redirect = [x, y] };
    const object = { name: 'simple/intercept' };

    assert(!(await middleware.downloadRequest({}, res, object)));
    assert.deepEqual(redirect, [303, 'http://intercepted']);
  });
});
