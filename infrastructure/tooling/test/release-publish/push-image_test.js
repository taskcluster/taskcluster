import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pushImage, SKOPEO_IMAGE } from '../../src/release-publish/push-image.js';

const VERSION = '1.2.3';
const ctx = { version: VERSION };
const creds = { dockerUsername: 'user', dockerPassword: 'pass' };
const LOCAL = `sha256:${'a'.repeat(64)}`;
const OTHER = `sha256:${'b'.repeat(64)}`;
const noop = () => {};

const manifest = digest =>
  JSON.stringify({ mediaType: 'application/vnd.docker.distribution.manifest.v2+json', config: { digest } });
const found = digest => ({ code: 0, stdout: manifest(digest), stderr: '' });
const MISSING = { code: 1, stdout: '', stderr: 'manifest unknown: manifest unknown' };

// Answers `gzip` and skopeo-in-docker commands; `remote` is the sequence of answers to
// inspecting the registry (the last one repeats).
const fakeExec = remote => {
  const calls = [];
  const exec = async command => {
    calls.push(command);
    if (command[0] === 'gzip') {
      return { code: 0, stdout: '', stderr: '' };
    }
    const args = command.slice(command.indexOf(SKOPEO_IMAGE) + 1);
    if (args[0] === 'inspect' && args.at(-1).startsWith('docker-archive:')) {
      return found(LOCAL);
    }
    if (args[0] === 'inspect') {
      return remote.length > 1 ? remote.shift() : remote[0];
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const skopeo = verb => calls.filter(c => c.includes(SKOPEO_IMAGE) && c[c.indexOf(SKOPEO_IMAGE) + 1] === verb);
  return { exec, calls, copies: () => skopeo('copy'), inspects: () => skopeo('inspect') };
};

suite('release-publish push-image', () => {
  let dir;

  const record = ({ name = 'livelog', tag = `taskcluster/livelog:v${VERSION}`, digest = LOCAL } = {}) => {
    fs.writeFileSync(path.join(dir, `${name}.tar.gz`), 'archive');
    fs.writeFileSync(path.join(dir, `${name}.tag`), `${tag}\n`);
    fs.writeFileSync(path.join(dir, `${name}.digest`), `${digest}\n`);
  };
  const push = (fake, options = {}) =>
    pushImage({ ctx, creds, dir, name: 'livelog', exec: fake.exec, sleep: noop, log: noop, ...options });

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-image-test-'));
  });

  teardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('pushes a missing tag, then verifies it', async () => {
    record();
    const fake = fakeExec([MISSING, found(LOCAL)]);
    assert.equal(await push(fake), 'pushed');
    assert.equal(fake.copies().length, 1);
    assert.equal(fake.copies()[0].at(-1), `docker://docker.io/taskcluster/livelog:v${VERSION}`);
  });

  test('is a no-op when the remote config digest is the same', async () => {
    record();
    const fake = fakeExec([found(LOCAL)]);
    assert.equal(await push(fake), 'exists');
    assert.equal(fake.copies().length, 0);
  });

  test('refuses to overwrite a tag with a different digest', async () => {
    record();
    const fake = fakeExec([found(OTHER)]);
    await assert.rejects(push(fake), /refusing to overwrite/);
    assert.equal(fake.copies().length, 0);
  });

  test('rejects an unknown image name, a tag mismatch and a malformed digest', async () => {
    const fake = fakeExec([MISSING]);
    await assert.rejects(push(fake, { name: 'evil' }), /unknown image name/);
    record({ tag: 'evil/livelog:latest' });
    await assert.rejects(push(fake), /does not match expected tag/);
    record({ digest: 'sha256:abc' });
    await assert.rejects(push(fake), /malformed/);
    assert.deepEqual(fake.calls, []);
  });

  test('a missing credential helper is not treated as a missing tag', async () => {
    record();
    const stderr = 'error getting credentials - err: exec: "docker-credential-desktop": executable file not found';
    const fake = fakeExec([{ code: 1, stdout: '', stderr }]);
    await assert.rejects(push(fake), /docker-credential-desktop/);
    assert.equal(fake.copies().length, 0);
  });

  test('a docker run failure (exit 125) is not treated as a missing tag', async () => {
    record();
    const fake = fakeExec([{ code: 125, stdout: '', stderr: 'docker: manifest unknown' }]);
    await assert.rejects(push(fake), /exit 125/);
    assert.equal(fake.copies().length, 0);
  });

  test('staging pushes to localhost:5000 with TLS verification off', async () => {
    record();
    const fake = fakeExec([MISSING, found(LOCAL)]);
    assert.equal(await push(fake, { registry: 'localhost:5000', tlsVerify: false }), 'pushed');
    const remote = `docker://localhost:5000/taskcluster/livelog:v${VERSION}`;
    const remoteInspects = fake.inspects().filter(c => c.at(-1) === remote);
    assert.equal(remoteInspects.length, 2);
    assert(remoteInspects.every(c => c.includes('--tls-verify=false')));
    const [copy] = fake.copies();
    assert.equal(copy.at(-1), remote);
    assert(copy.includes('--dest-tls-verify=false'));
  });
});
