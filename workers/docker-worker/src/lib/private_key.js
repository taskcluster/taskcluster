/*
 * Responsible for decrypting and validating private environment variable in task payload
 */

var debug = require('debug')('docker-worker:privateKey');
var fs      = require('fs');
var _       = require('lodash');
var util = require('util');
var uuid = require('uuid');
var openpgp = require('openpgp');


function PrivateKey(keyFile) {
  this.privateKey = null;

  try {
    var privateKeyArmored = fs.readFileSync(keyFile, 'ascii');
    debug('read private key from: ' + keyFile);

    this.privateKey =
        openpgp.key.readArmored(privateKeyArmored).keys[0];
  }
  catch(e) {
    // Throw error if the private key file cannot be read.  Chances are things
    // are in a bad state if it can't read the key.
    throw new Error(
      util.format('error reading private key from: %s -- %s', keyFile, e)
    );
  }
}

function validateDecryptedData(taskPayload, decryptedData, taskId) {

  var reservedKeys = ['TASK_ID', 'RUN_ID'];

  function logAndThrow(debugMsg, logMsg) {
    var errorPrefix = 'secret data violation';

    var incidentId = uuid.v4();
    debug('%s -- %s; incidentId: %s',
      errorPrefix, debugMsg, incidentId);
    throw new Error(util.format('%s -- %s; incidentId: %s',
      errorPrefix, logMsg, incidentId));
  }

  if (reservedKeys.includes(decryptedData.name)) {
    var debugMsg = 'the environment variable (' + decryptedData.name + ') ' +
                     'conflicts with a reserved environment variable';
    var logMsg = 'an environment variable conflicts with an existing environment variable';
    logAndThrow(debugMsg, logMsg);
  }

  if (taskPayload.env[decryptedData.name] !== undefined) {
    let debugMsg = 'the environment variable (' + decryptedData.name + ') ' +
                   'has been duplicated in the task payload';
    let logMsg = 'an environment variable has been duplicated in the task payload';
    logAndThrow(debugMsg, logMsg);
  }

  if (decryptedData.messageVersion != 1) {
    let debugMsg = 'the version of the message (' + decryptedData.messageVersion + ') ' +
                   'is not supported';
    let logMsg = 'the version of the message is not supported';
    logAndThrow(debugMsg, logMsg);
  }

  if (decryptedData.taskId !== taskId) {
    let debugMsg = 'the taskId of env payload (' + decryptedData.taskId + ') ' +
                   'does not match taskId of task (' + taskId + ')';
    let logMsg = 'the taskId of the env payload does not match ' +
                 'the taskId of the task';
    logAndThrow(debugMsg, logMsg);
  }

  if (decryptedData.startTime > Date.now()) {
    let debugMsg = 'the start time date in the env payload is in the future, ' +
                   'now: ' + Date.now() + ', ' +
                   'env start time date: ' + decryptedData.startTime;
    let logMsg = 'the start time in the env payload is in the future';
    logAndThrow(debugMsg, logMsg);
  }

  if (Date.now() > decryptedData.endTime) {
    let debugMsg = 'the end time in the env payload is in the past, ' +
                   'now: ' + Date.now() + ', ' +
                   'end time: ' + decryptedData.endTime;
    let logMsg = 'the end time in the env payload is in the past';
    logAndThrow(debugMsg, logMsg);
  }
}

PrivateKey.prototype = {
  decryptEnvVariables: function(taskPayload, taskId) {
    var that = this;

    // For each encrypted variable, create a promise and wait for all
    // promises to complete
    return Promise.all(_.map(taskPayload.encryptedEnv, function(encryptedVar) {
      var encryptedVarBuf = new Buffer(encryptedVar, 'base64');
      var armoredEncryptedVar =
        openpgp.armor.encode(openpgp.enums.armor.message, encryptedVarBuf);

      var encryptedVarMessage =
        openpgp.message.readArmored(armoredEncryptedVar);

      var opts = {
        privateKey: that.privateKey,
        message: encryptedVarMessage
      };
      return openpgp.decrypt(opts).then(function(text) {
        // Validate the message
        var decryptedData = JSON.parse(text.data);
        validateDecryptedData(taskPayload, decryptedData, taskId);

        // Overwrite the secret in env, so everything can contine as usual
        taskPayload.env[decryptedData.name] = decryptedData.value;
      });
    }));
  }
};

module.exports = PrivateKey;

