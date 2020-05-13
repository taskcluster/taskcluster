const path = require('path');

const DEFAULT_ARTIFACT_PATH = 'public/logs/live.log';
const BACKING_SUFFIX = '_backing';

function getLogsLocationsFromTask(task) {
  var logsPaths = {};

  logsPaths.live = task && task.payload && task.payload.log ?
    task.payload.log : DEFAULT_ARTIFACT_PATH;

  let parsedPath = path.parse(logsPaths.live);
  logsPaths.backing = parsedPath.dir + '/' + parsedPath.name + BACKING_SUFFIX + parsedPath.ext;
  return logsPaths;
}

module.exports = getLogsLocationsFromTask;
