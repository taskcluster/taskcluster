const Debug = require('debug');
const get = require('./get');

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

  let url = 'https://queue.taskcluster.net/v1/task/' +
            taskId + '/runs/' + runId + '/artifacts/' + path;
  debug("get artifact: "+url);

  return await get(url);
}
