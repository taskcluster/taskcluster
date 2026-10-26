import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { fatal, withRetry } from './retry.js';

const CLIENT_SHELL_PLATFORMS = [
  'darwin-amd64',
  'darwin-arm64',
  'linux-amd64',
  'linux-arm64',
  'freebsd-amd64',
  'freebsd-arm64',
  'windows-amd64',
  'windows-arm64',
];

// livelog, worker-runner (start-worker) and taskcluster-proxy are built for every
// platform as bare binaries (see their build scripts in tools/)
const TOOL_BINARIES = ['livelog', 'start-worker', 'taskcluster-proxy'];

/** Assets that every release must have, as a sanity check on the build artifacts. */
export const requiredAssets = version => [
  ...CLIENT_SHELL_PLATFORMS.map(p => `taskcluster-${p}.${p.startsWith('windows') ? 'zip' : 'tar.gz'}`),
  ...TOOL_BINARIES.flatMap(tool => CLIENT_SHELL_PLATFORMS.map(p => `${tool}-${p}`)),
  `taskcluster-client-${version}.tgz`,
  `taskcluster-client-web-${version}.tgz`,
];

export const extractChangelog = (text, version) => {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^## v${escaped}\n+(.*?)\n^## v`, 'sm'));
  if (!match) {
    throw new Error(`Could not find version ${version} in CHANGELOG.md`);
  }
  return match[1];
};

// Draft releases are not returned by getReleaseByTag, so find them by listing.
export const findRelease = async ({ octokit, owner, repo, tag }) => {
  const releases = await octokit.paginate(octokit.repos.listReleases, { owner, repo, per_page: 100 });
  return releases.find(r => r.tag_name === tag);
};

// Staging reuses the next version number until a real release ships, so a repeat staging
// run finds the previous run's published release. Only there may it be replaced. This needs
// immutable releases to stay disabled on staging-releases: an immutable release's tag cannot
// be deleted, and its tag name cannot be used again even after the release is deleted.
const mayReplacePublished = ctx => ctx.staging && ctx.owner === 'taskcluster' && ctx.repo === 'staging-releases';

const sha256File = async file => {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

// An asset is complete when it is fully uploaded with the expected size and sha256 (GitHub
// reports `digest: "sha256:<hex>"`). An asset with no reported digest is never complete.
const isComplete = (asset, { size, sha256 }) =>
  asset.state === 'uploaded' && asset.size === size && asset.digest === `sha256:${sha256}`;

const describeAsset = asset => `size ${asset.size}, state ${asset.state}, digest ${asset.digest ?? 'not reported'}`;

const listAssets = (octokit, owner, repo, release_id) =>
  octokit.paginate(octokit.repos.listReleaseAssets, { owner, repo, release_id, per_page: 100 });

// A 404 means the asset is already gone, which is what we wanted.
const deleteAsset = async (octokit, owner, repo, asset_id) => {
  try {
    await octokit.repos.deleteReleaseAsset({ owner, repo, asset_id });
  } catch (err) {
    if (err.status !== 404) {
      throw err;
    }
  }
};

// Delete a staging release and its tag so the next draft can be created from scratch.
const deletePublishedRelease = async ({ octokit, owner, repo, tag, release, log }) => {
  log(`deleting published staging release ${tag} (id ${release.id}) and its tag to replace it with a fresh draft`);
  // The tag goes first: if the second call fails, a Rerun still finds the leftover published
  // release and retries this cleanup, whereas a leftover tag with no release would make GitHub
  // ignore target_commitish when the new release is created.
  try {
    await octokit.git.deleteRef({ owner, repo, ref: `tags/${tag}` });
  } catch (err) {
    // 404, or 422 "Reference does not exist": the tag is already gone
    if (err.status !== 404 && err.status !== 422) {
      throw err;
    }
  }
  await octokit.repos.deleteRelease({ owner, repo, release_id: release.id });
};

/**
 * Create (or reuse) the draft release and make its assets match `files`. Safe to
 * rerun: complete assets are kept, and partial ones are replaced. A release that is
 * already published is never modified: it is up-to-date if its assets match `files`,
 * and an error otherwise. The exception is taskcluster/staging-releases, where it is
 * deleted and drafted afresh.
 *
 * `commitish` is the commit the tag is created on when the release is published (if
 * the tag does not exist yet); without it GitHub uses the default branch.
 */
export const draftRelease = async ({ ctx, octokit, dir, files, changelog, commitish, sleep, log = console.log }) => {
  const { owner, repo, tag } = ctx;
  const names = new Set(files.map(f => f.file));
  const missing = requiredAssets(ctx.version).filter(n => !names.has(n));
  if (missing.length) {
    throw new Error(`build artifacts are missing required release assets: ${missing.join(', ')}`);
  }
  if (![...names].some(n => n.startsWith('generic-worker-'))) {
    throw new Error('build artifacts contain no generic-worker-* binaries');
  }

  let outcome = 'up-to-date';
  let release = await findRelease({ octokit, owner, repo, tag });
  if (release && !release.draft && mayReplacePublished(ctx)) {
    await deletePublishedRelease({ octokit, owner, repo, tag, release, log });
    release = undefined;
  }
  if (!release) {
    // Each attempt looks for the release first, so a createRelease whose response was lost
    // (but which did create the draft) cannot result in a second draft. The plugin's own
    // retry is disabled for this call for the same reason.
    release = await withRetry(
      async () => {
        const found = await findRelease({ octokit, owner, repo, tag });
        if (found) {
          return found;
        }
        const { data } = await octokit.repos.createRelease({
          owner,
          repo,
          tag_name: tag,
          name: tag,
          body: changelog,
          draft: true,
          prerelease: false,
          ...(commitish ? { target_commitish: commitish } : {}),
          request: { retries: 0 },
        });
        return data;
      },
      { sleep, log, label: `create release ${tag}` }
    );
    outcome = 'created';
  } else if (!release.draft) {
    log(`release ${tag} is already published and will not be modified; checking its assets`);
  }
  const isDraft = Boolean(release.draft);

  const assets = [];
  for (const { file, size } of files) {
    assets.push({ file, size, sha256: await sha256File(path.join(dir, file)) });
  }

  const existing = new Map((await listAssets(octokit, owner, repo, release.id)).map(a => [a.name, a]));
  if (!isDraft) {
    // Never touch a published release: taskcluster/taskcluster has immutable releases enabled, so
    // GitHub would reject the upload anyway. A broken release is fixed by cutting a new version.
    const problems = assets
      .filter(({ file, size, sha256 }) => !existing.has(file) || !isComplete(existing.get(file), { size, sha256 }))
      .map(({ file, size, sha256 }) => {
        const current = existing.get(file);
        const found = current ? `has ${describeAsset(current)}` : 'is missing';
        return `${file} ${found} (expected ${size} bytes in state uploaded with digest sha256:${sha256})`;
      });
    if (problems.length) {
      throw fatal(
        `published release ${tag} does not match the build artifacts: ${problems.join('; ')}; ` +
          'refusing to modify a published release'
      );
    }
  }
  for (const { file, size, sha256 } of assets) {
    const current = existing.get(file);
    if (current && isComplete(current, { size, sha256 })) {
      continue;
    }
    if (outcome === 'up-to-date') {
      outcome = 'updated';
    }
    const data = fs.readFileSync(path.join(dir, file));
    await withRetry(
      async () => {
        // A dropped upload leaves an incomplete asset of this name behind ('starter'/'open'), and
        // a mismatched asset may already be there; either makes the upload fail with
        // already_exists, so clear it first.
        const leftovers = (await listAssets(octokit, owner, repo, release.id)).filter(a => a.name === file);
        for (const leftover of leftovers) {
          log(`removing incomplete or mismatched asset ${file} (${describeAsset(leftover)}; expected ${size} bytes)`);
          await deleteAsset(octokit, owner, repo, leftover.id);
        }
        return octokit.repos.uploadReleaseAsset({
          owner,
          repo,
          release_id: release.id,
          name: file,
          data,
          headers: { 'content-type': 'application/octet-stream', 'content-length': data.length },
        });
      },
      { sleep, log, label: `upload ${file}` }
    );
  }

  fs.writeFileSync(path.join(dir, 'expected-assets.json'), JSON.stringify(assets, null, 2));
  return outcome;
};

/** Make the draft public, which also triggers .github/workflows/publish-npm.yml. */
export const publishRelease = async ({ ctx, octokit, expected, log = console.log }) => {
  const { owner, repo, tag, version } = ctx;
  const releases = await octokit.paginate(octokit.repos.listReleases, { owner, repo, per_page: 100 });
  const release = releases.find(r => r.tag_name === tag);
  if (!release) {
    throw new Error(`no release for ${tag}; rerun github-release-draft`);
  }
  if (!release.draft) {
    return 'already-published';
  }

  const assets = new Map((await listAssets(octokit, owner, repo, release.id)).map(a => [a.name, a]));
  const missing = expected.filter(e => !assets.has(e.file) || !isComplete(assets.get(e.file), e)).map(e => e.file);
  if (missing.length) {
    throw new Error(
      `draft ${tag} is missing or has incomplete or mismatched (size or sha256) assets: ${missing.join(', ')}`
    );
  }

  const newest = releases
    .filter(r => !r.draft && semver.valid(r.tag_name.replace(/^v/, '')))
    .map(r => r.tag_name.replace(/^v/, ''))
    .sort(semver.rcompare)[0];
  const makeLatest = !newest || semver.gte(version, newest);

  const { data: published } = await octokit.repos.updateRelease({
    owner,
    repo,
    release_id: release.id,
    draft: false,
    make_latest: makeLatest ? 'true' : 'false',
  });
  log(`published ${published.html_url}`);
  return 'published';
};
