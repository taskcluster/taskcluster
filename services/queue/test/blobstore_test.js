suite.skip('queue/tasks_store', function() {
  return;
  var slugid        = require('slugid');
  var assert        = require('assert');
  var BlobStore     = require('../src/blobstore');
  var _             = require('lodash');
  var url           = require('url');
  var request       = require('superagent');
  var BlobUploader  = require('./azure-blob-uploader-sas');
  var debug         = require('debug')('test:blobstore_test');
  var config        = require('typed-env-config');

  // Load configuration
  var cfg = config({profile: 'test'});

  // Check that we have an account
  let blobstore = null;
  if (cfg.azure && cfg.azure.accountKey) {
    blobstore = new BlobStore({
      container:    cfg.app.artifactContainer,
      credentials:  cfg.azure,
    });
  } else {
    console.log('WARNING: Skipping "blobstore" tests, missing user-config.yml');
    this.pending = true;
  }

  // Create container
  test('createContainer', function() {
    return blobstore.createContainer();
  });

  // Test that put works
  test('put', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.put(key, data).then(function() {
      return blobstore.put(key, {message: 'Go away'});
    }).then(function() {
      return blobstore.get(key);
    }).then(function(result) {
      assert(result.message == 'Go away', 'Message mismatch!');
    });
  });

  // Put if not exists
  test('putIfNotExists', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.putIfNotExists(key, data).then(function() {
      return blobstore.putIfNotExists(key, data);
    }).then(function() {
      assert(false, 'Expected error');
    }, function(err) {
      assert(err.code === 'BlobAlreadyExists', 'Should already exist');
    });
  });

  // Test that we can get values
  test('get', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.putIfNotExists(key, data).then(function() {
      return blobstore.get(key);
    }).then(function(result) {
      assert(_.isEqual(result, data), 'Unexpected result');
    });
  });

  // Test that put if not match
  test('putOrMatch (match)', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.putOrMatch(key, data).then(function() {
      return blobstore.putOrMatch(key, data);
    });
  });

  // Test that put if not match
  test('putOrMatch (mismatch)', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.putOrMatch(key, data).then(function() {
      return blobstore.putOrMatch(key, {message: 'Go away'});
    }).then(function() {
      assert(false, 'Expected error');
    }).catch(function(err) {
      assert(err.code === 'BlobAlreadyExists', 'Should already exist');
    });
  });

  // Test that we can't key that doesn't exists
  test('get with nullIfNotFound', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.get(key, true).then(function(result) {
      assert(result === null, 'Unexpected result');
    });
  });

  // Test that we can't key that doesn't exists
  test('get without nullIfNotFound', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.get(key).then(function(result) {
      assert(false, 'Expected Error');
    }).catch(function(err) {
      assert(err.code === 'BlobNotFound', 'Expected not found error');
    });
  });

  // Test that we can generate SAS with write access
  test('upload w. generateWriteSAS', function() {
    var key = slugid.v4();
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 20);
    var sas = blobstore.generateWriteSAS(key, {expiry: expiry});
    assert(sas, 'Failed to generate a signature');

    // Create BlobUploader
    var uploader = new BlobUploader(sas);
    var block1 = slugid.v4();
    var block2 = slugid.v4();

    return Promise.all([
      uploader.putBlock(block1, '{"block1_says": "Hello world",\n'),
      uploader.putBlock(block2, '"block2_says": "Hello Again"}\n'),
    ]).then(function() {
      return uploader.putBlockList([block1, block2], 'application/json');
    }).then(function() {
      return blobstore.get(key);
    }).then(function(result) {
      assert(result.block1_says === 'Hello world', 'block 1 incorrect');
      assert(result.block2_says === 'Hello Again', 'block 2 incorrect');
    });
  });

  // Test that we can't abuse SAS with write access
  test('no unauthorized upload w. generateWriteSAS', function() {
    var key = slugid.v4();
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 20);
    var sas = blobstore.generateWriteSAS(key, {expiry: expiry});
    assert(sas, 'Failed to generate a signature');

    // Make a new key and try it
    key = slugid.v4();
    var sas2 = blobstore.generateWriteSAS(key, {expiry: expiry});

    // Update the first signed url to point at the second with the same query
    // params to test that we are using a restrictive enough permission set.
    var parsedInvalidSasUrl    = url.parse(sas, true);
    var parsedValidSasUrl      = url.parse(sas2, true);

    // Keep the query params the same but change the blob it is pointing at.
    parsedInvalidSasUrl.pathname = parsedValidSasUrl.pathname;

    // Create BlobUploader
    var uploader = new BlobUploader(url.format(parsedInvalidSasUrl));
    var block1 = slugid.v4();
    var block2 = slugid.v4();

    return uploader.putBlock(block1, '{"').then(function() {
      assert(false, 'This should have failed');
    }, function(err) {
      debug('Got expected error: %s', err);
    });
  });

  // Test that signed get URLs work
  test('createSignedGetUrl', function() {
    var key = slugid.v4();
    return blobstore.put(key, {message: 'Hello'}).then(function() {
      var expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 5);
      var url = blobstore.createSignedGetUrl(key, {expiry: expiry});
      return request
        .get(url)
        .then(function(res) {
          assert(res.ok, 'Request failed');
          assert.deepEqual(res.body, {message: 'Hello'},
            'message wasn\'t preserved');
        });
    });
  });

  // Test that we can delete a blob
  test('deleteBlob (blob exists)', function() {
    var key  = slugid.v4();
    var data = {message: 'Hello World', list: [1, 2, 3]};
    return blobstore.put(key, data).then(function() {
      return blobstore.deleteBlob(key);
    });
  });

  // Test that we can delete a blob that doesn't exist
  test('deleteBlob (blob does not exists)', function() {
    var key  = slugid.v4();
    return blobstore.deleteBlob(key, true);
  });
});
