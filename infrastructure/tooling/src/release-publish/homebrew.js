import semver from 'semver';
import { fatal, withRetry } from './retry.js';

const TAP = { owner: 'taskcluster', repo: 'homebrew-tap', path: 'Casks/taskcluster.rb' };

// The platforms goreleaser writes into the cask (.goreleaser.yaml homebrew_casks).
const CASK_PLATFORMS = ['darwin-amd64', 'darwin-arm64', 'linux-amd64', 'linux-arm64'];

export const expectedCaskUrls = tag =>
  CASK_PLATFORMS.map(
    p => `https://github.com/taskcluster/taskcluster/releases/download/${tag}/taskcluster-${p}.tar.gz`
  );

export const caskUrls = cask => [...cask.matchAll(/url "([^"]+)"/g)].map(m => m[1]);

const waitForUrl = (url, { sleep, log }) =>
  withRetry(
    async () => {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status !== 200) {
        throw new Error(`${url} returned ${res.status}`);
      }
    },
    { attempts: 8, baseMs: 3000, sleep, log, label: `HEAD ${url}` }
  );

/**
 * Commit the cask built by binaries-client-shell to the Homebrew tap, but only once
 * every download URL it names is publicly reachable, so `brew upgrade` never 404s.
 */
export const publishHomebrew = async ({ ctx, octokit, cask, sleep, log = console.log }) => {
  if (ctx.staging) {
    throw fatal('publish-homebrew must never run for staging releases');
  }
  if (!cask.includes(`version "${ctx.version}"`)) {
    throw new Error(`cask does not declare version "${ctx.version}" (snapshot build?)`);
  }
  // The cask comes from a build artifact, so never fetch the URLs it names: require it to
  // name exactly this release's assets, and fetch the URLs built from the tag instead.
  // goreleaser writes the version into cask urls as Ruby `#{version}` interpolation.
  const expected = expectedCaskUrls(ctx.tag);
  const found = [...new Set(caskUrls(cask).map(url => url.replaceAll('#{version}', ctx.version)))].sort();
  if (found.length !== expected.length || !expected.every(url => found.includes(url))) {
    throw fatal(`cask urls [${found.join(', ')}] do not match this release's assets [${expected.join(', ')}]`);
  }

  let current;
  try {
    ({ data: current } = await octokit.repos.getContent(TAP));
  } catch (err) {
    if (err.status !== 404) {
      throw err;
    }
  }
  if (current && (Array.isArray(current) || current.type !== 'file')) {
    throw fatal(`${TAP.owner}/${TAP.repo}:${TAP.path} is not a regular file`);
  }
  if (current) {
    const currentCask = Buffer.from(current.content, 'base64').toString();
    if (currentCask === cask) {
      return 'up-to-date';
    }
    // A rerun of an older release's task must never replace a newer release's cask.
    const currentVersion = /^\s*version "([^"]+)"/m.exec(currentCask)?.[1];
    if (semver.valid(currentVersion) && semver.gt(currentVersion, ctx.version)) {
      throw fatal(`the tap already has newer version ${currentVersion}; refusing to downgrade to ${ctx.version}`);
    }
  }

  for (const url of expected) {
    await waitForUrl(url, { sleep, log });
  }

  await octokit.repos.createOrUpdateFileContents({
    ...TAP,
    message: `Brew cask update for taskcluster version ${ctx.tag}`,
    content: Buffer.from(cask).toString('base64'),
    ...(current ? { sha: current.sha } : {}),
  });
  return 'committed';
};
