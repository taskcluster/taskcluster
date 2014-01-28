dockerode-options
=================

Parse dockerode options from a string for DOCKER_HOST and DIND use cases

Dockerode (and most other clients even in other languages) don't
support the same format as DOCKER_HOST so I wrote this to handle the
differences.

## Usage

```js
var dockerOpts = require('dockerode-options');
var Docker = require('dockerode');

// DOCKER_HOST = '127.0.0.1:4243'
var options = dockerOpts(process.env.DOCKER_HOST);
// => { host: 'http://127.0.0.1', port: 4243 }

// these can now be used to start dockerode
var docker = new Docker(options);
```
