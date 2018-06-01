const path = require('path');
const util = require('util');
const {walk} = require('walk');
const fs = require('fs');

// fs.promises is only available in Node 10+, so manually promisify things:
const readdir = util.promisify(fs.readdir);
const lstat = util.promisify(fs.lstat);
const exists = util.promisify(fs.exists);
const readFile = util.promisify(fs.readFile);

/**
 * Read all references for this service and add them to the array of references.
 *
 * Note that nothing is determined from the filename - the reference itself contains
 * enough data to determine its eventual URL.
 */
const loadReferences = async (serviceDirectory, references) => {
  const filenames = [
    path.join(serviceDirectory, 'references', 'api.json'),
    path.join(serviceDirectory, 'references', 'exchanges.json'),
  ];

  await Promise.all(filenames.map(async filename => {
    let content;
    try {
      content = await readFile(filename);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
      return; // ignore ENOENT
    }

    references.push(JSON.parse(content));
  }));
};

/**
 * Read all schemas for this service and add them to the array of schemas
 *
 * Note that the schema filenames are ignored - the schema's $id is enough to determine
 * its eventual URL.
 */
const loadSchemas = async (serviceDirectory, schemas) => {
  const schemasDir = path.join(serviceDirectory, 'schemas');
  if (!await exists(schemasDir)) {
    return;
  }

  const queue = [schemasDir];
  while (queue.length) {
    const filename = queue.shift();
    const st = await lstat(filename);
    if (st.isDirectory()) {
      for (let dentry of await readdir(filename)) {
        queue.push(path.join(filename, dentry));
      }
    } else {
      schemas.push(JSON.parse(await readFile(filename)));
    }
  }
};

/**
 * Load all schemas and references from `input`.
 */
const load = async (input) => {
  const references = [];
  const schemas = [];

  await Promise.all((await readdir(input)).map(async dentry => {
    const filename = path.join(input, dentry);
    if (!(await lstat(filename)).isDirectory()) {
      throw new Error(`${filename} is not a directory`);
    }

    // load the metadata and check the version
    const metadata = JSON.parse(await readFile(path.join(filename, 'metadata.json')));
    if (metadata.version !== 1) {
      throw new Error(`${dentry}: unrecognized metadata version`);
    }

    await Promise.all([
      loadReferences(filename, references),
      loadSchemas(filename, schemas),
    ]);
  }));

  return {references, schemas};
};

exports.load = load;
