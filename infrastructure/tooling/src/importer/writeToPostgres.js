const requireFromString = require('require-from-string');
const path = require('path');
const data = require('./data');
const { readRepoFile, REPO_ROOT } = require('../utils');

function convertPathToAbsolute(match, pathToFile, fileName, workingDirectory) {
  return match.replace(pathToFile, path.join(REPO_ROOT, workingDirectory, pathToFile));
}

async function rewriteScript(pathToDataJs) {
  const content = await readRepoFile(pathToDataJs);
  const newContent = content
    .replace(/azure-entities/g, 'taskcluster-lib-entities')
    // Make relative paths absolute
    .replace(
      /require\(['"]([.{1,2}\/]+)(.*)['"]\)/g,
      (match, p1, p2) => convertPathToAbsolute(match, p1, p2, path.dirname(pathToDataJs)),
    );

  return newContent;
}

const writeToPostgres = async (name, entities, utils) => {
  // TODO: Remove this
  if (name !== 'Clients') {
    return;
  }

  const content = await rewriteScript(data[name]);
  requireFromString(content);

  entities.forEach(entity => {
    // Write entity to db
  });
};

module.exports = writeToPostgres;
