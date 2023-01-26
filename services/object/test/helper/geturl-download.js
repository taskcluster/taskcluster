const request = require('superagent');
const crypto = require('crypto');
const assert = require('assert');
const helper = require('../helper');

/**
 * Test the getUrl download method on the given backend.  This defines a suite
 * of tests.
 */
exports.testGetUrlDownloadMethod = ({
  mock, skipping,

  // optional title suffix
  title,

  // a prefix for object names, so that concurrent runs do not modify the
  // same objects in the "real" storage backend
  prefix,

  // the backend to test; this will be loaded from the loader, so its configuration
  // should be set up in suiteSetup.
  backendId,

  // an async function({name, object, hashes, gzipped}) to make an object with
  // the given name containing the given data, simulating an upload. It's up to
  // the caller to clean these up in a `teardown` handler.  The hashes should
  // be added to the db, and if `gzipped` is true then the content should be
  // available for download in a gzipped form.
  makeObject,

  // an optional async function({name, url}) to verify that the correct URL was
  // returned for the object with the given name
  checkUrl = () => {},

  // suiteDefinition defines the suite; add suiteSetup, suiteTeardown here, if
  // necessary, and any extra tests
}, suiteDefinition) => {
  // these don't have to be hashes of anything, just have the right format
  const sha256 = 'e38808a4dbfdd9c82a351cc9a6055dffc7b4cc8e12020b2685f8eef92f5d1544';
  const sha512 = sha256 + sha256;

  suite(`getUrl download method${title ? `: ${title}` : ''}`, function() {
    (suiteDefinition || (() => {})).call(this);

    let backend;
    setup(async function() {
      const backends = await helper.load('backends');
      backend = backends.get(backendId);
    });

    [true, false].forEach(gzipped => {
      test(`supports getUrl downloads (Content-Encoding: ${gzipped ? "gzip" : "identity"})`, async function() {
        const data = crypto.randomBytes(256);
        const name = helper.testObjectName(prefix);
        const object = await makeObject({ name, data, hashes: { sha256, sha512 }, gzipped });

        // check it's supported..
        const methods = await backend.availableDownloadMethods(object);
        assert(methods.includes('getUrl'));

        // call the backend
        const { method, url, expires, hashes } = await backend.startDownload(object, 'getUrl', true);
        assert.equal(method, 'getUrl');
        assert(new Date(expires) > new Date());
        assert.deepEqual(hashes, { sha256, sha512 });
        await checkUrl({ name, url });

        // fetch the data at that URL and check that it matches
        const fetched = await request
          .get(url)
          .set('Accept-Encoding', gzipped ? 'gzip' : 'identity')
          .responseType('blob');
        assert.deepEqual(fetched.body, data);
        if (gzipped) {
          assert.equal(fetched.headers['content-encoding'], 'gzip');
        } else {
          assert.equal(fetched.headers['content-encoding'] || 'identity', 'identity');
        }
      });
    });
  });
};
