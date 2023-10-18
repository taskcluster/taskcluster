import crypto from 'crypto';
import assert from 'assert';
import { load, testObjectName } from '../helper/index.js';
import { DOWNLOAD_METHODS } from '../../src/api.js';

/**
 * Test properties general to all backends.
 */
export const testBackend = ({
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

  // suiteDefinition defines the suite; add suiteSetup, suiteTeardown here, if
  // necessary, and any extra tests
}, suiteDefinition) => {
  suite(`general backend tests${title ? `: ${title}` : ''}`, function() {
    (suiteDefinition || (() => {})).call(this);

    let backend;
    setup(async function() {
      const backends = await load('backends');
      backend = backends.get(backendId);
    });

    test('supports only defined downlad methods', async function() {
      const data = crypto.randomBytes(256);
      const name = testObjectName(prefix);
      const object = await makeObject({ name, data, hashes: { }, gzipped: false });

      const methods = await backend.availableDownloadMethods(object);
      const unknown = methods.filter(m => !DOWNLOAD_METHODS.includes(m));
      if (unknown.length > 0) {
        assert.fail(`backend.availableDownloadMethods returned unknown method(s) ${unknown.join(', ')}`);
      }
    });
  });
};
