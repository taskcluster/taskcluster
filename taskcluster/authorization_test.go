package taskcluster_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"os"
	"regexp"
	"testing"

	tc "github.com/taskcluster/taskcluster-proxy/taskcluster"
)

var (
	CLIENT_ID      = os.Getenv("TASKCLUSTER_CLIENT_ID")
	ACCESS_TOKEN   = os.Getenv("TASKCLUSTER_ACCESS_TOKEN")
	GET_SCOPES_URL = fmt.Sprintf(
		"https://auth.taskcluster.net/v1/clients/%s",
		CLIENT_ID,
	)
	GET_SHARED_ACCESS_SIGNATURE = fmt.Sprintf(
		"https://auth.taskcluster.net/v1/azure/%s/table/%s/read-write",
		"FaKe-AcCoUnT",
		"DuMmY-tAbLe",
	)
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
	ClientId       string   `json:"clientId"`
	ExpandedScopes []string `json:"expandedScopes"`
	Expires        string   `json:"expires"`
}

// Decode a json response from the server..
func readJson(http *http.Response) (*getScopesResponse, error) {
	var scopes getScopesResponse
	resp, err := httputil.DumpResponse(http, true)
	if err != nil {
		return nil, err
	}
	json := json.NewDecoder(http.Body)
	err = json.Decode(&scopes)
	if err != nil {
		return nil, errors.New(fmt.Sprintf("HTTP response could not be read into a Scopes Response:\n%s\n\nHTTP Body:\n%s", err, resp))
	}
	return &scopes, nil
}

func TestBewit(t *testing.T) {
	checkTest(t)
	url := fmt.Sprintf("https://auth.taskcluster.net/v1/clients/%s", CLIENT_ID)

	bewitUrl, err := tc.Bewit(CLIENT_ID, ACCESS_TOKEN, url)
	if err != nil {
		t.Errorf("Failed to create bewit %v", err)
	}

	httpClient := &http.Client{}
	req, err := http.NewRequest("GET", bewitUrl, nil)
	if err != nil {
		t.Errorf("Failed to create request: %s", err)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		t.Errorf("Error issuing request", err)
	}

	// Ensure the body is closed after this test.
	defer resp.Body.Close()
	json, err := readJson(resp)

	if err != nil {
		t.Fatalf("Failed to decode json of getScopes %s", err)
	}

	if json.ClientId != CLIENT_ID {
		t.Errorf("Client is does not match")
	}
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

	req, err := http.NewRequest("GET", GET_SHARED_ACCESS_SIGNATURE, nil)
	if err != nil {
		t.Errorf("Failed to create request: %s", err)
	}

	// Scope here is intentionally designed to fail.
	// Note needed scope is actually auth:azure-table-access:FaKe-AcCoUnT/DuMmY-tAbLe
	scopes := make([]string, 1)
	scopes[0] = "noauth"

	header, err := tc.AuthorizationDelegate(CLIENT_ID, ACCESS_TOKEN, scopes, req)

	if err != nil {
		t.Fatalf("Failed to create delegating auth %s", err)
	}

	req.Header.Add("Authorization", header)
	reqBytes, err := httputil.DumpRequest(req, true)
	if err != nil {
		t.Fatalf("Error dumping request:\n%s", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		t.Fatalf("Error issuing request:\n%s", err)
	}

	// Ensure the body is closed after this test.
	defer resp.Body.Close()

	if resp.StatusCode != 401 {
		protectedRequest := regexp.MustCompile(`([a-z]*)="[^"]*"`).ReplaceAllString(string(reqBytes), `$1="***********"`)
		t.Logf("Expected delgated request to fail with HTTP 401 since it has no scopes - but got HTTP %v", resp.StatusCode)
		t.Fatalf("Request sent:\n%s", protectedRequest)
	}
}
