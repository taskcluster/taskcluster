# taskcluster-client.go
A go (golang) port of taskcluster-client

Travis build success/failure messages are posted to irc channel #tcclient-go on irc.mozilla.org:6697.

To see the client in action, try something like this:

```
package main

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/client"
)

func main() {
	authApi := client.NewAuthAPI("hhskdjg476fau1ie1b29tQ", "3W_Lrghkjsdfn467834kgf0SRnKRiWSaKF9urnwGaX5Q")
	scopes, _ := authApi.Scopes("hdjskhfb4nvrh673g4mvfd")
	fmt.Printf("Client ID: %v\n", scopes.ClientId)
	fmt.Printf("Expires:   %v\n", scopes.Expires)
	fmt.Printf("Scopes:    %v\n", scopes.Scopes)
}
```

With suitable/valid authorization parameters provided, this should return content like:

```
pmoore@Elisandra:~/go/src/github.com/petemoore/taskcluster-client-go master $ hack
Client ID:    hdjhtkehgfgdhrb437f$2h
Scopes:       [*]
Expires:      2017-01-31T23:00:00.000Z
```

Please note this client API is currently under development, so is not yet ready for use!
