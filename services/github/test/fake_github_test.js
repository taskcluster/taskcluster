import assert from 'node:assert';
import _ from 'lodash';
import { Octokit as github } from '@octokit/rest';
import fakeGithubAuth from './github-auth.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function() {

  function checkKeys(obj, platonic) {
    const ours = _.filter(Object.keys(obj), k => !k.startsWith('_'));
    const theirs = Object.keys(platonic);
    assert.deepEqual(_.difference(ours, theirs), []);
    _.forEach(ours, k => {
      if (_.isObject(obj[k]) && obj[k].isSinonProxy) {
        checkKeys(obj[k], platonic[k]);
      }
    });
  }

  test('matches real lib', async function() {
    const inst = await fakeGithubAuth().getInstallationGithub('doesntmatter');
    checkKeys(inst, new github());
  });
});
