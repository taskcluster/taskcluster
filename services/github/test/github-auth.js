let Debug = require('debug');
let sinon = require('sinon');
let _ = require('lodash');
let assert = require('assert');

class FakeGithub {
  constructor(installation_id) {
    this._installedOn = null;
    this._taskcluster_yml_files = {};
    this._org_membership = {};
    this._repo_collaborators = {};
    this._github_users = [];
    this._repo_info = {};
    this._repositories = {};
    this._statuses = {};
    this._comments = {};

    const throwError = code => {
      let err = new Error();
      err.code = code;
      throw err;
    };

    const stubs = {
      'repos.createStatus': ({owner, repo, sha, state, target_url, description, context}) => {
        if (repo === 'no-permission') {
          throwError(403);
        }
        const key = `${owner}/${repo}@${sha}`;
        const info = {
          state,
          target_url,
          description,
          context,
        };
        if (!this._statuses[key]) {
          this._statuses[key] = [];
        }
        this._statuses[key].push(info);
      },
      'issues.createComment': ({owner, repo, number, body}) => {
        if (repo === 'no-permission') {
          throwError(403);
        }
        const key = `${owner}/${repo}@${number}`;
        const info = {
          body,
        };
        if (!this._comments[key]) {
          this._comments[key] = [];
        }
        this._comments[key].push(info);
      },
      'repos.createCommitComment': () => {},
      'orgs.checkMembership': async ({org, owner}) => {
        if (this._org_membership[org] && this._org_membership[org].has(owner)) {
          return {};
        } else {
          throwError(404);
        }
      },
      'repos.checkCollaborator': async ({owner, repo, collabuser}) => {
        const key = `${owner}/${repo}`;
        if (this._repo_collaborators[key] && this._repo_collaborators[key].has(collabuser)) {
          return {};
        } else {
          throwError(404);
        }
      },
      'repos.get': async ({owner, repo}) => {
        const key = `${owner}/${repo}`;
        if (this._repo_info[key]) {
          return this._repo_info[key];
        } else {
          throwError(404);
        }
      },
      'repos.getContent': async ({owner, repo, path, ref}) => {
        assert.equal(path, '.taskcluster.yml');
        const key = `${owner}/${repo}@${ref}`;
        if (this._taskcluster_yml_files[key]) {
          return {content: new Buffer(
              JSON.stringify(this._taskcluster_yml_files[key])
            ).toString('base64')};
        } else {
          let err = new Error();
          err.code = 404;
          throw err;
        }
      },
      'users.getById': async ({id}) => {
        let user = _.find(this._github_users, {id});
        if (user) {
          return user;
        } else {
          throwError(404);
        }
      },
      'integrations.getInstallationRepositories': async () => {
        return this._repositories;
      },
      'repos.getStatuses': async ({owner, repo, sha}) => {
        const key = `${owner}/${repo}@${sha}`;
        if (this._statuses[key]) {
          return this._statuses[key];
        } else {
          throwError(404);
        }
      },
      'users.getForUser': async ({user}) => {
        let requested = _.find(this._github_users, {user});
        if (requested) {
          requested.id = parseInt(requested.id, 10);
          return requested;
        } else {
          throwError(404);
        }
      },
    };

    const debug = Debug('FakeGithub');
    _.forEach(stubs, (implementation, name) => {
      let atoms = name.split(/\./);
      let obj = this; // eslint-disable-line consistent-this
      while (atoms.length > 1) {
        const atom = atoms.shift();
        if (!obj[atom]) {
          obj[atom] = {};
        }
        obj = obj[atom];
      }

      const atom = atoms.shift();
      obj[atom] = sinon.spy(async (options) => {
        debug(`inst(${installation_id}).${name}(${JSON.stringify(options)})`);
        return await (implementation || (() => {}))(options);
      });
    });
  }

  setTaskclusterYml({owner, repo, ref, content}) {
    const key = `${owner}/${repo}@${ref}`;
    this._taskcluster_yml_files[key] = content;
  }

  setOrgMember({org, member}) {
    if (!this._org_membership[org]) {
      this._org_membership[org] = new Set();
    }
    this._org_membership[org].add(member);
  }

  setRepoCollaborator({owner, repo, collabuser}) {
    const key = `${owner}/${repo}`;
    if (!this._repo_collaborators[key]) {
      this._repo_collaborators[key] = new Set();
    }
    this._repo_collaborators[key].add(collabuser);
  }

  setRepoInfo({owner, repo, info}) {
    const key = `${owner}/${repo}`;
    this._repo_info[key] = info;
  }

  setUser({id, email, user}) {
    // Please note that here userId is a string. If you need to set up a github API function
    // to get and use userId, you need to use parseInt(id, 10)
    // (as an example, see users.getForUser above)
    this._github_users.push({id: id.toString(), email, user});
  }

  setRepositories(...repoNames) {
    // This function accepts 1 to n strings
    this._repositories.repositories = [...repoNames].map(repo => {return {name: repo};});
    this._repositories.total_count = this._repositories.repositories.length;
  }

  setStatuses({owner, repo, sha, info}) {
    const key = `${owner}/${repo}@${sha}`;
    this._statuses[key] = info;
  }

  getStatuses({owner, repo, sha}) {
    const key = `${owner}/${repo}@${sha}`;
    return this._statuses[key];
  }

  getComments({owner, repo, number}) {
    const key = `${owner}/${repo}@${number}`;
    return this._comments[key];
  }

  hasNextPage() {
    return false;
  }
}

class FakeGithubAuth {
  constructor() {
    this.installations = {};
  }

  resetStubs() {
    this.installations = {};
  }

  async getInstallationGithub(installation_id) {
    return this.inst(installation_id);
  }

  // sync shorthand to getInstallationGithub for use in test scripts
  inst(installation_id) {
    if (!(installation_id in this.installations)) {
      this.installations[installation_id] = new FakeGithub(installation_id);
    }
    return this.installations[installation_id];
  }

  // For testing purposes, insert a new install
  createInstall(installation_id, owner, repos) {
    let installation = new FakeGithub(installation_id);
    installation._installedOn = owner;
    installation.setRepositories(...repos);
    this.installations[installation_id] = installation;
  }

  async getIntegrationGithub() {
    return {
      integrations: {
        getInstallations: async () => {
          return _.map(this.installations, (install, id) => ({
            id: parseInt(id, 10),
            account: {login: install._installedOn},
          }));
        },
      },
    };
  }
}

module.exports = () => new FakeGithubAuth();
