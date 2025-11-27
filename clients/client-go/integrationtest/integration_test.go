package integrationtest

import (
	"testing"

	"github.com/stretchr/testify/require"
	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v94/internal/testrooturl"
)

// This function tests a simple unauthenticated request for the list of configured
// secrets.
func TestSecretList(t *testing.T) {
	rootURL := testrooturl.Get(t)
	secrets := tcsecrets.New(nil, rootURL)
	list, err := secrets.List("", "")
	require.NoError(t, err)
	for _, secret := range list.Secrets {
		t.Logf("Secret: %s", secret)
	}
}

// This function uses the auth.TestAuthenticate endpoint to check authenticated access.
func TestAuthenticate(t *testing.T) {
	rootURL := testrooturl.Get(t)
	auth := tcauth.New(&tcclient.Credentials{
		ClientID:    "tester",
		AccessToken: "no-secret",
	}, rootURL)
	res, err := auth.TestAuthenticate(&tcauth.TestAuthenticateRequest{
		ClientScopes:   []string{"a:scope"},
		RequiredScopes: []string{"a:scope"},
	})
	require.NoError(t, err)
	require.Equal(t, "tester", res.ClientID)
}
