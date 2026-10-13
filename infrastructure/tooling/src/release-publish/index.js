import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import taskcluster from '@taskcluster/client';
import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { loadContext, loadCredentials } from './context.js';
import { fetchDependencyArtifacts } from './artifacts.js';
import { pushImage, startScratchRegistry } from './push-image.js';
import { draftRelease, publishRelease, extractChangelog } from './github-release.js';
import { publishHomebrew } from './homebrew.js';
import { REPO_ROOT, readRepoFile } from '../utils/index.js';

const PluggedOctokit = Octokit.plugin(retry, throttling);

// retry rate-limited requests a few times, logging each one
const onRateLimit = (retryAfter, options, _octokit, retryCount) => {
  const again = retryCount < 3;
  console.log(
    `GitHub rate limit hit for ${options.method} ${options.url}; ` +
      (again ? `retrying (${retryCount + 1}/3) after ${retryAfter}s` : 'giving up')
  );
  return again;
};

// step name -> async ({ ctx, creds, octokit, workDir, fetchArtifacts, name }) => outcome string
const STEPS = {};

STEPS['push-image'] = async ({ ctx, creds, workDir, fetchArtifacts, name }) => {
  if (!name) {
    throw new Error('push-image requires --name');
  }
  await fetchArtifacts('public/build/');
  if (!ctx.staging) {
    return pushImage({ ctx, creds, dir: workDir, name });
  }
  // staging: exercise the real push path against a throwaway local registry
  const stop = await startScratchRegistry();
  try {
    return await pushImage({ ctx, creds, dir: workDir, name, registry: 'localhost:5000', tlsVerify: false });
  } finally {
    await stop();
  }
};

STEPS['github-release-draft'] = async ({ ctx, octokit, workDir, fetchArtifacts }) => {
  const files = await fetchArtifacts('public/build/');
  const changelog = ctx.staging
    ? '(staging release)'
    : extractChangelog(await readRepoFile('CHANGELOG.md'), ctx.version);
  // GITHUB_SHA is set to the pushed commit on every release task; the tag is created there
  const outcome = await draftRelease({
    ctx,
    octokit,
    dir: workDir,
    files,
    changelog,
    commitish: process.env.GITHUB_SHA,
  });
  // publish as an artifact for github-release-publish
  const out = path.join(REPO_ROOT, 'release-out');
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(workDir, 'expected-assets.json'), path.join(out, 'expected-assets.json'));
  return outcome;
};

STEPS['github-release-publish'] = async ({ ctx, octokit, workDir, fetchArtifacts }) => {
  await fetchArtifacts('public/build/');
  const expected = JSON.parse(fs.readFileSync(path.join(workDir, 'expected-assets.json'), 'utf8'));
  return publishRelease({ ctx, octokit, expected });
};

STEPS['publish-homebrew'] = async ({ ctx, octokit, workDir, fetchArtifacts }) => {
  await fetchArtifacts('public/homebrew/');
  const cask = fs.readFileSync(path.join(workDir, 'taskcluster.rb'), 'utf8');
  return publishHomebrew({ ctx, octokit, cask });
};

export const runStep = async ({ step, name }) => {
  const impl = STEPS[step];
  if (!impl) {
    throw new Error(`unknown --step ${step}; use one of ${Object.keys(STEPS).join(', ')}`);
  }
  const proxyUrl = process.env.TASKCLUSTER_PROXY_URL;
  if (!proxyUrl) {
    throw new Error('release:step must run in a task with taskcluster-proxy enabled');
  }
  const rootUrl = process.env.TASKCLUSTER_ROOT_URL;
  if (!rootUrl) {
    throw new Error('release:step requires TASKCLUSTER_ROOT_URL to be set');
  }
  const ctx = loadContext(process.env);
  // push-image needs Docker Hub credentials (staging pushes to an unauthenticated scratch
  // registry); every other step talks to GitHub.
  const required = step === 'push-image' ? (ctx.staging ? [] : ['DOCKER_USERNAME', 'DOCKER_PASSWORD']) : ['GH_TOKEN'];
  const creds = await loadCredentials({ staging: ctx.staging, proxyUrl, required });
  // Talk to the queue directly, without credentials: release-build artifacts are public, and the
  // proxy would re-sign object-service download requests with the task's own credentials, breaking them.
  // This relies on the deployment's anonymous role granting queue:get-task, queue:list-artifacts
  // and queue:get-artifact:public/*.
  const queue = new taskcluster.Queue({ rootUrl });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `release-${step}-`));
  const fetchArtifacts = prefix => fetchDependencyArtifacts({ queue, taskId: ctx.taskId, prefix, destDir: workDir });
  const octokit = new PluggedOctokit({
    auth: creds.ghToken,
    throttle: { onRateLimit, onSecondaryRateLimit: onRateLimit },
  });

  const outcome = await impl({ ctx, creds, octokit, workDir, fetchArtifacts, name });
  console.log(`${step}${name ? ` ${name}` : ''}: ${outcome}`);
};
