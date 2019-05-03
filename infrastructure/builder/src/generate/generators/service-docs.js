const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const References = require('taskcluster-lib-references');
const exec = util.promisify(require('child_process').execFile);
const {REPO_ROOT, writeJSON, services} = require('../util');

/**
 * This file defines a few tasks that call writeDocs for all services, then
 * combine the result into references.json.  This could definitely be more
 * efficient, and will be made so in later commits.
 */

// this can't run writeDocs without 'yarn build', so ignore it for now.
const SERVICES = services().filter(service => service !== 'web-server');

const tempDir = path.join(REPO_ROOT, 'temp');
const genDir = path.join(tempDir, 'generated');

exports.tasks = [];

exports.tasks.push({
  title: `Clean Docs`,
  provides: ['clean-docs'],
  run: async (requirements, utils) => {
    await rimraf(genDir);
    await mkdirp(genDir);
  },
});

/**
 * Extract the docs/refs information from each service
 */
SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Extract ${name} Docs Tarball`,
    requires: ['clean-docs'],
    provides: [`docs-tarball-${name}`],
    run: async (requirements, utils) => {
      const svcDir = path.join(genDir, name);

      await mkdirp(genDir);
      await rimraf(svcDir);

      await exec('node', ['src/main', 'writeDocs'], {
        cwd: path.join(REPO_ROOT, 'services', name),
        env: Object.assign({}, process.env, {
          NODE_ENV: 'production',
          DOCS_OUTPUT_DIR: svcDir,
        }),
      });

      return {
        [`docs-tarball-${name}`]: svcDir,
      };
    },
  });
});

exports.tasks.push({
  title: `Generate References`,
  requires: SERVICES.map(name => `docs-tarball-${name}`),
  provides: [
    'target-references',
    'references-json',
  ],
  run: async (requirements, utils) => {
    await mkdirp(genDir);

    const refs = References.fromBuiltServices({directory: genDir});
    const serializable = refs.makeSerializable();

    // clean up the temp output
    await rimraf(genDir);

    // sort the serializable output by filename to ensure consistency
    serializable.sort((a, b) => {
      if (a.filename < b.filename) {
        return 1;
      } else if (a.filename > b.filename) {
        return -1;
      } else {
        return 0;
      }
    });

    await writeJSON('generated/references.json', serializable);

    return {
      'target-references': true,
      'references-json': serializable,
    };
  },
});
