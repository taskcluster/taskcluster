const {promisify} = require('util');
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const yaml = require('js-yaml');
const stringify = require('json-stable-stringify');
const exec = promisify(require('child_process').execFile);

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

const REPO_ROOT = path.join(__dirname, '../../../../');
exports.REPO_ROOT = REPO_ROOT;

/**
 * List all of the services in the given monorepo repository, defaulting
 * to the current working copy
 */
exports.listServices = ({repoDir}={}) => {
  // look for package.json's, so that we're not fooled by any
  // stray empty or gitignore'd directories
  const packageJsons = glob.sync(
    'services/*/package.json',
    {cwd: repoDir || REPO_ROOT});
  return packageJsons.map(filename => filename.split('/')[1]);
};

/**
 * Asynchronously read a file (relative to REPO_ROOT) and return its contents as a utf8 string
 */
exports.readRepoFile = async filename => {
  return await readFile(
    path.join(REPO_ROOT, filename),
    {encoding: 'utf8'});
};

/**
 * Asynchronously read a JSON file from the current working copy
 */
exports.readRepoJSON = async filename => {
  return JSON.parse(await exports.readRepoFile(filename));
};

/**
 * Write a file out within the current working copy
 */
exports.writeRepoFile = async (filename, data) => {
  return await writeFile(filename, data, {encoding: 'utf8'});
};

/**
 * Write a JSON file out using JSON-stable-stringify within the current working copy
 */
exports.writeRepoJSON = async (filename, data) => {
  return await writeFile(filename, stringify(data, {space: 2}), {encoding: 'utf8'});
};

/**
 * Modify a file in-place in the current working copy, calling `await modifier(contents)`.
 * This function is "sequentialized" so that concurrent modifications do not interfere.
 *
 * The file is assumed to be utf-8.
 */
const modifyRepoFile = async (filename, modifier) => {
  const contents = await readFile(
    path.join(REPO_ROOT, filename),
    {encoding: 'utf8'});
  const modified = await modifier(contents);
  await writeFile(filename, modified, {encoding: 'utf8'});
};

let modifyRepoPromise = Promise.resolve();
exports.modifyRepoFile = (filename, modifier) => {
  modifyRepoPromise = modifyRepoPromise.catch(() => {}).then(() => modifyRepoFile(filename, modifier));
  return modifyRepoPromise;
};

/**
 * Remove a file from the repo
 */
exports.removeRepoFile = async (filename) => {
  await unlink(filename);
};

/**
 * Modify a JSON file in-place in the current working copy, calling `await modifier(contents)`.
 *
 * This relies on stability of JSON.parse / JSON.stringify
 */
exports.modifyRepoJSON = async (filename, modifier) => {
  return exports.modifyRepoFile(filename, async contents => {
    const data = JSON.parse(contents);
    await modifier(data);
    return JSON.stringify(data, null, 2) + '\n';
  });
};

/**
 * Call `git ls-files` in the current working copy
 */
exports.gitLsFiles = async ({patterns}={}) => {
  const opts = {cwd: REPO_ROOT};
  const files = (await exec('git', ['ls-files', '-z'].concat(patterns || []), opts))
    .stdout.split(/\0/)
    .filter(v => v !== '');
  return files;
};

/**
 * Asynchronously read a yaml file from the current working copy
 */
exports.readRepoYAML = async filename => {
  return yaml.safeLoad(await exports.readRepoFile(filename));
};

/**
 * Asynchronously write a yaml file to the current working copy
 */
exports.writeRepoYAML = async (filename, data) => {
  return await writeFile(filename, yaml.safeDump(data, {lineWidth: -1}), {encoding: 'utf8'});
};
