suite('Statsum', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');
  let config = require('typed-env-config');

  let monitor = null;
  let cfg = config();

  suiteSetup(async () => {
    monitor = await monitoring({
      project: 'tc-lib-monitor',
      credentials: cfg.taskcluster.credentials,
      patchGlobal: false,
    });
  });

  test('should blah blah', function () {
  });

});
