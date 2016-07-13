let tar = require('tar-stream');
let _ = require('lodash');
let assert = require('assert');
let fs = require('mz/fs');
let path = require('path');
let recursiveReadSync = require('recursive-readdir-sync');

async function documenter(options) {

  options = _.defaults({}, options, {
    schemas: [],
    docsFolder: null,
  });
  assert(options.schemas, 'options.schemas must be given');
  assert(options.schemas instanceof Array, 'options.schemas must be an array');

  let schemas = options.schemas;
  let tarball = tar.pack();

  // add schemas to tarball
  schemas.forEach(schema => {
    let data = JSON.stringify(schema, null, 2);
    tarball.entry({name: 'schema/' + schema.id}, data);
  });

  if (options.docsFolder !== null) {
    // add docs to tarball
    let docs = options.docsFolder;
    let files = recursiveReadSync(options.docsFolder);

    await Promise.all(files.map(async (file) => {
      //remove the path
      let relativePath = path.basename(file);
      let data = await fs.readFile(file, {encoding: 'utf8'});
      tarball.entry({name: 'docs/' + relativePath}, data);
    }));
  }

  tarball.finalize();
  // tarball.pipe(process.stdout);

  let output = {
    tarball,
  };
  return output;
}

module.exports = documenter;
