const Keyring = require('../src/Keyring');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  const azureCryptoKey = 'aGVsbG8gZnV0dXJlIHBlcnNvbi4gaSdtIGJzdGFjawo=';
  const pgCryptoKey = 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo=';
  const pgCryptoKey2 = 'dGhpcyBzdHJpbmcgaXMgbmljZSwgaSdtIGJzdGFjawo=';

  test('no keys', function() {
    const keyring = new Keyring({});
    assert.throws(() => {
      keyring.currentCryptoKey('aes-256');
    }, /no current key is configured/);
  });

  test('only azure', function() {
    const keyring = new Keyring({azureCryptoKey});
    const {id, key} = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'azure');
    assert.equal(key.toString('base64'), azureCryptoKey);
  });

  test('only pg (single key)', function() {
    const keyring = new Keyring({cryptoKeys: [{id: 'foo', algo: 'aes-256', key: pgCryptoKey}]});
    const {id, key} = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'foo');
    assert.equal(key.toString('base64'), pgCryptoKey);
  });

  test('only pg (multiple keys)', function() {
    const keyring = new Keyring({cryptoKeys: [
      {id: 'foo', algo: 'aes-256', key: pgCryptoKey},
      {id: 'bar', algo: 'aes-256', key: pgCryptoKey2},
    ]});
    const {id, key} = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'bar');
    assert.equal(key.toString('base64'), pgCryptoKey2);
    assert.equal(key, keyring.getCryptoKey('bar', 'aes-256'));
    assert.equal(pgCryptoKey, keyring.getCryptoKey('foo', 'aes-256').toString('base64'));
    assert.equal(pgCryptoKey2, keyring.getCryptoKey('bar', 'aes-256').toString('base64'));
  });

  test('pg and azure (single key)', function() {
    const keyring = new Keyring({cryptoKeys: [{id: 'foo', algo: 'aes-256', key: pgCryptoKey}]});
    const {id, key} = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'foo');
    assert.equal(key.toString('base64'), pgCryptoKey);
  });

  test('pg and azure (multiple keys)', function() {
    const keyring = new Keyring({azureCryptoKey, cryptoKeys: [
      {id: 'foo', algo: 'aes-256', key: pgCryptoKey},
      {id: 'bar', algo: 'aes-256', key: pgCryptoKey2},
    ]});
    const {id, key} = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'bar');
    assert.equal(key.toString('base64'), pgCryptoKey2);
    assert.equal(key, keyring.getCryptoKey('bar', 'aes-256'));
    assert.equal(pgCryptoKey, keyring.getCryptoKey('foo', 'aes-256').toString('base64'));
    assert.equal(pgCryptoKey2, keyring.getCryptoKey('bar', 'aes-256').toString('base64'));
    assert.equal(azureCryptoKey, keyring.getCryptoKey('azure', 'aes-256').toString('base64'));
  });

  test('nonexistent algo', function() {
    assert.throws(() => {
      new Keyring({cryptoKeys: [{id: 'foo', algo: 'bad-algo', key: pgCryptoKey}]});
    }, /Got bad-algo for foo/);
  });

  test('missing key', function() {
    assert.throws(() => {
      new Keyring({cryptoKeys: [{id: 'foo', algo: 'aes-256'}]});
    }, /Keyring crypto keys must have `key`/);
  });

  test('missing id', function() {
    assert.throws(() => {
      new Keyring({cryptoKeys: [{algo: 'aes-256', key: pgCryptoKey}]});
    }, /Keyring crypto keys must have `id`/);
  });

  test('missing algo', function() {
    assert.throws(() => {
      new Keyring({cryptoKeys: [{id: 'foo', key: pgCryptoKey}]});
    }, /Keyring crypto keys must have `algo`/);
  });

  test('bad key', function() {
    assert.throws(() => {
      new Keyring({cryptoKeys: [{id: 'foo', algo: 'aes-256', key: 'too-short'}]});
    }, /aes-256 key must be 32 bytes in base64 in foo/);
  });
});
