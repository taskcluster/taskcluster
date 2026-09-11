import _ from 'lodash';
import taskcluster from '@taskcluster/client';
import debugFactory from 'debug';
const debug = debugFactory('app:sentry');
import assert from 'node:assert';
import got from 'got';

class SentryApiClient {
  constructor(origin, { token }) {
    assert(origin);
    assert(token);

    this._client = got.extend({
      prefixUrl: new URL('/api/0/', origin).toString(),
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    this.organizations = {
      projects: org => this._get(`organizations/${encodeURIComponent(org)}/projects/`),
    };
    this.projects = {
      keys: (org, project) => {
        return this._get(`projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/keys/`);
      },
      createKey: (org, project, body) => {
        return this._post(`projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/keys/`, body);
      },
      deleteKey: (org, project, key) => {
        return this._delete(
          `projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/keys/${encodeURIComponent(key)}/`
        );
      },
    };
    this.teams = {
      createProject: (org, team, body) => {
        return this._post(`teams/${encodeURIComponent(org)}/${encodeURIComponent(team)}/projects/`, body);
      },
    };
  }

  _errorFromResponse(err) {
    if (!err.response) {
      return err;
    }

    const { statusCode, statusMessage, body } = err.response;
    let parsedBody = body;
    if (typeof body === 'string') {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        // Ignore JSON parse errors and fall back to the HTTP status.
      }
    }
    if (parsedBody?.detail) {
      return new Error(parsedBody.detail);
    }
    return new Error(`${statusCode}: ${statusMessage}`);
  }

  async _get(path) {
    try {
      return await this._client.get(path).json();
    } catch (err) {
      throw this._errorFromResponse(err);
    }
  }

  async _post(path, body) {
    try {
      return await this._client.post(path, { json: body }).json();
    } catch (err) {
      throw this._errorFromResponse(err);
    }
  }

  async _delete(path) {
    try {
      await this._client.delete(path);
    } catch (err) {
      throw this._errorFromResponse(err);
    }
  }
}

const pattern = /^ managed \(expires-at:([0-9TZ:.-]+)\)$/;
const parseKeys = (keys, prefix) => {
  const results = [];
  for (const k of keys) {
    if (!_.startsWith(k.label, prefix)) {
      continue;
    }
    const match = pattern.exec(k.label.substring(prefix.length));
    if (!match) {
      continue;
    }
    const expires = new Date(match[1]);
    if (Number.isNaN(expires.getTime())) {
      continue;
    }
    results.push({
      id: k.id,
      dsn: k.dsn,
      expires,
    });
  }
  return _.sortBy(results, k => k.expires.getTime());
};

const makeSentryManager = options => {
  const cfgs = ['organization', 'hostname', 'authToken', 'initialTeam', 'keyPrefix'];
  if (cfgs.every(c => options[c])) {
    if (!options.sentryClient) {
      options.sentryClient = new SentryApiClient(`https://${options.hostname}`, {
        token: options.authToken,
      });
    }
    return new SentryManager(options);
  }
  if (cfgs.some(c => options[c])) {
    throw new Error('If any of the SENTRY_ configuration variables are present, ' + 'all must be present');
  }

  return new NullSentryManager();
};

/** Wrapper for managing Sentry projects and expiring keys */
class SentryManager {
  /**
   * Create SentryManager
   *
   * Options:
   * {
   *   organization:   '...',  // Sentry organization
   *   sentryClient:   Sentry API client instance
   *   initialTeam:    '...',  // Initial team for new projects
   *   keyPrefix:      '...',  // Prefix for keys
   * }
   */
  constructor(options) {
    assert(options);
    assert(options.organization);
    assert(options.sentryClient);
    assert(options.initialTeam);
    assert(options.keyPrefix);
    this._sentry = options.sentryClient;
    this._organization = options.organization;
    this._initialTeam = options.initialTeam;
    this._projectDSNCache = {};
    this._keyPrefix = options.keyPrefix;
  }

  /** Get DSN for a project, create project if needed, create key if needed */
  async projectDSN(project) {
    // First check if we have a recent enough version in the cache
    let key = this._projectDSNCache[project];
    if (key && key.expires > taskcluster.fromNow('25 hours')) {
      return key;
    }
    delete this._projectDSNCache[project]; // clear cache

    // If not we have to list the keys
    let keys = null;
    try {
      keys = await this._sentry.projects.keys(this._organization, project);
    } catch (err) {
      debug('Failed to list keys for %s (will create project), err: %s, stack: %s', project, err, err.stack);
      // Ignore error try to create the project, and list keys again.
      await this._sentry.teams.createProject(this._organization, this._initialTeam, {
        name: project,
        slug: project,
      });
      keys = await this._sentry.projects.keys(this._organization, project);
    }

    // Create new key if most recent key is too old
    key = _.last(parseKeys(keys, this._keyPrefix)); // last is most recent
    if (!key || key.expires < taskcluster.fromNow('25 hours')) {
      // Create new key that expires in 48 hours
      const expires = taskcluster.fromNow('48 hours');
      const k = await this._sentry.projects.createKey(this._organization, project, {
        name: `${this._keyPrefix} managed (expires-at:${expires.toJSON()})`,
      });
      key = {
        id: k.id,
        dsn: k.dsn,
        expires,
      };
    }

    // Save to cache and return
    this._projectDSNCache[project] = key;
    return key;
  }

  /** Remove old expired keys, returns number of keys deleted */
  async purgeExpiredKeys(now = new Date()) {
    // Get a list of all projects from this organization
    const projects = await this._sentry.organizations.projects(this._organization);

    let deleted = 0;
    await Promise.all(
      projects.map(async p => {
        // List all keys for each project
        const keys = await this._sentry.projects.keys(this._organization, p.slug);

        // Find expired keys
        const expiredKeys = parseKeys(keys, this._keyPrefix).filter(key => {
          return key.expires < now;
        });

        // Delete expired keys
        await Promise.all(
          expiredKeys.map(key => {
            debug('deleting key: %s from project: %s', key.id, p.slug);
            deleted += 1;
            return this._sentry.projects.deleteKey(this._organization, p.slug, key.id);
          })
        );
      })
    );

    return deleted;
  }
}

class NullSentryManager {
  async projectDSN(_project) {
    return null;
  }

  async purgeExpiredKeys(_now) {
    return 0;
  }
}

// Export SentryManager
export default makeSentryManager;
export { SentryApiClient };
