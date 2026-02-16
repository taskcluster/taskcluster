import assert from 'assert';
import testing from '@taskcluster/lib-testing';
import helpers from '../src/helpers.js';
import { _satisfiesArtifactScope } from '../src/helpers.js';

suite(testing.suiteName(), function() {
  suite('satisfiesArtifactScope', function() {
    test('returns true for exact scope match', async function() {
      const cache = async () => ['queue:get-artifact:public/foo.zip'];
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), true);
    });

    test('returns true for wildcard scope match', async function() {
      const cache = async () => ['queue:get-artifact:public/*'];
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), true);
    });

    test('returns false for private artifact', async function() {
      const cache = async () => ['queue:get-artifact:public/*'];
      assert.equal(await _satisfiesArtifactScope(cache, 'private/secret.zip'), false);
    });

    test('returns false when cache throws', async function() {
      const cache = async () => { throw new Error('auth failure'); };
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), false);
    });

    test('returns false when no matching scope', async function() {
      const cache = async () => ['some:other:scope'];
      assert.equal(await _satisfiesArtifactScope(cache, 'public/foo.zip'), false);
    });
  });

  suite('splitNamespace', function() {
    test('of a multi-part namespace', function() {
      const [namespace, name] = helpers.splitNamespace('foo.bar.bing');
      assert.equal(namespace, 'foo.bar');
      assert.equal(name, 'bing');
    });

    test('of a two-part namespace', function() {
      const [namespace, name] = helpers.splitNamespace('foo.bar');
      assert.equal(namespace, 'foo');
      assert.equal(name, 'bar');
    });

    test('of a single-part namespace', function() {
      const [namespace, name] = helpers.splitNamespace('foo');
      assert.equal(namespace, '');
      assert.equal(name, 'foo');
    });

    test('of an empty namespace', function() {
      const [namespace, name] = helpers.splitNamespace('');
      assert.equal(namespace, '');
      assert.equal(name, '');
    });
  });
});
