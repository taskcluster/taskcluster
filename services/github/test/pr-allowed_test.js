suite('allowPullRequests', function() {
  let debug = require('debug')('test');
  let helper = require('./helper');
  let assert = require('assert');
  let prAllowed = require('../lib/pr-allowed');

  let github = null;

  setup(async () => {
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
      github.inst(9999).setRepoCollaborator({owner: 'buildbot', repo: 'bbdocs', collabuser: 'djmitche'});
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
