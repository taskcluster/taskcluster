# superagent-hawk

Extends
[superagent](http://visionmedia.github.io/superagent)
with
[hawk](https://github.com/hueniverse/hawk):

```js
var superagent = require('superagent');
var addHawk = require('superagent-hawk');
var request = addHawk(superagent);

request
  .get('http://things.com')
  .hawk(credential)
  .end(function (res) {
    console.log('yay:', res.body);
  });
```

## Installation

Install with [component](http://component.io):

    $ component install CrowdProcess/superagent-hawk

And with [npm](http://npmjs.org):

    $ npm install superagent-hawk

## API

The normal [superagent](http://visionmedia.github.io/superagent) things,
plus `hawk`:

```js
var superagent = require('superagent');
var addHawk = require('superagent-hawk');
var request = addHawk(superagent);

var credential = {
  "id": "50e17602-f044-41cb-8e5f-ae634cc15fb0",
  "key": "I2Yiq3UGAUR6Oztnv/3JJK6T0clmGTX14d/TJ1qNKio=",
  "algorithm": "sha256"
};

var options = { // look at https://github.com/hueniverse/hawk/blob/master/lib/browser.js#L26
  localtimeOffsetMsec: 500
};

request
  .get('http://resource.com')
  .hawk(credential, options) // options is, well, optional
  .end(function (res) {
    console.log(res.body);
  });
```

and `bewit`:

```js
var superagent = require('superagent');
var addHawk = require('superagent-hawk');
var request = addHawk(superagent);

var bewit = "ZDA1Mzg4Y2UtMGRmYi00NWFlLThlODMtY2Q2MmJlZGE0MDNlXDEzNzM0Njc3NDNcNnJyUjA3QWdOQkVWVHlENCsxOFZTZ2M1OERqWmxrc3VzVHZoOUpLM0JzQT1c";

request
  .get('http://resource.com')
  .bewit(bewit)
  .end(function (res) {
    console.log(res.body);
  });
```

## License

MIT
