const tar = require('tar-stream');
const _ = require('lodash');
const assert = require('assert');
const fs = require('mz/fs');
const path = require('path');
const zlib = require('zlib');
const promisepipe = require('promisepipe');

const util = require('util');
const mkdirp = util.promisify(require('mkdirp'));

async function documenter(options) {
  assert(options.projectName, 'options.projectName must be given');

  options = _.defaults({}, options, {
    projectName: null,
    schemaset: null,
    references: [],
  });

  return new Documenter(options);
}

module.exports = documenter;

class Documenter {
  constructor(options) {
    this.options = options;
  }

  /**
   * Generate a stream containing a tarball with all of the associated metadata.
   * This is mostly to support the "old way", and when nothing uses the old way
   * anymore this can be adapted to write data directly to DOCS_OUTPUT_DIR.
   *
   * Note that this is a zlib-compressed tarball.
   */
  async _tarballStream() {
    function headers(name, dir) {
      return {name: path.join(dir || '', name)};
    }

    let tarball = tar.pack();

    if (this.options.schemaset) {
      _.forEach(this.options.schemaset.abstractSchemas(), (schema, name) => tarball.entry(
        headers(name, 'schemas'),
        JSON.stringify(schema, null, 2)
      ));
    }

    _.forEach(this.options.references, reference => tarball.entry(
      headers(reference.name + '.json', 'references'),
      JSON.stringify(reference.reference, null, 2)
    ));

    tarball.finalize();
    return tarball.pipe(zlib.createGzip());
  }

  /**
   * Write the tarball to a directory (the new way)
   */
  async write({docsDir}) {
    if (!docsDir) {
      throw new Error('docsDir is not set');
    } else if (fs.existsSync(docsDir)) {
      throw new Error(`docsDir ${docsDir} already exists`);
    }

    // For the moment, this untar's the tarball created elsewhere in this file;
    // when the "old way' is no longer used, this should be refactored to just
    // write the files to the directory directly.
    const extract = tar.extract();

    await new Promise((resolve, reject) => {
      extract.on('entry', (header, stream, next) => {
        // NOTE: we ignore permissions, ownership, etc..
        const pathname = path.join(docsDir, header.name);
        mkdirp(path.dirname(pathname))
          .then(() => promisepipe(stream, fs.createWriteStream(pathname)))
          .then(() => next(), err => reject(err));
      });

      extract.on('finish', resolve);
      extract.on('error', reject);

      this._tarballStream()
        .then(tbStream => tbStream.pipe(zlib.Unzip()).pipe(extract))
        .catch(reject);
    });
  }
}

module.exports = documenter;
