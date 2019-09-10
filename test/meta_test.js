const assert = require('assert');
const path = require('path');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const _ = require('lodash');
const yaml = require('js-yaml');
const depcheck = require('depcheck');
const glob = require('glob');

const ROOT_DIR = path.join(__dirname, '..');

suite('Repo Meta Tests', function () {
  const packageJsonFile = path.join(ROOT_DIR, 'package.json');
  const uiPackageJsonFile = path.join(ROOT_DIR, 'ui/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));
  const uiPackageJson = JSON.parse(fs.readFileSync(uiPackageJsonFile, 'utf8'));

  const taskclusterYmlFile = path.join(ROOT_DIR, '.taskcluster.yml');
  const taskclusterYml = yaml.safeLoad(fs.readFileSync(taskclusterYmlFile, 'utf8'));

  test('All packages in CI', async function () {
    const configured = taskclusterYml.tasks.then.in.$let.packages.map(pkg => pkg.name);

    const { stdout } = await exec('yarn workspaces info -s');
    const existing = Object.keys(JSON.parse(stdout))
      // taskcluster-client is tested separately
      .filter(name => name !== 'taskcluster-client');

    const extra = _.difference(configured, existing);
    const missing = _.difference(existing, configured);

    const warning = 'CI configuration in .taskcluster.yml is misconfigured.';
    assert(missing.length === 0, `${warning} Missing: ${JSON.stringify(missing)}`);
    assert(extra.length === 0, `${warning} Remove: ${JSON.stringify(extra)}`);
  });

  test('Node version in .taskcluster.yml matches that in package.json', function () {
    assert.equal(taskclusterYml.tasks.then.$let.node, packageJson.engines.node);
  });

  test('Node version for UI matches the rest of the repo', function () {
    assert.equal(taskclusterYml.tasks.then.$let.node, uiPackageJson.engines.node);
  });

  test('proper spelling and capitalization of Taskcluster', async function () {
    const Taskcluster = [
      "Task[C]luster",
      "Task [c]luster",
      "Task [C]luster",
      "[tT]skclsuter",
      "[tT]askclsuter",
    ];
    for (let pattern of Taskcluster) {
      try {
        const res = await exec(`git grep '${pattern}' -- './*' ':!.yarn'`);
        // if the grep succeeded, then something matched
        throw new Error(`misspellings found: ${res.stdout}`);
      } catch (err) {
        if (err.code === 1) {
          // git grep found nothing
          continue;
        }
        throw err;
      }
    }
  });

  test('Dependencies are not missing/unused', async function () {
    const depOptions = {
      specials: [], // don't target webpack
    };
    const root = await depcheck(ROOT_DIR, depOptions);
    assert(Object.keys(root.missing).length === 0, `Missing root deps: ${JSON.stringify(root.missing)}`);

    const rootPkg = require(path.join(ROOT_DIR, 'package.json'));
    const rootDeps = (Object.keys(rootPkg.dependencies || {})).concat((Object.keys(rootPkg.devDependencies || {})));

    const { stdout } = await exec('yarn workspaces info -s');
    const packages = Object.values(JSON.parse(stdout)).map(p => p.location);
    const unused = {};
    const missing = {};
    for (const pkg of packages) {
      const leaf = await depcheck(path.join(ROOT_DIR, pkg), depOptions);
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
  });

  test('workspace package.jsons do not have forbidden fields', async function () {
    const packageJsons = glob.sync(
      '{services,libraries}/*/package.json',
      { cwd: ROOT_DIR });

    const forbidden = [
      'engines',
      'engineStrict',
      'engine-strict',
      'dependencies',
      'devDependencies',
      'files',
    ];
    for (let filename of packageJsons) {
      const pj = JSON.parse(fs.readFileSync(filename));
      for (let prop of forbidden) {
        if (pj[prop]) {
          throw new Error(`${filename} contains forbidden property ${prop}`);
        }
      }
    }
  });
  test('headings in docs files match expectations', async function () {
    const markdowns = glob.sync(
      'ui/docs/**/*.mdx',
      { cwd: ROOT_DIR });

    let errors = "";
    let countErrors = 0;

    for (let filename of markdowns) {
      const data = fs.readFileSync(filename, 'utf8');
      let md = data.toString();

      //remove the markdown code blocks which may include python # comment
      // which can be confused with # markdown heading, as in, ui/docs/manual/using/s3-uploads.mdx
      md = md.replace(/```[a-z]*[\s\S]*?\```/g, "");
      const hd = [];

      //hd[i] stores the number of headings with level i
      hd[1] = md.match(/^# /gm);
      hd[2] = md.match(/^## /gm);
      hd[3] = md.match(/^### /gm);
      hd[4] = md.match(/^#### /gm);
      hd[5] = md.match(/^##### /gm);
      hd[6] = md.match(/^###### /gm);

      //counting levels of headings present and marking the top level
      let topLevelHd = 7;
      for (let i = 1; i <= 6; i++) {
        if (hd[i] != null && hd[i].length > 0) {
          if (i < topLevelHd){
            topLevelHd = i;
          }
        }
      }

      // check if there is a single top-level heading
      if (topLevelHd < 7) {
        if (hd[topLevelHd].length > 1) {
          countErrors++;
          errors+=`${filename} does not have a single top level heading\n`;
          console.log(errors);
        }
      }
    }

    //if there are any errors found
    if(countErrors > 0) {
      throw new Error(errors);
    }
  });

  test("no references to tools.taskcluster.net in the repository", async function () {
    const whitelist = new Set([
      '.codecov.yml',
      '.taskcluster.yml',
      'test/meta_test.js',
    ]);

    let res;
    try {
      res = await exec(`git grep 'tools\\.taskcluster\\.net' -- './*' ':!.yarn'`);
    } catch (err) {
      // if the exit status was 1, then git grep found nothing, and the test has passed
      if (err.code === 1) {
        return;
      }
      throw err;
    }

    if (res.stderr !== '') {
      throw new Error(res.stderr);
    }

    const files = new Set(res.stdout
      .split('\n')
      .map(l => l.slice(0, l.indexOf(':')))
      .filter(f => f !== '')
      .filter(f => !whitelist.has(f)));

    if (files.size > 0) {
      let errorString = "The following files have references to tools.taskcluster.net : \n";
      for (let filename of [...files].sort()) {
        errorString += filename + "\n";
      }
      throw new Error(errorString);
    }
  });
});
