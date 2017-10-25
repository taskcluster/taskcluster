# taskcluster-base-go

[![logo](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-base-go.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-base-go)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-base-go?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster-base-go)
[![Coverage Status](https://coveralls.io/repos/taskcluster/taskcluster-base-go/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/taskcluster-base-go?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A go (golang) port of taskcluster-base utility functions.

Complete godoc documentation [here](https://godoc.org/github.com/taskcluster/taskcluster-base-go).

## Building
Run
[build.sh](https://github.com/taskcluster/taskcluster-base-go/blob/master/build.sh)
found in the top level directory.

## Using

### Scopes

Here is an example creating given scopes, required scopes, and evaluating if
the given scopes satisfy the required scopes.

```go
package main

import (
	"fmt"
	"github.com/taskcluster/taskcluster-base-go/scopes"
)

func main() {
	givenScopes := scopes.Given{"queue:*", "docker-worker:image:taskcluster/builder:0.5.6"}
	requiredScopes := scopes.Required{{"queue:define-task:aws-provisioner-v1/build-c4-2xlarge", "docker-worker:cache:tc-vcs"}, {"queue:define-task:*"}}
	fmt.Printf("Are scopes satisfied? %v\n", givenScopes.Satisfies(&requiredScopes))
}
```

See [formal definitions](https://docs.taskcluster.net/presentations/scopes/#/definitions)
for more information about scope satisfaction.

## Contributing
Contributions are welcome. Please fork, and issue a Pull Request back with an
explanation of your changes.

## Travis
Travis build [success/failure messages](http://travis-ci.org/taskcluster/taskcluster-base-go)
are posted to irc channel #taskcluster-bots on irc.mozilla.org:6697.

## TODO

* [x] Respect `assume` scopes (query auth service to expand scopes)
