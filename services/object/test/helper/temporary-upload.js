const taskcluster = require('taskcluster-client');
const crypto = require('crypto');
const assert = require('assert');
const helper = require('../helper');

/**
 * Test the temporary upload API on the given backend.  This defines a suite
 * of tests.
 */
exports.testTemporaryUpload = ({
  mock, skipping,

  // optional title suffix
  title,

  // a prefix for object names, so that concurrent runs do not modify the
  // same objects in the "real" storage backend
  prefix,

  // the backend to test; this will be loaded from the loader, so its configuration
  // should be set up in suiteSetup.
  backendId,

  // an async function({name}) to get the data for a given object.
  getObjectContent,

  // suiteDefinition defines the suite; add suiteSetup, suiteTeardown here, if
  // necessary, and any extra tests
}, suiteDefinition) => {
  suite(`temporary upload API${title ? `: ${title}` : ''}`, function() {
    (suiteDefinition || (() => {})).call(this);

    let backend;
    suiteSetup(async function() {
      const backends = await helper.load('backends');
      backend = backends.get(backendId);
    });

    test('upload an object', async function() {
      const data = crypto.randomBytes(256);
      const name = `${prefix}test!obj%ect/slash`;

      await helper.db.fns.create_object(name, 'test-proj', backendId, {}, taskcluster.fromNow('1 hour'));
      const [object] = await helper.db.fns.get_object(name);

      await backend.temporaryUpload(object, data);

      const stored = await getObjectContent({ name });
      assert.deepEqual(stored, data);
    });
  });
};
