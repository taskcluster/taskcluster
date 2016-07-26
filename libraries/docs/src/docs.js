let tar = require('tar-stream');
let _ = require('lodash');
let assert = require('assert');
let fs = require('mz/fs');
let path = require('path');
let recursiveReadSync = require('recursive-readdir-sync');
let zlib = require('zlib');
let rootdir = require('app-root-dir');

async function documenter(options) {
  options = _.defaults({}, options, {
    tier: null,
    schemas: {},
    menuIndex: 10,
    docsFolder: rootdir.get() + '/docs',
    references: [],
  });

  assert(options.schemas, 'options.schemas must be given');

  assert(options.tier, 'options.tier must be given');
  assert(['core', 'platform'].indexOf(options.tier) !== -1, 'options.tier is either core or platform');

  let tarball = tar.pack();
  let metadata = {version: 1, tier: options.tier, menuIndex: options.menuIndex};
  let data = JSON.stringify(metadata, null, 2);
  tarball.entry({name: 'metadata.json'}, data);

  let schemas = options.schemas;
  _.forEach(schemas, (name, schema) => {
    let data = JSON.stringify(schema, null, 2);
    tarball.entry({name: 'schema/' + name}, data);
  });

  let references = options.references;
  references.forEach(reference => {
    let data = JSON.stringify(reference, null, 2);
    tarball.entry({name: 'references/' + reference.name + '.json'}, data);
  });

  if (options.docsFolder) {
    try {
      let docs = options.docsFolder;
      let files = recursiveReadSync(options.docsFolder);
      await Promise.all(files.map(async (file) => {
        let relativePath = path.basename(file);
        let data = await fs.readFile(file, {encoding: 'utf8'});
        tarball.entry({name: 'docs/' + relativePath}, data);
      }));
    } catch (err) {
      if (err.code == 'ENOENT') {
        console.log('Docs folder does not exist');
      } else {
        throw err;
      }
    }
  }

  // the stream was added
  // no more entries
  tarball.finalize();
  // tarball.pipe(process.stdout);

  let gzip = zlib.createGzip();
  let tgz = tarball.pipe(gzip);

  let output = {
    tgz,
  };

  return output;
}

module.exports = documenter;
