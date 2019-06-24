package tcauth_test

import (
	"fmt"
	"log"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcauth"
)

func Example_scopes() {

	// Note: the API call we will make doesn't need credentials as it supplies public information.
	// However, for the purpose of demonstrating the general case, this is how you can provide
	// credentials for API calls that require them.
	myAuth := tcauth.New(
		&tcclient.Credentials{
			ClientID:    "SOME-CLIENT-ID",
			AccessToken: "SOME-WELL-FORMED-ACCESS-TOKEN",
		},
		"https://taskcluster.net",
	)

	// Look up client details for client id "project/taskcluster/tc-client-go/tests"...
	resp, err := myAuth.Client("project/taskcluster/tc-client-go/tests")

	// Handle any errors...
	if err != nil {
		log.Printf("Error occurred: %s", err)
		return
	}

	// Report results...
	fmt.Printf("Client ID:  %v\n", resp.ClientID)
	fmt.Printf("Expires:    %v\n", resp.Expires)
	// Could also print expanded scopes, for example:
	//   fmt.Printf("Expanded Scopes:  %v\n", resp.ExpandedScopes)

	// Output:
	// Client ID:  project/taskcluster/tc-client-go/tests
	// Expires:    3017-02-01T05:00:00.000Z
}

func Example_updateClient() {

	// In this example we will connect to a local auth server running on
	// localhost:8080 with authentication disabled. This could be, for
	// example, a locally deployed taskcluster-proxy instance.
	myAuth := tcauth.New(nil, "http://localhost:8080")

	// Set target url to localhost url...
	myAuth.BaseURL = "http://localhost:60024/v1"

	// Update client id "b2g-power-tests" with new description and expiry...
	client, err := myAuth.UpdateClient(
		"b2g-power-tests",
		&tcauth.CreateClientRequest{
			Description: "Grant access to download artifacts for `flame-kk-eng`",
			Expires:     tcclient.Time(time.Now().AddDate(1, 0, 0)),
		},
	)

	// Handle any errors...
	if err != nil {
		log.Printf("Error occurred: %s", err)
		return
	}

	// Report results...
	fmt.Printf("Client Id:        %v\n", client.ClientID)
	fmt.Printf("Created:          %v\n", client.Created)
	fmt.Printf("Description:      %v\n", client.Description)
	fmt.Printf("Expanded Scopes:  %v\n", client.ExpandedScopes)
	fmt.Printf("Expires:          %v\n", client.Expires)
	fmt.Printf("Last Date Used:   %v\n", client.LastDateUsed)
	fmt.Printf("Last Modified:    %v\n", client.LastModified)
	fmt.Printf("Last Rotated:     %v\n", client.LastRotated)
}
