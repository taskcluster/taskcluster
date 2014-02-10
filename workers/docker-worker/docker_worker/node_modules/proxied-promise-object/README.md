# proxied-promise-object

Proxy all calls to an objects functions to a wrapper which returns
promises.

NOTE: This does not use "real" proxies (ES6)

## Usage

```js
var Proxy = require('proxied-promise-object');

// Proxy(Promise, object); also works
var fs = new Proxy(YourFavPromiseLib, require('fs'));

fs.stat('xfoo/...').then(
  function() {
  }
);
```

Proxies are stamped as well to protect wrapping proxies with proxies

```js
var fs = new Proxy(YourFavPromiseLib, require('fs'));
var fs2 = new Proxy(YourFavPromiseLib, fs);

// fs === fs2
```
