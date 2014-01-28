var URL = require('url');

// default protocol to use if none is present.
var DEFAULT_PROTOCOL = 'http:';

/**
This module parses the modem options from a string if needed.

Given an object his module will return that object.

Given a string the module will parse it and return the correct internal
options as an object.

$PORT:HOST string

```js
parse('127.0.0.1:4243');
// => { host: 'http://127.0.0.1', port: 4243 }

parse('/magic/path');
// => { socketPath: '/magic/path' }
```

@param {String|Object} options for connection.
@return {Object} proper options for modem.
*/
function parse(options) {
  // XXX: should we validate?
  if (typeof options !== 'string') return options;

  // if it starts with a slash its a path
  if (options[0] === '/') return { socketPath: options };

  // default docker options bail if there is a protocol so special case support.
  if (options.indexOf('://') === -1) {
    options = DEFAULT_PROTOCOL + '//' + options;
  }

  var parsed = URL.parse(options);

  // docker in docker uses tcp:// to indicate a docker host. Remap this to http
  if (parsed.protocol.indexOf('http') !== 0) {
    parsed.protocol = DEFAULT_PROTOCOL;
  }

  return {
    host: parsed.protocol + '//' + parsed.hostname,
    port: parseInt(parsed.port, 10)
  };
}

module.exports = parse;

