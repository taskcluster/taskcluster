# Dockerode Promise

Effectively all dockerode async operations which use callbacks should
now use a promise... Its important that dockerode is a peerDependency as
dockerode promise will not include one of its own.

## Usage

```js
var Docker = require('dockerode-promise');

var docker = new Docker({ ... });

docker.run('ubuntu', ['/bin/bash', '-c', 'echo "xx"']).then(
  function (output) {
    // output.result
    // output.container
  }
);

```
