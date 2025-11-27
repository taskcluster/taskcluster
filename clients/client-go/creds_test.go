package tcclient_test

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"reflect"
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v94/internal/testrooturl"
)

func ExampleCredentials_CreateTemporaryCredentials() {
	permaCreds := tcclient.Credentials{
		ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
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
		ClientID:    "permacred",
		AccessToken: "eHMnHH7PTSqplJSC_qAJ2QKGt8egfvRaqxczIRgOScaw",
	}

	tempCreds, err := permaCreds.CreateTemporaryCredentials(24*time.Hour, "scope1")
	if err != nil {
		t.Error(err)
	}

	if tempCreds.AuthorizedScopes != nil {
		t.Errorf("temp creds have AuthorizedScopes!?")
	}

	if tempCreds.ClientID != permaCreds.ClientID {
		t.Errorf("%s != %s", tempCreds.ClientID, permaCreds.ClientID)
	}

	// Certificate and AccessToken are nondeterministic; we rely on other tests
	// to verify them
}

// This clientId/accessToken pair is recognized as valid by the testAutheticate endpoint
var testCreds = &tcclient.Credentials{
	ClientID:    "tester",
	AccessToken: "no-secret",
}

func checkAuthenticate(t *testing.T, response *tcauth.TestAuthenticateResponse, err error, expectedClientID string, expectedScopes []string) {
	t.Helper()
	if err != nil {
		t.Error(err)
		return
	}

	if response.ClientID != expectedClientID {
		t.Errorf("got unexpected clientId %s", response.ClientID)
	}

	if !reflect.DeepEqual(response.Scopes, expectedScopes) {
		t.Errorf("got unexpected scopes %#v", response.Scopes)
	}
}

func Test_PermaCred(t *testing.T) {
	client := tcauth.New(testCreds, testrooturl.Get(t))
	response, err := client.TestAuthenticate(&tcauth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:this"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"assume:anonymous", "scope:*"})
}

func Test_TempCred(t *testing.T) {
	tempCreds, err := testCreds.CreateTemporaryCredentials(1*time.Hour, "scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	client := tcauth.New(tempCreds, testrooturl.Get(t))
	response, err := client.TestAuthenticate(&tcauth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"assume:anonymous", "scope:1", "scope:2"})
}

func Test_NamedTempCred(t *testing.T) {
	tempCreds, err := testCreds.CreateNamedTemporaryCredentials("jimmy", 1*time.Hour,
		"scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	client := tcauth.New(tempCreds, testrooturl.Get(t))
	response, err := client.TestAuthenticate(&tcauth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*", "auth:create-client:jimmy"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"jimmy", []string{"assume:anonymous", "scope:1", "scope:2"})
}

func Test_PermaCred_Bewit(t *testing.T) {
	client := tcauth.New(testCreds, testrooturl.Get(t))
	url, err := client.TestAuthenticateGet_SignedURL(15 * time.Minute)
	if err != nil {
		t.Error(err)
		return
	}

	resp, err := http.Get(url.String())
	if err != nil {
		t.Fatalf("Got error when fetching %v: %v", url, err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Got unexpected statusCode %d", resp.StatusCode)
		return
	}
}

func Test_PermaCred_Bewit_SignedURL(t *testing.T) {
	client := tcclient.Client{Credentials: testCreds}
	url, err := client.SignedURL(testrooturl.Get(t)+"/api/auth/v1/test-authenticate-get/", url.Values{}, 15*time.Minute)
	if err != nil {
		t.Error(err)
		return
	}

	resp, err := http.Get(url.String())
	if err != nil {
		t.Fatalf("Got error when fetching %v: %v", url, err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Got unexpected statusCode %d", resp.StatusCode)
		return
	}
}

func Test_TempCred_Bewit(t *testing.T) {
	tempCreds, err := testCreds.CreateTemporaryCredentials(1*time.Hour, "test:authenticate-get")
	if err != nil {
		t.Error(err)
		return
	}
	client := tcauth.New(tempCreds, testrooturl.Get(t))
	url, err := client.TestAuthenticateGet_SignedURL(15 * time.Minute)
	if err != nil {
		t.Error(err)
		return
	}

	resp, err := http.Get(url.String())
	if err != nil {
		t.Fatalf("Got error when fetching %v: %v", url, err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Got unexpected statusCode %d", resp.StatusCode)
		return
	}
}

func Test_TempCred_Bewit_WrongScope(t *testing.T) {
	tempCreds, err := testCreds.CreateTemporaryCredentials(1*time.Hour, "test:not-the-scope-you-need")
	if err != nil {
		t.Error(err)
		return
	}
	client := tcauth.New(tempCreds, testrooturl.Get(t))
	url, err := client.TestAuthenticateGet_SignedURL(15 * time.Minute)
	if err != nil {
		t.Error(err)
		return
	}

	resp, err := http.Get(url.String())
	if err != nil {
		t.Fatalf("Got error when fetching %v: %v", url, err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("Got unexpected statusCode %d", resp.StatusCode)
		return
	}
}

func Test_AuthScopes_Bewit(t *testing.T) {
	authCreds := *testCreds
	authCreds.AuthorizedScopes = []string{"test:authenticate-get"}
	client := tcauth.New(&authCreds, testrooturl.Get(t))

	url, err := client.TestAuthenticateGet_SignedURL(15 * time.Minute)
	if err != nil {
		t.Error(err)
		return
	}
	resp, err := http.Get(url.String())
	if err != nil {
		t.Fatalf("Got error when fetching %v: %v", url, err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Got unexpected statusCode %d", resp.StatusCode)
		return
	}
}

func Test_TempCred_NoClientId(t *testing.T) {
	baseCreds := tcclient.Credentials{AccessToken: "no-secret"}
	_, err := baseCreds.CreateTemporaryCredentials(1*time.Hour, "s")
	if err == nil {
		t.Errorf("expected error")
	}
}

func Test_TempCred_NoAccessToken(t *testing.T) {
	baseCreds := tcclient.Credentials{ClientID: "tester"}
	_, err := baseCreds.CreateTemporaryCredentials(1*time.Hour, "s")
	if err == nil {
		t.Errorf("expected error")
	}
}

func Test_TempCred_TempBase(t *testing.T) {
	baseCreds := tcclient.Credentials{
		ClientID:    "tester",
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
	client := tcauth.New(&authCreds, testrooturl.Get(t))
	response, err := client.TestAuthenticate(&tcauth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"assume:anonymous", "scope:1", "scope:3"})
}

func Test_TempCredWithAuthorizedScopes(t *testing.T) {
	tempCreds, err := testCreds.CreateTemporaryCredentials(1*time.Hour, "scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	tempCreds.AuthorizedScopes = []string{"scope:1"}
	client := tcauth.New(tempCreds, testrooturl.Get(t))
	response, err := client.TestAuthenticate(&tcauth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"tester", []string{"assume:anonymous", "scope:1"})
}

func Test_NamedTempCredWithAuthorizedScopes(t *testing.T) {
	tempCreds, err := testCreds.CreateNamedTemporaryCredentials("julie", 1*time.Hour,
		"scope:1", "scope:2")
	if err != nil {
		t.Error(err)
		return
	}
	tempCreds.AuthorizedScopes = []string{"scope:1"} // note: no create-client
	client := tcauth.New(tempCreds, testrooturl.Get(t))
	response, err := client.TestAuthenticate(&tcauth.TestAuthenticateRequest{
		ClientScopes:   []string{"scope:*", "auth:create-client:j*"},
		RequiredScopes: []string{"scope:1"},
	})
	checkAuthenticate(t, response, err,
		"julie", []string{"assume:anonymous", "scope:1"})
}
