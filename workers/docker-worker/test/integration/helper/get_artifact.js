const Debug = require('debug');
const get = require('./get');
const taskcluster = require('taskcluster-client');

let debug = Debug('test:helper:getArtifact');

/**
Fetch the contents of a single artifact.

@param {Object} result from `.postToQueue` and similar.
@param {String} path path to fetch artifact from.
@return {String} full contents of the artifact.
*/
module.exports = async (result, path) => {
  let taskId = result.taskId;
  let runId = result.runId;

  // expects rootUrl and credentials from env vars
  let queue = new taskcluster.Queue(taskcluster.fromEnvVars());
  let url = queue.buildUrl(queue.getArtifact, taskId, runId, path);
  debug('get artifact: '+url);

  return await get(url);
};
