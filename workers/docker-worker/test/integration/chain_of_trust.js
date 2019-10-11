const crypto = require('crypto');
const assert = require('assert');
const Docker = require('../../src/lib/docker');
const fs = require('mz/fs');
const getArtifact = require('./helper/get_artifact');
const cmd = require('./helper/cmd');
const expires = require('./helper/expires');
const testworker = require('../post_task');
const tweetnacl = require('tweetnacl');
const taskcluster = require('taskcluster-client');
const got = require('got');
const {removeImage} = require('../../src/lib/util/remove_image');
const {TASK_ID, TASK_IMAGE_HASH, TASK_IMAGE_ARTIFACT_HASH} = require('../fixtures/image_artifacts');

let docker = Docker();

suite('certificate of trust', () => {
  test('create certificate', async () => {
    let image = {
      type: 'task-image',
      taskId: TASK_ID,
      path: 'public/image.tar'
    };
    let hashedName = crypto.createHash('md5')
      .update(`${TASK_ID}${image.path}`)
      .digest('hex');
    await removeImage(docker, hashedName);

    let expiration = expires();
    let taskDefinition = {
      payload: {
        image: image,
        features: {
          chainOfTrust: true
        },
        command: cmd(
          'mkdir /artifacts/',
          'echo "xfoo" > /artifacts/xfoo.txt',
          'echo "bar" > /artifacts/bar.txt',
          'ls /artifacts'
        ),
        artifacts: {
          'public/xfoo': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/xfoo.txt'
          },

          'public/bar': {
            type: 'file',
            expires: expiration,
            path: '/artifacts/bar.txt'
          }
        },
        maxRunTime: 5 * 60
      }
    };

    let result = await testworker(taskDefinition);

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    let expectedArtifacts = ['public/logs/certified.log',
      'public/chain-of-trust.json',
      'public/chain-of-trust.json.sig',
      'public/logs/live.log',
      'public/logs/live_backing.log',
      'public/xfoo',
      'public/bar'].sort();
    assert.deepEqual(Object.keys(result.artifacts).sort(), expectedArtifacts);

    // ed25519 cot
    let chainOfTrust = await getArtifact(result, 'public/chain-of-trust.json');
    let queue = new taskcluster.Queue(taskcluster.fromEnvVars());
    let url = queue.buildUrl(queue.getArtifact, result.taskId, result.runId, 'public/chain-of-trust.json.sig');
    let chainOfTrustSig = (await got(url, {encoding: null})).body;

    let verifyKey = Buffer.from(fs.readFileSync('test/fixtures/ed25519_public_key', 'ascii'), 'base64');
    let verified = Buffer.from(chainOfTrust);
    assert(tweetnacl.sign.detached.verify(verified, Buffer.from(chainOfTrustSig), verifyKey), 'ed25519 chain of trust signature does not appear to be valid');

    // computer the hash of the live_backing.log which should be the same as the
    // certified log that was uploaded
    let logHash = crypto.createHash('sha256');
    logHash.update(result.log);

    let expectedHashes = {
      'public/xfoo': {sha256: 'cebff86446aff2b1039749f09ef2922f9ad4f35ea2576a84e206708d8e8bf7b4'},
      'public/bar': {sha256: '7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504ded97730'},
      'public/logs/certified.log': {sha256: logHash.digest('hex')}
    };

    let data = JSON.parse(chainOfTrust);
    assert.deepEqual(data.artifacts, expectedHashes);

    assert.equal(data.environment.privateIpAddress, '169.254.1.1');
    assert.equal(data.environment.publicIpAddress, '127.0.0.1');
    assert.equal(data.environment.instanceId, 'test-worker-instance');
    assert.equal(data.environment.instanceType, 'r3-superlarge');
    assert.equal(data.environment.imageHash, TASK_IMAGE_HASH);
    assert.equal(data.environment.imageArtifactHash, TASK_IMAGE_ARTIFACT_HASH);
  });
});
