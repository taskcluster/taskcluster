package taskcluster_test

import (
	"encoding/json"
	"fmt"
	tc "github.com/lightsofapollo/taskcluster-proxy/taskcluster"
	"net/http"
	"os"
	"testing"
)

var CLIENT_ID = os.Getenv("TASKCLUSTER_CLIENT_ID")
var ACCESS_TOKEN = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
var GET_SCOPES_URL = fmt.Sprintf(
	"https://auth.taskcluster.net/v1/client/%s/scopes",
	CLIENT_ID,
)

func checkTest(t *testing.T) {
	if CLIENT_ID == "" || ACCESS_TOKEN == "" {
		t.Skipf(`
			Cannot run tests without env variables: TASKCLUSTER_CLIENT_ID and
			TASKCLUSTER_ACCESS_TOKEN
		`)
	}
}

type getScopesResponse struct {
	ClientId    string   `json:"clientId"`
	AccessToken string   `json:"accessToken"`
	Scopes      []string `json:"scopes"`
	Expires     string   `json:"expires"`
}

// Decode a json response from the server..
func readJson(http *http.Response) (*getScopesResponse, error) {
	var scopes getScopesResponse

	json := json.NewDecoder(http.Body)
	err := json.Decode(&scopes)

	if err != nil {
		return nil, err
	}
	return &scopes, nil
}

func TestAuthorization(t *testing.T) {
	checkTest(t)

	httpClient := &http.Client{}

	req, err := http.NewRequest("GET", GET_SCOPES_URL, nil)
	if err != nil {
		t.Errorf("Failed to create request: %s", err)
	}

	req.Header.Add(
		"Authorization",
		tc.Authorization(CLIENT_ID, ACCESS_TOKEN, req),
	)

	resp, err := httpClient.Do(req)
	if err != nil {
		t.Errorf("Error issuing request", err)
	}

	// Ensure the body is closed after this test.
	defer resp.Body.Close()
	json, err := readJson(resp)

	if err != nil {
		t.Errorf("Failed to decode json of getScopes %s", err)
	}

	if json.ClientId != CLIENT_ID {
		t.Errorf("Client is does not match")
	}
}

func TestAuthorizationDelegate(t *testing.T) {
	checkTest(t)

	httpClient := &http.Client{}

	req, err := http.NewRequest("GET", GET_SCOPES_URL, nil)
	if err != nil {
		t.Errorf("Failed to create request: %s", err)
	}

	// Scope here is intentionally designed to fail.
	scopes := make([]string, 1)
	scopes[0] = "noauth"

	header, err := tc.AuthorizationDelegate(CLIENT_ID, ACCESS_TOKEN, req, scopes)

	if err != nil {
		t.Errorf("Failed to create delegating auth %s", err)
	}

	req.Header.Add("Authorization", header)

	resp, err := httpClient.Do(req)
	if err != nil {
		t.Errorf("Error issuing request", err)
	}

	// Ensure the body is closed after this test.
	defer resp.Body.Close()

	if resp.StatusCode != 401 {
		t.Errorf("Expected delgated request to fail since it has no scopes")
	}
}
