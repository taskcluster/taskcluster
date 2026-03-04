import path from 'path';
import fs from 'fs/promises';

const directoryExists = async (directory) => {
  try {
    const stat = await fs.stat(directory);
    return stat.isDirectory();
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
};

/**
 * Read all references for this service and add them to the array of references.
 *
 * Note that nothing is determined from the filename - the reference itself contains
 * enough data to determine its eventual URL.
 */
const loadReferences = async (serviceDirectory, references) => {
  const referencesDir = path.join(serviceDirectory, 'references');
  if (!await directoryExists(referencesDir)) {
    return;
  }
  const files = await fs.readdir(referencesDir);
  for (let filename of files.filter(filename => path.extname(filename) === '.json')) {
    filename = path.join(referencesDir, filename);
    const data = await fs.readFile(filename);
    const content = JSON.parse(data);

    references.push({ filename, content });
  }
};

/**
 * Read all schemas for this service and add them to the array of schemas
 *
 * Note that the schema filenames are ignored - the schema's $id is enough to determine
 * its eventual URL.
 */
const loadSchemas = async (serviceDirectory, schemas) => {
  const schemasDir = path.join(serviceDirectory, 'schemas');
  if (!await directoryExists(schemasDir)) {
    return;
  }

  const queue = [schemasDir];
  while (queue.length) {
    const filename = queue.shift();
    if ((await fs.lstat(filename)).isDirectory()) {
      const dentries = await fs.readdir(filename);
      for (let dentry of dentries) {
        queue.push(path.join(filename, dentry));
      }
    } else {
      const data = await fs.readFile(filename);
      schemas.push({
        filename,
        content: JSON.parse(data),
      });
    }
  }
};

/**
 * Load all schemas and references from `directory`.
 */
const load = async ({ directory }) => {
  const references = [];
  const schemas = [];

  const files = await fs.readdir(directory);
  for (const dentry of files) {
    if (dentry.startsWith('.')) {
      return;
    }

    const filename = path.join(directory, dentry);
    if (!(await fs.lstat(filename)).isDirectory()) {
      throw new Error(`${filename} is not a directory`);
    }

    await loadReferences(filename, references);
    await loadSchemas(filename, schemas);
  }

  return { references, schemas };
};

export default load;
