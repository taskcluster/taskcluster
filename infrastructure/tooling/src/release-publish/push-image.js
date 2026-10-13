import fs from 'node:fs';
import path from 'node:path';
import { exec as realExec } from './exec.js';
import { fatal, withRetry } from './retry.js';

// Pinned by digest: this image runs with Docker Hub credentials mounted.
// Pinned tag: quay.io/skopeo/stable:v1.20.0 (manifest list digest).
export const SKOPEO_IMAGE =
  'quay.io/skopeo/stable@sha256:47853bb9fb24202af9110531ebd6e43c5f97701254ca290596640290d17942f4';
// Throwaway registry that staging releases push to, so the real push path is exercised.
// Pinned tag: registry:2 (manifest list digest).
export const REGISTRY_IMAGE = 'registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373';

/** Start a local registry on 127.0.0.1:5000 and return a function that removes it. */
export const startScratchRegistry = async ({ exec = realExec } = {}) => {
  // a leftover container from a killed run would make `docker run` fail with "name already in use"
  await exec(['docker', 'rm', '-f', 'release-scratch-registry']);
  const r = await exec([
    'docker',
    'run',
    '-d',
    '--rm',
    '-p',
    '127.0.0.1:5000:5000',
    '--name',
    'release-scratch-registry',
    REGISTRY_IMAGE,
  ]);
  if (r.code !== 0) {
    throw new Error(`could not start scratch registry: ${r.stderr}`);
  }
  return async () => {
    await exec(['docker', 'rm', '-f', 'release-scratch-registry']);
  };
};

const MANIFEST_LIST_TYPES = new Set([
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.index.v1+json',
]);

export const configDigestFromManifest = text => {
  const manifest = JSON.parse(text);
  if (MANIFEST_LIST_TYPES.has(manifest.mediaType) || manifest.manifests) {
    throw fatal('expected an image manifest, got a manifest list');
  }
  return manifest.config.digest;
};

// Exit codes 125-127 come from `docker run` itself (daemon error, command cannot be invoked or
// found), so whatever they print says nothing about the tag. Only a real registry answer counts.
const DOCKER_RUN_FAILURE_CODES = new Set([125, 126, 127]);
const notFound = ({ code, stderr }) =>
  !DOCKER_RUN_FAILURE_CODES.has(code) && /manifest unknown|name unknown/i.test(stderr);

// The destination comes from this table, never from the build artifact: the push runs with
// Docker Hub credentials, so a tampered `.tag` file must not be able to redirect it.
const EXPECTED_TAGS = {
  monoimage: version => `taskcluster/taskcluster:v${version}`,
  'monoimage-devel': version => `taskcluster/taskcluster:v${version}-devel`,
  'generic-worker': version => `taskcluster/generic-worker:v${version}`,
  livelog: version => `taskcluster/livelog:v${version}`,
  'taskcluster-proxy': version => `taskcluster/taskcluster-proxy:v${version}`,
  websocktunnel: version => `taskcluster/websocktunnel:v${version}`,
};

/**
 * Push one image archive built by release-build to Docker Hub. Safe to rerun: an
 * identical image on the registry is a no-op, and a different image under the
 * same tag is a hard failure rather than an overwrite.
 */
export const pushImage = async ({
  ctx,
  creds,
  dir,
  name,
  registry = 'docker.io',
  tlsVerify = true,
  exec = realExec,
  sleep,
  log = console.log,
}) => {
  if (!Object.hasOwn(EXPECTED_TAGS, name)) {
    throw fatal(`unknown image name ${name}; expected one of ${Object.keys(EXPECTED_TAGS).join(', ')}`);
  }
  const tag = EXPECTED_TAGS[name](ctx.version);
  const read = suffix => fs.readFileSync(path.join(dir, `${name}${suffix}`), 'utf8').trim();
  const recordedTag = read('.tag');
  if (recordedTag !== tag) {
    throw fatal(`build record tag ${recordedTag} does not match expected tag ${tag} for ${name}`);
  }
  const localDigest = read('.digest');
  if (!/^sha256:[0-9a-f]{64}$/.test(localDigest)) {
    throw fatal(`build record digest for ${name} is malformed: ${localDigest}`);
  }
  const remoteRef = `docker://${registry}/${tag}`;

  const authDir = fs.mkdtempSync(path.join(dir, 'auth-'));
  const authFile = path.join(authDir, 'auth.json');
  const auth = Buffer.from(`${creds.dockerUsername}:${creds.dockerPassword}`).toString('base64');
  fs.writeFileSync(authFile, JSON.stringify({ auths: { 'docker.io': { auth } } }), { mode: 0o600 });

  const skopeo = args =>
    exec([
      'docker',
      'run',
      '--rm',
      // host networking so the staging scratch registry on 127.0.0.1:5000 is reachable
      '--network',
      'host',
      '-v',
      `${dir}:/work`,
      '-v',
      `${authDir}:/auth:ro`,
      SKOPEO_IMAGE,
      ...args,
    ]);

  try {
    const gunzip = await exec(['gzip', '-d', '-f', '-k', path.join(dir, `${name}.tar.gz`)]);
    if (gunzip.code !== 0) {
      throw new Error(`gzip failed: ${gunzip.stderr}`);
    }

    const archive = await skopeo(['inspect', '--raw', `docker-archive:/work/${name}.tar`]);
    if (archive.code !== 0) {
      throw new Error(`cannot read archive ${name}.tar: ${archive.stderr}`);
    }
    const archiveDigest = configDigestFromManifest(archive.stdout);
    if (archiveDigest !== localDigest) {
      throw new Error(`archive config digest ${archiveDigest} does not match build record ${localDigest}`);
    }

    // resolves to the registry's config digest, or null if the tag does not exist
    const inspectOnce = async () => {
      const r = await skopeo([
        'inspect',
        '--raw',
        '--authfile',
        '/auth/auth.json',
        `--tls-verify=${tlsVerify}`,
        remoteRef,
      ]);
      if (r.code === 0) {
        return configDigestFromManifest(r.stdout);
      }
      if (notFound(r)) {
        return null;
      }
      throw new Error(`skopeo inspect ${tag} (exit ${r.code}): ${r.stderr.trim()}`);
    };
    const remoteDigest = () => withRetry(inspectOnce, { sleep, log, label: `inspect ${tag}` });

    const existing = await remoteDigest();
    if (existing === localDigest) {
      log(`${tag} already on ${registry} with digest ${localDigest}`);
      return 'exists';
    }
    if (existing) {
      throw new Error(
        `${tag} already exists with config digest ${existing}, not ${localDigest}; refusing to overwrite a published tag`
      );
    }

    await withRetry(
      async () => {
        const r = await skopeo([
          'copy',
          '--dest-authfile',
          '/auth/auth.json',
          `--dest-tls-verify=${tlsVerify}`,
          `docker-archive:/work/${name}.tar`,
          remoteRef,
        ]);
        if (r.code !== 0) {
          throw new Error(`skopeo copy ${tag}: ${r.stderr.trim()}`);
        }
      },
      { sleep, log, label: `push ${tag}` }
    );

    // registries can lag briefly after a push, so keep looking while the tag still reads as absent
    const pushed = await withRetry(
      async () => {
        const digest = await inspectOnce();
        if (digest === null) {
          throw new Error(`${tag} not yet visible on ${registry} after push`);
        }
        return digest;
      },
      { sleep, log, label: `verify ${tag}` }
    );
    if (pushed !== localDigest) {
      throw new Error(`after push, ${tag} has config digest ${pushed}, expected ${localDigest}`);
    }
    return 'pushed';
  } finally {
    fs.rmSync(authDir, { recursive: true, force: true });
    fs.rmSync(path.join(dir, `${name}.tar`), { force: true });
  }
};
