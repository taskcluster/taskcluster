const {CryptoKeyring} = require('../src/Keyring');
const path = require('path');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  const azureCryptoKey = 'aGVsbG8gZnV0dXJlIHBlcnNvbi4gaSdtIGJzdGFjawo=';
  const pgCryptoKey = 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo=';
  const pgCryptoKey2 = 'dGhpcyBzdHJpbmcgaXMgbmljZSwgaSdtIGJzdGFjawo=';

  test('no keys', function() {
    const keyring = new CryptoKeyring({});
    assert.throws(() => {
      keyring.currentKey('aes-256');
    }, /no current crypto key is configured/);
  });

  test('only azure', function() {
    const keyring = new CryptoKeyring({azureCryptoKey});
    const {id, algo, key} = keyring.currentKey('aes-256');
    assert.equal(id, 'azure');
    assert.equal(algo, 'aes-256');
    assert.equal(key.toString('base64'), azureCryptoKey);
  });

  test('only pg (single key)', function() {
    const keyring = new CryptoKeyring({dbCryptoKeys: [{id: 'foo', algo: 'aes-256', key: pgCryptoKey}]});
    const {id, key} = keyring.currentKey('aes-256');
    assert.equal(id, 'foo');
    assert.equal(key.toString('base64'), pgCryptoKey);
  });

  test('only pg (multiple keys)', function() {
    const keyring = new CryptoKeyring({dbCryptoKeys: [
      {id: 'foo', algo: 'aes-256', key: pgCryptoKey},
      {id: 'bar', algo: 'aes-256', key: pgCryptoKey2},
    ]});
    const {id, key} = keyring.currentKey('aes-256');
    assert.equal(id, 'bar');
    assert.equal(key.toString('base64'), pgCryptoKey2);
    assert.equal(key, keyring.getKey('bar', 'aes-256'));
    assert.equal(pgCryptoKey, keyring.getKey('foo', 'aes-256').toString('base64'));
    assert.equal(pgCryptoKey2, keyring.getKey('bar', 'aes-256').toString('base64'));
  });

  test('pg and azure (single key)', function() {
    const keyring = new CryptoKeyring({dbCryptoKeys: [{id: 'foo', algo: 'aes-256', key: pgCryptoKey}]});
    const {id, key} = keyring.currentKey('aes-256');
    assert.equal(id, 'foo');
    assert.equal(key.toString('base64'), pgCryptoKey);
  });

  test('pg and azure (multiple keys)', function() {
    const keyring = new CryptoKeyring({azureCryptoKey, dbCryptoKeys: [
      {id: 'foo', algo: 'aes-256', key: pgCryptoKey},
      {id: 'bar', algo: 'aes-256', key: pgCryptoKey2},
    ]});
    const {id, key} = keyring.currentKey('aes-256');
    assert.equal(id, 'bar');
    assert.equal(key.toString('base64'), pgCryptoKey2);
    assert.equal(key, keyring.getKey('bar', 'aes-256'));
    assert.equal(pgCryptoKey, keyring.getKey('foo', 'aes-256').toString('base64'));
    assert.equal(pgCryptoKey2, keyring.getKey('bar', 'aes-256').toString('base64'));
    assert.equal(azureCryptoKey, keyring.getKey('azure', 'aes-256').toString('base64'));
  });

  test('nonexistent algo', function() {
    assert.throws(() => {
      new CryptoKeyring({dbCryptoKeys: [{id: 'foo', algo: 'bad-algo', key: pgCryptoKey}]});
    }, /crypto key foo has invalid algo bad-algo/);
  });

  test('missing key', function() {
    assert.throws(() => {
      new CryptoKeyring({dbCryptoKeys: [{id: 'foo', algo: 'aes-256'}]});
    }, /crypto key foo is missing 'key'/);
  });

  test('missing id', function() {
    assert.throws(() => {
      new CryptoKeyring({dbCryptoKeys: [{algo: 'aes-256', key: pgCryptoKey}]});
    }, /crypto key is missing 'id'/);
  });

  test('missing algo', function() {
    assert.throws(() => {
      new CryptoKeyring({dbCryptoKeys: [{id: 'foo', key: pgCryptoKey}]});
    }, /crypto key foo is missing 'algo'/);
  });

  test('bad key', function() {
    assert.throws(() => {
      new CryptoKeyring({dbCryptoKeys: [{id: 'foo', algo: 'aes-256', key: 'too-short'}]});
    }, /aes-256 key must be 32 bytes in base64 in foo/);
  });
});
