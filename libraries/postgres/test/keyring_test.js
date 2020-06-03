const Keyring = require('../src/Keyring');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  // Cases to test:
  // X. no azure keys or pg keys
  // 2. only azure keys
  // 3. both kinds of keys
  // 4. only pg keys
  // 5. single pg key
  // 6. multiple pg key
  // 7. nonexisting algo
  // 8. key that does not meet algo

  test('no keys', function() {
    const keyring = new Keyring({});
    assert.throws(() => {
      keyring.currentCryptoKey('foo');
    }, /no current key is configured/);
  });
});
