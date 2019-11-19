const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const References = require('taskcluster-lib-references');
const exec = util.promisify(require('child_process').execFile);
const {REPO_ROOT, writeRepoJSON, listServices} = require('../../utils');

/**
 * This file defines a few tasks that call generateReferences for all services,
 * then combine the result into references.json.
 */

// this can't run writeDocs without 'yarn build', so ignore it for now.
const SERVICES = listServices().filter(service => service !== 'web-server');

const tempDir = path.join(REPO_ROOT, 'temp');
const genDir = path.join(tempDir, 'generated');

exports.tasks = [];

/**
 * Extract the docs/refs information from each service
 */
SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Generate References for ${name} `,
    requires: [],
    provides: [`refs-${name}`],
    run: async (requirements, utils) => {
      const svcDir = path.join(genDir, name);

      await mkdirp(genDir);
      await rimraf(svcDir);

      const {stdout} = await exec('node', ['src/main', 'generateReferences'], {
        cwd: path.join(REPO_ROOT, 'services', name),
        env: Object.assign({}, process.env, {NODE_ENV: 'production'}),
        maxBuffer: 10 * 1024 ** 2, // 10MB should be enough for anyone
      });

      return {
        [`refs-${name}`]: JSON.parse(stdout),
      };
    },
  });
});

exports.tasks.push({
  title: `Generate References`,
  requires: SERVICES.map(name => `refs-${name}`),
  provides: [
    'target-references',
    'references-json',
  ],
  run: async (requirements, utils) => {
    await mkdirp(genDir);

    // combine all of the references, using a map to eliminate duplicate files
    // (the common schemas will be duplicated, for example)
    const files = new Map();
    SERVICES.forEach(
      name => requirements[`refs-${name}`].forEach(
        ({filename, content}) => files.set(filename, content)));

    // round-trip that through References to validate and disambiguate
    // everything
    const references = References.fromSerializable({
      serializable: [...files.entries()].map(
        ([filename, content]) => ({filename, content})),
    });

    // sort the serializable output by filename to ensure consistency
    const serializable = references.makeSerializable();
    serializable.sort((a, b) => {
      if (a.filename < b.filename) {
        return 1;
      } else if (a.filename > b.filename) {
        return -1;
      } else {
        return 0;
      }
    });

    await writeRepoJSON('generated/references.json', serializable);

    return {
      'target-references': true,
      'references-json': serializable,
    };
  },
});
