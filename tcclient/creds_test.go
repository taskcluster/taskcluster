package tcclient_test

import (
	"fmt"
	"os"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

func ExampleConnectionData_CreateTemporaryCredentials() {
	permaCreds := tcclient.Credentials{
		ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
		Certificate: "",
	}
	tempCreds, err := permaCreds.CreateTemporaryCredentials(24*time.Hour, "dummy:scope")
	if err != nil {
		// handle error
	}
	fmt.Printf("Temporary creds:\n%q\n", tempCreds)
}
