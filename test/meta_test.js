const assert = require('assert');
const path = require('path');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const _ = require('lodash');
const yaml = require('js-yaml');
const depcheck = require('depcheck');
const glob = require('glob');
const {REPO_ROOT} = require('../utils');
const debug = require('debug')('meta');

suite('Repo Meta Tests', function () {
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
