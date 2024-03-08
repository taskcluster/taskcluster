import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs/promises';
import assert from 'assert';

let _commonSchemas;

const __dirname = new URL('.', import.meta.url).pathname;

/**
 * Read the common schemas from this library's schemas/ directory.  Note
 * that this differs slightly from services' schemas/ directories, in that
 * the files each contain an (abstract) $id, cannot use $const, and are free
 * to $ref anything they like -- all things taskcluster-lib-validate does not
 * allow for services.
 */
export const getCommonSchemas = async () => {
  if (_commonSchemas) {
    return _commonSchemas;
  }

  _commonSchemas = [];
  const dir = path.join(__dirname, '..', 'schemas');

  for (let dentry of await fs.readdir(dir)) {
    if (!dentry.endsWith('.yml')) {
      continue;
    }
    const filename = path.join(dir, dentry);
    try {
      const data = await fs.readFile(filename, 'utf-8');
      const content = yaml.load(data);
      assert(content.$id, `${filename} has no $id`);
      assert(content.$schema, `${filename} has no $id`);
      _commonSchemas.push({ content, filename: `schemas/${dentry}` });
    } catch (err) {
      console.error(`Error reading ${filename}: ${err.message}`);
    }
  }
  return _commonSchemas;
};
