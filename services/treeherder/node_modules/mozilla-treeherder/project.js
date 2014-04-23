/**
@module mozilla-treeherder/project
*/

var assert = require('assert');
var consts = require('./consts');
var crypto = require('crypto');
var request = require('superagent-promise');

var Promise = require('promise');
var OAuth = require('oauth').OAuth;
var HttpError = require('./httperror');

/**
@kind constant
default treeherder user.
*/
var TREEHERDER_USER = 'treeherder-node ' + require('./package').version;

function buildRequest(oauth, user, method, url, body) {
  // we need to directly sign the body since oauth node does not do this for us.
  body = JSON.stringify(body || '');

  var queryParams = oauth._prepareParameters(
    null, // no tokens in 2 legged oauth
    null, // ^
    method,
    url,
    /**

    */
    {
      // future book keeping for treeherder not sure what it's going to be used
      // for...
      user: user,

      // node oauth does not provide body hasing but its easy to do so... its
      // always sha1 as far as I can tell (at least the server only cares about
      // sha1)
      oauth_body_hash: crypto.createHash('sha1').update(body).digest('base64'),

      // per http://tools.ietf.org/html/rfc5849#section-2.1 it must be empty if
      // not used to indicate two legged oauth...
      oauth_token: ''
    }
  );

  var req = request(method, url).
    set('Content-Type', 'application/json').
    send(body);

  // map the query parameters in order into an object
  var query = {};
  queryParams.reduce(function(result, value) {
    result[value[0]] = value[1];
    return result;
  }, query);

  req.query(query);

  // return a promise for the result...
  return req.end();
}

/**
Generic helper for resolving http request promises.
@private
*/
function handleResponse(res) {
  if (res.ok) return res.body;
  throw new HttpError(res);
}

/**

@example

var Project = require('mozilla-treeherder/project');
var project = new Project('gaia', {
  consumerKey: 'key',
  consumerSecret: 'secret'
});

@param {String} project name.
@param {Object} config for project.
@param {String} config.consumerKey for oauth.
@param {String} config.consumerSecret also for oauth.
@constructor
@alias module:mozilla-treeherder/project
*/
function Project(project, config) {
  assert(project, 'project is required');

  this.project = project;
  this.user = (config && config.user) || TREEHERDER_USER;
  var url = (config && config.baseUrl) || consts.baseUrl;
  this.url = url + 'project/' + project + '/';

  // generally oauth is only required for posting so don't require it for all
  // requests...
  if (
    config &&
    config.consumerKey &&
    config.consumerSecret
  ) {
    // https://github.com/ciaranj/node-oauth/blob/171e668f386a3e1ba0bcb915b8dc7fdc9335aa62/lib/oauth.js#L9
    this.oauth = new OAuth(
      null, // 2 legged oauth has no urls
      null, // ^
      config.consumerKey, // per project key
      config.consumerSecret, // per project secret
      '1.0', // oauth version
      null, // no callbacks in 2 legged oauth
      'HMAC-SHA1' // signature type expected by the treeherder server.
    );

  }
}

Project.prototype = {
  /**
  Issue a project specific api request with oauth credentials.

  @param {String} method http method type.
  @param {String} path the subpath in the project.
  @param {Object} body of the http request.
  @return {Promise<Object>}
  */
  oauthRequest: function(method, path, body) {
    return new Promise(function(accept, reject) {
      if (!this.oauth) {
        return reject(
          new Error('Cannot issue secured request without consumerKey and consumerSecret')
        );
      }

      buildRequest(
        this.oauth,
        this.user,
        method,
        this.url + path,
        body
      ).then(
        accept,
        reject
      );
    }.bind(this));

  },

  /**
  Issue a project specific api request (which does not require credentials)

  @param {String} method http method type.
  @param {String} path the subpath in the project.
  @return {Promise<Object>}
  */
  request: function(method, path) {
    return request(
      method,
      this.url + path
    ).end();
  },

  /**
  Fetch all resultset(s) for this project.

  @see http://treeherder-dev.allizom.org/docs/#!/project/Result_Set_get_10
  @return {Promise<Array>}
  */
  getResultset: function() {
    return this.request('GET', 'resultset/').then(handleResponse);
  },

  /**
  Update or create a resultset.

  @example

  var resultset = [{
    revision_hash: '435323',
    // it's in seconds
    push_timestamp: 111111
    type: 'push',
    revisions: [{
      comment: 'I did stuff',
      files: [
        'dom/foo/bar',
      ],
      revision: '23333',
      // this must match the project name
      repository: 'gaia',
      author: 'jlal@mozilla.com'
    }]
  }];

  project.postResultset(resultset).then(function(result) {
    // ...
  });

  @see http://treeherder-dev.allizom.org/docs/#!/project/Result_Set_post_9
  @param {Object} resultset full resultset object.
  @return {Promise<Object>}
  */
  postResultset: function(resultset) {
    return this.oauthRequest('POST', 'resultset/', resultset).then(handleResponse);
  },

  /**
  Fetch all the objectstore results for this project.
  @return {Promise<Array>}
  @see http://treeherder-dev.allizom.org/docs/#!/project/Jobs_get_5
  */
  getJobs: function() {
    return this.request('GET', 'jobs/').then(handleResponse);
  },

  /**
  Post a set of jobs.

  @example

  project.postJobs([
    'project': 'gaia',
    'revision_hash': 'sabc'
    'job': {
      'job_guid': 'unique_guid',
      'name': 'Testing gaia',
      'reason': 'scheduler',
      'job_symbol': '?',
      'submit_timestamp': 1387221298,
      'start_timestamp': 1387221345,
      'end_timestamp': 1387222817,
      'state': 'pending',
      'log_references': [],

      // You _must_ pass option collection until
      // https://github.com/mozilla/treeherder-service/issues/112
      'option_collection': {
        'opt': true
      }
    }
  ]);

  @return {Promise<Object>}
  @param {Object} jobs collection.
  @see http://treeherder-dev.allizom.org/docs/#!/project/Jobs_post_4
  */
  postJobs: function(jobs) {
    return this.oauthRequest('POST', 'jobs/', jobs).then(handleResponse);
  }

};

module.exports = Project;
