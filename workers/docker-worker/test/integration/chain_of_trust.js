import crypto from 'crypto';
import assert from 'assert';
import fs from 'mz/fs';
import getArtifact from './helper/get_artifact';
import cmd from './helper/cmd';
import expires from './helper/expires';
import testworker from '../post_task';
import * as openpgp from 'openpgp';

suite('certificate of trust', () => {
  test('create certificate', async () => {
    let expiration = expires();
    let result = await testworker({
      payload: {
        image: 'taskcluster/test-ubuntu',
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
    });

    // Get task specific results
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');

    let expectedArtifacts = ['public/logs/certified.log',
                             'public/chainOfTrust.json.asc',
                             'public/logs/live.log',
                             'public/logs/live_backing.log',
                             'public/xfoo',
                             'public/bar'].sort();
    assert.deepEqual(Object.keys(result.artifacts).sort(), expectedArtifacts);

    let signedChainOfTrust = await getArtifact(result, 'public/chainOfTrust.json.asc');
    let armoredKey = fs.readFileSync('test/fixtures/gpg_signing_key.asc', 'ascii');
    let key = openpgp.key.readArmored(armoredKey);
    let opts = {
      publicKeys: key.keys,
      message: openpgp.cleartext.readArmored(signedChainOfTrust)
    };
    let verified = await openpgp.verify(opts);

    assert(verified.signatures[0].valid, 'Certificate does not appear to be valid');

    // computer the hash of the live_backing.log which should be the same as the
    // certified log that was uploaded
    let logHash = crypto.createHash('sha256');
    logHash.update(result.log);

    let expectedHashes = {
      'public/xfoo': 'sha256:cebff86446aff2b1039749f09ef2922f9ad4f35ea2576a84e206708d8e8bf7b4',
      'public/bar': 'sha256:7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504ded97730',
      'public/logs/certified.log': `sha256:${logHash.digest('hex')}`
    };

    let data = JSON.parse(verified.data);
    for (let artifact of data.artifacts) {
      assert.equal(expectedHashes[artifact.name], artifact.hash);
    }

    assert.equal(data.extra.privateIpAddress, '169.254.1.1');
    assert.equal(data.extra.publicIpAddress, '127.0.0.1');
    assert.equal(data.extra.instanceId, 'test-worker-instance');
    assert.equal(data.extra.instanceType, 'r3-superlarge');
  });
});
