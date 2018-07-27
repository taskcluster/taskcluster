const debug = require('debug')('test');
const helper = require('./helper');
const assert = require('assert');
const prAllowed = require('../src/pr-allowed');

suite('allowPullRequests', function() {
  helper.withFakeGithub(false, () => false);

  let github = null;

  setup(async function() {
    github = await helper.load('github');
  });

  suite('getRepoPolicy', function() {
    setup(function() {
      github.inst(9999).setRepoInfo({
        owner: 'taskcluster',
        repo: 'testing',
        info: {default_branch: 'development'},
      });
    });

    test('returns "collaborators" when no .taskcluster.yml exists', async function() {
      assert.equal(await prAllowed.getRepoPolicy({
        organization: 'taskcluster',
        repository: 'testing',
        instGithub: github.inst(9999),
        debug,
      }), 'collaborators');
    });

    test('returns "collaborators" when .taskcluster.yml omits allowPullRequests', async function() {
      github.inst(9999).setTaskclusterYml({
        owner: 'taskcluster',
        repo: 'testing',
        ref: 'development',
        content: {},
      });

      assert.equal(await prAllowed.getRepoPolicy({
        organization: 'taskcluster',
        repository: 'testing',
        instGithub: github.inst(9999),
        debug,
      }), 'collaborators');
    });

    test('returns value of allowPullRequests from .taskcluster.yml on default branch', async function() {
      github.inst(9999).setTaskclusterYml({
        owner: 'taskcluster',
        repo: 'testing',
        ref: 'development',
        content: {allowPullRequests: 'maybe'},
      });

      assert.equal(await prAllowed.getRepoPolicy({
        organization: 'taskcluster',
        repository: 'testing',
        instGithub: github.inst(9999),
        debug,
      }), 'maybe');
    });

    test('looks at policy.pullRequests for v1', async function() {
      github.inst(9999).setTaskclusterYml({
        owner: 'taskcluster',
        repo: 'testing',
        ref: 'development',
        content: {version: 1, policy: {pullRequests: 'maybe'}},
      });

      assert.equal(await prAllowed.getRepoPolicy({
        organization: 'taskcluster',
        repository: 'testing',
        instGithub: github.inst(9999),
        debug,
      }), 'maybe');
    });

    test('v1: handles policy without pullRequests property', async function() {
      github.inst(9999).setTaskclusterYml({
        owner: 'taskcluster',
        repo: 'testing',
        ref: 'development',
        content: {version: 1, policy: {otherPolicy: 'sure'}},
      });

      assert.equal(await prAllowed.getRepoPolicy({
        organization: 'taskcluster',
        repository: 'testing',
        instGithub: github.inst(9999),
        debug,
      }), 'collaborators');
    });

    test('v1: handles tc.yml without policy property', async function() {
      github.inst(9999).setTaskclusterYml({
        owner: 'taskcluster',
        repo: 'testing',
        ref: 'development',
        content: {version: 1, tasks: []},
      });

      assert.equal(await prAllowed.getRepoPolicy({
        organization: 'taskcluster',
        repository: 'testing',
        instGithub: github.inst(9999),
        debug,
      }), 'collaborators');
    });
  });

  suite('isCollaborator', function() {
    test('disallows the case where the login is an org member but not collaborator', async function() {
      // (this is a behavior change from old behavior; the code doesn't even call the github method)
      github.inst(9999).setOrgMember({org: 'buildbot', member: 'djmitche'});
      assert.equal(await prAllowed.isCollaborator({
        login: 'djmitche',
        organization: 'buildbot',
        repository: 'buildbot',
        sha: 'abcd',
        instGithub: github.inst(9999),
        debug,
      }), false);
    });

    test('allows the case where the login is a repo collaborator but not org member', async function() {
      github.inst(9999).setRepoCollaborator({owner: 'buildbot', repo: 'bbdocs', username: 'djmitche'});
      assert.equal(await prAllowed.isCollaborator({
        login: 'djmitche',
        organization: 'buildbot',
        repository: 'bbdocs',
        sha: 'abcd',
        instGithub: github.inst(9999),
        debug,
      }), true);
    });

    test('disallows the case where none of this is true', async function() {
      assert.equal(await prAllowed.isCollaborator({
        login: 'djmitche',
        organization: 'buildbot',
        repository: 'bbdocs',
        sha: 'abcd',
        instGithub: github.inst(9999),
        debug,
      }), false);
    });
  });
});
