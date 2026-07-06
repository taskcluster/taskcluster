import Keyring from '../src/Keyring.js';
import path from 'node:path';
import { strict as assert } from 'node:assert';

const __filename = new URL('', import.meta.url).pathname;

suite(path.basename(__filename), () => {
  const azureCryptoKey = 'aGVsbG8gZnV0dXJlIHBlcnNvbi4gaSdtIGJzdGFjawo=';
  const pgCryptoKey = 'aSdtIGJzdGFjayEgaGVsbG8gZnV0dXJlIHBlcnNvbgo=';
  const pgCryptoKey2 = 'dGhpcyBzdHJpbmcgaXMgbmljZSwgaSdtIGJzdGFjawo=';

  test('no keys', () => {
    const keyring = new Keyring({});
    assert.throws(() => {
      keyring.currentCryptoKey('aes-256');
    }, /no current key is configured/);
  });

  test('only azure', () => {
    const keyring = new Keyring({ azureCryptoKey });
    const { id, key } = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'azure');
    assert.equal(key.toString('base64'), azureCryptoKey);
  });

  test('only pg (single key)', () => {
    const keyring = new Keyring({ dbCryptoKeys: [{ id: 'foo', algo: 'aes-256', key: pgCryptoKey }] });
    const { id, key } = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'foo');
    assert.equal(key.toString('base64'), pgCryptoKey);
  });

  test('only pg (multiple keys)', () => {
    const keyring = new Keyring({
      dbCryptoKeys: [
        { id: 'foo', algo: 'aes-256', key: pgCryptoKey },
        { id: 'bar', algo: 'aes-256', key: pgCryptoKey2 },
      ],
    });
    const { id, key } = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'bar');
    assert.equal(key.toString('base64'), pgCryptoKey2);
    assert.equal(key, keyring.getCryptoKey('bar', 'aes-256'));
    assert.equal(pgCryptoKey, keyring.getCryptoKey('foo', 'aes-256').toString('base64'));
    assert.equal(pgCryptoKey2, keyring.getCryptoKey('bar', 'aes-256').toString('base64'));
  });

  test('pg and azure (single key)', () => {
    const keyring = new Keyring({ dbCryptoKeys: [{ id: 'foo', algo: 'aes-256', key: pgCryptoKey }] });
    const { id, key } = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'foo');
    assert.equal(key.toString('base64'), pgCryptoKey);
  });

  test('pg and azure (multiple keys)', () => {
    const keyring = new Keyring({
      azureCryptoKey,
      dbCryptoKeys: [
        { id: 'foo', algo: 'aes-256', key: pgCryptoKey },
        { id: 'bar', algo: 'aes-256', key: pgCryptoKey2 },
      ],
    });
    const { id, key } = keyring.currentCryptoKey('aes-256');
    assert.equal(id, 'bar');
    assert.equal(key.toString('base64'), pgCryptoKey2);
    assert.equal(key, keyring.getCryptoKey('bar', 'aes-256'));
    assert.equal(pgCryptoKey, keyring.getCryptoKey('foo', 'aes-256').toString('base64'));
    assert.equal(pgCryptoKey2, keyring.getCryptoKey('bar', 'aes-256').toString('base64'));
    assert.equal(azureCryptoKey, keyring.getCryptoKey('azure', 'aes-256').toString('base64'));
  });

  test('nonexistent algo', () => {
    assert.throws(() => {
      new Keyring({ dbCryptoKeys: [{ id: 'foo', algo: 'bad-algo', key: pgCryptoKey }] });
    }, /Got bad-algo for foo/);
  });

  test('missing key', () => {
    assert.throws(() => {
      new Keyring({ dbCryptoKeys: [{ id: 'foo', algo: 'aes-256' }] });
    }, /Keyring crypto keys must have `key`/);
  });

  test('missing id', () => {
    assert.throws(() => {
      new Keyring({ dbCryptoKeys: [{ algo: 'aes-256', key: pgCryptoKey }] });
    }, /Keyring crypto keys must have `id`/);
  });

  test('missing algo', () => {
    assert.throws(() => {
      new Keyring({ dbCryptoKeys: [{ id: 'foo', key: pgCryptoKey }] });
    }, /Keyring crypto keys must have `algo`/);
  });

  test('bad key', () => {
    assert.throws(() => {
      new Keyring({ dbCryptoKeys: [{ id: 'foo', algo: 'aes-256', key: 'too-short' }] });
    }, /aes-256 key must be 32 bytes in base64 in foo/);
  });
});
