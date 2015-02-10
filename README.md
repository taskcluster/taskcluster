# taskcluster-client.go
A go (golang) port of taskcluster-client

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

The steps to call an API endpoint are:

1. Choose which API you want to call. There are currently 6 available: https://github.com/petemoore/taskcluster-client-go/blob/master/model/apis.json
2. Create a new API object based on your choice above, with appopriate clientId and accessToken (optionally you may change the API url and enable/disable authentication).
3. Invoke one of the API methods available on the API object (see documentation, or enable code completion in your IDE)

The API method returns two values: a populated object with the resulting data, unmarshaled from the json response of the API endpoint, and a pointer to the http response object, in case you wish to perform deeper analysis of your result.

Currently the API calls do not return a reference to the API request sent, I am considering adding this too. Let me know your thoughts! Either return a struct with reference to the http request and http response, or return three values in the API methods. Neither solution seems completely attractive.

Here is a slightly more involved example, pointing to an API endpoint on localhost, with authentication disabled (perhaps a taskcluster-proxy, or a dev environment) and calling an API method that requires a payload:

```
package main

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/client"
)

func main() {
	authAPI := client.AuthAPI{}
	authAPI.Authenticate = false
	authAPI.BaseURL = "http://localhost:1234/api/AuthAPI/v1"
	client, _ := authAPI.ModifyClient("gjhvsdfvrnbvsdvfkjhvds", &client.GetClientCredentialsResponse1{Description: "a nice client", Expires: "2016-06-07T13:23:55.213Z", Name: "pmoore_test", Scopes: []string{"*"}})
	fmt.Printf("Access Token: %v\n", client.AccessToken)
	fmt.Printf("Client Id:    %v\n", client.ClientId)
	fmt.Printf("Description:  %v\n", client.Description)
	fmt.Printf("Expires:      %v\n", client.Expires)
	fmt.Printf("Name:         %v\n", client.Name)
	fmt.Printf("Scopes:       %v\n", client.Scopes)
}
```

Notice the ModifyClient api call is passed a GetClientCredentialsResponse1 type, rather than a json string for the updated credentials. This guarantees that the structure of the input is correct. Of course if the input exists as json, it can first be unmarshaled into the required type prior to calling the API method.

In the above example, we discard the http response, by assiging the result to _.

Please note the full package documentation, including all API methods descriptions, is available at http://godoc.org/github.com/petemoore/taskcluster-client-go/client.

Travis build success/failure messages are posted to irc channel #tcclient-go on irc.mozilla.org:6697.
