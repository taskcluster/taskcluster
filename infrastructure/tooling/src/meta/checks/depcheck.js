const { Worker, isMainThread, parentPort } = require('worker_threads');
const _ = require('lodash');
const { REPO_ROOT, gitLsFiles, readRepoFile } = require('../../utils');
const acorn = require("acorn-loose");
const walk = require("acorn-walk");
const builtinModules = require('builtin-modules');
const stringify = require('fast-json-stable-stringify');

/*
 * The 'depcheck' tool is async but still blocks for long stretches, perhaps
 * doing computation.  So, we defer that to a worker thread.
 */

if (isMainThread) {
  exports.tasks = [];
  exports.tasks.push({
    title: 'Dependencies are used and installed',
    requires: [],
    provides: [],
    run: async (requirements, utils) => {
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {});
        worker.on('message', function ({ err, message }) {
          err ? reject(err) : utils.status({ message });
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          } else {
            resolve();
          }
        });
      });
    },
  });
} else {
  const status = message => {
    parentPort.postMessage({ message });
  };

  const handleFile = async (file, deps, used, section) => {
    walk.simple(acorn.parse(await readRepoFile(file)), {
      CallExpression(node) {
        if (!node.callee || node.callee.name !== 'require') {
          return;
        }
        if (node.callee.name === 'import') {
          throw new Error('We do not support import in taskcluster services currently.');
        }

        // If this is not just a string, this is a dynamic import and we throw our hands up
        if (node.arguments[0].type !== 'Literal') {
          return;
        }

        let packageName = node.arguments[0].value;

        // Local imports are less tricky to get right and if broken will fail in tests so we don't
        // bother doing extra work to assert they exist here
        if (packageName.startsWith('.')) {
          return;
        }

        // In non-namespaced packages the first bit before the slash is a package. the rest is a path
        // within the package
        if (!packageName.startsWith('@')) {
          packageName = packageName.split('/')[0];
        }

        if (builtinModules.includes(packageName)) {
          return;
        }

        used.add(packageName);
        if (!deps.includes(packageName)) {
          throw new Error(`Dependency '${packageName}' in ${file} is missing! It must be included in package.json ${section}!`);
        }
      },

    });
  };

  // this portion runs in a worker thread..
  const main = async () => {
    status("setting up");

    // All of our dependencies live at the top level and all dependencies
    // are available in dev so we concat
    const rootPkg = require(`${REPO_ROOT}/package.json`);
    const deps = Object.keys(rootPkg.dependencies);
    const devDeps = Object.keys(rootPkg.devDependencies).concat(deps);
    const specials = rootPkg.metatests.specialImports;

    status("listing files");
    let prodFiles = await gitLsFiles({ patterns: ['services/*/src/**.js', 'libraries/*/src/**.js', 'db/src/**.js', 'services/prelude.js'] });
    prodFiles = prodFiles.filter(f => !f.startsWith('libraries/testing'));
    const devFiles = await gitLsFiles({ patterns: [
      'services/*/test/**.js',
      'libraries/*/test/**.js',
      'db/test/**.js',
      'infrastructure/tooling/**.js',
      'libraries/testing/src/**.js',
      'test/**.js',
    ] });

    let usedInProd = new Set();
    let usedInDev = new Set();

    status("parsing requires");
    await Promise.all(prodFiles.map(f => handleFile(f, deps, usedInProd, 'dependencies')));
    await Promise.all(devFiles.map(f => handleFile(f, devDeps, usedInDev, 'devDependencies')));

    status("calculating extra dependencies");
    usedInProd = [...usedInProd.keys(), ...specials];
    usedInDev = [...usedInDev.keys(), ...specials];

    let extraProd = _.difference(deps, usedInProd);
    const shouldBeDev = _.intersection(extraProd, usedInDev);
    extraProd = _.difference(extraProd, shouldBeDev);
    const extraDev = _.difference(devDeps, [...usedInProd, ...usedInDev]);

    if (shouldBeDev.length) {
      throw new Error(`Dependencies for prod that should be dev! Move ${stringify(shouldBeDev)} from dependencies to devDependencies in package.json`);
    }
    if (extraProd.length) {
      throw new Error(`Extra production dependencies! Remove ${stringify(extraProd)} from dependencies in package.json`);
    }
    if (extraDev.length) {
      throw new Error(`Extra development dependencies! Remove ${stringify(extraDev)} from devDependencies in package.json (or add to metatests.specialImports if required)`);
    }

  };

  main().then(
    () => process.exit(0),
    err => {
      parentPort.postMessage({ err });
      process.exit(1);
    });
}
