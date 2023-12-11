import path from 'path';
import fs from 'fs/promises';

/**
 * Read all references for this service and add them to the array of references.
 *
 * Note that nothing is determined from the filename - the reference itself contains
 * enough data to determine its eventual URL.
 */
const loadReferences = async (serviceDirectory) => {
  let references = [];
  const referencesDir = path.join(serviceDirectory, 'references');
  const files = (await fs.readdir(referencesDir))
    .filter(filename => path.extname(filename) === '.json');
  for (let filename of files) {
    filename = path.join(referencesDir, filename);
    const data = await fs.readFile(filename);
    const content = JSON.parse(data);

    references.push({ filename, content });
  }
  return references;
};

/**
 * Read all schemas for this service and add them to the array of schemas
 *
 * Note that the schema filenames are ignored - the schema's $id is enough to determine
 * its eventual URL.
 */
const loadSchemas = async (serviceDirectory) => {
  let schemas = [];
  const schemasDir = path.join(serviceDirectory, 'schemas');
  const queue = [schemasDir];
  while (queue.length) {
    const filename = queue.shift();
    const st = await fs.lstat(filename);
    if (st.isDirectory()) {
      for (let dentry of (await fs.readdir(filename))) {
        queue.push(path.join(filename, dentry));
      }
    } else {
      schemas.push({
        filename,
        content: JSON.parse(await fs.readFile(filename)),
      });
    }
  }
  return schemas;
};

/**
 * Load all schemas and references from `directory`.
 */
const load = async ({ directory }) => {
  let references = [];
  let schemas = [];

  const files = await fs.readdir(directory);
  for (const dentry of files) {
    if (dentry.startsWith('.')) {
      continue;
    }

    const filename = path.join(directory, dentry);
    const st = await fs.lstat(filename);
    if (st.isDirectory()) {
      references = references.concat(await loadReferences(filename));
      schemas = schemas.concat(await loadSchemas(filename));
    } else {
      throw new Error(`${filename} is not a directory`);
    }
  }

  return { references, schemas };
};

export default load;
