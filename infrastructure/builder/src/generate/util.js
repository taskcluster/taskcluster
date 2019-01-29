const {promisify} = require('util');
const path = require('path');
const fs = require('fs');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const REPO_ROOT = path.join(__dirname, '../../../../');
exports.REPO_ROOT = REPO_ROOT;

/**
 * Read a file (relative to REPO_ROOT) and return its contents as a utf8 string
 */
exports.readFile = async filename => {
  return await readFile(
    path.join(REPO_ROOT, filename),
    {encoding: 'utf8'});
};

/**
 * Modify a file in-place, calling `await modifier(contents)`.
 *
 * The file is assumed to be utf-8.
 */
exports.modifyFile = async (filename, modifier) => {
  const contents = await readFile(
    path.join(REPO_ROOT, filename),
    {encoding: 'utf8'});
  const modified = await modifier(contents);
  await writeFile(filename, modified, {encoding: 'utf8'});
};

/**
 * Modify a JSON file in-place, calling `await modifier(contents)`.
 *
 * This relies on stability of JSON.parse / JSON.stringify
 */
exports.modifyJSON = async (filename, modifier) => {
  return exports.modifyFile(filename, async contents => {
    const data = JSON.parse(contents);
    const modified = await modifier(data);
    return JSON.stringify(data, null, 2) + '\n';
  });
};
