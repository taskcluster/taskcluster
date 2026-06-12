import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import helpers from '../src/helpers.js';
import { _satisfiesArtifactScope } from '../src/helpers.js';

suite(testing.suiteName(), () => {
  suite('satisfiesArtifactScope', () => {
    test('returns true for exact scope match', async () => {
      const cache = async () => ['queue:get-artifact:public/foo.zip'];
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), true);
    });

    test('returns true for wildcard scope match', async () => {
      const cache = async () => ['queue:get-artifact:public/*'];
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), true);
    });

    test('returns false for private artifact', async () => {
      const cache = async () => ['queue:get-artifact:public/*'];
      assert.equal(await _satisfiesArtifactScope(cache, 'private/secret.zip'), false);
    });

    test('returns false when cache throws', async () => {
      const cache = async () => { throw new Error('auth failure'); };
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), false);
    });

    test('returns false when no matching scope', async () => {
      const cache = async () => ['some:other:scope'];
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), false);
    });
  });

  suite('isPublicArtifact', () => {
    test('returns true for public artifact', async () => {
      const auth = {
        expandScopes: async () => ({ scopes: ['queue:get-artifact:public/*'] }),
      };
      const check = helpers.isPublicArtifact(auth);
      assert.equal(await check('public/foo.zip'), true);
    });

    test('returns false for private artifact', async () => {
      const auth = {
        expandScopes: async () => ({ scopes: ['queue:get-artifact:public/*'] }),
      };
      const check = helpers.isPublicArtifact(auth);
      assert.equal(await check('private/secret.zip'), false);
    });

    test('caches scope expansion result', async () => {
      let callCount = 0;
      const auth = {
        expandScopes: async () => {
          callCount++;
          return { scopes: ['queue:get-artifact:public/*'] };
        },
      };
      const check = helpers.isPublicArtifact(auth);
      await check('public/a.zip');
      await check('public/b.zip');
      assert.equal(callCount, 1);
    });
  });

  suite('splitNamespace', () => {
    test('of a multi-part namespace', () => {
      const [namespace, name] = helpers.splitNamespace('foo.bar.bing');
      assert.equal(namespace, 'foo.bar');
      assert.equal(name, 'bing');
    });

    test('of a two-part namespace', () => {
      const [namespace, name] = helpers.splitNamespace('foo.bar');
      assert.equal(namespace, 'foo');
      assert.equal(name, 'bar');
    });

    test('of a single-part namespace', () => {
      const [namespace, name] = helpers.splitNamespace('foo');
      assert.equal(namespace, '');
      assert.equal(name, 'foo');
    });

    test('of an empty namespace', () => {
      const [namespace, name] = helpers.splitNamespace('');
      assert.equal(namespace, '');
      assert.equal(name, '');
    });
  });
});
