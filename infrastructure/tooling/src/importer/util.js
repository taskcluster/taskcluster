const path = require('path');
const { readRepoFile, REPO_ROOT } = require('../utils');

exports.fail = msg => {
  console.error(msg);
  process.exit(1);
};

exports.convertPathToAbsolute = (match, pathToFile, fileName, workingDirectory) => {
  return match.replace(pathToFile, path.join(REPO_ROOT, workingDirectory, pathToFile));
};

exports.rewriteScript = async (pathToDataJs) => {
  const content = await readRepoFile(pathToDataJs);
  const newContent = content
    .replace(/azure-entities/g, 'taskcluster-lib-entities')
    // Make relative paths absolute
    .replace(
      /require\(['"]([^\/][.{1,2}\/]+)([^'"]+)['"]\)/g,
      (match, p1, p2) => exports.convertPathToAbsolute(match, p1, p2, path.dirname(pathToDataJs)),
    );

  return newContent;
};
