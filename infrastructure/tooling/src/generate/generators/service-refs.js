import util from 'util';
import path from 'path';
import mkdirp from 'mkdirp';
import References from 'taskcluster-lib-references';
import { execFile } from 'child_process';
import * as _rimraf from 'rimraf';
const rimraf = util.promisify(_rimraf.default);
import { REPO_ROOT, writeRepoJSON, listServices } from '../../utils/index.js';
const exec = util.promisify(execFile);

/**
 * This file defines a few tasks that call generateReferences for all services,
 * then combine the result into references.json.
 */

const SERVICES = listServices();

const tempDir = path.join(REPO_ROOT, 'temp');
const genDir = path.join(tempDir, 'generated');

export const tasks = [];

/**
 * Extract the docs/refs information from each service
 */
SERVICES.forEach(name => {
  tasks.push({
    title: `Generate References for ${name} `,
    requires: [],
    provides: [`refs-${name}`],
    run: async (requirements, utils) => {
      const svcDir = path.join(genDir, name);

      await mkdirp(genDir);
      await rimraf(svcDir);

      const { stdout } = await exec('node', [`services/${name}/src/main.js`, 'generateReferences'], {
        cwd: REPO_ROOT,
        env: Object.assign({}, process.env, { NODE_ENV: 'production' }),
        maxBuffer: 10 * 1024 ** 2, // 10MB should be enough for anyone
      });

      return {
        [`refs-${name}`]: JSON.parse(stdout),
      };
    },
  });
});

tasks.push({
  title: `Generate References`,
  requires: [
    ...SERVICES.map(name => `refs-${name}`),
    'config-values-schema',
    'generic-worker-schemas',
    'docker-worker-schemas',
  ],
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
        ({ filename, content }) => files.set(filename, content)));
    requirements['generic-worker-schemas'].forEach(
      ({ filename, content }) => files.set(filename, content));
    requirements['docker-worker-schemas'].forEach(
      ({ filename, content }) => files.set(filename, content));

    // add config-values-schema, mostly so that it can be referenced in the manual
    files.set('schemas/common/values.schema.json', requirements['config-values-schema']);

    // round-trip that through References to validate and disambiguate
    // everything
    const references = References.fromSerializable({
      serializable: [...files.entries()].map(
        ([filename, content]) => ({ filename, content })),
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
