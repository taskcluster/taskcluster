const util = require('util');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const References = require('taskcluster-lib-references');
const exec = util.promisify(require('child_process').execFile);
const {REPO_ROOT, writeJSON, writeFile, removeExtension} = require('../util');

const readdir = util.promisify(fs.readdir);

/**
 * This file defines a few tasks that generate all of the documentation and
 * reference output from each service and include it in generated/docs and
 * generated/references.json.
 */
const SERVICES = glob.sync(
  'services/*/package.json',
  {cwd: REPO_ROOT})
  .map(filename => filename.split('/')[1])
  // this can't run writeDocs without 'yarn build', so ignore it for now.
  .filter(service => service !== 'web-server');

const docsDir = path.join(REPO_ROOT, 'ui', 'docs');
const genDir = path.join(docsDir, 'generated');

exports.tasks = [];

exports.tasks.push({
  title: `Clean Docs`,
  provides: ['clean-docs'],
  run: async (requirements, utils) => {
    await rimraf(genDir);
    await mkdirp(genDir);
  },
});

function createReferenceMarkupContent(reference) {
  const order = reference.startsWith('api') ? 1 : 2;
  const name = removeExtension(reference);

  return [
    '---',
    `order: ${order}`,
    'inline: true',
    `title: ${name}`,
    '---',
    '',
    // path is relative to <generated-dir>/<service-name>/references
    'import Reference from \'../../../../src/views/Documentation/Reference\'',
    `import ${name} from './${reference}'`,
    '',
    `<Reference json={${name}} />`,
    '',
  ].join('\n');
}

async function createReferencesMarkup(svcDir) {
  const referencesDir = path.join(svcDir, 'references');

  try {
    const references = await readdir(referencesDir);

    return Promise.all(references.map(reference => {
      const file = `${removeExtension(reference)}.md`;
      const content = createReferenceMarkupContent(reference);

      return writeFile(path.join(referencesDir, file), content);
    }));
  } catch(error) {
    if (error.code !== 'ENOENT') {
      throw err;
    }
  }
}

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

      // worker-manager uses a different filename from the other services..
      const main = name !== 'worker-manager' ? 'src/main.js' : 'lib/main.js';
      await exec('node', [main, 'writeDocs'], {
        cwd: path.join(REPO_ROOT, 'services', name),
        env: Object.assign({}, process.env, {
          NODE_ENV: 'production',
          PUBLISH_METADATA: 'false',
          DOCS_OUTPUT_DIR: svcDir,
        }),
      });

      await createReferencesMarkup(svcDir);

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
    await writeJSON('ui/docs/generated/references.json', serializable);

    return {
      'target-references': true,
      'references-json': serializable,
    };
  },
});
