/**
@fileoverview

Builds error objects from failed (non 200 range) http requests.

@module mozilla-treeherder/httperror
*/
var util = require('util');

/**
Add indentation to the given source string.
@private
*/
function indent(source, level) {
  var spacer = '';
  for (var i = 0; i < level; i++) {
    spacer += ' ';
  }

  return source.split('\n').map(function(string) {
    return spacer + string;
  }).join('\n');
}

/**
@constructor
@param {Response} response from supergent request.
@alias module:mozilla-treeherder/httperror
*/
function HttpError(response) {
  var httpErr = response.error;
  var body = {};

  if (typeof response.body === 'object') {
    body = response.body;
  }

  // inherit from the error object
  Error.call(this);
  // build nice human consumable stacks
  Error.captureStackTrace(this, arguments.callee);

  this.name = 'treeherder-error';
  this.status = httpErr.status;
  this.method = httpErr.method;
  this.path = httpErr.path;

  var traceback = '';
  if (body.traceback) {
    traceback += '\n';
    traceback += indent('Treeherder traceback:', 5) + '\n';
    traceback += indent(body.traceback, 7);
  }

  this.message = util.format(
    '[%s %s %s] %s\n%s',
    this.method,
    this.path,
    this.status,
    body.message || httpErr.message,
    traceback
  );
}

HttpError.prototype = Object.create(Error.prototype);

module.exports = HttpError;
