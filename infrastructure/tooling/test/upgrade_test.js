import assert from 'node:assert';
import { readRepoFile } from '../src/utils/index.js';
import { corepackChangelogBody, nodeChangelogBody, resolveCorepackVersion } from '../src/upgrade/index.js';

suite('upgrade', () => {
  suite('resolveCorepackVersion', () => {
    const realFetch = globalThis.fetch;
    let fetchedUrls;

    setup(() => {
      fetchedUrls = [];
      globalThis.fetch = async url => {
        fetchedUrls.push(url);
        return { ok: true, json: async () => ({ version: '0.99.1' }) };
      };
    });

    teardown(() => {
      globalThis.fetch = realFetch;
    });

    const currentCorepack = async () => (await readRepoFile('.corepack-version')).trim();

    test('skip', async () => {
      assert.equal(await resolveCorepackVersion({ spec: 'skip', currentNode: '1.0.0', targetNode: '2.0.0' }), 'skip');
      assert.deepEqual(fetchedUrls, []);
    });

    test('explicit version, with or without a leading v', async () => {
      assert.equal(await resolveCorepackVersion({ spec: '0.37.1' }), '0.37.1');
      assert.equal(await resolveCorepackVersion({ spec: 'v0.37.1' }), '0.37.1');
      assert.deepEqual(fetchedUrls, []);
    });

    test('invalid version', async () => {
      await assert.rejects(() => resolveCorepackVersion({ spec: '0.37' }), /invalid corepack version/);
    });

    test('latest fetches the npm registry', async () => {
      assert.equal(await resolveCorepackVersion({ spec: 'latest' }), '0.99.1');
      assert.deepEqual(fetchedUrls, ['https://registry.npmjs.org/corepack/latest']);
    });

    test('auto keeps the pinned version when Node.js does not change', async () => {
      assert.equal(
        await resolveCorepackVersion({ spec: 'auto', currentNode: '26.13.0', targetNode: '26.13.0' }),
        await currentCorepack()
      );
      assert.deepEqual(fetchedUrls, []);
    });

    test('auto uses the latest version when Node.js changes', async () => {
      assert.equal(
        await resolveCorepackVersion({ spec: 'auto', currentNode: '26.13.0', targetNode: '26.14.0' }),
        '0.99.1'
      );
      assert.deepEqual(fetchedUrls, ['https://registry.npmjs.org/corepack/latest']);
    });
  });

  suite('changelog bodies', () => {
    const header = 'audience: general\nlevel: patch\n---\n';

    test('node only', () => {
      assert.equal(nodeChangelogBody({ targetNode: '26.14.0' }), `${header}Upgrades to Node.js v26.14.0.\n`);
    });

    test('node and corepack', () => {
      assert.equal(
        nodeChangelogBody({ targetNode: '26.14.0', targetCorepack: '0.37.0', corepackChanged: true }),
        `${header}Upgrades to Node.js v26.14.0 and corepack v0.37.0.\n`
      );
    });

    test('corepack only', () => {
      assert.equal(corepackChangelogBody('0.37.0'), `${header}Upgrades to corepack v0.37.0.\n`);
    });
  });
});
