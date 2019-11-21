const {Worker, isMainThread, parentPort} = require('worker_threads');
const assert = require('assert');
const path = require('path');
const util = require('util');
const depcheck = require('depcheck');
const exec = util.promisify(require('child_process').exec);
const _ = require('lodash');
const {REPO_ROOT} = require('../../utils');

/*
 * The 'depcheck' tool is async but still blocks for long stretches, perhaps
 * doing computation.  So, we defer that to a worker thread.
 */

if (isMainThread) {
  exports.tasks = [];
  exports.tasks.push({
    title: 'Dependencies are used',
    requires: [],
    provides: [],
    run: async (requirements, utils) => {
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {});
        worker.on('message', function ({err, message}) {
          err ? reject(err) : utils.status({message});
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
    parentPort.postMessage({message});
  };

  // this portion runs in a worker thread..
  const main = async () => {
    const depOptions = {
      specials: [], // don't target webpack
    };
    status("root");
    const root = await depcheck(REPO_ROOT, depOptions);
    assert(Object.keys(root.missing).length === 0, `Missing root deps: ${JSON.stringify(root.missing)}`);

    const rootPkg = require(path.join(REPO_ROOT, 'package.json'));
    const rootDeps = (Object.keys(rootPkg.dependencies || {})).concat((Object.keys(rootPkg.devDependencies || {})));

    const { stdout } = await exec('yarn workspaces info -s');
    const packages = Object.values(JSON.parse(stdout)).map(p => p.location);
    const unused = {};
    const missing = {};
    for (const pkg of packages) {
      status(pkg);
      const leaf = await depcheck(path.join(REPO_ROOT, pkg), depOptions);
      if (leaf.dependencies.length !== 0) {
        unused[pkg] = leaf.dependencies;
      }

      // Note that this will be not take into account whether it will be in production or not
      const missed = _.difference(Object.keys(leaf.missing), rootDeps);
      if (missed.length !== 0) {
        missing[pkg] = _.pick(leaf.missing, missed);
      }
    }

    assert(Object.keys(unused).length === 0, `Unused dependencies: ${JSON.stringify(unused, null, 2)}`);
    assert(Object.keys(missing).length === 0, `Missing dependencies: ${JSON.stringify(missing, null, 2)}`);
  };

  main().then(
    () => process.exit(0),
    err => {
      parentPort.postMessage({err});
      process.exit(1);
    });
}
