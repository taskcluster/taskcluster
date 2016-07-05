let tar = require('tar-stream');
let _ = require('lodash');
let assert = require('assert');
let fs = require('fs');
let path = require('path');

async function documenter(options) {

  options = _.defaults({}, options, {
    schemas: [],
  });
  assert(options.schemas, 'options.schemas must be given');
  assert(options.schemas instanceof Array, 'options.schemas must be an array');

  let schemas = options.schemas;
  let tarball = tar.pack();

  //add schemas to tarball
  schemas.forEach(schema => {
    let data = JSON.stringify(schema, null, 2);
    tarball.entry({name: 'schema/' + schema.id}, data);
  });

  tarball.finalize();
  // pipe the pack stream somewhere
  tarball.pipe(process.stdout);

  let output = {
    tarball,
  };

  return output;
}

module.exports = documenter;
