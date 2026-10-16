import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchDependencyArtifacts } from '../../src/release-publish/artifacts.js';

// dependencies: { depId: [page of artifact names, ...] }
const fakeQueue = dependencies => ({
  task: async () => ({ dependencies: Object.keys(dependencies) }),
  listLatestArtifacts: async (depId, { continuationToken } = {}) => {
    const pages = dependencies[depId];
    const i = continuationToken ? Number(continuationToken) : 0;
    return {
      artifacts: pages[i].map(name => ({ name })),
      ...(i + 1 < pages.length ? { continuationToken: String(i + 1) } : {}),
    };
  },
});

const fakeDownload = async ({ taskId, name, file }) => {
  fs.writeFileSync(file, `${taskId}:${name}`);
};

suite('release-publish artifacts', () => {
  let destDir;

  setup(() => {
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-test-'));
  });

  teardown(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  const fetch = dependencies =>
    fetchDependencyArtifacts({
      queue: fakeQueue(dependencies),
      taskId: 'self',
      prefix: 'public/build/',
      destDir,
      download: fakeDownload,
    });

  test('downloads artifacts under the prefix from every page of every dependency', async () => {
    const result = await fetch({
      depA: [['public/build/a.tar.gz', 'public/logs/live.log'], ['public/build/b']],
      gate: [[]],
    });
    assert.deepEqual(
      result.map(r => [r.taskId, r.name, r.file]),
      [
        ['depA', 'public/build/a.tar.gz', 'a.tar.gz'],
        ['depA', 'public/build/b', 'b'],
      ]
    );
    assert.equal(fs.readFileSync(path.join(destDir, 'b'), 'utf8'), 'depA:public/build/b');
    assert.equal(result[1].size, 'depA:public/build/b'.length);
    assert(!fs.existsSync(path.join(destDir, 'live.log')));
  });

  for (const name of [
    'public/build/',
    'public/build/.',
    'public/build/..',
    'public/build/sub/x',
    'public/build/../x',
  ]) {
    test(`refuses artifact ${JSON.stringify(name)}`, async () => {
      await assert.rejects(fetch({ depA: [[name]] }), /not a plain file name/);
      assert.deepEqual(fs.readdirSync(destDir), []);
    });
  }

  test('refuses a file name produced by two dependencies', async () => {
    await assert.rejects(
      fetch({ depA: [['public/build/x']], depB: [['public/build/x']] }),
      /produced by both depA and depB/
    );
  });
});
