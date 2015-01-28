# taskcluster-client.go
A go (golang) port of taskcluster-client

Travis build success/failure messages are posted to irc channel #tcclient-go on irc.mozilla.org:6697.

To see the client in action, try something like this:

```
package main

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/model"
)

func main() {
	authApi := model.Auth{ClientId: "HKHww8sqrhvbfnde1b29tQ", AccessToken: "3W_LrgrPSc47645fhdgfjtygHHFdhgfFBhdvrnwGaX5Q"}
	scopes := authApi.Scopes("hjfdhdSHBRhgbdsBFv42tQ")
	fmt.Printf(scopes.String())
}
```
