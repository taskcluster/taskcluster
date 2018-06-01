const url = require('url');
const path = require('path');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const fs = require('fs');

const writeFile = util.promisify(fs.writeFile);

const storeReferences = async (output, references) => {
  await Promise.all(references.map(async reference => {
    // distinguish references for exchanges and APIs by presence of exchangePrefix
    const basename = reference.exchangePrefix ? 'exchanges.json' : 'api.json';
    const dirname = path.join(output, 'references', reference.serviceName, reference.version);
    await mkdirp(dirname);
    await writeFile(path.join(dirname, basename), JSON.stringify(reference, null, 2));
  }));
};

const storeSchemas = async (output, schemas) => {
  await Promise.all(schemas.map(async schema => {
    const id = url.parse(schema.$id);
    const filename = path.join(output, id.pathname);
    await mkdirp(path.dirname(filename));
    await writeFile(filename, JSON.stringify(schema, null, 2));
  }));
};

/**
 * Load all schemas and references from `input`.
 */
const store = async ({references, schemas, output}) => {
  await rimraf(output);
  await mkdirp(output);

  await Promise.all([
    storeReferences(output, references),
    storeSchemas(output, schemas),
  ]);
};

exports.store = store;

