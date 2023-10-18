import { Worker, isMainThread, parentPort } from 'worker_threads';
import _ from 'lodash';
import { gitLsFiles, readRepoFile } from '../../utils/index.js';
import * as acorn from 'acorn-loose';
import * as walk from 'acorn-walk';
import builtinModules from 'builtin-modules';
import stringify from 'fast-json-stable-stringify';

const __filename = new URL('', import.meta.url).pathname;

/*
 * The 'depcheck' tool is async but still blocks for long stretches, perhaps
 * doing computation.  So, we defer that to a worker thread.
 */
export const tasks = [];

if (isMainThread) {
  tasks.push({
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

  const checkImport = (file, section, packageName, deps, used) => {
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
  };

  const handleFile = async (file, deps, used, section) => {
    walk.simple(acorn.parse(await readRepoFile(file)), {
      ImportExpression(node) {
        if (node.source.type !== 'Literal') {
          return;
        }
        let packageName = node.source.value;
        return checkImport(file, section, packageName, deps, used);
      },
      ImportDeclaration(node) {
        if (node.source.type !== 'Literal') {
          return;
        }
        let packageName = node.source.value;
        return checkImport(file, section, packageName, deps, used);
      },
      CallExpression(node) {
        if (!node.callee || node.callee.name !== 'require') {
          return;
        }

        // If this is not just a string, this is a dynamic import and we throw our hands up
        if (node.arguments[0].type !== 'Literal') {
          return;
        }

        let packageName = node.arguments[0].value;
        return checkImport(file, section, packageName, deps, used);
      },
    });
  };

  // this portion runs in a worker thread..
  const main = async () => {
    status("setting up");

    // All of our dependencies live at the top level and all dependencies
    // are available in dev so we concat
    const rootPkg = JSON.parse(await readRepoFile('package.json'));
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
