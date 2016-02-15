package tcclient_test

import (
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster-client-go/auth"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

func ExampleCredentials_CreateTemporaryCredentials() {
	permaCreds := tcclient.Credentials{
		ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
		AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
	}
	tempCreds, err := permaCreds.CreateTemporaryCredentials(24*time.Hour, "dummy:scope:1", "dummy:scope:2")
	if err != nil {
		// handle error
	}
	fmt.Printf("Temporary creds:\n%q\n", tempCreds)
}

func Test_CreateTemporaryCredentials_WellFormed(t *testing.T) {
	// fake credentials
	permaCreds := tcclient.Credentials{
		ClientId:    "permacred",
		AccessToken: "eHMnHH7PTSqplJSC_qAJ2QKGt8egfvRaqxczIRgOScaw",
	}

	tempCreds, err := permaCreds.CreateTemporaryCredentials(24*time.Hour, "scope1")
	if err != nil {
		t.Error(err)
	}

	if tempCreds.AuthorizedScopes != nil {
		t.Errorf("temp creds have AuthorizedScopes!?")
	}

	if tempCreds.ClientId != permaCreds.ClientId {
		t.Errorf("%s != %s", tempCreds.ClientId, permaCreds.ClientId)
	}

	// Certificate and AccessToken are nondeterministic; we rely on other tests
	// to verify them
}

// This clientId/accessToken pair is recognized as valid by the testAutheticate endpoint
var testCreds = &tcclient.Credentials{
	ClientId:    "tester",
	AccessToken: "no-secret",
}

func checkAuthenticate(t *testing.T, response *auth.TestAuthenticateResponse, err error, expectedClientId string, expectedScopes []string) {

	if err != nil {
		t.Error(err)
		return
	}

	if response.ClientId != expectedClientId {
		t.Errorf("got unexpected clientId %s", response.ClientId)
	}

	if !reflect.DeepEqual(response.Scopes, expectedScopes) {
		t.Errorf("got unexpected scopes %#v", response.Scopes)
	}
}

func Test_PermaCred(t *testing.T) {
	client := auth.New(testCreds)
	response, _, err := client.TestAuthenticate(&auth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:this"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"scope:*"})
}

func Test_TempCred(t *testing.T) {
	tempCreds, err := testCreds.CreateTemporaryCredentials(1*time.Hour, "scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	client := auth.New(tempCreds)
	response, _, err := client.TestAuthenticate(&auth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"scope:1", "scope:2"})
}

func Test_NamedTempCred(t *testing.T) {
	tempCreds, err := testCreds.CreateNamedTemporaryCredentials("jimmy", 1*time.Hour,
		"scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	client := auth.New(tempCreds)
	response, _, err := client.TestAuthenticate(&auth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*", "auth:create-client:jimmy"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"jimmy", []string{"scope:1", "scope:2"})
}

func Test_TempCred_NoClientId(t *testing.T) {
	baseCreds := tcclient.Credentials{AccessToken: "no-secret"}
	_, err := baseCreds.CreateTemporaryCredentials(1*time.Hour, "s")
	if err == nil {
		t.Errorf("expected error")
	}
}

func Test_TempCred_NoAccessToken(t *testing.T) {
	baseCreds := tcclient.Credentials{ClientId: "tester"}
	_, err := baseCreds.CreateTemporaryCredentials(1*time.Hour, "s")
	if err == nil {
		t.Errorf("expected error")
	}
}

func Test_TempCred_TempBase(t *testing.T) {
	baseCreds := tcclient.Credentials{
		ClientId:    "tester",
		AccessToken: "no-secret",
		Certificate: "{}",
	}
	_, err := baseCreds.CreateTemporaryCredentials(1*time.Hour, "s")
	if err == nil {
		t.Errorf("expected error")
	}
}

func Test_TempCred_TooLong(t *testing.T) {
	_, err := testCreds.CreateTemporaryCredentials(32*24*time.Hour, "s")
	if err == nil {
		t.Errorf("expected error")
	}
}

func Test_AuthorizedScopes(t *testing.T) {
	authCreds := *testCreds
	authCreds.AuthorizedScopes = []string{"scope:1", "scope:3"}
	client := auth.New(&authCreds)
	response, _, err := client.TestAuthenticate(&auth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"scope:1", "scope:3"})
}

func Test_TempCredWithAuthorizedScopes(t *testing.T) {
	tempCreds, err := testCreds.CreateTemporaryCredentials(1*time.Hour, "scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	tempCreds.AuthorizedScopes = []string{"scope:1"}
	client := auth.New(tempCreds)
	response, _, err := client.TestAuthenticate(&auth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"scope:1"})
}

func Test_NamedTempCredWithAuthorizedScopes(t *testing.T) {
	tempCreds, err := testCreds.CreateNamedTemporaryCredentials("julie", 1*time.Hour,
		"scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	tempCreds.AuthorizedScopes = []string{"scope:1"} // note: no create-client
	client := auth.New(tempCreds)
	response, _, err := client.TestAuthenticate(&auth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*", "auth:create-client:j*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"julie", []string{"scope:1"})
}
