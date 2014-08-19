suite('docker registry', function() {
  var Image = require('./docker_image');

  test('#canAuthenticate', function() {
    assert.ok(!new Image('registry').canAuthenticate(), 'single part');
    assert.ok(!new Image('foo/bar').canAuthenticate(), 'two parts');
    assert.ok(!new Image('foo/bar/').canAuthenticate(), 'empty parts trailing');
    assert.ok(!new Image('/foo/bar').canAuthenticate(), 'empty parts leading');
    assert.ok(!new Image('/foo/bar/').canAuthenticate(), 'empty parts both');
    assert.ok(new Image('xfoo/foo/bar').canAuthenticate(), 'valid');
  });

  var registries = {
    'noslash.com': { username: 'quay.io' },
    'quay.io/': { username: 'quay.io' },
    'quay.io/repo': { username: 'quay.io/repo' }
  };

  test('#credentials - root', function() {
    var image = new Image('quay.io/foobar/baz');
    assert.equal(image.credentials(registries), registries['quay.io/']);
  });

  test('#credentials - no slash in registry', function() {
    var image = new Image('noslash.com/woot/bar');
    assert.equal(image.credentials(registries), registries['noslash.com']);
  });

  test('#credentials - none', function() {
    var image = new Image('other/thing/wow');
    assert.equal(image.credentials(registries), null);
  });

  test('#credentials - particular user', function() {
    var image = new Image('quay.io/repo/image');
    assert.equal(image.credentials(registries), registries['quay.io/repo']);
  });

});
