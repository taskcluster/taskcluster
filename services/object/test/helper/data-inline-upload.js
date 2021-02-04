const taskcluster = require('taskcluster-client');
const crypto = require('crypto');
const assert = require('assert');
const helper = require('../helper');

/**
 * Test the data-inline upload method on the given backend.  This defines a suite
 * of tests.
 */
exports.testDataInlineUpload = ({
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
  suite(`data-inline upload method API${title ? `: ${title}` : ''}`, function() {
    (suiteDefinition || (() => {})).call(this);

    let backend;
    suiteSetup(async function() {
      const backends = await helper.load('backends');
      backend = backends.get(backendId);
    });

    test('upload an object', async function() {
      const data = crypto.randomBytes(256);
      const name = `${prefix}test!obj%ect/slash`;
      const expires = taskcluster.fromNow('1 hour');
      const uploadId = taskcluster.slugid();

      await helper.db.fns.create_object_for_upload(name, 'test-proj', backendId, uploadId, expires, {}, expires);
      const [object] = await helper.db.fns.get_object_with_upload(name);

      const res = await backend.createUpload(object, {
        dataInline: { contentType: 'application/random-bytes', objectData: data.toString('base64') },
      });
      assert.deepEqual(res, { dataInline: true });

      await helper.db.fns.object_upload_complete(name, uploadId);

      const stored = await getObjectContent({ name });
      assert.equal(stored.contentType, 'application/random-bytes');
      assert.deepEqual(stored.data, data);
    });
  });
};
