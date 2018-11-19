const path = require('path');
const util = require('util');
const fs = require('fs');

/**
 * Read all references for this service and add them to the array of references.
 *
 * Note that nothing is determined from the filename - the reference itself contains
 * enough data to determine its eventual URL.
 */
const loadReferences = (serviceDirectory, references) => {
  const referencesDir = path.join(serviceDirectory, 'references');
  if (!fs.existsSync(referencesDir)) {
    return;
  }
  for (let filename of fs.readdirSync(referencesDir)) {
    filename = path.join(referencesDir, filename);
    const data = fs.readFileSync(filename);
    const content = JSON.parse(data);

    references.push({filename, content});
  }
};

/**
 * Read all schemas for this service and add them to the array of schemas
 *
 * Note that the schema filenames are ignored - the schema's $id is enough to determine
 * its eventual URL.
 */
const loadSchemas = (serviceDirectory, schemas) => {
  const schemasDir = path.join(serviceDirectory, 'schemas');
  if (!fs.existsSync(schemasDir)) {
    return;
  }

  const queue = [schemasDir];
  while (queue.length) {
    const filename = queue.shift();
    const st = fs.lstatSync(filename);
    if (st.isDirectory()) {
      for (let dentry of fs.readdirSync(filename)) {
        queue.push(path.join(filename, dentry));
      }
    } else {
      schemas.push({
        filename, 
        content: JSON.parse(fs.readFileSync(filename)),
      });
    }
  }
};

/**
 * Load all schemas and references from `directory`.
 */
const load = ({directory}) => {
  const references = [];
  const schemas = [];

  fs.readdirSync(directory).forEach(dentry => {
    const filename = path.join(directory, dentry);
    if (!fs.lstatSync(filename).isDirectory()) {
      throw new Error(`${filename} is not a directory`);
    }

    // load the metadata and check the version
    const metadata = JSON.parse(fs.readFileSync(path.join(filename, 'metadata.json')));
    if (metadata.version !== 1) {
      throw new Error(`${dentry}: unrecognized metadata version`);
    }

    loadReferences(filename, references);
    loadSchemas(filename, schemas);
  });

  return {references, schemas};
};

exports.load = load;
