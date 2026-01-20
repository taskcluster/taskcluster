package tcauth_test

import (
	"fmt"
	"log"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcauth"
)

func Example_scopes() {

	myAuth := tcauth.New(nil, "https://community-tc.services.mozilla.com")

	// Look up client details for client id "project/taskcluster/generic-worker/taskcluster-ci"...
	resp, err := myAuth.Client("project/taskcluster/generic-worker/taskcluster-ci")

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
	// Client ID:  project/taskcluster/generic-worker/taskcluster-ci
	// Expires:    3000-01-01T00:00:00.000Z
}

func Example_updateClient() {

	// In this example we will connect to a local auth server running on
	// localhost:8080 with authentication disabled. This could be, for
	// example, a locally deployed taskcluster-proxy instance.
	myAuth := tcauth.New(nil, "http://tc.example.com")

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
