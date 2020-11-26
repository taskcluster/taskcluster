const request = require('superagent');
const crypto = require('crypto');
const assert = require('assert');
const helper = require('../helper');

/**
 * Test the simple download method on the given backend.  This defines a suite
 * of tests.
 */
exports.testSimpleDownloadMethod = ({
  mock, skipping,

  // optional title suffix
  title,

  // a prefix for object names, so that concurrent runs do not modify the
  // same objects in the "real" storage backend
  prefix,

  // the backend to test; this will be loaded from the loader, so its configuration
  // should be set up in suiteSetup.
  backendId,

  // an async function({name, object}) to make an object with the given name
  // containing the given data, simulating an upload. It's up to the caller to clean
  // these up in a `teardown` handler.
  makeObject,

  // an optional async function({name, url}) to verify that the correct URL was
  // returned for the object with the given name
  checkUrl = () => {},

  // suiteDefinition defines the suite; add suiteSetup, suiteTeardown here, if
  // necessary, and any extra tests
}, suiteDefinition) => {
  suite(`simple download method${title ? `: ${title}` : ''}`, function() {
    (suiteDefinition || (() => {})).call(this);

    let backend;
    suiteSetup(async function() {
      const backends = await helper.load('backends');
      backend = backends.get(backendId);
    });

    test('supports simple downloads', async function() {
      const data = crypto.randomBytes(256);
      const name = `${prefix}test!obj%ect/slash`;
      const object = await makeObject({ name, data });

      // check it's supported..
      const methods = await backend.availableDownloadMethods(object);
      assert(methods.includes('simple'));

      // call the backend
      const { method, url } = await backend.downloadObject(object, 'simple', true);
      assert.equal(method, 'simple');
      checkUrl({ name, url });

      // fetch the data at that URL and check that it matches
      const fetched = await request.get(url).responseType('blob');
      assert.deepEqual(fetched.body, data);
    });
  });
};
