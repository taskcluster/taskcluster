package main

import (
	"os"
	"testing"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

func requireTaskClusterCredentials(t *testing.T) *tcclient.Credentials {
	// check we have all the env vars we need to run this test
	clientID := os.Getenv("TASKCLUSTER_CLIENT_ID")
	accessToken := os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	certificate := os.Getenv("TASKCLUSTER_CERTIFICATE")
	if clientID == "" || accessToken == "" {
		t.Skip("Skipping test since TASKCLUSTER_CLIENT_ID and/or TASKCLUSTER_ACCESS_TOKEN env vars not set")
	}
	return &tcclient.Credentials{
		ClientID:    clientID,
		AccessToken: accessToken,
		Certificate: certificate,
	}
}
