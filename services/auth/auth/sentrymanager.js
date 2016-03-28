let Sentry      = require('sentry-api').Client;
let _           = require('lodash');
let taskcluster = require('taskcluster-client');
let debug       = require('debug')('app:sentry');
let assert      = require('assert');

let pattern = /^ managed \(expires-at:([0-9TZ:.-]+)\)$/;
let parseKeys = (keys, prefix) => {
  let results = [];
  for (let k of keys) {
    if (!_.startsWith(k.label, prefix)) {
      continue;
    }
    let match = pattern.exec(k.label.substring(prefix.length));
    if (!match) {
      continue;
    }
    let expires = new Date(match[1]);
    if (isNaN(expires)) {
      continue;
    }
    results.push({
      id:   k.id,
      dsn:  k.dsn,
      expires,
    });
  }
  return _.sortBy(results, k => k.expires.getTime());
};

/** Wrapper for managing Sentry projects and expiring keys */
class SentryManager {
  /**
   * Create SentryManager
   *
   * Options:
   * {
   *   organization:   '...',  // Sentry organization
   *   hostname:       'app.getsentry.com',
   *   apiKey:         '...',  // Organization API key
   *   initialTeam:    '...',  // Initial team for new projects
   *   keyPrefix:      '...',  // Prefix for keys
   * }
   */
  constructor(options) {
    assert(options);
    assert(options.organization);
    assert(options.hostname);
    assert(options.apiKey);
    assert(options.initialTeam);
    assert(options.keyPrefix);
    let url = 'https://' + options.apiKey + ':@' + options.hostname;
    this._sentry = new Sentry(url);
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
      debug(
        'Failed to list keys for %s (will create project), err: %s, stack: %s',
        project, err, err.stack
      );
      // Ignore error try to create the project, and list keys again.
      await this._sentry.teams.createProject(
        this._organization, this._initialTeam, {
        name: project,
        slug: project,
      });
      keys = await this._sentry.projects.keys(this._organization, project);
    }

    // Create new key if most recent key is too old
    key = _.last(parseKeys(keys, this._keyPrefix)); // last is most recent
    if (!key || key.expires < taskcluster.fromNow('25 hours')) {
      // Create new key that expires in 48 hours
      let expires = taskcluster.fromNow('48 hours');
      let k = await this._sentry.projects.createKey(
        this._organization, project, {
        name: this._keyPrefix + ` managed (expires-at:${expires.toJSON()})`,
      });
      key = {
        id:   k.id,
        dsn:  k.dsn,
        expires,
      };
    }

    // Save to cache and return
    return this._projectDSNCache[project] = key;
  }

  /** Remove old expired keys, returns number of keys deleted */
  async purgeExpiredKeys(now = new Date()) {
    // Get a list of all projects from this organization
    let projects = await this._sentry.organizations.projects(this._organization);

    let deleted = 0;
    await Promise.all(projects.map(async (p) => {
      // List all keys for each project
      let keys = await this._sentry.projects.keys(this._organization, p.slug);

      // Find expired keys
      let expiredKeys = parseKeys(keys, this._keyPrefix).filter(key => {
        return key.expires < now;
      });

      // Delete expired keys
      await Promise.all(expiredKeys.map(key => {
        debug('deleting key: %s from project: %s', key.id, p.slug);
        deleted += 1;
        return this._sentry.projects.deleteKey(
          this._organization, p.slug, key.id
        );
      }));
    }));

    return deleted;
  }
}

// Export SentryManager
module.exports = SentryManager;