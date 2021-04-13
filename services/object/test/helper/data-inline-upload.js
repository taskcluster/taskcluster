const taskcluster = require('taskcluster-client');
const crypto = require('crypto');
const assert = require('assert');
const helper = require('../helper');

const responseSchema = 'https://tc-testing.example.com/schemas/object/v1/create-upload-response.json#/properties/uploadMethod';

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

  // an async function({ name }) to get { data, contentType, contentDisposition }
  getObjectContent,

  // omit testing certain functionality that's not supported on this backend; options:
  // - htmlContentDisposition -- enforcing content-disposition for text/html objects
  omit = [],

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

    const createUpload = async ({ name, data, proposedUploadMethods }) => {
      const expires = taskcluster.fromNow('1 hour');
      const uploadId = taskcluster.slugid();

      await helper.db.fns.create_object_for_upload(name, 'test-proj', backendId, uploadId, expires, {}, expires);
      const [object] = await helper.db.fns.get_object_with_upload(name);

      return await backend.createUpload(object, proposedUploadMethods);
    };

    for (const length of [0, 1024]) {
      test(`upload an object (length=${length})`, async function() {
        const data = crypto.randomBytes(length);
        const name = helper.testObjectName(prefix);

        const res = await createUpload({
          name, data,
          proposedUploadMethods: {
            dataInline: { contentType: 'application/random-bytes', objectData: data.toString('base64') },
          },
        });

        await helper.assertSatisfiesSchema(res, responseSchema);
        assert.deepEqual(res, { dataInline: true });

        await helper.db.fns.object_upload_complete(name, res.uploadId);

        const stored = await getObjectContent({ name });
        assert.equal(stored.contentType, 'application/random-bytes');
        assert.deepEqual(stored.data, data);
      });
    }

    if (!omit.includes('htmlContentDisposition')) {
      test(`upload of type text/html has attachment disposition`, async function() {
        const data = crypto.randomBytes(256);
        const name = helper.testObjectName(prefix);

        const res = await createUpload({
          name, data,
          proposedUploadMethods: {
            dataInline: { contentType: 'text/html; charset=latin-1', objectData: data.toString('base64') },
          },
        });

        await helper.assertSatisfiesSchema(res, responseSchema);
        assert.deepEqual(res, { dataInline: true });

        await helper.db.fns.object_upload_complete(name, res.uploadId);

        const stored = await getObjectContent({ name });
        assert.equal(stored.contentType, 'text/html; charset=latin-1');
        assert.equal(stored.contentDisposition, 'attachment');
        assert.deepEqual(stored.data, data);
      });
    }
  });
};
