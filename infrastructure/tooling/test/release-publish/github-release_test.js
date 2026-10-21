import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { draftRelease, publishRelease, requiredAssets } from '../../src/release-publish/github-release.js';

const VERSION = '1.2.3';
const ctx = { version: VERSION, tag: `v${VERSION}`, owner: 'taskcluster', repo: 'taskcluster', staging: false };
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const noop = () => {};

// An in-memory GitHub: releases (with their assets) and a record of the mutating calls.
const fakeOctokit = ({ releases = [], loseCreateResponse = false } = {}) => {
  let nextId = 1000;
  const calls = { create: 0, upload: [], deleteAsset: [], update: [] };
  const byId = id => releases.find(r => r.id === id);
  return {
    calls,
    releases,
    paginate: async (method, params) => method(params),
    repos: {
      listReleases: async () => releases,
      listReleaseAssets: async ({ release_id }) => byId(release_id).assets,
      createRelease: async ({ tag_name, draft }) => {
        calls.create++;
        const release = { id: nextId++, tag_name, draft, assets: [] };
        releases.push(release);
        if (loseCreateResponse) {
          loseCreateResponse = false;
          throw new Error('socket hang up');
        }
        return { data: release };
      },
      uploadReleaseAsset: async ({ release_id, name, data }) => {
        calls.upload.push(name);
        const asset = { id: nextId++, name, size: data.length, state: 'uploaded', digest: `sha256:${sha256(data)}` };
        byId(release_id).assets.push(asset);
      },
      deleteReleaseAsset: async ({ asset_id }) => {
        calls.deleteAsset.push(asset_id);
        for (const release of releases) {
          release.assets = release.assets.filter(a => a.id !== asset_id);
        }
      },
      updateRelease: async ({ release_id, draft }) => {
        calls.update.push(release_id);
        byId(release_id).draft = draft;
        return { data: { html_url: `https://github.com/taskcluster/taskcluster/releases/tag/v${VERSION}` } };
      },
    },
  };
};

suite('release-publish github-release', () => {
  let dir, files;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-publish-test-'));
    files = [...requiredAssets(VERSION), 'generic-worker-linux-amd64'].map(file => {
      fs.writeFileSync(path.join(dir, file), `contents of ${file}`);
      return { file, size: fs.statSync(path.join(dir, file)).size };
    });
  });

  teardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const contents = file => fs.readFileSync(path.join(dir, file));
  let assetId = 1;
  const uploaded = (file, overrides = {}) => ({
    id: assetId++,
    name: file,
    size: contents(file).length,
    state: 'uploaded',
    digest: `sha256:${sha256(contents(file))}`,
    ...overrides,
  });
  const release = ({ draft = true, assets = files.map(f => uploaded(f.file)) } = {}) => ({
    id: 1,
    tag_name: ctx.tag,
    draft,
    assets,
  });
  const draft = octokit => draftRelease({ ctx, octokit, dir, files, changelog: 'notes', sleep: noop, log: noop });
  const expected = () => files.map(({ file, size }) => ({ file, size, sha256: sha256(contents(file)) }));

  test('creates exactly one draft, records sha256 per asset, and is idempotent', async () => {
    const octokit = fakeOctokit();
    assert.equal(await draft(octokit), 'created');
    assert.equal(octokit.calls.create, 1);
    assert.equal(octokit.calls.upload.length, files.length);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'expected-assets.json'), 'utf8')), expected());

    assert.equal(await draft(octokit), 'up-to-date');
    assert.equal(octokit.calls.create, 1);
    assert.equal(octokit.releases.length, 1);
    assert.equal(octokit.calls.upload.length, files.length);
  });

  test('a lost createRelease response does not create a second draft', async () => {
    const octokit = fakeOctokit({ loseCreateResponse: true });
    assert.equal(await draft(octokit), 'created');
    assert.equal(octokit.calls.create, 1);
    assert.equal(octokit.releases.length, 1);
  });

  test('re-uploads draft assets whose digest or size differs', async () => {
    const [a, b] = files;
    const existing = release();
    existing.assets[0] = uploaded(a.file, { digest: `sha256:${'0'.repeat(64)}` });
    existing.assets[1] = uploaded(b.file, { size: b.size - 1 });
    const octokit = fakeOctokit({ releases: [existing] });
    assert.equal(await draft(octokit), 'updated');
    assert.deepEqual(octokit.calls.upload, [a.file, b.file]);
    assert.equal(octokit.calls.deleteAsset.length, 2);
  });

  test('re-uploads draft assets with no reported digest', async () => {
    const existing = release();
    existing.assets = existing.assets.map(a => ({ ...a, digest: null }));
    const octokit = fakeOctokit({ releases: [existing] });
    assert.equal(await draft(octokit), 'updated');
    assert.deepEqual(
      octokit.calls.upload,
      files.map(f => f.file)
    );
    assert.equal(octokit.calls.deleteAsset.length, files.length);
  });

  test("refuses to modify a published release's mismatched asset", async () => {
    const existing = release({ draft: false });
    existing.assets[0] = uploaded(files[0].file, { digest: `sha256:${'0'.repeat(64)}` });
    const octokit = fakeOctokit({ releases: [existing] });
    await assert.rejects(draft(octokit), /refusing to modify a published release/);
    assert.deepEqual(octokit.calls.upload, []);
    assert.deepEqual(octokit.calls.deleteAsset, []);
  });

  test("refuses to add a published release's missing assets, naming all of them", async () => {
    const existing = release({ draft: false });
    const [a, b] = existing.assets.splice(0, 2);
    const octokit = fakeOctokit({ releases: [existing] });
    await assert.rejects(draft(octokit), err => {
      assert.equal(err.retriable, false);
      assert.match(err.message, /refusing to modify a published release/);
      const [ia, ib] = [err.message.indexOf(`${a.name} is missing`), err.message.indexOf(`${b.name} is missing`)];
      assert.ok(ia !== -1 && ib > ia, `expected ${a.name} then ${b.name} in: ${err.message}`);
      return true;
    });
    assert.deepEqual(octokit.calls.upload, []);
    assert.deepEqual(octokit.calls.deleteAsset, []);
  });

  test('a complete published release is up-to-date', async () => {
    const octokit = fakeOctokit({ releases: [release({ draft: false })] });
    assert.equal(await draft(octokit), 'up-to-date');
    assert.deepEqual(octokit.calls.upload, []);
  });

  test('publish refuses when an asset digest differs', async () => {
    const existing = release();
    existing.assets[0] = uploaded(files[0].file, { digest: `sha256:${'0'.repeat(64)}` });
    const octokit = fakeOctokit({ releases: [existing] });
    await assert.rejects(publishRelease({ ctx, octokit, expected: expected(), log: noop }), new RegExp(files[0].file));
    assert.deepEqual(octokit.calls.update, []);
  });

  test('publish refuses when an asset is missing', async () => {
    const existing = release();
    existing.assets.pop();
    const octokit = fakeOctokit({ releases: [existing] });
    await assert.rejects(
      publishRelease({ ctx, octokit, expected: expected(), log: noop }),
      /missing or has incomplete/
    );
    assert.deepEqual(octokit.calls.update, []);
  });

  test('publishes when every asset is complete', async () => {
    const octokit = fakeOctokit({ releases: [release()] });
    assert.equal(await publishRelease({ ctx, octokit, expected: expected(), log: noop }), 'published');
    assert.deepEqual(octokit.calls.update, [1]);
    assert.equal(await publishRelease({ ctx, octokit, expected: expected(), log: noop }), 'already-published');
  });
});
