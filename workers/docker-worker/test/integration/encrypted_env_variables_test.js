suite('encrypted private env variables', function() {
  var co         = require('co');
  var fs         = require('fs');
  var _          = require('lodash');
  var openpgp    = require('openpgp');
  var testworker = require('../post_task');
  var settings   = require('../settings');
  var slugid     = require('slugid');

  var defaultMessageVersion = '1';
  var secretDataContent1 = 'this is secret data 1';
  var secretDataContent2 = 'this is secret data 2';
  var envVar1 = 'ENV_VAR1';
  var envVar2 = 'ENV_VAR2';
  var pubKey;

  setup(co(function * () {
    settings.configure({
      dockerWorkerPrivateKey: '/worker/test/docker-worker-priv.pem'
    });

    var pubKeyArmored = fs.readFileSync('test\/docker-worker.pem', 'ascii');
    pubKey = openpgp.key.readArmored(pubKeyArmored);
  }));

  function getEncryptedEnvPayload(payloadData) {

    return Promise.all(_.map(payloadData, function(data) {

     // Create message to encrypt
      var message = {
        messageVersion: data.messageVersion || defaultMessageVersion,
        taskId: data.taskId,
        startTime: data.startTime || Date.now(),
        endTime: data.endTime || (Date.now() + 30000),
        name: data.name,
        value: data.value
      };
      message = JSON.stringify(message);

      var encryptMessage = openpgp.encryptMessage(pubKey.keys, message);
      return encryptMessage.then(function(encryptedMsg) {
        var unarmoredEncryptedData = openpgp.armor.decode(encryptedMsg).data;
        var result = new Buffer(unarmoredEncryptedData, 'binary').toString('base64');
        return result;
      }).catch(function(error) {
        throw('Unable to encrypt data: ' + error);
      });
    }));
  }

  function getTaskPayload(data) {
    var taskPayload = {
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: ['/bin/bash', '-c', 'echo \"$' + envVar1 + '\";' + 'echo \"$' + envVar2 + '\";'],
        created: data.startTime || Date.now(),
        deadline: data.endTime || (Date.now() + 30000),
        env: { ENV_VAR: 'env var value'},
        }
    };
    return getEncryptedEnvPayload(data).then(function(values) {
      taskPayload.payload.encryptedEnv = [ values[0], values[1] ]
      return taskPayload;
    });
  }

  test('success case', co(function* () {

    var taskId = slugid.v4();
    var taskPayload = yield getTaskPayload(
      [{messageVersion: '1',
        taskId: taskId,
        name: envVar1,
        value: secretDataContent1},
       {messageVersion: '1',
        taskId: taskId,
        name: envVar2,
        value: secretDataContent2}]
    );

    var result = yield testworker(taskPayload, taskId);

    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
    assert.ok(result.log.indexOf(secretDataContent1) !== -1, 'env is dumped');
    assert.ok(result.log.indexOf(secretDataContent2) !== -1, 'env is dumped');
  }));

  test('unsupported message version', co(function* () {

    // Also test that the encrypted env var validation aborts the task
    // if one encrypted var passes vaildation but one validation fails.
    // In this case, the message version of the first message is supported
    // but the message version of the second message is unsupported.
    var taskId = slugid.v4();
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        value: secretDataContent1,
        name: envVar1,
        messageVersion: '1'},
       {taskId: taskId,
        name: envVar2,
        value: secretDataContent2,
        messageVersion: '2'}]
    );

    var expected = 'the version of the message is not supported';
    var result = yield testworker(taskPayload, taskId);
    var log = result.log.replace(/\n/gm, ' ');

    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(log.indexOf(expected) !== -1, 'env is dumped');
  }));

  test('duplicate environment variable', co(function* () {

    var taskId = slugid.v4();
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        name: envVar1,
        value: secretDataContent1},
       {taskId: taskId,
        name: envVar1,
        value: secretDataContent2}]
    );

    var expected = 'an environment variable has been duplicated in the task payload';
    var result = yield testworker(taskPayload, taskId);
    var log = result.log.replace(/\n/gm, ' ');

    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(log.indexOf(expected) !== -1, 'env is dumped');
  }));

  test('conflict with reserved environment variable (TASK_ID)', co(function* () {

    var taskId = slugid.v4();
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        name: 'TASK_ID',
        value: secretDataContent1},
       {taskId: taskId,
        name: envVar1,
        value: secretDataContent2}]
    );

    var expected = 'an environment variable conflicts with an existing environment variable';
    var result = yield testworker(taskPayload, taskId);
    var log = result.log.replace(/\n/gm, ' ');

    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(log.indexOf(expected) !== -1, 'env is dumped');
  }));

  test('conflict with reserved environment variable (RUN_ID)', co(function* () {

    var taskId = slugid.v4();
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        name: 'RUN_ID',
        value: secretDataContent1},
       {taskId: taskId,
        name: envVar1,
        value: secretDataContent2}]
    );

    var expected = 'an environment variable conflicts with an existing environment variable';
    var result = yield testworker(taskPayload, taskId);
    var log = result.log.replace(/\n/gm, ' ');

    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(log.indexOf(expected) !== -1, 'env is dumped');
  }));

  test('invalid taskId', co(function* () {

    var taskId = 0;
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        name: envVar1,
        value: secretDataContent1,
        messageVersion: '1'},
       {taskId: taskId,
        name: envVar2,
        value: secretDataContent2,
        messageVersion: '1'}]
    );

    var expected = 'the taskId of the env payload does not match ' +
                   'the taskId of the task';

    // Let task id of task default to a valid task id
    var result = yield testworker(taskPayload);
    var log = result.log.replace(/\n/gm, ' ');

    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(log.indexOf(expected) !== -1);
  }));

  test('start time is in the future', co(function* () {

    var taskId = slugid.v4();
    var startTime = (Date.now() + 120000);
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        startTime: startTime,
        name: envVar1,
        value: secretDataContent1,
        messageVersion: '1'},
       {taskId: taskId,
        startTime: startTime,
        name: envVar2,
        value: secretDataContent2,
        messageVersion: '1'}]
    );

    var expected = 'the start time in the env payload is in the future';
    var result = yield testworker(taskPayload, taskId);
    var log = result.log.replace(/\n/gm, ' ');

    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(log.indexOf(expected) !== -1);
  }));

  test('end time is in the past', co(function* () {

    var taskId = slugid.v4();
    var endTime = (Date.now() - 1);
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        endTime: endTime,
        name: envVar1,
        value: secretDataContent1,
        messageVersion: '1'},
       {taskId: taskId,
        endTime: endTime,
        name: envVar2,
        value: secretDataContent2,
        messageVersion: '1'}]
    );

    var expected = 'the end time in the env payload is in the past'; 
    var result = yield testworker(taskPayload, taskId);
    var log = result.log.replace(/\n/gm, ' ');

    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
    assert.ok(log.indexOf(expected) !== -1);
  }));

  test('value includes newlines', co(function* () {

    var taskId = slugid.v4();
    var taskPayload = yield getTaskPayload(
      [{taskId: taskId,
        name: envVar1,
        value: '1\n2\n3\n4',
        messageVersion: '1'},
       {taskId: taskId,
        name: envVar2,
        value: secretDataContent2,
        messageVersion: '1'}]
    );

    // When echoed as part of the command, the newlines in the value
    // become \r\n
    var expected1 = '1\r\n2\r\n3\r\n4';
    var expected2 = secretDataContent2;
    var result = yield testworker(taskPayload, taskId);

    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
    assert.ok(result.log.indexOf(expected1) !== -1);
    assert.ok(result.log.indexOf(expected2) !== -1);
  }));
});
