import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import glob from 'glob';
import yaml from 'js-yaml';
import stringify from 'json-stable-stringify';
import { execFile } from 'child_process';
import pSynchronize from 'p-synchronize';
const exec = promisify(execFile);

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

const __dirname = new URL('.', import.meta.url).pathname;

export const REPO_ROOT = path.join(__dirname, '../../../../');

/**
 * List all of the services in the given monorepo repository, defaulting
 * to the current working copy
 */
export const listServices = ({ repoDir } = {}) => {
  // look for package.json's, so that we're not fooled by any
  // stray empty or gitignore'd directories
  const packageJsons = glob.sync(
    'services/*/package.json',
    { cwd: repoDir || REPO_ROOT });
  return packageJsons.map(filename => filename.split('/')[1]);
};

/**
 * Asynchronously read a file (relative to REPO_ROOT) and return its contents as a utf8 string
 */
export const readRepoFile = async filename => {
  return await readFile(
    path.join(REPO_ROOT, filename),
    { encoding: 'utf8' });
};

/**
 * Asynchronously read a JSON file from the current working copy
 */
export const readRepoJSON = async filename => {
  return JSON.parse(await readRepoFile(filename));
};

/**
 * Write a file out within the current working copy
 */
export const writeRepoFile = async (filename, data) => {
  return await writeFile(filename, data, { encoding: 'utf8' });
};

/**
 * Write a JSON file out using JSON-stable-stringify within the current working copy
 */
export const writeRepoJSON = async (filename, data) => {
  return await writeFile(filename, stringify(data, { space: 2 }), { encoding: 'utf8' });
};

/**
 * Modify a file in-place in the current working copy, calling `await modifier(contents)`.
 * This function is "synchronized" so that concurrent modifications do not interfere.
 *
 * The file is assumed to be utf-8.
 */
const modifySync = pSynchronize();
export const modifyRepoFile = modifySync(async (filename, modifier) => {
  const contents = await readFile(
    path.join(REPO_ROOT, filename),
    { encoding: 'utf8' });
  const modified = await modifier(contents);
  await writeFile(filename, modified, { encoding: 'utf8' });
});

/**
 * Remove a file from the repo
 */
export const removeRepoFile = async (filename) => {
  await unlink(filename);
};

/**
 * Modify a JSON file in-place in the current working copy, calling `await modifier(contents)`.
 *
 * This relies on stability of JSON.parse / JSON.stringify
 */
export const modifyRepoJSON = async (filename, modifier) => {
  return modifyRepoFile(filename, async contents => {
    const data = JSON.parse(contents);
    await modifier(data);
    return JSON.stringify(data, null, 2) + '\n';
  });
};

/**
 * Modify a YAML file in-place in the current working copy, calling `await modifier(contents)`.
 */
export const modifyRepoYAML = async (filename, modifier) => {
  return modifyRepoFile(filename, async contents => {
    const data = yaml.load(contents);
    await modifier(data);
    return yaml.dump(data, { lineWidth: -1 });
  });
};

/**
 * Call `git ls-files` in the current working copy
 */
export const gitLsFiles = async ({ patterns } = {}) => {
  const opts = { cwd: REPO_ROOT };
  const files = (await exec('git', ['ls-files', '-z'].concat(patterns || []), opts))
    .stdout.split(/\0/)
    .filter(v => v !== '');
  return files;
};

/**
 * Asynchronously read a yaml file from the current working copy
 */
export const readRepoYAML = async filename => {
  return yaml.load(await readRepoFile(filename));
};

/**
 * Asynchronously write a yaml file to the current working copy
 */
export const writeRepoYAML = async (filename, data, yamlOpts = {}) => {
  return await writeFile(filename, yaml.dump(data, { ...yamlOpts, lineWidth: -1 }), { encoding: 'utf8' });
};
