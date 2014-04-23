superagent-promise
==================

Simple/dumb promise wrapper for superagent. Both `superagent` and
`promise` are peerDependencies. The `.get`, `.del`, etc.. helper methods
are not present here.


## Usage

```js
var agent = require('superagent-promise');

agent('GET', 'http://google.com').end().then(
  function onResult() {
    
  }
);
```
