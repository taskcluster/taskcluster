# taskcluster-base-go
<img hspace="20" align="left" src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://secure.travis-ci.org/taskcluster/taskcluster-base-go.png)](http://travis-ci.org/taskcluster/taskcluster-base-go)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-base-go?status.png)](https://godoc.org/github.com/taskcluster/taskcluster-base-go)

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
	givenScopes := scopes.Given{"abc", "def"}
	requiredScopes := scopes.Required{{"ABC", "DEF"}, {"abc", "def", "ghi"}, {"123"}}
	fmt.Printf("Are scopes satisfied? %v\n", givenScopes.Satisfies(&requiredScopes))
}
```

## Contributing
Contributions are welcome. Please fork, and issue a Pull Request back with an explanation of your changes.

## Travis
Travis build [success/failure messages](http://travis-ci.org/taskcluster/taskcluster-base-go) are posted to irc channel #tcclient-go on irc.mozilla.org:6697.
