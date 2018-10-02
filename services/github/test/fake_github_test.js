const assert = require('assert');
const _ = require('lodash');
const github = require('@octokit/rest');
const fakeGithubAuth = require('./github-auth');

suite('fake github', function() {

  function checkKeys(obj, platonic) {
    let ours = _.filter(Object.keys(obj), k => !k.startsWith('_'));
    let theirs = Object.keys(platonic);
    assert.deepEqual(_.difference(ours, theirs), []);
    _.forEach(ours, k => {
      if (_.isObject(obj[k]) && obj[k].isSinonProxy) {
        checkKeys(obj[k], platonic[k]);
      }
    });
  }

  test('matches real lib', async function() {
    let inst = await fakeGithubAuth().getInstallationGithub();
    checkKeys(inst, github());
  });
});
