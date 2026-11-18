import assert from 'node:assert';
import nock from 'nock';
import { loadCredentials } from '../../src/release-publish/context.js';

const proxyUrl = 'http://taskcluster';
const secretName = 'project/taskcluster/release/docker-hub';
const secretPath = `/api/secrets/v1/secret/${encodeURIComponent(secretName)}`;

suite('release-publish loadCredentials', () => {
  teardown(() => {
    nock.cleanAll();
  });

  test('reads the secret named in RELEASE_SECRET', async () => {
    const scope = nock(proxyUrl)
      .get(secretPath)
      .reply(200, { secret: { DOCKER_USERNAME: 'user', DOCKER_PASSWORD: 'pass' }, expires: new Date().toJSON() });
    const creds = await loadCredentials({ secretName, proxyUrl, required: ['DOCKER_USERNAME', 'DOCKER_PASSWORD'] });
    assert.equal(creds.dockerUsername, 'user');
    assert.equal(creds.dockerPassword, 'pass');
    scope.done();
  });

  test('fails when a required key is missing', async () => {
    nock(proxyUrl)
      .get(secretPath)
      .reply(200, { secret: { DOCKER_USERNAME: 'user' }, expires: new Date().toJSON() });
    await assert.rejects(
      loadCredentials({ secretName, proxyUrl, required: ['DOCKER_USERNAME', 'DOCKER_PASSWORD'] }),
      /project\/taskcluster\/release\/docker-hub is missing DOCKER_PASSWORD/
    );
  });

  test('fails when keys are required but the task has no secret', async () => {
    await assert.rejects(
      loadCredentials({ secretName: undefined, proxyUrl, required: ['GH_TOKEN'] }),
      /RELEASE_SECRET must name the secret holding GH_TOKEN/
    );
  });

  test('reads no secret when no keys are required', async () => {
    // nock rejects any request, so this would fail if a secret were fetched
    nock.disableNetConnect();
    try {
      assert.deepEqual(await loadCredentials({ secretName: undefined, proxyUrl, required: [] }), {});
    } finally {
      nock.enableNetConnect();
    }
  });
});
