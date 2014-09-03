superagent-promise
==================

Simple/dumb promise wrapper for superagent. Both `superagent` and
`promise` are peerDependencies.


## Usage

```js
var agent = require('superagent-promise');

// method, url form
agent('GET', 'http://google.com').
  end().
  then(function onResult(res) {
  });

// helper functions: get, head, patch, post, put, del
agent().
  put('http://myxfoo', 'data').
  end().
  then(function(res) {
  });

```
